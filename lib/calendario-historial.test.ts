import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historialSustituciones, type SustitucionHistorial } from './calendario-historial.ts';

const nombres: Record<string, string> = { i1: 'Aina', i2: 'María' };
const resolver = (id: string) => nombres[id] ?? null;

const sus = (o: Partial<SustitucionHistorial> & Pick<SustitucionHistorial, 'id' | 'estado'>): SustitucionHistorial => ({
  motivo: null, sustitutaFinalId: null, creadoEn: null, resueltoEn: null, ...o,
});

test('sustitución abierta sin resolver: un solo evento, "sin instructora"', () => {
  const ev = historialSustituciones(
    [sus({ id: 's1', estado: 'buscando', motivo: 'Gripe', creadoEn: '2026-07-13T07:00:00Z' })],
    resolver,
  );
  assert.equal(ev.length, 1);
  assert.equal(ev[0].texto, 'Sin instructora — Gripe');
});

test('sin motivo, texto genérico sin guion colgando', () => {
  const ev = historialSustituciones(
    [sus({ id: 's1', estado: 'buscando', creadoEn: '2026-07-13T07:00:00Z' })],
    resolver,
  );
  assert.equal(ev[0].texto, 'Sin instructora');
});

test('sustitución confirmada: dos eventos (abierta + resuelta con nombre)', () => {
  const ev = historialSustituciones(
    [sus({
      id: 's1', estado: 'confirmada', motivo: 'Gripe', sustitutaFinalId: 'i1',
      creadoEn: '2026-07-13T07:00:00Z', resueltoEn: '2026-07-13T07:20:00Z',
    })],
    resolver,
  );
  assert.equal(ev.length, 2);
  assert.equal(ev[0].texto, 'Cubierta con Aina'); // más reciente primero
  assert.equal(ev[1].texto, 'Sin instructora — Gripe');
});

test('sustituta_final_id sin nombre resoluble: texto genérico, no revienta', () => {
  const ev = historialSustituciones(
    [sus({ id: 's1', estado: 'confirmada', sustitutaFinalId: 'desconocido', resueltoEn: '2026-07-13T07:20:00Z' })],
    resolver,
  );
  assert.equal(ev[0].texto, 'Cubierta');
});

test('resuelta_fuera / sin_sustituta / cancelada tienen su propio texto', () => {
  const casos: [string, string][] = [
    ['resuelta_fuera', 'Resuelta moviendo la clase a otro horario'],
    ['sin_sustituta', 'Sin sustituta encontrada'],
    ['cancelada', 'Sustitución cancelada'],
  ];
  for (const [estado, texto] of casos) {
    const ev = historialSustituciones(
      [sus({ id: 's1', estado, resueltoEn: '2026-07-13T07:20:00Z' })],
      resolver,
    );
    assert.equal(ev.find(e => e.id === 's1-resuelta')?.texto, texto, estado);
  }
});

test('varias sustituciones se ordenan todas juntas, más reciente primero', () => {
  const ev = historialSustituciones(
    [
      sus({ id: 'vieja', estado: 'confirmada', sustitutaFinalId: 'i1', creadoEn: '2026-07-01T07:00:00Z', resueltoEn: '2026-07-01T07:10:00Z' }),
      sus({ id: 'nueva', estado: 'confirmada', sustitutaFinalId: 'i2', creadoEn: '2026-07-13T07:00:00Z', resueltoEn: '2026-07-13T07:10:00Z' }),
    ],
    resolver,
  );
  assert.deepEqual(ev.map(e => e.id), ['nueva-resuelta', 'nueva-abierta', 'vieja-resuelta', 'vieja-abierta']);
});

test('sin sustituciones, lista vacía', () => {
  assert.deepEqual(historialSustituciones([], resolver), []);
});
