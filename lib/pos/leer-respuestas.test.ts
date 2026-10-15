import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerCatalogoPOS, leerEstadoCaja } from './leer-respuestas.ts';

// La forma que devuelve hoy GET /api/pos/catalogo (app/api/pos/catalogo/route.ts).
const PRODUCTO = {
  id: 'p1', nombre: 'Calcetines', descripcion: null, categoria: 'ROPA', precio: 12, activo: true,
  stock: 10, stockMinimo: 2, ivaPct: 21, imagenUrl: null, sku: null, codigoBarras: null,
};
const SERVICIO = { ...PRODUCTO, id: 'p2', nombre: 'Toalla', stock: null, activo: false };
const PLAN = { id: 'pl1', nombre: 'Bono 10 clases', descripcion: null, precio: 130, tipo: 'BONO', sesiones: 10, validezDias: 90, ivaPct: 21 };
const CAJA = { id: 'caja-1', fondoInicial: 100, abiertaEn: '2026-10-15T08:00:00Z', abiertaPor: 'Cloe' };
const CATALOGO = {
  ivaDefecto: 21,
  cobro: { stripeConectado: true, datafonoEmparejado: false, datafonoProveedor: null, sumupDisponible: false },
  productos: [PRODUCTO, SERVICIO],
  planes: [PLAN],
  caja: CAJA,
  hoy: {
    ventas: 1, total: 12, ticketMedio: 12,
    porMetodo: [{ metodo: 'EFECTIVO', n: 1, total: 12 }],
    ultimas: [{ id: 'v1', numero: 1, total: 12, metodoPago: 'EFECTIVO', realizadaEn: '2026-10-15T09:00:00Z', socioId: null }],
  },
};

const ok = <T>(r: { ok: true; valor: T } | { ok: false; error: string }): T => {
  assert.equal(r.ok, true, r.ok ? '' : r.error);
  return (r as { ok: true; valor: T }).valor;
};
const error = (r: { ok: boolean; error?: string }): string => {
  assert.equal(r.ok, false);
  return (r as { ok: false; error: string }).error;
};

test('catálogo: la forma de siempre se lee EXACTAMENTE igual (con la caja abierta y con la caja cerrada)', () => {
  assert.deepEqual(ok(leerCatalogoPOS(CATALOGO)), CATALOGO);
  assert.deepEqual(ok(leerCatalogoPOS({ ...CATALOGO, caja: null })), { ...CATALOGO, caja: null });
  assert.deepEqual(ok(leerCatalogoPOS({ ...CATALOGO, productos: [], planes: [] })).productos, []);
});

test('catálogo: lo que tumbaba la Caja (un `{}`, nada, una lista o texto) es un error que dice qué falta', () => {
  for (const raro of [null, undefined, [], 'error', 0]) assert.match(error(leerCatalogoPOS(raro)), /no trae el catálogo entero\./);
  const todo = error(leerCatalogoPOS({}));
  for (const parte of ['el IVA por defecto', 'cómo se puede cobrar', 'los productos', 'los bonos y cuotas', 'si la caja está abierta', 'lo vendido hoy']) {
    assert.ok(todo.includes(parte), `«${parte}» en «${todo}»`);
  }
  // Nunca «no se ha cobrado nada»: esta lectura se repite justo después de vender.
  assert.match(todo, /Esta lectura no cobra ni cambia nada, y lo que ya hayas hecho sigue hecho/);
  assert.doesNotMatch(todo, /No se ha cobrado/);
});

test('catálogo: un campo a `null` o una lista que no es lista, también dice cuál', () => {
  assert.match(error(leerCatalogoPOS({ ...CATALOGO, productos: null })), /^La respuesta del servidor ha llegado incompleta: no trae los productos\. /);
  assert.match(error(leerCatalogoPOS({ ...CATALOGO, planes: { pl1: PLAN } })), /los bonos y cuotas/);
  assert.match(error(leerCatalogoPOS({ ...CATALOGO, hoy: null })), /lo vendido hoy/);
  assert.match(error(leerCatalogoPOS({ ...CATALOGO, ivaDefecto: '21' })), /el IVA por defecto/);
});

test('catálogo: sin saber si la caja está abierta NO se da por cerrada (invitaría a abrir otra encima)', () => {
  const { caja: _c, ...sinCaja } = CATALOGO;
  assert.match(error(leerCatalogoPOS(sinCaja)), /si la caja está abierta/);
  assert.match(error(leerCatalogoPOS({ ...CATALOGO, caja: { id: 'caja-1' } })), /si la caja está abierta/);
});

test('catálogo: la fila inservible se queda fuera, y la dudosa enseña menos, nunca más', () => {
  const v = ok(leerCatalogoPOS({
    ...CATALOGO,
    productos: [PRODUCTO, null, { ...PRODUCTO, id: 7 }, { ...PRODUCTO, id: 'p3', precio: '12' }, { ...PRODUCTO, id: 'p4', ivaPct: null }, { ...PRODUCTO, id: 'p5', activo: 'sí' }],
    planes: [PLAN, { ...PLAN, id: 'pl2', precio: null }, 'plan'],
  }));
  assert.deepEqual(v.productos.map((p) => p.id), ['p1', 'p5']);
  // Sin un `activo` claro, no se ofrece.
  assert.equal(v.productos.find((p) => p.id === 'p5')!.activo, false);
  assert.deepEqual(v.planes.map((p) => p.id), ['pl1']);
});

test('catálogo: un método de cobro que no viene confirmado no se ofrece', () => {
  const v = ok(leerCatalogoPOS({ ...CATALOGO, cobro: { stripeConectado: 'true', datafonoEmparejado: 1, datafonoProveedor: 'otro' } }));
  assert.deepEqual(v.cobro, { stripeConectado: false, datafonoEmparejado: false, datafonoProveedor: null, sumupDisponible: false });
});

test('catálogo: el detalle de hoy que no es lista, vacío; lo que es cifra, intacto', () => {
  const v = ok(leerCatalogoPOS({ ...CATALOGO, hoy: { ventas: 3, total: 40, ticketMedio: 13.33, porMetodo: null, ultimas: {} } }));
  assert.deepEqual(v.hoy, { ventas: 3, total: 40, ticketMedio: 13.33, porMetodo: [], ultimas: [] });
});

const ESTADO = {
  caja: CAJA,
  esperado: 152.5,
  movimientos: [{ id: 'm1', tipo: 'VENTA', importe: 12, metodoPago: 'EFECTIVO', concepto: 'Venta #1', referencia: 'v1', creadoEn: '2026-10-15T09:00:00Z', creadoPor: 'Cloe' }],
};

test('caja: la forma de siempre se lee igual, abierta y cerrada', () => {
  assert.deepEqual(ok(leerEstadoCaja(ESTADO)), ESTADO);
  const cerrada = { caja: null, movimientos: [], esperado: 0 };
  assert.deepEqual(ok(leerEstadoCaja(cerrada)), cerrada);
});

test('caja: sin lo esperado, sin movimientos o sin saber si está abierta, no se abre ni se arquea: dice qué falta', () => {
  for (const raro of [null, [], 'x']) assert.match(error(leerEstadoCaja(raro)), /el estado de la caja/);
  const todo = error(leerEstadoCaja({}));
  for (const parte of ['si la caja está abierta', 'lo que debería haber en la caja', 'los movimientos']) assert.ok(todo.includes(parte), parte);
  assert.match(error(leerEstadoCaja({ ...ESTADO, esperado: null })), /lo que debería haber en la caja/);
  assert.match(error(leerEstadoCaja({ ...ESTADO, movimientos: null })), /los movimientos/);
});

test('caja: un movimiento inservible se queda fuera; los demás, intactos', () => {
  const v = ok(leerEstadoCaja({ ...ESTADO, movimientos: [...ESTADO.movimientos, null, { id: 'm2', importe: 'x' }] }));
  assert.deepEqual(v.movimientos, ESTADO.movimientos);
});
