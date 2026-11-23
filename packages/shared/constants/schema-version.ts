/**
 * Schema 版本常量与迁移钩子注册表。
 * 版本随配置持久化，导入时逐级迁移，不兼容则明确报错（架构文档 7.3）。
 */
import type { SchemaMigration, SchemaVersion } from '../types/schema';

/** 请求头携带的 Schema 版本头名称 */
export const SCHEMA_VERSION_HEADER = 'X-Schema-Version';

/** 当前最新 Schema 版本（一期基线） */
export const CURRENT_SCHEMA_VERSION: SchemaVersion = '1.0.0';

/** 支持的最小版本（低于此版本拒绝导入） */
export const MIN_SCHEMA_VERSION: SchemaVersion = '1.0.0';

/** 迁移钩子注册表：按顺序执行 from→to */
export const migrations: SchemaMigration[] = [];

/** 注册一条迁移（供后续版本演进使用） */
export function registerMigration(m: SchemaMigration): void {
  migrations.push(m);
}

/** 解析语义化版本为数字数组，便于比较 */
export function parseVersion(v: SchemaVersion): number[] {
  return v.split('.').map((n) => Number(n) || 0);
}

/** 比较版本：a > b 返回正数，a < b 返回负数，相等返回 0 */
export function compareVersion(a: SchemaVersion, b: SchemaVersion): number {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  const len = Math.max(av.length, bv.length);
  for (let i = 0; i < len; i++) {
    const diff = (av[i] ?? 0) - (bv[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
