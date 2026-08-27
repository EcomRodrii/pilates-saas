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

function fakeAdmin(opts: { venta?: Fila | null } = {}) {
  const updates: Fila[] = [];
  const venta = opts.venta === undefined ? { id: 'venta-1', socio_id: null, total: 42 } : opts.venta;
  const admin = {
    from(tabla: string) {
      const c = {
        update(fila: Fila) { updates.push(fila); return c; },
        eq() { return c; },
        // `.is('devuelta_en', null)` — si el fake dice que la venta YA está
        // devuelta, el guard real de Postgres la habría excluido: se simula
        // aquí devolviendo null directamente.
        is() { return c; },
        select() { return c; },
        maybeSingle() {
          if (tabla === 'ventas_pos') return Promise.resolve({ data: venta, error: null });
          if (tabla === 'socios') return Promise.resolve({ data: null, error: null });
          return Promise.resolve({ data: null, error: null });
        },
      };
      return c;
    },
  };
  return { admin: admin as never, updates };
}

test('marca la venta con la fecha y el importe devuelto (efecto real, no solo "ya lo vi")', async () => {
  const { admin, updates } = fakeAdmin();
  const r = await procesarReembolsoVentaPos(admin, {
    studioId: 'studio-1', paymentIntentId: 'pi_1',
    charge: { id: 'ch_1', refunded: true, amount: 4200, amountRefunded: 4200 },
    fuente: 'webhook',
  });
  assert.equal(r.ok, true);
  assert.equal(r.huboEfecto, true);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].importe_devuelto, 42);
  assert.ok(typeof updates[0].devuelta_en === 'string');
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

test('un reembolso parcial anota el acumulado real, no un delta', async () => {
  const { admin, updates } = fakeAdmin();
  await procesarReembolsoVentaPos(admin, {
    studioId: 'studio-1', paymentIntentId: 'pi_1',
    charge: { id: 'ch_1', refunded: false, amount: 4200, amountRefunded: 1000 },
    fuente: 'webhook',
  });
  assert.equal(updates[0].importe_devuelto, 10);
});
