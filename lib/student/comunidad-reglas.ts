// Reglas puras del tablón. Sin imports ni `@/`: `node --test
// --experimental-strip-types` no resuelve ese alias y el test dejaría de
// ejecutarse sin fallar.

export interface EventoMin {
  tipo: 'TEXTO' | 'EVENTO';
  eventoFecha: string | null;
  eventoAforo: number | null;
  totalAsistentes?: number;
}

export type EstadoEvento = 'proximo' | 'completo' | 'pasado';

/**
 * Qué se puede hacer con un evento. `pasado` gana a `completo`: a un evento
 * de ayer no se apunta nadie aunque quedaran plazas.
 */
export function estadoEvento(e: EventoMin, ahora: Date): EstadoEvento {
  if (e.eventoFecha && new Date(e.eventoFecha).getTime() < ahora.getTime()) return 'pasado';
  if (e.eventoAforo != null && e.eventoAforo > 0 && (e.totalAsistentes ?? 0) >= e.eventoAforo) return 'completo';
  return 'proximo';
}

/** «3 de 10 plazas» / «3 apuntadas» (sin aforo). */
export function plazasTexto(e: EventoMin): string {
  const n = e.totalAsistentes ?? 0;
  if (e.eventoAforo != null && e.eventoAforo > 0) return `${n} de ${e.eventoAforo} plazas`;
  return n === 1 ? '1 apuntada' : `${n} apuntadas`;
}

/** Se puede pulsar «Me apunto» / «Ya no voy». Quien ya está apuntada siempre puede bajarse de uno futuro. */
export function puedeApuntarse(e: EventoMin, apuntada: boolean, ahora: Date): boolean {
  if (e.tipo !== 'EVENTO') return false;
  const estado = estadoEvento(e, ahora);
  if (estado === 'pasado') return false;
  if (apuntada) return true;
  return estado === 'proximo';
}
