import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisoDeEmbudo } from './embudo-avisos.ts';

test('sin ninguna clase: aviso a las 48 h, no antes', () => {
  assert.equal(avisoDeEmbudo({ creadoHaceHoras: 47, sesiones: 0, reservas: 0 }), null);
  assert.equal(avisoDeEmbudo({ creadoHaceHoras: 48, sesiones: 0, reservas: 0 }), 'SIN_CLASES');
});

test('con clases pero sin ninguna reserva: aviso a las 72 h', () => {
  assert.equal(avisoDeEmbudo({ creadoHaceHoras: 71, sesiones: 12, reservas: 0 }), null);
  assert.equal(avisoDeEmbudo({ creadoHaceHoras: 72, sesiones: 12, reservas: 0 }), 'SIN_RESERVAS');
});

test('con una reserva, aunque sea una: no hay nada que empujar', () => {
  assert.equal(avisoDeEmbudo({ creadoHaceHoras: 500, sesiones: 12, reservas: 1 }), null);
});

test('sin clases nunca se le dice «comparte tu enlace»: aún no hay nada que compartir', () => {
  assert.equal(avisoDeEmbudo({ creadoHaceHoras: 500, sesiones: 0, reservas: 0 }), 'SIN_CLASES');
});

test('una prueba ya cerrada no recibe «comparte tu enlace» (su panel está bloqueado)', () => {
  assert.equal(avisoDeEmbudo({ creadoHaceHoras: 200, sesiones: 12, reservas: 0, pruebaExpirada: true }), null);
  // Pero sí sigue valiendo el aviso de sin clases, que es el de siempre.
  assert.equal(avisoDeEmbudo({ creadoHaceHoras: 200, sesiones: 0, reservas: 0, pruebaExpirada: true }), 'SIN_CLASES');
});
