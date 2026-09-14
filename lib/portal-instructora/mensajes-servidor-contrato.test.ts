import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardia de contrato del chat de la instructora con sus alumnas
// (`mensajes-servidor.ts`). Va con service-role, así que la RLS no protege nada:
// cada acción sobre un hilo tiene que comprobar ANTES de leer o escribir que es
// suyo, y abrir uno exige que la socia sea su alumna. Si falla, se arregla el
// código, no la guardia.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');
const SERVIDOR = readFileSync(join(RAIZ, 'lib/portal-instructora/mensajes-servidor.ts'), 'utf8');
const RUTA = readFileSync(join(RAIZ, 'app/api/portal/instructora/mensajes/route.ts'), 'utf8');

function cuerpoDe(firma: string): string {
  const inicio = SERVIDOR.indexOf(firma);
  assert.ok(inicio >= 0, `falta ${firma}`);
  const fin = SERVIDOR.indexOf('\n}\n', inicio);
  return SERVIDOR.slice(inicio, fin < 0 ? undefined : fin);
}

test('esHiloSuyo: mismo estudio, tipo instructora–alumna y ella como parte STAFF', () => {
  const c = cuerpoDe('async function esHiloSuyo');
  assert.match(c, /\.eq\('studio_id', p\.studioId\)/);
  assert.match(c, /\.eq\('tipo', TIPO\)/);
  assert.match(c, /\.eq\('auth_user_id', p\.userId\)/);
  assert.match(c, /\.eq\('rol_en_conversacion', 'STAFF'\)/);
  assert.match(SERVIDOR, /const TIPO = 'ALUMNA_INSTRUCTORA';/);
});

test('leer, enviar y marcar leído comprueban que el hilo es suyo antes de tocar la base', () => {
  for (const nombre of ['mensajesDeHilo', 'enviarEnHilo', 'marcarHiloLeido']) {
    const c = cuerpoDe(`export async function ${nombre}`);
    const guardia = c.indexOf('esHiloSuyo(');
    const base = c.search(/\.from\('(mensajes|conversacion_participantes)'\)/);
    assert.ok(guardia > 0, `${nombre}: no llama a esHiloSuyo`);
    assert.ok(base > guardia, `${nombre}: toca la base antes de comprobar el hilo`);
  }
});

test('la bandeja solo trae hilos de este estudio en los que ella es STAFF', () => {
  const c = cuerpoDe('export async function hilosDeInstructora');
  assert.match(c, /\.eq\('auth_user_id', p\.userId\)\.eq\('rol_en_conversacion', 'STAFF'\)/);
  assert.match(c, /\.eq\('studio_id', p\.studioId\)\.eq\('tipo', TIPO\)/);
  // De la alumna, nombre corto y foto: nada de contacto.
  assert.doesNotMatch(c, /email|telefono/);
});

test('abrir: la regla de alumna va antes de la RPC y con la instructora del token', () => {
  const c = cuerpoDe('export async function abrirHiloConAlumna');
  const regla = c.indexOf('instructoraAtiendeSocia(');
  const rpc = c.indexOf(".rpc('abrir_conversacion'");
  assert.ok(regla > 0 && rpc > regla, 'instructoraAtiendeSocia antes de abrir_conversacion');
  const borrada = c.indexOf(".is('borrado_en', null)");
  assert.ok(borrada > regla && rpc > borrada, 'una ficha borrada se descarta antes de la RPC');
  assert.match(c, /p_instructor_id: p\.instructorId/);
});

test('el aviso de un mensaje suyo no lleva el texto', () => {
  assert.match(cuerpoDe('export async function avisarMensajeNuevo'), /previsualizacion: previsualizacionParaAviso\(TIPO/);
});

test('la ruta saca estudio, instructora y remitente del token, nunca del body', () => {
  assert.match(RUTA, /verificarInstructoraEnEstudio\(req, body\.slug\)/);
  assert.match(RUTA, /studioId: sesion\.studioId, instructorId: sesion\.instructorId, userId: sesion\.userId/);
  assert.doesNotMatch(RUTA, /body\.(studioId|instructorId|userId)/);
});
