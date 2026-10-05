// ─────────────────────────────────────────────────────────────────────────────
// Un cliente de Supabase FALSO para las pruebas de `node --test` de los
// cargadores de servidor (lib/clientas/estado-servidor.ts,
// lib/cobros/recibos-servidor.ts, lib/calendario/rango-servidor.ts y las
// herramientas del asistente). Solo para pruebas: nada de producción lo importa.
//
// Filtra de verdad (`eq`, `neq`, `in`, `is`, `gt/gte/lt/lte`, `not … is null`),
// ordena y corta con `range` como PostgREST, y además CORTA A `maxFilas` por
// petición: una lectura sin paginar sale truncada en la prueba igual que en
// producción. Apunta cada consulta (tabla y filtros) para poder comprobar que
// todas iban acotadas al estudio.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';

type Fila = Record<string, unknown>;
type Filtro = (f: Fila) => boolean;

export interface ConsultaApuntada {
  tabla: string;
  /** `columna=valor` de cada `.eq(...)`, en orden. */
  eqs: string[];
  rango: [number, number] | null;
}

export interface SupabaseFalso {
  admin: SupabaseClient;
  consultas: ConsultaApuntada[];
}

export function supabaseFalso(
  tablas: Record<string, Fila[]>,
  opciones: { maxFilas?: number; fallan?: readonly string[] } = {},
): SupabaseFalso {
  const maxFilas = opciones.maxFilas ?? 1000;
  const consultas: ConsultaApuntada[] = [];

  const consulta = (tabla: string) => {
    const filtros: Filtro[] = [];
    const apunte: ConsultaApuntada = { tabla, eqs: [], rango: null };
    consultas.push(apunte);
    let orden: { col: string; asc: boolean }[] = [];
    let limite: number | null = null;
    let unaSola = false;

    const resolver = () => {
      if (opciones.fallan?.includes(tabla)) return { data: null, error: { message: `falla ${tabla}` }, count: null };
      let filas = (tablas[tabla] ?? []).filter(f => filtros.every(fn => fn(f)));
      for (const o of [...orden].reverse()) {
        filas = [...filas].sort((a, b) => {
          const x = String(a[o.col] ?? ''), y = String(b[o.col] ?? '');
          return o.asc ? x.localeCompare(y) : y.localeCompare(x);
        });
      }
      if (apunte.rango) filas = filas.slice(apunte.rango[0], apunte.rango[1] + 1);
      if (limite !== null) filas = filas.slice(0, limite);
      filas = filas.slice(0, maxFilas);
      if (unaSola) return { data: filas[0] ?? null, error: null, count: null };
      return { data: filas, error: null, count: filas.length };
    };

    const q: Record<string, unknown> = {
      select: () => q,
      eq: (c: string, v: unknown) => { apunte.eqs.push(`${c}=${String(v)}`); filtros.push(f => f[c] === v); return q; },
      neq: (c: string, v: unknown) => { filtros.push(f => f[c] !== v); return q; },
      in: (c: string, vs: readonly unknown[]) => { filtros.push(f => vs.includes(f[c])); return q; },
      is: (c: string, v: null) => { filtros.push(f => (f[c] ?? null) === v); return q; },
      not: (c: string, op: string, v: unknown) => {
        if (op === 'is' && v === null) filtros.push(f => (f[c] ?? null) !== null);
        return q;
      },
      gt: (c: string, v: string | number) => { filtros.push(f => f[c] != null && (f[c] as string) > v); return q; },
      gte: (c: string, v: string | number) => { filtros.push(f => f[c] != null && (f[c] as string) >= v); return q; },
      lt: (c: string, v: string | number) => { filtros.push(f => f[c] != null && (f[c] as string) < v); return q; },
      lte: (c: string, v: string | number) => { filtros.push(f => f[c] != null && (f[c] as string) <= v); return q; },
      order: (col: string, o?: { ascending?: boolean }) => { orden = [...orden, { col, asc: o?.ascending !== false }]; return q; },
      range: (d: number, h: number) => { apunte.rango = [d, h]; return q; },
      limit: (n: number) => { limite = n; return q; },
      maybeSingle: () => { unaSola = true; return q; },
      then: (ok: (r: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, ko),
    };
    return q;
  };

  return { admin: { from: consulta } as unknown as SupabaseClient, consultas };
}
