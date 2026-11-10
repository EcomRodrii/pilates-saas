import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  esPestanaAyuda, etiquetaTipoSoporte, extractoMensaje, guiasParaInicio, hayNovedadSinVer, ordenarVersiones, pestanasVisibles,
} from './panel-ayuda.ts';
import { AYUDA_POR_PANTALLA } from './pantallas.ts';

test('las pestañas son cinco, «Tentare» solo con asistente, y lo demás no es una pestaña', () => {
  for (const p of ['inicio', 'tentare', 'novedades', 'mensajes', 'ayuda']) assert.equal(esPestanaAyuda(p), true, p);
  assert.deepEqual(pestanasVisibles(true), ['inicio', 'tentare', 'novedades', 'mensajes', 'ayuda']);
  assert.deepEqual(pestanasVisibles(false), ['inicio', 'novedades', 'mensajes', 'ayuda']);
  for (const p of ['', 'Inicio', 'constructor', null, 3]) assert.equal(esPestanaAyuda(p), false, String(p));
});

test('Inicio enseña las guías de la pantalla, la de su ficha primero, y nunca más de tres', () => {
  const ruta = Object.keys(AYUDA_POR_PANTALLA)[0];
  const r = guiasParaInicio(ruta);
  assert.equal(r.titulo, 'Para esta pantalla');
  assert.ok(r.guias.length >= 1 && r.guias.length <= 3);
  assert.ok(r.guias.every(g => g.estado === 'publicado'));
});

test('una pantalla sin ficha cae en «Empezar con Tentare», no en un panel vacío', () => {
  for (const ruta of ['/ruta-que-no-existe', '', null, undefined]) {
    const r = guiasParaInicio(ruta);
    assert.equal(r.titulo, 'Para empezar', String(ruta));
    assert.ok(r.guias.length > 0 && r.guias.every(g => g.categoria === 'empezar'));
  }
});

test('las versiones van de la más reciente a la más antigua y 0.10 va antes que 0.9', () => {
  const v = (version: string, fecha: string) => ({ id: version, version, titulo: version, fecha_publicacion: fecha });
  const orden = ordenarVersiones([v('0.9', '2026-10-01'), v('0.10', '2026-10-01'), v('0.8', '2026-09-01'), v('0.11', '2026-10-20')]);
  assert.deepEqual(orden.map(x => x.version), ['0.11', '0.10', '0.9', '0.8']);
});

test('el punto de novedades: solo si hay una versión que no has abierto', () => {
  assert.equal(hayNovedadSinVer(null, null), false, 'sin versiones no hay nada que avisar');
  assert.equal(hayNovedadSinVer(undefined, '0.9'), false);
  assert.equal(hayNovedadSinVer('0.10', null), true, 'sin haber visto ninguna');
  assert.equal(hayNovedadSinVer('0.10', '0.9'), true);
  assert.equal(hayNovedadSinVer('0.10', '0.10'), false);
});

test('el tipo de un mensaje se dice en español y lo desconocido no revienta', () => {
  assert.equal(etiquetaTipoSoporte('DUDA'), 'Duda');
  assert.equal(etiquetaTipoSoporte('MEJORA'), 'Mejora');
  assert.equal(etiquetaTipoSoporte('BUG'), 'Problema');
  assert.equal(etiquetaTipoSoporte('constructor'), 'Mensaje');
  assert.equal(etiquetaTipoSoporte(''), 'Mensaje');
});

test('el extracto recorta sin partir palabras y no toca lo corto', () => {
  assert.equal(extractoMensaje('  No me  carga\nel calendario  '), 'No me carga el calendario');
  const largo = 'No me deja cobrar la cuota de una alumna desde su ficha porque aparece un error rojo';
  const e = extractoMensaje(largo, 40);
  assert.ok(e.endsWith('…') && e.length <= 41, e);
  assert.ok(!e.slice(0, -1).endsWith(' '), 'sin espacio colgando');
  assert.ok(largo.startsWith(e.slice(0, -1)), 'es un prefijo de lo escrito');
});
