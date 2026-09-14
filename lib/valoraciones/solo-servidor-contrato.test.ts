import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardia de contrato: las valoraciones solo las lee el servidor, y lo que se
// publica de ellas es el agregado protegido (decisión del 14-sep-2026). La
// instructora sabe quién vino a cada clase: una valoración suelta, un comentario
// o una media en vivo identifican a quien votó. Si falla, se arregla el código.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const DIR = join(RAIZ, 'supabase/migrations');
const NOMBRE = readdirSync(DIR).find((n) => n.endsWith('_valoraciones_solo_servidor.sql'));
const SQL = NOMBRE ? readFileSync(join(DIR, NOMBRE), 'utf8').replace(/--.*$/gm, '') : '';

test('la tabla y el resumen dejan de estar al alcance del cliente', () => {
  assert.ok(NOMBRE, 'falta la migración *_valoraciones_solo_servidor.sql');
  assert.match(SQL, /drop policy if exists admin_valoraciones on public\.valoraciones;/);
  assert.match(SQL, /revoke all on table public\.valoraciones from anon;/);
  assert.match(SQL, /revoke all on table public\.valoraciones from authenticated;/);
  for (const rol of ['public', 'anon', 'authenticated']) {
    assert.match(SQL, new RegExp(`revoke all on function public\\.valoraciones_resumen_estudio\\(text\\) from ${rol};`), `falta revoke from ${rol}`);
  }
  assert.match(SQL, /grant execute on function public\.valoraciones_resumen_estudio\(text\) to service_role;/);
  assert.doesNotMatch(SQL, /grant [^;]*to [^;]*\b(anon|authenticated)\b/);
  assert.doesNotMatch(SQL, /create policy/i);
});

test('el catálogo público publica el agregado protegido y nunca el comentario', () => {
  const catalogo = leer('lib/db/supabase-data-admin.ts');
  const consulta = catalogo.match(/from\('valoraciones'\)\.select\('([^']*)'\)/)?.[1];
  assert.ok(consulta, 'no se encontró la consulta de valoraciones del catálogo');
  assert.doesNotMatch(consulta!, /comentario/);
  assert.match(catalogo, /agregadoPublicable\(/);
});

test('ninguna regla del panel deja a la instructora leer valoraciones sueltas ni la media en vivo', () => {
  const reglas = leer('lib/permisos-reglas.ts');
  for (const nombre of ['puedeVerValoracionesDe', 'puedeVerResumenValoracionDe']) {
    const cuerpo = reglas.slice(reglas.indexOf(`export function ${nombre}`)).split('\n}')[0];
    assert.doesNotMatch(cuerpo, /INSTRUCTOR/, `${nombre} vuelve a abrirse a la instructora`);
  }
});

test('el perfil de la instructora solo pide lo necesario para su agregado, de sus clases en ese estudio', () => {
  const perfil = leer('lib/portal-instructora/perfil-servidor.ts');
  const consulta = perfil.match(/from\('valoraciones'\)\.select\('([^']*)'\)/)?.[1];
  assert.ok(consulta, 'no se encontró la consulta de valoraciones del perfil');
  assert.doesNotMatch(consulta!, /comentario/);
  assert.match(perfil, /\.eq\('studio_id', studioId\)\.eq\('instructor_id', instructorId\)/);
  assert.match(perfil, /valoraciones: agregadoPublicable\(/);
});
