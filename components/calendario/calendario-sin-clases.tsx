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

import Link from 'next/link';
import { CalendarPlus, Upload } from 'lucide-react';

export function CalendarioSinClases({ puedeCrear, hayTiposDeClase, onCrearClase }: {
  puedeCrear: boolean;
  /** Sin tipos de clase no se puede programar nada: primero se crean. */
  hayTiposDeClase: boolean;
  onCrearClase: () => void;
}) {
  return (
    <div data-testid="calendario-sin-clases" className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <CalendarPlus size={22} aria-hidden />
      </span>
      <div className="max-w-md">
        <h2 className="text-lg font-semibold text-foreground">Tu horario todavía está vacío</h2>
        <p className="mt-1.5 text-[13.5px] text-muted-foreground text-pretty">
          {puedeCrear
            ? 'En cuanto haya clases aquí, tus alumnas podrán reservarlas desde tu página.'
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
