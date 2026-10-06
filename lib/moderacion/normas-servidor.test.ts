import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { aceptarNormas, antesDePublicar, cuerpoNoPublicar, normasAceptadas } from './normas-servidor.ts';
import { CODIGO_NORMAS_PENDIENTES, VERSION_NORMAS } from './normas.ts';

/** Doble de supabase-js: guarda las aceptaciones y registra los filtros. */
function adminFalso(aceptadas: { auth_user_id: string; version: string }[], fallo = false) {
  const escritas: Record<string, unknown>[] = [];
  const cliente = {
    from() {
      const filtros: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { filtros[c] = v; return q; },
        maybeSingle: async () => fallo
          ? { data: null, error: { message: 'caída' } }
          : { data: aceptadas.find((a) => a.auth_user_id === filtros.auth_user_id && a.version === filtros.version) ?? null, error: null },
        upsert: async (fila: Record<string, unknown>) => { escritas.push(fila); return { error: null }; },
      };
      return q;
    },
  } as unknown as SupabaseClient;
  return { cliente, escritas };
}

test('sin aceptar la versión vigente, no se publica: 409 con el código que la app entiende', async () => {
  const { cliente } = adminFalso([{ auth_user_id: 'u1', version: '2020-01-01' }]);
  const m = await antesDePublicar(cliente, 'u1', 'Hola');
  assert.equal(m?.status, 409);
  assert.deepEqual(cuerpoNoPublicar(m!), { error: 'Antes de escribir, acepta las normas de la comunidad.', codigo: CODIGO_NORMAS_PENDIENTES, version: VERSION_NORMAS });
});

test('con las normas aceptadas, el filtro decide: 422 con palabras no permitidas, null si no', async () => {
  const { cliente } = adminFalso([{ auth_user_id: 'u1', version: VERSION_NORMAS }]);
  assert.equal((await antesDePublicar(cliente, 'u1', 'eres una zorra'))?.status, 422);
  assert.equal(await antesDePublicar(cliente, 'u1', '¿Mañana hay clase?'), null);
});

test('un fallo al leer las normas lanza: nunca se lee como «aceptadas»', async () => {
  const { cliente } = adminFalso([], true);
  await assert.rejects(normasAceptadas(cliente, 'u1'), /caída/);
});

test('aceptar guarda la versión vigente de esa cuenta', async () => {
  const { cliente, escritas } = adminFalso([]);
  await aceptarNormas(cliente, 'u1');
  assert.deepEqual(escritas, [{ auth_user_id: 'u1', version: VERSION_NORMAS }]);
});

// ── Las tres vías que publican texto desde la app lo comprueban ANTES de guardar ──

const RAIZ = join(import.meta.dirname, '..', '..');
for (const [ruta, insercion] of [
  ['app/api/public/mensajeria/conversaciones/[id]/mensajes/route.ts', ".from('mensajes')\n    .insert("],
  ['app/api/public/comunidad/comentarios/route.ts', ".from('comentarios_comunidad').insert("],
  ['app/api/portal/instructora/mensajes/route.ts', 'enviarEnHilo(suya'],
] as const) {
  test(`${ruta}: normas y filtro antes de guardar`, () => {
    const f = readFileSync(join(RAIZ, ruta), 'utf8');
    const comprobacion = f.indexOf('antesDePublicar(');
    const guardado = f.lastIndexOf(insercion);
    assert.ok(comprobacion > 0, 'no llama a antesDePublicar');
    assert.ok(guardado > comprobacion, 'guarda antes de comprobar normas y filtro');
  });
}
