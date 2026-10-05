import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marcarPersonasEnPregunta, tablaReferencias, type PersonaDelEstudio } from './referencias.ts';

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
