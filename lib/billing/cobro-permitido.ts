// ¿Se puede intentar cobrar este recibo ahora? LA regla, en un solo sitio.
//
// Auditoría de cobros (16-sep): el cobro automático diario cobraba recibos de
// cuotas ya CANCELADAS (solo bloqueaba PAUSADA). Decisión del fundador:
//   · una cuota cancelada NO genera cobros nuevos, y cada intento automático
//     comprueba el estado ACTUAL de la cuota;
//   · lo que pasa con el recibo que ya estaba pendiente al cancelar lo decide la
//     política del estudio, que queda escrita EN EL RECIBO al cancelar
//     (`recibos.tras_cancelar_cuota`): REINTENTAR, SIN_REINTENTOS o ANULADO.
//     Así lo que prometió la ventana de cancelar sigue siendo cierto aunque el
//     estudio cambie la política después.
//
// Los recibos sin cuota (matrícula, penalizaciones, ventas sueltas) no se tocan:
// `cuota === null` pasa siempre. El pago de la alumna (checkout, portal) y el
// mostrador siguen con `esReciboCobrable`, que ya excluye ANULADO por ser una
// lista cerrada de estados.
//
// Puro: se prueba con `node --test`.

/** Quién intenta cobrar. AUTOMATICO = el cobro diario; STAFF = alguien del estudio lo pide a mano. */
export type ViaCobro = 'AUTOMATICO' | 'STAFF';

export type MarcaTrasCancelarCuota = 'REINTENTAR' | 'SIN_REINTENTOS' | 'ANULADO';

export interface ReciboParaCobrar {
  estado: string;
  proximoReintento: string | null;
  trasCancelarCuota: MarcaTrasCancelarCuota | null;
}

export type MotivoSinCobro =
  | 'ANULADO' | 'NO_PENDIENTE' | 'SIN_REINTENTO_PROGRAMADO' | 'SIN_REINTENTOS' | 'CUOTA_PAUSADA' | 'CUOTA_CANCELADA';

export function puedeIntentarCobro(
  recibo: ReciboParaCobrar,
  cuota: { estado: string } | null,
  via: ViaCobro,
): { ok: true } | { ok: false; motivo: MotivoSinCobro } {
  if (recibo.estado === 'ANULADO' || recibo.trasCancelarCuota === 'ANULADO') return { ok: false, motivo: 'ANULADO' };

  if (via === 'STAFF') {
    // Lo de siempre: una persona del estudio decide cobrar un pendiente o un
    // fallido. Una cuota PAUSADA está congelada y no se cobra; una CANCELADA sí
    // (puede ser deuda real), salvo que el recibo esté anulado (arriba).
    if (recibo.estado !== 'PENDIENTE' && recibo.estado !== 'FALLIDO') return { ok: false, motivo: 'NO_PENDIENTE' };
    if (cuota?.estado === 'PAUSADA') return { ok: false, motivo: 'CUOTA_PAUSADA' };
    return { ok: true };
  }

  // AUTOMATICO: solo un PENDIENTE con reintento programado y sin la marca de
  // «sin reintentos».
  if (recibo.estado !== 'PENDIENTE') return { ok: false, motivo: 'NO_PENDIENTE' };
  if (recibo.trasCancelarCuota === 'SIN_REINTENTOS') return { ok: false, motivo: 'SIN_REINTENTOS' };
  if (!recibo.proximoReintento) return { ok: false, motivo: 'SIN_REINTENTO_PROGRAMADO' };
  if (cuota === null || cuota.estado === 'ACTIVA') return { ok: true };
  if (cuota.estado === 'PAUSADA') return { ok: false, motivo: 'CUOTA_PAUSADA' };
  // CANCELADA (o EXPIRADA): solo si al cancelar el estudio dijo «sigue
  // reintentando». Un recibo sin marca de una cuota ya cancelada no se cobra
  // solo: falla cerrado si la marca no llegó a escribirse.
  return recibo.trasCancelarCuota === 'REINTENTAR' ? { ok: true } : { ok: false, motivo: 'CUOTA_CANCELADA' };
}

/**
 * ¿Puede la adopción de renovaciones programarle reintentos a este recibo? Solo
 * con la cuota ACTIVA y un recibo pendiente que nadie marcó al cancelar.
 */
export function puedeArmarReintento(recibo: ReciboParaCobrar, cuota: { estado: string } | null): boolean {
  return recibo.estado === 'PENDIENTE' && recibo.trasCancelarCuota === null && cuota?.estado === 'ACTIVA';
}
