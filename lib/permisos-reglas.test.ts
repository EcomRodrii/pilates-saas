import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  puedeMoverDinero, puedeVer, puedeVerFinanzas,
  puedeGestionarClientas, puedeGestionarEquipo, rolesQuePuedeAsignar,
} from './permisos-reglas.ts';

// La separación de roles vivía en el menú, no en la base de datos: la RLS de
// `recibos`/`suscripciones`/`ventas_pos` era `studio_id = current_studio_id()`
// para TODO el personal. Probado en vivo contra producción antes de la 0112:
// la instructora de `studio-1` podía escribir los 22 recibos del estudio.
//
// Estas reglas son la barrera de UI. Su único trabajo es no enseñar un botón
// que la base de datos va a rechazar; la cerradura está en la migración 0112 y
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

// Este test existe porque el anterior daba falsa tranquilidad: comprobaba
// '/transacciones', que desde que las pantallas del dinero se consolidaron es
// solo un redirect a /cobros. La pantalla REAL estaba abierta al manager, y en
// el menú lateral. Comprobar el alias y no el destino es el fallo que hay que
// no repetir, así que aquí se nombran las rutas de verdad.
test('el manager no llega a la pantalla real del dinero, no solo a su alias', () => {
  for (const ruta of ['/cobros', '/cierre']) {
    assert.equal(puedeVer('MANAGER', ruta), false, ruta);
  }
  // Y los alias que redirigen ahí tampoco, o se cuela por la puerta de atrás.
  for (const ruta of ['/transacciones', '/facturas', '/pagos']) {
    assert.equal(puedeVer('MANAGER', ruta), false, ruta);
  }
  // Las subrutas también: coincide() es por prefijo, que no se escape un detalle.
  assert.equal(puedeVer('MANAGER', '/cobros/movimientos'), false);
});

test('recepción sigue viendo cobros y el manager no: es la diferencia', () => {
  // No es un descuido que recepción tenga MÁS acceso en un sitio: cobra en
  // mostrador. El manager gestiona, no cobra.
  assert.equal(puedeVer('RECEPCION', '/transacciones'), true);
  assert.equal(puedeVer('RECEPCION', '/cobros'), true);
  assert.equal(puedeVer('MANAGER', '/transacciones'), false);
  assert.equal(puedeVer('MANAGER', '/cobros'), false);
  // Y al revés con el equipo.
  assert.equal(puedeVer('RECEPCION', '/equipo'), false);
  assert.equal(puedeVer('MANAGER', '/equipo'), true);
});

test('un manager NO puede repartir su propio nivel ni el de propietaria', () => {
  // El permiso de dar de alta gente es el que se puede usar para darse permisos.
  // Esta lista es el espejo en UI de la policy de la migración 0113.
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

// ── Importar: la lista blanca por prefijo abría de más ────────────────────────
// '/clientas' permitido implicaba '/clientas/importar' permitido. Seis pantallas
// de importación quedaban a la vista de la instructora, que además es de quien
// más se fía el estudio para NO tocar el alta masiva.

test('la instructora no llega a ninguna pantalla de importación', () => {
  assert.equal(puedeVer('INSTRUCTOR', '/clientas/importar'), false);
  assert.equal(puedeVer('INSTRUCTOR', '/clientas/importar/membresias'), false);
  assert.equal(puedeVer('INSTRUCTOR', '/clientas/importar/plazas-fijas'), false);
  assert.equal(puedeVer('INSTRUCTOR', '/citas/importar'), false);
  assert.equal(puedeVer('INSTRUCTOR', '/calendario/importar'), false);
  assert.equal(puedeVer('INSTRUCTOR', '/calendario/importar/reservas'), false);
});

test('bloquear la importación no le quita a la instructora su trabajo', () => {
  assert.equal(puedeVer('INSTRUCTOR', '/clientas'), true);
  assert.equal(puedeVer('INSTRUCTOR', '/clientas/abc-123'), true);
  assert.equal(puedeVer('INSTRUCTOR', '/citas'), true);
  assert.equal(puedeVer('INSTRUCTOR', '/calendario'), true);
});

test('recepción y propietaria sí importan: es trabajo de mostrador', () => {
  for (const rol of ['PROPIETARIO', 'RECEPCION'] as const) {
    assert.equal(puedeVer(rol, '/clientas/importar'), true, rol);
    assert.equal(puedeVer(rol, '/clientas/importar/membresias'), true, rol);
    assert.equal(puedeVer(rol, '/calendario/importar'), true, rol);
  }
});

test('el manager importa clientas pero no bonos: los bonos son dinero', () => {
  assert.equal(puedeVer('MANAGER', '/clientas/importar'), true);
  assert.equal(puedeVer('MANAGER', '/clientas/importar/plazas-fijas'), true);
  assert.equal(puedeVer('MANAGER', '/citas/importar'), true);
  assert.equal(puedeVer('MANAGER', '/calendario/importar'), true);
  assert.equal(puedeVer('MANAGER', '/clientas/importar/membresias'), false);
});

// ── Espejo de la RLS: cada helper de UI contra la función que decide de verdad ─
// Endurecer la interfaz de más es tan bug como ablandarla: esconde trabajo que
// la persona SÍ puede hacer, y encima parece que el programa está roto. Pasó con
// las citas — se gatearon con `puedeMoverDinero` cuando su RLS pide
// `puede_gestionar_clientas()`, y el manager perdió el estado de cobro.
//
// La tabla es la lista de correspondencias UI↔RLS que hay que mantener a mano.
// Si cambias una policy, cambia aquí también o el desajuste vuelve en silencio.
test('los helpers de UI reparten igual que las funciones de la RLS', () => {
  const ROLES = ['PROPIETARIO', 'MANAGER', 'RECEPCION', 'INSTRUCTOR'] as const;

  // tabla → (helper de UI, quién dice que sí en la RLS)
  const ESPEJO = [
    // citas.*        → puede_gestionar_clientas()
    { tabla: 'citas', helper: puedeGestionarClientas, rls: ['PROPIETARIO', 'RECEPCION', 'MANAGER'] },
    // socios.*       → puede_gestionar_clientas()
    { tabla: 'socios', helper: puedeGestionarClientas, rls: ['PROPIETARIO', 'RECEPCION', 'MANAGER'] },
    // recibos.*      → puede_mover_dinero()
    { tabla: 'recibos', helper: puedeMoverDinero, rls: ['PROPIETARIO', 'RECEPCION'] },
    // suscripciones.* → puede_mover_dinero()
    { tabla: 'suscripciones', helper: puedeMoverDinero, rls: ['PROPIETARIO', 'RECEPCION'] },
    // mandatos_sepa.* → puede_mover_dinero()
    { tabla: 'mandatos_sepa', helper: puedeMoverDinero, rls: ['PROPIETARIO', 'RECEPCION'] },
  ];

  for (const { tabla, helper, rls } of ESPEJO) {
    for (const rol of ROLES) {
      assert.equal(
        helper(rol), rls.includes(rol),
        `${tabla}: la UI y la RLS no dicen lo mismo para ${rol}`,
      );
    }
  }
});

// El lector de pases cuelga de /calendario A PROPÓSITO. La lista blanca se
// compara por prefijo, así que colgar de ahí se lo da a la instructora sin
// tocar los permisos — y es lo correcto: hoy ya marca asistencia a mano en la
// pestaña Asistentes, esto solo le ahorra buscar el nombre.
//
// Ese mismo mecanismo de prefijos ya coló seis pantallas de importación donde
// no debían, así que aquí queda escrito que esta herencia sí se quiere.
test('la instructora puede leer un pase de acceso', () => {
  assert.equal(puedeVer('INSTRUCTOR', '/calendario/pase'), true);
  assert.equal(puedeVer('RECEPCION', '/calendario/pase'), true);
  assert.equal(puedeVer('MANAGER', '/calendario/pase'), true);
  assert.equal(puedeVer('PROPIETARIO', '/calendario/pase'), true);
});
