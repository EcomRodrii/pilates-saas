import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agruparAgenda, faltaTexto, grupoAgenda, lunesDe, tileFecha } from './agenda-proximas.ts';
import { notaCorta, partesNota } from './instructora.ts';

// Miércoles 30-sep-2026.
const HOY = '2026-09-30';

test('el lunes de la semana', () => {
  assert.equal(lunesDe(HOY), '2026-09-28');
  assert.equal(lunesDe('2026-09-28'), '2026-09-28');
  assert.equal(lunesDe('2026-10-04'), '2026-09-28'); // domingo
});

test('los bloques: esta semana, la que viene, y luego el mes', () => {
  assert.equal(grupoAgenda('2026-10-04', HOY), 'Esta semana');
  assert.equal(grupoAgenda('2026-10-05', HOY), 'La semana que viene');
  assert.equal(grupoAgenda('2026-10-11', HOY), 'La semana que viene');
  assert.equal(grupoAgenda('2026-10-12', HOY), 'Octubre');
  assert.equal(grupoAgenda('2027-01-11', HOY), 'Enero 2027');
});

test('agrupa seguidos y conserva el orden', () => {
  const x = (fecha: string) => ({ c: { fecha } });
  const g = agruparAgenda([x('2026-10-01'), x('2026-10-02'), x('2026-10-06'), x('2026-10-19')], HOY);
  assert.deepEqual(g.map((b) => [b.titulo, b.items.length]), [['Esta semana', 2], ['La semana que viene', 1], ['Octubre', 1]]);
});

test('el cuadradito de la fecha y cuánto falta', () => {
  assert.deepEqual(tileFecha('2026-10-12'), { semana: 'LUN', dia: '12', mes: 'OCT' });
  assert.deepEqual(tileFecha(''), { semana: '', dia: '', mes: '' });
  assert.equal(faltaTexto(HOY, HOY), 'Hoy');
  assert.equal(faltaTexto('2026-10-01', HOY), 'Mañana');
  assert.equal(faltaTexto('2026-10-05', HOY), 'En 5 días');
  assert.equal(faltaTexto('2026-10-26', HOY), 'En 3 semanas');
});

test('la nota corta lleva SIEMPRE sus votos, o no se pinta', () => {
  assert.equal(notaCorta(4.75, 1), '4,8/5 (1)');
  assert.deepEqual(partesNota(5, 12), { valor: '5,0/5', votos: '(12)' });
  assert.equal(notaCorta(4.8, undefined), null);
  assert.equal(notaCorta(undefined, 3), null);
});
