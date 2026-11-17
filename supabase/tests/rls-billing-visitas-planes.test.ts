// Visitas al selector de planes (migración 20261117112307, Fase 5 de Billing & Revenue):
//  · la función solo la ejecuta service_role y la tabla es solo servidor (la propietaria no la lee ni la escribe);
//  · una visita el mismo día no crea otra fila: suma;
//  · borrar el estudio borra sus visitas.
//
// Ver `supabase/tests/rls-invariantes.test.ts` para por qué este fichero vive en `supabase/tests/`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clienteAdminLocal, crearStudioConPropietaria, limpiarFixtures, sqlLocal } from '../../lib/db/rls-test-helpers.ts';

const admin = clienteAdminLocal();
const sql = sqlLocal();
test.after(async () => { await sql.end(); });

test('la función solo la ejecuta service_role', async () => {
  const [r] = await sql<{ anon: boolean; auth: boolean; svc: boolean }[]>`
    select has_function_privilege('anon', 'public.registrar_visita_planes(text)', 'EXECUTE') as anon,
           has_function_privilege('authenticated', 'public.registrar_visita_planes(text)', 'EXECUTE') as auth,
           has_function_privilege('service_role', 'public.registrar_visita_planes(text)', 'EXECUTE') as svc`;
  assert.deepEqual({ ...r }, { anon: false, auth: false, svc: true });
});

test('dos visitas el mismo día son UNA fila con 2 visitas, y la propietaria no ve ni escribe la tabla', async () => {
  const studio = await crearStudioConPropietaria(admin);
  try {
    assert.ok(!(await admin.rpc('registrar_visita_planes', { p_studio_id: studio.studioId })).error);
    assert.ok(!(await admin.rpc('registrar_visita_planes', { p_studio_id: studio.studioId })).error);
    const filas = await sql<{ visitas: number }[]>`select visitas from public.billing_visitas_planes where studio_id = ${studio.studioId}`;
    assert.deepEqual(filas.map((f) => ({ ...f })), [{ visitas: 2 }]);

    const lee = await studio.comoPropietaria.from('billing_visitas_planes').select('visitas').eq('studio_id', studio.studioId);
    assert.ok(lee.error || (lee.data ?? []).length === 0, 'la propietaria no debe leer la tabla');
    const escribe = await studio.comoPropietaria.from('billing_visitas_planes').insert({ studio_id: studio.studioId, dia: '2026-01-01' });
    assert.ok(escribe.error, 'la propietaria no debe escribir la tabla');
    const rpc = await studio.comoPropietaria.rpc('registrar_visita_planes', { p_studio_id: studio.studioId });
    assert.ok(rpc.error, 'la propietaria no debe ejecutar la función');
  } finally {
    await limpiarFixtures(admin, [studio]);
  }
  // Borrar el estudio se llevó sus visitas (on delete cascade).
  const quedan = await sql`select 1 from public.billing_visitas_planes where studio_id = ${studio.studioId}`;
  assert.equal(quedan.length, 0);
});
