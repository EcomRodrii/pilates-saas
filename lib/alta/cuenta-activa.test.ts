import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claveCuentaActiva, decidirCuentaActiva, VENTANA_CUENTA_ACTIVA_MS } from './cuenta-activa.ts';

const AHORA = Date.parse('2026-10-21T10:00:00Z');
const hace = (ms: number) => new Date(AHORA - ms).toISOString();
const BIEN = {
  userId: 'u1', duenoId: 'u1', creadoEn: hace(60_000), version: 'v2', yaEnviado: false,
  email: 'lucia@example.com', ahoraMs: AHORA,
};

test('se manda a la propietaria de un estudio recién creado por el alta nueva', () => {
  assert.deepEqual(decidirCuentaActiva(BIEN), { enviar: true });
  assert.deepEqual(decidirCuentaActiva({ ...BIEN, version: 'v2_prueba' }), { enviar: true });
});

test('al alta de siempre no le toca: tiene sus propios textos', () => {
  for (const version of ['v1', null, undefined, 'v3']) {
    assert.deepEqual(decidirCuentaActiva({ ...BIEN, version }), { enviar: false, motivo: 'no_es_alta_nueva' }, String(version));
  }
});

test('solo en la primera hora: después ya no es «tu cuenta está activa»', () => {
  assert.deepEqual(decidirCuentaActiva({ ...BIEN, creadoEn: hace(VENTANA_CUENTA_ACTIVA_MS - 1000) }), { enviar: true });
  assert.deepEqual(decidirCuentaActiva({ ...BIEN, creadoEn: hace(VENTANA_CUENTA_ACTIVA_MS + 1000) }),
    { enviar: false, motivo: 'estudio_antiguo' });
  assert.deepEqual(decidirCuentaActiva({ ...BIEN, creadoEn: hace(-3600_000) }), { enviar: false, motivo: 'estudio_antiguo' });
});

test('una sola vez, a la dueña y con email', () => {
  assert.deepEqual(decidirCuentaActiva({ ...BIEN, yaEnviado: true }), { enviar: false, motivo: 'ya_enviado' });
  assert.deepEqual(decidirCuentaActiva({ ...BIEN, duenoId: 'otra' }), { enviar: false, motivo: 'no_es_la_propietaria' });
  assert.deepEqual(decidirCuentaActiva({ ...BIEN, duenoId: null }), { enviar: false, motivo: 'no_es_la_propietaria' });
  assert.deepEqual(decidirCuentaActiva({ ...BIEN, duenoId: undefined, creadoEn: undefined }), { enviar: false, motivo: 'sin_estudio' });
  assert.deepEqual(decidirCuentaActiva({ ...BIEN, creadoEn: 'no es una fecha' }), { enviar: false, motivo: 'sin_estudio' });
  assert.deepEqual(decidirCuentaActiva({ ...BIEN, email: null }), { enviar: false, motivo: 'sin_email' });
});

test('la clave de idempotencia es por estudio', () => {
  assert.equal(claveCuentaActiva('st-1'), 'alta-cuenta-activa:st-1');
});
