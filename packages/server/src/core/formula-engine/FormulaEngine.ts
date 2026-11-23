/**
 * 公式引擎（架构文档 7.7 / 7.8）：封装 shared 的受限 AST 求值内核。
 * 服务端权威计算：客户端传入的公式字段值一律忽略，落库值只认这里的结果。
 * 一期公式聚焦四则运算，依赖 shared/evaluateFormula 的白名单保护（禁 eval）。
 */
import { Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  FormulaError,
  evaluateFormula,
  evaluateVisibility,
  type FieldSchema,
} from '@hengyida/shared';
import { BusinessException } from '../../common/BusinessException';

/** 可见性判定结果：fieldId → 是否可见 */
export type VisibilityMap = Record<string, boolean>;

@Injectable()
export class FormulaEngine {
  /**
   * 按 FormSchema 字段顺序计算一次填报值：
   * ① 缺省字段套用 defaultValue；② 公式字段按依赖多轮迭代求值直至稳定。
   * 非公式字段保留客户端输入（后续交给 SchemaEngine 校验）。
   */
  computeValues(
    fields: FieldSchema[],
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    const values: Record<string, unknown> = { ...input };

    // ① 默认值：仅对未提供值的字段生效
    for (const field of fields) {
      if (values[field.id] === undefined && field.defaultValue !== undefined) {
        values[field.id] = field.defaultValue;
      }
    }

    // ② 公式字段：多轮迭代保证 f_amount 依赖 f_price*f_qty 这类有序/链式场景
    const formulaFields = fields.filter(
      (f) => f.widget === 'formula' && !!f.formula?.expr?.trim(),
    );
    const rounds = Math.min(formulaFields.length + 1, 32);
    for (let round = 0; round < rounds; round++) {
      for (const field of formulaFields) {
        const formula = field.formula as { expr: string; precision?: number };
        try {
          // 关键：覆盖客户端同名字段，绝不采信客户端计算结果
          values[field.id] = evaluateFormula(
            formula.expr,
            values,
            formula.precision ?? 2,
          );
        } catch (err) {
          if (err instanceof FormulaError) {
            throw new BusinessException(
              ERROR_CODES.FORMULA_ERROR,
              `字段 ${field.id} 公式计算失败: ${err.message}`,
            );
          }
          throw err;
        }
      }
    }
    return values;
  }

  /** 按字段顺序求值 visibleWhen 显示条件 */
  computeVisibility(
    fields: FieldSchema[],
    values: Record<string, unknown>,
  ): VisibilityMap {
    const visibility: VisibilityMap = {};
    for (const field of fields) {
      if (!field.visibleWhen?.expr?.trim()) {
        visibility[field.id] = true;
        continue;
      }
      try {
        visibility[field.id] = evaluateVisibility(
          field.visibleWhen.expr,
          values,
        );
      } catch (err) {
        if (err instanceof FormulaError) {
          throw new BusinessException(
            ERROR_CODES.FORMULA_ERROR,
            `字段 ${field.id} 显示条件求值失败: ${err.message}`,
          );
        }
        throw err;
      }
    }
    return visibility;
  }

  /** 剔除隐藏字段的值，避免不可见字段写入脏数据 */
  applyVisibility(
    values: Record<string, unknown>,
    visibility: VisibilityMap,
  ): Record<string, unknown> {
    const result = { ...values };
    for (const [fieldId, visible] of Object.entries(visibility)) {
      if (!visible) delete result[fieldId];
    }
    return result;
  }

  /** 直接求值单条公式（供调试/外部调用） */
  evaluate(
    expr: string,
    values: Record<string, unknown>,
    precision = 2,
  ): number {
    try {
      return evaluateFormula(expr, values, precision);
    } catch (err) {
      if (err instanceof FormulaError) {
        throw new BusinessException(ERROR_CODES.FORMULA_ERROR, err.message);
      }
      throw err;
    }
  }

  /** 直接求值单条显示条件（供调试/外部调用） */
  isVisible(expr: string, values: Record<string, unknown>): boolean {
    if (!expr?.trim()) return true;
    try {
      return evaluateVisibility(expr, values);
    } catch (err) {
      if (err instanceof FormulaError) {
        throw new BusinessException(ERROR_CODES.FORMULA_ERROR, err.message);
      }
      throw err;
    }
  }
}
