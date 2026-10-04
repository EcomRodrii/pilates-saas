import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cadenaPagaSusSedes, leerCadenaDeLaSede, decidirIndividualEnCadena, consultarCadenaAntesDeIndividual,
  checkoutsAbiertosDeLasSedes, caducarCheckouts, clienteDelPortal,
} from './sede-incluida-en-cadena.ts';

const ESTADOS_VIVOS = ['active', 'trialing', 'past_due', 'unpaid'];
const ESTADOS_MUERTOS = ['canceled', 'incomplete', 'incomplete_expired', 'trial_expirado'];

// ── La regla ────────────────────────────────────────────────────────────────

test('cadena con suscripción viva: la sede ya está pagada', () => {
  for (const estado of ESTADOS_VIVOS) assert.equal(cadenaPagaSusSedes(estado), true, estado);
});

test('checkout de cadena abandonado (sin estado): la sede puede contratar su plan', () => {
  assert.equal(cadenaPagaSusSedes(null), false);
  assert.equal(cadenaPagaSusSedes(undefined), false);
});

test('cadena que ya no está viva: la sede puede contratar su plan', () => {
  for (const estado of ESTADOS_MUERTOS) assert.equal(cadenaPagaSusSedes(estado), false, estado);
});

// ── Lo que dice Stripe del cliente de la cadena ─────────────────────────────

test('suscripción de cadena ya viva en Stripe y el webhook aún sin llegar: bloquea', () => {
  for (const status of ESTADOS_VIVOS) {
    const d = decidirIndividualEnCadena({ suscripciones: [{ id: 'sub_cadena', status }], sesionesAbiertas: [] });
    assert.deepEqual(d, { accion: 'bloquear' }, status);
  }
});

test('el caso que se cierra: pago de cadena a medias (Checkout abierto) → se caduca, no se deja abierto a la vez', () => {
  const d = decidirIndividualEnCadena({ suscripciones: [], sesionesAbiertas: [{ id: 'cs_cadena' }] });
  assert.deepEqual(d, { accion: 'seguir', expirar: ['cs_cadena'] });
});

test('una suscripción de cadena ya cancelada no bloquea', () => {
  const d = decidirIndividualEnCadena({ suscripciones: [{ id: 'sub_vieja', status: 'canceled' }], sesionesAbiertas: [] });
  assert.deepEqual(d, { accion: 'seguir', expirar: [] });
});

function stripeFalso(porCliente: Record<string, { subs?: { id: string; status: string }[]; sesiones?: { id: string; mode: string; url?: string; metadata?: Record<string, string> }[] }>) {
  const listados: string[] = [];
  const caducadas: string[] = [];
  const stripe = {
    subscriptions: {
      list: async ({ customer }: { customer: string }) => { listados.push(`subs:${customer}`); return { data: porCliente[customer]?.subs ?? [] }; },
    },
    checkout: {
      sessions: {
        list: async ({ customer }: { customer: string }) => {
          listados.push(`sesiones:${customer}`);
          return { data: (porCliente[customer]?.sesiones ?? []).map(s => ({ url: null, metadata: {}, ...s })) };
        },
        expire: async (id: string) => {
          if (id.startsWith('cs_pagada')) throw new Error('session is not open');
          caducadas.push(id);
        },
      },
    },
  };
  return { stripe: stripe as never, listados, caducadas };
}

test('consultarCadenaAntesDeIndividual pregunta por el cliente de la CADENA y solo cuenta Checkouts de suscripción', async () => {
  const { stripe, listados } = stripeFalso({
    cus_cadena: { sesiones: [{ id: 'cs_cadena', mode: 'subscription' }, { id: 'cs_pago', mode: 'payment' }] },
  });
  assert.deepEqual(await consultarCadenaAntesDeIndividual(stripe, 'cus_cadena'), { accion: 'seguir', expirar: ['cs_cadena'] });
  assert.deepEqual(listados.sort(), ['sesiones:cus_cadena', 'subs:cus_cadena']);
});

test('caducarCheckouts: todos caducados → true', async () => {
  const { stripe, caducadas } = stripeFalso({});
  assert.equal(await caducarCheckouts(stripe, ['cs_1', 'cs_2']), true);
  assert.deepEqual(caducadas, ['cs_1', 'cs_2']);
});

test('caducarCheckouts: uno que no se deja (se acaba de pagar) → false, y no se abre otra forma de pagar', async () => {
  const { stripe } = stripeFalso({});
  assert.equal(await caducarCheckouts(stripe, ['cs_1', 'cs_pagada']), false);
});

// ── La lectura de la cadena ─────────────────────────────────────────────────

type Respuesta = { data: unknown; error: { message: string } | null };

function adminFalso(respuesta: Respuesta) {
  const consultas: string[] = [];
  const admin = {
    from(tabla: string) {
      return {
        select(columnas: string) {
          return {
            eq(col: string, val: string) {
              consultas.push(`${tabla}:${columnas}:${col}=${val}`);
              const r = Promise.resolve(respuesta);
              return Object.assign(r, { maybeSingle: () => r });
            },
          };
        },
      };
    },
  };
  return { admin: admin as never, consultas };
}

test('sede añadida a una cadena activa: se lee el estado y el cliente de la cadena', async () => {
  const { admin, consultas } = adminFalso({ data: { subscription_status: 'active', stripe_customer_id: 'cus_cadena' }, error: null });
  assert.deepEqual(await leerCadenaDeLaSede(admin, 'cadena-1'), { estado: 'active', clienteStripe: 'cus_cadena' });
  assert.deepEqual(consultas, ['cadenas:subscription_status, stripe_customer_id:id=cadena-1']);
});

test('estudio sin cadena: null y ni se consulta cadenas', async () => {
  const { admin, consultas } = adminFalso({ data: null, error: null });
  assert.equal(await leerCadenaDeLaSede(admin, null), null);
  assert.deepEqual(consultas, []);
});

test('cadena que no aparece: null', async () => {
  const { admin } = adminFalso({ data: null, error: null });
  assert.equal(await leerCadenaDeLaSede(admin, 'cadena-x'), null);
});

test('si la lectura de la cadena falla, lanza: sin saberlo no se abre un Checkout', async () => {
  const { admin } = adminFalso({ data: null, error: { message: 'timeout' } });
  await assert.rejects(leerCadenaDeLaSede(admin, 'cadena-1'), /leer cadena: timeout/);
});

// ── Al revés: el checkout de la cadena caduca los individuales de sus sedes ──

test('Checkouts abiertos de las sedes: cada cliente una vez, sin el de la cadena ni las sedes sin cliente', async () => {
  const { admin, consultas } = adminFalso({
    data: [
      { stripe_customer_id: 'cus_sede1' }, { stripe_customer_id: 'cus_sede1' },
      { stripe_customer_id: null }, { stripe_customer_id: 'cus_cadena' }, { stripe_customer_id: 'cus_sede2' },
    ],
    error: null,
  });
  const { stripe, listados } = stripeFalso({
    cus_sede1: { sesiones: [{ id: 'cs_base_sede1', mode: 'subscription' }] },
    cus_sede2: { sesiones: [{ id: 'cs_estudio_sede2', mode: 'subscription' }, { id: 'cs_pago', mode: 'payment' }] },
    cus_cadena: { sesiones: [{ id: 'cs_cadena', mode: 'subscription' }] },
  });
  assert.deepEqual(
    (await checkoutsAbiertosDeLasSedes(admin, stripe, 'cadena-1', 'cus_cadena')).sort(),
    ['cs_base_sede1', 'cs_estudio_sede2'],
  );
  assert.deepEqual(consultas, ['studios:stripe_customer_id:cadena_id=cadena-1']);
  assert.ok(!listados.some(l => l.endsWith('cus_cadena')), 'el cliente de la cadena lo gobierna checkoutPrevio');
});

test('si la lectura de las sedes falla, lanza', async () => {
  const { admin } = adminFalso({ data: null, error: { message: 'timeout' } });
  const { stripe } = stripeFalso({});
  await assert.rejects(checkoutsAbiertosDeLasSedes(admin, stripe, 'cadena-1', 'cus_cadena'), /leer sedes: timeout/);
});

// ── El portal de facturación ────────────────────────────────────────────────

test('portal: sede con cliente propio de un plan individual anterior y cadena viva → el cliente de la cadena', () => {
  for (const estado of ESTADOS_VIVOS) {
    assert.equal(clienteDelPortal('cus_sede', { estado, clienteStripe: 'cus_cadena' }), 'cus_cadena', estado);
  }
});

test('portal: cadena sin suscripción viva (checkout abandonado) → el cliente de la sede', () => {
  for (const estado of [null, ...ESTADOS_MUERTOS]) {
    assert.equal(clienteDelPortal('cus_sede', { estado, clienteStripe: 'cus_cadena' }), 'cus_sede', String(estado));
  }
});

test('portal: sin cliente propio cae al de la cadena; sin ninguno, null', () => {
  assert.equal(clienteDelPortal(null, { estado: null, clienteStripe: 'cus_cadena' }), 'cus_cadena');
  assert.equal(clienteDelPortal('cus_sede', null), 'cus_sede');
  assert.equal(clienteDelPortal('cus_sede', { estado: 'active', clienteStripe: null }), 'cus_sede');
  assert.equal(clienteDelPortal(null, null), null);
});

// ── Las rutas lo usan ───────────────────────────────────────────────────────

const raiz = join(import.meta.dirname, '..', '..');
const checkout = readFileSync(join(raiz, 'app', 'api', 'billing', 'checkout', 'route.ts'), 'utf8');

function todas(texto: string, aguja: string): number[] {
  const r: number[] = [];
  for (let i = texto.indexOf(aguja); i >= 0; i = texto.indexOf(aguja, i + 1)) r.push(i);
  return r;
}

test('/api/billing/checkout, rama individual: mira la cadena (BD y Stripe) con su cerrojo antes de crear cliente y sesión', () => {
  const [, clienteSede] = todas(checkout, 'stripe.customers.create(');
  const [, sesionSede] = todas(checkout, 'stripe.checkout.sessions.create(');
  assert.ok(clienteSede && sesionSede, 'esperaba la rama individual detrás de la de cadena');
  const bloque = checkout.indexOf('if (studio.cadena_id) {');
  assert.ok(bloque > 0, 'falta el bloque de la sede de cadena en la rama individual');
  let anterior = bloque;
  for (const paso of ['cerrarCadena(studio.cadena_id', 'leerCadenaDeLaSede(admin, studio.cadena_id', 'consultarCadenaAntesDeIndividual(', 'caducarCheckouts(stripe, enStripe.expirar)']) {
    const i = checkout.indexOf(paso, bloque);
    assert.ok(i > anterior, `${paso} fuera de orden o ausente`);
    anterior = i;
  }
  assert.ok(anterior < clienteSede && anterior < sesionSede, 'la cadena se mira antes de crear el cliente y la sesión de la sede');
});

test('/api/billing/checkout, rama CADENA: cerrojo de cadena y caducar los individuales de las sedes antes de su checkoutPrevio', () => {
  const [previoCadena] = todas(checkout, 'await checkoutPrevio(');
  const cerrojo = checkout.indexOf('cerrarCadena(cadena.id)');
  const sedes = checkout.indexOf('checkoutsAbiertosDeLasSedes(');
  const caducar = checkout.indexOf('caducarCheckouts(stripe, deLasSedes)');
  assert.ok(cerrojo > 0 && cerrojo < sedes && sedes < caducar && caducar < previoCadena);
});

test('el cerrojo de cadena se libera en el finally', () => {
  const fin = checkout.slice(checkout.lastIndexOf('} finally {'));
  assert.match(fin, /if \(claveCadena\) await liberarCheckoutLock\(admin, claveCadena\)/);
});

test('/api/billing/portal elige el cliente con clienteDelPortal', () => {
  const portal = readFileSync(join(raiz, 'app', 'api', 'billing', 'portal', 'route.ts'), 'utf8');
  assert.match(portal, /clienteDelPortal\(studio\.stripe_customer_id/);
  assert.match(portal, /customer: customerId/);
});
