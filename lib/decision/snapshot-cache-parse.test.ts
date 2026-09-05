import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsearSnapshotCacheado } from './snapshot-cache-parse.ts';

const snap = { studioId: 'studio-1', socios: [], reservas: [] };

test('un jsonb ya parseado (objeto) se acepta tal cual — el caso real de supabase-js', () => {
  const r = parsearSnapshotCacheado(snap);
  assert.equal(r?.studioId, 'studio-1');
  assert.deepEqual(r?.socios, []);
});

test('texto JSON también se acepta', () => {
  assert.equal(parsearSnapshotCacheado(JSON.stringify(snap))?.studioId, 'studio-1');
});

test('null/undefined (sin fila vigente) → null', () => {
  assert.equal(parsearSnapshotCacheado(null), null);
  assert.equal(parsearSnapshotCacheado(undefined), null);
});

test('basura → null, sin lanzar', () => {
  assert.equal(parsearSnapshotCacheado('{no es json'), null);
  assert.equal(parsearSnapshotCacheado(42), null);
  assert.equal(parsearSnapshotCacheado([snap]), null);
  assert.equal(parsearSnapshotCacheado({ studioId: 'x' }), null);
  assert.equal(parsearSnapshotCacheado({ socios: [] }), null);
});
