'use client';

// ─────────────────────────────────────────────────────────────────────────────
// «Tus primeros pasos»: la introducción breve con la que ACABA el alta, tras «Tu
// marca» (paso 5). Fundador, 21-oct-2026, tras probar el alta: al acabar el paso
// 5 «te redirige a calendario sin haber creado antes las salas, instructoras,
// las clases y le sale un aviso en rojo ya… le debe de llevar automáticamente a
// primeros pasos y una introducción breve de lo que va a hacer. Y
// automáticamente hacer los primeros pasos (lo de omitir está bien)»; y después:
// «lo de crear la clase durante el onboarding, descartado».
//
// Dice lo que viene en el panel, en el orden y con los nombres de «Pon en marcha
// tu estudio» (`PRIMEROS_PASOS_DEL_ALTA`). «Empezar» sella el alta y abre el
// primero, «Tu primera clase» sobre el Calendario; al publicarla, su «¡Listo!»
// lleva al Resumen, donde la lista ofrece el siguiente con «Omitir». «Omitir»
// aquí va directo al Resumen. Nada de lo que se nombra es una promesa nueva.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react';
import { BOTON_VIVO } from '@/components/dashboard/vivo';
import { BOTON_BORDE } from '@/components/dashboard/vivo-seccion';
import { cn } from '@/lib/utils';
import { PRIMEROS_PASOS_DEL_ALTA } from '@/lib/alta/bienvenida-nueva';
import { CabeceraPaso, LineaDePasos } from './piezas';

export function PasoPrimerosPasos({ onAtras, onEmpezar, onOmitir, saliendo }: {
  onAtras: () => void;
  onEmpezar: () => void;
  /** Sin empezar por la clase: al Resumen, donde «Pon en marcha tu estudio» los sigue teniendo. */
  onOmitir: () => void;
  saliendo: boolean;
}) {
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titulo.current?.focus(); }, []);

  return (
    <div className="mx-auto max-w-[620px]">
      {/* Los cinco del alta, hechos: esto ya es lo que viene en el panel. */}
      <LineaDePasos actual={6} />
      <CabeceraPaso
        etiqueta="Tu estudio, listo · ahora, en tu panel"
        titulo="Ahora, tus primeros pasos"
        sub="Lo que falta para tu primera reserva, en este orden. Te esperan en tu panel, en «Pon en marcha tu estudio»: al terminar uno se te ofrece el siguiente, y cualquiera lo puedes omitir."
        tituloRef={titulo}
      />

      <ol className="relative mt-7 grid gap-1" data-testid="primeros-pasos-alta">
        {PRIMEROS_PASOS_DEL_ALTA.map((p, i) => (
          <li key={p.titulo} className="relative grid grid-cols-[32px_minmax(0,1fr)] gap-3.5 pb-5">
            {/* La línea punteada hasta el siguiente, como la ruta de la pantalla de éxito del registro. */}
            {i < PRIMEROS_PASOS_DEL_ALTA.length - 1 && (
              <span aria-hidden className="absolute bottom-0 left-[15px] top-9 border-l-[1.5px] border-dashed border-muted-foreground/40" />
            )}
            <span
              aria-hidden
              className={cn(
                'relative z-[1] grid size-8 place-items-center rounded-full font-mono text-[13px] font-semibold',
                i === 0 ? 'text-white' : 'bg-card text-foreground ring-1 ring-inset ring-input',
              )}
              style={i === 0 ? { backgroundColor: 'var(--t-magenta-500)' } : undefined}
            >
              {i + 1}
            </span>
            <div className="min-w-0 pt-1">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <b className="text-[16px] font-semibold text-foreground">{p.titulo}</b>
                <span className="font-mono text-[12px] text-muted-foreground">{p.cuanto}</span>
              </p>
              <p className="mt-1 text-[14px] leading-[21px] text-muted-foreground">{p.que}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="sticky bottom-0 z-10 -mx-5 mt-4 flex items-center gap-2.5 border-t border-border bg-background/95 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-5 sm:backdrop-blur-none">
        <button
          type="button"
          onClick={onAtras}
          disabled={saliendo}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2.5 text-[14px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <ArrowLeft size={16} aria-hidden /> Atrás
        </button>
        <div className="ml-auto flex min-w-0 items-center gap-2.5">
          <button type="button" onClick={onOmitir} disabled={saliendo} className={cn(BOTON_BORDE, 'h-11 px-4 text-[14px] disabled:opacity-60')}>
            Omitir
          </button>
          <button type="button" onClick={onEmpezar} disabled={saliendo} className={cn(BOTON_VIVO, 'h-11 min-w-0 px-5 text-[15px] disabled:opacity-70')}>
            {saliendo
              ? <><Loader2 size={16} className="animate-spin" aria-hidden /> Un momento…</>
              : <>Empezar <ArrowRight size={16} aria-hidden /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
