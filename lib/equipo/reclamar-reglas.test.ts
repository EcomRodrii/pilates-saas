import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motivoNoReclamable } from './reclamar-reglas.ts';

const LIBRE = { activo: true, authUserId: null };

// El agujero que se cerró antes de salir: sin enlace firmado bastaba con montar
// un estudio (alta pública y gratuita), crear una ficha con el correo de otra
// persona y esperar a que entrase. Estos tests fijan que el permiso se decide
// por la ficha y por quién invitó, nunca por el email a secas — el endpoint ni
// siquiera busca por email.

test('una ficha de propietaria no se reclama ni con enlace válido', () => {
  assert.equal(
    motivoNoReclamable({ ...LIBRE, rol: 'PROPIETARIO' }, 'u1', 'PROPIETARIO'),
    'ROL_NO_AUTORECLAMABLE',
  );
});

test('la propietaria puede activar cualquier otro rol', () => {
  for (const rol of ['INSTRUCTOR', 'RECEPCION', 'MANAGER'] as const) {
    assert.equal(motivoNoReclamable({ ...LIBRE, rol }, 'u1', 'PROPIETARIO'), null, rol);
  }
});

// Un MANAGER puede dar de alta a su recepcionista, pero no activarle el acceso:
// RECEPCION mueve dinero y él no. Si no, se fabrica una ficha de recepción con
// un segundo correo suyo, se manda la invitación y acaba cobrando.
test('un manager no activa un acceso que mueve dinero', () => {
  assert.equal(
    motivoNoReclamable({ ...LIBRE, rol: 'RECEPCION' }, 'u1', 'MANAGER'),
    'ROL_POR_ENCIMA_DE_QUIEN_INVITA',
  );
  // Lo que sí está a su altura pasa sin problema.
  assert.equal(motivoNoReclamable({ ...LIBRE, rol: 'INSTRUCTOR' }, 'u1', 'MANAGER'), null);
  assert.equal(motivoNoReclamable({ ...LIBRE, rol: 'MANAGER' }, 'u1', 'MANAGER'), null);
});

// Enlaces emitidos antes de que se firmara quién invitaba. La duda no se
// resuelve a favor de dar más permisos.
test('sin constancia de quién invitó, no se abre el acceso al dinero', () => {
  assert.equal(
    motivoNoReclamable({ ...LIBRE, rol: 'RECEPCION' }, 'u1', null),
    'ROL_POR_ENCIMA_DE_QUIEN_INVITA',
  );
  assert.equal(motivoNoReclamable({ ...LIBRE, rol: 'INSTRUCTOR' }, 'u1', null), null);
});

test('una ficha dada de baja no se reclama', () => {
  assert.equal(
    motivoNoReclamable({ rol: 'INSTRUCTOR', activo: false, authUserId: null }, 'u1', 'PROPIETARIO'),
    'FICHA_INACTIVA',
  );
});

// Mismo criterio que el coalesce(activo, true) de la 0125: solo una baja
// explícita revoca. Un nulo accidental no debe dejar fuera a nadie.
test('activo nulo cuenta como activa', () => {
  assert.equal(
    motivoNoReclamable({ rol: 'INSTRUCTOR', activo: null, authUserId: null }, 'u1', 'PROPIETARIO'),
    null,
  );
});

test('la ficha de otra cuenta no se roba', () => {
  assert.equal(
    motivoNoReclamable({ rol: 'INSTRUCTOR', activo: true, authUserId: 'otra' }, 'u1', 'PROPIETARIO'),
    'YA_ES_DE_OTRA_CUENTA',
  );
});

// El mismo enlace puede abrirse dos veces (un reenvío, un doble clic). La
// segunda vez no es un error en la cara de la instructora.
test('repetirlo sobre la propia ficha ya vinculada no es un rechazo', () => {
  assert.equal(
    motivoNoReclamable({ rol: 'INSTRUCTOR', activo: true, authUserId: 'u1' }, 'u1', 'PROPIETARIO'),
    null,
  );
});
