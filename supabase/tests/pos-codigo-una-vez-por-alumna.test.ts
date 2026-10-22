// Un código de descuento vale una vez por alumna también en la Caja (migr
// 20261015222942_caja_codigo_una_vez_por_alumna, decisión del fundador del 16-oct-2026),
// contra una base de datos real:
//  · la segunda venta de la Caja con el mismo código y la misma alumna se rechaza con
//    CODIGO_YA_USADO_POR_SOCIA y no deja nada; la vista previa lo ve igual;
//  · sin alumna solo cuenta el tope global;
//  · un uso online (un recibo) frena la Caja, y uno de la Caja lo ve la lectura de los
//    cobros online (`codigosYaUsadosPorSocia`): una sola regla, un solo índice;
//  · si el pago de la Caja no sale (`fallar_pago_venta_pos`), el código vuelve a estar libre.
//
// Se llama con `admin` (service_role), como `/api/pos/venta`. Ver
// `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive aquí.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearSocia, crearStudioConPropietaria, limpiarFixtures, type StudioFixture,
} from '../../lib/db/rls-test-helpers.ts';
import { codigosYaUsadosPorSocia } from '../../lib/billing/codigos-ya-usados.ts';

const admin = clienteAdminLocal();
let contador = 0;
const idUnico = (prefijo: string) => `${prefijo}-uv-${process.pid}-${Date.now()}-${contador++}`;

async function conEstudio(prueba: (studio: StudioFixture) => Promise<void>) {
  const studio = await crearStudioConPropietaria(admin);
  try {
    await prueba(studio);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
}

async function crearCodigo(studioId: string) {
  const id = idUnico('cod');
  const { error } = await admin.from('codigos_descuento').insert({
    id, studio_id: studioId, codigo: `UV${contador}`, tipo: 'PORCENTAJE', valor: 10, usos: 0, activo: true,
  });
  assert.ok(!error, `fixture de código: ${error?.message}`);
  return id;
}

function vender(studio: StudioFixture, socioId: string | null, codigoId: string, extra: Record<string, unknown> = {}) {
  return admin.rpc('registrar_venta_pos', {
    p_venta_id: idUnico('vpos'), p_studio_id: studio.studioId, p_socio_id: socioId,
    p_lineas: [{ tipo: 'LIBRE', nombre: 'Clase suelta', precio: 10, cantidad: 1 }],
    p_descuento_tipo: null, p_descuento_valor: null, p_codigo_descuento_id: codigoId,
    p_metodo_pago: 'EFECTIVO', p_caja_id: null, p_vendido_por: studio.authUserId, p_vendido_por_nombre: 'Prueba',
    p_efectivo_recibido: 20, p_idempotencia_clave: null, p_estado_inicial: 'PAGADA', p_notas: null,
    ...extra,
  });
}

async function cuantas(tabla: 'ventas_pos' | 'codigos_descuento_consumos', filtro: Record<string, string>) {
  let q = admin.from(tabla).select('*', { count: 'exact', head: true });
  for (const [k, v] of Object.entries(filtro)) q = q.eq(k, v);
  const { count, error } = await q;
  assert.ok(!error, error?.message);
  return count ?? 0;
}

async function usos(codigoId: string) {
  const { data } = await admin.from('codigos_descuento').select('usos').eq('id', codigoId).single();
  return data?.usos ?? 0;
}

test('la segunda venta de la Caja con el mismo código y la misma alumna se rechaza y no deja nada', async () => {
  await conEstudio(async (studio) => {
    const socio = await crearSocia(admin, studio.studioId);
    const codigo = await crearCodigo(studio.studioId);

    const primera = await vender(studio, socio, codigo);
    assert.ok(!primera.error, primera.error?.message);
    assert.equal(await cuantas('codigos_descuento_consumos', { codigo_id: codigo, socio_id: socio }), 1, 'la Caja apunta su uso');

    const segunda = await vender(studio, socio, codigo);
    assert.equal(segunda.data, null);
    assert.match(segunda.error?.message ?? '', /CODIGO_YA_USADO_POR_SOCIA/);
    assert.equal(await cuantas('ventas_pos', { studio_id: studio.studioId }), 1, 'la rechazada no deja venta');
    assert.equal(await usos(codigo), 1, 'ni gasta un uso del tope global');
  });
});

test('la vista previa lo ve antes de cobrar, y no deja nada', async () => {
  await conEstudio(async (studio) => {
    const socio = await crearSocia(admin, studio.studioId);
    const codigo = await crearCodigo(studio.studioId);

    const limpia = await vender(studio, socio, codigo, { p_solo_calcular: true });
    assert.match(limpia.error?.message ?? '', /^PRESUPUESTO:9\.00:/, 'sin usarlo antes, la vista previa calcula con el código');
    assert.equal(await cuantas('codigos_descuento_consumos', { codigo_id: codigo }), 0, 'la vista previa no apunta el uso');

    assert.ok(!(await vender(studio, socio, codigo)).error);
    const repetida = await vender(studio, socio, codigo, { p_solo_calcular: true });
    assert.match(repetida.error?.message ?? '', /CODIGO_YA_USADO_POR_SOCIA/);
  });
});

test('sin alumna solo cuenta el tope global: no hay a quién mirar', async () => {
  await conEstudio(async (studio) => {
    const codigo = await crearCodigo(studio.studioId);
    assert.ok(!(await vender(studio, null, codigo)).error);
    assert.ok(!(await vender(studio, null, codigo)).error);
    assert.equal(await cuantas('codigos_descuento_consumos', { codigo_id: codigo }), 0, 'sin alumna no se apunta nada');
    assert.equal(await usos(codigo), 2);
  });
});

test('una sola regla en los dos canales: lo usado online frena la Caja, y lo de la Caja lo ven los cobros online', async () => {
  await conEstudio(async (studio) => {
    const online = await crearSocia(admin, studio.studioId);
    const mostrador = await crearSocia(admin, studio.studioId);
    const codigo = await crearCodigo(studio.studioId);

    // Un cobro online ya cobrado, como lo deja `consumirCodigoDescuentoSiAplica`.
    const recibo = idUnico('rec');
    const { error: errRec } = await admin.from('recibos').insert({
      id: recibo, studio_id: studio.studioId, socio_id: online, concepto: 'Bono online', importe: 9, estado: 'COBRADO',
      fecha_vencimiento: '2026-10-01',
    });
    assert.ok(!errRec, errRec?.message);
    const { error: errCons } = await admin.from('codigos_descuento_consumos').insert({ recibo_id: recibo, codigo_id: codigo, socio_id: online });
    assert.ok(!errCons, errCons?.message);

    const enLaCaja = await vender(studio, online, codigo);
    assert.match(enLaCaja.error?.message ?? '', /CODIGO_YA_USADO_POR_SOCIA/, 'lo usó en su app: en la Caja ya no');

    assert.ok(!(await vender(studio, mostrador, codigo)).error);
    const vistos = await codigosYaUsadosPorSocia(admin, mostrador);
    assert.ok(vistos.has(codigo), 'lo que usó en la Caja lo ve la lectura de los cobros online');
  });
});

test('si el pago no sale, el código vuelve a estar libre para ella', async () => {
  await conEstudio(async (studio) => {
    const socio = await crearSocia(admin, studio.studioId);
    const codigo = await crearCodigo(studio.studioId);

    const ventaId = idUnico('vpos');
    const pendiente = await vender(studio, socio, codigo, {
      p_venta_id: ventaId, p_metodo_pago: 'DATAFONO', p_efectivo_recibido: null, p_estado_inicial: 'PENDIENTE_PAGO',
    });
    assert.ok(!pendiente.error, pendiente.error?.message);
    const { data: fallada, error: errFallo } = await admin.rpc('fallar_pago_venta_pos', {
      p_venta_id: ventaId, p_studio_id: studio.studioId, p_pago_estado: 'RECHAZADO', p_motivo: 'prueba',
    });
    assert.ok(!errFallo, errFallo?.message);
    assert.equal(fallada, true);
    assert.equal(await cuantas('codigos_descuento_consumos', { codigo_id: codigo, socio_id: socio }), 0);
    assert.ok(!(await vender(studio, socio, codigo)).error, 'con el pago fallido, puede usarlo en el siguiente intento');
  });
});

test('los cobros online siguen distinguiendo un reintento del webhook de un doble uso de verdad', async () => {
  // `consumirCodigoDescuentoSiAplica` lo decide por el NOMBRE del índice del 23505: un reintento del mismo
  // recibo tiene que chocar por el recibo (silencio), y solo el mismo código en OTRO recibo de la misma
  // alumna por (codigo_id, socio_id) (aviso). Postgres mira los índices por orden de creación: la
  // migración rehace el de la alumna después del de `recibo_id` para que esto siga así.
  await conEstudio(async (studio) => {
    const socio = await crearSocia(admin, studio.studioId);
    const codigo = await crearCodigo(studio.studioId);
    const recibo = async () => {
      const id = idUnico('rec');
      const { error } = await admin.from('recibos').insert({
        id, studio_id: studio.studioId, socio_id: socio, concepto: 'Bono online', importe: 9, estado: 'COBRADO', fecha_vencimiento: '2026-10-01',
      });
      assert.ok(!error, error?.message);
      return id;
    };
    const primero = await recibo();
    assert.ok(!(await admin.from('codigos_descuento_consumos').insert({ recibo_id: primero, codigo_id: codigo, socio_id: socio })).error);

    const reintento = await admin.from('codigos_descuento_consumos').insert({ recibo_id: primero, codigo_id: codigo, socio_id: socio });
    assert.equal(reintento.error?.code, '23505');
    assert.doesNotMatch(reintento.error?.message ?? '', /codigos_descuento_consumos_codigo_socio_unq/, 'un reintento no puede leerse como doble uso');

    const otro = await recibo();
    const dobleUso = await admin.from('codigos_descuento_consumos').insert({ recibo_id: otro, codigo_id: codigo, socio_id: socio });
    assert.match(dobleUso.error?.message ?? '', /codigos_descuento_consumos_codigo_socio_unq/);
  });
});

test('un consumo es de un recibo O de una venta de la Caja, nunca de los dos ni de ninguno', async () => {
  await conEstudio(async (studio) => {
    const socio = await crearSocia(admin, studio.studioId);
    const codigo = await crearCodigo(studio.studioId);
    const { error } = await admin.from('codigos_descuento_consumos').insert({ codigo_id: codigo, socio_id: socio });
    assert.match(error?.message ?? '', /codigos_descuento_consumos_un_origen/);
  });
});
