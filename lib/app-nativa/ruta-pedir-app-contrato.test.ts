import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Guardianes de `/api/estudio/app-movil` y `/api/interno/apps-estudio` («Pedir mi app»). Pocas
// líneas que un refactor puede quitar sin que ningún e2e lo note (los e2e mockean las rutas).
// Si falla, no se relaja el test: se vuelve a poner la condición.

const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const leer = (r: string) => sinComentarios(readFileSync(new URL(r, import.meta.url), 'utf8'));
const estudio = leer('../../app/api/estudio/app-movil/route.ts');
const interno = leer('../../app/api/interno/apps-estudio/route.ts');

test('estudio: sesión → interruptor → sede → límite, antes de tocar la base de datos', () => {
  const pos = (s: string) => { const i = estudio.indexOf(s); assert.ok(i > 0, `falta «${s}»`); return i; };
  const orden = [
    pos('verificarSesionStaff(req)'),
    pos('pedirAppEncendido(sesion.studioId)'),
    pos("searchParams.get('estudio') !== sesion.studioId"),
    pos('enforceRateLimit('),
    pos('getSupabaseAdmin()'),
  ];
  assert.deepEqual([...orden].sort((a, b) => a - b), orden);
});

test('estudio: pedirla es solo de la propietaria y con un plan que la incluye, comprobado en el servidor', () => {
  const post = estudio.slice(estudio.indexOf('export async function POST'));
  assert.match(post, /sesion\.rol !== 'PROPIETARIO'/);
  assert.match(post, /tieneFeature\(\{ plan: estudio\.plan as string \| null, subscriptionStatus: estudio\.subscription_status as string \| null \}, 'appPropia'\)/);
  // Y ANTES de insertar.
  assert.ok(post.indexOf("'appPropia'") < post.indexOf(".insert("));
  assert.ok(post.indexOf("sesion.rol !== 'PROPIETARIO'") < post.indexOf('req.json()'));
  assert.match(post, /status: 403/);
});

test('estudio: el estudio sale de la sesión, nunca del body; nace PEDIDA y SIN activar', () => {
  assert.doesNotMatch(estudio, /body\.(studio|estudio)|studioId\s*[:=]\s*\(?body/i);
  assert.match(estudio, /studio_id: sesion\.studioId/);
  assert.match(estudio, /activa: false, estado: 'PEDIDA'/);
  // La nota interna y `activa` no se leen para devolverlas al estudio.
  assert.doesNotMatch(estudio, /nota_interna/);
  assert.doesNotMatch(estudio, /select\([^)]*\bactiva\b/);
});

test('estudio: no usa lista de planes a mano', () => {
  assert.doesNotMatch(estudio, /'ESTUDIO'|'CADENA'|'BASE'/);
});

test('interno: leer exige studios.read, escribir studios.update y se audita', () => {
  assert.match(interno, /exigirPermiso\(req, 'studios\.read'\)/);
  assert.match(interno, /exigirPermiso\(req, 'studios\.update'\)/);
  assert.match(interno, /registrar\(db, req,/);
  // Valida antes de escribir, y escribe solo las columnas del cambio.
  assert.ok(interno.indexOf('leerCambio(') < interno.indexOf('.update(columnas)'));
  assert.match(interno, /\.update\(columnas\)\.eq\('studio_id', studioId\)/);
});

test('la pantalla manda la sede que tiene delante', () => {
  const cliente = leer('../../components/apariencia/mi-app-de-tienda.tsx');
  assert.match(cliente, /\/api\/estudio\/app-movil\?estudio=\$\{encodeURIComponent\(studioId\)\}/);
  // No decide nada por su cuenta: la plantilla de planes viene del catálogo.
  assert.match(cliente, /PLAN_ENTITLEMENTS\[p\]\.features\.appPropia/);
});

test('estudio: primero pide un hueco del lote (tolerante), y lo pide DESPUÉS de las puertas', () => {
  const post = estudio.slice(estudio.indexOf('export async function POST'));
  assert.match(estudio, /admin\.rpc\('asignar_cupo_app', \{ p_studio_id: studioId \}\)/);
  assert.ok(post.indexOf("'appPropia'") < post.indexOf('cupoDelLote('), 'el hueco se gasta solo con un plan que la incluye');
  assert.ok(post.indexOf('cupoDelLote(') < post.indexOf('.insert('));
  // Si la función no existe o falla, se sigue con el slug: no rompe la petición.
  const helper = estudio.slice(estudio.indexOf('async function cupoDelLote'), estudio.indexOf('async function contexto'));
  assert.match(helper, /if \(error\) \{[\s\S]*return null;/);
});
