import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNAS_LEDGER, serializarMovimiento, textoMovimiento, type FilaLedger, type ReservaSuya, type SesionMin } from './movimientos-bono.ts';

// Sin `@/`: con el alias este test dejaría de ejecutarse sin avisar.

const fechaEstudio = (iso: string) => iso.slice(0, 10);
const fila = (extra: Partial<FilaLedger>): FilaLedger => ({ id: 'm1', tipo: 'CONSUMO_BONO', delta: -1, saldo_despues: 4, reserva_id: null, creado_en: '2026-10-05T09:00:00Z', ...extra });
const reservas = new Map<string, ReservaSuya>([
  ['r-ok', { id: 'r-ok', estado: 'CONFIRMADA', sesion_id: 's1', cancelada_tardia: null }],
  ['r-asis', { id: 'r-asis', estado: 'ASISTIDA', sesion_id: 's1', cancelada_tardia: null }],
  ['r-tarde', { id: 'r-tarde', estado: 'CANCELADA', sesion_id: 's1', cancelada_tardia: true }],
  ['r-tiempo', { id: 'r-tiempo', estado: 'CANCELADA', sesion_id: 's1', cancelada_tardia: false }],
  ['r-clase-cancelada', { id: 'r-clase-cancelada', estado: 'CANCELADA', sesion_id: 's2', cancelada_tardia: null }],
]);
const sesiones = new Map<string, SesionMin>([
  ['s1', { id: 's1', inicio: '2026-10-08T08:00:00Z', tipo_clase_id: 'tc-r', cancelada: false }],
  ['s2', { id: 's2', inicio: '2026-10-09T08:00:00Z', tipo_clase_id: 'tc-r', cancelada: true }],
]);
const nombres = new Map([['tc-r', 'Reformer']]);
const ser = (f: FilaLedger) => serializarMovimiento(f, reservas, sesiones, nombres, fechaEstudio);
const ANTES = Date.parse('2026-10-06T10:00:00Z');
const DESPUES = Date.parse('2026-10-08T09:00:00Z');

test('la lista blanca no lleva quién lo hizo ni por qué', () => {
  for (const prohibida of ['actor_id', 'actor_tipo', 'motivo', 'contexto', 'socio_id', '*']) {
    assert.ok(!COLUMNAS_LEDGER.split(',').map((c) => c.trim()).includes(prohibida), prohibida);
  }
});

test('un consumo dice la clase y en qué quedó la reserva', () => {
  assert.deepEqual(textoMovimiento(ser(fila({ reserva_id: 'r-ok' })), ANTES), { cifra: '−1', titulo: 'Reformer · jue 8 oct', detalle: 'Reservada' });
  assert.equal(textoMovimiento(ser(fila({ reserva_id: 'r-ok' })), DESPUES).detalle, 'Clase ya pasada');
  assert.equal(textoMovimiento(ser(fila({ reserva_id: 'r-asis' })), ANTES).detalle, 'Fuiste');
  assert.equal(textoMovimiento(ser(fila({ reserva_id: 'r-tarde' })), ANTES).detalle, 'Cancelada fuera de plazo');
  assert.equal(textoMovimiento(ser(fila({ reserva_id: 'r-tiempo' })), ANTES).detalle, 'Cancelada');
});

test('una reserva que no es suya (o no existe) no se describe: «Reserva del…»', () => {
  const m = ser(fila({ reserva_id: 'r-de-otra' }));
  assert.equal(m.claseInfo, undefined);
  assert.equal(m.estadoReserva, undefined);
  assert.deepEqual(textoMovimiento(m, ANTES), { cifra: '−1', titulo: 'Reserva del 5 oct', detalle: null });
});

test('una devolución dice por qué solo cuando se sabe', () => {
  const dev = (reserva_id: string | null) => textoMovimiento(ser(fila({ tipo: 'DEVOLUCION_BONO', delta: 1, reserva_id })), ANTES);
  assert.equal(dev('r-clase-cancelada').titulo, 'Devuelta: se canceló la clase');
  assert.equal(dev('r-tiempo').titulo, 'Devuelta: reserva cancelada a tiempo');
  assert.equal(dev('r-tarde').titulo, 'Sesión devuelta');
  assert.equal(dev(null).titulo, 'Sesión devuelta');
  assert.equal(dev('r-tiempo').cifra, '+1');
});

test('compra, renovación, ajuste y apertura', () => {
  assert.deepEqual(textoMovimiento(ser(fila({ tipo: 'COMPRA', delta: 8 })), ANTES), { cifra: '+8', titulo: 'Bono activado', detalle: '5 oct' });
  assert.equal(textoMovimiento(ser(fila({ tipo: 'RENOVACION', delta: 8 })), ANTES).titulo, 'Renovación');
  assert.deepEqual(textoMovimiento(ser(fila({ tipo: 'AJUSTE_SIN_CONTEXTO', delta: -2 })), ANTES), { cifra: '−2', titulo: 'Ajuste del saldo', detalle: '5 oct' });
  assert.equal(textoMovimiento(ser(fila({ tipo: 'REVERSION_VENTA', delta: -8 })), ANTES).titulo, 'Ajuste del saldo');
  assert.equal(textoMovimiento(ser(fila({ tipo: 'APERTURA', delta: 6, creado_en: '2026-10-02T09:00:00Z' })), ANTES).titulo, 'El 2 oct tenías 6');
});

test('nunca «Compraste»', () => {
  const t = JSON.stringify(textoMovimiento(ser(fila({ tipo: 'COMPRA', delta: 8 })), ANTES));
  assert.ok(!/compr/i.test(t));
});
