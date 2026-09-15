import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardián de «Entrar como instructora» (15-sep-2026).
//
// `/api/portal/instructora/unirse` une una cuenta a una ficha de equipo con
// service-role, sin enlace firmado. Es la puerta que `lib/equipo/reclamar-reglas.ts`
// explica por qué no puede abrirse a ciegas: con el correo de otra persona, un
// estudio cualquiera se quedaría con su cuenta. Lo que la hace segura son unas
// pocas líneas que un refactor puede quitar sin que ningún e2e lo note (los e2e
// mockean la ruta), así que se fijan aquí contra el código.
//
// Si esto falla, no se relaja el test: se vuelve a poner la condición.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '../..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const unirse = sinComentarios(leer('app/api/portal/instructora/unirse/route.ts'));
const auth = sinComentarios(leer('lib/auth-instructora.ts'));
const socio = sinComentarios(leer('app/api/public/socio/route.ts'));

test('la identidad sale del token y exige el correo verificado', () => {
  assert.match(unirse, /supabase\.auth\.getUser\(token\)/);
  assert.match(unirse, /!user\.email_confirmed_at/, 'sin correo confirmado cualquiera se registra con uno ajeno');
  assert.match(unirse, /fichaInstructoraPendiente\(admin, user\.email, studioId\)/);
});

test('nada que decida sale del cuerpo: ni correo, ni ficha, ni estudio', () => {
  assert.doesNotMatch(unirse, /body\??\.(email|instructorId|studioId|rol)/);
  assert.match(unirse, /resolverStudioPorSlug\(/);
});

test('el UPDATE repite las condiciones: sin cuenta, rol INSTRUCTOR y esta sede', () => {
  const update = unirse.slice(unirse.indexOf(".update({ auth_user_id: user.id })"));
  assert.ok(update.length > 0, 'no se encuentra el UPDATE que une la cuenta');
  const cadena = update.slice(0, update.indexOf('.select('));
  assert.match(cadena, /\.eq\('studio_id', studioId\)/);
  assert.match(cadena, /\.eq\('rol', 'INSTRUCTOR'\)/);
  assert.match(cadena, /\.is\('auth_user_id', null\)/);
});

test('una cuenta propietaria de algún estudio no se une por aquí', () => {
  // Sin `sesion_activa`, `current_studio_id()` elige una ficha de equipo antes
  // que su propio estudio: su panel acabaría en el de otra persona.
  assert.match(unirse, /\.from\('studios'\)\.select\('id'\)\s*\.eq\('owner_auth_user_id', user\.id\)/);
  const comprobacion = unirse.indexOf("eq('owner_auth_user_id', user.id)");
  const update = unirse.indexOf('.update({ auth_user_id: user.id })');
  assert.ok(comprobacion > 0 && comprobacion < update, 'la comprobación tiene que ir ANTES del UPDATE');
});

test('va con límite de peticiones', () => {
  assert.match(unirse, /enforceRateLimit\(req, 'portal-instructora-unirse'/);
});

test('la ficha pendiente solo es de INSTRUCTORA activa, sin cuenta y de esa sede', () => {
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
