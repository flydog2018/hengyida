/**
 * 认证服务：登录签发 JWT；角色来自用户记录（不信任客户端声明）。
 * 首启自动建 meta_users 并植入默认管理员（私有化开箱可用）。
 *
 * 🔒 安全加固（v1.3）：密码摘要由 SHA-256 固定盐升级为 bcrypt（bcryptjs，
 * 生成标准 $2a$ 哈希，与原生 bcrypt 完全兼容、跨平台无需编译）。
 * 默认种子密码可通过 ADMIN_BOOTSTRAP_PASSWORD 覆盖；生产环境
 * (NODE_ENV=production) 若仍用弱口令则打印醒目警告，强烈建议改密。
 */
import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import type { Knex } from 'knex';
import { ERROR_CODES, type Role } from '@hengyida/shared';
import { BusinessException } from '../../common/BusinessException';
import { KNEX_CONNECTION } from '../../core/data-engine';
import type { JwtPayload } from './jwt.strategy';

/** bcrypt 计算代价：10 轮（约 60-100ms，安全与登录体验平衡） */
const BCRYPT_ROUNDS = 10;
/** 默认种子账号（仅当不存在时插入，绝不覆盖既有账号） */
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'admin123';

/** meta_users 物理行 */
interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  role: Role;
  app_ids: string | null;
  created_at: string;
}

/** 登录返回 */
export interface LoginResult {
  token: string;
  user: { id: string; username: string; role: Role };
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
    private readonly jwtService: JwtService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureUsersTable();
    await this.seedDefaultAdmin();
  }

  /** 幂等建用户表 */
  private async ensureUsersTable(): Promise<void> {
    const exists = await this.knex.schema.hasTable('meta_users');
    if (exists) return;
    await this.knex.schema.createTable('meta_users', (table) => {
      table.string('id', 64).primary();
      table.string('username', 128).notNullable().unique();
      // bcrypt 哈希固定 60 字符，留 128 余量（兼容旧 SHA-256 64 字符数据）
      table.string('password_hash', 128).notNullable();
      table.string('role', 32).notNullable();
      table.text('app_ids').nullable();
      table.string('created_at', 32).nullable();
    });
  }

  /** 默认管理员：仅当不存在时插入，绝不覆盖既有账号 */
  private async seedDefaultAdmin(): Promise<void> {
    const existing = await this.knex('meta_users')
      .where({ username: DEFAULT_ADMIN_USERNAME })
      .first();
    if (existing) return;

    // 种子密码优先取环境变量；空串/空白视同未设置，避免把空密码写进库
    const configuredSeedPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim();
    const seedPassword = configuredSeedPassword || DEFAULT_ADMIN_PASSWORD;
    if (process.env.NODE_ENV === 'production' && seedPassword === DEFAULT_ADMIN_PASSWORD) {
      this.logger.warn(
        '⚠️ 生产环境正在使用默认管理员密码 admin/admin123！请设置 ADMIN_BOOTSTRAP_PASSWORD 并尽快改密。',
      );
    }

    await this.knex('meta_users').insert({
      id: `usr_${randomUUID()}`,
      username: DEFAULT_ADMIN_USERNAME,
      password_hash: await this.hashPassword(seedPassword),
      role: 'admin' as Role,
      app_ids: null,
      created_at: new Date().toISOString(),
    });
    this.logger.log(
      `已植入默认管理员 ${DEFAULT_ADMIN_USERNAME}（密码来源：${configuredSeedPassword ? 'ADMIN_BOOTSTRAP_PASSWORD' : '内置默认值'}，bcrypt 加密）`,
    );
  }

  /** bcrypt 生成密码摘要（异步，避免阻塞事件循环） */
  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  /**
   * 校验密码：兼容新旧两种摘要格式，便于平滑升级不锁死既有账号。
   * - bcrypt 哈希（$2a$/$2b$/$2y$ 开头）：bcrypt.compare
   * - 旧版 SHA-256（hengyida: 前缀固定盐的 64 位 hex）：等价摘要比对
   */
  private async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    if (/^\$2[aby]\$\d{2}\$/.test(storedHash)) {
      return bcrypt.compare(password, storedHash);
    }
    // 兼容 v1.1 及更早的 SHA-256 固定盐摘要（已存在的库升级后可正常登录）
    const legacy = this.legacySha256(password);
    return storedHash.length === legacy.length && storedHash === legacy;
  }

  /** 旧版摘要算法，仅用于历史数据兼容比对，不再用于新密码 */
  private legacySha256(password: string): string {
    // 与 v1.1 的 `hengyida:${password}` 摘要完全一致，仅用于老库平滑升级
    return createHash('sha256').update(`hengyida:${password}`).digest('hex');
  }

  /** 登录：校验账号密码后签发 JWT */
  async login(username: string, password: string): Promise<LoginResult> {
    const user = (await this.knex('meta_users')
      .where({ username })
      .first()) as UserRow | undefined;
    if (!user || !(await this.verifyPassword(password, user.password_hash))) {
      throw new BusinessException(
        ERROR_CODES.UNAUTHORIZED,
        '用户名或密码错误',
        401,
      );
    }

    // 旧 SHA-256 账号在成功登录后透明升级为 bcrypt（不阻塞主流程）
    if (!/^\$2[aby]\$\d{2}\$/.test(user.password_hash)) {
      try {
        await this.knex('meta_users')
          .where({ id: user.id })
          .update({ password_hash: await this.hashPassword(password) });
        this.logger.warn(`用户 ${username} 的密码摘要已从 SHA-256 透明升级为 bcrypt`);
      } catch (err) {
        this.logger.warn(`用户 ${username} 密码摘要升级失败（不影响本次登录）：${(err as Error).message}`);
      }
    }

    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };
    if (user.app_ids) {
      try {
        payload.appIds = JSON.parse(user.app_ids) as string[];
      } catch {
        // 脏数据忽略，不影响主流程
      }
    }
    const token = this.jwtService.sign(payload);
    return {
      token,
      user: { id: user.id, username: user.username, role: user.role },
    };
  }

  /** 按 id 查询用户（供后续扩展审计/用户管理） */
  async findById(id: string): Promise<UserRow | undefined> {
    return (await this.knex('meta_users').where({ id }).first()) as
      | UserRow
      | undefined;
  }
}
