// ─────────────────────────────────────────────────────────────────────────────
// «Vengo a pagar la cuota» con datáfono o Bizum (`app/api/pos/recibo`): qué se
// hace cuando el recibo ya no está al guardar la referencia del cobro.
//
// La ruta lee el recibo, arranca el cobro con el proveedor y después guarda
// `cobro_mostrador_pi` con un compare-and-set sobre el estado leído. Si ese
// UPDATE no toca ninguna fila, el recibo se borró o cambió de estado entre medias
// (lo cobró otro canal, se anuló…) y hay un cobro en vuelo contra algo que ya no
// es lo que se leyó. Antes se seguía igual y el mostrador esperaba un pago sobre
// un recibo que no existía: ahora se cancela con el proveedor y se responde error.
//
// Puro, sin Supabase ni Stripe, para probarlo con node --test.
// ─────────────────────────────────────────────────────────────────────────────

import type { EstadoPagoPOS } from './tipos.ts';

export type TrasGuardarReferencia = 'SEGUIR' | 'CANCELAR';

/**
 * - Sin error y ninguna fila tocada → CANCELAR.
 * - Con error → SEGUIR, como hasta ahora: no se sabe si el UPDATE llegó, el cobro
 *   ya está lanzado y el webhook lo cierra por la metadata del recibo. Cancelar
 *   ahí sería parar un cobro bueno por un fallo de red.
 */
export function trasGuardarReferencia(r: { error: boolean; tocadas: number }): TrasGuardarReferencia {
  return !r.error && r.tocadas === 0 ? 'CANCELAR' : 'SEGUIR';
}

const CAMBIO = 'Este recibo ha cambiado mientras se preparaba el cobro (se ha cobrado por otro lado o ya no está).';

/**
 * Qué se contesta tras pedir la cancelación, según lo que diga el proveedor al
 * volver a preguntarle. Cancelar es best-effort (`lib/pos/terminal.ts`): solo
 * CANCELADO (o EXPIRADO) confirma que no hay cobro; con cualquier otra cosa no se
 * promete nada.
 */
export function respuestaTrasCancelar(estado: EstadoPagoPOS): { mensaje: string; confirmado: boolean } {
  if (estado === 'CANCELADO' || estado === 'EXPIRADO') {
    return { confirmado: true, mensaje: `${CAMBIO} Hemos cancelado el cobro. Recarga la página antes de volver a cobrar.` };
  }
  if (estado === 'PAGADO') {
    return { confirmado: false, mensaje: `${CAMBIO} El pago ya había entrado: no lo vuelvas a cobrar y revisa el recibo en Cobros.` };
  }
  return {
    confirmado: false,
    mensaje: `${CAMBIO} Hemos pedido cancelar el cobro, pero no podemos confirmarlo todavía: si la alumna llega a pagar, no se lo vuelvas a cobrar. Revisa el recibo en Cobros.`,
  };
}
