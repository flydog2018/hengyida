/**
 * 受限 AST 公式引擎（架构文档 7.8 / C3）。
 *
 * 安全红线：
 * 1. 表达式仅经 jsep 解析为 AST，绝不 eval / new Function；
 * 2. 求值器只放行白名单运算符；
 * 3. 标识符一律解析为 values[f_xxx]，禁止原型链/全局变量访问；
 * 4. 禁止成员表达式（obj.constructor / __proto__ / process 等）；
 * 5. 函数调用默认禁用（一期聚焦四则运算，高级函数 Phase2 按需白名单开放）。
 *
 * 该内核前后端同源共享：客户端用于即时交互展示，服务端用于权威计算（客户端结果不作落库依据）。
 */
import jsep from 'jsep';

/** jsep AST 节点的最小结构定义（避免强依赖其类型声明版本） */
interface ExpressionNode {
  type: string;
  value?: unknown;
  name?: string;
  operator?: string;
  left?: ExpressionNode;
  right?: ExpressionNode;
  argument?: ExpressionNode;
  arguments?: ExpressionNode[];
  object?: ExpressionNode;
  property?: ExpressionNode;
  computed?: boolean;
}

/** 一期白名单二元运算符（四则 + 取模） */
const ALLOWED_BINARY: Record<string, (a: number, b: number) => number> = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => a / b,
  '%': (a, b) => a % b,
};

/** 一期白名单一元运算符 */
const ALLOWED_UNARY: Record<string, (a: number) => number> = {
  '-': (a) => -a,
  '+': (a) => a,
};

/** 明确禁止的标识符（原型链 / 运行时逃逸） */
const FORBIDDEN_IDENTIFIERS = new Set([
  'constructor',
  'prototype',
  '__proto__',
  'process',
  'require',
  'global',
  'globalThis',
  'window',
  'eval',
  'Function',
]);

/** 公式求值错误 */
export class FormulaError extends Error {
  constructor(message: string) {
    super(`[formula] ${message}`);
    this.name = 'FormulaError';
  }
}

/**
 * 解析表达式为 AST。解析失败抛出 FormulaError。
 */
export function parse(expr: string): ExpressionNode {
  if (typeof expr !== 'string' || expr.trim() === '') {
    throw new FormulaError('表达式为空');
  }
  try {
    return jsep(expr) as unknown as ExpressionNode;
  } catch (err) {
    throw new FormulaError(`表达式解析失败: ${(err as Error).message}`);
  }
}

/**
 * 在给定字段值上下文上安全求值 AST。
 * @param node  AST 节点
 * @param values 字段值映射（键为字段 id，如 f_price）
 * @param depth 递归深度保护
 */
function evaluate(node: ExpressionNode, values: Record<string, unknown>, depth = 0): number {
  // 深度保护，防止构造超深 AST 造成栈溢出
  if (depth > 100) throw new FormulaError('表达式嵌套过深');

  switch (node.type) {
    case 'Literal': {
      if (typeof node.value === 'number' && Number.isFinite(node.value)) {
        return node.value;
      }
      // 一期公式仅支持数值字面量参与运算；字符串/布尔仅允许出现在比较类表达式（Phase2 扩展）
      throw new FormulaError('仅支持数字字面量参与运算');
    }
    case 'Identifier': {
      const name = node.name ?? '';
      if (FORBIDDEN_IDENTIFIERS.has(name)) {
        throw new FormulaError(`禁止访问的标识符: ${name}`);
      }
      const v = values[name];
      if (v === undefined || v === null || v === '') return 0; // 空值按 0 处理，避免 NaN 传播
      const num = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(num)) {
        throw new FormulaError(`字段 ${name} 的值非数字: ${String(v)}`);
      }
      return num;
    }
    case 'BinaryExpression': {
      const op = node.operator ?? '';
      const fn = ALLOWED_BINARY[op];
      if (!fn) throw new FormulaError(`不支持的运算符: ${op}`);
      const left = evaluate(node.left as ExpressionNode, values, depth + 1);
      const right = evaluate(node.right as ExpressionNode, values, depth + 1);
      if (op === '/' && right === 0) throw new FormulaError('除数不能为 0');
      return fn(left, right);
    }
    case 'UnaryExpression': {
      const op = node.operator ?? '';
      const fn = ALLOWED_UNARY[op];
      if (!fn) throw new FormulaError(`不支持的一元运算符: ${op}`);
      return fn(evaluate(node.argument as ExpressionNode, values, depth + 1));
    }
    case 'MemberExpression':
    case 'CallExpression':
    case 'ArrayExpression':
    case 'ObjectExpression':
      // 一律拒绝：杜绝原型链访问、任意函数调用与对象构造
      throw new FormulaError(`禁止的表达式节点: ${node.type}`);
    default:
      throw new FormulaError(`未知的表达式节点: ${node.type}`);
  }
}

/**
 * 安全求值公式表达式，返回按 precision 四舍五入的数值。
 * 这是对外主入口。
 */
export function evaluateFormula(
  expr: string,
  values: Record<string, unknown>,
  precision = 2,
): number {
  const ast = parse(expr);
  const result = evaluate(ast, values);
  if (!Number.isFinite(result)) throw new FormulaError('计算结果非有限数');
  const factor = 10 ** Math.max(0, Math.floor(precision));
  return Math.round(result * factor) / factor;
}

/**
 * 显示条件求值（如 f_status == '在职'）。
 * 一期支持等值/不等比较与 &&/|| 组合；字符串字面量在此允许。
 */
export function evaluateVisibility(
  expr: string,
  values: Record<string, unknown>,
): boolean {
  if (!expr || expr.trim() === '') return true;
  let node: ExpressionNode;
  try {
    node = jsep(expr) as unknown as ExpressionNode;
  } catch (err) {
    throw new FormulaError(`显示条件解析失败: ${(err as Error).message}`);
  }

  const resolve = (n: ExpressionNode, d = 0): unknown => {
    if (d > 100) throw new FormulaError('条件嵌套过深');
    switch (n.type) {
      case 'Literal':
        return n.value;
      case 'Identifier': {
        const name = n.name ?? '';
        if (FORBIDDEN_IDENTIFIERS.has(name)) throw new FormulaError(`禁止的标识符: ${name}`);
        return values[name];
      }
      case 'BinaryExpression': {
        const l = resolve(n.left as ExpressionNode, d + 1);
        const r = resolve(n.right as ExpressionNode, d + 1);
        switch (n.operator) {
          case '==': return l == r; // eslint-disable-line eqeqeq
          case '===': return l === r;
          case '!=': return l != r; // eslint-disable-line eqeqeq
          case '!==': return l !== r;
          case '>': return (l as number) > (r as number);
          case '>=': return (l as number) >= (r as number);
          case '<': return (l as number) < (r as number);
          case '<=': return (l as number) <= (r as number);
          case '&&': return Boolean(l) && Boolean(r);
          case '||': return Boolean(l) || Boolean(r);
          default: throw new FormulaError(`不支持的比较运算符: ${n.operator}`);
        }
      }
      case 'UnaryExpression': {
        const v = resolve(n.argument as ExpressionNode, d + 1);
        if (n.operator === '!') return !v;
        throw new FormulaError(`不支持的一元运算符: ${n.operator}`);
      }
      case 'MemberExpression':
      case 'CallExpression':
        throw new FormulaError(`禁止的表达式节点: ${n.type}`);
      default:
        throw new FormulaError(`未知的条件节点: ${n.type}`);
    }
  };

  return Boolean(resolve(node));
}
