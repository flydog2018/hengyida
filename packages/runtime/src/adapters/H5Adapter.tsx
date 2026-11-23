/** H5 端适配容器：单列为主、触控友好（更大点击区、无横向溢出）。 */
import type { ReactNode } from 'react';
import { AdapterContext, h5Capability } from './AdapterContext';

export function H5Adapter({ children }: { children: ReactNode }) {
  return (
    <AdapterContext.Provider value={h5Capability}>
      <div className="flex w-full flex-col gap-3 p-3">{children}</div>
    </AdapterContext.Provider>
  );
}
