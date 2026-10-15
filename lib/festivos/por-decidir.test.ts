import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIAS_AVISO_FESTIVO,
  festivoAbrible,
  fechaDelFestivo,
  festivosSinDecidir,
  fraseFestivo,
  motivoDelCierre,
  sumarDias,
  ventanaFestivos,
} from './por-decidir.ts';
import { hoyEnEstudio } from '../utils.ts';

const nada = { abiertos: new Set<string>(), cierres: [] };

test('la Inmaculada entra en el aviso 21 días antes, no 22', () => {
  assert.equal(DIAS_AVISO_FESTIVO, 21);
  const v17 = ventanaFestivos('2026-11-17', 'aviso', 'CATALUNA')!;
  assert.ok(festivosSinDecidir('CATALUNA', v17, nada).some((f) => f.fecha === '2026-12-08'));
  const v16 = ventanaFestivos('2026-11-16', 'aviso', 'CATALUNA')!;
  assert.ok(!festivosSinDecidir('CATALUNA', v16, nada).some((f) => f.fecha === '2026-12-08'));
});

test('el día del estudio, no el de UTC: a las 00:30 de Madrid del 17-nov ya cuenta como 17', () => {
  // 2026-11-16T23:30Z son las 00:30 del 17 en Madrid (horario de invierno).
  const hoy = hoyEnEstudio(new Date('2026-11-16T23:30:00Z'));
  assert.equal(hoy, '2026-11-17');
  const v = ventanaFestivos(hoy, 'aviso', 'MADRID')!;
  assert.ok(festivosSinDecidir('MADRID', v, nada).some((f) => f.fecha === '2026-12-08'));
});

test('hoy nunca entra: cerrar el día en curso cancelaría clases ya dadas', () => {
  const v = ventanaFestivos('2026-12-08', 'aviso', 'MADRID')!;
  assert.equal(v.desde, '2026-12-09');
  assert.ok(!festivosSinDecidir('MADRID', v, nada).some((f) => f.fecha === '2026-12-08'));
});

test('lo ya decidido no vuelve a salir: abierto, o cubierto por un cierre de varios días', () => {
  const v = ventanaFestivos('2026-11-30', 'aviso', 'MADRID')!;
  const todos = festivosSinDecidir('MADRID', v, nada).map((f) => f.fecha);
  assert.deepEqual(todos, ['2026-12-07', '2026-12-08', '2026-12-25'].filter((f) => f <= v.hasta));
  const abierto = festivosSinDecidir('MADRID', v, { abiertos: new Set(['2026-12-07']), cierres: [] }).map((f) => f.fecha);
  assert.ok(!abierto.includes('2026-12-07'));
  const cerrado = festivosSinDecidir('MADRID', v, { abiertos: new Set(), cierres: [{ desde: '2026-12-05', hasta: '2026-12-08' }] });
  assert.deepEqual(cerrado.map((f) => f.fecha).filter((f) => f <= '2026-12-08'), []);
});

test('«Ver todos» llega hasta el final del último año cargado', () => {
  const v = ventanaFestivos('2026-10-12', 'todos', 'ANDALUCIA')!;
  assert.deepEqual(v, { desde: '2026-10-13', hasta: '2027-12-31' });
  assert.equal(ventanaFestivos('2028-01-02', 'todos', 'ANDALUCIA'), null);
});

test('sumarDias no se mueve con el cambio de hora de octubre', () => {
  assert.equal(sumarDias('2026-10-24', 1), '2026-10-25');
  assert.equal(sumarDias('2026-10-25', 1), '2026-10-26');
  assert.equal(sumarDias('2026-12-31', 1), '2027-01-01');
});

test('la frase, con sus plurales y sin inventar reservas', () => {
  const hoy = '2026-11-20';
  const f = { fecha: '2026-12-08', nombre: 'Inmaculada' };
  assert.equal(fraseFestivo({ ...f, clases: 6, reservas: 41 }, hoy), 'El martes 8 de diciembre (Inmaculada) tienes 6 clases y 41 reservas confirmadas.');
  assert.equal(fraseFestivo({ ...f, clases: 1, reservas: 1 }, hoy), 'El martes 8 de diciembre (Inmaculada) tienes 1 clase y 1 reserva confirmada.');
  assert.equal(fraseFestivo({ ...f, clases: 2, reservas: 0 }, hoy), 'El martes 8 de diciembre (Inmaculada) tienes 2 clases, todavía sin reservas.');
  assert.equal(fraseFestivo({ ...f, clases: 2, reservas: null }, hoy), 'El martes 8 de diciembre (Inmaculada) tienes 2 clases.');
});

test('el año solo cuando no es el de hoy', () => {
  assert.equal(fechaDelFestivo('2027-01-01', '2026-12-20'), 'viernes 1 de enero de 2027');
  assert.equal(fechaDelFestivo('2026-12-25', '2026-12-20'), 'viernes 25 de diciembre');
});

test('el cierre se guarda con el nombre del festivo', () => {
  assert.equal(motivoDelCierre({ nombre: 'Inmaculada' }), 'Festivo: Inmaculada');
});

test('«Abrimos igualmente» solo para un festivo de SU zona, futuro y bien escrito', () => {
  assert.equal(festivoAbrible('MADRID', '2026-12-08', '2026-11-20')?.nombre, 'Inmaculada');
  assert.equal(festivoAbrible('MADRID', '2026-12-09', '2026-11-20'), null, 'no es festivo');
  assert.equal(festivoAbrible('CATALUNA', '2026-05-02', '2026-04-20'), null, 'festivo de Madrid, no de Cataluña');
  assert.equal(festivoAbrible('MADRID', '2026-12-08', '2026-12-08'), null, 'hoy no');
  assert.equal(festivoAbrible('MADRID', '2026-12-08', '2026-12-09'), null, 'ya pasó');
  assert.equal(festivoAbrible(null, '2026-12-08', '2026-11-20'), null, 'sin zona');
  assert.equal(festivoAbrible('MADRID', "2026-12-08' or 1=1", '2026-11-20'), null);
});

// ─── Módulo Festivos (panel nuevo): lo que el estudio ha guardado ───────────

test('los guardados entran en la ventana con los oficiales, sin repetir un día', () => {
  const v = ventanaFestivos('2026-11-30', 'aviso', 'MADRID')!;
  const r = festivosSinDecidir('MADRID', v, nada, [
    { fecha: '2026-12-09', nombre: 'Fiesta del barrio' },
    { fecha: '2026-12-08', nombre: 'Repetido' },
    { fecha: '2027-03-01', nombre: 'Fuera de la ventana' },
  ]);
  assert.deepEqual(r.map((f) => [f.fecha, f.nombre]).filter(([f]) => f <= '2026-12-09'), [
    ['2026-12-07', 'Día de la Constitución, trasladado'], ['2026-12-08', 'Inmaculada'], ['2026-12-09', 'Fiesta del barrio'],
  ]);
});

test('sin zona, los guardados solos; «Ver todos» llega hasta el último guardado', () => {
  assert.equal(ventanaFestivos('2026-10-12', 'todos', null), null);
  const v = ventanaFestivos('2026-10-12', 'todos', null, '2028-05-02')!;
  assert.deepEqual(v, { desde: '2026-10-13', hasta: '2028-12-31' });
  assert.deepEqual(festivosSinDecidir(null, v, nada, [{ fecha: '2028-05-02', nombre: 'San X' }]).map((f) => f.fecha), ['2028-05-02']);
});

test('«Abrimos igualmente» también para un festivo guardado, con SU nombre', () => {
  const guardados = [{ fecha: '2026-12-09', nombre: 'Fiesta del barrio' }];
  assert.equal(festivoAbrible('MADRID', '2026-12-09', '2026-11-20', guardados)?.nombre, 'Fiesta del barrio');
  assert.equal(festivoAbrible(null, '2026-12-09', '2026-11-20', guardados)?.nombre, 'Fiesta del barrio');
  assert.equal(festivoAbrible('MADRID', '2026-12-08', '2026-11-20', guardados)?.nombre, 'Inmaculada', 'el oficial manda');
  assert.equal(festivoAbrible(null, '2026-12-10', '2026-11-20', guardados), null);
});
