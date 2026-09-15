import { test } from 'node:test';
import assert from 'node:assert/strict';
import { franjasSemanales, plazaEnFranja } from './plazas-fijas-slot.ts';
import { horaInicioLocalDe } from './plazas-fijas-slot.ts';
import { franjaLocalDe } from './utils.ts';
import type { PlazaFija, Sesion } from './types.ts';

// Martes 2026-09-01 07:00 UTC. Las clases de referencia: martes a las 10:00 UTC.
const AHORA = Date.parse('2026-09-01T07:00:00Z');
const MARTES = '2026-09-01T10:00:00Z';
const SEMANA = 7 * 86_400_000;

const ses = (o: Partial<Sesion> & { id: string; inicio: string }): Sesion => ({
  studioId: 's', tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-1',
  fin: o.inicio, aforoMaximo: 8, cancelada: false, notas: null, precioPuntual: null, ...o,
} as Sesion);

const semanal = (n: number, o: Partial<Sesion> = {}, base = MARTES) =>
  Array.from({ length: n }, (_, i) => ses({ id: `${o.salaId ?? 'sala-1'}-${i}`, inicio: new Date(Date.parse(base) + i * SEMANA).toISOString(), ...o }));

const pf = (o: Partial<PlazaFija> & { id: string }): PlazaFija => ({
  studioId: 's', socioId: 'soc-1', diaSemana: franjaLocalDe(MARTES).dow, horaInicio: horaInicioLocalDe(MARTES),
  salaId: 'sala-1', tipoClaseId: 'tc-1', spotId: null, vigenciaDesde: '2026-01-01', vigenciaHasta: null,
  estado: 'ACTIVA', creadaEn: '2026-01-01T00:00:00Z', ...o,
} as PlazaFija);

test('una serie semanal es UNA franja, con su próxima clase y cuántas hay', () => {
  const [f, ...resto] = franjasSemanales(semanal(4), [], AHORA);
  assert.equal(resto.length, 0);
  assert.equal(f.clases, 4);
  assert.equal(f.proximaSesionId, 'sala-1-0');
  assert.equal(f.aforo, 8);
});

test('dos salas a la misma hora son dos franjas (la plaza se ancla por sala)', () => {
  const franjas = franjasSemanales([...semanal(2), ...semanal(2, { salaId: 'sala-2' })], [], AHORA);
  assert.equal(franjas.length, 2);
});

test('canceladas, pasadas y fuera del horizonte no cuentan', () => {
  const franjas = franjasSemanales([
    ses({ id: 'cancelada', inicio: MARTES, cancelada: true }),
    ses({ id: 'pasada', inicio: '2026-08-25T10:00:00Z' }),
    ses({ id: 'lejos', inicio: '2026-12-01T10:00:00Z' }),
  ], [], AHORA);
  assert.deepEqual(franjas, []);
});

test('reparte las plazas: activas, pausadas; ni bajas, ni otro tipo, ni terminadas', () => {
  const [f] = franjasSemanales(semanal(3), [
    pf({ id: 'activa' }),
    pf({ id: 'empieza-luego', vigenciaDesde: '2026-10-01' }),
    pf({ id: 'pausada', estado: 'PAUSADA' }),
    pf({ id: 'baja', estado: 'BAJA' }),
    pf({ id: 'otro-tipo', tipoClaseId: 'tc-2' }),
    pf({ id: 'terminada', vigenciaHasta: '2026-08-31' }),
    pf({ id: 'cualquier-tipo', tipoClaseId: null }),
  ], AHORA);
  assert.deepEqual(f.fijas.map(p => p.id), ['activa', 'empieza-luego', 'cualquier-tipo']);
  assert.deepEqual(f.pausadas.map(p => p.id), ['pausada']);
});

test('ordena lunes primero y el domingo al final', () => {
  const franjas = franjasSemanales([
    ses({ id: 'dom', inicio: '2026-09-06T10:00:00Z' }),
    ses({ id: 'mar', inicio: MARTES }),
    ses({ id: 'lun', inicio: '2026-09-07T10:00:00Z' }),
  ], [], AHORA);
  assert.deepEqual(franjas.map(f => f.proximaSesionId), ['lun', 'mar', 'dom']);
});

test('plazaEnFranja compara la hora normalizada', () => {
  const [f] = franjasSemanales(semanal(1), [], AHORA);
  assert.equal(plazaEnFranja(pf({ id: 'p', horaInicio: horaInicioLocalDe(MARTES).slice(0, 5) }), f), true);
  assert.equal(plazaEnFranja(pf({ id: 'p', salaId: 'sala-2' }), f), false);
});
