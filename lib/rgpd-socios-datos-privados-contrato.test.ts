import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { COLUMNAS_PRIVADAS_SOCIA } from './socios/datos-privados.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Guardián de contrato — datos privados de la socia (M1, auditoría RGPD).
//
// Las 12 columnas de `COLUMNAS_PRIVADAS_SOCIA` ni se LEEN ni se ESCRIBEN con la
// sesión del navegador: se leen por la RPC `socios_datos_privados()` y se
// escriben desde servidor. Si uno de estos tests falla, no se arregla quitándolo:
// se arregla la migración o el código.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const sinComentarios = (sql: string) => sql.replace(/--.*$/gm, '');
const columnas = (lista: string) => lista.split(',').map(c => c.trim().replace(/"/g, '')).filter(Boolean);

// Desde el cierre de M1 hacia delante: lo anterior concedía por diseño.
const CIERRE = '20260914080445';
const MIGRACIONES = readdirSync(join(RAIZ, 'supabase/migrations'))
  .filter(f => f.endsWith('.sql'))
  .sort();

test('ninguna migración posterior al cierre vuelve a conceder a authenticated una columna privada', () => {
  for (const f of MIGRACIONES.filter(f => f >= CIERRE)) {
    const sql = sinComentarios(leer(`supabase/migrations/${f}`));
    const re = /grant\s+([a-z,\s]+?)\s*\(([^)]*)\)\s*on\s+(?:table\s+)?(?:public\.)?socios\s+to\s+([^;]+);/gi;
    for (const m of sql.matchAll(re)) {
      if (!/\bauthenticated\b|\banon\b|\bpublic\b/i.test(m[3])) continue;
      for (const c of columnas(m[2])) {
        assert.ok(!(COLUMNAS_PRIVADAS_SOCIA as readonly string[]).includes(c), `${f} concede ${m[1].trim()} sobre la columna privada ${c}`);
      }
    }
    assert.doesNotMatch(sql, /grant\s+(?:all|select|update|insert)[a-z,\s]*\s+on\s+(?:table\s+)?(?:public\.)?socios\s+to\s+[^;]*\bauthenticated\b/i,
      `${f} concede privilegio de TABLA sobre socios: anularía los permisos por columna`);
  }
});

test('el UPDATE de las 12 columnas privadas está revocado a authenticated', () => {
  const revocadas = new Set<string>();
  for (const f of MIGRACIONES.filter(f => f >= CIERRE)) {
    const sql = sinComentarios(leer(`supabase/migrations/${f}`));
    for (const m of sql.matchAll(/revoke\s+update\s*\(([^)]*)\)\s*on\s+(?:public\.)?socios\s+from\s+[^;]*\bauthenticated\b/gi)) {
      for (const c of columnas(m[1])) revocadas.add(c);
    }
  }
  for (const c of COLUMNAS_PRIVADAS_SOCIA) assert.ok(revocadas.has(c), `falta revocar el UPDATE de ${c}`);
});

const PAGO = [
  'stripe_customer_id', 'stripe_payment_method_id', 'sepa_mandate_id', 'sepa_payment_method_id',
  'tarjeta_marca', 'tarjeta_ultimos4', 'tarjeta_exp_mes', 'tarjeta_exp_anio',
];

test('pago, tarjeta y SEPA tampoco se dan de alta desde el navegador', () => {
  const revocadas = new Set<string>();
  for (const f of MIGRACIONES.filter(f => f >= CIERRE)) {
    const sql = sinComentarios(leer(`supabase/migrations/${f}`));
    for (const m of sql.matchAll(/revoke\s+insert\s*\(([^)]*)\)\s*on\s+(?:public\.)?socios\s+from\s+[^;]*\bauthenticated\b/gi)) {
      for (const c of columnas(m[1])) revocadas.add(c);
    }
  }
  for (const c of PAGO) assert.ok(revocadas.has(c), `falta revocar el INSERT de ${c}`);

  const src = leer('lib/supabase-data.ts');
  const inicio = src.indexOf('function socioToDb(');
  const cuerpo = src.slice(inicio, src.indexOf('\n}\n', inicio));
  assert.ok(inicio >= 0 && cuerpo.length > 0);
  for (const c of PAGO) assert.doesNotMatch(cuerpo, new RegExp(String.raw`\b${c}\s*:`), `socioToDb manda ${c} en el alta`);
});

test('el NIF lo escribe el servidor, con el permiso de datos privados y acotado al estudio de la sesión', () => {
  const ruta = sinComentarios(leer('app/api/socios/[id]/nif/route.ts'));
  assert.match(ruta, /verificarSesionStaff\(req\)/);
  assert.match(ruta, /puedeVerDatosPrivadosSocia\(sesion\.rol\)/);
  assert.match(ruta, /\.eq\('studio_id',\s*sesion\.studioId\)/);
  assert.match(ruta, /\.is\('borrado_en',\s*null\)/);
});

test('dbUpdateSocio no manda columnas privadas con la sesión del navegador', () => {
  const src = leer('lib/supabase-data.ts');
  const inicio = src.indexOf('export async function dbUpdateSocio');
  const cuerpo = src.slice(inicio, src.indexOf('\n}\n', inicio));
  assert.ok(inicio >= 0 && cuerpo.length > 0);
  for (const c of COLUMNAS_PRIVADAS_SOCIA) {
    assert.doesNotMatch(cuerpo, new RegExp(String.raw`db\.${c}\s*=`), `dbUpdateSocio escribe ${c} desde el navegador`);
  }
  assert.match(cuerpo, /CAMPOS_PRIVADOS_SOCIO\.filter/);
  assert.match(cuerpo, /dbGuardarNifSocio\(/);
});
