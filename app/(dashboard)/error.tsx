'use client';

// Pantalla de error del panel. Sin esto, cualquier fallo de render en el
// dashboard caía al global-error raíz (fondo oscuro con estilos inline, ajeno
// al producto) — detectado en la auditoría visual 2026-08-20: era la única de
// las tres grandes superficies sin error.tsx propio. Al vivir en el segmento,
// el sidebar sobrevive y `reset()` reintenta solo la página (mismo patrón que
// app/network/error.tsx; ver allí el aviso sobre loading.tsx — error.tsx solo
// no rompe nada).
//
// La ilustración (Bangalore, recoloreada a marca — ver public/ilustraciones/
// README.md) es SOLO del panel: el portal y el widget son marca blanca del
// estudio y sus error.tsx se quedan con icono neutro a propósito. Es un <img>
// de /public a propósito: en una pantalla de error cuantas menos piezas
// puedan fallar, mejor, y si el propio asset no carga, el alt vacío la hace
// invisible sin romper nada.
import { useEffect } from 'react';
import { capturarExcepcion } from '@/lib/sentry-cliente';

export default function PanelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[panel]', error);
    // Sin esta línea el fallo NO llega a Sentry: app/global-error.tsx es el
    // único que reporta, y en cuanto un error.tsx de segmento ATRAPA el error
    // el global-error ya no se monta. Es decir, tener esta pantalla bonita
    // apagaba la alarma — peor que no tener boundary, porque da sensación de
    // estar cubierto.
    capturarExcepcion(error, { tags: { area: 'panel' }, extra: { digest: error.digest } });
  }, [error]);

  return (
    <div className="min-h-[60dvh] flex items-center justify-center px-6">
      <div className="max-w-sm text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ilustraciones/error.svg" alt="" className="mx-auto w-36 h-36 mb-4" />
        <h1 className="text-[16px] font-bold text-foreground">Algo ha ido mal</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          No hemos podido cargar esta pantalla. Tus datos están a salvo — inténtalo de nuevo.
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
