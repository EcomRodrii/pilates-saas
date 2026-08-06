import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  crearHistorial, registrar, deshacer, rehacer, puedeDeshacer, puedeRehacer,
  TOPE_HISTORIAL, VENTANA_FUSION_MS,
} from './editor-historial.ts';

test('recién creado no se puede deshacer ni rehacer', () => {
  const h = crearHistorial('a');
  assert.equal(h.presente, 'a');
  assert.equal(puedeDeshacer(h), false);
  assert.equal(puedeRehacer(h), false);
});

test('un cambio se deshace y se rehace, volviendo al mismo sitio', () => {
  let h = crearHistorial('a');
  h = registrar(h, 'b', { ahora: 0 });
  assert.equal(h.presente, 'b');

  h = deshacer(h);
  assert.equal(h.presente, 'a');
  assert.equal(puedeRehacer(h), true);

  h = rehacer(h);
  assert.equal(h.presente, 'b');
  assert.equal(puedeRehacer(h), false);
});

test('registrar el MISMO estado no crea un paso — devuelve el mismo objeto', () => {
  // Un setter que se dispara sin cambiar nada no debe llenar la pila de pasos
  // vacíos que luego hay que pulsar tres veces para salir de ellos.
  const h = crearHistorial('a');
  assert.equal(registrar(h, 'a', { ahora: 0 }), h);
});

// ── La fusión por campo: lo que hace esto usable ───────────────────────────

test('escribir un título es UN paso, no una letra por pulsación', () => {
  let h = crearHistorial('');
  for (const [i, texto] of ['B', 'Bi', 'Bie', 'Bien'].entries()) {
    h = registrar(h, texto, { clave: 'b1:titulo', ahora: i * 100 });
  }
  assert.equal(h.presente, 'Bien');
  assert.equal(h.pasado.length, 1, 'un solo paso en la pila');

  h = deshacer(h);
  assert.equal(h.presente, '', 'deshacer devuelve al estado de antes de teclear, no a "Bie"');
});

test('la ventana se cuenta desde la ÚLTIMA tecla — quien escribe despacio no se parte en trozos', () => {
  let h = crearHistorial('');
  // 500 ms entre teclas: siempre dentro de la ventana respecto a la anterior,
  // aunque entre la primera y la última pasen 1500 ms.
  h = registrar(h, 'B', { clave: 'b1:titulo', ahora: 0 });
  h = registrar(h, 'Bi', { clave: 'b1:titulo', ahora: 500 });
  h = registrar(h, 'Bie', { clave: 'b1:titulo', ahora: 1000 });
  h = registrar(h, 'Bien', { clave: 'b1:titulo', ahora: 1500 });
  assert.equal(h.pasado.length, 1);
});

test('una pausa larga corta la fusión: son dos pasos', () => {
  let h = crearHistorial('');
  h = registrar(h, 'Hola', { clave: 'b1:titulo', ahora: 0 });
  h = registrar(h, 'Hola mundo', { clave: 'b1:titulo', ahora: VENTANA_FUSION_MS + 1 });
  assert.equal(h.pasado.length, 2);
  h = deshacer(h);
  assert.equal(h.presente, 'Hola');
});

test('cambiar de campo corta la fusión aunque sea seguido', () => {
  let h = crearHistorial('a');
  h = registrar(h, 'b', { clave: 'b1:titulo', ahora: 0 });
  h = registrar(h, 'c', { clave: 'b1:texto', ahora: 10 });
  assert.equal(h.pasado.length, 2, 'título y texto son pasos distintos');
});

test('sin clave, cada cambio es su propio paso — reordenar, ocultar, eliminar', () => {
  let h = crearHistorial('a');
  h = registrar(h, 'b', { ahora: 0 });
  h = registrar(h, 'c', { ahora: 1 });
  assert.equal(h.pasado.length, 2, 'dos acciones discretas, dos pasos, aunque sean seguidas');
});

test('editar después de deshacer invalida lo rehacible', () => {
  let h = crearHistorial('a');
  h = registrar(h, 'b', { ahora: 0 });
  h = deshacer(h);
  assert.equal(puedeRehacer(h), true);

  h = registrar(h, 'otra-rama', { ahora: 100 });
  assert.equal(puedeRehacer(h), false, 'la rama deshecha ya no lleva a ningún sitio');
  assert.equal(h.presente, 'otra-rama');
});

test('deshacer corta la fusión: lo siguiente no continúa lo que se acaba de deshacer', () => {
  let h = crearHistorial('');
  h = registrar(h, 'Hola', { clave: 'b1:titulo', ahora: 0 });
  h = deshacer(h);
  // Mismo campo y dentro de la ventana, pero NO debe fundirse con el paso que
  // acabamos de deshacer — si lo hiciera, ese paso se perdería al reemplazarse.
  h = registrar(h, 'Adios', { clave: 'b1:titulo', ahora: 100 });
  assert.equal(h.pasado.length, 1);
  h = deshacer(h);
  assert.equal(h.presente, '');
});

test('deshacer y rehacer al límite no lanzan ni cambian nada', () => {
  const h = crearHistorial('a');
  assert.equal(deshacer(h), h);
  assert.equal(rehacer(h), h);
});

test(`la pila se corta en ${TOPE_HISTORIAL} y descarta lo MÁS VIEJO`, () => {
  let h = crearHistorial(0);
  for (let i = 1; i <= TOPE_HISTORIAL + 20; i++) h = registrar(h, i, { ahora: i });
  assert.equal(h.pasado.length, TOPE_HISTORIAL);
  // Lo que sobrevive es la cola reciente, no la cabeza antigua.
  assert.equal(h.pasado[h.pasado.length - 1], TOPE_HISTORIAL + 19);
  assert.equal(h.pasado[0], 20);
});

test('rehacer respeta el mismo tope', () => {
  let h = crearHistorial(0);
  for (let i = 1; i <= TOPE_HISTORIAL; i++) h = registrar(h, i, { ahora: i });
  h = deshacer(h);
  h = rehacer(h);
  assert.equal(h.pasado.length, TOPE_HISTORIAL);
});

test('ninguna operación muta el historial que recibe', () => {
  const base = registrar(crearHistorial('a'), 'b', { ahora: 0 });
  const copia = structuredClone(base);
  deshacer(base);
  rehacer(deshacer(base));
  registrar(base, 'c', { ahora: 1 });
  assert.deepEqual(base, copia);
});

test('funciona con objetos, no solo con cadenas — es lo que va a guardar', () => {
  const bloques1 = [{ id: 'a' }];
  const bloques2 = [{ id: 'a' }, { id: 'b' }];
  let h = crearHistorial(bloques1);
  h = registrar(h, bloques2, { ahora: 0 });
  assert.equal(h.presente, bloques2);
  h = deshacer(h);
  assert.equal(h.presente, bloques1, 'devuelve la MISMA referencia, no una copia');
});
