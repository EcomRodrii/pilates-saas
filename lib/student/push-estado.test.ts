import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoPush, textoPush, type ContextoPush } from './push-estado.ts';

const base: ContextoPush = { permiso: 'default', esIOS: false, esStandalone: false, hayClave: true, suscrita: false };

test('iPhone en Safari SIN instalar → pide instalar, aunque el navegador diga unsupported', () => {
  // iOS sin PWA no expone PushManager: llegaría como `unsupported`. Decir «tu
  // navegador no admite push» a quien puede arreglarlo en dos toques es
  // rendirse antes de tiempo. iOS se comprueba ANTES.
  const e = estadoPush({ ...base, permiso: 'unsupported', esIOS: true, esStandalone: false });
  assert.equal(e, 'ios-sin-instalar');
  assert.match(textoPush(e).cuerpo, /Añadir a pantalla de inicio/);
  assert.equal(textoPush(e).accion, null);
});

test('iPhone INSTALADO se trata como cualquier navegador', () => {
  assert.equal(estadoPush({ ...base, esIOS: true, esStandalone: true }), 'default');
  assert.equal(estadoPush({ ...base, esIOS: true, esStandalone: true, permiso: 'granted', suscrita: true }), 'granted-on');
});

test('permiso bloqueado → sin acción posible desde la app, y se dice dónde arreglarlo', () => {
  const e = estadoPush({ ...base, permiso: 'denied' });
  assert.equal(e, 'denied');
  const t = textoPush(e);
  assert.equal(t.accion, null);
  assert.equal(t.encendido, false);
  assert.match(t.cuerpo, /ajustes del navegador/);
});

test('sin clave VAPID → es cosa del servidor, no de la alumna, y no hay botón', () => {
  const t = textoPush(estadoPush({ ...base, hayClave: false }));
  assert.equal(t.accion, null);
  assert.match(t.cuerpo, /No es cosa tuya/);
});

test('sin clave gana sobre «default»: no se ofrece activar algo que fallaría', () => {
  assert.equal(estadoPush({ ...base, permiso: 'default', hayClave: false }), 'sin-clave');
});

test('permiso dado pero sin suscripción en este dispositivo → ofrece activar', () => {
  const e = estadoPush({ ...base, permiso: 'granted', suscrita: false });
  assert.equal(e, 'granted-off');
  assert.equal(textoPush(e).accion, 'activar');
  assert.equal(textoPush(e).encendido, false);
});

test('suscrita → interruptor encendido y ofrece desactivar', () => {
  const e = estadoPush({ ...base, permiso: 'granted', suscrita: true });
  assert.equal(e, 'granted-on');
  assert.equal(textoPush(e).accion, 'desactivar');
  assert.equal(textoPush(e).encendido, true);
});

test('navegador sin soporte (no iOS) → sin acción', () => {
  const e = estadoPush({ ...base, permiso: 'unsupported' });
  assert.equal(e, 'unsupported');
  assert.equal(textoPush(e).accion, null);
});

test('todo estado tiene título y cuerpo no vacíos', () => {
  const estados = ['unsupported', 'ios-sin-instalar', 'denied', 'sin-clave', 'default', 'granted-off', 'granted-on'] as const;
  for (const e of estados) {
    const t = textoPush(e);
    assert.ok(t.titulo.length > 0, e);
    assert.ok(t.cuerpo.length > 0, e);
  }
});
