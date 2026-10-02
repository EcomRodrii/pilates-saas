import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accionesDeRecibo, type ContextoDeAcciones } from './acciones-de-recibo.ts';

const CTX: ContextoDeAcciones = {
  factura: null, estudioFactura: false, estudioHaceRemesas: false, mandatoVigente: false, algunMandato: false,
  cobroSinElla: { boton: 'Cobrar con su tarjeta ··0077' }, cuota: { estado: 'ACTIVA' }, seCobraSoloEl: null,
};
const r = (extra: Record<string, unknown> = {}) => ({
  id: 'rec-1', socioId: 's1', estado: 'PENDIENTE', importe: 40, importeDevuelto: 0, metodoCobro: null, sepaEstado: null,
  stripePaymentIntentId: null, proximoReintento: null, fechaCobro: null, fechaDevolucion: null, ...extra,
});
const ids = (x: ReturnType<typeof accionesDeRecibo>) => x.map(a => a.id);

test('lo que no se pudo cobrar: cobrar a mano, con su tarjeta, «el banco lo devolvió» y eliminar', () => {
  assert.deepEqual(ids(accionesDeRecibo(r({ estado: 'FALLIDO' }), CTX)), ['COBRAR', 'COBRAR_SIN_ELLA', 'EL_BANCO_LO_DEVOLVIO', 'ELIMINAR']);
});

test('«Cobrar con su tarjeta»: solo si se puede cobrar sin ella, y apagado (con el motivo) si ya se cobra solo o la cuota está congelada', () => {
  assert.deepEqual(ids(accionesDeRecibo(r(), { ...CTX, cobroSinElla: null })), ['COBRAR', 'EL_BANCO_LO_DEVOLVIO', 'ELIMINAR']);
  const solo = accionesDeRecibo(r(), { ...CTX, seCobraSoloEl: 'el martes 6 oct' }).find(a => a.id === 'COBRAR_SIN_ELLA');
  assert.deepEqual(solo, { id: 'COBRAR_SIN_ELLA', texto: 'Cobrar con su tarjeta ··0077', nota: 'Ya se cobra solo el martes 6 oct.', desactivada: true });
  const congelada = accionesDeRecibo(r(), { ...CTX, cuota: { estado: 'PAUSADA' } }).find(a => a.id === 'COBRAR_SIN_ELLA');
  assert.equal(congelada?.desactivada, true);
});

test('devuelto por el banco: cobrar a mano y, con remesas y mandato vigente, reintentar por el banco; sin su tarjeta (el servidor no lo cobra así)', () => {
  const devuelto = r({ estado: 'DEVUELTO', fechaDevolucion: '2026-09-06', metodoCobro: 'SEPA' });
  assert.deepEqual(ids(accionesDeRecibo(devuelto, { ...CTX, estudioHaceRemesas: true, mandatoVigente: true })), ['COBRAR', 'REINTENTAR_POR_EL_BANCO']);
  assert.deepEqual(ids(accionesDeRecibo(devuelto, { ...CTX, estudioHaceRemesas: true, mandatoVigente: false })), ['COBRAR'], 'sin mandato vigente no entraría en la remesa');
});

test('en el banco con un cargo de Stripe: lo cierra Stripe y no se ofrece nada más', () => {
  const x = accionesDeRecibo(r({ estado: 'EN_CURSO', stripePaymentIntentId: 'pi_1' }), { ...CTX, estudioHaceRemesas: true, algunMandato: true });
  assert.deepEqual(ids(x), ['LO_CIERRA_STRIPE']);
  assert.equal(x[0].desactivada, true);
});

test('en el banco: «lo ha cobrado / lo devolvió» solo si pudo salir en una remesa; «No llegó a ir al banco», siempre', () => {
  const enBanco = r({ estado: 'EN_CURSO' });
  assert.deepEqual(ids(accionesDeRecibo(enBanco, { ...CTX, estudioHaceRemesas: true, algunMandato: true })), ['EL_BANCO_LO_HA_COBRADO', 'EL_BANCO_LO_DEVOLVIO', 'NO_LLEGO_AL_BANCO']);
  assert.deepEqual(ids(accionesDeRecibo(enBanco, { ...CTX, estudioHaceRemesas: false, algunMandato: true })), ['NO_LLEGO_AL_BANCO']);
  assert.deepEqual(ids(accionesDeRecibo(enBanco, { ...CTX, estudioHaceRemesas: true, algunMandato: false })), ['NO_LLEGO_AL_BANCO']);
});

test('cobrado en efectivo: solo «Le he devuelto el dinero» (ningún banco lo devuelve); con factura, verla; sin ella y facturando, hacerla', () => {
  const efectivo = r({ estado: 'COBRADO', metodoCobro: 'EFECTIVO', fechaCobro: '2026-10-01' });
  assert.deepEqual(ids(accionesDeRecibo(efectivo, CTX)), ['LE_HE_DEVUELTO_EL_DINERO']);
  assert.deepEqual(ids(accionesDeRecibo(efectivo, { ...CTX, estudioFactura: true })), ['HACERLE_FACTURA', 'LE_HE_DEVUELTO_EL_DINERO']);
  const conFactura = accionesDeRecibo(efectivo, { ...CTX, estudioFactura: true, factura: { numero: 'A-2026-0007' } });
  assert.deepEqual(ids(conFactura), ['VER_FACTURA', 'LE_HE_DEVUELTO_EL_DINERO']);
  assert.equal(conFactura[0].texto, 'Ver factura A-2026-0007');
});

test('cobrado con la tarjeta del datáfono (sin Stripe): las dos devoluciones, que son hechos distintos', () => {
  assert.deepEqual(ids(accionesDeRecibo(r({ estado: 'COBRADO', metodoCobro: 'TARJETA', fechaCobro: '2026-10-01' }), CTX)), ['LE_HE_DEVUELTO_EL_DINERO', 'EL_BANCO_LO_DEVOLVIO']);
});

test('cobrado por Stripe: se devuelve desde su ficha (por Stripe), nunca anotándolo aquí', () => {
  const stripe = r({ estado: 'COBRADO', metodoCobro: 'TARJETA', stripePaymentIntentId: 'pi_1', fechaCobro: '2026-10-01' });
  assert.deepEqual(ids(accionesDeRecibo(stripe, CTX)), ['DEVOLVER_DESDE_SU_FICHA']);
});

test('una venta de la caja (`rec-pos-…`): nada desde aquí, se devuelve desde la caja', () => {
  assert.deepEqual(ids(accionesDeRecibo(r({ id: 'rec-pos-v1', estado: 'COBRADO', metodoCobro: 'EFECTIVO', fechaCobro: '2026-10-01' }), CTX)), []);
});

test('reembolsado: solo su factura, si la tiene; con factura no se elimina nada', () => {
  const reemb = r({ estado: 'DEVUELTO', importeDevuelto: 40, metodoCobro: 'EFECTIVO', fechaCobro: '2026-09-01', fechaDevolucion: '2026-09-03' });
  assert.deepEqual(ids(accionesDeRecibo(reemb, { ...CTX, factura: { numero: 'A-1' } })), ['VER_FACTURA']);
  assert.deepEqual(ids(accionesDeRecibo(r(), { ...CTX, factura: { numero: 'A-1' } })).includes('ELIMINAR'), false);
});

test('anulado: solo eliminarlo', () => {
  assert.deepEqual(ids(accionesDeRecibo(r({ estado: 'ANULADO' }), CTX)), ['ELIMINAR']);
});
