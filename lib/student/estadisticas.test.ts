import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decimal, estadisticasRecientes, hechasEsteMes, type ClaseDelHistorial } from './estadisticas.ts';

const AHORA = Date.parse('2026-10-19T12:00:00+02:00');
const c = (inicio: string, estado: ClaseDelHistorial['estado']): ClaseDelHistorial => ({ inicio, estado });

test('cuenta solo lo marcado dentro de la ventana de 4 semanas', () => {
  const e = estadisticasRecientes([
    c('2026-10-18T10:00:00+02:00', 'ASISTIDA'),
    c('2026-10-10T10:00:00+02:00', 'ASISTIDA'),
    c('2026-10-01T10:00:00+02:00', 'NO_SHOW'),
    c('2026-10-02T10:00:00+02:00', 'CANCELADA'),
    // Fuera de la ventana (más de 28 días): no cuenta.
    c('2026-09-15T10:00:00+02:00', 'ASISTIDA'),
  ], AHORA);
  assert.equal(e.clases, 2);
  assert.equal(e.semanaMedia, 0.5);
  // 2 hechas de 3 con resultado: la cancelada no es ni hecha ni falta.
  assert.equal(e.asistencia, 67);
});

test('sin nada marcado no inventa un porcentaje', () => {
  const e = estadisticasRecientes([c('2026-10-10T10:00:00+02:00', 'CANCELADA')], AHORA);
  assert.equal(e.clases, 0);
  assert.equal(e.asistencia, null);
});

test('una clase del futuro o con fecha rota no cuenta', () => {
  const e = estadisticasRecientes([c('2026-10-25T10:00:00+02:00', 'ASISTIDA'), c('nada', 'ASISTIDA')], AHORA);
  assert.equal(e.clases, 0);
});

test('este mes, por el día del estudio', () => {
  const dia = (i: string) => i.slice(0, 10);
  assert.equal(hechasEsteMes([
    c('2026-10-01T09:00:00+02:00', 'ASISTIDA'), c('2026-10-03T09:00:00+02:00', 'NO_SHOW'), c('2026-09-30T09:00:00+02:00', 'ASISTIDA'),
  ], '2026-10-19', dia), 1);
});

test('decimales en español', () => {
  assert.equal(decimal(3), '3');
  assert.equal(decimal(2.5), '2,5');
});
