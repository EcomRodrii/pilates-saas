import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { esTablaQueFalta } from './tabla-que-falta.ts';

test('la tabla que falta: 42P01 (Postgres) y PGRST205 (PostgREST, sin la tabla en su caché)', () => {
  assert.equal(esTablaQueFalta({ code: '42P01' }), true);
  assert.equal(esTablaQueFalta({ code: 'PGRST205' }), true);
  for (const code of ['42501', 'PGRST116', '23505', '', null]) assert.equal(esTablaQueFalta({ code }), false, String(code));
  assert.equal(esTablaQueFalta(null), false);
});

test('el código de pagos_clase no mira 42P01 a mano (con PostgREST no salta nunca)', () => {
  const raiz = join(import.meta.dirname, '..', '..');
  for (const f of ['lib/billing/pago-de-clase-servidor.ts', 'lib/billing/barrido-pagos-clase.ts', 'lib/billing/reservar-clase-pagada.ts',
    'lib/billing/clase-prueba.ts', 'lib/db/supabase-data-admin.ts']) {
    assert.doesNotMatch(readFileSync(join(raiz, f), 'utf8'), /=== '42P01'|!== '42P01'/, f);
  }
});
