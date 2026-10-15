// ─────────────────────────────────────────────────────────────────────────────
// Lo que la web comercial dice del plan Founding Studio desde que es GRATIS
// (decisión del fundador, 15-oct-2026): todo Tentare menos varias sedes,
// mientras el estudio no pase de GRATIS_ALUMNAS alumnas activas ni de
// GRATIS_RESERVAS_MES reservas en un mes. Al pasarse tiene GRATIS_MARGEN_DIAS días
// para elegir: si solo se pasó de reservas, Founding Studio de pago
// (PRECIO_FOUNDING_PAGO, con lo mismo); con más de 150 alumnas, el plan Estudio.
// Si no, se cierra el panel y la app de sus alumnas sigue funcionando. Ya no hay
// prueba de 7 días: se empieza gratis, con todo.
//
// El segundo límite son RESERVAS y no cobros (decisión del fundador, la misma
// noche): los cobros se esquivan cobrando fuera de Tentare; las reservas no, y
// sin ellas no se usa el programa (Bonsai cuenta igual sus «inscripciones», y
// da 80 gratis). Cómo se cuentan lo decide el producto (lib/billing/plan-gratis.ts).
//
// ⚠️ Las cifras salen de `lib/billing/plan-gratis.ts` y `ENTITLEMENTS_GRATIS`
// (#2707), que es quien las aplica de verdad: la web no puede prometer un límite
// distinto del que mide el servidor. La de reservas todavía no está allí (llega
// con la continuación de #2707): hasta entonces vive aquí, y
// `founding-gratis.test.ts` la cruza con `LIMITE_RESERVAS_MES` en cuanto exista.
//
// ⚠️ Siempre los DOS límites juntos: con 150 alumnas lo normal es pasar de 250
// reservas al mes, así que «gratis hasta 150 alumnas» a secas engaña.
//
// Puro y sin `@/`: lo importan /precios, la home, `lib/seo/paginas.ts` y su test.
// ─────────────────────────────────────────────────────────────────────────────

import { ENTITLEMENTS_GRATIS, PLAN_INFO, type Entitlements, type Plan } from '../billing/entitlements.ts';
import { FRASE_PLAN_GRATIS, LIMITE_ALUMNAS, MARGEN_DIAS } from '../billing/plan-gratis.ts';

export const GRATIS_ALUMNAS = LIMITE_ALUMNAS;
export const GRATIS_RESERVAS_MES = 250;
/** Días para pasarse al plan Estudio desde que se supera un límite. */
export const GRATIS_MARGEN_DIAS = MARGEN_DIAS;

/** La frase del fundador, literal (con la tilde de «Tú»). */
export const FRASE_FOUNDING = FRASE_PLAN_GRATIS;

/** «hasta 150 alumnas activas y 250 reservas al mes» */
export const LIMITES_GRATIS = `hasta ${GRATIS_ALUMNAS} alumnas activas y ${GRATIS_RESERVAS_MES} reservas al mes`;

/** «Hasta 150 alumnas activas y 250 reservas al mes», para empezar frase. */
export const TOPE_GRATIS = `Hasta ${GRATIS_ALUMNAS} alumnas activas y ${GRATIS_RESERVAS_MES} reservas al mes`;

/** «Gratis hasta 150 alumnas activas y 250 reservas al mes»: el precio de entrada, dicho entero. */
export const GRATIS_CON_LIMITES = `Gratis ${LIMITES_GRATIS}`;

/**
 * Lo que paga Founding Studio cuando pasa de GRATIS_RESERVAS_MES reservas al mes
 * sin pasar de GRATIS_ALUMNAS alumnas (decisión del fundador, 15-oct-2026, la
 * misma noche): sigue en Founding Studio y paga su precio de siempre. Con más
 * de 150 alumnas, el plan Estudio. Sale de PLAN_INFO, el mismo número que cobra
 * el price de Stripe del plan.
 */
export const PRECIO_FOUNDING_PAGO = PLAN_INFO.BASE.precioMes;

/** «con más reservas, 29 €/mes»: lo que viene después del «gratis hasta…». */
export const CON_MAS_RESERVAS = `con más reservas, ${PRECIO_FOUNDING_PAGO} €/mes`;

/** El botón que lleva al alta. Sustituye a «Probar 7 días gratis». */
export const CTA_ALTA = 'Empezar gratis';

/** Lo que incluye, dicho como lo dijo la decisión. */
export const TODO_MENOS_SEDES = 'Todas las funcionalidades, menos varias sedes';

/** Lo que incluye Founding Studio: el nivel gratis del producto (todo menos varias sedes). */
export const ENTITLEMENTS_FOUNDING_GRATIS: Entitlements = ENTITLEMENTS_GRATIS;

/** Lo que cuesta cada plan al mes en la web (0 en Founding Studio). La cifra de schema.org. */
export function precioMesWeb(plan: Plan): number {
  return plan === 'BASE' ? 0 : PLAN_INFO[plan].precioMes;
}
