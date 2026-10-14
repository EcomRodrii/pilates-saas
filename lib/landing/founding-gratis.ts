// ─────────────────────────────────────────────────────────────────────────────
// Lo que la web comercial dice del plan Founding Studio desde que es GRATIS
// (decisión del fundador, 15-oct-2026): todo Tentare menos varias sedes,
// mientras el estudio no pase de GRATIS_ALUMNAS alumnas activas ni de
// GRATIS_COBROS_MES cobros en un mes. Al pasarse tiene GRATIS_MARGEN_DIAS días
// para pasarse al plan Estudio; si no, se cierra el panel y la app de sus
// alumnas sigue funcionando. Ya no hay prueba de 7 días: se empieza gratis, con
// todo.
//
// ⚠️ Espejo de `lib/billing/plan-gratis.ts` (LIMITE_ALUMNAS, LIMITE_COBROS_MES,
// MARGEN_DIAS, FRASE_PLAN_GRATIS), que es quien lo aplica de verdad. Web y
// producto se hicieron a la vez en dos ramas; en cuanto las dos estén en main,
// estas constantes pasan a reexportarse de allí, para que la web no pueda
// prometer un límite distinto del que mide el servidor.
//
// ⚠️ Siempre los DOS límites juntos: con 150 alumnas lo normal es pasar de 30
// cobros al mes, así que «gratis hasta 150 alumnas» a secas engaña.
//
// Puro y sin `@/`: lo importan /precios, la home, `lib/seo/paginas.ts` y su test.
// ─────────────────────────────────────────────────────────────────────────────

import { PLAN_ENTITLEMENTS, PLAN_INFO, type Entitlements, type Plan } from '../billing/entitlements.ts';

export const GRATIS_ALUMNAS = 150;
export const GRATIS_COBROS_MES = 30;
/** Días para pasarse al plan Estudio desde que se supera un límite. */
export const GRATIS_MARGEN_DIAS = 30;

/** La frase del fundador, literal (con la tilde de «Tú»). */
export const FRASE_FOUNDING = 'Tú eres la prioridad. Si tu estudio crece, crecemos contigo.';

/** «hasta 150 alumnas activas y 30 cobros al mes» */
export const LIMITES_GRATIS = `hasta ${GRATIS_ALUMNAS} alumnas activas y ${GRATIS_COBROS_MES} cobros al mes`;

/** «Hasta 150 alumnas activas y 30 cobros al mes», para empezar frase. */
export const TOPE_GRATIS = `Hasta ${GRATIS_ALUMNAS} alumnas activas y ${GRATIS_COBROS_MES} cobros al mes`;

/** «Gratis hasta 150 alumnas activas y 30 cobros al mes»: el precio de entrada, dicho entero. */
export const GRATIS_CON_LIMITES = `Gratis ${LIMITES_GRATIS}`;

/** El botón que lleva al alta. Sustituye a «Probar 7 días gratis». */
export const CTA_ALTA = 'Empezar gratis';

/** Lo que incluye, dicho como lo dijo la decisión. */
export const TODO_MENOS_SEDES = 'Todas las funcionalidades, menos varias sedes';

/**
 * Lo que la web enseña que incluye Founding Studio: las features de Cadena
 * (todas) sin varias sedes, con su tope de alumnas. Se deriva del código y no
 * se escribe a mano, como el resto de la tabla de planes. Las consultas del
 * asistente siguen siendo las de Founding Studio.
 */
export const ENTITLEMENTS_FOUNDING_GRATIS: Entitlements = {
  ...PLAN_ENTITLEMENTS.BASE,
  maxSocios: GRATIS_ALUMNAS,
  features: { ...PLAN_ENTITLEMENTS.CADENA.features, multiCentro: false },
};

/** Lo que cuesta cada plan al mes en la web (0 en Founding Studio). La cifra de schema.org. */
export function precioMesWeb(plan: Plan): number {
  return plan === 'BASE' ? 0 : PLAN_INFO[plan].precioMes;
}
