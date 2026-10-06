import { test } from 'node:test';
import assert from 'node:assert/strict';
import type Anthropic from '@anthropic-ai/sdk';
import { historialParaElModelo, primerTurnoEnviado, TURNOS_MAX } from './historial.ts';

const DATOS = JSON.stringify({ clases: Array.from({ length: 20 }, (_, i) => ({ hora: `${i}:00`, ocupadas: '5 de 8' })) });

/** Un turno tal como lo guarda la ruta: pregunta, tool_use, tool_result, respuesta. */
function turno(n: number, respuesta = `Respuesta ${n}.`): Anthropic.MessageParam[] {
  return [
    { role: 'user', content: [{ type: 'text', text: `Pregunta ${n}` }] },
    { role: 'assistant', content: [{ type: 'text', text: 'Lo miro.' }, { type: 'tool_use', id: `tu_${n}`, name: 'agenda_del_dia', input: { dia: 'hoy', fecha: '' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: `tu_${n}`, content: DATOS }] },
    ...(respuesta ? [{ role: 'assistant' as const, content: [{ type: 'text' as const, text: respuesta }] }] : []),
  ];
}

test('de cada turno pasado solo viajan la pregunta y el texto que vio la propietaria', () => {
  const h = historialParaElModelo([...turno(1), ...turno(2)]);
  assert.deepEqual(h, [
    { role: 'user', content: [{ type: 'text', text: 'Pregunta 1' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'Lo miro. Respuesta 1.' }] },
    { role: 'user', content: [{ type: 'text', text: 'Pregunta 2' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'Lo miro. Respuesta 2.' }] },
  ]);
  const json = JSON.stringify(h);
  assert.ok(!json.includes('tool_use') && !json.includes('tool_result') && !json.includes('ocupadas'));
});

test('compactado es mucho más corto que lo guardado (el ahorro de cada pregunta de seguimiento)', () => {
  const guardado = Array.from({ length: 4 }, (_, i) => turno(i + 1)).flat();
  const antes = JSON.stringify(guardado).length;
  const despues = JSON.stringify(historialParaElModelo(guardado)).length;
  assert.ok(despues * 5 < antes, `${despues} frente a ${antes}`);
});

test('es estable: el historial de un turno es el prefijo exacto del del siguiente (la caché lo lee)', () => {
  const tres = Array.from({ length: 3 }, (_, i) => turno(i + 1)).flat();
  const cuatro = [...tres, ...turno(4)];
  const a = JSON.stringify(historialParaElModelo(tres));
  const b = JSON.stringify(historialParaElModelo(cuatro));
  assert.ok(b.startsWith(a.slice(0, -1)));
});

test('un turno sin respuesta (falló o se cortó) no se manda, y la alternancia user/assistant se mantiene', () => {
  // El 2 se quedó en la pregunta: ni «Lo miro.» ni respuesta.
  const sinNada: Anthropic.MessageParam = { role: 'user', content: [{ type: 'text', text: 'Pregunta 2' }] };
  const h = historialParaElModelo([...turno(1), sinNada, ...turno(3)]);
  assert.deepEqual(h.map(m => m.role), ['user', 'assistant', 'user', 'assistant']);
  assert.match(JSON.stringify(h), /Pregunta 3/);
  assert.doesNotMatch(JSON.stringify(h), /Pregunta 2/);
  // Si solo lleva el «Lo miro.» de antes de la herramienta, cuenta como respuesta: es lo que vio.
  assert.deepEqual(historialParaElModelo([]), []);
});

test(`ventana de ${TURNOS_MAX} turnos que se recorta de seis en seis`, () => {
  assert.equal(primerTurnoEnviado(1), 0);
  assert.equal(primerTurnoEnviado(TURNOS_MAX), 0);
  assert.equal(primerTurnoEnviado(TURNOS_MAX + 1), 6);
  assert.equal(primerTurnoEnviado(TURNOS_MAX + 6), 6);
  assert.equal(primerTurnoEnviado(TURNOS_MAX + 7), 12);
  const h = historialParaElModelo(Array.from({ length: 13 }, (_, i) => turno(i + 1)).flat());
  assert.equal(h.length, 14);
  assert.deepEqual(h[0], { role: 'user', content: [{ type: 'text', text: 'Pregunta 7' }] });
  // Siempre empieza por la propietaria.
  assert.equal(h[0].role, 'user');
});
