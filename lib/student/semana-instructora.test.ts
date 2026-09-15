import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agruparPorDia, cifraDuracion, domingoDe, lunesDe, resumenSemana } from './semana-instructora.ts';

test('la semana va de lunes a domingo, también desde un domingo', () => {
  assert.equal(lunesDe('2026-09-14'), '2026-09-14'); // lunes
  assert.equal(lunesDe('2026-09-16'), '2026-09-14'); // miércoles
  assert.equal(lunesDe('2026-09-20'), '2026-09-14'); // domingo: su lunes, no el siguiente
  assert.equal(domingoDe('2026-09-15'), '2026-09-20');
  // Cruza de mes y de año sin descolocarse.
  assert.equal(lunesDe('2026-10-01'), '2026-09-28');
  assert.equal(lunesDe('2027-01-01'), '2026-12-28');
  // El domingo del cambio de hora de octubre sigue en su semana.
  assert.equal(lunesDe('2026-10-25'), '2026-10-19');
});

const clase = (fecha: string, extra: Partial<{ cancelada: boolean; confirmadas: number; hora: string; min: number }> = {}) => {
  const inicio = `${fecha}T${extra.hora ?? '18:00'}:00.000Z`;
  return {
    fecha, inicio,
    fin: new Date(Date.parse(inicio) + (extra.min ?? 55) * 60_000).toISOString(),
    confirmadas: extra.confirmadas ?? 5,
    cancelada: extra.cancelada ?? false,
  };
};

test('el resumen cuenta solo esta semana y sin las canceladas', () => {
  const clases = [
    clase('2026-09-13'), // domingo anterior: fuera
    clase('2026-09-14', { confirmadas: 8 }),
    clase('2026-09-16', { min: 60, confirmadas: 3 }),
    clase('2026-09-17', { cancelada: true, confirmadas: 7 }),
    clase('2026-09-20', { min: 45, confirmadas: 2 }),
    clase('2026-09-21'), // lunes siguiente: fuera
  ];
  const r = resumenSemana(clases, '2026-09-15', null);
  assert.equal(r.clases, 3);
  assert.equal(r.minutos, 55 + 60 + 45);
  assert.equal(r.plazasOcupadas, 8 + 3 + 2);
  assert.equal(r.quedan, 3, 'sin reloj no se da ninguna por terminada');
});

test('«quedan» descuenta las que ya terminaron, no las que están en curso', () => {
  const clases = [clase('2026-09-14'), clase('2026-09-15', { hora: '10:00' }), clase('2026-09-16')];
  const enMitadDeLaDelMartes = Date.parse('2026-09-15T10:30:00.000Z');
  assert.equal(resumenSemana(clases, '2026-09-15', enMitadDeLaDelMartes).quedan, 2);
});

test('una semana sin clases da ceros, no un error', () => {
  assert.deepEqual(resumenSemana([], '2026-09-15', Date.now()), { clases: 0, minutos: 0, plazasOcupadas: 0, quedan: 0 });
});

test('las horas salen como cifra corta con su rótulo, que cabe en la columna', () => {
  assert.deepEqual(cifraDuracion(55), { valor: '55', texto: 'min de clase' });
  assert.deepEqual(cifraDuracion(60), { valor: '1', texto: 'hora de clase' });
  assert.deepEqual(cifraDuracion(330), { valor: '5,5', texto: 'horas de clase' });
  assert.deepEqual(cifraDuracion(345), { valor: '5,8', texto: 'horas de clase' });
  assert.deepEqual(cifraDuracion(0), { valor: '0', texto: 'min de clase' });
});

test('los días de la agenda salen todos y en orden, también los libres', () => {
  const filas = [{ f: '2026-09-17', id: 'b' }, { f: '2026-09-15', id: 'a' }, { f: '2026-09-17', id: 'c' }, { f: '2026-10-01', id: 'fuera' }];
  const dias = agruparPorDia(filas, (x) => x.f, '2026-09-15', 4);
  assert.deepEqual(dias.map((d) => d.fecha), ['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18']);
  assert.deepEqual(dias.map((d) => d.filas.map((x) => x.id)), [['a'], [], ['b', 'c'], []]);
});
