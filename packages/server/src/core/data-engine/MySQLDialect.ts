/**
 * MySQL 8.0 方言实现（一期唯一实现）。
 * 所有 DDL 都是幂等且只增不删：CREATE TABLE IF NOT EXISTS / ALTER TABLE ADD COLUMN，严禁重建表丢数据。
 */
import { Injectable } from '@nestjs/common';
import { ERROR_CODES, type FieldBinding, type FieldSchema } from '@hengyida/shared';
import { BusinessException } from '../../common/BusinessException';
import type { Dialect } from './Dialect';

/** 合法标识符：字母/下划线开头，仅字母数字下划线 */
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

@Injectable()
export class MySQLDialect implements Dialect {
  readonly name = 'mysql';

  /** form_employee → t_form_employee（避免生成 t_form_form_employee） */
  tableName(formId: string): string {
    const raw = String(formId ?? '').replace(/^form_/, '');
    if (!/^[A-Za-z0-9_]+$/.test(raw)) {
      throw new BusinessException(
        ERROR_CODES.PARAM_INVALID,
        `非法的表单 id: ${String(formId)}`,
      );
    }
    return `t_form_${raw}`;
  }

  /** 反引号包裹并校验标识符，防止字段名注入 */
  quoteIdentifier(identifier: string): string {
    if (!IDENTIFIER_RE.test(identifier)) {
      throw new BusinessException(
        ERROR_CODES.PARAM_INVALID,
        `非法的数据列标识符: ${String(identifier)}`,
      );
    }
    return `\`${identifier}\``;
  }

  /** 物理列类型映射 */
  columnType(binding: FieldBinding): string {
    switch (binding.dataType) {
      case 'varchar':
        return 'VARCHAR(512)';
      case 'int':
        return 'INT';
      case 'decimal':
        return 'DECIMAL(20,6)';
      case 'date':
        return 'DATE';
      case 'datetime':
        return 'DATETIME';
      case 'text':
        return 'TEXT';
      case 'json':
        return 'JSON';
      default:
        return 'VARCHAR(512)';
    }
  }

  /** 建表：系统列(id/created_at/updated_at) + 业务字段列。IF NOT EXISTS 保证幂等 */
  createTableSql(table: string, fields: FieldSchema[]): string {
    const columns: string[] = [
      `${this.quoteIdentifier('id')} VARCHAR(64) NOT NULL PRIMARY KEY`,
      ...fields.map(
        (field) =>
          `${this.quoteIdentifier(field.binding.column)} ${this.columnType(field.binding)} NULL`,
      ),
      `${this.quoteIdentifier('created_at')} VARCHAR(32) NULL`,
      `${this.quoteIdentifier('updated_at')} VARCHAR(32) NULL`,
    ];
    return `CREATE TABLE IF NOT EXISTS ${this.quoteIdentifier(table)} (\n  ${columns.join(',\n  ')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
  }

  /** 增量加列：只 ADD COLUMN，绝不 DROP / MODIFY 已有列 */
  addColumnSql(table: string, field: FieldSchema): string {
    return `ALTER TABLE ${this.quoteIdentifier(table)} ADD COLUMN ${this.quoteIdentifier(field.binding.column)} ${this.columnType(field.binding)} NULL`;
  }
}
