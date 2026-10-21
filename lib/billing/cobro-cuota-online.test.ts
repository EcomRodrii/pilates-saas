// El cobro del primer mes de una cuota comprada online: mismo motor que el panel, servidor manda.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cobroCuotaOnline } from './cobro-cuota-online.ts';
import { claveCheckoutPlanModoA, claveCheckoutEmbebido } from './clave-checkout-embebido.ts';
import { prorrateoDeAlta } from './prorrateo.ts';

type Fila = Record<string, unknown>;

/** Supabase de mentira: cada tabla devuelve sus filas (sin filtrar: los tests lo dejan claro) o un error. */
function fakeAdmin(t: { studios?: Fila | null | 'error'; suscripciones?: Fila[]; recibos?: Fila[]; planes?: Fila[]; socios?: Fila[] }) {
  const lecturas: string[] = [];
  const cadena = (tabla: string, data: unknown, error: unknown = null) => {
    const c: Record<string, unknown> = {
      select() { return c; }, eq() { return c; }, in() { return c; }, gte() { return c; }, ilike() { return c; }, is() { return c; }, limit() { return c; },
      maybeSingle() { return Promise.resolve({ data, error }); },
      then(res: (v: unknown) => unknown) { return Promise.resolve({ data, error }).then(res); },
    };
    lecturas.push(tabla);
    return c;
  };
  return {
    lecturas,
    admin: {
      from(tabla: string) {
        if (tabla === 'studios') return t.studios === 'error' ? cadena(tabla, null, { message: 'column does not exist' }) : cadena(tabla, t.studios ?? null);
        if (tabla === 'suscripciones') return cadena(tabla, t.suscripciones ?? []);
        if (tabla === 'recibos') return cadena(tabla, t.recibos ?? []);
        if (tabla === 'planes_tarifa') return cadena(tabla, t.planes ?? []);
        if (tabla === 'socios') return cadena(tabla, t.socios ?? []);
        return cadena(tabla, null);
      },
    } as never,
  };
}

const PLAN = { tipo: 'MENSUAL', precio: 50, periodicidad_meses: 1 };
const BASE = { studioId: 'st-1', planId: 'p-m', plan: PLAN, socioId: 'soc-1', conSesion: false, conRecibo: false, hoyISO: '2026-10-15' };
const ACTIVO = { cobro_proporcional_alta_activo: true, cobro_proporcional_dias_minimos: 3 };

test('ajuste apagado, sin leer, o columna ausente (migración sin aplicar): se cobra como siempre', async () => {
  for (const studios of [{ cobro_proporcional_alta_activo: false }, null, 'error' as const]) {
    const r = await cobroCuotaOnline(fakeAdmin({ studios }).admin, BASE);
    assert.equal(r.tipo, 'normal');
  }
});

test('ajuste activo: el servidor recalcula el importe con el MISMO motor que el panel', async () => {
  const r = await cobroCuotaOnline(fakeAdmin({ studios: ACTIVO }).admin, BASE);
  assert.equal(r.tipo, 'prorrateo');
  if (r.tipo !== 'prorrateo') return;
  assert.equal(r.importe, 27.42);
  assert.equal(r.pr.fechaFin, '2026-10-31');
  assert.equal(r.importe, prorrateoDeAlta({ tipo: 'MENSUAL', precio: 50 }, '2026-10-15', 3, 'panel')!.importe);
});

test('pagar y reservar una clase, pagar un recibo, un bono o una trimestral no se prorratean', async () => {
  const { admin } = fakeAdmin({ studios: ACTIVO });
  assert.equal((await cobroCuotaOnline(admin, { ...BASE, conSesion: true })).tipo, 'normal');
  assert.equal((await cobroCuotaOnline(admin, { ...BASE, conRecibo: true })).tipo, 'normal');
  assert.equal((await cobroCuotaOnline(admin, { ...BASE, plan: { tipo: 'BONO', precio: 100 } })).tipo, 'normal');
  assert.equal((await cobroCuotaOnline(admin, { ...BASE, plan: { tipo: 'MENSUAL', precio: 140, periodicidad_meses: 3 } })).tipo, 'normal');
});

test('con pocos días la compra online cobra la cuota ENTERA y el ciclo llega a fin del mes siguiente', async () => {
  const r = await cobroCuotaOnline(fakeAdmin({ studios: ACTIVO }).admin, { ...BASE, hoyISO: '2026-10-29' });
  assert.equal(r.tipo === 'prorrateo' && r.importe, 50);
  assert.equal(r.tipo === 'prorrateo' && r.pr.fechaFin, '2026-11-30');
});

test('cancelar → volver a comprar el mismo mes: no se cobra dos veces el mismo periodo', async () => {
  const sub = { id: 's-vieja', socio_id: 'soc-1', plan_id: 'p-m', estado: 'CANCELADA', fecha_fin: '2026-10-31' };
  const planes = [{ id: 'p-m', tipo: 'MENSUAL', periodicidad_meses: 1 }];
  for (const estado of ['COBRADO', 'FALLIDO', 'PENDIENTE']) {
    const r = await cobroCuotaOnline(
      fakeAdmin({ studios: ACTIVO, suscripciones: [sub], recibos: [{ suscripcion_id: 's-vieja', estado }], planes }).admin, BASE,
    );
    assert.equal(r.tipo, 'rechazo', estado);
    if (r.tipo === 'rechazo') { assert.equal(r.status, 409); assert.equal(r.codigo, 'periodo_ya_cobrado'); }
  }
  // Sin recibo (o anulado) en esa cuota, no hay periodo cobrado: es un alta de verdad.
  const sinCobro = await cobroCuotaOnline(
    fakeAdmin({ studios: ACTIVO, suscripciones: [sub], recibos: [{ suscripcion_id: 's-vieja', estado: 'ANULADO' }], planes }).admin, BASE,
  );
  assert.equal(sinCobro.tipo, 'prorrateo');
});

test('una invitada (sin sesión) no se busca por email: ni oráculo de emails ni bloqueo', async () => {
  const sub = { id: 's-vieja', socio_id: 'soc-9', plan_id: 'p-m', estado: 'CANCELADA', fecha_fin: '2026-10-31' };
  const r = await cobroCuotaOnline(fakeAdmin({
    studios: ACTIVO, suscripciones: [sub],
    recibos: [{ suscripcion_id: 's-vieja', estado: 'COBRADO' }], planes: [{ id: 'p-m', tipo: 'MENSUAL', periodicidad_meses: 1 }],
  }).admin, { ...BASE, socioId: null });
  assert.equal(r.tipo, 'prorrateo');
});

// ── Idempotencia del cobro: otro importe o fin de ciclo es OTRO cobro; sin prorrateo, la clave de siempre ──
const ahora = Date.UTC(2026, 9, 15, 10, 0, 0);
const datosModoA = { studioId: 'st-1', planId: 'p-1', socioId: 'soc-1', socioEmail: null, codigoDescuentoId: null, metodos: ['card'] };
const datosEmbebido = { studioId: 'st-1', planId: 'p-1', socioId: 'soc-1', socioEmail: null, sesionId: null, codigoDescuentoId: null };

test('las claves de Stripe: sin prorrateo no cambian (compras en vuelo), con él llevan importe y fin de ciclo', () => {
  const sin = claveCheckoutPlanModoA(datosModoA, ahora);
  assert.equal(claveCheckoutPlanModoA({ ...datosModoA, prorrateo: null }, ahora), sin);
  const con = claveCheckoutPlanModoA({ ...datosModoA, prorrateo: { importeCentimos: 2742, cicloFin: '2026-10-31' } }, ahora);
  assert.notEqual(con, sin);
  assert.ok(con!.endsWith('-p2742-2026-10-31'));
  assert.notEqual(con, claveCheckoutPlanModoA({ ...datosModoA, prorrateo: { importeCentimos: 2800, cicloFin: '2026-10-31' } }, ahora));
  const sinE = claveCheckoutEmbebido(datosEmbebido, ahora);
  assert.equal(claveCheckoutEmbebido({ ...datosEmbebido, prorrateo: null }, ahora), sinE);
  assert.ok(claveCheckoutEmbebido({ ...datosEmbebido, prorrateo: { importeCentimos: 2742, cicloFin: '2026-10-31' } }, ahora).endsWith('-p2742-2026-10-31'));
  // El mismo intento (doble clic, mismo minuto, mismo importe) sigue siendo la MISMA clave: un solo cobro.
  const p = { importeCentimos: 2742, cicloFin: '2026-10-31' };
  assert.equal(claveCheckoutEmbebido({ ...datosEmbebido, prorrateo: p }, ahora), claveCheckoutEmbebido({ ...datosEmbebido, prorrateo: p }, ahora + 5000));
});

// ── Contratos de las rutas: lo que no puede cambiar sin que alguien lo decida ──
const leer = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

test('las dos rutas de checkout: el servidor calcula ANTES del descuento y la matrícula, y la metadata viaja', () => {
  for (const ruta of ['app/api/stripe/checkout/route.ts', 'app/api/public/checkout-embebido/route.ts']) {
    const f = leer(ruta).replace(/^\s*\/\/.*$/gm, '');
    const iCuota = f.indexOf('cobroCuotaOnline(admin');
    const iDescuento = f.indexOf('resolverDescuentoCheckout(');
    assert.ok(iCuota > 0 && iDescuento > iCuota, `${ruta}: la cuota se calcula antes del descuento`);
    assert.ok(f.indexOf('cobroCuotaOnline(admin') < f.indexOf('reservarMatricula(') || !f.includes('reservarMatricula('), `${ruta}: la matrícula no se prorratea`);
    assert.doesNotMatch(f, /cuotaEsperadaCentimos/, `${ruta}: el cliente nunca decide el importe`);
    assert.match(f, /prorrateo: cuotaProrrateada/, `${ruta}: la clave de idempotencia lleva el prorrateo`);
    assert.match(f, /conSesion: !!body\.sesionId/, `${ruta}: «pagar y reservar» no se prorratea`);
  }
  assert.match(leer('app/api/stripe/checkout/route.ts'), /metadata\.cicloFin = cobroCuota\.pr\.fechaFin/);
  assert.match(leer('lib/billing/pago-embebido-parametros.ts'), /metadata\.cicloFin = d\.cicloFin/);
});

test('webhook (sesión y PaymentIntent) y conciliador pasan el ciclo prometido; nunca lo recalculan', () => {
  const w = leer('app/api/stripe/webhook/route.ts');
  assert.match(w, /cicloFinISO: session\.metadata\?\.cicloFin/);
  assert.match(w, /cicloFinISO: pi\.metadata\.cicloFin/);
  assert.match(leer('lib/inngest/conciliar-cobros.ts'), /cicloFinISO: sesion\?\.metadata\?\.cicloFin \?\? pi\?\.metadata\?\.cicloFin/);
  assert.doesNotMatch(leer('lib/billing/entregar-plan-comprado.ts').replace(/^\s*\/\/.*$/gm, ''), /prorrateoDeAlta|cobroCuotaOnline/);
});
