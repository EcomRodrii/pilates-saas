import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidirGuardadoDeTarjeta, guardarTarjetaDeSesion } from './guardar-tarjeta-de-sesion.ts';

// Un dueño para escribir en la ficha la tarjeta de un Checkout `setup`: el webhook y la
// confirmación de la app. Lo que no puede pasar: volver a una tarjeta anterior, apuntar a
// una ya soltada, pisar a ciegas, o soltar algo que sigue en uso.

const base = {
  customerDeLaSesion: 'cus_1', anterior: 'pm_vieja', sepaDeLaFicha: null, customerDeLaFicha: 'cus_1',
  pmAnterior: { created: 100, type: 'card', allow_redisplay: 'limited', customer: 'cus_1' },
};
const NUEVA = { id: 'pm_nueva', created: 200, customer: 'cus_1' };

test('la nueva, más reciente, se escribe y la vieja (solo de cobros) se suelta', () => {
  assert.deepEqual(decidirGuardadoDeTarjeta({ ...base, nueva: NUEVA }), { tipo: 'ESCRIBIR', soltarSustituida: true });
});

test('añadir (sin tarjeta antes): se escribe y no se suelta nada', () => {
  assert.deepEqual(decidirGuardadoDeTarjeta({ ...base, anterior: null, pmAnterior: null, nueva: NUEVA }), { tipo: 'ESCRIBIR', soltarSustituida: false });
});

test('⚠️ fuera de orden: la de la ficha es MÁS NUEVA y sigue en su Customer → no se vuelve a la anterior', () => {
  assert.deepEqual(
    decidirGuardadoDeTarjeta({ ...base, nueva: { ...NUEVA, created: 50 } }),
    { tipo: 'DESCARTAR', motivo: 'MAS_ANTIGUA' },
  );
});

test('la de la ficha ya no está en su Customer (soltada): la nueva gana aunque sea más antigua', () => {
  assert.deepEqual(
    decidirGuardadoDeTarjeta({ ...base, pmAnterior: { ...base.pmAnterior, customer: null }, nueva: { ...NUEVA, created: 50 } }),
    { tipo: 'ESCRIBIR', soltarSustituida: false },
  );
  assert.deepEqual(decidirGuardadoDeTarjeta({ ...base, pmAnterior: null, nueva: { ...NUEVA, created: 50 } }), { tipo: 'ESCRIBIR', soltarSustituida: false });
});

test('⚠️ un evento viejo reenviado de una tarjeta ya soltada (sin Customer): no se escribe', () => {
  assert.deepEqual(decidirGuardadoDeTarjeta({ ...base, nueva: { ...NUEVA, customer: null } }), { tipo: 'DESCARTAR', motivo: 'NO_ES_DE_SU_CUSTOMER' });
  assert.deepEqual(decidirGuardadoDeTarjeta({ ...base, nueva: { ...NUEVA, customer: 'cus_otro' } }), { tipo: 'DESCARTAR', motivo: 'NO_ES_DE_SU_CUSTOMER' });
});

test('la misma que ya está (webhook repetido, o el sondeo después del webhook): nada', () => {
  assert.deepEqual(decidirGuardadoDeTarjeta({ ...base, anterior: 'pm_nueva', pmAnterior: null, nueva: NUEVA }), { tipo: 'YA_ESTA' });
});

test('la sustituida que guardó para pagar en la app (always) no se suelta', () => {
  assert.deepEqual(
    decidirGuardadoDeTarjeta({ ...base, pmAnterior: { ...base.pmAnterior, allow_redisplay: 'always' }, nueva: NUEVA }),
    { tipo: 'ESCRIBIR', soltarSustituida: false },
  );
});

// ── Con la base de datos y Stripe de mentira ─────────────────────────────────

type Fila = { stripe_payment_method_id: string | null; sepa_payment_method_id: string | null; stripe_customer_id: string | null };

function falsos(fila: Fila | null, o: { cambiaEnElUpdate?: number } = {}) {
  const updates: { valores: Record<string, unknown>; filtros: [string, string, unknown][] }[] = [];
  const soltadas: string[] = [];
  let cambios = o.cambiaEnElUpdate ?? 0;
  const admin = {
    from: () => {
      const filtros: [string, string, unknown][] = [];
      let valores: Record<string, unknown> | null = null;
      const b = {
        select: () => b,
        update: (v: Record<string, unknown>) => { valores = v; return b; },
        eq: (c: string, v: unknown) => { filtros.push(['eq', c, v]); return b; },
        is: (c: string, v: unknown) => { filtros.push(['is', c, v]); return b; },
        maybeSingle: async () => ({ data: fila ? { ...fila } : null, error: null }),
        then: (res: (x: unknown) => void) => {
          // `await q.select('id')` del update.
          updates.push({ valores: valores!, filtros });
          const actual = filtros.find(([, c]) => c === 'stripe_payment_method_id');
          const casa = actual && fila && (actual[0] === 'is' ? fila.stripe_payment_method_id === null : fila.stripe_payment_method_id === actual[2]);
          if (cambios > 0) { cambios--; return res({ data: [], error: null }); }
          if (casa && fila) fila.stripe_payment_method_id = valores!.stripe_payment_method_id as string;
          return res({ data: casa ? [{ id: 's' }] : [], error: null });
        },
      };
      return b;
    },
  };
  const pms: Record<string, unknown> = {
    pm_vieja: { id: 'pm_vieja', created: 100, type: 'card', allow_redisplay: 'limited', customer: 'cus_1' },
  };
  const stripe = {
    paymentMethods: {
      retrieve: async (id: string) => { if (!pms[id]) throw Object.assign(new Error('no'), { code: 'resource_missing' }); return pms[id]; },
      detach: async (id: string) => { soltadas.push(id); return {}; },
    },
  };
  return { admin: admin as never, stripe: stripe as never, updates, soltadas };
}

const METODO = { id: 'pm_nueva', created: 200, type: 'card', customer: 'cus_1', card: { brand: 'mastercard', last4: '4444', exp_month: 9, exp_year: 2030 } };
const P = { socioId: 'socio-1', studioId: 'studio-1', stripeAccount: 'acct_1', customerDeLaSesion: 'cus_1', metodo: METODO as never };

test('cambiar: compare-and-set contra la de antes, con los datos de la nueva, y suelta la vieja DESPUÉS', async () => {
  const f = falsos({ stripe_payment_method_id: 'pm_vieja', sepa_payment_method_id: null, stripe_customer_id: 'cus_1' });
  const r = await guardarTarjetaDeSesion(f.admin, f.stripe, P);
  assert.deepEqual(r, { tipo: 'ESCRITA', soltada: true });
  assert.equal(f.updates.length, 1);
  assert.deepEqual(f.updates[0].filtros.find(([, c]) => c === 'stripe_payment_method_id'), ['eq', 'stripe_payment_method_id', 'pm_vieja']);
  assert.ok(f.updates[0].filtros.some(([o, c, v]) => o === 'eq' && c === 'studio_id' && v === 'studio-1'), 'acotado al estudio');
  assert.equal(f.updates[0].valores.tarjeta_ultimos4, '4444');
  assert.equal(f.updates[0].valores.tarjeta_marca, 'mastercard');
  assert.deepEqual(f.soltadas, ['pm_vieja']);
});

test('⚠️ la ficha cambió entre la lectura y el update: se vuelve a decidir, nunca se pisa sin condición', async () => {
  const f = falsos({ stripe_payment_method_id: 'pm_vieja', sepa_payment_method_id: null, stripe_customer_id: 'cus_1' }, { cambiaEnElUpdate: 2 });
  const r = await guardarTarjetaDeSesion(f.admin, f.stripe, P);
  assert.deepEqual(r, { tipo: 'CAMBIO_CONCURRENTE' });
  assert.equal(f.updates.length, 2);
  for (const u of f.updates) assert.ok(u.filtros.some(([, c]) => c === 'stripe_payment_method_id'), 'cada update lleva su compare-and-set');
  assert.deepEqual(f.soltadas, [], 'sin escribir, no se suelta nada');
});

test('sin ficha (borrada, anonimizada): no escribe y lo dice', async () => {
  const f = falsos(null);
  assert.deepEqual(await guardarTarjetaDeSesion(f.admin, f.stripe, P), { tipo: 'SIN_FICHA' });
  assert.equal(f.updates.length, 0);
});

test('el método no es una tarjeta: no se toca la ficha', async () => {
  const f = falsos({ stripe_payment_method_id: null, sepa_payment_method_id: null, stripe_customer_id: 'cus_1' });
  assert.deepEqual(await guardarTarjetaDeSesion(f.admin, f.stripe, { ...P, metodo: { ...METODO, type: 'sepa_debit' } as never }), { tipo: 'DESCARTADA', motivo: 'NO_ES_TARJETA' });
  assert.equal(f.updates.length, 0);
});
