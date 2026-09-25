import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { avisarDoblesCobrosSinNotificar, type AvisoDobleCobro } from './dobles-cobros.ts';

function adminFalso(filas: Record<string, unknown>[], opts: { errorLectura?: boolean; errorMarca?: boolean } = {}) {
  const marcadas: string[] = [];
  const admin = {
    from: () => ({
      select: () => ({
        is: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => (opts.errorLectura ? { data: null, error: { message: 'timeout' } } : { data: filas, error: null }),
            }),
          }),
        }),
      }),
      update: () => ({
        eq: (_c: string, id: string) => ({
          is: async () => {
            if (opts.errorMarca) return { error: { message: 'fallo' } };
            marcadas.push(id);
            return { error: null };
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient;
  return { admin, marcadas };
}

const FILA = { id: 'd1', studio_id: 'st-1', recibo_id: 'rec-1', payment_intent_ids: ['pi_1', 'pi_2'], detectado_en: '2026-09-25T00:00:00Z' };

test('avisa de cada detección pendiente y la marca', async () => {
  const { admin, marcadas } = adminFalso([FILA, { ...FILA, id: 'd2', recibo_id: 'rec-2' }]);
  const avisos: AvisoDobleCobro[] = [];
  const r = await avisarDoblesCobrosSinNotificar(admin, a => avisos.push(a));
  assert.deepEqual(r, { pendientes: 2, avisados: 2, errores: 0 });
  assert.deepEqual(marcadas, ['d1', 'd2']);
  assert.deepEqual(avisos[0], { studioId: 'st-1', reciboId: 'rec-1', paymentIntentIds: ['pi_1', 'pi_2'], detectadoEn: '2026-09-25T00:00:00Z' });
});

test('sin pendientes no avisa a nadie', async () => {
  const { admin } = adminFalso([]);
  let avisos = 0;
  const r = await avisarDoblesCobrosSinNotificar(admin, () => { avisos++; });
  assert.deepEqual(r, { pendientes: 0, avisados: 0, errores: 0 });
  assert.equal(avisos, 0);
});

test('⚠️ un error de lectura lanza: no se toma por «nada que avisar»', async () => {
  const { admin } = adminFalso([], { errorLectura: true });
  await assert.rejects(() => avisarDoblesCobrosSinNotificar(admin, () => {}), /dobles_cobros_detectados/);
});

test('si no se puede marcar, cuenta como error (la ruta responde 500 y se reintenta)', async () => {
  const { admin } = adminFalso([FILA], { errorMarca: true });
  const r = await avisarDoblesCobrosSinNotificar(admin, () => {});
  assert.deepEqual(r, { pendientes: 1, avisados: 0, errores: 1 });
});

test('la ruta exige el secreto del cron ANTES de tocar la base de datos', () => {
  const ruta = readFileSync(new URL('../../app/api/cron/dobles-cobros/route.ts', import.meta.url), 'utf8');
  assert.ok(ruta.indexOf('secretoValido(') > 0);
  assert.ok(ruta.indexOf('secretoValido(') < ruta.indexOf('getSupabaseAdmin()'));
  assert.match(ruta, /resumen\.errores > 0 \? \{ status: 500 \}/);
});

test('la migración del detector solo cuenta cargos que tomaron dinero (no rechazos)', () => {
  const sql = readFileSync(new URL('../../supabase/migrations/20260925011839_pay5b_detector_dobles_cobros_vivo.sql', import.meta.url), 'utf8');
  assert.match(sql, /ci\.desenlace in \('cobrado', 'pendiente'\)/);
  assert.doesNotMatch(sql, /'fallido'\)/);
  assert.match(sql, /revoke all on function public\.vigilar_dobles_cobros\(\) from public, anon, authenticated/);
});
