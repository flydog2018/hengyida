/**
 * 配置编译器：设计态字段数组 → 运行时可消费的 FormSchema。
 *
 * 编译纪律：
 * 1. binding.column 始终由稳定 id 派生，重命名标签不产生数据迁移；
 * 2. layout.pc/h5 由控件注册表的 renderMode + 字段 adapters 共同决定 span；
 * 3. listView 默认排除 json 类型字段（子表/附件不进入列表列），数据而非控件清单驱动；
 * 4. 输出对象全部为浅拷贝后的新结构，不修改 store 中的设计态对象。
 */
import {
  CURRENT_SCHEMA_VERSION,
  getWidget,
  type FieldSchema,
  type FormSchema,
  type LayoutNode,
} from '@hengyida/shared';

/** PC/H5 预览模式，与 store 的 PreviewMode 保持一致（此处仅用字面量避免循环引用） */
export type LayoutMode = 'pc' | 'h5';

export interface CompileInput {
  formId: string;
  fields: FieldSchema[];
}

/**
 * 读取字段在某端的栅格跨度：字段级 adapters 优先，其次注册表默认策略。
 * ReverseRenderer 与本编译器共用该策略，确保「画布所见 = 发布所得」。
 */
export function getFieldSpan(field: FieldSchema, mode: LayoutMode): number {
  const override = field.adapters?.[mode]?.span;
  return typeof override === 'number' && override > 0
    ? override
    : getWidget(field.widget).renderMode[mode].span;
}

/** 递归规范化字段：物理列由 id 派生，属性表做浅拷贝 */
function normalizeField(field: FieldSchema): FieldSchema {
  return {
    ...field,
    binding: { ...field.binding, column: field.id },
    props: { ...field.props },
    children: field.children?.map(normalizeField),
  };
}

/**
 * 编译表单配置。
 */
export function compileFormSchema(input: CompileInput): FormSchema {
  const fields = input.fields.map(normalizeField);

  const buildLayout = (mode: LayoutMode): LayoutNode[] =>
    fields.map((field) => ({ fieldId: field.id, span: getFieldSpan(field, mode) }));

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    kind: 'form',
    id: input.formId,
    fields,
    layout: { pc: buildLayout('pc'), h5: buildLayout('h5') },
    listView: {
      // json 类型（子表/附件）不适合作为列表列，由注册表的数据类型推导
      columns: fields
        .filter((field) => field.binding.dataType !== 'json')
        .map((field) => field.id),
      filters: [],
      sort: [],
      pageSize: 20,
    },
  };
}
