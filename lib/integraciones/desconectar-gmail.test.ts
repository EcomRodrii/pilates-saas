import { test } from 'node:test';
import assert from 'node:assert/strict';
import { revocarGmailEnGoogle } from './desconectar-gmail.ts';

test('sin Calendar conectado, desconectar Gmail revoca el permiso en Google', () => {
  assert.equal(revocarGmailEnGoogle({ gmailEmail: 'estudio@example.com', calendarConectado: false, calendarEmail: null }), true);
});

test('con Calendar en la misma cuenta no se revoca: Google le quitaría también Calendar', () => {
  assert.equal(revocarGmailEnGoogle({ gmailEmail: 'estudio@example.com', calendarConectado: true, calendarEmail: 'estudio@example.com' }), false);
  // La misma cuenta escrita distinto sigue siendo la misma cuenta.
  assert.equal(revocarGmailEnGoogle({ gmailEmail: 'Estudio@Example.com ', calendarConectado: true, calendarEmail: 'estudio@example.com' }), false);
});

test('con Calendar en otra cuenta, revocar la de Gmail no le afecta', () => {
  assert.equal(revocarGmailEnGoogle({ gmailEmail: 'estudio@example.com', calendarConectado: true, calendarEmail: 'agenda@example.com' }), true);
});

test('con Calendar conectado y sin saber de qué cuenta es alguno, no se arriesga', () => {
  assert.equal(revocarGmailEnGoogle({ gmailEmail: null, calendarConectado: true, calendarEmail: 'estudio@example.com' }), false);
  assert.equal(revocarGmailEnGoogle({ gmailEmail: 'estudio@example.com', calendarConectado: true, calendarEmail: null }), false);
});
