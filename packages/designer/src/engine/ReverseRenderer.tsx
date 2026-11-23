/**
 * 反向渲染器（设计态）：FormSchema 字段 → 可视化控件。
 *
 * 与 runtime 共用同一份 @hengyida/shared 控件注册表与 span 策略：
 * 控件标签/图标/栅格跨度全部由 getWidget + getFieldSpan 派生，设计画布所见即发布所得。
 * 画布态（interactive=false）控件只读且可点选；预览态（interactive=true）允许真实输入。
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Box, Button, Chip, MenuItem, Select, TextField, Typography } from '@mui/material';
import {
  evaluateFormula,
  evaluateVisibility,
  getWidget,
  type FieldSchema,
} from '@hengyida/shared';
import { getFieldSpan } from './ConfigCompiler';
import type { PreviewMode } from '../store/designerStore';

/**
 * 原创线性图标集：全部为自绘路径，不引用任何第三方产品图标资源。
 * key 与 widget-registry 的 icon 字段对应；未登记的新控件自动回退到通用路径。
 */
const GLYPH_PATHS: Record<string, string> = {
  'text-field': 'M4 7h16M4 12h11M4 17h7',
  'number-field': 'M7 4v16M4 8h6M13 7h8M13 12h8M13 17h5',
  'date-field': 'M4 6h16v14H4zM4 10h16M8 4v4M16 4v4',
  'select-field': 'M4 8h16v9H4zM14.5 12l2.5 2.5 2.5-2.5',
  attachment: 'M8.5 12.5l6-6a3 3 0 1 1 4.2 4.2l-8 8a5 5 0 0 1-7-7l8-8',
  subtable: 'M3 5h18v14H3zM3 10h18M9 10v9',
  relation: 'M7 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM9 8l7 9',
  formula: 'M5 5h14M12 5v3M6.5 9l11 11M17.5 9l-11 11',
  drag: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
  undo: 'M9 7L4 12l5 5M4 12h9a5 5 0 0 1 0 10',
  redo: 'M15 7l5 5-5 5M20 12h-9a5 5 0 0 0 0 10',
  close: 'M6 6l12 12M18 6L6 18',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  plus: 'M12 5v14M5 12h14',
  computer: 'M3 5h18v12H3zM8 20h8M12 17v3',
  phone: 'M7 3h10v18H7zM10 18h4',
  blocks: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16 16l5 5',
  check: 'M5 12l4 4 10-10',
};

/** 通用图标组件 */
export function Glyph({
  name,
  size = 18,
  className = '',
}: {
  name: string;
  size?: number;
  className?: string;
}): JSX.Element {
  const path = GLYPH_PATHS[name] ?? GLYPH_PATHS['text-field'];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

interface SelectOption {
  label: string;
  value: string;
}

/** 兼容字符串数组与 {label,value} 数组两种选项写法 */
function normalizeOptions(field: FieldSchema): SelectOption[] {
  const raw = field.props.options;
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index): SelectOption => {
    if (typeof item === 'string' || typeof item === 'number') {
      return { label: String(item), value: String(item) };
    }
    if (item && typeof item === 'object') {
      const option = item as { label?: unknown; value?: unknown };
      const label = String(option.label ?? option.value ?? `选项 ${index + 1}`);
      return { label, value: String(option.value ?? option.label ?? `option_${index}`) };
    }
    return { label: `选项 ${index + 1}`, value: `option_${index}` };
  });
}

const EMPTY_VALUES: Record<string, unknown> = {};

export interface ReverseRendererProps {
  field: FieldSchema;
  mode: PreviewMode;
  /** true = 预览态可交互；false = 画布态只展示形态 */
  interactive?: boolean;
  /** 公式与显示条件求值使用的示例值 */
  values?: Record<string, unknown>;
  className?: string;
}

/**
 * 按字段定义渲染一个控件预览。
 */
export function ReverseRenderer({
  field,
  mode,
  interactive = false,
  values = EMPTY_VALUES,
  className = '',
}: ReverseRendererProps): JSX.Element | null {
  const def = getWidget(field.widget);
  const span = getFieldSpan(field, mode);
  const [value, setValue] = useState<unknown>(field.defaultValue ?? null);
  const [rows, setRows] = useState<Array<Record<string, string>>>([{}]);
  const [fileNames, setFileNames] = useState<string[]>([]);

  // 显示条件：画布态始终展示字段，避免搭建时字段「消失」；预览态按示例值求值
  const visible = useMemo(() => {
    if (!interactive || !field.visibleWhen?.expr) return true;
    try {
      return evaluateVisibility(field.visibleWhen.expr, values);
    } catch {
      // 条件表达式错误不阻断渲染，属性面板会给出明确提示
      return true;
    }
  }, [interactive, field.visibleWhen, values]);

  if (!visible) return null;

  const options = normalizeOptions(field);
  const inputClass =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/10';
  let control: ReactNode = null;

  switch (field.widget) {
    case 'text':
    case 'number':
    case 'date': {
      const inputType =
        field.widget === 'number' ? 'number' : field.widget === 'date' ? 'date' : 'text';
      control = (
        <TextField
          fullWidth
          size="small"
          type={inputType}
          value={value == null ? '' : String(value)}
          placeholder={String(field.props.placeholder ?? '请输入')}
          onChange={interactive ? (event) => setValue(event.target.value) : undefined}
          inputProps={{
            readOnly: !interactive,
            maxLength: field.widget === 'text' ? Number(field.props.maxLength ?? 50) : undefined,
          }}
        />
      );
      break;
    }
    case 'select': {
      control = (
        <Select
          fullWidth
          size="small"
          value={typeof value === 'string' ? value : ''}
          displayEmpty
          onChange={(event) => setValue(String(event.target.value))}
          inputProps={{ readOnly: !interactive }}
          renderValue={(selected) =>
            selected
              ? String(selected)
              : String(field.props.placeholder ?? (options.length ? '请选择' : '请先配置选项'))
          }
        >
          {options.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
      );
      break;
    }
    case 'attachment': {
      const maxCount = Number(field.props.maxCount ?? 5);
      control = (
        <label className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center ${interactive ? 'hover:border-brand hover:bg-brand-soft' : ''}`}>
          <input
            type="file"
            className="hidden"
            multiple
            disabled={!interactive}
            onChange={(event) =>
              setFileNames(Array.from(event.target.files ?? []).map((file) => file.name))
            }
          />
          <Glyph name="attachment" size={20} className="text-brand" />
          <span className="text-xs text-slate-500">
            {fileNames.length ? fileNames.join('、') : `点击选择文件 · 最多 ${maxCount} 个`}
          </span>
        </label>
      );
      break;
    }
    case 'subtable': {
      const children = field.children ?? [];
      const columns = children.length ? children : [{ id: '__placeholder__', label: '子项字段' }];
      control = (
        <Box className="overflow-hidden rounded-lg border border-slate-200">
          <Box className="flex items-center justify-between bg-slate-50 px-3 py-2">
            <Typography variant="caption" className="font-medium text-slate-600">
              子表明细 · {children.length} 列
            </Typography>
            {interactive ? (
              <Button size="small" onClick={() => setRows((previous) => [...previous, {}])}>
                添加行
              </Button>
            ) : (
              <Chip size="small" variant="outlined" label="一对多" />
            )}
          </Box>
          <Box className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-white text-left text-slate-500">
                  {columns.map((column) => (
                    <th key={column.id} className="border-b border-slate-200 px-3 py-2 font-medium">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {columns.map((column) => (
                      <td key={column.id} className="border-b border-slate-100 px-2 py-1.5">
                        <input
                          className={inputClass}
                          readOnly={!interactive || column.id === '__placeholder__'}
                          value={row[column.id] ?? ''}
                          placeholder="—"
                          onChange={(event) =>
                            setRows((previous) =>
                              previous.map((item, index) =>
                                index === rowIndex
                                  ? { ...item, [column.id]: event.target.value }
                                  : item,
                              ),
                            )
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Box>
        </Box>
      );
      break;
    }
    case 'relation': {
      const target = field.relation?.targetFormId ?? '';
      const relationOptions: SelectOption[] = target
        ? [{ label: `${target} · 记录 1`, value: 'record_1' }]
        : [];
      control = (
        <Select
          fullWidth
          size="small"
          value={typeof value === 'string' ? value : ''}
          displayEmpty
          onChange={(event) => setValue(String(event.target.value))}
          inputProps={{ readOnly: !interactive }}
          renderValue={(selected) =>
            selected
              ? String(selected)
              : target
                ? '请选择关联记录'
                : '请先在右侧配置目标表单'
          }
        >
          {relationOptions.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </Select>
      );
      break;
    }
    case 'formula': {
      const expr = field.formula?.expr ?? String(field.props.expr ?? '');
      const precision = Number(field.formula?.precision ?? field.props.precision ?? 2);
      let result = '待配置公式';
      let error = '';
      if (expr.trim()) {
        try {
          result = String(evaluateFormula(expr, values, precision));
        } catch (caught) {
          result = '计算失败';
          error = (caught as Error).message.replace(/^\[formula\]\s*/, '');
        }
      }
      control = (
        <Box>
          <Box className="flex items-center gap-2 rounded-lg border border-dashed border-brand/30 bg-brand-soft px-3 py-2.5">
            <Glyph name="formula" size={16} className="text-brand" />
            <Typography variant="body2" className="font-semibold text-brand">
              {result}
            </Typography>
            <Typography variant="caption" className="ml-auto truncate text-slate-400">
              {expr.trim() || '未设置表达式'}
            </Typography>
          </Box>
          {error && (
            <Typography variant="caption" className="mt-1 block text-amber-600">
              {error}
            </Typography>
          )}
        </Box>
      );
      break;
    }
    default: {
      // 注册了新控件但尚未实现预览时，给出明确提示而非空白画布
      control = (
        <Box className={inputClass}>
          <Typography variant="caption" className="text-slate-400">
            控件 {def.label} 尚未配置预览形态
          </Typography>
        </Box>
      );
    }
  }

  return (
    <Box
      data-field-id={field.id}
      className={`min-w-0 ${className}`}
      style={{ gridColumn: `span ${span} / span ${span}` }}
    >
      <Box className="mb-1.5 flex items-center gap-1.5">
        <Glyph name={def.icon} size={14} className="text-brand" />
        <Typography variant="caption" className="truncate font-medium text-slate-700">
          {field.label}
        </Typography>
        {field.required && <span className="text-xs leading-none text-red-500">*</span>}
        {field.visibleWhen?.expr && (
          <Chip size="small" variant="outlined" label="条件" className="!h-4 !text-[10px]" />
        )}
      </Box>
      {control}
    </Box>
  );
}
