import { test } from 'node:test';
import assert from 'node:assert/strict';
import { textoCobroEnLote } from './texto-cobro-en-lote.ts';

test('cuenta lo cobrado de verdad', () => {
  assert.equal(textoCobroEnLote(1, []), '1 recibo cobrado');
  assert.equal(textoCobroEnLote(3, []), '3 recibos cobrados');
});

test('⚠️ una penalización anulada saltada se dice, con su importe', () => {
  assert.match(textoCobroEnLote(2, [{ importe: 12 }]), /^2 recibos cobrados\. 1 no \(12,00\s€\): es una penalización anulada y no se cobra\.$/);
  assert.match(textoCobroEnLote(0, [{ importe: 5 }, { importe: 7.5 }]), /^0 recibos cobrados\. 2 no \(12,50\s€\): son penalizaciones anuladas y no se cobran\.$/);
});
