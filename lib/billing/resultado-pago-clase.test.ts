import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conPrioridadEnLaCola, destinoDelPago, MINUTOS_PRIORIDAD } from './resultado-pago-clase.ts';

// P06 · Fase A: un pago correcto acaba en reserva o en compensación registrada. Nunca «perdido».

const base = { sinSitio: false, pagadaConLoEntregado: true };
const ok = (estado: string) => ({ ok: true as const, estado, reservaId: 'res-web-x' });
const no = (motivo: string, detalle?: string) => ({ ok: false as const, motivo, detalle });

test('con plaza y pagada con lo que compró: RESERVADA', () => {
  assert.deepEqual(destinoDelPago(ok('CONFIRMADA'), base), { tipo: 'reservada' });
});

test('con plaza pero pagada con OTRA cosa: lo comprado queda intacto a su favor', () => {
  assert.deepEqual(destinoDelPago(ok('CONFIRMADA'), { ...base, pagadaConLoEntregado: false }), { tipo: 'compensada', motivo: 'PAGADO_SIN_USAR' });
});

test('se llenó mientras pagaba: en espera; si el estudio aprueba cada reserva, pendiente', () => {
  assert.deepEqual(destinoDelPago(ok('LISTA_ESPERA'), base), { tipo: 'compensada', motivo: 'EN_ESPERA' });
  assert.deepEqual(destinoDelPago(ok('PENDIENTE_APROBACION'), base), { tipo: 'compensada', motivo: 'PENDIENTE_APROBACION' });
  assert.deepEqual(destinoDelPago(ok('RARO'), base), { tipo: 'compensada', motivo: 'ERROR' }, 'un estado inesperado no se da por reservado');
});

test('el sitio que pagó se lo llevó otra: una vez sin sitio; si tampoco, sin plaza', () => {
  assert.deepEqual(destinoDelPago(no('spot-ocupado'), base), { tipo: 'reintentar-sin-sitio' });
  assert.deepEqual(destinoDelPago(no('spot-ocupado'), { ...base, sinSitio: true }), { tipo: 'compensada', motivo: 'SIN_PLAZA' });
});

test('cada rechazo de negocio es su compensación', () => {
  assert.deepEqual(destinoDelPago(no('ya-tenia-reserva'), base), { tipo: 'compensada', motivo: 'YA_TENIA_RESERVA' });
  assert.deepEqual(destinoDelPago(no('sesion-no-encontrada'), base), { tipo: 'compensada', motivo: 'CLASE_CERRADA' });
  assert.deepEqual(destinoDelPago(no('sesion-invalida', 'clase completa'), base), { tipo: 'compensada', motivo: 'SIN_PLAZA' });
  for (const d of ['cancelada', 'ya empezada', 'fuera de ventana mínima', 'fuera de ventana máxima']) {
    assert.deepEqual(destinoDelPago(no('sesion-invalida', d), base), { tipo: 'compensada', motivo: 'CLASE_CERRADA' }, d);
  }
  assert.deepEqual(destinoDelPago(no('sesion-invalida', 'ya tiene otra clase a esa hora'), base), { tipo: 'compensada', motivo: 'RECHAZADA' });
});

test('un fallo que no es una regla (la base no contestó): sigue pagado y se reintenta', () => {
  assert.deepEqual(destinoDelPago(no('error', 'timeout'), base), { tipo: 'reintentar' });
});

test('prioridad en la cola: solo en espera y pagando como mucho 20 min después de comprobar la plaza', () => {
  const comprobada = '2026-10-06T10:00:00Z';
  const en = (min: number) => new Date(Date.parse(comprobada) + min * 60_000).toISOString();
  assert.equal(conPrioridadEnLaCola('EN_ESPERA', comprobada, en(5)), true);
  assert.equal(conPrioridadEnLaCola('EN_ESPERA', comprobada, en(MINUTOS_PRIORIDAD)), true);
  assert.equal(conPrioridadEnLaCola('EN_ESPERA', comprobada, en(MINUTOS_PRIORIDAD + 1)), false);
  assert.equal(conPrioridadEnLaCola('SIN_PLAZA', comprobada, en(1)), false);
  assert.equal(conPrioridadEnLaCola('EN_ESPERA', null, en(1)), false);
  assert.equal(conPrioridadEnLaCola('EN_ESPERA', comprobada, en(-1)), false, 'un reloj al revés no da prioridad');
});
