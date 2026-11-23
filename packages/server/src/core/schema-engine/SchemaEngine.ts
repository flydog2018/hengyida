/**
 * Schema 引擎（架构文档 T03 关键交付物）：
 * 1) 用 Ajv 校验 SchemaEnvelope 信封与 FormSchema 字段契约；
 * 2) 按 schemaVersion 逐级迁移，不兼容明确报错，禁止静默覆盖；
 * 3) 提供配置导入导出还原；
 * 4) 提供服务端数据校验（required / min / max / regex / email），显示条件不通过的字段跳过校验。
 */
import { Injectable } from '@nestjs/common';
import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';
import {
  CURRENT_SCHEMA_VERSION,
  ERROR_CODES,
  MIN_SCHEMA_VERSION,
  compareVersion,
  evaluateVisibility,
  getWidget,
  migrations,
  type AppConfig,
  type AppSchema,
  type FieldSchema,
  type FormSchema,
  type SchemaEnvelope,
  type ValidationRule,
} from '@hengyida/shared';
import { BusinessException } from '../../common/BusinessException';

/** 校验结果：errors 为空即通过 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** SchemaEnvelope 的 JSON Schema（Ajv 校验基线，字段级细节由 validateFormSchema 补充） */
const ENVELOPE_JSON_SCHEMA: object = {
  type: 'object',
  required: ['schemaVersion', 'kind', 'id', 'meta', 'payload'],
  properties: {
    schemaVersion: { type: 'string', pattern: '^\\d+\\.\\d+\\.\\d+$' },
    kind: { type: 'string', enum: ['app', 'form', 'page'] },
    id: { type: 'string', minLength: 1 },
    meta: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', minLength: 1 },
        description: { type: 'string' },
        exportedAt: { type: 'string' },
      },
    },
    payload: { type: 'object' },
  },
  additionalProperties: true,
};

/** Ajv 错误 → 可读提示 */
function formatAjvError(error: ErrorObject): string {
  const path = error.instancePath || '/';
  return `${path} ${error.message ?? '校验失败'}`;
}

@Injectable()
export class SchemaEngine {
  private readonly ajv: Ajv;
  private readonly envelopeValidator: ValidateFunction;

  constructor() {
    // strict:false 容忍信封中扩展字段；allErrors 一次返回全部问题便于前端定位
    this.ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
    this.envelopeValidator = this.ajv.compile(ENVELOPE_JSON_SCHEMA);
  }

  /** 校验 SchemaEnvelope 信封结构（不做版本兼容判断，那属于 migrate 职责） */
  validateEnvelope<T>(envelope: SchemaEnvelope<T>): ValidationResult {
    if (!envelope || typeof envelope !== 'object') {
      return { valid: false, errors: ['配置信封不能为空'] };
    }
    const ok = this.envelopeValidator(envelope);
    const errors: string[] = ok
      ? []
      : (this.envelopeValidator.errors ?? []).map(formatAjvError);
    return { valid: errors.length === 0, errors };
  }

  /**
   * 校验 FormSchema 细节：字段 id 唯一且合法、物理列合法、控件已注册、公式字段有表达式。
   * 发布链路（form.publish）必须先通过本校验。
   */
  validateFormSchema(form: FormSchema): ValidationResult {
    const errors: string[] = [];
    if (!form || typeof form !== 'object') {
      return { valid: false, errors: ['表单配置不能为空'] };
    }
    if (!form.id) errors.push('表单缺少 id');
    // 允许空 fields：刚创建、尚未拖入字段的表单也应能发布（只建系统列），便于核心链路联调
    if (!Array.isArray(form.fields)) {
      errors.push('表单 fields 必须为数组');
      return { valid: false, errors };
    }

    const allIds = new Set(form.fields.map((f) => f.id));
    const seen = new Set<string>();
    for (const field of form.fields) {
      const f = field as FieldSchema;
      if (!f.id || !/^f_[A-Za-z0-9_]+$/.test(f.id)) {
        errors.push(`字段 id 非法: ${String(f.id)}`);
      }
      if (seen.has(f.id)) errors.push(`字段 id 重复: ${f.id}`);
      seen.add(f.id);

      if (!f.binding?.column || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(f.binding.column)) {
        errors.push(`字段 ${f.id} 的物理列名非法: ${String(f.binding?.column)}`);
      }
      // 控件必须已在共享注册表登记，否则 designer/runtime 无法一致渲染
      try {
        getWidget(f.widget);
      } catch {
        errors.push(`字段 ${f.id} 使用了未注册的控件类型: ${String(f.widget)}`);
      }
      if (f.widget === 'formula' && (!f.formula || !f.formula.expr?.trim())) {
        errors.push(`公式字段 ${f.id} 缺少表达式`);
      }
      // 公式/显示条件的依赖字段必须存在，避免运行时求得 NaN
      for (const dep of f.formula?.deps ?? []) {
        if (!allIds.has(dep)) errors.push(`字段 ${f.id} 的公式依赖不存在: ${dep}`);
      }
      for (const dep of f.visibleWhen?.deps ?? []) {
        if (!allIds.has(dep)) errors.push(`字段 ${f.id} 的显示条件依赖不存在: ${dep}`);
      }
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * 服务端数据校验（权威，不信任客户端校验结果）。
   * 一期不支持 custom 脚本规则执行（安全红线：禁止任意代码执行），仅保留声明。
   */
  validateRecord(
    fields: FieldSchema[],
    values: Record<string, unknown>,
  ): ValidationResult {
    const errors: string[] = [];
    for (const field of fields) {
      // 显示条件不成立的字段不参与校验（避免隐藏必填阻断提交）
      if (field.visibleWhen?.expr?.trim()) {
        try {
          if (!evaluateVisibility(field.visibleWhen.expr, values)) continue;
        } catch (err) {
          errors.push(`字段 ${field.id} 的显示条件求值失败: ${(err as Error).message}`);
          continue;
        }
      }

      const value = values[field.id];
      const isEmpty = value === undefined || value === null || value === '';
      const rules: ValidationRule[] = [];
      if (field.required) {
        rules.push({ rule: 'required', message: `${field.label || field.id}不能为空` });
      }
      if (field.validations?.length) rules.push(...field.validations);

      for (const rule of rules) {
        if (rule.rule === 'required') {
          if (isEmpty) errors.push(rule.message);
          continue;
        }
        // 非必填空值跳过其余规则
        if (isEmpty) continue;
        switch (rule.rule) {
          case 'min': {
            const min = Number(rule.value);
            const actual = typeof value === 'number' ? value : String(value).length;
            if (Number.isFinite(min) && actual < min) errors.push(rule.message);
            break;
          }
          case 'max': {
            const max = Number(rule.value);
            const actual = typeof value === 'number' ? value : String(value).length;
            if (Number.isFinite(max) && actual > max) errors.push(rule.message);
            break;
          }
          case 'regex': {
            try {
              const regex = new RegExp(String(rule.value ?? ''));
              if (!regex.test(String(value))) errors.push(rule.message);
            } catch {
              errors.push(`字段 ${field.id} 的正则规则不合法`);
            }
            break;
          }
          case 'email': {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
              errors.push(rule.message);
            }
            break;
          }
          case 'custom':
            // 一期不执行任意脚本：仅保留声明，避免代码注入风险
            break;
          default:
            break;
        }
      }
    }
    return { valid: errors.length === 0, errors };
  }

  /** 校验失败统一抛 BusinessException(SCHEMA_INVALID) */
  assertValid(result: ValidationResult): void {
    if (!result.valid) {
      throw new BusinessException(
        ERROR_CODES.SCHEMA_INVALID,
        result.errors.join('; '),
      );
    }
  }

  /**
   * 版本迁移：逐级执行 migrations 中的 from→to 钩子。
   * 版本高于服务端或低于最低支持版本时明确报错，绝不静默降级。
   */
  migrate<T>(envelope: SchemaEnvelope<T>): SchemaEnvelope<T> {
    if (compareVersion(envelope.schemaVersion, CURRENT_SCHEMA_VERSION) > 0) {
      throw new BusinessException(
        ERROR_CODES.SCHEMA_VERSION_INCOMPATIBLE,
        `配置版本 ${envelope.schemaVersion} 高于服务端支持版本 ${CURRENT_SCHEMA_VERSION}`,
      );
    }
    if (compareVersion(envelope.schemaVersion, MIN_SCHEMA_VERSION) < 0) {
      throw new BusinessException(
        ERROR_CODES.SCHEMA_VERSION_INCOMPATIBLE,
        `配置版本 ${envelope.schemaVersion} 低于最低支持版本 ${MIN_SCHEMA_VERSION}`,
      );
    }

    let current: SchemaEnvelope<T> = { ...envelope };
    for (const migration of migrations) {
      if (compareVersion(current.schemaVersion, migration.from) === 0) {
        current = {
          ...current,
          schemaVersion: migration.to,
          payload: migration.migrate(current.payload) as T,
        };
      }
    }
    return current;
  }

  /** 导入：先结构校验 + 版本兼容，再迁移 */
  importEnvelope<T>(envelope: SchemaEnvelope<T>): SchemaEnvelope<T> {
    this.assertValid(this.validateEnvelope(envelope));
    return this.migrate(envelope);
  }

  /** 导出应用配置：含应用自身与其下全部表单 Schema（还原后可原样导入） */
  exportApp(
    app: AppConfig,
    forms: FormSchema[],
  ): SchemaEnvelope<{ app: AppConfig; forms: FormSchema[] }> {
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      kind: 'app',
      id: app.id,
      meta: {
        name: app.name,
        description: app.description,
        exportedAt: new Date().toISOString(),
      },
      payload: { app, forms },
    };
  }

  /** 导出单个表单配置 */
  exportForm(form: FormSchema): SchemaEnvelope<FormSchema> {
    return {
      schemaVersion: form.schemaVersion ?? CURRENT_SCHEMA_VERSION,
      kind: 'form',
      id: form.id,
      meta: { name: form.id, exportedAt: new Date().toISOString() },
      payload: form,
    };
  }

  /** 便捷构造 AppSchema（供应用模块创建默认配置使用） */
  createEmptyAppSchema(): AppSchema {
    return { pages: [], forms: [] };
  }
}
