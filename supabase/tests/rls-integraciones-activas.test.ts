// `integraciones_activas()` (migr 20261007144207): qué conexiones están
// encendidas, para todo el equipo del panel. `integraciones` solo la lee la
// propietaria (migr 20260930110315), y el panel sacaba de ahí qué plataformas
// venden plazas: a gerencia y recepción les escondía «Añadir → ClassPass» y el
// check-in de recepción no abría la puerta con Kisi. Los e2e no lo veían
// porque entran como propietaria y simulan la tabla; esto entra de verdad como
// cada papel.
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive en
// `supabase/tests/` y no en `lib/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  clienteAdminLocal, crearInstructora, crearStudioConPropietaria, limpiarFixtures, limpiarInstructora,
  type InstructoraFixture,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();

async function activasDe(cliente: SupabaseClient): Promise<string[]> {
  const { data, error } = await cliente.rpc('integraciones_activas');
  assert.ok(!error, error?.message);
  return data as string[];
}

test('cada papel del panel ve los TIPOS encendidos de su estudio; la instructora y otro estudio, nada más', async () => {
  const a = await crearStudioConPropietaria(admin);
  const b = await crearStudioConPropietaria(admin);
  const equipo: InstructoraFixture[] = [];
  try {
    const { error } = await admin.from('integraciones').insert([
      { id: `intg-cp-${a.studioId}`, studio_id: a.studioId, tipo: 'CLASSPASS', activo: true },
      { id: `intg-kisi-${a.studioId}`, studio_id: a.studioId, tipo: 'KISI', activo: false },
      { id: `intg-wh-${b.studioId}`, studio_id: b.studioId, tipo: 'WELLHUB', activo: true },
    ]);
    assert.ok(!error, `no se pudo montar el fixture: ${error?.message}`);
    const recepcion = await crearInstructora(admin, a.studioId, 'RECEPCION'); equipo.push(recepcion);
    const manager = await crearInstructora(admin, a.studioId, 'MANAGER'); equipo.push(manager);
    const instructora = await crearInstructora(admin, a.studioId, 'INSTRUCTOR'); equipo.push(instructora);

    // Lo que motivó la función: para recepción, la tabla viene vacía (y así sigue).
    const { data: filas, error: errFilas } = await recepcion.comoInstructora
      .from('integraciones').select('tipo').eq('studio_id', a.studioId);
    assert.ok(!errFilas, errFilas?.message);
    assert.deepEqual(filas, [], 'recepción lee integraciones: se le abrirían la salud y la config cifrada');

    assert.deepEqual(await activasDe(recepcion.comoInstructora), ['CLASSPASS']);
    assert.deepEqual(await activasDe(manager.comoInstructora), ['CLASSPASS']);
    assert.deepEqual(await activasDe(a.comoPropietaria), ['CLASSPASS'], 'solo las encendidas');
    assert.deepEqual(await activasDe(instructora.comoInstructora), [], 'la instructora no trabaja en el panel');
    assert.deepEqual(await activasDe(b.comoPropietaria), ['WELLHUB'], 'cada estudio, lo suyo');
  } finally {
    for (const i of equipo) await limpiarInstructora(admin, i);
    await admin.from('integraciones').delete().in('studio_id', [a.studioId, b.studioId]);
    await limpiarFixtures(admin, [a, b]);
  }
});
