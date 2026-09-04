// lib/decision/snapshot-cache-parse.ts — parseo puro de lo que devuelve la RPC
// `decision_get_cached_snapshot`. Separado de snapshot-cache.ts (que importa el
// cliente admin por `@/`) para poder probarlo con `node --test`.

import type { SnapshotEstudio } from './tipos.ts';

// ⚠️ PostgREST devuelve un `jsonb` YA parseado: supabase-js hace `JSON.parse`
// del cuerpo de la respuesta, así que `data` llega como objeto, no como texto.
// El código original hacía `JSON.parse(data)` encima — `JSON.parse({})` es
// `JSON.parse("[object Object]")`, que lanza — se capturaba, devolvía null y
// la caché no acertaba NUNCA (escribía en cada pasada, no leía en ninguna).
// Se admite también texto por si algún día la RPC devolviera `text`.
export function parsearSnapshotCacheado(data: unknown): SnapshotEstudio | null {
  if (data == null) return null;
  let valor: unknown = data;
  if (typeof valor === 'string') {
    try {
      valor = JSON.parse(valor);
    } catch {
      return null;
    }
  }
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return null;
  // Sanidad mínima: un snapshot siempre lleva studioId y la lista de socias.
  const s = valor as Partial<SnapshotEstudio>;
  if (typeof s.studioId !== 'string' || !Array.isArray(s.socios)) return null;
  return valor as SnapshotEstudio;
}
