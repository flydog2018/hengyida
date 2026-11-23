/**
 * 左：控件库面板（原创「选材」区）。
 *
 * 分组、默认属性、可配置项数量全部由 listWidgets() 返回的注册表元数据派生，
 * 不在本组件维护控件清单。每个控件同时支持拖入画布与点击即放两条通道。
 */
import { useMemo, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { Box, Chip, TextField, Tooltip, Typography } from '@mui/material';
import { listWidgets, type WidgetDefinition, type WidgetType } from '@hengyida/shared';
import { PALETTE_DRAG_SOURCE } from '../engine/DragDropController';
import { Glyph } from '../engine/ReverseRenderer';
import { useDesignerStore } from '../store/designerStore';

interface WidgetGroup {
  key: string;
  title: string;
  items: WidgetDefinition[];
}

/**
 * 依据注册表声明派生分组：
 * container → 容器字段；声明 expr/targetFormId 配置键 → 计算与关联；其余 → 基础字段。
 * 分组依据来自元数据，新增控件无需修改本组件。
 */
function deriveGroups(definitions: WidgetDefinition[]): WidgetGroup[] {
  const groups: WidgetGroup[] = [
    { key: 'basic', title: '基础字段', items: [] },
    { key: 'compute', title: '计算与关联', items: [] },
    { key: 'container', title: '容器字段', items: [] },
  ];
  for (const def of definitions) {
    if (def.container) {
      groups[2].items.push(def);
    } else if (
      def.configurableProps.includes('expr') ||
      def.configurableProps.includes('targetFormId')
    ) {
      groups[1].items.push(def);
    } else {
      groups[0].items.push(def);
    }
  }
  return groups.filter((group) => group.items.length > 0);
}

function PaletteItem({
  def,
  onPick,
}: {
  def: WidgetDefinition;
  onPick: (widget: WidgetType) => void;
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette:${def.type}`,
    data: { source: PALETTE_DRAG_SOURCE, widget: def.type },
  });

  return (
    <Tooltip title="拖入画布指定位置，或点击直接追加到末尾" placement="right">
      <button
        ref={setNodeRef}
        type="button"
        onClick={() => onPick(def.type)}
        className={`group flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition hover:border-brand/40 hover:bg-brand-soft/60 hover:shadow-sm ${isDragging ? 'opacity-40' : ''}`}
        style={
          transform
            ? {
                transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
                zIndex: 30,
              }
            : undefined
        }
        {...attributes}
        {...(listeners ?? {})}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
          <Glyph name={def.icon} size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-700">{def.label}</span>
          <span className="block truncate text-[11px] text-slate-400">
            {def.configurableProps.length} 项可配置 · {def.dataType}
          </span>
        </span>
        <Chip size="small" variant="outlined" label="拖" className="!h-5 !text-[10px]" />
      </button>
    </Tooltip>
  );
}

export function WidgetPalette(): JSX.Element {
  const [query, setQuery] = useState('');
  const addField = useDesignerStore((state) => state.addField);

  const groups = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const matched = listWidgets().filter(
      (def) =>
        def.label.toLowerCase().includes(keyword) ||
        def.type.toLowerCase().includes(keyword) ||
        def.icon.toLowerCase().includes(keyword),
    );
    return deriveGroups(matched);
  }, [query]);

  return (
    <Box className="flex h-full flex-col">
      <Box className="border-b border-slate-100 px-4 py-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand text-xs font-semibold text-white">
            1
          </span>
          <Typography variant="subtitle2" className="font-semibold text-slate-800">
            选材
          </Typography>
        </div>
        <Typography variant="caption" className="mb-3 block text-slate-400">
          从下方选取控件，拖入画布或点击直接添加
        </Typography>
        <TextField
          fullWidth
          size="small"
          placeholder="搜索控件"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          InputProps={{ startAdornment: <Glyph name="search" size={15} /> }}
        />
      </Box>

      <Box className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {groups.length === 0 && (
          <Typography variant="caption" className="block py-8 text-center text-slate-400">
            没有匹配的控件
          </Typography>
        )}
        {groups.map((group) => (
          <Box key={group.key}>
            <Typography
              variant="caption"
              className="mb-2 block font-semibold uppercase tracking-wider text-slate-400"
            >
              {group.title} · {group.items.length}
            </Typography>
            <div className="space-y-2">
              {group.items.map((def) => (
                <PaletteItem key={def.type} def={def} onPick={(widget) => addField(widget)} />
              ))}
            </div>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
