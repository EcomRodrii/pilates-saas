// Motor de derechos, FASE 3a (migración 20261002134242): dos reglas de elegibilidad ya decididas.
//
//  · el no-show CUENTA COMO USO para el tope semanal (`calcular_excede_limite_semanal`);
//  · con varios bonos que cubren la clase manda la ESPECIFICIDAD, luego la caducidad, luego el id
//    (`elegir_bono_consumible`, gemela de `elegirBono` en lib/bono-logic.ts).
//
// Se llaman con `admin` (service_role) porque son funciones del servidor.
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive en `supabase/tests/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearSocia, crearStudioConPropietaria, limpiarFixtures, type StudioFixture,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
let contador = 0;
const idUnico = (prefijo: string) => `${prefijo}-reg-${process.pid}-${Date.now()}-${contador++}`;
const hoy = () => new Date().toISOString().slice(0, 10);

async function conEstudio(prueba: (studio: StudioFixture) => Promise<void>) {
  const studio = await crearStudioConPropietaria(admin);
  try {
    await prueba(studio);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
}

async function montarTipo(studioId: string) {
  const id = idUnico('tc');
  const { error } = await admin.from('tipos_clase').insert({ id, studio_id: studioId, nombre: `Tipo ${id}` });
  assert.ok(!error, `fixture de tipo de clase: ${error?.message}`);
  return id;
}

async function montarPlan(studioId: string, p: { tipo: 'BONO' | 'MENSUAL'; sesiones?: number | null; limiteSemanal?: number | null; tipos?: string[] }) {
  const id = idUnico('plan');
  const { error } = await admin.from('planes_tarifa').insert({
    id, studio_id: studioId, nombre: `Plan ${p.tipo}`, precio: 10, tipo: p.tipo,
    sesiones: p.sesiones ?? null, limite_semanal: p.limiteSemanal ?? null,
  });
  assert.ok(!error, `fixture de plan: ${error?.message}`);
  for (const t of p.tipos ?? []) {
    const { error: e } = await admin.from('plan_tipos_clase').insert({ plan_id: id, tipo_clase_id: t, studio_id: studioId });
    assert.ok(!e, `fixture de plan_tipos_clase: ${e?.message}`);
  }
  return id;
}

async function montarSuscripcion(studioId: string, socioId: string, planId: string, saldo: number | null, fechaFin: string | null = null) {
  const id = idUnico('sus');
  const { error } = await admin.from('suscripciones').insert({
    id, studio_id: studioId, socio_id: socioId, plan_id: planId, estado: 'ACTIVA', fecha_inicio: hoy(),
    sesiones_restantes: saldo, fecha_fin: fechaFin,
  });
  assert.ok(!error, `fixture de suscripción: ${error?.message}`);
  return id;
}

async function montarSesion(studioId: string, inicio: Date, tipoClaseId: string | null) {
  const id = idUnico('ses');
  const { error } = await admin.from('sesiones').insert({
    id, studio_id: studioId, tipo_clase_id: tipoClaseId, inicio: inicio.toISOString(),
    fin: new Date(inicio.getTime() + 50 * 60_000).toISOString(),
  });
  assert.ok(!error, `fixture de sesión: ${error?.message}`);
  return id;
}

async function montarReserva(studioId: string, sesionId: string, socioId: string, estado: string) {
  const id = idUnico('res');
  const { error } = await admin.from('reservas').insert({
    id, studio_id: studioId, sesion_id: sesionId, socio_id: socioId, estado, bono_consumo_rastreado: true,
  });
  assert.ok(!error, `fixture de reserva: ${error?.message}`);
  return id;
}

/** Un martes y un miércoles a mediodía UTC de una semana FUTURA: misma semana en Madrid, sea cual sea el día de hoy. */
function semanaFutura() {
  const base = new Date(Date.now() + 21 * 86_400_000);
  const diaSemana = base.getUTCDay(); // 0 = domingo
  const alMartes = (2 - diaSemana + 7) % 7;
  const martes = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + alMartes, 12, 0, 0));
  const miercoles = new Date(martes.getTime() + 86_400_000);
  return { martes, miercoles };
}

async function excede(studioId: string, socioId: string, tipoClaseId: string | null, inicio: Date) {
  const { data, error } = await admin.rpc('calcular_excede_limite_semanal', {
    p_studio_id: studioId, p_socio_id: socioId, p_tipo_clase_id: tipoClaseId, p_inicio: inicio.toISOString(),
  });
  assert.ok(!error, `calcular_excede_limite_semanal falló: ${error?.message}`);
  return (data as { excede_total: boolean; excede_tipo: boolean }[])[0];
}

// ── El no-show cuenta como uso ───────────────────────────────────────────────

test('tope semanal: una clase a la que reservó y NO vino cuenta como usada', async () => {
  await conEstudio(async studio => {
    const socio = await crearSocia(admin, studio.studioId);
    const tipo = await montarTipo(studio.studioId);
    await montarSuscripcion(studio.studioId, socio, await montarPlan(studio.studioId, { tipo: 'MENSUAL', limiteSemanal: 1 }), null);
    const { martes, miercoles } = semanaFutura();
    const sesionMartes = await montarSesion(studio.studioId, martes, tipo);
    const reserva = await montarReserva(studio.studioId, sesionMartes, socio, 'NO_ASISTIO');

    assert.equal((await excede(studio.studioId, socio, tipo, miercoles)).excede_total, true,
      'faltar sin avisar gasta la clase de la semana: no puede reservar otra de más');

    // Lo que NO cuenta sigue sin contar.
    for (const estado of ['CANCELADA', 'LISTA_ESPERA']) {
      await admin.from('reservas').update({ estado }).eq('id', reserva);
      assert.equal((await excede(studio.studioId, socio, tipo, miercoles)).excede_total, false, estado);
    }
    // Y lo que ya contaba, igual que antes.
    for (const estado of ['CONFIRMADA', 'ASISTIDA']) {
      await admin.from('reservas').update({ estado }).eq('id', reserva);
      assert.equal((await excede(studio.studioId, socio, tipo, miercoles)).excede_total, true, estado);
    }
  });
});

test('tope por actividad: el no-show de ESA actividad cuenta, el de otra no', async () => {
  await conEstudio(async studio => {
    const socio = await crearSocia(admin, studio.studioId);
    const reformer = await montarTipo(studio.studioId);
    const mat = await montarTipo(studio.studioId);
    const plan = await montarPlan(studio.studioId, { tipo: 'MENSUAL', tipos: [reformer, mat] });
    await admin.from('plan_tipos_clase').update({ limite_semanal: 1 }).eq('plan_id', plan).eq('tipo_clase_id', reformer);
    await montarSuscripcion(studio.studioId, socio, plan, null);
    const { martes, miercoles } = semanaFutura();

    // Un no-show de Mat no gasta el tope de Reformer…
    await montarReserva(studio.studioId, await montarSesion(studio.studioId, martes, mat), socio, 'NO_ASISTIO');
    assert.equal((await excede(studio.studioId, socio, reformer, miercoles)).excede_tipo, false);
    // …el de Reformer sí.
    await montarReserva(studio.studioId, await montarSesion(studio.studioId, martes, reformer), socio, 'NO_ASISTIO');
    assert.equal((await excede(studio.studioId, socio, reformer, miercoles)).excede_tipo, true);
  });
});

test('tope semanal: lo de OTRA semana no cuenta', async () => {
  await conEstudio(async studio => {
    const socio = await crearSocia(admin, studio.studioId);
    const tipo = await montarTipo(studio.studioId);
    await montarSuscripcion(studio.studioId, socio, await montarPlan(studio.studioId, { tipo: 'MENSUAL', limiteSemanal: 1 }), null);
    const { martes, miercoles } = semanaFutura();
    const semanaAnterior = new Date(martes.getTime() - 7 * 86_400_000);
    await montarReserva(studio.studioId, await montarSesion(studio.studioId, semanaAnterior, tipo), socio, 'NO_ASISTIO');
    assert.equal((await excede(studio.studioId, socio, tipo, miercoles)).excede_total, false);
  });
});

// ── Especificidad al elegir bono ─────────────────────────────────────────────

async function elegir(studioId: string, socioId: string, tipoClaseId: string | null) {
  const { data, error } = await admin.rpc('elegir_bono_consumible', {
    p_studio_id: studioId, p_socio_id: socioId, p_tipo_clase_id: tipoClaseId,
  });
  assert.ok(!error, `elegir_bono_consumible falló: ${error?.message}`);
  return data as string | null;
}

test('con varios bonos: el ACOTADO a ese tipo de clase se gasta antes que el general, aunque caduque después', async () => {
  await conEstudio(async studio => {
    const socio = await crearSocia(admin, studio.studioId);
    const reformer = await montarTipo(studio.studioId);
    const mat = await montarTipo(studio.studioId);
    const manana = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const enUnAnio = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
    const general = await montarSuscripcion(studio.studioId, socio, await montarPlan(studio.studioId, { tipo: 'BONO', sesiones: 10 }), 5, manana);
    const acotado = await montarSuscripcion(studio.studioId, socio, await montarPlan(studio.studioId, { tipo: 'BONO', sesiones: 10, tipos: [reformer] }), 5, enUnAnio);

    assert.equal(await elegir(studio.studioId, socio, reformer), acotado, 'el acotado va primero: el comodín se guarda');
    assert.equal(await elegir(studio.studioId, socio, mat), general, 'en una clase que el acotado no cubre, solo vale el general');
  });
});

test('con la misma especificidad manda la caducidad, y a igualdad el id', async () => {
  await conEstudio(async studio => {
    const socio = await crearSocia(admin, studio.studioId);
    const tipo = await montarTipo(studio.studioId);
    const pronto = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const tarde = new Date(Date.now() + 100 * 86_400_000).toISOString().slice(0, 10);
    const planA = await montarPlan(studio.studioId, { tipo: 'BONO', sesiones: 10, tipos: [tipo] });
    const planB = await montarPlan(studio.studioId, { tipo: 'BONO', sesiones: 10, tipos: [tipo] });
    await montarSuscripcion(studio.studioId, socio, planA, 5, tarde);
    const caducaAntes = await montarSuscripcion(studio.studioId, socio, planB, 5, pronto);
    assert.equal(await elegir(studio.studioId, socio, tipo), caducaAntes);
  });
});

test('la mensual que cubre la clase sigue ganando: ningún bono se elige', async () => {
  await conEstudio(async studio => {
    const socio = await crearSocia(admin, studio.studioId);
    const tipo = await montarTipo(studio.studioId);
    await montarSuscripcion(studio.studioId, socio, await montarPlan(studio.studioId, { tipo: 'MENSUAL' }), null);
    await montarSuscripcion(studio.studioId, socio, await montarPlan(studio.studioId, { tipo: 'BONO', sesiones: 10, tipos: [tipo] }), 5);
    assert.equal(await elegir(studio.studioId, socio, tipo), null);
  });
});

test('un bono agotado no se elige aunque sea el más específico', async () => {
  await conEstudio(async studio => {
    const socio = await crearSocia(admin, studio.studioId);
    const tipo = await montarTipo(studio.studioId);
    await montarSuscripcion(studio.studioId, socio, await montarPlan(studio.studioId, { tipo: 'BONO', sesiones: 10, tipos: [tipo] }), 0);
    const general = await montarSuscripcion(studio.studioId, socio, await montarPlan(studio.studioId, { tipo: 'BONO', sesiones: 10 }), 3);
    assert.equal(await elegir(studio.studioId, socio, tipo), general);
  });
});
