/**
 * 显示条件求值：复用 shared 公式内核（前后端同源）。
 * 客户端仅用于即时交互显隐，不作为落库依据。
 */
import { evaluateVisibility } from '@hengyida/shared/utils/formula-ast';
import type { FieldSchema } from '@hengyida/shared/types/field';

/** 判断某字段在当前值上下文中是否可见 */
export function isFieldVisible(field: FieldSchema, values: Record<string, unknown>): boolean {
  if (!field.visibleWhen) return true;
  return evaluateVisibility(field.visibleWhen.expr, values);
}

/** 过滤出当前可见的字段列表 */
export function visibleFields(
  fields: FieldSchema[],
  values: Record<string, unknown>,
): FieldSchema[] {
  return fields.filter((f) => isFieldVisible(f, values));
}
