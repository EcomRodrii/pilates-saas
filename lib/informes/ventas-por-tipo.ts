// Desglose de ventas por tipo (Planes/Bonos/Clases sueltas/Otros) para
// /informes, más la comparación con el período anterior de igual duración.
// La agregación real vive en la RPC `ventas_por_tipo` (migr 20260810150000,
// dbVentasPorTipo en supabase-data.ts); esto es solo la parte pura —
// etiquetas y cálculo de variación — para poder testearla sin Supabase.

export type TipoVenta = 'MENSUAL' | 'BONO' | 'PUNTUAL' | 'OTROS';

export interface VentaTipo {
  tipo: string;
  nVentas: number;
  total: number;
}

export interface VentaTipoConVariacion {
  tipo: TipoVenta;
  etiqueta: string;
  nVentas: number;
  total: number;
  // null = sin datos suficientes para comparar (período anterior en 0).
  variacionPct: number | null;
}

// Orden fijo de presentación, no el orden en que llega la RPC (que agrupa
// sin ORDER BY).
export const ORDEN_TIPOS: TipoVenta[] = ['MENSUAL', 'BONO', 'PUNTUAL', 'OTROS'];

export const ETIQUETAS_TIPO: Record<TipoVenta, string> = {
  MENSUAL: 'Planes',
  BONO: 'Bonos',
  PUNTUAL: 'Clases sueltas',
  OTROS: 'Otros',
};

// Variación porcentual entre el período actual y el anterior. Sin datos
// previos (anterior === 0) no hay base para un porcentaje con sentido —
// devuelve null en vez de +Infinity/100%, y el llamador decide cómo
// mostrarlo ("sin datos previos").
export function calcularVariacionPct(actual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return Math.round(((actual - anterior) / anterior) * 100);
}

// Combina el desglose del período actual con el del anterior, en el orden
// fijo de ORDEN_TIPOS (incluye tipos con 0 ventas en ambos períodos para que
// la UI siempre pinte las 4 categorías).
export function combinarConVariacion(
  actual: VentaTipo[],
  anterior: VentaTipo[],
): VentaTipoConVariacion[] {
  const porTipoActual = new Map(actual.map((v) => [v.tipo, v]));
  const porTipoAnterior = new Map(anterior.map((v) => [v.tipo, v]));
  return ORDEN_TIPOS.map((tipo) => {
    const a = porTipoActual.get(tipo);
    const p = porTipoAnterior.get(tipo);
    const total = a?.total ?? 0;
    const totalAnterior = p?.total ?? 0;
    return {
      tipo,
      etiqueta: ETIQUETAS_TIPO[tipo],
      nVentas: a?.nVentas ?? 0,
      total,
      variacionPct: calcularVariacionPct(total, totalAnterior),
    };
  });
}
