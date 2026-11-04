import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isEligibleForReviewBoost, debeReaparecer, debeMostrarModal, type SenalesReviewBoost,
} from './review-boost.ts';

const BASE: SenalesReviewBoost = {
  diasDeUso: 20,
  numReservasConfirmadas: 5,
  numSesiones: 3,
  numSocios: 4,
  numPlanesTarifa: 1,
  ticketsSoporteRecientes: 0,
  yaMostrado: false,
  yaDioFeedback: false,
  yaRecompensado: false,
};

test('elegible cuando todas las señales están OK', () => {
  assert.equal(isEligibleForReviewBoost(BASE), true);
});

test('no elegible con pocos días de uso o sin saberlos', () => {
  assert.equal(isEligibleForReviewBoost({ ...BASE, diasDeUso: 13 }), false);
  assert.equal(isEligibleForReviewBoost({ ...BASE, diasDeUso: 14 }), true);
  assert.equal(isEligibleForReviewBoost({ ...BASE, diasDeUso: null }), false);
});

test('Stripe conectado ya no hace falta: con uso real basta (Founding Studio gratis casi no lo conecta)', () => {
  assert.equal(isEligibleForReviewBoost(BASE), true);
});

test('no elegible sin clases, socias o planes', () => {
  assert.equal(isEligibleForReviewBoost({ ...BASE, numSesiones: 0 }), false);
  assert.equal(isEligibleForReviewBoost({ ...BASE, numSocios: 0 }), false);
  assert.equal(isEligibleForReviewBoost({ ...BASE, numPlanesTarifa: 0 }), false);
});

test('no elegible por debajo del umbral de reservas', () => {
  assert.equal(isEligibleForReviewBoost({ ...BASE, numReservasConfirmadas: 4 }), false);
});

test('no elegible con tickets de soporte recientes', () => {
  assert.equal(isEligibleForReviewBoost({ ...BASE, ticketsSoporteRecientes: 1 }), false);
});

test('no elegible si ya se mostró, ya dio feedback, o ya fue recompensado', () => {
  assert.equal(isEligibleForReviewBoost({ ...BASE, yaMostrado: true }), false);
  assert.equal(isEligibleForReviewBoost({ ...BASE, yaDioFeedback: true }), false);
  assert.equal(isEligibleForReviewBoost({ ...BASE, yaRecompensado: true }), false);
});

test('debeReaparecer: no antes de 14 días', () => {
  const hace10dias = new Date(Date.now() - 10 * 86_400_000).toISOString();
  assert.equal(debeReaparecer(hace10dias, 1), false);
});

test('debeReaparecer: sí pasados 14 días, y solo bajo el tope de veces', () => {
  const hace15dias = new Date(Date.now() - 15 * 86_400_000).toISOString();
  assert.equal(debeReaparecer(hace15dias, 1), true);
  assert.equal(debeReaparecer(hace15dias, 2), false); // ya en el tope
});

test('debeReaparecer: sin pospuestoEn, no reaparece', () => {
  assert.equal(debeReaparecer(null, 0), false);
});

test('debeMostrarModal: primera vez basta con estar elegible', () => {
  assert.equal(debeMostrarModal({
    reviewBoostElegibleEn: '2026-08-10T00:00:00.000Z',
    reviewBoostMostradoEn: null, reviewBoostPospuestoEn: null, reviewBoostVecesMostrado: 0,
  }), true);
});

test('debeMostrarModal: sin elegibilidad marcada, nunca', () => {
  assert.equal(debeMostrarModal({
    reviewBoostElegibleEn: null,
    reviewBoostMostradoEn: null, reviewBoostPospuestoEn: null, reviewBoostVecesMostrado: 0,
  }), false);
});

test('debeMostrarModal: ya mostrado y sin pospuesto, no se repite', () => {
  assert.equal(debeMostrarModal({
    reviewBoostElegibleEn: '2026-08-10T00:00:00.000Z',
    reviewBoostMostradoEn: '2026-08-10T00:00:00.000Z', reviewBoostPospuestoEn: null, reviewBoostVecesMostrado: 1,
  }), false);
});
