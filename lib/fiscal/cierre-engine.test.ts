import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Factura, IngresoManual } from '@/lib/types';
import { computeCierreAnual, desglosarIvaDesdeTotal, facturasSinRectificarDeCobrosDevueltos, UMBRAL_347 } from './cierre-engine.ts';

let seq = 0;
const factura = (p: Partial<Factura> & Pick<Factura, 'fechaEmision' | 'baseImponible' | 'tipoIVA' | 'cuotaIVA' | 'total'>): Factura => ({
  id: `f-${++seq}`, studioId: 'e1', reciboId: `r-${seq}`, numeroCompleto: `2025/${String(seq).padStart(4, '0')}`,
  receptorNombre: 'Ana', receptorNIF: null,
  verifactuHash: 'h', verifactuPrevHash: null, verifactuTs: null, verifactuSeq: seq,
  ...p,
});
const manual = (p: Partial<IngresoManual> & Pick<IngresoManual, 'fecha' | 'baseImponible' | 'tipoIVA' | 'cuotaIVA' | 'total'>): IngresoManual => ({
  id: `m-${++seq}`, studioId: 'e1', concepto: 'Taller', cliente: null, nif: null, nota: null, creadoEn: '2025-01-01T00:00:00Z',
  ...p,
});

test('totales suman facturas + ingresos manuales del año', () => {
  const c = computeCierreAnual({
    anio: 2025,
    facturas: [factura({ fechaEmision: '2025-03-10', baseImponible: 100, tipoIVA: 21, cuotaIVA: 21, total: 121 })],
    ingresosManuales: [manual({ fecha: '2025-06-02', baseImponible: 50, tipoIVA: 21, cuotaIVA: 10.5, total: 60.5 })],
  });
  assert.equal(c.totales.base, 150);
  assert.equal(c.totales.cuota, 31.5);
  assert.equal(c.totales.total, 181.5);
  assert.equal(c.totales.numFacturas, 1);
  assert.equal(c.totales.numManuales, 1);
});

test('filtra por año: ignora facturas de otros años', () => {
  const c = computeCierreAnual({
    anio: 2025,
    facturas: [
      factura({ fechaEmision: '2024-12-31', baseImponible: 999, tipoIVA: 21, cuotaIVA: 209.79, total: 1208.79 }),
      factura({ fechaEmision: '2025-01-02', baseImponible: 100, tipoIVA: 21, cuotaIVA: 21, total: 121 }),
    ],
    ingresosManuales: [],
  });
  assert.equal(c.totales.total, 121);
  assert.equal(c.lineas.length, 1);
});

test('asigna trimestre por mes (T1..T4)', () => {
  const c = computeCierreAnual({
    anio: 2025,
    facturas: [
      factura({ fechaEmision: '2025-02-01', baseImponible: 10, tipoIVA: 21, cuotaIVA: 2.1, total: 12.1 }),  // T1
      factura({ fechaEmision: '2025-05-01', baseImponible: 20, tipoIVA: 21, cuotaIVA: 4.2, total: 24.2 }),  // T2
      factura({ fechaEmision: '2025-08-01', baseImponible: 30, tipoIVA: 21, cuotaIVA: 6.3, total: 36.3 }),  // T3
      factura({ fechaEmision: '2025-11-01', baseImponible: 40, tipoIVA: 21, cuotaIVA: 8.4, total: 48.4 }),  // T4
    ],
    ingresosManuales: [],
  });
  assert.deepEqual(c.trimestres.map(t => t.base), [10, 20, 30, 40]);
  assert.deepEqual(c.trimestres.map(t => t.num), [1, 1, 1, 1]);
});

test('agrupa por tipo de IVA, ordenado desc', () => {
  const c = computeCierreAnual({
    anio: 2025,
    facturas: [
      factura({ fechaEmision: '2025-01-01', baseImponible: 100, tipoIVA: 21, cuotaIVA: 21, total: 121 }),
      factura({ fechaEmision: '2025-01-02', baseImponible: 100, tipoIVA: 21, cuotaIVA: 21, total: 121 }),
      factura({ fechaEmision: '2025-01-03', baseImponible: 200, tipoIVA: 10, cuotaIVA: 20, total: 220 }),
    ],
    ingresosManuales: [],
  });
  assert.equal(c.porIva.length, 2);
  assert.deepEqual(c.porIva.map(v => v.tipoIva), [21, 10]);
  assert.equal(c.porIva[0].base, 200);   // 21% → dos de 100
  assert.equal(c.porIva[0].num, 2);
  assert.equal(c.porIva[1].base, 200);   // 10% → una de 200
});

test('desglose mensual: 12 meses, total en el mes correcto', () => {
  const c = computeCierreAnual({
    anio: 2025,
    facturas: [factura({ fechaEmision: '2025-07-15', baseImponible: 100, tipoIVA: 21, cuotaIVA: 21, total: 121 })],
    ingresosManuales: [],
  });
  assert.equal(c.meses.length, 12);
  assert.equal(c.meses[6].total, 121);   // julio (índice 6)
  assert.equal(c.meses[0].total, 0);
});

test('347: agrupa por NIF y solo lista los que superan el umbral', () => {
  const c = computeCierreAnual({
    anio: 2025,
    facturas: [
      factura({ fechaEmision: '2025-01-01', receptorNombre: 'Empresa S.L.', receptorNIF: 'B123', baseImponible: 2000, tipoIVA: 21, cuotaIVA: 420, total: 2420 }),
      factura({ fechaEmision: '2025-06-01', receptorNombre: 'Empresa S.L.', receptorNIF: 'B123', baseImponible: 800, tipoIVA: 21, cuotaIVA: 168, total: 968 }),
      factura({ fechaEmision: '2025-02-01', receptorNombre: 'Ana Particular', receptorNIF: 'X99', baseImponible: 100, tipoIVA: 21, cuotaIVA: 21, total: 121 }),
    ],
    ingresosManuales: [],
  });
  // Empresa S.L.: 2420 + 968 = 3388 > 3005.06 → candidata; Ana: 121 → no.
  assert.equal(c.candidatos347.length, 1);
  assert.equal(c.candidatos347[0].nif, 'B123');
  assert.equal(c.candidatos347[0].total, 3388);
  assert.ok(c.candidatos347[0].total > UMBRAL_347);
});

test('sellado: cuenta facturas con huella; manuales no cuentan como selladas', () => {
  const c = computeCierreAnual({
    anio: 2025,
    facturas: [
      factura({ fechaEmision: '2025-01-01', baseImponible: 10, tipoIVA: 21, cuotaIVA: 2.1, total: 12.1, verifactuHash: 'abc' }),
      factura({ fechaEmision: '2025-01-02', baseImponible: 10, tipoIVA: 21, cuotaIVA: 2.1, total: 12.1, verifactuHash: null }),
    ],
    ingresosManuales: [manual({ fecha: '2025-01-03', baseImponible: 10, tipoIVA: 21, cuotaIVA: 2.1, total: 12.1 })],
  });
  assert.equal(c.sellado.totalFacturas, 2);
  assert.equal(c.sellado.selladas, 1);
});

test('trimestre: acota totales/lineas a esos 3 meses, sin tocar el año de otras facturas', () => {
  const c = computeCierreAnual({
    anio: 2025,
    trimestre: 2,
    facturas: [
      factura({ fechaEmision: '2025-02-01', baseImponible: 10, tipoIVA: 21, cuotaIVA: 2.1, total: 12.1 }),  // T1, fuera
      factura({ fechaEmision: '2025-05-01', baseImponible: 20, tipoIVA: 21, cuotaIVA: 4.2, total: 24.2 }),  // T2, dentro
      factura({ fechaEmision: '2024-05-01', baseImponible: 999, tipoIVA: 21, cuotaIVA: 209.79, total: 1208.79 }), // otro año
    ],
    ingresosManuales: [manual({ fecha: '2025-06-15', baseImponible: 5, tipoIVA: 21, cuotaIVA: 1.05, total: 6.05 })], // T2, dentro
  });
  assert.equal(c.trimestre, 2);
  assert.equal(c.lineas.length, 2);
  assert.equal(c.totales.total, 30.25);
  assert.deepEqual(c.trimestres.map(t => t.total), [0, 30.25, 0, 0]);
});

test('sin trimestre, el campo queda a null (año completo, comportamiento de siempre)', () => {
  const c = computeCierreAnual({ anio: 2025, facturas: [], ingresosManuales: [] });
  assert.equal(c.trimestre, null);
});

test('desglosarIvaDesdeTotal reparte un total IVA-incluido', () => {
  assert.deepEqual(desglosarIvaDesdeTotal(121, 21), { base: 100, cuota: 21 });
  assert.deepEqual(desglosarIvaDesdeTotal(60, 21), { base: 49.59, cuota: 10.41 });
  assert.deepEqual(desglosarIvaDesdeTotal(100, 0), { base: 100, cuota: 0 });
});

// ── F0 (1-oct-2026): lo que el cierre no puede dar por bueno sin avisar ──────

const fac = (p: Partial<Factura>): Factura => factura({ baseImponible: 0, tipoIVA: 21, cuotaIVA: 0, total: 0, fechaEmision: '2026-08-01', ...p });

test('una factura ANULADA en la AEAT no suma, y se cuenta aparte', () => {
  const cierre = computeCierreAnual({
    facturas: [
      fac({ id: 'f-ok', fechaEmision: '2026-08-10', baseImponible: 100, cuotaIVA: 21, total: 121 }),
      fac({ id: 'f-anulada', fechaEmision: '2026-08-11', baseImponible: 50, cuotaIVA: 10.5, total: 60.5, verifactuEstado: 'ANULADA' }),
    ],
    ingresosManuales: [], anio: 2026, trimestre: 3,
  });
  assert.equal(cierre.totales.total, 121);
  assert.equal(cierre.totales.numFacturas, 1);
  assert.equal(cierre.excluidasAnuladasAeat, 1);
});

test('avisa de facturas de cobros reembolsados sin rectificativa; no de los devueltos por el banco', () => {
  const facturas = [
    fac({ id: 'f1', reciboId: 'r-reemb', numeroCompleto: 'A-1', fechaEmision: '2026-08-02', total: 25 }),
    fac({ id: 'f2', reciboId: 'r-parcial', numeroCompleto: 'A-2', fechaEmision: '2026-08-03', total: 30 }),
    fac({ id: 'f3', reciboId: 'r-banco', numeroCompleto: 'A-3', fechaEmision: '2026-08-04', total: 40 }),
    fac({ id: 'f4', reciboId: 'r-rect', numeroCompleto: 'A-4', fechaEmision: '2026-08-05', total: 50 }),
    fac({ id: 'f4r', reciboId: 'r-rect', numeroCompleto: 'R-1', fechaEmision: '2026-08-06', total: -50, tipo: 'R1', rectificaA: 'f4' }),
    fac({ id: 'f5', reciboId: 'r-reemb-julio', numeroCompleto: 'A-0', fechaEmision: '2026-06-30', total: 10 }),
  ];
  const recibos = [
    { id: 'r-reemb', estado: 'DEVUELTO', importe: 25, importeDevuelto: 25 },
    { id: 'r-parcial', estado: 'COBRADO', importe: 30, importeDevuelto: 12 },
    { id: 'r-banco', estado: 'DEVUELTO', importe: 40, importeDevuelto: 0 },
    { id: 'r-rect', estado: 'DEVUELTO', importe: 50, importeDevuelto: 50 },
    { id: 'r-reemb-julio', estado: 'DEVUELTO', importe: 10, importeDevuelto: 10 },
  ];
  const avisos = facturasSinRectificarDeCobrosDevueltos({ facturas, recibos, anio: 2026, trimestre: 3 });
  assert.deepEqual(avisos.map(a => [a.numero, a.devuelto]), [['A-1', 25], ['A-2', 12]]);
});
