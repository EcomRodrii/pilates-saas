import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidirVueltaDePausa, textoMotivoVuelta, tocaDecidirVuelta } from './plazas-fijas-solicitudes.ts';

test('la vuelta se decide una semana antes del fin de la pausa, no antes', () => {
  assert.equal(tocaDecidirVuelta('2026-09-23', '2026-09-16'), true);
  assert.equal(tocaDecidirVuelta('2026-09-16', '2026-09-16'), true);
  assert.equal(tocaDecidirVuelta('2026-09-24', '2026-09-16'), false);
  assert.equal(tocaDecidirVuelta(null, '2026-09-16'), false);
});

const base = { politica: 'RECUPERAR_SI_LIBRE' as const, hueco: 'OK' as const, tieneCuota: true, superaLimite: false };

test('vuelve sola solo si el estudio lo quiere, hay hueco, tiene cuota y no pasa de su límite', () => {
  assert.deepEqual(decidirVueltaDePausa(base), { accion: 'VOLVER' });
  assert.deepEqual(decidirVueltaDePausa({ ...base, politica: 'PENDIENTE_CONFIRMAR' }), { accion: 'PREGUNTAR', motivo: 'PREGUNTAR' });
  assert.deepEqual(decidirVueltaDePausa({ ...base, hueco: 'SIN_CUPO' }), { accion: 'PREGUNTAR', motivo: 'SIN_CUPO' });
  assert.deepEqual(decidirVueltaDePausa({ ...base, hueco: 'SITIO_OCUPADO' }), { accion: 'PREGUNTAR', motivo: 'SITIO_OCUPADO' });
  assert.deepEqual(decidirVueltaDePausa({ ...base, tieneCuota: false }), { accion: 'PREGUNTAR', motivo: 'SIN_CUOTA' });
  assert.deepEqual(decidirVueltaDePausa({ ...base, superaLimite: true }), { accion: 'PREGUNTAR', motivo: 'SUPERA_LIMITE' });
});

test('si el estudio aprueba la vuelta, vuelve aunque falte cupo o cuota, pero nunca quitando el sitio a otra', () => {
  assert.deepEqual(decidirVueltaDePausa({ ...base, hueco: 'SIN_CUPO', tieneCuota: false, superaLimite: true, politica: 'PENDIENTE_CONFIRMAR', forzar: true }), { accion: 'VOLVER' });
  assert.deepEqual(decidirVueltaDePausa({ ...base, hueco: 'SITIO_OCUPADO', forzar: true }), { accion: 'IMPOSIBLE', motivo: 'SITIO_OCUPADO' });
});

test('cada motivo tiene su frase para la bandeja', () => {
  for (const m of ['SIN_CUPO', 'SITIO_OCUPADO', 'SIN_CUOTA', 'SUPERA_LIMITE', 'PREGUNTAR'] as const) {
    assert.ok(textoMotivoVuelta(m).length > 10, m);
  }
});
