import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { obtenerRendimientoInstructoras } from './rendimiento-datos.ts';

// Un fallo de la base de datos NO es un equipo vacío. Antes la capa de datos
// leía solo `data`: con un error, `data` llegaba `null`, el informe salía `[]`
// y la pantalla decía «Todavía no hay instructoras de alta».

type Resultado = { data: unknown; error: { message: string } | null };

/** Cliente falso: cada tabla contesta lo que se le diga, sea cual sea la cadena de filtros. */
function adminFalso(porTabla: Record<string, Resultado>): SupabaseClient {
  return {
    from(tabla: string) {
      const r = porTabla[tabla] ?? { data: [], error: null };
      const cadena: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'gte', 'not', 'order', 'in']) cadena[m] = () => cadena;
      cadena.then = (ok: (v: Resultado) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(r).then(ok, ko);
      return cadena;
    },
  } as unknown as SupabaseClient;
}

const AHORA = new Date('2026-10-14T10:00:00Z');
const FALLO = { data: null, error: { message: 'connection terminated' } };
const MARTA = { data: [{ id: 'ins-marta', nombre: 'Marta' }], error: null };

test('si falla la lectura de instructoras, lanza en vez de devolver un equipo vacío', async () => {
  await assert.rejects(
    obtenerRendimientoInstructoras(adminFalso({ instructores: FALLO }), 'studio-1', AHORA),
    /instructores/,
  );
});

test('si fallan las sesiones, lanza', async () => {
  await assert.rejects(
    obtenerRendimientoInstructoras(adminFalso({ instructores: MARTA, sesiones: FALLO }), 'studio-1', AHORA),
    /sesiones/,
  );
});

test('si fallan las socias, lanza: sin ellas cada instructora saldría sin datos', async () => {
  await assert.rejects(
    obtenerRendimientoInstructoras(adminFalso({ instructores: MARTA, socios: FALLO }), 'studio-1', AHORA),
    /socios/,
  );
});

test('sin instructoras de alta y sin errores, sí es un equipo vacío', async () => {
  const items = await obtenerRendimientoInstructoras(adminFalso({}), 'studio-1', AHORA);
  assert.deepEqual(items, []);
});

test('con instructoras y sin errores, devuelve una fila por instructora', async () => {
  const items = await obtenerRendimientoInstructoras(adminFalso({ instructores: MARTA }), 'studio-1', AHORA);
  assert.equal(items.length, 1);
  assert.equal(items[0].nombre, 'Marta');
});
