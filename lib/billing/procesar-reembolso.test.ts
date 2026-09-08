import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORIGENES_CON_RECIBO, ORIGENES_POS, procesarReembolsoVentaPos, procesarChargeRefunded } from './procesar-reembolso.ts';

// ── P-2 (17ª auditoría): un reembolso de venta POS no revertía nada ─────────
//
// Antes de este arreglo, `ORIGENES_CON_RECIBO` no incluía `pos_terminal`/
// `pos_bizum` (correcto: una venta POS no tiene `recibos`), pero tampoco
// existía NINGUNA rama que hiciera algo con esos orígenes — el reembolso de
// un cobro de datáfono/Bizum presencial no marcaba `ventas_pos`, no dejaba
// rastro y no avisaba a nadie. `procesarReembolsoVentaPos` es esa rama
// propia que pedía el informe.

test('ORIGENES_POS y ORIGENES_CON_RECIBO no se solapan', () => {
  for (const o of ORIGENES_POS) assert.equal(ORIGENES_CON_RECIBO.has(o), false, `${o} no debería estar en ORIGENES_CON_RECIBO`);
  assert.ok(ORIGENES_POS.has('pos_terminal'));
  assert.ok(ORIGENES_POS.has('pos_bizum'));
});

type Fila = Record<string, unknown>;

// F-12/F-13: `procesarReembolsoVentaPos` ya no hace su propio UPDATE con
// guard — localiza la venta y delega en `registrarDevolucion` (mismo
// mecanismo que un recibo). El fake tiene que servir las DOS tablas que ese
// camino toca de verdad: `ventas_pos` (select + el update-espejo que hace
// `registrarDevolucion`) y `devoluciones` (insert, con su UNIQUE simulado
// vía `opts.yaExistia`).
function fakeAdmin(opts: { venta?: Fila | null; yaExistia?: boolean } = {}) {
  const updates: { tabla: string; fila: Fila }[] = [];
  const inserts: { tabla: string; fila: Fila }[] = [];
  const venta = opts.venta === undefined ? { id: 'venta-1', socio_id: null, total: 42 } : opts.venta;
  const admin = {
    from(tabla: string) {
      const c = {
        update(fila: Fila) { updates.push({ tabla, fila }); return c; },
        insert(fila: Fila) { inserts.push({ tabla, fila }); return c; },
        eq() { return c; },
        select() { return c; },
        maybeSingle() {
          if (tabla === 'ventas_pos') return Promise.resolve({ data: venta, error: null });
          if (tabla === 'devoluciones') {
            if (opts.yaExistia) return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate' } });
            return Promise.resolve({ data: { id: 'dev-1' }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        then(res: (v: { error: null }) => unknown) { return Promise.resolve({ error: null }).then(res); },
      };
      return c;
    },
  };
  return { admin: admin as never, updates, inserts };
}

test('marca la venta con la fecha y el importe devuelto (efecto real, no solo "ya lo vi")', async () => {
  const { admin, updates, inserts } = fakeAdmin();
  const r = await procesarReembolsoVentaPos(admin, {
    studioId: 'studio-1', paymentIntentId: 'pi_1',
    charge: { id: 'ch_1', refunded: true, amount: 4200, amountRefunded: 4200 },
    fuente: 'webhook',
  });
  assert.equal(r.ok, true);
  assert.equal(r.huboEfecto, true);
  assert.equal(inserts.length, 1, 'F-12/F-13: además del espejo, deja una fila de auditoría en devoluciones');
  assert.equal(inserts[0].tabla, 'devoluciones');
  assert.equal(inserts[0].fila.venta_pos_id, 'venta-1');
  const espejo = updates.find((u) => u.tabla === 'ventas_pos');
  assert.ok(espejo, 'el espejo de lectura rápida sigue actualizándose');
  assert.equal(espejo.fila.importe_devuelto, 42);
  assert.ok(typeof espejo.fila.devuelta_en === 'string');
});

// La rama "venta no encontrada" (reintento, o venta nunca registrada porque
// el POS está congelado) llama a `Sentry.captureMessage` — no ejecutable en
// `node --test` en este repo (el SDK de Sentry no se inicializa fuera del
// runtime de Next; el mismo motivo por el que la rama análoga de
// `procesarChargeRefunded`, "reciboYaDevuelto", tampoco se prueba ejecutando
// código). Se verifica por código fuente en su lugar.
test('la rama "no encontrada" avisa por Sentry (0 filas ≠ error) en vez de fallar en silencio', () => {
  const fuente = readFileSync(new URL('./procesar-reembolso.ts', import.meta.url), 'utf8');
  const cuerpo = fuente.slice(fuente.indexOf('export async function procesarReembolsoVentaPos'));
  assert.ok(cuerpo.includes("Sentry.captureMessage"), 'debe avisar por Sentry cuando la venta no aparece');
  assert.ok(cuerpo.includes('huboEfecto: false'), 'no debe reportarse como un hecho nuevo');
});

test('un reintento del mismo evento no vuelve a avisar (UNIQUE de devoluciones.referencia)', async () => {
  const { admin, updates } = fakeAdmin({ yaExistia: true });
  const r = await procesarReembolsoVentaPos(admin, {
    studioId: 'studio-1', paymentIntentId: 'pi_1',
    charge: { id: 'ch_1', refunded: true, amount: 4200, amountRefunded: 4200 },
    fuente: 'webhook',
  });
  assert.equal(r.ok, true);
  assert.equal(r.huboEfecto, false, 'un reintento no debe reportarse como un hecho nuevo');
  assert.equal(updates.find((u) => u.tabla === 'ventas_pos'), undefined, 'y no debe tocar el espejo otra vez');
});

test('un reembolso parcial anota el acumulado real, no un delta', async () => {
  const { admin, updates } = fakeAdmin();
  await procesarReembolsoVentaPos(admin, {
    studioId: 'studio-1', paymentIntentId: 'pi_1',
    charge: { id: 'ch_1', refunded: false, amount: 4200, amountRefunded: 1000 },
    fuente: 'webhook',
  });
  const espejo = updates.find((u) => u.tabla === 'ventas_pos');
  assert.equal(espejo?.fila.importe_devuelto, 10);
});

// ── 19ª auditoría · F-3 (sigue vigente tras F-12/F-13) ──────────────────────

test('F-3: el mapper de ventas POS escribe stripe_payment_intent_id', () => {
  // La columna existe en la BD desde la migración 0036 y es por la que busca
  // `procesarReembolsoVentaPos`. `ventaPOSToDb` no la incluía, así que se
  // quedaba a NULL en todas las ventas (prod: 19 filas, 0 informadas) y el
  // predicado del UPDATE de abajo no casaba jamás: procesador entero muerto.
  const datos = readFileSync(new URL('../supabase-data.ts', import.meta.url), 'utf8');
  const mapper = datos.slice(datos.indexOf('function ventaPOSToDb'));
  const cuerpo = mapper.slice(0, mapper.indexOf('\n}'));
  assert.ok(
    cuerpo.includes('stripe_payment_intent_id'),
    'ventaPOSToDb debe escribir stripe_payment_intent_id, o el reembolso de POS no encuentra nunca la venta',
  );
});

// F-6 (guard de reentrada por `importe_devuelto` monótono) ahora vive dentro
// de `registrarDevolucion` (UNIQUE de `devoluciones.referencia`, que ya
// incluye el acumulado — ver registrar-devolucion.test.ts), no en un UPDATE
// propio de `procesarReembolsoVentaPos`. La regresión ya no aplica a este
// fichero.

// ─────────────────────────────────────────────────────────────────────────────
// 32ª pasada de auditoría: un cargo con matrícula reparte el reembolso entre
// DOS recibos (plan + matrícula), en vez de atribuirlo entero al del plan —
// que era el bug (la matrícula se quedaba COBRADA para siempre).
// ─────────────────────────────────────────────────────────────────────────────

const RECIBOS_SPLIT: Record<string, Fila> = {
  'rec-plan': { id: 'rec-plan', socio_id: 'soc-1', suscripcion_id: 'sus-1', importe: 40, entrega_aplicada: true },
  'rec-mat': { id: 'rec-mat', socio_id: 'soc-1', suscripcion_id: null, importe: 30, entrega_aplicada: null },
  // Para el test de "mismo importe": dos recibos de 35 € cada uno.
  'rec-plan-35': { id: 'rec-plan-35', socio_id: 'soc-2', suscripcion_id: 'sus-2', importe: 35, entrega_aplicada: true },
  'rec-mat-35': { id: 'rec-mat-35', socio_id: 'soc-2', suscripcion_id: null, importe: 35, entrega_aplicada: null },
};

// Fake genérico que distingue por `id` (a diferencia del de más arriba, que
// sirve siempre la misma fila): hace falta para simular DOS recibos
// distintos dentro de la misma llamada a `procesarChargeRefunded`.
function fakeAdminSplit() {
  const updates: { tabla: string; id: string | undefined; fila: Fila }[] = [];
  const inserts: { tabla: string; fila: Fila }[] = [];
  const admin = {
    from(tabla: string) {
      let filtroId: string | undefined;
      let modo: 'select' | 'update' | 'insert' = 'select';
      let filaUpdate: Fila = {};
      const c = {
        select() { return c; },
        eq(campo: string, valor: unknown) { if (campo === 'id') filtroId = valor as string; return c; },
        neq() { return c; },
        insert(fila: Fila) { modo = 'insert'; inserts.push({ tabla, fila }); return c; },
        update(fila: Fila) { modo = 'update'; filaUpdate = fila; return c; },
        maybeSingle() {
          if (modo === 'update') {
            updates.push({ tabla, id: filtroId, fila: filaUpdate });
            // El flip a DEVUELTO siempre "casa" en este fake (ninguno de los
            // dos recibos parte ya devuelto).
            return Promise.resolve({ data: { id: filtroId }, error: null });
          }
          if (modo === 'insert') {
            return Promise.resolve({ data: { id: `dev-${inserts.length}` }, error: null });
          }
          if (tabla === 'recibos') {
            return Promise.resolve({ data: RECIBOS_SPLIT[filtroId ?? ''] ?? null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
      return c;
    },
  };
  return { admin: admin as never, updates, inserts };
}

test('reembolso TOTAL de un cargo con matrícula: reparte entre los dos recibos, cada uno con su propio importe', async () => {
  const { admin, updates, inserts } = fakeAdminSplit();
  const r = await procesarChargeRefunded(admin, {
    studioId: 'studio-1', reciboId: 'rec-plan', reciboMatriculaId: 'rec-mat',
    origenPi: 'plan_web_embebido',
    charge: { id: 'ch_1', refunded: true, amount: 7000, amountRefunded: 7000 },
    fuente: 'webhook',
  });
  assert.equal(r.ok, true);
  assert.equal(r.huboEfecto, true);

  // Los DOS recibos flipan a DEVUELTO — antes solo lo hacía el del plan.
  const flips = updates.filter(u => u.tabla === 'recibos' && u.fila.estado === 'DEVUELTO').map(u => u.id);
  assert.deepEqual(new Set(flips), new Set(['rec-plan', 'rec-mat']));

  // Dos filas de devoluciones, cada una con SU PROPIO cobrado/devuelto — antes
  // había una sola fila que mezclaba importe_cobrado del plan (40) con
  // importe_devuelto del cargo combinado (70).
  const devs = inserts.filter(i => i.tabla === 'devoluciones');
  assert.equal(devs.length, 2);
  const devPlan = devs.find(d => d.fila.recibo_id === 'rec-plan')!;
  const devMat = devs.find(d => d.fila.recibo_id === 'rec-mat')!;
  assert.equal(devPlan.fila.importe_cobrado, 40);
  assert.equal(devPlan.fila.importe_devuelto, 40);
  assert.equal(devMat.fila.importe_cobrado, 30);
  assert.equal(devMat.fila.importe_devuelto, 30);
  // Ninguna mezcla el importe del otro recibo.
  assert.notEqual(devPlan.fila.importe_devuelto, 70);
});

test('reembolso PARCIAL que solo cubre el plan: la matrícula no se toca todavía (sin fila de 0 €)', async () => {
  const { admin, updates, inserts } = fakeAdminSplit();
  const r = await procesarChargeRefunded(admin, {
    studioId: 'studio-1', reciboId: 'rec-plan', reciboMatriculaId: 'rec-mat',
    origenPi: 'plan_web_embebido',
    charge: { id: 'ch_1', refunded: false, amount: 7000, amountRefunded: 4000 },
    fuente: 'webhook',
  });
  assert.equal(r.huboEfecto, true);
  // El plan (40 €) se devuelve entero → TOTAL para él; la matrícula no recibe
  // nada de este reparto todavía.
  const flip = updates.find(u => u.tabla === 'recibos' && u.fila.estado === 'DEVUELTO');
  assert.equal(flip?.id, 'rec-plan');
  const devs = inserts.filter(i => i.tabla === 'devoluciones');
  assert.equal(devs.length, 1, 'sin fila de 0 € para la matrícula: sería ruido, no información');
  assert.equal(devs[0].fila.recibo_id, 'rec-plan');
  assert.equal(devs[0].fila.importe_devuelto, 40);
});

test('plan y matrícula con el MISMO importe no colisionan por referencia (sufijo por recibo)', async () => {
  const { admin, inserts } = fakeAdminSplit();
  const r = await procesarChargeRefunded(admin, {
    studioId: 'studio-1', reciboId: 'rec-plan-35', reciboMatriculaId: 'rec-mat-35',
    origenPi: 'plan_web_embebido',
    charge: { id: 'ch_2', refunded: true, amount: 7000, amountRefunded: 7000 },
    fuente: 'webhook',
  });
  assert.equal(r.ok, true);
  const devs = inserts.filter(i => i.tabla === 'devoluciones');
  // Sin el sufijo por recibo, las dos referencias serían idénticas
  // (`ch_2:3500` las dos) y la segunda chocaría con el UNIQUE, leyéndose
  // como "ya registrada" sin haberlo estado nunca — se perdería la mitad del
  // reembolso en silencio.
  assert.equal(devs.length, 2, 'las dos devoluciones deben registrarse, no colapsar en una');
  const referencias = devs.map(d => d.fila.referencia);
  assert.notEqual(referencias[0], referencias[1]);
});
