/**
 * PC / H5 预览切换（原创「验证」动作）。
 * 只切换设计器预览模式；具体栅格跨度由 ReverseRenderer + getFieldSpan 统一落实。
 */
import { ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import { Glyph } from '../engine/ReverseRenderer';
import type { PreviewMode } from '../store/designerStore';

export interface PreviewSwitcherProps {
  mode: PreviewMode;
  onChange: (mode: PreviewMode) => void;
}

export function PreviewSwitcher({ mode, onChange }: PreviewSwitcherProps): JSX.Element {
  return (
    <ToggleButtonGroup
      size="small"
      exclusive
      value={mode}
      onChange={(_event, value: PreviewMode | null) => {
        if (value) onChange(value);
      }}
      className="!rounded-lg !bg-white"
    >
      <Tooltip title="电脑端：按 24 栅格分栏预览">
        <ToggleButton value="pc" className="!gap-1.5 !border-slate-200 !px-3 !text-slate-600">
          <Glyph name="computer" size={15} />
          电脑
        </ToggleButton>
      </Tooltip>
      <Tooltip title="手机端：单列触控预览">
        <ToggleButton value="h5" className="!gap-1.5 !border-slate-200 !px-3 !text-slate-600">
          <Glyph name="phone" size={15} />
          手机
        </ToggleButton>
      </Tooltip>
    </ToggleButtonGroup>
  );
}
