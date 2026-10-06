import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cobroDeReciboAlumna, cobrosDeRecibosAlumna, leTocaPagarlaAElla, type ContextoCobroAlumna, type FilaReciboAlumna } from './cobro-recibo-alumna.ts';

const HOY = '2026-10-12';
const recibo = (c: Partial<FilaReciboAlumna> = {}): FilaReciboAlumna => ({
  id: 'rec-1', estado: 'PENDIENTE', importe: 89, importe_devuelto: 0, es_renovacion: true, proximo_reintento: null,
  fecha_vencimiento: '2026-10-05', suscripcion_id: 'sus-1', ...c,
});
const cuotaActiva = { estado: 'ACTIVA', fechaFin: '2026-10-04', tipoPlan: 'MENSUAL' };
const ctx = (c: Partial<ContextoCobroAlumna> = {}): ContextoCobroAlumna => ({
  pagableOnline: true, socio: {}, domiciliadaEnRemesa: false, cuotas: new Map([['sus-1', cuotaActiva]]),
  penalizaciones: new Map(), hoy: HOY, ...c,
});

test('una renovación pendiente sin cobro automático se paga desde la app (lo que ya ofrecía Bonos)', () => {
  assert.deepEqual(cobroDeReciboAlumna(recibo(), ctx()), { como: 'APP' });
});

test('cualquier recibo pendiente sin dueño del cobro también: no solo las renovaciones', () => {
  assert.deepEqual(cobroDeReciboAlumna(recibo({ es_renovacion: false, suscripcion_id: null }), ctx()), { como: 'APP' });
});

test('un FALLIDO y un DEVUELTO por el banco sin reintento son deuda que se puede pagar (lo que bloquea tiene que poder pagarse)', () => {
  assert.deepEqual(cobroDeReciboAlumna(recibo({ estado: 'FALLIDO' }), ctx()), { como: 'APP' });
  assert.deepEqual(cobroDeReciboAlumna(recibo({ estado: 'DEVUELTO' }), ctx()), { como: 'APP' });
});

test('lo que no es deuda no sale: cobrado, anulado, en el banco, reembolsado o de 0 €', () => {
  for (const estado of ['COBRADO', 'ANULADO', 'EN_CURSO']) assert.equal(cobroDeReciboAlumna(recibo({ estado }), ctx()), null);
  assert.equal(cobroDeReciboAlumna(recibo({ estado: 'DEVUELTO', importe_devuelto: 89 }), ctx()), null);
  assert.equal(cobroDeReciboAlumna(recibo({ reembolso_solicitado_en: '2026-10-01T10:00:00Z' }), ctx()), null);
  assert.equal(cobroDeReciboAlumna(recibo({ importe: 0 }), ctx()), null);
});

test('con reintento programado lo cobra el dunning: con SEPA, el banco; con tarjeta, la tarjeta. Nunca la app', () => {
  const r = recibo({ proximo_reintento: '2026-11-01T00:00:00.000Z' });
  assert.deepEqual(cobroDeReciboAlumna(r, ctx({ socio: { sepa_payment_method_id: 'pm_sepa', metodo_pago_preferido: 'SEPA' } })), { como: 'BANCO', via: 'sepa', desde: '2026-11-01' });
  assert.deepEqual(cobroDeReciboAlumna(r, ctx({ socio: { stripe_payment_method_id: 'pm_card' } })), { como: 'TARJETA', desde: '2026-11-01' });
  assert.deepEqual(cobroDeReciboAlumna(r, ctx({ socio: { sepa_payment_method_id: 'pm_sepa' } })), { como: 'BANCO', via: 'sepa', desde: '2026-11-01' });
});

test('con reintento programado pero sin método guardado, el dunning no lo cobrará nunca: lo paga ella', () => {
  assert.deepEqual(cobroDeReciboAlumna(recibo({ proximo_reintento: '2026-11-01T00:00:00Z' }), ctx()), { como: 'APP' });
});

test('con reintento programado en un estudio sin Stripe, el dunning no corre: no se dice «se cobrará solo»', () => {
  const r = recibo({ proximo_reintento: '2026-11-01T00:00:00Z' });
  assert.deepEqual(cobroDeReciboAlumna(r, ctx({ pagableOnline: false, socio: { stripe_payment_method_id: 'pm' } })), { como: 'ESTUDIO', motivo: 'sin-pago-online' });
});

test('un cobro en vuelo (datáfono o cargo off-session) no se vuelve a ofrecer', () => {
  assert.deepEqual(cobroDeReciboAlumna(recibo({ cobro_mostrador_pi: 'pi_1' }), ctx()), { como: 'EN_MARCHA' });
  assert.deepEqual(cobroDeReciboAlumna(recibo({ cobro_off_session_clave: 'k' }), ctx()), { como: 'EN_MARCHA' });
});

test('una domiciliada de un estudio con remesas: su PENDIENTE lo cobra el banco, sin inventar fecha', () => {
  assert.deepEqual(cobroDeReciboAlumna(recibo(), ctx({ domiciliadaEnRemesa: true })), { como: 'BANCO', via: 'remesa', desde: null });
  // Lo que el banco ya devolvió no vuelve solo a la remesa: ese sí lo paga ella.
  assert.deepEqual(cobroDeReciboAlumna(recibo({ estado: 'DEVUELTO' }), ctx({ domiciliadaEnRemesa: true })), { como: 'APP' });
});

test('la remesa no mete la renovación de una cuota cancelada (la paga ella) ni la de una aún sin vencer (irá cuando venza)', () => {
  const cancelada = ctx({ domiciliadaEnRemesa: true, cuotas: new Map([['sus-1', { ...cuotaActiva, estado: 'CANCELADA' }]]) });
  assert.deepEqual(cobroDeReciboAlumna(recibo(), cancelada), { como: 'APP' });
  const sinVencer = ctx({ domiciliadaEnRemesa: true, cuotas: new Map([['sus-1', { ...cuotaActiva, fechaFin: '2026-10-31' }]]) });
  assert.deepEqual(cobroDeReciboAlumna(recibo(), sinVencer), { como: 'BANCO', via: 'remesa', desde: null, cuandoVenza: true });
});

test('la renovación de una cuota en pausa no se paga desde la app, aunque tenga reintento programado', () => {
  const pausada = ctx({ cuotas: new Map([['sus-1', { ...cuotaActiva, estado: 'PAUSADA' }]]), socio: { stripe_payment_method_id: 'pm' } });
  assert.deepEqual(cobroDeReciboAlumna(recibo(), pausada), { como: 'ESTUDIO', motivo: 'cuota-en-pausa' });
  assert.deepEqual(cobroDeReciboAlumna(recibo({ proximo_reintento: '2026-11-01T00:00:00Z' }), pausada), { como: 'ESTUDIO', motivo: 'cuota-en-pausa' });
});

test('una penalización sin el cobro decidido no se ofrece (ni por la app ni «lo cobra tu banco»)', () => {
  const r = recibo({ id: 'rec-penaliz-1', es_renovacion: false, suscripcion_id: null });
  for (const estado of ['DETECTADA', 'PENDIENTE_APROBACION', 'OMITIDA_SIN_TARJETA']) {
    assert.deepEqual(cobroDeReciboAlumna(r, ctx({ penalizaciones: new Map([[r.id, estado]]) })), { como: 'ESTUDIO', motivo: 'pendiente-estudio' });
  }
  // Sin saber su estado, tampoco.
  assert.deepEqual(cobroDeReciboAlumna(r, ctx()), { como: 'ESTUDIO', motivo: 'pendiente-estudio' });
  // Con el cobro decidido, sí; y una FALLIDA de una domiciliada la paga ella (la remesa no la mete).
  assert.deepEqual(cobroDeReciboAlumna(r, ctx({ penalizaciones: new Map([[r.id, 'RECIBO_CREADO']]) })), { como: 'APP' });
  assert.deepEqual(cobroDeReciboAlumna(r, ctx({ domiciliadaEnRemesa: true, penalizaciones: new Map([[r.id, 'FALLIDA']]) })), { como: 'APP' });
  assert.deepEqual(cobroDeReciboAlumna(r, ctx({ domiciliadaEnRemesa: true, penalizaciones: new Map([[r.id, 'RECIBO_CREADO']]) })), { como: 'BANCO', via: 'remesa', desde: null });
});

test('un estudio sin pago online: se dice que se paga en el estudio', () => {
  assert.deepEqual(cobroDeReciboAlumna(recibo(), ctx({ pagableOnline: false })), { como: 'ESTUDIO', motivo: 'sin-pago-online' });
});

test('el mapa del payload solo lleva la deuda', () => {
  const m = cobrosDeRecibosAlumna([recibo({ id: 'a' }), recibo({ id: 'b', estado: 'COBRADO' })], ctx());
  assert.deepEqual(Object.keys(m), ['a']);
});

test('con un pago que abrió ella (Checkout) o un PaymentIntent suelto, ni la remesa ni el dunning lo cobran: lo paga ella', () => {
  const card = { stripe_payment_method_id: 'pm_card' };
  // Domiciliada: sin esto decía «Lo cobrará tu banco» de algo que la remesa no mete nunca (sesión abandonada de un bono).
  assert.deepEqual(cobroDeReciboAlumna(recibo({ checkout_session_id: 'cs_1' }), ctx({ domiciliadaEnRemesa: true })), { como: 'APP' });
  assert.deepEqual(cobroDeReciboAlumna(recibo({ stripe_payment_intent_id: 'pi_1' }), ctx({ domiciliadaEnRemesa: true })), { como: 'APP' });
  // Con reintento y tarjeta: el dunning salta los que llevan `checkout_session_id`.
  assert.deepEqual(cobroDeReciboAlumna(recibo({ checkout_session_id: 'cs_1', proximo_reintento: '2026-11-01T00:00:00Z' }), ctx({ socio: card })), { como: 'APP' });
  assert.deepEqual(cobroDeReciboAlumna(recibo({ checkout_session_id: 'cs_1' }), ctx({ pagableOnline: false })), { como: 'ESTUDIO', motivo: 'sin-pago-online' });
  // La pausa sigue mandando: abrir un pago no descongela la cuota.
  const pausada = ctx({ cuotas: new Map([['sus-1', { ...cuotaActiva, estado: 'PAUSADA' }]]) });
  assert.deepEqual(cobroDeReciboAlumna(recibo({ checkout_session_id: 'cs_1' }), pausada), { como: 'ESTUDIO', motivo: 'cuota-en-pausa' });
});

test('el reintento solo lo cobra el dunning en un PENDIENTE sin «sin reintentos» (lo que exige puedeIntentarCobro)', () => {
  const card = { stripe_payment_method_id: 'pm_card' };
  const r = { proximo_reintento: '2026-11-01T00:00:00Z' };
  assert.deepEqual(cobroDeReciboAlumna(recibo({ ...r, estado: 'FALLIDO' }), ctx({ socio: card })), { como: 'APP' });
  assert.deepEqual(cobroDeReciboAlumna(recibo({ ...r, estado: 'DEVUELTO' }), ctx({ socio: card })), { como: 'APP' });
  assert.deepEqual(cobroDeReciboAlumna(recibo({ ...r, tras_cancelar_cuota: 'SIN_REINTENTOS' }), ctx({ socio: card })), { como: 'APP' });
  assert.deepEqual(cobroDeReciboAlumna(recibo(r), ctx({ socio: card })), { como: 'TARJETA', desde: '2026-11-01' });
});

test('le toca pagarla a ella solo desde la app o, sin pago online, en el estudio: nadie más la va a cobrar', () => {
  assert.equal(leTocaPagarlaAElla({ como: 'APP' }), true);
  assert.equal(leTocaPagarlaAElla({ como: 'ESTUDIO', motivo: 'sin-pago-online' }), true);
  assert.equal(leTocaPagarlaAElla({ como: 'BANCO', via: 'remesa', desde: null }), false);
  assert.equal(leTocaPagarlaAElla({ como: 'BANCO', via: 'remesa', desde: null, cuandoVenza: true }), false);
  assert.equal(leTocaPagarlaAElla({ como: 'BANCO', via: 'sepa', desde: '2026-11-01' }), false);
  assert.equal(leTocaPagarlaAElla({ como: 'TARJETA', desde: '2026-11-01' }), false);
  assert.equal(leTocaPagarlaAElla({ como: 'EN_MARCHA' }), false);
  assert.equal(leTocaPagarlaAElla({ como: 'ESTUDIO', motivo: 'cuota-en-pausa' }), false);
  assert.equal(leTocaPagarlaAElla({ como: 'ESTUDIO', motivo: 'pendiente-estudio' }), false);
  assert.equal(leTocaPagarlaAElla(null), false);
  assert.equal(leTocaPagarlaAElla(undefined), false);
});

test('la renovación que acaba de crear el cron para una domiciliada sin tarjeta la cobra la remesa: no le toca a ella', () => {
  // Lo que crea `generarRecibosRenovacion` sin método guardado: PENDIENTE, sin reintento. Es el aviso que no debe salir.
  const recienCreada = recibo({ proximo_reintento: null });
  assert.equal(leTocaPagarlaAElla(cobroDeReciboAlumna(recienCreada, ctx({ domiciliadaEnRemesa: true }))), false);
  assert.equal(leTocaPagarlaAElla(cobroDeReciboAlumna(recienCreada, ctx())), true);
  assert.equal(leTocaPagarlaAElla(cobroDeReciboAlumna(recienCreada, ctx({ pagableOnline: false }))), true);
});
