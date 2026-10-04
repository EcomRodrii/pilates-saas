import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ErrorSumup, clienteSumup, estadoDesdeSumup, importeCoincide, leerCuerpoAviso, leerReferenciaSumup,
  normalizarCodigoSumup, proveedorDeReferencia, referenciaSumup, type FetchSumup, type TransaccionSumup,
} from './sumup.ts';
import { firmaAviso, leerAviso, urlDeAviso } from './sumup-aviso.ts';

const ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const EMITIDA = new Date('2026-10-04T10:00:00Z');
const seg = (s: number) => new Date(EMITIDA.getTime() + s * 1000);

test('la referencia lleva quién cobra, desde cuándo y con qué id; y se lee de vuelta', () => {
  const ref = referenciaSumup(ID, EMITIDA);
  assert.equal(ref, `sumup:${EMITIDA.getTime() / 1000}:${ID}`);
  assert.deepEqual(leerReferenciaSumup(ref), { emitidaEn: EMITIDA, clientTransactionId: ID });
  for (const mala of [null, '', 'pi_123', 'sumup:', 'sumup:abc:' + ID, `sumup:1759572000:${ID};drop`]) {
    assert.equal(leerReferenciaSumup(mala), null, String(mala));
  }
});

test('quién cobra lo guardado: el prefijo manda; sin referencia, nadie', () => {
  assert.equal(proveedorDeReferencia(referenciaSumup(ID, EMITIDA)), 'sumup');
  assert.equal(proveedorDeReferencia('pi_3Q'), 'stripe');
  assert.equal(proveedorDeReferencia('cs_test_1'), 'stripe', 'Bizum sigue siendo Stripe');
  assert.equal(proveedorDeReferencia(null), null);
  assert.equal(proveedorDeReferencia(''), null);
});

const tx = (status: string, amount = 45, currency = 'EUR'): TransaccionSumup => ({ id: 'tx-1', amount, currency, status });

test('el estado, en el idioma de la Caja; lo desconocido o ya devuelto nunca es PAGADO', () => {
  assert.equal(estadoDesdeSumup(tx('SUCCESSFUL'), EMITIDA, seg(5)), 'PAGADO');
  assert.equal(estadoDesdeSumup(tx('PENDING'), EMITIDA, seg(5)), 'PROCESANDO');
  assert.equal(estadoDesdeSumup(tx('FAILED'), EMITIDA, seg(5)), 'RECHAZADO');
  assert.equal(estadoDesdeSumup(tx('CANCELLED'), EMITIDA, seg(5)), 'CANCELADO');
  assert.equal(estadoDesdeSumup(tx('REFUNDED'), EMITIDA, seg(5)), 'ERROR');
  assert.equal(estadoDesdeSumup(tx('ALGO_NUEVO'), EMITIDA, seg(5)), 'ERROR');
});

test('sin transacción todavía: se espera el minuto de SumUp y un margen; después, no llegó a empezar', () => {
  assert.equal(estadoDesdeSumup(null, EMITIDA, seg(10)), 'PENDIENTE');
  assert.equal(estadoDesdeSumup(null, EMITIDA, seg(119)), 'PENDIENTE');
  assert.equal(estadoDesdeSumup(null, EMITIDA, seg(120)), 'EXPIRADO');
});

test('el importe tiene que ser el pedido, en euros (SumUp lo da en decimal)', () => {
  assert.equal(importeCoincide({ amount: 45, currency: 'EUR' }, 4500), true);
  assert.equal(importeCoincide({ amount: 12.35, currency: 'EUR' }, 1235), true);
  assert.equal(importeCoincide({ amount: 0.1 + 0.2, currency: 'EUR' }, 30), true, 'sin errores de coma flotante');
  assert.equal(importeCoincide({ amount: 45, currency: 'EUR' }, 4501), false);
  assert.equal(importeCoincide({ amount: 45, currency: 'GBP' }, 4500), false);
  assert.equal(importeCoincide({ amount: Number.NaN, currency: 'EUR' }, 0), false);
});

test('el código del Solo: 8 o 9 letras y números, sin las tres palabras de Stripe', () => {
  assert.equal(normalizarCodigoSumup(' ab12-cd34 '), 'AB12CD34');
  assert.equal(normalizarCodigoSumup('ABCD12345'), 'ABCD12345');
  for (const malo of ['sepia-cerulean-aqua', 'ABC123', 'ABCDEFGHIJ', 'ÑANDU1234', 42, null]) {
    assert.equal(normalizarCodigoSumup(malo), null, String(malo));
  }
});

test('el cuerpo del aviso solo dice a quién preguntar, y solo si es el evento del Solo', () => {
  const cuerpo = { event_type: 'solo.transaction.updated', payload: { client_transaction_id: ID, merchant_code: 'M1234567', status: 'successful' } };
  assert.deepEqual(leerCuerpoAviso(cuerpo), { clientTransactionId: ID, merchantCode: 'M1234567' });
  assert.equal(leerCuerpoAviso({ ...cuerpo, event_type: 'otro' }), null);
  assert.equal(leerCuerpoAviso({ event_type: 'solo.transaction.updated', payload: { client_transaction_id: '../x' } }), null);
  assert.equal(leerCuerpoAviso('hola'), null);
});

test('la return_url firmada: vuelve el mismo objeto; tocada, de otro estudio o sin secreto, no vale', () => {
  const url = new URL(urlDeAviso('https://tentare.app/', 'secreto', 'studio-1', { tipo: 'recibo', id: 'rec-1' }));
  assert.equal(url.pathname, '/api/webhooks/sumup');
  assert.deepEqual(leerAviso('secreto', url.searchParams), { studioId: 'studio-1', objeto: { tipo: 'recibo', id: 'rec-1' } });

  const otroEstudio = new URLSearchParams(url.searchParams); otroEstudio.set('e', 'studio-2');
  assert.equal(leerAviso('secreto', otroEstudio), null);
  const otroObjeto = new URLSearchParams(url.searchParams); otroObjeto.set('o', 'venta:v-9');
  assert.equal(leerAviso('secreto', otroObjeto), null);
  assert.equal(leerAviso('otro-secreto', url.searchParams), null);
  assert.equal(leerAviso('', url.searchParams), null);
  const raro = new URLSearchParams(url.searchParams); raro.set('o', 'recibo:../../x');
  assert.equal(leerAviso('secreto', raro), null);
  assert.equal(firmaAviso('s', 'e', { tipo: 'venta', id: 'v' }), firmaAviso('s', 'e', { tipo: 'venta', id: 'v' }));
});

// ── Cliente, con un fetch de mentira ────────────────────────────────────────

type Llamada = { url: string; method: string; body: unknown; auth: string };
function fakeFetch(respuestas: Array<{ status: number; body?: unknown }>) {
  const llamadas: Llamada[] = [];
  const f: FetchSumup = async (url, init) => {
    llamadas.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers.Authorization });
    const r = respuestas.shift() ?? { status: 500, body: {} };
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  };
  return { f, llamadas };
}

test('cobrar: importe en céntimos y EUR, con la return_url y el afiliado; devuelve el id del cobro', async () => {
  const { f, llamadas } = fakeFetch([{ status: 201, body: { client_transaction_id: ID, checkout_id: 'ck-1' } }]);
  const c = clienteSumup({ token: 'tok', fetch: f });
  const r = await c.cobrar('M123', 'rdr_1', {
    centimos: 4500, descripcion: 'Sesión privada', returnUrl: 'https://tentare.app/api/webhooks/sumup?x',
    afiliado: { appId: 'app.tentare', key: 'aff' }, referenciaExterna: 'venta:v-1',
  });
  assert.deepEqual(r, { clientTransactionId: ID, checkoutId: 'ck-1' });
  assert.equal(llamadas[0].url, 'https://api.sumup.com/v0.1/merchants/M123/readers/rdr_1/checkout');
  assert.equal(llamadas[0].auth, 'Bearer tok');
  assert.deepEqual(llamadas[0].body, {
    total_amount: { currency: 'EUR', minor_unit: 2, value: 4500 },
    description: 'Sesión privada',
    return_url: 'https://tentare.app/api/webhooks/sumup?x',
    affiliate: { app_id: 'app.tentare', key: 'aff', foreign_transaction_id: 'venta:v-1' },
  });
});

test('cobrar: un importe raro no sale de aquí; una respuesta sin id es un error, no un cobro', async () => {
  const { f, llamadas } = fakeFetch([{ status: 201, body: {} }]);
  const c = clienteSumup({ token: 'tok', fetch: f });
  const base = { descripcion: 'x', returnUrl: 'https://x', afiliado: { appId: 'a', key: 'k' }, referenciaExterna: 'venta:v' };
  await assert.rejects(c.cobrar('M', 'r', { ...base, centimos: 0 }), ErrorSumup);
  await assert.rejects(c.cobrar('M', 'r', { ...base, centimos: 12.5 }), ErrorSumup);
  assert.equal(llamadas.length, 0);
  await assert.rejects(c.cobrar('M', 'r', { ...base, centimos: 100 }), /no devolvió el id/);
});

test('buscar la transacción: 404 es «todavía no hay», 401 es token caducado (no un cobro fallido)', async () => {
  const ok = fakeFetch([{ status: 200, body: { id: 'tx-1', amount: 45, currency: 'EUR', status: 'SUCCESSFUL', client_transaction_id: ID } }]);
  const t = await clienteSumup({ token: 't', fetch: ok.f }).buscarTransaccion('M123', ID);
  assert.equal(t?.status, 'SUCCESSFUL');
  assert.equal(ok.llamadas[0].url, `https://api.sumup.com/v2.1/merchants/M123/transactions?client_transaction_id=${ID}`);

  const no = fakeFetch([{ status: 404, body: { error_code: 'NOT_FOUND', message: 'Resource not found' } }]);
  assert.equal(await clienteSumup({ token: 't', fetch: no.f }).buscarTransaccion('M123', ID), null);

  const caducado = fakeFetch([{ status: 401, body: { error_code: 'INVALID_ACCESS_TOKEN' } }]);
  await assert.rejects(clienteSumup({ token: 't', fetch: caducado.f }).buscarTransaccion('M123', ID),
    (e: unknown) => e instanceof ErrorSumup && e.caducado && e.codigo === 'INVALID_ACCESS_TOKEN');

  const rara = fakeFetch([{ status: 200, body: { id: 'tx-1', status: 'SUCCESSFUL' } }]);
  await assert.rejects(clienteSumup({ token: 't', fetch: rara.f }).buscarTransaccion('M123', ID), /forma esperada/);
});

test('emparejar, estado, terminar y devolver: las rutas y cuerpos de la API', async () => {
  const { f, llamadas } = fakeFetch([
    { status: 201, body: { id: 'rdr_1', name: 'Mostrador', status: 'paired', device: { model: 'virtual-solo' } } },
    { status: 200, body: { data: { status: 'ONLINE', state: 'WAITING_FOR_CARD' } } },
    { status: 204 },
    { status: 204 },
    { status: 204 },
  ]);
  const c = clienteSumup({ token: 't', fetch: f });
  assert.deepEqual(await c.emparejarLector('M123', { codigo: 'AB12CD34', nombre: 'Mostrador' }),
    { id: 'rdr_1', nombre: 'Mostrador', estado: 'paired', modelo: 'virtual-solo' });
  assert.deepEqual(llamadas[0].body, { pairing_code: 'AB12CD34', name: 'Mostrador' });
  assert.deepEqual(await c.estadoLector('M123', 'rdr_1'), { conectado: true, ocupado: true });
  assert.equal(llamadas[1].url, 'https://api.sumup.com/v0.1/merchants/M123/readers/rdr_1/status');
  await c.terminar('M123', 'rdr_1');
  assert.equal(llamadas[2].url, 'https://api.sumup.com/v0.1/merchants/M123/readers/rdr_1/terminate');
  await c.devolver('tx-1');
  assert.equal(llamadas[3].url, 'https://api.sumup.com/v0.1/me/refund/tx-1');
  assert.equal(llamadas[3].body, undefined, 'sin cuerpo = devolución total');
  await c.devolver('tx-1', 1250);
  assert.deepEqual(llamadas[4].body, { amount: 12.5 });
});

test('las rutas escapan lo que viene de fuera', async () => {
  const { f, llamadas } = fakeFetch([{ status: 204 }]);
  await clienteSumup({ token: 't', fetch: f }).terminar('M/1', 'r?x=1');
  assert.equal(llamadas[0].url, 'https://api.sumup.com/v0.1/merchants/M%2F1/readers/r%3Fx%3D1/terminate');
});
