// `studios.mostrar_logo_en_landing`: el consentimiento para que el logo de un estudio salga en la
// franja de clientes de la landing lo da el equipo de Tentare (servidor), nunca el navegador
// (migración 20261019190000). Si una propietaria pudiera ponérselo a true, la franja enseñaría un
// logo que nadie ha aprobado; si pudiera ponérselo a otra, lo mismo con un estudio ajeno.
//
// Contra Postgres de verdad (job «calidad-rls»), como el resto de supabase/tests. Ver
// `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive aquí y no en `lib/`.
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clienteAdminLocal, crearStudioConPropietaria, limpiarFixtures, sqlLocal,
} from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
const sql = sqlLocal();

// Según la versión de Postgres el mensaje nombra la tabla o la columna.
const permisoDenegado = /permission denied for (table studios|column "\w+" of relation "studios")/;

after(async () => { await sql.end(); });

async function consentimiento(studioId: string): Promise<boolean | null> {
  const { data } = await admin.from('studios').select('mostrar_logo_en_landing').eq('id', studioId).maybeSingle();
  return (data as { mostrar_logo_en_landing: boolean } | null)?.mostrar_logo_en_landing ?? null;
}

test('de serie está apagado: un estudio nuevo nunca sale en la landing', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    assert.equal(await consentimiento(studio.studioId), false);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('privilegios: ni authenticated ni anon la escriben, anon no la lee y service_role sí', async () => {
  const [p] = await sql<{ au: boolean; ai: boolean; nu: boolean; ni: boolean; ns: boolean; su: boolean; ss: boolean; nombre: boolean }[]>`
    select has_column_privilege('authenticated', 'public.studios', 'mostrar_logo_en_landing', 'UPDATE') as au,
           has_column_privilege('authenticated', 'public.studios', 'mostrar_logo_en_landing', 'INSERT') as ai,
           has_column_privilege('anon', 'public.studios', 'mostrar_logo_en_landing', 'UPDATE') as nu,
           has_column_privilege('anon', 'public.studios', 'mostrar_logo_en_landing', 'INSERT') as ni,
           has_column_privilege('anon', 'public.studios', 'mostrar_logo_en_landing', 'SELECT') as ns,
           has_column_privilege('service_role', 'public.studios', 'mostrar_logo_en_landing', 'UPDATE') as su,
           has_column_privilege('service_role', 'public.studios', 'mostrar_logo_en_landing', 'SELECT') as ss,
           has_column_privilege('authenticated', 'public.studios', 'nombre', 'UPDATE') as nombre`;
  assert.equal(p.au, false, 'authenticated puede actualizar el consentimiento');
  assert.equal(p.ai, false, 'authenticated puede fijarlo al crear un estudio');
  assert.equal(p.nu || p.ni, false, 'anon puede escribirlo');
  assert.equal(p.ns, false, 'anon puede leerlo');
  assert.ok(p.su && p.ss, 'service_role perdió su acceso');
  assert.ok(p.nombre, 'control: el resto de la whitelist de UPDATE tiene que seguir intacta');
});

test('la propietaria no se lo pone a true desde el navegador; el servidor sí', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const { error } = await studio.comoPropietaria
      .from('studios').update({ mostrar_logo_en_landing: true }).eq('id', studio.studioId);
    assert.ok(error, 'la propietaria se dio el consentimiento a sí misma desde el navegador');
    assert.match(error.message, permisoDenegado, `bloqueó otra cosa: ${error.message}`);
    assert.equal(await consentimiento(studio.studioId), false, 'el consentimiento cambió a pesar del error');

    // Control: lo que la propietaria SÍ escribe en su estudio (para que el fallo de arriba no sea un fallo general).
    const { error: errNombre } = await studio.comoPropietaria
      .from('studios').update({ nombre: 'RLS test studio 2' }).eq('id', studio.studioId);
    assert.ok(!errNombre, `la propietaria no pudo cambiar el nombre de su estudio: ${errNombre?.message}`);

    // Control positivo: el camino del servidor (service_role) sí lo enciende y lo apaga.
    const { error: errOn } = await admin.from('studios').update({ mostrar_logo_en_landing: true }).eq('id', studio.studioId);
    assert.ok(!errOn, `el servidor no pudo encenderlo: ${errOn?.message}`);
    assert.equal(await consentimiento(studio.studioId), true);
    const { error: errOff } = await admin.from('studios').update({ mostrar_logo_en_landing: false }).eq('id', studio.studioId);
    assert.ok(!errOff, `el servidor no pudo apagarlo: ${errOff?.message}`);
    assert.equal(await consentimiento(studio.studioId), false);
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('un alta desde el navegador no puede nacer con el consentimiento puesto', async () => {
  const studio = await crearStudioConPropietaria(admin);
  const id = `studio-logo-${process.pid}-${Date.now()}`;
  try {
    const { error } = await studio.comoPropietaria.from('studios').insert({
      id, nombre: 'Alta RLS', ciudad: 'Madrid', telefono: null, plan: 'BASE',
      owner_auth_user_id: studio.authUserId, slug: id, como_nos_conocio: null, tipo_cuenta: 'ESTUDIO',
      mostrar_logo_en_landing: true,
    });
    assert.ok(error, 'el navegador creó un estudio con el consentimiento ya puesto');
    assert.match(error.message, permisoDenegado, `bloqueó otra cosa: ${error.message}`);
    assert.equal(await consentimiento(id), null, 'el estudio existe a pesar del error');
  } finally {
    await admin.from('studios').delete().eq('id', id);
    await limpiarFixtures(admin, [studio]);
  }
});
