/**
 * 右：属性面板（原创「设定」区）。
 *
 * 可编辑项完全由 getWidget(widget).configurableProps 派生：
 * 注册表新增属性键后，这里自动出现通用编辑器；公式/子表/关联/校验/显示条件
 * 使用专用编辑器，并配即时预览与友好错误提示，减少弹窗嵌套。
 */
import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControlLabel,
  MenuItem,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  evaluateFormula,
  evaluateVisibility,
  getWidget,
  listWidgets,
  type FieldSchema,
  type ValidationRule,
  type WidgetType,
} from '@hengyida/shared';
import { createFieldFromWidget } from '../engine/DragDropController';
import { Glyph } from '../engine/ReverseRenderer';
import { useDesignerStore } from '../store/designerStore';
import { genFieldId } from '../utils/id';

type PatchAction = (patch: Partial<FieldSchema>) => void;
type PropsChange = (key: string, value: unknown) => void;

/** 这些键由专用编辑器处理，不进入通用属性循环 */
const SPECIAL_PROP_KEYS = new Set([
  'defaultValue',
  'expr',
  'deps',
  'precision',
  'children',
  'targetFormId',
  'labelFieldId',
  'foreignKeyColumn',
]);

/** 属性键的中文标签（不含控件清单） */
const PROP_LABELS: Record<string, string> = {
  placeholder: '占位提示',
  maxLength: '最大长度',
  min: '最小值',
  max: '最大值',
  precision: '小数位',
  format: '日期格式',
  options: '选项',
  multiple: '允许多选',
  maxCount: '最多文件数',
  accept: '接受的文件类型',
};

const NUMERIC_KEYS = new Set(['maxLength', 'min', 'max', 'precision', 'maxCount']);
const RULE_OPTIONS: ValidationRule['rule'][] = ['required', 'min', 'max', 'regex', 'email', 'custom'];

/** 去掉公式引擎错误前缀，给用户看友好文案 */
function friendlyError(error: unknown): string {
  return (error as Error).message.replace(/^\[formula\]\s*/, '');
}

function SectionTitle({ title, caption }: { title: string; caption?: string }): JSX.Element {
  return (
    <Box className="mb-3">
      <Typography variant="subtitle2" className="font-semibold text-slate-800">
        {title}
      </Typography>
      {caption && (
        <Typography variant="caption" className="text-slate-400">
          {caption}
        </Typography>
      )}
    </Box>
  );
}

function BasicSection({ field, onPatch }: { field: FieldSchema; onPatch: PatchAction }): JSX.Element {
  const def = getWidget(field.widget);
  return (
    <Box className="space-y-3">
      <SectionTitle title="基础信息" caption={`${def.label} · ${field.id}`} />
      <TextField
        fullWidth
        size="small"
        label="字段标题"
        value={field.label}
        onChange={(event) => onPatch({ label: event.target.value })}
      />
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={Boolean(field.required)}
            onChange={(event) => onPatch({ required: event.target.checked })}
          />
        }
        label={<Typography variant="body2" className="text-slate-600">必填字段</Typography>}
      />
      {def.configurableProps.includes('defaultValue') && (
        <TextField
          fullWidth
          size="small"
          label="默认值"
          value={field.defaultValue == null ? '' : String(field.defaultValue)}
          onChange={(event) => onPatch({ defaultValue: event.target.value })}
        />
      )}
    </Box>
  );
}

function OptionsEditor({ field, onPropsChange }: { field: FieldSchema; onPropsChange: PropsChange }): JSX.Element {
  const raw = field.props.options;
  const text = Array.isArray(raw)
    ? raw
        .map((item) =>
          item && typeof item === 'object'
            ? String((item as { label?: unknown }).label ?? '')
            : String(item),
        )
        .join('\n')
    : '';
  return (
    <TextField
      fullWidth
      size="small"
      multiline
      minRows={3}
      label="选项（每行一个）"
      value={text}
      onChange={(event) => {
        const labels = event.target.value
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean);
        onPropsChange('options', labels.map((label) => ({ label, value: label })));
      }}
    />
  );
}

/** 注册表里声明的普通属性：按值类型自动选择编辑器 */
function DynamicProps({ field, onPropsChange }: { field: FieldSchema; onPropsChange: PropsChange }): JSX.Element | null {
  const def = getWidget(field.widget);
  const keys = def.configurableProps.filter(
    (key) => !SPECIAL_PROP_KEYS.has(key) && !(key === 'precision' && field.formula),
  );
  if (keys.length === 0) return null;

  return (
    <>
      <Divider className="!my-5" />
      <SectionTitle title="控件属性" caption="可配置项由控件注册表派生" />
      <Box className="space-y-3">
        {keys.map((key) => {
          const value = field.props[key];
          if (key === 'options') {
            return <OptionsEditor key={key} field={field} onPropsChange={onPropsChange} />;
          }
          if (typeof value === 'boolean') {
            return (
              <FormControlLabel
                key={key}
                control={
                  <Switch
                    size="small"
                    checked={value}
                    onChange={(event) => onPropsChange(key, event.target.checked)}
                  />
                }
                label={<Typography variant="body2" className="text-slate-600">{PROP_LABELS[key] ?? key}</Typography>}
              />
            );
          }
          if (NUMERIC_KEYS.has(key)) {
            return (
              <TextField
                key={key}
                fullWidth
                size="small"
                type="number"
                label={PROP_LABELS[key] ?? key}
                value={value == null ? '' : String(value)}
                onChange={(event) =>
                  onPropsChange(key, event.target.value === '' ? null : Number(event.target.value))
                }
              />
            );
          }
          return (
            <TextField
              key={key}
              fullWidth
              size="small"
              label={PROP_LABELS[key] ?? key}
              value={value == null ? '' : String(value)}
              onChange={(event) => onPropsChange(key, event.target.value)}
            />
          );
        })}
      </Box>
    </>
  );
}

function FormulaSection({
  field,
  onPatch,
  sample,
  onSampleChange,
}: {
  field: FieldSchema;
  onPatch: PatchAction;
  sample: number;
  onSampleChange: (value: number) => void;
}): JSX.Element | null {
  const formula = field.formula ?? { expr: '', deps: [], precision: 2 };
  const values = useMemo(() => {
    const context: Record<string, unknown> = {};
    formula.deps.forEach((dep) => {
      context[dep] = sample;
    });
    return context;
  }, [formula.deps, sample]);

  if (!field.formula) return null;

  const patchFormula = (patch: Partial<NonNullable<FieldSchema['formula']>>): void => {
    onPatch({ formula: { ...formula, ...patch } });
  };

  // 即时预览：示例值仅用于交互反馈，落库计算始终由服务端完成
  let preview = '填写表达式后即时预览计算结果';
  let tone: 'info' | 'success' | 'warning' = 'info';
  if (formula.expr.trim()) {
    try {
      const result = evaluateFormula(formula.expr, values, formula.precision ?? 2);
      preview = `示例值 ${sample} → 结果 ${result}`;
      tone = 'success';
    } catch (error) {
      preview = `公式暂不可用：${friendlyError(error)}`;
      tone = 'warning';
    }
  }

  return (
    <>
      <Divider className="!my-5" />
      <SectionTitle title="公式配置" caption="一期支持四则运算与字段引用（+ - * / %）" />
      <Box className="space-y-3">
        <TextField
          fullWidth
          size="small"
          multiline
          minRows={2}
          label="表达式"
          placeholder="例如 f_price * f_qty"
          value={formula.expr}
          onChange={(event) => patchFormula({ expr: event.target.value })}
        />
        <TextField
          fullWidth
          size="small"
          label="依赖字段 ID（逗号分隔）"
          placeholder="f_price, f_qty"
          value={formula.deps.join(', ')}
          onChange={(event) =>
            patchFormula({
              deps: event.target.value.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean),
            })
          }
        />
        <Box className="flex items-end gap-3">
          <TextField
            fullWidth
            size="small"
            type="number"
            label="小数位"
            value={formula.precision ?? 2}
            onChange={(event) => patchFormula({ precision: Number(event.target.value) || 0 })}
          />
          <TextField
            fullWidth
            size="small"
            type="number"
            label="示例值"
            value={sample}
            onChange={(event) => onSampleChange(Number(event.target.value) || 0)}
          />
        </Box>
        <Button
          size="small"
          variant="outlined"
          onClick={() => {
            const detected = formula.expr.match(/\bf_[A-Za-z0-9]+\b/g) ?? [];
            patchFormula({ deps: Array.from(new Set(detected)) });
          }}
          className="!border-brand/40 !text-brand"
        >
          从表达式提取依赖字段
        </Button>
        <Alert severity={tone}>{preview}</Alert>
      </Box>
    </>
  );
}

function VisibilitySection({
  field,
  fields,
  onPatch,
  sample,
}: {
  field: FieldSchema;
  fields: FieldSchema[];
  onPatch: PatchAction;
  sample: number;
}): JSX.Element {
  const condition = field.visibleWhen ?? { expr: '', deps: [] };
  const values = useMemo(() => {
    const context: Record<string, unknown> = {};
    const ids = condition.deps.length ? condition.deps : fields.map((item) => item.id);
    ids.forEach((id) => {
      context[id] = sample;
    });
    return context;
  }, [condition.deps, fields, sample]);

  let preview = '设置条件后即时预览显隐结果';
  let tone: 'info' | 'success' | 'warning' = 'info';
  if (condition.expr.trim()) {
    try {
      const visible = evaluateVisibility(condition.expr, values);
      preview = visible ? '示例值下：字段显示' : '示例值下：字段隐藏';
      tone = 'success';
    } catch (error) {
      preview = `条件暂不可用：${friendlyError(error)}`;
      tone = 'warning';
    }
  }

  return (
    <>
      <Divider className="!my-5" />
      <SectionTitle title="显示条件" caption="依赖其他字段值动态显隐" />
      <Box className="space-y-3">
        <TextField
          fullWidth
          size="small"
          multiline
          minRows={2}
          label="条件表达式"
          placeholder="例如 f_status == '在职'"
          value={condition.expr}
          onChange={(event) =>
            onPatch({
              visibleWhen: {
                expr: event.target.value,
                deps: condition.deps,
              },
            })
          }
        />
        <TextField
          fullWidth
          size="small"
          label="依赖字段 ID（逗号分隔）"
          value={condition.deps.join(', ')}
          onChange={(event) =>
            onPatch({
              visibleWhen: {
                expr: condition.expr,
                deps: event.target.value.split(/[,，\s]+/).map((s) => s.trim()).filter(Boolean),
              },
            })
          }
        />
        <Alert severity={tone}>{preview}</Alert>
      </Box>
    </>
  );
}

function ValidationSection({ field, onPatch }: { field: FieldSchema; onPatch: PatchAction }): JSX.Element {
  const rules = field.validations ?? [];
  const patchRule = (index: number, patch: Partial<ValidationRule>): void => {
    onPatch({ validations: rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)) });
  };

  return (
    <>
      <Divider className="!my-5" />
      <SectionTitle title="校验规则" caption="运行时生效，服务端仍会权威校验" />
      <Box className="space-y-3">
        {rules.map((rule, index) => (
          <Box key={index} className="rounded-lg border border-slate-200 p-3">
            <Box className="mb-2 flex items-center justify-between">
              <Typography variant="caption" className="font-medium text-slate-500">
                规则 {index + 1}
              </Typography>
              <Button
                size="small"
                color="error"
                onClick={() => onPatch({ validations: rules.filter((_, i) => i !== index) })}
              >
                移除
              </Button>
            </Box>
            <TextField
              fullWidth
              size="small"
              select
              label="规则类型"
              value={rule.rule}
              onChange={(event) =>
                patchRule(index, { rule: event.target.value as ValidationRule['rule'] })
              }
            >
              {RULE_OPTIONS.map((option) => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              fullWidth
              size="small"
              className="!mt-2"
              label="规则值"
              value={rule.value == null ? '' : String(rule.value)}
              onChange={(event) => patchRule(index, { value: event.target.value })}
            />
            <TextField
              fullWidth
              size="small"
              className="!mt-2"
              label="错误提示"
              value={rule.message}
              onChange={(event) => patchRule(index, { message: event.target.value })}
            />
          </Box>
        ))}
        <Button
          fullWidth
          size="small"
          variant="outlined"
          startIcon={<Glyph name="plus" size={14} />}
          onClick={() =>
            onPatch({
              validations: [...rules, { rule: 'min', value: 0, message: '请输入校验提示' }],
            })
          }
          className="!border-dashed !border-brand/40 !text-brand"
        >
          添加校验规则
        </Button>
      </Box>
    </>
  );
}

function SubtableSection({
  field,
  formId,
  onPatch,
}: {
  field: FieldSchema;
  formId: string;
  onPatch: PatchAction;
}): JSX.Element {
  const children = field.children ?? [];
  // 子表内的列不允许再放容器控件，避免无限嵌套；候选项来自注册表 container 声明
  const candidates = useMemo(() => listWidgets().filter((widget) => !widget.container), []);
  const [newWidget, setNewWidget] = useState<WidgetType>(() => candidates[0]?.type ?? 'text');

  return (
    <>
      <Divider className="!my-5" />
      <SectionTitle title="子表字段（一对多）" caption={`子表物理名 ${String(field.props.table ?? '-')}`} />
      <Box className="space-y-2">
        {children.map((child) => (
          <Box key={child.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5">
            <Glyph name={getWidget(child.widget).icon} size={15} className="text-brand" />
            <TextField
              fullWidth
              size="small"
              variant="standard"
              value={child.label}
              onChange={(event) =>
                onPatch({
                  children: children.map((item) =>
                    item.id === child.id ? { ...item, label: event.target.value } : item,
                  ),
                })
              }
            />
            <Tooltip title={child.id}>
              <Chip size="small" variant="outlined" label={getWidget(child.widget).label} className="!h-5 !text-[10px]" />
            </Tooltip>
            <Button
              size="small"
              color="error"
              onClick={() => onPatch({ children: children.filter((item) => item.id !== child.id) })}
            >
              移除
            </Button>
          </Box>
        ))}
        {children.length === 0 && (
          <Typography variant="caption" className="block text-slate-400">
            暂无子字段，先从下方添加一个列
          </Typography>
        )}
        <Box className="flex items-center gap-2">
          <TextField
            select
            size="small"
            label="新列控件"
            value={newWidget}
            onChange={(event) => setNewWidget(event.target.value as WidgetType)}
            className="!w-36"
          >
            {candidates.map((widget) => (
              <MenuItem key={widget.type} value={widget.type}>
                {widget.label}
              </MenuItem>
            ))}
          </TextField>
          <Button
            size="small"
            variant="outlined"
            startIcon={<Glyph name="plus" size={14} />}
            onClick={() =>
              onPatch({
                children: [...children, createFieldFromWidget(newWidget, genFieldId(), formId)],
              })
            }
            className="!border-brand/40 !text-brand"
          >
            添加列
          </Button>
        </Box>
      </Box>
    </>
  );
}

function RelationSection({
  field,
  fields,
  onPatch,
}: {
  field: FieldSchema;
  fields: FieldSchema[];
  onPatch: PatchAction;
}): JSX.Element {
  const relation = field.relation ?? {
    targetFormId: '',
    labelFieldId: '',
    foreignKeyColumn: `${field.id}_target`,
  };
  const patchRelation = (patch: Partial<NonNullable<FieldSchema['relation']>>): void => {
    onPatch({ relation: { ...relation, ...patch } });
  };

  return (
    <>
      <Divider className="!my-5" />
      <SectionTitle title="关联表（多对一）" caption="目标表单记录将作为可选项展示" />
      <Box className="space-y-3">
        <TextField
          fullWidth
          size="small"
          label="目标表单 ID"
          placeholder="form_xxx"
          value={relation.targetFormId}
          onChange={(event) => patchRelation({ targetFormId: event.target.value })}
        />
        <TextField
          fullWidth
          size="small"
          select
          label="展示字段"
          value={relation.labelFieldId}
          onChange={(event) => patchRelation({ labelFieldId: event.target.value })}
        >
          {fields
            .filter((item) => item.id !== field.id)
            .map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.label}（{item.id}）
              </MenuItem>
            ))}
        </TextField>
        <TextField
          fullWidth
          size="small"
          label="外键列名"
          value={relation.foreignKeyColumn}
          onChange={(event) => patchRelation({ foreignKeyColumn: event.target.value })}
        />
      </Box>
    </>
  );
}

function EmptyPanel(): JSX.Element {
  return (
    <Box className="flex h-full flex-col items-center justify-center px-6 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand">
        <Glyph name="blocks" size={24} />
      </span>
      <Typography variant="subtitle2" className="font-semibold text-slate-700">
        03 · 设定
      </Typography>
      <Typography variant="caption" className="mt-2 leading-relaxed text-slate-400">
        点击画布中的字段，即可在此配置标题、校验、公式与显示条件。
        <br />
        搭建主线：选材 → 布置 → 设定 → 发布。
      </Typography>
    </Box>
  );
}

export function PropertyPanel(): JSX.Element {
  const fields = useDesignerStore((state) => state.fields);
  const selectedFieldId = useDesignerStore((state) => state.selectedFieldId);
  const updateField = useDesignerStore((state) => state.updateField);
  const removeField = useDesignerStore((state) => state.removeField);
  const formId = useDesignerStore((state) => state.formId);
  const [sample, setSample] = useState(10);

  const field = fields.find((item) => item.id === selectedFieldId) ?? null;
  const onPatch: PatchAction = (patch) => {
    if (field) updateField(field.id, patch);
  };
  const onPropsChange: PropsChange = (key, value) => {
    if (field) updateField(field.id, { props: { ...field.props, [key]: value } });
  };

  if (!field) return <EmptyPanel />;

  return (
    <Box className="flex h-full flex-col">
      <Box className="border-b border-slate-100 px-4 py-4">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand text-xs font-semibold text-white">
            3
          </span>
          <Typography variant="subtitle2" className="font-semibold text-slate-800">
            设定属性
          </Typography>
          <Chip size="small" variant="outlined" label={field.id} className="!ml-auto !h-5 !text-[10px]" />
        </div>
        <Typography variant="caption" className="mt-1 block text-slate-400">
          所有修改实时反映到画布，可随时撤销
        </Typography>
      </Box>

      <Box className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <BasicSection field={field} onPatch={onPatch} />
        <DynamicProps field={field} onPropsChange={onPropsChange} />
        {field.formula && (
          <FormulaSection field={field} onPatch={onPatch} sample={sample} onSampleChange={setSample} />
        )}
        <VisibilitySection field={field} fields={fields} onPatch={onPatch} sample={sample} />
        <ValidationSection field={field} onPatch={onPatch} />
        {field.children && <SubtableSection field={field} formId={formId} onPatch={onPatch} />}
        {field.relation && <RelationSection field={field} fields={fields} onPatch={onPatch} />}

        <Divider className="!my-5" />
        <Tooltip title="删除后可用 Ctrl/⌘ + Z 撤销">
          <Button
            fullWidth
            variant="outlined"
            color="error"
            startIcon={<Glyph name="trash" size={15} />}
            onClick={() => removeField(field.id)}
          >
            删除该字段
          </Button>
        </Tooltip>
      </Box>
    </Box>
  );
}
