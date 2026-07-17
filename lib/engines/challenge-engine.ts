import type { ChallengeDefinition, EstadoReto, Reserva, Sesion, Socio } from '@/lib/types';
import { calcularMetrica } from '@/lib/engines/achievement-engine';

export function estadoReto(reto: ChallengeDefinition, completado: boolean, now: Date): EstadoReto {
  if (completado) return 'COMPLETADO';
  if (new Date(reto.fechaFin) < now) return 'CADUCADO';
  return 'ACTIVO';
}

// El progreso de un reto solo cuenta lo que pasa DENTRO de su ventana de
// fechas — a diferencia de un logro (permanente), reutiliza el mismo
// catálogo de métricas pero sobre reservas ya recortadas a ese periodo.
export function calcularProgresoReto(
  reto: ChallengeDefinition,
  reservas: Reserva[],
  sesiones: Sesion[],
  socio: Socio | undefined,
  todosLosSocios: Socio[],
  now: Date,
): number {
  const desde = new Date(reto.fechaInicio);
  const hasta = new Date(reto.fechaFin);
  const sesionById = new Map(sesiones.map(s => [s.id, s])); // P0-22
  const reservasEnVentana = reservas.filter(r => {
    const s = sesionById.get(r.sesionId);
    if (!s) return false;
    const d = new Date(s.inicio);
    return d >= desde && d <= hasta;
  });
  return calcularMetrica(reto.metric, { reservas: reservasEnVentana, sesiones, socio, now, todosLosSocios });
}
