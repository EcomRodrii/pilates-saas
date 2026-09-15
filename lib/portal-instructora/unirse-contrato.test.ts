import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardián de «Entrar como instructora» (15-sep-2026).
//
// `/api/portal/instructora/unirse` une una cuenta a una ficha de equipo con
// service-role, por el enlace de invitación o por el correo verificado. Es la
// puerta que `lib/equipo/reclamar-reglas.ts` explica por qué no puede abrirse a
// ciegas. Lo que la hace segura son unas pocas líneas que un refactor puede
// quitar sin que ningún e2e lo note (los e2e mockean la ruta), así que se fijan
// aquí contra el código.
//
// Si esto falla, no se relaja el test: se vuelve a poner la condición.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '../..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const unirse = sinComentarios(leer('app/api/portal/instructora/unirse/route.ts'));
const auth = sinComentarios(leer('lib/auth-instructora.ts'));
const socio = sinComentarios(leer('app/api/public/socio/route.ts'));

/** El cuerpo de una función del fichero de la ruta, hasta la siguiente. */
function cuerpoDe(nombre: string): string {
  const inicio = unirse.indexOf(`function ${nombre}`);
  assert.ok(inicio >= 0, `no se encuentra ${nombre}`);
  const fin = unirse.indexOf('\nfunction ', inicio + 10);
  const finAsync = unirse.indexOf('\nasync function ', inicio + 10);
  const candidatos = [fin, finAsync].filter((n) => n > 0);
  return unirse.slice(inicio, candidatos.length ? Math.min(...candidatos) : undefined);
}

test('la identidad sale del token de sesión, la sede del slug', () => {
  assert.match(unirse, /supabase\.auth\.getUser\(token\)/);
  assert.match(unirse, /resolverStudioPorSlug\(/);
  assert.doesNotMatch(unirse, /body\??\.(email|instructorId|studioId|rol)\b/);
});

test('por enlace: firmado, de ESTE estudio, no revocado, rol INSTRUCTOR y reglas de reclamar', () => {
  const c = cuerpoDe('fichaPorEnlace');
  assert.match(c, /verificarTokenInstructora\(enlace, 'invitacion'\)/);
  assert.match(c, /claim\.studioId !== studioId/);
  assert.match(c, /enlaceRevocado\(admin, claim\.instructorId, 'invitacion', enlace\)/);
  assert.match(c, /fila\.rol !== 'INSTRUCTOR'/);
  assert.match(c, /motivoNoReclamable\(/);
});

test('por correo: exige el correo verificado y usa el de la sesión', () => {
  const c = cuerpoDe('fichaPorCorreo');
  assert.match(c, /!user\.email_confirmed_at/, 'sin correo confirmado cualquiera se registra con uno ajeno');
  assert.match(c, /fichaInstructoraPendiente\(admin, user\.email, studioId\)/);
});

test('el UPDATE repite las condiciones: sin cuenta, rol INSTRUCTOR y esta sede', () => {
  const update = unirse.slice(unirse.indexOf('.update({ auth_user_id: user.id })'));
  const cadena = update.slice(0, update.indexOf('.select('));
  assert.match(cadena, /\.eq\('studio_id', studioId\)/);
  assert.match(cadena, /\.eq\('rol', 'INSTRUCTOR'\)/);
  assert.match(cadena, /\.is\('auth_user_id', null\)/);
});

test('unirse no cambia en qué estudio abre el panel: las DOS puertas lo fijan antes del UPDATE', () => {
  // Sin `sesion_activa` válida, `current_studio_id()` elige una ficha de equipo
  // antes que el estudio propio: una propietaria acabaría en el panel de otra.
  const reclamar = sinComentarios(leer('lib/actions/equipo/equipoReclamarAction.ts'));
  for (const [nombre, src] of [['unirse', unirse], ['equipoReclamarAction', reclamar]] as const) {
    const llamada = src.indexOf('await conservarEstudioDelPanel(admin, user.id)');
    const update = src.indexOf('.update({ auth_user_id: user.id })');
    assert.ok(llamada > 0 && llamada < update, `${nombre}: la sede se fija antes de unir`);
  }
  const conservar = sinComentarios(leer('lib/equipo/conservar-estudio-panel.ts'));
  assert.match(conservar, /\.from\('sesion_activa'\)/);
  assert.match(conservar, /if \(sesion && await sedeValida\(admin, userId, sesion\.studio_id as string\)\) return;/,
    'una sede guardada y válida no se toca; una que ya no vale se reescribe');
  assert.match(conservar, /if \(error\) throw error;/, 'si no se puede fijar, no se une');
});

test('va con límite de peticiones', () => {
  assert.match(unirse, /enforceRateLimit\(req, 'portal-instructora-unirse'/);
});

test('la ficha pendiente por correo solo es de INSTRUCTORA activa, sin cuenta y de esa sede', () => {
  const inicio = auth.indexOf('export async function fichaInstructoraPendiente');
  assert.ok(inicio >= 0);
  const cuerpo = auth.slice(inicio, auth.indexOf('\n}\n', inicio));
  assert.match(cuerpo, /\.eq\('studio_id', studioId\)/);
  assert.match(cuerpo, /\.is\('auth_user_id', null\)/);
  assert.match(cuerpo, /\.eq\('rol', 'INSTRUCTOR'\)/);
  assert.match(cuerpo, /\.neq\('activo', false\)/);
  assert.doesNotMatch(cuerpo, /\.(update|insert|upsert|delete)\(/, 'buscar la ficha no puede escribir nada');
});

test('el alta de alumna no se hace sola si el estudio la tiene como instructora', () => {
  assert.match(socio, /fichaInstructoraPendiente\(adminGuardia, user\.email, body\.studioId\)/);
  assert.match(socio, /code: 'INVITACION_INSTRUCTORA'/);
});
