import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  esReciboDePagoOnline, reembolsosConfirmados, reembolsosDelCargoConfirmados, reembolsoTotalDelCargo, revertirCompraDeClaseDelRecibo,
} from './revertir-compra-de-clase.ts';

// PR-14: devolver el dinero ENTERO de una clase COMPENSADA la saca de la cola y del bono. La
// transacción vive en la RPC (`supabase/tests/rls-revertir-compra-de-clase.test.ts`); aquí, cuándo
// se llama y cuándo no.

test('solo el recibo del PLAN de un pago online: ni la matrícula aparte ni un recibo de mostrador', () => {
  assert.equal(esReciboDePagoOnline('rec-web-abc123'), true);
  assert.equal(esReciboDePagoOnline('rec-web-mat-abc123'), false);
  assert.equal(esReciboDePagoOnline('rec-renov-x'), false);
  assert.equal(esReciboDePagoOnline('rec-cita-x'), false);
});

test('un reembolso PARCIAL no revierte nada: total solo si Stripe lo dice o el acumulado llega al cargo', () => {
  assert.equal(reembolsoTotalDelCargo({ refunded: true, amount: 5000, amountRefunded: 5000 }), true);
  assert.equal(reembolsoTotalDelCargo({ refunded: false, amount: 5000, amountRefunded: 5000 }), true);
  assert.equal(reembolsoTotalDelCargo({ refunded: false, amount: 5000, amountRefunded: 4999 }), false);
  assert.equal(reembolsoTotalDelCargo({ refunded: false, amount: 5000, amountRefunded: null }), false);
  assert.equal(reembolsoTotalDelCargo({ refunded: false, amount: null, amountRefunded: 0 }), false, 'sin importe del cargo, nunca «total»');
});

test('un reembolso aún `pending` (o a falta de acción) no cuenta: puede fallar días después', () => {
  assert.equal(reembolsosConfirmados([{ status: 'succeeded' }]), true);
  assert.equal(reembolsosConfirmados([{ status: 'succeeded' }, { status: 'failed' }]), true, 'el fallido ya no suma al total');
  assert.equal(reembolsosConfirmados([{ status: 'succeeded' }, { status: 'pending' }]), false);
  assert.equal(reembolsosConfirmados([{ status: 'requires_action' }]), false);
  assert.equal(reembolsosConfirmados([]), false);
});

test('si Stripe no contesta al listar los reembolsos, `null` (se reintenta), nunca «confirmados»', async () => {
  const roto = { refunds: { list() { throw new Error('red'); } } };
  assert.equal(await reembolsosDelCargoConfirmados(roto as never, 'ch_1', 'acct_1'), null);
  const bien = { refunds: { list: async function* () { yield { status: 'succeeded' }; } } };
  assert.equal(await reembolsosDelCargoConfirmados(bien as never, 'ch_1', 'acct_1'), true);
});

test('sin recibo de pago online, ni lee la base de datos', async () => {
  let consultas = 0;
  const admin = { from() { consultas++; throw new Error('no debería consultar'); }, rpc() { consultas++; throw new Error('no'); } };
  const r = await revertirCompraDeClaseDelRecibo(admin as never, { studioId: 'e1', reciboId: 'rec-renov-1', motivo: 'reembolso', fuente: 'webhook' });
  assert.deepEqual(r, { ok: true, reversion: null });
  assert.equal(consultas, 0);
});

test('busca el pago COMPENSADA por la suscripción del recibo y llama a la RPC con él; la segunda vez (ya REEMBOLSADA) no hay a quién', async () => {
  const llamadas: { rpc: string; args: Record<string, unknown> }[] = [];
  const filtros: string[] = [];
  let compensadas = [{ id: 'pc-1', importe_centimos: 4500, matricula_centimos: 500 }];
  const admin = {
    from(tabla: string) {
      const c = {
        select() { return c; },
        eq(col: string, v: unknown) { filtros.push(`${tabla}.${col}=${v}`); return c; },
        or(f: string) { filtros.push(`${tabla}.or=${f}`); return c; },
        maybeSingle() { return Promise.resolve({ data: tabla === 'recibos' ? { suscripcion_id: 'sus-web-1' } : null, error: null }); },
        then(res: (v: { data: unknown; error: null }) => unknown) { return Promise.resolve({ data: compensadas, error: null }).then(res); },
      };
      return c;
    },
    rpc(nombre: string, args: Record<string, unknown>) {
      llamadas.push({ rpc: nombre, args });
      compensadas = [];
      return Promise.resolve({
        data: [{ cambiado: true, estado_pago: 'REEMBOLSADA', reserva_cancelada: true, bono_revertido: true, motivo_sin_revertir: null,
          sesion_clase_id: 'ses-1', suscripcion_entregada_id: 'sus-web-1', promovida_id: null, oferta_id: null, oferta_hasta: null }],
        error: null,
      });
    },
  };
  // Una disputa perdida por MENOS de lo que costó la clase (45 € + 5 € de matrícula) es parcial: nada.
  const parcial = await revertirCompraDeClaseDelRecibo(admin as never, {
    studioId: 'e1', reciboId: 'rec-web-1', paymentIntentId: 'pi_1', importeDevueltoCentimos: 4999, motivo: 'disputa', fuente: 'webhook',
  });
  assert.deepEqual([parcial.ok, parcial.reversion, llamadas.length], [true, null, 0]);
  const r = await revertirCompraDeClaseDelRecibo(admin as never, {
    studioId: 'e1', reciboId: 'rec-web-1', paymentIntentId: 'pi_1', motivo: 'reembolso', fuente: 'webhook',
  });
  assert.equal(r.ok, true);
  assert.equal(r.reversion?.bono_revertido, true);
  assert.deepEqual(llamadas, [{ rpc: 'revertir_compra_de_clase', args: { p_studio_id: 'e1', p_pago_clase_id: 'pc-1' } }]);
  assert.ok(filtros.includes('pagos_clase.estado=COMPENSADA') && filtros.includes('pagos_clase.studio_id=e1'));
  assert.ok(filtros.includes('pagos_clase.or=payment_intent_id.eq.pi_1,and(payment_intent_id.is.null,suscripcion_id.eq.sus-web-1)'), 'por su PaymentIntent o por lo que entregó');
  const otra = await revertirCompraDeClaseDelRecibo(admin as never, { studioId: 'e1', reciboId: 'rec-web-1', motivo: 'reembolso', fuente: 'conciliador' });
  assert.deepEqual(otra, { ok: true, reversion: null });
  assert.equal(llamadas.length, 1);
});

test('si la RPC falla, `ok: false` para que Stripe reintente (anotar y revertir son idempotentes)', async () => {
  const admin = {
    from(tabla: string) {
      const c = {
        select() { return c; }, eq() { return c; }, or() { return c; },
        maybeSingle() { return Promise.resolve({ data: tabla === 'recibos' ? { suscripcion_id: 'sus-web-1' } : null, error: null }); },
        then(res: (v: { data: unknown; error: null }) => unknown) {
          return Promise.resolve({ data: [{ id: 'pc-1', importe_centimos: 1500, matricula_centimos: 0 }], error: null }).then(res);
        },
      };
      return c;
    },
    rpc() { return Promise.resolve({ data: null, error: { code: '40P01', message: 'deadlock detected' } }); },
  };
  const r = await revertirCompraDeClaseDelRecibo(admin as never, { studioId: 'e1', reciboId: 'rec-web-1', motivo: 'disputa', fuente: 'webhook' });
  assert.deepEqual(r, { ok: false, reversion: null });
});

test('el webhook y el conciliador revierten SOLO en el reembolso total y en la disputa perdida', () => {
  const src = readFileSync(join(import.meta.dirname, 'procesar-reembolso.ts'), 'utf8');
  const usos = [...src.matchAll(/await revertirCompraDeClaseDelRecibo\(/g)];
  assert.equal(usos.length, 2, 'un gancho por camino de dinero que sale entero');
  const reembolso = src.slice(src.indexOf('export async function procesarChargeRefunded('), src.indexOf('async function anotarChargeRefunded('));
  assert.match(reembolso, /if \(resultado\.ok && reembolsoTotalDelCargo\(p\.charge\) && esReciboDePagoOnline\(p\.reciboId\)\) \{/);
  assert.match(reembolso, /if \(p\.reembolsosConfirmados === true\) \{\s+const rev = await revertirCompraDeClaseDelRecibo\(admin, \{[^}]*motivo: 'reembolso'/, 'solo con los reembolsos ya salidos');
  assert.match(reembolso, /if \(!rev\.ok\) return \{ \.\.\.resultado, ok: false/, 'un fallo pide reintento');
  const disputa = src.slice(src.indexOf('export async function procesarDisputeClosed('), src.indexOf('export async function procesarReembolsoVentaPos('));
  const perdida = disputa.indexOf("if (p.disputeStatus === 'lost') {\n    // Gemelo de H-2");
  const gancho = disputa.indexOf("motivo: 'disputa'");
  assert.ok(perdida > -1 && gancho > perdida, 'dentro de la rama de la disputa PERDIDA');
  assert.match(disputa, /importeDevueltoCentimos: p\.amount \?\? 0/, 'una disputa parcial no revierte');
  assert.match(disputa, /if \(!rev\.ok\) return \{ ok: false/, 'el conciliador no vuelve a una disputa cerrada: el reintento es de Stripe');
});
