// Roadmap P1-1 / H5: el máximo diario de la reserva pública se revalida dentro
// de `evaluar_reserva`, bajo el mismo lock por socia que escribe la reserva.
// La lectura SQL incluye todos los estados no cancelados, descarta clases
// canceladas y agrupa por el día de Europe/Madrid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clienteAdminLocal, crearSocia, crearStudioConPropietaria, limpiarFixtures } from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
let secuencia = 0;
const id = (prefijo: string) => `${prefijo}-max-dia-${process.pid}-${Date.now()}-${secuencia++}`;

async function crearSesion(studioId: string, inicio: string, cancelada = false): Promise<string> {
  const sesionId = id('ses');
  const { error } = await admin.from('sesiones').insert({
    id: sesionId,
    studio_id: studioId,
    inicio,
    fin: new Date(new Date(inicio).getTime() + 50 * 60_000).toISOString(),
    aforo_maximo: 10,
    cancelada,
  });
  assert.ok(!error, `sesión de fixture: ${error?.message}`);
  return sesionId;
}

async function crearReserva(studioId: string, socioId: string, sesionId: string, estado: string) {
  const { error } = await admin.from('reservas').insert({
    id: id('res'), studio_id: studioId, socio_id: socioId, sesion_id: sesionId, estado,
  });
  assert.ok(!error, `reserva de fixture (${estado}): ${error?.message}`);
}

function reservarConMaxDiario(studioId: string, sesionId: string, socioId: string) {
  return admin.rpc('reservar_plaza_con_max_diario', {
    p_studio_id: studioId,
    p_sesion_id: sesionId,
    p_socio_id: socioId,
    p_reserva_id: id('res'),
    p_permite_lista_espera: true,
    p_requiere_aprobacion: false,
    p_spot_id: null,
    p_saltar_gate_impago: true,
    p_exigir_entitlement: false,
    p_suscripcion_id: null,
  });
}

test('evaluar_reserva: máximo por día cuenta lista de espera y no asistió, no canceladas ni clases canceladas; día Madrid', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const { error: errorStudio } = await admin.from('studios').update({ reserva_max_por_dia: 2 }).eq('id', studio.studioId);
    assert.ok(!errorStudio, `configurar el máximo: ${errorStudio?.message}`);
    const socioId = await crearSocia(admin, studio.studioId);

    // 23:30Z del 14 de enero ya es 00:30 del 15 en Madrid; prueba que el gate
    // cruza correctamente la frontera UTC y agrupa por el día de negocio.
    const claseEnLista = await crearSesion(studio.studioId, '2027-01-14T23:30:00.000Z');
    const noAsistio = await crearSesion(studio.studioId, '2027-01-15T10:00:00.000Z');
    const cancelada = await crearSesion(studio.studioId, '2027-01-15T12:00:00.000Z', true);
    const objetivo = await crearSesion(studio.studioId, '2027-01-15T17:00:00.000Z');
    await crearReserva(studio.studioId, socioId, claseEnLista, 'LISTA_ESPERA');
    await crearReserva(studio.studioId, socioId, noAsistio, 'NO_ASISTIO');
    await crearReserva(studio.studioId, socioId, cancelada, 'CONFIRMADA');
    await crearReserva(studio.studioId, socioId, objetivo, 'CANCELADA');

    const { data, error } = await admin.rpc('evaluar_reserva', {
      p_studio_id: studio.studioId,
      p_sesion_id: objetivo,
      p_socio_id: socioId,
      p_opciones: { exigir_entitlement: false, saltar_gate_impago: true, aplicar_max_por_dia: true },
    });
    assert.ok(!error, `evaluar_reserva: ${error?.message}`);
    assert.deepEqual(data, {
      puede: false,
      codigo: 'max-por-dia',
      detalle: 'MAX_POR_DIA',
      max_por_dia: { tiene: 2, maximo: 2 },
    });
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('dos reservas simultáneas de la misma alumna en el día: solo una supera el máximo 1', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const { error: errorStudio } = await admin.from('studios').update({ reserva_max_por_dia: 1 }).eq('id', studio.studioId);
    assert.ok(!errorStudio, `configurar el máximo: ${errorStudio?.message}`);
    const socioId = await crearSocia(admin, studio.studioId);
    const claseA = await crearSesion(studio.studioId, '2027-02-10T10:00:00.000Z');
    const claseB = await crearSesion(studio.studioId, '2027-02-10T17:00:00.000Z');

    const [a, b] = await Promise.all([
      reservarConMaxDiario(studio.studioId, claseA, socioId),
      reservarConMaxDiario(studio.studioId, claseB, socioId),
    ]);
    const resultados = [a, b];
    const correctas = resultados.filter(r => !r.error);
    const rechazadas = resultados.filter(r => r.error);
    assert.equal(correctas.length, 1, `debe crearse una reserva, se crearon ${correctas.length}`);
    assert.equal(rechazadas.length, 1, `debe rechazarse una reserva, se rechazaron ${rechazadas.length}`);
    assert.match(rechazadas[0].error!.message, /MAX_POR_DIA:1:1/);

    const { data: reservas, error } = await admin.from('reservas').select('id').eq('studio_id', studio.studioId).eq('socio_id', socioId).neq('estado', 'CANCELADA');
    assert.ok(!error, `leer reservas tras la carrera: ${error?.message}`);
    assert.equal(reservas?.length, 1, 'el conteo real en BD debe respetar el máximo diario');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});
