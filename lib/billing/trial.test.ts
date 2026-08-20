import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRIAL_DIAS,
  diasRestantesHasta,
  finDeTrial,
  estadoTrial,
  trialVigente,
  mensajeTrial,
} from './trial.ts';

const AHORA = new Date('2026-08-19T10:00:00.000Z');
const enDias = (d: number) => new Date(AHORA.getTime() + d * 86_400_000).toISOString();

test('la prueba dura 7 días', () => {
  assert.equal(TRIAL_DIAS, 7);
  assert.equal(finDeTrial(AHORA).toISOString(), enDias(7));
});

test('el primer día quedan 7 días completos, no 6', () => {
  // El fallo clásico: redondear hacia abajo y estrenar la cuenta atrás en 6.
  const e = estadoTrial({ trialEndsAt: finDeTrial(AHORA).toISOString() }, AHORA);
  assert.equal(e.diasRestantes, 7);
  assert.equal(e.fase, 'PLENA');
  assert.equal(e.enPrueba, true);
});

test('quedan «1 día» hasta el último minuto, nunca «0 días» con prueba viva', () => {
  // Redondear hacia abajo diría "te quedan 0 días" durante las últimas 24 h:
  // falso, y en el peor momento para sonar a error.
  const casiFin = new Date(AHORA.getTime() + 60_000); // un minuto de vida
  assert.equal(diasRestantesHasta(casiFin, AHORA), 1);
  const e = estadoTrial({ trialEndsAt: casiFin.toISOString() }, AHORA);
  assert.equal(e.fase, 'ULTIMO_DIA');
  assert.equal(e.enPrueba, true);
  assert.equal(e.agotada, false);
});

test('cada tramo pedido tiene su propia fase', () => {
  const fase = (dias: number) => estadoTrial({ trialEndsAt: enDias(dias) }, AHORA).fase;
  assert.equal(fase(7), 'PLENA');
  assert.equal(fase(6), 'HOLGADA');
  assert.equal(fase(4), 'HOLGADA');
  assert.equal(fase(3), 'AVISO');
  assert.equal(fase(2), 'AVISO');
  assert.equal(fase(1), 'ULTIMO_DIA');
  assert.equal(fase(0), 'EXPIRADA');
  assert.equal(fase(-3), 'EXPIRADA');
});

test('prueba agotada: sin acceso, pero sin suscripción que la releve', () => {
  const e = estadoTrial({ trialEndsAt: enDias(-1) }, AHORA);
  assert.equal(e.enPrueba, false);
  assert.equal(e.agotada, true);
  assert.equal(e.diasRestantes, 0);
});

test('una suscripción de pago gana a la prueba aunque la columna siga puesta', () => {
  // Al convertir, el webhook de Stripe pone 'active' pero nadie limpia
  // trial_ends_at: si la prueba mandara, la píldora seguiría contando días a
  // un estudio que YA está pagando.
  for (const status of ['active', 'past_due']) {
    const e = estadoTrial({ trialEndsAt: enDias(3), subscriptionStatus: status }, AHORA);
    assert.equal(e.fase, 'SUSCRITO', status);
    assert.equal(e.enPrueba, false, status);
    assert.equal(e.agotada, false, status);
  }
});

test('«trialing» de Stripe (con subscription_id) NO es la prueba local', () => {
  // Los dos estados se llaman igual en la columna. Lo que los separa es que el
  // de Stripe trae subscription_id y lo mantiene vivo Stripe; el local caduca
  // solo. Confundirlos regalaría acceso indefinido.
  const stripe = estadoTrial(
    { trialEndsAt: enDias(-5), subscriptionStatus: 'trialing', subscriptionId: 'sub_123' },
    AHORA,
  );
  assert.equal(stripe.fase, 'SUSCRITO');
  assert.equal(stripe.agotada, false);

  const local = estadoTrial({ trialEndsAt: enDias(-5), subscriptionStatus: 'trialing' }, AHORA);
  assert.equal(local.fase, 'EXPIRADA');
  assert.equal(local.agotada, true);
});

test('un trial_ends_at ausente o roto no regala acceso ni lo quita por error', () => {
  for (const v of [null, undefined, '', 'no-es-una-fecha']) {
    const e = estadoTrial({ trialEndsAt: v as string | null }, AHORA);
    assert.equal(e.enPrueba, false);
    assert.equal(e.finaliza, null);
    // `agotada` false: sin prueba local no hay nada que "agotar" — quien decide
    // el bloqueo de estos estudios sigue siendo la suscripción, como siempre.
    assert.equal(e.agotada, false);
  }
});

test('⚠️ «nunca tuvo prueba» NO es «prueba agotada»', () => {
  // 7 de los 12 estudios de producción son anteriores a la apertura al público:
  // `trial_ends_at` a NULL y sin suscripción. Si cayeran en EXPIRADA, a todos
  // ellos les saldría un aviso ROJO de «prueba finalizada» por una prueba que
  // nunca existió. Son estados distintos y tienen que seguir siéndolo.
  const nuevo = estadoTrial({ trialEndsAt: null, subscriptionStatus: null }, AHORA);
  assert.equal(nuevo.fase, 'SIN_PRUEBA');

  const agotado = estadoTrial({ trialEndsAt: enDias(-1) }, AHORA);
  assert.equal(agotado.fase, 'EXPIRADA');
  assert.notEqual(nuevo.fase, agotado.fase);
});

test('trialVigente responde lo mismo que estadoTrial', () => {
  assert.equal(trialVigente({ trialEndsAt: enDias(2) }, AHORA), true);
  assert.equal(trialVigente({ trialEndsAt: enDias(-2) }, AHORA), false);
  assert.equal(trialVigente({ trialEndsAt: enDias(2), subscriptionStatus: 'active' }, AHORA), false);
});

test('el copy concuerda en número: «1 día», no «1 días»', () => {
  assert.match(mensajeTrial(estadoTrial({ trialEndsAt: enDias(2) }, AHORA)).titulo, /2 días/);
  // Con 1 día el titular deja de contar y nombra el momento.
  assert.match(mensajeTrial(estadoTrial({ trialEndsAt: enDias(1) }, AHORA)).titulo, /último día/);
  assert.doesNotMatch(mensajeTrial(estadoTrial({ trialEndsAt: enDias(1) }, AHORA)).titulo, /1 días/);
});

test('ningún estado se queda sin mensaje', () => {
  for (const dias of [7, 6, 3, 1, 0, -4]) {
    const m = mensajeTrial(estadoTrial({ trialEndsAt: enDias(dias) }, AHORA));
    assert.ok(m.titulo.length > 0 && m.detalle.length > 0, `dias=${dias}`);
  }
  for (const entrada of [{ subscriptionStatus: 'active' }, { trialEndsAt: null }]) {
    const m = mensajeTrial(estadoTrial(entrada, AHORA));
    assert.ok(m.titulo.length > 0 && m.detalle.length > 0, JSON.stringify(entrada));
  }
});
