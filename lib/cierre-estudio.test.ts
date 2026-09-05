import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inicioDelDiaEstudio, finDelDiaEstudio } from './utils.ts';

// El cierre del centro compara DÍAS NATURALES del estudio, no días UTC. En
// Madrid el día empieza 1 o 2 horas antes que en UTC según la época del año, y
// eso decide si una clase de madrugada cae dentro del cierre o fuera.
// Verificado también contra la BD: fecha_en_cierre da true en hora de Madrid y
// false en UTC para una clase de las 00:30 del primer día cerrado.

test('en verano (CEST, +02) el día del estudio empieza a las 22:00 UTC del día antes', () => {
  assert.equal(inicioDelDiaEstudio('2026-08-10'), '2026-08-09T22:00:00.000Z');
  assert.equal(finDelDiaEstudio('2026-08-16'), '2026-08-16T22:00:00.000Z');
});

test('en invierno (CET, +01) empieza a las 23:00 UTC del día antes', () => {
  assert.equal(inicioDelDiaEstudio('2026-01-15'), '2026-01-14T23:00:00.000Z');
  assert.equal(finDelDiaEstudio('2026-01-15'), '2026-01-15T23:00:00.000Z');
});

// El día en que se cambia la hora dura 23 o 25 horas. Una ventana calculada con
// un desfase fijo se desplazaría una hora justo esa madrugada.
test('el día del cambio de hora de marzo dura 23 horas', () => {
  const ini = Date.parse(inicioDelDiaEstudio('2026-03-29'));
  const fin = Date.parse(finDelDiaEstudio('2026-03-29'));
  assert.equal((fin - ini) / 3_600_000, 23);
});

test('el día del cambio de hora de octubre dura 25 horas', () => {
  const ini = Date.parse(inicioDelDiaEstudio('2026-10-25'));
  const fin = Date.parse(finDelDiaEstudio('2026-10-25'));
  assert.equal((fin - ini) / 3_600_000, 25);
});

test('un cierre de un solo día es una ventana de un día, no vacía', () => {
  const ini = Date.parse(inicioDelDiaEstudio('2026-08-10'));
  const fin = Date.parse(finDelDiaEstudio('2026-08-10'));
  assert.ok(fin > ini);
  assert.equal((fin - ini) / 3_600_000, 24);
});

// Una clase de las 00:30 hora de Madrid del primer día cerrado TIENE que caer
// dentro. Es el caso que en UTC se escapaba.
test('la clase de madrugada del primer día cerrado cae dentro de la ventana', () => {
  const clase = Date.parse('2026-08-09T22:30:00.000Z'); // 00:30 del 10-ago en Madrid
  const ini = Date.parse(inicioDelDiaEstudio('2026-08-10'));
  const fin = Date.parse(finDelDiaEstudio('2026-08-16'));
  assert.ok(clase >= ini && clase < fin, 'se escapó del cierre');
});

// ── diasDeCierre ──────────────────────────────────────────────────────────────
// El número de días es lo que se le suma a la caducidad de cada bono, así que
// equivocarse aquí regala o roba vigencia a todo el estudio a la vez.
import { diasDeCierre } from './cierres/dias-de-cierre.ts';

test('un cierre de un solo día es 1 día, no 0', () => {
  assert.equal(diasDeCierre('2026-08-10', '2026-08-10'), 1);
});

test('una semana cerrada son 7 días, con los dos extremos incluidos', () => {
  assert.equal(diasDeCierre('2026-08-10', '2026-08-16'), 7);
});

// Marzo tiene un día de 23 h y octubre uno de 25 h: dividir la diferencia sin
// redondear daría 6,96 y 7,04 días.
test('la semana del cambio de hora sigue siendo 7 días', () => {
  assert.equal(diasDeCierre('2026-03-23', '2026-03-29'), 7);
  assert.equal(diasDeCierre('2026-10-19', '2026-10-25'), 7);
});

test('un agosto entero son 31 días', () => {
  assert.equal(diasDeCierre('2026-08-01', '2026-08-31'), 31);
});
