// ─────────────────────────────────────────────────────────────────────────────
// Lógica pura del calendario de reservas (estilo Acuity).
//
// Sin React ni Supabase: helpers deterministas de fechas y agrupación que
// consume components/reserva/reserva-calendario.tsx. Se calcula todo en hora
// LOCAL (la socia razona en su huso), de forma coherente con la clave de día.
// Testeable en aislamiento (ver reserva-calendario-logic.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { inicioDeSemana } from './utils.ts';
import { diaEnEstudio } from './calendario-hora-estudio.ts';

// ⚠️ RES-7-f (auditoría 25-sep). Dos cosas distintas, y confundirlas era el fallo:
//   · FECHA DE CALENDARIO (`Date` a medianoche local, las casillas de la tira y de
//     la rejilla): `localDayKey`, su clave 'YYYY-MM-DD'. No es un instante.
//   · INSTANTE de una clase (`inicio` ISO): su día es el del ESTUDIO
//     (`diaEnEstudio`, Europe/Madrid), no el del navegador. Con el navegador fuera
//     de Madrid, una clase de las 00:30 caía en la casilla del día anterior.
// Las claves de los dos lados son la misma cadena 'YYYY-MM-DD', así que encajan.

// Clave de día en hora local ('YYYY-MM-DD') de una FECHA DE CALENDARIO. No usar
// toISOString() (UTC): a última hora podría saltar de día.
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Copia desplazada n días (n negativo = atrás). No muta el argumento.
export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

// Los 7 días (medianoche local) de la semana que contiene `anchor` (semana
// europea: lunes → domingo). `inicioDeSemana` (./utils.ts) ya calcula esto —
// antes había aquí una segunda fórmula equivalente, `inicioSemanaLunes`.
export function diasSemana(anchor: Date): Date[] {
  const start = inicioDeSemana(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

// Nº de slots por clave de día local, en una sola pasada.
export function contarSlotsPorDia<T extends { inicio: string }>(slots: T[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of slots) {
    const k = diaEnEstudio(s.inicio);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

// Slots de un día concreto (por clave local), ordenados por hora de inicio.
export function slotsDelDia<T extends { inicio: string }>(slots: T[], dayKey: string): T[] {
  return slots
    .filter(s => diaEnEstudio(s.inicio) === dayKey)
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
}

// Agrupa slots por día local, conservando el orden cronológico dentro y entre
// grupos. Devuelve grupos ya ordenados (para la vista "lista"/Mis reservas).
export function agruparPorDia<T extends { inicio: string }>(
  slots: T[],
): { dayKey: string; items: T[] }[] {
  const ordenados = [...slots].sort(
    (a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime(),
  );
  const grupos: { dayKey: string; items: T[] }[] = [];
  for (const s of ordenados) {
    const k = diaEnEstudio(s.inicio);
    const last = grupos[grupos.length - 1];
    if (last?.dayKey === k) last.items.push(s);
    else grupos.push({ dayKey: k, items: [s] });
  }
  return grupos;
}

// Etiqueta de día relativa a "hoy" ('Hoy' / 'Mañana' / 'vie 25 jul'), con la
// primera letra en mayúscula. `ref` permite fijar el "ahora" en los tests.
export function etiquetaDia(d: Date, ref: Date = new Date()): string {
  const key = localDayKey(d);
  if (key === localDayKey(ref)) return 'Hoy';
  if (key === localDayKey(addDays(ref, 1))) return 'Mañana';
  const s = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** `'2026-08-12'` → esa fecha a medianoche LOCAL (una fecha de calendario, no un instante). */
export function fechaDeClave(clave: string): Date {
  const [y, m, d] = clave.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/**
 * «Hoy» / «Mañana» / «vie 25 jul» para un día dado por su CLAVE del estudio.
 * Sustituye a `etiquetaDia(new Date(inicio), hoy)` en los agrupados de clases:
 * ese comparaba el día del navegador y formateaba con su zona.
 */
export function etiquetaDiaClave(dayKey: string, hoyKey: string): string {
  if (dayKey === hoyKey) return 'Hoy';
  if (dayKey === localDayKey(addDays(fechaDeClave(hoyKey), 1))) return 'Mañana';
  const s = fechaDeClave(dayKey).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
