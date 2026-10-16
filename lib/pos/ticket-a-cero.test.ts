import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { confirmarTicketACero } from './ticket-a-cero.ts';

// Un ticket a 0 € se daba por cobrado sin mirar lo que contestaba
// `confirmar_pago_venta_pos`: con la confirmación caída, la Caja decía «Cobrado» con la
// venta PENDIENTE_PAGO, sin bono y sin factura. Aquí se hace fallar la confirmación de
// todas las formas en que puede fallar.

type Respuesta = { data: unknown; error: { message: string } | null };

function fakeAdmin(confirmar: Respuesta, lectura: Respuesta = { data: null, error: null }) {
  const llamadas = { rpc: [] as { fn: string; args: Record<string, unknown> }[], lecturas: 0 };
  const admin = {
    rpc(fn: string, args: Record<string, unknown>) {
      llamadas.rpc.push({ fn, args });
      return Promise.resolve(confirmar);
    },
    from(tabla: string) {
      assert.equal(tabla, 'ventas_pos');
      llamadas.lecturas++;
      const c = {
        select() { return c; },
        eq() { return c; },
        maybeSingle() { return Promise.resolve(lectura); },
      };
      return c;
    },
  };
  return { admin: admin as never, llamadas };
}

const P = { studioId: 'studio-1', ventaId: 'vpos-1' };

test('confirmada de verdad: pagada, sin leer nada más', async () => {
  const { admin, llamadas } = fakeAdmin({ data: [{ r_aplicado: true, r_estado: 'PAGADA' }], error: null });
  assert.equal(await confirmarTicketACero(admin, P), 'pagada');
  assert.deepEqual(llamadas.rpc, [{
    fn: 'confirmar_pago_venta_pos',
    args: { p_venta_id: 'vpos-1', p_studio_id: 'studio-1', p_payment_intent_id: null, p_importe_confirmado: 0 },
  }]);
  assert.equal(llamadas.lecturas, 0);
});

test('la confirmación no se aplica (la venta ya no estaba pendiente): sin pagar, nunca «Cobrado»', async () => {
  const { admin } = fakeAdmin({ data: [{ r_aplicado: false, r_estado: 'ANULADA' }], error: null });
  assert.equal(await confirmarTicketACero(admin, P), 'sin-pagar');
});

test('la confirmación no contesta fila: sin pagar', async () => {
  const { admin } = fakeAdmin({ data: [], error: null });
  assert.equal(await confirmarTicketACero(admin, P), 'sin-pagar');
});

test('la confirmación falla y la venta sigue pendiente: sin pagar', async () => {
  const { admin, llamadas } = fakeAdmin(
    { data: null, error: { message: 'connection reset' } },
    { data: { estado: 'PENDIENTE_PAGO' }, error: null },
  );
  assert.equal(await confirmarTicketACero(admin, P), 'sin-pagar');
  assert.equal(llamadas.lecturas, 1, 'antes de decidir, se mira cómo quedó la venta');
});

test('la confirmación falla pero sí se guardó (se perdió la respuesta): pagada, para entregar lo cobrado', async () => {
  const { admin } = fakeAdmin(
    { data: null, error: { message: 'timeout' } },
    { data: { estado: 'PAGADA' }, error: null },
  );
  assert.equal(await confirmarTicketACero(admin, P), 'pagada');
});

test('la confirmación falla y tampoco se puede leer la venta: no se sabe, y no se toca', async () => {
  const conError = fakeAdmin({ data: null, error: { message: 'x' } }, { data: null, error: { message: 'y' } });
  assert.equal(await confirmarTicketACero(conError.admin, P), 'no-se-sabe');
  const sinFila = fakeAdmin({ data: null, error: { message: 'x' } }, { data: null, error: null });
  assert.equal(await confirmarTicketACero(sinFila.admin, P), 'no-se-sabe');
});

const RUTA = readFileSync(join(import.meta.dirname, '../../app/api/pos/venta/route.ts'), 'utf8');
function tramo(desde: string, hasta: string) {
  const ini = RUTA.indexOf(desde);
  assert.ok(ini >= 0, `no se encuentra «${desde}» en la ruta`);
  const fin = RUTA.indexOf(hasta, ini);
  assert.ok(fin > ini, `no se encuentra «${hasta}» tras «${desde}»`);
  return RUTA.slice(ini, fin);
}

test('la ruta solo dice PAGADA a 0 € con la venta pagada de verdad', () => {
  assert.match(RUTA, /if \(centimos <= 0\) return cerrarTicketACero\(\);/);
  const cierre = tramo('const cerrarTicketACero = async', '\n  };\n');
  assert.match(cierre, /confirmarTicketACero\(/);
  assert.doesNotMatch(RUTA, /admin\.rpc\('confirmar_pago_venta_pos'/, 'la confirmación del ticket a 0 € va por el helper, que mira lo que contesta');
  const sale = cierre.search(/if \(!pagada\)/);
  const entrega = cierre.search(/entregarVentaPOS\(/);
  const pagada = cierre.search(/estado: 'PAGADA'/);
  assert.ok(sale > 0 && sale < entrega && entrega < pagada, 'sin pagar no se entrega ni se responde PAGADA');
  // Sin pagar se anula con el intento cerrado, salvo que se pagara entretanto.
  assert.match(cierre, /resultado === 'sin-pagar'[\s\S]*?anularVentaSinCobro\([\s\S]*?cerrado: true[\s\S]*?pagada = sePago === true/);
});

test('el reintento nunca inventa un estado, y termina el ticket a 0 € que se quedó a medias', () => {
  const reintento = tramo('if (base.yaExistia) {', '// ── Cobro manual');
  assert.doesNotMatch(reintento, /\?\? 'PAGADA'|\?\? 'PAGADO'/, 'sin poder leer la venta no se dice «Cobrado»');
  assert.match(reintento, /if \(errV \|\| !v\) \{\s*return NextResponse\.json\(\{ error: [^}]*\}, \{ status: 503 \}\)/);
  assert.match(reintento, /Math\.round\(total \* 100\) <= 0[\s\S]*?return cerrarTicketACero\(\);/);
});

test('anular solo suelta las plazas y cierra el intento con la venta anulada de verdad', () => {
  const anular = tramo('async function anularVentaSinCobro(', '\n}\n');
  const error = anular.search(/if \(error\) \{/);
  const noAnulo = anular.search(/if \(anulada !== true\) \{/);
  const plazas = anular.search(/liberarPlaza\(/);
  assert.ok(error > 0 && noAnulo > error && plazas > noAnulo, 'las plazas se sueltan después de saber que se anuló');
  assert.match(anular.slice(noAnulo, plazas), /if \(v\.estado === 'PAGADA'\) return \{ pagada: true \};/);
});
