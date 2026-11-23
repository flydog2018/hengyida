/**
 * 中：设计画布（原创「布置」区）。
 *
 * 交互纪律：
 * 1. 只有卡片左侧手柄响应拖拽排序，卡片正文点击用于选中，二者互不干扰；
 * 2. 控件库新品拖到画布空白处追加到末尾，拖到某卡片上插入到该位置；
 * 3. 撤销/重做既有按钮也有 Ctrl/Cmd+Z 快捷键，删除操作始终可恢复；
 * 4. PC/H5 切换只改变预览容器宽度与控件 span，不改变字段数据。
 */
import { useEffect } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Box, Button, Chip, IconButton, Tooltip, Typography } from '@mui/material';
import { getWidget, type FieldSchema } from '@hengyida/shared';
import {
  CANVAS_DROPPABLE_ID,
  CANVAS_DRAG_SOURCE,
  resolveDragEnd,
} from '../engine/DragDropController';
import { Glyph, ReverseRenderer } from '../engine/ReverseRenderer';
import { useDesignerStore, type PreviewMode } from '../store/designerStore';
import { PreviewSwitcher } from './PreviewSwitcher';

function SortableFieldCard({
  field,
  index,
  mode,
}: {
  field: FieldSchema;
  index: number;
  mode: PreviewMode;
}): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.id,
    data: { source: CANVAS_DRAG_SOURCE, fieldId: field.id },
  });
  const selected = useDesignerStore((state) => state.selectedFieldId === field.id);
  const selectField = useDesignerStore((state) => state.selectField);
  const removeField = useDesignerStore((state) => state.removeField);
  const def = getWidget(field.widget);

  return (
    <div
      ref={setNodeRef}
      onClick={() => selectField(field.id)}
      className={`cursor-pointer rounded-xl border bg-white p-3 transition ${
        selected ? 'border-brand ring-2 ring-brand/20' : 'border-slate-200 hover:border-brand/40'
      } ${isDragging ? 'z-20 shadow-lg' : ''}`}
      style={{
        gridColumn: 'span 24 / span 24',
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
      }}
    >
      <Box className="mb-2 flex items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...(listeners ?? {})}
          onClick={(event) => event.stopPropagation()}
          className="cursor-grab rounded-md p-1 text-slate-300 hover:bg-slate-100 hover:text-brand active:cursor-grabbing"
          title="按住拖动排序"
        >
          <Glyph name="drag" size={16} />
        </button>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
          {String(index + 1).padStart(2, '0')}
        </span>
        <Typography variant="body2" className="truncate font-semibold text-slate-800">
          {field.label}
        </Typography>
        <Chip size="small" variant="outlined" label={def.label} className="!h-5 !text-[10px]" />
        {field.formula && (
          <Chip size="small" label="公式" className="!h-5 !bg-brand-soft !text-[10px] !text-brand" />
        )}
        {field.relation && (
          <Chip size="small" label="关联" className="!h-5 !bg-brand-soft !text-[10px] !text-brand" />
        )}
        {field.children && (
          <Chip size="small" label="子表" className="!h-5 !bg-brand-soft !text-[10px] !text-brand" />
        )}
        <span className="ml-auto" />
        <Typography variant="caption" className="hidden truncate text-slate-300 sm:block">
          {field.id}
        </Typography>
        <Tooltip title="删除字段（可通过撤销恢复）">
          <span>
            <IconButton
              size="small"
              onClick={(event) => {
                event.stopPropagation();
                removeField(field.id);
              }}
              className="!text-slate-400 hover:!text-red-500"
            >
              <Glyph name="close" size={15} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      <Box className="px-1 pb-1 pt-0.5">
        <ReverseRenderer field={field} mode={mode} />
      </Box>
    </div>
  );
}

/** 必须渲染在 DndContext 内部，useDroppable 才能注册到上下文 */
function CanvasSurface({ fields, mode }: { fields: FieldSchema[]; mode: PreviewMode }): JSX.Element {
  const { setNodeRef, isOver } = useDroppable({ id: CANVAS_DROPPABLE_ID });

  return (
    <Box
      ref={setNodeRef}
      className={`min-h-0 flex-1 overflow-y-auto p-6 transition-colors ${isOver ? 'bg-brand-soft/50' : 'bg-slate-50'}`}
    >
      <div
        className={`mx-auto transition-all duration-300 ${
          mode === 'h5' ? 'max-w-[390px]' : 'max-w-4xl'
        }`}
      >
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <Box className="mb-5 flex items-center gap-2 border-b border-slate-100 pb-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
              <Glyph name="blocks" size={18} />
            </span>
            <Box>
              <Typography variant="subtitle1" className="font-semibold leading-tight text-slate-800">
                未命名表单
              </Typography>
              <Typography variant="caption" className="text-slate-400">
                恒易搭 · 所见即所得的搭建画布
              </Typography>
            </Box>
          </Box>

          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}
          >
            {fields.length === 0 ? (
              <div
                className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-6 py-14 text-center"
                style={{ gridColumn: 'span 24 / span 24' }}
              >
                <Glyph name="plus" size={28} className="text-brand/60" />
                <Typography variant="body2" className="font-medium text-slate-600">
                  画布还是空的
                </Typography>
                <Typography variant="caption" className="text-slate-400">
                  从左侧「选材」拖入控件，或直接点击控件快速添加
                </Typography>
              </div>
            ) : (
              fields.map((field, index) => (
                <SortableFieldCard key={field.id} field={field} index={index} mode={mode} />
              ))
            )}
          </div>
        </div>
      </div>
    </Box>
  );
}

export function DesignCanvas(): JSX.Element {
  const fields = useDesignerStore((state) => state.fields);
  const previewMode = useDesignerStore((state) => state.previewMode);
  const setPreviewMode = useDesignerStore((state) => state.setPreviewMode);
  const addField = useDesignerStore((state) => state.addField);
  const reorderField = useDesignerStore((state) => state.reorderField);
  const undo = useDesignerStore((state) => state.undo);
  const redo = useDesignerStore((state) => state.redo);

  const sensors = useSensors(
    // 6px 激活阈值：点击选中与拖拽排序可以稳定区分
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent): void => {
    resolveDragEnd(event, fields, {
      addField: (widget, index) => {
        addField(widget, index);
      },
      reorderField,
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return;
      const key = event.key.toLowerCase();
      if (key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (key === 'y') {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  return (
    <Box className="flex h-full min-w-0 flex-col">
      <Box className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <Box>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand text-xs font-semibold text-white">
              2
            </span>
            <Typography variant="subtitle2" className="font-semibold text-slate-800">
              布置画布
            </Typography>
          </div>
          <Typography variant="caption" className="text-slate-400">
            拖动手柄排序 · 点击卡片设定属性 · 共 {fields.length} 个字段
          </Typography>
        </Box>
        <Box className="flex items-center gap-2">
          <Tooltip title="撤销 (Ctrl/⌘ + Z)">
            <Button
              size="small"
              variant="outlined"
              onClick={undo}
              startIcon={<Glyph name="undo" size={14} />}
              className="!border-slate-200 !text-slate-600"
            >
              撤销
            </Button>
          </Tooltip>
          <Tooltip title="重做 (Ctrl/⌘ + Shift + Z)">
            <Button
              size="small"
              variant="outlined"
              onClick={redo}
              startIcon={<Glyph name="redo" size={14} />}
              className="!border-slate-200 !text-slate-600"
            >
              重做
            </Button>
          </Tooltip>
          <PreviewSwitcher mode={previewMode} onChange={setPreviewMode} />
        </Box>
      </Box>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={fields.map((field) => field.id)} strategy={verticalListSortingStrategy}>
          <CanvasSurface fields={fields} mode={previewMode} />
        </SortableContext>
      </DndContext>
    </Box>
  );
}
