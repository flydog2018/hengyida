/** PC 端适配容器：24 栅格、非触控。 */
import type { ReactNode } from 'react';
import { AdapterContext, pcCapability } from './AdapterContext';

export function PcAdapter({ children }: { children: ReactNode }) {
  return (
    <AdapterContext.Provider value={pcCapability}>
      <div className="mx-auto grid w-full max-w-6xl grid-cols-24 gap-4 p-6">{children}</div>
    </AdapterContext.Provider>
  );
}
