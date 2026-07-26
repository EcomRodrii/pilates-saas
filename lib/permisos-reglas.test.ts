import { test } from 'node:test';
import assert from 'node:assert/strict';
import { puedeMoverDinero, puedeVer } from './permisos-reglas.ts';

// La separación de roles vivía en el menú, no en la base de datos: la RLS de
// `recibos`/`suscripciones`/`ventas_pos` era `studio_id = current_studio_id()`
// para TODO el personal. Probado en vivo contra producción antes de la 0107:
// la instructora de `studio-1` podía escribir los 22 recibos del estudio.
//
// Estas reglas son la barrera de UI. Su único trabajo es no enseñar un botón
// que la base de datos va a rechazar; la cerradura está en la migración 0107 y
// las dos tienen que decir exactamente lo mismo.

test('recepción SÍ mueve dinero: cobra en mostrador y vende bonos', () => {
  assert.equal(puedeMoverDinero('RECEPCION'), true);
});

test('la propietaria mueve dinero', () => {
  assert.equal(puedeMoverDinero('PROPIETARIO'), true);
});

test('la instructora NO mueve dinero', () => {
  // El caso que motivó todo: 18 instructoras con login en una cadena.
  assert.equal(puedeMoverDinero('INSTRUCTOR'), false);
});

test('un rol nuevo no hereda permiso de dinero por descuido', () => {
  // Si algún día se añade MANAGER al enum y a nadie se le ocurre tocarlo aquí,
  // que entre SIN acceso a la facturación en vez de con él. La lista es blanca
  // a propósito: lo que no está, no puede.
  assert.equal(puedeMoverDinero('MANAGER' as never), false);
});

// Ahora que las reglas son puras, el resto del modelo de roles también se puede
// atar. Estas eran las que ya existían sin una sola prueba.

test('una instructora no llega a la facturación ni a los informes', () => {
  for (const ruta of ['/transacciones', '/informes', '/configuracion', '/equipo']) {
    assert.equal(puedeVer('INSTRUCTOR', ruta), false, ruta);
  }
});

test('una instructora sí llega a su trabajo', () => {
  for (const ruta of ['/calendario', '/clientas', '/citas', '/dashboard']) {
    assert.equal(puedeVer('INSTRUCTOR', ruta), true, ruta);
  }
});

test('recepción hace lo operativo pero no toca el negocio', () => {
  assert.equal(puedeVer('RECEPCION', '/transacciones'), true, 'cobra en mostrador');
  assert.equal(puedeVer('RECEPCION', '/clientas'), true);
  assert.equal(puedeVer('RECEPCION', '/configuracion'), false);
  assert.equal(puedeVer('RECEPCION', '/informes'), false);
  assert.equal(puedeVer('RECEPCION', '/equipo'), false);
});

test('ni siquiera la propietaria ve un módulo congelado', () => {
  // El feature-freeze manda sobre el rol: si no, reactivar por accidente un
  // módulo se lo enseñaría solo a ella y nadie lo notaría.
  assert.equal(puedeVer('PROPIETARIO', '/pos'), false);
  assert.equal(puedeVer('PROPIETARIO', '/kiosk'), false);
});

test('una subruta hereda el bloqueo de su prefijo', () => {
  assert.equal(puedeVer('INSTRUCTOR', '/configuracion/planes'), false);
  assert.equal(puedeVer('RECEPCION', '/equipo/invitar'), false);
});
