// ─────────────────────────────────────────────────────────────────────────────
// Cómo se ordena y se busca «Tus alumnas»: primero las que tienen clase próxima
// con ella, por fecha, y después las demás, por nombre. El buscador ignora
// mayúsculas y acentos («ines» encuentra a «Inés»).
//
// Puro y sin dependencias: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export interface AlumnaParaAgrupar {
  nombre: string;
  proxima: { fecha: string; hora: string } | null;
}

export function normalizarBusqueda(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/** A partir de cuántas alumnas merece la pena un buscador. */
export const ALUMNAS_PARA_BUSCADOR = 7;

/**
 * Cómo le va con esta alumna, contado sobre sus clases pasadas CON ELLA (lo único
 * que ve: últimos 30 días). Solo cuentan las marcadas: una «sin marcar» no dice ni
 * que vino ni que no.
 */
export interface ResumenAsistencia {
  vino: number;
  noVino: number;
  sinMarcar: number;
}

export function resumenAsistencia(pasadas: ReadonlyArray<{ estado: string }>): ResumenAsistencia {
  let vino = 0; let noVino = 0; let sinMarcar = 0;
  for (const c of pasadas) {
    if (c.estado === 'asistio') vino++;
    else if (c.estado === 'no-vino') noVino++;
    else if (c.estado === 'sin-marcar') sinMarcar++;
  }
  return { vino, noVino, sinMarcar };
}

/** «Vino a 3 de 4 clases contigo», o null si no hay ninguna marcada. */
export function textoAsistencia(r: ResumenAsistencia): string | null {
  const marcadas = r.vino + r.noVino;
  if (marcadas === 0) return null;
  return `Vino a ${r.vino} de ${marcadas} ${marcadas === 1 ? 'clase' : 'clases'} contigo`;
}

export function agruparAlumnas<T extends AlumnaParaAgrupar>(
  alumnas: readonly T[], filtro = '',
): { conProxima: T[]; sinProxima: T[] } {
  const q = normalizarBusqueda(filtro);
  const visibles = q ? alumnas.filter((a) => normalizarBusqueda(a.nombre).includes(q)) : [...alumnas];
  const porNombre = (a: T, b: T) => a.nombre.localeCompare(b.nombre, 'es');
  const conProxima = visibles
    .filter((a) => a.proxima)
    .sort((a, b) => `${a.proxima!.fecha} ${a.proxima!.hora}`.localeCompare(`${b.proxima!.fecha} ${b.proxima!.hora}`) || porNombre(a, b));
  const sinProxima = visibles.filter((a) => !a.proxima).sort(porNombre);
  return { conProxima, sinProxima };
}
