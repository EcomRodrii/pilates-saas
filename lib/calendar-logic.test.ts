// Tests de conflictos de calendario (I-1) y aforo (I-2). Runner nativo de Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solapan, detectarConflictos, hayConflicto, elegirLibre, plazasSobrantesTrasAforo, type SlotSesion } from './calendar-logic.ts';

const slot = (p: Partial<SlotSesion> & Pick<SlotSesion, 'inicio' | 'fin'>): SlotSesion => ({
  id: 'x', salaId: 'sala-1', instructorId: 'ins-1', cancelada: false, ...p,
});

// ── solapan ───────────────────────────────────────────────────────────────────
test('solapan: intervalos que se cruzan → true', () => {
  assert.equal(solapan('2026-07-13T10:00:00Z', '2026-07-13T11:00:00Z', '2026-07-13T10:30:00Z', '2026-07-13T11:30:00Z'), true);
});

test('solapan: intervalos contiguos (fin == inicio) → false', () => {
  assert.equal(solapan('2026-07-13T10:00:00Z', '2026-07-13T11:00:00Z', '2026-07-13T11:00:00Z', '2026-07-13T12:00:00Z'), false);
});

test('solapan: intervalos disjuntos → false', () => {
  assert.equal(solapan('2026-07-13T10:00:00Z', '2026-07-13T11:00:00Z', '2026-07-13T12:00:00Z', '2026-07-13T13:00:00Z'), false);
});

test('solapan: fechas inválidas → false', () => {
  assert.equal(solapan('nope', '2026-07-13T11:00:00Z', '2026-07-13T10:30:00Z', '2026-07-13T11:30:00Z'), false);
});

// ── detectarConflictos ────────────────────────────────────────────────────────
const cand = { salaId: 'sala-1', instructorId: 'ins-1', inicio: '2026-07-13T10:00:00Z', fin: '2026-07-13T11:00:00Z' };

test('detecta conflicto de sala (misma sala, solapa, otra instructora)', () => {
  const ex = [slot({ salaId: 'sala-1', instructorId: 'ins-2', inicio: '2026-07-13T10:30:00Z', fin: '2026-07-13T11:30:00Z' })];
  const c = detectarConflictos(cand, ex);
  assert.equal(c.sala.length, 1);
  assert.equal(c.instructor.length, 0);
  assert.equal(hayConflicto(c), true);
});

test('detecta conflicto de instructora (misma instructora, solapa, otra sala)', () => {
  const ex = [slot({ salaId: 'sala-2', instructorId: 'ins-1', inicio: '2026-07-13T10:30:00Z', fin: '2026-07-13T11:30:00Z' })];
  const c = detectarConflictos(cand, ex);
  assert.equal(c.sala.length, 0);
  assert.equal(c.instructor.length, 1);
});

test('sin solape → sin conflicto', () => {
  const ex = [slot({ salaId: 'sala-1', instructorId: 'ins-1', inicio: '2026-07-13T12:00:00Z', fin: '2026-07-13T13:00:00Z' })];
  assert.equal(hayConflicto(detectarConflictos(cand, ex)), false);
});

test('ignora clases canceladas', () => {
  const ex = [slot({ salaId: 'sala-1', instructorId: 'ins-1', inicio: '2026-07-13T10:30:00Z', fin: '2026-07-13T11:30:00Z', cancelada: true })];
  assert.equal(hayConflicto(detectarConflictos(cand, ex)), false);
});

test('excluye la propia clase al editar (excluirId)', () => {
  const ex = [slot({ id: 'self', salaId: 'sala-1', instructorId: 'ins-1', inicio: '2026-07-13T10:00:00Z', fin: '2026-07-13T11:00:00Z' })];
  assert.equal(hayConflicto(detectarConflictos(cand, ex, 'self')), false);
});

test('salaId/instructorId null en la candidata no genera falsos positivos', () => {
  const ex = [slot({ salaId: null, instructorId: null, inicio: '2026-07-13T10:30:00Z', fin: '2026-07-13T11:30:00Z' })];
  const c = detectarConflictos({ salaId: null, instructorId: null, inicio: cand.inicio, fin: cand.fin }, ex);
  assert.equal(hayConflicto(c), false);
});

// ── elegirLibre ───────────────────────────────────────────────────────────────
test('elegirLibre: propone la primera candidata si nada choca', () => {
  const r = elegirLibre(['sala-1', 'sala-2'], 'salaId', cand.inicio, cand.fin, []);
  assert.equal(r, 'sala-1');
});

test('elegirLibre: la primera está ocupada → propone la siguiente libre', () => {
  const ex = [slot({ salaId: 'sala-1', inicio: '2026-07-13T10:00:00Z', fin: '2026-07-13T11:00:00Z' })];
  const r = elegirLibre(['sala-1', 'sala-2'], 'salaId', cand.inicio, cand.fin, ex);
  assert.equal(r, 'sala-2');
});

test('elegirLibre: distinto tipo de clase a la misma hora en otra sala → no choca (el caso reportado)', () => {
  // Ya hay una clase de Mat en sala-1 a las 10:00-11:00; al proponer sala para
  // una segunda clase (Reformer) a esa misma hora, sala-2 debe salir libre.
  const ex = [slot({ salaId: 'sala-1', instructorId: 'ins-1', inicio: '2026-07-13T10:00:00Z', fin: '2026-07-13T11:00:00Z' })];
  const sala = elegirLibre(['sala-1', 'sala-2'], 'salaId', '2026-07-13T10:00:00Z', '2026-07-13T11:00:00Z', ex);
  const instructor = elegirLibre(['ins-1', 'ins-2'], 'instructorId', '2026-07-13T10:00:00Z', '2026-07-13T11:00:00Z', ex);
  assert.equal(sala, 'sala-2');
  assert.equal(instructor, 'ins-2');
});

test('elegirLibre: todas ocupadas → devuelve la primera igualmente (deja que el aviso lo explique)', () => {
  const ex = [
    slot({ salaId: 'sala-1', inicio: '2026-07-13T10:00:00Z', fin: '2026-07-13T11:00:00Z' }),
    slot({ salaId: 'sala-2', inicio: '2026-07-13T10:00:00Z', fin: '2026-07-13T11:00:00Z' }),
  ];
  const r = elegirLibre(['sala-1', 'sala-2'], 'salaId', cand.inicio, cand.fin, ex);
  assert.equal(r, 'sala-1');
});

test('elegirLibre: sin candidatas → cadena vacía', () => {
  assert.equal(elegirLibre([], 'salaId', cand.inicio, cand.fin, []), '');
});

test('elegirLibre: ignora canceladas al buscar hueco libre', () => {
  const ex = [slot({ salaId: 'sala-1', cancelada: true, inicio: '2026-07-13T10:00:00Z', fin: '2026-07-13T11:00:00Z' })];
  const r = elegirLibre(['sala-1', 'sala-2'], 'salaId', cand.inicio, cand.fin, ex);
  assert.equal(r, 'sala-1');
});

test('elegirLibre: no propone una instructora de vacaciones ese día', () => {
  const ausencias = [{ id: 'a1', instructorId: 'ins-1', tipo: 'VACACIONES' as const, desde: '2026-07-10', hasta: '2026-07-20', motivo: null }];
  const r = elegirLibre(['ins-1', 'ins-2'], 'instructorId', cand.inicio, cand.fin, [], ausencias);
  assert.equal(r, 'ins-2');
});

test('elegirLibre: ausencia fuera del rango no afecta', () => {
  const ausencias = [{ id: 'a1', instructorId: 'ins-1', tipo: 'VACACIONES' as const, desde: '2026-08-01', hasta: '2026-08-10', motivo: null }];
  const r = elegirLibre(['ins-1', 'ins-2'], 'instructorId', cand.inicio, cand.fin, [], ausencias);
  assert.equal(r, 'ins-1');
});

test('elegirLibre: la ausencia no filtra el campo salaId', () => {
  const ausencias = [{ id: 'a1', instructorId: 'sala-1', tipo: 'VACACIONES' as const, desde: '2026-07-10', hasta: '2026-07-20', motivo: null }];
  const r = elegirLibre(['sala-1', 'sala-2'], 'salaId', cand.inicio, cand.fin, [], ausencias);
  assert.equal(r, 'sala-1');
});

// ── plazasSobrantesTrasAforo ──────────────────────────────────────────────────
test('plazasSobrantesTrasAforo: confirmadas por encima del nuevo aforo', () => {
  assert.equal(plazasSobrantesTrasAforo(8, 4), 4);
  assert.equal(plazasSobrantesTrasAforo(4, 8), 0);
  assert.equal(plazasSobrantesTrasAforo(8, 8), 0);
});
