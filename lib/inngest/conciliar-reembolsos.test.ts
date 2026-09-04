import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  procesarChargeRefunded, procesarDisputeCreated, procesarDisputeClosed, ORIGENES_CON_RECIBO,
} from '../billing/procesar-reembolso.ts';

const RAIZ = join(import.meta.dirname, '../..');
const leer = (rel: string) => readFileSync(join(RAIZ, rel), 'utf8');

// ── P-1 (auditoría 17ª pasada, 26-ago-2026): el cron ERA un placebo ─────────
//
// Antes de este arreglo, `conciliar-reembolsos.ts` solo insertaba una fila en
// `webhook_reembolsos`/`webhook_disputas` — nunca marcaba el recibo DEVUELTO,
// nunca llamaba a `registrarDevolucion`, nunca notificaba. Estos tests
// demuestran el EFECTO REAL sobre `recibos`/`devoluciones`, no solo que se
// registró un "ya lo vi" — es justo lo que faltaba antes.

test('I-5: conciliarReembolsos está definido, registrado y usa {stripeAccount} (no la cuenta plataforma)', () => {
  const fuente = leer('lib/inngest/conciliar-reembolsos.ts');
  assert.ok(fuente.includes('export const conciliarReembolsos'), 'debe existir export');
  assert.ok(fuente.includes("id: 'conciliar-reembolsos-disputas'"), 'id debe ser correcto');
  assert.ok(fuente.includes("cron: '0 */2 * * *'"), 'cadencia debe ser cada 2 horas');
  // El bug original #1: llamaba a Stripe sin `{stripeAccount}` — invisible
  // para los direct charges de Connect. Ahora tiene que iterar por estudio.
  assert.ok(fuente.includes('stripeAccount: studio.stripe_account_id'), 'debe apuntar a la cuenta CONECTADA de cada estudio');
  assert.ok(fuente.includes('procesarChargeRefunded'), 'debe aplicar el efecto real, no solo marcar "visto"');
  assert.ok(fuente.includes('procesarDisputeClosed'), 'debe aplicar el efecto real de una disputa perdida');
});

test('I-5: conciliarReembolsos está importado en inngest/route.ts', () => {
  const route = leer('app/api/inngest/route.ts');
  assert.ok(route.includes("import { conciliarReembolsos }"), 'debe importarse');
  assert.ok(route.includes('conciliarReembolsos,'), 'debe estar en el array de functions');
});

// ── Efecto real de un reembolso ──────────────────────────────────────────────

type Fila = Record<string, unknown>;

const RECIBO = { id: 'rec-1', socio_id: 'soc-1', suscripcion_id: 'sus-1', importe: 165, entrega_aplicada: true };

// Mismo patrón que `lib/billing/registrar-devolucion.test.ts`: un fake mínimo
// que registra lo que se escribió, sin una base de datos real. `emitirDevolucion`
// llama internamente a `publish()`, que usa SU PROPIO `getSupabaseAdmin()` (no
// el que le pasamos aquí) — en este entorno de test devuelve null y la
// notificación se ignora en silencio (console.error, no lanza), así que no
// hace falta mockearla para probar el EFECTO en `recibos`/`devoluciones`.
// `reciboInexistente`: el UPDATE no casa ninguna fila (recibo de otro estudio,
// o id que ya no existe). Supabase NO devuelve error en ese caso — devuelve
// `data: []` — y modelarlo aquí es lo que permite probar el guard de D-2/D-10.
function fakeAdmin(opts: { reciboYaDevuelto?: boolean; devolucionYaExistia?: boolean; reciboInexistente?: boolean } = {}) {
  const updates: { tabla: string; fila: Fila }[] = [];
  const inserts: { tabla: string; fila: Fila }[] = [];

  const admin = {
    from(tabla: string) {
      let updated: boolean | 'insert' = false;
      let selectedAfterUpdate = false;
      const c = {
        select() { if (updated) selectedAfterUpdate = true; return c; },
        eq() { return c; },
        neq() { return c; },
        insert(fila: Fila) { inserts.push({ tabla, fila }); updated = 'insert'; return c; },
        update(fila: Fila) { updates.push({ tabla, fila }); updated = true; return c; },
        maybeSingle() {
          if (tabla === 'recibos' && !updated) {
            // Snapshot que lee `registrarDevolucion` antes de anotar.
            return Promise.resolve({ data: RECIBO, error: null });
          }
          if (tabla === 'recibos' && updated === true && selectedAfterUpdate) {
            // El flip a DEVUELTO con `.select('id').maybeSingle()`: 0 filas si
            // el guardia `.neq('estado','DEVUELTO')` lo descarta.
            return Promise.resolve(opts.reciboYaDevuelto ? { data: null, error: null } : { data: { id: RECIBO.id }, error: null });
          }
          if (tabla === 'devoluciones' && updated === 'insert') {
            return Promise.resolve(
              opts.devolucionYaExistia
                ? { data: null, error: { code: '23505', message: 'duplicate' } }
                : { data: { id: 'dev-1' }, error: null },
            );
          }
          if (tabla === 'socios') return Promise.resolve({ data: null, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        // `await` sobre el constructor sin `maybeSingle()`. Con `.select()`
        // encadenado tras un UPDATE, PostgREST devuelve las FILAS AFECTADAS —
        // array vacío si no casó ninguna, y sin error. Modelarlo es lo que hace
        // que un test pueda distinguir "escribió" de "no escribió nada"
        // (auditoría 22ª pasada; antes el fake devolvía siempre `{error:null}`
        // y cualquier éxito falso pasaba en verde).
        then(res: (v: { data: Fila[] | null; error: null }) => unknown) {
          const data = selectedAfterUpdate
            ? (opts.reciboInexistente ? [] : [{ id: RECIBO.id }])
            : null;
          return Promise.resolve({ data, error: null }).then(res);
        },
      };
      return c;
    },
  };
  return { admin: admin as never, updates, inserts };
}

test('un reembolso TOTAL: marca el recibo DEVUELTO y anota la devolución', async () => {
  const { admin, updates, inserts } = fakeAdmin();
  const r = await procesarChargeRefunded(admin, {
    studioId: 'studio-1', reciboId: 'rec-1', origenPi: 'tarjeta_recibo',
    charge: { id: 'ch_1', refunded: true, amount: 16500, amountRefunded: 16500 },
    fuente: 'conciliador',
  });

  assert.equal(r.ok, true);
  assert.equal(r.huboEfecto, true, 'es un hecho nuevo: el webhook no lo había aplicado');
  const flip = updates.find(u => u.tabla === 'recibos' && u.fila.estado === 'DEVUELTO');
  assert.ok(flip, 'el recibo debe pasar a DEVUELTO — antes esto NUNCA se escribía desde el cron');
  const dev = inserts.find(i => i.tabla === 'devoluciones');
  assert.ok(dev, 'debe quedar una fila de devoluciones');
  assert.equal(dev!.fila.origen, 'REEMBOLSO_TOTAL');
});

test('un reembolso PARCIAL: anota la devolución pero NO toca recibos.estado', async () => {
  const { admin, updates, inserts } = fakeAdmin();
  const r = await procesarChargeRefunded(admin, {
    studioId: 'studio-1', reciboId: 'rec-1', origenPi: 'tarjeta_recibo',
    charge: { id: 'ch_1', refunded: false, amount: 16500, amountRefunded: 4950 },
    fuente: 'conciliador',
  });

  assert.equal(r.huboEfecto, true);
  assert.equal(updates.some(u => u.tabla === 'recibos' && u.fila.estado === 'DEVUELTO'), false, 'un parcial no anula el recibo');
  const dev = inserts.find(i => i.tabla === 'devoluciones');
  assert.equal(dev!.fila.origen, 'REEMBOLSO_PARCIAL');
});

test('reintento (mismo reembolso, ya anotado): idempotente, sin efecto nuevo', async () => {
  const { admin, updates } = fakeAdmin({ devolucionYaExistia: true });
  const r = await procesarChargeRefunded(admin, {
    studioId: 'studio-1', reciboId: 'rec-1', origenPi: 'tarjeta_recibo',
    charge: { id: 'ch_1', refunded: true, amount: 16500, amountRefunded: 16500 },
    fuente: 'conciliador',
  });

  assert.equal(r.ok, true);
  assert.equal(r.huboEfecto, false, 'ya se había aplicado — el webhook o una pasada anterior del cron');
  // El flip SÍ se sigue intentando (es idempotente por `.neq` en el propio SQL,
  // no hace falta saltárselo), pero no debe romper nada volver a intentarlo.
  void updates;
});

// ── Efecto real de una disputa ───────────────────────────────────────────────

test('disputa creada: marca disputa_estado + disputa_stripe_id', async () => {
  const { admin, updates } = fakeAdmin();
  const r = await procesarDisputeCreated(admin, {
    studioId: 'studio-1', reciboId: 'rec-1', disputeStatus: 'needs_response', disputeId: 'du_1',
    dueByUnix: null, fuente: 'conciliador',
  });
  assert.equal(r.ok, true);
  const u = updates.find(x => x.tabla === 'recibos');
  assert.equal(u!.fila.disputa_estado, 'needs_response');
  assert.equal(u!.fila.disputa_stripe_id, 'du_1');
});

test('disputa creada sobre un recibo que no existe: NO dice que la registró', async () => {
  // D-10 (auditoría 22ª pasada): sin `.select('id')`, un `reciboId` inexistente
  // —o de otro estudio— no da error en Supabase, así que esto devolvía
  // `huboEfecto: true` y llegaba a notificar al estudio una disputa que no
  // quedó registrada en ninguna parte. Guardián por mutación: quitando el
  // `.select('id')` de procesarDisputeCreated, este test vuelve a fallar.
  const { admin } = fakeAdmin({ reciboInexistente: true });
  const r = await procesarDisputeCreated(admin, {
    studioId: 'studio-1', reciboId: 'rec-de-otro-estudio', disputeStatus: 'needs_response', disputeId: 'du_1',
    dueByUnix: null, fuente: 'conciliador',
  });
  assert.equal(r.ok, false, 'no puede decir que fue bien: no escribió nada');
  assert.equal(r.huboEfecto, false);
});

test('disputa PERDIDA: chargeback real — marca DEVUELTO y registra la devolución', async () => {
  const { admin, updates, inserts } = fakeAdmin();
  const r = await procesarDisputeClosed(admin, {
    studioId: 'studio-1', reciboId: 'rec-1', disputeStatus: 'lost', disputeId: 'du_1',
    chargeId: 'ch_1', amount: 16500, fuente: 'conciliador',
  });
  assert.equal(r.ok, true);
  assert.equal(r.huboEfecto, true);
  const flip = updates.find(u => u.tabla === 'recibos' && u.fila.estado === 'DEVUELTO');
  assert.ok(flip, 'un chargeback perdido revierte el dinero igual que un reembolso total');
  const dev = inserts.find(i => i.tabla === 'devoluciones');
  assert.equal(dev!.fila.origen, 'CHARGEBACK');
});

test('disputa GANADA: solo sella el estado, nunca toca recibos.estado', async () => {
  const { admin, updates, inserts } = fakeAdmin();
  const r = await procesarDisputeClosed(admin, {
    studioId: 'studio-1', reciboId: 'rec-1', disputeStatus: 'won', disputeId: 'du_1',
    chargeId: 'ch_1', amount: 16500, fuente: 'conciliador',
  });
  assert.equal(r.ok, true);
  assert.equal(r.huboEfecto, false, 'ganar la disputa no mueve dinero');
  assert.equal(updates.some(u => u.tabla === 'recibos' && u.fila.estado === 'DEVUELTO'), false);
  assert.equal(inserts.filter(i => i.tabla === 'devoluciones').length, 0);
});

test('ORIGENES_CON_RECIBO sigue siendo la lista compartida (webhook y cron no pueden divergir)', () => {
  assert.ok(ORIGENES_CON_RECIBO.has('tarjeta_recibo'));
  assert.ok(ORIGENES_CON_RECIBO.has('sepa_recibo'));
  assert.ok(ORIGENES_CON_RECIBO.has('plan_web'));
  assert.ok(ORIGENES_CON_RECIBO.has('plan_web_embebido'));
});

test('el webhook llama a la lógica compartida, no la reimplementa', () => {
  const webhook = leer('app/api/stripe/webhook/route.ts');
  assert.ok(webhook.includes("from '@/lib/billing/procesar-reembolso'"), 'debe importar el módulo compartido');
  assert.ok(webhook.includes('procesarChargeRefunded('), 'charge.refunded debe delegar');
  assert.ok(webhook.includes('procesarDisputeCreated('), 'charge.dispute.created debe delegar');
  assert.ok(webhook.includes('procesarDisputeClosed('), 'charge.dispute.closed debe delegar');
});
