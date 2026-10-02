// Ledger de derechos (migración 20261002130000), FASE 1, EN SOMBRA: el saldo de un bono
// o de una recuperación se explica movimiento a movimiento, y la suma de movimientos es
// SIEMPRE el saldo, lo escriba quien lo escriba.
//
// Qué fija este fichero contra una base de datos real:
//  · el ledger suma exactamente el saldo (la vista `ledger_conciliacion` sale vacía) tras
//    cada camino que mueve saldo: compra, consumo, devolución por reserva, devolución ciega,
//    ajuste a mano de una persona del personal y recuperaciones;
//  · cada movimiento dice POR QUÉ (consumo ligado a su reserva, devolución ligada a la
//    suya, cuota frente a sin cobertura);
//  · es solo de inserción, y nadie del navegador lo escribe;
//  · un saldo negativo es imposible.
//
// Se llama con `admin` (service_role) porque es como la llama la app: las RPC del motor
// no tienen ningún llamador `authenticated` (ver rls-grants-funciones.test.ts).
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive en `supabase/tests/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearSocia, crearStudioConPropietaria, limpiarFixtures, type StudioFixture,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
let contador = 0;
const idUnico = (prefijo: string) => `${prefijo}-led-${process.pid}-${Date.now()}-${contador++}`;
const hoy = () => new Date().toISOString().slice(0, 10);

interface Movimiento {
  tipo: string; delta: number; saldo_despues: number | null; reserva_id: string | null;
  derecho_tipo: string; derecho_id: string | null; actor_tipo: string; contexto: Record<string, unknown>;
}

async function movimientos(derechoId: string): Promise<Movimiento[]> {
  const { data, error } = await admin.from('movimientos_derecho').select('*').eq('derecho_id', derechoId).order('creado_en', { ascending: true });
  assert.ok(!error, `no se pudo leer el ledger: ${error?.message}`);
  return (data ?? []) as Movimiento[];
}

async function movimientosDeReserva(reservaId: string): Promise<Movimiento[]> {
  const { data, error } = await admin.from('movimientos_derecho').select('*').eq('reserva_id', reservaId).order('creado_en', { ascending: true });
  assert.ok(!error, `no se pudo leer el ledger: ${error?.message}`);
  return (data ?? []) as Movimiento[];
}

/** La vista de conciliación del estudio: saldo frente a suma de movimientos. Tiene que estar VACÍA. */
async function descuadres(studioId: string) {
  const { data, error } = await admin.from('ledger_conciliacion').select('*').eq('studio_id', studioId);
  assert.ok(!error, `no se pudo leer la conciliación: ${error?.message}`);
  return data ?? [];
}

async function saldoDe(suscripcionId: string): Promise<number | null> {
  const { data } = await admin.from('suscripciones').select('sesiones_restantes').eq('id', suscripcionId).single();
  return (data as { sesiones_restantes: number | null }).sesiones_restantes;
}

async function montarPlan(studioId: string, tipo: 'BONO' | 'MENSUAL', sesiones: number | null) {
  const id = idUnico('plan');
  const { error } = await admin.from('planes_tarifa').insert({ id, studio_id: studioId, nombre: `Plan ${tipo}`, precio: 10, tipo, sesiones });
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

async function montarSesion(studioId: string, diasVista: number) {
  const id = idUnico('ses');
  const inicio = new Date(Date.now() + diasVista * 86_400_000);
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

async function conEstudio(prueba: (studio: StudioFixture) => Promise<void>) {
  const studio = await crearStudioConPropietaria(admin);
  try {
    await prueba(studio);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
}

test('un bono nuevo deja su saldo como COMPRA y el ledger concilia', async () => {
  await conEstudio(async studio => {
    const socio = await crearSocia(admin, studio.studioId);
    const sus = await montarSuscripcion(studio.studioId, socio, await montarPlan(studio.studioId, 'BONO', 4), 4);
    const movs = await movimientos(sus);
    assert.equal(movs.length, 1);
    assert.deepEqual([movs[0].tipo, movs[0].delta, movs[0].saldo_despues], ['COMPRA', 4, 4]);
    assert.deepEqual(await descuadres(studio.studioId), []);
  });
});

test('reservar con bono deja CONSUMO_BONO ligado a la reserva; devolver por reserva es idempotente', async () => {
  await conEstudio(async studio => {
    const socio = await crearSocia(admin, studio.studioId);
    const sus = await montarSuscripcion(studio.studioId, socio, await montarPlan(studio.studioId, 'BONO', 4), 4);
    const sesion = await montarSesion(studio.studioId, 3);
    const reserva = idUnico('res');

    const { error: errReserva } = await reservar(studio.studioId, sesion, socio, reserva, sus);
    assert.ok(!errReserva, `no pudo reservar: ${errReserva?.message}`);
    assert.equal(await saldoDe(sus), 3);
    const consumo = (await movimientosDeReserva(reserva)).filter(m => m.tipo === 'CONSUMO_BONO');
    assert.equal(consumo.length, 1, 'un consumo por reserva');
    assert.deepEqual([consumo[0].delta, consumo[0].saldo_despues, consumo[0].derecho_id], [-1, 3, sus]);

    // Cancela en plazo (la RPC solo marca la devolución debida) y devuelve POR RESERVA.
    const { error: errCancela } = await admin.rpc('cancelar_reserva_plaza', {
      p_studio_id: studio.studioId, p_reserva_id: reserva, p_socio_id: socio, p_omitir_penalizacion: true,
    });
    assert.ok(!errCancela, `no pudo cancelar: ${errCancela?.message}`);
    const primera = await admin.rpc('devolver_sesion_bono_por_reserva', { p_studio_id: studio.studioId, p_reserva_id: reserva });
    const segunda = await admin.rpc('devolver_sesion_bono_por_reserva', { p_studio_id: studio.studioId, p_reserva_id: reserva });
    assert.equal(primera.data, 4, 'la primera devolución sube el saldo');
    assert.equal(segunda.data, null, 'la segunda no hace nada');

    const devoluciones = (await movimientos(sus)).filter(m => m.tipo === 'DEVOLUCION_BONO');
    assert.equal(devoluciones.length, 1, 'una sola devolución en el ledger');
    assert.deepEqual([devoluciones[0].reserva_id, devoluciones[0].contexto.via], [reserva, 'por_reserva']);
    assert.equal(await saldoDe(sus), 4);
    assert.deepEqual(await descuadres(studio.studioId), []);
  });
});

test('la devolución ciega queda etiquetada para poder medir cuánto se sigue usando', async () => {
  await conEstudio(async studio => {
    const socio = await crearSocia(admin, studio.studioId);
    const sus = await montarSuscripcion(studio.studioId, socio, await montarPlan(studio.studioId, 'BONO', 4), 3);
    const { data, error } = await admin.rpc('devolver_sesion_bono', { p_suscripcion_id: sus, p_studio_id: studio.studioId });
    assert.ok(!error, error?.message);
    assert.equal(data, 4);
    const ciega = (await movimientos(sus)).filter(m => m.tipo === 'DEVOLUCION_BONO');
    assert.equal(ciega.length, 1);
    assert.deepEqual([ciega[0].contexto.via, ciega[0].reserva_id], ['ciega', null]);
    assert.deepEqual(await descuadres(studio.studioId), []);
  });
});

test('una reserva cubierta por cuota deja USO_CUOTA y una sin cobertura deja SIN_COBERTURA, ambas con delta 0', async () => {
  await conEstudio(async studio => {
    const conCuota = await crearSocia(admin, studio.studioId);
    const sinNada = await crearSocia(admin, studio.studioId);
    const cuota = await montarSuscripcion(studio.studioId, conCuota, await montarPlan(studio.studioId, 'MENSUAL', null), null);
    const sesion = await montarSesion(studio.studioId, 3);
    const resCuota = idUnico('res');
    const resNada = idUnico('res');

    assert.ok(!(await reservar(studio.studioId, sesion, conCuota, resCuota, null)).error);
    assert.ok(!(await reservar(studio.studioId, sesion, sinNada, resNada, null)).error);

    const [uso] = await movimientosDeReserva(resCuota);
    assert.deepEqual([uso.tipo, uso.delta, uso.derecho_tipo, uso.derecho_id], ['USO_CUOTA', 0, 'SUSCRIPCION', cuota]);
    const [nada] = await movimientosDeReserva(resNada);
    assert.deepEqual([nada.tipo, nada.delta, nada.derecho_tipo, nada.derecho_id], ['SIN_COBERTURA', 0, 'NINGUNO', null]);
    assert.deepEqual(await descuadres(studio.studioId), []);
  });
});

test('un cambio directo del saldo por el personal queda como AJUSTE_SIN_CONTEXTO y el ledger sigue conciliando', async () => {
  await conEstudio(async studio => {
    const socio = await crearSocia(admin, studio.studioId);
    const sus = await montarSuscripcion(studio.studioId, socio, await montarPlan(studio.studioId, 'BONO', 10), 4);

    const { error } = await studio.comoPropietaria.from('suscripciones').update({ sesiones_restantes: 7 }).eq('id', sus);
    assert.ok(!error, `la propietaria no pudo ajustar el saldo: ${error?.message}`);

    const ajuste = (await movimientos(sus)).filter(m => m.tipo === 'AJUSTE_SIN_CONTEXTO');
    assert.equal(ajuste.length, 1);
    assert.deepEqual([ajuste[0].delta, ajuste[0].saldo_despues, ajuste[0].actor_tipo], [3, 7, 'staff']);
    assert.deepEqual(await descuadres(studio.studioId), []);
  });
});

test('un saldo negativo es imposible, también para el personal', async () => {
  await conEstudio(async studio => {
    const socio = await crearSocia(admin, studio.studioId);
    const sus = await montarSuscripcion(studio.studioId, socio, await montarPlan(studio.studioId, 'BONO', 4), 4);
    const { error } = await studio.comoPropietaria.from('suscripciones').update({ sesiones_restantes: -1 }).eq('id', sus);
    assert.ok(error, 'el personal pudo dejar un saldo negativo');
    assert.equal(error.code, '23514', `bloqueó otra cosa: ${error.message}`);
    assert.equal(await saldoDe(sus), 4);
  });
});

test('recuperaciones: concesión, uso y restitución, con su reserva', async () => {
  await conEstudio(async studio => {
    const socio = await crearSocia(admin, studio.studioId);
    const rec = idUnico('rec');
    const origen = idUnico('res-origen');
    const usada = idUnico('res-uso');
    const caduca = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

    const { error: errAlta } = await admin.from('recuperaciones').insert({
      id: rec, studio_id: studio.studioId, socio_id: socio, origen_reserva_id: origen, motivo: 'test', caduca_el: caduca,
    });
    assert.ok(!errAlta, errAlta?.message);
    await admin.from('recuperaciones').update({ estado: 'USADA', usada_en_reserva_id: usada }).eq('id', rec);
    await admin.from('recuperaciones').update({ estado: 'DISPONIBLE', usada_en_reserva_id: null }).eq('id', rec);

    const movs = await movimientos(rec);
    assert.deepEqual(movs.map(m => [m.tipo, m.delta, m.reserva_id]), [
      ['CONCESION_RECUPERACION', 1, origen],
      ['USO_RECUPERACION', -1, usada],
      ['RESTITUCION_RECUPERACION', 1, usada],
    ]);
    assert.deepEqual(await descuadres(studio.studioId), []);
  });
});

test('el ledger es solo de inserción y lo lee únicamente el personal de su estudio', async () => {
  const a = await crearStudioConPropietaria(admin);
  const b = await crearStudioConPropietaria(admin);
  try {
    const socioA = await crearSocia(admin, a.studioId);
    const socioB = await crearSocia(admin, b.studioId);
    const susA = await montarSuscripcion(a.studioId, socioA, await montarPlan(a.studioId, 'BONO', 4), 4);
    await montarSuscripcion(b.studioId, socioB, await montarPlan(b.studioId, 'BONO', 4), 4);

    // Lee lo suyo y nada de otro estudio.
    const { data: lasSuyas, error: errLee } = await a.comoPropietaria.from('movimientos_derecho').select('studio_id');
    assert.ok(!errLee, errLee?.message);
    assert.ok((lasSuyas ?? []).length > 0, 'la propietaria no ve su propio ledger');
    assert.ok((lasSuyas ?? []).every(f => (f as { studio_id: string }).studio_id === a.studioId), 've movimientos de otro estudio');

    // No escribe: ni inserta, ni actualiza, ni borra.
    const { error: errInserta } = await a.comoPropietaria.from('movimientos_derecho').insert({
      studio_id: a.studioId, derecho_tipo: 'NINGUNO', tipo: 'AJUSTE_SIN_CONTEXTO', delta: 5,
    });
    assert.ok(errInserta, 'la propietaria pudo escribir en el ledger');
    const { error: errActualiza } = await a.comoPropietaria.from('movimientos_derecho').update({ delta: 0 }).eq('derecho_id', susA);
    assert.ok(errActualiza, 'la propietaria pudo actualizar el ledger');
    const { error: errBorra } = await a.comoPropietaria.from('movimientos_derecho').delete().eq('derecho_id', susA);
    assert.ok(errBorra, 'la propietaria pudo borrar del ledger');

    // Ni siquiera el servidor modifica un movimiento: se compensa con otro.
    const { error: errServidor } = await admin.from('movimientos_derecho').update({ delta: 0 }).eq('derecho_id', susA);
    assert.ok(errServidor, 'el servidor pudo modificar un movimiento');
    assert.match(errServidor.message, /solo de inserción/);
    assert.equal((await movimientos(susA)).length, 1, 'el movimiento cambió');

    // La conciliación es del servidor.
    const { error: errConciliacion } = await a.comoPropietaria.from('ledger_conciliacion').select('*');
    assert.ok(errConciliacion, 'la propietaria pudo leer la conciliación');
  } finally {
    await limpiarFixtures(admin, [a, b]);
  }
});
