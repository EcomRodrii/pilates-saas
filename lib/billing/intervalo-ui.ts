// Cómo se ENSEÑA un precio según se pague por meses o por años. Pura, sin
// React ni Stripe: la usan /precios, /suscripcion y el selector del alta, y un
// test la cruza con las cifras que dicen los Price de Stripe (10 × el mensual).
//
// ⚠️ Los importes reales los cobra Stripe con sus Price; esto solo los dice. Por
// eso `precioAnual` sale del mensual con la regla de «dos meses gratis» y el
// ahorro se calcula, nunca se escribe a mano.

import { ahorroAnual, precioAnual } from './entitlements.ts';

export type IntervaloUi = 'mensual' | 'anual';

/** Un número en euros a la española: «2.490» (miles con punto, sin decimales). */
export function euros(n: number): string {
  return n.toLocaleString('es-ES', { maximumFractionDigits: 0, useGrouping: n >= 1000 });
}

/** Lo que se cobra cada vez: el mes, o el año entero por adelantado. */
export function importeDe(precioMes: number, intervalo: IntervaloUi): number {
  return intervalo === 'anual' ? precioAnual(precioMes) : precioMes;
}

/** «79€/mes» o «790€/año». */
export function etiquetaPrecio(precioMes: number, intervalo: IntervaloUi): string {
  return `${euros(importeDe(precioMes, intervalo))}€/${intervalo === 'anual' ? 'año' : 'mes'}`;
}

/** «Facturado 790 € al año» (anual) o «IVA incluido» (mensual): la línea bajo la cifra. */
export function lineaFacturacion(precioMes: number, intervalo: IntervaloUi): string {
  return intervalo === 'anual'
    ? `Facturado ${euros(precioAnual(precioMes))} € al año · IVA incluido`
    : 'IVA incluido';
}

/** El ahorro del año frente a pagar doce meses, en euros: «Ahorras 158 €». */
export function textoAhorro(precioMes: number): string {
  return `Ahorras ${euros(ahorroAnual(precioMes))} €`;
}
