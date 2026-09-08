import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liberarCobroPosFallido } from './liberar-cobro-fallido.ts';

// P-2 (27ª pasada de auditoría): antes de este arreglo, un cobro POS
// (Bizum/datáfono) rechazado o con la Checkout Session caducada no soltaba
// nada — la venta se quedaba PENDIENTE_PAGO reteniendo stock, o el recibo con
// su referencia colgada, hasta que alguien volviera al mostrador. El único
// que anulaba era el sondeo del navegador, que muere a los 90s.

function fakeAdmin() {
  const rpcLlamadas: { fn: string; args: Record<string, unknown> }[] = [];
  const updates: { tabla: string; cambios: Record<string, unknown>; filtros: [string, unknown][] }[] = [];
  const admin = {
    rpc(fn: string, args: Record<string, unknown>) {
      rpcLlamadas.push({ fn, args });
      return Promise.resolve({ data: null, error: null });
    },
    from(tabla: string) {
      const fila = { tabla, cambios: {} as Record<string, unknown>, filtros: [] as [string, unknown][] };
      updates.push(fila);
      const c = {
        update(cambios: Record<string, unknown>) { fila.cambios = cambios; return c; },
        eq(campo: string, valor: unknown) { fila.filtros.push([campo, valor]); return c; },
        then(res: (v: { error: null }) => unknown) { return Promise.resolve({ error: null }).then(res); },
      };
      return c;
    },
  };
  return { admin: admin as never, rpcLlamadas, updates };
}

test('con ventaId: llama a fallar_pago_venta_pos y devuelve tipo venta', async () => {
  const { admin, rpcLlamadas, updates } = fakeAdmin();
  const r = await liberarCobroPosFallido(admin, {
    studioId: 'studio-1', metadata: { ventaId: 'venta-1' }, paymentIntentId: 'pi_1', motivo: 'rechazado',
  });
  assert.equal(r.tipo, 'venta');
  assert.equal(rpcLlamadas.length, 1);
  assert.equal(rpcLlamadas[0].fn, 'fallar_pago_venta_pos');
  assert.deepEqual(rpcLlamadas[0].args, {
    p_venta_id: 'venta-1', p_studio_id: 'studio-1', p_pago_estado: 'ERROR', p_motivo: 'rechazado',
  });
  // No toca `recibos`: es la venta, no el cobro de un recibo.
  assert.equal(updates.length, 0);
});

test('con reciboId Y paymentIntentId: el UPDATE va acotado a esa referencia exacta', async () => {
  const { admin, rpcLlamadas, updates } = fakeAdmin();
  const r = await liberarCobroPosFallido(admin, {
    studioId: 'studio-1', metadata: { reciboId: 'recibo-1' }, paymentIntentId: 'pi_1', motivo: 'expirado',
  });
  assert.equal(r.tipo, 'recibo');
  assert.equal(rpcLlamadas.length, 0);
  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].cambios, { cobro_mostrador_pi: null, cobro_mostrador_checkout_session_id: null });
  // ⚠️ Sin este filtro, un evento tardío de un intento YA sustituido por uno
  // nuevo borraría la referencia del reintento en curso — race real si la
  // clienta reintenta justo cuando el primer PI expira.
  assert.deepEqual(updates[0].filtros, [
    ['id', 'recibo-1'], ['studio_id', 'studio-1'], ['cobro_mostrador_pi', 'pi_1'],
  ]);
});

test('con reciboId sin paymentIntentId resoluble: el UPDATE no se acota por PI (no hay a qué acotar)', async () => {
  const { admin, updates } = fakeAdmin();
  await liberarCobroPosFallido(admin, {
    studioId: 'studio-1', metadata: { reciboId: 'recibo-1' }, paymentIntentId: null, motivo: 'expirado',
  });
  assert.deepEqual(updates[0].filtros, [['id', 'recibo-1'], ['studio_id', 'studio-1']]);
});

test('sin ventaId ni reciboId en la metadata: no toca nada (tipo ninguno)', async () => {
  const { admin, rpcLlamadas, updates } = fakeAdmin();
  const r = await liberarCobroPosFallido(admin, {
    studioId: 'studio-1', metadata: undefined, paymentIntentId: 'pi_1', motivo: 'x',
  });
  assert.equal(r.tipo, 'ninguno');
  assert.equal(rpcLlamadas.length, 0);
  assert.equal(updates.length, 0);
});
