import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sellarCondicionesVigentes } from './legal-sellado.ts';

// El sello viaja en los parámetros del cobro, y con la misma Idempotency-Key
// Stripe exige parámetros IDÉNTICOS. Hasta el 5-oct-2026 el sello llevaba la
// hora (`aceptadoEn: new Date()`), así que dos peticiones del mismo pago
// sellaban distinto y la segunda recibía `idempotency_error`.

const fila = {
  nombre: 'Estudio de prueba', razon_social: null, nif: null, direccion: null, ciudad: null, codigo_postal: null,
  email: null, politica_privacidad: null, terminos_servicio: null, cancelacion_ventana_horas: 12, penalizacion_importe_eur: null,
};

function adminFalso(): SupabaseClient {
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    maybeSingle: async () => ({ data: fila, error: null }),
    upsert: async () => ({ data: null, error: null }),
  };
  return { from: () => consulta } as unknown as SupabaseClient;
}

test('el mismo estudio sella IGUAL aunque pase el tiempo: sin reloj en el sello', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-05T10:00:00.000Z') });
  const a = await sellarCondicionesVigentes(adminFalso(), 'studio-1');
  t.mock.timers.tick(2_000);
  const b = await sellarCondicionesVigentes(adminFalso(), 'studio-1');
  t.mock.timers.tick(25 * 3600_000);
  const c = await sellarCondicionesVigentes(adminFalso(), 'studio-1');
  assert.ok(a?.hash, 'debería sellar con los textos del estudio');
  assert.deepEqual(b, a);
  assert.deepEqual(c, a);
  assert.deepEqual(Object.keys(a!), ['hash']);
});
