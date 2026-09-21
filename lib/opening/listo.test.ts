import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bloqueantesPendientes, evaluarListo, ventanaListo, type DatosListo } from './listo.ts';
import { detectarAlertas } from './alertas.ts';
import type { AnalisisCapacidad } from './capacidad.ts';

const now = new Date('2026-10-20T10:00:00Z');
const clase = { inicio: '2026-11-02T09:00:00Z', cancelada: false, tipoClaseId: 'tc-1', instructorId: 'ins-1', aforoMaximo: 8 };

// Un estudio listo: lo que cada prueba rompe es lo único que cambia.
const listo = (p: Partial<DatosListo> = {}): DatosListo => ({
  sesiones: [clase],
  slug: 'mi-estudio',
  exigirPlan: true,
  planes: [{ id: 'p1', activo: true, precio: 60 }],
  tiposPorPlan: {},
  stripe: 'PUEDE',
  // NIF con letra de control correcta (12345678 % 23 = 14 → Z).
  fiscal: { nif: '12345678Z', razonSocial: 'Estudio SL', direccion: 'Calle 1', codigoPostal: '28001', ciudad: 'Madrid' },
  antelacionMaximaDias: null,
  ...p,
});
const todo = () => true;
const estado = (d: DatosListo, id: string) => evaluarListo(d, now, todo).find(c => c.id === id)?.estado;

test('un estudio con todo en orden no tiene nada pendiente', () => {
  const cs = evaluarListo(listo(), now, todo);
  assert.ok(cs.every(c => c.estado === 'OK'));
  assert.deepEqual(bloqueantesPendientes(cs), []);
});

test('clases: canceladas o sin instructora no cuentan como reservables', () => {
  assert.equal(estado(listo({ sesiones: [] }), 'clases'), 'FALTA');
  assert.equal(estado(listo({ sesiones: [{ ...clase, cancelada: true }] }), 'clases'), 'FALTA');
  const c = evaluarListo(listo({ sesiones: [{ ...clase, instructorId: null }] }), now, todo).find(x => x.id === 'clases')!;
  assert.equal(c.estado, 'FALTA');
  assert.match(c.detalle, /1 clase sin instructora/);
});

test('venta: un plan que no cubre las clases no vale si se exige plan; sin exigirlo, no bloquea', () => {
  const noCubre = listo({ tiposPorPlan: { p1: ['otro-tipo'] } });
  assert.equal(estado(noCubre, 'venta'), 'FALTA');
  assert.equal(estado(listo({ tiposPorPlan: { p1: ['tc-1'] } }), 'venta'), 'OK');
  // Precio 0 o inactivo: el checkout lo rechaza, así que no es «algo que vender».
  assert.equal(estado(listo({ planes: [{ id: 'p1', activo: true, precio: 0 }] }), 'venta'), 'FALTA');
  const sinExigir = evaluarListo(listo({ exigirPlan: false, planes: [] }), now, todo);
  assert.equal(sinExigir.find(c => c.id === 'venta')!.bloquea, false);
});

test('stripe: conectado pero sin charges_enabled falta; si no contesta, «sin comprobar», que ni pasa por hecho ni dispara la alerta', () => {
  assert.equal(estado(listo({ stripe: 'NO_PUEDE' }), 'stripe'), 'FALTA');
  assert.deepEqual(bloqueantesPendientes(evaluarListo(listo({ stripe: 'NO_PUEDE' }), now, todo)).map(c => c.id), ['stripe']);
  assert.equal(estado(listo({ stripe: 'SIN_CUENTA' }), 'stripe'), 'FALTA');
  const d = listo({ stripe: 'SIN_RESPUESTA' });
  assert.equal(estado(d, 'stripe'), 'SIN_COMPROBAR');
  assert.deepEqual(bloqueantesPendientes(evaluarListo(d, now, todo)), []);
  // Sin exigir plan se puede vender en el mostrador: recomienda, no bloquea.
  assert.deepEqual(bloqueantesPendientes(evaluarListo(listo({ stripe: 'SIN_CUENTA', exigirPlan: false }), now, todo)), []);
});

test('fiscal: el NIF de relleno del demo y los huecos en blanco no pasan', () => {
  const c = evaluarListo(listo({ fiscal: { nif: 'B12345678', razonSocial: ' ', direccion: 'Calle 1', codigoPostal: '28001', ciudad: null } }), now, todo)
    .find(x => x.id === 'fiscal')!;
  assert.equal(c.estado, 'FALTA');
  assert.match(c.detalle, /NIF válido, razón social, ciudad/);
});

test('antelación: avisa si la primera clase aún no se puede reservar, sin bloquear', () => {
  const c = evaluarListo(listo({ antelacionMaximaDias: 7 }), now, todo).find(x => x.id === 'antelacion')!;
  assert.equal(c.estado, 'FALTA');
  assert.equal(c.bloquea, false);
  assert.equal(estado(listo({ antelacionMaximaDias: 30 }), 'antelacion'), 'OK');
  // Sin clases no hay nada que mirar: no sale, en vez de salir como OK.
  assert.equal(estado(listo({ sesiones: [], antelacionMaximaDias: 7 }), 'antelacion'), undefined);
});

test('sin permiso para la pantalla que lo arregla, el punto sale sin enlace', () => {
  const cs = evaluarListo(listo({ stripe: 'NO_PUEDE' }), now, h => !h.includes('tab=cobros'));
  assert.equal(cs.find(c => c.id === 'stripe')!.href, null);
  assert.equal(cs.find(c => c.id === 'clases')!.href, '/calendario');
});

test('ventana: la semana de apertura en hora del estudio; sin fecha, 14 días desde hoy', () => {
  const v = ventanaListo('2026-11-02', now);
  assert.equal(v.desde.toISOString(), '2026-11-01T23:00:00.000Z');
  assert.equal(v.hasta.getTime() - v.desde.getTime(), 7 * 86_400_000);
  assert.equal(ventanaListo('2026-10-01', now).desde.getTime(), now.getTime());
  assert.equal(ventanaListo(null, now).hasta.getTime() - now.getTime(), 14 * 86_400_000);
});

const analisis = { riesgo: 'VERDE', ocupacionPrevista: 0.5, ventana: { dias: 42 } } as unknown as AnalisisCapacidad;
const alertas = (dias: number | null, pendientes: string[], riesgo = 'VERDE') => detectarAlertas({
  diasHastaApertura: dias, analisis: { ...analisis, riesgo } as AnalisisCapacidad, etapas: [], planActivo: new Map(),
  objetivoPreventa: 0, pendientesListo: pendientes as never,
}).map(a => a.tipo);

test('alerta: a 7 días o menos con algo imprescindible pendiente; no antes, ni sin fecha', () => {
  assert.ok(alertas(7, ['fiscal']).includes('APERTURA_NO_LISTA'));
  assert.ok(!alertas(8, ['fiscal']).includes('APERTURA_NO_LISTA'));
  assert.ok(!alertas(null, ['fiscal']).includes('APERTURA_NO_LISTA'));
  assert.ok(!alertas(3, []).includes('APERTURA_NO_LISTA'));
});

test('alerta: si lo único que falta son las clases y ya avisa SIN_HORARIO, no se duplica', () => {
  assert.deepEqual(alertas(3, ['clases'], 'SIN_OFERTA'), ['SIN_HORARIO']);
  assert.ok(alertas(3, ['clases', 'stripe'], 'SIN_OFERTA').includes('APERTURA_NO_LISTA'));
});
