/**
 * 字段控件分发器：按 FieldSchema.widget 从 widget-registry 派生渲染，
 * 与 designer 的 ReverseRenderer 共享同一份控件定义（架构文档 7.9）。
 * 一期控件：text/number/date/select/attachment/subtable/relation/formula。
 */
import { TextField, MenuItem, Button, Chip, Box, Typography, IconButton } from '@mui/material';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import Add from '@mui/icons-material/Add';
import AttachFile from '@mui/icons-material/AttachFile';
import type { FieldSchema } from '@hengyida/shared/types/field';
import type { ControlProps } from './types';

/** 单行文本 / 数字 */
function BasicInput({ field, value, onChange, readonly, error }: ControlProps) {
  const isNumber = field.widget === 'number';
  return (
    <TextField
      fullWidth
      size="small"
      label={field.label}
      type={isNumber ? 'number' : 'text'}
      required={field.required}
      disabled={readonly}
      error={Boolean(error)}
      helperText={error}
      value={value ?? ''}
      placeholder={String(field.props.placeholder ?? '')}
      inputProps={{
        maxLength: field.props.maxLength as number | undefined,
        min: field.props.min as number | undefined,
        max: field.props.max as number | undefined,
      }}
      onChange={(e) => onChange(isNumber ? Number(e.target.value) : e.target.value)}
    />
  );
}

/** 日期 */
function DateInput({ field, value, onChange, readonly, error }: ControlProps) {
  return (
    <TextField
      fullWidth
      size="small"
      label={field.label}
      type="date"
      required={field.required}
      disabled={readonly}
      error={Boolean(error)}
      helperText={error}
      value={value ?? ''}
      InputLabelProps={{ shrink: true }}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** 下拉选择 */
function SelectInput({ field, value, onChange, readonly, error }: ControlProps) {
  const options = (field.props.options ?? []) as Array<{ label: string; value: string }>;
  return (
    <TextField
      select
      fullWidth
      size="small"
      label={field.label}
      required={field.required}
      disabled={readonly}
      error={Boolean(error)}
      helperText={error}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((opt) => (
        <MenuItem key={opt.value} value={opt.value}>
          {opt.label}
        </MenuItem>
      ))}
    </TextField>
  );
}

/** 附件（一期占位：记录文件名列表，实际存储接入 Phase2 文件服务） */
function AttachmentInput({ field, value, onChange, readonly }: ControlProps) {
  const files = (value ?? []) as string[];
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {field.label}
      </Typography>
      <Button
        size="small"
        variant="outlined"
        disabled={readonly}
        startIcon={<AttachFile />}
        onClick={() => {
          const name = window.prompt('输入附件文件名（一期占位，Phase2 接入文件服务）');
          if (name) onChange([...files, name]);
        }}
      >
        添加附件
      </Button>
      <Box sx={{ mt: 0.5, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {files.map((f, i) => (
          <Chip key={`${f}-${i}`} size="small" label={f} />
        ))}
      </Box>
    </Box>
  );
}

/** 子表（一对多）：行内增删，每行按 children 字段渲染简易输入 */
function SubtableInput({ field, value, onChange, readonly }: ControlProps) {
  const rows = (value ?? []) as Array<Record<string, unknown>>;
  const childFields = field.children ?? [];
  const addRow = () => onChange([...rows, {}]);
  const removeRow = (idx: number) => onChange(rows.filter((_, i) => i !== idx));
  const setCell = (idx: number, fieldId: string, v: unknown) => {
    const next = rows.map((r, i) => (i === idx ? { ...r, [fieldId]: v } : r));
    onChange(next);
  };

  return (
    <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 1, p: 1 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2">{field.label}</Typography>
        {!readonly && (
          <Button size="small" startIcon={<Add />} onClick={addRow}>
            添加行
          </Button>
        )}
      </Box>
      {rows.map((row, idx) => (
        <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
          {childFields.map((cf) => (
            <TextField
              key={cf.id}
              size="small"
              label={cf.label}
              value={row[cf.id] ?? ''}
              disabled={readonly}
              onChange={(e) => setCell(idx, cf.id, e.target.value)}
              sx={{ flex: 1 }}
            />
          ))}
          {!readonly && (
            <IconButton size="small" onClick={() => removeRow(idx)}>
              <DeleteOutline fontSize="small" />
            </IconButton>
          )}
        </Box>
      ))}
    </Box>
  );
}

/** 关联表（多对一）：一期占位，展示已选记录标签，选择由后端 API 查询（T05 联调） */
function RelationInput({ field, value, onChange, readonly }: ControlProps) {
  const selected = value as { id: string; label: string } | null;
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {field.label}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
        {selected ? (
          <Chip size="small" label={selected.label} />
        ) : (
          <Typography variant="body2">未关联</Typography>
        )}
        {!readonly && (
          <Button size="small" onClick={() => onChange({ id: 'placeholder', label: '（待联调：选择关联记录）' })}>
            选择
          </Button>
        )}
      </Box>
    </Box>
  );
}

/** 公式字段（只读，值由服务端权威计算下发；客户端仅展示） */
function FormulaDisplay({ field, value }: ControlProps) {
  return (
    <TextField
      fullWidth
      size="small"
      label={`${field.label}（自动计算）`}
      value={value ?? ''}
      disabled
    />
  );
}

/** 分发：widget → 控件实现 */
export function FieldControl(props: ControlProps) {
  switch (props.field.widget) {
    case 'text':
    case 'number':
      return <BasicInput {...props} />;
    case 'date':
      return <DateInput {...props} />;
    case 'select':
      return <SelectInput {...props} />;
    case 'attachment':
      return <AttachmentInput {...props} />;
    case 'subtable':
      return <SubtableInput {...props} />;
    case 'relation':
      return <RelationInput {...props} />;
    case 'formula':
      return <FormulaDisplay {...props} />;
    default:
      return null;
  }
}
