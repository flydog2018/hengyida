/**
 * 权限模型（架构原创红线：完全自研 RBAC + 行级规则）。
 * 判定顺序固定：认证(JWT) → 应用级 → 表单级 → 行级 → 字段级(Phase2)。
 */

export type Role = 'admin' | 'editor' | 'viewer';

/** CRUD 动作 */
export type Action = 'create' | 'read' | 'update' | 'delete';

/** 表单级权限：某角色对某表单的 CRUD 集合 */
export interface FormPermission {
  formId: string;
  actions: Action[];
}

/** 应用级权限：某角色对某应用是否可访问 */
export interface AppPermission {
  appId: string;
  accessible: boolean;
}

/** 行级权限规则（波次1 基础，Phase2 模板化增强） */
export interface RowRule {
  /** 规则表达式，如 "f_dept == '唐山'"，注入为查询谓词 */
  expr: string;
  deps: string[];
}

/** 角色权限配置集合 */
export interface RolePolicy {
  role: Role;
  apps: AppPermission[];
  forms: FormPermission[];
  /** 行级规则，按表单 id 索引 */
  rowRules?: Record<string, RowRule>;
}

/** 判定上下文（一次判定所需全部信息） */
export interface PermissionContext {
  userId: string;
  role: Role;
  appId: string;
  formId: string;
  action: Action;
}
