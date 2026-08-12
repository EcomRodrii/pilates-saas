'use client';

// Vista MES de la página pública de reservas. Un mes de un vistazo para elegir
// día; el detalle de las clases lo sigue dando la vista Día.
//
// ⚠️ Los colores dicen DISPONIBILIDAD, no cuánto se llena — ver la cabecera de
// `lib/reservar/rejilla-mes.ts`. Un día completo se apaga aunque sea el que más
// clases tiene.

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  rejillaMes, resumenDia, etiquetaDia, etiquetaMes,
  type ClaseDelMes, type Disponibilidad,
} from '@/lib/reservar/rejilla-mes';

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

// El día completo NO usa el rojo de error: no ha fallado nada, sencillamente
// está lleno. Se apaga, que es lo que significa.
const FONDO: Record<Disponibilidad, string> = {
  libre: 'var(--portal-surface)',
  ultimas: 'color-mix(in srgb, var(--portal-accent) 16%, var(--portal-surface))',
  completo: 'transparent',
  'sin-clases': 'transparent',
};

export function RejillaMes({
  slots, onElegirDia, fontFamily,
}: {
  slots: readonly ClaseDelMes[];
  /** Recibe `YYYY-MM-DD`. La página cambia a la vista Día en esa fecha. */
  onElegirDia: (fecha: string) => void;
  fontFamily?: string;
}) {
  // `useState` y no `useMemo`: el mes que se mira es estado de esta vista, y
  // navegar no puede depender de que el padre vuelva a renderizar.
  const [ancla, setAncla] = useState(() => new Date());
  const hoy = useMemo(() => new Date(), []);
  const dias = useMemo(() => rejillaMes(ancla, slots, hoy), [ancla, slots, hoy]);
  const claveHoy = useMemo(() => {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${hoy.getFullYear()}-${p(hoy.getMonth() + 1)}-${p(hoy.getDate())}`;
  }, [hoy]);

  function mover(meses: number) {
    setAncla((a) => new Date(a.getFullYear(), a.getMonth() + meses, 1));
  }

  return (
    <div style={{ fontFamily }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <button type="button" onClick={() => mover(-1)} aria-label="Mes anterior"
          style={{ width: 34, height: 34, borderRadius: 999, border: '1px solid var(--portal-line)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-ink)' }}>
          <ChevronLeft size={16} />
        </button>
        {/* `capitalize` y no un `toUpperCase` sobre la cadena: `toLocaleDateString`
            devuelve «agosto de 2026» en minúscula, y en español el mes no va en
            mayúscula salvo al empezar la frase — que es justo lo que es aquí. */}
        <span style={{ fontSize: 12.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--portal-muted)' }}>
          {etiquetaMes(ancla)}
        </span>
        <button type="button" onClick={() => mover(1)} aria-label="Mes siguiente"
          style={{ width: 34, height: 34, borderRadius: 999, border: '1px solid var(--portal-line)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-ink)' }}>
          <ChevronRight size={16} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {DIAS.map((d, i) => (
          <div key={`${d}-${i}`} style={{ textAlign: 'center', fontSize: 10.5, letterSpacing: '.1em', color: 'var(--portal-muted)', paddingBottom: 4 }}>
            {d}
          </div>
        ))}

        {dias.map((d) => {
          // Un día sin clases, o ya pasado, no es un destino: no se pinta como
          // botón ni recibe foco. Ofrecer un clic que no lleva a nada es la
          // misma promesa vacía que este repo ya ha pagado varias veces.
          const clicable = d.clases > 0 && !d.pasado;
          const apagado = d.pasado || !d.delMes;
          const esHoy = d.fecha === claveHoy;
          return (
            <button
              key={d.fecha}
              type="button"
              disabled={!clicable}
              onClick={() => onElegirDia(d.fecha)}
              // Con el MES: la rejilla enseña días de tres meses distintos y
              // «5 — Sin clases» salía dos veces idéntico. El `title` sí puede
              // ir corto — ahí ya se está viendo en qué celda se está.
              aria-label={etiquetaDia(d)}
              title={resumenDia(d)}
              style={{
                aspectRatio: '1 / 1', borderRadius: 12,
                // Hoy se marca con el borde, no con un fondo: el fondo ya
                // significa disponibilidad y pisarlo dejaría el día de hoy
                // pareciendo que tiene plazas cuando puede no tener ninguna.
                border: esHoy ? '1.5px solid var(--portal-ink)' : '1px solid var(--portal-line)',
                background: apagado ? 'transparent' : FONDO[d.disponibilidad],
                opacity: apagado ? 0.4 : 1,
                cursor: clicable ? 'pointer' : 'default',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                color: 'var(--portal-ink)', padding: 2,
              }}
            >
              <span style={{ fontSize: 13, lineHeight: 1, fontWeight: esHoy ? 700 : 400 }}>{d.dia}</span>
              {/* La cifra que se enseña son las CLASES, no las plazas: es lo que
                  cabe en una celda de calendario sin volverse ilegible. Las
                  plazas van en el resumen al pasar por encima, y el color ya
                  dice si quedan. */}
              {d.clases > 0 && (
                // 10.5 px y semibold: a 9,5 px en color de acento el número se
                // leía como una mancha — visto en la captura, no supuesto. Es
                // el único dato de la celda además del día, así que tiene que
                // poder leerse de un vistazo.
                <span style={{
                  fontSize: 10.5, fontWeight: 600, lineHeight: 1,
                  color: d.disponibilidad === 'completo' ? 'var(--portal-muted)' : 'var(--portal-ink)',
                }}>
                  {d.disponibilidad === 'completo' ? 'lleno' : `${d.clases}`}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p style={{ fontSize: 11, color: 'var(--portal-muted)', marginTop: 12 }}>
        El número es cuántas clases hay ese día. Pincha uno para ver los horarios.
      </p>
    </div>
  );
}
