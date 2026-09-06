// Lo que `reservar_plaza` lanza, dicho en castellano.
//
// ⚠️ Esto es para el PANEL (recepción), no para la alumna. La app tiene su
// propia tabla (`lib/student/reserva-codigos.ts`) porque el mensaje no es el
// mismo: a la socia se le explica lo suyo, a recepción se le dice qué HACER.
//
// Por qué existe en un módulo aparte y no como cuatro `if` dentro del cliente:
// `dbReservarPlaza` traducía DOS de los catorce códigos que la RPC puede lanzar
// y devolvía `error.message` crudo para el resto. Apuntar a una socia que ya
// estaba en la clase mostraba literalmente «YA_RESERVADA» en pantalla. El
// comentario que había al lado del segundo `if` («sin esto, a recepción le
// salía literalmente NECESITA_AUTORIZACION») demuestra que el patrón se conocía
// — se arregló el ejemplar, no la familia.
//
// Un `Record` completo cierra la familia: el test estructural saca los
// `raise exception` de la migración viva y exige que TODOS estén aquí, así que
// añadir un código nuevo a la RPC sin traducirlo rompe la suite.

/** Traducción por código. Las claves son los `raise exception` de la RPC. */
export const MENSAJE_RESERVA_RPC: Record<string, string> = {
  YA_RESERVADA: 'Ya está apuntada a esta clase.',
  CONFLICTO_HORARIO: 'Ya tiene otra clase o cita a esa misma hora.',
  AFORO_LLENO_SIN_ESPERA: 'La clase está llena y este tipo de clase no admite lista de espera.',
  LIMITE_SEMANAL: 'Ha alcanzado el máximo de clases por semana de su plan.',
  NECESITA_AUTORIZACION: 'Esta clase es solo para alumnas autorizadas. Autorízala en su ficha y vuelve a apuntarla.',
  RESERVA_BLOQUEADA_IMPAGO: 'Tiene un recibo sin cobrar. Márcalo como cobrado desde Cobros y vuelve a apuntarla.',
  ESTUDIO_CERRADO: 'El estudio está cerrado ese día. Quita el cierre desde Configuración → Horario si de verdad abrís.',
  SPOT_OCUPADO: 'Ese sitio lo acaba de coger otra persona.',
  SPOT_NO_DISPONIBLE: 'Ese sitio no está disponible.',
  SPOT_NO_PERTENECE_A_LA_SALA: 'Ese sitio no es de esta sala.',
  SESION_NO_ENCONTRADA: 'Esa clase ya no existe. Recarga el calendario.',
  // Los tres de abajo son fallos de programa o de sesión, no del mostrador: no
  // se le cuenta el detalle interno, pero tampoco se le enseña el código.
  NO_AUTORIZADO: 'No tienes permiso para apuntar a nadie en esta clase.',
  STUDIO_MISMATCH: 'Esa clase no es de este estudio. Recarga la página.',
  SOCIO_NO_PERTENECE_AL_STUDIO: 'Esa clienta no es de este estudio. Recarga la página.',
};

/**
 * El mensaje para un error de la RPC.
 *
 * Devuelve `null` cuando no reconoce nada: quien llama decide si enseña un
 * genérico o reporta. NO se devuelve el `message` crudo por defecto — ese era
 * justo el agujero por el que salían los códigos a pantalla.
 */
export function mensajeDeErrorReserva(mensajeCrudo: string | null | undefined): string | null {
  if (!mensajeCrudo) return null;
  for (const [codigo, texto] of Object.entries(MENSAJE_RESERVA_RPC)) {
    if (mensajeCrudo.includes(codigo)) return texto;
  }
  return null;
}
