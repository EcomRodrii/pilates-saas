// Borrar una publicación del tablón es solo del servidor, que borra también su
// foto del bucket público (migr 20261006014416_posts_comunidad_borrar_y_foto_solo_servidor.sql).
// Contra Postgres de verdad (job `calidad-rls`), como el resto de supabase/tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { clienteAdminLocal, crearStudioConPropietaria, limpiarFixtures, sqlLocal } from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
const sql = sqlLocal();

async function post(studioId: string, autorId: string): Promise<string> {
  const id = `post-${randomUUID()}`;
  await sql`insert into public.posts_comunidad (id, studio_id, autor_id, autor_nombre, texto, imagen_url)
            values (${id}, ${studioId}, ${autorId}, 'Estudio', 'Aviso', 'https://proyecto.supabase.co/storage/v1/object/public/comunidad-media/foto')`;
  return id;
}

test('el navegador no borra una publicación ni reescribe su foto, ni la propietaria', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const id = await post(studio.studioId, studio.authUserId);
    const borrar = await studio.comoPropietaria.from('posts_comunidad').delete().eq('id', id);
    assert.equal(borrar.error?.code, '42501', `DELETE de posts_comunidad: ${borrar.error?.message}`);
    const foto = await studio.comoPropietaria.from('posts_comunidad').update({ imagen_url: 'https://ajeno.example/x.png' }).eq('id', id);
    assert.equal(foto.error?.code, '42501', `UPDATE de imagen_url: ${foto.error?.message}`);
    const [p] = await sql<{ imagen_url: string }[]>`select imagen_url from public.posts_comunidad where id = ${id}`;
    assert.match(p.imagen_url, /comunidad-media\/foto$/, 'la foto no debería haber cambiado');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('editar y fijar siguen funcionando desde el panel', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const id = await post(studio.studioId, studio.authUserId);
    const { data, error } = await studio.comoPropietaria.from('posts_comunidad')
      .update({ fijado: true, texto: 'Aviso corregido' }).eq('id', id).select('id');
    assert.ok(!error, `fijar o editar: ${error?.message}`);
    assert.equal(data?.length, 1, 'la propietaria ya no puede fijar su publicación');
    const [p] = await sql<{ fijado: boolean; texto: string }[]>`select fijado, texto from public.posts_comunidad where id = ${id}`;
    assert.deepEqual({ fijado: p.fijado, texto: p.texto }, { fijado: true, texto: 'Aviso corregido' });
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});
