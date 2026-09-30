import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { cifrarCredencial, estaCifrado, type ClavesCredenciales } from './cifrado-credenciales.ts';
import {
  cifrarConfigIntegracion, configPideCifrarse, contextoConfigIntegracion, descifrarConfigIntegracion,
} from './config-cifrada.ts';

const K1 = randomBytes(32);
const K2 = randomBytes(32);
const claves = (actual: Buffer | null, anterior: Buffer | null = null): ClavesCredenciales => ({ actual, anterior, malformada: false });

test('solo se cifran los secretos: el resto de la config sigue legible', () => {
  const { config, enClaro } = cifrarConfigIntegracion('est-a', 'KISI', { apiKey: 'kisi-de-prueba', lockId: '12345' }, claves(K1));
  assert.equal(enClaro, false);
  assert.ok(estaCifrado(config.apiKey));
  assert.equal(config.lockId, '12345');
  assert.deepEqual(descifrarConfigIntegracion('est-a', 'KISI', config, claves(K1)), {
    config: { apiKey: 'kisi-de-prueba', lockId: '12345' }, fallidos: [],
  });
});

test('WhatsApp: el token se cifra y phoneId no', () => {
  const { config } = cifrarConfigIntegracion('est-a', 'WHATSAPP', { token: 't-de-prueba', phoneId: '999' }, claves(K1));
  assert.ok(estaCifrado(config.token));
  assert.equal(config.phoneId, '999');
});

test('sin clave: se guarda como llega, y lo dice', () => {
  const r = cifrarConfigIntegracion('est-a', 'MAILCHIMP', { apiKey: 'mc-de-prueba', audienceId: 'a1' }, claves(null));
  assert.deepEqual(r, { config: { apiKey: 'mc-de-prueba', audienceId: 'a1' }, enClaro: true });
  // Una config sin secretos no está «en claro» de nada.
  assert.equal(cifrarConfigIntegracion('est-a', 'RESEND', { fromName: 'Estudio' }, claves(null)).enClaro, false);
});

test('lo guardado en claro de antes se lee igual', () => {
  assert.deepEqual(descifrarConfigIntegracion('est-a', 'KISI', { apiKey: 'viejo' }, claves(K1)).config, { apiKey: 'viejo' });
});

test('un secreto que no se descifra desaparece (ni cifrado ni vacío) y se avisa', () => {
  const ajeno = cifrarCredencial('t', contextoConfigIntegracion('est-B', 'WHATSAPP', 'token'), K1);
  const r = descifrarConfigIntegracion('est-a', 'WHATSAPP', { token: ajeno, phoneId: '999' }, claves(K1));
  assert.deepEqual(r, { config: { phoneId: '999' }, fallidos: ['token'] });
  const sinClave = descifrarConfigIntegracion('est-a', 'KISI', cifrarConfigIntegracion('est-a', 'KISI', { apiKey: 'x' }, claves(K1)).config, claves(null));
  assert.deepEqual(sinClave, { config: {}, fallidos: ['apiKey'] });
});

test('el mismo valor cifrado no vale en otra integración ni en otro campo', () => {
  const { config } = cifrarConfigIntegracion('est-a', 'KISI', { apiKey: 'x' }, claves(K1));
  assert.deepEqual(descifrarConfigIntegracion('est-a', 'MAILCHIMP', config, claves(K1)).fallidos, ['apiKey']);
  assert.deepEqual(descifrarConfigIntegracion('est-a', 'WHATSAPP', { token: config.apiKey }, claves(K1)).fallidos, ['token']);
});

test('volver a guardar no cifra dos veces; tras rotar la clave, se recifra con la nueva', () => {
  const una = cifrarConfigIntegracion('est-a', 'KISI', { apiKey: 'x' }, claves(K1)).config;
  assert.equal(cifrarConfigIntegracion('est-a', 'KISI', una, claves(K1)).config.apiKey, una.apiKey);
  assert.equal(configPideCifrarse(una, claves(K2, K1)), true);
  const rotada = cifrarConfigIntegracion('est-a', 'KISI', una, claves(K2, K1)).config;
  assert.equal(configPideCifrarse(rotada, claves(K2, K1)), false);
  assert.deepEqual(descifrarConfigIntegracion('est-a', 'KISI', rotada, claves(K2)).config, { apiKey: 'x' });
});

test('configPideCifrarse: en claro sí; sin secretos o sin clave, no', () => {
  assert.equal(configPideCifrarse({ apiKey: 'x' }, claves(K1)), true);
  assert.equal(configPideCifrarse({ fromName: 'Estudio' }, claves(K1)), false);
  assert.equal(configPideCifrarse({ apiKey: 'x' }, claves(null)), false);
  assert.equal(configPideCifrarse(null, claves(K1)), false);
});

// ── Guardias: el cifrado solo sirve si nadie escribe ni lee la tabla por otro camino ──

const RAIZ = join(import.meta.dirname, '..', '..');
function ficherosDeCodigo(): string[] {
  const salida: string[] = [];
  const recorrer = (dir: string) => {
    for (const nombre of readdirSync(dir)) {
      if (nombre === 'node_modules' || nombre.startsWith('.')) continue;
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) recorrer(ruta);
      else if (/\.(ts|tsx)$/.test(nombre) && !nombre.endsWith('.test.ts')) salida.push(ruta);
    }
  };
  for (const d of ['lib', 'app', 'components']) recorrer(join(RAIZ, d));
  return salida;
}
/** Cada `.from('integraciones')` con lo que le sigue hasta el final de la sentencia. */
function sentencias(codigo: string): string[] {
  const salida: string[] = [];
  let i = codigo.indexOf("from('integraciones')");
  while (i !== -1) {
    const fin = codigo.indexOf(';', i);
    salida.push(codigo.slice(i, fin === -1 ? i + 400 : Math.min(fin, i + 400)));
    i = codigo.indexOf("from('integraciones')", i + 1);
  }
  return salida;
}

test('integraciones solo la escribe el servidor, desde supabase-data-admin.ts (y la salud, desde registrar-salud.ts)', () => {
  const malos: string[] = [];
  for (const f of ficherosDeCodigo()) {
    const rel = relative(RAIZ, f);
    for (const s of sentencias(readFileSync(f, 'utf8'))) {
      const escribe = /\.(upsert|insert|delete)\(/.test(s) || (/\.update\(/.test(s) && rel !== join('lib', 'integraciones', 'registrar-salud.ts'));
      if (escribe && rel !== join('lib', 'db', 'supabase-data-admin.ts')) malos.push(rel);
    }
  }
  assert.deepEqual(malos, []);
});

test('quien lee `config` de la tabla la descifra', () => {
  const malos: string[] = [];
  for (const f of ficherosDeCodigo()) {
    const codigo = readFileSync(f, 'utf8');
    const leeConfig = sentencias(codigo).some(s => /select\([^)]*config/.test(s));
    if (leeConfig && !/descifrarConfig(DeFila|Integracion)\(/.test(codigo)) malos.push(relative(RAIZ, f));
  }
  assert.deepEqual(malos, []);
});

test('el panel no pide `config` al arrancar (ni puede escribirla)', () => {
  const cliente = readFileSync(join(RAIZ, 'lib', 'supabase-data.ts'), 'utf8');
  for (const s of sentencias(cliente)) {
    assert.doesNotMatch(s, /config/, 'el arranque del panel no trae los secretos');
    assert.doesNotMatch(s, /\.(upsert|insert|update|delete)\(/);
  }
});
