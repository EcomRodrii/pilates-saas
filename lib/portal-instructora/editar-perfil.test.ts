import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BIO, MAX_NOMBRE, leerCambiosPerfil } from './editar-perfil.ts';

test('guarda nombre, descripción y teléfono ya limpios', () => {
  const r = leerCambiosPerfil({ nombre: '  Ana   Ferrer ', bio: ' Reformer y suelo pélvico. ', telefono: ' +34 600 11 22 33 ' });
  assert.deepEqual(r, { ok: true, cambios: { nombre: 'Ana Ferrer', bio: 'Reformer y suelo pélvico.', telefono: '+34 600 11 22 33' } });
});

test('⚠️ solo esos tres campos: rol, email, estudio o activo no pasan aunque vengan', () => {
  const r = leerCambiosPerfil({
    nombre: 'Ana', rol: 'PROPIETARIO', email: 'otra@example.com', studio_id: 'otro', activo: true,
    auth_user_id: 'usuario-ajeno', foto_url: 'https://example.com/x.png', tipo_contrato: 'AUTONOMA',
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok && Object.keys(r.cambios), ['nombre']);
});

test('sin nombre, o con uno demasiado largo, no se guarda y señala el campo', () => {
  assert.deepEqual(leerCambiosPerfil({ nombre: '   ' }), { ok: false, error: 'Escribe tu nombre.', campo: 'nombre' });
  const largo = leerCambiosPerfil({ nombre: 'a'.repeat(MAX_NOMBRE + 1) });
  assert.equal(largo.ok, false);
  assert.equal(!largo.ok && largo.campo, 'nombre');
});

test('descripción y teléfono vacíos se guardan como «sin», no como texto en blanco', () => {
  assert.deepEqual(leerCambiosPerfil({ bio: '   ', telefono: '' }), { ok: true, cambios: { bio: null, telefono: null } });
  assert.deepEqual(leerCambiosPerfil({ bio: null, telefono: null }), { ok: true, cambios: { bio: null, telefono: null } });
});

test('una descripción demasiado larga no se recorta en silencio: se dice', () => {
  const r = leerCambiosPerfil({ bio: 'x'.repeat(MAX_BIO + 1) });
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.campo, 'bio');
});

test('teléfonos: formatos normales sí; letras, pocos dígitos o demasiados, no', () => {
  // El «+» solo al principio: «(+34) …» no se acepta, «+34 (600) …» sí.
  for (const bueno of ['600112233', '+34 600 11 22 33', '+34 (600) 112-233', '91 123 45 67']) {
    assert.equal(leerCambiosPerfil({ telefono: bueno }).ok, true, bueno);
  }
  for (const malo of ['llámame', '12345', '+34 600 11 22 33 44 55 66', '600112233;drop', 42]) {
    const r = leerCambiosPerfil({ telefono: malo });
    assert.equal(r.ok, false, String(malo));
    assert.equal(!r.ok && r.campo, 'telefono');
  }
});

test('un cuerpo vacío o raro no escribe nada', () => {
  for (const raro of [null, undefined, 'nombre', [], {}, { otra: 'cosa' }]) {
    const r = leerCambiosPerfil(raro);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.campo, 'general');
  }
});
