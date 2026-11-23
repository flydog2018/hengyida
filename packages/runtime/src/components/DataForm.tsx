/**
 * 填报表单容器：按 FormSchema 渲染字段控件，维护 values，提交走服务端权威计算。
 * 显示条件用 shared 内核即时求值；公式字段只读展示（服务端下发的计算值）。
 */
import { useMemo, useState } from 'react';
import { Box, Button, Alert, CircularProgress } from '@mui/material';
import type { FormSchema } from '@hengyida/shared/types/form';
import { FieldControl } from './controls/FieldControl';
import { visibleFields } from '../renderer/ConditionEvaluator';
import { api, ApiError } from '../api/client';
import { useAdapter } from '../adapters/AdapterContext';

interface Props {
  schema: FormSchema;
  readonly?: boolean;
  onSubmitted?: () => void;
}

export function DataForm({ schema, readonly = false, onSubmitted }: Props) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const adapter = useAdapter();

  const fields = useMemo(() => visibleFields(schema.fields, values), [schema.fields, values]);

  const setValue = (fieldId: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    setSuccess(false);
  };

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await api.createRecord(schema.id, values);
      setSuccess(true);
      onSubmitted?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '提交失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box component="form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2 }}>
          提交成功
        </Alert>
      )}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `repeat(${adapter.grid}, minmax(0, 1fr))`,
          gap: 2,
        }}
      >
        {fields.map((field) => {
          const mode = adapter.resolveMode(
            // widget-registry 派生渲染模式；此处用字段 adapters 的 span 作为兜底
            {
              pc: { span: field.adapters?.pc?.span ?? 12 },
              h5: { span: field.adapters?.h5?.span ?? 24, fullWidthOnH5: true },
            },
          );
          return (
            <Box key={field.id} sx={{ gridColumn: `span ${mode.span} / span ${mode.span}` }}>
              <FieldControl
                field={field}
                value={values[field.id]}
                readonly={readonly || field.widget === 'formula'}
                onChange={(v) => setValue(field.id, v)}
              />
            </Box>
          );
        })}
      </Box>
      {!readonly && (
        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="submit" variant="contained" disabled={submitting} color="primary">
            {submitting ? <CircularProgress size={20} /> : '提交'}
          </Button>
        </Box>
      )}
    </Box>
  );
}
