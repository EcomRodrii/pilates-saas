import 'server-only';
import type { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { inicioDelDiaEstudio, finDelDiaEstudio } from '@/lib/utils';
import {
  codificarCursor, decodificarCursor, filtroDespuesDe, leerFecha, leerLimite, leerOrden,
} from './cursor';
import { error, type ContextoApi, type ResultadoApi } from './servidor';

// Listados de la API v1, todos iguales:
//   · SIEMPRE acotados a `ctx.studioId` (aquí, no en cada ruta);
//   · respuesta = array, la forma que la v1 tuvo siempre y que Zapier lee;
//   · paginación por cursor (keyset sobre columna de orden + id) en cabeceras:
//     `X-Hay-Mas: true|false` y `X-Siguiente-Cursor` para pedir `?cursor=…`;
//   · `?desde=&hasta=` ('YYYY-MM-DD', ambos incluidos, días del estudio) sobre
//     la columna de fecha del recurso;
//   · `?orden=desc` (por defecto, lo más reciente primero) o `asc`;
//   · `?limite=` (o `?limit=`, el nombre de siempre), 50 por defecto, 200 máximo.

type Consulta = ReturnType<ReturnType<SupabaseClient['from']>['select']>;

export interface OpcionesListado<T> {
  tabla: string;
  columnas: string;
  /** Columna de orden y de `desde/hasta`. */
  columnaFecha: string;
  /** `date` compara el día tal cual; `timestamp` lo convierte a instantes del día del estudio. */
  tipoFecha: 'date' | 'timestamp';
  serializar: (fila: Record<string, unknown>) => T;
  /** Filtros propios del recurso, ya validados por la ruta. */
  filtrar?: (q: Consulta) => Consulta;
  limitePorDefecto?: number;
}

export async function listar<T>(
  req: NextRequest, admin: SupabaseClient, ctx: ContextoApi, o: OpcionesListado<T>,
): Promise<ResultadoApi> {
  const sp = req.nextUrl.searchParams;
  const n = leerLimite(sp.get('limite') ?? sp.get('limit'), o.limitePorDefecto);
  const orden = leerOrden(sp.get('orden'));
  const cursor = decodificarCursor(sp.get('cursor'));
  const desde = leerFecha(sp.get('desde'));
  const hasta = leerFecha(sp.get('hasta'));
  if (orden === 'invalido') return error(400, 'invalid_request', '`orden` es `asc` o `desc`.', ctx.requestId);
  if (cursor === 'invalido') return error(400, 'invalid_request', '`cursor` no es válido: usa el de la cabecera X-Siguiente-Cursor.', ctx.requestId);
  if (desde === 'invalido' || hasta === 'invalido') return error(400, 'invalid_request', '`desde` y `hasta` van en formato AAAA-MM-DD.', ctx.requestId);

  let q = admin.from(o.tabla).select(o.columnas).eq('studio_id', ctx.studioId) as unknown as Consulta;
  // La columna de orden no puede ser NULL dentro del keyset (fecha de cobro de
  // un recibo sin cobrar, p. ej.): esas filas no entran en un listado por ella.
  q = q.not(o.columnaFecha, 'is', null);
  if (desde) q = q.gte(o.columnaFecha, o.tipoFecha === 'date' ? desde : inicioDelDiaEstudio(desde));
  if (hasta) q = o.tipoFecha === 'date' ? q.lte(o.columnaFecha, hasta) : q.lte(o.columnaFecha, finDelDiaEstudio(hasta));
  if (o.filtrar) q = o.filtrar(q);
  if (cursor) q = q.or(filtroDespuesDe(o.columnaFecha, cursor, orden));
  q = q.order(o.columnaFecha, { ascending: orden === 'asc' }).order('id', { ascending: orden === 'asc' }).limit(n + 1);

  const { data, error: errorBd } = await q;
  if (errorBd) return error(500, 'server_error', 'No se pudo leer el listado.', ctx.requestId);

  const filas = (data ?? []) as unknown as Record<string, unknown>[];
  const hayMas = filas.length > n;
  const pagina = hayMas ? filas.slice(0, n) : filas;
  const ultima = pagina.at(-1);
  const headers: Record<string, string> = { 'X-Hay-Mas': String(hayMas) };
  if (hayMas && ultima) {
    headers['X-Siguiente-Cursor'] = codificarCursor({ v: String(ultima[o.columnaFecha]), id: String(ultima.id) });
  }
  return { status: 200, body: pagina.map(o.serializar), headers };
}

/** Un recurso por id, acotado al estudio. 404 si no es de este estudio. */
export async function obtener<T>(
  admin: SupabaseClient, ctx: ContextoApi,
  o: { tabla: string; columnas: string; id: string; serializar: (fila: Record<string, unknown>) => T; nombre: string },
): Promise<ResultadoApi> {
  if (!/^[0-9A-Za-z_-]{1,120}$/.test(o.id)) return error(404, 'not_found', `${o.nombre} no encontrado.`, ctx.requestId);
  const { data, error: errorBd } = await admin.from(o.tabla).select(o.columnas)
    .eq('studio_id', ctx.studioId).eq('id', o.id).maybeSingle();
  if (errorBd) return error(500, 'server_error', 'No se pudo leer.', ctx.requestId);
  if (!data) return error(404, 'not_found', `${o.nombre} no encontrado.`, ctx.requestId);
  return { status: 200, body: o.serializar(data as unknown as Record<string, unknown>) };
}
