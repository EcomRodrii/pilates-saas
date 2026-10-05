import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ACCION_IOS, CATEGORIA_IOS, accionDeBotonIos, categoriaIos, slugDeRuta } from './acciones-ios.ts';
import { payloadApns } from './apns.ts';

const swift = readFileSync(join(process.cwd(), 'ios/App/App/AppDelegate.swift'), 'utf8');

test('la app nativa registra EXACTAMENTE las categorías y botones que manda el servidor', () => {
  for (const id of Object.values(CATEGORIA_IOS)) assert.match(swift, new RegExp(`UNNotificationCategory\\(identifier: "${id}"`), id);
  for (const id of Object.values(ACCION_IOS)) assert.match(swift, new RegExp(`UNNotificationAction\\(identifier: "${id}"`), id);
  assert.match(swift, /setNotificationCategories\(\[oferta, recordatorio\]\)/);
});

test('todo botón que hace algo ABRE la app: nada se acepta ni se cancela desde el aviso', () => {
  for (const id of [ACCION_IOS.aceptarPlaza, ACCION_IOS.noGracias, ACCION_IOS.noPuedoIr]) {
    assert.match(swift, new RegExp(`identifier: "${id}"[^\\n]*options: \\[\\.foreground\\]`), id);
  }
  assert.doesNotMatch(swift, /\.authenticationRequired|\.destructive\]/, 'sin acciones en segundo plano');
});

test('qué aviso lleva botones', () => {
  assert.equal(categoriaIos('reserva.oferta_lista_espera'), 'OFERTA_ESPERA');
  assert.equal(categoriaIos('reserva.recordatorio_24h'), 'RECORDATORIO_CLASE');
  assert.equal(categoriaIos('reserva.recordatorio_1h'), 'RECORDATORIO_CLASE');
  assert.equal(categoriaIos('reserva.confirmada'), null);
  assert.equal(categoriaIos(undefined), null);
});

test('el aviso a APNs lleva la categoría y la clase solo cuando tiene botones', () => {
  const oferta = JSON.parse(payloadApns(JSON.stringify({ title: 'Se ha liberado una plaza', body: 'x', url: '/portal/alma/mis-reservas', nid: 'n1', ev: 'reserva.oferta_lista_espera', sid: 'ses-1' })));
  assert.equal(oferta.aps.category, 'OFERTA_ESPERA');
  assert.equal(oferta.ev, 'reserva.oferta_lista_espera');
  assert.equal(oferta.sid, 'ses-1');
  const otro = JSON.parse(payloadApns(JSON.stringify({ title: 'Pago', body: 'x', url: '/', nid: 'n2', ev: 'pago.realizado', sid: null })));
  assert.equal(otro.aps.category, undefined);
  assert.equal(otro.ev, undefined);
});

test('el canal PUSH manda el evento y la clase (ids, nunca datos de la persona)', () => {
  const canal = readFileSync(join(process.cwd(), 'lib/notifications/channels.ts'), 'utf8');
  assert.match(canal, /ev: notificacion\.eventType,/);
  assert.match(canal, /sid: notificacion\.resourceType === 'sesion' \? notificacion\.resourceId : null,/);
});

test('«Aceptar la plaza» lleva a Mis clases de ESE estudio con la orden para la clase del aviso', () => {
  const r = accionDeBotonIos('aceptar-plaza', { ev: 'reserva.oferta_lista_espera', sid: 'ses-1', url: '/portal/alma/mis-reservas' });
  assert.deepEqual(r, { ruta: '/portal/alma/mis-reservas', pendiente: { tipo: 'aceptar-oferta', sesionId: 'ses-1', slug: 'alma' } });
  assert.deepEqual(accionDeBotonIos('no-gracias', { ev: 'reserva.oferta_lista_espera', sid: 'ses-1', url: '/portal/alma/mis-reservas' }),
    { ruta: '/portal/alma/mis-reservas', pendiente: { tipo: 'salir-espera', sesionId: 'ses-1', slug: 'alma' } });
});

test('«No puedo ir» del recordatorio deja la orden (que abre la confirmación), «Voy» no hace nada', () => {
  const datos = { ev: 'reserva.recordatorio_24h', sid: 'ses-9', url: '/portal/alma/reservar/ses-9' };
  assert.deepEqual(accionDeBotonIos('no-puedo-ir', datos), { ruta: '/portal/alma/mis-reservas', pendiente: { tipo: 'no-puedo-ir', sesionId: 'ses-9', slug: 'alma' } });
  assert.deepEqual(accionDeBotonIos('voy', datos), { nada: true });
});

test('un toque normal, un botón que no casa con su aviso o sin datos: lo de siempre (abrir el aviso)', () => {
  const oferta = { ev: 'reserva.oferta_lista_espera', sid: 'ses-1', url: '/portal/alma/mis-reservas' };
  assert.equal(accionDeBotonIos('tap', oferta), null);
  assert.equal(accionDeBotonIos(undefined, oferta), null);
  assert.equal(accionDeBotonIos('no-puedo-ir', oferta), null);
  assert.equal(accionDeBotonIos('aceptar-plaza', { ev: 'reserva.recordatorio_24h', sid: 'ses-1', url: '/portal/alma/x' }), null);
  assert.equal(accionDeBotonIos('aceptar-plaza', { ...oferta, sid: undefined }), null);
  assert.equal(accionDeBotonIos('aceptar-plaza', { ...oferta, url: 'https://otro.example/portal/alma/x' }), null);
});

test('el estudio sale de una ruta de la app, nunca de otra cosa', () => {
  assert.equal(slugDeRuta('/portal/alma/mis-reservas'), 'alma');
  assert.equal(slugDeRuta('/portal/estudio-alma'), 'estudio-alma');
  assert.equal(slugDeRuta('/dashboard'), null);
  assert.equal(slugDeRuta('/portal/../x'), null);
  assert.equal(slugDeRuta(42), null);
});
