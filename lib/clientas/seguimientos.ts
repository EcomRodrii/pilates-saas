// SEGUIMIENTOS de una clienta: «recuérdame llamarla el lunes». Una tarea con
// fecha sobre una socia (tabla `tareas`, migr …_tareas_seguimientos), que ese
// día sale en «Por decidir» del Resumen a quien la tiene (o a todo el mostrador
// si no es de nadie) y en la ficha de la clienta.
//
// Puro: lo usan la ruta (validar), la ficha y la lista (textos), y los tests.

export const TITULO_SEGUIMIENTO_MAX = 200;
/** Hasta cuándo se puede poner un seguimiento: un año. */
const DIAS_MAX = 365;

export interface SeguimientoValido {
  socioId: string;
  titulo: string;
  /** 'YYYY-MM-DD' (calendario del estudio). */
  venceEl: string;
  /** Cuenta de quien lo hará; null = quien lo crea (lo resuelve la ruta). */
  asignadaA: string | null;
  recomendacionId: string | null;
}

const ES_DIA = /^\d{4}-\d{2}-\d{2}$/;
export const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function diasEntre(desde: string, hasta: string): number {
  const ms = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10)));
  return Math.round((ms(hasta) - ms(desde)) / 86_400_000);
}

/** Un día real ('2026-02-30' no lo es) entre hoy y dentro de un año. */
export function validarFechaSeguimiento(venceEl: unknown, hoyISO: string): { ok: true; venceEl: string } | { ok: false; error: string } {
  if (typeof venceEl !== 'string' || !ES_DIA.test(venceEl)) return { ok: false, error: 'Elige para cuándo.' };
  const d = new Date(`${venceEl}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== venceEl) return { ok: false, error: 'Esa fecha no existe.' };
  const n = diasEntre(hoyISO, venceEl);
  if (n < 0) return { ok: false, error: 'No se puede poner un seguimiento en el pasado.' };
  if (n > DIAS_MAX) return { ok: false, error: 'Como mucho, dentro de un año.' };
  return { ok: true, venceEl };
}

export function validarSeguimiento(cuerpo: unknown, hoyISO: string): { ok: true; seguimiento: SeguimientoValido } | { ok: false; error: string } {
  const c = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>;
  if (typeof c.socioId !== 'string' || !c.socioId) return { ok: false, error: 'Falta la clienta.' };
  const titulo = typeof c.titulo === 'string' ? c.titulo.trim() : '';
  if (!titulo) return { ok: false, error: 'Escribe qué hay que hacer.' };
  if (titulo.length > TITULO_SEGUIMIENTO_MAX) return { ok: false, error: `Como mucho ${TITULO_SEGUIMIENTO_MAX} caracteres.` };
  const fecha = validarFechaSeguimiento(c.venceEl, hoyISO);
  if (!fecha.ok) return fecha;
  let asignadaA: string | null = null;
  if (c.asignadaA !== undefined && c.asignadaA !== null && c.asignadaA !== '') {
    if (typeof c.asignadaA !== 'string' || !ES_UUID.test(c.asignadaA)) return { ok: false, error: 'Esa persona no es del equipo.' };
    asignadaA = c.asignadaA;
  }
  const recomendacionId = typeof c.recomendacionId === 'string' && c.recomendacionId ? c.recomendacionId : null;
  return { ok: true, seguimiento: { socioId: c.socioId, titulo, venceEl: fecha.venceEl, asignadaA, recomendacionId } };
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function sumarDias(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Atajos para elegir fecha: mañana, el próximo lunes, en una semana, en dos. */
export function atajosDeFecha(hoyISO: string): { venceEl: string; texto: string }[] {
  const dow = new Date(`${hoyISO}T12:00:00Z`).getUTCDay();
  const hastaLunes = ((8 - dow) % 7) || 7;
  const atajos = [
    { venceEl: sumarDias(hoyISO, 1), texto: 'Mañana' },
    { venceEl: sumarDias(hoyISO, hastaLunes), texto: 'El lunes' },
    { venceEl: sumarDias(hoyISO, 7), texto: 'En una semana' },
    { venceEl: sumarDias(hoyISO, 14), texto: 'En dos semanas' },
  ];
  // Si mañana ya es lunes, «El lunes» sobra.
  return atajos.filter((a, i, todos) => todos.findIndex(b => b.venceEl === a.venceEl) === i);
}

export type CuandoVence = 'ATRASADO' | 'HOY' | 'PROXIMO';

export function cuandoVence(venceEl: string, hoyISO: string): CuandoVence {
  return venceEl < hoyISO ? 'ATRASADO' : venceEl === hoyISO ? 'HOY' : 'PROXIMO';
}

/** «hoy», «mañana», «el lunes 6», «el 14 oct», «hace 2 días» (atrasado). */
export function textoVence(venceEl: string, hoyISO: string): string {
  const n = diasEntre(hoyISO, venceEl);
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  if (n < 0) return `hace ${-n} días`;
  const d = new Date(`${venceEl}T12:00:00Z`);
  if (n < 7) return `el ${DIAS[d.getUTCDay()]} ${d.getUTCDate()}`;
  return `el ${d.getUTCDate()} ${MESES[d.getUTCMonth()]}${venceEl.slice(0, 4) === hoyISO.slice(0, 4) ? '' : ` ${venceEl.slice(0, 4)}`}`;
}

/** El título que se propone al venir de un aviso: «Llamar a Laura: viene menos». */
export function tituloPropuesto(nombre: string, etiquetaAviso: string | null): string {
  return etiquetaAviso ? `Hablar con ${nombre}: ${etiquetaAviso.toLowerCase()}` : `Hablar con ${nombre}`;
}
