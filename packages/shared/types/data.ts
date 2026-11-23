/**
 * 运行时数据类型：公式表达式、显示条件、业务记录、查询参数。
 * 公式/条件表达式来自用户、不可信任，仅以 AST 描述，禁止代码执行（架构文档 7.8）。
 */

/** 公式表达式（如 金额 = 单价 × 数量） */
export interface FormulaExpression {
  /** 表达式源码，如 "f_price * f_qty"，仅经 jsep 解析为 AST */
  expr: string;
  /** 依赖的字段 id 列表，用于计算顺序与刷新触发 */
  deps: string[];
  /** 结果精度（小数位），默认 2 */
  precision?: number;
}

/** 显示条件表达式（如 f_status == '在职' 时显示本字段） */
export interface VisibilityExpression {
  expr: string;
  /** 依赖字段 id 列表 */
  deps: string[];
}

/** 一条运行时业务数据（存储于动态表 t_form_<formId>） */
export interface RuntimeRecord {
  /** 记录主键 */
  id: string;
  /** 表单 id */
  formId: string;
  /** 字段值映射：字段 id → 值。物理列由 FieldBinding 派生 */
  values: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

/** 筛选条件 */
export interface FilterCondition {
  fieldId: string;
  op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in';
  value: unknown;
}

/** 排序项 */
export interface SortItem {
  fieldId: string;
  order: 'asc' | 'desc';
}

/** 数据列表查询参数 */
export interface DataQuery {
  filters?: FilterCondition[];
  sort?: SortItem[];
  page?: number;
  pageSize?: number;
}
