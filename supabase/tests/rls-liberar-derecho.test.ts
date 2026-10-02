// Motor de derechos, FASE 2 (migración 20261002140000): una sola salida de devolución para la
// cancelación de una clase (`liberar_derecho`) y un único pagador por reserva.
//
// Cada test fija, contra una base de datos real, uno de los defectos de saldo que dejó la auditoría:
//  · plaza fija: una reserva que no consumió bono no recupera nada, aunque la socia tenga un
//    bono con hueco (antes caía a una heurística que sumaba una sesión a cualquier bono);
//  · bono: una reserva pagada con bono devuelve exactamente UNA sesión al bono que la pagó,
//    una sola vez por muchas veces que se llame;
//  · recuperación + bono: una reserva pagada con una recuperación no consume además un bono;
//  · recuperación: cancelar la clase entera restituye la recuperación que la reserva había usado;
//  · la política del estudio (`cancelacion_clase_devuelve_bono`) solo frena el bono, no la recuperación;
//  · solo libera lo CANCELADO de una clase cancelada, y solo el servidor puede llamarla.
// En todos, el ledger sigue cuadrando con el saldo (`ledger_conciliacion` vacía).
//
// Se llama con `admin` (service_role) porque es como la llama la app.
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive en `supabase/tests/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearSocia, crearStudioConPropietaria, limpiarFixtures, type StudioFixture,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
let contador = 0;
const idUnico = (prefijo: string) => `${prefijo}-lib-${process.pid}-${Date.now()}-${contador++}`;
const hoy = () => new Date().toISOString().slice(0, 10);

interface Liberacion {
  resultado: string; bono?: string | null; saldo?: number | null; recuperacion_restituida?: boolean;
}

async function liberar(studioId: string, reservaId: string, motivo = 'estudio_cancela_clase') {
  return admin.rpc('liberar_derecho', { p_studio_id: studioId, p_reserva_id: reservaId, p_motivo: motivo });
}

async function liberarOk(studioId: string, reservaId: string, motivo = 'estudio_cancela_clase'): Promise<Liberacion> {
  const { data, error } = await liberar(studioId, reservaId, motivo);
  assert.ok(!error, `liberar_derecho falló: ${error?.message}`);
  return data as Liberacion;
}

async function saldoDe(suscripcionId: string): Promise<number | null> {
  const { data } = await admin.from('suscripciones').select('sesiones_restantes').eq('id', suscripcionId).single();
  return (data as { sesiones_restantes: number | null }).sesiones_restantes;
}

async function movimientosDeReserva(reservaId: string) {
  const { data, error } = await admin.from('movimientos_derecho').select('tipo, delta, derecho_id, derecho_tipo')
    .eq('reserva_id', reservaId).order('creado_en', { ascending: true });
  assert.ok(!error, error?.message);
  return (data ?? []) as { tipo: string; delta: number; derecho_id: string | null; derecho_tipo: string }[];
}

async function descuadres(studioId: string) {
  const { data, error } = await admin.from('ledger_conciliacion').select('*').eq('studio_id', studioId);
  assert.ok(!error, error?.message);
  return data ?? [];
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

async function montarSesion(studioId: string, diasVista: number, cancelada = false) {
  const id = idUnico('ses');
  const inicio = new Date(Date.now() + diasVista * 86_400_000);
  const { error } = await admin.from('sesiones').insert({
    id, studio_id: studioId, inicio: inicio.toISOString(), fin: new Date(inicio.getTime() + 50 * 60_000).toISOString(), cancelada,
  });
  assert.ok(!error, `fixture de sesión: ${error?.message}`);
  return id;
}

/** Cancela la clase y sus reservas como lo hacen los caminos de servidor: UPDATE directo, sin devolver nada. */
async function cancelarClase(sesionId: string) {
  const a = await admin.from('sesiones').update({ cancelada: true }).eq('id', sesionId);
  assert.ok(!a.error, a.error?.message);
  const b = await admin.from('reservas').update({ estado: 'CANCELADA' }).eq('sesion_id', sesionId);
  assert.ok(!b.error, b.error?.message);
}

/** Una reserva insertada tal cual (plaza fija, importada, pagada con recuperación…), sin pasar por reservar_plaza. */
async function insertarReserva(studioId: string, sesionId: string, socioId: string, id: string, rastreada: boolean) {
  const { error } = await admin.from('reservas').insert({
    id, studio_id: studioId, sesion_id: sesionId, socio_id: socioId, estado: 'CONFIRMADA', bono_consumo_rastreado: rastreada,
  });
  assert.ok(!error, `fixture de reserva: ${error?.message}`);
}

function reservar(studioId: string, sesionId: string, socioId: string, reservaId: string, suscripcionId: string | null) {
  return admin.rpc('reservar_plaza', {
    p_studio_id: studioId, p_sesion_id: sesionId, p_socio_id: socioId, p_reserva_id: reservaId,
    p_permite_lista_espera: true, p_requiere_aprobacion: false, p_spot_id: null,
    p_saltar_gate_impago: true, p_exigir_entitlement: false, p_suscripcion_id: suscripcionId,
  });
}

async function montarRecuperacion(studioId: string, socioId: string, usadaEn: string | null) {
  const id = idUnico('rec');
  const caduca = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const { error } = await admin.from('recuperaciones').insert({
    id, studio_id: studioId, socio_id: socioId, motivo: 'test', caduca_el: caduca,
    ...(usadaEn ? { estado: 'USADA', usada_en_reserva_id: usadaEn } : {}),
  });
  assert.ok(!error, `fixture de recuperación: ${error?.message}`);
  return id;
}

async function estadoRecuperacion(id: string) {
  const { data } = await admin.from('recuperaciones').select('estado, usada_en_reserva_id').eq('id', id).single();
  return data as { estado: string; usada_en_reserva_id: string | null };
}

async function conEstudio(prueba: (studio: StudioFixture) => Promise<void>) {
  const studio = await crearStudioConPropietaria(admin);
  try {
    await prueba(studio);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
}

// ── Defecto 2: la plaza fija no recupera nada ────────────────────────────────

test('plaza fija: al cancelar la clase NO se suma una sesión al bono con hueco de la socia', async () => {
  await conEstudio(async studio => {
    const socio = await crearSocia(admin, studio.studioId);
    const sus = await montarSuscripcion(studio.studioId, socio, await montarPlan(studio.studioId, 'BONO', 10), 4);
    const sesion = await montarSesion(studio.studioId, 3);
    const reserva = `res-pf-${idUnico('x')}`;
    await insertarReserva(studio.studioId, sesion, socio, reserva, false);
    await cancelarClase(sesion);

    const l = await liberarOk(studio.studioId, reserva);
    assert.equal(l.resultado, 'OK');
    assert.equal(l.bono, 'SIN_CONSUMO');
    assert.equal(await saldoDe(sus), 4, 'una plaza fija no consumió bono: no puede recuperar ninguno');
    assert.equal((await movimientosDeReserva(reserva)).length, 0);
    assert.deepEqual(await descuadres(studio.studioId), []);
  });
});

test('reserva pagada con bono: devuelve exactamente UNA sesión al bono que la pagó, por mucho que se repita', async () => {
  await conEstudio(async studio => {
    const socio = await crearSocia(admin, studio.studioId);
    const a = await montarSuscripcion(studio.studioId, socio, await montarPlan(studio.studioId, 'BONO', 10), 4);
    // Otro bono con hueco: la devolución no puede irse a «uno cualquiera».
    const b = await montarSuscripcion(studio.studioId, socio, await montarPlan(studio.studioId, 'BONO', 10), 4);
    const sesion = await montarSesion(studio.studioId, 3);
    const reserva = idUnico('res');
    const { error } = await reservar(studio.studioId, sesion, socio, reserva, a);
    assert.ok(!error, `no pudo reservar: ${error?.message}`);
    // La base de datos vuelve a elegir el bono bajo el candado: se lee cuál pagó de verdad.
    const { data: fila } = await admin.from('reservas').select('bono_suscripcion_id').eq('id', reserva).single();
    const pagador = (fila as { bono_suscripcion_id: string }).bono_suscripcion_id;
    const otro = pagador === a ? b : a;
    assert.ok([a, b].includes(pagador));
    assert.equal(await saldoDe(pagador), 3);
    assert.equal(await saldoDe(otro), 4);
    await cancelarClase(sesion);

    const primera = await liberarOk(studio.studioId, reserva);
    assert.deepEqual([primera.bono, primera.saldo], ['DEVUELTO', 4]);
    const segunda = await liberarOk(studio.studioId, reserva);
    const tercera = await liberarOk(studio.studioId, reserva);
    assert.equal(segunda.bono, 'YA_DEVUELTO');
    assert.equal(tercera.bono, 'YA_DEVUELTO');
    assert.equal(await saldoDe(pagador), 4, 'una sola sesión devuelta, al bono que la pagó');
    assert.equal(await saldoDe(otro), 4, 'el otro bono ni se toca');

    const movs = await movimientosDeReserva(reserva);
    assert.deepEqual(movs.map(m => [m.tipo, m.delta, m.derecho_id]), [['CONSUMO_BONO', -1, pagador], ['DEVOLUCION_BONO', 1, pagador]]);
    assert.deepEqual(await descuadres(studio.studioId), []);
  });
});

test('reserva pagada por la cuota (mensual): no consumió bono, no devuelve nada', async () => {
  await conEstudio(async studio => {
    const socio = await crearSocia(admin, studio.studioId);
    await montarSuscripcion(studio.studioId, socio, await montarPlan(studio.studioId, 'MENSUAL', null), null);
    const bono = await montarSuscripcion(studio.studioId, socio, await montarPlan(studio.studioId, 'BONO', 10), 4);
    const sesion = await montarSesion(studio.studioId, 3);
    const reserva = idUnico('res');
    const { error } = await reservar(studio.studioId, sesion, socio, reserva, null);
    assert.ok(!error, error?.message);
    await cancelarClase(sesion);

    const l = await liberarOk(studio.studioId, reserva);
    assert.equal(l.bono, 'SIN_CONSUMO');
    assert.equal(await saldoDe(bono), 4);
    assert.deepEqual(await descuadres(studio.studioId), []);
  });
});

test('reserva importada (no rastreada, no es plaza fija): no se adivina, se avisa con LEGADO_SIN_RASTRO', async () => {
  await conEstudio(async studio => {
    const socio = await crearSocia(admin, studio.studioId);
    const sus = await montarSuscripcion(studio.studioId, socio, await montarPlan(studio.studioId, 'BONO', 10), 4);
    const sesion = await montarSesion(studio.studioId, 3);
    const reserva = idUnico('res-imp');
    await insertarReserva(studio.studioId, sesion, socio, reserva, false);
    await cancelarClase(sesion);

    const l = await liberarOk(studio.studioId, reserva);
    assert.equal(l.bono, 'LEGADO_SIN_RASTRO');
    assert.equal(await saldoDe(sus), 4, 'la RPC no suma nada por su cuenta: eso lo decide el llamador');
  });
});

// ── Defecto 3: un único pagador ──────────────────────────────────────────────

test('pagador único: una reserva pagada con una recuperación no consume además un bono', async () => {
  await conEstudio(async studio => {
    const socio = await crearSocia(admin, studio.studioId);
    const sus = await montarSuscripcion(studio.studioId, socio, await montarPlan(studio.studioId, 'BONO', 10), 4);
    const sesion = await montarSesion(studio.studioId, 3);
    const reserva = idUnico('res');
    await insertarReserva(studio.studioId, sesion, socio, reserva, true);
    await montarRecuperacion(studio.studioId, socio, reserva);

    const { data, error } = await admin.rpc('consumir_bono_interno', {
      p_reserva_id: reserva, p_suscripcion_id: sus, p_studio_id: studio.studioId,
    });
    assert.ok(!error, error?.message);
    const fila = (data as { resultado: string }[])[0];
    assert.equal(fila.resultado, 'SIN_BONO');
    assert.equal(await saldoDe(sus), 4, 'el bono no se toca: ya pagó la recuperación');
    const { data: marcada } = await admin.from('reservas').select('bono_decidido_en, bono_suscripcion_id').eq('id', reserva).single();
    const m = marcada as { bono_decidido_en: string | null; bono_suscripcion_id: string | null };
    assert.ok(m.bono_decidido_en, 'la decisión queda marcada: nadie la volverá a tomar');
    assert.equal(m.bono_suscripcion_id, null);
    assert.equal((await movimientosDeReserva(reserva)).filter(x => x.tipo === 'CONSUMO_BONO').length, 0);
    assert.deepEqual(await descuadres(studio.studioId), []);
  });
});

test('pagador único: sin recuperación, la misma reserva sí consume su bono (control)', async () => {
  await conEstudio(async studio => {
    const socio = await crearSocia(admin, studio.studioId);
    const sus = await montarSuscripcion(studio.studioId, socio, await montarPlan(studio.studioId, 'BONO', 10), 4);
    const sesion = await montarSesion(studio.studioId, 3);
    const reserva = idUnico('res');
    await insertarReserva(studio.studioId, sesion, socio, reserva, true);

    const { data, error } = await admin.rpc('consumir_bono_interno', {
      p_reserva_id: reserva, p_suscripcion_id: sus, p_studio_id: studio.studioId,
    });
    assert.ok(!error, error?.message);
    assert.equal((data as { resultado: string }[])[0].resultado, 'CONSUMIDA');
    assert.equal(await saldoDe(sus), 3);
  });
});

// ── Defecto 4: la recuperación vuelve cuando cancela el estudio ──────────────

test('cancelar la clase restituye la recuperación que la reserva había usado, una sola vez', async () => {
  await conEstudio(async studio => {
    const socio = await crearSocia(admin, studio.studioId);
    const sesion = await montarSesion(studio.studioId, 3);
    const reserva = idUnico('res');
    await insertarReserva(studio.studioId, sesion, socio, reserva, true);
    const rec = await montarRecuperacion(studio.studioId, socio, reserva);
    await cancelarClase(sesion);

    const primera = await liberarOk(studio.studioId, reserva);
    assert.equal(primera.recuperacion_restituida, true);
    assert.deepEqual(await estadoRecuperacion(rec), { estado: 'DISPONIBLE', usada_en_reserva_id: null });
    const segunda = await liberarOk(studio.studioId, reserva);
    assert.equal(segunda.recuperacion_restituida, false, 'la segunda vez no hay nada que restituir');

    const movs = (await movimientosDeReserva(reserva)).filter(m => m.derecho_tipo === 'RECUPERACION').map(m => [m.tipo, m.delta]);
    assert.deepEqual(movs, [['USO_RECUPERACION', -1], ['RESTITUCION_RECUPERACION', 1]]);
    assert.deepEqual(await descuadres(studio.studioId), []);
  });
});

test('la política del estudio no devuelve el bono, pero la recuperación vuelve igual', async () => {
  await conEstudio(async studio => {
    const { error: errPolitica } = await admin.from('studios').update({ cancelacion_clase_devuelve_bono: false }).eq('id', studio.studioId);
    assert.ok(!errPolitica, errPolitica?.message);
    const socio = await crearSocia(admin, studio.studioId);
    const sus = await montarSuscripcion(studio.studioId, socio, await montarPlan(studio.studioId, 'BONO', 10), 4);
    const sesion = await montarSesion(studio.studioId, 3);
    const conBono = idUnico('res');
    const { error } = await reservar(studio.studioId, sesion, socio, conBono, sus);
    assert.ok(!error, error?.message);
    // Otra socia con una recuperación usada en la misma clase.
    const otra = await crearSocia(admin, studio.studioId);
    const conRecuperacion = idUnico('res');
    await insertarReserva(studio.studioId, sesion, otra, conRecuperacion, true);
    const rec = await montarRecuperacion(studio.studioId, otra, conRecuperacion);
    await cancelarClase(sesion);

    const a = await liberarOk(studio.studioId, conBono);
    assert.equal(a.bono, 'POLITICA_NO_DEVUELVE');
    assert.equal(await saldoDe(sus), 3, 'el estudio decidió no devolver el bono');
    const b = await liberarOk(studio.studioId, conRecuperacion);
    assert.equal(b.recuperacion_restituida, true);
    assert.equal((await estadoRecuperacion(rec)).estado, 'DISPONIBLE');
  });
});

// ── Límites: qué se puede liberar, y quién ───────────────────────────────────

test('solo libera una reserva CANCELADA de una clase cancelada; lo demás no toca nada', async () => {
  await conEstudio(async studio => {
    const socio = await crearSocia(admin, studio.studioId);
    const sus = await montarSuscripcion(studio.studioId, socio, await montarPlan(studio.studioId, 'BONO', 10), 4);
    const sesion = await montarSesion(studio.studioId, 3);
    const reserva = idUnico('res');
    const { error } = await reservar(studio.studioId, sesion, socio, reserva, sus);
    assert.ok(!error, error?.message);
    assert.equal(await saldoDe(sus), 3);

    // Reserva todavía activa.
    assert.equal((await liberarOk(studio.studioId, reserva)).resultado, 'RESERVA_ACTIVA');
    // Cancelada, pero la clase sigue en pie.
    await admin.from('reservas').update({ estado: 'CANCELADA' }).eq('id', reserva);
    assert.equal((await liberarOk(studio.studioId, reserva)).resultado, 'SESION_NO_CANCELADA');
    assert.equal((await liberarOk(studio.studioId, 'res-no-existe')).resultado, 'RESERVA_NO_ENCONTRADA');
    assert.equal(await saldoDe(sus), 3, 'nada de lo anterior mueve saldo');
    // Y ahora sí.
    await admin.from('sesiones').update({ cancelada: true }).eq('id', sesion);
    assert.equal((await liberarOk(studio.studioId, reserva)).bono, 'DEVUELTO');
    assert.equal(await saldoDe(sus), 4);
  });
});

test('un motivo desconocido se rechaza', async () => {
  await conEstudio(async studio => {
    const { error } = await liberar(studio.studioId, 'res-x', 'alumna_en_plazo');
    assert.ok(error, 'un motivo que la tabla de política no conoce no puede liberar nada');
    assert.match(error.message, /MOTIVO_LIBERACION_DESCONOCIDO/);
  });
});

test('no libera reservas de otro estudio', async () => {
  const a = await crearStudioConPropietaria(admin);
  const b = await crearStudioConPropietaria(admin);
  try {
    const socio = await crearSocia(admin, a.studioId);
    const sus = await montarSuscripcion(a.studioId, socio, await montarPlan(a.studioId, 'BONO', 10), 4);
    const sesion = await montarSesion(a.studioId, 3);
    const reserva = idUnico('res');
    const { error } = await reservar(a.studioId, sesion, socio, reserva, sus);
    assert.ok(!error, error?.message);
    await cancelarClase(sesion);

    const l = await liberarOk(b.studioId, reserva);
    assert.equal(l.resultado, 'RESERVA_NO_ENCONTRADA', 'el estudio B no ve la reserva del A');
    assert.equal(await saldoDe(sus), 3);
  } finally {
    await limpiarFixtures(admin, [a, b]);
  }
});

test('solo el servidor puede llamarla: ni la propietaria desde su sesión', async () => {
  await conEstudio(async studio => {
    const { error } = await studio.comoPropietaria.rpc('liberar_derecho', {
      p_studio_id: studio.studioId, p_reserva_id: 'res-x', p_motivo: 'estudio_cancela_clase',
    });
    assert.ok(error, 'la propietaria pudo llamar a liberar_derecho desde el navegador');
  });
});
