/**
 * Schema 渲染核心：按 FormSchema + 布局树渲染控件树。
 * 复用 shared 的 widget-registry 派生渲染模式，与 designer 同源（架构文档 7.9）。
 */
import { Box } from '@mui/material';
import type { FormSchema, LayoutNode } from '@hengyida/shared/types/form';
import type { FieldSchema } from '@hengyida/shared/types/field';
import { getWidget } from '@hengyida/shared/constants/widget-registry';
import { useAdapter } from '../adapters/AdapterContext';

interface Props {
  schema: FormSchema;
  renderField: (field: FieldSchema) => React.ReactNode;
}

/** 递归渲染布局树节点 */
function renderNode(node: LayoutNode, fields: Map<string, FieldSchema>, renderField: Props['renderField'], grid: number) {
  const field = fields.get(node.fieldId);
  if (!field) return null;
  let span = node.span;
  if (span === undefined) {
    try {
      const def = getWidget(field.widget);
      span = def.renderMode[`${grid === 24 ? 'pc' : 'h5'}` as 'pc' | 'h5'].span;
    } catch {
      span = 24;
    }
  }
  return (
    <Box key={node.fieldId} sx={{ gridColumn: `span ${span} / span ${span}` }}>
      {renderField(field)}
      {node.children?.map((child) => renderNode(child, fields, renderField, grid))}
    </Box>
  );
}

export function SchemaRenderer({ schema, renderField }: Props) {
  const adapter = useAdapter();
  const fields = new Map(schema.fields.map((f) => [f.id, f]));
  const layout = adapter.type === 'pc' ? schema.layout.pc : schema.layout.h5;

  // 无布局树时按字段顺序兜底渲染
  const nodes: LayoutNode[] = layout.length
    ? layout
    : schema.fields.map((f) => ({ fieldId: f.id, span: 24 }));

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${adapter.grid}, minmax(0, 1fr))`, gap: 2 }}>
      {nodes.map((node) => renderNode(node, fields, renderField, adapter.grid))}
    </Box>
  );
}
