import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// `actualizarSociaPublica` mapea camelCase → columna vía una whitelist
// (`CAMPOS_SOCIA_EDITABLES`). `nombre`/`apellidos`/`email` no estaban en esa
// lista, así que cualquier cambio a esos campos desde "Mis datos" del portal
// se tiraba en silencio — `{ ok: true }` con nada escrito en Postgres. La
// socia leía «Datos guardados» y su nombre seguía siendo el de antes.
//
// El fichero tiene `import 'server-only'` (lib/db/supabase-data-admin.ts), que
// lanza si se importa fuera de un Server Component — no se puede invocar la
// función directamente aquí. Mismo motivo por el que
// tope-socias-idempotencia.test.ts ya hace comprobación estructural sobre el
// código fuente en vez de ejecutarlo.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');
const DATOS = readFileSync(join(RAIZ, 'lib/db/supabase-data-admin.ts'), 'utf8');

function cuerpoDe(nombreFuncion: string): string {
  const ini = DATOS.indexOf(`export async function ${nombreFuncion}`);
  assert.ok(ini > 0, `no encuentro ${nombreFuncion}: ¿se renombró?`);
  const sig = DATOS.indexOf('\nexport ', ini + 1);
  return DATOS.slice(ini, sig > 0 ? sig : undefined);
}

function cuerpoDeCamposEditables(): string {
  const ini = DATOS.indexOf('const CAMPOS_SOCIA_EDITABLES');
  assert.ok(ini > 0, 'no encuentro CAMPOS_SOCIA_EDITABLES: ¿se renombró?');
  const fin = DATOS.indexOf('};', ini) + 2;
  return DATOS.slice(ini, fin);
}

test('nombre y apellidos son editables — antes se tiraban en silencio', () => {
  const whitelist = cuerpoDeCamposEditables();
  assert.match(whitelist, /\bnombre:\s*'nombre'/, 'nombre sigue sin estar en la whitelist: el cambio no se guarda');
  assert.match(whitelist, /\bapellidos:\s*'apellidos'/, 'apellidos sigue sin estar en la whitelist: el cambio no se guarda');
});

test('email NO entra en la whitelist genérica (autorización pública depende de él)', () => {
  const whitelist = cuerpoDeCamposEditables();
  // Aceptarlo sin más rompería `validarSociaPublica`: autoriza TODA escritura
  // pública comparando `socios.email` contra el email real de la sesión de
  // Auth. Un email de socia desincronizado del de login se auto-bloquea para
  // siempre (reservar, cancelar, canjear, editar — todo pasa por esa función).
  assert.doesNotMatch(whitelist, /\bemail:\s*'email'/, 'email se aceptó en la whitelist genérica sin sincronizarlo con Auth');
});

test('un cambio de email real se rechaza explícitamente, no se guarda en silencio', () => {
  const cuerpo = cuerpoDe('actualizarSociaPublica');
  assert.match(
    cuerpo,
    /'email' in params\.cambios/,
    'ya no hay guarda explícita para el email: o se guarda sin sincronizar con Auth, o vuelve a tirarse en silencio',
  );
  const guarda = cuerpo.slice(cuerpo.indexOf(`'email' in params.cambios`));
  assert.match(guarda, /return \{ error:/, 'el cambio de email debe devolver un error explícito, no un ok fingido');
});

// Sentry JAVASCRIPT-NEXTJS-34 (29-sep): tras SEC-01 (auditoría 23-sep),
// `/api/public/foto-perfil` escribe el PATH desnudo del bucket privado
// (`r.socioId`), nunca una URL — pero esta guarda seguía exigiendo que
// empezara por `NEXT_PUBLIC_SUPABASE_URL`. Ninguna subida real podía pasarla
// nunca: TODA foto de perfil de la app de la alumna fallaba con «Esa foto no
// es válida» desde ese commit, sin que ningún test lo cazara.
test('foto_url ya no exige el prefijo de una URL — SEC-01 la cambió a un path desnudo', () => {
  const cuerpo = cuerpoDe('actualizarSociaPublica');
  assert.ok(cuerpo.includes(`'foto_url' in db`), 'no encuentro la guarda de foto_url: ¿se renombró?');
  const guarda = cuerpo.slice(cuerpo.indexOf(`'foto_url' in db`));
  assert.doesNotMatch(
    guarda.slice(0, guarda.indexOf('\n  }')),
    /NEXT_PUBLIC_SUPABASE_URL|startsWith/,
    'la guarda de foto_url sigue comprobando un prefijo de URL — desde SEC-01 el valor legítimo es un path desnudo, así que ninguna subida real la pasaría',
  );
});

test('foto_url solo acepta el id de la PROPIA socia como path, o vaciarla', () => {
  const cuerpo = cuerpoDe('actualizarSociaPublica');
  const guarda = cuerpo.slice(cuerpo.indexOf(`'foto_url' in db`), cuerpo.indexOf(`'foto_url' in db`) + 400);
  assert.match(
    guarda,
    /url !== params\.socioId/,
    'la guarda de foto_url debe exigir que el path sea exactamente el id de la propia socia (lo único que escribe la subida legítima)',
  );
});
