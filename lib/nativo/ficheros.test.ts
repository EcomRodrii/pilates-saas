import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bytesABase64, nombreDeFicheroSeguro } from './ficheros.ts';

test('nombreDeFicheroSeguro: añade la extensión que pide el tipo, sin duplicarla', () => {
  assert.equal(nombreDeFicheroSeguro('Pilates martes', 'text/calendar;charset=utf-8'), 'Pilates martes.ics');
  assert.equal(nombreDeFicheroSeguro('clase.ics', 'text/calendar'), 'clase.ics');
  assert.equal(nombreDeFicheroSeguro('Factura 12', 'application/pdf'), 'Factura 12.pdf');
  assert.equal(nombreDeFicheroSeguro('FACTURA.PDF', 'application/pdf'), 'FACTURA.PDF');
  assert.equal(nombreDeFicheroSeguro('notas', 'application/x-desconocido'), 'notas');
});

test('nombreDeFicheroSeguro: nada de carpetas ni nombres ocultos', () => {
  const n = nombreDeFicheroSeguro('../../Library/Preferences/x.plist');
  assert.ok(!n.includes('/'), n);
  assert.ok(!n.startsWith('.'), n);
  assert.equal(nombreDeFicheroSeguro('a\\b:c*d?e"f<g>h|i'), 'a-b-c-d-e-f-g-h-i');
  assert.equal(nombreDeFicheroSeguro('.oculto'), 'oculto');
  assert.equal(nombreDeFicheroSeguro('con\u0000control\u001f'), 'concontrol');
});

test('nombreDeFicheroSeguro: si no queda nada, «archivo»; y nunca más de 120 + extensión', () => {
  assert.equal(nombreDeFicheroSeguro('', 'application/pdf'), 'archivo.pdf');
  assert.equal(nombreDeFicheroSeguro('...'), 'archivo');
  assert.equal(nombreDeFicheroSeguro('x'.repeat(500), 'application/pdf').length, 124);
});

test('bytesABase64: igual que Buffer, también con ficheros grandes (sin reventar la pila)', () => {
  const pequeno = new TextEncoder().encode('BEGIN:VCALENDAR');
  assert.equal(bytesABase64(pequeno), Buffer.from(pequeno).toString('base64'));
  const grande = new Uint8Array(1_000_003).map((_, i) => i % 251);
  assert.equal(bytesABase64(grande), Buffer.from(grande).toString('base64'));
  assert.equal(bytesABase64(new Uint8Array()), '');
});
