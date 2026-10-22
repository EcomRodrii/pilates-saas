// ─────────────────────────────────────────────────────────────────────────────
// Lo que la web comercial dice del plan Founding Studio desde que es GRATIS
// (decisión del fundador, 15-oct-2026): todo Tentare menos varias sedes,
// mientras el estudio no pase de GRATIS_ALUMNAS alumnas activas ni de
// GRATIS_RESERVAS_MES reservas en un mes. Al pasarse tiene GRATIS_MARGEN_DIAS días
// para pasarse a Founding Studio de pago (PRECIO_FOUNDING_PAGO), sin tope y, desde
// el 19/20-oct-2026, con el Centro de Control, las sustituciones automáticas y la
// redacción con IA como complementos aparte (COMPLEMENTOS_DE_PAGO); si no, se
// cierra el panel y la app de sus alumnas sigue funcionando.
// Pasar de CUALQUIERA de los dos límites lleva ahí: nadie va obligado a Estudio
// (corrección del fundador, 15-oct por la mañana). Lo que distingue a Estudio es
// la app propia del estudio, que todavía no existe: la web no la vende hasta que
// exista. Ya no hay prueba de 7 días: se empieza gratis, con todo.
//
// El segundo límite son RESERVAS y no cobros (decisión del fundador, la misma
// noche): los cobros se esquivan cobrando fuera de Tentare; las reservas no, y
// sin ellas no se usa el programa (Bonsai cuenta igual sus «inscripciones», y
// da 80 gratis). Cómo se cuentan lo decide el producto (lib/billing/plan-gratis.ts).
//
// ⚠️ Las cifras salen de `lib/billing/plan-gratis.ts` y `ENTITLEMENTS_GRATIS`
// (#2707, #2712), que es quien las aplica de verdad: la web no puede prometer un
// límite distinto del que mide el servidor.
//
// ⚠️ Siempre los DOS límites juntos: con 150 alumnas lo normal es pasar de 250
// reservas al mes, así que «gratis hasta 150 alumnas» a secas engaña.
//
// Puro y sin `@/`: lo importan /precios, la home, `lib/seo/paginas.ts` y su test.
// ─────────────────────────────────────────────────────────────────────────────

import { ADDONS, ENTITLEMENTS_GRATIS, PLAN_INFO, type Entitlements, type Plan } from '../billing/entitlements.ts';
import { FRASE_PLAN_GRATIS, LIMITE_ALUMNAS, LIMITE_RESERVAS_MES, MARGEN_DIAS } from '../billing/plan-gratis.ts';

export const GRATIS_ALUMNAS = LIMITE_ALUMNAS;
export const GRATIS_RESERVAS_MES = LIMITE_RESERVAS_MES;
/** Días para pasarse a Founding Studio de pago desde que se supera un límite. */
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
 * Lo que paga Founding Studio cuando pasa de cualquiera de sus dos límites
 * (decisión del fundador, 15-oct-2026): sigue en Founding Studio, sin tope, y
 * paga su precio de siempre. Sale de PLAN_INFO, el mismo número que cobra
 * el price de Stripe del plan.
 */
export const PRECIO_FOUNDING_PAGO = PLAN_INFO.BASE.precioMes;

/** «si pasas de ahí, 29 €/mes»: lo que viene después del «gratis hasta…». */
export const SI_PASAS = `si pasas de ahí, ${PRECIO_FOUNDING_PAGO} €/mes`;
/**
 * Desde #2784 (20-oct-2026), el Founding Studio DE PAGO no incluye tres cosas: van
 * aparte como complementos (`ADDONS`). El gratis y la prueba siguen con todo, y
 * Estudio y Cadena las incluyen. Precios desde el catálogo, nunca a mano.
 */
export const COMPLEMENTOS_DE_PAGO = `el ${ADDONS.decisiones.nombre} (${ADDONS.decisiones.precioMes} €/mes), las sustituciones automáticas (${ADDONS.sustituciones.precioMes} €/mes) y la redacción con IA (${ADDONS.ia.precioMes} €/mes)`;
/** Las tres, en corto, para las tarjetas de los planes. */
export const COMPLEMENTOS_CORTO = 'Centro de Control, sustituciones automáticas y redacción con IA';
/**
 * «si pasas de ahí, 29 €/mes, con Centro de Control, … aparte»: lo que va junto a
 * «todas las funcionalidades» del gratis. Sin la coletilla, el «si pasas de ahí»
 * se leía «con lo mismo» (21-oct-2026).
 */
export const SI_PASAS_CON_COMPLEMENTOS = `${SI_PASAS}, con ${COMPLEMENTOS_CORTO} aparte`;

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
