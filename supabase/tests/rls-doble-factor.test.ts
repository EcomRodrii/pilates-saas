// Verificación en dos pasos del equipo (contrato de encargo, 2-oct-2026; migr
// 20261003020400_doble_factor_equipo.sql): quien la tiene activada no ve ni toca
// NADA con una sesión que no la ha pasado (aal1), aunque vaya directo a la API
// de Supabase sin pasar por el panel. Contra Postgres de verdad (job
// `calidad-rls`), como el resto de supabase/tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { clienteAdminLocal, crearStudioConPropietaria, limpiarFixtures, sqlLocal } from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
const sql = sqlLocal();

test('toda tabla de public con RLS lleva la política restrictiva exige_doble_factor', async () => {
  // Si falla con una tabla NUEVA: añádele la política, copiando la última
  // sentencia del DO de 20261003020400_doble_factor_equipo.sql.
  const sin = await sql<{ relname: string }[]>`
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relrowsecurity
       and not exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname = 'exige_doble_factor' and not p.polpermissive)
     order by 1`;
  assert.deepEqual(sin.map(r => r.relname), [], 'tablas sin exige_doble_factor');
  const storage = await sql`select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'exige_doble_factor'`;
  assert.equal(storage.length, 1, 'storage.objects sin exige_doble_factor');
});

test('con la verificación activada y la sesión sin pasarla, la propietaria no ve su propio estudio', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    // Antes de activarla, la ve y puede crear una sala (comprobación del propio
    // fixture: así el «no» de abajo es por la política y no por otra cosa).
    const antes = await studio.comoPropietaria.from('studios').select('id').eq('id', studio.studioId);
    assert.equal(antes.data?.length, 1, `el fixture no ve su estudio: ${antes.error?.message}`);
    const salaAntes = await studio.comoPropietaria.from('salas').insert({ id: `sala-${randomUUID()}`, studio_id: studio.studioId, nombre: 'Antes', capacidad: 1 });
    assert.ok(!salaAntes.error, `el fixture no puede crear una sala: ${salaAntes.error?.message}`);

    // Un factor verificado, escrito como lo dejaría Supabase al activarla. Su
    // sesión sigue siendo la de antes, `aal1`: es justo el caso de una
    // contraseña robada.
    await sql`insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
              values (${randomUUID()}, ${studio.authUserId}, 'Tentare', 'totp', 'verified', now(), now(), 'JBSWY3DPEHPK3PXP')`;

    const despues = await studio.comoPropietaria.from('studios').select('id').eq('id', studio.studioId);
    assert.equal(despues.data?.length ?? 0, 0, 'con aal1 y factor verificado no debería ver su estudio');
    // Y tampoco por una función con privilegios (SECURITY DEFINER no pasa por
    // las políticas): todas resuelven el estudio con current_studio_id().
    const rpc = await studio.comoPropietaria.rpc('current_studio_id');
    assert.equal(rpc.data, null, `current_studio_id debería ser NULL con aal1 y factor: ${JSON.stringify(rpc)}`);
    const escritura = await studio.comoPropietaria.from('salas').insert({ id: `sala-${randomUUID()}`, studio_id: studio.studioId, nombre: 'X', capacidad: 1 });
    assert.equal(escritura.error?.code, '42501', `con aal1 y factor verificado no debería poder escribir: ${escritura.error?.message}`);
  } finally {
    await sql`delete from auth.mfa_factors where user_id = ${studio.authUserId}`;
    await admin.from('salas').delete().eq('studio_id', studio.studioId);
    await limpiarFixtures(admin, [studio]);
  }
});

test('si el estudio la exige, la propietaria sin factor tampoco ve nada hasta activarla', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    const antes = await studio.comoPropietaria.rpc('current_studio_id');
    assert.equal(antes.data, studio.studioId, `el fixture no resuelve su estudio: ${JSON.stringify(antes)}`);
    // La columna solo la cambia el servidor (trigger): aquí, el admin.
    const { error } = await admin.from('studios').update({ exigir_doble_factor: true }).eq('id', studio.studioId);
    assert.ok(!error, error?.message);
    const despues = await studio.comoPropietaria.rpc('current_studio_id');
    assert.equal(despues.data, null);
    // Y ella no puede apagarlo desde el navegador.
    const intento = await studio.comoPropietaria.from('studios').update({ exigir_doble_factor: false }).eq('id', studio.studioId).select('id');
    assert.ok(intento.error || (intento.data ?? []).length === 0, 'no debería poder quitarse la exigencia desde el navegador');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
});

test('la función que decide no la puede ejecutar anon', async () => {
  const [r] = await sql<{ anon: boolean; auth: boolean }[]>`
    select has_function_privilege('anon', 'public.nivel_acceso_suficiente()', 'EXECUTE') as anon,
           has_function_privilege('authenticated', 'public.nivel_acceso_suficiente()', 'EXECUTE') as auth`;
  assert.equal(r.anon, false);
  assert.equal(r.auth, true, 'authenticated la necesita: la llaman sus políticas');
});

test.after(async () => { await sql.end(); });
