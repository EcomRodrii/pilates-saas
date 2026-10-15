import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grupoRequiereAtencion, reciboRequiereAtencion, resumenDeLaDeuda, resumenProximasCuotas } from './cifras-cobros.ts';
import { agruparDeudas } from './deudas.ts';
import { resumirRecibos } from '../billing/situacion-recibo.ts';

const r = (id: string, extra: Record<string, unknown> = {}) => ({
  id, socioId: 's1', estado: 'PENDIENTE', importe: 10, importeDevuelto: 0, fechaVencimiento: '2026-09-20', intentosReintento: 0, ...extra,
});

test('«Te deben» es la suma de la lista, y la lista es «por cobrar + impagado» de situacion-recibo', () => {
  const recibos = [
    r('a1', { socioId: 'ana', importe: 15.1 }),
    r('a2', { socioId: 'ana', importe: 0.2 }),
    r('l1', { socioId: 'laura', importe: 89, estado: 'FALLIDO' }),
    r('m1', { socioId: null, importe: 12 }),
    r('e1', { socioId: 'ana', importe: 40, estado: 'EN_CURSO' }),
    r('c1', { socioId: 'ana', importe: 55, estado: 'COBRADO' }),
  ];
  const grupos = agruparDeudas(recibos, () => true);
  const res = resumenDeLaDeuda(grupos, recibos);
  const arriba = resumirRecibos(recibos);
  assert.equal(res.teDeben, 116.3, 'redondeado a céntimos: 15,1 + 0,2 no deja restos');
  assert.equal(res.teDeben, Math.round((arriba.porCobrar + arriba.impagado) * 100) / 100);
  assert.equal(res.grupos, 3, 'ana, laura y la venta de mostrador: las filas de la lista');
  assert.equal(res.enElBanco, 40, 'lo que está en el banco va aparte: todavía no es deuda');
});

test('devueltos y fallidos: solo los recibos que ya se intentaron y no entraron', () => {
  const recibos = [
    r('l1', { socioId: 'laura', importe: 89, estado: 'DEVUELTO' }),
    r('l2', { socioId: 'laura', importe: 89 }), // sin cobrar: suma a «Te deben», no aquí
    r('j1', { socioId: 'julia', importe: 30, intentosReintento: 2 }), // pendiente con intentos = no se pudo
    r('c1', { socioId: 'cris', importe: 20 }),
    r('d1', { socioId: 'cris', importe: 20, estado: 'DEVUELTO', importeDevuelto: 20 }), // reembolsado: ni deuda
  ];
  assert.equal(reciboRequiereAtencion(recibos[0]), true);
  assert.equal(reciboRequiereAtencion(recibos[1]), false);
  assert.equal(reciboRequiereAtencion(recibos[2]), true);
  assert.equal(reciboRequiereAtencion(recibos[4]), false);
  const grupos = agruparDeudas(recibos, () => true);
  const res = resumenDeLaDeuda(grupos, recibos);
  assert.deepEqual(res.atencion, { importe: 119, grupos: 2, recibos: 2 });
  assert.equal(res.teDeben, 228);
  assert.deepEqual(grupos.filter(grupoRequiereAtencion).map(g => g.clave).sort(), ['julia', 'laura']);
});

test('sin deudas, todo a cero', () => {
  assert.deepEqual(resumenDeLaDeuda([], []), { teDeben: 0, grupos: 0, enElBanco: 0, atencion: { importe: 0, grupos: 0, recibos: 0 } });
});

test('lo que se renueva: la baja programada no suma, y se cuentan las que hay que vigilar', () => {
  const res = resumenProximasCuotas([
    { importe: 55, como: 'SOLA_TARJETA' },
    { importe: 55, como: 'SOLA_DOMICILIACION' },
    { importe: 60.5, como: 'A_MANO' },
    { importe: 70, como: 'TARJETA_CADUCA' },
    { importe: 80, como: 'NO_SE_SABE' },
    { importe: 90, como: 'REMESA' },
    { importe: 999, como: 'NO_SE_RENUEVA' },
  ]);
  assert.deepEqual(res, { n: 6, importe: 410.5, aMano: 1, tarjetaCaduca: 1, sinDatos: 1 });
  assert.deepEqual(resumenProximasCuotas([]), { n: 0, importe: 0, aMano: 0, tarjetaCaduca: 0, sinDatos: 0 });
});
