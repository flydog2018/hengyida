/**
 * 拖拽编排控制器 —— 纯逻辑层，不依赖 React 组件。
 *
 * 原创交互要点：
 * 1. 控件库支持「拖入」与「点击即放」双通道，点击通道降低新手操作门槛；
 * 2. 画布内排序只有拖拽手柄响应拖拽，卡片正文点击用于选中，避免误拖；
 * 3. 拖放目标位置解析统一在此完成，UI 组件只负责提供 DndContext 事件。
 *
 * 控件默认属性、绑定类型、可配置键一律来自共享 widget-registry，本文件不维护控件清单。
 */
import type { DragEndEvent } from '@dnd-kit/core';
import {
  getWidget,
  type FieldAdapters,
  type FieldSchema,
  type WidgetType,
} from '@hengyida/shared';

/** 画布根 Droppable 的固定 id：拖到空白处时追加到末尾 */
export const CANVAS_DROPPABLE_ID = 'design-canvas-root';

/** 拖拽来源标识（区分「控件库新品」与「画布内排序」） */
export const PALETTE_DRAG_SOURCE = 'palette';
export const CANVAS_DRAG_SOURCE = 'canvas';

/** 控件库拖拽携带的数据 */
export interface PaletteDragData {
  source: typeof PALETTE_DRAG_SOURCE;
  widget: WidgetType;
}

/** 画布内排序拖拽携带的数据 */
export interface CanvasDragData {
  source: typeof CANVAS_DRAG_SOURCE;
  fieldId: string;
}

/** 类型守卫：判断拖拽源是否为控件库 */
export function isPaletteDrag(data: unknown): data is PaletteDragData {
  if (!data || typeof data !== 'object') return false;
  const candidate = data as { source?: unknown; widget?: unknown };
  return candidate.source === PALETTE_DRAG_SOURCE && typeof candidate.widget === 'string';
}

/** 类型守卫：判断拖拽源是否为画布字段 */
export function isCanvasDrag(data: unknown): data is CanvasDragData {
  if (!data || typeof data !== 'object') return false;
  const candidate = data as { source?: unknown; fieldId?: unknown };
  return candidate.source === CANVAS_DRAG_SOURCE && typeof candidate.fieldId === 'string';
}

/**
 * 由控件类型创建设计态字段。
 * @param widget 注册表登记的控件类型
 * @param id 已生成的稳定字段 id
 * @param formId 所属表单 id，用于推导子表物理表名
 */
export function createFieldFromWidget(
  widget: WidgetType,
  id: string,
  formId: string,
): FieldSchema {
  // 未注册类型直接抛错，禁止静默降级为文本字段
  const def = getWidget(widget);
  const adapters: FieldAdapters = {
    pc: { span: def.renderMode.pc.span },
    h5: {
      span: def.renderMode.h5.span,
      ...(def.renderMode.h5.fullWidthOnH5 ? { fullWidth: true } : {}),
    },
  };

  const field: FieldSchema = {
    id,
    widget,
    label: def.label,
    // 物理列由稳定 id 派生：改标题不会影响已存数据（架构文档 7.1）
    binding: { column: id, dataType: def.dataType },
    props: { ...def.defaultProps },
    required: false,
    defaultValue: null,
    validations: [],
    adapters,
  };

  // 能力派生：根据注册表的声明决定初始化哪些扩展结构，避免硬编码控件清单
  if (def.container) {
    field.children = [];
    field.props.table = `t_form_${formId}_${id}`;
  }
  if (def.configurableProps.includes('expr')) {
    field.formula = { expr: '', deps: [], precision: 2 };
  }
  if (def.configurableProps.includes('targetFormId')) {
    field.relation = {
      targetFormId: '',
      labelFieldId: '',
      foreignKeyColumn: `${id}_target`,
    };
  }
  return field;
}

/**
 * 解析放置位置：落在某字段上则插入到该字段位置，落在画布空白/根区域则追加末尾。
 */
export function resolveDropIndex(fields: FieldSchema[], overId: string): number {
  if (overId === CANVAS_DROPPABLE_ID) return fields.length;
  const index = fields.findIndex((field) => field.id === overId);
  return index >= 0 ? index : fields.length;
}

/** 拖拽结束后需要执行的动作，由 store 注入 */
export interface DragActions {
  addField: (widget: WidgetType, index: number) => void;
  reorderField: (from: number, to: number) => void;
}

/**
 * 将一次拖拽结束事件翻译为状态动作。
 * 未知来源或无有效目标时保持静默，不产生副作用。
 */
export function resolveDragEnd(
  event: DragEndEvent,
  fields: FieldSchema[],
  actions: DragActions,
): void {
  const overId = event.over ? String(event.over.id) : '';
  if (!overId) return;

  if (isPaletteDrag(event.active.data.current)) {
    actions.addField(event.active.data.current.widget, resolveDropIndex(fields, overId));
    return;
  }

  if (isCanvasDrag(event.active.data.current)) {
    const from = fields.findIndex((field) => field.id === event.active.data.current?.fieldId);
    const to = resolveDropIndex(fields, overId);
    if (from >= 0 && to >= 0 && from !== to) actions.reorderField(from, to);
  }
}
