// ─────────────────────────────────────────────────────────────────────────────
// Migración · incidencias del acta.
//
// El acta decía «32 incidencias» o «76 incidencias» y se acababa ahí: ni cuáles
// ni por qué, y cerraba con «¿Todo cuadra? Ya está — no había más que hacer».
// Además las cifras no cuadraban (1.065 importadas + 76 incidencias ≠ 1.103
// filas) porque cada importador cuenta la fila sin socia/sin clase dos veces: en
// su contador (`sinSocia`, `sinSesion`) Y en su lista de errores.
//
// Aquí se decide, UNA vez y de forma pura:
//   · cuántas filas tuvieron problema (sin contar dos veces),
//   · cuáles, agrupadas por motivo, con ejemplos,
//   · y el CSV que se puede descargar para corregirlas.
// ─────────────────────────────────────────────────────────────────────────────

/** Cuántos errores por fila devuelve cada importador (antes 50, y se quedaba corto). */
export const MAX_ERRORES_DEVUELTOS = 500;

export interface ErrorDeFila { fila: number; motivo: string; email?: string }

/** Lo que cada importador devuelve, en lo que a incidencias respecta. */
export interface ResultadoParaIncidencias {
  errores?: readonly ErrorDeFila[];
  sinSocia?: number;
  sinSesion?: number;
  sinInstructor?: number;
  sinSala?: number;
  sinServicioCatalogo?: number;
  omitidasPorSolape?: number;
  /** Cuántos errores hubo EN TOTAL cuando la lista devuelta se cortó en `MAX_ERRORES_DEVUELTOS`. */
  totalErrores?: number;
}

export interface GrupoIncidencia {
  /** El motivo, con lo variable (emails, clases, fechas) sustituido por «…». */
  motivo: string;
  /** Filas del archivo con este motivo. */
  cuantas: number;
  /** Las primeras filas, con su motivo literal. */
  ejemplos: { fila: number; motivo: string }[];
}

export interface IncidenciasDeEntidad {
  /** Filas del archivo que no entraron del todo. */
  total: number;
  grupos: GrupoIncidencia[];
  /** Cosas que entraron pero a medias, que no traen fila (p. ej. «sin instructora»). */
  notas: string[];
  /** Los errores devueltos, completos, para el CSV. */
  filas: ErrorDeFila[];
}

const MAX_EJEMPLOS = 3;

/** El motivo sin lo que cambia de una fila a otra: es lo que agrupa. */
export function plantillaDeMotivo(motivo: string): string {
  return motivo
    .replace(/[^\s@«»"]+@[^\s@«»"]+\.[^\s@«»".]+/g, '…')   // emails
    .replace(/«[^»]*»/g, '«…»')
    .replace(/"[^"]*"/g, '"…"')
    .replace(/\d{4}-\d{2}-\d{2}/g, '…')                     // fechas
    .replace(/\b\d{1,2}:\d{2}\b/g, '…')                     // horas
    .replace(/\s+/g, ' ')
    .trim();
}

export function agruparIncidencias(errores: readonly ErrorDeFila[]): GrupoIncidencia[] {
  const grupos = new Map<string, GrupoIncidencia>();
  for (const e of errores) {
    const clave = plantillaDeMotivo(e.motivo);
    let g = grupos.get(clave);
    if (!g) { g = { motivo: clave, cuantas: 0, ejemplos: [] }; grupos.set(clave, g); }
    g.cuantas++;
    if (g.ejemplos.length < MAX_EJEMPLOS) g.ejemplos.push({ fila: e.fila, motivo: e.motivo });
  }
  // Con una sola fila, el motivo literal es más útil que la plantilla.
  for (const g of grupos.values()) if (g.cuantas === 1) g.motivo = g.ejemplos[0].motivo;
  return [...grupos.values()].sort((a, b) => b.cuantas - a.cuantas);
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function incidenciasDeImportacion(r: ResultadoParaIncidencias): IncidenciasDeEntidad {
  const filas = [...(r.errores ?? [])];
  // `sinSocia` y `sinSesion` YA vienen dentro de `errores` (una entrada por
  // fila); el tope de lo devuelto puede dejar fuera algunas, así que se toma el
  // mayor de los números — nunca la suma. Y se cuentan FILAS, no entradas: una
  // clase que se pisa por sala Y por instructora genera dos errores para una fila.
  const filasConError = new Set(filas.map(f => f.fila)).size;
  const sinEmparejar = (r.sinSocia ?? 0) + (r.sinSesion ?? 0);
  const total = Math.max(filasConError, sinEmparejar, r.totalErrores ?? 0);

  // Entraron, pero a medias: no son filas que no han entrado, así que se dicen sin
  // contarlas como incidencia (no impiden dar el acta por buena).
  const notas: string[] = [];
  if (r.sinInstructor) notas.push(`${plural(r.sinInstructor, 'fila', 'filas')} con una instructora que no existe o no es un nombre válido (vacío, «-», «N/A», varias personas en la misma celda): ${r.sinInstructor === 1 ? 'entró' : 'entraron'} sin instructora asignada.`);
  if (r.sinSala) notas.push(`${plural(r.sinSala, 'fila', 'filas')} con una sala que no existe en tu estudio: ${r.sinSala === 1 ? 'entró' : 'entraron'} sin sala.`);
  if (r.sinServicioCatalogo) notas.push(`${plural(r.sinServicioCatalogo, 'cita', 'citas')} con un servicio que no está en tu catálogo: se dedujo su tipo del texto.`);

  return { total, grupos: agruparIncidencias(filas), notas, filas };
}

/** El CSV que se descarga con todas las incidencias del acta, para corregirlas y volver a subir. */
export function incidenciasACsv(entidades: readonly { etiqueta: string; filas: readonly ErrorDeFila[] }[]): string {
  // Excel ejecuta como fórmula una celda de texto que empieza por = + - @ (o tab/CR):
  // se antepone un apóstrofo. Hoy ningún motivo empieza por un dato del archivo,
  // pero el motivo cita lo que traía (emails, clases): mejor no depender de ello.
  const celda = (v: string | number) => {
    const t = String(v);
    return `"${(typeof v === 'string' && /^[=+\-@\t\r]/.test(t) ? `'${t}` : t).replace(/"/g, '""')}"`;
  };
  const lineas = [['Archivo', 'Fila', 'Motivo'].map(celda).join(',')];
  for (const e of entidades) for (const f of e.filas) lineas.push([e.etiqueta, f.fila, f.motivo].map(celda).join(','));
  return lineas.join('\r\n');
}
