// Decidir el cobro de bono de UNA reserva, como mucho una vez.
//
// El descuento viejo (`consumir_sesion_bono`) no sabía de qué reserva venía:
// si el proceso moría entre crear la reserva y descontar, el reintento del
// mismo intento no podía saber si ya se había hecho, y no descontaba (clase
// servida sin cobrar el bono). `consumir_sesion_bono_reserva` (migr
// 20260914182637) deja la DECISIÓN marcada en la reserva dentro de la misma
// transacción —«se descontó de tal bono» o «no había bono que cobrar»—, así que
// volver a llamar es seguro: decide si falta y, si no, no hace nada.
//
// Mientras la migración no esté aplicada (mergear no la aplica) se cae al
// descuento viejo con el comportamiento de siempre: la primera vez descuenta, y
// un reintento NO descuenta —sin marca no hay forma de saber si ya se hizo, y
// descontar dos veces es peor que no descontar—.
//
// Sin imports con alias: `node --test` no resuelve `@/`.
import { rpcNoDesplegada } from '../aceptacion-contrato.ts';

export type ResultadoConsumo =
  /** Se ha descontado AHORA, en esta llamada. */
  | 'CONSUMIDA'
  /** Ya se había descontado para esta reserva: no se toca nada. */
  | 'YA_CONSUMIDA'
  /** Ya se había decidido NO cobrarla (sin bono o sin saldo): no se toca nada. */
  | 'YA_DECIDIDA'
  /** Tenía bono consumible, pero otra reserva se llevó el último saldo. */
  | 'SIN_SALDO'
  /** La socia no tiene bono que cubra la clase (mensual, clase suelta ya usada…). */
  | 'SIN_BONO'
  /** Reserva cancelada, en espera o pendiente: no ocupa plaza, no se cobra. */
  | 'NO_OCUPA_PLAZA'
  /** Reintento sobre algo que pudo descontarse sin marca: no se arriesga. */
  | 'NO_VERIFICABLE'
  | 'FALLO';

export interface ConsumoBono {
  resultado: ResultadoConsumo;
  saldo: number | null;
  suscripcionId: string | null;
  /** Qué decidió: la RPC por reserva (con marca), o la vieja porque la nueva no existe aún. */
  via: 'reserva' | 'legado' | null;
  error?: unknown;
}

type ErrorPg = { code?: string | null; message?: string } | null;

/** Lo mínimo del cliente de Supabase que hace falta (y que un test puede fingir). */
export interface ClienteConsumo {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: ErrorPg }>;
}

export const SIN_CONSUMO = (resultado: ResultadoConsumo): ConsumoBono =>
  ({ resultado, saldo: null, suscripcionId: null, via: null });

const RESULTADOS_RPC = new Set<ResultadoConsumo>([
  'CONSUMIDA', 'YA_CONSUMIDA', 'YA_DECIDIDA', 'SIN_SALDO', 'SIN_BONO', 'NO_OCUPA_PLAZA', 'NO_VERIFICABLE',
]);

/**
 * Traduce la fila que ahora devuelve `reservar_plaza` (D-1, migr
 * 20260922...): con esta RPC decide TAMBIÉN el bono (`consumir_bono_interno`,
 * ver comentario de arriba), dentro del mismo `pg_advisory_xact_lock` por
 * socio que confirma la plaza (D-1). El resultado que decide es SIEMPRE una decisión
 * NUEVA en esta llamada (nunca YA_CONSUMIDA/YA_DECIDIDA: la reserva se acaba
 * de insertar en esta misma transacción), pero se reutiliza el mismo
 * conjunto de resultados válidos que la RPC vieja para no duplicar el
 * catálogo.
 */
export function interpretarBonoDeReservarPlaza(fila: unknown): ConsumoBono {
  const f = (fila ?? {}) as { bono_resultado?: unknown; bono_saldo_restante?: unknown; bono_suscripcion_id?: unknown };
  const resultado = f.bono_resultado;
  if (typeof resultado !== 'string' || !RESULTADOS_RPC.has(resultado as ResultadoConsumo)) {
    return { ...SIN_CONSUMO('FALLO'), error: new Error(`reservar_plaza devolvió bono_resultado=${JSON.stringify(f.bono_resultado)}`) };
  }
  return {
    resultado: resultado as ResultadoConsumo,
    saldo: typeof f.bono_saldo_restante === 'number' ? f.bono_saldo_restante : null,
    suscripcionId: typeof f.bono_suscripcion_id === 'string' ? f.bono_suscripcion_id : null,
    via: 'reserva',
  };
}

/** Traduce la fila de `consumir_sesion_bono_reserva`. Algo inesperado es un fallo, nunca un éxito. */
export function interpretarFilaConsumo(fila: unknown): ConsumoBono {
  const f = (fila ?? {}) as { resultado?: unknown; saldo_restante?: unknown; suscripcion_consumida_id?: unknown };
  // RESERVA_NO_ENCONTRADA: la reserva ya no existe (borrada en una carrera). No
  // hay plaza que cobrar, igual que si estuviera cancelada.
  const resultado = f.resultado === 'RESERVA_NO_ENCONTRADA' ? 'NO_OCUPA_PLAZA' : f.resultado;
  if (typeof resultado !== 'string' || !RESULTADOS_RPC.has(resultado as ResultadoConsumo)) {
    return { ...SIN_CONSUMO('FALLO'), error: new Error(`consumir_sesion_bono_reserva devolvió ${JSON.stringify(fila)}`) };
  }
  return {
    resultado: resultado as ResultadoConsumo,
    saldo: typeof f.saldo_restante === 'number' ? f.saldo_restante : null,
    suscripcionId: typeof f.suscripcion_consumida_id === 'string' ? f.suscripcion_consumida_id : null,
    via: 'reserva',
  };
}

/** Estados en los que la reserva ocupa plaza y, por tanto, se cobra. Espejo del SQL. */
export function ocupaPlaza(estado: string | null | undefined): boolean {
  return estado === 'CONFIRMADA' || estado === 'ASISTIDA' || estado === 'NO_ASISTIO';
}

/** ¿Se descontó una sesión para esta reserva (ahora o antes)? Para no mentir en un aviso. */
export function sesionDescontada(c: ConsumoBono): boolean {
  return c.resultado === 'CONSUMIDA' || c.resultado === 'YA_CONSUMIDA';
}

/**
 * ¿Siguen los avisos, la analítica y los créditos después de decidir el cobro?
 *
 *  · Si OTRA llamada ya lo había decidido (`YA_*`), NO: o es un reintento de
 *    algo terminado, o una llamada concurrente con la misma reserva ganó la
 *    carrera y es ella la que avisa. Vale también para la llamada normal.
 *  · En un REINTENTO, solo si la decisión ha ocurrido AHORA, con marca, y la
 *    reserva sigue recién confirmada. Decidir ahora prueba que la primera vez
 *    murió ANTES de los avisos (van después del cobro). Sin esa prueba —legada,
 *    sin migración, fallo— se deja como estaba: un aviso repetido a la socia es
 *    peor que uno perdido, que no mueve dinero. Una reserva que ya pasó a
 *    ASISTIDA/NO_ASISTIO se cobra, pero no se le anuncia una clase ya dada.
 *  · En la llamada normal, todo lo demás sigue como siempre.
 */
export function efectosTrasConsumo(estado: string, c: ConsumoBono, reintento: boolean): boolean {
  if (c.resultado === 'YA_CONSUMIDA' || c.resultado === 'YA_DECIDIDA') return false;
  if (!reintento) return true;
  return estado === 'CONFIRMADA' && c.via === 'reserva'
    && (c.resultado === 'CONSUMIDA' || c.resultado === 'SIN_BONO' || c.resultado === 'SIN_SALDO');
}

/**
 * ¿La columna no existe (o PostgREST aún no la ve)? Pasa mientras la migración
 * no esté aplicada: 42703 es `undefined_column` de Postgres y PGRST204 la
 * columna que falta en la caché de esquema.
 */
export function esColumnaInexistente(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204';
}

/**
 * Al cancelar, ¿se puede devolver una sesión al bono?
 *
 * Una reserva RASTREADA que no tiene suscripción en su decisión nunca llegó a
 * cobrarse: o no había bono, o se cancela mientras el cobro aún está en vuelo
 * (y ese cobro, al ver la reserva cancelada, ya no descontará). Devolverle una
 * sesión regalaría saldo. Las legadas y las no rastreadas siguen como siempre.
 */
export function devolucionPermitida(fila: { bono_consumo_rastreado?: unknown; bono_suscripcion_id?: unknown }): boolean {
  return fila.bono_consumo_rastreado !== true || typeof fila.bono_suscripcion_id === 'string';
}

/**
 * Decide el cobro de `reservaId`: descuenta de `suscripcionId`, o registra que
 * no hay bono (`suscripcionId: null`).
 */
export async function descontarSesionDeReserva(cliente: ClienteConsumo, p: {
  studioId: string; sesionId: string; reservaId: string;
  suscripcionId: string | null; reintento: boolean;
}): Promise<ConsumoBono> {
  const { data, error } = await cliente.rpc('consumir_sesion_bono_reserva', {
    p_reserva_id: p.reservaId,
    p_suscripcion_id: p.suscripcionId,
    p_studio_id: p.studioId,
    p_reintento: p.reintento,
  });
  if (!error) return interpretarFilaConsumo(Array.isArray(data) ? data[0] : data);
  // Cualquier otro error NO cae al descuento viejo: un tiempo agotado pudo
  // confirmar la transacción sin que llegara la respuesta.
  if (!rpcNoDesplegada(error)) return { ...SIN_CONSUMO('FALLO'), via: 'reserva', error };

  // Legado: la RPC por reserva aún no existe (o PostgREST aún no la ve).
  //
  // No se intenta escribir la marca a mano: las columnas llegan en el mismo DDL
  // que la RPC, así que si no se ve la una tampoco se ven las otras. Lo que
  // evita el doble cobro aquí es el orden de aplicación: hasta confirmar que la
  // RPC se ve, las reservas nacen NO rastreadas (sin default), y un reintento
  // sobre ellas no cobra.
  if (p.reintento) return { ...SIN_CONSUMO('NO_VERIFICABLE'), via: 'legado' };
  if (!p.suscripcionId) return { ...SIN_CONSUMO('SIN_BONO'), via: 'legado' };

  const { data: saldo, error: errorViejo } = await cliente.rpc('consumir_sesion_bono', {
    p_suscripcion_id: p.suscripcionId,
    p_studio_id: p.studioId,
    p_sesion_id: p.sesionId,
  });
  if (errorViejo) return { ...SIN_CONSUMO('FALLO'), via: 'legado', error: errorViejo };
  if (saldo == null) return { ...SIN_CONSUMO('SIN_SALDO'), via: 'legado' };
  return { resultado: 'CONSUMIDA', saldo: saldo as number, suscripcionId: p.suscripcionId, via: 'legado' };
}
