import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  puedeMoverDinero, puedeVer, puedeVerFinanzas,
  puedeGestionarClientas, puedeGestionarEquipo, rolesQuePuedeAsignar,
} from './permisos-reglas.ts';

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

test('el manager NO mueve dinero — es la mitad de su definición', () => {
  // La lista es blanca a propósito: lo que no está, no puede. Cuando se añadió
  // MANAGER al enum, este test ya estaba escrito y no hizo falta tocar nada.
  assert.equal(puedeMoverDinero('MANAGER'), false);
  assert.equal(puedeVerFinanzas('MANAGER'), false);
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

// ── El rol de quien lleva una sede ──────────────────────────────────────────
// Una cadena de dos sedes no tenía dónde meter a esa persona: o cuenta de
// propietaria (y ve la facturación de todo el negocio) o recepción (y no puede
// ni dar de alta a una instructora).

test('el manager lleva su sede: horario, clientas, equipo, sustituciones', () => {
  for (const ruta of ['/calendario', '/clientas', '/citas', '/equipo', '/sustituciones', '/dashboard']) {
    assert.equal(puedeVer('MANAGER', ruta), true, ruta);
  }
  assert.equal(puedeGestionarClientas('MANAGER'), true);
  assert.equal(puedeGestionarEquipo('MANAGER'), true);
});

test('el manager no ve el negocio: ni cobros, ni informes, ni ajustes', () => {
  for (const ruta of ['/transacciones', '/informes', '/configuracion', '/marketing', '/centro-de-control']) {
    assert.equal(puedeVer('MANAGER', ruta), false, ruta);
  }
});

test('recepción sigue viendo cobros y el manager no: es la diferencia', () => {
  // No es un descuido que recepción tenga MÁS acceso en un sitio: cobra en
  // mostrador. El manager gestiona, no cobra.
  assert.equal(puedeVer('RECEPCION', '/transacciones'), true);
  assert.equal(puedeVer('MANAGER', '/transacciones'), false);
  // Y al revés con el equipo.
  assert.equal(puedeVer('RECEPCION', '/equipo'), false);
  assert.equal(puedeVer('MANAGER', '/equipo'), true);
});

test('un manager NO puede repartir su propio nivel ni el de propietaria', () => {
  // El permiso de dar de alta gente es el que se puede usar para darse permisos.
  // Esta lista es el espejo en UI de la policy de la migración 0108.
  const puede = rolesQuePuedeAsignar('MANAGER');
  assert.deepEqual(puede, ['RECEPCION', 'INSTRUCTOR']);
  assert.equal(puede.includes('PROPIETARIO'), false, 'no se asciende a dueña');
  assert.equal(puede.includes('MANAGER'), false, 'no se clona');
});

test('la propietaria reparte todo, incluido el rol nuevo', () => {
  assert.deepEqual(rolesQuePuedeAsignar('PROPIETARIO'), ['PROPIETARIO', 'MANAGER', 'RECEPCION', 'INSTRUCTOR']);
});

test('quien no gestiona equipo no reparte nada', () => {
  assert.deepEqual(rolesQuePuedeAsignar('RECEPCION'), []);
  assert.deepEqual(rolesQuePuedeAsignar('INSTRUCTOR'), []);
});

test('gestionar clientas: el manager sí, la instructora no', () => {
  assert.equal(puedeGestionarClientas('MANAGER'), true);
  assert.equal(puedeGestionarClientas('RECEPCION'), true);
  assert.equal(puedeGestionarClientas('INSTRUCTOR'), false);
});

test('gestionar equipo: ni recepción ni instructoras', () => {
  assert.equal(puedeGestionarEquipo('RECEPCION'), false);
  assert.equal(puedeGestionarEquipo('INSTRUCTOR'), false);
});
