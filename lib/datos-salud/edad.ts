// ─────────────────────────────────────────────────────────────────────────────
// Edad de la socia y umbral para consentir por sí misma sus datos de salud.
//
// Puro y sin dependencias: lo usan la ruta de la alumna, la del panel y el
// diálogo de la ficha, y se prueba con `node --test`.
//
// «Hoy» es el día del ESTUDIO (Europe/Madrid), no el del servidor (UTC en
// Vercel) ni el del navegador: a las 00:30 de su cumpleaños en Madrid, en UTC
// todavía es la víspera y la alumna saldría un día más pequeña.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ REVISIÓN LEGAL NECESARIA. Edad a partir de la cual una persona consiente
 * por sí misma el tratamiento de sus datos (LOPDGDD art. 7: 14 años). Se aplica
 * al consentimiento de datos de salud (art. 9 RGPD) por decisión de producto.
 *
 * Si el dictamen fija otro umbral, se cambia AQUÍ y en la migración
 * `20260914015114_consentimiento_salud_menores_portal.sql`, que repite el
 * número en `consentimiento_salud_cambiar` como defensa en profundidad (lo
 * vigila `lib/rgpd-menores-aceptacion-contrato.test.ts`).
 */
export const EDAD_MINIMA_CONSENTIMIENTO_SALUD = 14;

/** Por encima de esto, la fecha se trata como un error de tecleo. */
export const EDAD_MAXIMA_PLAUSIBLE = 120;

const TZ_ESTUDIO = 'Europe/Madrid';

interface Dia { y: number; m: number; d: number }

/** 'YYYY-MM-DD' estricto y que exista en el calendario (nada de 30 de febrero). */
function leerDia(v: string): Dia | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mes = Number(m[2]);
  const d = Number(m[3]);
  const f = new Date(Date.UTC(y, mes - 1, d));
  if (f.getUTCFullYear() !== y || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== d) return null;
  return { y, m: mes, d };
}

function diaDeHoy(hoy: Date | string): Dia | null {
  if (typeof hoy === 'string') return leerDia(hoy);
  if (Number.isNaN(hoy.getTime())) return null;
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_ESTUDIO, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(hoy);
  return leerDia(iso);
}

/**
 * Años cumplidos en `hoy`, o `null` si la fecha no sirve (vacía, mal escrita,
 * inexistente o posterior a hoy).
 *
 * Nacer un 29 de febrero: en un año no bisiesto se cumple el 1 de marzo, no el
 * 28. Es la lectura conservadora (un día más tarde, nunca antes) y la misma que
 * da Postgres con `fecha - interval '14 years'`, así que TS y SQL no discrepan.
 */
export function edadEnFecha(fechaNacimiento: unknown, hoy: Date | string): number | null {
  if (typeof fechaNacimiento !== 'string') return null;
  const n = leerDia(fechaNacimiento);
  const h = diaDeHoy(hoy);
  if (!n || !h) return null;
  let edad = h.y - n.y;
  if (h.m < n.m || (h.m === n.m && h.d < n.d)) edad--;
  return edad < 0 ? null : edad;
}

/**
 * ¿Es menor de la edad mínima para consentir sus datos de salud?
 *
 * ⚠️ Una fecha que falta o no es válida da `false`: NO se asume menor. Pero
 * tampoco se da por adulta — quien decide qué hacer sin fecha es
 * `consentimientoSaludPorEdad`, que la pide antes de dejar consentir.
 */
export function esMenorDeEdadConsentimiento(fechaNacimiento: unknown, hoy: Date | string): boolean {
  const edad = edadEnFecha(fechaNacimiento, hoy);
  return edad !== null && edad < EDAD_MINIMA_CONSENTIMIENTO_SALUD;
}

export type ConsentimientoSaludPorEdad = 'PUEDE' | 'MENOR' | 'FALTA_FECHA';

/** Qué permite la edad: consentir ella, gestionarlo el estudio con su tutor, o pedir antes la fecha. */
export function consentimientoSaludPorEdad(fechaNacimiento: unknown, hoy: Date | string): ConsentimientoSaludPorEdad {
  const edad = edadEnFecha(fechaNacimiento, hoy);
  if (edad === null || edad > EDAD_MAXIMA_PLAUSIBLE) return 'FALTA_FECHA';
  return edad < EDAD_MINIMA_CONSENTIMIENTO_SALUD ? 'MENOR' : 'PUEDE';
}

/** La fecha de nacimiento que teclea la alumna, validada. `null` si no vale. */
export function normalizarFechaNacimiento(v: unknown, hoy: Date | string): string | null {
  if (typeof v !== 'string') return null;
  const limpia = v.trim();
  const edad = edadEnFecha(limpia, hoy);
  if (edad === null || edad > EDAD_MAXIMA_PLAUSIBLE) return null;
  return limpia;
}
