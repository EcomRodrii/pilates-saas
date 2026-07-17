import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applicationFeeAmount, applicationFeeBps } from './stripe-fees.ts';

// Aísla la env por caso: guarda, fija, restaura.
function conBps<T>(valor: string | undefined, fn: () => T): T {
  const prev = process.env.TENTARE_APPLICATION_FEE_BPS;
  if (valor === undefined) delete process.env.TENTARE_APPLICATION_FEE_BPS;
  else process.env.TENTARE_APPLICATION_FEE_BPS = valor;
  try { return fn(); } finally {
    if (prev === undefined) delete process.env.TENTARE_APPLICATION_FEE_BPS;
    else process.env.TENTARE_APPLICATION_FEE_BPS = prev;
  }
}

test('apagado por defecto: sin env → sin comisión', () => {
  conBps(undefined, () => {
    assert.equal(applicationFeeBps(), 0);
    assert.equal(applicationFeeAmount(8500), undefined);
  });
});

test('env inválida (no numérica, negativa, cero) → apagado', () => {
  for (const v of ['abc', '-100', '0', '']) {
    conBps(v, () => assert.equal(applicationFeeAmount(8500), undefined, `bps=${v}`));
  }
});

test('1% (100 bp) sobre 85,00 € → 85 céntimos', () => {
  conBps('100', () => {
    assert.equal(applicationFeeBps(), 100);
    assert.equal(applicationFeeAmount(8500), 85);
  });
});

test('0,5% (50 bp) sobre 85,00 € → 42 céntimos (floor, sin sobrecobrar)', () => {
  conBps('50', () => assert.equal(applicationFeeAmount(8500), 42));
});

test('importe no válido (<=0, NaN) → sin comisión aunque esté activa', () => {
  conBps('200', () => {
    assert.equal(applicationFeeAmount(0), undefined);
    assert.equal(applicationFeeAmount(-5), undefined);
    assert.equal(applicationFeeAmount(Number.NaN), undefined);
  });
});

test('comisión que redondea a 0 céntimos → undefined (Stripe rechaza fee 0)', () => {
  // 10 bp (0,1%) sobre 50 céntimos = 0,05 → floor 0 → undefined
  conBps('10', () => assert.equal(applicationFeeAmount(50), undefined));
});

test('env descabellada se acota al tope defensivo (50%)', () => {
  conBps('999999', () => {
    assert.equal(applicationFeeBps(), 5000);
    assert.equal(applicationFeeAmount(10000), 5000); // 50% de 100,00 €
  });
});
