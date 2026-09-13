import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  instructoraAtiendeSocia, dentroDeVentanaAlumna, accesoSaludSocia, mensajeAccesoSalud,
  VENTANA_ALUMNA_DIAS, type ClaseOCitaDeSocia,
} from './acceso-instructora.ts';

const AHORA = new Date('2026-09-13T10:00:00Z');
const dias = (n: number) => new Date(AHORA.getTime() + n * 86_400_000).toISOString();
const fila = (p: Partial<ClaseOCitaDeSocia>): ClaseOCitaDeSocia => ({
  inicio: dias(1), estado: 'CONFIRMADA', instructorId: 'ins-1', cancelada: false, ...p,
});

test('la ventana son 30 días hacia atrás y hacia delante, extremos incluidos', () => {
  assert.equal(VENTANA_ALUMNA_DIAS, 30);
  assert.equal(dentroDeVentanaAlumna(dias(30), AHORA), true);
  assert.equal(dentroDeVentanaAlumna(dias(-30), AHORA), true);
  assert.equal(dentroDeVentanaAlumna(dias(30.01), AHORA), false);
  assert.equal(dentroDeVentanaAlumna(dias(-30.01), AHORA), false);
  assert.equal(dentroDeVentanaAlumna('no es fecha', AHORA), false);
});

test('instructora con una reserva de la socia en su clase dentro de la ventana: sí', () => {
  assert.equal(instructoraAtiendeSocia([fila({})], 'ins-1', AHORA), true);
  // Una clase pasada a la que no vino sigue siendo su alumna.
  assert.equal(instructoraAtiendeSocia([fila({ inicio: dias(-10), estado: 'NO_ASISTIO' })], 'ins-1', AHORA), true);
  assert.equal(instructoraAtiendeSocia([fila({ estado: 'LISTA_ESPERA' })], 'ins-1', AHORA), true);
});

test('la clase o la cita de OTRA instructora no cuenta', () => {
  assert.equal(instructoraAtiendeSocia([fila({ instructorId: 'ins-2' })], 'ins-1', AHORA), false);
});

test('reserva cancelada, sesión cancelada o fuera de ventana: no', () => {
  assert.equal(instructoraAtiendeSocia([fila({ estado: 'CANCELADA' })], 'ins-1', AHORA), false);
  assert.equal(instructoraAtiendeSocia([fila({ cancelada: true })], 'ins-1', AHORA), false);
  assert.equal(instructoraAtiendeSocia([fila({ inicio: dias(45) })], 'ins-1', AHORA), false);
  assert.equal(instructoraAtiendeSocia([fila({ inicio: dias(-31) })], 'ins-1', AHORA), false);
});

test('sin instructora resuelta o sin filas: no (falla cerrado)', () => {
  assert.equal(instructoraAtiendeSocia([fila({})], null, AHORA), false);
  assert.equal(instructoraAtiendeSocia([fila({})], undefined, AHORA), false);
  assert.equal(instructoraAtiendeSocia([], 'ins-1', AHORA), false);
});

test('basta con una fila buena entre varias malas', () => {
  const filas = [fila({ estado: 'CANCELADA' }), fila({ instructorId: 'ins-2' }), fila({ inicio: dias(-2) })];
  assert.equal(instructoraAtiendeSocia(filas, 'ins-1', AHORA), true);
});

test('propietaria ve todas; instructora solo si atiende; el resto nunca', () => {
  assert.equal(accesoSaludSocia('PROPIETARIO', false), 'PERMITIDO');
  assert.equal(accesoSaludSocia('INSTRUCTOR', true), 'PERMITIDO');
  assert.equal(accesoSaludSocia('INSTRUCTOR', false), 'NO_ES_SU_ALUMNA');
  assert.equal(accesoSaludSocia('RECEPCION', true), 'SIN_ROL_CLINICO');
  assert.equal(accesoSaludSocia('MANAGER', true), 'SIN_ROL_CLINICO');
  assert.equal(accesoSaludSocia(null, true), 'SIN_ROL_CLINICO');
  assert.equal(accesoSaludSocia('ALGO_RARO', true), 'SIN_ROL_CLINICO');
});

test('el mensaje a la instructora dice por qué y a quién pedirlo, no «vacío»', () => {
  const m = mensajeAccesoSalud('NO_ES_SU_ALUMNA')!;
  assert.match(m, /alumnas de tus clases/);
  assert.match(m, /30 días/);
  assert.equal(mensajeAccesoSalud('PERMITIDO'), null);
});
