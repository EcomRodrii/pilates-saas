import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estaPagada, queEntregar, pendientesDeEntregar, type SesionCobrada } from './conciliar-sesiones.ts';

function ses(p: Partial<SesionCobrada> = {}): SesionCobrada {
  return {
    id: 'cs_live_abc123',
    status: 'complete',
    paymentStatus: 'paid',
    metadata: { studioId: 'studio-1', planId: 'plan-3' },
    ...p,
  };
}

const VACIO = { recibosCobrados: new Set<string>(), sesionesEntregadas: new Set<string>() };

// ── Qué cuenta como dinero que entró ────────────────────────────────────────

test('completada y pagada: sí', () => {
  assert.equal(estaPagada(ses()), true);
});

test('⚠️ completada SIN pagar no cuenta', () => {
  // Una sesión puede completarse sin pago (importe diferido, método pendiente
  // de confirmar). Entregar aquí sería regalar el bono.
  assert.equal(estaPagada(ses({ paymentStatus: 'unpaid' })), false);
  assert.equal(estaPagada(ses({ paymentStatus: 'no_payment_required' })), false);
});

test('abierta o caducada no cuenta', () => {
  assert.equal(estaPagada(ses({ status: 'open' })), false);
  assert.equal(estaPagada(ses({ status: 'expired' })), false);
});

// ── Qué hay que entregar ────────────────────────────────────────────────────

test('compra de plan', () => {
  const p = queEntregar(ses(), 'studio-1');
  assert.deepEqual(p, {
    sesionId: 'cs_live_abc123', tipo: 'plan', studioId: 'studio-1', planId: 'plan-3', socioId: null,
  });
});

test('pago de un recibo existente manda sobre el plan', () => {
  const p = queEntregar(ses({ metadata: { studioId: 'studio-1', reciboId: 'rec-9', planId: 'plan-3' } }), 'studio-1');
  assert.equal(p?.tipo, 'recibo');
});

test('sin reciboId ni planId no hay nada que entregar', () => {
  // Es el caso del alta de mandato SEPA: guarda un método de pago, no vende nada.
  assert.equal(queEntregar(ses({ metadata: { studioId: 'studio-1' } }), 'studio-1'), null);
  assert.equal(queEntregar(ses({ metadata: null }), 'studio-1'), null);
});

test('⚠️ la metadata NO decide de qué estudio es', () => {
  // El estudio lo sabe quien llama, porque ha sacado la sesión de SU cuenta
  // conectada. Si la metadata nombra a otro, la sesión se ignora en vez de
  // entregarse al equivocado — mismo criterio que `tenantAutorizado`.
  assert.equal(queEntregar(ses({ metadata: { studioId: 'studio-otro', planId: 'plan-3' } }), 'studio-1'), null);
});

test('metadata sin studioId: manda la cuenta de la que salió', () => {
  const p = queEntregar(ses({ metadata: { planId: 'plan-3' } }), 'studio-1');
  assert.equal(p?.studioId, 'studio-1');
});

// ── El filtro completo ──────────────────────────────────────────────────────

test('lo ya entregado no se vuelve a entregar', () => {
  const s = ses();
  const yaHecho = { recibosCobrados: new Set<string>(), sesionesEntregadas: new Set([s.id]) };
  assert.deepEqual(pendientesDeEntregar([s], 'studio-1', yaHecho), []);
});

test('un recibo ya COBRADO no se vuelve a marcar', () => {
  const s = ses({ metadata: { studioId: 'studio-1', reciboId: 'rec-9' } });
  const yaHecho = { recibosCobrados: new Set(['rec-9']), sesionesEntregadas: new Set<string>() };
  assert.deepEqual(pendientesDeEntregar([s], 'studio-1', yaHecho), []);
});

test('⚠️ el caso que motiva todo esto: cobrado y sin entregar', () => {
  // Stripe dice pagado, la base de datos no tiene ni recibo ni entrega. Es
  // exactamente el estado en que quedaron los dos cobros perdidos del 7 y el 8
  // de agosto de 2026.
  const pendientes = pendientesDeEntregar([ses()], 'studio-1', VACIO);
  assert.equal(pendientes.length, 1);
  assert.equal(pendientes[0].tipo, 'plan');
});

test('mezcla realista: solo sale lo que falta', () => {
  const sesiones = [
    ses({ id: 'cs_live_1' }),                                                    // falta
    ses({ id: 'cs_live_2', paymentStatus: 'unpaid' }),                           // no pagada
    ses({ id: 'cs_live_3', metadata: { studioId: 'studio-1', reciboId: 'r1' } }), // recibo ya cobrado
    ses({ id: 'cs_live_4', metadata: { studioId: 'studio-1' } }),                 // mandato SEPA
    ses({ id: 'cs_live_5' }),                                                    // ya entregada
  ];
  const yaHecho = { recibosCobrados: new Set(['r1']), sesionesEntregadas: new Set(['cs_live_5']) };
  const pendientes = pendientesDeEntregar(sesiones, 'studio-1', yaHecho);
  assert.deepEqual(pendientes.map(p => p.sesionId), ['cs_live_1']);
});
