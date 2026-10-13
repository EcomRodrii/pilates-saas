// Un cliente de Supabase falso para probar las funciones de servidor de festivos
// y «Repetir este mes» con `node --test`: cada consulta resuelve lo que diga su
// tabla, y se apunta en `llamadas` para poder afirmar «cero consultas».
// No es un .test.ts: no lo ejecuta el runner, lo importan los tests.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface RespuestaFalsa { data?: unknown; error?: { code?: string; message?: string } | null; count?: number | null }

export function supabaseFalso(o: {
  tablas?: Record<string, RespuestaFalsa | ((filtros: string[]) => RespuestaFalsa)>;
  rpc?: (nombre: string, args: Record<string, unknown>) => RespuestaFalsa;
} = {}) {
  const llamadas: string[] = [];
  const rpcs: { nombre: string; args: Record<string, unknown> }[] = [];
  const consulta = (tabla: string) => {
    const filtros: string[] = [];
    const resolver = () => {
      const r = o.tablas?.[tabla];
      const valor = typeof r === 'function' ? r(filtros) : r;
      return Promise.resolve({ data: valor?.data ?? [], error: valor?.error ?? null, count: valor?.count ?? null });
    };
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'neq', 'in', 'gte', 'lte', 'lt', 'gt', 'order', 'range', 'limit', 'not', 'is']) {
      q[m] = (...args: unknown[]) => { filtros.push(`${m}:${JSON.stringify(args)}`); return q; };
    }
    q.maybeSingle = () => resolver();
    q.single = () => resolver();
    q.then = (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => resolver().then(ok, ko);
    return q;
  };
  const admin = {
    from: (tabla: string) => { llamadas.push(tabla); return consulta(tabla); },
    rpc: async (nombre: string, args: Record<string, unknown>) => {
      llamadas.push(`rpc:${nombre}`);
      rpcs.push({ nombre, args });
      const r = o.rpc?.(nombre, args) ?? {};
      return { data: r.data ?? null, error: r.error ?? null };
    },
  };
  return { admin: admin as unknown as SupabaseClient, llamadas, rpcs };
}
