import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enlaceInvitacionWhatsApp, mensajeInvitacionWhatsApp, type DatosAvisoWhatsApp } from './invitacion-whatsapp.ts';

const base: DatosAvisoWhatsApp = {
  nombre: 'Laura Gómez', rol: 'INSTRUCTOR', activo: true, email: 'laura.gomez@example.com', telefono: '612 34 56 78',
  estudio: 'Estudio Aurora', urlApp: 'https://www.tentare.app/portal/aurora/acceso/elegir', invitacionEnviada: false,
};

test('a una instructora: la app del estudio y qué pulsar, con el correo tapado', () => {
  const m = mensajeInvitacionWhatsApp(base)!;
  assert.match(m, /^Hola Laura, te he dado acceso a Estudio Aurora en Tentare\./);
  assert.match(m, /«Como instructora»: https:\/\/www\.tentare\.app\/portal\/aurora\/acceso\/elegir$/);
  assert.match(m, /la•••@example\.com/);
  assert.doesNotMatch(m, /laura\.gomez@/, 'el correo entero no viaja');
});

test('NUNCA lleva el enlace de invitación ni ningún token', () => {
  for (const rol of ['INSTRUCTOR', 'MANAGER', 'RECEPCION']) {
    const href = enlaceInvitacionWhatsApp({ ...base, rol, invitacionEnviada: true })!;
    assert.doesNotMatch(href, /token|invitacion%3F|\/invitacion/i);
  }
});

test('el teléfono español lleva el +34 (sin él, wa.me lo leía como Australia); sin teléfono, que elija el chat', () => {
  assert.match(enlaceInvitacionWhatsApp(base)!, /^https:\/\/wa\.me\/34612345678\?text=/);
  assert.match(enlaceInvitacionWhatsApp({ ...base, telefono: null })!, /^https:\/\/wa\.me\/\?text=Hola%20Laura/);
});

test('gerencia y recepción: solo «mira tu correo», y solo si se le acaba de mandar', () => {
  assert.equal(mensajeInvitacionWhatsApp({ ...base, rol: 'MANAGER' }), null, 'sin invitación enviada, mentiría');
  const m = mensajeInvitacionWhatsApp({ ...base, rol: 'RECEPCION', invitacionEnviada: true })!;
  assert.match(m, /te acabo de mandar a la•••@example\.com la invitación para entrar en Estudio Aurora/);
  assert.doesNotMatch(m, /https?:\/\//, 'ni un enlace');
});

test('sin correo en la ficha, o con la ficha inactiva, no hay acceso que avisar', () => {
  assert.equal(mensajeInvitacionWhatsApp({ ...base, email: '' }), null);
  assert.equal(enlaceInvitacionWhatsApp({ ...base, email: null }), null);
  assert.equal(mensajeInvitacionWhatsApp({ ...base, activo: false }), null, 'la puerta de la app exige la ficha activa');
  assert.equal(mensajeInvitacionWhatsApp({ ...base, email: 'laura.gomez' }), null, 'sin «@» viajaría entero y no vale para entrar');
});

test('un nombre o un estudio con caracteres raros viaja codificado en el enlace', () => {
  const href = enlaceInvitacionWhatsApp({ ...base, nombre: 'Ana & Co?', estudio: 'Pilates #1 & más' })!;
  const [, query] = href.split('?');
  assert.ok(query.startsWith('text='));
  assert.equal(query.split('&').length, 1, 'un «&» del nombre no parte la query');
  assert.match(decodeURIComponent(query.slice(5)), /Hola Ana, te he dado acceso a Pilates #1 & más/);
});
