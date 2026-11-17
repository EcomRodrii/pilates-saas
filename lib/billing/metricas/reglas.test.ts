import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularMetricas, leerPeriodo, periodoDe, type EventoLibroFila, type FacturaLibroFila, type IncidenteLibroFila,
} from './reglas.ts';

const ev = (o: Partial<EventoLibroFila> & Pick<EventoLibroFila, 'tipo' | 'ocurrido_en'>): EventoLibroFila => ({
  stripe_event_id: `evt_${Math.random().toString(36).slice(2)}`, studio_id: 's1', cadena_id: null, subscription_id: 'sub_1',
  plan_despues: 'BASE', mrr_lista_antes_cents: null, mrr_lista_despues_cents: null, detalle: {}, ...o,
});
const fac = (o: Partial<FacturaLibroFila> & Pick<FacturaLibroFila, 'stripe_invoice_id' | 'creada_en'>): FacturaLibroFila => ({
  subscription_id: 'sub_1', estado: 'paid', total_cents: 2900, pagado_cents: 2900, impuestos_cents: 503, devuelto_cents: 0, pagada_en: o.creada_en, ...o,
});
const P = { desde: '2026-11-01', hasta: '2026-11-30' };
const calc = (e: EventoLibroFila[], f: FacturaLibroFila[] = [], i: IncidenteLibroFila[] = [], plan?: string) =>
  calcularMetricas({ eventos: e, facturas: f, incidentes: i, periodo: P, plan });

test('el MRR nuevo, la ampliación, la reducción y la baja son movimientos distintos', () => {
  const m = calc([
    ev({ tipo: 'ALTA', ocurrido_en: '2026-11-03T10:00:00Z', subscription_id: 'sub_a', mrr_lista_despues_cents: 2900 }),
    ev({ tipo: 'CAMBIO_PLAN', ocurrido_en: '2026-11-10T10:00:00Z', subscription_id: 'sub_b', plan_despues: 'ESTUDIO', mrr_lista_antes_cents: 2900, mrr_lista_despues_cents: 7900, detalle: { direccion: 'UPGRADE' } }),
    ev({ tipo: 'CAMBIO_PLAN', ocurrido_en: '2026-11-12T10:00:00Z', subscription_id: 'sub_c', plan_despues: 'BASE', mrr_lista_antes_cents: 7900, mrr_lista_despues_cents: 2900, detalle: { direccion: 'DOWNGRADE' } }),
    ev({ tipo: 'CANCELADA', ocurrido_en: '2026-11-20T10:00:00Z', subscription_id: 'sub_d', mrr_lista_despues_cents: 2900 }),
  ]).movimientosMrr;
  assert.deepEqual(m, { nuevoCents: 2900, ampliacionCents: 5000, reduccionCents: 5000, bajaCents: 2900, netoCents: 2900 + 5000 - 5000 - 2900, altas: 1, upgrades: 1, downgrades: 1, bajas: 1 });
});

test('un cambio que da dos filas (plan y complementos) cuenta UNA vez', () => {
  const id = 'evt_mismo';
  const base = { stripe_event_id: id, ocurrido_en: '2026-11-10T10:00:00Z', plan_despues: 'ESTUDIO', mrr_lista_antes_cents: 5100, mrr_lista_despues_cents: 7900 };
  const m = calc([
    ev({ ...base, tipo: 'CAMBIO_PLAN', detalle: { direccion: 'UPGRADE' } }),
    ev({ ...base, tipo: 'CAMBIO_COMPLEMENTOS', detalle: { direccion: 'UPGRADE' } }),
  ]).movimientosMrr;
  assert.deepEqual([m.upgrades, m.ampliacionCents], [1, 2800]);
});

test('pasar de mensual a anual NO es una reducción de MRR', () => {
  const m = calc([ev({ tipo: 'CAMBIO_INTERVALO', ocurrido_en: '2026-11-10T10:00:00Z', mrr_lista_antes_cents: 7900, mrr_lista_despues_cents: 6583 })]).movimientosMrr;
  assert.deepEqual([m.downgrades, m.reduccionCents], [0, 0]);
});

test('facturado y cobrado son cosas distintas: una factura emitida un mes y pagada otro', () => {
  const f = [fac({ stripe_invoice_id: 'in_1', creada_en: '2026-10-28T10:00:00Z', pagada_en: '2026-11-02T10:00:00Z' })];
  const m = calc([], f);
  assert.equal(m.facturado.facturas, 0, 'se facturó en octubre');
  assert.deepEqual([m.cobrado.facturas, m.cobrado.brutoCents], [1, 2900], 'se cobró en noviembre');
});

test('un anual se factura y se cobra UNA vez, entero, y no se reparte en doce', () => {
  const m = calc([], [fac({ stripe_invoice_id: 'in_a', creada_en: '2026-11-05T10:00:00Z', total_cents: 79000, pagado_cents: 79000, impuestos_cents: 13711 })]);
  assert.deepEqual([m.facturado.brutoCents, m.cobrado.brutoCents], [79000, 79000]);
});

test('el neto de IVA descuenta los impuestos; el bruto no', () => {
  const m = calc([], [fac({ stripe_invoice_id: 'in_1', creada_en: '2026-11-05T10:00:00Z', total_cents: 2900, pagado_cents: 2900, impuestos_cents: 503 })]);
  assert.deepEqual([m.facturado.brutoCents, m.facturado.netoIvaCents, m.cobrado.brutoCents, m.cobrado.netoIvaCents], [2900, 2397, 2900, 2397]);
});

test('una devolución resta de lo cobrado', () => {
  const m = calc([], [fac({ stripe_invoice_id: 'in_1', creada_en: '2026-11-05T10:00:00Z', devuelto_cents: 900 })]);
  assert.deepEqual([m.cobrado.brutoCents, m.cobrado.devueltoCents], [2000, 900]);
});

test('una factura anulada o en borrador no se factura ni se cobra', () => {
  const f = ['void', 'draft'].map((estado, i) => fac({ stripe_invoice_id: `in_${i}`, estado, creada_en: '2026-11-05T10:00:00Z' }));
  const m = calc([], f);
  assert.deepEqual([m.facturado.facturas, m.cobrado.facturas], [0, 0]);
});

test('una factura abierta (sin pagar) se factura pero no se cobra', () => {
  const m = calc([], [fac({ stripe_invoice_id: 'in_1', estado: 'open', pagado_cents: 0, pagada_en: null, creada_en: '2026-11-05T10:00:00Z' })]);
  assert.deepEqual([m.facturado.brutoCents, m.cobrado.brutoCents], [2900, 0]);
});

test('el día se cuenta en Madrid: una factura de las 23:30 UTC del 30 ya es del 1 de diciembre', () => {
  const m = calc([], [fac({ stripe_invoice_id: 'in_1', creada_en: '2026-11-30T23:30:00Z' })]);
  assert.equal(m.facturado.facturas, 0);
});

test('el churn mira solo a las que estaban vivas al empezar y se fueron en el periodo', () => {
  const m = calc([
    ev({ tipo: 'ALTA', ocurrido_en: '2026-09-01T10:00:00Z', subscription_id: 'sub_1', mrr_lista_despues_cents: 2900 }),
    ev({ tipo: 'ALTA', ocurrido_en: '2026-09-01T10:00:00Z', subscription_id: 'sub_2', mrr_lista_despues_cents: 7900, plan_despues: 'ESTUDIO' }),
    ev({ tipo: 'ALTA', ocurrido_en: '2026-11-05T10:00:00Z', subscription_id: 'sub_3', mrr_lista_despues_cents: 2900 }),
    ev({ tipo: 'CANCELADA', ocurrido_en: '2026-11-15T10:00:00Z', subscription_id: 'sub_2', plan_despues: 'ESTUDIO', mrr_lista_despues_cents: 7900 }),
    ev({ tipo: 'CANCELADA', ocurrido_en: '2026-11-20T10:00:00Z', subscription_id: 'sub_3', mrr_lista_despues_cents: 2900 }),
  ]).churn;
  // sub_3 nació y murió dentro del periodo: no estaba al empezar, no cuenta en la cohorte.
  assert.deepEqual([m.activasAlInicio, m.bajasDeEsaCohorte, m.logosPct], [2, 1, 0.5]);
  assert.deepEqual([m.mrrAlInicioCents, m.mrrPerdidoCents], [10800, 7900]);
  assert.ok(Math.abs((m.mrrPct as number) - 7900 / 10800) < 1e-9);
});

test('sin nadie vivo al empezar el churn es null, no 0 %', () => {
  const m = calc([ev({ tipo: 'ALTA', ocurrido_en: '2026-11-05T10:00:00Z', mrr_lista_despues_cents: 2900 })]).churn;
  assert.deepEqual([m.logosPct, m.mrrPct], [null, null]);
});

test('una cancelada antes del periodo no cuenta como viva al empezar', () => {
  const m = calc([
    ev({ tipo: 'ALTA', ocurrido_en: '2026-06-01T10:00:00Z', mrr_lista_despues_cents: 2900 }),
    ev({ tipo: 'CANCELADA', ocurrido_en: '2026-08-01T10:00:00Z', mrr_lista_despues_cents: 2900 }),
  ]);
  assert.equal(m.churn.activasAlInicio, 0);
  assert.equal(m.activasAlFinal, 0);
});

test('las activas al final suman altas y restan bajas', () => {
  const m = calc([
    ev({ tipo: 'ALTA', ocurrido_en: '2026-09-01T10:00:00Z', subscription_id: 'sub_1', mrr_lista_despues_cents: 2900 }),
    ev({ tipo: 'ALTA', ocurrido_en: '2026-11-05T10:00:00Z', subscription_id: 'sub_2', mrr_lista_despues_cents: 2900 }),
  ]);
  assert.equal(m.activasAlFinal, 2);
});

test('el filtro por plan recorta facturas, movimientos y churn', () => {
  const eventos = [
    ev({ tipo: 'ALTA', ocurrido_en: '2026-09-01T10:00:00Z', subscription_id: 'sub_1', plan_despues: 'BASE', mrr_lista_despues_cents: 2900 }),
    ev({ tipo: 'ALTA', ocurrido_en: '2026-09-01T10:00:00Z', subscription_id: 'sub_2', plan_despues: 'ESTUDIO', mrr_lista_despues_cents: 7900 }),
  ];
  const facturas = [
    fac({ stripe_invoice_id: 'in_1', subscription_id: 'sub_1', creada_en: '2026-11-05T10:00:00Z', total_cents: 2900, pagado_cents: 2900 }),
    fac({ stripe_invoice_id: 'in_2', subscription_id: 'sub_2', creada_en: '2026-11-05T10:00:00Z', total_cents: 7900, pagado_cents: 7900 }),
  ];
  const todos = calc(eventos, facturas);
  const estudio = calc(eventos, facturas, [], 'ESTUDIO');
  assert.deepEqual([todos.facturado.brutoCents, estudio.facturado.brutoCents], [10800, 7900]);
  assert.equal(estudio.churn.activasAlInicio, 1);
  assert.deepEqual(todos.porPlan.map((p) => p.plan).sort(), ['BASE', 'ESTUDIO']);
});

test('una factura se asigna al plan que tenía la suscripción ese día, no al de hoy', () => {
  const eventos = [
    ev({ tipo: 'ALTA', ocurrido_en: '2026-06-01T10:00:00Z', plan_despues: 'BASE' }),
    ev({ tipo: 'CAMBIO_PLAN', ocurrido_en: '2026-11-20T10:00:00Z', plan_despues: 'ESTUDIO', mrr_lista_antes_cents: 2900, mrr_lista_despues_cents: 7900 }),
  ];
  const m = calc(eventos, [fac({ stripe_invoice_id: 'in_1', creada_en: '2026-11-05T10:00:00Z' })]);
  assert.deepEqual(m.porPlan.map((p) => p.plan), ['BASE']);
});

test('los pagos fallidos distinguen lo que sigue abierto de lo recuperado', () => {
  const m = calc([], [], [
    { estado: 'ABIERTO', importe_cents: 2900, abierto_en: '2026-11-10T10:00:00Z', recuperado_en: null },
    { estado: 'ESCALADO', importe_cents: 7900, abierto_en: '2026-10-10T10:00:00Z', recuperado_en: null },
    { estado: 'RECUPERADO', importe_cents: 2900, abierto_en: '2026-11-02T10:00:00Z', recuperado_en: '2026-11-04T10:00:00Z' },
  ]).pagosFallidos;
  assert.deepEqual(m, { abiertosAhora: 2, importeAbiertoCents: 10800, abiertosEnElPeriodo: 2, recuperadosEnElPeriodo: 1 });
});

test('siempre avisa de lo que las cifras NO incluyen', () => {
  const avisos = calc([]).avisos.join(' ');
  assert.match(avisos, /Devoluciones/);
  assert.match(avisos, /comisiones de Stripe/);
});

test('avisa de las altas reconstruidas desde el relleno', () => {
  const m = calc([ev({ tipo: 'ALTA', ocurrido_en: '2026-11-05T10:00:00Z', mrr_lista_despues_cents: 2900, detalle: { relleno: true } })]);
  assert.ok(m.avisos.some((a) => /relleno/.test(a)));
});

test('los atajos de periodo se calculan en días de Madrid', () => {
  assert.deepEqual(periodoDe('este_mes', '2026-11-17'), { desde: '2026-11-01', hasta: '2026-11-17' });
  assert.deepEqual(periodoDe('mes_pasado', '2026-11-17'), { desde: '2026-10-01', hasta: '2026-10-31' });
  assert.deepEqual(periodoDe('mes_pasado', '2026-01-10'), { desde: '2025-12-01', hasta: '2025-12-31' });
  assert.deepEqual(periodoDe('ultimos_3', '2026-11-17'), { desde: '2026-09-01', hasta: '2026-11-17' });
  assert.deepEqual(periodoDe('ultimos_12', '2026-11-17'), { desde: '2025-12-01', hasta: '2026-11-17' });
  assert.deepEqual(periodoDe('este_ano', '2026-11-17'), { desde: '2026-01-01', hasta: '2026-11-17' });
});

test('un periodo de la URL se valida: fechas reales, en orden y de como mucho 5 años', () => {
  assert.deepEqual(leerPeriodo('2026-01-01', '2026-03-31'), { desde: '2026-01-01', hasta: '2026-03-31' });
  for (const [d, h] of [['2026-03-31', '2026-01-01'], ['x', '2026-01-01'], ['2026-13-40', '2026-01-01'], ['2015-01-01', '2026-01-01'], [undefined, null]]) {
    assert.equal(leerPeriodo(d, h), null, `${d} ${h}`);
  }
});
