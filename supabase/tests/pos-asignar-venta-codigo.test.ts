// Asignar a una alumna una venta de la Caja cobrada sin ficha apunta su uso del código de
// descuento (migr 20261016140551_caja_asignar_venta_apunta_codigo, decisión del fundador
// del 16-oct-2026), contra una base de datos real:
//  · si ella no lo había usado, se apunta su consumo con esa venta (el mismo UNIQUE que
//    `registrar_venta_pos` y los cobros online), sin línea en Actividad;
//  · si ya lo había usado (online o en la Caja), la venta se le asigna igual y queda como
//    se cobró, sin otro consumo, y deja UNA línea en Actividad (CODIGO_REPETIDO_AL_ASIGNAR,
//    origen TENTARE) con el uso anterior; una venta NUEVA con ese código se sigue rechazando;
//  · asignar dos veces no deja nada más, asignar contra registrar a la vez nunca deja dos
//    consumos, y un código borrado después de la venta no impide asignarla.
//
// Se llama con `admin` (service_role), como `/api/pos/venta` y `/api/pos/venta/asignar`.
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive aquí.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearSocia, crearStudioConPropietaria, limpiarFixtures, type StudioFixture,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
let contador = 0;
const idUnico = (prefijo: string) => `${prefijo}-av-${process.pid}-${Date.now()}-${contador++}`;
const TIPO = 'CODIGO_REPETIDO_AL_ASIGNAR';

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
    id, studio_id: studioId, codigo: `AV${contador}`, tipo: 'PORCENTAJE', valor: 10, usos: 0, activo: true,
  });
  assert.ok(!error, `fixture de código: ${error?.message}`);
  return id;
}

/** Una venta cobrada en efectivo; sin `socioId`, «por asignar». */
async function vender(studio: StudioFixture, codigoId: string | null, socioId: string | null = null) {
  const ventaId = idUnico('vpos');
  const { error } = await admin.rpc('registrar_venta_pos', {
    p_venta_id: ventaId, p_studio_id: studio.studioId, p_socio_id: socioId,
    p_lineas: [{ tipo: 'LIBRE', nombre: 'Clase suelta', precio: 10, cantidad: 1 }],
    p_descuento_tipo: null, p_descuento_valor: null, p_codigo_descuento_id: codigoId,
    p_metodo_pago: 'EFECTIVO', p_caja_id: null, p_vendido_por: studio.authUserId, p_vendido_por_nombre: 'Prueba',
    p_efectivo_recibido: 20, p_idempotencia_clave: null, p_estado_inicial: 'PAGADA', p_notas: null,
  });
  return { ventaId, error };
}

function asignar(studio: StudioFixture, ventaId: string, socioId: string) {
  return admin.rpc('asignar_venta_pos_a_socia', { p_studio_id: studio.studioId, p_venta_id: ventaId, p_socio_id: socioId });
}

async function consumos(codigoId: string, socioId: string) {
  const { data, error } = await admin.from('codigos_descuento_consumos')
    .select('venta_pos_id, recibo_id').eq('codigo_id', codigoId).eq('socio_id', socioId);
  assert.ok(!error, error?.message);
  return data ?? [];
}

async function lineas(studioId: string) {
  const { data, error } = await admin.from('actividad_reciente')
    .select('id, tipo, texto, socio_id, origen, enlace').eq('studio_id', studioId).eq('tipo', TIPO);
  assert.ok(!error, error?.message);
  return data ?? [];
}

async function venta(ventaId: string) {
  const { data } = await admin.from('ventas_pos').select('socio_id, total, descuento, estado').eq('id', ventaId).single();
  return data;
}

/** Un uso online del código, como lo deja un cobro online ya cobrado. */
async function usoOnline(studio: StudioFixture, codigoId: string, socioId: string) {
  const recibo = idUnico('rec');
  const { error: errRec } = await admin.from('recibos').insert({
    id: recibo, studio_id: studio.studioId, socio_id: socioId, concepto: 'Bono online', importe: 9, estado: 'COBRADO',
    fecha_vencimiento: '2026-10-01',
  });
  assert.ok(!errRec, errRec?.message);
  const { error } = await admin.from('codigos_descuento_consumos').insert({ recibo_id: recibo, codigo_id: codigoId, socio_id: socioId });
  assert.ok(!error, error?.message);
  return recibo;
}

test('si no lo había usado, asignar apunta su consumo con esa venta, sin línea en Actividad', async () => {
  await conEstudio(async (studio) => {
    const socio = await crearSocia(admin, studio.studioId);
    const codigo = await crearCodigo(studio.studioId);
    const { ventaId, error } = await vender(studio, codigo);
    assert.ok(!error, error?.message);
    assert.equal((await consumos(codigo, socio)).length, 0, 'sin alumna, la venta no apunta nada');

    const r = await asignar(studio, ventaId, socio);
    assert.ok(!r.error, r.error?.message);
    assert.deepEqual(await consumos(codigo, socio), [{ venta_pos_id: ventaId, recibo_id: null }]);
    assert.equal((await lineas(studio.studioId)).length, 0);

    const nueva = await vender(studio, codigo, socio);
    assert.match(nueva.error?.message ?? '', /CODIGO_YA_USADO_POR_SOCIA/, 'desde ahora cuenta como suyo');
  });
});

test('si ya lo había usado online, la venta se le asigna igual, intacta, y queda la incidencia en Actividad', async () => {
  await conEstudio(async (studio) => {
    const socio = await crearSocia(admin, studio.studioId);
    const codigo = await crearCodigo(studio.studioId);
    const recibo = await usoOnline(studio, codigo, socio);
    const { ventaId, error } = await vender(studio, codigo);
    assert.ok(!error, error?.message);
    const antes = await venta(ventaId);

    const r = await asignar(studio, ventaId, socio);
    assert.ok(!r.error, `no se bloquea nada: ${r.error?.message}`);
    const despues = await venta(ventaId);
    assert.equal(despues?.socio_id, socio);
    assert.equal(Number(despues?.total), Number(antes?.total), 'el importe no se toca');
    assert.equal(Number(despues?.descuento), Number(antes?.descuento));
    assert.equal(despues?.estado, 'PAGADA');
    assert.deepEqual(await consumos(codigo, socio), [{ venta_pos_id: null, recibo_id: recibo }], 'sigue el uso de antes, sin otro');

    const [linea, ...mas] = await lineas(studio.studioId);
    assert.equal(mas.length, 0);
    assert.equal(linea.socio_id, socio);
    assert.equal(linea.origen, 'TENTARE');
    assert.equal(linea.enlace, `/clientas/${socio}`);
    assert.match(linea.texto, /^Código AV\d+ repetido: /);
    assert.match(linea.texto, /ya lo había usado en un pago online el \d{2}\/\d{2}\/\d{4}\./);
    assert.match(linea.texto, /La venta #\d{6}, cobrada antes sin ficha, se le ha asignado igual: queda como se cobró, sin otro descuento\./);

    const nueva = await vender(studio, codigo, socio);
    assert.match(nueva.error?.message ?? '', /CODIGO_YA_USADO_POR_SOCIA/, 'una venta NUEVA se sigue rechazando');
  });
});

test('si lo había usado en otra venta de la Caja, la línea lo dice con su número', async () => {
  await conEstudio(async (studio) => {
    const socio = await crearSocia(admin, studio.studioId);
    const codigo = await crearCodigo(studio.studioId);
    const primera = await vender(studio, codigo, socio);
    assert.ok(!primera.error, primera.error?.message);
    const { ventaId } = await vender(studio, codigo);
    assert.ok(!(await asignar(studio, ventaId, socio)).error);

    const [linea] = await lineas(studio.studioId);
    assert.match(linea.texto, /ya lo había usado en la venta #\d{6} de la Caja el /);
    assert.deepEqual(await consumos(codigo, socio), [{ venta_pos_id: primera.ventaId, recibo_id: null }]);
  });
});

test('asignar dos veces la misma venta no deja nada más', async () => {
  await conEstudio(async (studio) => {
    const socio = await crearSocia(admin, studio.studioId);
    const codigo = await crearCodigo(studio.studioId);
    await usoOnline(studio, codigo, socio);
    const { ventaId } = await vender(studio, codigo);

    assert.ok(!(await asignar(studio, ventaId, socio)).error);
    const otra = await asignar(studio, ventaId, socio);
    assert.match(otra.error?.message ?? '', /VENTA_YA_ASIGNADA/);
    assert.equal((await lineas(studio.studioId)).length, 1, 'una sola línea por venta');
    assert.equal((await consumos(codigo, socio)).length, 1);
  });
});

test('si la dueña borró el código después de la venta, se asigna igual y no apunta nada', async () => {
  await conEstudio(async (studio) => {
    const socio = await crearSocia(admin, studio.studioId);
    const codigo = await crearCodigo(studio.studioId);
    const { ventaId, error } = await vender(studio, codigo);
    assert.ok(!error, error?.message);
    assert.ok(!(await admin.from('codigos_descuento').delete().eq('id', codigo)).error);

    const r = await asignar(studio, ventaId, socio);
    assert.ok(!r.error, `la venta cobrada no se queda sin poder asignarse: ${r.error?.message}`);
    assert.equal((await venta(ventaId))?.socio_id, socio);
    assert.equal((await consumos(codigo, socio)).length, 0);
    assert.equal((await lineas(studio.studioId)).length, 0);
  });
});

test('una venta sin código no apunta nada al asignarse', async () => {
  await conEstudio(async (studio) => {
    const socio = await crearSocia(admin, studio.studioId);
    const { ventaId } = await vender(studio, null);
    assert.ok(!(await asignar(studio, ventaId, socio)).error);
    const { count } = await admin.from('codigos_descuento_consumos').select('*', { count: 'exact', head: true }).eq('socio_id', socio);
    assert.equal(count, 0);
    assert.equal((await lineas(studio.studioId)).length, 0);
  });
});

test('asignar y registrar a la vez el mismo código para la misma alumna: nunca dos consumos', async () => {
  await conEstudio(async (studio) => {
    const socio = await crearSocia(admin, studio.studioId);
    const codigo = await crearCodigo(studio.studioId);
    const { ventaId } = await vender(studio, codigo);

    const [asignada, nueva] = await Promise.all([asignar(studio, ventaId, socio), vender(studio, codigo, socio)]);
    assert.ok(!asignada.error, `asignar nunca se bloquea: ${asignada.error?.message}`);
    const filas = await consumos(codigo, socio);
    assert.equal(filas.length, 1, 'el UNIQUE deja pasar a uno solo');
    const ganoLaAsignacion = filas[0].venta_pos_id === ventaId;
    if (ganoLaAsignacion) {
      assert.match(nueva.error?.message ?? '', /CODIGO_YA_USADO_POR_SOCIA/, 'la venta nueva, rechazada');
      assert.equal((await lineas(studio.studioId)).length, 0);
    } else {
      assert.ok(!nueva.error, nueva.error?.message);
      assert.equal(filas[0].venta_pos_id, nueva.ventaId);
      assert.equal((await lineas(studio.studioId)).length, 1, 'la asignación, con su incidencia');
    }
  });
});
