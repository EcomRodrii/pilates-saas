import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hashToken, tokenCoincideConHash } from './token-hash.ts';

const leer = (ruta: string) => readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8');

test('el hash coincide con el de pgcrypto en producción (la migración hashea en SQL)', () => {
  // encode(extensions.digest('abc','sha256'),'hex') medido en dwqvdycjcffqwfkzapvi.
  assert.equal(hashToken('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.match(hashToken('x'), /^[0-9a-f]{64}$/);
});

test('solo el token correcto coincide con su hash', () => {
  const token = 'dGVzdC10b2tlbi1kZS1rbGlvc2tv';
  const guardado = hashToken(token);
  assert.equal(tokenCoincideConHash(token, guardado), true);
  assert.equal(tokenCoincideConHash(`${token}x`, guardado), false);
  // Quien lea el hash no puede usarlo como token.
  assert.equal(tokenCoincideConHash(guardado, guardado), false);
});

test('sin token o sin hash guardado nunca autoriza', () => {
  assert.equal(tokenCoincideConHash(null, hashToken('a')), false);
  assert.equal(tokenCoincideConHash('', hashToken('')), false);
  assert.equal(tokenCoincideConHash('a', null), false);
  assert.equal(tokenCoincideConHash('a', ''), false);
  assert.equal(tokenCoincideConHash('a', 'no-es-un-hash'), false);
});

// ── Contrato con el código y las migraciones ─────────────────────────────────

test('el kiosko guarda y valida solo el hash', () => {
  const ruta = leer('app/api/kiosk/token/route.ts');
  assert.doesNotMatch(ruta, /kiosk_token\s*:/);
  assert.match(ruta, /kiosko_tokens/);
  assert.match(ruta, /hashToken\(/);
  assert.match(ruta, /sesion\.rol !== 'PROPIETARIO'/);

  const admin = leer('lib/db/supabase-data-admin.ts');
  assert.doesNotMatch(admin, /select\('kiosk_token'\)/);
  assert.match(admin, /tokenCoincideConHash\(/);

  const sql = leer('supabase/migrations/20260914110000_kiosko_token_solo_hash.sql');
  assert.match(sql, /revoke\s+all\s+on\s+public\.kiosko_tokens\s+from\s+public,\s*anon,\s*authenticated/i);
  assert.match(sql, /check\s*\(\s*kiosk_token\s+is\s+null\s*\)/i);
});

test('el enlace de sustitución se guarda y se busca por hash, y el staff no lee la tabla', () => {
  const contacto = leer('lib/sustituciones/contacto.ts');
  assert.doesNotMatch(contacto, /\btoken:\s*p\.token/);
  assert.match(contacto, /token_hash:/);

  const publica = leer('app/api/public/aceptar-sustitucion/route.ts');
  assert.doesNotMatch(publica, /\.eq\('token'/);
  assert.match(publica, /\.eq\('token_hash', tokenHash\)/);

  const sql = leer('supabase/migrations/20260914110100_sustitucion_contactos_token_solo_hash.sql');
  assert.match(sql, /revoke\s+all\s+on\s+public\.sustitucion_contactos\s+from\s+anon,\s*authenticated/i);
  assert.match(sql, /drop\s+policy\s+if\s+exists\s+admin_sustitucion_contactos/i);
});
