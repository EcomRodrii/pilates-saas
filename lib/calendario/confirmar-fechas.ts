// `ConfirmarFechas` (P2.3): ver y quitar fechas antes de crear clases. Puro:
// agrupar por mes, nombrar el día, «todas / ninguna». Las fechas son días
// civiles YYYY-MM-DD: nunca `new Date('YYYY-MM-DD')` en local, que en UTC−x
// cae en el día anterior.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export interface FechaParaConfirmar {
  fecha: string;
  /** Clases que salen ese día. */
  clases: number;
  /** «Festivo en Cataluña: Todos los Santos»; null si no es festivo. */
  festivo: string | null;
  /** Una nota más (p. ej. «dijiste que abrís»). */
  nota?: string | null;
}

/** «martes 8» */
export function diaCorto(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()}`;
}

/** «Diciembre de 2026» */
export function tituloMes(mes: string): string {
  const nombre = MESES[Number(mes.slice(5, 7)) - 1] ?? mes;
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} de ${mes.slice(0, 4)}`;
}

/** Las fechas agrupadas por mes, en orden. */
export function porMes<T extends { fecha: string }>(fechas: readonly T[]): { mes: string; fechas: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const f of [...fechas].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const mes = f.fecha.slice(0, 7);
    grupos.set(mes, [...(grupos.get(mes) ?? []), f]);
  }
  return [...grupos.entries()].map(([mes, fs]) => ({ mes, fechas: fs }));
}

/** Clases que salen con lo marcado: lo que dice el botón. */
export function clasesMarcadas(fechas: readonly FechaParaConfirmar[], marcadas: ReadonlySet<string>): number {
  return fechas.reduce((n, f) => n + (marcadas.has(f.fecha) ? f.clases : 0), 0);
}

/** «Crear 16 clases», y el botón no se ofrece con 0. */
export function textoCrear(n: number): string {
  return n === 1 ? 'Crear 1 clase' : `Crear ${n} clases`;
}
