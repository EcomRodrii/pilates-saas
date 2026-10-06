// `reservar_plaza` con `p_consumir_suscripcion_id` (migr 20261006120200, P06 · Fase A): la reserva de una clase
// PAGADA gasta exactamente la suscripción que entregó ese pago, no el bono que elegiría la regla general.
//
// El caso que fija: la socia tenía un bono que caduca ANTES y compra otro para esta clase. Con la regla general
// (`elegir_bono_consumible`: el que caduca antes) se gastaba el VIEJO y el que acababa de pagar quedaba intacto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clienteAdminLocal, crearSocia, crearStudioConPropietaria, limpiarFixtures, sqlLocal } from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
const sql = sqlLocal();
let n = 0;
const unico = (p: string) => `${p}-${process.pid}-${Date.now()}-${n++}`;
const hoy = () => new Date().toISOString().slice(0, 10);
const enDias = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

async function bono(studioId: string, socioId: string, saldo: number, fechaFin: string) {
  const plan = unico('plan');
  const { error: e1 } = await admin.from('planes_tarifa').insert({ id: plan, studio_id: studioId, nombre: 'Bono', precio: 10, tipo: 'BONO', sesiones: 10 });
  assert.ok(!e1, e1?.message);
  const sus = unico('sus');
  const { error: e2 } = await admin.from('suscripciones').insert({
    id: sus, studio_id: studioId, socio_id: socioId, plan_id: plan, estado: 'ACTIVA', fecha_inicio: hoy(), fecha_fin: fechaFin, sesiones_restantes: saldo,
  });
  assert.ok(!e2, e2?.message);
  return sus;
}

async function sesion(studioId: string) {
  const id = unico('ses');
  const inicio = new Date(Date.now() + 2 * 86_400_000);
  const { error } = await admin.from('sesiones').insert({
    id, studio_id: studioId, aforo_maximo: 5, inicio: inicio.toISOString(), fin: new Date(inicio.getTime() + 50 * 60_000).toISOString(),
  });
  assert.ok(!error, error?.message);
  return id;
}

const saldo = async (id: string) =>
  ((await admin.from('suscripciones').select('sesiones_restantes').eq('id', id).single()).data as { sesiones_restantes: number }).sesiones_restantes;

// Los mismos parámetros que `reservarPlazaTrasPagoPublico`, más el nuevo.
const tras = (studioId: string, sesionId: string, socioId: string, reservaId: string, elegido: string | null, entregado: string | null) =>
  admin.rpc('reservar_plaza', {
    p_studio_id: studioId, p_sesion_id: sesionId, p_socio_id: socioId, p_reserva_id: reservaId,
    p_permite_lista_espera: true, p_requiere_aprobacion: false, p_spot_id: null,
    p_saltar_gate_impago: true, p_exigir_entitlement: false, p_suscripcion_id: elegido,
    p_consumir_suscripcion_id: entregado,
  });

test('con lo entregado, se gasta ESO, aunque haya otro bono que caduque antes', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const socio = await crearSocia(admin, studio.studioId);
    const viejo = await bono(studio.studioId, socio, 3, enDias(5));
    const nuevo = await bono(studio.studioId, socio, 10, enDias(60));
    const ses = await sesion(studio.studioId);
    const r = await tras(studio.studioId, ses, socio, unico('res-web'), viejo, nuevo);
    assert.ok(!r.error, r.error?.message);
    assert.equal((r.data as { bono_suscripcion_id: string }[])[0].bono_suscripcion_id, nuevo);
    assert.equal(await saldo(nuevo), 9, 'se gasta lo que pagó');
    assert.equal(await saldo(viejo), 3, 'el viejo, intacto');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('sin lo entregado, la regla de siempre (el que caduca antes)', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const socio = await crearSocia(admin, studio.studioId);
    const viejo = await bono(studio.studioId, socio, 3, enDias(5));
    const nuevo = await bono(studio.studioId, socio, 10, enDias(60));
    const ses = await sesion(studio.studioId);
    const r = await tras(studio.studioId, ses, socio, unico('res-web'), viejo, null);
    assert.ok(!r.error, r.error?.message);
    assert.equal(await saldo(viejo), 2);
    assert.equal(await saldo(nuevo), 10);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('lo entregado de OTRA socia no se gasta (consumir_bono_interno lo rechaza) y la reserva no se cae', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const socio = await crearSocia(admin, studio.studioId);
    const otra = await crearSocia(admin, studio.studioId);
    const ajeno = await bono(studio.studioId, otra, 10, enDias(60));
    const ses = await sesion(studio.studioId);
    const r = await tras(studio.studioId, ses, socio, unico('res-web'), null, ajeno);
    assert.ok(!r.error, r.error?.message);
    assert.equal((r.data as { estado: string }[])[0].estado, 'CONFIRMADA');
    assert.equal(await saldo(ajeno), 10, 'el bono de otra socia no se toca');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('una sola reservar_plaza: la de 11 argumentos, solo para el servidor', async () => {
  const filas = await sql<{ firma: string }[]>`
    select p.oid::regprocedure::text as firma from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'reservar_plaza'`;
  assert.deepEqual(filas.map(f => f.firma), ['reservar_plaza(text,text,text,text,boolean,boolean,text,boolean,boolean,text,text)']);
});

test.after(async () => { await sql.end(); });
