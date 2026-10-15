// El TPV cobra el total que ha enseñado, matrícula incluida (migr 20261015155427_pos_venta_total_esperado), contra una base
// de datos real:
//  · `p_solo_calcular` contesta el total de verdad, con la matrícula, y no deja NADA escrito: ni venta, ni cupo de promoción;
//  · `p_total_esperado` distinto del de verdad rechaza la venta con IMPORTE_NO_COINCIDE antes de que exista;
//  · con el total bueno, la venta se registra con su línea de matrícula; y sin mandarlo, como siempre.
//
// Se llama con `admin` (service_role) porque así la llaman `/api/pos/venta` y `/api/pos/venta/presupuesto`. Ver
// `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive en `supabase/tests/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearSocia, crearStudioConPropietaria, limpiarFixtures, type StudioFixture,
} from '../../lib/db/rls-test-helpers.ts';
import { leerPresupuesto, leerTotalNoCoincide } from '../../lib/pos/total-esperado.ts';

const admin = clienteAdminLocal();
let contador = 0;
const idUnico = (prefijo: string) => `${prefijo}-te-${process.pid}-${Date.now()}-${contador++}`;

async function conEstudio(prueba: (studio: StudioFixture) => Promise<void>) {
  const studio = await crearStudioConPropietaria(admin);
  try {
    await prueba(studio);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
}

async function montarPlanConMatricula(studioId: string, cuposGratis: number | null = null) {
  const id = idUnico('plan');
  const { error } = await admin.from('planes_tarifa').insert({
    id, studio_id: studioId, nombre: 'Bono 10', precio: 80, tipo: 'BONO', sesiones: 10,
    matricula: 15, matricula_gratis_cupos: cuposGratis,
  });
  assert.ok(!error, `fixture de plan: ${error?.message}`);
  return id;
}

function vender(studio: StudioFixture, socioId: string, planId: string, extra: Record<string, unknown> = {}) {
  return admin.rpc('registrar_venta_pos', {
    p_venta_id: idUnico('vpos'), p_studio_id: studio.studioId, p_socio_id: socioId,
    p_lineas: [{ tipo: 'PLAN', referenciaId: planId, cantidad: 1 }],
    p_descuento_tipo: null, p_descuento_valor: null, p_codigo_descuento_id: null,
    p_metodo_pago: 'TARJETA', p_caja_id: null, p_vendido_por: studio.authUserId, p_vendido_por_nombre: 'Prueba',
    p_efectivo_recibido: null, p_idempotencia_clave: null, p_estado_inicial: 'PAGADA', p_notas: null,
    ...extra,
  });
}

async function ventasDelEstudio(studioId: string) {
  const { count, error } = await admin.from('ventas_pos').select('id', { count: 'exact', head: true }).eq('studio_id', studioId);
  assert.ok(!error, error?.message);
  return count ?? 0;
}

test('la vista previa da el total con la matrícula y no deja nada escrito: ni venta, ni stock, ni uso del código', async () => {
  await conEstudio(async (studio) => {
    const socio = await crearSocia(admin, studio.studioId);
    const plan = await montarPlanConMatricula(studio.studioId);
    const producto = idUnico('prod');
    const codigo = idUnico('cod');
    const { error: errProd } = await admin.from('productos_pos').insert({
      id: producto, studio_id: studio.studioId, nombre: 'Calcetines', categoria: 'Ropa', precio: 10, activo: true, stock: 5,
    });
    assert.ok(!errProd, `fixture de producto: ${errProd?.message}`);
    const { error: errCod } = await admin.from('codigos_descuento').insert({
      id: codigo, studio_id: studio.studioId, codigo: `TE${contador}`, tipo: 'PORCENTAJE', valor: 10, usos: 0, activo: true,
    });
    assert.ok(!errCod, `fixture de código: ${errCod?.message}`);

    const { data, error } = await vender(studio, socio, plan, {
      p_lineas: [{ tipo: 'PLAN', referenciaId: plan, cantidad: 1 }, { tipo: 'PRODUCTO', referenciaId: producto, cantidad: 2 }],
      p_codigo_descuento_id: codigo,
      p_solo_calcular: true,
    });
    assert.equal(data, null, 'con p_solo_calcular la RPC no devuelve una venta');
    assert.ok(error, 'la vista previa contesta con su excepción');
    // 80 + 2 × 10 = 100; el 10 % del código solo sobre eso (90), y la matrícula entera encima.
    assert.deepEqual(leerPresupuesto(error.message), { total: 105, matricula: 15, matriculaPlanId: plan }, error.message);

    assert.equal(await ventasDelEstudio(studio.studioId), 0, 'la vista previa no puede dejar una venta');
    const { data: prod } = await admin.from('productos_pos').select('stock').eq('id', producto).single();
    assert.equal(prod?.stock, 5, 'la vista previa no descuenta stock');
    const { data: cod } = await admin.from('codigos_descuento').select('usos').eq('id', codigo).single();
    assert.equal(cod?.usos ?? 0, 0, 'la vista previa no gasta un uso del código');
  });
});

test('la vista previa no gasta el cupo de matrícula gratis', async () => {
  await conEstudio(async (studio) => {
    const socio = await crearSocia(admin, studio.studioId);
    const plan = await montarPlanConMatricula(studio.studioId, 1);

    const { error } = await vender(studio, socio, plan, { p_solo_calcular: true });
    assert.deepEqual(leerPresupuesto(error?.message ?? ''), { total: 80, matricula: 0, matriculaPlanId: null });

    const { data: fila } = await admin.from('planes_tarifa').select('matricula_gratis_usados').eq('id', plan).single();
    assert.equal(fila?.matricula_gratis_usados ?? 0, 0, 'el cupo de la promoción sigue entero');
  });
});

test('un total esperado sin la matrícula se rechaza antes de que la venta exista', async () => {
  await conEstudio(async (studio) => {
    const socio = await crearSocia(admin, studio.studioId);
    const plan = await montarPlanConMatricula(studio.studioId);

    const { data, error } = await vender(studio, socio, plan, { p_total_esperado: 80 });
    assert.equal(data, null);
    assert.ok(error, 'el total no es el que vio quien cobra: tiene que rechazarse');
    assert.deepEqual(leerTotalNoCoincide(error.message),
      { esperado: 80, total: 95, matricula: 15, matriculaPlanId: plan }, error.message);
    assert.equal(await ventasDelEstudio(studio.studioId), 0, 'ni PAGADA ni pendiente: no hay venta');
  });
});

test('con el total bueno, la venta se registra con su línea de matrícula', async () => {
  await conEstudio(async (studio) => {
    const socio = await crearSocia(admin, studio.studioId);
    const plan = await montarPlanConMatricula(studio.studioId);

    const { data, error } = await vender(studio, socio, plan, { p_total_esperado: 95 });
    assert.ok(!error, error?.message);
    const fila = (Array.isArray(data) ? data[0] : data) as { r_venta_id: string; r_total: number };
    assert.equal(Number(fila.r_total), 95);

    const { data: lineas } = await admin.from('ventas_pos_lineas').select('nombre, total').eq('venta_id', fila.r_venta_id).order('orden');
    assert.deepEqual((lineas ?? []).map((l) => [l.nombre, Number(l.total)]), [['Bono 10', 80], ['Matrícula — Bono 10', 15]]);
  });
});

test('sin total esperado, la venta va como siempre (una pestaña abierta antes del despliegue)', async () => {
  await conEstudio(async (studio) => {
    const socio = await crearSocia(admin, studio.studioId);
    const plan = await montarPlanConMatricula(studio.studioId);

    const { data, error } = await vender(studio, socio, plan);
    assert.ok(!error, error?.message);
    const fila = (Array.isArray(data) ? data[0] : data) as { r_total: number };
    assert.equal(Number(fila.r_total), 95);
  });
});
