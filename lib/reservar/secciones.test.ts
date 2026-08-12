import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SECCIONES_RESERVAR, ordenarSecciones, seccionVisible, esAnclada, sePuedeOcultar,
} from './secciones.ts';

const ids = (s: { id: string }[]) => s.map((x) => x.id);
const POR_DEFECTO = ids(SECCIONES_RESERVAR);

test('los ids son únicos: son la clave de orden y visibilidad', () => {
  assert.equal(new Set(POR_DEFECTO).size, POR_DEFECTO.length);
});

test('sin nada guardado, el orden es el de siempre', () => {
  // Un estudio que no toque nada no puede ver ningún cambio.
  assert.deepEqual(ids(ordenarSecciones(null)), POR_DEFECTO);
  assert.deepEqual(ids(ordenarSecciones({})), POR_DEFECTO);
  assert.deepEqual(ids(ordenarSecciones({ orden: [] })), POR_DEFECTO);
});

test('lo guardado manda para las secciones movibles', () => {
  const r = ids(ordenarSecciones({ orden: ['contacto', 'cifras', 'sobre', 'bonos'] }));
  // Portada y horario están ANCLADAS: se quedan en su posición del catálogo.
  assert.deepEqual(r.slice(0, 2), ['portada', 'horario']);
  // Las movibles salen en el orden elegido, detrás de las ancladas.
  assert.deepEqual(r.slice(2), ['contacto', 'cifras', 'sobre', 'bonos']);
});

test('⚠️ ni el horario ni la portada se mueven, ni pidiéndolo explícitamente', () => {
  // Una página de reservas sin horario está rota; y la portada comparte el
  // degradado del hero con la barra y las pestañas, así que separarla deja
  // costuras a la vista (ver SECCIONES_ANCLADAS).
  const r = ids(ordenarSecciones({ orden: ['horario', 'portada', 'contacto'] }));
  assert.deepEqual(r.slice(0, 2), ['portada', 'horario']);
  assert.equal(esAnclada('horario'), true);
  assert.equal(esAnclada('portada'), true);
  assert.equal(esAnclada('cifras'), false);
});

test('⚠️ anclada NO es lo mismo que obligatoria: la portada se oculta', () => {
  // La distinción que más importa aquí: quien incrusta el widget bajo la
  // cabecera que ya tiene su web quiere quitar la portada, no moverla.
  assert.equal(sePuedeOcultar('portada'), true);
  assert.equal(seccionVisible('portada', { ocultos: ['portada'] }), false);
  // El horario no.
  assert.equal(sePuedeOcultar('horario'), false);
  assert.equal(seccionVisible('horario', { ocultos: ['horario'] }), true);
  // Las movibles, como siempre.
  assert.equal(seccionVisible('cifras', { ocultos: ['cifras'] }), false);
  assert.equal(seccionVisible('cifras', { ocultos: [] }), true);
  assert.equal(seccionVisible('cifras', null), true);
});

test('una sección NUEVA entra al final del orden ya guardado', () => {
  // El gotcha que ya documenta la home del panel: quien personalizó su página
  // antes de que existiera «Sobre nosotros» no puede encontrársela en medio.
  //
  // Este caso dejó de ser hipotético, y ya van dos: «sobre» y «bonos» se
  // añadieron al catálogo DESPUÉS de que los primeros estudios pudieran guardar
  // su orden. Aquí el guardado solo conoce «contacto», y las que faltan entran
  // detrás, en el orden del catálogo — nunca delante de lo que el estudio ya
  // había colocado.
  const r = ids(ordenarSecciones({ orden: ['contacto'] }));
  assert.deepEqual(r.slice(2), ['contacto', 'bonos', 'sobre', 'cifras']);
});

test('una sección RETIRADA del producto no deja hueco', () => {
  const r = ids(ordenarSecciones({ orden: ['cifras', 'ya-no-existe'] }));
  assert.ok(!r.includes('ya-no-existe'));
  // Y las que faltaban siguen entrando al final.
  assert.equal(r.length, POR_DEFECTO.length);
});

test('un orden guardado con duplicados no duplica la sección', () => {
  // Lo deja un arrastre mal guardado, y duplicar una sección entera en la
  // página sería visible al instante para la clienta.
  const r = ids(ordenarSecciones({ orden: ['cifras', 'cifras', 'contacto'] }));
  assert.equal(r.filter((x) => x === 'cifras').length, 1);
  assert.equal(r.length, POR_DEFECTO.length);
});

test('nunca se pierde ni se inventa una sección', () => {
  for (const guardado of [null, {}, { orden: ['contacto'] }, { orden: [...POR_DEFECTO].reverse() }]) {
    const r = ids(ordenarSecciones(guardado));
    assert.deepEqual([...r].sort(), [...POR_DEFECTO].sort());
  }
});
