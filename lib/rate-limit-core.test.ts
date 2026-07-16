import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clientIp, rateLimitKey, retryAfterSeconds, tooManyRequestsResponse,
} from './rate-limit-core.ts';

const reqWith = (headers: Record<string, string>) => new Request('http://x/api', { headers });

test('clientIp: toma la PRIMERA ip de x-forwarded-for (cliente original)', () => {
  assert.equal(clientIp(reqWith({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 9.9.9.9' })), '1.2.3.4');
});

test('clientIp: recorta espacios', () => {
  assert.equal(clientIp(reqWith({ 'x-forwarded-for': '  1.2.3.4  , 5.6.7.8' })), '1.2.3.4');
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
