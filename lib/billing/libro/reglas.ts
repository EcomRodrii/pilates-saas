// Libro de billing (Fase 1): qué se apunta de cada evento de Stripe. PURO: sin SDK
// ni red, para probarlo con `node --test`. La escritura vive en `servidor.ts`.
//
// Stripe es la verdad; esto convierte sus objetos en filas del espejo
// (`billing_eventos`, `billing_facturas`, `billing_incidentes_pago`).

export type Intervalo = 'mensual' | 'anual';

export interface LineaPrecio {
  priceId: string | null;
  /** Céntimos por unidad (`price.unit_amount`). `null` si el precio es por tramos. */
  unitAmount: number | null;
  interval: string | null;
  intervalCount: number | null;
  quantity: number | null;
}

export interface FotoSuscripcion {
  plan: string | null;
  intervalo: Intervalo | null;
  /** Complementos, ordenados y sin repetir. */
  addons: string[];
  estado: string | null;
  cancelaAlFinal: boolean;
  mrrListaCents: number | null;
}

export interface MapaPrecios {
  plan: (priceId: string | null | undefined) => string | null;
  addon: (priceId: string | null | undefined) => string | null;
}

export type TipoEventoLibro =
  | 'ALTA' | 'CAMBIO_PLAN' | 'CAMBIO_INTERVALO' | 'CAMBIO_COMPLEMENTOS' | 'CAMBIO_ESTADO'
  | 'BAJA_PROGRAMADA' | 'BAJA_REVOCADA' | 'CANCELADA';

export interface EventoLibro {
  tipo: TipoEventoLibro;
  planAntes: string | null;
  planDespues: string | null;
  intervaloAntes: Intervalo | null;
  intervaloDespues: Intervalo | null;
  estadoAntes: string | null;
  estadoDespues: string | null;
  mrrListaAntesCents: number | null;
  mrrListaDespuesCents: number | null;
  detalle: Record<string, unknown>;
}

/** Meses que dura un periodo de cobro, o `null` si no es mensual/anual (semanas, días). */
function mesesDe(interval: string | null, count: number | null): number | null {
  const n = count && count > 0 ? count : 1;
  if (interval === 'month') return n;
  if (interval === 'year') return 12 * n;
  return null;
}

/**
 * Precio de LISTA de las líneas llevado a un mes, en céntimos (un anual entre 12).
 * `null` si alguna línea no se puede llevar a un mes: mejor «no sé» que un MRR falso.
 */
export function mrrListaCents(lineas: readonly LineaPrecio[]): number | null {
  let total = 0;
  for (const l of lineas) {
    const meses = mesesDe(l.interval, l.intervalCount);
    if (meses === null || l.unitAmount === null) return null;
    total += (l.unitAmount * (l.quantity ?? 1)) / meses;
  }
  return Math.round(total);
}

/** El periodo lo marca la línea del PLAN, no un complemento. */
export function intervaloDeLineas(lineas: readonly LineaPrecio[], mapa: MapaPrecios): Intervalo | null {
  const l = lineas.find((x) => mapa.plan(x.priceId)) ?? lineas[0];
  if (!l) return null;
  if (l.interval === 'year' && (l.intervalCount ?? 1) === 1) return 'anual';
  if (l.interval === 'month' && (l.intervalCount ?? 1) === 1) return 'mensual';
  return null;
}

export function fotoDeSuscripcion(
  lineas: readonly LineaPrecio[],
  estado: string | null,
  cancelaAlFinal: boolean,
  mapa: MapaPrecios,
): FotoSuscripcion {
  const addons = [...new Set(lineas.map((l) => mapa.addon(l.priceId)).filter((a): a is string => !!a))].sort();
  return {
    plan: lineas.map((l) => mapa.plan(l.priceId)).find((p): p is string => !!p) ?? null,
    intervalo: intervaloDeLineas(lineas, mapa),
    addons,
    estado,
    cancelaAlFinal,
    mrrListaCents: mrrListaCents(lineas),
  };
}

const TERMINADA = new Set(['canceled', 'incomplete_expired']);

/** Subida o bajada según el precio de lista; `null` si no se puede comparar. */
function direccion(antes: number | null, despues: number | null): 'UPGRADE' | 'DOWNGRADE' | 'LATERAL' | null {
  if (antes === null || despues === null) return null;
  return despues > antes ? 'UPGRADE' : despues < antes ? 'DOWNGRADE' : 'LATERAL';
}

/**
 * Los eventos de ciclo de vida que dice un evento de suscripción de Stripe.
 * `antes` sale de `previous_attributes` (solo en `.updated`); en `.created` y
 * `.deleted` no hay estado anterior que comparar.
 */
export function eventosDeSuscripcion(entrada: {
  tipoEvento: string;
  despues: FotoSuscripcion;
  antes: FotoSuscripcion | null;
}): EventoLibro[] {
  const { tipoEvento, despues, antes } = entrada;
  const base = (tipo: TipoEventoLibro, extra: Partial<EventoLibro> = {}): EventoLibro => ({
    tipo,
    planAntes: antes?.plan ?? null,
    planDespues: despues.plan,
    intervaloAntes: antes?.intervalo ?? null,
    intervaloDespues: despues.intervalo,
    estadoAntes: antes?.estado ?? null,
    estadoDespues: despues.estado,
    mrrListaAntesCents: antes?.mrrListaCents ?? null,
    mrrListaDespuesCents: despues.mrrListaCents,
    detalle: {},
    ...extra,
  });

  if (tipoEvento === 'customer.subscription.created') {
    return [base('ALTA', { detalle: { addons: despues.addons } })];
  }
  if (tipoEvento === 'customer.subscription.deleted') {
    return [base('CANCELADA', { estadoDespues: despues.estado ?? 'canceled', detalle: { addons: despues.addons } })];
  }
  if (tipoEvento !== 'customer.subscription.updated' || !antes) return [];

  const eventos: EventoLibro[] = [];
  if (antes.plan !== despues.plan && antes.plan !== null && despues.plan !== null) {
    eventos.push(base('CAMBIO_PLAN', { detalle: { direccion: direccion(antes.mrrListaCents, despues.mrrListaCents) } }));
  }
  if (antes.intervalo !== despues.intervalo && antes.intervalo !== null && despues.intervalo !== null) {
    eventos.push(base('CAMBIO_INTERVALO'));
  }
  if (antes.addons.join(',') !== despues.addons.join(',') && !TERMINADA.has(despues.estado ?? '')) {
    eventos.push(base('CAMBIO_COMPLEMENTOS', {
      detalle: {
        antes: antes.addons,
        despues: despues.addons,
        direccion: direccion(antes.mrrListaCents, despues.mrrListaCents),
      },
    }));
  }
  if (antes.estado !== despues.estado && despues.estado && !TERMINADA.has(despues.estado)) {
    eventos.push(base('CAMBIO_ESTADO'));
  }
  if (!antes.cancelaAlFinal && despues.cancelaAlFinal) eventos.push(base('BAJA_PROGRAMADA'));
  if (antes.cancelaAlFinal && !despues.cancelaAlFinal && !TERMINADA.has(despues.estado ?? '')) eventos.push(base('BAJA_REVOCADA'));
  return eventos;
}

// ── Facturas ────────────────────────────────────────────────────────────────

/** Lo mínimo que se lee de un `Stripe.Invoice`. */
export interface InvoiceMinima {
  id: string;
  status: string | null;
  number: string | null;
  billing_reason: string | null;
  currency: string | null;
  total: number | null;
  amount_paid: number | null;
  amount_due: number | null;
  attempt_count: number | null;
  next_payment_attempt: number | null;
  period_start: number | null;
  period_end: number | null;
  created: number;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  /** Suma de los impuestos de todas las líneas, en céntimos (la calcula quien llama). */
  impuestosCents: number;
  /** Cuándo se pagó (`status_transitions.paid_at`), en segundos. */
  paid_at: number | null;
}

const ESTADOS_FACTURA = new Set(['draft', 'open', 'paid', 'void', 'uncollectible']);

const aIso = (segundos: number | null | undefined): string | null =>
  typeof segundos === 'number' && segundos > 0 ? new Date(segundos * 1000).toISOString() : null;

export interface Dueno { studioId: string | null; cadenaId: string | null }

/** La fila de `billing_facturas` (el JSON que recibe `billing_registrar_factura`), o `null` si no es de las nuestras. */
export function filaDeFactura(
  inv: InvoiceMinima,
  contexto: { dueno: Dueno; customerId: string | null; subscriptionId: string | null; eventoCreado: number },
): Record<string, unknown> | null {
  if (!inv.status || !ESTADOS_FACTURA.has(inv.status) || inv.total === null) return null;
  return {
    stripe_invoice_id: inv.id,
    studio_id: contexto.dueno.studioId,
    cadena_id: contexto.dueno.studioId ? null : contexto.dueno.cadenaId,
    customer_id: contexto.customerId,
    subscription_id: contexto.subscriptionId,
    numero: inv.number,
    estado: inv.status,
    motivo: inv.billing_reason,
    moneda: (inv.currency ?? 'eur').toLowerCase(),
    total_cents: inv.total,
    pagado_cents: inv.amount_paid ?? 0,
    impuestos_cents: inv.impuestosCents,
    periodo_inicio: aIso(inv.period_start),
    periodo_fin: aIso(inv.period_end),
    intentos: inv.attempt_count ?? 0,
    siguiente_intento: aIso(inv.next_payment_attempt),
    pagada_en: aIso(inv.paid_at),
    url_factura: inv.hosted_invoice_url,
    url_pdf: inv.invoice_pdf,
    creada_en: aIso(inv.created),
    ultimo_evento_en: aIso(contexto.eventoCreado),
  };
}

/** El JSON que recibe `billing_abrir_incidente`. */
export function filaDeIncidente(
  inv: InvoiceMinima,
  contexto: { dueno: Dueno; customerId: string | null; subscriptionId: string | null; eventoCreado: number },
): Record<string, unknown> {
  return {
    stripe_invoice_id: inv.id,
    studio_id: contexto.dueno.studioId,
    cadena_id: contexto.dueno.studioId ? null : contexto.dueno.cadenaId,
    customer_id: contexto.customerId,
    subscription_id: contexto.subscriptionId,
    importe_cents: inv.amount_due ?? inv.total ?? 0,
    intentos: Math.max(inv.attempt_count ?? 1, 1),
    siguiente_intento: aIso(inv.next_payment_attempt),
    fallo_en: aIso(contexto.eventoCreado),
  };
}

/** Eventos de factura que el libro recoge (los dos primeros ya llegan hoy al webhook). */
export const EVENTOS_DE_FACTURA = [
  'invoice.payment_failed',
  'invoice.paid',
  'invoice.finalized',
  'invoice.voided',
  'invoice.marked_uncollectible',
] as const;

// ── Devoluciones ────────────────────────────────────────────────────────────

/** Los eventos de Stripe que devuelven dinero de un cargo de la suscripción. */
export const EVENTOS_DE_DEVOLUCION = ['charge.refunded', 'charge.dispute.closed'] as const;

/**
 * Cuánto dinero ha vuelto, en céntimos, y por qué PaymentIntent, según un evento de devolución;
 * `null` si el evento no devuelve nada.
 *   · `charge.refunded`: `amount_refunded` ya es el TOTAL devuelto del cargo (acumulado), no el de este reembolso.
 *   · `charge.dispute.closed`: solo cuenta si se PERDIÓ (`lost`): el banco se lleva todo lo disputado.
 *     Una disputa ganada o cerrada con aviso no mueve dinero.
 * Una disputa abierta (`created`) tampoco: aún no se sabe quién gana.
 */
export function devolucionDeEvento(
  tipo: string,
  objeto: { amount?: number | null; amount_refunded?: number | null; status?: string | null; payment_intent?: string | { id: string } | null },
): { paymentIntentId: string; devueltoCents: number } | null {
  const pi = typeof objeto.payment_intent === 'string' ? objeto.payment_intent : objeto.payment_intent?.id ?? null;
  if (!pi) return null;
  if (tipo === 'charge.refunded') {
    const n = objeto.amount_refunded ?? 0;
    return n > 0 ? { paymentIntentId: pi, devueltoCents: n } : null;
  }
  if (tipo === 'charge.dispute.closed' && objeto.status === 'lost') {
    const n = objeto.amount ?? 0;
    return n > 0 ? { paymentIntentId: pi, devueltoCents: n } : null;
  }
  return null;
}
