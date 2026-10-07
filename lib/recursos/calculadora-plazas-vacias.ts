// ─────────────────────────────────────────────────────────────────────────────
// Lo que cuestan al mes las plazas de reformer que se quedan vacías
// (/soluciones/estudio-de-pilates-reformer).
//
// Un cálculo, no una promesa: con los números de la propietaria dice cuántas
// plazas se ofrecen y no se venden al mes y cuánto dinero es eso al precio medio
// que ella pone. No dice cuántas recuperaría Tentare: eso no se sabe de
// antemano y no se inventa. Pura y sin `@/`: se prueba con node --test.
// ─────────────────────────────────────────────────────────────────────────────

import { SEMANAS_MES } from './calculadora-rentabilidad.ts';

export interface EntradaPlazasVacias {
  /** Reformers (plazas) por clase. */
  reformers: number;
  clasesPorSemana: number;
  /** 0-100. */
  ocupacionPct: number;
  /** Lo que ingresas de media por plaza ocupada (€), con bonos y cuotas prorrateados. */
  ingresoPorPlaza: number;
}

export interface ResultadoPlazasVacias {
  plazasOfertadasMes: number;
  plazasVaciasMes: number;
  /** Lo que valen esas plazas vacías al precio medio (€ al mes). */
  ingresoNoVendidoMes: number;
  /** Lo mismo, en un año (12 meses). */
  ingresoNoVendidoAno: number;
}

const positivo = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

export function calcularPlazasVacias(e: EntradaPlazasVacias): ResultadoPlazasVacias {
  const ofertadas = positivo(e.reformers) * positivo(e.clasesPorSemana) * SEMANAS_MES;
  const ocupacion = Math.min(100, positivo(e.ocupacionPct)) / 100;
  const vacias = ofertadas * (1 - ocupacion);
  const mes = vacias * positivo(e.ingresoPorPlaza);
  return { plazasOfertadasMes: ofertadas, plazasVaciasMes: vacias, ingresoNoVendidoMes: mes, ingresoNoVendidoAno: mes * 12 };
}
