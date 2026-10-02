import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DESDE, centimosDe, cobradoEnDe, desenlaceYaCobrado, esMotivoDescarte, fechaCobroExternoValida, importeEnTexto, jsonEstable,
  metodoCobroDe, posibleDuplicadoDe, puedeFecharCobroExterno, type MovimientoParaDuplicado,
} from './reglas.ts';
import type { ReciboParaEmparejar } from './emparejar.ts';
import type { MovimientoNormalizado } from './tipos.ts';

// Datos INVENTADOS.

test('la fecha del cobro: con formato, que exista, no futura y no más de 400 días atrás', () => {
  const hoy = '2026-10-05';
  assert.equal(fechaCobroExternoValida('2026-10-05', hoy), true);
  assert.equal(fechaCobroExternoValida('2026-09-28', hoy), true);
  assert.equal(fechaCobroExternoValida('2026-10-06', hoy), false, 'futura');
  assert.equal(fechaCobroExternoValida('2025-08-30', hoy), false, 'más de 400 días');
  assert.equal(fechaCobroExternoValida('2026-02-30', hoy), false, 'no existe');
  assert.equal(fechaCobroExternoValida('5/10/2026', hoy), false, 'sin formato');
});

test('el importe del compare-and-set va en texto con dos decimales', () => {
  assert.equal(importeEnTexto(5900), '59.00');
  assert.equal(importeEnTexto(5901), '59.01');
  assert.equal(importeEnTexto(5), '0.05');
  assert.equal(importeEnTexto(120000), '1200.00');
  assert.equal(centimosDe(59), 5900);
  assert.equal(centimosDe('59.01'), 5901);
  assert.equal(centimosDe(0.1 + 0.2), 30, 'sin el error de coma flotante');
  assert.equal(centimosDe(null), null);
  assert.equal(centimosDe(''), null);
});

test('método del recibo: OTRO entra como transferencia', () => {
  assert.equal(metodoCobroDe('OTRO'), 'TRANSFERENCIA');
  assert.equal(metodoCobroDe('BIZUM'), 'BIZUM');
  assert.equal(metodoCobroDe('TARJETA'), 'TARJETA');
});

test('la hora real del pago en hora de Madrid; sin hora, ninguna', () => {
  assert.equal(cobradoEnDe('2026-09-28', '18:32'), '2026-09-28T16:32:00.000Z');
  assert.equal(cobradoEnDe('2026-01-15', '18:32'), '2026-01-15T17:32:00.000Z', 'en invierno, UTC+1');
  assert.equal(cobradoEnDe('2026-09-28', null), undefined);
});

test('transiciones: lo final no se toca desde la bandeja', () => {
  assert.deepEqual(DESDE.confirmar, ['POR_REVISAR']);
  for (const accion of Object.keys(DESDE) as (keyof typeof DESDE)[]) {
    assert.equal(DESDE[accion].includes('CONFIRMADO'), false, `${accion} desde CONFIRMADO`);
    assert.equal(DESDE[accion].includes('ENLAZADO'), false, `${accion} desde ENLAZADO`);
    assert.equal(DESDE[accion].includes('CONFIRMANDO'), false, `${accion} desde CONFIRMANDO`);
  }
  assert.equal(esMotivoDescarte('DUPLICADO'), true);
  assert.equal(esMotivoDescarte('CUALQUIERA'), false);
});

const RECIBO: ReciboParaEmparejar = {
  id: 'rec-1', socioId: 'soc-1', importeCentimos: 5900, estado: 'COBRADO', fechaVencimiento: '2026-10-01', fechaCobro: '2026-10-01',
  metodoCobro: 'TRANSFERENCIA', conciliadoPor: 'manual', stripePaymentIntentId: null, cobroMostradorPi: null,
  importeDevueltoCentimos: 0, conReembolso: false, concepto: 'Cuota', ligadoAMovimiento: false,
};
const MOV: MovimientoNormalizado = {
  fuente: 'norma43', claveIdempotencia: 'n43:x#1', idExterno: null, tipo: 'COBRO', metodo: 'TRANSFERENCIA',
  importeCentimos: 5900, fechaOperacion: '2026-10-01', horaOperacion: null, fechaValor: null, referencia: null,
  tarjetaUltimos4: null, tarjetaMarca: null, terminalRef: null, pagadorNombre: null, concepto: null,
};

test('ya estaba cobrado: a mano y cuadra → enlazado; por Stripe → doble cobro; por otro movimiento → revisión', () => {
  assert.equal(desenlaceYaCobrado(RECIBO, MOV, false), 'ENLAZADO');
  assert.equal(desenlaceYaCobrado({ ...RECIBO, stripePaymentIntentId: 'pi_1', conciliadoPor: 'webhook' }, MOV, false), 'DOBLE_COBRO');
  assert.equal(desenlaceYaCobrado({ ...RECIBO, cobroMostradorPi: 'pi_2' }, MOV, false), 'DOBLE_COBRO');
  // Una confirmación anterior de este mismo pago que escribió el cobro y no llegó a cerrarse.
  assert.equal(desenlaceYaCobrado({ ...RECIBO, conciliadoPor: 'externo' }, MOV, false), 'PROPIO');
  assert.equal(desenlaceYaCobrado({ ...RECIBO, conciliadoPor: 'externo', fechaCobro: '2026-09-30' }, MOV, false), 'POR_REVISAR', 'otra fecha: otro pago');
  assert.equal(desenlaceYaCobrado({ ...RECIBO, conciliadoPor: 'externo' }, MOV, true), 'POR_REVISAR', 'otro movimiento lo tiene');
  assert.equal(desenlaceYaCobrado(RECIBO, MOV, true), 'POR_REVISAR');
  // A mano pero en efectivo, o diez días antes: no es el apunte de ESTE pago.
  assert.equal(desenlaceYaCobrado({ ...RECIBO, metodoCobro: 'EFECTIVO' }, MOV, false), 'POR_REVISAR');
  assert.equal(desenlaceYaCobrado({ ...RECIBO, fechaCobro: '2026-09-20' }, MOV, false), 'POR_REVISAR');
});

const EXISTENTE: MovimientoParaDuplicado = {
  id: 'cex-1', fuente: 'csv', estado: 'POR_REVISAR', importeCentimos: 5900, fechaOperacion: '2026-10-01',
  horaOperacion: '18:30', tarjetaUltimos4: '1234', pagadorNombre: 'maria garcia lopez',
};
const NUEVO = { fuente: 'norma43' as const, importeCentimos: 5900, fechaOperacion: '2026-10-01', horaOperacion: '18:32', tarjetaUltimos4: '1234', pagadorNombre: null };

test('el mismo cobro por otra fuente: misma tarjeta a ±3 minutos, o mismo pagador ese día', () => {
  assert.equal(posibleDuplicadoDe(NUEVO, [EXISTENTE]), 'cex-1');
  assert.equal(posibleDuplicadoDe({ ...NUEVO, horaOperacion: '18:40' }, [EXISTENTE]), null, 'a 10 minutos');
  assert.equal(posibleDuplicadoDe({ ...NUEVO, tarjetaUltimos4: null, horaOperacion: null, pagadorNombre: 'MARÍA GARCÍA LÓPEZ' }, [EXISTENTE]), 'cex-1');
  assert.equal(posibleDuplicadoDe({ ...NUEVO, fuente: 'csv' }, [EXISTENTE]), null, 'la misma fuente ya la para la clave');
  assert.equal(posibleDuplicadoDe({ ...NUEVO, importeCentimos: 5901 }, [EXISTENTE]), null);
  assert.equal(posibleDuplicadoDe(NUEVO, [{ ...EXISTENTE, estado: 'DESCARTADO' }]), null);
  // Con varios, el ya confirmado primero.
  assert.equal(posibleDuplicadoDe(NUEVO, [EXISTENTE, { ...EXISTENTE, id: 'cex-0', estado: 'CONFIRMADO' }]), 'cex-0');
});

test('fechar en el pasado: recepción, este mes y el anterior; más atrás, la propietaria', () => {
  assert.equal(puedeFecharCobroExterno('RECEPCION', '2026-09-01', '2026-10-05'), true);
  assert.equal(puedeFecharCobroExterno('RECEPCION', '2026-08-31', '2026-10-05'), false);
  assert.equal(puedeFecharCobroExterno('PROPIETARIO', '2026-03-01', '2026-10-05'), true);
  assert.equal(puedeFecharCobroExterno('RECEPCION', '2025-12-01', '2026-01-10'), true, 'en enero, diciembre es el mes anterior');
  assert.equal(puedeFecharCobroExterno('RECEPCION', '2025-11-30', '2026-01-10'), false);
});

test('comparar decisiones sin que el orden de las claves de jsonb diga «distinto»', () => {
  assert.equal(jsonEstable({ b: 1, a: [{ d: 2, c: null }] }), jsonEstable({ a: [{ c: null, d: 2 }], b: 1 }));
  assert.notEqual(jsonEstable({ a: [1, 2] }), jsonEstable({ a: [2, 1] }), 'el orden de una lista sí importa');
});
