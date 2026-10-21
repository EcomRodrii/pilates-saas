// ─────────────────────────────────────────────────────────────────────────────
// El correo del código (correo 1 del alta nueva) en la plantilla del PROYECTO.
//
// Lo que se envía no es `supabase/templates/confirmation.html`: es la plantilla
// que el proyecto de Supabase tiene guardada (Management API,
// `mailer_templates_confirmation_content` y `mailer_subjects_confirmation`), y
// es UNA para todas las altas (equipo, alumnas, Network, el alta de siempre). El
// fichero del repo es la referencia: lleva la rama nueva y, debajo, la de
// siempre.
//
// Al aplicarlo, la rama de siempre NO sale del repo sino de lo que hay en
// producción (el GET que se guarda antes): si alguien la retocó a mano en el
// panel de Supabase, el repo no lo sabe, y pisarla cambiaría el correo de todas
// las altas. Esto compone las dos cosas y dice si coincidían.
//
// Lo usa scripts/alta-nueva-plantilla-codigo.ts (docs/alta-nueva-correo-del-codigo.md).
// Puro: lo prueba `plantilla-codigo.test.ts`.
// ─────────────────────────────────────────────────────────────────────────────

/** Abre la rama nueva: solo la ve quien lleva `alta_nueva: true` en la metadata (lib/alta/registro.ts). */
export const APERTURA = '{{ if .Data.alta_nueva -}}\n';
/** Cierra la rama nueva y abre la de siempre (un comentario de plantilla: no sale en el correo). */
export const SEPARADOR = '{{/* fin de la rama del alta nueva: lo de abajo es la plantilla de siempre, byte a byte */}}{{ else }}';
/** Cierra el condicional y se come el salto de línea final del fichero. */
export const CIERRE = '{{ end -}}\n';

/** El asunto nuevo: el código se lee en la notificación sin abrir el correo. */
export const ASUNTO_ALTA_NUEVA = '{{ .Token }} es tu código · Te damos la bienvenida a Tentare';

export interface PlantillaDelRepo {
  /** La rama nueva, tal cual se envía. */
  nueva: string;
  /** La de siempre, como está en el repo. */
  deSiempre: string;
}

/** Parte `supabase/templates/confirmation.html` en sus dos ramas. Lanza si no tiene la forma acordada. */
export function partirPlantillaDelRepo(fichero: string): PlantillaDelRepo {
  if (!fichero.startsWith(APERTURA)) throw new Error('La plantilla del repo no empieza por el condicional del alta nueva.');
  if (!fichero.endsWith(CIERRE)) throw new Error('La plantilla del repo no termina con su cierre.');
  const cuerpo = fichero.slice(APERTURA.length, fichero.length - CIERRE.length);
  const partes = cuerpo.split(SEPARADOR);
  if (partes.length !== 2) throw new Error('La plantilla del repo tiene que llevar el separador una sola vez.');
  return { nueva: partes[0], deSiempre: partes[1] };
}

/**
 * El asunto condicional: el nuevo para el alta nueva y, para todas las demás,
 * el que tenga hoy el proyecto, sin tocar.
 */
export function asuntoCondicional(asuntoDeHoy: string): string {
  return `{{ if .Data.alta_nueva }}${ASUNTO_ALTA_NUEVA}{{ else }}${asuntoDeHoy}{{ end }}`;
}

export interface Composicion {
  contenido: string;
  asunto: string;
  /** ¿La rama de siempre del repo es exactamente lo que hay hoy en producción? */
  laDeSiempreCoincide: boolean;
  /** ¿El proyecto ya tenía el alta nueva puesta? (aplicarlo dos veces anidaría el condicional). */
  yaAplicada: boolean;
}

/**
 * Lo que se manda en el PATCH: la rama nueva del repo y, como rama de siempre,
 * lo que hay HOY en producción (byte a byte). Si producción ya tiene el
 * condicional, no se compone nada encima: se avisa.
 */
export function componerPlantillaCodigo(o: {
  ficheroDelRepo: string;
  contenidoDeHoy: string;
  asuntoDeHoy: string;
}): Composicion {
  // Vacío = el proyecto usa la plantilla por defecto de Supabase. Componer sobre
  // eso dejaría a todas las demás altas con un correo en blanco: no se sigue.
  if (!o.contenidoDeHoy.trim()) throw new Error('El proyecto no tiene plantilla de confirmación propia: no se compone nada.');
  if (!o.asuntoDeHoy.trim()) throw new Error('El proyecto no tiene asunto de confirmación propio: no se compone nada.');
  const repo = partirPlantillaDelRepo(o.ficheroDelRepo);
  const yaAplicada = o.contenidoDeHoy.includes('.Data.alta_nueva') || o.asuntoDeHoy.includes('.Data.alta_nueva');
  return {
    contenido: `${APERTURA}${repo.nueva}${SEPARADOR}${o.contenidoDeHoy}${CIERRE}`,
    asunto: asuntoCondicional(o.asuntoDeHoy),
    laDeSiempreCoincide: repo.deSiempre === o.contenidoDeHoy,
    yaAplicada,
  };
}
