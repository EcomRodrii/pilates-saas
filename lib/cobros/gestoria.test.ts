import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bloquesDeGestoria, cobrosSinFactura, fraseVerifactu, resumenFacturado } from './gestoria.ts';

test('el trimestre natural anterior, el que va y el año anterior', () => {
  const b = bloquesDeGestoria('2026-10-02');
  assert.deepEqual(b.anterior, { tramo: { desde: '2026-07-01', hasta: '2026-09-30' }, etiqueta: '3.er trimestre · julio – septiembre' });
  assert.deepEqual(b.enCurso, { tramo: { desde: '2026-10-01', hasta: '2026-10-02' }, etiqueta: '4.º trimestre · desde el 1 de octubre' });
  assert.deepEqual(b.anioAnterior, { tramo: { desde: '2025-01-01', hasta: '2025-12-31' }, etiqueta: 'Año 2025' });
});

test('en enero, el trimestre anterior es el 4.º del año pasado, y se dice el año', () => {
  const b = bloquesDeGestoria('2027-01-15');
  assert.deepEqual(b.anterior.tramo, { desde: '2026-10-01', hasta: '2026-12-31' });
  assert.equal(b.anterior.etiqueta, '4.º trimestre de 2026 · octubre – diciembre');
  assert.equal(b.enCurso.etiqueta, '1.er trimestre · desde el 1 de enero');
});

const f = (fecha: string, base: number, tipo: number, extra: Record<string, unknown> = {}) =>
  ({ fechaEmision: fecha, baseImponible: base, tipoIVA: tipo, cuotaIVA: Math.round(base * tipo) / 100, total: base + Math.round(base * tipo) / 100, ...extra });

test('lo facturado del periodo: con el IVA de cada factura y sin las anuladas ante la AEAT (la regla del cierre)', () => {
  const r = resumenFacturado([
    f('2026-10-01', 100, 21),
    f('2026-10-02', 50, 10),
    f('2026-10-02', 200, 21, { verifactuEstado: 'ANULADA' }),
    f('2026-09-30', 999, 21), // fuera
    f('2026-10-02', -20, 21, { tipo: 'R1' }), // rectificativa: resta
  ], { desde: '2026-10-01', hasta: '2026-10-31' });
  assert.equal(r.nFacturas, 3);
  assert.equal(r.nAnuladas, 1);
  assert.equal(r.base, 130);
  assert.equal(r.cuota, 21 + 5 - 4.2);
  assert.deepEqual(r.porIva, [{ tipoIva: 21, base: 80, cuota: 16.8 }, { tipoIva: 10, base: 50, cuota: 5 }]);
});

test('cobros sin factura: los de efectivo y los que se quedaron sin sellar, con su importe', () => {
  const cobrados = [
    { id: 'a', metodoCobro: 'EFECTIVO', neto: 15 },
    { id: 'b', metodoCobro: 'EFECTIVO', neto: 80 },
    { id: 'c', metodoCobro: 'TARJETA', facturaPendienteSellar: true, neto: 70 },
    { id: 'd', metodoCobro: 'TARJETA', neto: 89 }, // con factura
    { id: 'e', metodoCobro: 'EFECTIVO', neto: 0 }, // devuelto entero: no cuenta
  ];
  const r = cobrosSinFactura(cobrados, id => id === 'd', x => x.neto);
  assert.deepEqual(r, { enEfectivo: { n: 2, importe: 95 }, pendientesDeSellar: { n: 1, importe: 70 } });
});

test('Veri*Factu en una frase que no promete el registro en la AEAT', () => {
  assert.equal(fraseVerifactu({ nifEstudioValido: true, pendientesDeSellar: 0 }), 'Cada factura se sella con su huella Veri*Factu al cobrarse.');
  assert.match(fraseVerifactu({ nifEstudioValido: true, pendientesDeSellar: 2 }), /2 cobros se quedaron sin factura al sellar/);
  assert.match(fraseVerifactu({ nifEstudioValido: false, pendientesDeSellar: 0 }), /falta el NIF fiscal del estudio/);
  assert.doesNotMatch(fraseVerifactu({ nifEstudioValido: true, pendientesDeSellar: 0 }), /registrad|AEAT/);
});
