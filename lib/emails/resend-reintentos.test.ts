import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esErrorTransitorioResend, conReintentoResend, type ResendEnvioResultado } from './resend-reintentos.ts';

// ── Clasificación ────────────────────────────────────────────────────────────

test('rate_limit_exceeded es transitorio — el caso real que motivó esto', () => {
  assert.equal(esErrorTransitorioResend('rate_limit_exceeded'), true);
});

test('internal_server_error y application_error también son transitorios', () => {
  assert.equal(esErrorTransitorioResend('internal_server_error'), true);
  assert.equal(esErrorTransitorioResend('application_error'), true);
});

test('un dominio/adjunto/clave inválidos son permanentes — reintentar no cambia nada', () => {
  assert.equal(esErrorTransitorioResend('invalid_from_address'), false);
  assert.equal(esErrorTransitorioResend('validation_error'), false);
  assert.equal(esErrorTransitorioResend('invalid_api_key'), false);
});

test('sin error (null/undefined) → no es transitorio (no hay nada que reintentar)', () => {
  assert.equal(esErrorTransitorioResend(null), false);
  assert.equal(esErrorTransitorioResend(undefined), false);
});

// ── Reintento ────────────────────────────────────────────────────────────────
// esperaMs pequeño a propósito: probamos la LÓGICA (cuántas veces llama, cuándo
// para), no el reloj real — con 1.1s de espera real el suite tardaría de más.

function resultadoOk(): ResendEnvioResultado { return { data: { id: 'x' }, error: null }; }
function resultadoError(name: string): ResendEnvioResultado { return { data: null, error: { name, message: 'boom' } }; }

test('éxito a la primera → una sola llamada', async () => {
  let llamadas = 0;
  const r = await conReintentoResend(async () => { llamadas++; return resultadoOk(); }, 2, 1);
  assert.equal(llamadas, 1);
  assert.equal(r.error, null);
});

test('error PERMANENTE → no reintenta, una sola llamada', async () => {
  let llamadas = 0;
  const r = await conReintentoResend(async () => { llamadas++; return resultadoError('invalid_from_address'); }, 2, 1);
  assert.equal(llamadas, 1);
  assert.equal(r.error?.name, 'invalid_from_address');
});

test('rate limit y luego éxito → reintenta una vez y funciona', async () => {
  let llamadas = 0;
  const r = await conReintentoResend(async () => {
    llamadas++;
    return llamadas === 1 ? resultadoError('rate_limit_exceeded') : resultadoOk();
  }, 2, 1);
  assert.equal(llamadas, 2);
  assert.equal(r.error, null);
});

test('rate limit persistente → se rinde tras agotar los intentos, sin lanzar', async () => {
  let llamadas = 0;
  const r = await conReintentoResend(async () => { llamadas++; return resultadoError('rate_limit_exceeded'); }, 2, 1);
  assert.equal(llamadas, 2); // el máximo pedido, ni uno más
  assert.equal(r.error?.name, 'rate_limit_exceeded');
});

test('respeta un número de intentos distinto del por defecto', async () => {
  let llamadas = 0;
  const r = await conReintentoResend(async () => { llamadas++; return resultadoError('rate_limit_exceeded'); }, 4, 1);
  assert.equal(llamadas, 4);
  assert.equal(r.error?.name, 'rate_limit_exceeded');
});
