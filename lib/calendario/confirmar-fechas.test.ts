import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clasesMarcadas, diaCorto, porMes, textoCrear, tituloMes } from './confirmar-fechas.ts';

test('el día y el mes se nombran sin moverse de fecha (también con TZ=UTC)', () => {
  assert.equal(diaCorto('2026-12-08'), 'martes 8');
  assert.equal(diaCorto('2026-10-25'), 'domingo 25'); // el día del cambio de hora
  assert.equal(tituloMes('2026-12'), 'Diciembre de 2026');
});

test('agrupa por mes y ordena', () => {
  const g = porMes([{ fecha: '2027-01-04' }, { fecha: '2026-12-29' }, { fecha: '2026-12-01' }]);
  assert.deepEqual(g.map((x) => [x.mes, x.fechas.map((f) => f.fecha)]), [
    ['2026-12', ['2026-12-01', '2026-12-29']],
    ['2027-01', ['2027-01-04']],
  ]);
});

test('el recuento cuenta clases, no días, y solo las marcadas', () => {
  const fechas = [
    { fecha: '2026-12-07', clases: 3, festivo: null },
    { fecha: '2026-12-08', clases: 2, festivo: 'Festivo en Madrid: Inmaculada' },
  ];
  assert.equal(clasesMarcadas(fechas, new Set(['2026-12-07'])), 3);
  assert.equal(clasesMarcadas(fechas, new Set(['2026-12-07', '2026-12-08'])), 5);
  assert.equal(textoCrear(16), 'Crear 16 clases');
  assert.equal(textoCrear(1), 'Crear 1 clase');
});
