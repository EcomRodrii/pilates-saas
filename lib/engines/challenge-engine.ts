import type { ChallengeDefinition, EstadoReto, Reserva, Sesion, Socio } from '@/lib/types';
import { calcularMetrica } from '@/lib/engines/achievement-engine';
import { referidasDelReto, reservasDelReto, retoEnMarcha, ventanaDelReto } from '@/lib/engines/alcance-reto';

export function estadoReto(reto: ChallengeDefinition, completado: boolean, now: Date): EstadoReto {
  if (completado) return 'COMPLETADO';
  if (new Date(reto.fechaFin) < now) return 'CADUCADO';
  return 'ACTIVO';
}

/** ¿Está en marcha hoy, en el calendario de Madrid? (el día de inicio ya cuenta, el de fin también). */
export function retoVigente(reto: ChallengeDefinition, now: Date): boolean {
  return retoEnMarcha(reto, now);
}

// El progreso de un reto solo cuenta lo que pasa DENTRO de su ventana — a
// diferencia de un logro (permanente), reutiliza el mismo catálogo de métricas
// pero sobre lo ya recortado a ese periodo:
//  · la ventana es el calendario de Madrid (de las 00:00 del día de inicio al
//    final del día de fin) y, en un reto con inscripción, empieza al apuntarse
//    (`inscritaEn`): apuntarse tarde no recupera lo ya hecho;
//  · «invitar amigas» cuenta las altas DENTRO de esa ventana, no todas las de la
//    historia;
//  · «reservas totales» no cuenta canceladas ni lista de espera.
export function calcularProgresoReto(
  reto: ChallengeDefinition,
  reservas: Reserva[],
  sesiones: Sesion[],
  socio: Socio | undefined,
  todosLosSocios: Socio[],
  now: Date,
  inscritaEn?: string | null,
): number {
  const ventana = ventanaDelReto(reto, inscritaEn);
  const inicioDeSesion = new Map(sesiones.map(s => [s.id, s.inicio])); // P0-22
  const reservasEnVentana = reservasDelReto(reto.metric, reservas, inicioDeSesion, ventana);
  const referidas = reto.metric === 'AMIGOS_INVITADOS' ? referidasDelReto(todosLosSocios, ventana) : todosLosSocios;
  return calcularMetrica(reto.metric, { reservas: reservasEnVentana, sesiones, socio, now, todosLosSocios: referidas });
}
