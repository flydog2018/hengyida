/**
 * 公式引擎单测（QA 门禁：核心引擎覆盖率 ≥80%）。
 * 覆盖：四则运算、精度、空值、除零、注入防护、显示条件。
 */
import { describe, it, expect } from 'vitest';
import {
  evaluateFormula,
  evaluateVisibility,
  parse,
  FormulaError,
} from './formula-ast';

describe('evaluateFormula - 四则运算', () => {
  it('单价 × 数量', () => {
    expect(evaluateFormula('f_price * f_qty', { f_price: 12.5, f_qty: 4 })).toBe(50);
  });

  it('混合运算与优先级', () => {
    expect(evaluateFormula('f_a + f_b * 2', { f_a: 3, f_b: 5 })).toBe(13);
  });

  it('括号', () => {
    expect(evaluateFormula('(f_a + f_b) * 2', { f_a: 3, f_b: 5 })).toBe(16);
  });

  it('按 precision 四舍五入', () => {
    expect(evaluateFormula('f_a / f_b', { f_a: 1, f_b: 3 }, 2)).toBe(0.33);
  });

  it('负号一元运算', () => {
    expect(evaluateFormula('-f_a + 10', { f_a: 3 })).toBe(7);
  });
});

describe('evaluateFormula - 边界与异常', () => {
  it('空值按 0 处理', () => {
    expect(evaluateFormula('f_a + 1', { f_a: null })).toBe(1);
  });

  it('除零抛错', () => {
    expect(() => evaluateFormula('f_a / f_b', { f_a: 1, f_b: 0 })).toThrow(FormulaError);
  });

  it('空表达式抛错', () => {
    expect(() => evaluateFormula('', {})).toThrow(FormulaError);
  });

  it('语法错误抛错', () => {
    expect(() => parse('f_a +')).toThrow(FormulaError);
  });
});

describe('evaluateFormula - 安全注入防护', () => {
  const attacks = [
    'constructor',
    '__proto__',
    'process.exit(1)',
    'globalThis',
    'f_a.constructor',
    'require("fs")',
  ];

  for (const attack of attacks) {
    it(`拒绝注入: ${attack}`, () => {
      expect(() => evaluateFormula(attack, { f_a: 1 })).toThrow(FormulaError);
    });
  }
});

describe('evaluateVisibility - 显示条件', () => {
  it('等值条件成立', () => {
    expect(evaluateVisibility("f_status == '在职'", { f_status: '在职' })).toBe(true);
  });

  it('等值条件不成立', () => {
    expect(evaluateVisibility("f_status == '在职'", { f_status: '离职' })).toBe(false);
  });

  it('空表达式默认显示', () => {
    expect(evaluateVisibility('', {})).toBe(true);
  });

  it('组合条件 &&', () => {
    expect(
      evaluateVisibility("f_status == '在职' && f_age > 18", {
        f_status: '在职',
        f_age: 25,
      }),
    ).toBe(true);
  });

  it('拒绝成员表达式', () => {
    expect(() => evaluateVisibility('f_a.constructor', { f_a: 1 })).toThrow(FormulaError);
  });
});
