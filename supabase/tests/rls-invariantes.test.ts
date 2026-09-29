// CI-1 (auditoría 62ª pasada), Fase 0: los primeros invariantes de RLS
// probados contra una base de datos REAL — no mocks. Hasta ahora, 0 de los
// ~7.500 tests de este repo tocaban Postgres de verdad: cada regresión de RLS
// se cazaba a mano en cada auditoría (o no se cazaba, como DB-1). Este fichero
// solo cubre los dos invariantes de mayor valor y menor coste de fixture;
// ampliar aquí mismo según el plan de la auditoría.
//
// ⚠️ Vive en `supabase/tests/`, NO en `lib/`: `npm test` es
// `node --test "lib/**/*.test.ts"` (package.json) y corre siempre, también en
// el portátil de cualquiera sin `supabase start` activo. Si este fichero
// viviera dentro de `lib/`, ESE comando fallaría siempre que Supabase local no
// esté levantado — que es la inmensa mayoría de las veces. El job dedicado
// (`calidad-rls`, ci.yml) lo apunta por su ruta explícita.
//
// Solo corre con `supabase start` real. Si `SUPABASE_LOCAL_URL` no está
// puesta, cada test falla con un mensaje que dice por qué — nunca se salta en
// silencio, para que no se confunda con "verde".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearStudioConPropietaria, crearSocia, limpiarFixtures,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();

// ── DB-1: reservas ya no se pueden crear/borrar saltándose el motor ─────────
//
// `reservas_escritura_insert`/`_delete` dejaban a cualquier PROPIETARIO
// insertar o borrar filas de `reservas` directo con su JWT — sin aforo, sin
// bono, sin motor (20260928135442_db1_...). Este test es justo lo que habría
// cazado esa regresión ANTES de que se abriera el PR que la introdujo, y caza
// igual si algún día alguien las recrea "para arreglar otra cosa" sin darse
// cuenta de lo que reabre.

test('DB-1: una PROPIETARIA no puede INSERTAR una reserva directa, saltándose reservar_plaza', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const { error } = await studio.comoPropietaria
      .from('reservas')
      .insert({ id: `reserva-rls-${Date.now()}`, studio_id: studio.studioId });
    assert.ok(error, 'el INSERT directo en reservas debería fallar (RLS), pero no dio ningún error');
    assert.equal(
      error?.code, '42501',
      `se esperaba 42501 (insufficient_privilege / violación de RLS), se obtuvo: ${error?.code} — ${error?.message}`,
    );
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('DB-1: una PROPIETARIA no puede BORRAR una reserva existente directamente', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const reservaId = `reserva-rls-${Date.now()}`;
    // La fila la crea el ADMIN (salta RLS a propósito: es solo el fixture).
    const { error: errCrear } = await admin.from('reservas').insert({ id: reservaId, studio_id: studio.studioId });
    assert.ok(!errCrear, `no se pudo montar el fixture de reserva: ${errCrear?.message}`);

    const { error, count } = await studio.comoPropietaria
      .from('reservas')
      .delete({ count: 'exact' })
      .eq('id', reservaId);
    // Sin política de DELETE para `authenticated`, Postgres puede responder con
    // 42501 (RLS) o con 0 filas afectadas y sin error, según el motor —
    // cualquiera de los dos es correcto AQUÍ; lo que no vale es que la fila
    // desaparezca.
    if (!error) assert.equal(count, 0, 'el DELETE directo no dio error pero SÍ borró la fila — DB-1 ha vuelto a abrirse');

    const { data: sigueViva } = await admin.from('reservas').select('id').eq('id', reservaId).maybeSingle();
    assert.ok(sigueViva, 'la reserva desapareció tras el DELETE directo de la propietaria — DB-1 ha vuelto a abrirse');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

// ── Aislamiento cross-tenant: socios ─────────────────────────────────────────
//
// Una propietaria de OTRO estudio no puede leer ni escribir la ficha de una
// socia ajena, aunque conozca su id exacto — probado por ID directo, no solo
// por listado, porque una política que solo filtra el `SELECT` por
// `studio_id = current_studio_id()` puede no replicarse en el `UPDATE`.

test('aislamiento cross-tenant: la propietaria del studio A no VE una socia del studio B', async () => {
  const [studioA, studioB] = await Promise.all([crearStudioConPropietaria(admin), crearStudioConPropietaria(admin)]);
  try {
    const socioDeB = await crearSocia(admin, studioB.studioId);

    const { data, error } = await studioA.comoPropietaria.from('socios').select('id').eq('id', socioDeB).maybeSingle();
    assert.ok(!error, `la lectura no debería dar error (RLS filtra, no bloquea): ${error?.message}`);
    assert.equal(data, null, 'la propietaria del studio A pudo leer una socia del studio B por su id exacto');
  } finally {
    await limpiarFixtures(admin, [studioA, studioB]);
  }
});

test('aislamiento cross-tenant: la propietaria del studio A no puede EDITAR una socia del studio B', async () => {
  const [studioA, studioB] = await Promise.all([crearStudioConPropietaria(admin), crearStudioConPropietaria(admin)]);
  try {
    const socioDeB = await crearSocia(admin, studioB.studioId);

    await studioA.comoPropietaria.from('socios').update({ nombre: 'Secuestrada' }).eq('id', socioDeB);

    const { data: sigueIgual } = await admin.from('socios').select('nombre').eq('id', socioDeB).single();
    assert.equal(
      sigueIgual?.nombre, 'RLS',
      'la propietaria del studio A pudo cambiar el nombre de una socia del studio B — aislamiento cross-tenant roto',
    );
  } finally {
    await limpiarFixtures(admin, [studioA, studioB]);
  }
});

test('aislamiento cross-tenant: la propietaria del studio A no VE una sesión del studio B', async () => {
  const [studioA, studioB] = await Promise.all([crearStudioConPropietaria(admin), crearStudioConPropietaria(admin)]);
  try {
    const sesionId = `sesion-rls-${Date.now()}`;
    const ahora = new Date();
    const { error: errCrear } = await admin.from('sesiones').insert({
      id: sesionId, studio_id: studioB.studioId,
      inicio: ahora.toISOString(), fin: new Date(ahora.getTime() + 50 * 60_000).toISOString(),
    });
    assert.ok(!errCrear, `no se pudo montar el fixture de sesión: ${errCrear?.message}`);

    const { data } = await studioA.comoPropietaria.from('sesiones').select('id').eq('id', sesionId).maybeSingle();
    assert.equal(data, null, 'la propietaria del studio A pudo leer una sesión del studio B por su id exacto');
  } finally {
    await limpiarFixtures(admin, [studioA, studioB]);
  }
});
