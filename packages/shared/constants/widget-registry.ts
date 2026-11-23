/**
 * 【关键】控件定义注册表 —— designer / runtime 共享的反向渲染契约（架构文档 2.1 / 7.9）。
 *
 * designer 的属性面板、runtime 的渲染控件都从这一份注册表派生：
 * 新增控件必须在此登记，两端自动获得一致渲染，禁止 designer/runtime 相互 import。
 *
 * 一期高频控件（波次1）：text / number / date / select / attachment / subtable / relation / formula。
 * 插件化扩展（Phase4）将把本注册表升级为可注册协议，但读取接口保持不变。
 */
import type { WidgetType, FieldBinding } from '../types/field';

/** 渲染模式：PC/H5 各自布局策略 */
export interface RenderMode {
  /** 24 栅格默认跨度 */
  span: number;
  /** H5 是否独占一行 */
  fullWidthOnH5?: boolean;
}

/** 控件定义 */
export interface WidgetDefinition {
  type: WidgetType;
  /** 展示名称（控件库面板） */
  label: string;
  /** 图标 key（原创视觉，映射到图标组件，不含外部产品专有图标） */
  icon: string;
  /** 默认属性，designer 拖入即用 */
  defaultProps: Record<string, unknown>;
  /** 默认绑定数据类型 */
  dataType: FieldBinding['dataType'];
  /** 是否允许作为子表/关联表的容器 */
  container?: boolean;
  /** 多端渲染策略 */
  renderMode: { pc: RenderMode; h5: RenderMode };
  /** 属性面板需要展示的可配置属性键（designer PropertyPanel 消费） */
  configurableProps: string[];
}

/** 注册表：type → 定义。用 Map 保证插入顺序稳定（控件库展示顺序） */
const registry = new Map<WidgetType, WidgetDefinition>();

function define(def: WidgetDefinition): void {
  if (registry.has(def.type)) {
    throw new Error(`[widget-registry] 重复注册控件类型: ${def.type}`);
  }
  registry.set(def.type, def);
}

// ===== 一期高频控件注册 =====
define({
  type: 'text',
  label: '单行文本',
  icon: 'text-field',
  defaultProps: { placeholder: '请输入', maxLength: 50 },
  dataType: 'varchar',
  renderMode: { pc: { span: 12 }, h5: { span: 24, fullWidthOnH5: true } },
  configurableProps: ['placeholder', 'maxLength', 'defaultValue'],
});
define({
  type: 'number',
  label: '数字',
  icon: 'number-field',
  defaultProps: { min: null, max: null, precision: 0 },
  dataType: 'decimal',
  renderMode: { pc: { span: 12 }, h5: { span: 24, fullWidthOnH5: true } },
  configurableProps: ['min', 'max', 'precision', 'defaultValue'],
});
define({
  type: 'date',
  label: '日期',
  icon: 'date-field',
  defaultProps: { format: 'YYYY-MM-DD' },
  dataType: 'date',
  renderMode: { pc: { span: 12 }, h5: { span: 24, fullWidthOnH5: true } },
  configurableProps: ['format', 'defaultValue'],
});
define({
  type: 'select',
  label: '下拉选择',
  icon: 'select-field',
  defaultProps: { options: [], multiple: false },
  dataType: 'varchar',
  renderMode: { pc: { span: 12 }, h5: { span: 24, fullWidthOnH5: true } },
  configurableProps: ['options', 'multiple', 'defaultValue'],
});
define({
  type: 'attachment',
  label: '附件',
  icon: 'attachment',
  defaultProps: { maxCount: 5, accept: '*' },
  dataType: 'json',
  renderMode: { pc: { span: 24 }, h5: { span: 24, fullWidthOnH5: true } },
  configurableProps: ['maxCount', 'accept'],
});
define({
  type: 'subtable',
  label: '子表（一对多）',
  icon: 'subtable',
  defaultProps: {},
  dataType: 'json',
  container: true,
  renderMode: { pc: { span: 24 }, h5: { span: 24, fullWidthOnH5: true } },
  configurableProps: ['children'],
});
define({
  type: 'relation',
  label: '关联表（多对一）',
  icon: 'relation',
  defaultProps: {},
  dataType: 'varchar',
  renderMode: { pc: { span: 12 }, h5: { span: 24, fullWidthOnH5: true } },
  configurableProps: ['targetFormId', 'labelFieldId', 'foreignKeyColumn'],
});
define({
  type: 'formula',
  label: '公式字段',
  icon: 'formula',
  defaultProps: { expr: '', precision: 2 },
  dataType: 'decimal',
  renderMode: { pc: { span: 12 }, h5: { span: 24, fullWidthOnH5: true } },
  configurableProps: ['expr', 'deps', 'precision'],
});

/** 获取控件定义；未知类型抛出明确错误 */
export function getWidget(type: WidgetType): WidgetDefinition {
  const def = registry.get(type);
  if (!def) throw new Error(`[widget-registry] 未注册的控件类型: ${type}`);
  return def;
}

/** 判断控件类型是否已注册 */
export function hasWidget(type: WidgetType): boolean {
  return registry.has(type);
}

/** 列出全部控件定义（designer 控件库面板 / runtime 预加载消费） */
export function listWidgets(): WidgetDefinition[] {
  return Array.from(registry.values());
}

/** 运行时新增/替换控件定义（供 Phase4 插件化扩展预留，一期不开放给业务代码） */
export function registerWidget(def: WidgetDefinition): void {
  registry.set(def.type, def);
}
