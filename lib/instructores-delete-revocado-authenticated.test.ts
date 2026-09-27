import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardián: `authenticated` no puede volver a tener DELETE sobre `instructores`.
//
// Las policies `manager_gestiona_equipo`/`owner_write_instructores` son FOR ALL,
// así que sin un REVOKE de tabla explícito, cualquier propietaria o gerente con
// su JWT normal podría borrar la fila directamente por la API de datos — y las
// FK de `clases_impartidas`, `instructor_work_sessions`, `liquidaciones_instructoras`
// e `instructor_tarifas` hacia `instructores` son ON DELETE CASCADE: eso se
// llevaría por delante justo lo que hay que conservar (jornada, base de lo
// pagado). La app da de baja con `activo = false` (service_role), nunca con
// DELETE — ver `lib/actions/equipo/equipoAction.ts`.
//
// Si esto falla, no se arregla borrando el test: se arregla la migración que
// haya vuelto a conceder el privilegio.
// ─────────────────────────────────────────────────────────────────────────────

const DIR = join(import.meta.dirname, '..', 'supabase/migrations');

const sinComentarios = (sql: string) => sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--.*$/gm, '');

function migraciones(): { nombre: string; sql: string }[] {
  return readdirSync(DIR).filter(n => n.endsWith('.sql')).sort()
    .map(nombre => ({ nombre, sql: sinComentarios(readFileSync(join(DIR, nombre), 'utf8')) }));
}

const RE_REVOKE_DELETE = /\brevoke\s+(?:delete|all)\b[^;]*\bon\s+(?:table\s+)?public\.instructores\b[^;]*\bfrom\b[^;]*\bauthenticated\b/i;
const RE_GRANT_DELETE = /\bgrant\s+(?:delete|all)\b[^;]*\bon\s+(?:table\s+)?public\.instructores\b[^;]*\bto\b[^;]*\bauthenticated\b/i;

test('alguna migración revoca DELETE sobre public.instructores a authenticated', () => {
  const revocadora = migraciones().find(m => RE_REVOKE_DELETE.test(m.sql));
  assert.ok(revocadora, 'falta la migración que hace `revoke delete on public.instructores from authenticated`');
});

test('ninguna migración posterior a la revocación le devuelve DELETE a authenticated', () => {
  const todas = migraciones();
  const idxRevoca = todas.findIndex(m => RE_REVOKE_DELETE.test(m.sql));
  assert.ok(idxRevoca !== -1, 'falta la migración que revoca DELETE (ver test anterior)');

  const reintroducciones = todas
    .slice(idxRevoca + 1)
    .filter(m => RE_GRANT_DELETE.test(m.sql))
    .map(m => m.nombre);

  assert.deepEqual(reintroducciones, [],
    'Una migración posterior concede DELETE/ALL sobre instructores a authenticated otra vez — ' +
    'revísala: la app da de baja con `activo = false` vía service_role, nunca con DELETE directo.');
});
