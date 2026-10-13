import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INVITACION_NO_DISPONIBLE, respuestaInvitacionPublica, type FichaInvitada } from './invitacion-publica.ts';

// Lo que ve, sin cuenta, quien abre un enlace de invitación al equipo: nunca el
// correo entero y, si el enlace ya no vale, nada de la ficha.

const PENDIENTE: FichaInvitada = { nombre: 'Ana', email: 'ana.perez@example.com', auth_user_id: null, activo: true, rol: 'RECEPCION' };
const ESTUDIO = { nombre: 'Studio Carmen', slug: 'studio-carmen' };

test('el correo de la ficha sale tapado, con el dominio entero', () => {
  const { status, body } = respuestaInvitacionPublica(PENDIENTE, ESTUDIO, false);
  assert.equal(status, 200);
  assert.equal(body.email, 'an•••@example.com');
  assert.ok(!JSON.stringify(body).includes('ana.perez'), 'la dirección entera no sale por ningún campo');
  assert.deepEqual(
    { nombre: body.nombre, estudio: body.estudio, rol: body.rol, slug: body.slug, yaVinculada: body.yaVinculada },
    { nombre: 'Ana', estudio: 'Studio Carmen', rol: 'RECEPCION', slug: 'studio-carmen', yaVinculada: false },
  );
});

test('un enlace revocado (reenviado después o ya canjeado) no enseña nada de la ficha', () => {
  const { status, body } = respuestaInvitacionPublica(PENDIENTE, ESTUDIO, true);
  assert.equal(status, 404);
  assert.deepEqual(body, { error: INVITACION_NO_DISPONIBLE });
});

test('ya vinculada se dice antes que «revocado»: canjearla la gasta, y a esa persona hay que decirle que ya puede entrar', () => {
  const { status, body } = respuestaInvitacionPublica({ ...PENDIENTE, auth_user_id: 'u1' }, ESTUDIO, true);
  assert.equal(status, 200);
  assert.equal(body.yaVinculada, true);
  assert.equal(body.email, undefined, 'sin correo ni nombre');
  assert.equal(body.nombre, undefined);
});

test('una ficha de baja o que no existe no es una invitación', () => {
  assert.equal(respuestaInvitacionPublica({ ...PENDIENTE, activo: false }, ESTUDIO, false).status, 404);
  assert.equal(respuestaInvitacionPublica(null, ESTUDIO, false).status, 404);
});

test('activo nulo cuenta como activa, y sin correo en la ficha no se inventa uno', () => {
  const { status, body } = respuestaInvitacionPublica({ ...PENDIENTE, activo: null, email: null }, null, false);
  assert.equal(status, 200);
  assert.equal(body.email, null);
  assert.equal(body.estudio, 'tu estudio');
});
