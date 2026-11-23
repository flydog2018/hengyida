/**
 * 发布前本地校验：Ajv 校验 FormSchema 结构 + 设计态语义规则。
 *
 * 注意：本地校验只用于快速反馈，服务端仍会权威校验（架构文档 7.7）。
 * JSON Schema 按 @hengyida/shared 的 FormSchema / FieldSchema 类型手工固化，
 * 避免把运行时校验依赖引入共享层。
 */
import Ajv, { type ErrorObject } from 'ajv';
import {
  CURRENT_SCHEMA_VERSION,
  type FieldSchema,
  type FormSchema,
} from '@hengyida/shared';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Ajv 关键字的中文友好映射 */
const KEYWORD_LABELS: Record<string, string> = {
  required: '缺少必填项',
  type: '类型不正确',
  enum: '取值不在允许范围',
  const: '取值必须是固定值',
  pattern: '格式不匹配',
  minLength: '内容过短',
  minimum: '数值过小',
  additionalProperties: '存在未知属性',
};

/** 字段定义的 JSON Schema；children 自引用以支持子表嵌套 */
const fieldJsonSchema = {
  type: 'object',
  required: ['id', 'widget', 'label', 'binding', 'props'],
  properties: {
    id: { type: 'string', pattern: '^f_' },
    widget: {
      type: 'string',
      enum: ['text', 'number', 'date', 'select', 'attachment', 'subtable', 'relation', 'formula'],
    },
    label: { type: 'string', minLength: 1 },
    binding: {
      type: 'object',
      required: ['column', 'dataType'],
      properties: {
        column: { type: 'string', minLength: 1 },
        dataType: {
          type: 'string',
          enum: ['varchar', 'int', 'decimal', 'date', 'datetime', 'text', 'json'],
        },
      },
    },
    props: { type: 'object' },
    required: { type: 'boolean' },
    defaultValue: {},
    validations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['rule', 'message'],
        properties: {
          rule: { type: 'string', enum: ['required', 'min', 'max', 'regex', 'email', 'custom'] },
          value: {},
          message: { type: 'string' },
        },
      },
    },
    visibleWhen: {
      type: 'object',
      properties: {
        expr: { type: 'string' },
        deps: { type: 'array', items: { type: 'string' } },
      },
    },
    adapters: { type: 'object' },
    formula: {
      type: 'object',
      properties: {
        expr: { type: 'string' },
        deps: { type: 'array', items: { type: 'string' } },
        precision: { type: 'number' },
      },
    },
    relation: { type: ['object', 'null'] },
    children: { type: 'array', items: { $ref: '#/definitions/field' } },
  },
  additionalProperties: true,
};

const layoutNodeJsonSchema = {
  type: 'object',
  required: ['fieldId'],
  properties: {
    fieldId: { type: 'string' },
    span: { type: 'number', minimum: 1 },
    children: { type: 'array', items: { $ref: '#/definitions/layoutNode' } },
  },
};

const formJsonSchema = {
  type: 'object',
  required: ['schemaVersion', 'kind', 'id', 'fields', 'layout', 'listView'],
  properties: {
    schemaVersion: { type: 'string' },
    kind: { const: 'form' },
    id: { type: 'string', pattern: '^form_' },
    fields: { type: 'array', items: { $ref: '#/definitions/field' } },
    layout: {
      type: 'object',
      required: ['pc', 'h5'],
      properties: {
        pc: { type: 'array', items: { $ref: '#/definitions/layoutNode' } },
        h5: { type: 'array', items: { $ref: '#/definitions/layoutNode' } },
      },
    },
    listView: {
      type: 'object',
      required: ['columns', 'filters', 'sort', 'pageSize'],
      properties: {
        columns: { type: 'array', items: { type: 'string' } },
        filters: { type: 'array' },
        sort: { type: 'array' },
        pageSize: { type: 'integer', minimum: 1 },
      },
    },
  },
  definitions: {
    field: fieldJsonSchema,
    layoutNode: layoutNodeJsonSchema,
  },
};

// allErrors 让发布前一次性给出全部问题，strict:false 容忍缺省的 draft 元信息
const ajv = new Ajv({ allErrors: true, strict: false });
const validateSchema = ajv.compile<FormSchema>(formJsonSchema);

/** 把 Ajv 错误转成中文可读文案 */
function formatAjvError(error: ErrorObject): string {
  const label = KEYWORD_LABELS[error.keyword] ?? error.keyword;
  const path = error.instancePath ? `配置路径 ${error.instancePath}` : '表单根节点';
  const detail = error.keyword === 'required' ? `缺少 ${String(error.params.missingProperty)}` : label;
  return `${path}：${detail}`;
}

/** 递归检查子表字段的 id 唯一性与列绑定 */
function checkChildren(
  children: FieldSchema[],
  seen: Set<string>,
  errors: string[],
): void {
  for (const child of children) {
    if (seen.has(child.id)) {
      errors.push(`字段 id 重复：${child.id}（子表字段也需全局唯一）`);
    }
    seen.add(child.id);
    if (child.binding.column !== child.id) {
      errors.push(`字段 ${child.id} 的 binding.column 必须由 id 派生`);
    }
    checkChildren(child.children ?? [], seen, errors);
  }
}

/** 语义级校验：注册表无法表达的业务约束 */
function checkSemantics(form: FormSchema): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  if (form.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    errors.push(`Schema 版本不匹配：${form.schemaVersion}，期望 ${CURRENT_SCHEMA_VERSION}`);
  }

  for (const field of form.fields) {
    if (seen.has(field.id)) errors.push(`字段 id 重复：${field.id}`);
    seen.add(field.id);
    if (field.binding.column !== field.id) {
      errors.push(`字段 ${field.id} 的 binding.column 必须由 id 派生`);
    }
    checkChildren(field.children ?? [], seen, errors);

    if (field.widget === 'formula') {
      if (!field.formula || !field.formula.expr.trim()) {
        errors.push(`公式字段 ${field.label}（${field.id}）尚未填写表达式`);
      } else if (!field.formula.deps.length) {
        errors.push(`公式字段 ${field.label}（${field.id}）的依赖字段为空`);
      }
    }
    if (field.widget === 'relation' && (!field.relation || !field.relation.targetFormId)) {
      errors.push(`关联表字段 ${field.label}（${field.id}）尚未选择目标表单`);
    }
  }

  const layoutIds = new Set<string>([...form.layout.pc, ...form.layout.h5].map((n) => n.fieldId));
  for (const field of form.fields) {
    if (!layoutIds.has(field.id)) errors.push(`字段 ${field.id} 未出现在 PC/H5 布局树中`);
  }

  return errors;
}

/**
 * 校验 FormSchema。返回全部问题，UI 按需展示。
 */
export function validateFormSchema(form: FormSchema): ValidationResult {
  const errors: string[] = [];

  try {
    if (!validateSchema(form)) {
      errors.push(...(validateSchema.errors ?? []).map(formatAjvError));
    }
  } catch (error) {
    errors.push(`配置结构校验异常：${(error as Error).message}`);
  }

  errors.push(...checkSemantics(form));
  return { valid: errors.length === 0, errors };
}
