import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nombreDia, proyectarPlazaFija, proyectarRecuperaciones } from './plaza-fija.ts';

// 2026-09-04 es viernes (dow 5).
const HOY = '2026-09-04';
const plaza = (p: Partial<Parameters<typeof proyectarPlazaFija>[0][0]> = {}) => ({
  diaSemana: 2, horaInicio: '18:00:00', salaId: 'sala-1', tipoClaseId: 'tc-r', vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'ACTIVA' as const, ...p,
});

test('próxima ocurrencia: el martes que viene, con la hora sin segundos', () => {
  const v = proyectarPlazaFija([plaza()], HOY);
  assert.equal(v?.proximaFecha, '2026-09-08');
  assert.equal(v?.hora, '18:00');
  assert.equal(nombreDia(v!.diaSemana), 'martes');
});

test('si es hoy y la hora no ha pasado, es hoy; si ya pasó, la semana que viene', () => {
  assert.equal(proyectarPlazaFija([plaza({ diaSemana: 5 })], HOY, '17:00')?.proximaFecha, HOY);
  assert.equal(proyectarPlazaFija([plaza({ diaSemana: 5 })], HOY, '18:30')?.proximaFecha, '2026-09-11');
});

test('BAJA no cuenta; PAUSADA se enseña sin próxima fecha; ACTIVA gana a PAUSADA', () => {
  assert.equal(proyectarPlazaFija([plaza({ estado: 'BAJA' })], HOY), null);
  const pausada = proyectarPlazaFija([plaza({ estado: 'PAUSADA' })], HOY);
  assert.equal(pausada?.estado, 'PAUSADA'); assert.equal(pausada?.proximaFecha, null);
  assert.equal(proyectarPlazaFija([plaza({ estado: 'PAUSADA', diaSemana: 1 }), plaza({ diaSemana: 3 })], HOY)?.diaSemana, 3);
});

test('vigencia: terminada → null; la próxima fecha respeta vigenciaHasta', () => {
  assert.equal(proyectarPlazaFija([plaza({ vigenciaHasta: '2026-08-31' })], HOY), null);
  assert.equal(proyectarPlazaFija([plaza({ vigenciaHasta: '2026-09-06' })], HOY)?.proximaFecha, null);
});

test('recuperaciones: solo DISPONIBLE y no caducadas; caducidad más cercana primero', () => {
  const r = proyectarRecuperaciones([
    { caducaEl: '2026-09-20', estado: 'DISPONIBLE' },
    { caducaEl: '2026-09-10', estado: 'DISPONIBLE' },
    { caducaEl: '2026-09-01', estado: 'DISPONIBLE' }, // caducada de hecho
    { caducaEl: '2026-09-30', estado: 'USADA' },
  ], HOY);
  assert.deepEqual(r, { disponibles: 2, proximaCaducidad: '2026-09-10' });
  assert.deepEqual(proyectarRecuperaciones([], HOY), { disponibles: 0, proximaCaducidad: null });
});
