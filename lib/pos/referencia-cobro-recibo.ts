// ─────────────────────────────────────────────────────────────────────────────
// «Vengo a pagar la cuota» con datáfono o Bizum (`app/api/pos/recibo`): qué se
// hace cuando no se puede guardar la referencia del cobro.
//
// La ruta lee el recibo, arranca el cobro con el proveedor y después guarda
// `cobro_mostrador_pi` con un compare-and-set sobre el estado y la referencia
// leídos. Hay dos maneras de que eso no quede guardado, y en las dos hay un cobro
// en vuelo (datáfono esperando tarjeta, enlace de Bizum abierto) al que el
// mostrador no puede volver a preguntar — el sondeo de `confirmar` diría «no llegó
// a iniciarse»:
//
// - El UPDATE no toca ninguna fila: el recibo se borró, cambió de estado (lo cobró
//   otro canal, se anuló…) o otro arranque simultáneo ya guardó SU referencia.
// - El UPDATE da error: no se sabe si llegó. Antes se seguía como si nada.
//
// En los dos casos se cancela con el proveedor, se vuelve a preguntar y se
// responde error sin prometer una cancelación que no se ha confirmado.
//
// Puro, sin Supabase ni Stripe, para probarlo con node --test.
// ─────────────────────────────────────────────────────────────────────────────

import type { EstadoPagoPOS } from './tipos.ts';

export type TrasGuardarReferencia = 'SEGUIR' | 'CANCELAR';

/**
 * Solo se sigue con la referencia guardada de verdad: sin error y con la fila
 * tocada… o, sin tocar fila, si la que hay guardada es ESTE mismo cobro: dos
 * peticiones del mismo intento comparten clave y Stripe les da el mismo cobro, y
 * la que llega segunda cancelaría el bueno.
 */
export function trasGuardarReferencia(
  r: { error: boolean; tocadas: number; yaGuardadaEsLaMisma?: boolean },
): TrasGuardarReferencia {
  if (r.error) return 'CANCELAR';
  return r.tocadas > 0 || r.yaGuardadaEsLaMisma ? 'SEGUIR' : 'CANCELAR';
}

/**
 * La clave de idempotencia del cobro de un recibo en el mostrador: identifica
 * ESTE intento (el toque de quien cobra), nunca el recibo. Con el recibo y la
 * referencia previa, tras cancelar o un rechazo la referencia se suelta y la
 * clave volvía a ser la del primer intento: Stripe devolvía el cobro muerto y el
 * datáfono no llegaba a pedir la tarjeta durante 24 h (medido en modo de prueba,
 * 5-oct-2026). `null` si el intento no llega o no tiene forma: quien llama usa
 * uno nuevo del servidor.
 */
export function claveCobroRecibo(reciboId: string, metodo: string, intentoId: unknown): string | null {
  if (typeof intentoId !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(intentoId)) return null;
  return `pos-recibo-${reciboId}-${metodo}-${intentoId}`;
}

/** Por qué se cancela: el recibo cambió (0 filas) o no se pudo guardar (error). */
export type MotivoCancelacion = 'CAMBIO' | 'ERROR_AL_GUARDAR';

const CAMBIO = 'Este recibo ha cambiado mientras se preparaba el cobro (se ha cobrado por otro lado o ya no está).';
const SIN_GUARDAR = 'No hemos podido registrar el cobro.';

/**
 * Qué se contesta tras pedir la cancelación, según lo que diga el proveedor al
 * volver a preguntarle. Cancelar es best-effort (`lib/pos/terminal.ts`): solo
 * CANCELADO (o EXPIRADO) confirma que no hay cobro; con cualquier otra cosa no se
 * promete nada.
 *
 * HTTP: 409 si el recibo cambió (hay que recargar); 503 si fue un fallo al
 * guardar (el recibo sigue igual y se puede reintentar).
 */
export function respuestaTrasCancelar(
  estado: EstadoPagoPOS, motivo: MotivoCancelacion,
): { mensaje: string; confirmado: boolean; http: 409 | 503 } {
  const http = motivo === 'CAMBIO' ? 409 : 503;
  const causa = motivo === 'CAMBIO' ? CAMBIO : SIN_GUARDAR;
  if (estado === 'CANCELADO' || estado === 'EXPIRADO') {
    return {
      confirmado: true, http,
      mensaje: motivo === 'CAMBIO'
        ? `${CAMBIO} Hemos cancelado el cobro. Recarga la página antes de volver a cobrar.`
        : 'No se ha podido iniciar el cobro: vuelve a intentarlo.',
    };
  }
  if (estado === 'PAGADO') {
    return { confirmado: false, http, mensaje: `${causa} El pago ya había entrado: no lo vuelvas a cobrar y revisa el recibo en Cobros.` };
  }
  return {
    confirmado: false, http,
    mensaje: `${causa} Hemos pedido cancelar el cobro, pero no podemos confirmarlo todavía: si la alumna llega a pagar, no se lo vuelvas a cobrar. Revisa el recibo en Cobros.`,
  };
}
