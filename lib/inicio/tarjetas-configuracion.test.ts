import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rutaPuestaEnMarcha, type DatosRuta } from '../guia/ruta-puesta-en-marcha.ts';
import { columnaDeTarjeta, tarjetasDeConfiguracion, textoTareas } from './tarjetas-configuracion.ts';

const VACIOS: DatosRuta = {
  estudio: false, salas: false, instructoras: false, tipos: false, tarifas: false, cobros: false,
  horario: false, alumnas: false, marca: false, primeraReserva: false,
};

test('las dos reglas son UNA tarjeta con «N de 2 tareas» y las demás, una por paso', () => {
  const t = tarjetasDeConfiguracion(rutaPuestaEnMarcha(VACIOS));
  assert.equal(t.length, 11);
  const reglas = t.filter(x => x.id === 'reglas');
  assert.equal(reglas.length, 1);
  assert.deepEqual(reglas[0].tareas, { hechas: 0, total: 2 });
  assert.equal(textoTareas(reglas[0].tareas!), '0 de 2 tareas completadas');
});

test('las reglas se dan por hechas solo cuando se han revisado las dos', () => {
  const una = tarjetasDeConfiguracion(rutaPuestaEnMarcha({ ...VACIOS, saltados: ['reglas-reserva'] })).find(x => x.id === 'reglas')!;
  assert.equal(una.estado, 'pendiente');
  assert.deepEqual(una.tareas, { hechas: 1, total: 2 });
  const dos = tarjetasDeConfiguracion(rutaPuestaEnMarcha({ ...VACIOS, saltados: ['reglas-reserva', 'reglas-cancelacion'] })).find(x => x.id === 'reglas')!;
  assert.equal(dos.estado, 'hecha');
});

test('el estado sale de los datos: lo hecho es «hecha» y solo un paso es «ahora»', () => {
  const t = tarjetasDeConfiguracion(rutaPuestaEnMarcha({ ...VACIOS, estudio: true, salas: true }));
  assert.equal(t.find(x => x.id === 'salas')!.estado, 'hecha');
  assert.equal(t.filter(x => x.estado === 'ahora').length, 1);
  assert.equal(t.find(x => x.id === 'horario')!.estado, 'bloqueada');
});

test('un paso hecho no se puede saltar y uno que no es saltable tampoco', () => {
  const t = tarjetasDeConfiguracion(rutaPuestaEnMarcha({ ...VACIOS, estudio: true }));
  assert.deepEqual(t.find(x => x.id === 'estudio')!.saltables, []);
  assert.deepEqual(t.find(x => x.id === 'salas')!.saltables, []);
  assert.deepEqual(t.find(x => x.id === 'marca')!.saltables, ['marca']);
});

test('la última fila corta va centrada en la rejilla de 6 columnas', () => {
  // 11 tarjetas: tres filas completas y una última de dos → columnas 2 y 4.
  assert.equal(columnaDeTarjeta(0, 11), null);
  assert.equal(columnaDeTarjeta(8, 11), null);
  assert.equal(columnaDeTarjeta(9, 11), 2);
  assert.equal(columnaDeTarjeta(10, 11), 4);
  // 7 tarjetas (como Shopify): la séptima sola, en la 3.
  assert.equal(columnaDeTarjeta(6, 7), 3);
  assert.equal(columnaDeTarjeta(5, 7), null);
  assert.equal(columnaDeTarjeta(2, 9), null);
});
