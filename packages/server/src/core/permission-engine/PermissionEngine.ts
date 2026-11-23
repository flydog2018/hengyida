/**
 * 权限引擎（架构文档 7.6 / T03 关键交付物）：
 * 固定五级判定顺序：认证(JWT) → 应用级 → 表单级 → 行级 → 字段级(Phase2)，任一级拒绝立即短路。
 * 行级规则解析为 SQL 谓词交给 DataEngine 注入 WHERE；无法转 SQL 的表达式由 filterRows 内存兜底。
 * 绝不把用户表达式直接拼接进 SQL，杜绝注入与越权。
 */
import { Injectable } from '@nestjs/common';
import {
  ERROR_CODES,
  evaluateVisibility,
  parse,
  type Action,
  type PermissionContext,
  type Role,
  type RolePolicy,
  type RowRule,
} from '@hengyida/shared';
import { BusinessException } from '../../common/BusinessException';
import type { SqlPredicate } from '../data-engine/Dialect';

/** 判定结果 */
export interface PermissionDecision {
  allowed: boolean;
  /** 行级谓词，注入 DataEngine 查询 WHERE */
  predicates: SqlPredicate[];
  /** 命中的行级规则（供内存兜底过滤） */
  rowRules: RowRule[];
  /** 字段级白名单：一期返回 null 表示全部字段可见（Phase2 落地） */
  visibleFieldIds: string[] | null;
}

/** 固定顺序常量（供测试与文档断言） */
export const PERMISSION_ORDER = [
  'authenticated',
  'app',
  'form',
  'row',
  'field',
] as const;

/** jsep AST 的最小结构（shared.parse 返回值的结构化视图） */
interface AstNode {
  type: string;
  operator?: string;
  left?: AstNode;
  right?: AstNode;
  argument?: AstNode;
  name?: string;
  value?: unknown;
}

@Injectable()
export class PermissionEngine {
  /**
   * 主判定入口。认证由 AuthGuard 完成 JWT 校验，本引擎二次确认身份信息存在。
   */
  authorize(ctx: PermissionContext, policy: RolePolicy): PermissionDecision {
    // ① 认证级：无 userId 直接 401 短路
    if (!ctx.userId || !ctx.role) {
      throw new BusinessException(ERROR_CODES.UNAUTHORIZED, '未登录或身份无效', 401);
    }

    // ② 应用级：是否可访问该应用
    if (!this.checkApp(ctx, policy)) {
      throw new BusinessException(
        ERROR_CODES.FORBIDDEN,
        `角色 ${ctx.role} 无权访问应用 ${ctx.appId}`,
        403,
      );
    }

    // ③ 表单级：该角色对表单的 CRUD 权限
    if (!this.checkForm(ctx, policy)) {
      throw new BusinessException(
        ERROR_CODES.ROLE_DENIED,
        `角色 ${ctx.role} 无权对表单 ${ctx.formId} 执行 ${ctx.action} 操作`,
        403,
      );
    }

    // ④ 行级：不直接拒绝读请求，转为谓词缩小可见数据范围；admin 豁免
    const rule = policy.rowRules?.[ctx.formId];
    const predicates: SqlPredicate[] =
      rule && ctx.role !== 'admin' ? this.toPredicates(rule) : [];

    // ⑤ 字段级：Phase2 扩展点，一期全部字段可见
    return {
      allowed: true,
      predicates,
      rowRules: predicates.length > 0 && rule ? [rule] : [],
      visibleFieldIds: null,
    };
  }

  /** 布尔版判定：用于无需区分拒绝原因的场景 */
  check(ctx: PermissionContext, policy: RolePolicy): boolean {
    try {
      return this.authorize(ctx, policy).allowed;
    } catch {
      return false;
    }
  }

  /** 应用级判定：admin 全通过；支持 appId='*' 通配授权 */
  private checkApp(ctx: PermissionContext, policy: RolePolicy): boolean {
    if (ctx.role === 'admin') return true;
    const grants = policy.apps ?? [];
    const grant =
      grants.find((item) => item.appId === ctx.appId) ??
      grants.find((item) => item.appId === '*');
    return grant ? grant.accessible === true : false;
  }

  /** 表单级判定：admin 全通过；显式授权优先，其次 roles 默认能力 */
  private checkForm(ctx: PermissionContext, policy: RolePolicy): boolean {
    if (ctx.role === 'admin') return true;
    const grants = policy.forms ?? [];
    const grant =
      grants.find((item) => item.formId === ctx.formId) ??
      grants.find((item) => item.formId === '*');
    const actions: Action[] = grant ? grant.actions : this.defaultActions(ctx.role);
    return actions.includes(ctx.action);
  }

  /** 一期默认角色能力：editor 可 CRUD，viewer 只读 */
  private defaultActions(role: Role): Action[] {
    if (role === 'editor') return ['create', 'read', 'update', 'delete'];
    if (role === 'viewer') return ['read'];
    return [];
  }

  /**
   * 行级写校验：新建/更新时，记录值必须满足行级规则，否则立即 403 短路。
   * 更新场景应传"旧值"判断，防止把记录改出自己的数据范围。
   */
  assertRowAllowed(
    ctx: PermissionContext,
    policy: RolePolicy,
    values: Record<string, unknown>,
  ): void {
    if (ctx.role === 'admin') return;
    const rule = policy.rowRules?.[ctx.formId];
    if (!rule?.expr?.trim()) return;
    let allowed = false;
    try {
      allowed = evaluateVisibility(rule.expr, values);
    } catch {
      allowed = false;
    }
    if (!allowed) {
      throw new BusinessException(
        ERROR_CODES.ROW_DENIED,
        `行级权限拒绝：记录不满足表单 ${ctx.formId} 的数据范围规则`,
        403,
      );
    }
  }

  /**
   * 行级规则 → SQL 谓词数组（AND 语义）。
   * 只解析 field <比较符> literal 及 && 组合；|| / 函数 / 成员表达式一律不转 SQL，交给内存兜底。
   */
  toPredicates(rule: RowRule): SqlPredicate[] {
    const result: SqlPredicate[] = [];
    if (!rule?.expr?.trim()) return result;

    let ast: AstNode;
    try {
      ast = parse(rule.expr) as unknown as AstNode;
    } catch {
      return result;
    }

    const comparisonMap: Record<string, SqlPredicate['op']> = {
      '==': '=',
      '===': '=',
      '!=': '!=',
      '!==': '!=',
      '>': '>',
      '>=': '>=',
      '<': '<',
      '<=': '<=',
    };
    const flipMap: Record<string, SqlPredicate['op']> = {
      '>': '<',
      '>=': '<=',
      '<': '>',
      '<=': '>=',
    };

    const walk = (node: AstNode | undefined): void => {
      if (!node) return;
      // 逻辑与：拆成多个 AND 谓词；逻辑或一期转不了 SQL，留空交由内存兜底
      if (
        node.type === 'LogicalExpression' ||
        (node.type === 'BinaryExpression' &&
          (node.operator === '&&' || node.operator === '||'))
      ) {
        if (node.operator === '&&') {
          walk(node.left);
          walk(node.right);
        }
        return;
      }
      if (node.type !== 'BinaryExpression') return;

      let op = comparisonMap[node.operator ?? ''];
      if (!op || !node.left || !node.right) return;

      const left = node.left;
      const right = node.right;
      let column: string | undefined;
      let literal: unknown;
      let fieldOnRight = false;

      if (left.type === 'Identifier') {
        column = left.name;
        literal = right.type === 'Literal' ? right.value : undefined;
      } else if (right.type === 'Identifier') {
        fieldOnRight = true;
        column = right.name;
        literal = left.type === 'Literal' ? left.value : undefined;
      }
      if (!column || literal === undefined) return;

      if (fieldOnRight) op = flipMap[op] ?? op;

      if (typeof literal === 'string') {
        // 含通配符的字符串按 LIKE 处理，否则精确匹配
        result.push({
          column,
          op: literal.includes('%') || literal.includes('_') ? 'like' : op,
          value: literal,
        });
      } else if (typeof literal === 'number' || typeof literal === 'boolean') {
        result.push({ column, op, value: literal });
      }
    };

    walk(ast);
    return result;
  }

  /**
   * 内存兜底行级过滤：复用 shared 的显示条件求值器对每行求值。
   * 传入的每行应为字段值映射（键为字段 id）。
   */
  filterRows<T extends Record<string, unknown>>(
    rows: T[],
    rule: RowRule | undefined,
  ): T[] {
    if (!rule?.expr?.trim()) return rows;
    return rows.filter((row) => {
      try {
        return evaluateVisibility(rule.expr, row);
      } catch {
        return false;
      }
    });
  }

  /** 返回固定判定顺序（供测试/文档断言） */
  resolveOrder(): readonly string[] {
    return PERMISSION_ORDER;
  }
}
