import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  estadoDeSesionGuardada, queHacerConSesionCaducada, resolverSesionCaducada, sesionesCaducadasDeRecibos, TOPE_SESIONES_DESDE_LA_BASE,
} from './sesion-caducada.ts';

// Una sesión de pago caducada ya no congela una cuota (5-oct-2026): con
// `checkout_session_id` puesto para siempre, el recibo salía del cobro diario, de
// la adopción del cron y de la remesa, y nadie se enteraba.

// `rec-renov-…` lo crean «Renovar mi plan» (la alumna) y el cron (solo cuotas); el panel, `rec-<uid>`.
const PEDIDA = 'rec-renov-sus-1-2026-10';
const DEL_PANEL = 'rec-panel-1';

test('una CUOTA cuya sesión caducó vuelve a su cobro de siempre (que nunca la adelanta)', () => {
  assert.equal(queHacerConSesionCaducada({ reciboId: PEDIDA, proximoReintento: null, esRenovacion: true, tipoPlan: 'MENSUAL' }), 'soltar');
  assert.equal(queHacerConSesionCaducada({ reciboId: DEL_PANEL, proximoReintento: null, esRenovacion: true, tipoPlan: 'MENSUAL' }), 'soltar');
});

test('un recibo con el reintento ya armado vuelve al cobro diario, sea del plan que sea', () => {
  for (const tipoPlan of ['MENSUAL', 'BONO', 'PUNTUAL', null]) {
    assert.equal(queHacerConSesionCaducada({ reciboId: PEDIDA, proximoReintento: '2026-10-06T08:30:00Z', esRenovacion: true, tipoPlan }), 'soltar');
  }
});

test('la renovación de un BONO (o clase suelta) que ELLA pidió y no pagó NO se cobra sola (D-3)', () => {
  assert.equal(queHacerConSesionCaducada({ reciboId: PEDIDA, proximoReintento: null, esRenovacion: true, tipoPlan: 'BONO' }), 'mantener');
  assert.equal(queHacerConSesionCaducada({ reciboId: PEDIDA, proximoReintento: null, esRenovacion: true, tipoPlan: 'PUNTUAL' }), 'mantener');
});

test('la renovación de un BONO que creó el ESTUDIO es una deuda suya: vuelve a su cobro', () => {
  // Antes se mantenía por el tipo de plan y la congelaba igual que una cuota.
  assert.equal(queHacerConSesionCaducada({ reciboId: DEL_PANEL, proximoReintento: null, esRenovacion: true, tipoPlan: 'BONO' }), 'soltar');
  assert.equal(queHacerConSesionCaducada({ reciboId: DEL_PANEL, proximoReintento: null, esRenovacion: true, tipoPlan: null }), 'soltar');
});

test('una renovación que ella pidió y cuyo plan no dice su tipo tampoco se suelta: podría acabar en un cobro que nadie pidió', () => {
  assert.equal(queHacerConSesionCaducada({ reciboId: PEDIDA, proximoReintento: null, esRenovacion: true, tipoPlan: null }), 'mantener');
});

test('un recibo que no es renovación (penalización, venta, enlace de cobro) se suelta', () => {
  for (const tipoPlan of ['MENSUAL', 'BONO', 'PUNTUAL', 'SIN_PLAN', null]) {
    assert.equal(queHacerConSesionCaducada({ reciboId: DEL_PANEL, proximoReintento: null, esRenovacion: false, tipoPlan }), 'soltar');
  }
  assert.equal(queHacerConSesionCaducada({ reciboId: DEL_PANEL, proximoReintento: null, esRenovacion: null, tipoPlan: null }), 'soltar');
});

test('del listado solo cuentan las sesiones CADUCADAS de un recibo de este estudio', () => {
  const r = sesionesCaducadasDeRecibos([
    { id: 'cs_a', status: 'expired', metadata: { reciboId: 'rec-1', studioId: 'st-1' } },
    { id: 'cs_b', status: 'open', metadata: { reciboId: 'rec-2' } },
    { id: 'cs_c', status: 'complete', metadata: { reciboId: 'rec-3' } },
    { id: 'cs_d', status: 'expired', metadata: { planId: 'plan-1' } },
    { id: 'cs_e', status: 'expired', metadata: { reciboId: 'rec-5', studioId: 'otro' } },
    { id: 'cs_f', status: 'expired', metadata: { reciboId: 'rec-6' } },
    { id: 'cs_g', status: 'expired', metadata: null },
  ], 'st-1');
  assert.deepEqual(r, [{ sesionId: 'cs_a', reciboId: 'rec-1' }, { sesionId: 'cs_f', reciboId: 'rec-6' }]);
});

// ── El compare-and-set ──

type Filtro = [op: string, columna: string, valor: unknown];
function fakeAdmin(fila: Record<string, unknown> | null, soltadas: number = 1) {
  const llamadas: Array<{ update: Record<string, unknown> | null; filtros: Filtro[] }> = [];
  const admin = {
    from() {
      const llamada = { update: null as Record<string, unknown> | null, filtros: [] as Filtro[] };
      llamadas.push(llamada);
      const b = {
        // Tras un UPDATE, `select` cierra la consulta; en una lectura, encadena.
        select(): unknown {
          return llamada.update
            ? Promise.resolve({ data: Array.from({ length: soltadas }, () => ({ id: 'rec-1' })), error: null })
            : b;
        },
        update(u: Record<string, unknown>) { llamada.update = u; return b; },
        eq(c: string, v: unknown) { llamada.filtros.push(['eq', c, v]); return b; },
        maybeSingle() { return Promise.resolve({ data: fila, error: null }); },
      };
      return b;
    },
  };
  return { admin: admin as never, llamadas };
}
const P = { studioId: 'st-1', reciboId: 'rec-renov-sus-1-2026-10', sesionId: 'cs_caducada' };

test('soltar: solo si el recibo sigue apuntando a ESA sesión, en la lectura y en el UPDATE', async () => {
  const { admin, llamadas } = fakeAdmin({ proximo_reintento: null, es_renovacion: true, entrega_tipo: null, suscripcion_id: 'sus-1' });
  const r = await resolverSesionCaducada(admin, P, async () => 'MENSUAL');
  assert.equal(r, 'soltada');
  const [lectura, escritura] = llamadas;
  assert.ok(lectura.filtros.some(([o, c, v]) => o === 'eq' && c === 'checkout_session_id' && v === 'cs_caducada'));
  assert.deepEqual(escritura.update, { checkout_session_id: null });
  for (const [c, v] of [['id', P.reciboId], ['studio_id', 'st-1'], ['checkout_session_id', 'cs_caducada']]) {
    assert.ok(escritura.filtros.some(([o, col, val]) => o === 'eq' && col === c && val === v), `falta ${c} en el UPDATE`);
  }
});

test('mantener: la renovación de un bono no se toca', async () => {
  const { admin, llamadas } = fakeAdmin({ proximo_reintento: null, es_renovacion: true, entrega_tipo: null, suscripcion_id: 'sus-1' });
  assert.equal(await resolverSesionCaducada(admin, P, async () => 'BONO'), 'mantenida');
  assert.equal(llamadas.length, 1, 'ni un UPDATE');
});

test('si el recibo ya no apunta a esa sesión (otra abierta después, o ya cobrado), no se toca', async () => {
  const { admin, llamadas } = fakeAdmin(null);
  assert.equal(await resolverSesionCaducada(admin, P, async () => 'MENSUAL'), 'no-aplica');
  assert.equal(llamadas.length, 1);
  // Y si cambia entre la lectura y el UPDATE, el compare-and-set no toca nada.
  const carrera = fakeAdmin({ proximo_reintento: null, es_renovacion: false, entrega_tipo: null, suscripcion_id: null }, 0);
  assert.equal(await resolverSesionCaducada(carrera.admin, P, async () => null), 'no-aplica');
});

test('un ERROR al leer el plan no es «plan desconocido»: no se mantiene, se reintenta', async () => {
  const { admin, llamadas } = fakeAdmin({ proximo_reintento: null, es_renovacion: true, entrega_tipo: null, suscripcion_id: 'sus-1' });
  const r = await resolverSesionCaducada(admin, P, async () => { throw new Error('504 de PostgREST'); });
  assert.equal(r, 'error');
  assert.equal(llamadas.length, 1, 'ni se suelta ni se da por mantenida');
});

test('el plan solo se consulta cuando decide algo (renovación sin reintento)', async () => {
  let consultas = 0;
  const tipo = async () => { consultas++; return 'MENSUAL'; };
  await resolverSesionCaducada(fakeAdmin({ proximo_reintento: '2026-10-06', es_renovacion: true, entrega_tipo: null, suscripcion_id: 'sus-1' }).admin, P, tipo);
  await resolverSesionCaducada(fakeAdmin({ proximo_reintento: null, es_renovacion: false, entrega_tipo: null, suscripcion_id: null }).admin, P, tipo);
  assert.equal(consultas, 0);
});

// ── Quién lo aplica (el conciliador y el webhook no se cargan aquí) ──

const raiz = join(import.meta.dirname, '..', '..');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('el barrido horario y la vigilancia de 72 h sueltan las sesiones caducadas de recibos', () => {
  const s = sinComentarios(readFileSync(join(raiz, 'lib/inngest/conciliar-cobros.ts'), 'utf8'));
  for (const fn of ['async function conciliarEstudio(', 'async function vigilarEstudio(']) {
    const ini = s.indexOf(fn);
    assert.ok(ini > 0, fn);
    const cuerpo = s.slice(ini, s.indexOf('\n}\n', ini));
    assert.match(cuerpo, /await soltarSesionesCaducadasDeRecibos\(admin, studio, \[\.\.\.sesionPorId\.values\(\)\]\)/, fn);
  }
  assert.match(s, /resolverSesionCaducada\(\s*admin, \{ studioId: studio\.id, reciboId, sesionId \}/);
});

test('el webhook (checkout.session.expired) hace lo mismo, con el estudio de la cuenta que firma', () => {
  const s = sinComentarios(readFileSync(join(raiz, 'app/api/stripe/webhook/route.ts'), 'utf8'));
  const ini = s.indexOf("if (event.type === 'checkout.session.expired') {");
  assert.ok(ini > 0);
  const rama = s.slice(ini, s.indexOf("if (event.type === 'charge.refunded') {", ini));
  const tenant = rama.indexOf('tenantAutorizado(studioId, session.metadata?.studioId)');
  const resolver = rama.indexOf('resolverSesionCaducada(');
  assert.ok(tenant > 0 && resolver > tenant, 'el tenant se comprueba por la cuenta Connect antes de tocar el recibo');
});

// ── Desde la base de datos (vigilancia diaria) ──

test('una sesión guardada se suelta solo si ya no se puede pagar', () => {
  assert.equal(estadoDeSesionGuardada({ status: 'expired' }, null), 'caducada');
  assert.equal(estadoDeSesionGuardada(null, Object.assign(new Error('No such checkout.session'), { code: 'resource_missing' })), 'caducada',
    'no existe en esa cuenta (otra cuenta conectada): nadie puede pagarla');
  assert.equal(estadoDeSesionGuardada({ status: 'open' }, null), 'viva');
  assert.equal(estadoDeSesionGuardada({ status: 'complete' }, null), 'pagada');
  assert.equal(estadoDeSesionGuardada(null, new Error('Stripe caído')), 'no-se-sabe');
});

test('la vigilancia diaria barre también desde la base, decide antes de preguntar a Stripe y con tope', () => {
  const s = sinComentarios(readFileSync(join(raiz, 'lib/inngest/conciliar-cobros.ts'), 'utf8'));
  const vig = s.slice(s.indexOf('async function vigilarEstudio('));
  assert.match(vig, /await soltarSesionesCaducadasDesdeLaBase\(admin, stripe, studio, new Set\(sesionPorId\.keys\(\)\)\);/);
  const ini = s.indexOf('async function soltarSesionesCaducadasDesdeLaBase(');
  const cuerpo = s.slice(ini, s.indexOf('\n}\n', ini));
  assert.match(cuerpo, /\.in\('estado', \['PENDIENTE', 'FALLIDO'\]\)\s*\.not\('checkout_session_id', 'is', null\)/);
  const decide = cuerpo.indexOf('await decidirSesionCaducada(');
  const tope = cuerpo.indexOf('if (preguntas >= TOPE_SESIONES_DESDE_LA_BASE) break;');
  const pregunta = cuerpo.indexOf('stripe.checkout.sessions.retrieve(');
  const suelta = cuerpo.indexOf('await soltarSesionCaducada(admin, p)');
  assert.ok(decide > 0 && tope > decide && pregunta > tope && suelta > pregunta, 'decidir con la base → tope → Stripe → soltar');
  assert.match(cuerpo, /estadoDeSesionGuardada\(sesion, errSesion\) !== 'caducada'/);
  assert.equal(TOPE_SESIONES_DESDE_LA_BASE, 25);
  // El tipo de plan con errores que se distinguen.
  assert.match(s, /tipoDePlanDelReciboEstricto\(admin, recibo\)/);
  assert.doesNotMatch(s, /tipoDePlanDelRecibo\(admin, recibo\)/);
});
