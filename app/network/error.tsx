'use client';

// Pantalla de error de todo el segmento /network — antes caía en el genérico
// "Algo se ha roto" de la app raíz (verificado en vivo, auditoría del
// sistema de diseño 2026-08-18: un `getSupabaseAdmin()` fallido en
// `/network` mostraba el error sin ninguna identidad de Network). `reset()`
// reintenta el segmento sin recargar toda la pestaña — Next lo pasa siempre,
// documentado en next/dist/docs/app/api-reference/file-conventions/error.
import { useEffect } from 'react';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { NW_FONDO, NW_TINTA, NW_MUTED, NW_PRODUCTO } from '@/components/network-v2/tokens';

export default function NetworkError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[network]', error);
  }, [error]);

  return (
    <div className="min-h-dvh flex items-center justify-center px-6" style={{ background: NW_FONDO }}>
      <div className="max-w-sm text-center">
        <LogoTentare formato="horizontal" producto="network" titulo="Tentare Network" alto={26} className="mx-auto mb-6" />
        <h1 className="text-[18px] font-extrabold" style={{ color: NW_TINTA }}>Algo ha ido mal</h1>
        <p className="mt-2 text-[13.5px]" style={{ color: NW_MUTED }}>
          No hemos podido cargar esta página. Inténtalo de nuevo en unos segundos.
        </p>
        <button
          onClick={reset}
          className="mt-6 inline-flex items-center justify-center rounded-full px-5 py-2.5 text-[13.5px] font-bold text-white"
          style={{ background: NW_PRODUCTO }}
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
