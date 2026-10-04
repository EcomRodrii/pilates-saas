import { test } from 'node:test';
import assert from 'node:assert/strict';
import { proyectarClasesSueltas, type SociaMin } from './clases-fijas.ts';
import type { FranjaSuelta } from '../clases-fijas-reglas.ts';

const planMensual = { id: 'plan-1', tipo: 'MENSUAL', tiposClaseIds: [] as string[] };
const cuota = { planId: 'plan-1', estado: 'ACTIVA', fechaFin: null };
const socia = (cambios: Partial<SociaMin> = {}): SociaMin => ({ suscripciones: [cuota], plazasFijas: [], ...cambios });
const HOY = '2026-09-21';

// ─── Las clases que se repiten, con lo que ella ya tiene de cada una ───

const suelta = (cambios: Partial<FranjaSuelta> = {}): FranjaSuelta => ({
  serieId: 'serie-1', diaSemana: 1, hora: '18:00', tipoClaseId: 'tc-1', salaId: 'sala-1',
  instructorId: null, tipo: 'Reformer', sala: 'Sala 1', instructora: null,
  proximaSesionId: 'ses-1', ultimaFecha: '2027-01-30', ...cambios,
});

test('sin sesión de alumna, se ofrece pedirla (no se la riñe por su cuota)', () => {
  const [v] = proyectarClasesSueltas([suelta()], null, [planMensual], HOY);
  assert.deepEqual(v.estado, { estado: 'PUEDE_PEDIR' });
});

test('con cuota que la cubre, se puede pedir; sin ella, se dice por qué', () => {
  const [conCuota] = proyectarClasesSueltas([suelta()], socia(), [planMensual], HOY);
  assert.deepEqual(conCuota.estado, { estado: 'PUEDE_PEDIR' });
  const [sinCuota] = proyectarClasesSueltas([suelta()], socia({ suscripciones: [] }), [planMensual], HOY);
  assert.deepEqual(sinCuota.estado, { estado: 'SOLO_CON_CUOTA' });
});

test('ya la tiene o ya la ha pedido: se refleja en su estado', () => {
  const plaza = { diaSemana: 1, horaInicio: '18:00:00', salaId: 'sala-1', tipoClaseId: 'tc-1', estado: 'ACTIVA', vigenciaHasta: null };
  const [yaLaTiene] = proyectarClasesSueltas([suelta()], socia({ plazasFijas: [plaza] }), [planMensual], HOY);
  assert.deepEqual(yaLaTiene.estado, { estado: 'TIENE_PLAZA' });

  const peticion = { id: 'spf-1', tipo: 'CREAR' as const, plazaId: null, diaSemana: 1, horaInicio: '18:00:00', salaId: 'sala-1', desde: null, hasta: null };
  const [pedida] = proyectarClasesSueltas([suelta()], socia({ peticionesPlazaFija: [peticion] }), [planMensual], HOY);
  assert.deepEqual(pedida.estado, { estado: 'PEDIDA', peticionId: 'spf-1' });
});

test('cada suelta lleva sus propios datos (día, hora, tipo, sala) intactos', () => {
  const [v] = proyectarClasesSueltas([suelta({ diaSemana: 3, hora: '09:30', tipo: 'Yoga', sala: 'Sala 2' })], socia(), [planMensual], HOY);
  assert.equal(v.diaSemana, 3);
  assert.equal(v.hora, '09:30');
  assert.equal(v.tipo, 'Yoga');
  assert.equal(v.sala, 'Sala 2');
});

