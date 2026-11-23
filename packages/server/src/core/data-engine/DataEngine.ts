/**
 * 数据引擎（架构文档 T03 关键交付物）：
 * ① 动态 DDL：ensureTable / evolveTable 幂等建表与增量演进（只增不删）；
 * ② CRUD + 列表查询（筛选/排序/分页）；
 * ③ 行级权限谓词注入 WHERE（谓词由 PermissionEngine 生成，本类不解析权限表达式）。
 * 依赖 Knex query builder + Dialect 抽象，业务逻辑不出现任何方言 SQL。
 */
import { Inject, Injectable } from '@nestjs/common';
import type { Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import {
  ERROR_CODES,
  type DataQuery,
  type FormSchema,
  type RuntimeRecord,
} from '@hengyida/shared';
import { BusinessException } from '../../common/BusinessException';
import type { DDLResult, Dialect, RowValues, SqlPredicate } from './Dialect';
import { MySQLDialect } from './MySQLDialect';

/** Knex 实例的注入令牌（根模块提供，全局可见） */
export const KNEX_CONNECTION = Symbol('HENGYIDA_KNEX_CONNECTION');

/** 系统列名不参与业务值映射 */
const SYSTEM_COLUMNS = new Set(['id', 'created_at', 'updated_at']);
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

@Injectable()
export class DataEngine {
  /** 一期固定 MySQL；未来由配置注入其它 Dialect 实现即可 */
  private readonly dialect: Dialect = new MySQLDialect();

  constructor(@Inject(KNEX_CONNECTION) private readonly knex: Knex) {}

  /** 当前方言（供诊断/测试断言） */
  get currentDialect(): Dialect {
    return this.dialect;
  }

  /**
   * 确保业务表存在：不存在则建表；已存在则走增量演进。
   * 全程幂等，重复发布不会丢数据。
   */
  async ensureTable(form: FormSchema): Promise<DDLResult> {
    const table = this.table(form.id);
    try {
      const exists = await this.knex.schema.hasTable(table);
      if (exists) return this.evolveTable(form);
      const sql = this.dialect.createTableSql(table, form.fields);
      await this.knex.raw(sql);
      return { tableName: table, created: true, ddl: sql, appliedColumns: [] };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      throw new BusinessException(
        ERROR_CODES.DDL_FAILED,
        `创建业务表 ${table} 失败: ${(err as Error).message}`,
      );
    }
  }

  /**
   * 增量演进：仅为尚不存在的字段 ADD COLUMN。
   * 不改类型、不删列、不重建表 —— 保障已存数据安全。
   */
  async evolveTable(form: FormSchema): Promise<DDLResult> {
    const table = this.table(form.id);
    try {
      const exists = await this.knex.schema.hasTable(table);
      if (!exists) {
        const sql = this.dialect.createTableSql(table, form.fields);
        await this.knex.raw(sql);
        return { tableName: table, created: true, ddl: sql, appliedColumns: [] };
      }

      const applied: string[] = [];
      const statements: string[] = [];
      for (const field of form.fields) {
        const column = field.binding.column;
        if (SYSTEM_COLUMNS.has(column)) continue;
        const hasColumn = await this.knex.schema.hasColumn(table, column);
        if (hasColumn) continue;
        const sql = this.dialect.addColumnSql(table, field);
        await this.knex.raw(sql);
        applied.push(column);
        statements.push(sql);
      }
      return {
        tableName: table,
        created: false,
        ddl: statements.join(';\n'),
        appliedColumns: applied,
      };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      throw new BusinessException(
        ERROR_CODES.DDL_FAILED,
        `演进业务表 ${table} 失败: ${(err as Error).message}`,
      );
    }
  }

  /** 新增记录；id 由服务端生成，杜绝客户端伪造主键 */
  async insert(formId: string, values: RowValues): Promise<RuntimeRecord> {
    const table = this.table(formId);
    const id = `rec_${randomUUID()}`;
    const now = new Date().toISOString();
    const clean = this.sanitize(values);
    try {
      await this.knex(table).insert({ id, ...clean, created_at: now, updated_at: now });
    } catch (err) {
      throw new BusinessException(
        ERROR_CODES.DML_FAILED,
        `新增记录失败: ${(err as Error).message}`,
      );
    }
    return {
      id,
      formId,
      values: clean,
      createdAt: now,
      updatedAt: now,
    };
  }

  /** 按主键查询单条记录 */
  async findById(formId: string, recordId: string): Promise<RuntimeRecord | null> {
    const table = this.table(formId);
    try {
      const row = (await this.knex(table).where({ id: recordId }).first()) as
        | RowValues
        | undefined;
      return row ? this.toRecord(row, formId) : null;
    } catch (err) {
      throw new BusinessException(
        ERROR_CODES.DML_FAILED,
        `查询记录失败: ${(err as Error).message}`,
      );
    }
  }

  /**
   * 列表查询：注入行级谓词 + 用户筛选，应用排序与分页。
   * 时间统一以 ISO 8601 UTC 返回。
   */
  async query(
    formId: string,
    query: DataQuery,
    predicates: SqlPredicate[] = [],
  ): Promise<{ rows: RuntimeRecord[]; total: number }> {
    const table = this.table(formId);
    const page = Math.max(1, Math.floor(query.page ?? 1));
    const pageSize = Math.min(500, Math.max(1, Math.floor(query.pageSize ?? 20)));

    /** 把行级谓词与用户筛选统一写入查询构造器 */
    const applyWhere = (qb: Knex.QueryBuilder): void => {
      for (const p of predicates) {
        if (!IDENTIFIER_RE.test(p.column)) continue; // 非法列名直接跳过，防注入
        if (p.op === 'in') {
          const list = Array.isArray(p.value) ? p.value : [p.value];
          qb.whereIn(p.column, list.map((item) => this.toDbValue(item)));
        } else {
          // Knex 的三参数 where 重载对 operator 有字面量约束，此处 op 已由 SqlPredicate 限定，安全断言
          qb.where(p.column, p.op as '=', this.toDbValue(p.value) as never);
        }
      }
      for (const filter of query.filters ?? []) {
        const column = filter.fieldId;
        if (!IDENTIFIER_RE.test(column)) continue;
        const value = this.toDbValue(filter.value);
        // 统一用对象形式 where({列: 值}) 规避 Knex 三参数重载的 Raw 推断陷阱
        switch (filter.op) {
          case 'eq':
            qb.where(column, '=', value as never);
            break;
          case 'ne':
            qb.where(column, '!=', value as never);
            break;
          case 'gt':
            qb.where(column, '>', value as never);
            break;
          case 'gte':
            qb.where(column, '>=', value as never);
            break;
          case 'lt':
            qb.where(column, '<', value as never);
            break;
          case 'lte':
            qb.where(column, '<=', value as never);
            break;
          case 'contains':
            qb.where(column, 'like', `%${String(filter.value)}%` as never);
            break;
          case 'in':
            qb.whereIn(
              column,
              (Array.isArray(filter.value) ? filter.value : [filter.value]).map(
                (item) => this.toDbValue(item),
              ),
            );
            break;
          default:
            qb.where(column, '=', value as never);
            break;
        }
      }
    };

    try {
      // 总数：与列表使用完全相同的 WHERE，保证分页 total 准确
      const countQb = this.knex(table);
      applyWhere(countQb);
      const countRow = (await countQb.count('* as total').first()) as unknown as
        | { total?: unknown }
        | undefined;
      const total = Number(countRow?.total ?? 0);

      const listQb = this.knex(table);
      applyWhere(listQb);
      for (const sort of query.sort ?? []) {
        if (IDENTIFIER_RE.test(sort.fieldId)) {
          listQb.orderBy(sort.fieldId, sort.order);
        }
      }
      const rawRows = await listQb
        .select('*')
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return {
        rows: (rawRows as RowValues[]).map((row) => this.toRecord(row, formId)),
        total,
      };
    } catch (err) {
      if (err instanceof BusinessException) throw err;
      throw new BusinessException(
        ERROR_CODES.DML_FAILED,
        `查询列表失败: ${(err as Error).message}`,
      );
    }
  }

  /** 更新记录；updated_at 由服务端刷新 */
  async update(
    formId: string,
    recordId: string,
    values: RowValues,
  ): Promise<RuntimeRecord | null> {
    const table = this.table(formId);
    const now = new Date().toISOString();
    try {
      const affected = await this.knex(table)
        .where({ id: recordId })
        .update({ ...this.sanitize(values), updated_at: now });
      if (Number(affected) === 0) return null;
    } catch (err) {
      throw new BusinessException(
        ERROR_CODES.DML_FAILED,
        `更新记录失败: ${(err as Error).message}`,
      );
    }
    return this.findById(formId, recordId);
  }

  /** 删除记录 */
  async delete(formId: string, recordId: string): Promise<boolean> {
    const table = this.table(formId);
    try {
      const affected = await this.knex(table).where({ id: recordId }).del();
      return Number(affected) > 0;
    } catch (err) {
      throw new BusinessException(
        ERROR_CODES.DML_FAILED,
        `删除记录失败: ${(err as Error).message}`,
      );
    }
  }

  /** formId → 物理表名，委托方言实现 */
  private table(formId: string): string {
    return this.dialect.tableName(formId);
  }

  /** 查询值规范化：unknown → Knex 可接受的基础类型，避免 unknown 破坏 where 重载匹配 */
  private toDbValue(value: unknown): string | number | boolean | null {
    if (value === undefined || value === null) return null;
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }
    return String(value);
  }

  /** 过滤系统列/非法列，并把对象值序列化为 JSON 字符串（对应 json 列） */
  private sanitize(values: RowValues): RowValues {
    const result: RowValues = {};
    for (const [key, value] of Object.entries(values ?? {})) {
      if (!IDENTIFIER_RE.test(key) || SYSTEM_COLUMNS.has(key)) continue;
      if (value === undefined) {
        result[key] = null;
      } else if (typeof value === 'object' && value !== null) {
        result[key] = JSON.stringify(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /** 物理行 → RuntimeRecord：系统列独立映射，JSON 文本还原为对象 */
  private toRecord(row: RowValues, formId: string): RuntimeRecord {
    const values: RowValues = {};
    for (const [key, value] of Object.entries(row)) {
      if (SYSTEM_COLUMNS.has(key)) continue;
      values[key] = this.decodeValue(value);
    }
    return {
      id: String(row.id ?? ''),
      formId,
      values,
      createdAt: this.toIso(row.created_at),
      updatedAt: this.toIso(row.updated_at),
    };
  }

  /** JSON 文本安全还原（解析失败保留原文，绝不抛异常影响读流程） */
  private decodeValue(raw: unknown): unknown {
    if (typeof raw !== 'string') return raw;
    const text = raw.trim();
    if (
      (text.startsWith('{') && text.endsWith('}')) ||
      (text.startsWith('[') && text.endsWith(']'))
    ) {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        return raw;
      }
    }
    return raw;
  }

  /** 任意时间表示 → ISO 8601 UTC 字符串 */
  private toIso(raw: unknown): string | undefined {
    if (raw === undefined || raw === null || raw === '') return undefined;
    if (raw instanceof Date) return raw.toISOString();
    const date = new Date(String(raw));
    return Number.isNaN(date.getTime()) ? String(raw) : date.toISOString();
  }
}
