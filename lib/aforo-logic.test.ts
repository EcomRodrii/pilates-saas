// Tests de la lógica pura de aforo efectivo. Runner nativo: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BloqueoMaquina } from '@/lib/types';
import { aforoEfectivo, averiasActivasEnRango, aforoEfectivoSesion } from './aforo-logic.ts';

function bloqueo(p: Partial<BloqueoMaquina> & Pick<BloqueoMaquina, 'salaId' | 'desde'>): BloqueoMaquina {
  return { id: 'b1', studioId: 'e1', spotId: null, hasta: null, motivo: null, creadoEn: '2026-07-01T00:00:00Z', ...p };
}

// Sesión de referencia: 2026-07-15 10:00–11:00.
const INI = '2026-07-15T10:00:00Z';
const FIN = '2026-07-15T11:00:00Z';

// ── aforoEfectivo ─────────────────────────────────────────────────────────────
test('aforoEfectivo: sin averías = aforo máximo', () => {
  assert.equal(aforoEfectivo(6, 0), 6);
});

test('aforoEfectivo: cada avería resta una plaza', () => {
  assert.equal(aforoEfectivo(6, 2), 4);
});

test('aforoEfectivo: nunca baja de 0', () => {
  assert.equal(aforoEfectivo(6, 9), 0);
});

// ── averiasActivasEnRango ─────────────────────────────────────────────────────
test('averiasActivasEnRango: avería abierta (hasta null) que empezó antes → cuenta', () => {
  const b = [bloqueo({ salaId: 's1', desde: '2026-07-10T00:00:00Z', hasta: null })];
  assert.equal(averiasActivasEnRango(b, 's1', INI, FIN), 1);
});

test('averiasActivasEnRango: avería en otra sala no cuenta', () => {
  const b = [bloqueo({ salaId: 's2', desde: '2026-07-10T00:00:00Z' })];
  assert.equal(averiasActivasEnRango(b, 's1', INI, FIN), 0);
});

test('averiasActivasEnRango: avería que terminó antes de la sesión no cuenta', () => {
  const b = [bloqueo({ salaId: 's1', desde: '2026-07-01T00:00:00Z', hasta: '2026-07-14T00:00:00Z' })];
  assert.equal(averiasActivasEnRango(b, 's1', INI, FIN), 0);
});

test('averiasActivasEnRango: avería que empieza después de la sesión no cuenta', () => {
  const b = [bloqueo({ salaId: 's1', desde: '2026-07-16T00:00:00Z', hasta: '2026-07-20T00:00:00Z' })];
  assert.equal(averiasActivasEnRango(b, 's1', INI, FIN), 0);
});

test('averiasActivasEnRango: ventana que engloba la sesión → cuenta; suma varias', () => {
  const b = [
    bloqueo({ id: 'b1', salaId: 's1', desde: '2026-07-14T00:00:00Z', hasta: '2026-07-16T00:00:00Z' }),
    bloqueo({ id: 'b2', salaId: 's1', desde: '2026-07-15T09:00:00Z', hasta: '2026-07-15T12:00:00Z' }),
  ];
  assert.equal(averiasActivasEnRango(b, 's1', INI, FIN), 2);
});

// ── aforoEfectivoSesion ───────────────────────────────────────────────────────
test('aforoEfectivoSesion: 6 plazas, 1 reformer averiado en el rango → 5', () => {
  const b = [bloqueo({ salaId: 's1', desde: '2026-07-14T00:00:00Z', hasta: '2026-07-20T00:00:00Z' })];
  assert.equal(aforoEfectivoSesion(6, 's1', INI, FIN, b), 5);
});
