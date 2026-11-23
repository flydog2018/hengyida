/** 运行时控件统一 props 契约。所有控件消费同一份 FieldSchema 与值上下文。 */
import type { FieldSchema } from '@hengyida/shared/types/field';

export interface ControlProps {
  field: FieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  /** 只读模式（查看者角色） */
  readonly?: boolean;
  /** 错误提示（校验失败） */
  error?: string;
}
