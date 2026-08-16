import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decisionesOrdenadas, accionParaEstado, reservasParaPasarLista, type ItemDecision } from './calendario-decisiones.ts';

const item = (o: Partial<ItemDecision> & Pick<ItemDecision, 'sesionId' | 'estado'>): ItemDecision => ({
  dia: 0, inicioMin: 480, enEspera: 0, sobreaforo: 0, huecosLibres: 0, finalizada: false, ...o,
});

// ── decisionesOrdenadas ──────────────────────────────────────────────────────

test('filtra fuera las que no piden nada', () => {
  const r = decisionesOrdenadas([item({ sesionId: 'a', estado: 'PROGRAMADA' }), item({ sesionId: 'b', estado: 'SIN_INSTRUCTORA' })]);
  assert.deepEqual(r.map(i => i.sesionId), ['b']);
});

test('ordena por día y luego por hora de inicio', () => {
  const r = decisionesOrdenadas([
    item({ sesionId: 'martes-tarde', estado: 'INCIDENCIA', dia: 1, inicioMin: 900 }),
    item({ sesionId: 'lunes-tarde', estado: 'INCIDENCIA', dia: 0, inicioMin: 900 }),
    item({ sesionId: 'lunes-manana', estado: 'INCIDENCIA', dia: 0, inicioMin: 480 }),
  ]);
  assert.deepEqual(r.map(i => i.sesionId), ['lunes-manana', 'lunes-tarde', 'martes-tarde']);
});

test('lista de espera con gente Y hueco libre también pide decisión aunque el estado sea neutro', () => {
  const r = decisionesOrdenadas([item({ sesionId: 'a', estado: 'PROGRAMADA', enEspera: 2, huecosLibres: 1 })]);
  assert.equal(r.length, 1);
});

test('lista de espera con la clase llena (sin hueco libre) NO pide decisión — no hay overselling posible', () => {
  const r = decisionesOrdenadas([item({ sesionId: 'a', estado: 'PROGRAMADA', enEspera: 2, huecosLibres: 0 })]);
  assert.equal(r.length, 0);
});

test('sin nada que pida decisión, la lista queda vacía (la franja no se pinta)', () => {
  const r = decisionesOrdenadas([item({ sesionId: 'a', estado: 'PROGRAMADA' }), item({ sesionId: 'b', estado: 'FINALIZADA' })]);
  assert.equal(r.length, 0);
});

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
