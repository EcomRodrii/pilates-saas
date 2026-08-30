'use client';

// Pantalla de error de todo el segmento /network — antes caía en el genérico
// "Algo se ha roto" de la app raíz (verificado en vivo, auditoría del
// sistema de diseño 2026-08-18: un `getSupabaseAdmin()` fallido en
// `/network` mostraba el error sin ninguna identidad de Network). `reset()`
// reintenta el segmento sin recargar toda la pestaña — Next lo pasa siempre,
// documentado en next/dist/docs/app/api-reference/file-conventions/error.
//
// ⚠️ A propósito NO hay un loading.tsx hermano en este segmento. Se probó
// (mismo PR) y rompía `notFound()` en /network/instructoras/[slug]: con un
// loading.tsx en un segmento padre, Next activa streaming para toda la rama
// y envía la cabecera 200 del shell ANTES de que el `notFound()` async
// resuelva — el body acaba mostrando el 404 pero el status HTTP queda en
// 200 (capturado por e2e/network-marketplace-publico.spec.ts, que sí
// comprueba el código real, no solo el contenido). Verificado en vivo con
// `next build && next start` + curl, quitando/poniendo loading.tsx uno a
// uno: solo loading.tsx lo rompe, error.tsx solo no. Next.js App Router no
// permite acotar un loading.tsx a "esta ruta pero no sus hijas dinámicas" —
// si se quiere loading para /network o /network/instructoras en el futuro,
// tiene que vivir en esos segmentos SIN alcanzar a instructoras/[slug].
import { useEffect } from 'react';
import { capturarExcepcion } from '@/lib/sentry-cliente';
import { LogoTentare } from '@/components/marca/logo-tentare';
import { NW_FONDO, NW_TINTA, NW_MUTED, NW_PRODUCTO } from '@/components/network-v2/tokens';

export default function NetworkError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[network]', error);
    // Sin esta línea el fallo NO llega a Sentry: app/global-error.tsx es el
    // único que reporta, y en cuanto un error.tsx de segmento ATRAPA el error
    // el global-error ya no se monta. Es decir, tener esta pantalla bonita
    // apagaba la alarma — peor que no tener boundary, porque da sensación de
    // estar cubierto.
    capturarExcepcion(error, { tags: { area: 'network' }, extra: { digest: error.digest } });
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
          className="mt-6 inline-flex items-center justify-center rounded-full px-5 py-2.5 text-[13.5px] font-bold text-white transition-[filter,transform] duration-150 hover:brightness-95 active:scale-[.98]"
          style={{ background: NW_PRODUCTO }}
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
