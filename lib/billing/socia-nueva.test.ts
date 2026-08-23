import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { esSociaNueva } from './socia-nueva.ts';

// Lo que fija este test: `soloNuevas` de un código de descuento no se puede
// esquivar simplemente NO mandando el `socioId`.
//
// Antes de la auditoría del 22-ago los dos endpoints de compra de plan
// resolvían `esNueva: !socioId`, y en el checkout embebido el JWT es OPCIONAL:
// una clienta de siempre quitaba el `socioId`, ponía su email y se llevaba el
// código de bienvenida — todas las veces que quisiera. El email SÍ localiza su
// ficha (`entregarPlanComprado` la encuentra después por `ilike`), así que la
// compra se le apuntaba a su ficha de toda la vida con descuento de nueva.
//
// No lo puede cazar un e2e: `page.route` mockea la red, y esto se decide en
// servidor entre dos consultas.

// Cliente falso: registra qué se le preguntó y devuelve lo que se le diga.
function fakeAdmin(fila: { id: string } | null, error: { message: string } | null = null) {
  const visto: { patron?: string; studioId?: string; consultada: boolean } = { consultada: false };
  const cadena = {
    select: () => cadena,
    eq: (col: string, val: string) => { if (col === 'studio_id') visto.studioId = val; return cadena; },
    ilike: (_col: string, patron: string) => { visto.patron = patron; return cadena; },
    limit: () => cadena,
    maybeSingle: async () => { visto.consultada = true; return { data: fila, error }; },
  };
  const admin = { from: () => cadena } as unknown as SupabaseClient;
  return { admin, visto };
}

test('con socioId nunca es nueva: la identidad ya está resuelta', async () => {
  const { admin } = fakeAdmin(null);
  assert.equal(await esSociaNueva(admin, 'studio-1', 'socio-7', 'quien@sea.com'), false);
});

test('sin socioId pero con un email QUE YA TIENE FICHA: no es nueva', async () => {
  // El agujero real. Sin esto, el código de bienvenida es infinito.
  const { admin } = fakeAdmin({ id: 'socio-7' });
  assert.equal(await esSociaNueva(admin, 'studio-1', null, 'delasiempre@x.com'), false);
});

test('sin socioId y con un email desconocido: sí es nueva', async () => {
  const { admin } = fakeAdmin(null);
  assert.equal(await esSociaNueva(admin, 'studio-1', null, 'primera@vez.com'), true);
});

test('sin socioId y sin email: es nueva (no hay nada con qué localizarla)', async () => {
  const { admin } = fakeAdmin(null);
  assert.equal(await esSociaNueva(admin, 'studio-1', null, null), true);
  assert.equal(await esSociaNueva(admin, 'studio-1', null, '   '), true);
});

test('los comodines de ilike van escapados: un email no puede pescar fichas ajenas', async () => {
  // `%` y `_` son comodines en PostgREST. Sin escapar, `a%@x.com` casaría con
  // CUALQUIER ficha del estudio y todo el mundo dejaría de ser nuevo — el fallo
  // simétrico, igual de malo.
  const { admin, visto } = fakeAdmin(null);
  await esSociaNueva(admin, 'studio-1', null, 'a%_@x.com');
  assert.equal(visto.patron, 'a\\%\\_@x.com');
});

test('la búsqueda va SIEMPRE acotada al estudio', async () => {
  const { admin, visto } = fakeAdmin(null);
  await esSociaNueva(admin, 'studio-1', null, 'alguien@x.com');
  assert.equal(visto.studioId, 'studio-1');
});

test('si la consulta FALLA, no es nueva: fail-closed', async () => {
  // La respuesta cómoda («no sé, será nueva») regala el código de bienvenida
  // justo en el caso que esta función existe para cerrar. Encontrado en la
  // revisión independiente de este mismo fix.
  const { admin } = fakeAdmin(null, { message: 'timeout' });
  assert.equal(await esSociaNueva(admin, 'studio-1', null, 'quien@sea.com'), false);
});

test('un email con `*` no llega ni a consultarse', async () => {
  // PostgREST traduce `*` a `%` ANTES de Postgres: no hay barra invertida que
  // lo escape. Como tampoco es un email válido, se corta antes.
  const { admin, visto } = fakeAdmin(null);
  assert.equal(await esSociaNueva(admin, 'studio-1', null, 'a*@x.com'), false);
  assert.equal(visto.consultada, false);
});
