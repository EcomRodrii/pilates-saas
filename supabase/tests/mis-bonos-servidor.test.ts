// Lo que lee `/api/public/mis-bonos` (lib/student/mis-bonos-servidor.ts), contra una base de datos real:
//  · los movimientos de UN bono suyo, con su reserva descrita, y la paginación por cursor compuesto sin perder filas;
//  · un bono o una reserva de OTRA socia no se leen nunca (la ruta corre con service-role: el filtro es la cerradura);
//  · «esta semana» de una cuota con tope cuenta lo mismo que `calcular_excede_limite_semanal`.
//
// Se llama con `admin` (service_role) porque así la llama la ruta. Ver `supabase/tests/rls-invariantes.test.ts` para por
// qué este fichero vive en `supabase/tests/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearSocia, crearStudioConPropietaria, limpiarFixtures, type StudioFixture,
} from '../../lib/db/rls-test-helpers.ts';
import { leerMovimientosBono, leerSemanaCuota, suscripcionesSuyas } from '../../lib/student/mis-bonos-servidor.ts';

const admin = clienteAdminLocal();
let contador = 0;
const idUnico = (prefijo: string) => `${prefijo}-mb-${process.pid}-${Date.now()}-${contador++}`;
const hoy = () => new Date().toISOString().slice(0, 10);

async function conEstudio(prueba: (studio: StudioFixture) => Promise<void>) {
  const studio = await crearStudioConPropietaria(admin);
  try {
    await prueba(studio);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
}

async function montarPlan(studioId: string, tipo: 'BONO' | 'MENSUAL', sesiones: number | null, limiteSemanal: number | null = null) {
  const id = idUnico('plan');
  const { error } = await admin.from('planes_tarifa').insert({ id, studio_id: studioId, nombre: `Plan ${tipo}`, precio: 10, tipo, sesiones, limite_semanal: limiteSemanal });
  assert.ok(!error, `fixture de plan: ${error?.message}`);
  return id;
}

async function montarSuscripcion(studioId: string, socioId: string, planId: string, saldo: number | null) {
  const id = idUnico('sus');
  const { error } = await admin.from('suscripciones').insert({
    id, studio_id: studioId, socio_id: socioId, plan_id: planId, estado: 'ACTIVA', fecha_inicio: hoy(), sesiones_restantes: saldo,
  });
  assert.ok(!error, `fixture de suscripción: ${error?.message}`);
  return id;
}

async function montarSesion(studioId: string, inicio: Date) {
  const id = idUnico('ses');
  const { error } = await admin.from('sesiones').insert({
    id, studio_id: studioId, inicio: inicio.toISOString(), fin: new Date(inicio.getTime() + 50 * 60_000).toISOString(),
  });
  assert.ok(!error, `fixture de sesión: ${error?.message}`);
  return id;
}

function reservar(studioId: string, sesionId: string, socioId: string, reservaId: string, suscripcionId: string | null) {
  return admin.rpc('reservar_plaza', {
    p_studio_id: studioId, p_sesion_id: sesionId, p_socio_id: socioId, p_reserva_id: reservaId,
    p_permite_lista_espera: true, p_requiere_aprobacion: false, p_spot_id: null,
    p_saltar_gate_impago: true, p_exigir_entitlement: false, p_suscripcion_id: suscripcionId,
  });
}

test('los movimientos de su bono: la compra y el consumo con su clase, del más reciente al más antiguo', async () => {
  await conEstudio(async (studio) => {
    const socio = await crearSocia(admin, studio.studioId);
    const sus = await montarSuscripcion(studio.studioId, socio, await montarPlan(studio.studioId, 'BONO', 4), 4);
    const sesion = await montarSesion(studio.studioId, new Date(Date.now() + 3 * 86_400_000));
    const reserva = idUnico('res');
    const { error } = await reservar(studio.studioId, sesion, socio, reserva, sus);
    assert.ok(!error, `no pudo reservar: ${error?.message}`);

    const r = await leerMovimientosBono(admin, { studioId: studio.studioId, socioId: socio, bonoId: sus, limite: 10, antes: null });
    assert.deepEqual(r.movimientos.map((m) => [m.clase, m.delta]), [['consumo', -1], ['compra', 4]]);
    assert.equal(r.movimientos[0].estadoReserva, 'CONFIRMADA');
    assert.ok(r.movimientos[0].claseInfo, 'el consumo lleva su clase');
    assert.equal(r.hayMas, false);
    assert.equal(r.cuadra, true);
    assert.equal(r.historialCompleto, true);
    // Nada de quién lo hizo ni por qué.
    for (const m of r.movimientos) {
      for (const prohibida of ['actor_id', 'actor_tipo', 'motivo', 'contexto', 'socio_id']) assert.ok(!(prohibida in m), prohibida);
    }
  });
});

test('paginar con el cursor compuesto no pierde ni repite filas', async () => {
  await conEstudio(async (studio) => {
    const socio = await crearSocia(admin, studio.studioId);
    const sus = await montarSuscripcion(studio.studioId, socio, await montarPlan(studio.studioId, 'BONO', 4), 4);
    // Tres ajustes de saldo, cada uno su movimiento.
    for (const saldo of [3, 2, 5]) {
      const { error } = await admin.from('suscripciones').update({ sesiones_restantes: saldo }).eq('id', sus);
      assert.ok(!error, error?.message);
    }
    const vistos: string[] = [];
    let antes: { creadoEn: string; id: string } | null = null;
    for (let i = 0; i < 10; i++) {
      const r = await leerMovimientosBono(admin, { studioId: studio.studioId, socioId: socio, bonoId: sus, limite: 1, antes });
      vistos.push(...r.movimientos.map((m) => m.id));
      if (!r.hayMas) break;
      const ultimo = r.movimientos[r.movimientos.length - 1];
      antes = { creadoEn: ultimo.fecha, id: ultimo.id };
    }
    assert.equal(vistos.length, 4, 'compra + tres ajustes');
    assert.equal(new Set(vistos).size, 4, 'sin repetidos');
  });
});

test('el bono de OTRA socia no es suyo: ni se encuentra ni se leen sus movimientos', async () => {
  await conEstudio(async (studio) => {
    const ella = await crearSocia(admin, studio.studioId);
    const otra = await crearSocia(admin, studio.studioId);
    const susOtra = await montarSuscripcion(studio.studioId, otra, await montarPlan(studio.studioId, 'BONO', 4), 4);
    const suyas = await suscripcionesSuyas(admin, { studioId: studio.studioId, socioId: ella, ids: [susOtra] });
    assert.equal(suyas.size, 0);
    const r = await leerMovimientosBono(admin, { studioId: studio.studioId, socioId: ella, bonoId: susOtra, limite: 10, antes: null });
    assert.deepEqual(r.movimientos, []);
  });
});

test('esta semana de una cuota con tope cuenta su reserva confirmada, como el tope del servidor', async () => {
  await conEstudio(async (studio) => {
    const socio = await crearSocia(admin, studio.studioId);
    const plan = await montarPlan(studio.studioId, 'MENSUAL', null, 2);
    const sus = await montarSuscripcion(studio.studioId, socio, plan, null);
    // Una clase dentro de ESTA semana: dentro de una hora (salvo la última hora del domingo, en la que el test no corre).
    const sesion = await montarSesion(studio.studioId, new Date(Date.now() + 60 * 60_000));
    const { error } = await reservar(studio.studioId, sesion, socio, idUnico('res'), null);
    assert.ok(!error, `no pudo reservar: ${error?.message}`);

    const suyas = await suscripcionesSuyas(admin, { studioId: studio.studioId, socioId: socio, ids: [sus] });
    const semana = await leerSemanaCuota(admin, { studioId: studio.studioId, socioId: socio, suscripcion: suyas.get(sus)! });
    assert.ok(semana);
    assert.equal(semana.limite, 2);
    assert.equal(semana.cuentan, 1);
    assert.equal(semana.conRecuperacion, 0);
  });
});
