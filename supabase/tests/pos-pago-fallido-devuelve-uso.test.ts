// Un pago de la Caja que no sale devuelve el uso del código de descuento (migr
// 20261016115731_caja_pago_fallido_devuelve_uso_codigo), contra una base de datos real:
//  · la venta apunta qué código usó, y `fallar_pago_venta_pos` le devuelve el uso UNA vez:
//    llamarla otra vez, o dos a la vez (webhook, conciliador y pantalla pueden llegar
//    juntos), no devuelve dos; y contra la confirmación del banco, gana uno solo;
//  · una venta PAGADA no devuelve nada, y el contador nunca baja de 0;
//  · con alumna, quedan libres los dos: el «una vez por alumna» y el tope global.
//
// Se llama con `admin` (service_role), como `/api/pos/venta`. Ver
// `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive aquí.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearSocia, crearStudioConPropietaria, limpiarFixtures, type StudioFixture,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
let contador = 0;
const idUnico = (prefijo: string) => `${prefijo}-pf-${process.pid}-${Date.now()}-${contador++}`;

async function conEstudio(prueba: (studio: StudioFixture) => Promise<void>) {
  const studio = await crearStudioConPropietaria(admin);
  try {
    await prueba(studio);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
}

/** Un código de un solo uso: si la tarjeta rechazada lo gastara, el reintento ya no podría usarlo. */
async function crearCodigo(studioId: string, usosMax: number | null = 1) {
  const id = idUnico('cod');
  const { error } = await admin.from('codigos_descuento').insert({
    id, studio_id: studioId, codigo: `PF${contador}`, tipo: 'PORCENTAJE', valor: 10, usos: 0, usos_max: usosMax, activo: true,
  });
  assert.ok(!error, `fixture de código: ${error?.message}`);
  return id;
}

async function vender(studio: StudioFixture, codigoId: string | null, opciones: { socioId?: string | null; pagada?: boolean } = {}) {
  const ventaId = idUnico('vpos');
  const pagada = opciones.pagada ?? false;
  const { error } = await admin.rpc('registrar_venta_pos', {
    p_venta_id: ventaId, p_studio_id: studio.studioId, p_socio_id: opciones.socioId ?? null,
    p_lineas: [{ tipo: 'LIBRE', nombre: 'Clase suelta', precio: 10, cantidad: 1 }],
    p_descuento_tipo: null, p_descuento_valor: null, p_codigo_descuento_id: codigoId,
    p_metodo_pago: pagada ? 'EFECTIVO' : 'DATAFONO', p_caja_id: null, p_vendido_por: studio.authUserId,
    p_vendido_por_nombre: 'Prueba', p_efectivo_recibido: pagada ? 20 : null, p_idempotencia_clave: null,
    p_estado_inicial: pagada ? 'PAGADA' : 'PENDIENTE_PAGO', p_notas: null,
  });
  return { ventaId, error };
}

function fallar(studio: StudioFixture, ventaId: string) {
  return admin.rpc('fallar_pago_venta_pos', {
    p_venta_id: ventaId, p_studio_id: studio.studioId, p_pago_estado: 'RECHAZADO', p_motivo: 'prueba',
  });
}

async function usos(codigoId: string) {
  const { data, error } = await admin.from('codigos_descuento').select('usos').eq('id', codigoId).single();
  assert.ok(!error, error?.message);
  return data?.usos ?? 0;
}

test('la venta apunta su código, y el pago fallido le devuelve el uso una sola vez', async () => {
  await conEstudio(async (studio) => {
    const codigo = await crearCodigo(studio.studioId);
    const { ventaId, error } = await vender(studio, codigo);
    assert.ok(!error, error?.message);
    const { data: venta } = await admin.from('ventas_pos').select('codigo_descuento_id').eq('id', ventaId).single();
    assert.equal(venta?.codigo_descuento_id, codigo, 'la venta sabe qué código gastó');
    assert.equal(await usos(codigo), 1, 'mientras espera al banco, el uso está cogido');

    const otra = await vender(studio, codigo);
    assert.match(otra.error?.message ?? '', /CODIGO_NO_CANJEABLE/, 'y con el tope agotado nadie más lo canjea');

    const primera = await fallar(studio, ventaId);
    assert.ok(!primera.error, primera.error?.message);
    assert.equal(primera.data, true);
    assert.equal(await usos(codigo), 0, 'la tarjeta rechazada no gasta el código');

    const segunda = await fallar(studio, ventaId);
    assert.ok(!segunda.error, segunda.error?.message);
    assert.equal(segunda.data, false, 'la segunda vez la venta ya estaba anulada');
    assert.equal(await usos(codigo), 0, 'el mismo fallo dos veces no devuelve dos usos');

    const reintento = await vender(studio, codigo, { pagada: true });
    assert.ok(!reintento.error, `el reintento puede usarlo: ${reintento.error?.message}`);
    assert.equal(await usos(codigo), 1);
  });
});

test('dos avisos del mismo fallo a la vez devuelven un solo uso', async () => {
  await conEstudio(async (studio) => {
    const codigo = await crearCodigo(studio.studioId, null);
    // Otro uso que sí se cobró: si el fallo devolviera dos, se llevaría también este.
    assert.ok(!(await vender(studio, codigo, { pagada: true })).error);
    const { ventaId, error } = await vender(studio, codigo);
    assert.ok(!error, error?.message);
    assert.equal(await usos(codigo), 2);

    const [a, b] = await Promise.all([fallar(studio, ventaId), fallar(studio, ventaId)]);
    assert.ok(!a.error && !b.error, a.error?.message ?? b.error?.message);
    assert.deepEqual([a.data, b.data].sort(), [false, true], 'solo uno de los dos anula la venta');
    assert.equal(await usos(codigo), 1, 'el uso de la venta cobrada sigue contado');
  });
});

test('si el banco confirma y el fallo llega a la vez, gana uno y el contador cuadra con él', async () => {
  await conEstudio(async (studio) => {
    const codigo = await crearCodigo(studio.studioId, null);
    const { ventaId, error } = await vender(studio, codigo);
    assert.ok(!error, error?.message);

    const [conf, fallo] = await Promise.all([
      admin.rpc('confirmar_pago_venta_pos', {
        p_venta_id: ventaId, p_studio_id: studio.studioId, p_payment_intent_id: 'pi_prueba',
        p_importe_confirmado: 9, p_metodo_pago: null,
      }),
      fallar(studio, ventaId),
    ]);
    assert.ok(!conf.error && !fallo.error, conf.error?.message ?? fallo.error?.message);
    const cobrada = (Array.isArray(conf.data) ? conf.data[0] : conf.data)?.r_aplicado === true;
    assert.notEqual(cobrada, fallo.data === true, 'gana exactamente uno de los dos');

    const { data: venta } = await admin.from('ventas_pos').select('estado').eq('id', ventaId).single();
    assert.equal(venta?.estado, cobrada ? 'PAGADA' : 'ANULADA');
    assert.equal(await usos(codigo), cobrada ? 1 : 0, 'cobrada, el uso cuenta; anulada, se devuelve');
  });
});

test('una venta PAGADA no devuelve el uso: se gastó de verdad', async () => {
  await conEstudio(async (studio) => {
    const codigo = await crearCodigo(studio.studioId);
    const { ventaId, error } = await vender(studio, codigo, { pagada: true });
    assert.ok(!error, error?.message);
    const r = await fallar(studio, ventaId);
    assert.ok(!r.error, r.error?.message);
    assert.equal(r.data, false);
    assert.equal(await usos(codigo), 1);
  });
});

test('con alumna, el pago fallido deja libres el «una vez por alumna» y el tope global', async () => {
  await conEstudio(async (studio) => {
    const socio = await crearSocia(admin, studio.studioId);
    const codigo = await crearCodigo(studio.studioId);
    const { ventaId, error } = await vender(studio, codigo, { socioId: socio });
    assert.ok(!error, error?.message);
    assert.equal((await fallar(studio, ventaId)).data, true);

    const { count } = await admin.from('codigos_descuento_consumos')
      .select('*', { count: 'exact', head: true }).eq('codigo_id', codigo).eq('socio_id', socio);
    assert.equal(count, 0);
    assert.equal(await usos(codigo), 0);
    const reintento = await vender(studio, codigo, { socioId: socio, pagada: true });
    assert.ok(!reintento.error, `ella puede usarlo en el reintento: ${reintento.error?.message}`);
  });
});

test('una venta sin código no toca ningún código, y el contador nunca baja de 0', async () => {
  await conEstudio(async (studio) => {
    const codigo = await crearCodigo(studio.studioId, null);
    assert.ok(!(await vender(studio, codigo, { pagada: true })).error);

    const sinCodigo = await vender(studio, null);
    assert.ok(!sinCodigo.error, sinCodigo.error?.message);
    assert.equal((await fallar(studio, sinCodigo.ventaId)).data, true);
    assert.equal(await usos(codigo), 1, 'una venta sin código no le quita usos a otro');

    // Alguien puso el contador a 0 a mano mientras el cobro esperaba: no se queda en -1.
    const conCodigo = await vender(studio, codigo);
    assert.ok(!conCodigo.error, conCodigo.error?.message);
    assert.ok(!(await admin.from('codigos_descuento').update({ usos: 0 }).eq('id', codigo)).error);
    assert.equal((await fallar(studio, conCodigo.ventaId)).data, true);
    assert.equal(await usos(codigo), 0);
  });
});
