import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tipoEmisorPorNif, otorganteDeducido } from './alta-sencilla.ts';
import { erroresAutorizacion, MANDATO_VERSION } from './apoderamiento.ts';

test('tipoEmisorPorNif: DNI y NIE son persona física; A, B, C, D y F, sociedad; el resto, otra entidad', () => {
  assert.equal(tipoEmisorPorNif('48392017V'), 'persona_fisica');
  assert.equal(tipoEmisorPorNif('x1234567l'), 'persona_fisica');
  assert.equal(tipoEmisorPorNif('K1234567A'), 'persona_fisica');
  assert.equal(tipoEmisorPorNif('B12345674'), 'sociedad');
  assert.equal(tipoEmisorPorNif('A12345674'), 'sociedad');
  assert.equal(tipoEmisorPorNif('E12345674'), 'otra');
  assert.equal(tipoEmisorPorNif('J12345674'), 'otra');
  assert.equal(tipoEmisorPorNif(null), 'otra');
});

test('otorganteDeducido: la autónoma es la titular; en una sociedad se pregunta', () => {
  assert.deepEqual(
    otorganteDeducido({ tipoEmisor: 'persona_fisica', nombreFiscal: ' Carmen Ejemplo ', nif: '48392017v' }),
    { nombre: 'Carmen Ejemplo', nif: '48392017V', cargo: 'titular' },
  );
  assert.equal(otorganteDeducido({ tipoEmisor: 'sociedad', nombreFiscal: 'Studio SL', nif: 'B12345674' }), null);
  assert.equal(otorganteDeducido({ tipoEmisor: 'otra', nombreFiscal: 'Comunidad', nif: 'E12345674' }), null);
});

test('lo deducido para una autónoma pasa la validación del servidor con solo el CSV', () => {
  const otorgante = otorganteDeducido({ tipoEmisor: 'persona_fisica', nombreFiscal: 'Carmen Ejemplo', nif: '48392017V' })!;
  const errores = erroresAutorizacion({
    csv: 'ABCD1234EFGH5678', otorgadoEn: '2026-10-05', vigenteHasta: '2031-10-04', tramite: 'IZ860',
    otorgante, aceptaMandato: true, mandatoVersion: MANDATO_VERSION,
  }, { tipoEmisor: 'persona_fisica' }, new Date('2026-10-05T12:00:00Z'));
  assert.deepEqual(errores, []);
});
