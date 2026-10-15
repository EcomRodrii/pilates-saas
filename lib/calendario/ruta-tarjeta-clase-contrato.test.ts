import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// Guardián de `PUT /api/estudio/tarjeta-clase` (P3.11). Pocas líneas que un
// refactor puede quitar sin que ningún e2e lo note (los e2e mockean la ruta).
// Si falla, no se relaja el test: se vuelve a poner la condición.

const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const leer = (r: string) => sinComentarios(readFileSync(new URL(r, import.meta.url), 'utf8'));
const ruta = leer('../../app/api/estudio/tarjeta-clase/route.ts');

test('la puerta: sesión → solo propietaria → interruptor, antes de leer el body o escribir', () => {
  const pos = (s: string) => { const i = ruta.indexOf(s); assert.ok(i > 0, `falta «${s}»`); return i; };
  const orden = [
    pos('verificarSesionStaff(req)'),
    pos("sesion.rol !== 'PROPIETARIO'"),
    pos('tarjetaClaseEncendida(sesion.studioId)'),
    pos("searchParams.get('estudio') !== sesion.studioId"),
    pos('req.json()'),
    pos('validarTarjetaClase(body)'),
    pos(".from('studios').update("),
  ];
  assert.deepEqual([...orden].sort((a, b) => a - b), orden);
});

test('la pantalla manda la sede que tiene delante, y si no es la de la sesión no se guarda (409)', () => {
  assert.match(ruta, /status: 409/);
  const cliente = leer('../../components/configuracion/tarjeta-clase/quien-viene-a-cada-clase.tsx');
  assert.match(cliente, /\/api\/estudio\/tarjeta-clase\?estudio=\$\{encodeURIComponent\(studio\?\.id/);
});

test('escribe solo su columna y solo en el estudio de la sesión, nunca en uno del body', () => {
  assert.match(ruta, /\.from\('studios'\)\.update\(\{ tarjeta_clase: valor \}\)\.eq\('id', sesion\.studioId\)\.select\('id'\)/);
  assert.equal([...ruta.matchAll(/\.from\(/g)].length, 1, 'una sola escritura, ninguna otra tabla');
  assert.doesNotMatch(ruta, /body\.(studio|estudio)/i);
  assert.doesNotMatch(ruta, /\.rpc\(/);
  // Cero filas no es «guardado».
  assert.match(ruta, /if \(!data\?\.length\)/);
});

test('el navegador no actualiza la columna: no va por dbUpdateStudio ni tiene GRANT UPDATE', () => {
  // Sin quitar comentarios: un '/*' dentro de una cadena se comería medio fichero.
  const datos = readFileSync(new URL('../supabase-data.ts', import.meta.url), 'utf8');
  const update = datos.slice(datos.indexOf('export async function dbUpdateStudio('), datos.indexOf('export async function dbUpdateStudioAvatar('));
  assert.ok(update.length > 0);
  assert.doesNotMatch(update, /tarjeta_clase|tarjetaClase/);
  const carpeta = new URL('../../supabase/migrations/', import.meta.url);
  const fichero = readdirSync(carpeta).find(f => f.endsWith('_studios_tarjeta_clase.sql'));
  assert.ok(fichero, 'falta la migración');
  const migr = readFileSync(new URL(fichero, carpeta), 'utf8');
  assert.match(migr, /add column if not exists tarjeta_clase jsonb/);
  assert.doesNotMatch(sinComentariosSql(migr), /grant/i, 'sin GRANT: solo la escribe el servidor');
});

const sinComentariosSql = (s: string) => s.replace(/^\s*--.*$/gm, '');
