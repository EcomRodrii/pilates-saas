import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { senalConLimite } from './senal-con-limite.ts';

test('sin AbortSignal.timeout (Safari de iOS 15) la señal aborta igual, por tiempo', async (t) => {
  const original = AbortSignal.timeout;
  // @ts-expect-error: se simula un navegador que no la tiene
  AbortSignal.timeout = undefined;
  t.after(() => { AbortSignal.timeout = original; });
  const senal = senalConLimite(20);
  assert.equal(senal.aborted, false);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(senal.aborted, true);
  assert.equal((senal.reason as DOMException).name, 'TimeoutError');
});

test('con AbortSignal.timeout, la usa', () => {
  const senal = senalConLimite(1000);
  assert.equal(senal.aborted, false);
});

// `AbortSignal.timeout` solo en código de SERVIDOR (Node la tiene siempre). En
// el navegador, `senalConLimite`: un iPhone con iOS 15 no la tiene y el fetch
// fallaría antes de salir. Lista cerrada: un sitio nuevo decide de qué lado está.
const RAIZ = new URL('../', import.meta.url).pathname;
const SERVIDOR = new Set([
  'lib/r2.ts',
  'lib/auditoria/cobro-manual.ts',
  'lib/auditoria/registrar-servidor.ts',
  'lib/auth/captcha-servidor.ts',
  'lib/analytics.ts',
  'lib/notifications/engine.ts',
  'lib/plataformas/usc/cliente.ts',
  'lib/fetch-externo.ts',
  'lib/sustituciones/email.ts',
  'lib/senal-con-limite.ts',
]);

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    if (n === 'node_modules' || n === '.next') return [];
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return ficheros(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

test('AbortSignal.timeout no aparece en código que pueda correr en el navegador', () => {
  const sueltos = ['app', 'lib', 'components'].flatMap((d) => ficheros(join(RAIZ, d)))
    .map((p) => relative(RAIZ, p))
    .filter((r) => !r.startsWith('app/api/') && !SERVIDOR.has(r))
    .filter((r) => /AbortSignal\.timeout\(/.test(readFileSync(join(RAIZ, r), 'utf8').replace(/^\s*\/\/.*$/gm, '')));
  assert.deepEqual(sueltos, [], 'En el navegador usa senalConLimite (lib/senal-con-limite.ts): iOS 15 no tiene AbortSignal.timeout.');
});
