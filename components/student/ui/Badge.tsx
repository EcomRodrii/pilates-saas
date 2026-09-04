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
