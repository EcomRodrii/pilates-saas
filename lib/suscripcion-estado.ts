// ─────────────────────────────────────────────────────────────────────────────
// "¿Cuánto le queda?" — lectura de UNA suscripción/bono, ya lista para pintar.
//
// Sin React ni Supabase: determinista y testeable (ver suscripcion-estado.test.ts),
// mismo patrón que bono-logic.ts/bonos-portal.ts. Reutilizado tanto por la ficha
// de clientas (panel) como por el portal (`/bonos`) — una sola cuenta de días,
// no dos implementaciones que puedan divergir.
//
// No decide nada de negocio (eso sigue en bono-logic.ts/renovacion-server.ts):
// solo LEE fecha_fin/sesiones_restantes/estado ya calculados en servidor y los
// traduce a "N clases restantes" / "caduca en N días" / "próxima renovación en
// N días".
//
// `fechaFin` en un plan MENSUAL representa el PRÓXIMO ciclo de cobro, no una
// caducidad — lo confirma `renovacion-server.ts` (`aplicarRenovacionSuscripcion`
// del cliente es su espejo exacto): al renovar un MENSUAL, SIEMPRE empuja
// `fecha_fin` un mes hacia delante y nunca lo deja caducar, tanto si el cobro
// llegó por un webhook de Stripe como si una recepcionista lo marcó "cobrado"
// a mano — el campo significa lo mismo en ambos casos. `plan.tipo`, no
// `stripeSubscriptionId`, es la señal que usa esa función para bifurcar entre
// la rama BONO/PUNTUAL (refill de sesiones) y la rama MENSUAL (empujar
// fecha_fin), así que es la misma señal que hay que usar aquí para no divergir
// del código real que aplica la renovación. En un BONO/PUNTUAL, la misma
// columna sí es una caducidad real fijada al comprar (`calcularFechaFinBono`).
// `stripeSubscriptionId` solo indica si la renovación es automática (Stripe) o
// manual (mostrador) — no cambia lo que significa `fechaFin`, así que no se usa
// para esta bifurcación.

import type { Suscripcion, PlanTarifa } from './types.ts';

export type EstadoSuscripcionUI =
  | {
      kind: 'bono';
      restantes: number;
      total: number | null;
      diasCaduca: number | null; // null = sin fecha de caducidad
      caducado: boolean;
      urgente: boolean;
    }
  | { kind: 'recurrente'; diasRenueva: number | null; urgente: boolean }
  | { kind: 'pausada' }
  | { kind: 'cancelada' }
  | { kind: 'expirada' }
  | { kind: 'sin_plan' };

/** Días entre hoy y `fechaISO` (negativo si ya pasó). Solo la parte de fecha, UTC. */
function diasHasta(fechaISO: string, hoyISO: string): number {
  const ms =
    Date.parse(`${fechaISO.slice(0, 10)}T00:00:00Z`) - Date.parse(`${hoyISO.slice(0, 10)}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

// Mismo umbral visual que ya usa el badge "Bono expirado"/"Sesiones restantes"
// en `app/(dashboard)/clientas/page.tsx` y `[id]/page.tsx`: ≤3 días o ≤2 clases.
const UMBRAL_DIAS_URGENTE = 3;
const UMBRAL_SESIONES_URGENTE = 2;

export function calcularEstadoSuscripcion(
  suscripcion: Suscripcion | null | undefined,
  plan: PlanTarifa | null | undefined,
  hoyISO: string = new Date().toISOString().slice(0, 10),
): EstadoSuscripcionUI {
  if (!suscripcion || !plan) return { kind: 'sin_plan' };
  if (suscripcion.estado === 'PAUSADA') return { kind: 'pausada' };
  if (suscripcion.estado === 'CANCELADA') return { kind: 'cancelada' };
  if (suscripcion.estado === 'EXPIRADA') return { kind: 'expirada' };

  const esMensual = plan.tipo === 'MENSUAL';
  if (esMensual) {
    const dias = suscripcion.fechaFin ? diasHasta(suscripcion.fechaFin, hoyISO) : null;
    return { kind: 'recurrente', diasRenueva: dias, urgente: dias !== null && dias <= UMBRAL_DIAS_URGENTE };
  }

  const restantes = suscripcion.sesionesRestantes ?? 0;
  const total = plan.sesiones ?? null;
  const dias = suscripcion.fechaFin ? diasHasta(suscripcion.fechaFin, hoyISO) : null;
  return {
    kind: 'bono',
    restantes,
    total,
    diasCaduca: dias,
    caducado: dias !== null && dias < 0,
    urgente: (dias !== null && dias >= 0 && dias <= UMBRAL_DIAS_URGENTE) || restantes <= UMBRAL_SESIONES_URGENTE,
  };
}

/** "Caduca en 3 días" / "Caduca hoy" / "Caducado hace 2 días" / "Próxima renovación en 6 días". */
export function textoCaducidad(estado: EstadoSuscripcionUI): string | null {
  if (estado.kind === 'bono') {
    if (estado.diasCaduca === null) return null;
    if (estado.diasCaduca < 0) return `Caducado hace ${Math.abs(estado.diasCaduca)} día${Math.abs(estado.diasCaduca) === 1 ? '' : 's'}`;
    if (estado.diasCaduca === 0) return 'Caduca hoy';
    return `Caduca en ${estado.diasCaduca} día${estado.diasCaduca === 1 ? '' : 's'}`;
  }
  if (estado.kind === 'recurrente') {
    if (estado.diasRenueva === null) return null;
    if (estado.diasRenueva <= 0) return 'Renueva hoy';
    return `Próxima renovación en ${estado.diasRenueva} día${estado.diasRenueva === 1 ? '' : 's'}`;
  }
  return null;
}
