import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claveEmocion, tocaHoy, type AlmacenDia } from './una-vez.ts';

function almacenFalso(): AlmacenDia & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return { datos, getItem: (k) => datos.get(k) ?? null, setItem: (k, v) => { datos.set(k, v); } };
}

test('una vez por clave y día; al día siguiente, otra vez', () => {
  const a = almacenFalso();
  const k = claveEmocion('amor', 'studio-1');
  assert.equal(tocaHoy(k, '2026-10-06', a), true);
  assert.equal(tocaHoy(k, '2026-10-06', a), false);
  assert.equal(tocaHoy(claveEmocion('orgullo', 'studio-1'), '2026-10-06', a), true, 'otra emoción es otra clave');
  assert.equal(tocaHoy(claveEmocion('amor', 'studio-2'), '2026-10-06', a), true, 'otro estudio es otra clave');
  assert.equal(tocaHoy(k, '2026-10-07', a), true);
  assert.equal(a.datos.size, 3, 'una entrada por emoción y estudio, no una por día');
});

test('si el almacenamiento falla o no apunta, no toca (mejor sin emoción que una por visita)', () => {
  assert.equal(tocaHoy('k', '2026-10-06', null), false);
  const lanza: AlmacenDia = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => {} };
  assert.equal(tocaHoy('k', '2026-10-06', lanza), false);
  const mudo: AlmacenDia = { getItem: () => null, setItem: () => {} };
  assert.equal(tocaHoy('k', '2026-10-06', mudo), false);
});
