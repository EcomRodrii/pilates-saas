import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ABANDONO_PI_SEGUNDOS,
  pisAbandonadosConPlaza,
  plazaDePICancelado,
  plazaDeSesionCaducada,
} from './cupo-matricula-abandonado.ts';

const MD_B = { origen: 'plan_web_embebido', cupoMatriculaReservado: '1', planId: 'plan-1', studioId: 'studio-1' };
const AHORA = 1_800_000_000;

// ── Modo A ──────────────────────────────────────────────────────────────────

test('Modo A: sesión caducada con plaza → se devuelve con la SESIÓN como clave', () => {
  assert.deepEqual(
    plazaDeSesionCaducada({ id: 'cs_1', status: 'expired', metadata: { cupoMatriculaReservado: '1', planId: 'plan-1' } }),
    { clave: 'cs_1', planId: 'plan-1' },
  );
});

test('Modo A: sesión abierta, pagada o sin plaza → nada', () => {
  const md = { cupoMatriculaReservado: '1', planId: 'plan-1' };
  assert.equal(plazaDeSesionCaducada({ id: 'cs_1', status: 'open', metadata: md }), null);
  assert.equal(plazaDeSesionCaducada({ id: 'cs_1', status: 'complete', metadata: md }), null);
  assert.equal(plazaDeSesionCaducada({ id: 'cs_1', status: 'expired', metadata: { planId: 'plan-1' } }), null);
  assert.equal(plazaDeSesionCaducada({ id: 'cs_1', status: 'expired', metadata: { cupoMatriculaReservado: '1' } }), null);
  assert.equal(plazaDeSesionCaducada({ id: 'cs_1', status: 'expired', metadata: null }), null);
});

// ── Modo B: cancelado ───────────────────────────────────────────────────────

test('Modo B: PI cancelado con plaza → se devuelve con el PI como clave', () => {
  assert.deepEqual(plazaDePICancelado({ id: 'pi_1', status: 'canceled', metadata: MD_B }), { clave: 'pi_1', planId: 'plan-1' });
});

test('⚠️ Modo B: un PI RECHAZADO no devuelve la plaza — admite otro intento y puede acabar cobrado', () => {
  // Es el bug: tras `payment_intent.payment_failed` el PI vuelve aquí.
  assert.equal(plazaDePICancelado({ id: 'pi_1', status: 'requires_payment_method', metadata: MD_B }), null);
  assert.equal(plazaDePICancelado({ id: 'pi_1', status: 'succeeded', metadata: MD_B }), null);
  assert.equal(plazaDePICancelado({ id: 'pi_1', status: 'processing', metadata: MD_B }), null);
});

test('Modo B: solo el checkout embebido — un PI cancelado de otra vía no toca el cupo', () => {
  assert.equal(plazaDePICancelado({ id: 'pi_1', status: 'canceled', metadata: { ...MD_B, origen: 'pos_bizum' } }), null);
  assert.equal(plazaDePICancelado({ id: 'pi_1', status: 'canceled', metadata: { ...MD_B, cupoMatriculaReservado: '0' } }), null);
});

// ── Modo B: abandonado ──────────────────────────────────────────────────────

test('Modo B: PI cobrable con plaza y más viejo que el umbral → candidato a cancelar', () => {
  for (const status of ['requires_payment_method', 'requires_confirmation', 'requires_action']) {
    const pi = { id: 'pi_1', status, created: AHORA - ABANDONO_PI_SEGUNDOS, metadata: MD_B };
    assert.deepEqual(pisAbandonadosConPlaza([pi], AHORA), [pi], status);
  }
});

test('Modo B: un PI reciente no se cancela — la socia puede seguir delante del pago', () => {
  const pi = { id: 'pi_1', status: 'requires_payment_method', created: AHORA - ABANDONO_PI_SEGUNDOS + 1, metadata: MD_B };
  assert.deepEqual(pisAbandonadosConPlaza([pi], AHORA), []);
});

test('Modo B: nunca se intenta cancelar lo cobrado, lo que se está cobrando o lo ya cancelado', () => {
  const viejo = AHORA - 10 * ABANDONO_PI_SEGUNDOS;
  const pis = ['succeeded', 'processing', 'canceled', 'requires_capture'].map(status => ({ id: status, status, created: viejo, metadata: MD_B }));
  assert.deepEqual(pisAbandonadosConPlaza(pis, AHORA), []);
});

test('Modo B: sin plaza, sin plan o de otra vía → no se cancela nada', () => {
  const viejo = AHORA - 10 * ABANDONO_PI_SEGUNDOS;
  const base = { id: 'pi_1', status: 'requires_payment_method', created: viejo };
  assert.deepEqual(pisAbandonadosConPlaza([
    { ...base, metadata: { ...MD_B, cupoMatriculaReservado: undefined as unknown as string } },
    { ...base, metadata: { ...MD_B, planId: '' } },
    { ...base, metadata: { ...MD_B, origen: 'plan_web' } },
    { ...base, metadata: null },
  ], AHORA), []);
});
