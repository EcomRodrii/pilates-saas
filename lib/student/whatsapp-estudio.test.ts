import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enlaceWhatsAppEstudio } from './whatsapp-estudio.ts';

test('un móvil español sin prefijo lleva el +34 y el mensaje prerrellenado', () => {
  const url = enlaceWhatsAppEstudio('612 34 56 78');
  assert.equal(url, 'https://wa.me/34612345678?text=Hola%2C%20quer%C3%ADa%20reservar%20o%20cancelar%20una%20clase.');
});

test('un móvil con prefijo y espacios se normaliza', () => {
  assert.match(enlaceWhatsAppEstudio('+34 712 345 678')!, /^https:\/\/wa\.me\/34712345678\?/);
});

test('un fijo español no da botón: a un fijo wa.me no lleva a ningún chat', () => {
  assert.equal(enlaceWhatsAppEstudio('950 12 34 56'), null);
  assert.equal(enlaceWhatsAppEstudio('+34 910 123 456'), null);
});

test('sin teléfono o con basura no hay enlace', () => {
  assert.equal(enlaceWhatsAppEstudio(null), null);
  assert.equal(enlaceWhatsAppEstudio(''), null);
  assert.equal(enlaceWhatsAppEstudio('sin teléfono'), null);
  assert.equal(enlaceWhatsAppEstudio('123'), null);
});

test('un número de otro país con prefijo pasa tal cual', () => {
  assert.match(enlaceWhatsAppEstudio('+52 55 1234 5678')!, /^https:\/\/wa\.me\/525512345678\?/);
});
