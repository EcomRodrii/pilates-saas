import type {
  DashboardChart, MetricaGraficoDashboard, AgrupacionGraficoDashboard,
  Recibo, Socio, Reserva, Sesion, CreditTransaction,
} from '@/lib/types';

export const METRICAS_GRAFICO: { metric: MetricaGraficoDashboard; nombre: string }[] = [
  { metric: 'INGRESOS_COBRADOS', nombre: 'Ingresos cobrados' },
  { metric: 'NUEVAS_SOCIAS', nombre: 'Nuevas socias' },
  { metric: 'RESERVAS', nombre: 'Reservas' },
  { metric: 'CLASES_ASISTIDAS', nombre: 'Clases asistidas (check-in)' },
  { metric: 'CREDITOS_OTORGADOS', nombre: 'Créditos otorgados' },
];

export const AGRUPACIONES_GRAFICO: { value: AgrupacionGraficoDashboard; nombre: string }[] = [
  { value: 'DIA', nombre: 'Por día' },
  { value: 'SEMANA', nombre: 'Por semana' },
  { value: 'MES', nombre: 'Por mes' },
];

function inicioPeriodo(d: Date, agrupacion: AgrupacionGraficoDashboard): Date {
  const r = new Date(d);
  if (agrupacion === 'DIA') {
    r.setHours(0, 0, 0, 0);
  } else if (agrupacion === 'SEMANA') {
    const day = r.getDay();
    r.setDate(r.getDate() - (day === 0 ? 6 : day - 1));
    r.setHours(0, 0, 0, 0);
  } else {
    r.setDate(1);
    r.setHours(0, 0, 0, 0);
  }
  return r;
}

function siguientePeriodo(d: Date, agrupacion: AgrupacionGraficoDashboard): Date {
  const r = new Date(d);
  if (agrupacion === 'DIA') r.setDate(r.getDate() + 1);
  else if (agrupacion === 'SEMANA') r.setDate(r.getDate() + 7);
  else r.setMonth(r.getMonth() + 1);
  return r;
}

function etiquetaPeriodo(d: Date, agrupacion: AgrupacionGraficoDashboard): string {
  if (agrupacion === 'MES') return d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

interface ChartData {
  recibos: Recibo[];
  socios: Socio[];
  reservas: Reserva[];
  sesiones: Sesion[];
  creditTransactions: CreditTransaction[];
}

export interface SeriePunto {
  label: string;
  value: number;
}

// Genera los `rango` periodos (día/semana/mes) que terminan en `now` y suma la
// métrica elegida en cada uno. Todo se computa en el cliente a partir de los
// datos ya cargados — sin llamadas nuevas al backend.
export function computeSerieGrafico(chart: DashboardChart, data: ChartData, now: Date): SeriePunto[] {
  const periodos: { start: Date; end: Date; label: string }[] = [];
  let cursor = inicioPeriodo(now, chart.agrupacion);
  for (let i = 0; i < chart.rango; i++) {
    const start = cursor;
    const end = siguientePeriodo(start, chart.agrupacion);
    periodos.unshift({ start, end, label: etiquetaPeriodo(start, chart.agrupacion) });
    cursor = new Date(start.getTime() - 1);
    cursor = inicioPeriodo(cursor, chart.agrupacion);
  }

  return periodos.map(({ start, end, label }) => {
    let value = 0;
    switch (chart.metrica) {
      case 'INGRESOS_COBRADOS':
        value = data.recibos
          .filter(r => r.estado === 'COBRADO' && r.fechaCobro && new Date(r.fechaCobro) >= start && new Date(r.fechaCobro) < end)
          .reduce((sum, r) => sum + r.importe, 0);
        break;
      case 'NUEVAS_SOCIAS':
        value = data.socios.filter(s => new Date(s.fechaAlta) >= start && new Date(s.fechaAlta) < end).length;
        break;
      case 'RESERVAS':
        value = data.reservas.filter(r => new Date(r.creadoEn) >= start && new Date(r.creadoEn) < end).length;
        break;
      case 'CLASES_ASISTIDAS':
        value = data.reservas.filter(r => r.estado === 'ASISTIDA' && r.checkInEn && new Date(r.checkInEn) >= start && new Date(r.checkInEn) < end).length;
        break;
      case 'CREDITOS_OTORGADOS':
        value = data.creditTransactions
          .filter(t => t.tipo === 'GANANCIA' && new Date(t.creadoEn) >= start && new Date(t.creadoEn) < end)
          .reduce((sum, t) => sum + t.creditos, 0);
        break;
    }
    return { label, value };
  });
}
