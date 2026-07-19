// Tests de la lógica pura del calendario de reservas.
// Runner nativo de Node (sin dependencias): `node --test` (Node >= 22.6).
// Todas las fechas se construyen en hora LOCAL para ser robustas al huso de CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  localDayKey,
  addDays,
  inicioSemanaLunes,
  diasSemana,
  contarSlotsPorDia,
  slotsDelDia,
  agruparPorDia,
  etiquetaDia,
} from './reserva-calendario-logic.ts';

// Construye un ISO cuyo día LOCAL es (año, mes0, dia) a las HH:MM — el
// round-trip por localDayKey(new Date(iso)) devuelve la misma clave en cualquier huso.
function isoLocal(y: number, m0: number, d: number, h = 10, min = 0): string {
  return new Date(y, m0, d, h, min).toISOString();
}

test('localDayKey usa hora local y rellena con ceros', () => {
  assert.equal(localDayKey(new Date(2026, 6, 5)), '2026-07-05');
  assert.equal(localDayKey(new Date(2026, 11, 31)), '2026-12-31');
});

test('addDays no muta y cruza fin de mes', () => {
  const base = new Date(2026, 6, 30);
  const r = addDays(base, 3);
  assert.equal(localDayKey(r), '2026-08-02');
  assert.equal(localDayKey(base), '2026-07-30'); // sin mutar
});

test('inicioSemanaLunes devuelve el lunes de la semana', () => {
  // 2026-07-15 es miércoles → lunes = 2026-07-13
  assert.equal(localDayKey(inicioSemanaLunes(new Date(2026, 6, 15))), '2026-07-13');
  // un lunes se devuelve a sí mismo
  assert.equal(localDayKey(inicioSemanaLunes(new Date(2026, 6, 13))), '2026-07-13');
  // un domingo pertenece a la semana que empezó el lunes anterior
  assert.equal(localDayKey(inicioSemanaLunes(new Date(2026, 6, 19))), '2026-07-13');
});

test('diasSemana devuelve 7 días consecutivos de lunes a domingo', () => {
  const dias = diasSemana(new Date(2026, 6, 15));
  assert.equal(dias.length, 7);
  assert.equal(localDayKey(dias[0]), '2026-07-13');
  assert.equal(localDayKey(dias[6]), '2026-07-19');
});

test('contarSlotsPorDia agrupa por clave local', () => {
  const slots = [
    { inicio: isoLocal(2026, 6, 13, 9) },
    { inicio: isoLocal(2026, 6, 13, 18) },
    { inicio: isoLocal(2026, 6, 14, 10) },
  ];
  const m = contarSlotsPorDia(slots);
  assert.equal(m.get('2026-07-13'), 2);
  assert.equal(m.get('2026-07-14'), 1);
  assert.equal(m.get('2026-07-15'), undefined);
});

test('slotsDelDia filtra por día y ordena por hora', () => {
  const slots = [
    { inicio: isoLocal(2026, 6, 13, 18), id: 'tarde' },
    { inicio: isoLocal(2026, 6, 14, 10), id: 'otro-dia' },
    { inicio: isoLocal(2026, 6, 13, 9), id: 'manana' },
  ];
  const r = slotsDelDia(slots, '2026-07-13');
  assert.deepEqual(r.map(s => s.id), ['manana', 'tarde']);
});

test('agruparPorDia produce grupos cronológicos', () => {
  const slots = [
    { inicio: isoLocal(2026, 6, 14, 10), id: 'b' },
    { inicio: isoLocal(2026, 6, 13, 9), id: 'a' },
    { inicio: isoLocal(2026, 6, 14, 8), id: 'c' },
  ];
  const grupos = agruparPorDia(slots);
  assert.deepEqual(grupos.map(g => g.dayKey), ['2026-07-13', '2026-07-14']);
  assert.deepEqual(grupos[1].items.map(s => s.id), ['c', 'b']);
});

test('etiquetaDia: Hoy / Mañana / fecha corta capitalizada', () => {
  const ref = new Date(2026, 6, 15);
  assert.equal(etiquetaDia(new Date(2026, 6, 15), ref), 'Hoy');
  assert.equal(etiquetaDia(new Date(2026, 6, 16), ref), 'Mañana');
  const otra = etiquetaDia(new Date(2026, 6, 20), ref);
  assert.equal(otra, otra.charAt(0).toUpperCase() + otra.slice(1));
  assert.notEqual(otra, 'Hoy');
});
