import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardián de la nota de sesión desde la app (15-sep-2026).
//
// Es dato de salud escrito con service-role: la RLS de `notas_progreso` no actúa
// (solo deja a la propietaria), así que lo que la hace segura son las
// condiciones de `guardarNotaDeSesion`. Los e2e mockean la ruta, así que nada
// avisaría si un refactor las quitara. Se fijan aquí contra el código.
//
// Si esto falla, no se relaja el test: se vuelve a poner la condición.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '../..');
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const servidor = sinComentarios(readFileSync(join(RAIZ, 'lib/portal-instructora/alumnas-servidor.ts'), 'utf8'));
const ruta = sinComentarios(readFileSync(join(RAIZ, 'app/api/portal/instructora/alumnas/route.ts'), 'utf8'));

const inicio = servidor.indexOf('export async function guardarNotaDeSesion');
const guardar = servidor.slice(inicio, servidor.indexOf('\nconst MAX_NOTAS', inicio));

test('existe y se encuentra el cuerpo de guardarNotaDeSesion', () => {
  assert.ok(inicio >= 0 && guardar.length > 200);
});

test('solo sobre SU alumna: la misma regla que para leer su salud, antes de escribir', () => {
  const regla = guardar.indexOf('instructoraAtiendeSocia(filas, p.instructorId, ahora)');
  const insert = guardar.indexOf(".from('notas_progreso').insert(");
  assert.ok(guardar.includes('filasDeSociaConInstructora(admin, p.studioId, p.instructorId, p.socioId, ahora)'));
  assert.ok(regla > 0 && regla < insert, 'se comprueba que es su alumna antes del insert');
});

test('sin consentimiento de salud vigente no se guarda', () => {
  const consentimiento = guardar.indexOf("if (consentimiento !== 'VIGENTE') return 'SIN_CONSENTIMIENTO';");
  assert.ok(consentimiento > 0 && consentimiento < guardar.indexOf(".from('notas_progreso').insert("));
});

test('la clase elegida es suya, con reserva de esta alumna y en la ventana', () => {
  assert.match(guardar, /\.eq\('instructor_id', p\.instructorId\)/);
  assert.match(guardar, /\.eq\('socio_id', p\.socioId\)\.eq\('sesion_id', p\.nota\.sesionId\)/);
  assert.match(guardar, /\.neq\('estado', 'CANCELADA'\)/);
  assert.match(guardar, /dentroDeVentanaAlumna\(sesion\.inicio, ahora\)/);
});

test('estudio, alumna y autora salen del token, nunca del cuerpo', () => {
  assert.match(guardar, /studio_id: p\.studioId,/);
  assert.match(guardar, /socio_id: p\.socioId,/);
  assert.match(guardar, /instructor_id: p\.instructorId,/);
  assert.doesNotMatch(guardar, /p\.nota\.(studioId|socioId|instructorId|creadaEn)/);
});

test('solo añade: ni edita ni borra notas', () => {
  assert.doesNotMatch(guardar, /\.(update|upsert|delete)\(/);
});

test('la ruta valida con la lista blanca, limita por instructora y pasa la sesión del token', () => {
  assert.match(ruta, /leerNotaDeSesion\(body\.nota\)/);
  assert.match(ruta, /rateLimit\(`portal-instructora-nota:\$\{sesion\.instructorId\}`/);
  assert.match(ruta, /guardarNotaDeSesion\(\{ \.\.\.suya, socioId: socioId as string, nota: lectura\.nota \}\)/);
  assert.match(ruta, /const suya = \{ studioId: sesion\.studioId, instructorId: sesion\.instructorId \};/);
});
