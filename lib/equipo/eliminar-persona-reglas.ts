// Eliminar definitivamente a una persona del equipo (art. 17 RGPD): quién puede, cuándo,
// y qué se le cuenta a quien lo pide. Puro, sin I/O ni alias `@/`: lo comparten la ruta
// (app/api/equipo/eliminar), la pantalla de Equipo y sus tests.
//
// «Dar de baja» y «eliminar definitivamente» son DOS cosas:
//   · dar de baja (`activo = false`): la persona sale de los listados y pierde el acceso,
//     pero su ficha (nombre, email, teléfono, foto, cuenta) sigue entera. Se puede
//     reactivar.
//   · eliminar definitivamente: solo sobre alguien YA de baja. Anonimiza la ficha, borra lo
//     suyo y su cuenta de acceso (si no la usa en otro sitio). No se puede deshacer.
//     Lo hace `anonimizar_instructor` (migraciones 20260927024813 y 20260927030914).

import type { TerceroPendiente } from '../socios/terceros-supresion.ts';

/**
 * El nombre con el que queda una ficha eliminada (el literal de `anonimizar_instructor`, atado por un
 * test). La pantalla de Equipo no la lista: una tarjeta sin ningún dato no le sirve a nadie, y sus clases
 * y jornadas siguen a su nombre donde hagan falta.
 */
export const NOMBRE_PERSONA_ELIMINADA = 'Persona eliminada';

export type MotivoNoSePuede = 'SOLO_PROPIETARIA' | 'ES_UNA_MISMA' | 'ES_PROPIETARIA' | 'SIGUE_ACTIVA';

export type Veredicto = { ok: true } | { ok: false; motivo: MotivoNoSePuede; mensaje: string; http: number };

const MENSAJES: Record<MotivoNoSePuede, { mensaje: string; http: number }> = {
  SOLO_PROPIETARIA: { mensaje: 'Solo la propietaria puede eliminar definitivamente a alguien del equipo.', http: 403 },
  ES_UNA_MISMA: { mensaje: 'No puedes eliminar tu propia ficha.', http: 409 },
  ES_PROPIETARIA: { mensaje: 'La propietaria del estudio no se puede eliminar.', http: 409 },
  SIGUE_ACTIVA: { mensaje: 'Primero da de baja a esta persona. Solo se elimina definitivamente a quien ya no forma parte del equipo.', http: 409 },
};

/**
 * ¿Puede `rolActor` eliminar definitivamente a esta persona? Es la regla de la ruta Y de la
 * pantalla (que solo ofrece el botón cuando sale `ok`): la cerradura real está en la ruta y
 * en la base de datos, la pantalla solo evita ofrecer lo que se va a rechazar.
 */
export function puedeEliminarDefinitivamente(p: {
  rolActor: string;
  esPropia: boolean;
  rolDeLaPersona: string | null;
  activa: boolean;
}): Veredicto {
  const no = (motivo: MotivoNoSePuede): Veredicto => ({ ok: false, motivo, ...MENSAJES[motivo] });
  if (p.rolActor !== 'PROPIETARIO') return no('SOLO_PROPIETARIA');
  if (p.esPropia) return no('ES_UNA_MISMA');
  if (p.rolDeLaPersona === 'PROPIETARIO') return no('ES_PROPIETARIA');
  if (p.activa) return no('SIGUE_ACTIVA');
  return { ok: true };
}

/** Los códigos que lanza `anonimizar_instructor` (el mensaje de la excepción ES el código). */
export const CODIGOS_RPC: Record<string, { mensaje: string; http: number }> = {
  PERSONA_NO_ENCONTRADA: { mensaje: 'No encontramos a esa persona en tu equipo.', http: 404 },
  PERSONA_ACTIVA: MENSAJES.SIGUE_ACTIVA,
  ES_PROPIETARIA: MENSAJES.ES_PROPIETARIA,
  TIENE_CLASES_FUTURAS: {
    mensaje: 'Todavía tiene clases o citas por venir. Pásalas a otra persona (o cancélalas) antes de eliminarla.',
    http: 409,
  },
  TIENE_LIQUIDACION_SIN_PAGAR: {
    mensaje: 'Tiene una liquidación sin pagar (en borrador o confirmada). Págala o descártala antes de eliminarla.',
    http: 409,
  },
  TIENE_JORNADA_ABIERTA: {
    mensaje: 'Tiene una jornada abierta o pendiente de revisar. Ciérrala o revísala en Tiempo trabajado antes de eliminarla.',
    http: 409,
  },
};

export const ERROR_GENERICO = 'No se ha podido eliminar a esta persona. Inténtalo de nuevo.';

/** Traduce el error de la RPC a una frase para la propietaria. Nunca enseña el mensaje crudo de la base de datos. */
export function interpretarErrorEliminarPersona(mensaje: string | null | undefined): { error: string; http: number } {
  const codigo = (mensaje ?? '').trim();
  const conocido = Object.hasOwn(CODIGOS_RPC, codigo) ? CODIGOS_RPC[codigo] : null;
  return conocido ? { error: conocido.mensaje, http: conocido.http } : { error: ERROR_GENERICO, http: 500 };
}

/**
 * Lo que quedó sin borrar fuera de la base de datos (la cuenta de acceso, la foto), para decírselo a la propietaria.
 * El de las socias habla de «la clienta»: aquí es una persona del equipo. Lo pendiente se puede reintentar desde
 * Equipo: la ficha sigue apareciendo (como «Persona eliminada») mientras quede algo.
 */
export function avisoPendientesEquipo(pendientes: readonly Pick<TerceroPendiente, 'tercero'>[]): string | null {
  if (pendientes.length === 0) return null;
  const partes = [...new Set(pendientes.map(p => (p.tercero === 'foto_avatar' ? 'su foto' : 'su cuenta de acceso')))];
  return `Los datos de esta persona se han borrado de tu estudio, pero ${partes.join(' y ')} no se ha podido borrar todavía. `
    + 'Vuelve a intentarlo desde Equipo (aparece como «Persona eliminada»); si persiste, escríbenos a soporte.';
}

/**
 * Por qué su nombre NO se buscó dentro de los textos libres (feed de actividad, avisos de otras personas, recomendaciones):
 * `UNA_PALABRA` (no se distingue de otra persona con ese nombre) o `AMBIGUO` (otra persona del equipo o una socia lo lleva
 * o lo contiene). Lo dice `anonimizar_instructor`. Esos textos se quedan como están.
 */
export type MotivoNombreSinReconocer = 'UNA_PALABRA' | 'AMBIGUO';

export function avisoNombreSinReconocer(motivo: unknown): string | null {
  if (motivo === 'UNA_PALABRA') {
    return 'Su nombre tiene una sola palabra y no se puede reconocer con seguridad en los textos de actividad y avisos '
      + '(podría ser el de otra persona): esos textos no se han tocado.';
  }
  if (motivo === 'AMBIGUO') {
    return 'Su nombre coincide con el de otra persona de tu estudio, así que no se ha buscado en los textos de actividad y avisos: '
      + 'esos textos no se han tocado.';
  }
  return null;
}

/**
 * ¿Se podrá reconocer su nombre dentro de los textos libres? Es la misma regla que `anonimizar_instructor` aplica a
 * un nombre (dos palabras o más, tres letras o más). Que además nadie más lo lleve solo lo sabe la base de datos.
 */
export function nombreSePuedeReconocerEnTextos(nombre: string): boolean {
  const limpio = nombre.trim();
  return limpio.length >= 3 && limpio.split(/\s+/).length >= 2;
}

/** Lo que se conserva y por qué, para el diálogo de confirmación. */
export const SE_CONSERVA_SIN_SU_NOMBRE =
  'Se conserva, sin su nombre ni ningún dato de contacto, lo que la ley obliga a guardar: sus jornadas, las clases que dio, '
  + 'sus liquidaciones y las clases y citas ya pasadas. Aparecerán a nombre de «Persona eliminada».';

export const SE_BORRA =
  'Se borran su nombre, email, teléfono, foto y cuenta de acceso (si no la usa en otro sitio); su disponibilidad, '
  + 'ausencias y motivos de baja; las valoraciones sobre ella; sus mensajes de equipo y sus avisos; y las '
  + 'conexiones a integraciones (como Zapier) que ella autorizó.';

/**
 * Lo que la eliminación NO alcanza y hay que decir (los textos dicen la verdad): las copias de seguridad ya hechas
 * caducan solas (diarias 14 días, semanales 8 semanas, mensuales 12 meses) y pueden llevar su ficha; y un nombre de
 * pila suelto, o con una errata, escrito a mano en un texto libre no se puede reconocer con seguridad.
 */
export const LO_QUE_NO_ALCANZA =
  'No alcanza a las copias de seguridad que ya existen (caducan solas, como mucho en 12 meses, y pueden llevar su ficha) '
  + 'ni a su nombre de pila suelto escrito a mano en un texto libre.';

/** Solo si su nombre tiene una palabra: el diálogo lo avisa ANTES, porque no se puede reconocer con seguridad. */
export const NOMBRE_DE_UNA_PALABRA_NO_SE_BUSCA =
  'Como su nombre tiene una sola palabra, tampoco se busca en los textos de actividad y avisos (podría ser el de otra '
  + 'persona): esos textos se quedan como están.';

/** Reintentar lo que quedó pendiente de una eliminación ya hecha (cuenta de acceso o foto). */
export const COMPLETAR_ELIMINACION =
  'Los datos de esta persona ya se borraron de tu estudio, pero falta terminar de borrar su cuenta de acceso o su foto. '
  + 'Vuelve a intentarlo.';

export const NO_SE_PUEDE_DESHACER = 'Esto no se puede deshacer.';
