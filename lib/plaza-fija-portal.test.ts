import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esSlotRecurrente, yaTienePlazaFijaEnSlot } from './plaza-fija-portal.ts';
import { franjaLocalDe } from './utils.ts';
import type { PlazaFija, Sesion } from './types.ts';

const AHORA = new Date('2026-09-01T09:00:00Z'); // martes

const ses = (o: Partial<Sesion> & { id: string; inicio: string }): Sesion => ({
  studioId: 's', tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-1',
  fin: o.inicio, aforoMaximo: 10, cancelada: false, notas: null, precioPuntual: null, ...o,
} as Sesion);

// Martes 10:00 UTC — la hora local exacta depende de TZ_ESTUDIO/DST, así que
// diaSemana/horaInicio se derivan de la MISMA franjaLocalDe que usa el código
// bajo test, en vez de asumir un offset a mano (frágil ante cambio de hora).
const HOY_10 = ses({ id: 'ses-hoy', inicio: '2026-09-01T10:00:00Z' });
const FRANJA_HOY_10 = franjaLocalDe(HOY_10.inicio);
const HORA_INICIO_HOY_10 = `${String(FRANJA_HOY_10.hora).padStart(2, '0')}:${String(FRANJA_HOY_10.minuto).padStart(2, '0')}:00`;

const pf = (o: Partial<PlazaFija> & { id: string }): PlazaFija => ({
  studioId: 's', socioId: 'soc-1', diaSemana: FRANJA_HOY_10.dow, horaInicio: HORA_INICIO_HOY_10, salaId: 'sala-1',
  tipoClaseId: null, spotId: null, vigenciaDesde: '2026-01-01', vigenciaHasta: null,
  estado: 'ACTIVA', creadaEn: '2026-01-01T00:00:00Z', ...o,
} as PlazaFija);

test('esSlotRecurrente: false si no hay ninguna otra sesión futura con el mismo slot', () => {
  assert.equal(esSlotRecurrente(HOY_10, [HOY_10], AHORA), false);
});

test('esSlotRecurrente: true si otra sesión futura repite sala+día+hora locales', () => {
  const semanaQueViene = ses({ id: 'ses-otra', inicio: '2026-09-08T10:00:00Z' }); // mismo martes, misma hora
  assert.equal(esSlotRecurrente(HOY_10, [HOY_10, semanaQueViene], AHORA), true);
});

test('esSlotRecurrente: false si la otra sesión es en OTRA sala', () => {
  const otraSala = ses({ id: 'ses-otra-sala', inicio: '2026-09-08T10:00:00Z', salaId: 'sala-2' });
  assert.equal(esSlotRecurrente(HOY_10, [HOY_10, otraSala], AHORA), false);
});

test('esSlotRecurrente: false si la otra sesión con el mismo slot está CANCELADA', () => {
  const cancelada = ses({ id: 'ses-cancelada', inicio: '2026-09-08T10:00:00Z', cancelada: true });
  assert.equal(esSlotRecurrente(HOY_10, [HOY_10, cancelada], AHORA), false);
});

test('esSlotRecurrente: false si la otra sesión con el mismo slot ya pasó', () => {
  const pasada = ses({ id: 'ses-pasada', inicio: '2026-08-25T10:00:00Z' }); // martes anterior
  assert.equal(esSlotRecurrente(HOY_10, [HOY_10, pasada], AHORA), false);
});

test('yaTienePlazaFijaEnSlot: false sin ninguna plaza fija', () => {
  assert.equal(yaTienePlazaFijaEnSlot(HOY_10, 'soc-1', []), false);
});

test('yaTienePlazaFijaEnSlot: true con una ACTIVA en el mismo slot', () => {
  assert.equal(yaTienePlazaFijaEnSlot(HOY_10, 'soc-1', [pf({ id: 'pf-1' })]), true);
});

// El bug real que encontró QA: pausar y volver a la misma clase reaparecía
// el botón porque el gate solo miraba ACTIVA.
test('yaTienePlazaFijaEnSlot: true también con una PAUSADA en el mismo slot', () => {
  assert.equal(yaTienePlazaFijaEnSlot(HOY_10, 'soc-1', [pf({ id: 'pf-1', estado: 'PAUSADA' })]), true);
});

test('yaTienePlazaFijaEnSlot: false con una BAJA en el mismo slot (ya no cuenta)', () => {
  assert.equal(yaTienePlazaFijaEnSlot(HOY_10, 'soc-1', [pf({ id: 'pf-1', estado: 'BAJA' })]), false);
});

test('yaTienePlazaFijaEnSlot: false si la plaza fija es de OTRA socia', () => {
  assert.equal(yaTienePlazaFijaEnSlot(HOY_10, 'soc-1', [pf({ id: 'pf-1', socioId: 'soc-2' })]), false);
});

test('yaTienePlazaFijaEnSlot: false si la plaza fija es de otro día/hora/sala', () => {
  assert.equal(yaTienePlazaFijaEnSlot(HOY_10, 'soc-1', [pf({ id: 'pf-1', diaSemana: 3 })]), false);
});
