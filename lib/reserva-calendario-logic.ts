// ─────────────────────────────────────────────────────────────────────────────
// Lógica pura del calendario de reservas (estilo Acuity).
//
// Sin React ni Supabase: helpers deterministas de fechas y agrupación que
// consume components/reserva/reserva-calendario.tsx. Se calcula todo en hora
// LOCAL (la socia razona en su huso), de forma coherente con la clave de día.
// Testeable en aislamiento (ver reserva-calendario-logic.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

// Clave de día en hora local ('YYYY-MM-DD'). No usar toISOString() (UTC): a
// última hora podría saltar de día y colocar una clase en la casilla errónea.
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Copia desplazada n días (n negativo = atrás). No muta el argumento.
export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

// Medianoche local del lunes de la semana que contiene `d` (semana europea:
// lunes → domingo).
export function inicioSemanaLunes(d: Date): Date {
  const medianoche = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (medianoche.getDay() + 6) % 7; // 0 = lunes … 6 = domingo
  return addDays(medianoche, -dow);
}

// Los 7 días (medianoche local) de la semana que contiene `anchor`.
export function diasSemana(anchor: Date): Date[] {
  const start = inicioSemanaLunes(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

// Nº de slots por clave de día local, en una sola pasada.
export function contarSlotsPorDia<T extends { inicio: string }>(slots: T[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of slots) {
    const k = localDayKey(new Date(s.inicio));
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

// Slots de un día concreto (por clave local), ordenados por hora de inicio.
export function slotsDelDia<T extends { inicio: string }>(slots: T[], dayKey: string): T[] {
  return slots
    .filter(s => localDayKey(new Date(s.inicio)) === dayKey)
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
    const k = localDayKey(new Date(s.inicio));
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
