import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  alternarDia, diaEntero, faltaDisponibilidad, resumenDisponibilidad, textoResumenDisponibilidad,
} from './disponibilidad-vista.ts';

test('solo falta disponibilidad con una lista vacía explícita; lo dudoso deja pasar', () => {
  assert.equal(faltaDisponibilidad({ celdas: [] }), true);
  assert.equal(faltaDisponibilidad({ celdas: ['1-manana'] }), false);
  // Lo que devuelve un mock comodín, un error o un cuerpo ilegible: «no lo sé».
  assert.equal(faltaDisponibilidad({}), false);
  assert.equal(faltaDisponibilidad({ error: 'No autorizado' }), false);
  assert.equal(faltaDisponibilidad(null), false);
  assert.equal(faltaDisponibilidad('[]'), false);
  assert.equal(faltaDisponibilidad({ celdas: null }), false);
});

const FRANJAS = ['manana', 'media_manana', 'tarde', 'noche'];

test('el resumen cuenta franjas y días distintos', () => {
  const r = resumenDisponibilidad(['1-manana', '1-tarde', '3-noche', '3-noche']);
  assert.deepEqual(r, { franjas: 3, dias: 2 });
  assert.equal(textoResumenDisponibilidad(r), 'Puedes cubrir 3 franjas en 2 días');
  assert.equal(textoResumenDisponibilidad({ franjas: 1, dias: 1 }), 'Puedes cubrir 1 franja en 1 día');
});

test('sin franjas no hay frase de resumen: eso se avisa aparte', () => {
  assert.deepEqual(resumenDisponibilidad([]), { franjas: 0, dias: 0 });
  assert.equal(textoResumenDisponibilidad({ franjas: 0, dias: 0 }), null);
});

test('marcar un día a medias lo completa, y uno entero lo vacía, sin tocar los demás', () => {
  const inicio = new Set(['1-manana', '2-tarde']);
  const completo = alternarDia(inicio, 1, FRANJAS);
  assert.ok(diaEntero(completo, 1, FRANJAS));
  assert.ok(completo.has('2-tarde'), 'el martes sigue igual');
  assert.equal(completo.size, 5);

  const vacio = alternarDia(completo, 1, FRANJAS);
  assert.equal(diaEntero(vacio, 1, FRANJAS), false);
  assert.deepEqual([...vacio], ['2-tarde']);
  // No muta lo que recibe.
  assert.deepEqual([...inicio].sort(), ['1-manana', '2-tarde']);
});

test('el domingo (0) es un día como cualquier otro', () => {
  const r = alternarDia(new Set(), 0, FRANJAS);
  assert.deepEqual([...r].sort(), ['0-manana', '0-media_manana', '0-noche', '0-tarde']);
});
