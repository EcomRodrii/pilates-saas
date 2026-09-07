import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calcularTicket, calcularCambio, sugerenciasEfectivo, descuentoManual,
  estadoStock, puedeAnadir, céntimos, type LineaTicket,
} from './ticket.ts';

// ─────────────────────────────────────────────────────────────────────────────
// El caso ancla: los MISMOS números que devolvió `registrar_venta_pos` contra
// la base de datos real (verificado con execute_sql + ROLLBACK, 2026-09-07).
//
// Este test es el contrato entre las dos implementaciones. Si el TPV pintara
// un total y el servidor cobrara otro, sería el peor fallo posible de un punto
// de venta — y sería mudo, porque las dos cifras parecerían razonables por
// separado. Aquí se fija que coinciden al céntimo.
// ─────────────────────────────────────────────────────────────────────────────
const CARRITO_ANCLA: LineaTicket[] = [
  { clave: 'a', tipo: 'PRODUCTO', referenciaId: 't-a', nombre: 'Calcetines', precio: 25, cantidad: 2, ivaPct: 21 },
  { clave: 'p', tipo: 'PLAN', referenciaId: 't-plan', nombre: 'Bono Reformer 10', precio: 80, cantidad: 1, ivaPct: 21 },
  { clave: 'c', tipo: 'PRODUCTO', referenciaId: 't-c', nombre: 'Servicio', precio: 9.99, cantidad: 1, ivaPct: 10 },
];

test('coincide al céntimo con lo que calculó la RPC en la base real', () => {
  // Código del 10 % sobre 139,99 → 14,00 (lo resuelve calcularDescuento, aquí
  // se pasa ya en euros como hace el TPV).
  const t = calcularTicket(CARRITO_ANCLA, { descuentoCodigo: 14 });

  assert.equal(t.subtotal, 139.99);
  assert.equal(t.descuento, 14);
  assert.equal(t.baseImponible, 104.86);
  assert.equal(t.ivaTotal, 21.13);
  assert.equal(t.total, 125.99);

  // Descuento prorrateado línea a línea, igual que en SQL.
  assert.deepEqual(t.lineas.map((l) => l.descuento), [5, 8, 1]);
  assert.deepEqual(t.lineas.map((l) => l.total), [45, 72, 8.99]);
  assert.deepEqual(t.lineas.map((l) => l.baseImponible), [37.19, 59.5, 8.17]);
});

test('la suma de las líneas es EXACTAMENTE el total de cabecera', () => {
  const t = calcularTicket(CARRITO_ANCLA, { descuentoCodigo: 14 });
  const suma = céntimos(t.lineas.reduce((s, l) => s + l.total, 0));
  assert.equal(suma, t.total, 'un ticket cuyas líneas no suman el total no es de fiar');
  assert.equal(céntimos(t.baseImponible + t.ivaTotal), t.total);
  // Y el descuento repartido cuadra con el descuento total.
  assert.equal(céntimos(t.lineas.reduce((s, l) => s + l.descuento, 0)), t.descuento);
});

test('el céntimo suelto del prorrateo va a la última línea, no se pierde', () => {
  // Tres líneas iguales y un descuento de 10 € reparten 3,33/3,33/3,34.
  const tres: LineaTicket[] = [1, 2, 3].map((n) => ({
    clave: `l${n}`, tipo: 'PRODUCTO' as const, referenciaId: `p${n}`,
    nombre: `P${n}`, precio: 10, cantidad: 1, ivaPct: 21,
  }));
  const t = calcularTicket(tres, { descuentoTipo: 'EUROS', descuentoValor: 10 });
  assert.deepEqual(t.lineas.map((l) => l.descuento), [3.33, 3.33, 3.34]);
  assert.equal(t.descuento, 10);
  assert.equal(t.total, 20);
});

test('desglosa el IVA por tipo, no en una cifra única', () => {
  const t = calcularTicket(CARRITO_ANCLA, { descuentoCodigo: 14 });
  assert.deepEqual(t.porTipoIva, [
    { ivaPct: 21, base: 96.69, cuota: 20.31 },
    { ivaPct: 10, base: 8.17, cuota: 0.82 },
  ]);
});

// ─── Descuentos: el borde donde se cobra de más ──────────────────────────────

test('un descuento mayor que el subtotal se topa: el total nunca es negativo', () => {
  const t = calcularTicket(CARRITO_ANCLA, { descuentoTipo: 'EUROS', descuentoValor: 9999 });
  assert.equal(t.total, 0);
  assert.equal(t.descuento, t.subtotal);
});

test('un descuento negativo no se convierte en un recargo', () => {
  // `min=0` en el input no impide pegar un negativo. Si se colara, restar un
  // negativo sumaría al total: la clienta pagaría MÁS por un "descuento".
  assert.equal(descuentoManual(100, 'EUROS', -50), 0);
  assert.equal(descuentoManual(100, 'PORCENTAJE', -10), 0);
  const t = calcularTicket(CARRITO_ANCLA, { descuentoTipo: 'EUROS', descuentoValor: -50 });
  assert.equal(t.total, t.subtotal);
});

test('un porcentaje por encima de 100 se topa en 100', () => {
  assert.equal(descuentoManual(100, 'PORCENTAJE', 250), 100);
});

test('el descuento manual y el del código se suman, y el conjunto se topa', () => {
  const t = calcularTicket(CARRITO_ANCLA, {
    descuentoTipo: 'EUROS', descuentoValor: 100, descuentoCodigo: 100,
  });
  assert.equal(t.descuento, 139.99);
  assert.equal(t.total, 0);
});

// ─── Redondeo ────────────────────────────────────────────────────────────────

test('redondea como Postgres, sin el error clásico de coma flotante', () => {
  // 1.005 se representa como 1.00499999…: Math.round() daría 1.00.
  assert.equal(céntimos(1.005), 1.01);
  assert.equal(céntimos(2.675), 2.68);
  assert.equal(céntimos(0.1 + 0.2), 0.3);
});

test('un precio con decimales raros no desajusta el ticket', () => {
  const t = calcularTicket([
    { clave: 'x', tipo: 'PRODUCTO', referenciaId: 'x', nombre: 'X', precio: 3.33, cantidad: 3, ivaPct: 21 },
  ]);
  assert.equal(t.subtotal, 9.99);
  assert.equal(céntimos(t.baseImponible + t.ivaTotal), t.total);
});

// ─── Efectivo ────────────────────────────────────────────────────────────────

test('el cambio es exacto', () => {
  assert.deepEqual(calcularCambio(37.5, 50), { ok: true, cambio: 12.5 });
  assert.deepEqual(calcularCambio(125.99, 150), { ok: true, cambio: 24.01 });
  assert.deepEqual(calcularCambio(20, 20), { ok: true, cambio: 0 });
});

test('si el efectivo no llega, dice cuánto falta (no solo que no llega)', () => {
  assert.deepEqual(calcularCambio(37.5, 20), { ok: false, falta: 17.5 });
  assert.deepEqual(calcularCambio(37.5, Number.NaN), { ok: false, falta: 37.5 });
});

test('sugiere el importe exacto y billetes redondos por encima', () => {
  assert.deepEqual(sugerenciasEfectivo(37.5), [37.5, 38, 40, 50]);
  // Un importe ya redondo no sugiere escalones intermedios que nadie usaría:
  // para 20 € se paga con 20, o con un billete de 50.
  assert.deepEqual(sugerenciasEfectivo(20), [20, 50]);
  assert.deepEqual(sugerenciasEfectivo(0), []);
});

// ─── Stock ───────────────────────────────────────────────────────────────────

test('stock null es "no controla", NO es agotado', () => {
  // Confundirlos dejaría un servicio o una clase sin poder venderse jamás.
  assert.equal(estadoStock(null), 'SIN_CONTROL');
  assert.equal(estadoStock(undefined), 'SIN_CONTROL');
  assert.equal(estadoStock(0), 'AGOTADO');
});

test('avisa de stock bajo solo cuando hay un mínimo puesto', () => {
  assert.equal(estadoStock(3, 5), 'BAJO');
  assert.equal(estadoStock(5, 5), 'BAJO');
  assert.equal(estadoStock(6, 5), 'OK');
  assert.equal(estadoStock(1, 0), 'OK', 'sin mínimo configurado, 1 unidad no es "bajo"');
});

test('no deja meter en el carrito más unidades de las que hay', () => {
  assert.equal(puedeAnadir(3, 2), true);
  assert.equal(puedeAnadir(3, 3), false);
  assert.equal(puedeAnadir(0, 0), false);
  assert.equal(puedeAnadir(null, 999), true, 'sin control de stock no hay tope');
});

// ─── Carrito vacío ───────────────────────────────────────────────────────────

test('un carrito vacío no revienta ni inventa un total', () => {
  const t = calcularTicket([]);
  assert.equal(t.subtotal, 0);
  assert.equal(t.total, 0);
  assert.deepEqual(t.porTipoIva, []);
});
