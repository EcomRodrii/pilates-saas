import test from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import {
  idACancelar, cancelarSuscripcionAnteriorSiToca, planSueltoACancelarAlPasarACadena, sueltosQueCancelaCadena, type SedeConPlan,
} from './cancelar-suscripcion-anterior.ts';

test('sin metadata no hay nada que cancelar', () => {
  assert.equal(idACancelar({ metadata: {}, status: 'active' }), null);
  assert.equal(idACancelar({ metadata: null, status: 'active' }), null);
});

test('con metadata pero la nueva suscripción todavía no está viva, se espera', () => {
  for (const status of ['incomplete', 'incomplete_expired', 'canceled']) {
    assert.equal(idACancelar({ metadata: { cancelarSuscripcionAnterior: 'sub_vieja' }, status }), null, status);
  }
});

test('con metadata y la nueva suscripción viva (activa, en prueba, o con impago que Stripe sigue reintentando), se cancela', () => {
  for (const status of ['active', 'trialing', 'past_due', 'unpaid']) {
    assert.equal(idACancelar({ metadata: { cancelarSuscripcionAnterior: 'sub_vieja' }, status }), 'sub_vieja', status);
  }
});

test('cancela de verdad cuando toca', async () => {
  const llamadas: string[] = [];
  const stripeFalso = { subscriptions: { cancel: async (id: string) => { llamadas.push(id); return {} as never; } } };
  const r = await cancelarSuscripcionAnteriorSiToca(stripeFalso, { metadata: { cancelarSuscripcionAnterior: 'sub_vieja' }, status: 'active' });
  assert.deepEqual(llamadas, ['sub_vieja']);
  assert.deepEqual(r, { intentado: true });
});

test('nada que cancelar: ni siquiera llama a Stripe', async () => {
  let llamado = false;
  const stripeFalso = { subscriptions: { cancel: async () => { llamado = true; return {} as never; } } };
  const r = await cancelarSuscripcionAnteriorSiToca(stripeFalso, { metadata: {}, status: 'active' });
  assert.equal(llamado, false);
  assert.deepEqual(r, { intentado: false });
});

test('ya estaba cancelada (resource_missing): no es un error, cuenta como hecho', async () => {
  const stripeFalso = {
    subscriptions: { cancel: async () => { throw new Stripe.errors.StripeError({ code: 'resource_missing', type: 'invalid_request_error' }); } },
  };
  const r = await cancelarSuscripcionAnteriorSiToca(stripeFalso, { metadata: { cancelarSuscripcionAnterior: 'sub_vieja' }, status: 'active' });
  assert.deepEqual(r, { intentado: true });
});

test('un fallo real de Stripe se reporta, pero nunca lanza — no puede tirar el webhook', async () => {
  const boom = new Error('rate limited');
  const stripeFalso = { subscriptions: { cancel: async () => { throw boom; } } };
  const r = await cancelarSuscripcionAnteriorSiToca(stripeFalso, { metadata: { cancelarSuscripcionAnterior: 'sub_vieja' }, status: 'active' });
  assert.equal(r.intentado, true);
  assert.equal(r.errorInesperado, boom);
});

test('alta a CADENA: solo se cancela al confirmarse el plan suelto que la sede paga de verdad', () => {
  const sede = (subscription_status: string | null, subscription_id: string | null = 'sub_suelta') => ({ subscription_status, subscription_id });
  // Gratis (o gratis cerrado, o cancelada) con el id de una suscripción ya muerta: nada que cancelar.
  for (const st of ['gratis', 'gratis_cerrado', 'canceled', 'incomplete_expired', 'trial_expirado']) {
    assert.equal(planSueltoACancelarAlPasarACadena(sede(st)), null, st);
  }
  // Prueba local: 'trialing' sin suscripción de Stripe.
  assert.equal(planSueltoACancelarAlPasarACadena(sede('trialing', null)), null);
  // Viva o a medio pagar en Stripe: se cancela al confirmarse la cadena.
  for (const st of ['active', 'past_due', 'trialing', 'incomplete', 'unpaid']) {
    assert.equal(planSueltoACancelarAlPasarACadena(sede(st)), 'sub_suelta', st);
  }
});

// ── Lo que se avisa ANTES de pagar Cadena (decisión del fundador, 15-oct-2026) ──

const fila = (p: Partial<SedeConPlan> & { id: string }): SedeConPlan => ({
  nombre: null, plan: 'BASE', subscription_status: 'active', subscription_id: `sub_${p.id}`, current_period_end: '2026-11-03T10:00:00+00:00', ...p,
});

test('aviso de Cadena: nada que avisar si ninguna sede paga un plan suelto', () => {
  assert.deepEqual(sueltosQueCancelaCadena([
    fila({ id: 'esta', subscription_status: 'canceled' }),
    fila({ id: 'principal', subscription_status: 'gratis' }),
    fila({ id: 'otra', subscription_status: null, subscription_id: null }),
  ], 'esta'), []);
});

test('aviso de Cadena: el plan suelto pagado de otra sede, con su nombre, su plan y hasta cuándo está pagado', () => {
  assert.deepEqual(sueltosQueCancelaCadena([
    fila({ id: 'esta', subscription_status: 'canceled' }),
    fila({ id: 'principal', nombre: ' Sede Centro ', plan: 'BASE' }),
  ], 'esta'), [{ plan: 'BASE', otraSede: true, nombreSede: 'Sede Centro', pagadoHasta: '2026-11-03T10:00:00+00:00', pagoEnCurso: false }]);
});

test('aviso de Cadena: un primer pago aún en curso (incomplete) se marca, porque cancelar no lo detiene', () => {
  const [enCurso] = sueltosQueCancelaCadena([fila({ id: 'esta', subscription_status: 'incomplete' })], 'esta');
  assert.equal(enCurso.pagoEnCurso, true);
  for (const st of ['active', 'past_due', 'trialing', 'unpaid']) {
    const [s] = sueltosQueCancelaCadena([fila({ id: 'esta', subscription_status: st })], 'esta');
    assert.equal(s.pagoEnCurso, false, st);
  }
});

test('aviso de Cadena: el de la propia sede va primero y sin nombre', () => {
  const r = sueltosQueCancelaCadena([
    fila({ id: 'otra', nombre: 'Sede Norte', plan: 'ESTUDIO' }),
    fila({ id: 'esta', nombre: 'Sede Sur', plan: 'BASE', subscription_status: 'incomplete' }),
  ], 'esta');
  assert.deepEqual(r.map(s => [s.otraSede, s.nombreSede, s.plan]), [[false, null, 'BASE'], [true, 'Sede Norte', 'ESTUDIO']]);
});

test('aviso de Cadena: «lo pagado no se devuelve» solo de lo que está al día; de lo impagado o en prueba, solo que se cancela', () => {
  for (const st of ['past_due', 'trialing', 'unpaid', 'incomplete']) {
    const [s] = sueltosQueCancelaCadena([fila({ id: 'esta', subscription_status: st })], 'esta');
    assert.ok(s, st);
    assert.equal(s.pagadoHasta, null, st);
  }
});

test('aviso de Cadena: lo que el webhook no cancela no se avisa (sin id, la prueba local, una sede que ya sigue a la cadena)', () => {
  assert.deepEqual(sueltosQueCancelaCadena([
    fila({ id: 'a', subscription_id: null }),
    fila({ id: 'b', subscription_status: 'trialing', subscription_id: null }),
    fila({ id: 'c', plan: 'CADENA' }),
    fila({ id: 'd', plan: null }),
  ], 'a'), []);
});

test('aviso de Cadena: una sede sin nombre se dice igual, sin inventarlo', () => {
  const [s] = sueltosQueCancelaCadena([fila({ id: 'otra', nombre: '  ' })], 'esta');
  assert.equal(s.otraSede, true);
  assert.equal(s.nombreSede, null);
});
