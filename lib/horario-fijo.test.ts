import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirHorario, textoRepeticion } from './horario-fijo.ts';
import type { PlazaFija } from './types.ts';

// Martes 15-sep-2026 08:00 en Madrid (06:00Z). Septiembre = UTC+2.
const AHORA = Date.parse('2026-09-15T06:00:00Z');

type Cambios = Partial<{ serieId: string | null; salaId: string; instructorId: string; aforoMaximo: number; cancelada: boolean }>;
const sesion = (id: string, inicioZ: string, o: Cambios = {}) => ({
  id, salaId: 'sala-1', tipoClaseId: 'tc-1', instructorId: 'ins-1', inicio: inicioZ,
  fin: new Date(Date.parse(inicioZ) + 50 * 60_000).toISOString(), aforoMaximo: 8, cancelada: false,
  serieId: 'serie-a' as string | null, ...o,
});

const plaza = (o: Partial<PlazaFija> = {}): PlazaFija => ({
  id: 'pf-1', studioId: 's', socioId: 'soc-1', diaSemana: 2, horaInicio: '18:00:00', salaId: 'sala-1',
  tipoClaseId: null, spotId: null, vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'ACTIVA',
  creadaEn: '2026-01-01T00:00:00Z', ...o,
});

// Serie A: martes 18:00 (16:00Z) tres semanas; serie B: lunes 09:30 y miércoles 09:30.
const SESIONES = [
  sesion('a1', '2026-09-15T16:00:00Z'),
  sesion('a2', '2026-09-22T16:00:00Z'),
  sesion('a3', '2026-09-29T16:00:00Z'),
  sesion('b-lun', '2026-09-21T07:30:00Z', { serieId: 'serie-b', salaId: 'sala-2' }),
  sesion('b-mie', '2026-09-16T07:30:00Z', { serieId: 'serie-b', salaId: 'sala-2' }),
  sesion('b-mie2', '2026-09-23T07:30:00Z', { serieId: 'serie-b', salaId: 'sala-2' }),
  sesion('pasada', '2026-09-08T16:00:00Z'),
  sesion('cancelada', '2026-10-06T16:00:00Z', { cancelada: true }),
  sesion('suelta', '2026-09-17T16:00:00Z', { serieId: null }),
];
const SERIES = [
  { id: 'serie-a', renovacionAutomatica: true, noRenovar: false },
  { id: 'serie-b', renovacionAutomatica: false, noRenovar: true },
];

test('agrupa por serie y día de la semana, lunes primero, sin pasadas, canceladas ni sueltas', () => {
  const h = construirHorario(SESIONES, SERIES, [], AHORA);
  assert.deepEqual(h.dias.map(d => d.diaSemana), [1, 2, 3]);
  const martes = h.dias[1].tarjetas[0];
  assert.equal(martes.serieId, 'serie-a');
  assert.equal(martes.hora, '18:00');
  assert.equal(martes.duracionMin, 50);
  assert.equal(martes.clasesFuturas, 3);
  assert.equal(martes.proximaSesionId, 'a1');
  assert.equal(martes.ultimaFecha, '2026-09-29');
  assert.equal(martes.renovacionAutomatica, true);
  const miercoles = h.dias[2].tarjetas[0];
  assert.equal(miercoles.serieId, 'serie-b');
  assert.equal(miercoles.clasesFuturas, 2);
  assert.equal(miercoles.noRenovar, true);
  assert.equal(h.dias[0].tarjetas[0].hora, '09:30');
});

test('la plantilla es la última clase: si la serie se movió de hora, manda la hora nueva y su próxima', () => {
  const movida = [
    sesion('m1', '2026-09-15T16:00:00Z'),          // 18:00 (vieja)
    sesion('m2', '2026-09-22T17:00:00Z'),          // 19:00 (nueva)
    sesion('m3', '2026-09-29T17:00:00Z', { aforoMaximo: 10, instructorId: 'ins-2' }),
  ];
  const t = construirHorario(movida, SERIES, [], AHORA).dias[0].tarjetas[0];
  assert.equal(t.hora, '19:00');
  assert.equal(t.proximaSesionId, 'm2');
  assert.equal(t.aforo, 10);
  assert.equal(t.instructorId, 'ins-2');
});

test('empareja plazas fijas por hueco y marca las que están en pausa', () => {
  const plazas = [
    plaza({ id: 'activa' }),
    plaza({ id: 'pausada', socioId: 'soc-2', estado: 'PAUSADA' }),
    plaza({ id: 'con-fechas', socioId: 'soc-3', pausaDesde: '2026-09-10', pausaHasta: '2026-09-20' }),
    plaza({ id: 'otra-hora', socioId: 'soc-4', horaInicio: '19:00:00' }),
    plaza({ id: 'baja', socioId: 'soc-5', estado: 'BAJA' }),
    plaza({ id: 'terminada', socioId: 'soc-6', vigenciaHasta: '2026-09-01' }),
  ];
  const t = construirHorario(SESIONES, SERIES, plazas, AHORA).dias[1].tarjetas[0];
  assert.deepEqual(t.plazasFijas, [
    { id: 'activa', socioId: 'soc-1', enPausa: false },
    { id: 'pausada', socioId: 'soc-2', enPausa: true },
    { id: 'con-fechas', socioId: 'soc-3', enPausa: true },
  ]);
});

test('una plaza fija cuyo hueco ya no tiene clase sale como huérfana', () => {
  // Hay horario hasta finales de septiembre; los viernes 10:00 no hay ninguna clase.
  const largas = [...SESIONES, sesion('lejos', '2026-10-27T16:00:00Z')];
  const h = construirHorario(largas, SERIES, [plaza({ id: 'huerfana', diaSemana: 5, horaInicio: '10:00:00' })], AHORA);
  assert.deepEqual(h.huerfanas.map(p => p.id), ['huerfana']);
});

test('textoRepeticion: con el horario cargado dice hasta cuándo', () => {
  const h = construirHorario(SESIONES, SERIES, [], AHORA);
  assert.equal(textoRepeticion('2026-09-22T16:00:00Z', 'serie-a', h), 'Se repite cada martes hasta el 29/09/2026');
  assert.equal(textoRepeticion('2026-09-22T16:00:00Z', 'serie-a', null), 'Se repite cada martes');
});
