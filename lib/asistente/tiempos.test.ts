import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cronometro } from './tiempos.ts';

test('cronometro: cada fase mide desde la anterior; los hitos, desde el inicio y solo la primera vez', () => {
  let t = 1000;
  const c = cronometro(() => t);
  t = 1012; c.marcar('auth');
  t = 1100; c.marcar('carga');
  t = 1900; c.hito('primerEvento');
  t = 2500; c.hito('primerEvento');
  assert.equal(c.cabecera(), 'auth;dur=12, carga;dur=88');
  assert.deepEqual(c.resumen(), { fases: { auth: 12, carga: 88 }, hitos: { primerEvento: 900 }, totalMs: 1500 });
});

test('cronometro: un nombre raro no rompe la cabecera Server-Timing (ni cuela texto)', () => {
  const c = cronometro(() => 0);
  c.marcar('con espacio, y coma');
  c.hito('a;b');
  assert.equal(c.cabecera(), '');
  assert.deepEqual(c.resumen().hitos, {});
});

test('la ruta mide sus fases y no espera en serie lo que puede ir a la vez', () => {
  const ruta = readFileSync(join(import.meta.dirname, '..', '..', 'app/api/asistente/route.ts'), 'utf8');
  assert.match(ruta, /'Server-Timing': tiempos\.cabecera\(\)/);
  assert.match(ruta, /console\.info\('\[asistente\] tiempos'/);
  // La lista de personas y la conversación se cargan a la vez, no una detrás de otra.
  assert.match(ruta, /Promise\.all\(\[\s*personasDelEstudio\(admin, sesion\),\s*conversacionId \? cargarConversacion/);
  // El registro de tiempos no lleva texto de la pregunta ni de la respuesta.
  const registro = ruta.slice(ruta.indexOf("console.info('[asistente] tiempos'"), ruta.indexOf("console.info('[asistente] tiempos'") + 300);
  assert.doesNotMatch(registro, /pregunta|texto|marcada/);
});
