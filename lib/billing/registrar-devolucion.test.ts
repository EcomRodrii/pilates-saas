import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  referenciaDevolucion, origenDeReembolso, estadoInicialDevolucion, registrarDevolucion, resolverFalloDevolucion,
} from './registrar-devolucion.ts';

// Lo que estos tests fijan es lo que decide si la propietaria se entera de una
// devolución y si se le ofrece deshacer la entrega. Nada de esto lo puede cazar
// un e2e: `page.route` mockea la red y los reintentos de Stripe no existen ahí.

// ── La clave natural, que es lo que impide duplicar tarjetas ─────────────────

test('un reintento del MISMO reembolso da la misma referencia', () => {
  // Hace falta de verdad: `reclamarWebhookEvent` expira a los 120 s y falla
  // abierto, así que el handler se re-ejecuta.
  const a = referenciaDevolucion({ tipo: 'reembolso', chargeId: 'ch_1', acumuladoDevueltoCentimos: 4950 });
  const b = referenciaDevolucion({ tipo: 'reembolso', chargeId: 'ch_1', acumuladoDevueltoCentimos: 4950 });
  assert.equal(a, b);
});

test('un SEGUNDO parcial sí es un hecho nuevo', () => {
  // El acumulado es distinto, así que crea fila — y debe crearla: son dos
  // devoluciones reales sobre el mismo cobro.
  const primero = referenciaDevolucion({ tipo: 'reembolso', chargeId: 'ch_1', acumuladoDevueltoCentimos: 4950 });
  const segundo = referenciaDevolucion({ tipo: 'reembolso', chargeId: 'ch_1', acumuladoDevueltoCentimos: 9900 });
  assert.notEqual(primero, segundo);
});

test('reembolsar DURANTE una disputa no genera dos tarjetas', () => {
  // Stripe manda `charge.refunded` Y `charge.dispute.closed` con status
  // `charge_refunded` por el mismo dinero. Los dos caminos tienen que caer en la
  // misma referencia o la propietaria vería dos avisos y podría revertir dos veces.
  const porReembolso = referenciaDevolucion({ tipo: 'reembolso', chargeId: 'ch_1', acumuladoDevueltoCentimos: 16500 });
  const porDisputaReembolsada = referenciaDevolucion({ tipo: 'reembolso', chargeId: 'ch_1', acumuladoDevueltoCentimos: 16500 });
  assert.equal(porReembolso, porDisputaReembolsada);
  // El chargeback PERDIDO sí es otro hecho: ahí el dinero se pierde, no se devuelve.
  assert.notEqual(porReembolso, referenciaDevolucion({ tipo: 'chargeback', disputeId: 'du_1' }));
});

// ── Total vs parcial ────────────────────────────────────────────────────────

test('el parcial se reconoce como parcial, que es el caso hoy invisible', () => {
  assert.equal(origenDeReembolso({ refunded: false, acumulado: 4950, total: 16500 }), 'REEMBOLSO_PARCIAL');
  assert.equal(origenDeReembolso({ refunded: true, acumulado: 16500, total: 16500 }), 'REEMBOLSO_TOTAL');
  // Sin el flag de Stripe pero con el acumulado al tope, también es total.
  assert.equal(origenDeReembolso({ refunded: false, acumulado: 16500, total: 16500 }), 'REEMBOLSO_TOTAL');
});

// ── ¿Tiene sentido ofrecer deshacer? ────────────────────────────────────────

test('cobro con entrega: se ofrece revisar', () => {
  assert.equal(
    estadoInicialDevolucion({ entrega_aplicada: true, suscripcion_id: 'sus-1' }),
    'PENDIENTE_REVISION',
  );
});

test('cobro que NO entregó nada: no se ofrece, y consta por qué', () => {
  // El bono aún tenía saldo, así que la renovación fue un no-op. Ofrecer
  // revertirlo sería ofrecer quitar sesiones que este cobro nunca puso.
  assert.equal(
    estadoInicialDevolucion({ entrega_aplicada: false, suscripcion_id: 'sus-1' }),
    'OMITIDA_SIN_ENTREGA',
  );
});

test('recibo sin suscripción (una penalización): tampoco', () => {
  assert.equal(
    estadoInicialDevolucion({ entrega_aplicada: true, suscripcion_id: null }),
    'OMITIDA_SIN_ENTREGA',
  );
});

test('cobro anterior al snapshot: "no lo sé" NO es "no entregó"', () => {
  // Es la distinción que evita prometer una reversión exacta sobre un cobro del
  // que no se guardó nada.
  assert.equal(
    estadoInicialDevolucion({ entrega_aplicada: null, suscripcion_id: 'sus-1' }),
    'OMITIDA_SIN_INSTRUMENTAR',
  );
});

// ── El registro contra la BD ────────────────────────────────────────────────

type Fila = Record<string, unknown>;

function fakeAdmin(opts: { recibo?: Fila | null; ventaPos?: Fila | null; yaExistia?: boolean } = {}) {
  const insertado: Fila[] = [];
  const actualizado: { tabla: string; fila: Fila }[] = [];
  const api = {
    from(tabla: string) {
      return {
        select() { return this; },
        eq() { return this; },
        maybeSingle() {
          if (tabla === 'recibos') {
            return Promise.resolve({ data: opts.recibo === undefined ? RECIBO : opts.recibo, error: null });
          }
          if (tabla === 'ventas_pos') {
            return Promise.resolve({ data: opts.ventaPos === undefined ? VENTA_POS : opts.ventaPos, error: null });
          }
          // Retorno del insert de devoluciones.
          if (opts.yaExistia) return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate' } });
          return Promise.resolve({ data: { id: 'dev-1' }, error: null });
        },
        insert(fila: Fila) { insertado.push(fila); return this; },
        update(fila: Fila) { actualizado.push({ tabla, fila }); return this; },
        // supabase-js encadena `.update().eq().eq()` y se espera al final: el
        // fake tiene que ser thenable, no devolver una promesa a media cadena.
        then(res: (v: { error: null }) => unknown) { return Promise.resolve({ error: null }).then(res); },
      };
    },
  };
  return { admin: api as never, insertado, actualizado };
}

const RECIBO = {
  id: 'rec-1', socio_id: 'soc-1', suscripcion_id: 'sus-1', importe: 165, entrega_aplicada: true,
};

const VENTA_POS = { id: 'pos-1', socio_id: 'soc-2', total: 40 };

const BASE = {
  studioId: 'studio-1', reciboId: 'rec-1', origen: 'REEMBOLSO_PARCIAL' as const,
  devueltoCentimos: 4950, referencia: 'ch_1:4950', stripeChargeId: 'ch_1',
};

test('una devolución nueva se anota y pone al día el acumulado del recibo', async () => {
  const { admin, insertado, actualizado } = fakeAdmin();
  const r = await registrarDevolucion(admin, BASE);

  assert.ok(r, 'tiene que devolver la fila para que el llamante avise');
  assert.equal(r.estado, 'PENDIENTE_REVISION');
  assert.equal(r.importeDevuelto, 49.5);
  assert.equal(insertado[0].origen, 'REEMBOLSO_PARCIAL');
  assert.equal(insertado[0].importe_cobrado, 165, 'foto del recibo al detectar');
  // Valor ABSOLUTO, no incremento: así un reintento lo deja igual.
  assert.equal(actualizado[0].tabla, 'recibos');
  assert.equal(actualizado[0].fila.importe_devuelto, 49.5);
});

test('un reintento de Stripe no vuelve a avisar', async () => {
  const { admin, actualizado } = fakeAdmin({ yaExistia: true });
  const r = await registrarDevolucion(admin, BASE);

  assert.equal(r, null, 'null = ya estaba, no hay nada nuevo que contar');
  assert.equal(actualizado.length, 0, 'y no se toca el recibo otra vez');
});

// ── F-12/F-13: generalización a venta POS ───────────────────────────────────

const BASE_POS = {
  studioId: 'studio-1', ventaPosId: 'pos-1', origen: 'REEMBOLSO_TOTAL' as const,
  devueltoCentimos: 4000, referencia: 'ch_pos:4000', stripeChargeId: 'ch_pos',
} as const;

test('una devolución de venta POS se anota con venta_pos_id, sin recibo_id, y sin pedir revisión', async () => {
  const { admin, insertado, actualizado } = fakeAdmin();
  const r = await registrarDevolucion(admin, BASE_POS);

  assert.ok(r, 'tiene que devolver la fila para que el llamante avise');
  // Una venta POS nunca tiene entrega instrumentada que revisar.
  assert.equal(r.estado, 'OMITIDA_SIN_ENTREGA');
  assert.equal(r.importeDevuelto, 40);
  assert.equal(insertado[0].venta_pos_id, 'pos-1');
  assert.equal(insertado[0].recibo_id, null);
  assert.equal(insertado[0].socio_id, 'soc-2', 'sale de ventas_pos, no de recibos');
  assert.equal(actualizado[0].tabla, 'ventas_pos', 'el espejo de lectura rápida se actualiza en su propia tabla');
  assert.equal(actualizado[0].fila.importe_devuelto, 40);
  assert.ok(actualizado[0].fila.devuelta_en, 'ventas_pos SÍ lleva devuelta_en, a diferencia de recibos');
});

test('una devolución de venta POS que no existe en este estudio no se anota', async () => {
  const { admin, insertado } = fakeAdmin({ ventaPos: null });
  assert.equal(await registrarDevolucion(admin, BASE_POS), null);
  assert.equal(insertado.length, 0);
});

test('una devolución de un recibo que no es de este estudio no se anota', async () => {
  const { admin, insertado } = fakeAdmin({ recibo: null });
  assert.equal(await registrarDevolucion(admin, BASE), null);
  assert.equal(insertado.length, 0);
});

test('el estado inicial sale del recibo, no de quien llama', async () => {
  const { admin, insertado } = fakeAdmin({
    recibo: { ...RECIBO, entrega_aplicada: null },
  });
  const r = await registrarDevolucion(admin, BASE);
  assert.equal(r?.estado, 'OMITIDA_SIN_INSTRUMENTAR');
  assert.equal(insertado[0].estado, 'OMITIDA_SIN_INSTRUMENTAR');
});

// ── D-8: resolverFalloDevolucion — tabla de verdad del reembolso fallido ────

test('⚠️ D-8, el caso central: reembolso total fallido → flip a COBRADO', () => {
  const plan = resolverFalloDevolucion({
    estadoRecibo: 'DEVUELTO', disputaEstado: null, esSepa: false,
    chargeId: 'ch_1', refunded: false, acumuladoCentimos: 0, totalCentimos: 5000, refundCentimos: 5000,
  });
  assert.equal(plan.flipar, true);
  assert.equal(plan.sepaEstadoRestaurado, null);
  assert.equal(plan.referenciaOriginal, 'ch_1:5000', 'el acumulado del momento de anotarse: fresco + lo que intentaba devolver');
  assert.equal(plan.importeDevueltoFresco, 0);
});

test('D-8: en SEPA el flip restaura sepa_estado a succeeded', () => {
  const plan = resolverFalloDevolucion({
    estadoRecibo: 'DEVUELTO', disputaEstado: null, esSepa: true,
    chargeId: 'ch_1', refunded: false, acumuladoCentimos: 0, totalCentimos: 5000, refundCentimos: 5000,
  });
  assert.equal(plan.sepaEstadoRestaurado, 'succeeded');
});

test('⚠️ D-8: si OTRO reembolso mantiene el cargo totalmente devuelto, NO se flipa', () => {
  // Dos parciales de 25 €; falla el segundo pero un tercero ya lo re-cubrió:
  // el charge fresco dice refunded=true y el DEVUELTO sigue siendo verdad.
  const plan = resolverFalloDevolucion({
    estadoRecibo: 'DEVUELTO', disputaEstado: null, esSepa: false,
    chargeId: 'ch_1', refunded: true, acumuladoCentimos: 5000, totalCentimos: 5000, refundCentimos: 2500,
  });
  assert.equal(plan.flipar, false);
});

test('⚠️ D-8: un DEVUELTO por chargeback perdido NUNCA se resucita por un refund fallido aparte', () => {
  const plan = resolverFalloDevolucion({
    estadoRecibo: 'DEVUELTO', disputaEstado: 'lost', esSepa: false,
    chargeId: 'ch_1', refunded: false, acumuladoCentimos: 0, totalCentimos: 5000, refundCentimos: 1000,
  });
  assert.equal(plan.flipar, false);
});

test('D-8: un parcial fallido sobre recibo COBRADO solo anota (no había nada que flipar)', () => {
  const plan = resolverFalloDevolucion({
    estadoRecibo: 'COBRADO', disputaEstado: null, esSepa: false,
    chargeId: 'ch_1', refunded: false, acumuladoCentimos: 1000, totalCentimos: 5000, refundCentimos: 1500,
  });
  assert.equal(plan.flipar, false);
  assert.equal(plan.referenciaOriginal, 'ch_1:2500');
  assert.equal(plan.importeDevueltoFresco, 10, 'el acumulado fresco en euros, valor absoluto');
});

test('D-8: reprocesar tras un reintento de reembolso que YA triunfó no flipa (charge fresco manda)', () => {
  // Reenvío manual del evento viejo después de que el panel reintentara con
  // éxito: el charge fresco vuelve a estar totalmente devuelto → no tocar.
  const plan = resolverFalloDevolucion({
    estadoRecibo: 'DEVUELTO', disputaEstado: null, esSepa: false,
    chargeId: 'ch_1', refunded: true, acumuladoCentimos: 5000, totalCentimos: 5000, refundCentimos: 5000,
  });
  assert.equal(plan.flipar, false);
});
