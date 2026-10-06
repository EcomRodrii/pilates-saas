import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MINUTOS_ABANDONO, MINUTOS_ABANDONO_COBRO, MINUTOS_REINTENTO_PAGADO, queHacerEnElBarrido, type FilaBarrido } from './barrido-pagos-clase.ts';

// P06 · Fase A: el barrido del conciliador cierra lo que el webhook no cerró.

const AHORA = Date.UTC(2026, 9, 6, 12, 0, 0);
const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();
const fila = (o: Partial<FilaBarrido> = {}): FilaBarrido => ({
  id: 'pc-1', estado: 'ABIERTO', socio_id: 's1', sesion_id: 'ses-1', spot_id: null, payment_intent_id: 'pi_1',
  creado_en: hace(60), actualizado_en: hace(60), ...o,
});

test('PAGADO: se reintenta la reserva pasado el margen (el webhook pudo morir), no antes', () => {
  assert.equal(queHacerEnElBarrido(fila({ estado: 'PAGADO', actualizado_en: hace(MINUTOS_REINTENTO_PAGADO + 1) }), AHORA, undefined, true), 'reservar');
  assert.equal(queHacerEnElBarrido(fila({ estado: 'PAGADO', actualizado_en: hace(2) }), AHORA, undefined, true), 'nada');
});

test('ABIERTO con el cobro pagado en Stripe: reservar si el plan ya está entregado; si no, lo entrega antes el conciliador', () => {
  assert.equal(queHacerEnElBarrido(fila(), AHORA, 'succeeded', true), 'reservar');
  assert.equal(queHacerEnElBarrido(fila(), AHORA, 'succeeded', false), 'nada');
});

test('ABIERTO abandonado: se cancela en Stripe 2 h después de su ÚLTIMA entrega; procesando o 3DS a medias, nunca (al final de la cola)', () => {
  assert.equal(MINUTOS_ABANDONO_COBRO, 120, 'las 2 h del barrido de matrícula (ABANDONO_PI_SEGUNDOS)');
  for (const e of ['requires_payment_method', 'requires_confirmation']) {
    assert.equal(queHacerEnElBarrido(fila({ creado_en: hace(300), actualizado_en: hace(MINUTOS_ABANDONO_COBRO + 1) }), AHORA, e), 'cancelar-cobro', e);
    // Creado hace mucho pero se le acaba de volver a entregar (reabrió la hoja): no se toca.
    assert.equal(queHacerEnElBarrido(fila({ creado_en: hace(300), actualizado_en: hace(5) }), AHORA, e), 'nada', e);
    assert.equal(queHacerEnElBarrido(fila({ actualizado_en: hace(60) }), AHORA, e), 'nada', `${e}: 1 h no es abandono`);
  }
  for (const e of ['processing', 'requires_action', 'requires_capture']) {
    assert.equal(queHacerEnElBarrido(fila({ actualizado_en: hace(500) }), AHORA, e), 'al-final', e);
  }
  assert.equal(queHacerEnElBarrido(fila(), AHORA, null), 'nada', 'sin poder mirarlo, no se toca');
});

test('ABIERTO ya cancelado en Stripe, o sin cobro hace 45 min: se cierra la fila', () => {
  assert.equal(queHacerEnElBarrido(fila(), AHORA, 'canceled'), 'cerrar-sin-cobro');
  assert.equal(queHacerEnElBarrido(fila({ payment_intent_id: null, actualizado_en: hace(MINUTOS_ABANDONO + 1) }), AHORA, undefined), 'cerrar-sin-cobro');
  assert.equal(queHacerEnElBarrido(fila({ payment_intent_id: null, actualizado_en: hace(5) }), AHORA, undefined), 'nada');
});

test('lo ya resuelto no se toca', () => {
  for (const estado of ['RESERVADA', 'COMPENSADA', 'CANCELADO', 'REEMBOLSADA', 'CERRADA']) {
    assert.equal(queHacerEnElBarrido(fila({ estado }), AHORA, 'succeeded', true), 'nada', estado);
  }
});
