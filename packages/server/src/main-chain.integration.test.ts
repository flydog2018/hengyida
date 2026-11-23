/**
 * 主链路离线集成验证（搭建→发布→建表→填报→渲染）
 *
 * 目的：本机无 MySQL/Docker 时，验证核心引擎间的契约与数据流正确性。
 * 覆盖链路中不依赖真实 DB 连接的环节：
 *   ① 设计态字段 → FormSchema（binding.column 派生）
 *   ② 发布：Schema 校验 + MySQL 方言生成幂等 DDL（CREATE/ALTER，只增不删）
 *   ③ 填报：服务端权威公式计算 + 显示条件过滤
 *   ④ 落库数据形状与渲染契约（字段 id → 物理列映射）
 *
 * ⚠️ 真实 DB 的 DDL 执行 / CRUD / 事务 仍需在有 MySQL 8 的环境做 E2E（见 TEST_STRATEGY.md L3/L4）。
 */
import { describe, expect, it } from 'vitest';
import type { FieldSchema, FormSchema } from '@hengyida/shared';
import { SchemaEngine } from './core/schema-engine/SchemaEngine';
import { FormulaEngine } from './core/formula-engine/FormulaEngine';
import { MySQLDialect } from './core/data-engine/MySQLDialect';

/** 构造一个典型报价单表单（含默认值、公式、显示条件） */
function buildFormSchema(): FormSchema {
  const fields: FieldSchema[] = [
    {
      id: 'f_name',
      widget: 'text',
      label: '客户名称',
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
      defaultValue: 0,
    },
    {
      id: 'f_qty',
      widget: 'number',
      label: '数量',
      binding: { column: 'f_qty', dataType: 'int' },
      props: {},
      defaultValue: 0,
    },
    {
      id: 'f_amount',
      widget: 'formula',
      label: '金额',
      binding: { column: 'f_amount', dataType: 'decimal' },
      props: {},
      formula: { expr: 'f_price * f_qty', deps: ['f_price', 'f_qty'], precision: 2 },
    },
    {
      id: 'f_remark',
      widget: 'text',
      label: '备注',
      binding: { column: 'f_remark', dataType: 'varchar' },
      props: {},
      visibleWhen: { expr: 'f_amount > 1000', deps: ['f_amount'] },
    },
  ];
  return {
    schemaVersion: '1.0.0',
    kind: 'form',
    id: 'form_quote',
    fields,
    layout: {
      pc: fields.map((f) => ({ fieldId: f.id, span: 12 })),
      h5: fields.map((f) => ({ fieldId: f.id, span: 24 })),
    },
    listView: {
      columns: ['f_name', 'f_amount'],
      filters: [],
      sort: [],
      pageSize: 20,
    },
  } as FormSchema;
}

describe('主链路离线集成：搭建→发布→建表→填报→渲染', () => {
  const schemaEngine = new SchemaEngine();
  const formulaEngine = new FormulaEngine();
  const dialect = new MySQLDialect();

  it('① 设计态字段产出合法 FormSchema（字段 id 锚点、物理列派生）', () => {
    const form = buildFormSchema();
    const result = schemaEngine.validateFormSchema(form);
    expect(result.valid).toBe(true);
    // 物理列由 id 派生，改 label 不影响数据定位
    for (const field of form.fields) {
      expect(field.binding.column).toBe(field.id);
    }
  });

  it('② 发布：生成幂等建表 DDL（IF NOT EXISTS + 系统列 + utf8mb4）', () => {
    const form = buildFormSchema();
    const tableName = dialect.tableName(form.id);
    expect(tableName).toBe('t_form_quote');
    const sql = dialect.createTableSql(tableName, form.fields);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS');
    expect(sql).toContain('`id` VARCHAR(64) NOT NULL PRIMARY KEY');
    expect(sql).toContain('`f_amount` DECIMAL(20,6) NULL');
    expect(sql).toContain('`created_at`');
    expect(sql).toContain('`updated_at`');
    expect(sql).toContain('ENGINE=InnoDB');
  });

  it('②-b 增量加列 DDL 只 ADD COLUMN，绝不 DROP/MODIFY（幂等只增不删）', () => {
    const newField: FieldSchema = {
      id: 'f_discount',
      widget: 'number',
      label: '折扣',
      binding: { column: 'f_discount', dataType: 'decimal' },
      props: {},
    };
    const sql = dialect.addColumnSql('t_form_quote', newField);
    expect(sql).toBe(
      'ALTER TABLE `t_form_quote` ADD COLUMN `f_discount` DECIMAL(20,6) NULL',
    );
    expect(sql).not.toMatch(/DROP|MODIFY|TRUNCATE|RENAME/i);
  });

  it('③ 填报：服务端权威计算金额（客户端传入伪值被覆盖）', () => {
    const form = buildFormSchema();
    // 客户端恶意传入 f_amount=999999，服务端必须忽略并重算
    const input = {
      f_name: '唐山某公司',
      f_price: 12.5,
      f_qty: 4,
      f_amount: 999999,
    };
    const values = formulaEngine.computeValues(form.fields, input);
    expect(values.f_amount).toBe(50); // 12.5 × 4，而非客户端的 999999
    expect(values.f_name).toBe('唐山某公司');
  });

  it('③-b 显示条件随计算结果动态生效（金额>1000 才显示备注）', () => {
    const form = buildFormSchema();
    const low = formulaEngine.computeValues(form.fields, {
      f_price: 10,
      f_qty: 2,
    });
    expect(formulaEngine.isVisible('f_amount > 1000', low)).toBe(false);

    const high = formulaEngine.computeValues(form.fields, {
      f_price: 1000,
      f_qty: 2,
    });
    expect(formulaEngine.isVisible('f_amount > 1000', high)).toBe(true);
  });

  it('③-c 隐藏字段值被剔除，不写入脏数据', () => {
    const fields = buildFormSchema().fields;
    const values = { f_amount: 50, f_remark: '不该写入' };
    const visibility = { f_amount: true, f_remark: false };
    const cleaned = formulaEngine.applyVisibility(values, visibility);
    expect(cleaned.f_remark).toBeUndefined();
    expect(cleaned.f_amount).toBe(50);
  });

  it('④ 落库数据形状与渲染契约一致（每条记录按 id 寻址，列映射无歧义）', () => {
    const form = buildFormSchema();
    const computed = formulaEngine.computeValues(form.fields, {
      f_name: '测试客户',
      f_price: 25,
      f_qty: 3,
    });
    // 模拟 DataEngine.insert 的 values→物理列映射
    const row: Record<string, unknown> = {};
    for (const field of form.fields) {
      row[field.binding.column] = computed[field.id];
    }
    expect(row.f_name).toBe('测试客户');
    expect(row.f_price).toBe(25);
    expect(row.f_qty).toBe(3);
    expect(row.f_amount).toBe(75);
    // runtime 渲染按同样的 id → column 映射读回，闭环一致
    const renderValues: Record<string, unknown> = {};
    for (const field of form.fields) {
      renderValues[field.id] = row[field.binding.column];
    }
    expect(renderValues).toEqual(computed);
  });

  it('④-b Schema 校验拦截必填缺失（权威校验在服务端）', () => {
    const form = buildFormSchema();
    const result = schemaEngine.validateRecord(form.fields, {
      f_price: 1,
      f_qty: 1,
    });
    expect(result.valid).toBe(false);
  });
});
