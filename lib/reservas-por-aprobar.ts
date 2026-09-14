// ─────────────────────────────────────────────────────────────────────────────
// Reservas pendientes de aprobación, decididas desde la bandeja de Inicio
// (components/dashboard/reservas-por-aprobar.tsx) o desde la clase en el
// calendario. Las dos puntas llaman a POST /api/reservas/resolver-pendiente y
// las dos dicen lo mismo con lo que conteste: una sola traducción, aquí.
//
// Puro y sin I/O (ver reservas-por-aprobar.test.ts).
// ─────────────────────────────────────────────────────────────────────────────

import { mensajeHttp, mensajeSeguro } from './errores.ts';

export interface ReservaPendiente {
  id: string;
  sesionId: string;
  socioId: string | null;
  clase: string;
  /** ISO del inicio de la clase. */
  inicio: string;
}

export interface ReservaPorAprobar extends ReservaPendiente {
  socioNombre: string;
}

/** Una fila tal cual la devuelve PostgREST: el embed puede llegar como objeto o como array. */
export interface FilaReservaPorAprobar {
  id?: unknown;
  sesion_id?: unknown;
  socio_id?: unknown;
  estado?: unknown;
  sesiones?: unknown;
}

/** Cuántas se pintan a la vez en la bandeja: las más próximas primero. */
export const VISIBLES_POR_APROBAR = 10;

function primero(x: unknown): Record<string, unknown> | null {
  const v = Array.isArray(x) ? x[0] : x;
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
}

/**
 * Las que de verdad se pueden decidir, ordenadas por inicio de la clase.
 *
 * ⚠️ Repite en JS el filtro que ya lleva la consulta (estado + clase aún no
 * empezada). No sobra: los mocks de e2e (e2e/panel-sembrado.ts) contestan
 * `rest/v1/reservas**` sin aplicar filtros, y sin esta pasada la tarjeta
 * saldría en cada spec que abre /dashboard. Y en real, una clase que empieza
 * entre la consulta y el render ya no admite aprobación (la RPC la cancela).
 */
export function reservasPorAprobarDe(
  filas: ReadonlyArray<FilaReservaPorAprobar | null> | null | undefined,
  ahora: Date,
): ReservaPendiente[] {
  if (!Array.isArray(filas)) return [];
  const limite = ahora.getTime();
  const validas: Array<ReservaPendiente & { ms: number }> = [];
  for (const f of filas) {
    if (!f || f.estado !== 'PENDIENTE_APROBACION') continue;
    if (typeof f.id !== 'string' || typeof f.sesion_id !== 'string') continue;
    const sesion = primero(f.sesiones);
    const inicio = sesion?.inicio;
    if (typeof inicio !== 'string') continue;
    const ms = Date.parse(inicio);
    if (!Number.isFinite(ms) || ms <= limite) continue;
    const tipo = primero(sesion?.tipos_clase);
    const nombre = typeof tipo?.nombre === 'string' ? tipo.nombre.trim() : '';
    validas.push({
      id: f.id, sesionId: f.sesion_id, socioId: typeof f.socio_id === 'string' ? f.socio_id : null,
      clase: nombre || 'Clase', inicio, ms,
    });
  }
  return validas.sort((a, b) => a.ms - b.ms).map(({ ms: _ms, ...r }) => r);
}

/** Respuesta cruda del POST. `status: 0` = no llegó a contestar (sin red). */
export interface RespuestaDecision {
  status: number;
  body: unknown;
}

export interface ResultadoDecision {
  /** true = la reserva ya no está pendiente: la fila sobra. */
  quitar: boolean;
  mensaje: string;
}

export const SIN_GUARDAR = 'No se ha podido guardar. Vuelve a intentarlo';
export const YA_NO_PENDIENTE = 'Esta reserva ya no está pendiente de aprobación. Mira la clase para ver cómo ha quedado';

/**
 * Qué se le dice a quien pulsa y si la fila se va, según la respuesta real.
 *
 *   200 → la fila se va, diciendo cómo ha quedado DE VERDAD: aprobar no es
 *         siempre «plaza confirmada» — la RPC vuelve a mirar el aforo con lock
 *         y, si se llenó mientras esperaba, la deja en LISTA_ESPERA.
 *   409 → ya no estaba pendiente (otra persona, el cron o un reintento de una
 *         aprobación que sí entró): la fila se va, sin afirmar nada que no sabemos.
 *   4xx → sigue pendiente (p. ej. el límite semanal de su plan): la fila se
 *         queda con el motivo del servidor.
 *   sin red / 5xx → no sabemos si entró: la fila se queda y se puede reintentar
 *         (un reintento que ya entró vuelve como 409).
 */
export function resultadoDecisionReserva(aprobar: boolean, r: RespuestaDecision): ResultadoDecision {
  const body = r.body && typeof r.body === 'object' ? (r.body as Record<string, unknown>) : {};

  if (r.status >= 200 && r.status < 300) {
    if (body.motivoUI === 'clase_ya_empezada') {
      return { quitar: true, mensaje: 'La clase ya ha empezado: la reserva se ha cancelado sola y ya no puede aprobarse' };
    }
    if (aprobar && body.estado === 'CONFIRMADA') return { quitar: true, mensaje: 'Reserva aprobada: tiene su plaza confirmada' };
    if (aprobar && body.estado === 'LISTA_ESPERA') {
      return { quitar: true, mensaje: 'La clase se llenó mientras esperaba: la reserva pasa a la lista de espera' };
    }
    if (!aprobar && body.estado === 'CANCELADA') return { quitar: true, mensaje: 'Reserva rechazada' };
    // El servidor aceptó, pero no dice cómo ha quedado: ya no está pendiente,
    // y decir «aprobada» sin saberlo sería inventárselo.
    return { quitar: true, mensaje: YA_NO_PENDIENTE };
  }

  if (r.status === 409) return { quitar: true, mensaje: YA_NO_PENDIENTE };
  if (r.status === 0 || r.status >= 500) return { quitar: false, mensaje: SIN_GUARDAR };
  if (r.status === 401 || r.status === 403) return { quitar: false, mensaje: mensajeHttp(r.status) };
  return { quitar: false, mensaje: mensajeSeguro(body.error, SIN_GUARDAR) };
}
