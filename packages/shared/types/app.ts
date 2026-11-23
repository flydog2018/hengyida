/**
 * 应用与页面类型。应用是最高隔离与权限单元（R-001）。
 */
import type { SchemaVersion } from './schema';

export interface Page {
  id: string;
  title: string;
  /** form / list 等页面类型 */
  type: 'form' | 'list' | 'custom';
  formIds: string[];
}

/** 应用配置（payload 部分） */
export interface AppSchema {
  pages: Page[];
  forms: string[];
}

/** 完整应用配置，含信封字段 */
export interface AppConfig extends AppSchema {
  schemaVersion: SchemaVersion;
  kind: 'app';
  id: string;
  name: string;
  description?: string;
}
