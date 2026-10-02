// Qué se le ofrece a quien reserva cuando el servidor dice que no.
//
// El servidor ya rechazaba con un `codigo` estable (`lib/student/reserva-codigos.ts`): eso dice POR QUÉ.
// Faltaba lo otro: qué puede HACER la persona ahora. Sin eso cada pantalla lo deducía por su cuenta, y
// la deducción más repetida era la peor: comparar la FRASE del error («necesitas un plan…») para decidir
// si enseñar el botón de comprar (`seArreglaComprando`, lib/bono-logic.ts). Cualquier retoque de copy o
// una traducción lo rompía en silencio.
//
// Aquí la acción cuelga del CÓDIGO, en una sola tabla. `Record<CodigoReserva, …>` obliga a que cada código
// nuevo diga qué se ofrece: añadir uno sin fila no compila.
//
// ⚠️ Son SUGERENCIAS para quien pinte la pantalla (PWA, widget, API v1, panel), no órdenes ni permisos: el
// servidor sigue siendo quien decide si una reserva se puede hacer. Y una acción que no se pueda ofrecer en
// ese sitio (el widget no tiene «ver mis reservas») se omite, no se inventa.
//
// Sin imports con alias: `node --test` no resuelve `@/`.

import type { CodigoReserva } from './reserva-codigos.ts';

export type TipoAccion =
  /** Comprar un bono o suscripción (la alumna no tiene derecho a reservar o no le cubre esta clase). */
  | 'comprar_plan'
  /** Ver las clases que SÍ cubre su plan. */
  | 'ver_clases_incluidas'
  /** Ver sus reservas (ya tiene esta, o choca con otra). */
  | 'ver_mis_reservas'
  /** Elegir otra clase u otro día. */
  | 'elegir_otra_clase'
  /** Elegir otro sitio en la sala. */
  | 'elegir_otro_sitio'
  /** Hablar con el estudio (impago, autorización, tope que solo el estudio puede saltarse). */
  | 'contactar_estudio'
  /** Contestar las preguntas que el estudio pide antes de reservar. */
  | 'completar_preguntas'
  /** Volver a iniciar sesión. */
  | 'iniciar_sesion'
  /** Intentarlo de nuevo: solo cuando el fallo NO es una regla de negocio. */
  | 'reintentar';

export const ACCIONES_POR_CODIGO: Record<CodigoReserva, readonly TipoAccion[]> = {
  // Derechos: lo que se arregla comprando.
  'sin-plan': ['comprar_plan'],
  'bono-no-cubre': ['comprar_plan', 'ver_clases_incluidas'],
  // Topes de la cuota: no se arreglan comprando; el estudio decide si hace una excepción.
  'limite-semanal': ['elegir_otra_clase', 'contactar_estudio'],
  'limite-semanal-actividad': ['elegir_otra_clase', 'ver_clases_incluidas', 'contactar_estudio'],
  'max-simultaneas': ['ver_mis_reservas', 'elegir_otra_clase'],
  'max-por-dia': ['ver_mis_reservas', 'elegir_otra_clase'],
  // La clase.
  'aforo-lleno': ['elegir_otra_clase'],
  'ya-reservada': ['ver_mis_reservas'],
  'conflicto-horario': ['ver_mis_reservas', 'elegir_otra_clase'],
  'spot-ocupado': ['elegir_otro_sitio'],
  'spot-no-disponible': ['elegir_otro_sitio'],
  'sesion-no-encontrada': ['elegir_otra_clase'],
  'clase-cancelada': ['elegir_otra_clase'],
  'clase-ya-empezada': ['elegir_otra_clase'],
  'fuera-ventana-minima': ['elegir_otra_clase'],
  'fuera-ventana-maxima': ['elegir_otra_clase'],
  'estudio-cerrado': ['elegir_otra_clase'],
  // El estudio.
  'necesita-autorizacion': ['contactar_estudio'],
  'impago': ['contactar_estudio'],
  'apertura-suave': ['contactar_estudio'],
  'faltan-preguntas': ['completar_preguntas'],
  // La sesión.
  'no-autorizado': ['iniciar_sesion'],
  // El comodín: «me ha pasado algo que no sé nombrar».
  'error': ['reintentar'],
};

/**
 * Las acciones que se le ofrecen ante un rechazo. Un código que no conocemos (un servidor más nuevo que
 * este cliente) cae en `reintentar`: es lo único que no promete nada que no se sepa.
 */
export function accionesDeRechazo(codigo: unknown): TipoAccion[] {
  if (typeof codigo === 'string' && Object.hasOwn(ACCIONES_POR_CODIGO, codigo)) {
    return [...ACCIONES_POR_CODIGO[codigo as CodigoReserva]];
  }
  return ['reintentar'];
}

/**
 * ¿Este rechazo se arregla comprando? Por CÓDIGO, no por la frase: sustituye a la comparación de texto
 * de `seArreglaComprando` (lib/bono-logic.ts), que sigue como respaldo para respuestas sin código.
 */
export function seArreglaComprandoPorCodigo(codigo: unknown): boolean {
  return accionesDeRechazo(codigo).includes('comprar_plan');
}
