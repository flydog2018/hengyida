/**
 * Schema 通用元信息类型。
 * 所有可迁移配置统一遵循 SchemaEnvelope 信封，schemaVersion 为强制字段。
 * 对应架构文档 3.1 节（原创数据模型）。
 */

/** 语义化版本字符串，如 "1.0.0" */
export type SchemaVersion = string;

/** 配置类型：应用 / 表单（后续可扩展 page） */
export type SchemaKind = 'app' | 'form' | 'page';

/** 信封元信息 */
export interface SchemaMeta {
  name: string;
  description?: string;
  /** ISO 8601 UTC */
  exportedAt?: string;
  [key: string]: unknown;
}

/**
 * 一切可迁移配置的顶层信封。
 * payload 由 kind 决定具体形态（AppSchema / FormSchema）。
 */
export interface SchemaEnvelope<TPayload = unknown> {
  schemaVersion: SchemaVersion;
  kind: SchemaKind;
  /** 稳定唯一 ID，跨环境保持一致 */
  id: string;
  meta: SchemaMeta;
  payload: TPayload;
}

/** 版本迁移函数签名：把 from 版本的数据升级到 to 版本 */
export interface SchemaMigration {
  from: SchemaVersion;
  to: SchemaVersion;
  migrate: (payload: unknown) => unknown;
}

// 注：SCHEMA_VERSION_HEADER 作为运行时常量定义在 constants/schema-version.ts
