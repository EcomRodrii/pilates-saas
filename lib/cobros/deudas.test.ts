import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  agruparDeudas, CLAVE_VENTAS_MOSTRADOR, claveClientaEliminada, contarChips, diasDebiendo, estadoVisible, grupoEnChip, notaDeRecibo,
} from './deudas.ts';
import { resumirRecibos } from '../billing/situacion-recibo.ts';

const r = (id: string, extra: Record<string, unknown> = {}) => ({
  id, socioId: 's1', estado: 'PENDIENTE', importe: 10, importeDevuelto: 0, fechaVencimiento: '2026-09-20', intentosReintento: 0, ...extra,
});

test('qué estado se enseña de cada recibo que se debe', () => {
  assert.equal(estadoVisible(r('a')), 'SIN_COBRAR');
  assert.equal(estadoVisible(r('a', { intentosReintento: 2 })), 'NO_SE_PUDO', 'pendiente con intentos: ya se intentó y no entró');
  assert.equal(estadoVisible(r('a', { estado: 'FALLIDO' })), 'NO_SE_PUDO');
  assert.equal(estadoVisible(r('a', { estado: 'DEVUELTO' })), 'DEVUELTO_BANCO');
  // No son deuda: reembolsado, cobrado, en el banco, anulado.
  assert.equal(estadoVisible(r('a', { estado: 'DEVUELTO', importeDevuelto: 10 })), null);
  for (const estado of ['COBRADO', 'EN_CURSO', 'ANULADO']) assert.equal(estadoVisible(r('a', { estado })), null, estado);
});

test('un grupo por clienta, la deuda más antigua primero; la suma es «Te deben» de arriba', () => {
  const recibos = [
    r('a1', { socioId: 'ana', fechaVencimiento: '2026-09-28', importe: 15 }),
    r('l1', { socioId: 'laura', fechaVencimiento: '2026-08-05', importe: 89, estado: 'FALLIDO' }),
    r('l2', { socioId: 'laura', fechaVencimiento: '2026-09-01', importe: 89, estado: 'DEVUELTO' }),
    r('m1', { socioId: null, fechaVencimiento: '2026-09-25', importe: 12 }),
    r('x1', { socioId: 'borrada', fechaVencimiento: '2026-09-10', importe: 30 }),
    // No son deuda: no salen ni suman.
    r('c1', { socioId: 'ana', estado: 'COBRADO' }),
    r('e1', { socioId: 'ana', estado: 'EN_CURSO' }),
    r('d1', { socioId: 'ana', estado: 'DEVUELTO', importeDevuelto: 10 }),
  ];
  const grupos = agruparDeudas(recibos, id => id !== 'borrada');
  assert.deepEqual(grupos.map(g => g.clave), ['laura', claveClientaEliminada('borrada'), CLAVE_VENTAS_MOSTRADOR, 'ana']);
  assert.deepEqual(grupos[0].recibos.map(x => x.id), ['l1', 'l2'], 'sus recibos, del más antiguo al más reciente');
  assert.equal(grupos[0].total, 178);
  assert.equal(grupos[0].desde, '2026-08-05');
  assert.equal(grupos[0].peor, 'DEVUELTO_BANCO');
  assert.equal(grupos[1].tipo, 'CLIENTA_ELIMINADA');
  assert.equal(grupos[2].tipo, 'VENTA_MOSTRADOR');
  const suma = grupos.reduce((t, g) => t + g.total, 0);
  const arriba = resumirRecibos(recibos);
  assert.equal(suma, arriba.porCobrar + arriba.impagado, 'la lista suma lo mismo que «Te deben»');
});

test('días debiendo: desde el vencimiento más antiguo; lo que no ha vencido, 0', () => {
  assert.equal(diasDebiendo({ desde: '2026-08-05' }, '2026-10-02'), 58);
  assert.equal(diasDebiendo({ desde: '2026-10-10' }, '2026-10-02'), 0);
});

test('los chips cuentan clientas con ALGÚN recibo en ese estado (por eso suman más que el total)', () => {
  const recibos = [
    r('l1', { socioId: 'laura', estado: 'FALLIDO' }),
    r('l2', { socioId: 'laura', estado: 'DEVUELTO' }),
    r('j1', { socioId: 'julia', intentosReintento: 1, proximoReintento: '2026-10-05T08:30:00Z' }),
    r('c1', { socioId: 'cris' }),
  ];
  const grupos = agruparDeudas(recibos, () => true);
  const solo = (x: { proximoReintento?: string | null }) => !!x.proximoReintento;
  assert.deepEqual(contarChips(grupos, solo), { DEVUELTO_BANCO: 1, NO_SE_PUDO: 2, SIN_COBRAR: 1, SE_REINTENTA_SOLO: 1 });
  assert.deepEqual(grupos.filter(g => grupoEnChip(g, 'NO_SE_PUDO', solo)).map(g => g.clave).sort(), ['julia', 'laura']);
  assert.equal(grupos.filter(g => grupoEnChip(g, null, solo)).length, 3);
});

test('la nota de cada recibo dice lo que pasó, sin inventar con qué', () => {
  assert.equal(notaDeRecibo(r('a', { intentosReintento: 3 }), '2026-10-02'), '3 intentos sin éxito');
  assert.equal(notaDeRecibo(r('a', { intentosReintento: 1 }), '2026-10-02'), '1 intento sin éxito');
  assert.equal(notaDeRecibo(r('a', { estado: 'DEVUELTO', fechaDevolucion: '2026-09-06' }), '2026-10-02'), 'El banco lo devolvió el 6 sep');
  assert.equal(notaDeRecibo(r('a'), '2026-10-02'), null);
});
