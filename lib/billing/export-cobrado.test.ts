import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CABECERA_COBRADO, csvLoCobrado, rangoDelMes, type FilaCobrada } from './export-cobrado.ts';

const fila = (p: Partial<FilaCobrada>): FilaCobrada => ({
  fechaCobro: '2026-10-02', nombre: 'Ana Ruiz', concepto: 'Bono 10', importe: 100, importeDevuelto: 0, neto: 100, metodo: 'EFECTIVO', estado: 'COBRADO', ...p,
});

test('el fichero de la gestoría: BOM, cabecera, ordenado por fecha, con comillas escapadas', () => {
  const csv = csvLoCobrado([
    fila({ fechaCobro: '2026-10-05', concepto: 'Clase "suelta"', importe: 15, neto: 15 }),
    fila({ fechaCobro: '2026-10-01', importe: 100, importeDevuelto: 20, neto: 80, metodo: null }),
  ]);
  assert.ok(csv.startsWith('﻿'), 'con BOM: Excel en español lo abre con sus tildes');
  const lineas = csv.slice(1).split('\n');
  assert.equal(lineas[0], CABECERA_COBRADO.map(c => `"${c}"`).join(','));
  assert.equal(lineas[1], '"2026-10-01","Ana Ruiz","Bono 10","100.00","20.00","80.00","","COBRADO"');
  assert.equal(lineas[2], '"2026-10-05","Ana Ruiz","Clase ""suelta""","15.00","0.00","15.00","EFECTIVO","COBRADO"');
});

test('la suma de «Neto» es lo ingresado', () => {
  const filas = [fila({ neto: 80, importe: 100, importeDevuelto: 20 }), fila({ neto: 15, importe: 15 })];
  const csv = csvLoCobrado(filas).slice(1).split('\n').slice(1);
  const suma = csv.reduce((t, l) => t + Number(l.split(',')[5].replace(/"/g, '')), 0);
  assert.equal(suma, 95);
});

test('el mes entero, también febrero y los de 30 días', () => {
  assert.deepEqual(rangoDelMes('2026-02'), { desde: '2026-02-01', hasta: '2026-02-28' });
  assert.deepEqual(rangoDelMes('2028-02'), { desde: '2028-02-01', hasta: '2028-02-29' });
  assert.deepEqual(rangoDelMes('2026-09'), { desde: '2026-09-01', hasta: '2026-09-30' });
  assert.deepEqual(rangoDelMes('2026-12'), { desde: '2026-12-01', hasta: '2026-12-31' });
});
