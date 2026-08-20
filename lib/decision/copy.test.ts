import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etiquetaImpacto, fraseConfianza } from './copy.ts';

test('fraseConfianza: nunca devuelve la etiqueta cruda ALTA/MEDIA/BAJA', () => {
  for (const nivel of ['ALTA', 'MEDIA', 'BAJA'] as const) {
    const frase = fraseConfianza(nivel);
    assert.notEqual(frase, nivel);
    assert.ok(frase.length > 0);
  }
});

test('fraseConfianza: nombra el nivel explícitamente, en vocabulario profesional', () => {
  assert.equal(fraseConfianza('ALTA'), 'Confianza alta.');
  assert.equal(fraseConfianza('MEDIA'), 'Confianza media.');
  assert.equal(fraseConfianza('BAJA'), 'Confianza baja.');
});

test('etiquetaImpacto: PERDIDA siempre es "en riesgo", sea cual sea el tipo', () => {
  assert.equal(etiquetaImpacto('PERDIDA', 'RECUPERAR_SOCIA'), 'Ingresos en riesgo');
  assert.equal(etiquetaImpacto('PERDIDA', 'COBRAR_PENDIENTE'), 'Ingresos en riesgo');
});

test('etiquetaImpacto: OPORTUNIDAD de cobro pendiente es "recuperables"', () => {
  assert.equal(etiquetaImpacto('OPORTUNIDAD', 'RECUPERAR_PAGOS'), 'Ingresos potenciales recuperables');
  assert.equal(etiquetaImpacto('OPORTUNIDAD', 'COBRAR_PENDIENTE'), 'Ingresos potenciales recuperables');
});

test('etiquetaImpacto: cualquier otra OPORTUNIDAD es "impacto potencial estimado"', () => {
  assert.equal(etiquetaImpacto('OPORTUNIDAD', 'ABRIR_SESION'), 'Impacto potencial estimado');
  assert.equal(etiquetaImpacto('OPORTUNIDAD', 'FUSIONAR_SESIONES'), 'Impacto potencial estimado');
});
