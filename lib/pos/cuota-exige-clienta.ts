// ¿Se está cobrando en el TPV una CUOTA sin clienta?
//
// Un BONO o una clase suelta sin ficha se pueden cobrar a propósito: alguien
// entra de la calle a una clase de prueba y no da sus datos, y el bono queda
// «por asignar» hasta que se le pone ficha desde Ventas (migración
// 20260907170322_pos_venta_sin_ficha).
//
// Una CUOTA no. Es una relación que se renueva cada ciclo (mensual, trimestral
// o anual), no una clase suelta de alguien anónimo. Vendida sin clienta queda
// sin entregar a nadie, y en el caso real (10-sep) en vez de asignarla desde
// Ventas se volvió a dar de alta desde el panel: dos recibos cobrados por el
// mismo pago. Decisión del fundador (14-sep): una cuota exige clienta.
//
// Lo usan la pantalla (bloquea «Cobrar» y lo explica) y el servidor
// (`/api/pos/venta` lo rechaza igualmente: la UI no es la cerradura).

/** `tiposDePlan`: el `tipo` de cada plan del ticket (`MENSUAL`, `BONO`, `PUNTUAL`). */
export function cuotaSinClienta(
  tiposDePlan: ReadonlyArray<string | null | undefined>,
  socioId: string | null | undefined,
): boolean {
  if (socioId) return false;
  return tiposDePlan.some((t) => t === 'MENSUAL');
}

export const MENSAJE_CUOTA_SIN_CLIENTA = 'Una cuota necesita clienta: búscala o crea su ficha antes de cobrar.';
