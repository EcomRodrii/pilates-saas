// A quién cuenta un reto y desde cuándo. Runner nativo de Node: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  alcanceDe, diaMadrid, leCuentaElReto, puedeApuntarse, referidasDelReto, reservasDelReto,
  retoEnMarcha, retoTerminado, ventanaDelReto,
} from './alcance-reto.ts';

// El panel guarda el inicio como medianoche UTC y el fin a las 23:59:59 del navegador.
const RETO = { fechaInicio: '2026-10-17T00:00:00.000Z', fechaFin: '2026-10-23T21:59:59.000Z' };

test('alcance: lo que no es ESTUDIO es INSCRIPCION', () => {
  assert.equal(alcanceDe('ESTUDIO'), 'ESTUDIO');
  assert.equal(alcanceDe('INSCRIPCION'), 'INSCRIPCION');
  assert.equal(alcanceDe(undefined), 'INSCRIPCION');
  assert.equal(alcanceDe(null), 'INSCRIPCION');
  assert.equal(alcanceDe('cualquier cosa'), 'INSCRIPCION');
});

test('G-09: el reto está en marcha desde las 00:00 de Madrid del día de inicio', () => {
  // 17-oct 00:30 en Madrid (CEST) = 16-oct 22:30 UTC: ya es el día de inicio.
  assert.equal(retoEnMarcha(RETO, new Date('2026-10-16T22:30:00Z')), true);
  // 16-oct 23:30 en Madrid: todavía no.
  assert.equal(retoEnMarcha(RETO, new Date('2026-10-16T21:30:00Z')), false);
  // El último día cuenta entero, hasta las 23:59 de Madrid.
  assert.equal(retoEnMarcha(RETO, new Date('2026-10-23T21:30:00Z')), true);
  assert.equal(retoEnMarcha(RETO, new Date('2026-10-23T22:30:00Z')), false);
  assert.equal(retoTerminado(RETO, new Date('2026-10-23T22:30:00Z')), true);
  assert.equal(retoTerminado(RETO, new Date('2026-10-23T12:00:00Z')), false);
});

test('diaMadrid acepta día suelto e instante', () => {
  assert.equal(diaMadrid('2026-10-17'), '2026-10-17');
  assert.equal(diaMadrid('2026-10-17T00:00:00.000Z'), '2026-10-17');
  assert.equal(diaMadrid('2026-10-16T22:30:00Z'), '2026-10-17');
});

test('un reto con inscripción solo se evalúa para quien se apuntó y no se dio de baja', () => {
  assert.equal(leCuentaElReto('INSCRIPCION', null), false);
  assert.equal(leCuentaElReto('INSCRIPCION', undefined), false);
  assert.equal(leCuentaElReto('INSCRIPCION', { creadaEn: '2026-10-18T10:00:00Z' }), true);
  assert.equal(leCuentaElReto('INSCRIPCION', { creadaEn: '2026-10-18T10:00:00Z', bajaEn: '2026-10-19T10:00:00Z' }), false);
  // «Del estudio» cuenta a todas, se hayan apuntado o no.
  assert.equal(leCuentaElReto('ESTUDIO', null), true);
});

test('la ventana empieza al apuntarse, nunca antes del inicio ni después del fin', () => {
  const sin = ventanaDelReto(RETO);
  assert.equal(sin.desde.toISOString(), '2026-10-16T22:00:00.000Z'); // 00:00 de Madrid del 17
  assert.equal(sin.hasta.toISOString(), '2026-10-23T22:00:00.000Z'); // fin del día 23 en Madrid
  assert.equal(sin.diaDesde, '2026-10-17');
  assert.equal(sin.diaHasta, '2026-10-23');
  // Se apunta a mitad: cuenta desde ese instante.
  const tarde = ventanaDelReto(RETO, '2026-10-20T10:00:00.000Z');
  assert.equal(tarde.desde.toISOString(), '2026-10-20T10:00:00.000Z');
  assert.equal(tarde.diaDesde, '2026-10-20');
  // Se apuntó antes de que empezara: no adelanta nada.
  const pronto = ventanaDelReto(RETO, '2026-10-01T10:00:00.000Z');
  assert.equal(pronto.desde.toISOString(), sin.desde.toISOString());
});

test('solo cuentan las clases desde la inscripción', () => {
  const ini = new Map([
    ['antes', '2026-10-18T09:00:00Z'],
    ['despues', '2026-10-21T09:00:00Z'],
    ['fuera', '2026-10-30T09:00:00Z'],
  ]);
  const reservas = [
    { sesionId: 'antes', estado: 'ASISTIDA' },
    { sesionId: 'despues', estado: 'ASISTIDA' },
    { sesionId: 'fuera', estado: 'ASISTIDA' },
    { sesionId: 'inexistente', estado: 'ASISTIDA' },
  ];
  const v = ventanaDelReto(RETO, '2026-10-20T10:00:00Z');
  assert.deepEqual(reservasDelReto('CLASES_ASISTIDAS', reservas, ini, v).map((r) => r.sesionId), ['despues']);
  // Del estudio (sin inscripción): desde el inicio.
  const todas = reservasDelReto('CLASES_ASISTIDAS', reservas, ini, ventanaDelReto(RETO));
  assert.deepEqual(todas.map((r) => r.sesionId), ['antes', 'despues']);
});

test('G-07 en retos: reservar y cancelar no suma «reservas totales»', () => {
  const ini = new Map([['a', '2026-10-21T09:00:00Z'], ['b', '2026-10-21T10:00:00Z'], ['c', '2026-10-21T11:00:00Z'], ['d', '2026-10-21T12:00:00Z'], ['e', '2026-10-21T13:00:00Z']]);
  const reservas = [
    { sesionId: 'a', estado: 'CONFIRMADA' }, { sesionId: 'b', estado: 'ASISTIDA' },
    { sesionId: 'c', estado: 'CANCELADA' }, { sesionId: 'd', estado: 'LISTA_ESPERA' },
    { sesionId: 'e', estado: 'PENDIENTE_APROBACION' },
  ];
  const v = ventanaDelReto(RETO);
  assert.deepEqual(reservasDelReto('RESERVAS_TOTALES', reservas, ini, v).map((r) => r.sesionId), ['a', 'b']);
  // Otras métricas no cambian de criterio aquí (CLASES_ASISTIDAS ya filtra por ASISTIDA después).
  assert.equal(reservasDelReto('CLASES_ASISTIDAS', reservas, ini, v).length, 5);
});

test('G-08: «invitar amigas» cuenta las altas dentro de la ventana, no las de la historia', () => {
  const referidas = [
    { fechaAlta: '2026-01-05' },               // anterior al reto
    { fechaAlta: '2026-10-18' },               // dentro
    { fechaAlta: '2026-10-22T08:00:00Z' },     // dentro
    { fechaAlta: '2026-11-02' },               // posterior
  ];
  assert.equal(referidasDelReto(referidas, ventanaDelReto(RETO)).length, 2);
  // Con inscripción el 20: solo la del 22.
  assert.equal(referidasDelReto(referidas, ventanaDelReto(RETO, '2026-10-20T10:00:00Z')).length, 1);
});

test('cambio de hora: el último día del reto cuenta entero (25 h en octubre, 23 h en marzo)', () => {
  const vo = ventanaDelReto({ fechaInicio: '2026-10-20', fechaFin: '2026-10-25' });
  assert.equal(vo.hasta.toISOString(), '2026-10-25T23:00:00.000Z');
  const ini = new Map([['tarde', '2026-10-25T22:30:00Z']]); // 23:30 locales
  assert.equal(reservasDelReto('CLASES_ASISTIDAS', [{ sesionId: 'tarde', estado: 'ASISTIDA' }], ini, vo).length, 1);
  const mar = ventanaDelReto({ fechaInicio: '2027-03-22', fechaFin: '2027-03-28' });
  assert.equal(mar.hasta.toISOString(), '2027-03-28T22:00:00.000Z');
});

test('una inscripción dada de baja y repetida conserva su fecha original', () => {
  // La fecha que usa el servidor es siempre created_at: no se pisa al volver a apuntarse.
  const v = ventanaDelReto(RETO, '2026-10-18T10:00:00Z');
  assert.equal(v.desde.toISOString(), '2026-10-18T10:00:00.000Z');
  assert.equal(leCuentaElReto('INSCRIPCION', { creadaEn: '2026-10-18T10:00:00Z', bajaEn: null }), true);
});

test('apuntarse: solo a un reto activo, con inscripción y sin terminar', () => {
  const ok = { ...RETO, activo: true, alcance: 'INSCRIPCION' as const };
  const ahora = new Date('2026-10-20T10:00:00Z');
  assert.deepEqual(puedeApuntarse(ok, ahora), { ok: true });
  assert.equal(puedeApuntarse({ ...ok, alcance: 'ESTUDIO' }, ahora).ok, false);
  assert.equal(puedeApuntarse({ ...ok, activo: false }, ahora).ok, false);
  assert.equal(puedeApuntarse(ok, new Date('2026-11-01T10:00:00Z')).ok, false);
  // Antes de que empiece sí se puede (cuenta desde el inicio).
  assert.deepEqual(puedeApuntarse(ok, new Date('2026-10-10T10:00:00Z')), { ok: true });
});
