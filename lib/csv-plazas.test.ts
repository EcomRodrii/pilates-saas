import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoMapearPlazaFija, validarFilasPlazaFija, normalizarHora } from './csv.ts';

test('normalizarHora: acepta varios formatos', () => {
  assert.equal(normalizarHora('9:00'), '09:00');
  assert.equal(normalizarHora('09.30'), '09:30');
  assert.equal(normalizarHora('9h'), '09:00');
  assert.equal(normalizarHora('18'), '18:00');
  assert.equal(normalizarHora('25:00'), null);
  assert.equal(normalizarHora('abc'), null);
});

test('autoMapearPlazaFija: reconoce cabeceras comunes', () => {
  const m = autoMapearPlazaFija(['Correo', 'Día', 'Hora', 'Sala', 'Desde']);
  assert.equal(m.email, 0);
  assert.equal(m.dia_semana, 1);
  assert.equal(m.hora_inicio, 2);
  assert.equal(m.sala, 3);
  assert.equal(m.vigencia_desde, 4);
});

test('validarFilasPlazaFija: fila válida → ok con día/hora normalizados', () => {
  const mapeo = { email: 0, dia_semana: 1, hora_inicio: 2, sala: 3, vigencia_desde: -1 };
  const [f] = validarFilasPlazaFija([['Ana@Ej.com', 'Martes', '10h', 'Reformer']], mapeo);
  assert.equal(f.estado, 'ok');
  assert.equal(f.datos.email, 'ana@ej.com');
  assert.equal(f.datos.diaSemana, 2);       // martes
  assert.equal(f.datos.horaInicio, '10:00');
  assert.equal(f.datos.sala, 'Reformer');
});

test('validarFilasPlazaFija: errores por email/día/hora/sala faltantes o inválidos', () => {
  const mapeo = { email: 0, dia_semana: 1, hora_inicio: 2, sala: 3, vigencia_desde: -1 };
  const r = validarFilasPlazaFija([
    ['', 'Lunes', '9:00', 'Sala 1'],
    ['no-email', 'Lunes', '9:00', 'Sala 1'],
    ['a@b.com', 'Funday', '9:00', 'Sala 1'],
    ['a@b.com', 'Lunes', 'tarde', 'Sala 1'],
    ['a@b.com', 'Lunes', '9:00', ''],
  ], mapeo);
  assert.deepEqual(r.map(x => x.estado), ['error', 'error', 'error', 'error', 'error']);
  assert.match(r[2].motivo!, /Día/);
  assert.match(r[3].motivo!, /Hora/);
});
