import test from 'node:test';
import assert from 'node:assert/strict';
import { hoyISO, addDias, etiquetaDia, fechaCorta, fechaLarga, saludo, euros, horaFin, relativo } from './formato.ts';

// El grupo que de verdad importa: la fecha se calcula en Madrid, no en UTC.
// El paquete de diseño usa `new Date().toISOString().slice(0,10)`, que en
// España está mal dos horas cada día — de 00:00 a 02:00 devuelve el día
// anterior. Con eso, el horario abre en el día equivocado justo cuando alguien
// mira la app por la noche.

test('hoyISO usa la zona de Madrid, no UTC', () => {
  // 23:30 UTC del 3 de septiembre = 01:30 del 4 en Madrid (verano, UTC+2).
  assert.equal(hoyISO(new Date('2026-09-03T23:30:00Z')), '2026-09-04');
  // Y en invierno (UTC+1) el corte sigue estando en la medianoche de Madrid.
  assert.equal(hoyISO(new Date('2026-12-03T23:30:00Z')), '2026-12-04');
  // A media tarde no hay duda posible.
  assert.equal(hoyISO(new Date('2026-09-03T15:00:00Z')), '2026-09-03');
});

test('addDias no se cae en el cambio de hora', () => {
  // Último domingo de octubre de 2026: el 25 se atrasa el reloj. Construir a
  // medianoche local podría tirar la fecha al día anterior.
  assert.equal(addDias('2026-10-24', 1), '2026-10-25');
  assert.equal(addDias('2026-10-25', 1), '2026-10-26');
  // Y en el adelanto de marzo.
  assert.equal(addDias('2026-03-28', 1), '2026-03-29');
  assert.equal(addDias('2026-03-29', 1), '2026-03-30');
});

test('addDias cruza mes y año', () => {
  assert.equal(addDias('2026-01-31', 1), '2026-02-01');
  assert.equal(addDias('2026-12-31', 1), '2027-01-01');
  assert.equal(addDias('2026-03-01', -1), '2026-02-28');
});

test('etiquetaDia nombra hoy y mañana, y el resto por su día', () => {
  assert.equal(etiquetaDia('2026-09-03', '2026-09-03'), 'Hoy');
  assert.equal(etiquetaDia('2026-09-04', '2026-09-03'), 'Mañana');
  assert.equal(etiquetaDia('2026-09-05', '2026-09-03'), 'Sáb 5');
});

test('fechaCorta y fechaLarga en castellano', () => {
  assert.equal(fechaCorta('2026-09-04'), 'vie 4 sep');
  assert.equal(fechaLarga('2026-09-04'), 'viernes 4 de septiembre');
});

test('saludo cambia con la hora de Madrid', () => {
  assert.match(saludo('Ana', new Date('2026-09-03T07:00:00Z')), /^Buenos días, Ana$/);   // 09:00
  assert.match(saludo('Ana', new Date('2026-09-03T15:00:00Z')), /^Buenas tardes, Ana$/); // 17:00
  assert.match(saludo('Ana', new Date('2026-09-03T21:00:00Z')), /^Buenas noches, Ana$/); // 23:00
});

test('saludo sin nombre no deja una coma colgando', () => {
  // Pasa de verdad: una socia dada de alta por el webhook puede no tener nombre.
  assert.equal(saludo('', new Date('2026-09-03T07:00:00Z')), 'Buenos días');
});

test('euros con el formato español', () => {
  assert.equal(euros(18), '18 €');
  assert.equal(euros(18.5), '18,5 €');
});

test('horaFin suma la duración', () => {
  assert.equal(horaFin('10:00', 55), '10:55');
  assert.equal(horaFin('23:30', 60), '00:30'); // cruzar medianoche no rompe
  assert.equal(horaFin('09:05', 50), '09:55');
});

test('relativo redondea como habla una persona', () => {
  const t = (min: number) => relativo(new Date(Date.UTC(2026, 8, 3, 12, 0) - min * 60000).toISOString(), new Date(Date.UTC(2026, 8, 3, 12, 0)));
  assert.equal(t(20), 'hace 20 min');
  assert.equal(t(0), 'hace 1 min'); // nunca «hace 0 min»
  assert.equal(t(180), 'hace 3 h');
  assert.equal(t(60 * 24), 'ayer');
  assert.equal(t(60 * 24 * 3), 'hace 3 días');
});
