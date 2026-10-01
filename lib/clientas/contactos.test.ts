import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asuntoDeContacto, contactoTrasElAviso, validarContacto } from './contactos.ts';

const AHORA = new Date('2026-10-01T10:00:00Z');

test('un contacto válido: canal obligatorio; resultado, nota y fecha opcionales', () => {
  const r = validarContacto({ canal: 'LLAMADA', resultado: 'SE_LO_PIENSA', nota: '  Vuelve el lunes  ' }, AHORA);
  assert.deepEqual(r, { ok: true, contacto: { canal: 'LLAMADA', resultado: 'SE_LO_PIENSA', nota: 'Vuelve el lunes', en: AHORA.toISOString() } });
  const minimo = validarContacto({ canal: 'WHATSAPP', resultado: '', nota: '   ' }, AHORA);
  assert.deepEqual(minimo, { ok: true, contacto: { canal: 'WHATSAPP', resultado: null, nota: null, en: AHORA.toISOString() } });
});

test('lo que no se acepta, con su motivo', () => {
  assert.equal(validarContacto({}, AHORA).ok, false);
  assert.equal(validarContacto({ canal: 'PALOMA' }, AHORA).ok, false);
  assert.equal(validarContacto({ canal: 'LLAMADA', resultado: 'QUIZAS' }, AHORA).ok, false);
  assert.equal(validarContacto({ canal: 'LLAMADA', nota: 'x'.repeat(1001) }, AHORA).ok, false);
  assert.equal(validarContacto({ canal: 'LLAMADA', nota: 42 }, AHORA).ok, false);
  assert.equal(validarContacto(null, AHORA).ok, false);
});

test('la fecha: hasta 7 días atrás, nunca en el futuro (2 minutos de margen por el reloj del móvil)', () => {
  const hace = (min: number) => new Date(AHORA.getTime() - min * 60_000).toISOString();
  assert.equal(validarContacto({ canal: 'LLAMADA', en: hace(60 * 24 * 7 - 1) }, AHORA).ok, true);
  assert.equal(validarContacto({ canal: 'LLAMADA', en: hace(60 * 24 * 7 + 1) }, AHORA).ok, false);
  assert.equal(validarContacto({ canal: 'LLAMADA', en: hace(-1) }, AHORA).ok, true);
  assert.equal(validarContacto({ canal: 'LLAMADA', en: hace(-5) }, AHORA).ok, false);
  assert.equal(validarContacto({ canal: 'LLAMADA', en: 'ayer' }, AHORA).ok, false);
});

test('el asunto con que se guarda', () => {
  assert.equal(asuntoDeContacto('LLAMADA', 'SE_LO_PIENSA'), 'Llamada · Se lo piensa');
  assert.equal(asuntoDeContacto('EN_PERSONA', null), 'En el estudio');
});

test('el aviso está atendido si se habló con ella después de que saltara', () => {
  const contactos = [{ en: '2026-09-30T18:00:00Z' }];
  assert.equal(contactoTrasElAviso(contactos, '2026-09-30T06:00:00Z', AHORA), true);
  assert.equal(contactoTrasElAviso(contactos, '2026-10-01T06:00:00Z', AHORA), false);
  // Sin fecha del aviso: vale un contacto de las dos últimas semanas.
  assert.equal(contactoTrasElAviso(contactos, null, AHORA), true);
  assert.equal(contactoTrasElAviso([{ en: '2026-09-01T10:00:00Z' }], null, AHORA), false);
});
