// ─────────────────────────────────────────────────────────────────────────────
// Un pago correcto de una clase acaba SIEMPRE en una reserva o en una
// compensación registrada (P06 · Fase A, 6-oct-2026).
//
// Lo que devuelve la reserva tras pagar (`reservarPlazaTrasPagoPublico`) se
// traduce aquí al estado de su fila de `pagos_clase`:
//   · RESERVADA   — tiene la plaza y la ha pagado ESTE pago;
//   · COMPENSADA  — el dinero está, la plaza no (o no la pagó este pago): la
//                   clase queda a su favor en lo que compró, con su motivo;
//   · reintentar  — un fallo que no es una regla (la base no contestó): sigue
//                   PAGADO y el barrido del conciliador lo vuelve a intentar.
// Y si pagó por un sitio que otro cogió primero, una vez sin sitio.
//
// Puro, sin `@/`.
// ─────────────────────────────────────────────────────────────────────────────

export type MotivoCompensacion =
  | 'EN_ESPERA' | 'PENDIENTE_APROBACION' | 'SIN_PLAZA' | 'YA_TENIA_RESERVA'
  | 'CLASE_CERRADA' | 'PAGADO_SIN_USAR' | 'RECHAZADA' | 'ERROR';

/** Lo que devuelve `reservarPlazaTrasPagoPublico`, recortado. */
export type ReservaTrasPago =
  | { ok: true; estado: string; reservaId: string }
  | { ok: false; motivo: string; detalle?: string };

export type DestinoPagoClase =
  | { tipo: 'reservada' }
  | { tipo: 'compensada'; motivo: MotivoCompensacion }
  | { tipo: 'reintentar' }
  | { tipo: 'reintentar-sin-sitio' };

/** Tras cuántos intentos fallidos (el webhook + el barrido) se da por perdido y se compensa con ERROR. */
export const MAX_INTENTOS_RESERVA = 3;

/** La prioridad en la cola solo la tiene quien pagó poco después de comprobar la plaza (pregunta 7 del diseño). */
export const MINUTOS_PRIORIDAD = 20;

export function destinoDelPago(r: ReservaTrasPago, p: {
  /** Ya se reintentó sin el sitio pedido. */
  sinSitio: boolean;
  /**
   * Con CONFIRMADA: ¿la reserva la pagó lo que entregó este pago? (su `bono_suscripcion_id`
   * es la suscripción entregada, o lo entregado es una cuota que cubre la clase sin gastar).
   */
  pagadaConLoEntregado: boolean;
}): DestinoPagoClase {
  if (r.ok) {
    if (r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA') {
      return p.pagadaConLoEntregado ? { tipo: 'reservada' } : { tipo: 'compensada', motivo: 'PAGADO_SIN_USAR' };
    }
    if (r.estado === 'LISTA_ESPERA') return { tipo: 'compensada', motivo: 'EN_ESPERA' };
    if (r.estado === 'PENDIENTE_APROBACION') return { tipo: 'compensada', motivo: 'PENDIENTE_APROBACION' };
    // Un estado que no esperamos: no se da por reservada.
    return { tipo: 'compensada', motivo: 'ERROR' };
  }
  switch (r.motivo) {
    case 'spot-ocupado':
      return p.sinSitio ? { tipo: 'compensada', motivo: 'SIN_PLAZA' } : { tipo: 'reintentar-sin-sitio' };
    case 'ya-tenia-reserva':
      return { tipo: 'compensada', motivo: 'YA_TENIA_RESERVA' };
    case 'sesion-no-encontrada':
      return { tipo: 'compensada', motivo: 'CLASE_CERRADA' };
    case 'sesion-invalida': {
      const d = (r.detalle ?? '').toLowerCase();
      if (d.includes('clase completa')) return { tipo: 'compensada', motivo: 'SIN_PLAZA' };
      if (d.includes('cancelada') || d.includes('ya empezada') || d.includes('ventana')) return { tipo: 'compensada', motivo: 'CLASE_CERRADA' };
      return { tipo: 'compensada', motivo: 'RECHAZADA' };
    }
    default:
      return { tipo: 'reintentar' };
  }
}

/** ¿Va con prioridad en la cola? Solo en espera, y si pagó como mucho `MINUTOS_PRIORIDAD` después de comprobar la plaza. */
export function conPrioridadEnLaCola(motivo: MotivoCompensacion, plazaComprobadaEn: string | null, pagadoEn: string | null): boolean {
  if (motivo !== 'EN_ESPERA' || !plazaComprobadaEn || !pagadoEn) return false;
  const delta = new Date(pagadoEn).getTime() - new Date(plazaComprobadaEn).getTime();
  return Number.isFinite(delta) && delta >= 0 && delta <= MINUTOS_PRIORIDAD * 60_000;
}
