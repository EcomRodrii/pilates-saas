// ─────────────────────────────────────────────────────────────────────────────
// R2 · Take-rate de plataforma sobre el GMV de las socias.
//
// Los cobros socia→estudio son CARGOS DIRECTOS en la cuenta Connect (Standard,
// OAuth) del estudio. En ese modelo la plataforma (Tentare) puede recaudar una
// comisión por cargo vía `application_fee_amount`: Stripe la transfiere sola a
// la cuenta de plataforma; la cuenta del estudio paga las fees de Stripe.
//
// La comisión se expresa en BASIS POINTS (1 bp = 0,01 %) en la env
// `TENTARE_APPLICATION_FEE_BPS`. Default 0 = APAGADO: no se envía
// `application_fee_amount` y el comportamiento es idéntico al actual — nadie
// cobra nada por sorpresa. Se enciende poniendo la env en Vercel (mismo patrón
// que `BILLING_ENFORCED`); el NÚMERO es una decisión de pricing del negocio.
//
// Ejemplos de env → comisión:
//   TENTARE_APPLICATION_FEE_BPS=100  → 1,0 %   (100 bp)
//   TENTARE_APPLICATION_FEE_BPS=50   → 0,5 %   ( 50 bp)
//   TENTARE_APPLICATION_FEE_BPS=200  → 2,0 %   (200 bp)
//
// NOTA FISCAL (pendiente, no es código): cobrar esta comisión es un servicio B2B
// de Tentare al estudio y requiere su propia factura con IVA por parte de
// Tentare. `application_fee_amount` mueve el dinero, no emite esa factura.
// ─────────────────────────────────────────────────────────────────────────────

const TOPE_BPS = 5_000; // 50 % — tope defensivo por si la env viene mal puesta.

/** Basis points configurados (0 = apagado). Saneado y acotado. */
export function applicationFeeBps(): number {
  const raw = Number(process.env.TENTARE_APPLICATION_FEE_BPS);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(Math.round(raw), TOPE_BPS);
}

/**
 * Comisión de plataforma en CÉNTIMOS para un cargo de `amountCents` céntimos.
 * Devuelve `undefined` cuando está apagada o el importe no es válido — así el
 * llamador puede omitir `application_fee_amount` en vez de pasar 0 (Stripe
 * rechaza `application_fee_amount: 0` en algunos flujos).
 */
export function applicationFeeAmount(amountCents: number): number | undefined {
  const bps = applicationFeeBps();
  if (bps === 0) return undefined;
  if (!Number.isFinite(amountCents) || amountCents <= 0) return undefined;
  const fee = Math.floor((amountCents * bps) / 10_000);
  return fee > 0 ? fee : undefined;
}
