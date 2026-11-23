/**
 * 权限引擎单测（QA 门禁核心）：五级判定顺序、角色能力、行级谓词、注入防护。
 * 不依赖数据库，可离线运行。
 */
import { describe, it, expect } from 'vitest';
import type { PermissionContext, RolePolicy } from '@hengyida/shared';
import { PermissionEngine, PERMISSION_ORDER } from './PermissionEngine';
import { BusinessException } from '../../common/BusinessException';

const engine = new PermissionEngine();

const adminPolicy: RolePolicy = {
  role: 'admin',
  apps: [],
  forms: [],
};

const viewerPolicy: RolePolicy = {
  role: 'viewer',
  apps: [{ appId: 'app_hr', accessible: true }],
  forms: [{ formId: 'form_emp', actions: ['read'] }],
};

const ctx = (over: Partial<PermissionContext> = {}): PermissionContext => ({
  userId: 'u1',
  role: 'viewer',
  appId: 'app_hr',
  formId: 'form_emp',
  action: 'read',
  ...over,
});

describe('五级判定顺序', () => {
  it('顺序固定为 认证→应用→表单→行级→字段级', () => {
    expect([...PERMISSION_ORDER]).toEqual(['authenticated', 'app', 'form', 'row', 'field']);
    expect([...engine.resolveOrder()]).toEqual([...PERMISSION_ORDER]);
  });

  it('无 userId 时认证级短路（401）', () => {
    expect(() => engine.authorize(ctx({ userId: '' }), viewerPolicy)).toThrow(BusinessException);
    try {
      engine.authorize(ctx({ userId: '' }), viewerPolicy);
    } catch (e) {
      expect((e as BusinessException).getStatus()).toBe(401);
    }
  });

  it('无权访问应用时应用级短路（403）', () => {
    const p: RolePolicy = { role: 'viewer', apps: [{ appId: 'app_other', accessible: false }], forms: [] };
    expect(() => engine.authorize(ctx(), p)).toThrow(/无权访问应用/);
  });

  it('viewer 执行 delete 时表单级短路（403）', () => {
    expect(() => engine.authorize(ctx({ action: 'delete' }), viewerPolicy)).toThrow(/无权对表单/);
  });

  it('admin 全通过', () => {
    expect(engine.authorize(ctx({ role: 'admin', action: 'delete' }), adminPolicy).allowed).toBe(true);
  });

  it('check 布尔版：viewer 可读、不可删', () => {
    expect(engine.check(ctx(), viewerPolicy)).toBe(true);
    expect(engine.check(ctx({ action: 'delete' }), viewerPolicy)).toBe(false);
  });
});

describe('行级权限谓词转换', () => {
  it('等值规则转 SQL 谓词', () => {
    const rules = engine.toPredicates({ expr: "f_dept == '唐山'", deps: ['f_dept'] });
    expect(rules).toEqual([{ column: 'f_dept', op: '=', value: '唐山' }]);
  });

  it('&& 组合拆为多个 AND 谓词', () => {
    const rules = engine.toPredicates({ expr: "f_dept == '唐山' && f_age >= 18", deps: [] });
    expect(rules).toHaveLength(2);
    expect(rules[1]).toEqual({ column: 'f_age', op: '>=', value: 18 });
  });

  it('字段在右侧时翻转比较符', () => {
    const rules = engine.toPredicates({ expr: '18 <= f_age', deps: [] });
    expect(rules[0]).toEqual({ column: 'f_age', op: '>=', value: 18 });
  });

  it('注入表达式不转换为谓词', () => {
    expect(engine.toPredicates({ expr: 'process.exit(1)', deps: [] })).toEqual([]);
    expect(engine.toPredicates({ expr: 'f_a.constructor', deps: [] })).toEqual([]);
  });

  it('行级写校验：不满足规则时拒绝', () => {
    const p: RolePolicy = {
      role: 'editor',
      apps: [],
      forms: [],
      rowRules: { form_emp: { expr: "f_dept == '唐山'", deps: [] } },
    };
    expect(() => engine.assertRowAllowed(ctx({ role: 'editor' }), p, { f_dept: '唐山' })).not.toThrow();
    expect(() => engine.assertRowAllowed(ctx({ role: 'editor' }), p, { f_dept: '北京' })).toThrow(/行级权限拒绝/);
  });
});

describe('内存兜底行过滤', () => {
  it('按规则过滤行', () => {
    const rows = [
      { f_dept: '唐山' },
      { f_dept: '北京' },
    ];
    const result = engine.filterRows(rows, { expr: "f_dept == '唐山'", deps: [] });
    expect(result).toHaveLength(1);
    expect(result[0].f_dept).toBe('唐山');
  });
});
