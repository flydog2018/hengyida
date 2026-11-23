/**
 * @hengyida/shared —— 前后端共享统一出口。
 * designer / runtime / server 只能通过本包共享类型与契约，禁止相互 import。
 *
 * 采用显式 re-export（而非 export *）：确保 Rollup / tsc 在混合 CJS 依赖
 * （jsep、ajv）场景下仍能静态解析出全部运行时导出，避免 named export 丢失。
 */

// ---- types ----
export type { SchemaVersion, SchemaKind, SchemaMeta, SchemaEnvelope, SchemaMigration } from './types/schema';
export type {
  WidgetType,
  FieldBinding,
  ValidationRule,
  FieldAdapters,
  RelationConfig,
  SubtableConfig,
  FieldSchema,
} from './types/field';
export type { LayoutNode, ListViewConfig, FormSchema } from './types/form';
export type { Page, AppSchema, AppConfig } from './types/app';
export type { Role, Action, FormPermission, AppPermission, RowRule, RolePolicy, PermissionContext } from './types/permission';
export type { FormulaExpression, VisibilityExpression, RuntimeRecord, FilterCondition, SortItem, DataQuery } from './types/data';

// ---- constants（运行时值）----
export {
  SCHEMA_VERSION_HEADER,
  CURRENT_SCHEMA_VERSION,
  MIN_SCHEMA_VERSION,
  compareVersion,
  parseVersion,
  registerMigration,
  migrations,
} from './constants/schema-version';
export { ERROR_CODES, ERROR_MESSAGES } from './constants/error-codes';
export type { ErrorCode } from './constants/error-codes';
export { getWidget, hasWidget, listWidgets, registerWidget } from './constants/widget-registry';
export type { WidgetDefinition, RenderMode } from './constants/widget-registry';
// VI 品牌令牌（依据《恒信 VI 视觉识别系统手册》V1.1，单一深蓝色系）
export { VI_COLORS, VI_FONT_STACK, VI_SLOGANS, VI_BRAND, VI_LOGO_ASSETS } from './constants/brand';
export type { ViColorKey } from './constants/brand';

// ---- utils（运行时值）----
export { evaluateFormula, evaluateVisibility, parse, FormulaError } from './utils/formula-ast';
