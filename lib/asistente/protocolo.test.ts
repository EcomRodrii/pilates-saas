import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codificarEvento, lectorNdjson, type EventoAsistente } from './protocolo.ts';

test('NDJSON ida y vuelta, también con una línea partida entre dos trozos', () => {
  const eventos: EventoAsistente[] = [
    { t: 'inicio', conversacionId: 'c1', disponibles: 49 },
    { t: 'texto', delta: 'Tienes 84 alumnas activas.\n¿Algo más?' },
    { t: 'fin', unidades: 1, disponibles: 48, motivo: 'OK' },
  ];
  const todo = eventos.map(codificarEvento).join('');
  const lector = lectorNdjson();
  const leidos = [...lector.empujar(todo.slice(0, 37)), ...lector.empujar(todo.slice(37, 80)), ...lector.empujar(todo.slice(80)), ...lector.terminar()];
  assert.deepEqual(leidos, eventos);
});

test('una línea que no es JSON se ignora en vez de tumbar el panel', () => {
  const lector = lectorNdjson();
  assert.deepEqual(lector.empujar('basura\n{"t":"aviso","codigo":"RECHAZADA"}\n'), [{ t: 'aviso', codigo: 'RECHAZADA' }]);
});
