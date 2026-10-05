// Normas de la comunidad de la app (App Store 1.2: «términos que se aceptan
// antes de publicar, con tolerancia cero para el contenido ofensivo»).
//
// Se aceptan UNA vez por cuenta y versión, y lo guarda el servidor
// (`normas_comunidad_aceptaciones`, migr 20261005150100): sin aceptarlas, las
// rutas que escriben en el chat o en el tablón responden 409
// `NORMAS_PENDIENTES` y la app enseña estas normas antes de enviar.
//
// ⚠️ Cambiar el TEXTO de forma que cambie lo que se acepta = subir la VERSIÓN:
// todo el mundo las vuelve a aceptar al escribir. Una errata no lo necesita.
//
// Puro, sin `@/`: se prueba con `node --test`.

export const VERSION_NORMAS = '2026-10-05';

/** Lo que responde el servidor cuando faltan por aceptar (409). */
export const CODIGO_NORMAS_PENDIENTES = 'NORMAS_PENDIENTES';
export const TEXTO_NORMAS_PENDIENTES = 'Antes de escribir, acepta las normas de la comunidad.';

export const NORMAS_COMUNIDAD = {
  titulo: 'Normas de la comunidad',
  intro: 'El chat y el tablón son para hablar con tu estudio y con tu instructora. Para escribir, aceptas estas normas:',
  puntos: [
    'Tolerancia cero con los insultos, el acoso, las amenazas y el contenido sexual, violento, discriminatorio o que incite al odio.',
    'Nada de datos personales de otras personas, publicidad ni enlaces a sitios ajenos al estudio.',
    'Si algo te molesta, denúncialo desde el propio mensaje o comentario, o bloquea a esa persona. Lo revisa tu estudio y, si hace falta, Tentare.',
    'El estudio puede retirar lo que no cumpla estas normas y cerrar la conversación.',
  ],
} as const;

/** Lo que pide la ruta para registrar la aceptación: la versión que se ha leído. */
export function versionValida(v: unknown): boolean {
  return v === VERSION_NORMAS;
}
