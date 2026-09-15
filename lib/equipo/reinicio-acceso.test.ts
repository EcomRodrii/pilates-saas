import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { reiniciaAccesoAlCambiarEmail } from './reinicio-acceso.ts';

test('editar una ficha de equipo aplica la regla y suelta la cuenta en el mismo UPDATE', () => {
  // Los e2e mockean /api/equipo: sin esto, quitar la línea no lo notaría nadie
  // y volvería el caso de la alumna creada por error (15-sep-2026).
  const src = readFileSync(join(import.meta.dirname, '../actions/equipo/equipoAction.ts'), 'utf8');
  const inicio = src.indexOf('async function editarInstructora');
  assert.ok(inicio >= 0, 'no se encuentra editarInstructora');
  const cuerpo = src.slice(inicio, src.indexOf('\nasync function ', inicio + 10));
  assert.match(cuerpo, /reiniciaAccesoAlCambiarEmail\(/);
  assert.match(cuerpo, /if \(accesoReiniciado\) update\.auth_user_id = null;/);
  assert.ok(
    cuerpo.indexOf('update.auth_user_id = null') < cuerpo.indexOf(".update(update)"),
    'la cuenta se suelta ANTES del UPDATE, en la misma escritura',
  );
});

const base = {
  emailAntes: 'antiguo@example.com', emailNuevo: 'nuevo@example.com',
  tieneCuenta: true, rol: 'INSTRUCTOR' as const, esPropia: false,
};

test('cambiar el correo de alguien con acceso se lo reinicia', () => {
  assert.equal(reiniciaAccesoAlCambiarEmail(base), true);
  assert.equal(reiniciaAccesoAlCambiarEmail({ ...base, rol: 'RECEPCION' }), true);
  assert.equal(reiniciaAccesoAlCambiarEmail({ ...base, emailNuevo: null }), true, 'quitarle el correo también');
});

test('reescribir el mismo correo no echa a nadie', () => {
  assert.equal(reiniciaAccesoAlCambiarEmail({ ...base, emailNuevo: '  ANTIGUO@example.com ' }), false);
});

test('sin cuenta no hay nada que soltar', () => {
  assert.equal(reiniciaAccesoAlCambiarEmail({ ...base, tieneCuenta: false }), false);
});

test('ni la propia ficha ni la de una propietaria', () => {
  assert.equal(reiniciaAccesoAlCambiarEmail({ ...base, esPropia: true }), false);
  assert.equal(reiniciaAccesoAlCambiarEmail({ ...base, rol: 'PROPIETARIO' }), false);
});
