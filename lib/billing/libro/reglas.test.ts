import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  eventosDeSuscripcion, filaDeFactura, filaDeIncidente, fotoDeSuscripcion, mrrListaCents,
  type InvoiceMinima, type LineaPrecio, type MapaPrecios,
} from './reglas.ts';

const mapa: MapaPrecios = {
  plan: (p) => ({ p_base_m: 'BASE', p_est_m: 'ESTUDIO', p_est_a: 'ESTUDIO' } as Record<string, string>)[p ?? ''] ?? null,
  addon: (p) => ({ a_cdc: 'decisiones', a_ia: 'ia' } as Record<string, string>)[p ?? ''] ?? null,
};
const mes = (priceId: string, cents: number): LineaPrecio => ({ priceId, unitAmount: cents, interval: 'month', intervalCount: 1, quantity: 1 });
const anio = (priceId: string, cents: number): LineaPrecio => ({ priceId, unitAmount: cents, interval: 'year', intervalCount: 1, quantity: 1 });

test('el MRR de lista lleva el anual a mes y suma las líneas', () => {
  assert.equal(mrrListaCents([mes('p_base_m', 2900), mes('a_cdc', 2200)]), 5100);
  assert.equal(mrrListaCents([anio('p_est_a', 79000)]), 6583); // 790 €/año = 65,83 €/mes
});

test('un precio que no se puede llevar a un mes da null, no un MRR inventado', () => {
  assert.equal(mrrListaCents([{ priceId: 'x', unitAmount: 500, interval: 'week', intervalCount: 1, quantity: 1 }]), null);
  assert.equal(mrrListaCents([{ priceId: 'x', unitAmount: null, interval: 'month', intervalCount: 1, quantity: 1 }]), null);
});

test('la foto saca plan, periodo del plan y complementos ordenados', () => {
  const f = fotoDeSuscripcion([mes('a_ia', 1600), mes('p_base_m', 2900), mes('a_cdc', 2200)], 'active', false, mapa);
  assert.deepEqual({ plan: f.plan, intervalo: f.intervalo, addons: f.addons, mrr: f.mrrListaCents }, { plan: 'BASE', intervalo: 'mensual', addons: ['decisiones', 'ia'], mrr: 6700 });
});

test('alta y cancelación no comparan con un «antes»', () => {
  const despues = fotoDeSuscripcion([mes('p_base_m', 2900)], 'active', false, mapa);
  assert.deepEqual(eventosDeSuscripcion({ tipoEvento: 'customer.subscription.created', despues, antes: null }).map((e) => e.tipo), ['ALTA']);
  const cancelada = fotoDeSuscripcion([mes('p_base_m', 2900)], 'canceled', false, mapa);
  const [c] = eventosDeSuscripcion({ tipoEvento: 'customer.subscription.deleted', despues: cancelada, antes: null });
  assert.equal(c.tipo, 'CANCELADA');
  assert.equal(c.estadoDespues, 'canceled');
});

test('Founding → Estudio es un cambio de plan con dirección UPGRADE', () => {
  const antes = fotoDeSuscripcion([mes('p_base_m', 2900)], 'active', false, mapa);
  const despues = fotoDeSuscripcion([mes('p_est_m', 7900)], 'active', false, mapa);
  const ev = eventosDeSuscripcion({ tipoEvento: 'customer.subscription.updated', despues, antes });
  assert.deepEqual(ev.map((e) => e.tipo), ['CAMBIO_PLAN']);
  assert.equal(ev[0].detalle.direccion, 'UPGRADE');
  assert.equal(ev[0].mrrListaAntesCents, 2900);
  assert.equal(ev[0].mrrListaDespuesCents, 7900);
});

test('Estudio → Founding es DOWNGRADE', () => {
  const antes = fotoDeSuscripcion([mes('p_est_m', 7900)], 'active', false, mapa);
  const despues = fotoDeSuscripcion([mes('p_base_m', 2900)], 'active', false, mapa);
  const [e] = eventosDeSuscripcion({ tipoEvento: 'customer.subscription.updated', despues, antes });
  assert.equal(e.detalle.direccion, 'DOWNGRADE');
});

test('mensual → anual del mismo plan es solo cambio de periodo, no de plan', () => {
  const antes = fotoDeSuscripcion([mes('p_est_m', 7900)], 'active', false, mapa);
  const despues = fotoDeSuscripcion([anio('p_est_a', 79000)], 'active', false, mapa);
  const ev = eventosDeSuscripcion({ tipoEvento: 'customer.subscription.updated', despues, antes });
  assert.deepEqual(ev.map((e) => e.tipo), ['CAMBIO_INTERVALO']);
  assert.equal(ev[0].intervaloAntes, 'mensual');
  assert.equal(ev[0].intervaloDespues, 'anual');
});

test('activar un complemento es CAMBIO_COMPLEMENTOS al alza', () => {
  const antes = fotoDeSuscripcion([mes('p_base_m', 2900)], 'active', false, mapa);
  const despues = fotoDeSuscripcion([mes('p_base_m', 2900), mes('a_cdc', 2200)], 'active', false, mapa);
  const ev = eventosDeSuscripcion({ tipoEvento: 'customer.subscription.updated', despues, antes });
  assert.deepEqual(ev.map((e) => e.tipo), ['CAMBIO_COMPLEMENTOS']);
  assert.deepEqual(ev[0].detalle, { antes: [], despues: ['decisiones'], direccion: 'UPGRADE' });
});

test('Founding con complemento → Estudio: cambio de plan y de complementos a la vez', () => {
  const antes = fotoDeSuscripcion([mes('p_base_m', 2900), mes('a_cdc', 2200)], 'active', false, mapa);
  const despues = fotoDeSuscripcion([mes('p_est_m', 7900)], 'active', false, mapa);
  const tipos = eventosDeSuscripcion({ tipoEvento: 'customer.subscription.updated', despues, antes }).map((e) => e.tipo);
  assert.deepEqual(tipos, ['CAMBIO_PLAN', 'CAMBIO_COMPLEMENTOS']);
});

test('programar y revocar la baja son eventos aparte', () => {
  const sinBaja = fotoDeSuscripcion([mes('p_base_m', 2900)], 'active', false, mapa);
  const conBaja = fotoDeSuscripcion([mes('p_base_m', 2900)], 'active', true, mapa);
  assert.deepEqual(eventosDeSuscripcion({ tipoEvento: 'customer.subscription.updated', despues: conBaja, antes: sinBaja }).map((e) => e.tipo), ['BAJA_PROGRAMADA']);
  assert.deepEqual(eventosDeSuscripcion({ tipoEvento: 'customer.subscription.updated', despues: sinBaja, antes: conBaja }).map((e) => e.tipo), ['BAJA_REVOCADA']);
});

test('active → past_due es CAMBIO_ESTADO; una renovación sin cambios no apunta nada', () => {
  const ok = fotoDeSuscripcion([mes('p_base_m', 2900)], 'active', false, mapa);
  const mal = fotoDeSuscripcion([mes('p_base_m', 2900)], 'past_due', false, mapa);
  const [e] = eventosDeSuscripcion({ tipoEvento: 'customer.subscription.updated', despues: mal, antes: ok });
  assert.equal(e.tipo, 'CAMBIO_ESTADO');
  assert.deepEqual([e.estadoAntes, e.estadoDespues], ['active', 'past_due']);
  assert.deepEqual(eventosDeSuscripcion({ tipoEvento: 'customer.subscription.updated', despues: ok, antes: ok }), []);
});

test('pasar a canceled por .updated no inventa un CAMBIO_ESTADO ni un complemento perdido', () => {
  const antes = fotoDeSuscripcion([mes('p_base_m', 2900), mes('a_cdc', 2200)], 'active', false, mapa);
  const despues = fotoDeSuscripcion([mes('p_base_m', 2900)], 'canceled', false, mapa);
  assert.deepEqual(eventosDeSuscripcion({ tipoEvento: 'customer.subscription.updated', despues, antes }), []);
});

test('un evento que no es de suscripción no apunta nada', () => {
  const f = fotoDeSuscripcion([mes('p_base_m', 2900)], 'active', false, mapa);
  assert.deepEqual(eventosDeSuscripcion({ tipoEvento: 'customer.subscription.trial_will_end', despues: f, antes: f }), []);
});

// ── Facturas ────────────────────────────────────────────────────────────────
const inv = (extra: Partial<InvoiceMinima> = {}): InvoiceMinima => ({
  id: 'in_1', status: 'paid', number: 'ABC-0001', billing_reason: 'subscription_cycle', currency: 'EUR',
  total: 7900, amount_paid: 7900, amount_due: 0, attempt_count: 1, next_payment_attempt: null,
  period_start: 1_700_000_000, period_end: 1_702_592_000, created: 1_700_000_000,
  hosted_invoice_url: 'https://example.invalid/i', invoice_pdf: 'https://example.invalid/i.pdf',
  impuestosCents: 1371, paid_at: 1_700_000_100, ...extra,
});
const ctx = { dueno: { studioId: 's1', cadenaId: null }, customerId: 'cus_1', subscriptionId: 'sub_1', eventoCreado: 1_700_000_200 };

test('la fila de factura lleva importes en céntimos, moneda en minúsculas y fechas ISO', () => {
  const f = filaDeFactura(inv(), ctx)!;
  assert.equal(f.total_cents, 7900);
  assert.equal(f.impuestos_cents, 1371);
  assert.equal(f.moneda, 'eur');
  assert.equal(f.pagada_en, new Date(1_700_000_100 * 1000).toISOString());
  assert.equal(f.ultimo_evento_en, new Date(1_700_000_200 * 1000).toISOString());
});

test('una cadena escribe cadena_id y deja studio_id vacío, y nunca los dos', () => {
  const f = filaDeFactura(inv(), { ...ctx, dueno: { studioId: null, cadenaId: 'c1' } })!;
  assert.deepEqual([f.studio_id, f.cadena_id], [null, 'c1']);
  const g = filaDeFactura(inv(), { ...ctx, dueno: { studioId: 's1', cadenaId: 'c1' } })!;
  assert.deepEqual([g.studio_id, g.cadena_id], ['s1', null]);
});

test('una factura sin estado conocido o sin total no se apunta', () => {
  assert.equal(filaDeFactura(inv({ status: null }), ctx), null);
  assert.equal(filaDeFactura(inv({ status: 'rara' }), ctx), null);
  assert.equal(filaDeFactura(inv({ total: null }), ctx), null);
});

test('el incidente toma lo adeudado, al menos un intento, y la fecha del evento', () => {
  const f = filaDeIncidente(inv({ status: 'open', amount_paid: 0, amount_due: 7900, attempt_count: 0, next_payment_attempt: 1_700_200_000 }), ctx);
  assert.equal(f.importe_cents, 7900);
  assert.equal(f.intentos, 1);
  assert.equal(f.fallo_en, new Date(1_700_000_200 * 1000).toISOString());
  assert.equal(f.siguiente_intento, new Date(1_700_200_000 * 1000).toISOString());
});
