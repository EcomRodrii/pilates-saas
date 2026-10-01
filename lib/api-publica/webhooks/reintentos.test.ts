import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIAS_PARA_DESACTIVAR, ESPERAS_MINUTOS, MAX_INTENTOS, debeDesactivarsePorFallos, decidirTrasIntento, describirFallo } from './reintentos.ts';
import type { ResultadoEnvio } from './envio.ts';

const ahora = new Date('2026-10-01T10:00:00Z');
const http = (estadoHttp: number): ResultadoEnvio => ({ tipo: 'respuesta', estadoHttp, duracionMs: 10 });
const caida: ResultadoEnvio = { tipo: 'error', error: 'El servidor rechazó la conexión.', destinoNoPermitido: false, duracionMs: 5 };

test('cualquier 2xx es entregado', () => {
  for (const c of [200, 201, 202, 204, 299]) assert.equal(decidirTrasIntento(http(c), 1, ahora).decision.estado, 'ENTREGADA');
});

test('lo demás se reintenta con esperas crecientes, durante casi 3 días', () => {
  let total = 0;
  for (let n = 1; n < MAX_INTENTOS; n++) {
    const { decision } = decidirTrasIntento(n % 2 ? http(500) : caida, n, ahora);
    assert.equal(decision.estado, 'PENDIENTE', `intento ${n}`);
    const espera = (decision as { proximoIntentoEn: Date }).proximoIntentoEn.getTime() - ahora.getTime();
    assert.equal(espera, ESPERAS_MINUTOS[n - 1] * 60_000);
    total += espera;
  }
  assert.ok(total > 2.5 * 86_400_000 && total < DIAS_PARA_DESACTIVAR * 86_400_000, `${total / 3_600_000} h`);
  assert.equal(decidirTrasIntento(http(500), MAX_INTENTOS, ahora).decision.estado, 'FALLIDA');
});

test('un 4xx o una redirección también se reintentan (el destino puede arreglarse)', () => {
  for (const c of [301, 302, 400, 401, 404, 429]) assert.equal(decidirTrasIntento(http(c), 1, ahora).decision.estado, 'PENDIENTE', String(c));
});

test('410: no se insiste y el webhook se desactiva', () => {
  assert.deepEqual(decidirTrasIntento(http(410), 1, ahora), { decision: { estado: 'FALLIDA' }, efecto: 'desactivar_destino_retirado' });
});

test('un destino interno no deja de serlo: no se reintenta', () => {
  const r: ResultadoEnvio = { tipo: 'error', error: 'privada', destinoNoPermitido: true, duracionMs: 1 };
  assert.equal(decidirTrasIntento(r, 1, ahora).decision.estado, 'FALLIDA');
});

test('se desactiva tras DIAS_PARA_DESACTIVAR días fallando, no antes', () => {
  assert.equal(debeDesactivarsePorFallos(null, ahora), false);
  assert.equal(debeDesactivarsePorFallos(new Date(ahora.getTime() - (DIAS_PARA_DESACTIVAR * 86_400_000 - 60_000)).toISOString(), ahora), false);
  assert.equal(debeDesactivarsePorFallos(new Date(ahora.getTime() - DIAS_PARA_DESACTIVAR * 86_400_000).toISOString(), ahora), true);
});

test('describirFallo: nada si se entregó; el código o el error si no', () => {
  assert.equal(describirFallo(http(200)), null);
  assert.equal(describirFallo(http(500)), 'Respondió 500.');
  assert.match(describirFallo(http(302))!, /redirección/);
  assert.equal(describirFallo(caida), 'El servidor rechazó la conexión.');
});
