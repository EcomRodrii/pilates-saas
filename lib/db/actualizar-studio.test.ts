import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { actualizarFilaStudio, ERROR_STUDIO_SIN_FILAS } from './actualizar-studio.ts';
import { mensajeDeFalloAlGuardar } from '../errores.ts';

// Con el cliente REAL de supabase-js y un `fetch` falso (mismo patrón que
// lib/interno/ampliar-prueba.test.ts): lo que se comprueba es la petición que
// llegaría a PostgREST y cómo se lee su respuesta, no una imitación del
// constructor de consultas.
//
// El caso que importa: la RLS de `studios` (`owner_studios`) no da error cuando
// no casa — PostgREST contesta 200 con CERO filas. Mirando solo `error`, el
// panel decía «Guardado» sin haber guardado nada.

type Peticion = { metodo: string; url: URL; cuerpo: unknown; prefer: string | null };

function montar(respuesta: { status?: number; body: unknown }) {
  const peticiones: Peticion[] = [];
  const fetchFalso = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    peticiones.push({
      metodo: (init?.method ?? 'GET').toUpperCase(),
      url,
      cuerpo: init?.body ? JSON.parse(String(init.body)) : null,
      prefer: new Headers(init?.headers).get('prefer'),
    });
    return new Response(JSON.stringify(respuesta.body), {
      status: respuesta.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const db = createClient('http://supabase.test', 'anon-falsa', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchFalso as typeof fetch },
  });
  return { db, peticiones };
}

test('0 filas actualizadas (la RLS no casa): falla con un mensaje que se entiende', async () => {
  const { db, peticiones } = montar({ body: [] });
  const r = await actualizarFilaStudio(db, 'studio-1', { nombre: 'Pilates Luz' });

  assert.equal(r.ok, false, 'con 0 filas no puede decir que guardó');
  // Lo que acaba en el toast pasa por falloEscritura → mensajeDeFalloAlGuardar:
  // tiene que salir la frase tal cual, no el genérico ni el de «vuelve a entrar».
  assert.equal(!r.ok && mensajeDeFalloAlGuardar(r.error), ERROR_STUDIO_SIN_FILAS);

  assert.equal(peticiones.length, 1);
  const patch = peticiones[0];
  assert.equal(patch.metodo, 'PATCH');
  assert.equal(patch.url.pathname, '/rest/v1/studios');
  assert.equal(patch.url.searchParams.get('id'), 'eq.studio-1');
  assert.deepEqual(patch.cuerpo, { nombre: 'Pilates Luz' });
  // Sin `return=representation` PostgREST no devuelve filas y no hay nada que
  // contar: el arreglo dependería de una respuesta vacía siempre.
  assert.equal(patch.url.searchParams.get('select'), 'id');
  assert.match(patch.prefer ?? '', /return=representation/);
});

test('1 fila actualizada: ok', async () => {
  const { db } = montar({ body: [{ id: 'studio-1' }] });
  assert.deepEqual(await actualizarFilaStudio(db, 'studio-1', { nombre: 'Pilates Luz' }), { ok: true });
});

test('un error de PostgREST llega entero, para que se traduzca por su código', async () => {
  const { db } = montar({
    status: 403,
    body: { code: '42501', message: 'permission denied for table studios', details: null, hint: null },
  });
  const r = await actualizarFilaStudio(db, 'studio-1', { lema: 'x' });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && (r.error as { code?: string }).code, '42501');
});

test('un valor fuera de rango (CHECK, I-17) llega entero y se traduce a un aviso comprensible', async () => {
  // Los CHECK de `studios` (migr 20260915232436: iva_por_defecto,
  // penalizacion_importe_eur…) son la única validación de servidor sobre lo
  // que escribe el navegador — RLS decide QUIÉN, no QUÉ valor. Aquí se
  // comprueba que un 23514 real de PostgREST no se cuela como jerga técnica.
  const { db } = montar({
    status: 400,
    body: {
      code: '23514',
      message: 'new row for relation "studios" violates check constraint "studios_iva_por_defecto_rango"',
      details: null, hint: null,
    },
  });
  const r = await actualizarFilaStudio(db, 'studio-1', { iva_por_defecto: -5 });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && (r.error as { code?: string }).code, '23514');
  assert.equal(!r.ok && mensajeDeFalloAlGuardar(r.error), 'Alguno de los datos no es válido. Revísalo y vuelve a intentarlo.');
});

test('sin columnas que escribir no hace petición y no es un fallo', async () => {
  // Los «desconectar» de Integraciones llaman a updateStudio con campos que
  // dbUpdateStudio no mapea (googleCalendarEmail, gmailEmail…): el cuerpo sale
  // `{}`. Un PATCH vacío no devuelve filas, y contarlo como fallo haría decir
  // «no se ha guardado» justo después de desconectar bien en el servidor.
  const { db, peticiones } = montar({ body: [] });
  assert.deepEqual(await actualizarFilaStudio(db, 'studio-1', {}), { ok: true });
  assert.equal(peticiones.length, 0);
});

test('las escrituras de `studios` del panel pasan por aquí, no por un update a pelo', () => {
  // `lib/supabase-data.ts` no se puede importar desde node --test (alias `@/`,
  // cliente de navegador), así que se comprueba en el fuente que las dos
  // funciones usan el helper probado arriba y que no queda otro UPDATE directo.
  const fuente = readFileSync(new URL('../supabase-data.ts', import.meta.url), 'utf8');
  // `assert.ok` y no `doesNotMatch`: este vuelca el fichero entero (~300 KB) en
  // el log de CI al fallar.
  assert.ok(!/from\('studios'\)\s*\.update\(/.test(fuente),
    'hay un UPDATE directo a studios en supabase-data.ts: debe pasar por actualizarFilaStudio');
  for (const fn of ['dbUpdateStudioConfig', 'dbUpdateStudio']) {
    const inicio = fuente.indexOf(`export async function ${fn}(`);
    assert.notEqual(inicio, -1, `no encuentro ${fn} en supabase-data.ts: ¿se renombró?`);
    const cuerpo = fuente.slice(inicio, fuente.indexOf('\n}\n', inicio));
    assert.match(cuerpo, /actualizarFilaStudio\(supabase, STUDIO_ID, db\)/, `${fn} no usa actualizarFilaStudio`);
  }
});
