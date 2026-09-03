import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { proyectarBonos, proyectarClases, proyectarInstructoras, proyectarPagos, proyectarReservas } from './mapeo.ts';
import type { PayloadMin } from './mapeo.ts';

// Las proyecciones contra un payload REAL de `POST /api/public/studio-data`.
//
// Por qué esto existe: un adaptador puede tener los tipos perfectos y estar
// leyendo campos que el servidor no manda. TypeScript no lo ve —el payload
// llega como `any` desde `res.json()`— y la pantalla sale vacía sin ningún
// error. Este fichero fija el CONTRATO con nombres de campo reales.
//
// El fixture se capturó del servidor de desarrollo con el estudio sembrado
// (`fixtures/studio-data.json`). Si el backend renombra un campo, esto falla
// aquí y no tres pantallas más allá.

const payload = JSON.parse(
  readFileSync(new URL('./fixtures/studio-data.json', import.meta.url), 'utf8'),
) as PayloadMin;

test('el fixture es un payload real, no un objeto inventado', () => {
  assert.ok((payload.sesiones ?? []).length > 0, 'sin sesiones');
  assert.ok((payload.tiposClase ?? []).length > 0, 'sin tipos de clase');
  assert.ok((payload.aforoReservas ?? []).length > 0, 'sin aforo');
});

test('clases: los campos que el diseño pinta llegan todos', () => {
  const clases = proyectarClases(payload);
  assert.ok(clases.length > 0, 'la proyección se quedó vacía: nombres de campo equivocados');

  for (const c of clases) {
    assert.match(c.fecha, /^\d{4}-\d{2}-\d{2}$/, `fecha con formato raro: ${c.fecha}`);
    assert.match(c.hora, /^\d{2}:\d{2}$/, `hora con formato raro: ${c.hora}`);
    assert.ok(c.duracionMin > 0, 'duración a cero: inicio/fin no llegaron');
    assert.ok(c.nombre && c.nombre !== 'Clase', `nombre sin resolver en ${c.id}`);
    assert.ok(c.capacidad > 0, 'aforo a cero');
    assert.ok(c.plazasLibres >= 0 && c.plazasLibres <= c.capacidad, 'plazas fuera de rango');
    assert.ok(['Todos', 'Iniciación', 'Medio', 'Avanzado'].includes(c.nivel), `nivel sin traducir: ${c.nivel}`);
    assert.ok(c.instructoraId, 'sin instructora');
  }
});

test('clases: el nivel se traduce de verdad, no cae siempre a Todos', () => {
  const niveles = new Set(proyectarClases(payload).map((c) => c.nivel));
  // El estudio sembrado tiene cuatro tipos con niveles distintos. Si el mapa
  // fallara, aquí solo habría 'Todos' — que es exactamente el fallo silencioso
  // que este test existe para cazar.
  assert.ok(niveles.size > 1, `todos los niveles salieron iguales: ${[...niveles].join(', ')}`);
});

test('clases: filtrar por fecha devuelve solo ese día', () => {
  const todas = proyectarClases(payload);
  const dia = todas[0].fecha;
  const delDia = proyectarClases(payload, dia);
  assert.ok(delDia.length > 0);
  assert.ok(delDia.every((c) => c.fecha === dia));
  assert.ok(delDia.length < todas.length, 'el filtro de fecha no filtró nada');
});

test('clases: salen en orden cronológico', () => {
  const clases = proyectarClases(payload);
  const claves = clases.map((c) => c.fecha + c.hora);
  assert.deepEqual(claves, [...claves].sort());
});

test('clases: una sesión cancelada no aparece en el horario', () => {
  const conCancelada: PayloadMin = {
    ...payload,
    sesiones: (payload.sesiones ?? []).map((s, i) => (i === 0 ? { ...s, cancelada: true } : s)),
  };
  const ids = new Set(proyectarClases(conCancelada).map((c) => c.id));
  assert.equal(ids.has(payload.sesiones![0].id), false);
});

test('aforo: una reserva en lista de espera NO resta plaza', () => {
  const sesionId = payload.sesiones![0].id;
  const base = proyectarClases(payload).find((c) => c.id === sesionId)!;

  const conEspera: PayloadMin = {
    ...payload,
    aforoReservas: [...(payload.aforoReservas ?? []), { sesion_id: sesionId, estado: 'LISTA_ESPERA' }],
  };
  const despues = proyectarClases(conEspera).find((c) => c.id === sesionId)!;

  // Si contara, el aforo saldría lleno antes de tiempo y la alumna vería
  // «completa» una clase que el servidor sí aceptaría.
  assert.equal(despues.plazasLibres, base.plazasLibres);
});

test('aforo: una CONFIRMADA sí resta plaza', () => {
  const sesionId = payload.sesiones![0].id;
  const base = proyectarClases(payload).find((c) => c.id === sesionId)!;
  const conUna: PayloadMin = {
    ...payload,
    aforoReservas: [...(payload.aforoReservas ?? []), { sesion_id: sesionId, estado: 'CONFIRMADA' }],
  };
  const despues = proyectarClases(conUna).find((c) => c.id === sesionId)!;
  assert.equal(despues.plazasLibres, Math.max(0, base.plazasLibres - 1));
});

test('instructoras: llegan con nombre e iniciales', () => {
  const ins = proyectarInstructoras(payload);
  assert.ok(ins.length > 0, 'sin instructoras: nombre de campo equivocado');
  for (const i of ins) {
    assert.ok(i.nombre, 'instructora sin nombre');
    assert.equal(i.iniciales.length, 2);
    assert.equal(i.iniciales, i.iniciales.toUpperCase());
  }
});

test('sin socia: reservas, bonos y pagos vienen vacíos, no rotos', () => {
  const anonimo: PayloadMin = { ...payload, socia: null };
  assert.deepEqual(proyectarReservas(anonimo), []);
  assert.deepEqual(proyectarBonos(anonimo, Date.now()), []);
  assert.deepEqual(proyectarPagos(anonimo), []);
});

test('planes: el fixture trae un mensual ILIMITADO, con sesiones a null', () => {
  // Es el caso que rompe la traducción si se lee como cero, así que conviene
  // que el fixture lo contenga de verdad.
  const ilimitado = (payload.planesTarifa ?? []).some((p) => p.sesiones === null);
  assert.ok(ilimitado, 'el fixture perdió el plan ilimitado: el caso deja de estar cubierto');
});
