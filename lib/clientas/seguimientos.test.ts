import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atajosDeFecha, cuandoVence, textoVence, tituloPropuesto, validarFechaSeguimiento, validarSeguimiento } from './seguimientos.ts';

const HOY = '2026-10-01'; // jueves
const UUID = '11111111-2222-3333-4444-555555555555';

test('un seguimiento válido, y lo que no se acepta', () => {
  const ok = validarSeguimiento({ socioId: 'soc-1', titulo: '  Llamarla  ', venceEl: '2026-10-05', asignadaA: UUID }, HOY);
  assert.deepEqual(ok, { ok: true, seguimiento: { socioId: 'soc-1', titulo: 'Llamarla', venceEl: '2026-10-05', asignadaA: UUID, recomendacionId: null } });
  assert.equal(validarSeguimiento({ titulo: 'x', venceEl: HOY }, HOY).ok, false);
  assert.equal(validarSeguimiento({ socioId: 's', titulo: '   ', venceEl: HOY }, HOY).ok, false);
  assert.equal(validarSeguimiento({ socioId: 's', titulo: 'x'.repeat(201), venceEl: HOY }, HOY).ok, false);
  assert.equal(validarSeguimiento({ socioId: 's', titulo: 'x', venceEl: HOY, asignadaA: 'ana' }, HOY).ok, false);
});

test('la fecha: un día real, desde hoy y como mucho dentro de un año', () => {
  assert.equal(validarFechaSeguimiento(HOY, HOY).ok, true);
  assert.equal(validarFechaSeguimiento('2026-09-30', HOY).ok, false);
  assert.equal(validarFechaSeguimiento('2027-10-01', HOY).ok, true);
  assert.equal(validarFechaSeguimiento('2027-10-02', HOY).ok, false);
  assert.equal(validarFechaSeguimiento('2027-02-30', HOY).ok, false);
  assert.equal(validarFechaSeguimiento('mañana', HOY).ok, false);
});

test('los atajos: mañana, el lunes, en una y en dos semanas (sin repetir día)', () => {
  assert.deepEqual(atajosDeFecha(HOY).map(a => [a.texto, a.venceEl]), [
    ['Mañana', '2026-10-02'], ['El lunes', '2026-10-05'], ['En una semana', '2026-10-08'], ['En dos semanas', '2026-10-15'],
  ]);
  // Domingo: mañana ya es lunes, así que «El lunes» no se repite.
  assert.deepEqual(atajosDeFecha('2026-10-04').map(a => a.texto), ['Mañana', 'En una semana', 'En dos semanas']);
});

test('cuándo vence, en palabras', () => {
  assert.equal(cuandoVence('2026-09-29', HOY), 'ATRASADO');
  assert.equal(cuandoVence(HOY, HOY), 'HOY');
  assert.equal(textoVence(HOY, HOY), 'hoy');
  assert.equal(textoVence('2026-10-02', HOY), 'mañana');
  assert.equal(textoVence('2026-10-05', HOY), 'el lunes 5');
  assert.equal(textoVence('2026-10-14', HOY), 'el 14 oct');
  assert.equal(textoVence('2026-09-29', HOY), 'hace 2 días');
  assert.equal(tituloPropuesto('Laura', 'Viene menos'), 'Hablar con Laura: viene menos');
});
