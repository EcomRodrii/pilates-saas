import test from 'node:test';
import assert from 'node:assert/strict';
import { desenlaceDeLaHoja, LLENA_SIN_ESPERA } from './desenlace-hoja.ts';

// Lo que dice la hoja de reserva cuando contesta el servidor: la misma para la ficha y para la fila del horario.

test('aforo-lleno: la clase NO tiene lista de espera (el servidor solo lo dice entonces), y no se le ofrece', () => {
  const d = desenlaceDeLaHoja({ state: 'full', codigo: 'aforo-lleno', acciones: ['elegir_otra_clase'] }, null);
  assert.equal(d.ofreceEspera, false);
  assert.equal(d.mensaje, LLENA_SIN_ESPERA);
  assert.match(d.mensaje ?? '', /no tiene lista de espera/);
  assert.deepEqual(d.acciones, ['elegir_otra_clase']);
  // El título no se toca: «Se ha llenado mientras reservabas» sigue siendo verdad.
  assert.equal(d.titulo, undefined);
});

test('spot-ocupado: como hasta ahora (vuelve a la revisión para elegir otro sitio)', () => {
  const d = desenlaceDeLaHoja({ state: 'full', codigo: 'spot-ocupado', mensaje: 'Ese sitio ya está ocupado.' }, 'spot-3');
  assert.equal(d.ofreceEspera, true);
  assert.equal(d.mensaje, 'Ese sitio ya está ocupado.');
});

test('el aviso del sitio que no le dieron va ANTES que el de la recuperación usada', () => {
  const d = desenlaceDeLaHoja({ state: 'confirmed', spotAsignado: null, recuperacionUsada: { caducaEl: null } }, 'spot-3');
  assert.match(d.mensaje ?? '', /^Reservada, pero el sitio que elegiste lo cogieron antes\. .* Has usado una de tus recuperaciones/);
  assert.equal(d.ofreceEspera, false);
});

test('solo la recuperación, si no pidió sitio o se lo dieron', () => {
  assert.equal(desenlaceDeLaHoja({ state: 'confirmed', recuperacionUsada: { caducaEl: '2026-11-01' } }, null).mensaje,
    'Has usado una de tus recuperaciones para esta clase.');
  assert.equal(desenlaceDeLaHoja({ state: 'confirmed', spotAsignado: 'spot-3' }, 'spot-3').mensaje, undefined);
});

test('pendiente de aprobación: su título y su frase, nunca «lista de espera»', () => {
  const d = desenlaceDeLaHoja({ state: 'waitlisted', pendienteAprobacion: true }, null);
  assert.equal(d.titulo, 'Tu reserva está pendiente de aprobación');
  assert.match(d.mensaje ?? '', /el estudio la revisa/);
  assert.doesNotMatch(d.mensaje ?? '', /lista de espera/);
});

test('un error sin mensaje traducido no inventa uno (el crudo ya lo quita `confirmarReserva`)', () => {
  const d = desenlaceDeLaHoja({ state: 'error' }, null);
  assert.equal(d.mensaje, undefined);
  assert.equal(d.ofreceEspera, false);
  // Un rechazo de negocio sí lleva su motivo.
  assert.equal(desenlaceDeLaHoja({ state: 'error', codigo: 'sin-plan', mensaje: 'Necesitas un plan.' }, null).mensaje, 'Necesitas un plan.');
});
