import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTADO_INICIAL, elegirPagina, elegirBloque, elegirItemContenido, elegirCategoria,
  irAVista, bloqueSeleccionadoEn, pantallaOperativa, tieneBloques, esVistaPreview,
  cerrarCategoria,
  type EstadoEditor,
} from './editor-navegacion.ts';

test('el estado inicial es Inicio del portal, sin nada seleccionado', () => {
  assert.deepEqual(ESTADO_INICIAL, { modo: 'secciones', pagina: 'home', vista: 'home', seleccion: null });
});

test('tieneBloques distingue las tres del portal del resto', () => {
  assert.equal(tieneBloques('home'), true);
  assert.equal(tieneBloques('clases'), true);
  assert.equal(tieneBloques('bonos'), true);
  assert.equal(tieneBloques('reservas'), false);
  assert.equal(tieneBloques('dashboard-inicio'), false);
  assert.equal(tieneBloques('contenido-portal'), false);
});

test('esVistaPreview incluye Reservas y Perfil, que no tienen bloques pero sí se pueden ver', () => {
  assert.equal(esVistaPreview('reservas'), true);
  assert.equal(esVistaPreview('perfil'), true);
  assert.equal(esVistaPreview('home'), true);
  assert.equal(esVistaPreview('dashboard-inicio'), false);
  assert.equal(esVistaPreview('contenido-portal'), false);
});

test('elegir una pantalla del portal la enseña y deselecciona lo anterior', () => {
  const conBloque = elegirBloque(ESTADO_INICIAL, 'home', 'b1');
  const despues = elegirPagina(conBloque, 'clases');
  assert.deepEqual(despues, { modo: 'secciones', pagina: 'clases', vista: 'clases', seleccion: null });
});

// ⚠️ La regla que se rompería sola en un refactor descuidado.
test('elegir "Inicio del panel" NO mueve el preview: no es una pantalla del portal', () => {
  const enClases = elegirPagina(ESTADO_INICIAL, 'clases');
  const despues = elegirPagina(enClases, 'dashboard-inicio');
  assert.equal(despues.pagina, 'dashboard-inicio', 'el rail sí cambia');
  assert.equal(despues.vista, 'clases', 'el preview se queda donde estaba');
});

test('elegir "Contenido del portal" tampoco mueve el preview', () => {
  const enBonos = elegirPagina(ESTADO_INICIAL, 'bonos');
  const despues = elegirItemContenido(enBonos, 'banner-1');
  assert.equal(despues.pagina, 'contenido-portal');
  assert.equal(despues.vista, 'bonos');
  assert.deepEqual(despues.seleccion, { tipo: 'item', grupo: 'contenido-portal', id: 'banner-1' });
});

test('elegir un bloque arrastra la página consigo — un bloque pertenece a una', () => {
  const enHome = ESTADO_INICIAL;
  const despues = elegirBloque(enHome, 'bonos', 'b-cta');
  assert.equal(despues.pagina, 'bonos');
  assert.equal(despues.vista, 'bonos');
  assert.deepEqual(despues.seleccion, { tipo: 'bloque', pantalla: 'bonos', id: 'b-cta' });
});

test('abrir una categoría de Ajustes deja la página Y el preview donde estaban', () => {
  // Es lo que quiere quien está tocando colores: seguir viendo la pantalla que
  // estaba juzgando. Si el preview saltara a otra cosa, el cambio de color se
  // vería sobre una pantalla que no interesa.
  const enClases = elegirPagina(ESTADO_INICIAL, 'clases');
  const despues = elegirCategoria(enClases, 'colores');
  assert.equal(despues.modo, 'ajustes');
  assert.equal(despues.pagina, 'clases');
  assert.equal(despues.vista, 'clases');
  assert.deepEqual(despues.seleccion, { tipo: 'categoria', id: 'colores' });
});

test('volver de Ajustes a una página restaura el modo secciones', () => {
  const enAjustes = elegirCategoria(ESTADO_INICIAL, 'tipografia');
  const despues = elegirPagina(enAjustes, 'home');
  assert.equal(despues.modo, 'secciones');
  assert.equal(despues.seleccion, null);
});

test('bloqueSeleccionadoEn solo responde por SU pantalla', () => {
  const estado = elegirBloque(ESTADO_INICIAL, 'clases', 'b-faq');
  assert.equal(bloqueSeleccionadoEn(estado, 'clases'), 'b-faq');
  assert.equal(bloqueSeleccionadoEn(estado, 'home'), null, 'no se contagia a otra pantalla');
  // Abrir Ajustes SÍ pierde qué bloque estaba elegido, igual que hoy: el
  // estado tiene una sola `seleccion` y la categoría la ocupa. Se conserva
  // ese comportamiento a propósito — recordarlo sería un cambio de UX, no
  // parte de este refactor. Queda escrito aquí para que sea una decisión y no
  // un descuido.
  assert.equal(bloqueSeleccionadoEn(elegirCategoria(estado, 'colores'), 'clases'), null);
});

test('pantallaOperativa: sobre qué pantalla actúan los paneles de bloques', () => {
  assert.equal(pantallaOperativa(ESTADO_INICIAL), 'home');
  assert.equal(pantallaOperativa(elegirPagina(ESTADO_INICIAL, 'bonos')), 'bonos');
  assert.equal(pantallaOperativa(elegirBloque(ESTADO_INICIAL, 'clases', 'x')), 'clases');
  // Desde Ajustes o Contenido del portal se opera sobre lo que enseña el
  // preview, que es la última pantalla del portal que se estuvo mirando.
  const enClasesLuegoAjustes = elegirCategoria(elegirPagina(ESTADO_INICIAL, 'clases'), 'colores');
  assert.equal(pantallaOperativa(enClasesLuegoAjustes), 'clases');
  // Y si el preview está en Reservas (que no tiene bloques), cae a Inicio en
  // vez de devolver una página imposible.
  const enReservas: EstadoEditor = { modo: 'secciones', pagina: 'contenido-portal', vista: 'reservas', seleccion: null };
  assert.equal(pantallaOperativa(enReservas), 'home');
});

test('irAVista mueve el preview y el rail juntos, sin seleccionar nada', () => {
  const conBloque = elegirBloque(ESTADO_INICIAL, 'home', 'b1');
  const despues = irAVista(conBloque, 'perfil');
  assert.equal(despues.vista, 'perfil');
  assert.equal(despues.pagina, 'perfil');
  assert.equal(despues.seleccion, null);
});

test('ninguna transición muta el estado que recibe', () => {
  const base = elegirBloque(ESTADO_INICIAL, 'home', 'b1');
  const copia = structuredClone(base);
  elegirPagina(base, 'clases');
  elegirCategoria(base, 'colores');
  elegirItemContenido(base, 'x');
  irAVista(base, 'perfil');
  assert.deepEqual(base, copia);
});

test('cerrarCategoria cierra el acordeón sin mover el preview', () => {
  // Se estaba mirando Clases y se abrió una categoría del tema: al cerrarla,
  // el preview tiene que seguir en Clases. Si esto usara `elegirPagina` para
  // deseleccionar, el iframe saltaría a otra pantalla al plegar un
  // desplegable.
  const abierta = elegirCategoria(elegirPagina(ESTADO_INICIAL, 'clases'), 'tipografia');
  const cerrada = cerrarCategoria(abierta);
  assert.equal(cerrada.seleccion, null);
  assert.equal(cerrada.modo, 'ajustes');
  assert.equal(cerrada.vista, 'clases');
  assert.equal(cerrada.pagina, 'clases');
});

test('cerrarCategoria no muta el estado que recibe', () => {
  const base = elegirCategoria(ESTADO_INICIAL, 'tipografia');
  const copia = structuredClone(base);
  cerrarCategoria(base);
  assert.deepEqual(base, copia);
});
