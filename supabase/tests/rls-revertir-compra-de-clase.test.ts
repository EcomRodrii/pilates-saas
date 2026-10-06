// PR-14 (migr …_revertir_compra_de_clase, P06 · Fase A): devolver el dinero ENTERO de una clase
// COMPENSADA la saca de la cola y, si está intacto, del bono. Contra Postgres de verdad (job `calidad-rls`):
//   · compensada intacta → reserva de espera cancelada, bono a 0 y CANCELADA (REVERSION_VENTA en el
//     ledger), la revisión de la devolución cerrada como REVERTIDA y el pago REEMBOLSADA;
//   · bono ya usado → la suscripción NO se toca (revisión manual), la espera sí se cancela;
//   · la segunda llamada no hace nada; un pago que no está COMPENSADA, tampoco; otro estudio, nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clienteAdminLocal, crearSocia, crearStudioConPropietaria, limpiarFixtures } from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
let n = 0;
const unico = (p: string) => `${p}-${process.pid}-${Date.now()}-${n++}`;
const haceMin = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const hoy = () => new Date().toISOString().slice(0, 10);

interface Reversion {
  cambiado: boolean; estado_pago: string; reserva_cancelada: boolean; bono_revertido: boolean;
  motivo_sin_revertir: string | null; promovida_id: string | null; oferta_id: string | null;
}

/** Una clase llena con la que pagó en la cola (COMPENSADA EN_ESPERA) y lo que compró con `saldo` sesiones de 5. */
async function compensadaEnEspera(studioId: string, saldo: number) {
  const plan = unico('plan');
  const { error: e1 } = await admin.from('planes_tarifa').insert({ id: plan, studio_id: studioId, nombre: 'Bono 5', precio: 50, tipo: 'BONO', sesiones: 5 });
  assert.ok(!e1, e1?.message);
  const sesion = unico('ses');
  const inicio = new Date(Date.now() + 2 * 86_400_000);
  const { error: e2 } = await admin.from('sesiones').insert({
    id: sesion, studio_id: studioId, aforo_maximo: 1, inicio: inicio.toISOString(), fin: new Date(inicio.getTime() + 50 * 60_000).toISOString(),
  });
  assert.ok(!e2, e2?.message);
  const [ocupa, pagadora, detras] = [await crearSocia(admin, studioId), await crearSocia(admin, studioId), await crearSocia(admin, studioId)];
  const sus = unico('sus-web');
  const { error: e3 } = await admin.from('suscripciones').insert({
    id: sus, studio_id: studioId, socio_id: pagadora, plan_id: plan, estado: 'ACTIVA', fecha_inicio: hoy(), sesiones_restantes: saldo,
  });
  assert.ok(!e3, e3?.message);
  const ids = { ocupa: unico('res-a'), pagadora: unico('res-web'), detras: unico('res-d') };
  const { error: e4 } = await admin.from('reservas').insert([
    { id: ids.ocupa, studio_id: studioId, sesion_id: sesion, socio_id: ocupa, estado: 'CONFIRMADA', creado_en: haceMin(60) },
    { id: ids.detras, studio_id: studioId, sesion_id: sesion, socio_id: detras, estado: 'LISTA_ESPERA', posicion_espera: 1, creado_en: haceMin(10) },
    { id: ids.pagadora, studio_id: studioId, sesion_id: sesion, socio_id: pagadora, estado: 'LISTA_ESPERA', posicion_espera: 2, creado_en: haceMin(5) },
  ]);
  assert.ok(!e4, e4?.message);
  const pago = unico('pc');
  const { error: e5 } = await admin.from('pagos_clase').insert({
    id: pago, studio_id: studioId, pagador: `socio:${pagadora}`, socio_id: pagadora, sesion_id: sesion, plan_id: plan,
    importe_centimos: 5000, plaza_comprobada_en: haceMin(6), estado: 'PAGADO', pagado_en: haceMin(5),
  });
  assert.ok(!e5, e5?.message);
  const { error: e6 } = await admin.rpc('registrar_resultado_pago_clase', {
    p_id: pago, p_studio_id: studioId, p_estado: 'COMPENSADA', p_motivo: 'EN_ESPERA', p_reserva_id: ids.pagadora,
    p_suscripcion_id: sus, p_pagado_en: null, p_prioridad: true,
  });
  assert.ok(!e6, e6?.message);
  // Lo que dejó el reembolso: el recibo devuelto y su revisión pendiente.
  const recibo = unico('rec-web');
  const { error: e7 } = await admin.from('recibos').insert({
    id: recibo, studio_id: studioId, socio_id: pagadora, suscripcion_id: sus, concepto: 'Alta web — Bono 5', importe: 50,
    estado: 'DEVUELTO', fecha_vencimiento: hoy(),
  });
  assert.ok(!e7, e7?.message);
  const devolucion = unico('dev');
  const { error: e8 } = await admin.from('devoluciones').insert({
    id: devolucion, studio_id: studioId, recibo_id: recibo, socio_id: pagadora, suscripcion_id: sus, origen: 'REEMBOLSO_TOTAL',
    importe_cobrado: 50, importe_devuelto: 50, referencia: unico('ch'), estado: 'PENDIENTE_REVISION',
  });
  assert.ok(!e8, e8?.message);
  return { sesion, sus, ids, pago, devolucion };
}

async function revertir(studioId: string, pago: string): Promise<Reversion | undefined> {
  const { data, error } = await admin.rpc('revertir_compra_de_clase', { p_studio_id: studioId, p_pago_clase_id: pago });
  assert.ok(!error, error?.message);
  return (data as Reversion[] | null)?.[0];
}

test('compensada intacta: fuera de la cola, bono a 0 con REVERSION_VENTA, revisión REVERTIDA y pago REEMBOLSADA; la segunda vez, nada', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const f = await compensadaEnEspera(studio.studioId, 5);
    const r = await revertir(studio.studioId, f.pago);
    assert.deepEqual(
      [r?.cambiado, r?.estado_pago, r?.reserva_cancelada, r?.bono_revertido, r?.motivo_sin_revertir],
      [true, 'REEMBOLSADA', true, true, null],
    );

    const { data: sus } = await admin.from('suscripciones').select('sesiones_restantes, estado').eq('id', f.sus).single();
    assert.deepEqual([sus?.sesiones_restantes, sus?.estado], [0, 'CANCELADA']);
    const { data: movs } = await admin.from('movimientos_derecho').select('tipo, delta, saldo_despues')
      .eq('derecho_tipo', 'SUSCRIPCION').eq('derecho_id', f.sus).eq('tipo', 'REVERSION_VENTA');
    assert.deepEqual(movs, [{ tipo: 'REVERSION_VENTA', delta: -5, saldo_despues: 0 }], 'el ledger lo cuenta como reversión, no como ajuste sin contexto');
    const { data: dev } = await admin.from('devoluciones').select('estado, aplicado').eq('id', f.devolucion).single();
    assert.equal(dev?.estado, 'REVERTIDA');
    assert.equal((dev?.aplicado as { automatica?: boolean } | null)?.automatica, true);
    const { data: reservas } = await admin.from('reservas').select('id, estado, posicion_espera').eq('sesion_id', f.sesion);
    const por = Object.fromEntries((reservas ?? []).map(x => [x.id as string, `${x.estado}:${x.posicion_espera ?? '-'}`]));
    assert.deepEqual(por, { [f.ids.ocupa]: 'CONFIRMADA:-', [f.ids.pagadora]: 'CANCELADA:-', [f.ids.detras]: 'LISTA_ESPERA:1' });

    const otra = await revertir(studio.studioId, f.pago);
    assert.deepEqual([otra?.cambiado, otra?.estado_pago, otra?.bono_revertido], [false, 'REEMBOLSADA', false], 'idempotente');
    const { data: movs2 } = await admin.from('movimientos_derecho').select('id').eq('derecho_id', f.sus).eq('tipo', 'REVERSION_VENTA');
    assert.equal(movs2?.length, 1, 'ni un segundo movimiento');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('bono ya usado: la suscripción NO se toca (queda para revisar a mano), la espera sí se cancela', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const f = await compensadaEnEspera(studio.studioId, 4);
    const r = await revertir(studio.studioId, f.pago);
    assert.deepEqual(
      [r?.cambiado, r?.estado_pago, r?.reserva_cancelada, r?.bono_revertido, r?.motivo_sin_revertir],
      [true, 'REEMBOLSADA', true, false, 'BONO_USADO'],
    );
    const { data: sus } = await admin.from('suscripciones').select('sesiones_restantes, estado').eq('id', f.sus).single();
    assert.deepEqual([sus?.sesiones_restantes, sus?.estado], [4, 'ACTIVA']);
    const { data: dev } = await admin.from('devoluciones').select('estado').eq('id', f.devolucion).single();
    assert.equal(dev?.estado, 'PENDIENTE_REVISION', 'la propietaria decide con los números delante');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('si la propietaria ya decidió dejárselo («Descartar»), la reversión automática no lo pisa', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const f = await compensadaEnEspera(studio.studioId, 5);
    const { error } = await admin.from('devoluciones').update({ estado: 'DESCARTADA' }).eq('id', f.devolucion);
    assert.ok(!error, error?.message);
    const r = await revertir(studio.studioId, f.pago);
    assert.deepEqual([r?.bono_revertido, r?.motivo_sin_revertir], [false, 'DECIDIDO_A_MANO']);
    const { data: sus } = await admin.from('suscripciones').select('sesiones_restantes, estado').eq('id', f.sus).single();
    assert.deepEqual([sus?.sesiones_restantes, sus?.estado], [5, 'ACTIVA']);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('un pago que no está COMPENSADA no se toca, y desde otro estudio no se encuentra', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const sesion = unico('ses');
    const pago = unico('pc');
    const { error } = await admin.from('pagos_clase').insert({
      id: pago, studio_id: studio.studioId, pagador: 'socio:x', sesion_id: sesion, plan_id: 'plan-x',
      importe_centimos: 1500, plaza_comprobada_en: haceMin(1), estado: 'PAGADO', pagado_en: haceMin(1),
    });
    assert.ok(!error, error?.message);
    const r = await revertir(studio.studioId, pago);
    assert.deepEqual([r?.cambiado, r?.estado_pago], [false, 'PAGADO']);
    assert.equal(await revertir('otro-estudio', pago), undefined);
    const { data } = await admin.from('pagos_clase').select('estado').eq('id', pago).single();
    assert.equal(data?.estado, 'PAGADO');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});
