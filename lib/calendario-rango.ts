// ─────────────────────────────────────────────────────────────────────────────
// Rediseño del Calendario — punto 10, "memoiza por semana" (cierra P0-29:
// /api/calendario ya solo trae el rango visible, gte/lt sobre `desde`/`hasta`
// — esto calcula ESE rango de forma pura y estable, para que el hook de
// datos de la Etapa 9 pueda usar `claveRango` como clave de caché: la misma
// semana/día produce la misma clave, así que volver a una ya cargada no
// repite el fetch).
//
// Mismo cálculo de límites que ya usaba el page.tsx viejo (addDays/weekStart)
// — portado tal cual, no reinventado.
// ─────────────────────────────────────────────────────────────────────────────

function addDays(fecha: Date, n: number): Date {
  const d = new Date(fecha);
  d.setDate(d.getDate() + n);
  return d;
}

export function inicioSemana(fecha: Date): Date {
  const d = new Date(fecha);
  const dia = d.getDay();
  d.setDate(d.getDate() - (dia === 0 ? 6 : dia - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

export interface RangoFechas {
  desde: string;
  hasta: string;
}

export function rangoDia(fecha: Date): RangoFechas {
  const desde = new Date(fecha);
  desde.setHours(0, 0, 0, 0);
  return { desde: desde.toISOString(), hasta: addDays(desde, 1).toISOString() };
}

export function rangoSemana(fecha: Date): RangoFechas {
  const desde = inicioSemana(fecha);
  return { desde: desde.toISOString(), hasta: addDays(desde, 7).toISOString() };
}

export function inicioMes(fecha: Date): Date {
  const d = new Date(fecha);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function rangoMes(fecha: Date): RangoFechas {
  const desde = inicioMes(fecha);
  const hasta = new Date(desde);
  hasta.setMonth(hasta.getMonth() + 1);
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

export function claveRango(r: RangoFechas): string {
  return `${r.desde}_${r.hasta}`;
}
