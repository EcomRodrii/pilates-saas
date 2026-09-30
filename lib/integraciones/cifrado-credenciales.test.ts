import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  cifrarCredencial, clavesDelEntorno, contextoCredencial, descifrarCredencial, estaCifrado, idDeClave,
  paraGuardar, pideCifrarse, type ClavesCredenciales,
} from './cifrado-credenciales.ts';

// Claves generadas en cada ejecución: ninguna clave escrita en el repo.
const K1 = randomBytes(32);
const K2 = randomBytes(32);
const conClave = (actual: Buffer | null, anterior: Buffer | null = null): ClavesCredenciales => ({ actual, anterior, malformada: false });
const CTX = contextoCredencial('estudio-a', 'gmail', 'refresh_token');

test('ida y vuelta: lo cifrado se descifra con su contexto', () => {
  const cifrado = cifrarCredencial('token-de-prueba', CTX, K1);
  assert.ok(estaCifrado(cifrado));
  assert.ok(!cifrado.includes('token-de-prueba'));
  assert.deepEqual(descifrarCredencial(cifrado, CTX, conClave(K1)), { ok: true, valor: 'token-de-prueba', enClaro: false });
});

test('cada cifrado lleva su propio IV: el mismo token nunca da el mismo texto', () => {
  assert.notEqual(cifrarCredencial('igual', CTX, K1), cifrarCredencial('igual', CTX, K1));
});

test('un bit cambiado no se descifra (ni devuelve basura)', () => {
  const cifrado = cifrarCredencial('token-de-prueba', CTX, K1);
  const [pre, kid, iv, cuerpo] = [cifrado.slice(0, 7), ...cifrado.slice(7).split(':')];
  const bytes = Buffer.from(cuerpo, 'base64url');
  bytes[0] ^= 1;
  const alterado = `${pre}${kid}:${iv}:${bytes.toString('base64url')}`;
  assert.deepEqual(descifrarCredencial(alterado, CTX, conClave(K1)), { ok: false, motivo: 'no-descifra' });
});

test('copiado a otro estudio o a otro campo no se descifra', () => {
  const cifrado = cifrarCredencial('token-de-prueba', CTX, K1);
  assert.equal(descifrarCredencial(cifrado, contextoCredencial('estudio-b', 'gmail', 'refresh_token'), conClave(K1)).ok, false);
  assert.equal(descifrarCredencial(cifrado, contextoCredencial('estudio-a', 'gmail', 'access_token'), conClave(K1)).ok, false);
  assert.equal(descifrarCredencial(cifrado, contextoCredencial('estudio-a', 'zoom', 'refresh_token'), conClave(K1)).ok, false);
});

test('lo guardado en claro de antes se lee tal cual, y dice que está en claro', () => {
  assert.deepEqual(descifrarCredencial('ya1.viejo', CTX, conClave(K1)), { ok: true, valor: 'ya1.viejo', enClaro: true });
  assert.deepEqual(descifrarCredencial('ya1.viejo', CTX, conClave(null)), { ok: true, valor: 'ya1.viejo', enClaro: true });
});

test('sin clave: se escribe en claro (avisando), y un valor cifrado NO se devuelve', () => {
  assert.deepEqual(paraGuardar('nuevo', CTX, conClave(null)), { valor: 'nuevo', enClaro: true });
  const cifrado = cifrarCredencial('token-de-prueba', CTX, K1);
  assert.deepEqual(descifrarCredencial(cifrado, CTX, conClave(null)), { ok: false, motivo: 'sin-clave' });
});

test('con clave, se escribe cifrado', () => {
  const r = paraGuardar('nuevo', CTX, conClave(K1));
  assert.equal(r.enClaro, false);
  assert.ok(estaCifrado(r.valor));
  assert.equal(descifrarCredencial(r.valor, CTX, conClave(K1)).ok, true);
});

test('rotación: lo cifrado con la anterior se sigue leyendo, y pide volver a cifrarse con la nueva', () => {
  const viejo = cifrarCredencial('token-de-prueba', CTX, K1);
  const tras = conClave(K2, K1);
  assert.deepEqual(descifrarCredencial(viejo, CTX, tras), { ok: true, valor: 'token-de-prueba', enClaro: false });
  assert.equal(pideCifrarse(viejo, tras), true);
  assert.equal(pideCifrarse(cifrarCredencial('x', CTX, K2), tras), false);
  // Con una clave que no es ninguna de las dos: no se adivina.
  assert.deepEqual(descifrarCredencial(viejo, CTX, conClave(K2)), { ok: false, motivo: 'clave-desconocida' });
});

test('pideCifrarse: en claro sí (si hay clave); sin clave, nunca', () => {
  assert.equal(pideCifrarse('en-claro', conClave(K1)), true);
  assert.equal(pideCifrarse('en-claro', conClave(null)), false);
});

test('la clave del entorno: 32 bytes en base64; otra longitud cuenta como mal puesta, no como clave', () => {
  const buena = clavesDelEntorno({ INTEGRACIONES_CLAVE_CIFRADO: K1.toString('base64') });
  assert.equal(buena.actual && idDeClave(buena.actual), idDeClave(K1));
  assert.equal(buena.malformada, false);
  const corta = clavesDelEntorno({ INTEGRACIONES_CLAVE_CIFRADO: randomBytes(16).toString('base64') });
  assert.equal(corta.actual, null);
  assert.equal(corta.malformada, true);
  assert.deepEqual(clavesDelEntorno({}), { actual: null, anterior: null, malformada: false });
});

test('formato roto: ok false, nunca una excepción', () => {
  assert.deepEqual(descifrarCredencial('enc:v1:solo-una-parte', CTX, conClave(K1)), { ok: false, motivo: 'formato' });
  assert.deepEqual(descifrarCredencial(`enc:v1:${idDeClave(K1)}:AA:AA`, CTX, conClave(K1)), { ok: false, motivo: 'formato' });
});

// Guardia estática: el cifrado solo sirve si NADIE lee o escribe la tabla por
// otro camino. Todo pasa por los dos ayudantes de lib/db/supabase-data-admin.ts.
test('integracion_credenciales solo se toca desde los ayudantes que cifran', () => {
  const raiz = join(import.meta.dirname, '..', '..');
  const ficheros: string[] = [];
  const recorrer = (dir: string) => {
    for (const nombre of readdirSync(dir)) {
      if (nombre === 'node_modules' || nombre.startsWith('.')) continue;
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (/\.(ts|tsx)$/.test(nombre) && !nombre.endsWith('.test.ts')) ficheros.push(ruta);
    }
  };
  for (const d of ['lib', 'app', 'components']) recorrer(join(raiz, d));
  const fuera = ficheros.filter(f => !f.endsWith(join('lib', 'db', 'supabase-data-admin.ts')) && f !== join(raiz, 'lib', 'db-types.ts'))
    .filter(f => readFileSync(f, 'utf8').includes("'integracion_credenciales'"));
  assert.deepEqual(fuera, [], 'nadie fuera de supabase-data-admin.ts lee ni escribe integracion_credenciales');

  const admin = readFileSync(join(raiz, 'lib', 'db', 'supabase-data-admin.ts'), 'utf8');
  const usos = admin.split('\n').filter(l => l.includes("from('integracion_credenciales')")).length;
  // leer, guardar, borrar y el barrido que cifra lo que quedó en claro.
  assert.equal(usos, 5, 'un .from() nuevo sobre la tabla tiene que pasar por leerCredencialesOAuth/guardarCredencialesOAuth');
});
