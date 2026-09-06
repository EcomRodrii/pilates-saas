'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

/** Cabecera de pantalla. Literal del paquete (`components/shell/PageHeader.tsx`). */
export function PageHeader({ titulo, sub, back, accion }: { titulo: string; sub?: string; back?: boolean; accion?: ReactNode }) {
  const r = useRouter();
  return (
    <div className="px a-up" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, padding: '8px 18px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {back && (
          <button type="button" onClick={() => r.back()} aria-label="Volver" className="tap tap--icono" style={{ width: 36, height: 36, border: '1px solid var(--border)', borderRadius: 999, background: 'var(--card)', fontSize: 15 }}>
            ←
          </button>
        )}
        <div>
          <h1 className="t-h1">{titulo}</h1>
          {sub && <p className="t-meta" style={{ marginTop: 3, fontSize: 12.5 }}>{sub}</p>}
        </div>
      </div>
      {accion}
    </div>
  );
}
