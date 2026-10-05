// ─────────────────────────────────────────────────────────────────────────────
// I-3: «cobrado pero sin plaza» — qué le dice el aviso al mostrador en cada
// situación y con qué clave se deduplica. Vive aparte de `emit.ts` (que arrastra
// alias `@/` y el motor) para poder fijarlo con `node --test`: la clave decide
// si un aviso de dinero EXISTE o se descarta en silencio.
//
// `situacion` cubre los momentos en que ese hecho es cierto, con un solo evento
// (ver el comentario de sus plantillas en catalog.ts):
//  · 'sin-reserva'      — reservarPlazaTrasPagoPublico devolvió !ok: no hay fila
//    en `reservas` (clase cancelada, ya empezada, o llena sin lista de espera).
//  · 'en-espera'        — devolvió ok con estado LISTA_ESPERA: la reserva existe,
//    pero la clase se llenó entre crear el PaymentIntent y confirmar el pago.
//    Desde el panel es indistinguible de quien se apuntó a la cola por gusto,
//    y aquí hay dinero cobrado: el mostrador tiene que saberlo HOY.
//  · 'cerrada'          — la clase pasó y nunca se liberó sitio (barrido diario).
//  · 'ya-tenia-reserva' — la socia YA tenía plaza en esa clase (con su bono, o
//    de otro pago): este pago no se ha usado para reservar. Hasta el 5-oct-2026
//    salía como «confirmada» y no avisaba a nadie.
//
// ⚠️ dedupKey PROPIA por situación: `uq_notification_dedup` es un UNIQUE
// permanente, así que si 'cerrada' reusara la clave de 'en-espera' el segundo
// aviso —el que de verdad pide una decisión— se descartaría en silencio.
//
// ⚠️ Y la de 'ya-tenia-reserva' va por PAGO (PaymentIntent), no por (sesión,
// socia): esa situación nace justo de que haya DOS pagos de la misma clase y la
// misma socia (dos pestañas, o pagar teniendo ya plaza). Con la clave de las
// otras, el segundo aviso —el que dice que hay otro pago que devolver— chocaba
// con el primero y desaparecía. Las situaciones de antes conservan su clave tal
// cual: cambiarla volvería a mandar avisos ya enviados.
// ─────────────────────────────────────────────────────────────────────────────

export type SituacionPagadaSinPlaza = 'sin-reserva' | 'en-espera' | 'cerrada' | 'ya-tenia-reserva';

export const SITUACION_PAGADA_SIN_PLAZA: Record<SituacionPagadaSinPlaza, { texto: string; dedup: string; porPago: boolean }> = {
  'sin-reserva': {
    texto: ' pero no se pudo confirmar su plaza.',
    dedup: 'reserva-pagada-sin-plaza',
    porPago: false,
  },
  'en-espera': {
    texto: ' y se quedó en lista de espera: la clase se llenó justo antes de confirmarla. Su crédito está intacto.',
    dedup: 'reserva-pagada-en-espera',
    porPago: false,
  },
  cerrada: {
    texto: ' y nunca llegó a liberarse sitio. Su pago sigue en su cuenta sin usar.',
    dedup: 'espera-sin-plaza-cerrada',
    porPago: false,
  },
  'ya-tenia-reserva': {
    texto: ' pero ya tenía plaza en esa clase: este pago no se ha usado para reservar y su crédito está intacto.',
    dedup: 'reserva-pagada-ya-tenia',
    porPago: true,
  },
};

/**
 * La clave de dedup del aviso (el motor le añade después la identidad de cada
 * destinatario). Por pago cuando la situación lo pide y se conoce el pago; si
 * no, por (sesión, socia), como siempre.
 */
export function dedupKeyPagadaSinPlaza(
  situacion: SituacionPagadaSinPlaza,
  p: { sesionId: string; socioId: string; paymentIntentId?: string | null },
): string {
  const { dedup, porPago } = SITUACION_PAGADA_SIN_PLAZA[situacion];
  if (porPago && p.paymentIntentId) return `${dedup}:${p.paymentIntentId}`;
  return `${dedup}:${p.sesionId}:${p.socioId}`;
}

/** A dónde lleva el aviso: a la ficha cuando lo que toca es devolver o dejar el pago a su favor. */
export function avisoLlevaALaFicha(situacion: SituacionPagadaSinPlaza): boolean {
  return situacion === 'cerrada' || situacion === 'ya-tenia-reserva';
}
