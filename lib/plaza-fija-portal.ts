// Feature #2 (ficha Lorari-vs-Tentare): lógica pura de "Hacer mi plaza fija"
// desde el portal, extraída de app/portal/[slug]/clases/[sesionId]/page.tsx
// para poder testearla (mismo patrón que lib/bonos-portal.ts) — vivía como
// dos useMemo dentro del componente, sin ningún test cubriéndola, justo el
// punto donde apareció un bug real (el dedup no contaba PAUSADA).

import { franjaLocalDe } from './utils.ts';
import type { PlazaFija, Sesion } from './types.ts';

/**
 * ¿Esta sesión de verdad se repite cada semana a la misma hora y sala? Solo
 * entonces tiene sentido ofrecer "Hacer mi plaza fija" — no en cualquier
 * clase suelta. Exige otra sesión futura, no cancelada, con la MISMA sala Y
 * la misma franja horaria local (día+hora+minuto).
 */
export function esSlotRecurrente(ses: Sesion, sesiones: Sesion[], ahora: Date): boolean {
  const franja = franjaLocalDe(ses.inicio);
  return sesiones.some(s => {
    if (s.id === ses.id || s.salaId !== ses.salaId || s.cancelada) return false;
    if (new Date(s.inicio).getTime() <= ahora.getTime()) return false;
    const f = franjaLocalDe(s.inicio);
    return f.dow === franja.dow && f.hora === franja.hora && f.minuto === franja.minuto;
  });
}

/**
 * ¿La socia ya tiene una plaza fija (ACTIVA o PAUSADA) en este mismo slot?
 * PAUSADA cuenta también: sin esto, pausar y volver a esta misma clase
 * reaparecía el botón y dejaba crear una segunda fila para el mismo slot —
 * el dedup del servidor (crearPlazaFijaPublica) cubre lo mismo, esto es
 * defensa en profundidad para no ni ofrecer el botón.
 */
export function yaTienePlazaFijaEnSlot(ses: Sesion, socioId: string, plazasFijas: PlazaFija[]): boolean {
  const franja = franjaLocalDe(ses.inicio);
  const horaInicio = `${String(franja.hora).padStart(2, '0')}:${String(franja.minuto).padStart(2, '0')}:00`;
  return plazasFijas.some(p =>
    p.socioId === socioId && (p.estado === 'ACTIVA' || p.estado === 'PAUSADA') &&
    p.salaId === ses.salaId && p.diaSemana === franja.dow && p.horaInicio === horaInicio);
}
