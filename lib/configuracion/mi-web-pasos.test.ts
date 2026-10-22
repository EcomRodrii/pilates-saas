import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pasosMiWeb, progresoMiWeb, type DatosMiWeb } from './mi-web-pasos.ts';

const BASE: DatosMiWeb = {
  direccion: 'tentare.app/reservar/estudio-prueba',
  descripcion: false,
  widgets: { nombres: [], aviso: null },
  pagina: { oculta: false, tieneClave: false },
  network: false,
};

const paso = (d: DatosMiWeb, id: string) => pasosMiWeb(d).find(p => p.id === id)!;

test('cinco pasos, en el orden de la maqueta y con su peso', () => {
  const pasos = pasosMiWeb(BASE);
  assert.deepEqual(pasos.map(p => p.id), ['direccion', 'presentacion', 'widgets', 'quien-la-ve', 'network']);
  assert.deepEqual(pasos.map(p => p.orden), [1, 2, 3, 4, 5]);
  assert.deepEqual(pasos.map(p => p.peso), ['imprescindible', 'recomendado', 'recomendado', 'opcional', 'opcional']);
});

test('cada paso dice dónde lo ve quien llega y cuándo le llega el cambio', () => {
  for (const p of pasosMiWeb(BASE)) {
    assert.ok(p.donde.length > 0, p.id);
    assert.ok(p.cuando.length > 0, p.id);
    assert.ok(p.porque.length > 0, p.id);
  }
});

test('el paso de los widgets separa lo que llega solo, lo que llega al publicar y lo que hay que volver a pegar', () => {
  const lineas = paso(BASE, 'widgets').lineas!;
  assert.equal(lineas.length, 3);
  assert.match(lineas[0].cuando, /Solos/);
  assert.match(lineas[1].cuando, /Publicar en mi web/);
  assert.match(lineas[2].cuando, /pegarlo otra vez/);
});

test('el progreso cuenta dirección, presentación y widgets, nunca lo opcional', () => {
  const p = progresoMiWeb(pasosMiWeb(BASE), BASE);
  assert.equal(p.total, 3);
  assert.equal(p.hechos, 1);
  assert.equal(p.titulo, 'Tu página ya recibe reservas');
  assert.match(p.frase, /cómo te presentas y ponla en tu web/);
  // Network apagado y la página visible no restan nada.
  const todo: DatosMiWeb = { ...BASE, descripcion: true, widgets: { nombres: ['Horario y reservas'], aviso: null } };
  const lleno = progresoMiWeb(pasosMiWeb(todo), todo);
  assert.equal(lleno.hechos, 3);
  assert.match(lleno.frase, /Está todo/);
});

test('un widget con aviso cuenta como puesto, pero el aviso se dice arriba y en su paso', () => {
  const d: DatosMiWeb = { ...BASE, descripcion: true, widgets: { nombres: ['Horario y reservas'], aviso: 'Tu web (miweb.example) no está entre las webs autorizadas' } };
  const w = paso(d, 'widgets');
  assert.equal(w.hecho, true);
  assert.equal(w.tono, 'falta');
  assert.match(w.estado, /no está entre las webs autorizadas/);
  assert.match(progresoMiWeb(pasosMiWeb(d), d).frase, /aviso/);
});

test('lo que no se sabe no se inventa', () => {
  const d: DatosMiWeb = { ...BASE, widgets: null, pagina: null, network: null };
  assert.equal(paso(d, 'widgets').hecho, false);
  assert.match(paso(d, 'widgets').estado, /Mirando/);
  assert.match(paso(d, 'quien-la-ve').estado, /No hemos podido/);
  assert.match(paso(d, 'network').estado, /Mirando/);
});

test('sin dirección, el título y la frase mandan al paso 1', () => {
  const d: DatosMiWeb = { ...BASE, direccion: null };
  const p = progresoMiWeb(pasosMiWeb(d), d);
  assert.equal(p.titulo, 'Tu página aún no tiene dirección');
  assert.match(p.frase, /paso 1/);
  assert.equal(paso(d, 'direccion').hecho, false);
});

test('una página oculta lo dice en el título, con o sin clave', () => {
  const d: DatosMiWeb = { ...BASE, pagina: { oculta: true, tieneClave: true } };
  assert.match(progresoMiWeb(pasosMiWeb(d), d).titulo, /oculta/);
  assert.equal(paso(d, 'quien-la-ve').estado, 'Oculta: solo entra quien tenga la clave');
});
