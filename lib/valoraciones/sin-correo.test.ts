import test from 'node:test';
import assert from 'node:assert/strict';
import { sociasQueYaRecibenElAviso } from './sin-correo.ts';

const EVENTO = 'clase.valorar';
const base = {
  destinatarias: [
    { socio_id: 's-con', authUserId: 'u1' },
    { socio_id: 's-sin-dispositivo', authUserId: 'u2' },
    { socio_id: 's-sin-cuenta', authUserId: null },
  ],
  conDispositivo: ['u1'],
  preferencias: [],
  apagadosPorElEstudio: [],
  evento: EVENTO,
};

test('solo se ahorra el correo a quien tiene un dispositivo suscrito', () => {
  assert.deepEqual(sociasQueYaRecibenElAviso(base), ['s-con']);
});

test('si ella apagó el aviso (la categoría o ese tipo), el correo sale', () => {
  assert.deepEqual(sociasQueYaRecibenElAviso({ ...base, preferencias: [{ user_id: 'u1', push: false, push_eventos: null }] }), []);
  assert.deepEqual(sociasQueYaRecibenElAviso({ ...base, preferencias: [{ user_id: 'u1', push: true, push_eventos: { [EVENTO]: false } }] }), []);
  assert.deepEqual(sociasQueYaRecibenElAviso({ ...base, preferencias: [{ user_id: 'u1', push: false, push_eventos: { [EVENTO]: true } }] }), ['s-con']);
});

test('si el estudio apagó ese aviso a sus clientas, el correo sale a todas', () => {
  assert.deepEqual(sociasQueYaRecibenElAviso({ ...base, apagadosPorElEstudio: [EVENTO] }), []);
});
