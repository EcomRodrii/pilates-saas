// Veri*Factu — cuándo puede salir el siguiente registro de un estudio.
//
// ⚠️ ESTE FICHERO AÍSLA DECISIONES NO CONFIRMADAS POR LA AEAT. Todo lo que no
// está en una fuente oficial está aquí, con nombre propio, para cambiarlo en un
// solo sitio el día que la AEAT (o una asesoría) lo aclare.
//
// Lo que SÍ es firme y no es una política:
//   · Los registros de un estudio salen en orden de secuencia (la cadena).
//   · Un registro no sale mientras el anterior no haya terminado su viaje: si el
//     anterior está ENVIANDO o INCIERTO, el siguiente espera.
//
// Lo que NO está confirmado y se decide aquí (ver cada constante):
//   1. ¿Se puede mandar el N si el N-1 fue RECHAZADO? (el RegistroAnterior del N
//      apunta a un registro que la AEAT no tiene).
//   2. ¿Se puede mandar el N si el N-1 es HISTÓRICO, sellado y nunca remitido?

import type { EstadoRegistroVerifactu } from './estado.ts';

/**
 * 1 · N-1 RECHAZADO → ¿seguir o esperar a su subsanación?
 *
 * Por qué 'continuar': la FAQ de desarrolladores de la AEAT (§17, caso 2.b) dice
 * que un registro rechazado «no figuraría jamás en los sistemas de la AEAT» y
 * que se corrige con un alta de subsanación «sin registro previo» (RechazoPrevio
 * = X). No dice que la cadena deba pararse, y parar deja facturas sin remitir,
 * que es justo lo que la norma no quiere. Tampoco dice que la AEAT acepte sin
 * marca un `RegistroAnterior` que apunte a un rechazado: NO CONFIRMADO.
 * 'esperar_subsanacion' bloquea el estudio hasta que el rechazado tenga una
 * subsanación admitida (nunca «para siempre»).
 */
export const TRAS_ANTERIOR_RECHAZADO: 'continuar' | 'esperar_subsanacion' = 'continuar';

/**
 * 2 · N-1 HISTÓRICO (sellado antes de la transmisión propia, nunca remitido).
 *
 * 'esperar_decision' porque es la opción que no decide nada por su cuenta: la
 * migración 20260905030122 dejó el histórico fuera de la cola a propósito, y el
 * cuadro de operativas de la AEAT tiene una vía para esos registros («alta de
 * subsanación sin registro previo», S/X), pero mandarlos o no es una decisión
 * pendiente (TODO en la migración de `verifactu_registros`). Mientras tanto, un
 * estudio cuya cadena arranca en histórico no transmite y lo dice.
 */
export const TRAS_ANTERIOR_HISTORICO: 'continuar' | 'esperar_decision' = 'esperar_decision';

export type MotivoEspera =
  | 'ANTERIOR_EN_CURSO'
  | 'ANTERIOR_INCIERTO'
  | 'ANTERIOR_RESERVADO'
  | 'ANTERIOR_RECHAZADO_SIN_SUBSANAR'
  | 'ANTERIOR_HISTORICO_SIN_DECIDIR';

/**
 * ¿Puede salir un registro, a la vista de su ANTERIOR en la cadena?
 * `anterior` null = es el primero de la cadena. Devuelve null si puede salir.
 */
export function motivoEsperaPorAnterior(
  anterior: { estado: EstadoRegistroVerifactu; subsanadoEnAeat?: boolean } | null,
): MotivoEspera | null {
  if (!anterior) return null;
  switch (anterior.estado) {
    case 'REGISTRADA':
    case 'ACEPTADA_CON_ERRORES':
    case 'ANULADA_EN_AEAT':
      return null;
    case 'RECHAZADA':
      if (TRAS_ANTERIOR_RECHAZADO === 'continuar' || anterior.subsanadoEnAeat) return null;
      return 'ANTERIOR_RECHAZADO_SIN_SUBSANAR';
    case 'HISTORICO':
      return TRAS_ANTERIOR_HISTORICO === 'continuar' ? null : 'ANTERIOR_HISTORICO_SIN_DECIDIR';
    case 'INCIERTO':
      return 'ANTERIOR_INCIERTO';
    case 'RESERVADO':
      return 'ANTERIOR_RESERVADO';
    // PENDIENTE, LISTO, ENVIANDO, REINTENTAR: aún no ha terminado su viaje. Si
    // va en el mismo lote (se envían juntos y en orden), no bloquea: eso lo
    // decide `loteEnviable`.
    default:
      return 'ANTERIOR_EN_CURSO';
  }
}
