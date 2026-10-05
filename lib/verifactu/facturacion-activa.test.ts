import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  envioActivado, ofrecerAlta, pasoDelAlta, finDePermanencia, avisoPermanencia, ALTA_ABIERTA_A_ESTUDIOS, puedeEmitir,
} from './facturacion-activa.ts';

test('envioActivado: solo con fecha de primera activación', () => {
  assert.equal(envioActivado('2026-10-01T10:00:00Z'), true);
  assert.equal(envioActivado(null), false);
  assert.equal(envioActivado(undefined), false);
});

test('ofrecerAlta: con el alta abierta, a cualquier estudio, también al que no la ha empezado', () => {
  assert.equal(ALTA_ABIERTA_A_ESTUDIOS, true, 'si se cierra, revisa los textos de Facturación y del alta');
  for (const e of ['SIN_CONFIGURAR', 'PENDIENTE_AUTORIZACION', 'AUTORIZACION_EN_REVISION', 'VERIFICADO'] as const) assert.equal(ofrecerAlta(e), true, e);
});

test('pasoDelAlta: cada estado previo a la activación dice qué falta', () => {
  assert.match(pasoDelAlta('PENDIENTE_AUTORIZACION'), /Falta tu autorización/);
  assert.match(pasoDelAlta('VERIFICADO'), /falta que Tentare active el envío/);
});

test('finDePermanencia: el 31 de diciembre del año en curso, en hora de Madrid', () => {
  assert.equal(finDePermanencia(new Date('2026-09-30T12:00:00Z')), '31 de diciembre de 2026');
  // 31-dic 23:30 UTC ya es 1-ene en Madrid: la permanencia es la del año nuevo.
  assert.equal(finDePermanencia(new Date('2026-12-31T23:30:00Z')), '31 de diciembre de 2027');
});

test('avisoPermanencia: cita el artículo y dice qué hacer', () => {
  const t = avisoPermanencia(new Date('2026-09-30T12:00:00Z'));
  assert.match(t, /31 de diciembre de 2026/);
  assert.match(t, /art\. 17\.2/);
  assert.match(t, /otro sistema Veri\*Factu/);
});

test('puedeEmitir: activado y con poder vigente; una pausa o una suspensión no lo quitan', () => {
  const ACT = '2026-10-01T10:00:00Z';
  for (const e of ['PRODUCCION', 'PAUSADO', 'SUSPENDIDO_AEAT', 'VERIFICADO'] as const) assert.equal(puedeEmitir(ACT, e), true, e);
});

test('puedeEmitir: sin poder (revocado, caducado, datos cambiados) o sin activar nunca, no', () => {
  const ACT = '2026-10-01T10:00:00Z';
  for (const e of ['PENDIENTE_AUTORIZACION', 'AUTORIZACION_EN_REVISION', 'SIN_CONFIGURAR'] as const) assert.equal(puedeEmitir(ACT, e), false, e);
  assert.equal(puedeEmitir(null, 'PRODUCCION'), false, 'sin activar nunca');
});
