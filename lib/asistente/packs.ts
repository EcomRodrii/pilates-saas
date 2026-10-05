// ─────────────────────────────────────────────────────────────────────────────
// Packs de consultas del asistente (decisión del fundador, 5-oct-2026): para
// cuando se acaban las del plan. Precios con IVA INCLUIDO, como los planes de
// /precios y /suscripcion. Caducan a los 12 meses de comprarlos.
//
// Fase 1 no vende nada: el catálogo existe para que el saldo (ia_saldo_consultas)
// y la tabla `ia_packs` ya tengan su forma definitiva; la compra es la fase 3.
// Puro: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export interface PackConsultas {
  unidades: 100 | 300 | 1000;
  /** Euros, IVA incluido. */
  precioEur: number;
}

export const PACKS_CONSULTAS: readonly PackConsultas[] = [
  { unidades: 100, precioEur: 9 },
  { unidades: 300, precioEur: 24 },
  { unidades: 1000, precioEur: 69 },
];

export const PACK_CADUCA_MESES = 12;
