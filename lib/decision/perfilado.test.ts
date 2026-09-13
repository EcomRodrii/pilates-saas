import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sinSociasOpuestas } from './perfilado.ts';

const c = (id: string, socioId?: string | null) => ({ id, socioId });

test('quita las candidatas que señalan a una socia opuesta al perfilado', () => {
  const r = sinSociasOpuestas([c('a', 's1'), c('b', 's2'), c('c', 's1')], new Set(['s1']));
  assert.deepEqual(r.map(x => x.id), ['b']);
});

test('no toca las candidatas de estudio (sin socioId): la oposición no borra lo agregado', () => {
  const r = sinSociasOpuestas([c('clase-llena'), c('franja', null), c('b', 's1')], new Set(['s1']));
  assert.deepEqual(r.map(x => x.id), ['clase-llena', 'franja']);
});

test('sin ninguna socia opuesta, devuelve lo mismo', () => {
  const items = [c('a', 's1'), c('b')];
  assert.equal(sinSociasOpuestas(items, new Set()), items);
});
