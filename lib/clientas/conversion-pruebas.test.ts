import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conversionDePruebas } from './conversion-pruebas.ts';

const PLANES = [{ id: 'prueba', esPrueba: true }, { id: 'bono', esPrueba: false }, { id: 'mensual' }];
const s = (socioId: string, planId: string, fechaInicio: string) => ({ socioId, planId, fechaInicio });

test('cuenta por el mes de la prueba y solo las que compraron después', () => {
  const subs = [
    ...['a', 'b', 'c', 'd', 'e', 'f'].map(x => s(x, 'prueba', '2026-09-10')),
    s('a', 'bono', '2026-09-12'),
    s('b', 'mensual', '2026-10-01'),
    // c compró ANTES de su prueba: es una veterana, no una conversión.
    s('c', 'bono', '2026-05-01'),
  ];
  assert.deepEqual(conversionDePruebas(subs, PLANES, '2026-10-01'), [
    { mes: '2026-09', mesIndice: 8, pruebas: 6, compraron: 2 },
  ]);
});

test('con menos de 5 pruebas en un mes, ese mes no se cuenta', () => {
  const subs = ['a', 'b', 'c', 'd'].map(x => s(x, 'prueba', '2026-09-10'));
  assert.deepEqual(conversionDePruebas(subs, PLANES, '2026-10-15'), []);
});

test('la prueba que cuenta es la primera; los dos meses más recientes con datos', () => {
  const subs = [
    ...['a', 'b', 'c', 'd', 'e'].map(x => s(x, 'prueba', '2026-08-03')),
    ...['f', 'g', 'h', 'i', 'j'].map(x => s(x, 'prueba', '2026-10-02')),
    s('a', 'prueba', '2026-10-05'),
    s('f', 'bono', '2026-10-03'),
  ];
  const r = conversionDePruebas(subs, PLANES, '2026-10-20');
  assert.deepEqual(r.map(x => [x.mes, x.pruebas, x.compraron]), [['2026-10', 5, 1], ['2026-08', 5, 0]]);
});
