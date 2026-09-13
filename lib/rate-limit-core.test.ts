import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LONGITUD_HMAC_CLAVE, aplicarRateLimit, claveOpaca, clientIp, rateLimitKey, retryAfterSeconds,
  secretoRateLimit, tooManyRequestsResponse,
} from './rate-limit-core.ts';

const reqWith = (headers: Record<string, string>) => new Request('http://x/api', { headers });

test('clientIp: toma la ÚLTIMA ip de x-forwarded-for (la que añadió el borde de confianza, no la que manda el cliente)', () => {
  assert.equal(clientIp(reqWith({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 9.9.9.9' })), '9.9.9.9');
});

test('clientIp: recorta espacios', () => {
  assert.equal(clientIp(reqWith({ 'x-forwarded-for': '  1.2.3.4  , 5.6.7.8  ' })), '5.6.7.8');
});

test('clientIp: una sola IP en x-forwarded-for se usa igual', () => {
  assert.equal(clientIp(reqWith({ 'x-forwarded-for': '1.2.3.4' })), '1.2.3.4');
});

test('clientIp: cae a x-real-ip si no hay x-forwarded-for', () => {
  assert.equal(clientIp(reqWith({ 'x-real-ip': '10.0.0.1' })), '10.0.0.1');
});

test('clientIp: sin cabeceras → "unknown" (lado seguro: cubo compartido)', () => {
  assert.equal(clientIp(reqWith({})), 'unknown');
});

test('clientIp: x-forwarded-for vacío no gana a x-real-ip', () => {
  assert.equal(clientIp(reqWith({ 'x-forwarded-for': '   ', 'x-real-ip': '10.0.0.2' })), '10.0.0.2');
});

test('rateLimitKey: formato ruta:ip y ruta:ip:extra', () => {
  const req = reqWith({ 'x-forwarded-for': '1.2.3.4' });
  assert.equal(rateLimitKey('public-reserva', req), 'public-reserva:1.2.3.4');
  assert.equal(rateLimitKey('public-studio-data', req, 'mi-estudio'), 'public-studio-data:1.2.3.4:mi-estudio');
});

test('retryAfterSeconds: redondea hacia arriba y respeta mínimo 1', () => {
  const now = 1_000_000;
  assert.equal(retryAfterSeconds(new Date(now + 4200), 60, now), 5); // 4.2s → ceil 5
  assert.equal(retryAfterSeconds(new Date(now + 100), 60, now), 1);  // 0.1s → min 1
  assert.equal(retryAfterSeconds(new Date(now - 5000), 60, now), 1); // pasado → min 1
});

test('retryAfterSeconds: sin resetAt cae al tamaño de ventana', () => {
  assert.equal(retryAfterSeconds(null, 60), 60);
  assert.equal(retryAfterSeconds(null, 30), 30);
});

test('tooManyRequestsResponse: 429 con cabecera Retry-After', () => {
  const res = tooManyRequestsResponse(12);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('retry-after'), '12');
  assert.equal(res.headers.get('content-type'), 'application/json');
});

// ── Claves opacas (RGPD): `rate_limits` no guarda IPs ni emails en claro ──

const SECRETO = 'secreto-de-prueba-que-no-es-de-verdad';
const FORMATO_OPACO = new RegExp(`^[a-z0-9_-]+:[0-9a-f]{${LONGITUD_HMAC_CLAVE}}$`);

test('claveOpaca: conserva el nombre de ruta y sustituye la IP por un HMAC truncado', async () => {
  const clave = await claveOpaca('public-reserva:203.0.113.7', SECRETO);
  assert.match(clave, FORMATO_OPACO);
  assert.ok(clave.startsWith('public-reserva:'));
  assert.ok(!clave.includes('203.0.113.7'));
});

test('claveOpaca: el email del cerrojo de OTP no queda en la clave', async () => {
  const clave = await claveOpaca('otp-verify-email:ana.garcia@example.com', SECRETO);
  assert.ok(!clave.includes('@'));
  assert.ok(!clave.includes('ana.garcia'));
  assert.ok(clave.startsWith('otp-verify-email:'));
});

test('claveOpaca: determinista con el mismo secreto, distinta con otro (y distinta por entrada)', async () => {
  const a = await claveOpaca('ruta:1.2.3.4', SECRETO);
  assert.equal(a, await claveOpaca('ruta:1.2.3.4', SECRETO));
  assert.notEqual(a, await claveOpaca('ruta:1.2.3.4', `${SECRETO}-2`));
  assert.notEqual(a, await claveOpaca('ruta:1.2.3.5', SECRETO));
});

test('claveOpaca: si lo que va antes de ":" no parece un nombre de ruta, no lo deja en claro', async () => {
  const sinDosPuntos = await claveOpaca('ana@example.com', SECRETO);
  assert.ok(sinDosPuntos.startsWith('rl:'));
  assert.ok(!sinDosPuntos.includes('@'));
  const prefijoRaro = await claveOpaca('ana@example.com:extra', SECRETO);
  assert.ok(prefijoRaro.startsWith('rl:'));
});

test('claveOpaca: sin secreto lanza (nunca un hash sin clave, que se invierte por fuerza bruta)', async () => {
  await assert.rejects(() => claveOpaca('ruta:1.2.3.4', ''));
});

test('secretoRateLimit: variable propia primero, service role después, vacío si no hay ninguna', () => {
  assert.equal(secretoRateLimit({ RATE_LIMIT_HMAC_SECRET: 'propio', SUPABASE_SERVICE_ROLE_KEY: 'srk' }), 'propio');
  assert.equal(secretoRateLimit({ RATE_LIMIT_HMAC_SECRET: '  ', SUPABASE_SERVICE_ROLE_KEY: 'srk' }), 'srk');
  assert.equal(secretoRateLimit({}), '');
});

test('aplicarRateLimit: la clave que llega a la RPC es opaca y el veredicto se traduce', async () => {
  const claves: string[] = [];
  const rpc = async (clave: string) => {
    claves.push(clave);
    return { data: [{ allowed: false, remaining: 0, reset_at: '2026-09-13T10:00:00Z' }], error: null };
  };
  const r = await aplicarRateLimit(rpc, SECRETO, 'otp-verify-email:ana@example.com', { max: 6, windowSeconds: 900 });
  assert.equal(claves.length, 1);
  assert.ok(!claves[0].includes('@'));
  assert.match(claves[0], FORMATO_OPACO);
  assert.equal(r.allowed, false);
  assert.equal(r.resetAt?.toISOString(), '2026-09-13T10:00:00.000Z');
});

test('aplicarRateLimit: sin secreto NO llama a la RPC (antes que escribir en claro, deja pasar)', async () => {
  let llamadas = 0;
  const rpc = async () => { llamadas++; return { data: null, error: null }; };
  const r = await aplicarRateLimit(rpc, '', 'ruta:1.2.3.4', { max: 5, windowSeconds: 60 });
  assert.equal(llamadas, 0);
  assert.deepEqual(r, { allowed: true, remaining: 5, resetAt: null });
});

test('aplicarRateLimit: fail-open ante error o excepción de la RPC, y sin cliente', async () => {
  const opts = { max: 3, windowSeconds: 60 };
  assert.equal((await aplicarRateLimit(async () => ({ data: null, error: { message: 'x' } }), SECRETO, 'r:1', opts)).allowed, true);
  assert.equal((await aplicarRateLimit(async () => { throw new Error('red'); }, SECRETO, 'r:1', opts)).allowed, true);
  assert.equal((await aplicarRateLimit(null, SECRETO, 'r:1', opts)).allowed, true);
});
