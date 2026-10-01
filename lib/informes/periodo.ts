// Rango de fechas ('YYYY-MM-DD', días del ESTUDIO) de cada periodo de /informes.
//
// Las cifras de dinero de Informes salen de RPC que filtran `fecha_cobro`, una
// columna `date` escrita en hora de Madrid. Antes el rango se sacaba de un
// `Date` del navegador (`getFullYear()/getMonth()`), así que «este mes» de un
// navegador en otra zona horaria —o entre las 00:00 y las 02:00 del día 1 en
// uno con el reloj en UTC— no era el mes del estudio. Aquí todo parte de
// `hoyEnEstudio()` y se opera sobre el texto, sin `Date` local.

export type PeriodoInforme = 'week' | 'month' | 'quarter' | 'year';

const aUTC = (dia: string): number => {
  const [y, m, d] = dia.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

const deUTC = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** Días entre dos fechas 'YYYY-MM-DD' (b - a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((aUTC(b) - aUTC(a)) / 86_400_000);
}

export function sumarDias(dia: string, n: number): string {
  return deUTC(aUTC(dia) + n * 86_400_000);
}

/** Primer día del periodo que contiene `hoy` (semana de lunes a domingo). */
export function inicioDelPeriodo(periodo: PeriodoInforme, hoy: string): string {
  const [y, m] = hoy.split('-').map(Number);
  switch (periodo) {
    case 'week': {
      const dow = new Date(aUTC(hoy)).getUTCDay(); // 0 = domingo
      return sumarDias(hoy, -((dow + 6) % 7));
    }
    case 'month':
      return `${hoy.slice(0, 7)}-01`;
    case 'quarter': {
      // «Últimos 3 meses»: el mes en curso y los dos anteriores.
      const total = y * 12 + (m - 1) - 2;
      return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
    }
    case 'year':
      return `${y}-01-01`;
  }
}

export interface RangoInforme {
  desde: string;
  hasta: string;
  /** Inicio del mes en curso, para «Ingresos del mes». */
  inicioMes: string;
  /** El periodo anterior de la MISMA duración, justo antes de `desde`. */
  anteriorDesde: string;
  anteriorHasta: string;
}

export function rangoDelInforme(periodo: PeriodoInforme, hoy: string): RangoInforme {
  const desde = inicioDelPeriodo(periodo, hoy);
  const dias = diasEntre(desde, hoy) + 1;
  const anteriorHasta = sumarDias(desde, -1);
  return {
    desde, hasta: hoy, inicioMes: `${hoy.slice(0, 7)}-01`,
    anteriorDesde: sumarDias(anteriorHasta, -(dias - 1)), anteriorHasta,
  };
}
