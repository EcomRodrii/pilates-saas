import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROMPT_SISTEMA, contextoDelDia } from './prompt.ts';
import { aHerramientasAnthropic, herramientasDelRol, HERRAMIENTAS_DEL_ASISTENTE } from './herramientas/definiciones.ts';

test('el prompt es una constante: sin fechas, sin estudio y sin nada que cambie entre peticiones', () => {
  const src = readFileSync(new URL('./prompt.ts', import.meta.url), 'utf8');
  const constante = src.slice(src.indexOf('export const PROMPT_SISTEMA'), src.indexOf('export function contextoDelDia'));
  assert.ok(constante.length > 0);
  for (const prohibido of [/new Date/, /Date\.now/, /\bnow\(/, /hoyEnEstudio/, /studioId/, /studio_id/, /\bstudio\b/]) {
    assert.doesNotMatch(constante, prohibido);
  }
  // Ni rastro de un dato del día.
  assert.doesNotMatch(PROMPT_SISTEMA, /20\d\d-\d\d-\d\d/);
});

test('la fecha va DESPUÉS del punto de caché, en contextoDelDia, y solo la fecha', () => {
  assert.equal(contextoDelDia({ hoy: '2026-10-05', rol: 'PROPIETARIO' }), 'Hoy es lunes 5 de octubre de 2026 (2026-10-05), hora de Madrid. Hablas con la propietaria del estudio.');
  assert.match(contextoDelDia({ hoy: '2026-10-05', rol: 'MANAGER' }), /gerente.*No ve el dinero/);
});

test('las herramientas se serializan igual cada vez y en el mismo orden (si no, la caché no sirve)', () => {
  const a = JSON.stringify(aHerramientasAnthropic(herramientasDelRol('PROPIETARIO')));
  const b = JSON.stringify(aHerramientasAnthropic(herramientasDelRol('PROPIETARIO')));
  assert.equal(a, b);
  assert.deepEqual(aHerramientasAnthropic(herramientasDelRol('PROPIETARIO')).map(t => t.name)[0], 'resumen_del_estudio');
  for (const t of aHerramientasAnthropic(herramientasDelRol('PROPIETARIO'))) assert.equal(t.strict, true);
});

// Haiku 4.5 no cachea un prefijo de menos de 4.096 tokens, y no avisa. La medida
// buena es `node scripts/asistente-contar-prefijo.mjs` (countTokens, gratis);
// esto es una cota BAJA sin red (4 caracteres por token: en castellano y en
// JSON salen más tokens que eso), para que un recorte del prompt no lo baje sin
// que nadie se entere.
test('el prefijo cacheable (herramientas + prompt) pasa de 4.096 tokens también para la gerente', () => {
  for (const rol of ['PROPIETARIO', 'MANAGER'] as const) {
    const chars = JSON.stringify(aHerramientasAnthropic(herramientasDelRol(rol))).length + PROMPT_SISTEMA.length;
    assert.ok(chars / 4 > 4096, `${rol}: ~${Math.round(chars / 4)} tokens (cota baja)`);
  }
});

test('al modelo se le enseña UN solo juego de herramientas, el mismo para propietaria y gerente (una sola caché)', () => {
  assert.equal(HERRAMIENTAS_DEL_ASISTENTE.length, 12);
  assert.equal(JSON.stringify(HERRAMIENTAS_DEL_ASISTENTE), JSON.stringify(aHerramientasAnthropic(herramientasDelRol('PROPIETARIO'))));
  const chars = JSON.stringify(HERRAMIENTAS_DEL_ASISTENTE).length + PROMPT_SISTEMA.length;
  assert.ok(chars / 4 > 4096, `~${Math.round(chars / 4)} tokens (cota baja)`);
  const ruta = readFileSync(join(import.meta.dirname, '..', '..', 'app/api/asistente/route.ts'), 'utf8');
  assert.match(ruta, /herramientas: \[\.\.\.HERRAMIENTAS_DEL_ASISTENTE\]/);
  assert.doesNotMatch(ruta, /herramientasDelRol/, 'Un juego por rol son dos prefijos de caché: la puerta por rol es ejecutarHerramienta.');
  // El prefijo con TTL de una hora, antes del punto de 5 minutos del historial.
  assert.match(ruta, /text: PROMPT_SISTEMA, cache_control: \{ type: 'ephemeral', ttl: '1h' \}/);
});
