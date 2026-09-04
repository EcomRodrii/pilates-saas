import test from 'node:test';
import assert from 'node:assert/strict';
import { firmaCompleta } from './consentimiento-regla.ts';

// Estos tests defienden un requisito LEGAL, no una preferencia de UI: la
// migración 0109 puso un CHECK en `socios.aceptacion_origen` citando el art.
// 7.1 del RGPD, y la vía pública escribía fecha/firma/versión dejando el origen
// a NULL. Si `firmaCompleta` se relaja, vuelven a crearse socias sin
// consentimiento demostrable y el CHECK no lo impide (NULL pasa el check).

const buena = { fecha: '2026-09-03T10:00:00.000Z', firma: 'Carmen López', versionTexto: 'Términos v1…' };

test('firmaCompleta acepta una firma con los tres campos', () => {
  assert.equal(firmaCompleta(buena), true);
});

test('firmaCompleta rechaza que falte cualquiera de los tres', () => {
  for (const campo of ['fecha', 'firma', 'versionTexto'] as const) {
    const sin = { ...buena };
    delete (sin as Record<string, unknown>)[campo];
    assert.equal(firmaCompleta(sin), false, `sin ${campo} debería rechazarse`);
  }
});

test('firmaCompleta rechaza ausencia total', () => {
  assert.equal(firmaCompleta(null), false);
  assert.equal(firmaCompleta(undefined), false);
  assert.equal(firmaCompleta({}), false);
});

test('firmaCompleta rechaza cadena vacía y solo espacios', () => {
  // Una firma de espacios pasa cualquier `!!v` y no identifica a nadie: es la
  // forma más fácil de acabar con una traza que parece completa y no prueba nada.
  assert.equal(firmaCompleta({ ...buena, firma: '' }), false);
  assert.equal(firmaCompleta({ ...buena, firma: '   ' }), false);
  assert.equal(firmaCompleta({ ...buena, fecha: '\t\n' }), false);
  assert.equal(firmaCompleta({ ...buena, versionTexto: ' ' }), false);
});

test('firmaCompleta rechaza tipos que no son cadena', () => {
  // `sessionStorage` es manipulable y el body de la petición también: un 1 o un
  // objeto no pueden colarse como firma.
  assert.equal(firmaCompleta({ ...buena, firma: 1 }), false);
  assert.equal(firmaCompleta({ ...buena, firma: true }), false);
  assert.equal(firmaCompleta({ ...buena, versionTexto: {} }), false);
  assert.equal(firmaCompleta({ ...buena, fecha: [] }), false);
});
