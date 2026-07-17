import type { AchievementMetric, AchievementMetricDef, Reserva, Sesion, Socio } from '@/lib/types';
import { calcularRacha } from '@/lib/engines/streak-engine';

// Catálogo de métricas que la app sabe calcular. El estudio no inventa
// métricas nuevas (eso es código), pero SÍ decide el umbral de cada logro
// ("5 clases", "10 clases"...) — eso vive en AchievementDefinition.
export const ACHIEVEMENT_METRICS: AchievementMetricDef[] = [
  { metric: 'CLASES_ASISTIDAS', nombre: 'Clases asistidas', descripcion: 'Total de clases a las que ha hecho check-in.', acumulable: true },
  { metric: 'RESERVAS_TOTALES', nombre: 'Reservas totales', descripcion: 'Total de reservas hechas alguna vez (asistidas o no).', acumulable: true },
  { metric: 'SEMANAS_CONSECUTIVAS', nombre: 'Semanas consecutivas', descripcion: 'Racha de semanas seguidas con al menos una clase asistida.', acumulable: true },
  { metric: 'ASISTENCIA_MENSUAL_COMPLETA', nombre: '100% asistencia mensual', descripcion: 'Ha asistido a todas sus reservas del mes, sin ninguna falta.', acumulable: false },
  { metric: 'AMIGOS_INVITADOS', nombre: 'Amigos invitados', descripcion: 'Amigas referidas que se han dado de alta.', acumulable: true },
  { metric: 'ASISTENCIA_CUMPLEANOS', nombre: 'Asistencia en tu cumpleaños', descripcion: 'Ha asistido a una clase el día de su cumpleaños.', acumulable: false },
];

export function metricaDef(metric: AchievementMetric): AchievementMetricDef | undefined {
  return ACHIEVEMENT_METRICS.find(m => m.metric === metric);
}

function asistioEnCumpleanos(reservas: Reserva[], sesiones: Sesion[], socio: Socio | undefined): boolean {
  if (!socio?.fechaNacimiento) return false;
  const nacimiento = new Date(socio.fechaNacimiento);
  const sesionById = new Map(sesiones.map(s => [s.id, s])); // P0-22
  return reservas
    .filter(r => r.estado === 'ASISTIDA')
    .map(r => sesionById.get(r.sesionId))
    .filter((s): s is Sesion => !!s)
    .some(s => {
      const d = new Date(s.inicio);
      return d.getMonth() === nacimiento.getMonth() && d.getDate() === nacimiento.getDate();
    });
}

function asistenciaMensualCompleta(reservas: Reserva[], sesiones: Sesion[], now: Date): boolean {
  const mes = now.getMonth();
  const año = now.getFullYear();
  const sesionById = new Map(sesiones.map(s => [s.id, s])); // P0-22
  const delMes = reservas.filter(r => {
    const s = sesionById.get(r.sesionId);
    if (!s) return false;
    const d = new Date(s.inicio);
    return d.getMonth() === mes && d.getFullYear() === año && d <= now;
  });
  if (delMes.length === 0) return false;
  return delMes.every(r => r.estado === 'ASISTIDA') && delMes.some(r => r.estado === 'ASISTIDA');
}

export interface MetricaContexto {
  reservas: Reserva[]; // ya filtradas por socio
  sesiones: Sesion[];
  socio: Socio | undefined;
  now: Date;
  todosLosSocios?: Socio[]; // necesario solo para AMIGOS_INVITADOS
}

// Devuelve el progreso actual para una métrica. Para métricas booleanas,
// 1 = cumplida, 0 = no cumplida — el umbral de esas siempre es 1.
export function calcularMetrica(metric: AchievementMetric, ctx: MetricaContexto): number {
  switch (metric) {
    case 'CLASES_ASISTIDAS':
      return ctx.reservas.filter(r => r.estado === 'ASISTIDA').length;
    case 'RESERVAS_TOTALES':
      return ctx.reservas.length;
    case 'SEMANAS_CONSECUTIVAS':
      return calcularRacha(ctx.reservas, ctx.sesiones, ctx.now).semanas;
    case 'ASISTENCIA_MENSUAL_COMPLETA':
      return asistenciaMensualCompleta(ctx.reservas, ctx.sesiones, ctx.now) ? 1 : 0;
    case 'AMIGOS_INVITADOS':
      if (!ctx.socio || !ctx.todosLosSocios) return 0;
      return ctx.todosLosSocios.filter(s => s.referidoPor === ctx.socio!.id).length;
    case 'ASISTENCIA_CUMPLEANOS':
      return asistioEnCumpleanos(ctx.reservas, ctx.sesiones, ctx.socio) ? 1 : 0;
    default:
      return 0;
  }
}
