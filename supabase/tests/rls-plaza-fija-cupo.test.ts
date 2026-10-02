// Aprobación automática de plazas fijas sueltas: el tope de plazas por clase se cuenta DENTRO del candado de la base
// (`dar_plaza_fija_con_cupo`, migr 20261002230422). Contar fuera y escribir después deja pasar a dos peticiones a la vez por el
// último hueco: solo una carrera de verdad lo demuestra, igual que `reservar_plaza` (rls-reservar-plaza-concurrencia.test.ts).
//
// Se llama con `admin` (service_role) porque es como la llama la app: la RPC no la ve ni `anon` ni `authenticated`
// (rls-grants-funciones.test.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clienteAdminLocal, crearStudioConPropietaria, crearSocia, limpiarFixtures, type StudioFixture } from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();

interface Resultado { ok: boolean; codigo?: string; id?: string; ocupadas?: number; cupo?: number }

function dar(studioId: string, salaId: string, socioId: string, id: string, cupo: number | null) {
  return admin.rpc('dar_plaza_fija_con_cupo', {
    p_studio_id: studioId,
    p_fila: {
      id, socio_id: socioId, dia_semana: 2, hora_inicio: '10:00:00', sala_id: salaId, tipo_clase_id: null, spot_id: null,
      vigencia_desde: '2026-10-05', vigencia_hasta: null,
    },
    p_cupo: cupo,
  });
}

// Las plazas, las salas y las socias cuelgan del estudio sin borrado en cascada: se quitan antes que él.
async function limpiar(studio: StudioFixture): Promise<void> {
  await admin.from('plazas_fijas').delete().eq('studio_id', studio.studioId);
  await admin.from('salas').delete().eq('studio_id', studio.studioId);
  await admin.from('socios').delete().eq('studio_id', studio.studioId);
  await limpiarFixtures(admin, [studio]);
}

async function montarSala(studioId: string): Promise<string> {
  const salaId = `sala-cupo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const { error } = await admin.from('salas').insert({ id: salaId, studio_id: studioId, nombre: 'Sala cupo' });
  assert.ok(!error, `no se pudo montar la sala de fixture: ${error?.message}`);
  return salaId;
}

test('dos peticiones simultáneas por el ÚLTIMO hueco del cupo: solo una se da, nunca las dos', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const salaId = await montarSala(studio.studioId);
    const [a, b] = await Promise.all([crearSocia(admin, studio.studioId), crearSocia(admin, studio.studioId)]);
    // A LA VEZ, no en secuencia: es la carrera lo que ejercita el `pg_advisory_xact_lock`.
    const [ra, rb] = await Promise.all([
      dar(studio.studioId, salaId, a, `pf-cupo-a-${Date.now()}`, 1),
      dar(studio.studioId, salaId, b, `pf-cupo-b-${Date.now()}`, 1),
    ]);
    assert.ok(!ra.error, `A no debería fallar: ${ra.error?.message}`);
    assert.ok(!rb.error, `B no debería fallar: ${rb.error?.message}`);
    const resultados = [ra.data as Resultado, rb.data as Resultado];
    assert.equal(resultados.filter(r => r.ok).length, 1, `exactamente una se da: ${JSON.stringify(resultados)}`);
    const rechazada = resultados.find(r => !r.ok);
    assert.equal(rechazada?.codigo, 'SIN_CUPO');
    assert.equal(rechazada?.cupo, 1);

    // Contra la fila real, no solo lo que devolvió la RPC.
    const { data: filas } = await admin.from('plazas_fijas').select('id').eq('studio_id', studio.studioId).eq('estado', 'ACTIVA');
    assert.equal(filas?.length, 1, 'una sola plaza ACTIVA en la franja, nunca dos');
  } finally {
    await limpiar(studio);
  }
});

test('con sitio dentro del cupo se da y queda ACTIVA; al llegar al cupo, la siguiente no', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const salaId = await montarSala(studio.studioId);
    const socias = await Promise.all([1, 2, 3].map(() => crearSocia(admin, studio.studioId)));
    const r1 = await dar(studio.studioId, salaId, socias[0], `pf-cupo-1-${Date.now()}`, 2);
    const r2 = await dar(studio.studioId, salaId, socias[1], `pf-cupo-2-${Date.now()}`, 2);
    const r3 = await dar(studio.studioId, salaId, socias[2], `pf-cupo-3-${Date.now()}`, 2);
    assert.equal((r1.data as Resultado).ok, true);
    assert.equal((r2.data as Resultado).ok, true);
    assert.equal((r3.data as Resultado).ok, false);
    assert.equal((r3.data as Resultado).codigo, 'SIN_CUPO');
    assert.equal((r3.data as Resultado).ocupadas, 2);
  } finally {
    await limpiar(studio);
  }
});

test('cupo 0 (sin dato de aforo): no se da ninguna sola', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const salaId = await montarSala(studio.studioId);
    const socia = await crearSocia(admin, studio.studioId);
    const r = await dar(studio.studioId, salaId, socia, `pf-cupo-0-${Date.now()}`, 0);
    assert.equal((r.data as Resultado).ok, false);
    assert.equal((r.data as Resultado).codigo, 'SIN_CUPO');
    const { data: filas } = await admin.from('plazas_fijas').select('id').eq('studio_id', studio.studioId);
    assert.equal(filas?.length, 0);
  } finally {
    await limpiar(studio);
  }
});

test('una plaza de baja o con la fecha pasada no ocupa el hueco', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const salaId = await montarSala(studio.studioId);
    const [vieja, baja, nueva] = await Promise.all([1, 2, 3].map(() => crearSocia(admin, studio.studioId)));
    const base = { studio_id: studio.studioId, dia_semana: 2, hora_inicio: '10:00:00', sala_id: salaId, vigencia_desde: '2026-01-05' };
    const { error } = await admin.from('plazas_fijas').insert([
      { id: `pf-venc-${Date.now()}`, socio_id: vieja, estado: 'ACTIVA', vigencia_hasta: '2026-02-01', ...base },
      { id: `pf-baja-${Date.now()}`, socio_id: baja, estado: 'BAJA', vigencia_hasta: null, ...base },
    ]);
    assert.ok(!error, error?.message);
    const r = await dar(studio.studioId, salaId, nueva, `pf-cupo-n-${Date.now()}`, 1);
    assert.equal((r.data as Resultado).ok, true, 'ni la vencida ni la de baja cuentan');
  } finally {
    await limpiar(studio);
  }
});

test('⚠️ un cliente con la sesión de la propietaria NO puede llamarla: darse una plaza saltándose el cupo', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const salaId = await montarSala(studio.studioId);
    const socia = await crearSocia(admin, studio.studioId);
    const { error } = await studio.comoPropietaria.rpc('dar_plaza_fija_con_cupo', {
      p_studio_id: studio.studioId,
      p_fila: { id: `pf-x-${Date.now()}`, socio_id: socia, dia_semana: 2, hora_inicio: '10:00:00', sala_id: salaId, vigencia_desde: '2026-10-05' },
      p_cupo: 99,
    });
    assert.ok(error, 'authenticated no tiene EXECUTE');
  } finally {
    await limpiar(studio);
  }
});
