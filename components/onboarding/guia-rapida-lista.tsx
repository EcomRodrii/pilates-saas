'use client';

// ─────────────────────────────────────────────────────────────────────────────
// La guía rápida, a la vista desde el primer segundo del alta.
//
// ⚠️ NO es una lista nueva. Los pasos y su «hecho» salen de `guiaRapida`
// (lib/onboarding.ts), que a su vez sale del MISMO `calcularOnboarding` que el
// checklist del Resumen y /primeros-pasos: nada se marca a mano. Aquí solo se
// pinta, con su progreso (n de 5) anunciado a lectores de pantalla.
// ─────────────────────────────────────────────────────────────────────────────

import { ArrowRight, Check } from 'lucide-react';
import { useStudio } from '@/lib/studio-context';
import {
  calcularOnboarding, datosOnboardingDelEstudio, guiaRapida, type GuiaRapida,
} from '@/lib/onboarding';

/** Lo que el servidor acaba de crear y el contexto del panel todavía no ha releído. */
export interface CreadoAhora { tiposClase?: number; salas?: number }

export function useGuiaRapida(creado?: CreadoAhora): GuiaRapida | null {
  const {
    studio, instructores, tiposClase, sesiones, socios, salas, planesTarifa,
    suscripciones, automationRules, contenidoPortal, reservas,
  } = useStudio();
  if (!studio) return null;
  const datos = datosOnboardingDelEstudio({
    studio, instructores, tiposClase, sesiones, socios, reservas,
    salas, planesTarifa, suscripciones, automationRules, contenidoPortal,
  });
  // El asistente crea clases y salas en el servidor, y el contexto del panel no
  // las relee hasta la siguiente carga. Se suma lo que el servidor CONFIRMÓ haber
  // creado (su respuesta), nunca lo que el asistente cree que va a crear.
  const conCreado = {
    ...datos,
    numTiposClase: Math.max(datos.numTiposClase, creado?.tiposClase ?? 0),
    numSalas: Math.max(datos.numSalas, creado?.salas ?? 0),
  };
  return guiaRapida(calcularOnboarding(conCreado).categorias);
}

export function GuiaRapidaLista({
  guia, onIr, titulo = 'Guía rápida',
}: {
  guia: GuiaRapida;
  /** Con él, cada paso pendiente es un botón que lleva a la acción. Sin él, solo se ve el estado. */
  onIr?: (href: string) => void;
  titulo?: string;
}) {
  return (
    <section aria-labelledby="guia-rapida-titulo" className="rounded-2xl border border-border bg-card p-4" data-testid="guia-rapida">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="guia-rapida-titulo" className="text-[14px] font-bold text-foreground">{titulo}</h2>
        <p className="text-[12.5px] font-semibold text-muted-foreground" aria-live="polite" data-testid="guia-progreso">
          {guia.hechos} de {guia.total}
        </p>
      </div>
      <div
        role="progressbar" aria-valuemin={0} aria-valuemax={guia.total} aria-valuenow={guia.hechos}
        aria-label={`Guía rápida: ${guia.hechos} de ${guia.total} pasos hechos`}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-brand-medio transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${guia.pct}%` }} />
      </div>
      <ol className="mt-3 flex flex-col">
        {guia.pasos.map((p) => {
          const fila = (
            <>
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                  p.done ? 'border-brand-medio bg-brand-medio text-white' : 'border-border text-transparent'
                }`}
                aria-hidden
              >
                <Check size={13} />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className={`block text-[13.5px] font-semibold ${p.done ? 'text-muted-foreground line-through decoration-1' : 'text-foreground'}`}>
                  {p.label}
                </span>
                {!p.done && <span className="block text-[12px] leading-snug text-muted-foreground">{p.descripcion}</span>}
              </span>
              {!p.done && onIr && <ArrowRight size={15} className="shrink-0 text-muted-foreground" aria-hidden />}
            </>
          );
          return (
            <li key={p.id} data-paso={p.id} data-hecho={p.done ? 'si' : 'no'}>
              {!p.done && onIr ? (
                <button
                  type="button"
                  onClick={() => onIr(p.href)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-xl px-1 py-2 transition-colors hover:bg-muted"
                >
                  {fila}
                </button>
              ) : (
                <div className="flex min-h-11 items-center gap-3 px-1 py-2">{fila}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
