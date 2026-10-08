import type { MetodoCobro, ModoFacturacion } from '@/lib/types';

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
export function emiteFacturaAutomatica(
  metodo: MetodoCobro | string | null | undefined,
  /**
   * El modo del estudio (`Studio.modoFacturacion`). Con 'sin_facturas' no se
   * emite nada, se cobre como se cobre. `null` = no se sabe todavía (el panel
   * sin estudio cargado): no se emite. Sin pasarlo, como antes: los caminos de
   * servidor lo resuelven en `sellarFacturaDeRecibo`, que lee el estudio.
   */
  modo: ModoFacturacion | null = 'verifactu',
  /**
   * El ajuste del estudio «Facturar automáticamente» (`Studio.facturarAutomatico`,
   * 9-oct-2026). Apagado, no sale ninguna factura sola, se cobre como se cobre;
   * la manual sigue disponible. Independiente de Veri*Factu. `undefined` = como
   * de serie (encendido): así un servidor desplegado antes que la migración
   * sigue haciendo lo de siempre.
   */
  facturarAutomatico: boolean | null | undefined = true,
): boolean {
  if (facturarAutomatico === false) return false;
  if (!emiteFacturas(modo)) return false;
  if (!metodo) return true;
  return !SIN_FACTURA_AUTOMATICA.has(metodo.toUpperCase());
}

/**
 * ¿Emite facturas este estudio? Desde el 2-oct-2026, SIEMPRE ('facturas', sin
 * envío a la AEAT, o 'verifactu', con él). 'sin_facturas' queda como estado de
 * sistema que nadie elige. `null` = el panel aún no tiene el estudio: no.
 */
export function emiteFacturas(modo: ModoFacturacion | null | undefined): boolean {
  return modo === 'facturas' || modo === 'verifactu';
}

/** Lo que se le dice a quien pide una factura con el estudio en 'sin_facturas'. */
export const MENSAJE_SIN_FACTURAS =
  'Las facturas de este estudio no están activas. Escríbenos y lo revisamos.';
