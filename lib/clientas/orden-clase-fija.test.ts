import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clasesFijasPorClienta, compararPorClaseFija } from './orden-clase-fija.ts';
import type { PlazaFija } from '../types.ts';

function plaza(socioId: string, diaSemana: number, horaInicio: string, extra: Partial<PlazaFija> = {}): PlazaFija {
  return {
    id: `${socioId}-${diaSemana}-${horaInicio}`, studioId: 's', socioId, diaSemana, horaInicio, salaId: 'sala',
    tipoClaseId: null, spotId: null, vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'ACTIVA',
    creadaEn: '2026-01-01T00:00:00Z', ...extra,
  };
}
const c = (id: string, nombre: string) => ({ id, nombre });

test('manda la primera clase fija de la semana, con el lunes primero y el domingo al final', () => {
  const m = clasesFijasPorClienta([plaza('a', 0, '09:00:00'), plaza('a', 3, '18:30:00'), plaza('b', 0, '09:00:00')]);
  assert.equal(m.get('a')?.texto, 'mié 18:30 +1');
  assert.equal(m.get('b')?.texto, 'dom 09:00');
  assert.ok(m.get('a')!.clave < m.get('b')!.clave, 'el miércoles va antes que el domingo');
});

test('por día y luego por hora; dentro del mismo hueco, por nombre', () => {
  const fijas = clasesFijasPorClienta([
    plaza('lun10', 1, '10:00:00'), plaza('lun12', 1, '12:00:00'), plaza('mar8', 2, '08:00:00'), plaza('lun10b', 1, '10:00:00'),
  ]);
  const lista = [c('mar8', 'Zoe'), c('lun12', 'Ana'), c('lun10b', 'Marta'), c('lun10', 'Berta')];
  lista.sort((a, b) => compararPorClaseFija(a, b, fijas, 'asc'));
  assert.deepEqual(lista.map(x => x.id), ['lun10', 'lun10b', 'lun12', 'mar8']);
});

test('las que no tienen clase fija van siempre al final, también del revés', () => {
  const fijas = clasesFijasPorClienta([plaza('a', 1, '10:00:00'), plaza('b', 5, '10:00:00')]);
  for (const dir of ['asc', 'desc'] as const) {
    const lista = [c('sin', 'Aaa'), c('b', 'B'), c('a', 'A')];
    lista.sort((x, y) => compararPorClaseFija(x, y, fijas, dir));
    assert.equal(lista[2].id, 'sin', `dir ${dir}`);
  }
  const desc = [c('a', 'A'), c('b', 'B')].sort((x, y) => compararPorClaseFija(x, y, fijas, 'desc'));
  assert.deepEqual(desc.map(x => x.id), ['b', 'a']);
});

test('una clase fija dada de baja o ya vencida no cuenta', () => {
  const fijas = clasesFijasPorClienta([
    plaza('baja', 1, '10:00:00', { estado: 'BAJA' }),
    plaza('vencida', 1, '10:00:00', { vigenciaHasta: '2026-10-01' }),
    plaza('viva', 2, '10:00:00', { vigenciaHasta: '2026-12-01' }),
    plaza('pausada', 3, '10:00:00', { estado: 'PAUSADA' }),
  ], '2026-11-10');
  assert.equal(fijas.has('baja'), false);
  assert.equal(fijas.has('vencida'), false);
  assert.equal(fijas.has('viva'), true);
  assert.equal(fijas.has('pausada'), true, 'una pausada sigue siendo suya');
});
