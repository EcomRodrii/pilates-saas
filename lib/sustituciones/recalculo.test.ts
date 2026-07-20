import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  puedeRecalcular, filtrarYaRechazadas, estadoTrasRecalcular, resumenRecalculo,
} from './recalculo.ts';

const cand = (id: string) => ({ instructor_id: id, nombre: id });

// ── Cuándo se puede ─────────────────────────────────────────────────────────

test('se puede recalcular con la baja esperando visto bueno o agotada', () => {
  for (const e of ['buscando', 'pendiente_aprobacion', 'agotada']) {
    assert.deepEqual(puedeRecalcular(e), { ok: true }, `debería poderse en ${e}`);
  }
});

test('NO se recalcula con un contacto en vuelo (apagaría el escalado)', () => {
  assert.deepEqual(puedeRecalcular('contactando'), { ok: false, motivo: 'contactando' });
});

test('contactando pero SIN nadie en vuelo (autónomo sin contactables) → sí se puede', () => {
  assert.deepEqual(puedeRecalcular('contactando', false), { ok: true });
});

test('NO se recalcula una sustitución ya resuelta', () => {
  for (const e of ['confirmada', 'sin_sustituta', 'resuelta_fuera', 'cancelada']) {
    assert.deepEqual(puedeRecalcular(e), { ok: false, motivo: 'resuelta' }, `no en ${e}`);
  }
});

// ── No volver a molestar a quien ya dijo que no ─────────────────────────────

test('quien ya rechazó esta clase no vuelve a aparecer', () => {
  const r = filtrarYaRechazadas([cand('ins-1'), cand('ins-2'), cand('ins-3')], ['ins-2']);
  assert.deepEqual(r.map(c => c.instructor_id), ['ins-1', 'ins-3']);
});

test('sin rechazos, el ranking pasa intacto (misma referencia, sin copiar)', () => {
  const original = [cand('ins-1')];
  assert.equal(filtrarYaRechazadas(original, []), original);
});

test('si todas rechazaron, queda vacío (no se reciclan)', () => {
  const r = filtrarYaRechazadas([cand('ins-1'), cand('ins-2')], ['ins-1', 'ins-2']);
  assert.deepEqual(r, []);
});

// ── En qué estado queda ─────────────────────────────────────────────────────

test('agotada + opciones nuevas → vuelve a manos de la propietaria', () => {
  assert.equal(estadoTrasRecalcular('agotada', 2), 'pendiente_aprobacion');
});

test('agotada y sigue sin nadie → se queda agotada, no se finge progreso', () => {
  assert.equal(estadoTrasRecalcular('agotada', 0), 'agotada');
});

test('los demás estados no cambian al recalcular', () => {
  assert.equal(estadoTrasRecalcular('pendiente_aprobacion', 3), 'pendiente_aprobacion');
  assert.equal(estadoTrasRecalcular('buscando', 0), 'buscando');
});

// ── Qué se le cuenta ────────────────────────────────────────────────────────

test('resumen: de cero a dos → dice que son nuevas', () => {
  assert.equal(resumenRecalculo(0, 2), 'Hay 2 candidatas nuevas.');
  assert.equal(resumenRecalculo(0, 1), 'Hay 1 candidata nueva.');
});

test('resumen: sigue sin haber nadie → se dice claro', () => {
  assert.match(resumenRecalculo(0, 0), /Sigue sin haber ninguna candidata/);
});

test('resumen: sin cambios → no promete nada que no ha pasado', () => {
  assert.equal(resumenRecalculo(2, 2), 'Siguen siendo 2 candidatas.');
  assert.equal(resumenRecalculo(1, 1), 'Sigue habiendo 1 candidata.');
});

test('resumen: si hay menos que antes, tampoco miente', () => {
  assert.equal(resumenRecalculo(3, 1), 'Sigue habiendo 1 candidata.');
});
