import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explicacionAcceso, detallesAcceso, fechaVigencia, etiquetaEstadoReserva, MOTIVO_CORTO, type DatosTexto, type MotivoVisible } from './textos-acceso.ts';

const vacio: DatosTexto = { clase: null, otraClase: null, plazaFija: null, yaEntroEn: null, avisos: [] };
const REFORMER = { nombre: 'Reformer', inicio: '2026-09-29T16:00:00Z', sala: 'Sala 2' };

test('cada motivo tiene su frase (ninguno cae en blanco)', () => {
  const motivos: MotivoVisible[] = [
    'RESERVA_CONFIRMADA', 'PLAZA_FIJA', 'YA_ENTRO', 'PENDIENTE_APROBACION', 'CLIENTA_DESACTIVADA', 'IMPAGO', 'VARIAS_CLASES',
    'SIN_RESERVA', 'RESERVA_CANCELADA', 'LISTA_ESPERA', 'NO_ASISTIO', 'RESERVA_OTRA_CLASE', 'CLASE_CANCELADA', 'CLASE_TERMINADA',
    'CLASE_NO_EMPEZADA', 'SIN_CLASE_AHORA', 'QR_NO_RECONOCIDO', 'QR_SUSTITUIDO', 'QR_OTRO_ESTUDIO', 'APROBADA_SIN_PLAZA',
    'CLASE_YA_EMPEZADA', 'NO_PERMITIDO', 'ESTADO_A_REVISAR',
  ];
  for (const m of motivos) assert.ok(explicacionAcceso(m, vacio).length > 10, m);
});

test('los textos del encargo, tal cual', () => {
  assert.equal(explicacionAcceso('SIN_RESERVA', { ...vacio, clase: REFORMER }), 'No tiene una reserva para esta clase.');
  assert.equal(explicacionAcceso('RESERVA_CANCELADA', vacio), 'Esta reserva fue cancelada.');
  assert.equal(explicacionAcceso('PLAZA_FIJA', vacio), 'Clase fija confirmada.');
  assert.equal(explicacionAcceso('RESERVA_CONFIRMADA', vacio), 'Reserva confirmada.');
  assert.equal(explicacionAcceso('PENDIENTE_APROBACION', vacio), 'Esta reserva está pendiente de aprobación.');
  assert.equal(explicacionAcceso('IMPAGO', vacio), 'Esta alumna tiene un estado que requiere revisión.');
});

test('otra clase: dice a cuál, con hora del estudio y sala', () => {
  assert.equal(explicacionAcceso('RESERVA_OTRA_CLASE', { ...vacio, otraClase: { nombre: 'Mat', inicio: '2026-09-29T16:00:00Z', sala: 'Sala 1' } }),
    'Su reserva es para otra clase: Mat · 18:00 · Sala 1.');
});

test('plaza fija: con fecha de fin o sin ella', () => {
  assert.deepEqual(detallesAcceso('PLAZA_FIJA', { ...vacio, plazaFija: { hasta: '2027-06-30' } }), ['Tiene una clase fija hasta el 30 de junio de 2027.']);
  assert.deepEqual(detallesAcceso('PLAZA_FIJA', { ...vacio, plazaFija: { hasta: null } }), ['Tiene una clase fija sin fecha de fin.']);
  assert.equal(fechaVigencia('2027-01-01'), '1 de enero de 2027');
});

test('el detalle de los avisos es solo para quien los recibe; a la instructora, sin dinero', () => {
  assert.deepEqual(detallesAcceso('IMPAGO', { ...vacio, avisos: ['CLIENTA_DESACTIVADA', 'IMPAGO'] }),
    ['Su ficha está desactivada en el estudio.', 'Tiene un recibo impagado.']);
  const instructora = detallesAcceso('ESTADO_A_REVISAR', vacio);
  assert.ok(instructora.every(l => !/impag|recibo|desactivad/i.test(l)));
});

test('estado de la reserva en palabras', () => {
  assert.equal(etiquetaEstadoReserva('LISTA_ESPERA'), 'En lista de espera');
  assert.equal(etiquetaEstadoReserva(null), 'Sin reserva');
});

test('historial: cada motivo del registro tiene su etiqueta corta, y la lista es la del CHECK de la tabla', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const dir = new URL('../../supabase/migrations/', import.meta.url);
  const fichero = readdirSync(dir).find(n => n.endsWith('_control_acceso_qr.sql'));
  assert.ok(fichero, 'no se encuentra la migración del control de acceso');
  const sql = readFileSync(new URL(fichero, dir), 'utf8');
  const bloque = sql.slice(sql.indexOf('motivo text not null check (motivo in ('), sql.indexOf('decision text check'));
  const delCheck = [...bloque.matchAll(/'([A-Z_]+)'/g)].map(m => m[1]).sort();
  assert.ok(delCheck.length > 15, 'el parser no ve los motivos del CHECK');
  assert.deepEqual(Object.keys(MOTIVO_CORTO).sort(), delCheck);
  for (const [m, t] of Object.entries(MOTIVO_CORTO)) assert.ok(t.length > 3, m);
});
