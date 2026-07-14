import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  billingEnforced,
  evaluarSuscripcion,
  evaluarFeature,
  evaluarLimiteSocias,
} from './billing-rules.ts';

// Reglas fail-open por diseño: con BILLING_ENFORCED != 'true' NO deben denegar
// NUNCA (ni consultar la BD), para no romper el estado actual de prod (sin
// planes asignados). El camino "enforcement ON con datos" necesita service-role
// + BD y se cubre en integración; aquí fijamos el contrato de fallo-abierto.

function conEnv<T>(valor: string | undefined, fn: () => T): T {
  const prev = process.env.BILLING_ENFORCED;
  if (valor === undefined) delete process.env.BILLING_ENFORCED;
  else process.env.BILLING_ENFORCED = valor;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.BILLING_ENFORCED;
    else process.env.BILLING_ENFORCED = prev;
  }
}

test('billingEnforced() solo es true con la env exactamente "true"', () => {
  conEnv(undefined, () => assert.equal(billingEnforced(), false));
  conEnv('false', () => assert.equal(billingEnforced(), false));
  conEnv('1', () => assert.equal(billingEnforced(), false));
  conEnv('TRUE', () => assert.equal(billingEnforced(), false));
  conEnv('true', () => assert.equal(billingEnforced(), true));
});

test('enforcement OFF → ninguna regla deniega (null), sin tocar BD', async () => {
  await conEnv('false', async () => {
    assert.equal(await evaluarSuscripcion('studio-x'), null);
    assert.equal(await evaluarFeature('studio-x', 'ia'), null);
    assert.equal(await evaluarFeature('studio-x', 'marketing'), null);
    assert.equal(await evaluarLimiteSocias('studio-x', 9999, 9999), null);
  });
});

test('enforcement ON pero sin service-role → fail-open (null)', async () => {
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    await conEnv('true', async () => {
      assert.equal(await evaluarSuscripcion('studio-x'), null);
      assert.equal(await evaluarFeature('studio-x', 'ia'), null);
      assert.equal(await evaluarLimiteSocias('studio-x', 9999, 1), null);
    });
  } finally {
    if (prevKey !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
  }
});
