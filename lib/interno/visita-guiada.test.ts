import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerAccion, resumenVisita } from './visita-guiada.ts';
import { CAPITULOS } from '../tour/capitulos.ts';

const todosLosPasos = CAPITULOS.flatMap(c => c.pasos.map(p => p.id));

test('un estudio sin la visita activada se dice desactivado', () => {
  const r = resumenVisita({ obligatorio: false, completadaEn: null, progreso: {} });
  assert.equal(r.estado, 'desactivada');
  assert.equal(r.texto, 'Desactivada');
});

test('desactivada pero con avance: lo dice, para que «Activar» no sorprenda', () => {
  const r = resumenVisita({ obligatorio: false, completadaEn: null, progreso: { v: 1, inicio: true, hechos: ['c1.1', 'c1.2', 'c1.3'], aplazados: [], vistos: [] } });
  assert.equal(r.estado, 'desactivada');
  assert.match(r.texto, /Desactivada · llevaba un \d+ %/);
});

test('activa y sin empezar', () => {
  const r = resumenVisita({ obligatorio: true, completadaEn: null, progreso: {} });
  assert.deepEqual([r.estado, r.texto, r.porcentaje], ['sin-empezar', 'Activa · todavía no ha empezado', 0]);
});

test('en curso: dice en qué capítulo va, por el primer paso sin cerrar', () => {
  const hechos = [...CAPITULOS[0].pasos, ...CAPITULOS[1].pasos].map(p => p.id);
  const r = resumenVisita({ obligatorio: true, completadaEn: null, progreso: { v: 1, inicio: true, hechos, aplazados: [], vistos: ['c1', 'c2'] } });
  assert.equal(r.estado, 'en-curso');
  assert.equal(r.texto, `Capítulo 3 de ${CAPITULOS.length} · Tu horario`);
  assert.ok(r.porcentaje > 0 && r.porcentaje < 100);
});

test('un paso aplazado cuenta como cerrado', () => {
  const sin = resumenVisita({ obligatorio: true, completadaEn: null, progreso: { v: 1, inicio: true, hechos: ['c1.1', 'c1.2', 'c1.3'], aplazados: [], vistos: [] } });
  const con = resumenVisita({ obligatorio: true, completadaEn: null, progreso: { v: 1, inicio: true, hechos: ['c1.1', 'c1.2', 'c1.3'], aplazados: ['c2.2'], vistos: [] } });
  assert.ok(con.porcentaje > sin.porcentaje);
});

test('completada gana a todo, también a «desactivada»', () => {
  const r = resumenVisita({ obligatorio: false, completadaEn: '2026-10-08T00:29:00Z', progreso: { v: 1, inicio: true, hechos: todosLosPasos, aplazados: [], vistos: [] } });
  assert.equal(r.estado, 'completada');
  assert.match(r.texto, /^Completada el /);
  assert.equal(r.porcentaje, 100);
});

test('un progreso corrupto no rompe la lista', () => {
  for (const malo of [null, undefined, 'x', 5, [], { v: 9 }]) {
    const r = resumenVisita({ obligatorio: true, completadaEn: null, progreso: malo });
    assert.equal(r.estado, 'sin-empezar');
  }
});

test('leerAccion acepta las acciones válidas', () => {
  assert.deepEqual(leerAccion({ accion: 'estudio', id: 'studio-1', operacion: 'activar' }), { accion: 'estudio', id: 'studio-1', operacion: 'activar' });
  assert.deepEqual(leerAccion({ accion: 'estudio', id: 'studio-1', operacion: 'activar-desde-cero' }), { accion: 'estudio', id: 'studio-1', operacion: 'activar-desde-cero' });
  assert.deepEqual(leerAccion({ accion: 'todos', activar: true }), { accion: 'todos', activar: true });
  assert.deepEqual(leerAccion({ accion: 'nuevos', activar: false }), { accion: 'nuevos', activar: false });
});

test('leerAccion rechaza lo que no es una acción: sin id, sin operación, tipos mal, basura', () => {
  for (const malo of [null, undefined, 'x', 3, [], {}, { accion: 'estudio' }, { accion: 'estudio', id: '', operacion: 'activar' },
    { accion: 'estudio', id: 'a', operacion: 'borrar' }, { accion: 'estudio', id: 5, operacion: 'activar' },
    { accion: 'todos' }, { accion: 'todos', activar: 'si' }, { accion: 'nuevos', activar: 1 }, { accion: 'otra', activar: true }]) {
    assert.equal(leerAccion(malo), null, JSON.stringify(malo));
  }
});
