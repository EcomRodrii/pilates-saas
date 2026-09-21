import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acotarFijasProximas, FIJAS_VISIBLES_EN_PROXIMAS } from './plaza-fija.ts';

const fija = (n: number) => ({ r: { id: `res-pf-${n}` }, c: { fecha: `2026-10-${String(n).padStart(2, '0')}`, hora: '10:00' } });
const mano = (n: number, hora = '18:00') => ({ r: { id: `res-${n}` }, c: { fecha: `2026-10-${String(n).padStart(2, '0')}`, hora } });

test('pocas clases fijas: no se acota nada', () => {
  const items = [fija(1), mano(2), fija(3)];
  const { visibles, ocultas } = acotarFijasProximas(items);
  assert.deepEqual(visibles, items);
  assert.equal(ocultas, 0);
});

test('el motor reserva meses por delante: se enseñan las primeras y se cuenta el resto', () => {
  const items = Array.from({ length: 26 }, (_, i) => fija(i + 1));
  const { visibles, ocultas } = acotarFijasProximas(items);
  assert.equal(visibles.length, FIJAS_VISIBLES_EN_PROXIMAS);
  assert.equal(ocultas, 26 - FIJAS_VISIBLES_EN_PROXIMAS);
  assert.deepEqual(visibles.map((x) => x.r.id), ['res-pf-1', 'res-pf-2', 'res-pf-3', 'res-pf-4', 'res-pf-5', 'res-pf-6']);
});

test('las primeras son las más cercanas en fecha, aunque lleguen desordenadas', () => {
  const items = [fija(20), fija(3), fija(11), fija(7)];
  const { visibles, ocultas } = acotarFijasProximas(items, 2);
  assert.deepEqual(visibles.map((x) => x.r.id).sort(), ['res-pf-3', 'res-pf-7']);
  assert.equal(ocultas, 2);
});

test('una reserva hecha a mano NO se acota nunca, y conserva su sitio en la lista', () => {
  const items = [fija(1), mano(2), fija(3), mano(25), fija(30)];
  const { visibles, ocultas } = acotarFijasProximas(items, 1);
  assert.deepEqual(visibles.map((x) => x.r.id), ['res-pf-1', 'res-2', 'res-25']);
  assert.equal(ocultas, 2);
});

test('sin clases fijas no hay nada oculto', () => {
  const items = [mano(1), mano(2)];
  assert.deepEqual(acotarFijasProximas(items), { visibles: items, ocultas: 0 });
});
