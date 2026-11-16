import test from 'node:test';
import assert from 'node:assert/strict';
import { addonDePriceId, anualDisponible, complementosALaVenta, intervaloDePrice, planDePriceId, priceIdDe, priceIdDeAddon } from './billing.ts';

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

// ── Pago anual (16-nov-2026) ─────────────────────────────────────────────────


const ENV_ANUAL = {
  STRIPE_PRICE_BASE: 'p_base', STRIPE_PRICE_ESTUDIO: 'p_est', STRIPE_PRICE_CADENA: 'p_cad',
  STRIPE_PRICE_BASE_ANUAL: 'p_base_a', STRIPE_PRICE_ESTUDIO_ANUAL: 'p_est_a', STRIPE_PRICE_CADENA_ANUAL: 'p_cad_a',
  STRIPE_PRICE_ADDON_DECISIONES: 'a_dec', STRIPE_PRICE_ADDON_DECISIONES_ANUAL: 'a_dec_a',
  STRIPE_PRICE_ADDON_SUSTITUCIONES: 'a_sus', STRIPE_PRICE_ADDON_SUSTITUCIONES_ANUAL: 'a_sus_a',
  STRIPE_PRICE_ADDON_IA: 'a_ia', STRIPE_PRICE_ADDON_IA_ANUAL: 'a_ia_a',
};

test('el Price anual de un plan o de un complemento se reconoce igual que el mensual', () => {
  conEnv(ENV_ANUAL, () => {
    assert.equal(planDePriceId('p_est_a'), 'ESTUDIO');
    assert.equal(planDePriceId('p_cad_a'), 'CADENA');
    assert.equal(planDePriceId('p_base_a'), 'BASE');
    assert.equal(addonDePriceId('a_dec_a'), 'decisiones');
    assert.equal(addonDePriceId('a_sus_a'), 'sustituciones');
    assert.equal(addonDePriceId('a_ia_a'), 'ia');
    // Y se vende el del periodo pedido, nunca el otro.
    assert.equal(priceIdDe('ESTUDIO', 'anual'), 'p_est_a');
    assert.equal(priceIdDe('ESTUDIO'), 'p_est');
    assert.equal(priceIdDeAddon('ia', 'anual'), 'a_ia_a');
    assert.equal(priceIdDeAddon('ia'), 'a_ia');
  });
});

test('el anual solo se ofrece con los TRES precios anuales, y los complementos anuales con los tres', () => {
  conEnv(ENV_ANUAL, () => {
    assert.equal(anualDisponible(), true);
    assert.equal(complementosALaVenta('anual'), true);
  });
  conEnv({ ...ENV_ANUAL, STRIPE_PRICE_CADENA_ANUAL: undefined, STRIPE_PRICE_ADDON_IA_ANUAL: undefined }, () => {
    assert.equal(anualDisponible(), false, 'falta Cadena anual');
    assert.equal(complementosALaVenta('anual'), false, 'falta el complemento de IA anual');
    assert.equal(complementosALaVenta('mensual'), true, 'el mensual no depende del anual');
  });
  conEnv({ STRIPE_PRICE_BASE_ANUAL: undefined, STRIPE_PRICE_ESTUDIO_ANUAL: undefined, STRIPE_PRICE_CADENA_ANUAL: undefined }, () => {
    assert.equal(anualDisponible(), false);
  });
});

test('el periodo de un Price de Stripe: un año es anual y lo demás, mensual', () => {
  assert.equal(intervaloDePrice({ interval: 'year', interval_count: 1 }), 'anual');
  assert.equal(intervaloDePrice({ interval: 'year' }), 'anual');
  assert.equal(intervaloDePrice({ interval: 'month', interval_count: 1 }), 'mensual');
  assert.equal(intervaloDePrice({ interval: 'year', interval_count: 2 }), 'mensual');
  assert.equal(intervaloDePrice(null), 'mensual');
  assert.equal(intervaloDePrice(undefined), 'mensual');
});
