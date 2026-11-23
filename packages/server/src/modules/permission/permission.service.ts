/**
 * 权限配置服务：角色 + 应用级/表单级/行级规则的持久化。
 * 默认策略让 editor 可 CRUD、viewer 只读，admin 由引擎直接全通过。
 */
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { Knex } from 'knex';
import type { Action, Role, RolePolicy } from '@hengyida/shared';
import { KNEX_CONNECTION } from '../../core/data-engine';

/** meta_policies 物理行 */
interface PolicyRow {
  role: string;
  json_text: string;
  updated_at: string;
}

@Injectable()
export class PermissionService implements OnModuleInit {
  constructor(@Inject(KNEX_CONNECTION) private readonly knex: Knex) {}

  async onModuleInit(): Promise<void> {
    await this.ensureTable();
  }

  /** 幂等建策略表 */
  private async ensureTable(): Promise<void> {
    const exists = await this.knex.schema.hasTable('meta_policies');
    if (exists) return;
    await this.knex.schema.createTable('meta_policies', (table) => {
      table.string('role', 32).primary();
      table.text('json_text').notNullable();
      table.string('updated_at', 32).nullable();
    });
  }

  /** 默认策略：'*' 表示通配所有 app/form；admin 留空由引擎全放行 */
  buildDefaultPolicy(role: Role): RolePolicy {
    if (role === 'admin') {
      return { role, apps: [], forms: [], rowRules: {} };
    }
    const actions: Action[] =
      role === 'editor' ? ['create', 'read', 'update', 'delete'] : ['read'];
    return {
      role,
      apps: [{ appId: '*', accessible: true }],
      forms: [{ formId: '*', actions }],
      rowRules: {},
    };
  }

  /** 读取角色策略；未配置或损坏时回退默认策略 */
  async getPolicy(role: Role): Promise<RolePolicy> {
    const row = (await this.knex('meta_policies')
      .where({ role })
      .first()) as PolicyRow | undefined;
    if (!row) return this.buildDefaultPolicy(role);
    try {
      return JSON.parse(row.json_text) as RolePolicy;
    } catch {
      return this.buildDefaultPolicy(role);
    }
  }

  /** 保存/更新角色策略（upsert） */
  async savePolicy(role: Role, policy: RolePolicy): Promise<RolePolicy> {
    const now = new Date().toISOString();
    const payload = { json_text: JSON.stringify(policy), updated_at: now };
    const exists = await this.knex('meta_policies').where({ role }).first();
    if (exists) {
      await this.knex('meta_policies').where({ role }).update(payload);
    } else {
      await this.knex('meta_policies').insert({ role, ...payload });
    }
    return policy;
  }

  /** 列出三类角色当前策略 */
  async listPolicies(): Promise<RolePolicy[]> {
    const roles: Role[] = ['admin', 'editor', 'viewer'];
    return Promise.all(roles.map((role) => this.getPolicy(role)));
  }
}
