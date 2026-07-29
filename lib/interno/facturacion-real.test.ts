import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cruzarFacturacion, eurosAlMes } from './facturacion-real.ts';
import type { FilaCadena, FilaEstudio } from './facturacion-real.ts';

type Sub = Parameters<typeof eurosAlMes>[0];

/** Suscripción de Stripe mínima pero con la forma real. */
function sub(
  customer: string,
  status: string,
  centimos: number,
  extra: { interval?: string; interval_count?: number; quantity?: number; trial_end?: number; period_end?: number } = {},
): Sub {
  return {
    id: `sub_${customer}`,
    customer,
    status,
    trial_end: extra.trial_end ?? null,
    current_period_end: extra.period_end ?? null,
    items: {
      data: [{
        quantity: extra.quantity ?? 1,
        price: {
          unit_amount: centimos,
          recurring: { interval: extra.interval ?? 'month', interval_count: extra.interval_count ?? 1 },
        },
      }],
    },
  } as unknown as Sub;
}

const estudio = (o: Partial<FilaEstudio> & { id: string }): FilaEstudio => ({
  nombre: o.id, plan: 'ESTUDIO', subscription_status: null,
  stripe_customer_id: null, cadena_id: null, ...o,
});
const cadena = (o: Partial<FilaCadena> & { id: string }): FilaCadena => ({
  nombre: o.id, plan: 'CADENA', subscription_status: null, stripe_customer_id: null, ...o,
});

test('el MRR sale de Stripe, no del precio de lista', () => {
  // El estudio está en el plan ESTUDIO (79 €/mes de tarifa) pero Stripe le cobra
  // 49 € porque arrastra un precio antiguo. Manda Stripe.
  const r = cruzarFacturacion(
    [estudio({ id: 'e1', plan: 'ESTUDIO', subscription_status: 'active', stripe_customer_id: 'cus_1' })],
    [], [sub('cus_1', 'active', 4900)], true,
  );
  assert.equal(r.mrrEuros, 49);
  assert.equal(r.pagando, 1);
});

test('un customer sin suscripción NO es un cliente de pago', () => {
  // Abrió el Checkout y no lo terminó: existe el customer, no hay suscripción.
  // Este era el caso vivo en producción — 2 customers, 0 suscripciones.
  const r = cruzarFacturacion(
    [estudio({ id: 'e1', subscription_status: 'active', stripe_customer_id: 'cus_1' })],
    [], [], true,
  );
  assert.equal(r.mrrEuros, 0);
  assert.equal(r.pagando, 0);
  assert.equal(r.descuadres, 1);
  assert.match(r.lineas[0].motivoDescuadre!, /ninguna suscripción viva/);
});

test('una cadena que paga cuenta UNA vez, no una por sede', () => {
  // El fallo latente que motivó este módulo: el panel solo miraba `studios`, y
  // las sedes heredan `active` sin customer (trigger propagar_plan_cadena) →
  // una cadena que paga 149 € salía como 4 «accesos a mano» y 0 € de MRR.
  const r = cruzarFacturacion(
    [1, 2, 3, 4].map(n => estudio({ id: `sede${n}`, cadena_id: 'c1', subscription_status: 'active' })),
    [cadena({ id: 'c1', nombre: 'Pilates Boutique', subscription_status: 'active', stripe_customer_id: 'cus_c' })],
    [sub('cus_c', 'active', 14900)], true,
  );
  assert.equal(r.mrrEuros, 149);
  assert.equal(r.pagando, 1);
  assert.equal(r.lineas.length, 1, 'las sedes no generan línea propia');
  assert.equal(r.lineas[0].sedes, 4);
  assert.equal(r.manuales + r.descuadres, 0);
});

test('la prueba no se suma al MRR, se cuenta aparte', () => {
  const enTresDias = Math.floor(Date.now() / 1000) + 3 * 86400;
  const r = cruzarFacturacion(
    [estudio({ id: 'e1', subscription_status: 'trialing', stripe_customer_id: 'cus_1' })],
    [], [sub('cus_1', 'trialing', 7900, { trial_end: enTresDias })], true,
  );
  assert.equal(r.mrrEuros, 0, 'una prueba todavía no es dinero');
  assert.equal(r.mrrEnPruebaEuros, 79);
  assert.equal(r.enPrueba, 1);
  assert.equal(r.pruebasQueAcaban.length, 1);
  assert.equal(r.pruebasQueAcaban[0].diasDePrueba, 3);
});

test('una prueba que acaba dentro de un mes no entra en la lista de urgentes', () => {
  const enUnMes = Math.floor(Date.now() / 1000) + 30 * 86400;
  const r = cruzarFacturacion(
    [estudio({ id: 'e1', subscription_status: 'trialing', stripe_customer_id: 'cus_1' })],
    [], [sub('cus_1', 'trialing', 7900, { trial_end: enUnMes })], true,
  );
  assert.equal(r.enPrueba, 1);
  assert.equal(r.pruebasQueAcaban.length, 0);
});

test('un impago se ve como impago, no como cliente', () => {
  const r = cruzarFacturacion(
    [estudio({ id: 'e1', subscription_status: 'active', stripe_customer_id: 'cus_1' })],
    [], [sub('cus_1', 'past_due', 7900)], true,
  );
  assert.equal(r.impagos, 1);
  assert.equal(r.mrrEuros, 0, 'lo impagado no es MRR');
  assert.match(r.lineas[0].motivoDescuadre!, /past_due/);
});

test('acceso concedido a mano no se confunde con un descuadre', () => {
  // Sin suscripción y sin acceso en la base: es una cuenta parada, no un
  // problema. No debe ensuciar la lista de cosas que revisar.
  const r = cruzarFacturacion([estudio({ id: 'e1', subscription_status: null })], [], [], true);
  assert.equal(r.manuales, 1);
  assert.equal(r.descuadres, 0);
  assert.equal(r.lineas[0].motivoDescuadre, null);
});

test('con varias suscripciones por cliente gana la viva, no la cancelada', () => {
  const r = cruzarFacturacion(
    [estudio({ id: 'e1', subscription_status: 'active', stripe_customer_id: 'cus_1' })],
    [], [sub('cus_1', 'canceled', 7900), sub('cus_1', 'active', 4900)], true,
  );
  assert.equal(r.pagando, 1);
  assert.equal(r.mrrEuros, 49);
});

test('una suscripción anual se reparte en MRR mensual', () => {
  assert.equal(eurosAlMes(sub('c', 'active', 120000, { interval: 'year' })), 100);
});

test('la cantidad multiplica: 3 sedes facturadas por separado', () => {
  assert.equal(eurosAlMes(sub('c', 'active', 4900, { quantity: 3 })), 147);
});

test('sin Stripe configurado se dice, no se enseña 0 € como si fuera un dato', () => {
  const r = cruzarFacturacion([estudio({ id: 'e1' })], [], [], false);
  assert.equal(r.stripeDisponible, false);
});
