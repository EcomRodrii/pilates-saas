import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cifrasDeClase } from './cifras-clase.ts';

test('cada reserva cuenta una vez, por su estado', () => {
  assert.deepEqual(cifrasDeClase([
    { estado: 'CONFIRMADA' }, { estado: 'ASISTIDA' }, { estado: 'NO_ASISTIO' },
    { estado: 'LISTA_ESPERA' }, { estado: 'LISTA_ESPERA' },
    { estado: 'PENDIENTE_APROBACION' },
    { estado: 'CANCELADA' },
  ]), { apuntadas: 3, enEspera: 2, porAprobar: 1, canceladas: 1 });
});

test('sin reservas, todo a cero', () => {
  assert.deepEqual(cifrasDeClase([]), { apuntadas: 0, enEspera: 0, porAprobar: 0, canceladas: 0 });
});
