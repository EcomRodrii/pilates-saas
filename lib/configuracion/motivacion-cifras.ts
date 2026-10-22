// Las tres cifras de la cabecera de Motivación: alumnas con créditos vivos,
// logros conseguidos este mes y canjes por entregar.
//
// Se CUENTAN en la base (`count: 'exact', head: true`), no con las filas que
// carga el panel: `cargarGamificacion` las pide sin límite y PostgREST corta a
// 1.000, así que en un estudio grande una cifra sumada en el navegador saldría
// más baja que la real sin decir nada. Leer la cifra la protege la RLS: solo la
// propietaria abre Motivación.
//
// «Hoy» y «este mes» son los de Madrid (`hoyEnEstudio`), nunca los de UTC.

import { hoyEnEstudio, inicioDelDiaEstudio } from '../utils.ts';

export interface CifrasMotivacion {
  /** Con saldo mayor que 0 que no ha caducado (`saldo_vivo`: caducar hoy aún cuenta). */
  alumnasConCreditos: number;
  /** Logros completados desde el día 1 de este mes, a las 00:00 de Madrid. */
  logrosEsteMes: number;
  canjesPorEntregar: number;
}

/** Hoy y el comienzo del mes, en el estudio. */
export function cortesDeCifras(ahora: Date): { hoy: string; inicioMes: string } {
  const hoy = hoyEnEstudio(ahora);
  return { hoy, inicioMes: inicioDelDiaEstudio(`${hoy.slice(0, 8)}01`) };
}

// Lo mínimo del cliente de supabase-js que se usa: así el test le pasa uno falso.
type Respuesta = PromiseLike<{ count: number | null; error: unknown }>;
interface Consulta extends Respuesta {
  eq(columna: string, valor: unknown): Consulta;
  gt(columna: string, valor: unknown): Consulta;
  gte(columna: string, valor: unknown): Consulta;
  or(filtro: string): Consulta;
}
export interface ClienteCifras {
  from(tabla: string): { select(columnas: string, opciones: { count: 'exact'; head: true }): Consulta };
}

/** `null` si alguna no se pudo contar: una cifra a medias no se enseña. */
export async function contarCifrasMotivacion(
  cliente: ClienteCifras,
  studioId: string,
  ahora: Date = new Date(),
): Promise<CifrasMotivacion | null> {
  const { hoy, inicioMes } = cortesDeCifras(ahora);
  const contar = (tabla: string) => cliente.from(tabla).select('*', { count: 'exact', head: true }).eq('studio_id', studioId);
  const [creditos, logros, canjes] = await Promise.all([
    contar('member_credits').gt('saldo', 0).or(`caduca_el.is.null,caduca_el.gte.${hoy}`),
    contar('achievement_progress').eq('completado', true).gte('completado_en', inicioMes),
    contar('reward_redemptions').eq('estado', 'PENDIENTE'),
  ]);
  if (creditos.error || logros.error || canjes.error) return null;
  if (creditos.count == null || logros.count == null || canjes.count == null) return null;
  return { alumnasConCreditos: creditos.count, logrosEsteMes: logros.count, canjesPorEntregar: canjes.count };
}
