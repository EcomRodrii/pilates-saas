// `pagos_clase` (migr 20261006120000, P06 · Fase A del bloque de dinero): el pago de UNA clase.
// Contra Postgres de verdad (job `calidad-rls`):
//   · nadie del cliente la escribe; la leen PROPIETARIO y RECEPCION de su estudio, nadie más;
//   · un solo pago VIVO por (pagador, clase);
//   · `registrar_resultado_pago_clase` es un compare-and-set: solo las transiciones admitidas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearInstructora, crearSesion, crearSocia, crearStudioConPropietaria, limpiarFixtures,
  limpiarInstructora, type InstructoraFixture,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();

let n = 0;
async function crearPago(studioId: string, sesionId: string, o: Record<string, unknown> = {}): Promise<string> {
  const id = `pc-rls-${Date.now()}-${++n}`;
  const { error } = await admin.from('pagos_clase').insert({
    id, studio_id: studioId, pagador: `socio:${studioId}`, sesion_id: sesionId, plan_id: 'plan-x',
    importe_centimos: 1500, plaza_comprobada_en: new Date().toISOString(), ...o,
  });
  if (error) throw new Error(`no se pudo crear el pago de fixture: ${error.message}`);
  return id;
}

async function registrar(studioId: string, id: string, estado: string, o: { motivo?: string; reserva?: string; prioridad?: boolean } = {}) {
  const { data, error } = await admin.rpc('registrar_resultado_pago_clase', {
    p_id: id, p_studio_id: studioId, p_estado: estado, p_motivo: o.motivo ?? null, p_reserva_id: o.reserva ?? null,
    p_suscripcion_id: null, p_pagado_en: null, p_prioridad: o.prioridad ?? false,
  });
  return { fila: (data as { estado: string; motivo: string | null; posicion_espera: number | null; cambiado: boolean }[] | null)?.[0], error };
}

test('nadie del cliente escribe pagos_clase; la leen PROPIETARIO y RECEPCION de su estudio, ni MANAGER ni INSTRUCTOR ni otro estudio', async () => {
  const a = await crearStudioConPropietaria(admin);
  const b = await crearStudioConPropietaria(admin);
  const equipo: InstructoraFixture[] = [];
  try {
    const sesion = await crearSesion(admin, a.studioId);
    const id = await crearPago(a.studioId, sesion);

    const { error: errIns } = await a.comoPropietaria.from('pagos_clase').insert({
      id: 'pc-desde-el-navegador', studio_id: a.studioId, pagador: 'x', sesion_id: sesion, plan_id: 'p',
      importe_centimos: 1, plaza_comprobada_en: new Date().toISOString(),
    });
    assert.ok(errIns, 'la propietaria no puede crear un pago desde el navegador');
    const { data: upd } = await a.comoPropietaria.from('pagos_clase').update({ estado: 'RESERVADA' }).eq('id', id).select('id');
    assert.equal(upd?.length ?? 0, 0, 'ni darlo por reservado');
    const { data: del } = await a.comoPropietaria.from('pagos_clase').delete().eq('id', id).select('id');
    assert.equal(del?.length ?? 0, 0, 'ni borrarlo');

    const { data: suya } = await a.comoPropietaria.from('pagos_clase').select('id');
    assert.equal(suya?.length, 1, 'la propietaria lo lee (control)');
    const { data: ajena } = await b.comoPropietaria.from('pagos_clase').select('id');
    assert.deepEqual(ajena, [], 'otro estudio no lo ve');

    const recepcion = await crearInstructora(admin, a.studioId, 'RECEPCION'); equipo.push(recepcion);
    const manager = await crearInstructora(admin, a.studioId, 'MANAGER'); equipo.push(manager);
    const instructora = await crearInstructora(admin, a.studioId, 'INSTRUCTOR'); equipo.push(instructora);
    assert.equal((await recepcion.comoInstructora.from('pagos_clase').select('id')).data?.length, 1, 'recepción ve las finanzas');
    assert.deepEqual((await manager.comoInstructora.from('pagos_clase').select('id')).data, [], 'el manager no ve la caja (puede_ver_finanzas)');
    assert.deepEqual((await instructora.comoInstructora.from('pagos_clase').select('id')).data, [], 'la instructora no ve dinero');
  } finally {
    for (const e of equipo) await limpiarInstructora(admin, e);
    await limpiarFixtures(admin, [a, b]);
  }
});

test('un solo pago VIVO por pagador y clase; cancelado el anterior, cabe otro', async () => {
  const a = await crearStudioConPropietaria(admin);
  try {
    const sesion = await crearSesion(admin, a.studioId);
    const id = await crearPago(a.studioId, sesion);
    const { error } = await admin.from('pagos_clase').insert({
      id: `pc-rls-dup-${Date.now()}`, studio_id: a.studioId, pagador: `socio:${a.studioId}`, sesion_id: sesion,
      plan_id: 'plan-x', importe_centimos: 1500, plaza_comprobada_en: new Date().toISOString(),
    });
    assert.equal(error?.code, '23505', 'el segundo pago vivo de la misma persona y clase choca');
    assert.equal((await registrar(a.studioId, id, 'CANCELADO')).fila?.estado, 'CANCELADO');
    await crearPago(a.studioId, sesion);
  } finally {
    await limpiarFixtures(admin, [a]);
  }
});

test('registrar_resultado_pago_clase: compare-and-set con las transiciones admitidas', async () => {
  const a = await crearStudioConPropietaria(admin);
  try {
    const sesion = await crearSesion(admin, a.studioId);
    const id = await crearPago(a.studioId, sesion);

    // De otro estudio: nada.
    assert.equal((await registrar('otro-estudio', id, 'PAGADO')).fila, undefined);

    let r = await registrar(a.studioId, id, 'PAGADO');
    assert.deepEqual([r.fila?.estado, r.fila?.cambiado], ['PAGADO', true]);
    // Un intento de reserva fallido: sigue PAGADO y cuenta el intento.
    r = await registrar(a.studioId, id, 'PAGADO');
    assert.equal(r.fila?.cambiado, true);
    const { data: f1 } = await admin.from('pagos_clase').select('intentos_reserva, pagado_en').eq('id', id).single();
    assert.equal(f1?.intentos_reserva, 1);
    assert.ok(f1?.pagado_en, 'PAGADO deja la hora del pago');

    // COMPENSADA exige motivo.
    r = await registrar(a.studioId, id, 'COMPENSADA');
    assert.ok(r.error, 'sin motivo, error');
    r = await registrar(a.studioId, id, 'COMPENSADA', { motivo: 'SIN_PLAZA' });
    assert.deepEqual([r.fila?.estado, r.fila?.motivo], ['COMPENSADA', 'SIN_PLAZA']);

    // No se vuelve atrás: de COMPENSADA no se pasa a PAGADO ni a CANCELADO.
    for (const e of ['PAGADO', 'CANCELADO', 'ABIERTO']) {
      r = await registrar(a.studioId, id, e);
      assert.deepEqual([r.fila?.estado, r.fila?.cambiado], ['COMPENSADA', false], e);
    }
    // La promoción desde la espera la confirma.
    r = await registrar(a.studioId, id, 'RESERVADA', { reserva: 'res-web-x' });
    assert.deepEqual([r.fila?.estado, r.fila?.motivo, r.fila?.cambiado], ['RESERVADA', null, true]);
    // Y reservada ya no cambia.
    r = await registrar(a.studioId, id, 'COMPENSADA', { motivo: 'ERROR' });
    assert.equal(r.fila?.cambiado, false);
  } finally {
    await limpiarFixtures(admin, [a]);
  }
});

test('en espera con prioridad: se anota desde cuándo y devuelve la posición REAL en la cola', async () => {
  const a = await crearStudioConPropietaria(admin);
  try {
    const sesion = await crearSesion(admin, a.studioId);
    const socio = await crearSocia(admin, a.studioId);
    const reservaId = `res-web-rls-${Date.now()}`;
    const { error: errRes } = await admin.from('reservas').insert({
      id: reservaId, studio_id: a.studioId, sesion_id: sesion, socio_id: socio, estado: 'LISTA_ESPERA', posicion_espera: 1,
    });
    assert.ok(!errRes, errRes?.message);
    const id = await crearPago(a.studioId, sesion, { socio_id: socio, estado: 'PAGADO', pagado_en: new Date().toISOString() });
    const r = await registrar(a.studioId, id, 'COMPENSADA', { motivo: 'EN_ESPERA', reserva: reservaId, prioridad: true });
    assert.deepEqual([r.fila?.estado, r.fila?.motivo, r.fila?.posicion_espera], ['COMPENSADA', 'EN_ESPERA', 1]);
    const { data } = await admin.from('pagos_clase').select('prioridad_espera_desde').eq('id', id).single();
    assert.ok(data?.prioridad_espera_desde, 'la prioridad queda anotada');
  } finally {
    await limpiarFixtures(admin, [a]);
  }
});
