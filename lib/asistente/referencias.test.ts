import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marcarPersonasEnPregunta, tablaReferencias, type PersonaDelEstudio, refDeQuienEscribe } from './referencias.ts';

// Fixtures inventadas (repo público: nada de datos reales).
const PERSONAS: PersonaDelEstudio[] = [
  { tipo: 'socia', id: 'so-1', nombre: 'Lucía', apellidos: 'Ferrándiz Olmo' },
  { tipo: 'socia', id: 'so-2', nombre: 'Ana', apellidos: 'Quintero' },
  { tipo: 'socia', id: 'so-3', nombre: 'Ana', apellidos: 'Ballester' },
  { tipo: 'instructora', id: 'in-1', nombre: 'Begoña Arrieta' },
];

test('una persona = una referencia estable en toda la conversación, y se guardan ids, nunca nombres', () => {
  const t = tablaReferencias();
  assert.equal(t.socia('so-1'), 'ALUMNA_1');
  assert.equal(t.equipo('in-1'), 'EQUIPO_1');
  assert.equal(t.socia('so-9'), 'ALUMNA_2');
  assert.equal(t.socia('so-1'), 'ALUMNA_1');
  const guardada = t.aJson();
  assert.deepEqual(guardada, { ALUMNA_1: { tipo: 'socia', id: 'so-1' }, ALUMNA_2: { tipo: 'socia', id: 'so-9' }, EQUIPO_1: { tipo: 'instructora', id: 'in-1' } });
  // Al reabrir, sigue la numeración.
  const otra = tablaReferencias(JSON.parse(JSON.stringify(guardada)));
  assert.equal(otra.socia('so-9'), 'ALUMNA_2');
  assert.equal(otra.socia('so-7'), 'ALUMNA_3');
  // Basura en la columna no entra.
  assert.deepEqual(tablaReferencias({ ALUMNA_1: { tipo: 'instructora', id: 'x' }, HOLA: 1 }).aJson(), {});
});

test('la pregunta sale sin nombres: nombre y apellidos juntos colapsan en la referencia de esa persona', () => {
  const t = tablaReferencias();
  const r = marcarPersonasEnPregunta('¿Cuándo vino Lucía Ferrándiz y qué clase da Begoña?', PERSONAS, t);
  assert.equal(r.texto, '¿Cuándo vino [ALUMNA_1] y qué clase da [EQUIPO_1]?');
  assert.deepEqual(t.aJson(), { ALUMNA_1: { tipo: 'socia', id: 'so-1' }, EQUIPO_1: { tipo: 'instructora', id: 'in-1' } });
});

test('un nombre que llevan varias se marca, pero no se ata a ninguna (PERSONA_n solo para el navegador)', () => {
  const t = tablaReferencias();
  const r = marcarPersonasEnPregunta('¿Ana ha pagado? Y Ana Ballester también', PERSONAS, t);
  assert.equal(r.texto, '¿[PERSONA_1] ha pagado? Y [ALUMNA_1] también');
  assert.deepEqual(r.locales, { PERSONA_1: 'Ana' });
  assert.deepEqual(t.aJson(), { ALUMNA_1: { tipo: 'socia', id: 'so-3' } });
});

test('ningún nombre de las fixtures llega a lo que va a Anthropic, ni correos ni teléfonos', () => {
  const t = tablaReferencias();
  const r = marcarPersonasEnPregunta('Escríbele a lucia.f@example.com o al 612 345 678: Lucía Ferrándiz Olmo, Ana Quintero y Begoña Arrieta', PERSONAS, t);
  const enviado = JSON.stringify({ pregunta: r.texto, referencias: t.aJson() });
  for (const nombre of ['Lucía', 'Ferrándiz', 'Olmo', 'Quintero', 'Begoña', 'Arrieta', 'example.com', '612']) {
    assert.ok(!enviado.includes(nombre), `«${nombre}» se ha colado: ${enviado}`);
  }
});

// Revisión de seguridad del 5-oct: el motivo de una recomendación A4 (LLENAR_PLAZAS,
// sin socioId) nombra a OTRA socia («la primera, Lucía…»). Seudonimizar solo con la
// socia de la recomendación dejaba ese nombre camino de Anthropic.
test('el texto de una recomendación sale sin el nombre de ninguna alumna, aunque no sea la suya', () => {
  const t = tablaReferencias();
  const motivo = 'Quedan 3 plazas el jueves — la primera, Lucía, suele venir a esa hora';
  const { texto } = marcarPersonasEnPregunta(motivo, PERSONAS, t);
  assert.doesNotMatch(texto, /Lucía/);
  assert.match(texto, /\[ALUMNA_\d+\]/);
});

test('la herramienta de «qué revisar hoy» seudonimiza con TODAS las personas del estudio', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('./herramientas/estudio.ts', import.meta.url), 'utf8');
  assert.match(src, /marcarPersonasEnPregunta\(texto, ctx\.personas, ctx\.refs\)/,
    'sinNombres tiene que usar la lista entera (ctx.personas), no solo la socia de la recomendación');
  assert.doesNotMatch(src, /sinNombres\([^)]*socioId/);
});

test('quien escribe: su referencia se crea ANTES de marcar la pregunta y es la misma con la que sale su nombre', () => {
  const personas = [
    { tipo: 'instructora' as const, id: 'i-otra', nombre: 'Lucía' },
    { tipo: 'instructora' as const, id: 'i-yo', nombre: 'Marta', propia: true },
    { tipo: 'socia' as const, id: 's-1', nombre: 'Marta', apellidos: 'Gil' },
  ];
  const refs = tablaReferencias();
  const yo = refDeQuienEscribe(personas, refs);
  assert.equal(yo, 'EQUIPO_1');
  // Estable entre turnos: la tabla guardada la devuelve igual.
  assert.equal(refDeQuienEscribe(personas, tablaReferencias(refs.aJson())), 'EQUIPO_1');
  // Sin ficha propia en el equipo (una propietaria que no da clases): nada.
  assert.equal(refDeQuienEscribe(personas.map(p => ({ ...p, propia: false })), tablaReferencias()), null);
  // Una socia nunca es «quien escribe», aunque viniera marcada.
  assert.equal(refDeQuienEscribe([{ tipo: 'socia', id: 's-1', nombre: 'Ana', propia: true }], tablaReferencias()), null);
});
