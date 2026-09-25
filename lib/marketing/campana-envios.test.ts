import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anotarEnviosCampana, type EnvioCampana } from './campana-envios.ts';

function adminFalso(opts: { error?: string; lanza?: boolean } = {}) {
  const lotes: { filas: Record<string, unknown>[]; onConflict?: string }[] = [];
  const admin = {
    from: (tabla: string) => {
      assert.equal(tabla, 'campana_envios');
      return {
        upsert: async (filas: Record<string, unknown>[], o?: { onConflict?: string }) => {
          if (opts.lanza) throw new Error('red caída');
          lotes.push({ filas, onConflict: o?.onConflict });
          return { error: opts.error ? { message: opts.error } : null };
        },
      };
    },
  } as unknown as SupabaseClient;
  return { admin, lotes };
}

const E = (i: number, extra: Partial<EnvioCampana> = {}): EnvioCampana => ({
  campanaId: 'camp-1', studioId: 'st-1', socioId: `s-${i}`, canal: 'EMAIL', estado: 'ENVIADO', ...extra,
});

test('anota el rastro con la clave (campana, socia): un reintento actualiza, no duplica', async () => {
  const { admin, lotes } = adminFalso();
  const r = await anotarEnviosCampana(admin, [E(1, { providerId: 're_1' })]);
  assert.deepEqual(r, { ok: true });
  assert.equal(lotes[0].onConflict, 'campana_id,socio_id');
  assert.deepEqual(lotes[0].filas[0], {
    campana_id: 'camp-1', studio_id: 'st-1', socio_id: 's-1', canal: 'EMAIL', estado: 'ENVIADO', provider_id: 're_1', detalle: null,
  });
});

test('1.200 destinatarias van en lotes de 500', async () => {
  const { admin, lotes } = adminFalso();
  await anotarEnviosCampana(admin, Array.from({ length: 1200 }, (_, i) => E(i)));
  assert.deepEqual(lotes.map(l => l.filas.length), [500, 500, 200]);
});

test('sin envíos no toca la base de datos', async () => {
  const { admin, lotes } = adminFalso();
  assert.deepEqual(await anotarEnviosCampana(admin, []), { ok: true });
  assert.equal(lotes.length, 0);
});

test('⚠️ NUNCA lanza: un fallo se devuelve, no rompe un envío que ya salió', async () => {
  const conError = await anotarEnviosCampana(adminFalso({ error: 'timeout' }).admin, [E(1)]);
  assert.deepEqual(conError, { ok: false, error: 'timeout' });
  const lanzando = await anotarEnviosCampana(adminFalso({ lanza: true }).admin, [E(1)]);
  assert.deepEqual(lanzando, { ok: false, error: 'red caída' });
});

test('AUT-B: el motor de campañas anota cada envío DENTRO de su step y registra las omitidas', () => {
  const src = readFileSync(new URL('../inngest/campanas.ts', import.meta.url), 'utf8');
  const step = src.indexOf('step.run(`envio-${i}-${socio.id}`');
  const anota = src.indexOf('anotarEnviosCampana(requireSupabaseAdmin(), [{', step);
  const finStep = src.indexOf('if (r.ok) enviados++;', step);
  assert.ok(step > 0 && anota > step && anota < finStep, 'el rastro del envío se escribe dentro del step (memoizado)');
  assert.ok(src.includes("step.run('registrar-omitidas'"), 'las omitidas (sin consentimiento, buzón roto) dejan rastro');
  assert.match(src, /providerId: r\.id/, 'el id de Resend se guarda');
});
