import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarAforo } from './aforo-fresco.ts';

const previas = [
  { sesion_id: 'pasada', estado: 'ASISTIDA' },
  { sesion_id: 'hoy', estado: 'CONFIRMADA' },
  { sesion_id: 'hoy', estado: 'CONFIRMADA' },
  { sesion_id: 'manana', estado: 'CONFIRMADA' },
];

test('reemplaza solo las sesiones de la ventana; las pasadas se quedan', () => {
  const r = aplicarAforo(previas, ['hoy', 'manana'], [{ sesion_id: 'hoy', estado: 'CONFIRMADA' }]);
  assert.deepEqual(r, [{ sesion_id: 'pasada', estado: 'ASISTIDA' }, { sesion_id: 'hoy', estado: 'CONFIRMADA' }]);
});

test('una sesión de la ventana sin filas frescas queda a cero (se liberaron plazas)', () => {
  const r = aplicarAforo(previas, ['hoy', 'manana'], []);
  assert.deepEqual(r, [{ sesion_id: 'pasada', estado: 'ASISTIDA' }]);
});

test('ventana vacía → no toca nada', () => {
  assert.deepEqual(aplicarAforo(previas, [], []), previas);
});
