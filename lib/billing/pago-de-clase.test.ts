import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  claveDePagoDeClase, decidirPagoDeClase, mismoContenido, SEGUNDOS_PREPARANDOSE, viaDeReferencia,
  type ContenidoPagoClase, type FilaPagoClase,
} from './pago-de-clase.ts';

// P06 · Fase A: un solo pago VIVO por persona y clase. Reabrir la hoja, el doble toque o dos
// dispositivos reutilizan el MISMO PaymentIntent; cambiar de plan o de código cancela el
// anterior antes de abrir otro; nunca dos cobrables de la misma clase.

const AHORA = Date.UTC(2026, 9, 6, 10, 0, 0);
const C: ContenidoPagoClase = { planId: 'plan-suelta', codigoDescuentoId: null, spotId: null, importeCentimos: 1500, via: 'pi' };
const fila = (o: Partial<FilaPagoClase> = {}): FilaPagoClase => ({
  id: 'pc-1', estado: 'ABIERTO', plan_id: 'plan-suelta', codigo_descuento_id: null, spot_id: null, importe_centimos: 1500,
  matricula_centimos: 0, cupo_matricula: false, referencia_stripe: 'pi_1', payment_intent_id: 'pi_1',
  creado_en: new Date(AHORA - 5 * 60_000).toISOString(), ...o,
});

test('sin pago vivo: se crea', () => {
  assert.equal(decidirPagoDeClase(null, C, AHORA), 'crear');
});

test('pagado (o pagándose en Stripe): ni otro cobro ni el mismo otra vez', () => {
  assert.equal(decidirPagoDeClase(fila({ estado: 'PAGADO' }), C, AHORA), 'en-curso');
  for (const e of ['succeeded', 'processing', 'requires_capture']) {
    assert.equal(decidirPagoDeClase(fila(), C, AHORA, e), 'en-curso', e);
  }
});

test('⚠️ un 3DS a medias NO es «pagado»: reciente, «a medias»; 10 min sin tocar DESDE SU ÚLTIMA ENTREGA, se cancela y se crea otro', () => {
  const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();
  assert.equal(decidirPagoDeClase(fila({ actualizado_en: hace(1) }), C, AHORA, 'requires_action'), 'a-medias');
  assert.equal(decidirPagoDeClase(fila({ actualizado_en: hace(11) }), C, AHORA, 'requires_action'), 'cancelar-y-crear');
  // Creada hace una hora pero se le acaba de entregar: no se le corta.
  assert.equal(decidirPagoDeClase(fila({ creado_en: hace(60), actualizado_en: hace(2) }), C, AHORA, 'requires_action'), 'a-medias');
});

test('con cobro: primero hay que mirarlo en Stripe; si no se puede, no se crea otro', () => {
  assert.equal(decidirPagoDeClase(fila(), C, AHORA), 'mirar-stripe');
  assert.equal(decidirPagoDeClase(fila(), C, AHORA, null), 'no-se-sabe');
  assert.equal(decidirPagoDeClase(fila(), C, AHORA, 'estado-raro'), 'no-se-sabe');
});

test('mismo contenido y todavía pagable: el MISMO cobro', () => {
  assert.equal(decidirPagoDeClase(fila(), C, AHORA, 'requires_payment_method'), 'reutilizar');
  assert.equal(decidirPagoDeClase(fila(), C, AHORA, 'requires_confirmation'), 'reutilizar');
});

test('contenido distinto (plan, código, sitio, importe o vía): se cancela el anterior antes de abrir otro', () => {
  for (const cambio of [
    { planId: 'plan-bono' }, { codigoDescuentoId: 'cod-1' }, { spotId: 'sp-3' }, { importeCentimos: 1200 }, { via: 'cs' as const },
  ]) {
    assert.equal(decidirPagoDeClase(fila(), { ...C, ...cambio }, AHORA, 'requires_payment_method'), 'cancelar-y-crear', JSON.stringify(cambio));
  }
  // Un cobro ya cancelado (el barrido, o lo canceló otra cosa): se cierra la fila y se abre otra.
  assert.equal(decidirPagoDeClase(fila(), C, AHORA, 'canceled'), 'cancelar-y-crear');
});

test('sin cobro todavía: otra petición lo está creando (<60 s); pasado ese rato, se recrea con la MISMA clave', () => {
  const reciente = fila({ payment_intent_id: null, referencia_stripe: null, creado_en: new Date(AHORA - 10_000).toISOString() });
  assert.equal(decidirPagoDeClase(reciente, C, AHORA), 'preparandose');
  const viejo = fila({ payment_intent_id: null, referencia_stripe: null, creado_en: new Date(AHORA - (SEGUNDOS_PREPARANDOSE + 1) * 1000).toISOString() });
  assert.equal(decidirPagoDeClase(viejo, C, AHORA), 'recrear');
  assert.equal(decidirPagoDeClase(viejo, { ...C, planId: 'otro' }, AHORA), 'cancelar-y-crear');
});

test('la clave de Stripe es el id de la fila: un reintento del mismo pago, el mismo cobro', () => {
  assert.equal(claveDePagoDeClase('pc-abc'), 'checkout-embebido-v3-pc-abc');
  assert.notEqual(claveDePagoDeClase('pc-abc'), claveDePagoDeClase('pc-abd'));
});

test('la vía sale de la referencia, y una fila sin referencia cuenta como Payment Element', () => {
  assert.equal(viaDeReferencia('pi_123'), 'pi');
  assert.equal(viaDeReferencia('cs_test_123'), 'cs');
  assert.equal(viaDeReferencia(null), null);
  assert.equal(mismoContenido(fila({ payment_intent_id: null, referencia_stripe: null }), C), true);
});
