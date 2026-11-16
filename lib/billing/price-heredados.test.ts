import test from 'node:test';
import assert from 'node:assert/strict';
import { planDePriceId, priceIdDe } from './billing.ts';

// 16-nov-2026: Estudio y Cadena suben de precio con Price NUEVOS. Los viejos se
// quedan vivos con sus suscripciones y el webhook tiene que seguir reconociéndolos.
function conEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const antes: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) { antes[k] = process.env[k]; if (vars[k] === undefined) delete process.env[k]; else process.env[k] = vars[k]; }
  try { fn(); } finally { for (const k of Object.keys(antes)) { if (antes[k] === undefined) delete process.env[k]; else process.env[k] = antes[k]; } }
}

test('el Price nuevo y los heredados dan el mismo plan', () => {
  conEnv({
    STRIPE_PRICE_BASE: 'price_base', STRIPE_PRICE_ESTUDIO: 'price_estudio_79', STRIPE_PRICE_CADENA: 'price_cadena_249',
    STRIPE_PRICE_ESTUDIO_LEGACY: 'price_estudio_59, price_estudio_59b', STRIPE_PRICE_CADENA_LEGACY: 'price_cadena_149',
  }, () => {
    assert.equal(planDePriceId('price_estudio_79'), 'ESTUDIO');
    assert.equal(planDePriceId('price_estudio_59'), 'ESTUDIO');
    assert.equal(planDePriceId('price_estudio_59b'), 'ESTUDIO');
    assert.equal(planDePriceId('price_cadena_149'), 'CADENA');
    assert.equal(planDePriceId('price_cadena_249'), 'CADENA');
    assert.equal(planDePriceId('price_base'), 'BASE');
  });
});

test('un Price heredado se reconoce pero nunca se vende', () => {
  conEnv({ STRIPE_PRICE_ESTUDIO: 'price_estudio_79', STRIPE_PRICE_ESTUDIO_LEGACY: 'price_estudio_59' }, () => {
    assert.equal(priceIdDe('ESTUDIO'), 'price_estudio_79');
  });
});

test('un Price desconocido no es de ningún plan, y sin heredados todo sigue igual', () => {
  conEnv({ STRIPE_PRICE_ESTUDIO: 'price_estudio_79', STRIPE_PRICE_ESTUDIO_LEGACY: undefined, STRIPE_PRICE_CADENA_LEGACY: undefined }, () => {
    assert.equal(planDePriceId('price_otro'), null);
    assert.equal(planDePriceId(null), null);
    assert.equal(planDePriceId(''), null);
  });
});
