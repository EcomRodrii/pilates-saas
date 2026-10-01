import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  HORAS_RETENCION, SEGUNDOS_EN_CURSO_MAXIMO, credencialDeIdempotencia, decidirConClaveUsada, huellaPeticion,
  leerClaveIdempotencia, seGuarda, type FilaIdempotencia,
} from './idempotencia.ts';

const ahora = new Date('2026-10-01T12:00:00Z');
const hace = (ms: number) => new Date(ahora.getTime() - ms).toISOString();
const H = huellaPeticion('/api/v1/clientas', '{"nombre":"Ana"}');
const fila = (o: Partial<FilaIdempotencia> = {}): FilaIdempotencia => ({
  huella: H, estado: 'COMPLETADA', status_http: 201, respuesta: { id: 'soc-1' }, creado_en: hace(60_000), ...o,
});

test('la clave: opcional, ASCII visible de 1 a 255', () => {
  assert.equal(leerClaveIdempotencia(null), null);
  assert.equal(leerClaveIdempotencia(undefined), null);
  assert.equal(leerClaveIdempotencia('a1b2-c3d4_e5'), 'a1b2-c3d4_e5');
  assert.equal(leerClaveIdempotencia('  con-espacios-fuera  '), 'con-espacios-fuera');
  for (const mala of ['', '   ', 'con espacio', 'ñandú', 'x'.repeat(256), 'tab\there']) {
    assert.equal(leerClaveIdempotencia(mala), 'invalida', JSON.stringify(mala));
  }
});

test('la huella distingue ruta y cuerpo, y no depende de nada más', () => {
  assert.equal(huellaPeticion('/api/v1/clientas', '{"nombre":"Ana"}'), H);
  assert.notEqual(huellaPeticion('/api/v1/clientas', '{"nombre":"Eva"}'), H);
  assert.notEqual(huellaPeticion('/api/v1/notas', '{"nombre":"Ana"}'), H);
  assert.match(H, /^[0-9a-f]{64}$/);
});

test('con OAuth la clave es de la app, no del token (cambia cada hora)', () => {
  assert.equal(credencialDeIdempotencia({ tipo: 'oauth', clienteId: 'zapier' }), 'app:zapier');
  assert.equal(credencialDeIdempotencia({ tipo: 'clave', claveId: 'apik-1' }), 'clave:apik-1');
});

test('misma clave y misma petición: la respuesta guardada, sin ejecutar nada', () => {
  assert.deepEqual(decidirConClaveUsada(fila(), H, ahora), { tipo: 'repetir', status: 201, cuerpo: { id: 'soc-1' } });
  // También un 4xx se repite: la petición no va a cambiar de respuesta.
  assert.deepEqual(decidirConClaveUsada(fila({ status_http: 409, respuesta: { error: 'x' } }), H, ahora), { tipo: 'repetir', status: 409, cuerpo: { error: 'x' } });
});

test('misma clave con otra petición: conflicto', () => {
  assert.deepEqual(decidirConClaveUsada(fila(), huellaPeticion('/api/v1/clientas', '{"nombre":"Eva"}'), ahora), { tipo: 'conflicto' });
});

test('la primera sigue en marcha: «en curso»; si lleva demasiado, se dio por perdida', () => {
  assert.deepEqual(decidirConClaveUsada(fila({ estado: 'EN_CURSO', status_http: null, creado_en: hace(5_000) }), H, ahora), { tipo: 'en_curso' });
  assert.deepEqual(
    decidirConClaveUsada(fila({ estado: 'EN_CURSO', status_http: null, creado_en: hace(SEGUNDOS_EN_CURSO_MAXIMO * 1000) }), H, ahora),
    { tipo: 'reemplazar' },
  );
});

test(`pasadas ${HORAS_RETENCION} h la clave vale como nueva, aunque la petición sea otra`, () => {
  const vieja = fila({ creado_en: hace(HORAS_RETENCION * 3_600_000) });
  assert.deepEqual(decidirConClaveUsada(vieja, H, ahora), { tipo: 'reemplazar' });
  assert.deepEqual(decidirConClaveUsada(vieja, 'otra', ahora), { tipo: 'reemplazar' });
});

test('un 5xx no se guarda: el reintento tiene que volver a ejecutarse', () => {
  assert.equal(seGuarda(201), true);
  assert.equal(seGuarda(400), true);
  assert.equal(seGuarda(500), false);
  assert.equal(seGuarda(503), false);
});

const RAIZ = join(import.meta.dirname, '..', '..');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('la puerta única la aplica a todos los POST: antes del handler la aparta y después la cierra', () => {
  const src = sinComentarios(readFileSync(join(RAIZ, 'lib/api-publica/servidor.ts'), 'utf8'));
  const cuerpo = src.slice(src.indexOf('export async function conApiPublica'));
  const iReservar = cuerpo.indexOf('reservarIdempotencia(admin');
  const iHandler = cuerpo.indexOf('await handler(ctx, admin)');
  const iCerrar = cuerpo.indexOf('cerrarIdempotencia(admin');
  assert.ok(iReservar > 0 && iHandler > iReservar && iCerrar > iHandler, 'orden: apartar → handler → cerrar');
  assert.match(cuerpo, /if \(req\.method === 'POST'\)/);
  // El cuerpo se lee de una copia: el handler lo vuelve a leer con req.json().
  assert.match(cuerpo, /req\.clone\(\)\.text\(\)/);
});

test('la tabla es solo de servidor y se limpia cada hora', () => {
  const m = readdirSync(join(RAIZ, 'supabase/migrations')).find((n) => n.endsWith('_api_idempotencia.sql'));
  assert.ok(m, 'falta la migración de api_idempotencia');
  const sql = readFileSync(join(RAIZ, 'supabase/migrations', m!), 'utf8');
  assert.match(sql, /primary key \(studio_id, credencial, clave\)/);
  assert.match(sql, /revoke all on table public\.api_idempotencia from public, anon, authenticated/);
  assert.match(sql, /'api-idempotencia-purgar',\s*'17 \* \* \* \*',\s*\$\$delete from public\.api_idempotencia where creado_en < now\(\) - interval '24 hours'\$\$/);
});

test('la especificación OpenAPI ofrece la cabecera en cada POST', async () => {
  const { RUTAS } = await import('./openapi.ts');
  const posts = Object.entries(RUTAS).filter(([, r]) => (r as Record<string, unknown>).post);
  assert.ok(posts.length >= 5);
  for (const [ruta, r] of posts) {
    const params = ((r as { post: { parameters?: Array<{ name: string }> } }).post.parameters ?? []).map((p) => p.name);
    assert.ok(params.includes('Idempotency-Key'), `${ruta}: POST sin Idempotency-Key en la especificación`);
  }
});
