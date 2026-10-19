// La marca del estudio la cambia solo la propietaria, y el tema solo el
// servidor (decisión del fundador, 16-oct-2026; migr *_marca_solo_propietaria.sql).
// Contra Postgres de verdad (job «calidad-rls»), como el resto de supabase/tests.
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive en
// `supabase/tests/` y no en `lib/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearInstructora, crearStudioConPropietaria, limpiarFixtures, limpiarInstructora,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();

type TemaGuardado = { primary?: string };

async function primarioPublicado(studioId: string) {
  const { data } = await admin.from('studio_theme').select('config_published').eq('studio_id', studioId).maybeSingle();
  return (data?.config_published as TemaGuardado | undefined)?.primary;
}

test('el tema: la propietaria lo LEE, pero ni ella lo escribe desde el navegador; el servidor sí', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const { error: errSemilla } = await admin.from('studio_theme')
      .upsert({ studio_id: studio.studioId, config_published: { primary: '#123456' }, config_draft: null });
    assert.ok(!errSemilla, `no se pudo sembrar el tema: ${errSemilla?.message}`);

    const { data: leido, error: errLeer } = await studio.comoPropietaria
      .from('studio_theme').select('studio_id').eq('studio_id', studio.studioId);
    assert.ok(!errLeer, `la propietaria no puede leer su tema: ${errLeer?.message}`);
    assert.equal(leido?.length, 1, 'la propietaria tiene que seguir leyendo su tema');

    const { error: errEscribir } = await studio.comoPropietaria
      .from('studio_theme').update({ config_published: { primary: '#FF0000' } }).eq('studio_id', studio.studioId);
    assert.ok(errEscribir, 'la propietaria pudo escribir el tema publicado saltándose el servidor');
    assert.equal(await primarioPublicado(studio.studioId), '#123456', 'el tema cambió a pesar del error');

    // Control: el camino del servidor (service_role) sigue escribiendo.
    const { error: errServidor } = await admin.from('studio_theme')
      .update({ config_published: { primary: '#654321' } }).eq('studio_id', studio.studioId);
    assert.ok(!errServidor, `el servidor no pudo escribir el tema: ${errServidor?.message}`);
    assert.equal(await primarioPublicado(studio.studioId), '#654321');
  } finally {
    await admin.from('studio_theme').delete().eq('studio_id', studio.studioId);
    await limpiarFixtures(admin, [studio]);
  }
});

test('imágenes de marca (logo, portada, favicon de borrador): solo la propietaria; el favicon publicado, nadie', async () => {
  const studio = await crearStudioConPropietaria(admin);
  let manager;
  try {
    manager = await crearInstructora(admin, studio.studioId, 'MANAGER');
    const puede = async (cliente: typeof studio.comoPropietaria, nombre: string) => {
      const { data, error } = await cliente.rpc('avatars_path_escribible', { p_name: nombre });
      assert.ok(!error, `${nombre}: ${error?.message}`);
      return data as boolean;
    };
    for (const nombre of [`logo-${studio.studioId}`, `bienvenida-${studio.studioId}`, `favicon-borrador-${studio.studioId}`]) {
      assert.equal(await puede(studio.comoPropietaria, nombre), true, `propietaria · ${nombre}`);
      assert.equal(await puede(manager.comoInstructora, nombre), false, `gerencia · ${nombre}`);
    }
    assert.equal(await puede(studio.comoPropietaria, `favicon-${studio.studioId}`), false, 'el favicon publicado lo copia solo el servidor');
    assert.equal(await puede(manager.comoInstructora, `favicon-${studio.studioId}`), false);
    // Lo que sigue siendo de la gerencia no cambia: el Inicio del portal.
    assert.equal(await puede(manager.comoInstructora, `portal-${studio.studioId}-hero`), true, 'la gerencia sigue con las fotos del Inicio del portal');
  } finally {
    if (manager) await limpiarInstructora(admin, manager);
    await limpiarFixtures(admin, [studio]);
  }
});
