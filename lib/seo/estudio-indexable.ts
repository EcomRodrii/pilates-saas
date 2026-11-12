// ─────────────────────────────────────────────────────────────────────────────
// ¿Debe Google indexar la página de reservas de un estudio (/reservar/<slug>)?
//
// Se abrieron a indexación el 2026-08-17 con un solo criterio: no estar oculta.
// Medido el 25-sep-2026, eso dejaba en el índice páginas que no deben estar: el
// estudio de demostración del propio equipo, pruebas de altas que nunca
// arrancaron y estudios cuya prueba caducó sin llegar a usarse (horario de 800
// clases y ni una alumna). Contenido fino bajo tentare.app, y para quien busque
// la marca, lo primero que ve es una demo.
//
// Indexable solo lo que es un estudio REAL y EN USO:
//  · visible (no la ha ocultado la propietaria),
//  · no suspendido ni marcado como demo (`studios.es_demo`),
//  · con suscripción viva (en prueba o pagando),
//  · con horario (al menos una clase futura)
//  · con vida: al menos una reserva en los últimos 90 días
//  · y con alumnas de verdad: `MIN_SOCIAS_INDEXABLE` fichas vivas. Medido el 13-nov-2026: de los 13 estudios indexados, 11 tenían de 5 a 79
//    alumnas y los otros dos eran pruebas del equipo (0 y 1 alumna) que pasaban el resto de criterios con una sola reserva suelta.
// El sitemap y el `robots` de la página usan ESTA función: si dijeran cosas
// distintas, Google recibiría en el sitemap páginas que luego le prohibimos.
//
// Pura y sin `@/`: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export interface SenalesEstudio {
  oculta: boolean;
  suspendido: boolean;
  esDemo: boolean;
  estadoSuscripcion: string | null;
  clasesFuturas: number;
  reservasRecientes: number;
  /** Fichas de alumna vivas (no borradas) del estudio. */
  sociasActivas: number;
}

/** Alumnas vivas mínimas para que la página de un estudio entre en el índice. */
export const MIN_SOCIAS_INDEXABLE = 3;

/** Días hacia atrás en los que tiene que haber alguna reserva. */
export const DIAS_ACTIVIDAD_INDEXABLE = 90;

/** Una suscripción viva: en prueba, pagando (con un cobro fallido a medias sigue siendo cliente) o en Founding Studio gratis. */
const SUSCRIPCION_VIVA = new Set(['active', 'trialing', 'past_due', 'gratis']);

export function paginaEstudioIndexable(s: SenalesEstudio): boolean {
  if (s.oculta || s.suspendido || s.esDemo) return false;
  if (!s.estadoSuscripcion || !SUSCRIPCION_VIVA.has(s.estadoSuscripcion)) return false;
  return s.clasesFuturas > 0 && s.reservasRecientes > 0 && s.sociasActivas >= MIN_SOCIAS_INDEXABLE;
}
