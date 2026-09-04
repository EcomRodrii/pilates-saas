import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORIGENES_CON_RECIBO, ORIGENES_POS, procesarReembolsoVentaPos } from './procesar-reembolso.ts';

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
