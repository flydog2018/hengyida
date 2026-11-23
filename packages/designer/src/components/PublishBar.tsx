/**
 * 顶部发布栏（原创「发布」区）。
 *
 * 发布路径固定为：本地编译 → Ajv + 语义校验 → 可选后端发布。
 * 未配置 VITE_API_BASE_URL 时走「本地生成配置」预览（一期口径），
 * 后端联调由 T05 完成；即使后端不可达，也保留已编译的 Schema 供人工核对。
 */
import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  CURRENT_SCHEMA_VERSION,
  SCHEMA_VERSION_HEADER,
  type FormSchema,
} from '@hengyida/shared';
import { compileFormSchema } from '../engine/ConfigCompiler';
import { validateFormSchema } from '../engine/SchemaValidator';
import { Glyph } from '../engine/ReverseRenderer';
import { useDesignerStore } from '../store/designerStore';

interface PublishDialog {
  open: boolean;
  title: string;
  tone: 'success' | 'error' | 'info';
  detail: string;
  json: string;
}

const CLOSED_DIALOG: PublishDialog = {
  open: false,
  title: '',
  tone: 'info',
  detail: '',
  json: '',
};

/** 线性搭建步骤提示：选材 → 布置 → 设定 → 发布 */
const STEPS = ['选材', '布置', '设定', '发布'];

function StepChips({ fieldsCount, hasSelection }: { fieldsCount: number; hasSelection: boolean }): JSX.Element {
  const activeIndex = fieldsCount === 0 ? 0 : hasSelection ? 2 : 1;
  return (
    <Box className="hidden items-center gap-1.5 lg:flex">
      {STEPS.map((step, index) => (
        <Box key={step} className="flex items-center gap-1.5">
          <span
            className={`flex h-6 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition ${
              index === activeIndex
                ? 'bg-brand text-white'
                : 'bg-slate-100 text-slate-500'
            }`}
          >
            <span className="opacity-70">{index + 1}</span>
            {step}
          </span>
          {index < STEPS.length - 1 && <span className="text-slate-300">›</span>}
        </Box>
      ))}
    </Box>
  );
}

export function PublishBar(): JSX.Element {
  const formId = useDesignerStore((state) => state.formId);
  const fields = useDesignerStore((state) => state.fields);
  const selectedFieldId = useDesignerStore((state) => state.selectedFieldId);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<PublishDialog>(CLOSED_DIALOG);

  const handlePublish = async (): Promise<void> => {
    setBusy(true);
    try {
      const schema: FormSchema = compileFormSchema({ formId, fields });
      const result = validateFormSchema(schema);
      if (!result.valid) {
        setDialog({
          open: true,
          title: '配置校验未通过',
          tone: 'error',
          detail: result.errors.join('\n'),
          json: JSON.stringify(schema, null, 2),
        });
        return;
      }

      const baseUrl = String(import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');
      const compiledText = JSON.stringify(schema, null, 2);
      const localSuccess: PublishDialog = {
        open: true,
        title: '已生成配置',
        tone: 'success',
        detail: `编译通过：${fields.length} 个字段，Schema ${schema.schemaVersion}。当前未连接发布服务（后端联调由 T05 完成），可在下方核对配置。`,
        json: compiledText,
      };

      if (!baseUrl) {
        setDialog(localSuccess);
        return;
      }

      try {
        const response = await fetch(
          `${baseUrl}/api/v1/forms/${encodeURIComponent(formId)}/publish`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              [SCHEMA_VERSION_HEADER]: CURRENT_SCHEMA_VERSION,
            },
            body: JSON.stringify(schema),
          },
        );
        const payload = (await response.json()) as {
          code?: number;
          message?: string;
          data?: { version?: number; tableName?: string };
        };
        if (response.ok && payload.code === 0) {
          setDialog({
            open: true,
            title: '发布成功',
            tone: 'success',
            detail: `版本 v${payload.data?.version ?? '-'}，数据表 ${payload.data?.tableName ?? '-'} 已就绪。`,
            json: compiledText,
          });
        } else {
          setDialog({
            open: true,
            title: '发布失败',
            tone: 'error',
            detail: payload.message ?? `服务端返回 HTTP ${response.status}`,
            json: compiledText,
          });
        }
      } catch (error) {
        setDialog({
          ...localSuccess,
          detail: `本地编译与校验已通过；发布服务暂不可达（${(error as Error).message}）。配置已保留，T05 联调后可直接走真实发布。`,
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Box className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 shadow-sm">
        <Box className="flex items-center gap-3">
          {/* VI 标准图形标：H·X 蜜蜂原创标志，纯图形标用于屏幕小尺寸（最小宽度 ≥40px） */}
          <img src="/brand/logo-symbol.png" alt="恒信标志" className="h-10 w-10 shrink-0 object-contain" />
          <Box>
            <Typography variant="subtitle1" className="font-bold leading-tight tracking-wide text-brand">
              恒易搭 · 表单设计器
            </Typography>
            <Typography variant="caption" className="text-slate-400">
              恒以立身，信以成事 · 恒信出方案，恒易搭系统
            </Typography>
          </Box>
        </Box>

        <StepChips fieldsCount={fields.length} hasSelection={Boolean(selectedFieldId)} />

        <Box className="flex items-center gap-3">
          <Tooltip title={`当前表单 ${formId}`}>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-medium text-slate-500">
              {formId}
            </span>
          </Tooltip>
          <Button
            variant="contained"
            onClick={handlePublish}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={15} color="inherit" /> : <Glyph name="check" size={17} />}
            className="!rounded-lg !bg-brand !px-5 !shadow-sm hover:!bg-brand/90"
          >
            {busy ? '发布中' : '一键发布'}
          </Button>
        </Box>
      </Box>

      <Dialog open={dialog.open} onClose={() => setDialog(CLOSED_DIALOG)} maxWidth="md" fullWidth>
        <DialogTitle className="font-semibold text-slate-800">{dialog.title}</DialogTitle>
        <DialogContent dividers>
          <Alert severity={dialog.tone} className="!mb-4 !whitespace-pre-wrap">
            {dialog.detail}
          </Alert>
          {dialog.json && (
            <Box>
              <Typography variant="caption" className="mb-1 block font-semibold text-slate-500">
                编译产物 · FormSchema
              </Typography>
              <pre className="max-h-72 overflow-auto rounded-lg bg-slate-900 p-4 text-[11px] leading-relaxed text-slate-100">
                {dialog.json}
              </pre>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialog(CLOSED_DIALOG)} variant="contained" className="!bg-brand">
            知道了
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
