import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  borrarAjuste, claveCalendario, guardarAjuste, huellaEvento, leerAjuste, planCalendario, textoTrasActivar,
  type DatosEvento, type MapaEventos,
} from './calendario-auto.ts';
import type { Clase, Reserva } from './tipos.ts';

const AHORA = new Date('2026-10-07T12:00:00Z').getTime();
const clase = (id: string, inicio: string, nombre = 'Reformer') =>
  ({ id, inicio, fin: new Date(new Date(inicio).getTime() + 50 * 60_000).toISOString(), nombre } as unknown as Clase);
const reserva = (claseId: string, estado: Reserva['estado'] = 'confirmada'): Reserva =>
  ({ id: 'r-' + claseId + estado, claseId, alumnaId: 'a', estado, creadoEn: '2026-10-01T00:00:00Z' } as unknown as Reserva);
const datos = (c: Clase): DatosEvento => ({ titulo: c.nombre, inicioMs: new Date(c.inicio).getTime(), finMs: new Date(c.fin).getTime() });
const apuntada = (c: Clase, id: string) => ({ id, huella: huellaEvento(datos(c)) });

const futura = clase('c1', '2026-10-08T07:00:00Z');
const otra = clase('c2', '2026-10-09T07:00:00Z');
const plan = (r: Reserva[], c: Clase[], m: MapaEventos) => planCalendario(r, c, m, AHORA, datos);

test('crea las reservas confirmadas futuras que aún no están en el calendario', () => {
  const p = plan([reserva('c1'), reserva('c2')], [futura, otra], { c2: apuntada(otra, 'ev2') });
  assert.deepEqual(p.crear.map((c) => c.id), ['c1']);
  assert.deepEqual([p.quitar, p.actualizar, p.olvidar], [[], [], []]);
});

test('quita la que canceló o pasó a lista de espera, aunque la clase ya no salga en el catálogo', () => {
  assert.deepEqual(plan([reserva('c1', 'cancelada')], [futura], { c1: apuntada(futura, 'ev1') }).quitar, [['c1', 'ev1']]);
  assert.deepEqual(plan([reserva('c1', 'en-espera')], [futura], { c1: apuntada(futura, 'ev1') }).quitar, [['c1', 'ev1']]);
  assert.deepEqual(plan([reserva('c9', 'cancelada')], [], { c9: { id: 'ev9', huella: '' } }).quitar, [['c9', 'ev9']]);
});

test('asistida o no-asistida se OLVIDA, aunque la clase no esté en el catálogo (clases = [])', () => {
  for (const e of ['asistida', 'no-asistida'] as const) {
    const p = plan([reserva('c0', e)], [], { c0: { id: 'ev0', huella: '' } });
    assert.deepEqual(p.quitar, [], e);
    assert.deepEqual(p.olvidar, ['c0'], e);
  }
});

test('la de hoy en la que ya fichó ANTES de empezar (asistida y la clase aún por venir) no se borra', () => {
  const p = plan([reserva('c1', 'asistida')], [futura], { c1: apuntada(futura, 'ev1') });
  assert.deepEqual(p.quitar, []);
  assert.deepEqual(p.olvidar, ['c1']);
});

test('confirmada cuya clase ya no sale en el catálogo (ya pasó): se olvida, no se borra', () => {
  const p = plan([reserva('c0')], [], { c0: { id: 'ev0', huella: '' } });
  assert.deepEqual(p.quitar, []);
  assert.deepEqual(p.olvidar, ['c0']);
});

test('una clase futura visible sin reserva suya: se quita', () => {
  assert.deepEqual(plan([], [futura], { c1: apuntada(futura, 'ev1') }).quitar, [['c1', 'ev1']]);
});

test('lo que no se ve en el catálogo (ni clase ni reserva) no se toca', () => {
  const p = plan([], [], { lejos: { id: 'evX', huella: '' } });
  assert.deepEqual([p.quitar, p.olvidar, p.crear, p.actualizar], [[], [], [], []]);
});

test('si el estudio cambia la hora de la clase, el evento se actualiza', () => {
  const movida = clase('c1', '2026-10-08T08:00:00Z');
  const p = plan([reserva('c1')], [movida], { c1: apuntada(futura, 'ev1') });
  assert.deepEqual(p.actualizar.map(([c, id]) => [c.id, id]), [['c1', 'ev1']]);
  assert.deepEqual(p.crear, []);
});

test('una clase que ya empezó no se crea', () => {
  const empezada = clase('c3', '2026-10-07T11:30:00Z');
  assert.deepEqual(plan([reserva('c3')], [empezada], {}).crear, []);
});

// ── Por persona ────────────────────────────────────────────────────────────

function almacen() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

test('la memoria es por persona: el mapa de A no le sirve a B para crear ni borrar nada', () => {
  const a = almacen();
  guardarAjuste('alma', 'user-a', { activo: true, mapa: { c1: apuntada(futura, 'ev-de-a') } }, a);
  const deB = leerAjuste('alma', 'user-b', a);
  assert.deepEqual(deB, { activo: false, mapa: {} });
  // Y aunque B tuviera el interruptor encendido, su plan con sus reservas no ve
  // los eventos de A: no puede borrarlos.
  const p = plan([reserva('c1', 'cancelada')], [futura], deB.mapa);
  assert.deepEqual([p.quitar, p.crear], [[], []]);
});

test('sin persona no hay clave: ni se lee ni se guarda nada', () => {
  const a = almacen();
  assert.equal(claveCalendario('alma', null), null);
  guardarAjuste('alma', null, { activo: true, mapa: {} }, a);
  assert.equal(a.m.size, 0);
});

test('cerrar sesión borra su memoria', () => {
  const a = almacen();
  guardarAjuste('alma', 'user-a', { activo: true, mapa: {} }, a);
  borrarAjuste('alma', 'user-a', a);
  assert.equal(a.m.size, 0);
});

test('textoTrasActivar dice lo que pasó, no «ya están» por defecto', () => {
  const base = { omitida: false, creados: 0, actualizados: 0, quitados: 0, fallidos: 0 };
  assert.match(textoTrasActivar({ ...base, creados: 3 }), /Tus 3 reservas ya están/);
  assert.match(textoTrasActivar({ ...base, creados: 1 }), /Tu reserva ya está/);
  assert.match(textoTrasActivar({ ...base, creados: 1, fallidos: 2 }), /Añadidas 1 de 3/);
  assert.match(textoTrasActivar({ ...base, fallidos: 2 }), /no ha aceptado/);
  assert.match(textoTrasActivar(base), /no tienes reservas que añadir/);
  assert.doesNotMatch(textoTrasActivar({ ...base, omitida: true }), /ya están/);
});
