/**
 * 数据库方言抽象（架构文档 C2 / 7.1）：
 * 业务逻辑只依赖本接口，未来切换 PostgreSQL / SQL Server 只需新增实现，不改 modules/core。
 * 一期唯一实现是 MySQLDialect。
 */
import type { FieldBinding, FieldSchema } from '@hengyida/shared';

/** 一行物理数据：列名 → 值 */
export type RowValues = Record<string, unknown>;

/** 幂等 DDL 执行结果 */
export interface DDLResult {
  tableName: string;
  /** true=新建表；false=在已有表上做增量演进 */
  created: boolean;
  /** 实际执行的 DDL 文本（供发布结果回显/审计） */
  ddl: string;
  /** 本次新增的列名 */
  appliedColumns: string[];
}

/** 行级权限谓词：由 PermissionEngine 解析规则生成，DataEngine 注入 WHERE */
export interface SqlPredicate {
  column: string;
  op: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'like' | 'in';
  value: unknown;
}

/** 方言接口：负责把领域概念翻译为具体数据库的 DDL / 标识符规则 */
export interface Dialect {
  /** 方言标识，如 mysql */
  readonly name: string;
  /** 由 formId 派生业务表名 t_form_<formId>（去掉重复的 form_ 前缀） */
  tableName(formId: string): string;
  /** 校验并引用标识符，杜绝 SQL 注入 */
  quoteIdentifier(identifier: string): string;
  /** FieldBinding.dataType → 数据库列类型定义 */
  columnType(binding: FieldBinding): string;
  /** 幂等建表 SQL（CREATE TABLE IF NOT EXISTS） */
  createTableSql(table: string, fields: FieldSchema[]): string;
  /** 增量加列 SQL（ALTER TABLE ... ADD COLUMN，只增不删） */
  addColumnSql(table: string, field: FieldSchema): string;
}
