// Una tarjeta de «Descubre» que no lleva a ningún sitio (decisión 13 de «Mi app y mi web»
// v2, migr 20261016100100_tarjeta_sin_enlace), contra una base de datos real: `ninguno` va
// SIEMPRE con `link_valor` vacío, y lo que ya era válido lo sigue siendo.
//
// Se llama con `admin` (service_role). Ver `supabase/tests/rls-invariantes.test.ts` para por
// qué este fichero vive en `supabase/tests/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clienteAdminLocal, crearStudioConPropietaria, limpiarFixtures } from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();

test('«ninguno» solo con el enlace vacío; interno con «/» y externo con http(s), como siempre', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const tarjeta = (link_tipo: string, link_valor: string) =>
      admin.from('contenido_portal_banners').insert({ studio_id: studio.studioId, imagen_url: '', link_tipo, link_valor });
    assert.equal((await tarjeta('ninguno', '')).error, null, 'una tarjeta sin enlace se guarda');
    assert.match((await tarjeta('ninguno', '/reservar')).error?.message ?? '', /link_valor_forma/);
    assert.equal((await tarjeta('interno', '/reservar')).error, null);
    assert.equal((await tarjeta('externo', 'https://instagram.com/estudio')).error, null);
    assert.match((await tarjeta('externo', 'instagram.com/estudio')).error?.message ?? '', /link_valor_forma/);
    assert.match((await tarjeta('otro', '')).error?.message ?? '', /link_tipo_check/);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});
