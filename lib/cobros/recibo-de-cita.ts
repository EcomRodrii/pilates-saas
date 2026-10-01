// ─────────────────────────────────────────────────────────────────────────────
// El recibo de una cita tiene un id DETERMINISTA: `rec-cita-<id de la cita>`.
//
// Cobrar una cita crea un recibo pendiente y lo cobra el servidor (`crearFacturaDirecta`).
// Con un id al azar por clic, un cobro que no se llegaba a confirmar dejaba el recibo
// pendiente en «Quién me debe» y, tras recargar la página, el siguiente clic en «Confirmar
// cobro» creaba OTRO: dos recibos por la misma cita, y el segundo cobrable. El cerrojo de la
// pantalla (`recibosGenerados`) vivía en memoria y no sobrevivía a la recarga.
//
// Con el id derivado de la cita, «esta cita ya tiene su recibo» deja de ser un hecho de la
// pantalla y pasa a ser un hecho de la base de datos: la clave primaria impide el segundo, y
// quien cobra lo encuentra y sigue con él (`decidirReciboPrevioDeCita`). Es el mismo
// criterio que `rec-penaliz-<id>` y `rec-renov-…`: lo que se cobra una vez por motivo lleva
// el motivo en el id.
//
// Sin `@/` ni dependencias de UI: lo importan el contexto del panel y los tests (`node --test`).
// ─────────────────────────────────────────────────────────────────────────────

import { LONGITUD_MAXIMA_ID_RECIBO } from './marcar-cobrado.ts';
import { situacionRecibo } from '../billing/situacion-recibo.ts';

export const PREFIJO_RECIBO_DE_CITA = 'rec-cita-';

/**
 * El id del recibo de esta cita, o `null` si el id de la cita no cabe en uno válido (la ruta de
 * cobro solo acepta `[A-Za-z0-9_-]` y un largo acotado). Hoy los ids de cita son `cita-<uid>`
 * (21 caracteres) y siempre caben: el `null` es el cierre del caso latente, y quien llama
 * NO debe inventarse otro id al azar —sería volver al bug— sino decir que esa cita no se
 * puede cobrar desde aquí.
 */
export function idReciboDeCita(citaId: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(citaId)) return null;
  const id = `${PREFIJO_RECIBO_DE_CITA}${citaId}`;
  return id.length <= LONGITUD_MAXIMA_ID_RECIBO ? id : null;
}

/**
 * Lo que hace falta saber del recibo que YA existía para decidir si es el de este cobro.
 * Lleva lo devuelto y el reembolso porque «cobrado» no basta (ver `situacionRecibo`): un cobrado
 * con todo el dinero ya devuelto no es un cobro de esta cita.
 */
export interface ReciboPrevioDeCita {
  estado: string;
  importe: number;
  socioId: string | null;
  importeDevuelto: number | null;
  reembolsoStripeId: string | null;
  reembolsoSolicitadoEn: string | null;
}

export type DecisionReciboPrevio =
  /** Es el recibo de este cobro: se sigue con él (el servidor decide si se cobra o ya estaba cobrado). */
  | { tipo: 'seguir' }
  /** Existe pero no es lo mismo o no se puede cobrar ahora: no se toca y se manda a revisarlo. */
  | { tipo: 'revisar'; error: string };

const centimos = (euros: number) => Math.round(euros * 100);

/**
 * ¿El recibo que ya había con el id de esta cita es el de este cobro? Solo si cuadra el importe y la
 * clienta —si el precio de la cita cambió entre un intento y otro, cobrar el recibo viejo sería cobrar
 * un importe que la cita ya no dice, y marcarla pagada con él también— y, además, por su SITUACIÓN
 * (`situacionRecibo`, la misma que usan las cifras y la pantalla de Cobros):
 *  · por cobrar, impagado (fallido o devuelto por el banco) o cobrado → se sigue con él: el servidor
 *    arbitra (`confirmarCobro`: cobra, o «ya estaba cobrado» si el primer intento sí entró y solo se
 *    perdió la respuesta);
 *  · en curso → NO: hay un cobro en vuelo y el servidor no deja marcarlo a mano encima;
 *  · reembolsado o anulado → NO: no hay nada que cobrar, y marcar la cita pagada sería falso.
 */
export function decidirReciboPrevioDeCita(
  previo: ReciboPrevioDeCita,
  esperado: { socioId: string; importe: number },
): DecisionReciboPrevio {
  if (centimos(previo.importe) !== centimos(esperado.importe) || previo.socioId !== esperado.socioId) {
    return {
      tipo: 'revisar',
      error: 'Esta cita ya tiene un recibo con otro importe u otra clienta. Revísalo en «Quién me debe» antes de cobrarla.',
    };
  }
  switch (situacionRecibo(previo)) {
    case 'COBRADO':
    case 'POR_COBRAR':
    case 'IMPAGADO':
      return { tipo: 'seguir' };
    case 'EN_CURSO':
      return {
        tipo: 'revisar',
        error: 'Esta cita ya tiene un recibo con un cobro en curso (banco o tarjeta). Espera a que se resuelva y revísalo en «Quién me debe».',
      };
    case 'REEMBOLSADO':
      return { tipo: 'revisar', error: 'A esta cita ya se le devolvió el dinero. Revisa su recibo en «Quién me debe» antes de volver a cobrarla.' };
    case 'ANULADO':
      return { tipo: 'revisar', error: 'El recibo de esta cita está anulado. Revísalo en «Quién me debe» antes de volver a cobrarla.' };
  }
}
