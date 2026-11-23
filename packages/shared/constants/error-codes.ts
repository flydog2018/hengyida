/**
 * 统一错误码分段（架构文档 7.5）：
 * 1xxx 通用/参数，2xxx 认证授权，3xxx 应用/表单配置，4xxx 数据校验，5xxx 动态 DDL/数据引擎。
 */

export const ERROR_CODES = {
  // 1xxx 通用/参数
  OK: 0,
  BAD_REQUEST: 1001,
  PARAM_INVALID: 1002,
  NOT_FOUND: 1004,
  INTERNAL: 1500,

  // 2xxx 认证授权
  UNAUTHORIZED: 2001,
  TOKEN_EXPIRED: 2002,
  FORBIDDEN: 2003,
  ROLE_DENIED: 2004,
  ROW_DENIED: 2005,

  // 3xxx 应用/表单配置
  APP_NOT_FOUND: 3001,
  FORM_NOT_FOUND: 3002,
  SCHEMA_INVALID: 3003,
  SCHEMA_VERSION_INCOMPATIBLE: 3004,
  WIDGET_UNKNOWN: 3005,

  // 4xxx 数据校验
  REQUIRED_MISSING: 4001,
  VALIDATION_FAILED: 4002,
  FORMULA_ERROR: 4003,

  // 5xxx 动态 DDL / 数据引擎
  DDL_FAILED: 5001,
  DML_FAILED: 5002,
  DIALECT_UNSUPPORTED: 5003,
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** 错误码 → 默认中文提示（前端统一提示映射） */
export const ERROR_MESSAGES: Record<number, string> = {
  [ERROR_CODES.BAD_REQUEST]: '请求参数错误',
  [ERROR_CODES.PARAM_INVALID]: '参数不合法',
  [ERROR_CODES.NOT_FOUND]: '资源不存在',
  [ERROR_CODES.INTERNAL]: '服务器内部错误',
  [ERROR_CODES.UNAUTHORIZED]: '未登录',
  [ERROR_CODES.TOKEN_EXPIRED]: '登录已过期，请重新登录',
  [ERROR_CODES.FORBIDDEN]: '无权限访问',
  [ERROR_CODES.SCHEMA_INVALID]: '配置校验失败',
  [ERROR_CODES.SCHEMA_VERSION_INCOMPATIBLE]: '配置版本不兼容',
  [ERROR_CODES.VALIDATION_FAILED]: '数据校验未通过',
  [ERROR_CODES.FORMULA_ERROR]: '公式计算错误',
  [ERROR_CODES.DDL_FAILED]: '数据表操作失败',
};
