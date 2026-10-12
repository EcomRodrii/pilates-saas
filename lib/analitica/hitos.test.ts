import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HITOS, EVENTO_DEL_HITO, DIAS_OBSERVACION, estadoHitos, faltaAlguno, debeObservar, hitosNuevos, avanzarBase,
  type EstadoHitos,
} from './hitos.ts';
import { datosHecho } from '../tour/hecho.ts';
import { esEventoNavegador } from '../analytics-navegador.ts';

const NADA: EstadoHitos = { tiposClase: false, sesiones: false, tarifaActiva: false };
const TODO: EstadoHitos = { tiposClase: true, sesiones: true, tarifaActiva: true };

test('cada hito tiene su evento, y está en el catálogo del navegador', () => {
  for (const h of HITOS) assert.ok(esEventoNavegador(EVENTO_DEL_HITO[h]), `${h} → ${EVENTO_DEL_HITO[h]}`);
});

test('el criterio es el de la visita: un borrador del asistente no es una tarifa', () => {
  const base = {
    studio: { nif: null, logoUrl: null }, salas: [], tiposClase: [{}], sesiones: [], socios: [],
    instructores: [], suscripciones: [],
  };
  const borrador = estadoHitos(datosHecho({ ...base, planesTarifa: [{ activo: false, precio: 0 }] }));
  assert.deepEqual(borrador, { tiposClase: true, sesiones: false, tarifaActiva: false });
  const activa = estadoHitos(datosHecho({ ...base, planesTarifa: [{ activo: true, precio: 60 }] }));
  assert.equal(activa.tarifaActiva, true);
  // Activa pero a 0 €: todavía no se puede vender.
  assert.equal(estadoHitos(datosHecho({ ...base, planesTarifa: [{ activo: true, precio: 0 }] })).tarifaActiva, false);
});

test('solo emite lo que pasa de no a sí', () => {
  assert.deepEqual(hitosNuevos(NADA, NADA), []);
  assert.deepEqual(hitosNuevos(NADA, { ...NADA, tiposClase: true }), ['tiposClase']);
  assert.deepEqual(hitosNuevos({ ...NADA, tiposClase: true }, { tiposClase: true, sesiones: true, tarifaActiva: false }), ['sesiones']);
  // Lo que ya tenía al cargar no cuenta: no es su primera vez, es que ya estaba.
  assert.deepEqual(hitosNuevos(TODO, TODO), []);
  // Borrar no emite nada.
  assert.deepEqual(hitosNuevos(TODO, NADA), []);
});

test('borrar y volver a crear en la misma sesión no repite el hito', () => {
  let base = NADA;
  base = avanzarBase(base, { ...NADA, sesiones: true });   // primera clase
  assert.deepEqual(hitosNuevos(base, NADA), []);              // la borra
  base = avanzarBase(base, NADA);
  assert.deepEqual(hitosNuevos(base, { ...NADA, sesiones: true }), []); // la vuelve a crear
});

test('con todo hecho no hay nada que observar', () => {
  assert.equal(faltaAlguno(TODO), false);
  assert.equal(faltaAlguno({ ...TODO, tarifaActiva: false }), true);
});

test('se observa a la propietaria durante su primer mes, a nadie más', () => {
  const ahora = new Date('2026-10-12T10:00:00Z');
  assert.equal(debeObservar({ rol: 'PROPIETARIO', creadoEn: '2026-10-12T01:42:29Z', ahora }), true);
  assert.equal(debeObservar({ rol: 'PROPIETARIO', creadoEn: '2026-09-13T10:00:00Z', ahora }), true); // día 29
  const fuera = new Date(ahora.getTime() - (DIAS_OBSERVACION + 1) * 86_400_000).toISOString();
  assert.equal(debeObservar({ rol: 'PROPIETARIO', creadoEn: fuera, ahora }), false);
  for (const rol of ['MANAGER', 'RECEPCION', 'INSTRUCTOR', null]) {
    assert.equal(debeObservar({ rol, creadoEn: '2026-10-12T01:42:29Z', ahora }), false, String(rol));
  }
  // Sin fecha legible, no: mejor un hueco que contar a un veterano como nuevo.
  assert.equal(debeObservar({ rol: 'PROPIETARIO', creadoEn: null, ahora }), false);
  assert.equal(debeObservar({ rol: 'PROPIETARIO', creadoEn: 'ayer', ahora }), false);
  // Un reloj unos minutos atrasado no deja fuera a un estudio recién creado…
  assert.equal(debeObservar({ rol: 'PROPIETARIO', creadoEn: '2026-10-12T10:05:00Z', ahora }), true);
  // …pero una fecha de semanas en el futuro (algo roto) no se observa.
  assert.equal(debeObservar({ rol: 'PROPIETARIO', creadoEn: '2026-11-01T00:00:00Z', ahora }), false);
});
