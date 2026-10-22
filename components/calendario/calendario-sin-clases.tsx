'use client';

// El calendario de un estudio que todavía no tiene ninguna clase.
//
// Con CERO sesiones en todo el estudio, no «cero esta semana»: una semana vacía
// en un estudio en marcha es normal (vacaciones) y ahí esto sería ruido.
//
// Antes aquí vivía un asistente («Te lo montamos nosotros») que proponía un
// horario entero a partir de seis preguntas. Se retiró (8-oct-2026, decisión del
// fundador): confundía a quien lo usaba y generaba clases que nadie había
// pedido. Lo que queda es lo mínimo que evita el muro de antes, una rejilla en
// blanco sin una sola palabra: decir qué falta y dar las dos salidas reales,
// crear la primera clase o traer el horario que ya tienen.
//
// Con el ALTA NUEVA (PR-5, maqueta «08 · El panel después»), el vacío que
// enseña: «Crea tu primera clase», la franja de su horario en punteado (aún sin
// clases) y «Crear mi primera clase», que abre «Tu primera clase» con el tipo, la
// sala, la ficha y el precio a la vez. Sin la pregunta de «primero, crea tus
// tipos de clase»: en el alta nueva eso va dentro de la primera clase.

import Link from 'next/link';
import { CalendarPlus, Upload } from 'lucide-react';

/** 'HH:MM:SS' o 'HH:MM' → 'HH:MM'; lo que no lo sea, `null`. */
const hora = (t: string | null | undefined) => (t && /^\d{2}:\d{2}/.test(t) ? t.slice(0, 5) : null);

export function CalendarioSinClases({ puedeCrear, hayTiposDeClase, onCrearClase, altaNueva }: {
  puedeCrear: boolean;
  /** Sin tipos de clase no se puede programar nada: primero se crean. */
  hayTiposDeClase: boolean;
  onCrearClase: () => void;
  /** El vacío del alta nueva, con la franja de su horario (`studios.hora_apertura/hora_cierre`). */
  altaNueva?: { apertura: string | null | undefined; cierre: string | null | undefined } | null;
}) {
  if (altaNueva && puedeCrear) {
    const desde = hora(altaNueva.apertura);
    const hasta = hora(altaNueva.cierre);
    return (
      <div data-testid="calendario-sin-clases" data-alta-nueva="" className="flex h-full flex-col items-center justify-center px-6">
        <div className="w-full max-w-lg">
          <p className="t-label text-muted-foreground">Calendario · esta semana</p>
          <h2 className="mt-2 text-[21px] font-semibold leading-[27px] tracking-[-0.01em] text-foreground">Crea tu primera clase</h2>
          {desde && hasta && (
            <div className="my-4 flex items-center gap-2.5 font-t-mono text-[12px] text-muted-foreground" aria-label={`Tu horario: de ${desde} a ${hasta}, todavía sin clases`}>
              <span aria-hidden>{desde}</span>
              <i className="t-schedule-line" data-state="pending" aria-hidden />
              <span aria-hidden>{hasta}</span>
            </div>
          )}
          <p className="text-[14px] leading-[21px] text-muted-foreground text-pretty">
            En cuanto haya una clase aquí, tus alumnas podrán reservarla desde su app.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
            <button
              type="button"
              onClick={onCrearClase}
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-[13.5px] font-semibold text-foreground transition-colors hover:bg-muted"
            >
              <CalendarPlus size={15} aria-hidden />Crear mi primera clase
            </button>
            <Link href="/calendario/importar" className="text-[13.5px] font-semibold text-[color:var(--t-text-link)] hover:underline">
              Importar mi horario (Excel)
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="calendario-sin-clases" className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <CalendarPlus size={22} aria-hidden />
      </span>
      <div className="max-w-md">
        <h2 className="text-lg font-semibold text-foreground">Tu horario todavía está vacío</h2>
        <p className="mt-1.5 text-[13.5px] text-muted-foreground text-pretty">
          {puedeCrear
            ? 'En cuanto haya clases aquí, tus alumnas podrán reservarlas desde su app.'
            : 'Cuando haya clases programadas aparecerán aquí.'}
        </p>
      </div>
      {puedeCrear && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {hayTiposDeClase ? (
            <button
              type="button"
              onClick={onCrearClase}
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand px-4 text-[13.5px] font-semibold text-brand-foreground transition-opacity hover:opacity-90"
            >
              <CalendarPlus size={15} aria-hidden />Crear mi primera clase
            </button>
          ) : (
            <Link
              href="/configuracion?tab=clases&abrir=tipos-de-clase"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-brand px-4 text-[13.5px] font-semibold text-brand-foreground transition-opacity hover:opacity-90"
            >
              Primero, crea tus tipos de clase
            </Link>
          )}
          <Link
            href="/calendario/importar"
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-4 text-[13.5px] font-semibold text-foreground transition-colors hover:bg-muted"
          >
            <Upload size={15} aria-hidden />Importar mi horario (Excel)
          </Link>
        </div>
      )}
    </div>
  );
}
