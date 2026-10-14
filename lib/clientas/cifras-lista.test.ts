import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contarActivasNuevas, deudaDeClientas } from './cifras-lista.ts';
import type { ResultadoEstado } from './estado.ts';

const estado = (e: Partial<ResultadoEstado>): ResultadoEstado => ({
  estado: 'ACTIVA', desde: null, nueva: false, derecho: true, primeraCompraReal: null, ...e,
});

test('nuevas son solo las activas con la marca de nueva, la misma que su fila', () => {
  const estados = new Map<string, ResultadoEstado>([
    ['a', estado({ nueva: true })],
    ['b', estado({ nueva: false })],
    // Una de prueba nunca es «nueva», aunque llegara ayer.
    ['c', estado({ estado: 'DE_PRUEBA', nueva: false })],
    // Defensa: si algún día otra la trajera marcada, no es activa y no cuenta.
    ['d', estado({ estado: 'SIN_RENOVAR', nueva: true })],
  ]);
  assert.equal(contarActivasNuevas(estados), 1);
  assert.equal(contarActivasNuevas(new Map()), 0);
});

test('lo que se debe es por cobrar más impagado, por clienta, como «Quién me debe»', () => {
  const existe = (id: string) => id !== 'borrada';
  const r = deudaDeClientas([
    { socioId: 'ana', estado: 'PENDIENTE', importe: 50 },
    { socioId: 'ana', estado: 'FALLIDO', importe: '30.10' },
    { socioId: 'bea', estado: 'DEVUELTO', importe: 45, importeDevuelto: 0 },
    // Cobrado, anulado, reembolsado o en el banco: no es deuda.
    { socioId: 'cris', estado: 'COBRADO', importe: 60 },
    { socioId: 'cris', estado: 'ANULADO', importe: 60 },
    { socioId: 'cris', estado: 'DEVUELTO', importe: 60, importeDevuelto: 60 },
    { socioId: 'cris', estado: 'EN_CURSO', importe: 60 },
    // Sin clienta (venta de mostrador) o de una ficha que ya no está: no es de esta lista.
    { socioId: null, estado: 'PENDIENTE', importe: 12 },
    { socioId: 'borrada', estado: 'PENDIENTE', importe: 99 },
  ], existe);
  assert.deepEqual(r, { clientas: 2, importe: 125.1 });
});

test('sin recibos nadie debe nada', () => {
  assert.deepEqual(deudaDeClientas([], () => true), { clientas: 0, importe: 0 });
});
