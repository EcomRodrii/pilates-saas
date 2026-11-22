// ─────────────────────────────────────────────────────────────────────────────
// Cuándo se pide valorar una clase y cuándo se enseña el enlace de reseñas.
// Sin imports ni `@/` (ver reglas.ts): `node --test` no resuelve ese alias.
//
// Cómo lo hacen los grandes (Mindbody, Podium, Birdeye): se pide JUSTO tras la
// clase, no 12 horas después. Aquí, 20 minutos después de que termine (para que
// la clienta ya esté fuera del estudio y el estudio haya pasado lista) y mientras
// la clase tenga menos de 48 h.
//
// ⚠️ Estos números viven DOS veces: aquí y en el predicado del cron de pg_cron
// (`valoraciones-pedir`, migración 20261121094512). El predicado de la base de
// datos tiene que ser IGUAL o MÁS AMPLIO que la consulta de la ruta, nunca más
// estrecho: uno más estrecho dejaría clases sin pedir en silencio. Lo cruza
// `premio-contrato.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────

/** Cuánto se espera tras el fin de la clase antes de pedir la valoración. */
export const ESPERA_TRAS_CLASE_MS = 20 * 60 * 1000;

/** Hasta cuándo se sigue pidiendo una clase que no se ha podido pedir (el estudio pasa lista tarde). */
export const VENTANA_VALORACION_MS = 48 * 60 * 60 * 1000;

/**
 * Cuántas clases tiene que haber ASISTIDO una clienta antes de enseñarle el enlace
 * de reseñas: es cuando ya conoce el estudio. Decide la ASISTENCIA, nunca la nota
 * (Google prohíbe pedir reseñas solo a quien está contento).
 */
export const CLASES_ANTES_DE_PEDIR_RESENA = 3;

/** Cada cuántos días, como mucho, se le vuelve a enseñar el enlace a la misma clienta. */
export const DIAS_ENTRE_PETICIONES_RESENA = 180;

export interface LimitesBarrido {
  /** Las clases que terminaron DESPUÉS de esto (ISO). */
  desdeISO: string;
  /** Y ANTES de esto (ISO): las más recientes todavía no se piden. */
  hastaISO: string;
}

/** Las clases que ya toca pedir, vistas desde `ahoraMs`. */
export function limitesDeBarrido(ahoraMs: number): LimitesBarrido {
  return {
    desdeISO: new Date(ahoraMs - VENTANA_VALORACION_MS).toISOString(),
    hastaISO: new Date(ahoraMs - ESPERA_TRAS_CLASE_MS).toISOString(),
  };
}

/** La ruta con seguimiento a la que apuntan el botón de la app y el QR (`origen` solo se cuenta). */
export function rutaEnlaceResenas(slug: string, origen: 'app' | 'qr'): string {
  return origen === 'app' ? `/resena/${slug}?o=app` : `/resena/${slug}`;
}
