import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reservasARetirarDePlaza } from './plazas-fijas-retirada.ts';
import { franjaLocalDe } from './utils.ts';
import { horaInicioLocalDe } from './plazas-fijas-slot.ts';
import type { PlazaFija, Reserva } from './types.ts';

// Martes 2026-09-01 07:00 UTC. La clase de la plaza es ese mismo martes a las
// 10:00 UTC (dentro de 3 h) y se repite cada semana.
const AHORA = Date.parse('2026-09-01T07:00:00Z');
const HOY_10 = '2026-09-01T10:00:00Z';
const SEMANA_QUE_VIENE = '2026-09-08T10:00:00Z';
const DENTRO_DE_DOS = '2026-09-15T10:00:00Z';
const FRANJA = franjaLocalDe(HOY_10);

const pf: PlazaFija = {
  id: 'pf-1', studioId: 's', socioId: 'soc-1', diaSemana: FRANJA.dow, horaInicio: horaInicioLocalDe(HOY_10),
  salaId: 'sala-1', tipoClaseId: null, spotId: null, vigenciaDesde: '2026-01-01', vigenciaHasta: null,
  estado: 'ACTIVA', creadaEn: '2026-01-01T00:00:00Z',
} as PlazaFija;

const sesiones = [
  { id: 'hoy', salaId: 'sala-1', tipoClaseId: 'tc', inicio: HOY_10 },
  { id: 'sig', salaId: 'sala-1', tipoClaseId: 'tc', inicio: SEMANA_QUE_VIENE },
  { id: 'sig2', salaId: 'sala-1', tipoClaseId: 'tc', inicio: DENTRO_DE_DOS },
  { id: 'pasada', salaId: 'sala-1', tipoClaseId: 'tc', inicio: '2026-08-25T10:00:00Z' },
  { id: 'otra-hora', salaId: 'sala-1', tipoClaseId: 'tc', inicio: '2026-09-08T12:00:00Z' },
  { id: 'otra-sala', salaId: 'sala-2', tipoClaseId: 'tc', inicio: SEMANA_QUE_VIENE },
  { id: 'cancelada', salaId: 'sala-1', tipoClaseId: 'tc', inicio: '2026-09-22T10:00:00Z', cancelada: true },
];

const res = (id: string, sesionId: string, o: Partial<Reserva> = {}) =>
  ({ id, sesionId, socioId: 'soc-1', estado: 'CONFIRMADA', ...o }) as Pick<Reserva, 'id' | 'sesionId' | 'socioId' | 'estado'>;

const ventana12h = () => 12;

test('suelta sus clases futuras del horario y mantiene la que ya está dentro del plazo', () => {
  const r = reservasARetirarDePlaza(pf, sesiones, [res('r-hoy', 'hoy'), res('r-sig', 'sig'), res('r-sig2', 'sig2')], AHORA, ventana12h);
  assert.deepEqual(r.retirar, ['r-sig', 'r-sig2']);
  assert.deepEqual(r.mantener, ['r-hoy']);
});

test('sin plazo de cancelación (ventana 0) se suelta también la de hoy', () => {
  const r = reservasARetirarDePlaza(pf, sesiones, [res('r-hoy', 'hoy')], AHORA, () => 0);
  assert.deepEqual(r.retirar, ['r-hoy']);
  assert.deepEqual(r.mantener, []);
});

test('la lista de espera se suelta aunque la clase sea dentro de 3 h: salir de la cola no tiene plazo', () => {
  const r = reservasARetirarDePlaza(pf, sesiones, [res('r-espera', 'hoy', { estado: 'LISTA_ESPERA' })], AHORA, ventana12h);
  assert.deepEqual(r.retirar, ['r-espera']);
});

test('no toca nada fuera de su plaza: otra socia, otra hora, otra sala, pasadas, canceladas ni reservas ya cerradas', () => {
  const r = reservasARetirarDePlaza(pf, sesiones, [
    res('otra-socia', 'sig', { socioId: 'soc-2' }),
    res('r-otra-hora', 'otra-hora'),
    res('r-otra-sala', 'otra-sala'),
    res('r-pasada', 'pasada'),
    res('r-cancelada-sesion', 'cancelada'),
    res('r-ya-cancelada', 'sig', { estado: 'CANCELADA' }),
    res('r-sin-sesion', 'no-existe'),
  ], AHORA, ventana12h);
  assert.deepEqual(r, { retirar: [], mantener: [] });
});

test('respeta la vigencia: una clase después de «hasta» no es de la plaza', () => {
  const conFin = { ...pf, vigenciaHasta: '2026-09-10' };
  const r = reservasARetirarDePlaza(conFin, sesiones, [res('r-sig', 'sig'), res('r-sig2', 'sig2')], AHORA, ventana12h);
  assert.deepEqual(r.retirar, ['r-sig']);
});
