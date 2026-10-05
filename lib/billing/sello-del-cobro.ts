// ─────────────────────────────────────────────────────────────────────────────
// Qué condiciones aceptó la clienta al comprar, y CUÁNDO, tal como se deja en el
// recibo (`terminos_hash`, `terminos_aceptados_en`) al entregar la compra.
//
// El QUÉ (la huella) se sella en servidor al crear el cobro y viaja en la
// metadata. El CUÁNDO es el momento en que se creó el cobro en Stripe
// (`pi.created` / `session.created`), y no viaja en la metadata: un instante
// tomado con `new Date()` dentro de los parámetros del cobro los hacía distintos
// en cada petición, y Stripe rechazaba el segundo intento del mismo pago con
// `idempotency_error` (ver lib/billing/pago-embebido-parametros.ts).
//
// Sin alias `@/`: lo cargan `node --test`, el webhook y el conciliador.
// ─────────────────────────────────────────────────────────────────────────────

export interface SelloDelCobro {
  terminosHash: string | null;
  terminosAceptadosEn: string | null;
}

/**
 * @param metadata  la del PaymentIntent (checkout embebido) o la de la Checkout Session (Modo A).
 * @param creadoUnix `created` de ese mismo objeto de Stripe, en segundos.
 */
export function selloDelCobro(
  metadata: Record<string, string> | null | undefined,
  creadoUnix: number | null | undefined,
): SelloDelCobro {
  const hash = metadata?.terminosHash || null;
  // Sin huella no hay nada aceptado que fechar: la compra va sin sello (el
  // sellado es best-effort, ver lib/legal-sellado.ts).
  if (!hash) return { terminosHash: null, terminosAceptadosEn: null };
  const creado = typeof creadoUnix === 'number' && Number.isFinite(creadoUnix) && creadoUnix > 0
    ? new Date(creadoUnix * 1000).toISOString()
    : null;
  // Los cobros creados antes de este cambio traen la fecha en la metadata; es el
  // mismo instante (se sellaba justo antes de crear el cobro). Solo se usa si
  // Stripe no da `created`, que no debería pasar.
  return { terminosHash: hash, terminosAceptadosEn: creado ?? (metadata?.terminosAceptadosEn || null) };
}
