import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { queHacerConSesionCaducada, resolverSesionCaducada, sesionesCaducadasDeRecibos } from './sesion-caducada.ts';

// Una sesión de pago caducada ya no congela una cuota (5-oct-2026): con
// `checkout_session_id` puesto para siempre, el recibo salía del cobro diario, de
// la adopción del cron y de la remesa, y nadie se enteraba.

test('una CUOTA cuya sesión caducó vuelve a su cobro de siempre', () => {
  assert.equal(queHacerConSesionCaducada({ proximoReintento: null, esRenovacion: true, tipoPlan: 'MENSUAL' }), 'soltar');
});

test('un recibo con el reintento ya armado vuelve al cobro diario, sea del plan que sea', () => {
  for (const tipoPlan of ['MENSUAL', 'BONO', 'PUNTUAL', null]) {
    assert.equal(queHacerConSesionCaducada({ proximoReintento: '2026-10-06T08:30:00Z', esRenovacion: true, tipoPlan }), 'soltar');
  }
});

test('la renovación de un BONO (o clase suelta) que ella pidió y no pagó NO se cobra sola (D-3)', () => {
  assert.equal(queHacerConSesionCaducada({ proximoReintento: null, esRenovacion: true, tipoPlan: 'BONO' }), 'mantener');
  assert.equal(queHacerConSesionCaducada({ proximoReintento: null, esRenovacion: true, tipoPlan: 'PUNTUAL' }), 'mantener');
});

test('una renovación de la que no se sabe el plan tampoco se suelta: podría acabar en un cobro que nadie pidió', () => {
  assert.equal(queHacerConSesionCaducada({ proximoReintento: null, esRenovacion: true, tipoPlan: null }), 'mantener');
});

test('un recibo del panel (no renovación: penalización, venta, enlace de cobro) se suelta', () => {
  for (const tipoPlan of ['MENSUAL', 'BONO', 'PUNTUAL', 'SIN_PLAN', null]) {
    assert.equal(queHacerConSesionCaducada({ proximoReintento: null, esRenovacion: false, tipoPlan }), 'soltar');
  }
  assert.equal(queHacerConSesionCaducada({ proximoReintento: null, esRenovacion: null, tipoPlan: null }), 'soltar');
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
const P = { studioId: 'st-1', reciboId: 'rec-1', sesionId: 'cs_caducada' };

test('soltar: solo si el recibo sigue apuntando a ESA sesión, en la lectura y en el UPDATE', async () => {
  const { admin, llamadas } = fakeAdmin({ proximo_reintento: null, es_renovacion: true, entrega_tipo: null, suscripcion_id: 'sus-1' });
  const r = await resolverSesionCaducada(admin, P, async () => 'MENSUAL');
  assert.equal(r, 'soltada');
  const [lectura, escritura] = llamadas;
  assert.ok(lectura.filtros.some(([o, c, v]) => o === 'eq' && c === 'checkout_session_id' && v === 'cs_caducada'));
  assert.deepEqual(escritura.update, { checkout_session_id: null });
  for (const [c, v] of [['id', 'rec-1'], ['studio_id', 'st-1'], ['checkout_session_id', 'cs_caducada']]) {
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
