// Motor de derechos: cierre de integridad (migración 20261002144018).
//
// Contra una base de datos real:
//  · el ledger rechaza duplicados: UN registro de consumo y UNA devolución por reserva (los movimientos sin reserva no entran);
//  · `cancelar_reservas_de_sesion` cancela las reservas de una clase ya cancelada y las libera EN LA MISMA TRANSACCIÓN: bono
//    exacto, recuperación, nada para la plaza fija ni la lista de espera; repetirla no devuelve dos veces; y sin la clase
//    cancelada no toca nada;
//  · la devolución a ciegas (`devolver_sesion_bono`) ya no la puede llamar nadie desde el navegador.
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
const idUnico = (prefijo: string) => `${prefijo}-cie-${process.pid}-${Date.now()}-${contador++}`;
const hoy = () => new Date().toISOString().slice(0, 10);

async function conEstudio(prueba: (studio: StudioFixture) => Promise<void>) {
  const studio = await crearStudioConPropietaria(admin);
  try {
    await prueba(studio);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
}

async function saldoDe(id: string) {
  const { data } = await admin.from('suscripciones').select('sesiones_restantes').eq('id', id).single();
  return (data as { sesiones_restantes: number | null }).sesiones_restantes;
}

async function montarBono(studioId: string, socioId: string, saldo: number) {
  const plan = idUnico('plan');
  const { error: e1 } = await admin.from('planes_tarifa').insert({ id: plan, studio_id: studioId, nombre: 'Bono', precio: 10, tipo: 'BONO', sesiones: 10 });
  assert.ok(!e1, e1?.message);
  const sus = idUnico('sus');
  const { error: e2 } = await admin.from('suscripciones').insert({
    id: sus, studio_id: studioId, socio_id: socioId, plan_id: plan, estado: 'ACTIVA', fecha_inicio: hoy(), sesiones_restantes: saldo,
  });
  assert.ok(!e2, e2?.message);
  return sus;
}

async function montarSesion(studioId: string, dias: number) {
  const id = idUnico('ses');
  const inicio = new Date(Date.now() + dias * 86_400_000);
  const { error } = await admin.from('sesiones').insert({
    id, studio_id: studioId, inicio: inicio.toISOString(), fin: new Date(inicio.getTime() + 50 * 60_000).toISOString(),
  });
  assert.ok(!error, error?.message);
  return id;
}

async function insertarReserva(studioId: string, sesionId: string, socioId: string, id: string, estado: string, rastreada: boolean) {
  const { error } = await admin.from('reservas').insert({
    id, studio_id: studioId, sesion_id: sesionId, socio_id: socioId, estado, bono_consumo_rastreado: rastreada,
  });
  assert.ok(!error, `reserva: ${error?.message}`);
}

async function estadoDe(id: string) {
  const { data } = await admin.from('reservas').select('estado').eq('id', id).single();
  return (data as { estado: string }).estado;
}

async function descuadres(studioId: string) {
  const { data, error } = await admin.from('ledger_conciliacion').select('*').eq('studio_id', studioId);
  assert.ok(!error, error?.message);
  return data ?? [];
}

interface Fila { reserva_id: string; socio_id: string | null; estado_previo: string; bono: string | null; recuperacion_restituida: boolean }

async function cancelar(studioId: string, sesionId: string, motivo = 'minimo_asistentes') {
  return admin.rpc('cancelar_reservas_de_sesion', { p_studio_id: studioId, p_sesion_id: sesionId, p_motivo: motivo });
}

// ── El ledger rechaza duplicados ─────────────────────────────────────────────

test('ledger: un solo registro de pago y una sola devolución por reserva; sin reserva no hay límite', async () => {
  await conEstudio(async studio => {
    const base = { studio_id: studio.studioId, derecho_tipo: 'NINGUNO', delta: 0 };
    const reserva = idUnico('res');
    const uno = await admin.from('movimientos_derecho').insert({ ...base, tipo: 'SIN_COBERTURA', reserva_id: reserva });
    assert.ok(!uno.error, uno.error?.message);
    // Otro registro de pago para la MISMA reserva (aunque sea de otro tipo) no entra.
    const otro = await admin.from('movimientos_derecho').insert({ ...base, tipo: 'USO_CUOTA', reserva_id: reserva });
    assert.equal(otro.error?.code, '23505', 'dos registros de pago para la misma reserva');
    const mismo = await admin.from('movimientos_derecho').insert({ ...base, tipo: 'SIN_COBERTURA', reserva_id: reserva });
    assert.equal(mismo.error?.code, '23505');

    // Una devolución por reserva.
    const dev1 = await admin.from('movimientos_derecho').insert({ ...base, tipo: 'DEVOLUCION_BONO', reserva_id: reserva });
    assert.ok(!dev1.error, dev1.error?.message);
    const dev2 = await admin.from('movimientos_derecho').insert({ ...base, tipo: 'DEVOLUCION_BONO', reserva_id: reserva });
    assert.equal(dev2.error?.code, '23505', 'dos devoluciones para la misma reserva');

    // Reservas distintas, sí; y los movimientos sin reserva (compra, ajuste, devolución a ciegas) no tienen límite.
    const distinta = await admin.from('movimientos_derecho').insert({ ...base, tipo: 'SIN_COBERTURA', reserva_id: idUnico('res') });
    assert.ok(!distinta.error, distinta.error?.message);
    for (let i = 0; i < 2; i++) {
      const s1 = await admin.from('movimientos_derecho').insert({ ...base, tipo: 'DEVOLUCION_BONO' });
      const s2 = await admin.from('movimientos_derecho').insert({ ...base, tipo: 'AJUSTE_SIN_CONTEXTO' });
      assert.ok(!s1.error && !s2.error, 'sin reserva no debe haber límite');
    }
  });
});

// ── cancelar_reservas_de_sesion ──────────────────────────────────────────────

test('cancela las reservas de la clase y libera cada derecho a su dueño, en una sola llamada', async () => {
  await conEstudio(async studio => {
    const socia = await crearSocia(admin, studio.studioId);
    const otra = await crearSocia(admin, studio.studioId);
    const tercera = await crearSocia(admin, studio.studioId);
    const bono = await montarBono(studio.studioId, socia, 4);
    const sesion = await montarSesion(studio.studioId, 3);

    // Pagada con bono (consumida de verdad), plaza fija, pagada con recuperación, en lista de espera y pendiente de aprobar.
    const rBono = idUnico('res');
    await insertarReserva(studio.studioId, sesion, socia, rBono, 'CONFIRMADA', true);
    const consumo = await admin.rpc('consumir_bono_interno', { p_reserva_id: rBono, p_suscripcion_id: bono, p_studio_id: studio.studioId });
    assert.equal((consumo.data as { resultado: string }[])[0].resultado, 'CONSUMIDA');
    assert.equal(await saldoDe(bono), 3);

    const rPf = `res-pf-${idUnico('x')}`;
    await insertarReserva(studio.studioId, sesion, otra, rPf, 'CONFIRMADA', false);

    const rRec = idUnico('res');
    await insertarReserva(studio.studioId, sesion, tercera, rRec, 'CONFIRMADA', true);
    const rec = idUnico('rec');
    const { error: errRec } = await admin.from('recuperaciones').insert({
      id: rec, studio_id: studio.studioId, socio_id: tercera, motivo: 'test', caduca_el: new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10),
      estado: 'USADA', usada_en_reserva_id: rRec,
    });
    assert.ok(!errRec, errRec?.message);

    const quinta = await crearSocia(admin, studio.studioId);
    const sexta = await crearSocia(admin, studio.studioId);
    const rEspera = idUnico('res');
    await insertarReserva(studio.studioId, sesion, quinta, rEspera, 'LISTA_ESPERA', true);
    const rPendiente = idUnico('res');
    await insertarReserva(studio.studioId, sesion, sexta, rPendiente, 'PENDIENTE_APROBACION', true);

    // La clase se cancela (como hacen los llamadores, ANTES de avisar y de llamar a esto).
    await admin.from('sesiones').update({ cancelada: true }).eq('id', sesion);

    const { data, error } = await cancelar(studio.studioId, sesion);
    assert.ok(!error, error?.message);
    const filas = new Map((data as Fila[]).map(f => [f.reserva_id, f]));
    assert.equal(filas.size, 5, 'cinco reservas activas, cinco filas');

    assert.deepEqual([filas.get(rBono)?.estado_previo, filas.get(rBono)?.bono], ['CONFIRMADA', 'DEVUELTO']);
    assert.deepEqual([filas.get(rPf)?.estado_previo, filas.get(rPf)?.bono], ['CONFIRMADA', 'SIN_CONSUMO']);
    assert.deepEqual([filas.get(rRec)?.bono, filas.get(rRec)?.recuperacion_restituida], ['SIN_CONSUMO', true]);
    assert.deepEqual([filas.get(rEspera)?.estado_previo, filas.get(rEspera)?.bono], ['LISTA_ESPERA', null]);
    assert.deepEqual([filas.get(rPendiente)?.estado_previo, filas.get(rPendiente)?.bono], ['PENDIENTE_APROBACION', null]);

    // Todas canceladas; el bono recupera EXACTAMENTE una sesión; la recuperación vuelve; la plaza fija no inventa nada.
    for (const r of [rBono, rPf, rRec, rEspera, rPendiente]) assert.equal(await estadoDe(r), 'CANCELADA', r);
    assert.equal(await saldoDe(bono), 4);
    const { data: recFinal } = await admin.from('recuperaciones').select('estado').eq('id', rec).single();
    assert.equal((recFinal as { estado: string }).estado, 'DISPONIBLE');

    // Repetirla no hace nada más: no quedan reservas activas, y nada se devuelve dos veces.
    const segunda = await cancelar(studio.studioId, sesion);
    assert.ok(!segunda.error, segunda.error?.message);
    assert.deepEqual(segunda.data, []);
    assert.equal(await saldoDe(bono), 4);
    assert.deepEqual(await descuadres(studio.studioId), []);
  });
});

test('sin la clase cancelada, o con un motivo que no existe, no toca nada', async () => {
  await conEstudio(async studio => {
    const socia = await crearSocia(admin, studio.studioId);
    const bono = await montarBono(studio.studioId, socia, 4);
    const sesion = await montarSesion(studio.studioId, 3);
    const reserva = idUnico('res');
    await insertarReserva(studio.studioId, sesion, socia, reserva, 'CONFIRMADA', true);
    await admin.rpc('consumir_bono_interno', { p_reserva_id: reserva, p_suscripcion_id: bono, p_studio_id: studio.studioId });
    assert.equal(await saldoDe(bono), 3);

    const sinCancelar = await cancelar(studio.studioId, sesion);
    assert.match(sinCancelar.error?.message ?? '', /SESION_NO_CANCELADA/);
    const motivoRaro = await cancelar(studio.studioId, sesion, 'alumna_en_plazo');
    assert.match(motivoRaro.error?.message ?? '', /MOTIVO_LIBERACION_DESCONOCIDO/);
    const noExiste = await cancelar(studio.studioId, 'ses-que-no-existe');
    assert.match(noExiste.error?.message ?? '', /SESION_NO_ENCONTRADA/);

    assert.equal(await estadoDe(reserva), 'CONFIRMADA', 'nada se canceló');
    assert.equal(await saldoDe(bono), 3, 'nada se devolvió');
  });
});

test('no cancela ni libera reservas de otro estudio', async () => {
  const a = await crearStudioConPropietaria(admin);
  const b = await crearStudioConPropietaria(admin);
  try {
    const socia = await crearSocia(admin, a.studioId);
    const sesion = await montarSesion(a.studioId, 3);
    const reserva = idUnico('res');
    await insertarReserva(a.studioId, sesion, socia, reserva, 'CONFIRMADA', true);
    await admin.from('sesiones').update({ cancelada: true }).eq('id', sesion);

    const desdeB = await cancelar(b.studioId, sesion);
    assert.match(desdeB.error?.message ?? '', /SESION_NO_ENCONTRADA/, 'el estudio B no ve la clase del A');
    assert.equal(await estadoDe(reserva), 'CONFIRMADA');
  } finally {
    await limpiarFixtures(admin, [a, b]);
  }
});

// ── Permisos ─────────────────────────────────────────────────────────────────

test('ni la propietaria desde su sesión llama a cancelar_reservas_de_sesion ni a la devolución a ciegas', async () => {
  await conEstudio(async studio => {
    const socia = await crearSocia(admin, studio.studioId);
    const bono = await montarBono(studio.studioId, socia, 4);

    const cancelarDesdeElNavegador = await studio.comoPropietaria.rpc('cancelar_reservas_de_sesion', {
      p_studio_id: studio.studioId, p_sesion_id: 'x', p_motivo: 'minimo_asistentes',
    });
    assert.ok(cancelarDesdeElNavegador.error, 'la propietaria pudo cancelar reservas desde el navegador');

    const aCiegas = await studio.comoPropietaria.rpc('devolver_sesion_bono', { p_suscripcion_id: bono, p_studio_id: studio.studioId });
    assert.ok(aCiegas.error, 'la propietaria pudo sumar una sesión a ciegas desde el navegador');
    assert.equal(await saldoDe(bono), 4, 'el saldo no se ha movido');
  });
});
