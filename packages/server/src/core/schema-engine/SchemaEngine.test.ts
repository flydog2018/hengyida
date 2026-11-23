/**
 * Schema 引擎单测：信封校验、版本兼容、服务端数据校验、导入导出往返。
 */
import { describe, it, expect } from 'vitest';
import type { FormSchema, SchemaEnvelope } from '@hengyida/shared';
import { SchemaEngine } from './SchemaEngine';
import { BusinessException } from '../../common/BusinessException';

const engine = new SchemaEngine();

const makeForm = (): FormSchema => ({
  schemaVersion: '1.0.0',
  kind: 'form',
  id: 'form_emp',
  fields: [
    {
      id: 'f_name',
      widget: 'text',
      label: '姓名',
      binding: { column: 'f_name', dataType: 'varchar' },
      props: {},
      required: true,
    },
    {
      id: 'f_price',
      widget: 'number',
      label: '单价',
      binding: { column: 'f_price', dataType: 'decimal' },
      props: {},
    },
    {
      id: 'f_qty',
      widget: 'number',
      label: '数量',
      binding: { column: 'f_qty', dataType: 'decimal' },
      props: {},
    },
    {
      id: 'f_amount',
      widget: 'formula',
      label: '金额',
      binding: { column: 'f_amount', dataType: 'decimal' },
      props: {},
      formula: { expr: 'f_price * f_qty', deps: ['f_price', 'f_qty'], precision: 2 },
    },
  ],
  layout: { pc: [], h5: [] },
  listView: { columns: ['f_name', 'f_amount'], filters: [], sort: [], pageSize: 20 },
});

describe('信封校验', () => {
  it('合法信封通过', () => {
    const env = engine.exportForm(makeForm());
    expect(engine.validateEnvelope(env).valid).toBe(true);
  });

  it('缺字段的信封被拒绝', () => {
    const env = { schemaVersion: '1.0.0', kind: 'form' };
    expect(engine.validateEnvelope(env as never).valid).toBe(false);
  });
});

describe('表单结构校验', () => {
  it('合法表单通过', () => {
    expect(engine.validateFormSchema(makeForm()).valid).toBe(true);
  });

  it('重复字段 id 被拒绝', () => {
    const form = makeForm();
    form.fields[1].id = 'f_name';
    const result = engine.validateFormSchema(form);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('重复'))).toBe(true);
  });

  it('公式依赖不存在的字段被拒绝', () => {
    const form = makeForm();
    form.fields[3].formula!.deps = ['f_missing'];
    expect(engine.validateFormSchema(form).valid).toBe(false);
  });
});

describe('服务端数据校验', () => {
  it('必填缺失被拒绝', () => {
    const form = makeForm();
    const result = engine.validateRecord(form.fields, { f_price: 1, f_qty: 2 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('姓名'))).toBe(true);
  });

  it('合法数据通过', () => {
    const form = makeForm();
    expect(engine.validateRecord(form.fields, { f_name: '张三' }).valid).toBe(true);
  });

  it('隐藏的必填字段跳过校验', () => {
    const form = makeForm();
    form.fields[0].visibleWhen = { expr: "f_name == '永不成立'", deps: ['f_name'] };
    // 字段自身依赖自身且条件不成立 → 跳过必填
    expect(engine.validateRecord(form.fields, {}).valid).toBe(true);
  });
});

describe('版本兼容与迁移', () => {
  it('高于服务端的版本明确报错', () => {
    const env = engine.exportForm(makeForm());
    env.schemaVersion = '9.9.9';
    expect(() => engine.migrate(env)).toThrow(BusinessException);
  });

  it('低于最低版本明确报错', () => {
    const env = engine.exportForm(makeForm());
    env.schemaVersion = '0.0.1';
    expect(() => engine.migrate(env)).toThrow(/低于最低支持版本/);
  });

  it('当前版本原样通过', () => {
    const env = engine.exportForm(makeForm());
    expect(engine.migrate(env).schemaVersion).toBe('1.0.0');
  });
});

describe('导入导出往返', () => {
  it('导出后再导入，配置完整还原', () => {
    const form = makeForm();
    const env = engine.importEnvelope(engine.exportForm(form) as SchemaEnvelope<FormSchema>);
    expect(env.payload.fields).toHaveLength(form.fields.length);
    expect(env.payload.fields[3].formula?.expr).toBe('f_price * f_qty');
    expect(env.id).toBe('form_emp');
  });
});
