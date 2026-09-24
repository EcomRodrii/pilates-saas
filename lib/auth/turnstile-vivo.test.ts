import test from 'node:test';
import assert from 'node:assert/strict';
import { ejecutarWidget, leerTokenDelWidget, reiniciarWidget } from './turnstile-vivo.ts';

// El error que lanza Cloudflare de verdad cuando el id ya no está en su registro.
const muerto = () => { const e = new Error('[Cloudflare Turnstile] Could not find widget for provided container.'); e.name = 'TurnstileError'; throw e; };

test('un widget vivo con token lo devuelve', () => {
  assert.deepEqual(leerTokenDelWidget({ getResponse: () => 'tok-123' }, 'w1'), { estado: 'vivo', token: 'tok-123' });
});

test('un widget vivo SIN token (aún no se ha ejecutado) no es un widget muerto', () => {
  // `getResponse` da undefined o '' hasta que se pide el desafío: hay que
  // ejecutar, no reconstruir.
  assert.deepEqual(leerTokenDelWidget({ getResponse: () => undefined }, 'w1'), { estado: 'vivo', token: null });
  assert.deepEqual(leerTokenDelWidget({ getResponse: () => '' }, 'w1'), { estado: 'vivo', token: null });
});

test('si getResponse lanza, el widget está muerto y NO se propaga la excepción', () => {
  assert.deepEqual(leerTokenDelWidget({ getResponse: muerto }, 'w1'), { estado: 'muerto' });
});

test('se le pasa el id que se pidió', () => {
  const vistos: string[] = [];
  leerTokenDelWidget({ getResponse: (id) => { vistos.push(id); return undefined; } }, 'cf-chl-widget-abc');
  ejecutarWidget({ execute: (id) => { vistos.push(id); } }, 'cf-chl-widget-abc');
  reiniciarWidget({ reset: (id) => { vistos.push(id); } }, 'cf-chl-widget-abc');
  assert.deepEqual(vistos, ['cf-chl-widget-abc', 'cf-chl-widget-abc', 'cf-chl-widget-abc']);
});

test('ejecutar: vivo si dispara, muerto si lanza', () => {
  assert.equal(ejecutarWidget({ execute: () => {} }, 'w1'), 'vivo');
  assert.equal(ejecutarWidget({ execute: muerto }, 'w1'), 'muerto');
});

test('reiniciar: true si lo devolvió a cero, false si ya no existe', () => {
  assert.equal(reiniciarWidget({ reset: () => {} }, 'w1'), true);
  assert.equal(reiniciarWidget({ reset: muerto }, 'w1'), false);
});
