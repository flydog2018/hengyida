/**
 * 端能力抽象：布局栅格 / 触控 / 尺寸策略。
 * PC 一次配置，H5 自动适配 —— 差异全部收敛在此，控件与渲染器不写 if(pc/h5) 分支。
 */
import { createContext, useContext } from 'react';
import type { RenderMode } from '@hengyida/shared/constants/widget-registry';

export type AdapterType = 'pc' | 'h5';

export interface AdapterCapability {
  type: AdapterType;
  /** 总栅格数 */
  grid: number;
  /** 是否触控优先 */
  touch: boolean;
  /** 取某控件在该端的渲染模式 */
  resolveMode: (modes: { pc: RenderMode; h5: RenderMode }) => RenderMode;
}

export const pcCapability: AdapterCapability = {
  type: 'pc',
  grid: 24,
  touch: false,
  resolveMode: (m) => m.pc,
};

export const h5Capability: AdapterCapability = {
  type: 'h5',
  grid: 24,
  touch: true,
  resolveMode: (m) => m.h5,
};

export const AdapterContext = createContext<AdapterCapability>(pcCapability);

export function useAdapter(): AdapterCapability {
  return useContext(AdapterContext);
}
