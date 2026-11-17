import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolverDueno } from './servidor.ts';

// Un cliente de Supabase de mentira: solo lo que usa `resolverDueno` (`from().select().eq().maybeSingle()`).
function falso(filas: { studios?: Array<Record<string, string>>; cadenas?: Array<Record<string, string>> }): SupabaseClient {
  return {
    from: (tabla: 'studios' | 'cadenas') => ({
      select: () => ({
        eq: (columna: string, valor: string) => ({
          maybeSingle: async () => ({ data: (filas[tabla] ?? []).find((f) => f[columna] === valor) ?? null, error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient;
}

test('la metadata de un estudio que existe manda', async () => {
  const db = falso({ studios: [{ id: 's1', stripe_customer_id: 'cus_a' }] });
  assert.deepEqual(await resolverDueno(db, 'cus_x', { studioId: 's1' }), { studioId: 's1', cadenaId: null });
});

test('la metadata de un estudio BORRADO no se usa: se cae al cliente de Stripe', async () => {
  const db = falso({ studios: [{ id: 's2', stripe_customer_id: 'cus_b' }] });
  assert.deepEqual(await resolverDueno(db, 'cus_b', { studioId: 'borrado' }), { studioId: 's2', cadenaId: null });
});

test('con la metadata de un estudio borrado y un cliente desconocido, el dueño queda vacío (la fila entra igual)', async () => {
  assert.deepEqual(await resolverDueno(falso({}), 'cus_z', { studioId: 'borrado' }), { studioId: null, cadenaId: null });
  assert.deepEqual(await resolverDueno(falso({}), null, { cadenaId: 'borrada' }), { studioId: null, cadenaId: null });
});

test('una cadena que existe va por cadena, y manda sobre el estudio de la metadata', async () => {
  const db = falso({ cadenas: [{ id: 'c1' }], studios: [{ id: 's1' }] });
  assert.deepEqual(await resolverDueno(db, null, { cadenaId: 'c1', studioId: 's1' }), { studioId: null, cadenaId: 'c1' });
});

test('sin metadata se busca por cliente: primero estudios, luego cadenas', async () => {
  const db = falso({ cadenas: [{ id: 'c9', stripe_customer_id: 'cus_c' }] });
  assert.deepEqual(await resolverDueno(db, 'cus_c', null), { studioId: null, cadenaId: 'c9' });
});
