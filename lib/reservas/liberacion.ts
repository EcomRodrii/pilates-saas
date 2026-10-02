// Liberar los derechos de una reserva cancelada, UNA vez y leyendo qué consumió ELLA.
//
// Cuando el estudio cancela una clase, cada reserva tiene que dar de vuelta lo que
// consumió: la sesión del bono exacto que la pagó, y la recuperación si la había usado.
// Antes cada camino (panel, sustituciones, mínimo de asistentes, «Eliminar clase») lo
// decidía por su cuenta y los cuatro acabaron distintos: uno sumaba una sesión a ciegas,
// otro se la sumaba a una plaza fija que no había consumido nada, y ninguno restituía la
// recuperación. La decisión vive ahora en la RPC `liberar_derecho` (migr 20261002140000);
// este módulo solo la llama y traduce su respuesta.
//
// Sin imports con alias: `node --test` no resuelve `@/`.

/** Los motivos con los que se puede liberar. Cada uno tiene que existir en la RPC. */
export const MOTIVOS_LIBERACION = [
  'estudio_cancela_clase',
  'eliminar_clase',
  'instructora_baja_sin_sustituta',
  'minimo_asistentes',
] as const;
export type MotivoLiberacion = (typeof MOTIVOS_LIBERACION)[number];

export function esMotivoLiberacion(v: unknown): v is MotivoLiberacion {
  return typeof v === 'string' && (MOTIVOS_LIBERACION as readonly string[]).includes(v);
}

/**
 * Qué pasó con el bono de esa reserva.
 *  · DEVUELTO — se sumó una sesión al bono que la pagó.
 *  · YA_DEVUELTO — ya se había devuelto antes (reintento): no se toca nada.
 *  · SIN_CONSUMO — no consumió ningún bono (la cubría la cuota, una plaza fija, una recuperación
 *    o no había bono): no hay nada que devolver.
 *  · SIN_HUECO — el bono ya estaba al tope del plan: no se puede sumar más.
 *  · POLITICA_NO_DEVUELVE — el estudio decidió no devolver el bono al cancelar una clase.
 *  · LEGADO_SIN_RASTRO — reserva importada o anterior al rastreo: la RPC no adivina a qué bono
 *    sumar y lo deja al llamador (ver `liberarReservaCancelada`).
 */
export type VeredictoBono =
  | 'DEVUELTO' | 'YA_DEVUELTO' | 'SIN_CONSUMO' | 'SIN_HUECO' | 'POLITICA_NO_DEVUELVE' | 'LEGADO_SIN_RASTRO';

export type ResultadoLiberacion = 'OK' | 'RESERVA_NO_ENCONTRADA' | 'RESERVA_ACTIVA' | 'SESION_NO_CANCELADA';

export interface Liberacion {
  resultado: ResultadoLiberacion;
  bono: VeredictoBono | null;
  saldo: number | null;
  recuperacionRestituida: boolean;
  socioId: string | null;
}

const RESULTADOS = new Set<ResultadoLiberacion>(['OK', 'RESERVA_NO_ENCONTRADA', 'RESERVA_ACTIVA', 'SESION_NO_CANCELADA']);
const VEREDICTOS = new Set<VeredictoBono>([
  'DEVUELTO', 'YA_DEVUELTO', 'SIN_CONSUMO', 'SIN_HUECO', 'POLITICA_NO_DEVUELVE', 'LEGADO_SIN_RASTRO',
]);

/**
 * Traduce lo que devuelve la RPC. `null` si no es lo que se espera: quien llama lo trata como
 * un FALLO (nunca como «no había nada que devolver»), porque callarse es justo lo que dejaba
 * a una socia sin su sesión sin que nadie se enterara.
 */
export function interpretarLiberacion(data: unknown): Liberacion | null {
  if (data == null || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.resultado !== 'string' || !RESULTADOS.has(d.resultado as ResultadoLiberacion)) return null;
  const bono = d.bono;
  if (bono != null && (typeof bono !== 'string' || !VEREDICTOS.has(bono as VeredictoBono))) return null;
  return {
    resultado: d.resultado as ResultadoLiberacion,
    bono: (bono as VeredictoBono | null | undefined) ?? null,
    saldo: typeof d.saldo === 'number' ? d.saldo : null,
    recuperacionRestituida: d.recuperacion_restituida === true,
    socioId: typeof d.socio_id === 'string' ? d.socio_id : null,
  };
}

type ErrorPg = { code?: string | null; message?: string } | null;

/** Lo mínimo del cliente de Supabase que hace falta (y que un test puede fingir). */
export interface ClienteLiberacion {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: ErrorPg }>;
}

export type ResultadoLlamada =
  | { ok: true; liberacion: Liberacion }
  | { ok: false; error: unknown };

/** Llama a `liberar_derecho`. Un error de la RPC o una respuesta rara es `ok: false`, nunca «nada que hacer». */
export async function llamarLiberarDerecho(cliente: ClienteLiberacion, p: {
  studioId: string; reservaId: string; motivo: MotivoLiberacion;
}): Promise<ResultadoLlamada> {
  const { data, error } = await cliente.rpc('liberar_derecho', {
    p_studio_id: p.studioId, p_reserva_id: p.reservaId, p_motivo: p.motivo,
  });
  if (error) return { ok: false, error };
  const liberacion = interpretarLiberacion(data);
  if (!liberacion) return { ok: false, error: new Error(`liberar_derecho devolvió ${JSON.stringify(data)}`) };
  return { ok: true, liberacion };
}
