import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparPorDia, pagosHistoricosEnTramo } from './pagos-historicos.ts';

test('agrupa por día y suma sin errores de coma flotante', () => {
  const d = agruparPorDia([
    { fecha: '2026-08-05', importe: 95 },
    { fecha: '2026-08-05', importe: '65.10' },
    { fecha: '2026-08-05', importe: 0.2 },
    { fecha: '2026-09-05', importe: 120 },
  ]);
  assert.deepEqual(d, [
    { fecha: '2026-08-05', n: 3, total: 160.3 },
    { fecha: '2026-09-05', n: 1, total: 120 },
  ]);
});

test('el tramo incluye sus dos extremos y deja fuera el resto', () => {
  const dias = [
    { fecha: '2026-08-31', n: 2, total: 100 },
    { fecha: '2026-09-01', n: 1, total: 50 },
    { fecha: '2026-09-30', n: 4, total: 200 },
    { fecha: '2026-10-01', n: 9, total: 900 },
  ];
  assert.deepEqual(pagosHistoricosEnTramo(dias, { desde: '2026-09-01', hasta: '2026-09-30' }), { n: 5, total: 250 });
  assert.deepEqual(pagosHistoricosEnTramo(dias, { desde: '2027-01-01', hasta: '2027-01-31' }), { n: 0, total: 0 });
});
