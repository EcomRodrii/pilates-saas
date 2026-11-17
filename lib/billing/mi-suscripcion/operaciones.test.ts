// Las tres operaciones de dinero de «Mi suscripción» contra un Stripe de MENTIRA con estado: el
// `update` cambia de verdad la suscripción falsa, así que la relectura de después ve lo que ve
// Stripe. Lo que se vigila: no se escribe nada cuando no toca, el cobro rechazado no deja nada a
// medias, un cambio no confirmado no se anuncia como hecho, y la baja nunca recorta el acceso.
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { cambiarAAnual, cambiarBaja, vistaPrevia, type StripeMinimo, type SuscripcionStripe } from './operaciones.ts';

const PRECIOS: Record<string, { unit_amount: number; interval: 'month' | 'year' }> = {
  base_m: { unit_amount: 2900, interval: 'month' }, base_a: { unit_amount: 29000, interval: 'year' },
  estudio_m: { unit_amount: 7900, interval: 'month' }, estudio_a: { unit_amount: 79000, interval: 'year' },
  cadena_m: { unit_amount: 24900, interval: 'month' }, cadena_a: { unit_amount: 249000, interval: 'year' },
  ia_m: { unit_amount: 900, interval: 'month' },
  raro_m: { unit_amount: 500, interval: 'month' },
};

before(() => {
  Object.assign(process.env, {
    STRIPE_PRICE_BASE: 'base_m', STRIPE_PRICE_BASE_ANUAL: 'base_a',
    STRIPE_PRICE_ESTUDIO: 'estudio_m', STRIPE_PRICE_ESTUDIO_ANUAL: 'estudio_a',
    STRIPE_PRICE_CADENA: 'cadena_m', STRIPE_PRICE_CADENA_ANUAL: 'cadena_a',
    STRIPE_PRICE_ADDON_IA: 'ia_m',
  });
  for (const k of ['STRIPE_PRICE_ADDON_DECISIONES', 'STRIPE_PRICE_ADDON_SUSTITUCIONES', 'STRIPE_PRICE_ADDON_IA_ANUAL']) delete process.env[k];
});

const FIN = 1_800_000_000;
const linea = (id: string, price: string) => ({
  id, quantity: 1, current_period_end: FIN,
  price: { id: price, unit_amount: PRECIOS[price]!.unit_amount, currency: 'eur', recurring: { interval: PRECIOS[price]!.interval, interval_count: 1 } },
});
const suscripcion = (precios: string[], extra: Partial<SuscripcionStripe> = {}): SuscripcionStripe => ({
  status: 'active', cancel_at_period_end: false, cancel_at: null, current_period_end: FIN,
  items: { data: precios.map((p, i) => linea(`li_${i}`, p)) }, ...extra,
});

interface Falso {
  stripe: StripeMinimo;
  sub: SuscripcionStripe;
  updates: Array<Record<string, unknown>>;
  previas: Array<Record<string, unknown>>;
}

/** Stripe falso: `update` aplica lo que Stripe aplicaría; `opciones` simula sus fallos. */
function falso(sub: SuscripcionStripe, opciones: { falloUpdate?: unknown; ignorarUpdate?: boolean; estadoTrasUpdate?: string } = {}): Falso {
  const f: Falso = { sub, updates: [], previas: [], stripe: null as unknown as StripeMinimo };
  f.stripe = {
    subscriptions: {
      retrieve: async () => structuredClone(f.sub),
      update: async (_id, params) => {
        f.updates.push(params);
        if (opciones.falloUpdate) throw opciones.falloUpdate;
        if (opciones.ignorarUpdate) return {};
        const items = params.items as Array<{ id: string; price: string }> | undefined;
        if (items) for (const it of items) { const l = f.sub.items.data.find((x) => x.id === it.id)!; l.price = linea(it.id, it.price).price; }
        if ('cancel_at_period_end' in params) f.sub.cancel_at_period_end = params.cancel_at_period_end as boolean;
        if (params.cancel_at === '') f.sub.cancel_at = null;
        if (opciones.estadoTrasUpdate) f.sub.status = opciones.estadoTrasUpdate;
        return {};
      },
    },
    invoices: {
      createPreview: async (p) => {
        f.previas.push(p);
        return { amount_due: 25100, total: 25100, period_end: FIN, lines: { data: [{ description: 'Crédito', amount: -1500 }, { description: 'Plan anual', amount: 26600 }, { description: 'Cero', amount: 0 }] } };
      },
    },
  };
  return f;
}

const E = { subscriptionId: 'sub_1', customerId: 'cus_1', esCadena: false };

// ── Vista previa ────────────────────────────────────────────────────────────

test('vista previa de anual: pide a Stripe la factura con los precios anuales, cobra «ahora» y no escribe nada', async () => {
  const f = falso(suscripcion(['base_m', 'ia_m']));
  // Con un complemento, el anual exige su precio anual: sin él, no se puede (no hay anual a medias).
  assert.equal((await vistaPrevia(f.stripe, { ...E, cambio: 'anual' })).status, 409);
  const g = falso(suscripcion(['base_m']));
  const r = await vistaPrevia(g.stripe, { ...E, cambio: 'anual' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { cuando: 'ahora', fecha: null, importeCents: 25100, lineas: [{ descripcion: 'Crédito', importeCents: -1500 }, { descripcion: 'Plan anual', importeCents: 26600 }] });
  assert.equal(g.previas.length, 1);
  assert.deepEqual((g.previas[0]!.subscription_details as { items: unknown }).items, [{ id: 'li_0', price: 'base_a' }]);
  assert.equal(g.updates.length, 0, 'una vista previa no escribe');
});

test('vista previa de Estudio: se suma a la próxima factura (con su fecha) y quita los complementos', async () => {
  const f = falso(suscripcion(['base_m', 'ia_m']));
  const r = await vistaPrevia(f.stripe, { ...E, cambio: 'estudio' });
  assert.equal(r.status, 200);
  assert.equal(r.body.cuando, 'proxima_factura');
  assert.equal(r.body.fecha, new Date(FIN * 1000).toISOString());
  assert.deepEqual((f.previas[0]!.subscription_details as { items: unknown }).items, [{ id: 'li_0', price: 'estudio_m' }, { id: 'li_1', deleted: true }]);
  assert.equal(f.updates.length, 0);
});

test('vista previa: cadena, impago, baja programada y estados sin suscripción se rechazan antes de llamar a Stripe', async () => {
  const casos: Array<[string, SuscripcionStripe, boolean]> = [
    ['cadena', suscripcion(['base_m']), true],
    ['impago', suscripcion(['base_m'], { status: 'past_due' }), false],
    ['baja-programada', suscripcion(['base_m'], { cancel_at_period_end: true }), false],
    ['sin-suscripcion', suscripcion(['base_m'], { status: 'canceled' }), false],
  ];
  for (const [codigo, sub, esCadena] of casos) {
    const f = falso(sub);
    const r = await vistaPrevia(f.stripe, { ...E, esCadena, cambio: 'anual' });
    assert.equal(r.status, 409, codigo);
    assert.equal(r.body.codigo, codigo);
    assert.equal(f.previas.length, 0, `${codigo}: no se pide factura previa`);
  }
});

test('vista previa: una línea que no es ni plan ni complemento se manda a revisar, sin tocar Stripe', async () => {
  const f = falso(suscripcion(['base_m', 'raro_m']));
  const r = await vistaPrevia(f.stripe, { ...E, cambio: 'anual' });
  assert.equal(r.status, 409);
  assert.equal(r.body.codigo, 'revisar');
  assert.equal(f.previas.length, 0);
});

test('vista previa de Estudio solo desde Founding, y de anual solo desde mensual', async () => {
  assert.equal((await vistaPrevia(falso(suscripcion(['estudio_m'])).stripe, { ...E, cambio: 'estudio' })).status, 409);
  assert.equal((await vistaPrevia(falso(suscripcion(['base_a'])).stripe, { ...E, cambio: 'anual' })).status, 409);
});

// ── Cambio a anual ──────────────────────────────────────────────────────────

test('pasar a anual: UNA actualización con prorrateo y `error_if_incomplete`, y confirma releyendo Stripe', async () => {
  const f = falso(suscripcion(['base_m']));
  const r = await cambiarAAnual(f.stripe, E);
  assert.deepEqual(r, { status: 200, body: { ok: true, intervalo: 'anual' } });
  assert.equal(f.updates.length, 1);
  assert.deepEqual(f.updates[0], { items: [{ id: 'li_0', price: 'base_a' }], proration_behavior: 'create_prorations', payment_behavior: 'error_if_incomplete' });
  assert.equal(f.sub.items.data[0]!.price?.id, 'base_a');
});

test('pasar a anual: si ya es anual, no hay nada que cobrar ni escribir', async () => {
  const f = falso(suscripcion(['base_a']));
  const r = await cambiarAAnual(f.stripe, E);
  assert.equal(r.status, 409);
  assert.equal(f.updates.length, 0);
});

test('pasar a anual: impago, baja programada y cadena no cobran nada', async () => {
  const casos: Array<[SuscripcionStripe, boolean]> = [
    [suscripcion(['base_m'], { status: 'past_due' }), false],
    [suscripcion(['base_m'], { cancel_at_period_end: true }), false],
    [suscripcion(['base_m']), true],
  ];
  for (const [sub, esCadena] of casos) {
    const f = falso(sub);
    assert.equal((await cambiarAAnual(f.stripe, { ...E, esCadena })).status, 409);
    assert.equal(f.updates.length, 0);
  }
});

test('pasar a anual: una línea desconocida no toca la suscripción (no se dejan periodos mezclados)', async () => {
  const f = falso(suscripcion(['base_m', 'raro_m']));
  const r = await cambiarAAnual(f.stripe, E);
  assert.equal(r.status, 409);
  assert.equal(r.body.codigo, 'revisar');
  assert.equal(f.updates.length, 0);
});

test('pasar a anual: el cobro rechazado da 402 y la suscripción sigue mensual', async () => {
  for (const fallo of [{ type: 'StripeCardError' }, { code: 'payment_intent_payment_attempt_failed' }, { code: 'subscription_payment_intent_requires_action' }]) {
    const f = falso(suscripcion(['base_m']), { falloUpdate: fallo });
    const r = await cambiarAAnual(f.stripe, E);
    assert.equal(r.status, 402);
    assert.equal(r.body.codigo, 'cobro-rechazado');
    assert.equal(f.sub.items.data[0]!.price?.id, 'base_m', 'nada a medias');
  }
});

test('pasar a anual: un error que no es de cobro se propaga (lo registra la ruta), no se disfraza de rechazo', async () => {
  const f = falso(suscripcion(['base_m']), { falloUpdate: new Error('Stripe caído') });
  await assert.rejects(cambiarAAnual(f.stripe, E), /Stripe caído/);
});

test('pasar a anual: si Stripe contesta bien pero la relectura no lo confirma, NO se anuncia como hecho', async () => {
  const sinCambio = falso(suscripcion(['base_m']), { ignorarUpdate: true });
  assert.equal((await cambiarAAnual(sinCambio.stripe, E)).status, 409);
  const incompleta = falso(suscripcion(['base_m']), { estadoTrasUpdate: 'incomplete' });
  assert.equal((await cambiarAAnual(incompleta.stripe, E)).status, 409);
});

test('pasar a anual: con prueba (trialing) también vale', async () => {
  const f = falso(suscripcion(['base_m'], { status: 'trialing' }));
  assert.equal((await cambiarAAnual(f.stripe, E)).status, 200);
});

// ── Baja ────────────────────────────────────────────────────────────────────

test('programar la baja: al final del periodo, con el motivo, sin prorrateo ni líneas, y el acceso llega hasta el fin pagado', async () => {
  const f = falso(suscripcion(['base_m']));
  const r = await cambiarBaja(f.stripe, { ...E, accion: 'programar', motivo: 'Cierro el estudio' });
  assert.deepEqual(r, { status: 200, body: { ok: true, bajaProgramada: true, accesoHasta: new Date(FIN * 1000).toISOString() } });
  assert.deepEqual(f.updates, [{ cancel_at_period_end: true, cancellation_details: { comment: 'Cierro el estudio' } }]);
});

test('programar la baja sin motivo no manda `cancellation_details`', async () => {
  const f = falso(suscripcion(['base_m']));
  await cambiarBaja(f.stripe, { ...E, accion: 'programar' });
  assert.deepEqual(f.updates, [{ cancel_at_period_end: true }]);
});

test('programar la baja: ya programada, cadena o sin suscripción viva no escriben', async () => {
  const casos: Array<[SuscripcionStripe, boolean]> = [
    [suscripcion(['base_m'], { cancel_at_period_end: true }), false],
    [suscripcion(['base_m']), true],
    [suscripcion(['base_m'], { status: 'canceled' }), false],
  ];
  for (const [sub, esCadena] of casos) {
    const f = falso(sub);
    const r = await cambiarBaja(f.stripe, { ...E, esCadena, accion: 'programar' });
    assert.equal(r.status, 409);
    assert.equal(r.body.codigo, 'no-aplica');
    assert.equal(f.updates.length, 0);
  }
});

test('programar la baja también vale con impago: no se le quita a nadie la salida', async () => {
  const f = falso(suscripcion(['base_m'], { status: 'past_due' }));
  assert.equal((await cambiarBaja(f.stripe, { ...E, accion: 'programar' })).status, 200);
});

test('reactivar: quita la baja y, si estaba puesta con fecha concreta, borra también `cancel_at`', async () => {
  const f = falso(suscripcion(['base_m'], { cancel_at_period_end: true }));
  const r = await cambiarBaja(f.stripe, { ...E, accion: 'reactivar' });
  assert.deepEqual(r, { status: 200, body: { ok: true, bajaProgramada: false, accesoHasta: null } });
  assert.deepEqual(f.updates, [{ cancel_at_period_end: false }]);

  const conFecha = falso(suscripcion(['base_m'], { cancel_at: FIN - 86_400 }));
  const r2 = await cambiarBaja(conFecha.stripe, { ...E, accion: 'reactivar' });
  assert.equal(r2.status, 200);
  assert.deepEqual(conFecha.updates, [{ cancel_at_period_end: false, cancel_at: '' }]);
  assert.equal(conFecha.sub.cancel_at, null);
});

test('reactivar sin baja programada no escribe nada', async () => {
  const f = falso(suscripcion(['base_m']));
  const r = await cambiarBaja(f.stripe, { ...E, accion: 'reactivar' });
  assert.equal(r.status, 409);
  assert.equal(f.updates.length, 0);
});

test('la baja no se anuncia si Stripe no la refleja al releer', async () => {
  const f = falso(suscripcion(['base_m']), { ignorarUpdate: true });
  assert.equal((await cambiarBaja(f.stripe, { ...E, accion: 'programar' })).status, 409);
  const g = falso(suscripcion(['base_m'], { cancel_at_period_end: true }), { ignorarUpdate: true });
  assert.equal((await cambiarBaja(g.stripe, { ...E, accion: 'reactivar' })).status, 409);
});

test('un error de Stripe al escribir la baja se propaga, sin disfrazarse de éxito', async () => {
  const f = falso(suscripcion(['base_m']), { falloUpdate: new Error('red caída') });
  await assert.rejects(cambiarBaja(f.stripe, { ...E, accion: 'programar' }), /red caída/);
});
