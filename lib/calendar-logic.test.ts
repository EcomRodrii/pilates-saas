// Tests de conflictos de calendario (I-1) y aforo (I-2). Runner nativo de Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { solapan, detectarConflictos, hayConflicto, plazasSobrantesTrasAforo, type SlotSesion } from './calendar-logic.ts';

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

// ── plazasSobrantesTrasAforo ──────────────────────────────────────────────────
test('plazasSobrantesTrasAforo: confirmadas por encima del nuevo aforo', () => {
  assert.equal(plazasSobrantesTrasAforo(8, 4), 4);
  assert.equal(plazasSobrantesTrasAforo(4, 8), 0);
  assert.equal(plazasSobrantesTrasAforo(8, 8), 0);
});
