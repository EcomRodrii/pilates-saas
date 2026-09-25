// ─────────────────────────────────────────────────────────────────────────────
// Calculadora de rentabilidad de un estudio de Pilates (/recursos).
//
// Un método, no una promesa: con los números de la propietaria calcula lo que
// ingresa y gasta al mes y qué ocupación necesita para no perder dinero. No
// incluye impuestos sobre el beneficio, cuotas de autónoma ni la amortización
// del equipo, y el componente lo dice. Pura y sin `@/`: se prueba con node --test.
// ─────────────────────────────────────────────────────────────────────────────

/** 52 semanas / 12 meses. */
export const SEMANAS_MES = 52 / 12;

export interface EntradaRentabilidad {
  /** Plazas por clase (máquinas o esterillas). */
  plazasPorClase: number;
  clasesPorSemana: number;
  /** 0-100. */
  ocupacionPct: number;
  /** Lo que ingresas de media por plaza ocupada, sin IVA (€). */
  ingresoPorPlaza: number;
  /** Lo que cuesta la instructora por clase (€). */
  costeInstructoraPorClase: number;
  /** Alquiler, suministros, seguros, software… al mes (€). */
  costesFijosMes: number;
}

export interface ResultadoRentabilidad {
  plazasVendidasMes: number;
  ingresosMes: number;
  costeInstructorasMes: number;
  costesTotalesMes: number;
  resultadoMes: number;
  /** Ocupación (0-100) a partir de la cual no se pierde dinero; null si ni al 100 % sale. */
  ocupacionEquilibrioPct: number | null;
}

const positivo = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

export function calcularRentabilidad(e: EntradaRentabilidad): ResultadoRentabilidad {
  const plazas = positivo(e.plazasPorClase);
  const clases = positivo(e.clasesPorSemana);
  const ocupacion = Math.min(100, positivo(e.ocupacionPct)) / 100;
  const ingreso = positivo(e.ingresoPorPlaza);
  const instructora = positivo(e.costeInstructoraPorClase);
  const fijos = positivo(e.costesFijosMes);

  const plazasOfertadasMes = plazas * clases * SEMANAS_MES;
  const plazasVendidasMes = plazasOfertadasMes * ocupacion;
  const ingresosMes = plazasVendidasMes * ingreso;
  const costeInstructorasMes = clases * instructora * SEMANAS_MES;
  const costesTotalesMes = costeInstructorasMes + fijos;
  const ingresoMaximoMes = plazasOfertadasMes * ingreso;
  const equilibrio = ingresoMaximoMes > 0 ? (costesTotalesMes / ingresoMaximoMes) * 100 : Infinity;

  return {
    plazasVendidasMes,
    ingresosMes,
    costeInstructorasMes,
    costesTotalesMes,
    resultadoMes: ingresosMes - costesTotalesMes,
    ocupacionEquilibrioPct: equilibrio <= 100 ? equilibrio : null,
  };
}
