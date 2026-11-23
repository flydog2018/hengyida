/**
 * 设计器状态树（Zustand）。
 * 只持有设计态：字段数组、选中项、预览端。编译/校验在引擎层完成，store 不感知后端。
 * 撤销/重做采用快照历史栈（最多 50 步），快照保存字段数组与选中项引用；
 * 所有变更均以不可变方式生成新数组，因此快照不会被后续修改污染。
 */
import { create } from 'zustand';
import { getWidget, type FieldSchema, type WidgetType } from '@hengyida/shared';
import { createFieldFromWidget } from '../engine/DragDropController';
import { genFieldId, genFormId } from '../utils/id';

/** 预览端：pc = 24 栅格；h5 = 单列触控 */
export type PreviewMode = 'pc' | 'h5';

const HISTORY_LIMIT = 50;

interface Snapshot {
  fields: FieldSchema[];
  selectedFieldId: string | null;
}

export interface DesignerState {
  appId: string;
  formId: string;
  fields: FieldSchema[];
  selectedFieldId: string | null;
  previewMode: PreviewMode;
  past: Snapshot[];
  future: Snapshot[];

  addField: (widget: WidgetType, index?: number) => string;
  updateField: (id: string, patch: Partial<FieldSchema>) => void;
  removeField: (id: string) => void;
  reorderField: (from: number, to: number) => void;
  selectField: (id: string | null) => void;
  setPreviewMode: (mode: PreviewMode) => void;
  undo: () => void;
  redo: () => void;
}

/** 取当前快照 */
function takeSnapshot(state: Snapshot): Snapshot {
  return { fields: state.fields, selectedFieldId: state.selectedFieldId };
}

/** 生成一次带历史的变更结果 */
function commit(
  state: DesignerState,
  fields: FieldSchema[],
  selectedFieldId: string | null = state.selectedFieldId,
): Partial<DesignerState> {
  return {
    fields,
    selectedFieldId,
    past: [...state.past, takeSnapshot(state)].slice(-HISTORY_LIMIT),
    future: [],
  };
}

/** 对顶层字段或子表内字段打补丁（支持两层嵌套编辑） */
function patchField(field: FieldSchema, id: string, patch: Partial<FieldSchema>): FieldSchema {
  if (field.id === id) {
    const merged: FieldSchema = { ...field, ...patch };
    if (patch.props) merged.props = { ...field.props, ...patch.props };
    return merged;
  }
  if (field.children?.some((child) => child.id === id)) {
    return {
      ...field,
      children: field.children.map((child) => patchField(child, id, patch)),
    };
  }
  return field;
}

/** 递归删除字段（含子表内字段） */
function removeById(fields: FieldSchema[], id: string): FieldSchema[] {
  return fields
    .filter((field) => field.id !== id)
    .map((field) =>
      field.children ? { ...field, children: removeById(field.children, id) } : field,
    );
}

export const useDesignerStore = create<DesignerState>()((set, get) => ({
  appId: 'app_demo',
  formId: genFormId(),
  fields: [],
  selectedFieldId: null,
  previewMode: 'pc',
  past: [],
  future: [],

  addField: (widget, index) => {
    const state = get();
    // 未知控件类型由 getWidget 抛错，避免产生无效 Schema
    getWidget(widget);
    const id = genFieldId();
    const field = createFieldFromWidget(widget, id, state.formId);
    const fields = [...state.fields];
    const target = typeof index === 'number' && Number.isFinite(index)
      ? Math.max(0, Math.min(Math.floor(index), fields.length))
      : fields.length;
    fields.splice(target, 0, field);
    set(commit(state, fields, id));
    return id;
  },

  updateField: (id, patch) =>
    set((state) => commit(state, state.fields.map((field) => patchField(field, id, patch)))),

  removeField: (id) =>
    set((state) => {
      const fields = removeById(state.fields, id);
      const selectedFieldId = state.selectedFieldId === id ? null : state.selectedFieldId;
      return commit(state, fields, selectedFieldId);
    }),

  reorderField: (from, to) =>
    set((state) => {
      if (from < 0 || from >= state.fields.length || to < 0 || to >= state.fields.length || from === to) {
        return {};
      }
      const fields = [...state.fields];
      const [moved] = fields.splice(from, 1);
      if (!moved) return {};
      fields.splice(to, 0, moved);
      return commit(state, fields, moved.id);
    }),

  selectField: (id) => set({ selectedFieldId: id }),

  setPreviewMode: (mode) => set({ previewMode: mode }),

  undo: () =>
    set((state) => {
      const previous = state.past[state.past.length - 1];
      if (!previous) return {};
      return {
        fields: previous.fields,
        selectedFieldId: previous.selectedFieldId,
        past: state.past.slice(0, -1),
        future: [takeSnapshot(state), ...state.future].slice(0, HISTORY_LIMIT),
      };
    }),

  redo: () =>
    set((state) => {
      const next = state.future[0];
      if (!next) return {};
      return {
        fields: next.fields,
        selectedFieldId: next.selectedFieldId,
        past: [...state.past, takeSnapshot(state)].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
      };
    }),
}));
