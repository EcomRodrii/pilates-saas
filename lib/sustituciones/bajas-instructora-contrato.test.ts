import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardia de contrato: el motivo de una baja que pide la instructora.
//
// Ese texto lo escribe ella y a veces habla de su salud. Hasta 14-sep-2026 vivía
// en `sustituciones.motivo`, que lee también recepción. Ahora vive en
// `bajas_instructora`, solo servidor, y lo leen quien gestiona el equipo y, de lo
// suyo, ella (sin el motivo). Si uno de estos falla, no se quita: se arregla el
// código que ha vuelto a abrir la puerta.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*(--|\/\/).*$/gm, '');

test('la tabla es solo de servidor: RLS sin políticas y sin privilegios para anon ni authenticated', () => {
  const nombre = readdirSync(join(RAIZ, 'supabase/migrations')).find((n) => n.endsWith('_bajas_instructora.sql'));
  assert.ok(nombre, 'falta la migración *_bajas_instructora.sql');
  const sql = sinComentarios(leer(`supabase/migrations/${nombre}`)).toLowerCase();
  assert.match(sql, /alter table public\.bajas_instructora enable row level security/);
  assert.match(sql, /revoke all on table public\.bajas_instructora from anon/);
  assert.match(sql, /revoke all on table public\.bajas_instructora from authenticated/);
  assert.doesNotMatch(sql, /create policy/);
  assert.doesNotMatch(sql, /grant [^;]*bajas_instructora[^;]* to (anon|authenticated|public)/);
});

test('crearBaja no escribe el motivo de la instructora en sustituciones', () => {
  const src = sinComentarios(leer('lib/sustituciones/baja.ts'));
  assert.match(src, /motivo: origen === 'instructora' \? null : motivo/);
  assert.match(src, /from\('bajas_instructora'\)\.insert\(/);
});

test('la agenda de la instructora lee solo su revisión: acotada a ella y sin el motivo', () => {
  const src = sinComentarios(leer('lib/portal-instructora/agenda-servidor.ts'));
  const consulta = src.slice(src.indexOf("from('bajas_instructora')"));
  assert.ok(consulta.length > 0);
  const hasta = consulta.slice(0, consulta.indexOf(':'));
  assert.doesNotMatch(hasta, /motivo|categoria|\*/);
  assert.match(hasta, /\.eq\('studio_id', p\.studioId\)\.eq\('instructor_id', p\.instructorId\)/);
});

test('el panel solo enseña el motivo a quien gestiona el equipo', () => {
  const src = sinComentarios(leer('app/api/sustituciones/route.ts'));
  assert.match(src, /puedeGestionarEquipo\(sesion\.rol\)\s*\?\s*await motivosDeInstructora\(/);
  assert.equal(src.match(/from\('bajas_instructora'\)/g)?.length, 1);
});

test('la ruta de la app limita por IP antes de verificar y por instructora después', () => {
  const src = sinComentarios(leer('app/api/portal/instructora/baja/route.ts'));
  const ip = src.indexOf("enforceRateLimit(req, 'portal-instructora-baja-ip'");
  const verificar = src.indexOf('verificarInstructoraEnEstudio(req');
  const instructora = src.indexOf('rateLimit(`portal-instructora-baja:${sesion.instructorId}`');
  assert.ok(ip >= 0 && verificar > ip, 'el límite por IP va antes de verificar el token');
  assert.ok(instructora > verificar, 'el límite por instructora va después de verificarla');
});

test('el calendario del panel solo devuelve el motivo de una baja a quien gestiona el equipo', () => {
  const src = sinComentarios(leer('app/api/calendario/route.ts'));
  assert.match(src, /const verMotivo = puedeGestionarEquipo\(sesion\.rol\)/);
  assert.match(src, /verMotivo \? s : \{ \.\.\.s, motivo: null \}/);
  assert.match(src, /enriquecerSesiones\([^)]*\), sustitucionesVisibles\)/);
  assert.doesNotMatch(src, /\(sustitucionesRows \?\? \[\]\) as SustitucionRow\[\]/);
});
