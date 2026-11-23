/**
 * 应用服务（R-001 / R-002）：应用 CRUD + 配置导入导出还原。
 * 配置存 meta_apps / meta_forms 元数据表，与业务动态表彻底分离。
 */
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import {
  CURRENT_SCHEMA_VERSION,
  ERROR_CODES,
  type AppConfig,
  type AppSchema,
  type FormSchema,
  type SchemaEnvelope,
} from '@hengyida/shared';
import { BusinessException } from '../../common/BusinessException';
import { KNEX_CONNECTION } from '../../core/data-engine';
import { SchemaEngine } from '../../core/schema-engine';

/** meta_apps 物理行 */
interface AppRow {
  id: string;
  name: string;
  description: string | null;
  schema_json: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class ApplicationService implements OnModuleInit {
  constructor(
    @Inject(KNEX_CONNECTION) private readonly knex: Knex,
    private readonly schemaEngine: SchemaEngine,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureTable();
  }

  /** 幂等建应用元数据表 */
  private async ensureTable(): Promise<void> {
    const exists = await this.knex.schema.hasTable('meta_apps');
    if (exists) return;
    await this.knex.schema.createTable('meta_apps', (table) => {
      table.string('id', 64).primary();
      table.string('name', 256).notNullable();
      table.text('description').nullable();
      table.text('schema_json').nullable();
      table.string('created_at', 32).nullable();
      table.string('updated_at', 32).nullable();
    });
  }

  /** 创建应用：稳定 id 形如 app_xxx，初始配置为空页面/空表单 */
  async create(name: string, description?: string): Promise<AppConfig> {
    const id = `app_${randomUUID()}`;
    const now = new Date().toISOString();
    const payload = this.schemaEngine.createEmptyAppSchema();
    await this.knex('meta_apps').insert({
      id,
      name,
      description: description ?? null,
      schema_json: JSON.stringify(payload),
      created_at: now,
      updated_at: now,
    });
    return {
      ...payload,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      kind: 'app',
      id,
      name,
      description,
    };
  }

  /** 应用列表 */
  async list(): Promise<AppConfig[]> {
    const rows = (await this.knex('meta_apps').select('*')) as AppRow[];
    return rows.map((row) => this.toConfig(row));
  }

  /** 应用详情；不存在抛 APP_NOT_FOUND */
  async findById(id: string): Promise<AppConfig> {
    const row = (await this.knex('meta_apps').where({ id }).first()) as
      | AppRow
      | undefined;
    if (!row) {
      throw new BusinessException(ERROR_CODES.APP_NOT_FOUND, `应用不存在: ${id}`);
    }
    return this.toConfig(row);
  }

  /**
   * 导出配置：应用 + 其下全部表单 Schema，包成 SchemaEnvelope。
   * 导出内容可原样通过 importSchema 还原（幂等 upsert）。
   */
  async exportSchema(
    appId: string,
  ): Promise<SchemaEnvelope<{ app: AppConfig; forms: FormSchema[] }>> {
    const app = await this.findById(appId);
    const rows = (await this.knex('meta_forms')
      .where({ app_id: appId })
      .select('schema_json')) as Array<{ schema_json: string | null }>;
    const forms: FormSchema[] = [];
    for (const row of rows) {
      if (!row.schema_json) continue;
      try {
        forms.push(JSON.parse(row.schema_json) as FormSchema);
      } catch {
        // 损坏的草稿跳过，避免整包导出失败
      }
    }
    return this.schemaEngine.exportApp(app, forms);
  }

  /** 导入配置：版本校验 + 迁移 + 幂等 upsert 应用与表单元数据 */
  async importSchema(
    envelope: SchemaEnvelope<{ app: AppConfig; forms: FormSchema[] }>,
  ): Promise<{ app: AppConfig; formCount: number }> {
    const migrated = this.schemaEngine.importEnvelope(envelope);
    const incoming = migrated.payload?.app;
    if (!incoming?.id || !incoming?.name) {
      throw new BusinessException(
        ERROR_CODES.SCHEMA_INVALID,
        '导入配置缺少应用 id 或名称',
      );
    }

    const now = new Date().toISOString();
    const payload: AppSchema = {
      pages: incoming.pages ?? [],
      forms: incoming.forms ?? [],
    };
    const appValues = {
      id: incoming.id,
      name: incoming.name,
      description: incoming.description ?? null,
      schema_json: JSON.stringify(payload),
      updated_at: now,
    };
    await this.knex('meta_apps')
      .insert({ ...appValues, created_at: now })
      .onConflict('id')
      .merge(appValues);

    const forms = Array.isArray(migrated.payload?.forms) ? migrated.payload.forms : [];
    for (const form of forms) {
      this.schemaEngine.assertValid(this.schemaEngine.validateFormSchema(form));
      const formValues = {
        id: form.id,
        app_id: incoming.id,
        name: form.id,
        status: 'draft',
        schema_json: JSON.stringify(form),
        published_json: null,
        published_version: 0,
        published_hash: null,
        updated_at: now,
      };
      await this.knex('meta_forms')
        .insert({ ...formValues, created_at: now, published_at: null })
        .onConflict('id')
        .merge(formValues);
    }

    return {
      app: await this.findById(incoming.id),
      formCount: forms.length,
    };
  }

  /** 物理行 → AppConfig：配置载荷与信封字段合并 */
  private toConfig(row: AppRow): AppConfig {
    let payload: AppSchema = { pages: [], forms: [] };
    if (row.schema_json) {
      try {
        payload = JSON.parse(row.schema_json) as AppSchema;
      } catch {
        // 损坏配置回退为空配置，不阻断列表接口
      }
    }
    return {
      ...payload,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      kind: 'app',
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
    };
  }
}
