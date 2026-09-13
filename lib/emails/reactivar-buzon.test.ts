import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { reactivarBuzon } from './reactivar-buzon.ts';

function fakeAdmin(opts: { errorBorrado?: string } = {}) {
  const llamadas: { email: string }[] = [];
  return {
    admin: {
      from: () => ({
        delete: () => ({
          eq: (_col: string, email: string) => {
            llamadas.push({ email });
            return Promise.resolve({ error: opts.errorBorrado ? { message: opts.errorBorrado } : null });
          },
        }),
      }),
    } as unknown as SupabaseClient,
    llamadas,
  };
}

test('Resend confirma (200) -> borra la fila y devuelve ok', async (t) => {
  process.env.RESEND_API_KEY = 're_test_123';
  const llamadasFetch: string[] = [];
  t.mock.method(global, 'fetch', async (url: string) => { llamadasFetch.push(url); return new Response(null, { status: 200 }); });
  const { admin, llamadas } = fakeAdmin();
  const r = await reactivarBuzon(admin, 'Maria@Gmail.com');
  assert.deepEqual(r, { ok: true });
  assert.equal(llamadas[0]?.email, 'maria@gmail.com');
  assert.match(llamadasFetch[0], /suppressions\/maria%40gmail\.com$/);
});

test('Resend dice 404 (ya no estaba suprimida ahí) -> también borra la fila, no es un fallo', async (t) => {
  process.env.RESEND_API_KEY = 're_test_123';
  t.mock.method(global, 'fetch', async () => new Response(null, { status: 404 }));
  const { admin } = fakeAdmin();
  const r = await reactivarBuzon(admin, 'x@example.com');
  assert.deepEqual(r, { ok: true });
});

test('Resend rechaza (500) -> NO borra la fila, el aviso se queda correcto', async (t) => {
  process.env.RESEND_API_KEY = 're_test_123';
  t.mock.method(global, 'fetch', async () => new Response('boom', { status: 500 }));
  const { admin, llamadas } = fakeAdmin();
  const r = await reactivarBuzon(admin, 'x@example.com');
  assert.equal(r.ok, false);
  assert.equal(llamadas.length, 0, 'no debe tocar email_rebotes si Resend no confirmó');
});

test('sin RESEND_API_KEY configurada -> error claro, nada se toca', async () => {
  delete process.env.RESEND_API_KEY;
  const { admin, llamadas } = fakeAdmin();
  const r = await reactivarBuzon(admin, 'x@example.com');
  assert.equal(r.ok, false);
  assert.equal(llamadas.length, 0);
});

test('un fallo al borrar en BD tras Resend OK -> se reporta, no se traga', async (t) => {
  process.env.RESEND_API_KEY = 're_test_123';
  t.mock.method(global, 'fetch', async () => new Response(null, { status: 200 }));
  const { admin } = fakeAdmin({ errorBorrado: 'fallo de conexión' });
  const r = await reactivarBuzon(admin, 'x@example.com');
  assert.equal(r.ok, false);
});
