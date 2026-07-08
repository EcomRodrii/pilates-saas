// ─────────────────────────────────────────────────────────────────────────────
// Lógica pura de reservas, aforo, lista de espera y premio de referidos.
//
// Sin React ni Supabase: son funciones deterministas y testeables (ver
// booking-logic.test.ts). El god-context las usa como única fuente de verdad,
// de modo que estas reglas de negocio se pueden verificar sin montar la app.
// ─────────────────────────────────────────────────────────────────────────────

import type { Reserva, EstadoReserva, Socio, RewardAction } from '@/lib/types';

// Plazas realmente ocupadas en una sesión: solo cuentan las confirmadas o ya
// asistidas. La lista de espera NO ocupa aforo.
export function plazasOcupadas(sesionId: string, reservas: Reserva[]): number {
  return reservas.filter(
    r => r.sesionId === sesionId && (r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA'),
  ).length;
}

// Decide el estado de una reserva nueva según el aforo y las reservas actuales.
// Con hueco → CONFIRMADA; sin hueco → LISTA_ESPERA con su posición.
export function decidirReservaNueva(
  aforoMaximo: number | null | undefined,
  sesionId: string,
  reservas: Reserva[],
): { estado: EstadoReserva; posicionEspera: number | null } {
  const aforo = aforoMaximo ?? Number.POSITIVE_INFINITY;
  const hayHueco = plazasOcupadas(sesionId, reservas) < aforo;
  if (hayHueco) return { estado: 'CONFIRMADA', posicionEspera: null };
  const enEspera = reservas.filter(
    r => r.sesionId === sesionId && r.estado === 'LISTA_ESPERA',
  ).length;
  return { estado: 'LISTA_ESPERA', posicionEspera: enEspera + 1 };
}

// Siguiente reserva de la lista de espera a promover al cancelarse una plaza:
// la de menor posición. null si no hay nadie esperando.
export function siguienteEnEspera(sesionId: string, reservas: Reserva[]): Reserva | null {
  return (
    reservas
      .filter(r => r.sesionId === sesionId && r.estado === 'LISTA_ESPERA')
      .sort((a, b) => (a.posicionEspera ?? 0) - (b.posicionEspera ?? 0))[0] ?? null
  );
}

// ¿Es la primera clase ASISTIDA de la socia? (dado el estado de reservas tras
// aplicar el check-in). El premio de referido se paga solo en esta transición.
export function esPrimeraAsistencia(socioId: string, reservas: Reserva[]): boolean {
  return reservas.filter(r => r.socioId === socioId && r.estado === 'ASISTIDA').length === 1;
}

// Cuántos referidos ha premiado ya este mes natural quien invita.
export function contarReferidosPremiadosMes(
  referidorId: string,
  rewardActions: RewardAction[],
  ahora: Date,
): number {
  return rewardActions.filter(a => {
    if (a.trigger !== 'REFERIDO_AMIGO' || a.socioId !== referidorId) return false;
    const d = new Date(a.creadoEn);
    return d.getFullYear() === ahora.getFullYear() && d.getMonth() === ahora.getMonth();
  }).length;
}

// Decide si, tras un check-in, hay que premiar a quien invitó a esta socia:
//  · la socia debe tener referidoPor,
//  · debe ser su PRIMERA asistencia,
//  · el referidor no debe haber superado el tope mensual (null = sin tope).
export function decidirPremioReferido(params: {
  socia: Socio | undefined;
  reservasTrasCheckin: Reserva[];
  rewardActions: RewardAction[];
  topeMensual: number | null;
  ahora: Date;
}): { premiar: boolean; referidorId: string | null } {
  const { socia, reservasTrasCheckin, rewardActions, topeMensual, ahora } = params;
  if (!socia?.referidoPor) return { premiar: false, referidorId: null };
  const referidorId = socia.referidoPor;
  if (!esPrimeraAsistencia(socia.id, reservasTrasCheckin)) return { premiar: false, referidorId };
  if (topeMensual != null && contarReferidosPremiadosMes(referidorId, rewardActions, ahora) >= topeMensual) {
    return { premiar: false, referidorId };
  }
  return { premiar: true, referidorId };
}
