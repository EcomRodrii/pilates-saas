import type { AchievementMetric, AchievementMetricDef, Reserva, Sesion, Socio } from '@/lib/types';

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

function semanasConsecutivas(reservas: Reserva[], sesiones: Sesion[], now: Date): number {
  const asistidas = reservas
    .filter(r => r.estado === 'ASISTIDA')
    .map(r => sesiones.find(s => s.id === r.sesionId))
    .filter((s): s is Sesion => !!s)
    .map(s => new Date(s.inicio));
  if (asistidas.length === 0) return 0;

  // Lunes de la semana de una fecha dada, normalizado a medianoche.
  const lunesDe = (d: Date) => {
    const copia = new Date(d);
    const diaSemana = (copia.getDay() + 6) % 7; // 0 = lunes
    copia.setDate(copia.getDate() - diaSemana);
    copia.setHours(0, 0, 0, 0);
    return copia.getTime();
  };

  const semanasConClase = new Set(asistidas.map(lunesDe));
  let racha = 0;
  let cursor = lunesDe(now);
  const unaSemanaMs = 7 * 86400000;
  // Si esta semana aún no tiene clase, no rompe la racha todavía — se
  // cuenta desde la última semana que sí tuvo actividad.
  if (!semanasConClase.has(cursor)) cursor -= unaSemanaMs;
  while (semanasConClase.has(cursor)) {
    racha++;
    cursor -= unaSemanaMs;
  }
  return racha;
}

function asistioEnCumpleanos(reservas: Reserva[], sesiones: Sesion[], socio: Socio | undefined): boolean {
  if (!socio?.fechaNacimiento) return false;
  const nacimiento = new Date(socio.fechaNacimiento);
  return reservas
    .filter(r => r.estado === 'ASISTIDA')
    .map(r => sesiones.find(s => s.id === r.sesionId))
    .filter((s): s is Sesion => !!s)
    .some(s => {
      const d = new Date(s.inicio);
      return d.getMonth() === nacimiento.getMonth() && d.getDate() === nacimiento.getDate();
    });
}

function asistenciaMensualCompleta(reservas: Reserva[], sesiones: Sesion[], now: Date): boolean {
  const mes = now.getMonth();
  const año = now.getFullYear();
  const delMes = reservas.filter(r => {
    const s = sesiones.find(x => x.id === r.sesionId);
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
      return semanasConsecutivas(ctx.reservas, ctx.sesiones, ctx.now);
    case 'ASISTENCIA_MENSUAL_COMPLETA':
      return asistenciaMensualCompleta(ctx.reservas, ctx.sesiones, ctx.now) ? 1 : 0;
    case 'AMIGOS_INVITADOS':
      // Sin mecanismo de referidos todavía — queda modelado, no calculado.
      return 0;
    case 'ASISTENCIA_CUMPLEANOS':
      return asistioEnCumpleanos(ctx.reservas, ctx.sesiones, ctx.socio) ? 1 : 0;
    default:
      return 0;
  }
}
