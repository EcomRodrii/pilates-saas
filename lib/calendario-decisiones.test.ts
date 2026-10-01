import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accionParaEstado, reservasParaPasarLista, planPasarLista } from './calendario-decisiones.ts';

// ── accionParaEstado ─────────────────────────────────────────────────────────

test('cada estado grave tiene su acción con nombre propio', () => {
  assert.equal(accionParaEstado('SIN_INSTRUCTORA', { enEspera: 0, sobreaforo: 0, huecosLibres: 0 }), 'CUBRIR');
  assert.equal(accionParaEstado('SIN_PASAR_LISTA', { enEspera: 0, sobreaforo: 0, huecosLibres: 0 }), 'PASAR_LISTA');
  assert.equal(accionParaEstado('INCIDENCIA', { enEspera: 0, sobreaforo: 0, huecosLibres: 0 }), 'RESOLVER');
  assert.equal(accionParaEstado('CONFLICTO', { enEspera: 0, sobreaforo: 0, huecosLibres: 0 }), 'MOVER');
});

test('CANCELADA nunca tiene acción, aunque tuviera espera, sobreaforo o hueco libre', () => {
  assert.equal(accionParaEstado('CANCELADA', { enEspera: 3, sobreaforo: 2, huecosLibres: 1 }), null);
});

test('sin nada grave, la lista de espera con hueco libre manda "OFRECER"', () => {
  assert.equal(accionParaEstado('PROGRAMADA', { enEspera: 1, sobreaforo: 0, huecosLibres: 1 }), 'OFRECER');
});

test('lista de espera SIN hueco libre no da acción — la clase llena con espera es sana, no un oversell', () => {
  assert.equal(accionParaEstado('PROGRAMADA', { enEspera: 1, sobreaforo: 0, huecosLibres: 0 }), null);
});

test('sin nada grave ni espera, el sobreaforo manda "AJUSTAR_AFORO"', () => {
  assert.equal(accionParaEstado('EN_CURSO', { enEspera: 0, sobreaforo: 2, huecosLibres: 0 }), 'AJUSTAR_AFORO');
});

test('un estado grave gana a la lista de espera — se resuelve lo urgente primero', () => {
  assert.equal(accionParaEstado('CONFLICTO', { enEspera: 5, sobreaforo: 0, huecosLibres: 3 }), 'MOVER');
});

test('sin nada de nada, no hay acción', () => {
  assert.equal(accionParaEstado('PROGRAMADA', { enEspera: 0, sobreaforo: 0, huecosLibres: 0 }), null);
});

// ── reservasParaPasarLista ───────────────────────────────────────────────────

test('solo las CONFIRMADA sin check-in entran en "pasar lista"', () => {
  const ids = reservasParaPasarLista([
    { id: 'a', estado: 'CONFIRMADA', checkInEn: null },
    { id: 'b', estado: 'CONFIRMADA', checkInEn: '2026-07-13T09:00:00Z' }, // ya marcada
    { id: 'c', estado: 'LISTA_ESPERA', checkInEn: null },
    { id: 'd', estado: 'ASISTIDA', checkInEn: '2026-07-13T09:00:00Z' },
  ]);
  assert.deepEqual(ids, ['a']);
});

test('sin nadie sin marcar, la lista sale vacía (no hay nada que pasar)', () => {
  const ids = reservasParaPasarLista([{ id: 'a', estado: 'ASISTIDA', checkInEn: '2026-07-13T09:00:00Z' }]);
  assert.deepEqual(ids, []);
});

test('pasar lista: se marca solo a quien no vino y las demás vinieron', () => {
  const reservas = [
    { id: 'a', estado: 'CONFIRMADA', checkInEn: null },
    { id: 'b', estado: 'CONFIRMADA', checkInEn: null },
    { id: 'c', estado: 'ASISTIDA', checkInEn: '2026-10-01T08:00:00.000Z' }, // ya marcada: no se toca
    { id: 'd', estado: 'LISTA_ESPERA', checkInEn: null },
  ];
  assert.deepEqual(planPasarLista(reservas, new Set(['b'])), { vinieron: ['a'], noVinieron: ['b'] });
  // Un «no vino» de una reserva que ya no está pendiente no se aplica.
  assert.deepEqual(planPasarLista(reservas, new Set(['c'])), { vinieron: ['a', 'b'], noVinieron: [] });
});
