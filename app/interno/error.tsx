'use client';

// Pantalla de error del backoffice interno (auditoría 2026-09-21).
//
// `/interno` era la única superficie con subrutas propias (sales, facturacion,
// estudios/[id], network, crecimiento...) sin `error.tsx`: su layout maneja el
// error de SESIÓN, pero un throw de render en cualquier subpágina subía hasta
// `app/global-error.tsx`, que reemplaza el documento entero y deja al equipo
// de Tentare sin la navegación de /interno para volver atrás.
//
// Icono neutro y no la ilustración del panel: /interno es "Tentare Internal",
// otro contexto de marca (ver .claude/tentare-os.md).
import { useEffect } from 'react';
import { capturarExcepcion } from '@/lib/sentry-cliente';

export default function InternoError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[interno]', error);
    // Igual que en el panel: en cuanto un error.tsx de segmento ATRAPA el
    // error, `global-error.tsx` ya no se monta y con él se iría la única vía
    // que reporta. Sin esta línea, poner esta pantalla APAGARÍA la alarma.
    capturarExcepcion(error, { tags: { area: 'interno' }, extra: { digest: error.digest } });
  }, [error]);

  return (
    <div className="min-h-[60dvh] flex items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <h1 className="text-[16px] font-bold text-foreground">Algo ha ido mal</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          No hemos podido cargar esta pantalla del backoffice. Inténtalo de nuevo.
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-brand-foreground text-[13px] font-bold transition-[filter,transform] duration-150 hover:brightness-95 active:scale-[.98]"
        >
          Reintentar
        </button>
      </div>
    </div>
  );
}
