import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  ErrorCopiaCifrada, cifrarCopia, clavesCopiasDelEntorno, descifrarCopia, esCopiaCifrada, idDeClaveCopia,
} from './cifrado-copias.ts';
import { accionTraslado, hostR2 } from '../r2.ts';

const clave = randomBytes(32);
const otra = randomBytes(32);
const claves = { actual: clave, anterior: null, malformada: false };
const ruta = 'backups/studio-a/bak-1.json';
const json = new TextEncoder().encode(JSON.stringify({ socios: [{ id: 's1', nombre: 'Ana' }] }));

test('cifra y descifra una copia, y el cifrado no deja ver el contenido', () => {
  const c = cifrarCopia(json, ruta, clave);
  assert.ok(esCopiaCifrada(c));
  assert.ok(!Buffer.from(c).toString('utf8').includes('Ana'));
  assert.deepEqual(Buffer.from(descifrarCopia(c, ruta, claves)), Buffer.from(json));
});

test('una copia movida a la ruta de otro estudio no se descifra', () => {
  const c = cifrarCopia(json, ruta, clave);
  assert.throws(() => descifrarCopia(c, 'backups/studio-b/bak-1.json', claves), (e: unknown) =>
    e instanceof ErrorCopiaCifrada && e.motivo === 'no-descifra');
});

test('las copias de antes, en JSON claro, se siguen leyendo tal cual', () => {
  assert.equal(esCopiaCifrada(json), false);
  assert.deepEqual(descifrarCopia(json, ruta, claves), json);
  // Aunque no haya clave puesta: no hay nada que descifrar.
  assert.deepEqual(descifrarCopia(json, ruta, { actual: null, anterior: null, malformada: false }), json);
});

test('rotación: lo cifrado con la clave anterior se lee; sin ninguna clave, se niega', () => {
  const c = cifrarCopia(json, ruta, otra);
  assert.deepEqual(Buffer.from(descifrarCopia(c, ruta, { actual: clave, anterior: otra, malformada: false })), Buffer.from(json));
  assert.throws(() => descifrarCopia(c, ruta, claves), (e: unknown) => e instanceof ErrorCopiaCifrada && e.motivo === 'clave-desconocida');
  assert.throws(() => descifrarCopia(c, ruta, { actual: null, anterior: null, malformada: false }),
    (e: unknown) => e instanceof ErrorCopiaCifrada && e.motivo === 'sin-clave');
});

test('un byte cambiado se detecta (GCM autentica)', () => {
  const c = Buffer.from(cifrarCopia(json, ruta, clave));
  c[c.length - 20] ^= 1;
  assert.throws(() => descifrarCopia(c, ruta, claves), ErrorCopiaCifrada);
});

test('la clave del entorno: 32 bytes en base64; otra cosa es «malformada», vacía es «sin clave»', () => {
  const b64 = clave.toString('base64');
  const e = clavesCopiasDelEntorno({ BACKUPS_CLAVE_CIFRADO: b64 });
  assert.equal(e.actual && idDeClaveCopia(e.actual), idDeClaveCopia(clave));
  assert.equal(clavesCopiasDelEntorno({ BACKUPS_CLAVE_CIFRADO: 'corta' }).malformada, true);
  assert.deepEqual(clavesCopiasDelEntorno({}), { actual: null, anterior: null, malformada: false });
});

test('host de R2: con jurisdicción UE, el endpoint de la jurisdicción', () => {
  assert.equal(hostR2('abc123', undefined), 'abc123.r2.cloudflarestorage.com');
  assert.equal(hostR2('abc123', 'eu'), 'abc123.eu.r2.cloudflarestorage.com');
  assert.equal(hostR2('abc123', ' EU '), 'abc123.eu.r2.cloudflarestorage.com');
  assert.throws(() => hostR2('abc123', 'eu.evil.com/'));
});

test('traslado al bucket de la UE: lo que ya está allí manda, y una copia en claro se cifra al pasar', () => {
  assert.equal(accionTraslado('backups/s/b.json', { existeEnUe: true, cifrada: false }), 'ya-estaba');
  assert.equal(accionTraslado('backups/s/b.json', { existeEnUe: false, cifrada: false }), 'cifrar-y-copiar');
  assert.equal(accionTraslado('backups/s/b.json', { existeEnUe: false, cifrada: true }), 'copiar');
  // Un fichero de un tema importado se copia tal cual (es la web del estudio).
  assert.equal(accionTraslado('temas/x/index.html', { existeEnUe: false, cifrada: false }), 'copiar');
  assert.equal(accionTraslado('temas/x/index.html', { existeEnUe: true, cifrada: false }), 'ya-estaba');
});
