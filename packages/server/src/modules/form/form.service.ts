/**
 * 表单服务（R-003~R-010）：草稿 CRUD、发布前校验、一键发布链路、Schema 导入导出。
 * 一键发布严格按序：Ajv/Schema 校验 → 版本号 +1 → 幂等 DDL → 保存已发布 Schema（架构 4.1）。
 */
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Knex } from 'knex';
import {
  CURRENT_SCHEMA_VERSION,
  ERROR_CODES,
  type FormSchema,
  type SchemaEnvelope,
} from '@hengyida/shared';
import { BusinessException } from '../../common/BusinessException';
import { DataEngine, KNEX_CONNECTION } from '../../core/data-engine';
import { SchemaEngine, type ValidationResult } from '../../core/schema-engine';

/** meta_forms 物理行 */
interface FormRow {
  id: string;
  app_id: string;
  name: string | null;
  status: string;
  schema_json: string | null;
  published_json: string | null;
  published_version: number;
  published_hash: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

/** 发布结果（架构 3.3 示例响应） */
export interface PublishResult {
  formId: string;
  version: number;
  tableName: string;
  ddl: string;
  schemaHash: string;
  publishedAt: string;
}

/** 表单上下文：供 data 模块做应用级/表单级权限判定 */
export interface FormContext {
  schema: FormSchema;
  appId: string;
}

@Injectable()
export class FormService implements OnModuleInit {
  constructor(
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
    private readonly schemaEngine: SchemaEngine,
    private readonly dataEngine: DataEngine,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureTable();
  }

  /** 幂等建表单元数据表 */
  private async ensureTable(): Promise<void> {
    const exists = await this.knex.schema.hasTable('meta_forms');
    if (exists) return;
    await this.knex.schema.createTable('meta_forms', (table) => {
      table.string('id', 64).primary();
      table.string('app_id', 64).notNullable().index();
      table.string('name', 256).nullable();
      table.string('status', 32).notNullable().defaultTo('draft');
      table.text('schema_json').nullable();
      table.text('published_json').nullable();
      table.integer('published_version').notNullable().defaultTo(0);
      table.string('published_hash', 128).nullable();
      table.string('created_at', 32).nullable();
      table.string('updated_at', 32).nullable();
      table.string('published_at', 32).nullable();
    });
  }

  /** 创建表单：生成最小可用 FormSchema 草稿 */
  async create(
    appId: string,
    formId: string,
    name?: string,
  ): Promise<FormSchema> {
    const appExists = await this.knex('meta_apps').where({ id: appId }).first();
    if (!appExists) {
      throw new BusinessException(ERROR_CODES.APP_NOT_FOUND, `应用不存在: ${appId}`);
    }
    const existing = await this.knex('meta_forms').where({ id: formId }).first();
    if (existing) {
      throw new BusinessException(
        ERROR_CODES.SCHEMA_INVALID,
        `表单 id 已存在: ${formId}`,
      );
    }

    const schema: FormSchema = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      kind: 'form',
      id: formId,
      fields: [],
      layout: { pc: [], h5: [] },
      listView: { columns: [], filters: [], sort: [], pageSize: 20 },
    };
    const now = new Date().toISOString();
    await this.knex('meta_forms').insert({
      id: formId,
      app_id: appId,
      name: name ?? formId,
      status: 'draft',
      schema_json: JSON.stringify(schema),
      published_json: null,
      published_version: 0,
      published_hash: null,
      created_at: now,
      updated_at: now,
      published_at: null,
    });
    return schema;
  }

  /** 读取当前草稿 Schema */
  async findById(formId: string): Promise<FormSchema | null> {
    const row = await this.getRow(formId);
    if (!row?.schema_json) return null;
    try {
      return JSON.parse(row.schema_json) as FormSchema;
    } catch {
      throw new BusinessException(
        ERROR_CODES.SCHEMA_INVALID,
        `表单 ${formId} 的草稿配置损坏`,
      );
    }
  }

  /** 读取已发布 Schema；指定 version 时目前仅返回最新发布版本（Phase2 支持版本回溯） */
  async getPublishedSchema(
    formId: string,
    _version?: number,
  ): Promise<FormSchema | null> {
    const row = await this.getRow(formId);
    if (!row?.published_json) return null;
    try {
      return JSON.parse(row.published_json) as FormSchema;
    } catch {
      throw new BusinessException(
        ERROR_CODES.SCHEMA_INVALID,
        `表单 ${formId} 的发布配置损坏`,
      );
    }
  }

  /** 表单上下文（schema + appId），供权限判定使用 */
  async getContext(formId: string): Promise<FormContext> {
    const row = await this.getRow(formId);
    if (!row) {
      throw new BusinessException(ERROR_CODES.FORM_NOT_FOUND, `表单不存在: ${formId}`);
    }
    const schema = await this.findById(formId);
    if (!schema) {
      throw new BusinessException(ERROR_CODES.FORM_NOT_FOUND, `表单缺少配置: ${formId}`);
    }
    return { schema, appId: row.app_id };
  }

  /** 保存草稿：先做结构校验，避免脏配置进入发布链路 */
  async saveSchema(formId: string, schema: FormSchema): Promise<FormSchema> {
    await this.getRow(formId);
    this.schemaEngine.assertValid(this.schemaEngine.validateFormSchema(schema));
    await this.knex('meta_forms')
      .where({ id: formId })
      .update({ schema_json: JSON.stringify(schema), updated_at: new Date().toISOString() });
    return schema;
  }

  /** 发布前校验（R-017）：返回 Ajv + 字段契约校验结果 */
  async validate(formId: string): Promise<ValidationResult> {
    const schema = await this.findById(formId);
    if (!schema) {
      throw new BusinessException(ERROR_CODES.FORM_NOT_FOUND, `表单不存在: ${formId}`);
    }
    return this.schemaEngine.validateFormSchema(schema);
  }

  /**
   * 一键发布（R-009/R-010）：
   * ① 校验 → ② 版本+1 → ③ ensureTable/evolveTable 幂等 DDL → ④ 计算 hash 并保存发布 Schema。
   * DDL 先于元数据落库：避免出现"版本已升但表不存在"的不一致状态。
   */
  async publish(formId: string, schemaOverride?: FormSchema): Promise<PublishResult> {
    const row = await this.getRow(formId);
    if (!row) {
      throw new BusinessException(ERROR_CODES.FORM_NOT_FOUND, `表单不存在: ${formId}`);
    }
    const schema = schemaOverride ?? (await this.findById(formId));
    if (!schema) {
      throw new BusinessException(ERROR_CODES.FORM_NOT_FOUND, `表单缺少配置: ${formId}`);
    }

    // ① 发布校验（不通过立即抛 SCHEMA_INVALID）
    this.schemaEngine.assertValid(this.schemaEngine.validateFormSchema(schema));

    // ② 版本自增
    const version = Number(row.published_version ?? 0) + 1;

    // ③ 幂等 DDL：新建表或只增列，绝不重建丢数据
    const ddlResult = await this.dataEngine.ensureTable(schema);

    // ④ 发布版本落库
    const schemaHash = createHash('sha256')
      .update(JSON.stringify(schema))
      .digest('hex');
    const publishedAt = new Date().toISOString();
    await this.knex('meta_forms').where({ id: formId }).update({
      schema_json: JSON.stringify(schema),
      published_json: JSON.stringify(schema),
      published_version: version,
      published_hash: schemaHash,
      status: 'published',
      published_at: publishedAt,
      updated_at: publishedAt,
    });

    return {
      formId,
      version,
      tableName: ddlResult.tableName,
      ddl: ddlResult.ddl,
      schemaHash,
      publishedAt,
    };
  }

  /** 导出单个表单配置为 SchemaEnvelope */
  async exportSchema(formId: string): Promise<SchemaEnvelope<FormSchema>> {
    const schema = await this.findById(formId);
    if (!schema) {
      throw new BusinessException(ERROR_CODES.FORM_NOT_FOUND, `表单不存在: ${formId}`);
    }
    return this.schemaEngine.exportForm(schema);
  }

  /** 导入表单配置：校验 + 迁移 + 写入草稿（不自动建表，需显式发布） */
  async importSchema(
    envelope: SchemaEnvelope<FormSchema>,
  ): Promise<FormSchema> {
    const migrated = this.schemaEngine.importEnvelope(envelope);
    const schema = migrated.payload;
    this.schemaEngine.assertValid(this.schemaEngine.validateFormSchema(schema));
    await this.getRow(schema.id); // 不存在时抛 FORM_NOT_FOUND，导入目标必须先创建
    await this.knex('meta_forms')
      .where({ id: schema.id })
      .update({
        schema_json: JSON.stringify(schema),
        updated_at: new Date().toISOString(),
      });
    return schema;
  }

  /** 内部：读取元数据行，不存在抛 FORM_NOT_FOUND */
  private async getRow(formId: string): Promise<FormRow> {
    const row = (await this.knex('meta_forms').where({ id: formId }).first()) as
      | FormRow
      | undefined;
    if (!row) {
      throw new BusinessException(ERROR_CODES.FORM_NOT_FOUND, `表单不存在: ${formId}`);
    }
    return row;
  }
}
