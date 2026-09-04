import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mensajeConfirmarReserva } from './reserva-confirmacion-mensaje.ts';

test('lista de espera: mensaje de espera, sin importar el sitio', () => {
  const s = mensajeConfirmarReserva({ estado: 'LISTA_ESPERA' }, 'spot-3');
  assert.match(s, /lista de espera/);
});

test('pendiente de aprobación: mensaje de pendiente', () => {
  const s = mensajeConfirmarReserva({ estado: 'PENDIENTE_APROBACION' }, null);
  assert.match(s, /pendiente de aprobación/);
});

// F-16 (auditoría 20ª pasada): el caso que dos de las tres pantallas callaban.
test('confirmada, eligió sitio, el servidor no lo pudo dar: se dice', () => {
  const s = mensajeConfirmarReserva({ estado: 'CONFIRMADA', spotAsignado: null }, 'spot-3');
  assert.match(s, /lo cogieron antes/);
});

test('confirmada, eligió sitio, se lo dieron: mensaje normal', () => {
  const s = mensajeConfirmarReserva({ estado: 'CONFIRMADA', spotAsignado: 'spot-3' }, 'spot-3');
  assert.doesNotMatch(s, /cogieron/);
  assert.match(s, /Reservada\. Te esperamos\./);
});

test('confirmada, sin elegir sitio (spotElegido null): mensaje normal, no avisa de nada', () => {
  const s = mensajeConfirmarReserva({ estado: 'CONFIRMADA', spotAsignado: null }, null);
  assert.doesNotMatch(s, /cogieron/);
});
