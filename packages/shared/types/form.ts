/**
 * FormSchema —— 表单配置，designer 与 runtime 的共同契约（架构文档 3.1）。
 */
import type { SchemaVersion } from './schema';
import type { FieldSchema } from './field';

/** 布局树节点：组织字段 id 的呈现顺序与分栏 */
export interface LayoutNode {
  fieldId: string;
  /** 跨列数（24 栅格） */
  span?: number;
  children?: LayoutNode[];
}

/** 数据列表视图配置 */
export interface ListViewConfig {
  columns: string[];
  filters: unknown[];
  sort: unknown[];
  pageSize: number;
}

/** 表单配置（可独立导入导出，故自带信封字段） */
export interface FormSchema {
  schemaVersion: SchemaVersion;
  kind: 'form';
  id: string;
  fields: FieldSchema[];
  layout: {
    pc: LayoutNode[];
    h5: LayoutNode[];
  };
  listView: ListViewConfig;
}
