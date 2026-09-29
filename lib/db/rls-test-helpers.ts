// Ayudantes para los tests de RLS contra una base de datos REAL (CI-1, auditoría
// 62ª pasada). Deliberadamente NO importa `lib/db/supabase-admin.ts`: ese
// fichero lleva `import 'server-only'`, que revienta fuera del bundler de
// Next.js — este helper corre bajo `node --test` a pelo, así que construye sus
// propios clientes.
//
// Solo tiene sentido con `supabase start` corriendo de verdad: sin el proyecto
// local (Postgres + GoTrue + PostgREST reales, con los roles `anon`/
// `authenticated`/`service_role` y `auth.uid()` funcionando), estos tests
// pasarían en falso — no habría RLS de verdad que probar. Ver
// `.github/workflows/ci.yml`, job `calidad-rls`.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function env(nombre: string): string {
  const v = process.env[nombre];
  if (!v) {
    throw new Error(
      `Falta ${nombre}. Estos tests necesitan un Supabase LOCAL real: `
      + '`supabase start` y exportar sus credenciales (ver el job `calidad-rls` de ci.yml), '
      + 'nunca las envs dummy que usan los tests unitarios mockeados.',
    );
  }
  return v;
}

/** Cliente con la service-role key local — salta RLS a propósito, para montar fixtures. */
export function clienteAdminLocal(): SupabaseClient {
  return createClient(env('SUPABASE_LOCAL_URL'), env('SUPABASE_LOCAL_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  });
}

/** Cliente anónimo local, uno nuevo por sesión: cada `signInWithPassword` muta su estado interno. */
function clienteAnonLocal(): SupabaseClient {
  return createClient(env('SUPABASE_LOCAL_URL'), env('SUPABASE_LOCAL_ANON_KEY'), {
    auth: { persistSession: false },
  });
}

let contador = 0;
/** IDs deterministas pero únicos por proceso — no colisionan entre tests ni con supabase/seed.sql. */
function idUnico(prefijo: string): string {
  contador += 1;
  return `${prefijo}-rls-${process.pid}-${Date.now()}-${contador}`;
}

export interface StudioFixture {
  studioId: string;
  authUserId: string;
  /** Cliente `supabase-js` YA AUTENTICADO como la propietaria de este studio. */
  comoPropietaria: SupabaseClient;
}

/**
 * Crea un studio con una propietaria de verdad (usuario de Auth real +
 * `studios.owner_auth_user_id`) y devuelve un cliente ya logueado como ella.
 *
 * No hace falta ninguna fila en `instructores`: `current_rol()`
 * (0130_baja_revoca_acceso.sql) ya resuelve 'PROPIETARIO' solo con
 * `owner_auth_user_id = auth.uid()` — es el fixture más barato posible para
 * una sesión de staff real.
 */
export async function crearStudioConPropietaria(admin: SupabaseClient): Promise<StudioFixture> {
  const email = `${idUnico('propietaria')}@rls-test.invalid`;
  const password = 'rls-test-password-1234';
  const { data: userData, error: errUser } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (errUser || !userData.user) {
    throw new Error(`No se pudo crear la propietaria de fixture: ${errUser?.message ?? 'sin usuario'}`);
  }

  const studioId = idUnico('studio');
  const { error: errStudio } = await admin.from('studios').insert({
    id: studioId, nombre: 'RLS test studio', plan: 'ESTUDIO', owner_auth_user_id: userData.user.id,
  });
  if (errStudio) throw new Error(`No se pudo crear el studio de fixture: ${errStudio.message}`);

  const comoPropietaria = clienteAnonLocal();
  const { error: errLogin } = await comoPropietaria.auth.signInWithPassword({ email, password });
  if (errLogin) throw new Error(`No se pudo autenticar la propietaria de fixture: ${errLogin.message}`);

  return { studioId, authUserId: userData.user.id, comoPropietaria };
}

/** Una socia mínima (sin cuenta de Auth: aquí solo hace falta la FILA, para probar lectura/escritura ajena). */
export async function crearSocia(admin: SupabaseClient, studioId: string): Promise<string> {
  const socioId = idUnico('socio');
  const { error } = await admin.from('socios').insert({
    id: socioId, studio_id: studioId, nombre: 'RLS', apellidos: 'Test', email: `${socioId}@rls-test.invalid`,
  });
  if (error) throw new Error(`No se pudo crear la socia de fixture: ${error.message}`);
  return socioId;
}

/** Limpia todo lo creado por `crearStudioConPropietaria`/`crearSocia` de una tacada. `ON DELETE CASCADE` se lleva el resto. */
export async function limpiarFixtures(admin: SupabaseClient, fixtures: StudioFixture[]): Promise<void> {
  const studioIds = fixtures.map(f => f.studioId);
  if (studioIds.length > 0) await admin.from('studios').delete().in('id', studioIds);
  for (const f of fixtures) {
    await admin.auth.admin.deleteUser(f.authUserId).catch(() => {});
  }
}
