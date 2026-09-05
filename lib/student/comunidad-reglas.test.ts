import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoEvento, plazasTexto, puedeApuntarse } from './comunidad-reglas.ts';

const ahora = new Date('2026-09-04T12:00:00Z');
const evento = (p: Partial<Parameters<typeof estadoEvento>[0]> = {}) => ({ tipo: 'EVENTO' as const, eventoFecha: '2026-09-10T18:00:00Z', eventoAforo: 10, totalAsistentes: 3, ...p });

test('evento futuro con plazas → próximo', () => {
  assert.equal(estadoEvento(evento(), ahora), 'proximo');
});

test('aforo cubierto → completo; sin aforo nunca se llena', () => {
  assert.equal(estadoEvento(evento({ totalAsistentes: 10 }), ahora), 'completo');
  assert.equal(estadoEvento(evento({ eventoAforo: null, totalAsistentes: 500 }), ahora), 'proximo');
  assert.equal(estadoEvento(evento({ eventoAforo: 0, totalAsistentes: 5 }), ahora), 'proximo');
});

test('fecha pasada gana a completo', () => {
  assert.equal(estadoEvento(evento({ eventoFecha: '2026-09-01T18:00:00Z', totalAsistentes: 10 }), ahora), 'pasado');
});

test('apuntarse: solo a eventos futuros con hueco; bajarse, siempre que no haya pasado', () => {
  assert.equal(puedeApuntarse(evento(), false, ahora), true);
  assert.equal(puedeApuntarse(evento({ totalAsistentes: 10 }), false, ahora), false);
  assert.equal(puedeApuntarse(evento({ totalAsistentes: 10 }), true, ahora), true);
  assert.equal(puedeApuntarse(evento({ eventoFecha: '2026-09-01T18:00:00Z' }), true, ahora), false);
  assert.equal(puedeApuntarse({ tipo: 'TEXTO', eventoFecha: null, eventoAforo: null }, false, ahora), false);
});

test('texto de plazas', () => {
  assert.equal(plazasTexto(evento()), '3 de 10 plazas');
  assert.equal(plazasTexto(evento({ eventoAforo: null, totalAsistentes: 1 })), '1 apuntada');
  assert.equal(plazasTexto(evento({ eventoAforo: null, totalAsistentes: 0 })), '0 apuntadas');
});
