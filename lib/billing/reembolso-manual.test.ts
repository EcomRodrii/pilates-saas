import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reembolsarReciboAMano, referenciaReembolsoManual, idMovimientoReembolso } from './reembolso-manual.ts';
import { situacionRecibo, importeAdeudado } from './situacion-recibo.ts';
import { esReciboCobrable } from './deuda-recibo.ts';

// «Le he devuelto el dinero»: el estudio le devolvió a mano el dinero de un cobro
// hecho a mano. Antes no existía y «Devolver» lo dejaba como deuda.

type Fila = Record<string, unknown>;

function montar(o: {
  recibo: Fila | null;
  venta?: boolean;
  /** Hay una devolución anotada por este camino (para el «ya estaba»). */
  marca?: boolean;
  cajaAbierta?: boolean;
  errorCaja?: { code?: string; message: string } | null;
  noCasa?: boolean;
  errorUpdate?: boolean;
}) {
  const updates: { fila: Fila; filtros: Record<string, unknown> }[] = [];
  const rpcs: { fn: string; args: Fila }[] = [];
  const admin = {
    rpc(fn: string, args: Fila) { rpcs.push({ fn, args }); return Promise.resolve({ data: 10, error: o.errorCaja ?? null }); },
    from(tabla: string) {
      const filtros: Record<string, unknown> = {};
      let filaUpdate: Fila | null = null;
      const c = {
        select() { return c; },
        update(fila: Fila) { filaUpdate = fila; return c; },
        eq(campo: string, valor: unknown) { filtros[campo] = valor; return c; },
        is(campo: string, valor: unknown) { filtros[`is:${campo}`] = valor; return c; },
        limit() {
          if (tabla === 'ventas_pos') return Promise.resolve({ data: o.venta ? [{ id: 'v-1' }] : [], error: null });
          if (tabla === 'cajas') return Promise.resolve({ data: o.cajaAbierta ? [{ id: 'caja-1' }] : [], error: null });
          return Promise.resolve({ data: [], error: null });
        },
        maybeSingle() {
          if (filaUpdate) {
            updates.push({ fila: filaUpdate, filtros });
            if (o.errorUpdate) return Promise.resolve({ data: null, error: { message: 'boom' } });
            return Promise.resolve({ data: o.noCasa ? null : { id: 'rec-1' }, error: null });
          }
          if (tabla === 'devoluciones') return Promise.resolve({ data: o.marca ? { id: 'dev-1' } : null, error: null });
          return Promise.resolve({ data: o.recibo, error: null });
        },
      };
      return c;
    },
  };
  const llamadas: string[] = [];
  const entradas: Fila[] = [];
  const deps = {
    registrarDevolucion: (async (_a: unknown, p: Fila) => { llamadas.push(`devolucion:${p.referencia}:${p.devueltoCentimos}`); return null; }) as never,
    marcarPenalizacionReembolsada: async () => { llamadas.push('penalizacion'); },
    seguirCreditos: async () => { llamadas.push('creditos'); },
    registrar: (async (_a: unknown, e: Fila) => { entradas.push(e); }) as never,
  };
  return { admin: admin as never, updates, rpcs, llamadas, entradas, deps };
}

const ACTOR = { userId: '00000000-0000-4000-8000-000000000001', rol: 'RECEPCION', nombre: 'Lucía' };
const P = { studioId: 'studio-1', reciboId: 'rec-1', metodo: 'EFECTIVO' as const, ahoraISO: '2026-10-02T09:00:00.000Z', actor: ACTOR };
const COBRO = { estado: 'COBRADO', importe: 45, importe_devuelto: 0, reembolso_stripe_id: null, reembolso_solicitado_en: null, stripe_payment_intent_id: null, metodo_cobro: 'EFECTIVO', sepa_estado: null, socio_id: 'soc-1', concepto: 'Bono 5 clases', fecha_cobro: '2026-09-30' };

test('devuelto a mano: DEVUELTO con TODO el importe devuelto en el mismo UPDATE, con compare-and-set', async () => {
  const m = montar({ recibo: COBRO, cajaAbierta: true });
  const r = await reembolsarReciboAMano(m.admin, P, m.deps);
  assert.deepEqual(r, { ok: true, yaEstaba: false, importe: 45, caja: 'APUNTADA' });
  assert.equal(m.updates.length, 1);
  // Con dos escrituras, entre una y otra sería «devuelto por el banco»: deuda.
  assert.deepEqual(m.updates[0].fila, { estado: 'DEVUELTO', importe_devuelto: 45, fecha_devolucion: '2026-10-02', proximo_reintento: null });
  for (const [k, v] of Object.entries({ estado: 'COBRADO', importe_devuelto: 0, studio_id: 'studio-1', 'is:reembolso_stripe_id': null, 'is:reembolso_solicitado_en': null, 'is:stripe_payment_intent_id': null })) {
    assert.equal(m.updates[0].filtros[k], v, k);
  }
});

test('después ya no es deuda: REEMBOLSADO, no se cobra, no suma en «te deben»', () => {
  const tras = { estado: 'DEVUELTO', importe: 45, importeDevuelto: 45 };
  assert.equal(situacionRecibo(tras), 'REEMBOLSADO');
  assert.equal(importeAdeudado(tras), 0);
  assert.equal(esReciboCobrable({ estado: 'DEVUELTO', importe: 45, importe_devuelto: 45, reembolso_stripe_id: null, reembolso_solicitado_en: null }), false);
});

test('efectos, en orden: la devolución (marca de este camino), la penalización, los créditos, la caja y el libro', async () => {
  const m = montar({ recibo: COBRO, cajaAbierta: true });
  await reembolsarReciboAMano(m.admin, P, m.deps);
  assert.deepEqual(m.llamadas, [`devolucion:${referenciaReembolsoManual('rec-1')}:4500`, 'penalizacion', 'creditos']);
  assert.equal(m.rpcs.length, 1);
  assert.equal(m.rpcs[0].fn, 'mover_caja');
  assert.deepEqual(
    { id: m.rpcs[0].args.p_movimiento_id, tipo: m.rpcs[0].args.p_tipo, importe: m.rpcs[0].args.p_importe, metodo: m.rpcs[0].args.p_metodo_pago, por: m.rpcs[0].args.p_por },
    { id: idMovimientoReembolso('rec-1'), tipo: 'SALIDA', importe: 45, metodo: 'EFECTIVO', por: ACTOR.userId },
  );
  assert.equal(m.entradas.length, 1);
  assert.deepEqual(m.entradas[0].contexto, { accion: 'RECIBO_REEMBOLSADO_A_MANO', concepto: 'Bono 5 clases', importe: 45, metodo_devolucion: 'EFECTIVO' });
  assert.deepEqual(m.entradas[0].sesion, { userId: ACTOR.userId, rol: 'RECEPCION', studioId: 'studio-1' });
});

test('la caja: una transferencia no pasa por el cajón; sin caja abierta no se apunta; un 23505 es «ya apuntado»', async () => {
  const transferencia = montar({ recibo: COBRO, cajaAbierta: true });
  assert.equal((await reembolsarReciboAMano(transferencia.admin, { ...P, metodo: 'TRANSFERENCIA' }, transferencia.deps) as { caja: string }).caja, 'FUERA_DE_CAJA');
  assert.equal(transferencia.rpcs.length, 0);
  const sinCaja = montar({ recibo: COBRO, cajaAbierta: false });
  assert.equal((await reembolsarReciboAMano(sinCaja.admin, P, sinCaja.deps) as { caja: string }).caja, 'SIN_CAJA');
  const repetida = montar({ recibo: COBRO, cajaAbierta: true, errorCaja: { code: '23505', message: 'duplicado' } });
  assert.equal((await reembolsarReciboAMano(repetida.admin, P, repetida.deps) as { caja: string }).caja, 'YA_APUNTADA');
  const falla = montar({ recibo: COBRO, cajaAbierta: true, errorCaja: { message: 'caja cerrada' } });
  const r = await reembolsarReciboAMano(falla.admin, P, falla.deps);
  assert.deepEqual(r, { ok: true, yaEstaba: false, importe: 45, caja: 'NO_APUNTADA' }, 'el recibo ya dice la verdad: la caja no lo tumba');
});

test('lo que no se devuelve aquí: lo que entró por Stripe, una venta de la caja, lo no cobrado o con algo ya devuelto', async () => {
  const casos: [string, Parameters<typeof montar>[0]][] = [
    ['por Stripe', { recibo: { ...COBRO, metodo_cobro: 'TARJETA', stripe_payment_intent_id: 'pi_1' } }],
    ['venta de la caja', { recibo: COBRO, venta: true }],
    ['pendiente', { recibo: { ...COBRO, estado: 'PENDIENTE' } }],
    ['devuelto por el banco', { recibo: { ...COBRO, estado: 'DEVUELTO' } }],
    ['con algo devuelto', { recibo: { ...COBRO, importe_devuelto: 5 } }],
    ['con un reembolso pedido', { recibo: { ...COBRO, reembolso_solicitado_en: '2026-10-01T10:00:00Z' } }],
  ];
  for (const [nombre, o] of casos) {
    const m = montar(o);
    const r = await reembolsarReciboAMano(m.admin, P, m.deps);
    assert.equal(!r.ok && r.http, 409, nombre);
    assert.equal(m.updates.length + m.llamadas.length + m.rpcs.length + m.entradas.length, 0, `${nombre}: sin tocar nada`);
  }
});

test('el compare-and-set no casa (otra pestaña) o falla: 409/500 y ningún efecto', async () => {
  const a = montar({ recibo: COBRO, noCasa: true, cajaAbierta: true });
  assert.equal((r => !r.ok && r.http)(await reembolsarReciboAMano(a.admin, P, a.deps)), 409);
  const b = montar({ recibo: COBRO, errorUpdate: true, cajaAbierta: true });
  assert.equal((r => !r.ok && r.http)(await reembolsarReciboAMano(b.admin, P, b.deps)), 500);
  assert.equal(a.llamadas.length + a.rpcs.length + a.entradas.length + b.llamadas.length + b.rpcs.length + b.entradas.length, 0);
});

test('doble clic: si ya lo devolvió ESTE camino, repite los efectos (idempotentes) sin volver al libro', async () => {
  const m = montar({ recibo: { ...COBRO, estado: 'DEVUELTO', importe_devuelto: 45 }, marca: true, cajaAbierta: true });
  const r = await reembolsarReciboAMano(m.admin, P, m.deps);
  assert.deepEqual(r, { ok: true, yaEstaba: true, importe: 45, caja: 'APUNTADA' });
  assert.equal(m.updates.length, 0);
  assert.equal(m.entradas.length, 0);
});

test('⚠️ ya devuelto por OTRO camino (Stripe, la caja): no se toca nada, y menos la caja', async () => {
  const m = montar({ recibo: { ...COBRO, estado: 'DEVUELTO', importe_devuelto: 45 }, marca: false, cajaAbierta: true });
  const r = await reembolsarReciboAMano(m.admin, P, m.deps);
  assert.deepEqual(r, { ok: true, yaEstaba: true, importe: 45, caja: 'FUERA_DE_CAJA' });
  assert.equal(m.rpcs.length + m.llamadas.length + m.entradas.length, 0, 'apuntar aquí una salida de caja sería inventarla');
});
