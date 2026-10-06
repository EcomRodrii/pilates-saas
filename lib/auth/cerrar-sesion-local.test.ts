// «Cerrar sesión» cierra ESTE dispositivo, no la cuenta en todos (6-oct-2026:
// «recordar iniciar sesión funciona a veces sí, a veces no»). auth-js hace
// `signOut()` 'global' por defecto: revoca todos los refresh tokens de la
// cuenta, y el móvil, el iPad del mostrador o la app del estudio caían en su
// siguiente renovación (`refresh_token_not_found`), sin que nadie los tocara.
// La cuenta es UNA para el panel, la app del estudio y Network, así que salir
// de una echaba de todas. Este test falla si vuelve un `signOut` sin scope.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { decidirRecuperacionJwt, esFalloTransitorioDeRefresh } from '../recuperar-sesion.ts';

const RAIZ = new URL('../../', import.meta.url).pathname;

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    if (n === 'node_modules' || n === '.next') return [];
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return ficheros(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('ningún signOut de Supabase sin scope (el de por defecto es «todos los dispositivos»)', () => {
  const sueltos = ['app', 'lib', 'components'].flatMap((d) => ficheros(join(RAIZ, d)))
    .filter((p) => /\.auth\.signOut\(\s*\)/.test(sinComentarios(readFileSync(p, 'utf8'))))
    .map((p) => relative(RAIZ, p));
  assert.deepEqual(sueltos, [], "Usa signOut({ scope: 'local' }). Cerrar en todos es una acción aparte y explícita.");
});

test('un refresco que falla por la red o por un 5xx no echa a nadie', () => {
  assert.equal(esFalloTransitorioDeRefresh({ name: 'AuthRetryableFetchError', status: 0 }), true);
  assert.equal(esFalloTransitorioDeRefresh({ name: 'AuthApiError', status: 500 }), true);
  assert.equal(esFalloTransitorioDeRefresh(new TypeError('Failed to fetch')), true);
  const base = { haySesionLocal: true, refreshOk: false, ultimaRecargaMs: null, ahoraMs: 1 };
  assert.equal(decidirRecuperacionJwt({ ...base, refreshTransitorio: true }), 'nada');
});

test('un refresh token muerto de verdad (4xx de GoTrue) sí manda a entrar', () => {
  assert.equal(esFalloTransitorioDeRefresh({ name: 'AuthApiError', status: 400 }), false);
  assert.equal(esFalloTransitorioDeRefresh({ name: 'AuthSessionMissingError', status: 400 }), false);
  const base = { haySesionLocal: true, refreshOk: false, ultimaRecargaMs: null, ahoraMs: 1 };
  assert.equal(decidirRecuperacionJwt({ ...base, refreshTransitorio: false }), 'login');
});
