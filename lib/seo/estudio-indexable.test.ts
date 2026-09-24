import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paginaEstudioIndexable, type SenalesEstudio } from './estudio-indexable.ts';

const REAL: SenalesEstudio = {
  oculta: false, suspendido: false, esDemo: false, estadoSuscripcion: 'trialing', clasesFuturas: 40, reservasRecientes: 12,
};

test('un estudio real, en prueba o pagando, con horario y reservas: indexable', () => {
  assert.equal(paginaEstudioIndexable(REAL), true);
  assert.equal(paginaEstudioIndexable({ ...REAL, estadoSuscripcion: 'active' }), true);
  // Un cobro fallido no lo convierte en prueba abandonada: sigue siendo cliente.
  assert.equal(paginaEstudioIndexable({ ...REAL, estadoSuscripcion: 'past_due' }), true);
});

test('la demo del equipo no se indexa aunque tenga horario y reservas', () => {
  assert.equal(paginaEstudioIndexable({ ...REAL, esDemo: true, estadoSuscripcion: 'active' }), false);
});

test('una prueba caducada o una suscripción cancelada no se indexan', () => {
  for (const estado of ['trial_expirado', 'canceled', 'unpaid', null]) {
    assert.equal(paginaEstudioIndexable({ ...REAL, estadoSuscripcion: estado }), false, String(estado));
  }
});

test('horario sin ni una reserva (el alta que nunca arrancó): no se indexa', () => {
  assert.equal(paginaEstudioIndexable({ ...REAL, reservasRecientes: 0 }), false);
});

test('sin clases futuras no hay nada que enseñar', () => {
  assert.equal(paginaEstudioIndexable({ ...REAL, clasesFuturas: 0 }), false);
});

test('oculta o suspendida: nunca', () => {
  assert.equal(paginaEstudioIndexable({ ...REAL, oculta: true }), false);
  assert.equal(paginaEstudioIndexable({ ...REAL, suspendido: true }), false);
});
