import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoHttpDelRechazo, mismoCorreo, motivoNoReclamable, rolDelEnlace } from './reclamar-reglas.ts';

const CORREO = 'ana@example.com';
const LIBRE = { activo: true, authUserId: null, email: CORREO };
// El enlace de siempre: sin rol firmado (los de antes del 13-oct) y una cuenta con el correo de la ficha, verificado.
const ENLACE = { rolFirmado: null, cuenta: { email: CORREO, emailConfirmado: true } } as const;

// El agujero que se cerró antes de salir: sin enlace firmado bastaba con montar
// un estudio (alta pública y gratuita), crear una ficha con el correo de otra
// persona y esperar a que entrase. Estos tests fijan que el permiso se decide
// por la ficha y por quién invitó, nunca por el email a secas — el endpoint ni
// siquiera busca por email.

test('una ficha de propietaria no se reclama ni con enlace válido', () => {
  assert.equal(
    motivoNoReclamable({ ...LIBRE, rol: 'PROPIETARIO' }, 'u1', 'PROPIETARIO', ENLACE),
    'ROL_NO_AUTORECLAMABLE',
  );
});

test('la propietaria puede activar cualquier otro rol', () => {
  for (const rol of ['INSTRUCTOR', 'RECEPCION', 'MANAGER'] as const) {
    assert.equal(motivoNoReclamable({ ...LIBRE, rol }, 'u1', 'PROPIETARIO', ENLACE), null, rol);
  }
});

// Un MANAGER puede dar de alta a su recepcionista, pero no activarle el acceso:
// RECEPCION mueve dinero y él no. Si no, se fabrica una ficha de recepción con
// un segundo correo suyo, se manda la invitación y acaba cobrando.
test('un manager no activa un acceso que mueve dinero', () => {
  assert.equal(
    motivoNoReclamable({ ...LIBRE, rol: 'RECEPCION' }, 'u1', 'MANAGER', ENLACE),
    'ROL_POR_ENCIMA_DE_QUIEN_INVITA',
  );
  // Lo que sí está a su altura pasa sin problema.
  assert.equal(motivoNoReclamable({ ...LIBRE, rol: 'INSTRUCTOR' }, 'u1', 'MANAGER', ENLACE), null);
  assert.equal(motivoNoReclamable({ ...LIBRE, rol: 'MANAGER' }, 'u1', 'MANAGER', ENLACE), null);
});

// Enlaces emitidos antes de que se firmara quién invitaba. La duda no se
// resuelve a favor de dar más permisos.
test('sin constancia de quién invitó, no se abre el acceso al dinero', () => {
  assert.equal(
    motivoNoReclamable({ ...LIBRE, rol: 'RECEPCION' }, 'u1', null, ENLACE),
    'ROL_POR_ENCIMA_DE_QUIEN_INVITA',
  );
  assert.equal(motivoNoReclamable({ ...LIBRE, rol: 'INSTRUCTOR' }, 'u1', null, ENLACE), null);
});

test('una ficha dada de baja no se reclama', () => {
  assert.equal(
    motivoNoReclamable({ rol: 'INSTRUCTOR', activo: false, authUserId: null, email: CORREO }, 'u1', 'PROPIETARIO', ENLACE),
    'FICHA_INACTIVA',
  );
});

// Mismo criterio que el coalesce(activo, true) de la 0130: solo una baja
// explícita revoca. Un nulo accidental no debe dejar fuera a nadie.
test('activo nulo cuenta como activa', () => {
  assert.equal(
    motivoNoReclamable({ rol: 'INSTRUCTOR', activo: null, authUserId: null, email: CORREO }, 'u1', 'PROPIETARIO', ENLACE),
    null,
  );
});

test('la ficha de otra cuenta no se roba', () => {
  assert.equal(
    motivoNoReclamable({ rol: 'INSTRUCTOR', activo: true, authUserId: 'otra', email: CORREO }, 'u1', 'PROPIETARIO', ENLACE),
    'YA_ES_DE_OTRA_CUENTA',
  );
});

// El mismo enlace puede abrirse dos veces (un reenvío, un doble clic). La
// segunda vez no es un error en la cara de la instructora.
test('repetirlo sobre la propia ficha ya vinculada no es un rechazo', () => {
  assert.equal(
    motivoNoReclamable({ rol: 'INSTRUCTOR', activo: true, authUserId: 'u1', email: CORREO }, 'u1', 'PROPIETARIO', ENLACE),
    null,
  );
});

// ── El correo de la ficha (13-oct-2026, decisión del fundador) ───────────────
// Hacen falta el enlace Y una cuenta con el correo verificado de la ficha.

test('con otro correo, el enlace no vale aunque sea bueno', () => {
  assert.equal(
    motivoNoReclamable({ ...LIBRE, rol: 'RECEPCION' }, 'u1', 'PROPIETARIO', { rolFirmado: 'RECEPCION', cuenta: { email: 'otra@example.com', emailConfirmado: true } }),
    'CORREO_NO_COINCIDE',
  );
});

test('el correo se compara sin mayúsculas ni espacios alrededor', () => {
  assert.equal(
    motivoNoReclamable({ ...LIBRE, rol: 'INSTRUCTOR' }, 'u1', 'PROPIETARIO', { rolFirmado: null, cuenta: { email: '  Ana@Example.COM ', emailConfirmado: true } }),
    null,
  );
  assert.equal(mismoCorreo('ana@example.com', 'ANA@example.com'), true);
  // Un punto de más no es el mismo correo: no se adivinan alias.
  assert.equal(mismoCorreo('ana@example.com', 'a.na@example.com'), false);
});

test('una ficha sin correo, o una cuenta sin correo, no se reclama', () => {
  assert.equal(
    motivoNoReclamable({ ...LIBRE, rol: 'INSTRUCTOR', email: null }, 'u1', 'PROPIETARIO', ENLACE),
    'CORREO_NO_COINCIDE',
  );
  assert.equal(
    motivoNoReclamable({ ...LIBRE, rol: 'INSTRUCTOR' }, 'u1', 'PROPIETARIO', { rolFirmado: null, cuenta: { email: null, emailConfirmado: true } }),
    'CORREO_NO_COINCIDE',
  );
  assert.equal(mismoCorreo('', ''), false, 'dos vacíos no son el mismo correo');
});

test('con otra cuenta no se cuenta nada de la ficha: ni si está de baja, ni si ya es de alguien, ni su rol', () => {
  const otra = { rolFirmado: 'INSTRUCTOR', cuenta: { email: 'otra@example.com', emailConfirmado: true } } as const;
  for (const ficha of [
    { ...LIBRE, rol: 'INSTRUCTOR' as const, activo: false },
    { ...LIBRE, rol: 'INSTRUCTOR' as const, authUserId: 'alguien' },
    { ...LIBRE, rol: 'RECEPCION' as const },
    { ...LIBRE, rol: 'PROPIETARIO' as const },
  ]) {
    assert.equal(motivoNoReclamable(ficha, 'u1', 'MANAGER', otra), 'CORREO_NO_COINCIDE');
  }
});

test('sin confirmar se dice antes que «otro correo»: no sirve para probar correos', () => {
  assert.equal(
    motivoNoReclamable({ ...LIBRE, rol: 'INSTRUCTOR' }, 'u1', 'PROPIETARIO', { rolFirmado: null, cuenta: { email: 'otra@example.com', emailConfirmado: false } }),
    'CORREO_SIN_CONFIRMAR',
  );
});

test('el mismo correo sin verificar tampoco: hay que confirmarlo antes', () => {
  assert.equal(
    motivoNoReclamable({ ...LIBRE, rol: 'INSTRUCTOR' }, 'u1', 'PROPIETARIO', { rolFirmado: null, cuenta: { email: CORREO, emailConfirmado: false } }),
    'CORREO_SIN_CONFIRMAR',
  );
});

// ── El rol firmado en el enlace ─────────────────────────────────────────────
// El enlace vale para el rol con el que se invitó; si la ficha cambia de rol, se reenvía.

test('si el rol de la ficha cambió desde que se firmó el enlace, hay que reenviarlo', () => {
  assert.equal(
    motivoNoReclamable({ ...LIBRE, rol: 'RECEPCION' }, 'u1', 'PROPIETARIO', { ...ENLACE, rolFirmado: 'INSTRUCTOR' }),
    'ENLACE_DESFASADO',
  );
  assert.equal(
    motivoNoReclamable({ ...LIBRE, rol: 'RECEPCION' }, 'u1', 'PROPIETARIO', { ...ENLACE, rolFirmado: 'RECEPCION' }),
    null,
  );
});

test('los enlaces sin rol firmado (antes del 13-oct) siguen valiendo con el correo de la ficha', () => {
  assert.equal(motivoNoReclamable({ ...LIBRE, rol: 'INSTRUCTOR' }, 'u1', 'PROPIETARIO', ENLACE), null);
});

test('repetirlo sobre la propia ficha no es un rechazo aunque su correo haya cambiado después', () => {
  assert.equal(
    motivoNoReclamable({ rol: 'INSTRUCTOR', activo: true, authUserId: 'u1', email: 'nuevo@example.com' }, 'u1', 'PROPIETARIO', ENLACE),
    null,
  );
});

test('lo que no es un rol conocido, en el enlace, cuenta como que no consta', () => {
  assert.equal(rolDelEnlace('RECEPCION'), 'RECEPCION');
  assert.equal(rolDelEnlace('SUPERADMIN'), null);
  assert.equal(rolDelEnlace(null), null);
});

test('cada rechazo con su código: de baja 404, sin confirmar 403, el resto 409', () => {
  assert.equal(estadoHttpDelRechazo('FICHA_INACTIVA'), 404);
  assert.equal(estadoHttpDelRechazo('CORREO_SIN_CONFIRMAR'), 403);
  assert.equal(estadoHttpDelRechazo('CORREO_NO_COINCIDE'), 409);
  assert.equal(estadoHttpDelRechazo('ENLACE_DESFASADO'), 409);
});
