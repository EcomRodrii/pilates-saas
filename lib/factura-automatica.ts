import type { MetodoCobro } from '@/lib/types';

// ─────────────────────────────────────────────────────────────────────────────
// ¿Se emite factura SOLA al cobrar?
//
// Hasta ahora no lo decidía nadie: se emitía siempre que hubiera recibo, por
// las dos vías que cobran (el TPV de mostrador y «marcar cobrado» en /cobros).
// Medido en producción antes de tocarlo: de 12 ventas en efectivo del TPV, las
// 3 que tenían recibo llevaban factura; y de 6 recibos cobrados en efectivo,
// 4 la llevaban.
//
// El efectivo se queda fuera por decisión del estudio.
//
// ⚠️ Esto NO dice «una venta en efectivo no puede tener factura». Dice que no se
// emite AUTOMÁTICAMENTE. La obligación de facturar en España no depende del
// medio de pago, y una clienta puede pedirla: la vía manual («generar factura»
// desde /cobros) sigue intacta a propósito, y sigue sellando y numerando por la
// misma cadena Veri*Factu. Quitar también esa vía sería otra decisión, y
// tendría que pedirse.
//
// ⚠️ Y no toca nada de lo ya emitido. Una factura numerada no se borra: si
// alguna hay que deshacerla, es con una RECTIFICATIVA, que es a su vez un
// registro. En el momento de escribir esto, ninguna factura de efectivo había
// llegado a la AEAT (las 4 que existían estaban en `PENDIENTE` o sin estado, y
// todas en el estudio de pruebas).
// ─────────────────────────────────────────────────────────────────────────────

/** Métodos que NO generan factura por su cuenta al cobrar. */
const SIN_FACTURA_AUTOMATICA: ReadonlySet<string> = new Set<MetodoCobro>(['EFECTIVO']);

/**
 * ¿Debe emitirse la factura sola al registrar este cobro?
 *
 * `null`/`undefined` = no se sabe cómo se cobró. Se factura, que es lo que se
 * venía haciendo: 38 de los recibos de producción tienen `metodo_cobro` a NULL
 * (cobros antiguos y de pasarela), y dejar de facturarlos por no saber el medio
 * sería un cambio mucho mayor que el que se ha pedido.
 */
export function emiteFacturaAutomatica(metodo: MetodoCobro | string | null | undefined): boolean {
  if (!metodo) return true;
  return !SIN_FACTURA_AUTOMATICA.has(metodo.toUpperCase());
}
