// Un Supabase de mentira en memoria para probar las acciones sin red: lo justo
// del constructor de consultas (select/eq/is/in/gt/lt/update/insert/delete/rpc)
// con las filas en arrays. Solo para tests.
/* eslint-disable @typescript-eslint/no-explicit-any */

type Fila = Record<string, any>;
export interface Llamada { op: 'insert' | 'update' | 'delete' | 'rpc'; tabla: string; datos?: unknown }

export function adminFalso(tablas: Record<string, Fila[]>, opciones: { rpc?: (nombre: string, args: any) => { data?: unknown; error?: { code?: string; message?: string } | null }; falla?: (tabla: string, op: string, datos: any) => { code?: string; message?: string } | null } = {}) {
  const llamadas: Llamada[] = [];
  const t = (n: string) => (tablas[n] ??= []);
  function consulta(tabla: string) {
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let valores: any = null;
    const filtros: ((f: Fila) => boolean)[] = [];
    let uno = false;
    const ejecutar = async () => {
      const falla = op !== 'select' ? opciones.falla?.(tabla, op, valores) : null;
      if (falla) return { data: null, error: falla };
      if (op === 'insert') {
        const filas = Array.isArray(valores) ? valores : [valores];
        for (const f of filas) {
          if (f.id !== undefined && t(tabla).some(x => x.id === f.id)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        const nuevas = filas.map((f: Fila) => ({ id: `gen-${t(tabla).length + 1}`, ...f }));
        t(tabla).push(...nuevas);
        llamadas.push({ op: 'insert', tabla, datos: valores });
        return { data: uno ? nuevas[0] : nuevas, error: null };
      }
      const coinciden = t(tabla).filter(f => filtros.every(g => g(f)));
      if (op === 'update') { coinciden.forEach(f => Object.assign(f, valores)); llamadas.push({ op: 'update', tabla, datos: valores }); return { data: coinciden, error: null }; }
      if (op === 'delete') { tablas[tabla] = t(tabla).filter(f => !coinciden.includes(f)); llamadas.push({ op: 'delete', tabla }); return { data: coinciden, error: null }; }
      return { data: uno ? (coinciden[0] ?? null) : coinciden, error: null };
    };
    const q: any = {
      select: () => { if (op === 'select') op = 'select'; return q; },
      insert: (v: any) => { op = 'insert'; valores = v; return q; },
      update: (v: any) => { op = 'update'; valores = v; return q; },
      delete: () => { op = 'delete'; return q; },
      eq: (c: string, v: any) => { filtros.push(f => f[c] === v); return q; },
      is: (c: string, v: any) => { filtros.push(f => (f[c] ?? null) === v); return q; },
      in: (c: string, v: any[]) => { filtros.push(f => v.includes(f[c])); return q; },
      gt: (c: string, v: any) => { filtros.push(f => String(f[c]) > String(v)); return q; },
      lt: (c: string, v: any) => { filtros.push(f => f[c] != null && String(f[c]) < String(v)); return q; },
      single: () => { uno = true; return q; },
      maybeSingle: () => { uno = true; return q; },
      then: (ok: any, ko: any) => ejecutar().then(ok, ko),
    };
    return q;
  }
  return {
    llamadas, tablas,
    admin: {
      from: (tabla: string) => consulta(tabla),
      rpc: async (nombre: string, args: any) => {
        llamadas.push({ op: 'rpc', tabla: nombre, datos: args });
        return { data: null, error: null, ...(opciones.rpc?.(nombre, args) ?? {}) };
      },
    } as any,
  };
}
