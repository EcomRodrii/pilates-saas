// CI-1, Fase 1b: concurrencia real en `reservar_plaza` contra el último
// hueco de aforo. Esto no es un test de RLS (la RPC es `SECURITY DEFINER`,
// cerrada a `anon`/`authenticated` — solo `service_role` la llama, siempre
// vía `lib/db/supabase-data-admin.ts`), pero sí necesita la misma base de
// datos real: el bug que protege (dos `CONFIRMADA` sobre el mismo aforo) solo
// aparece bajo una carrera de verdad — `pg_advisory_xact_lock` dentro de la
// función solo funciona con dos conexiones simultáneas, no con dos llamadas
// secuenciales desde el mismo test. Ya se verificó a mano en auditorías
// previas (overbooking, lista de espera); esto lo deja corriendo en cada PR.
//
// Se llama con `admin` (service_role) porque es exactamente como la llama la
// app — la RPC no tiene ningún llamador `authenticated` (ver
// rls-grants-funciones.test.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clienteAdminLocal, crearStudioConPropietaria, crearSocia, limpiarFixtures } from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();

interface ResultadoReserva { estado: string; posicion_espera: number | null }

function reservar(studioId: string, sesionId: string, socioId: string, reservaId: string) {
  return admin.rpc('reservar_plaza', {
    p_studio_id: studioId, p_sesion_id: sesionId, p_socio_id: socioId, p_reserva_id: reservaId,
    p_permite_lista_espera: true, p_requiere_aprobacion: false, p_spot_id: null,
    p_saltar_gate_impago: true, p_exigir_entitlement: false, p_suscripcion_id: null,
  });
}

test('dos reservas simultáneas contra el ÚLTIMO hueco: solo una se confirma, nunca las dos', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const sesionId = `sesion-concurrencia-${Date.now()}`;
    const ahora = new Date();
    const { error: errSesion } = await admin.from('sesiones').insert({
      id: sesionId, studio_id: studio.studioId, aforo_maximo: 1,
      inicio: ahora.toISOString(), fin: new Date(ahora.getTime() + 50 * 60_000).toISOString(),
    });
    assert.ok(!errSesion, `no se pudo montar la sesión de fixture (aforo 1): ${errSesion?.message}`);

    const [socioA, socioB] = await Promise.all([crearSocia(admin, studio.studioId), crearSocia(admin, studio.studioId)]);
    const reservaA = `reserva-conc-a-${Date.now()}`;
    const reservaB = `reserva-conc-b-${Date.now()}`;

    // A LA VEZ, no en secuencia: es la carrera lo que ejercita el
    // `pg_advisory_xact_lock` — dos llamadas seguidas nunca la reproducirían.
    const [resA, resB] = await Promise.all([
      reservar(studio.studioId, sesionId, socioA, reservaA),
      reservar(studio.studioId, sesionId, socioB, reservaB),
    ]);

    assert.ok(!resA.error, `reserva A no debería fallar: ${resA.error?.message}`);
    assert.ok(!resB.error, `reserva B no debería fallar: ${resB.error?.message}`);

    const estadoA = (resA.data as ResultadoReserva[])?.[0]?.estado;
    const estadoB = (resB.data as ResultadoReserva[])?.[0]?.estado;
    const estados = [estadoA, estadoB].sort();
    assert.deepEqual(
      estados, ['CONFIRMADA', 'LISTA_ESPERA'],
      `se esperaba exactamente una CONFIRMADA y una LISTA_ESPERA, se obtuvo: [${estadoA}, ${estadoB}] — overbooking`,
    );

    // Verificación independiente contra la fila real, no solo lo que devolvió
    // la RPC: el propio contrato de este repo ("botones que dicen que sí sin
    // comprobar") es no fiarse de la respuesta cuando hay dinero/aforo en juego.
    const { data: confirmadas } = await admin
      .from('reservas').select('id', { count: 'exact' }).eq('sesion_id', sesionId).eq('estado', 'CONFIRMADA');
    assert.equal(confirmadas?.length, 1, 'debe haber exactamente una reserva CONFIRMADA para esta sesión, nunca dos');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});
