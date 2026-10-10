import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparIncidencias, incidenciasACsv, incidenciasDeImportacion, plantillaDeMotivo } from './incidencias.ts';

test('el motivo se agrupa sin lo que cambia de una fila a otra', () => {
  assert.equal(plantillaDeMotivo('No hay ninguna socia con el email ana@example.com'), 'No hay ninguna socia con el email …');
  assert.equal(
    plantillaDeMotivo('No hay ninguna clase de "Yoga" el 2026-10-12 a las 08:00'),
    'No hay ninguna clase de "…" el … a las …',
  );
  assert.equal(plantillaDeMotivo('No existe el plan «Bono 5 clases» en tu catálogo'), 'No existe el plan «…» en tu catálogo');
});

test('agrupa por motivo, ordena por cuántas y deja tres ejemplos', () => {
  const g = agruparIncidencias([
    { fila: 2, motivo: 'No existe el plan «A» en tu catálogo' },
    { fila: 3, motivo: 'No existe el plan «B» en tu catálogo' },
    { fila: 4, motivo: 'No existe el plan «C» en tu catálogo' },
    { fila: 5, motivo: 'No existe el plan «D» en tu catálogo' },
    { fila: 9, motivo: 'Falta el plan' },
  ]);
  assert.equal(g.length, 2);
  assert.equal(g[0].cuantas, 4);
  assert.equal(g[0].ejemplos.length, 3);
  assert.equal(g[0].motivo, 'No existe el plan «…» en tu catálogo');
  assert.equal(g[1].motivo, 'Falta el plan', 'con una sola fila se enseña el motivo literal');
});

test('sinSocia y sinSesion NO se cuentan dos veces: ya vienen dentro de errores', () => {
  // El caso medido: 1.103 reservas, 38 sin clase y otros 38 errores = 76 «incidencias».
  const errores = Array.from({ length: 38 }, (_, i) => ({ fila: i + 1, motivo: `No hay ninguna clase de "Yoga" el 2026-10-1${i % 9} a las 08:00` }));
  const r = incidenciasDeImportacion({ errores, sinSesion: 38 });
  assert.equal(r.total, 38);
});

test('si el tope de errores devueltos deja filas fuera, vale el contador', () => {
  const r = incidenciasDeImportacion({ errores: [{ fila: 1, motivo: 'x' }], sinSocia: 40 });
  assert.equal(r.total, 40);
});

test('instructora o sala inexistentes: no son errores, pero se cuentan y se dicen', () => {
  const r = incidenciasDeImportacion({ errores: [], sinInstructor: 8, sinSala: 1 });
  assert.equal(r.total, 9);
  assert.equal(r.notas.length, 2);
  assert.match(r.notas[0], /8 filas con una instructora que no existe/);
});

test('el CSV lleva archivo, fila y motivo, y escapa las comillas', () => {
  const csv = incidenciasACsv([{ etiqueta: 'Reservas', filas: [{ fila: 7, motivo: 'No hay ninguna clase de "Yoga"' }] }]);
  assert.equal(csv.split('\r\n')[0], '"Archivo","Fila","Motivo"');
  assert.equal(csv.split('\r\n')[1], '"Reservas","7","No hay ninguna clase de ""Yoga"""');
});
