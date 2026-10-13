import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claveSiguientePaso, fraseDeHecho, guardarDescartados, leerDescartados, listaDeArranque, pasosHechos, siguientePaso } from './arranque.ts';
import type { ProgresoGuia } from '../guia/progreso.ts';

const paso = (id: string, done: boolean, externo = false) => ({ id, label: `Paso ${id}`, descripcion: `Por qué ${id}`, minutos: 2, done, href: `/${id}`, ...(externo ? { externo } : {}) });

function progreso(esenciales: ReturnType<typeof paso>[][], resto: ReturnType<typeof paso>[][] = []): ProgresoGuia {
  const cap = (nivel: string, pasos: ReturnType<typeof paso>[]) => ({ capitulo: { nivel }, pasos, hechos: pasos.filter(p => p.done).length, total: pasos.length, estado: 'pendiente' });
  return { capitulos: [...esenciales.map(p => cap('esencial', p)), ...resto.map(p => cap('mas', p))] } as unknown as ProgresoGuia;
}

test('la lista de arranque son los pasos esenciales, en su orden y sin los de después', () => {
  const p = progreso([[paso('salas', true)], [paso('tipos', false), paso('horario', false)]], [[paso('bonos', false)]]);
  assert.deepEqual(listaDeArranque(p).map(f => [f.id, f.done]), [['salas', true], ['tipos', false], ['horario', false]]);
});

test('el siguiente paso sale cuando el anterior está hecho y el actual no', () => {
  const p = progreso([[paso('salas', true), paso('tipos', true)], [paso('horario', false)]]);
  const s = siguientePaso(p, new Set());
  assert.equal(s?.hecho.id, 'tipos');
  assert.equal(s?.siguiente.id, 'horario');
  assert.equal(s?.siguiente.href, '/horario');
});

test('nada hecho todavía o todo hecho: no hay banner', () => {
  assert.equal(siguientePaso(progreso([[paso('salas', false), paso('tipos', false)]]), new Set()), null);
  assert.equal(siguientePaso(progreso([[paso('salas', true), paso('tipos', true)]]), new Set()), null);
});

test('si el que falta no viene justo después de uno hecho, no se inventa un «tras crear»', () => {
  // `tipos` sin hacer: el primer pendiente es `tipos`, y su anterior (`salas`) está hecho → sale ese, no `horario`.
  const p = progreso([[paso('salas', true), paso('tipos', false), paso('horario', true)]]);
  assert.equal(siguientePaso(p, new Set())?.siguiente.id, 'tipos');
});

test('descartado no vuelve; un enlace externo (abrir la página pública) no se ofrece como banner', () => {
  const p = progreso([[paso('tipos', true), paso('horario', false)]]);
  assert.equal(siguientePaso(p, new Set(['horario'])), null);
  assert.equal(siguientePaso(progreso([[paso('tipos', true), paso('web', false, true)]]), new Set()), null);
});

test('lo descartado se guarda por persona y estudio, y leer nunca lanza', () => {
  assert.equal(claveSiguientePaso('u-1', 's-1'), 'tentare:siguiente-paso:v1:u-1:s-1');
  const datos = new Map<string, string>();
  const almacen = { getItem: (k: string) => datos.get(k) ?? null, setItem: (k: string, v: string) => { datos.set(k, v); } };
  assert.equal(guardarDescartados(almacen, 'k', new Set(['horario'])), true);
  assert.deepEqual([...leerDescartados(almacen, 'k')], ['horario']);
  assert.deepEqual([...leerDescartados({ getItem: () => '{basura' }, 'k')], []);
  assert.deepEqual([...leerDescartados({ getItem: () => { throw new Error('bloqueado'); } }, 'k')], []);
  assert.equal(guardarDescartados({ setItem: () => { throw new Error('lleno'); } }, 'k', new Set()), false);
});

test('solo «justo después»: lo que ya estaba hecho al abrir el panel no se celebra', () => {
  const antes = progreso([[paso('salas', true), paso('clase', false)], [paso('horario', false)]]);
  const base = pasosHechos(antes);
  assert.deepEqual([...base], ['salas']);
  // Al abrir: las salas venían hechas (el asistente de alta) → nada.
  assert.equal(siguientePaso(antes, new Set(), base), null);
  // Crea el tipo de clase en esta sesión → sale, con la frase en pasado.
  const despues = progreso([[paso('salas', true), paso('clase', true)], [paso('horario', false)]]);
  const s = siguientePaso(despues, new Set(), base);
  assert.equal(s?.siguiente.id, 'horario');
  assert.equal(s?.hecho.frase, 'Tu primer tipo de clase está creado.');
});

test('la frase en pasado: la de cada paso, o la genérica si no tiene', () => {
  assert.equal(fraseDeHecho({ id: 'bonos', label: 'Configura tus bonos y membresías' }), 'Tu primera tarifa está creada.');
  assert.equal(fraseDeHecho({ id: 'otro', label: 'Haz algo' }), '«Haz algo»: hecho.');
});
