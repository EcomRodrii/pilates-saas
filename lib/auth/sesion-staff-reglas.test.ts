import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fichaDeEquipoActiva, resolverSesionStaff, type FichaEquipo } from './sesion-staff-reglas.ts';

// Estas reglas tienen que dar lo mismo que `current_studio_id()`/`current_rol()`
// (migr 0130, `coalesce(activo, true)`). Ids ficticios.
const USER = 'usuario-test';
const base = { userId: USER, email: 'staff@example.com' };

const ficha = (studio_id: string, activo: boolean | null, rol: FichaEquipo['rol'] = 'RECEPCION'): FichaEquipo =>
  ({ studio_id, rol, nombre: `Ficha ${studio_id}`, activo });

test('activo: solo una baja explícita revoca; el nulo cuenta como activa', () => {
  assert.equal(fichaDeEquipoActiva(true), true);
  assert.equal(fichaDeEquipoActiva(false), false);
  assert.equal(fichaDeEquipoActiva(null), true);
  assert.equal(fichaDeEquipoActiva(undefined), true);
});

test('la sede guardada sobre una ficha con activo nulo se respeta, como en la base de datos', () => {
  // El caso que divergía: con `.neq('activo', false)` la ficha B no llegaba y el
  // servidor resolvía A mientras `current_studio_id()` resolvía B.
  const s = resolverSesionStaff({
    ...base,
    sedeGuardada: 'estudio-b',
    fichas: [ficha('estudio-a', true, 'MANAGER'), ficha('estudio-b', null, 'INSTRUCTOR')],
    estudiosPropios: [],
  });
  assert.equal(s?.studioId, 'estudio-b');
  assert.equal(s?.rol, 'INSTRUCTOR');
});

test('sin sede guardada, una ficha con activo nulo también cuenta para la primera por studio_id', () => {
  const s = resolverSesionStaff({
    ...base,
    sedeGuardada: null,
    fichas: [ficha('estudio-a', null), ficha('estudio-b', true)],
    estudiosPropios: [{ id: 'estudio-0', nombre: 'Propio' }],
  });
  assert.equal(s?.studioId, 'estudio-a');
  assert.equal(s?.rol, 'RECEPCION');
});

test('la sede guardada sobre una baja explícita se ignora y cae a la siguiente ficha activa', () => {
  const s = resolverSesionStaff({
    ...base,
    sedeGuardada: 'estudio-a',
    fichas: [ficha('estudio-a', false, 'MANAGER'), ficha('estudio-b', true)],
    estudiosPropios: [],
  });
  assert.equal(s?.studioId, 'estudio-b');
  assert.equal(s?.rol, 'RECEPCION');
});

test('con todas las fichas de baja, solo queda el estudio propio', () => {
  const s = resolverSesionStaff({
    ...base,
    sedeGuardada: 'estudio-a',
    fichas: [ficha('estudio-a', false)],
    estudiosPropios: [{ id: 'estudio-0', nombre: 'Propio' }],
  });
  assert.deepEqual(s, { ...base, studioId: 'estudio-0', rol: 'PROPIETARIO', nombre: 'Propio' });
});

test('la sede guardada del estudio propio gana a la primera ficha', () => {
  const s = resolverSesionStaff({
    ...base,
    sedeGuardada: 'estudio-z',
    fichas: [ficha('estudio-a', true)],
    estudiosPropios: [{ id: 'estudio-z', nombre: null }],
  });
  assert.deepEqual(s, { ...base, studioId: 'estudio-z', rol: 'PROPIETARIO', nombre: 'Estudio' });
});

test('una sede guardada que ya no es suya no abre nada: cae al criterio determinista', () => {
  const s = resolverSesionStaff({
    ...base,
    sedeGuardada: 'estudio-ajeno',
    fichas: [ficha('estudio-a', true)],
    estudiosPropios: [],
  });
  assert.equal(s?.studioId, 'estudio-a');
});

test('sin fichas activas ni estudio propio no hay sesión', () => {
  assert.equal(resolverSesionStaff({ ...base, sedeGuardada: 'estudio-a', fichas: [ficha('estudio-a', false)], estudiosPropios: [] }), null);
  assert.equal(resolverSesionStaff({ ...base, sedeGuardada: null, fichas: null, estudiosPropios: null }), null);
});
