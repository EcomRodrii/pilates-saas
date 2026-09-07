import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codigosYaUsadosPorSocia } from './codigos-ya-usados.ts';

function fakeAdmin(opts: { filas?: { codigo_id: string }[]; error?: string } = {}) {
  return {
    from(_tabla: string) {
      return {
        select: () => ({
          eq: () => Promise.resolve(
            opts.error ? { data: null, error: { message: opts.error } } : { data: opts.filas ?? [], error: null },
          ),
        }),
      };
    },
  } as never;
}

test('sin socioId (invitada sin ficha todavía): set vacío, sin consultar nada', async () => {
  const r = await codigosYaUsadosPorSocia(fakeAdmin({ filas: [{ codigo_id: 'c-1' }] }), null);
  assert.deepEqual(r, new Set());
});

test('devuelve los ids de código que esta socia ya ha usado', async () => {
  const r = await codigosYaUsadosPorSocia(fakeAdmin({ filas: [{ codigo_id: 'c-1' }, { codigo_id: 'c-2' }] }), 'soc-1');
  assert.deepEqual(r, new Set(['c-1', 'c-2']));
});

test('sin ningún consumo: set vacío', async () => {
  const r = await codigosYaUsadosPorSocia(fakeAdmin({ filas: [] }), 'soc-1');
  assert.deepEqual(r, new Set());
});

test('fail-open: un fallo de lectura no bloquea la compra, set vacío', async () => {
  const r = await codigosYaUsadosPorSocia(fakeAdmin({ error: 'conexión perdida' }), 'soc-1');
  assert.deepEqual(r, new Set());
});
