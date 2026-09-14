// Descontar la sesión de bono de UNA reserva, como mucho una vez.
//
// El descuento viejo (`consumir_sesion_bono`) no sabía de qué reserva venía:
// si el proceso moría entre crear la reserva y descontar, el reintento del
// mismo intento no podía saber si ya se había hecho, y no descontaba (clase
// servida sin cobrar el bono). `consumir_sesion_bono_reserva` (migr
// 20260914130000) deja una marca en la reserva dentro de la misma transacción,
// así que volver a llamar es seguro: descuenta si falta y, si no, no hace nada.
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
  /** Qué RPC decidió: la idempotente, o la vieja porque la nueva no existe aún. */
  via: 'reserva' | 'legado' | null;
  error?: unknown;
}

type ErrorPg = { code?: string | null; message?: string } | null;

/** Lo mínimo del cliente de Supabase que hace falta (y que un test puede fingir). */
export interface ClienteConsumo {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: ErrorPg }>;
  from(tabla: string): {
    update(valores: Record<string, unknown>): {
      eq(columna: string, valor: string): {
        eq(columna: string, valor: string): {
          is(columna: string, valor: null): PromiseLike<{ error: ErrorPg }>;
        };
      };
    };
  };
}

export const SIN_CONSUMO = (resultado: ResultadoConsumo): ConsumoBono =>
  ({ resultado, saldo: null, suscripcionId: null, via: null });

const RESULTADOS_RPC = new Set<ResultadoConsumo>(['CONSUMIDA', 'YA_CONSUMIDA', 'SIN_SALDO', 'NO_OCUPA_PLAZA', 'NO_VERIFICABLE']);

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
 * En un REINTENTO del mismo intento, ¿se repiten los avisos y demás efectos?
 *
 * Solo si el bono se ha descontado AHORA y la reserva sigue recién confirmada.
 * Descontar ahora es la prueba de que la primera vez murió ANTES de llegar a
 * los avisos (van después del descuento), así que mandarlos no duplica nada. En
 * cualquier otro caso no hay prueba —pudo morir después de avisar— y se deja
 * como estaba: un aviso repetido a la socia es peor que uno perdido, que no
 * mueve dinero. Los avisos llevan además su propia clave de deduplicación.
 *
 * Una reserva que ya pasó a ASISTIDA/NO_ASISTIO sí se cobra (la clase se dio),
 * pero no se le manda «reserva confirmada» de una clase que ya ocurrió.
 */
export function efectosTrasReintento(estado: string, c: ConsumoBono): boolean {
  return c.resultado === 'CONSUMIDA' && estado === 'CONFIRMADA';
}

/**
 * Descuenta la sesión de `suscripcionId` para `reservaId`.
 *
 * `reservaId: null` = no se ha podido identificar la reserva: se usa el
 * descuento viejo (el de siempre) y solo si no es un reintento.
 */
export async function descontarSesionDeReserva(cliente: ClienteConsumo, p: {
  studioId: string; sesionId: string; suscripcionId: string;
  reservaId: string | null; reintento: boolean;
}): Promise<ConsumoBono> {
  if (p.reservaId) {
    const { data, error } = await cliente.rpc('consumir_sesion_bono_reserva', {
      p_reserva_id: p.reservaId,
      p_suscripcion_id: p.suscripcionId,
      p_studio_id: p.studioId,
      p_reintento: p.reintento,
    });
    if (!error) return interpretarFilaConsumo(Array.isArray(data) ? data[0] : data);
    if (!rpcNoDesplegada(error)) return { ...SIN_CONSUMO('FALLO'), via: 'reserva', error };
  }

  // Legado: la RPC por reserva aún no existe (o no hay reserva que marcar).
  if (p.reintento) return { ...SIN_CONSUMO('NO_VERIFICABLE'), via: 'legado' };

  const { data: saldo, error } = await cliente.rpc('consumir_sesion_bono', {
    p_suscripcion_id: p.suscripcionId,
    p_studio_id: p.studioId,
    p_sesion_id: p.sesionId,
  });
  if (error) return { ...SIN_CONSUMO('FALLO'), via: 'legado', error };
  if (saldo == null) return { ...SIN_CONSUMO('SIN_SALDO'), via: 'legado' };

  // Si las columnas ya existen pero la RPC todavía no está en la caché de
  // PostgREST (los segundos justo después de aplicar la migración), deja la
  // marca igualmente: sin ella, un reintento posterior sobre esta reserva
  // —que ya nace rastreada— descontaría otra vez. Mejor esfuerzo: si las
  // columnas no existen, el error se ignora y todo sigue como antes.
  if (p.reservaId) {
    await cliente.from('reservas')
      .update({ bono_suscripcion_id: p.suscripcionId, bono_consumido_en: new Date().toISOString() })
      .eq('id', p.reservaId).eq('studio_id', p.studioId)
      .is('bono_consumido_en', null);
  }
  return { resultado: 'CONSUMIDA', saldo: saldo as number, suscripcionId: p.suscripcionId, via: 'legado' };
}
