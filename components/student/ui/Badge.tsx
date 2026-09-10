import type { Disponibilidad } from '@/lib/student/tipos';
const MAP: Record<Disponibilidad, { cls: string; txt: (n: number) => string; pulse?: boolean }> = {
  disponible: { cls: 'badge--ok', txt: (n) => n + ' plazas' },
  pocas: { cls: 'badge--few', txt: (n) => (n === 1 ? 'Última plaza' : 'Quedan ' + n), pulse: true },
  completa: { cls: 'badge--full', txt: () => 'Completa · lista' },
  'no-disponible': { cls: 'badge--neutral', txt: () => 'Completa' },
  'lista-espera': { cls: 'badge--wait', txt: () => 'En lista de espera' },
  reservada: { cls: 'badge--booked', txt: () => 'Reservada ✓' },
};
export function AvailabilityBadge({ estado, plazas }: { estado: Disponibilidad; plazas: number }) {
  const m = MAP[estado];
  return <span className={'badge ' + m.cls}>{m.pulse && <span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: 'currentColor', animation: 'apPulse 2.2s infinite' }} />}{m.txt(plazas)}</span>;
}
export function Badge({ tone = 'neutral', children }: { tone?: 'ok' | 'few' | 'full' | 'neutral' | 'wait' | 'booked'; children: React.ReactNode }) {
  return <span className={'badge badge--' + tone}>{children}</span>;
}

// La clase se está dando ahora mismo.
//
// Va aparte de `AvailabilityBadge` y lo SUSTITUYE en las tarjetas, no lo
// acompaña: `disponibilidad()` no sabe nada del reloj, así que sobre una clase
// ya empezada seguía anunciando «Quedan 2» — una plaza que el servidor rechaza
// en cuanto la alumna la toca (`sesionYaEmpezada`). Enseñar las dos cosas a la
// vez es prometer algo y negarlo en la misma fila.
//
// `role="status"` porque aparece SOLO, sin que la alumna haya hecho nada: a las
// 16:00 la fila cambia por su cuenta, y un lector de pantalla tiene que poder
// anunciarlo. `aria-live` no hace falta — `status` ya implica `polite`.
export function EnCursoBadge({ terminaA }: { terminaA?: string }) {
  return (
    <span className="badge badge--curso" role="status" data-testid="badge-en-curso">
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: 'currentColor', animation: 'apPulse 1.6s infinite' }} />
      En curso{terminaA ? <span className="t-num" style={{ fontWeight: 700, opacity: .85 }}>&nbsp;· hasta {terminaA}</span> : null}
    </span>
  );
}
