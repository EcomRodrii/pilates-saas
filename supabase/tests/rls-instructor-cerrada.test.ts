// CI-1, Fase 1: RLS de INSTRUCTOR cerrada (20260921221053_instructora_sin_datos_que_no_usa.sql).
//
// Desde que se retiró Tentare Core (14-sep-2026), la instructora trabaja en la
// app del estudio, no en el panel — y esta migración le cerró la lectura de
// datos de alumnas y del negocio que ya no usa: `suscripciones`,
// `recuperaciones`, `notificaciones`, entre otras. Ya se verificó A MANO una
// vez, suplantando a una instructora real en producción (memoria de sesión:
// "0 filas, y los demás roles igual que antes"). Este fichero automatiza esa
// misma comprobación contra una base de datos real, para que la próxima vez
// que alguien toque una de estas políticas —o añada una tabla nueva con el
// mismo patrón `studio_id = current_studio_id()` sin excluir INSTRUCTOR— lo
// note en el PR, no en la siguiente auditoría manual.
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive
// en `supabase/tests/` y no en `lib/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearStudioConPropietaria, crearInstructora, crearSocia,
  crearSesion, crearSuscripcion, crearNotificacion, limpiarFixtures, limpiarInstructora,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();

test('INSTRUCTOR no ve las suscripciones de las alumnas del estudio', async () => {
  const studio = await crearStudioConPropietaria(admin);
  let instructora;
  try {
    instructora = await crearInstructora(admin, studio.studioId);
    const socioId = await crearSocia(admin, studio.studioId);
    await crearSuscripcion(admin, studio.studioId, socioId);

    const { data, error } = await instructora.comoInstructora.from('suscripciones').select('id');
    assert.ok(!error, `la lectura no debería dar error (RLS filtra, no bloquea): ${error?.message}`);
    assert.deepEqual(data, [], 'la instructora vio filas de suscripciones — RLS de INSTRUCTOR reabierta');

    // Control: la propietaria del mismo estudio SÍ las ve — si esto también
    // diera 0, el test de arriba no probaría nada (podría ser un fixture roto).
    const { data: comoPropietaria } = await studio.comoPropietaria.from('suscripciones').select('id');
    assert.equal(comoPropietaria?.length, 1, 'la propietaria debería ver la suscripción que sí es suya');
  } finally {
    if (instructora) await limpiarInstructora(admin, instructora);
    await limpiarFixtures(admin, [studio]);
  }
});

test('INSTRUCTOR no ve las notificaciones del negocio', async () => {
  const studio = await crearStudioConPropietaria(admin);
  let instructora;
  try {
    instructora = await crearInstructora(admin, studio.studioId);
    await crearNotificacion(admin, studio.studioId);

    const { data } = await instructora.comoInstructora.from('notificaciones').select('id');
    assert.deepEqual(data, [], 'la instructora vio notificaciones del negocio — RLS de INSTRUCTOR reabierta');

    const { data: comoPropietaria } = await studio.comoPropietaria.from('notificaciones').select('id');
    assert.equal(comoPropietaria?.length, 1, 'la propietaria debería ver su propia notificación');
  } finally {
    if (instructora) await limpiarInstructora(admin, instructora);
    await limpiarFixtures(admin, [studio]);
  }
});

test('INSTRUCTOR no ve recuperaciones ajenas, aunque sean de su propio estudio', async () => {
  const studio = await crearStudioConPropietaria(admin);
  let instructora;
  try {
    instructora = await crearInstructora(admin, studio.studioId);
    const socioId = await crearSocia(admin, studio.studioId);
    const recuperacionId = `recuperacion-rls-${Date.now()}`;
    const { error: errCrear } = await admin.from('recuperaciones').insert({
      id: recuperacionId, studio_id: studio.studioId, socio_id: socioId,
      caduca_el: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    });
    assert.ok(!errCrear, `no se pudo montar el fixture de recuperación: ${errCrear?.message}`);

    const { data } = await instructora.comoInstructora.from('recuperaciones').select('id');
    assert.deepEqual(data, [], 'la instructora vio recuperaciones de alumnas — RLS de INSTRUCTOR reabierta');
  } finally {
    if (instructora) await limpiarInstructora(admin, instructora);
    await limpiarFixtures(admin, [studio]);
  }
});

// ── Lo que SÍ conserva (pérdida aceptada solo en lo de arriba) ──────────────
//
// El propio comentario de la migración lo dice: "Los bloqueos de agenda los
// sigue viendo, solo los suyos" — y sus propias sesiones son justo eso. Sin
// este test, "cerrar RLS de INSTRUCTOR" podría derivar con el tiempo en
// cerrarle también lo suyo por error de alcance.

test('INSTRUCTOR sigue viendo SU PROPIA sesión (agenda), eso no se le ha cerrado', async () => {
  const studio = await crearStudioConPropietaria(admin);
  let instructora;
  try {
    instructora = await crearInstructora(admin, studio.studioId);
    const sesionId = await crearSesion(admin, studio.studioId, { instructorId: instructora.instructorId });

    const { data } = await instructora.comoInstructora.from('sesiones').select('id').eq('id', sesionId);
    assert.equal(data?.length, 1, 'la instructora debería ver su propia clase en la agenda');
  } finally {
    if (instructora) await limpiarInstructora(admin, instructora);
    await limpiarFixtures(admin, [studio]);
  }
});
