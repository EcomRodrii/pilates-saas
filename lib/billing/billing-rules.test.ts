import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  billingEnforced,
  evaluarSuspension,
  evaluarSuscripcion,
  evaluarFeature,
  evaluarLimiteSocias,
} from './billing-rules.ts';

// Reglas fail-open por diseño: con BILLING_ENFORCED != 'true' NO deben denegar
// NUNCA (ni consultar la BD), para no romper el estado actual de prod (sin
// planes asignados). El camino "enforcement ON con datos" necesita service-role
// + BD y se cubre en integración; aquí fijamos el contrato de fallo-abierto.

// ⚠️ Tiene que ser `async` y hacer `await fn()`. Con un `fn` async y un
// `try { return fn(); } finally { ... restaura ... }` síncrono, el `finally`
// restauraba la env justo al devolverse la PROMESA (antes de que ninguno de
// sus `await` internos llegara a ejecutarse) — así que todo lo que corría
// bajo `conEnv('true', async () => {...})` en realidad se ejecutaba con la
// env YA restaurada. No lo detectó ningún test previo porque todos esperaban
// `null` (fail-open), que es lo que también sale con `BILLING_ENFORCED` sin
// poner — dos caminos distintos dando el mismo resultado, así que el hueco no
// se veía hasta que I-8 (auditoría 15-sep) necesitó un resultado que SÍ deniega.
async function conEnv<T>(valor: string | undefined, fn: () => T | Promise<T>): Promise<T> {
  const prev = process.env.BILLING_ENFORCED;
  if (valor === undefined) delete process.env.BILLING_ENFORCED;
  else process.env.BILLING_ENFORCED = valor;
  try { return await fn(); } finally {
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

test('enforcement OFF → ninguna regla deniega (null)', async () => {
  // Ojo: desde que existe la suspensión manual, evaluarSuscripcion SÍ hace una
  // lectura aunque el enforcement esté apagado — suspender a alguien tiene que
  // surtir efecto sin depender de una env de billing. Sin admin (caso de CI,
  // ninguna sesión de servicio inyectada) no llega a tocar la BD y falla
  // abierto igual.
  await conEnv('false', async () => {
    assert.equal(await evaluarSuscripcion(null, 'studio-x'), null);
    assert.equal(await evaluarFeature(null, 'studio-x', 'ia'), null);
    assert.equal(await evaluarFeature(null, 'studio-x', 'marketing'), null);
    assert.equal(await evaluarLimiteSocias(null, 'studio-x', 9999, 9999), null);
  });
});

test('la suspensión ignora BILLING_ENFORCED, pero falla abierto sin admin', async () => {
  // Con el enforcement apagado a propósito: la suspensión no depende de él.
  await conEnv('false', async () => {
    assert.equal(await evaluarSuspension(null, 'studio-x'), null);
    assert.equal(await evaluarSuscripcion(null, 'studio-x'), null);
  });
});

test('enforcement ON pero sin admin → fail-open (null)', async () => {
  await conEnv('true', async () => {
    assert.equal(await evaluarSuscripcion(null, 'studio-x'), null);
    assert.equal(await evaluarFeature(null, 'studio-x', 'ia'), null);
    assert.equal(await evaluarLimiteSocias(null, 'studio-x', 9999, 1), null);
  });
});

// I-8 (auditoría 15-sep): `evaluarSuscripcion` componía `accesoProducto` a
// secas, sin `estadoTrial()` — un 'trialing' NUESTRO cuya prueba local ya
// venció pasaba el gate igual (el pg_cron que lo pasa a 'trial_expirado' no es
// instantáneo). Mismo criterio que ya usa `/api/billing/status`.
function fakeAdminConStudio(fila: Record<string, unknown>) {
  return {
    from() {
      const c = {
        select() { return c; },
        eq() { return c; },
        single: async () => ({ data: fila }),
        maybeSingle: async () => ({ data: fila }),
      };
      return c;
    },
  } as unknown as Parameters<typeof evaluarSuscripcion>[0];
}

test('enforcement ON: un trialing nuestro con la prueba local ya vencida SÍ deniega', async () => {
  await conEnv('true', async () => {
    const admin = fakeAdminConStudio({
      plan: 'BASICO', subscription_status: 'trialing',
      trial_ends_at: '2020-01-01T00:00:00Z', subscription_id: null,
    });
    const d = await evaluarSuscripcion(admin, 'studio-x');
    assert.equal(d?.code, 'SUSCRIPCION_INACTIVA');
  });
});

test('enforcement ON: un trialing nuestro con la prueba local vigente NO deniega', async () => {
  await conEnv('true', async () => {
    const admin = fakeAdminConStudio({
      plan: 'BASICO', subscription_status: 'trialing',
      trial_ends_at: new Date(Date.now() + 3 * 86_400_000).toISOString(), subscription_id: null,
    });
    assert.equal(await evaluarSuscripcion(admin, 'studio-x'), null);
  });
});

test('enforcement ON: un trialing DE STRIPE (con subscription_id) no depende de trial_ends_at', async () => {
  await conEnv('true', async () => {
    const admin = fakeAdminConStudio({
      plan: 'BASICO', subscription_status: 'trialing',
      trial_ends_at: null, subscription_id: 'sub_123',
    });
    assert.equal(await evaluarSuscripcion(admin, 'studio-x'), null);
  });
});

test('enforcement ON: active/past_due siguen pasando igual que antes', async () => {
  await conEnv('true', async () => {
    for (const status of ['active', 'past_due']) {
      const admin = fakeAdminConStudio({
        plan: 'BASICO', subscription_status: status, trial_ends_at: null, subscription_id: null,
      });
      assert.equal(await evaluarSuscripcion(admin, 'studio-x'), null, status);
    }
  });
});
