import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nonceValido, sesionAutenticadaPorEmailDespuesDe, TOLERANCIA_PUENTE_MS } from './puente-sesion.ts';

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function jwt(payload: unknown): string {
  return `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.firma-falsa`;
}

const ABIERTO_EN = Date.UTC(2026, 8, 13, 10, 0, 0);
const seg = (ms: number) => Math.floor(ms / 1000);

test('OTP posterior a abrir el puente → se reenvía', () => {
  const token = jwt({ sub: 'u1', amr: [{ method: 'otp', timestamp: seg(ABIERTO_EN + 45_000) }] });
  assert.equal(sesionAutenticadaPorEmailDespuesDe(token, ABIERTO_EN), true);
});

test('magiclink (flujo PKCE) posterior → se reenvía', () => {
  const token = jwt({ amr: [{ method: 'magiclink', timestamp: seg(ABIERTO_EN + 5_000) }] });
  assert.equal(sesionAutenticadaPorEmailDespuesDe(token, ABIERTO_EN), true);
});

test('OTP anterior a abrir el puente → NO se reenvía (sesión preexistente)', () => {
  const token = jwt({ amr: [{ method: 'otp', timestamp: seg(ABIERTO_EN - 3_600_000) }] });
  assert.equal(sesionAutenticadaPorEmailDespuesDe(token, ABIERTO_EN), false);
});

test('OTP un poco anterior pero dentro de la tolerancia de reloj → se reenvía', () => {
  const token = jwt({ amr: [{ method: 'otp', timestamp: seg(ABIERTO_EN - 10_000) }] });
  assert.equal(sesionAutenticadaPorEmailDespuesDe(token, ABIERTO_EN), true);
});

test('justo fuera de la tolerancia → NO', () => {
  const token = jwt({ amr: [{ method: 'otp', timestamp: seg(ABIERTO_EN - TOLERANCIA_PUENTE_MS - 2_000) }] });
  assert.equal(sesionAutenticadaPorEmailDespuesDe(token, ABIERTO_EN), false);
});

test('tolerancia explícita a cero', () => {
  const token = jwt({ amr: [{ method: 'otp', timestamp: seg(ABIERTO_EN - 10_000) }] });
  assert.equal(sesionAutenticadaPorEmailDespuesDe(token, ABIERTO_EN, 0), false);
});

test('password u oauth recientes → NO (no es un acceso por email)', () => {
  for (const method of ['password', 'oauth', 'token_refresh', 'anonymous', 'totp']) {
    const token = jwt({ amr: [{ method, timestamp: seg(ABIERTO_EN + 1_000) }] });
    assert.equal(sesionAutenticadaPorEmailDespuesDe(token, ABIERTO_EN), false, method);
  }
});

test('OTP antiguo + password reciente en el mismo amr → NO', () => {
  const token = jwt({
    amr: [
      { method: 'password', timestamp: seg(ABIERTO_EN + 1_000) },
      { method: 'otp', timestamp: seg(ABIERTO_EN - 3_600_000) },
    ],
  });
  assert.equal(sesionAutenticadaPorEmailDespuesDe(token, ABIERTO_EN), false);
});

test('sin amr, amr vacío o amr en formato RFC sin fecha → NO', () => {
  assert.equal(sesionAutenticadaPorEmailDespuesDe(jwt({ sub: 'u1' }), ABIERTO_EN), false);
  assert.equal(sesionAutenticadaPorEmailDespuesDe(jwt({ amr: [] }), ABIERTO_EN), false);
  assert.equal(sesionAutenticadaPorEmailDespuesDe(jwt({ amr: ['otp'] }), ABIERTO_EN), false);
  assert.equal(sesionAutenticadaPorEmailDespuesDe(jwt({ amr: [{ method: 'otp' }] }), ABIERTO_EN), false);
  assert.equal(sesionAutenticadaPorEmailDespuesDe(jwt({ amr: [{ method: 'otp', timestamp: String(seg(ABIERTO_EN + 1_000)) }] }), ABIERTO_EN), false);
});

test('tokens malformados → NO', () => {
  const payloadBueno = b64url({ amr: [{ method: 'otp', timestamp: seg(ABIERTO_EN + 1_000) }] });
  assert.equal(sesionAutenticadaPorEmailDespuesDe('basura', ABIERTO_EN), false);
  assert.equal(sesionAutenticadaPorEmailDespuesDe('', ABIERTO_EN), false);
  assert.equal(sesionAutenticadaPorEmailDespuesDe(`cabecera.${payloadBueno}`, ABIERTO_EN), false);
  assert.equal(sesionAutenticadaPorEmailDespuesDe(`a.${payloadBueno}.c.d`, ABIERTO_EN), false);
  assert.equal(sesionAutenticadaPorEmailDespuesDe(`a.${Buffer.from('no es json').toString('base64url')}.c`, ABIERTO_EN), false);
  assert.equal(sesionAutenticadaPorEmailDespuesDe(`a.${Buffer.from('"texto"').toString('base64url')}.c`, ABIERTO_EN), false);
  assert.equal(sesionAutenticadaPorEmailDespuesDe('a.%%%.c', ABIERTO_EN), false);
  assert.equal(sesionAutenticadaPorEmailDespuesDe(undefined as unknown as string, ABIERTO_EN), false);
});

test('desdeMs no numérico → NO', () => {
  const token = jwt({ amr: [{ method: 'otp', timestamp: seg(ABIERTO_EN + 1_000) }] });
  assert.equal(sesionAutenticadaPorEmailDespuesDe(token, Number.NaN), false);
});

test('nonceValido acepta un UUID y rechaza lo demás', () => {
  assert.equal(nonceValido('3f1c2a4e-9b7d-4c1e-8a2b-5d6e7f8a9b0c'), true);
  assert.equal(nonceValido(undefined), false);
  assert.equal(nonceValido(''), false);
  assert.equal(nonceValido('corto'), false);
  assert.equal(nonceValido('a'.repeat(65)), false);
  assert.equal(nonceValido('3f1c2a4e 9b7d 4c1e 8a2b'), false);
  assert.equal(nonceValido('<script>alert(1)</script>xx'), false);
  assert.equal(nonceValido(['3f1c2a4e-9b7d-4c1e-8a2b-5d6e7f8a9b0c']), false);
});
