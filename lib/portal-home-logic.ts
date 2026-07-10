import type { Reserva, Sesion, Suscripcion, PlanTarifa, TipoClase, Sala, Instructor } from '@/lib/types';
import type { RachaInfo } from '@/lib/streak-engine';

// ¿Esta socia puede reservar sin pagar por clase suelta ahora mismo? — true si
// tiene una suscripción activa que cubre la sesión: mensual ilimitado, o bono
// con sesiones restantes. Si no, se le debe mostrar el precio de clase suelta.
export function tieneCoberturaPlan(activeSus: Suscripcion | null, plan: PlanTarifa | null): boolean {
  if (!activeSus || !plan) return false;
  if (plan.tipo === 'MENSUAL') return true;
  if (plan.tipo === 'BONO') return (activeSus.sesionesRestantes ?? 0) > 0;
  return false;
}

// Decide qué tarjeta principal mostrar en el Home del portal de miembros.
// Función pura y reutilizable — sin JSX, sin estado — para que la lógica de
// negocio ("¿qué le importa a esta socia ahora mismo?") no viva enredada en
// el componente de página.

export type HomeCardContext =
  | { caso: 'PROXIMA_CLASE'; sesion: Sesion; tipo: TipoClase | null; sala: Sala | null; instructor: Instructor | null; reserva: Reserva }
  | { caso: 'ULTIMA_SESION'; sesionesRestantes: number }
  | { caso: 'RACHA_EN_RIESGO'; semanas: number; diasParaPerder: number }
  | { caso: 'INACTIVA'; diasSinVenir: number }
  | { caso: 'SIN_CLASES' };

const DIAS_INACTIVIDAD = 10;

export function getHomeCardContext({
  now,
  misReservas,
  sesiones,
  tiposClase,
  salas,
  instructores,
  activeSus,
  racha,
}: {
  now: Date;
  misReservas: Reserva[];
  sesiones: Sesion[];
  tiposClase: TipoClase[];
  salas: Sala[];
  instructores: Instructor[];
  activeSus: Suscripcion | null;
  racha: RachaInfo;
}): HomeCardContext {
  const sesionById = new Map(sesiones.map(s => [s.id, s])); // P0-22
  const proxima = misReservas
    .filter(r => r.estado === 'CONFIRMADA')
    .map(r => ({ r, s: sesionById.get(r.sesionId) }))
    .filter((x): x is { r: Reserva; s: Sesion } => !!x.s && new Date(x.s.inicio) > now)
    .sort((a, b) => new Date(a.s.inicio).getTime() - new Date(b.s.inicio).getTime())[0] ?? null;

  // CASO C — se le acaba el bono: es lo más urgente, se avisa aunque ya
  // tenga una clase reservada.
  if (activeSus?.sesionesRestantes === 1) {
    return { caso: 'ULTIMA_SESION', sesionesRestantes: 1 };
  }

  // CASO E — tiene una racha de semanas y todavía no ha entrenado esta
  // semana. Solo se avisa si no tiene ya una clase reservada que la salve.
  if (!proxima && racha.enRiesgo && racha.diasParaPerder != null) {
    return { caso: 'RACHA_EN_RIESGO', semanas: racha.semanas, diasParaPerder: racha.diasParaPerder };
  }

  // CASO B — ya tiene una clase confirmada próxima.
  if (proxima) {
    const tipo = tiposClase.find(t => t.id === proxima.s.tipoClaseId) ?? null;
    const sala = salas.find(s => s.id === proxima.s.salaId) ?? null;
    const instructor = instructores.find(i => i.id === proxima.s.instructorId) ?? null;
    return { caso: 'PROXIMA_CLASE', sesion: proxima.s, tipo, sala, instructor, reserva: proxima.r };
  }

  // CASO D — lleva más de 10 días sin asistir (y no tiene nada reservado).
  const ultimaAsistida = misReservas
    .filter(r => r.estado === 'ASISTIDA')
    .map(r => sesionById.get(r.sesionId))
    .filter((s): s is Sesion => !!s)
    .sort((a, b) => new Date(b.inicio).getTime() - new Date(a.inicio).getTime())[0] ?? null;

  if (ultimaAsistida) {
    const dias = Math.floor((now.getTime() - new Date(ultimaAsistida.inicio).getTime()) / 86400000);
    if (dias >= DIAS_INACTIVIDAD) {
      return { caso: 'INACTIVA', diasSinVenir: dias };
    }
  }

  // CASO A — nunca ha reservado nada, o no tiene nada pendiente ni activo reciente.
  return { caso: 'SIN_CLASES' };
}
