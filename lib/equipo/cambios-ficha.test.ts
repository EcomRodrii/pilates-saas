import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cambiosDeFicha, type CamposFicha } from './cambios-ficha.ts';

const ficha: CamposFicha = {
  nombre: 'Laura', email: 'laura@example.com', telefono: null, color: '#2C352C',
  avatar: null, fotoUrl: null, activo: true, rol: 'RECEPCION', bio: null,
};

test('sin tocar nada no se manda nada', () => {
  assert.deepEqual(cambiosDeFicha(ficha, { ...ficha }), {});
});

test('solo viaja lo que cambia: guardar el teléfono NO reescribe el rol', () => {
  // El caso real: una pantalla con el rol viejo cargado guardaba otro dato y
  // volvía a escribir ese rol encima del cambio hecho en otro sitio.
  assert.deepEqual(cambiosDeFicha(ficha, { ...ficha, telefono: '+34 600 000 000' }), { telefono: '+34 600 000 000' });
});

test('cambiar el rol sí lo manda', () => {
  assert.deepEqual(cambiosDeFicha(ficha, { ...ficha, rol: 'INSTRUCTOR' }), { rol: 'INSTRUCTOR' });
});

test('espacios y vacío = sin valor: reescribir lo mismo no es un cambio', () => {
  assert.deepEqual(cambiosDeFicha(ficha, { ...ficha, email: '  laura@example.com ', bio: '' }), {});
});

test('vaciar un campo sí es un cambio', () => {
  assert.deepEqual(cambiosDeFicha(ficha, { ...ficha, email: null }), { email: null });
});

test('dar de baja cuenta como cambio', () => {
  assert.deepEqual(cambiosDeFicha(ficha, { ...ficha, activo: false }), { activo: false });
});
