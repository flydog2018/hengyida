/**
 * 字段配置类型（FieldSchema）。
 * 字段以稳定 id 为锚点，物理列名由 binding.column 派生 —— 配置与数据分离的基石。
 * 改标签不影响已存数据；字段定义与控件注册表（widget-registry）通过 widget 字段关联。
 */

import type { FormulaExpression, VisibilityExpression } from './data';

/** 控件类型标识，指向 widget-registry 注册的 type */
export type WidgetType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'attachment'
  | 'subtable'
  | 'relation'
  | 'formula';

/** 字段绑定的物理列信息 */
export interface FieldBinding {
  /** 物理列名，由字段 id 派生，如 f_name */
  column: string;
  dataType: 'varchar' | 'int' | 'decimal' | 'date' | 'datetime' | 'text' | 'json';
}

/** 单条校验规则 */
export interface ValidationRule {
  rule: 'required' | 'min' | 'max' | 'regex' | 'email' | 'custom';
  value?: string | number;
  message: string;
}

/** 多端适配声明（PC/H5 栅格跨度等） */
export interface FieldAdapters {
  pc?: { span?: number; [key: string]: unknown };
  h5?: { span?: number; [key: string]: unknown };
}

/** 关联表（多对一）配置 */
export interface RelationConfig {
  /** 目标表单 id */
  targetFormId: string;
  /** 目标表单中作为展示标签的字段 id */
  labelFieldId: string;
  /** 本表单中存储关联记录 id 的字段名 */
  foreignKeyColumn: string;
}

/** 子表（一对多）配置 */
export interface SubtableConfig {
  /** 子表字段列表（嵌套 FieldSchema） */
  fields: FieldSchema[];
  /** 子表物理表名 t_form_<formId>_<fieldId> */
  table: string;
}

/**
 * 字段配置 —— designer 产出、runtime 渲染、server 执行的共同契约单元。
 */
export interface FieldSchema {
  /** 稳定 ID，形如 f_xxx，跨环境不变 */
  id: string;
  widget: WidgetType;
  /** 展示标题（可重命名，不影响数据） */
  label: string;
  binding: FieldBinding;
  /** 控件专有属性（placeholder/maxLength/选项等），由 widget-registry 定义 */
  props: Record<string, unknown>;
  required?: boolean;
  defaultValue?: unknown;
  validations?: ValidationRule[];
  /** 显示条件：依赖其他字段值的表达式 */
  visibleWhen?: VisibilityExpression;
  adapters?: FieldAdapters;
  /** 子表字段（widget=subtable 时有效） */
  children?: FieldSchema[];
  /** 关联表配置（widget=relation 时有效） */
  relation?: RelationConfig | null;
  /** 公式配置（widget=formula 时有效） */
  formula?: FormulaExpression;
}
