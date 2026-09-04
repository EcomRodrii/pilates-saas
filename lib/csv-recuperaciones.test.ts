import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoMapearRecuperacion, validarFilasRecuperacion, MAX_RECUPERACIONES_POR_FILA } from './csv.ts';
import { clasificarArchivoDeterminista, CTX_VACIO } from './migracion/clasificador.ts';

const HOY = '2026-09-05';

test('reconoce las cabeceras que usan de verdad los exports', () => {
  const m = autoMapearRecuperacion(['Email', 'Recuperaciones pendientes', 'Fecha caducidad', 'Motivo']);
  assert.equal(m.email, 0);
  assert.equal(m.cantidad, 1);
  assert.equal(m.caduca_el, 2);
  assert.equal(m.motivo, 3);
});

test('reconoce cabeceras en inglés', () => {
  const m = autoMapearRecuperacion(['Client', 'Make ups', 'Expiry date']);
  assert.equal(m.email, 0);
  assert.equal(m.cantidad, 1);
  assert.equal(m.caduca_el, 2);
  assert.equal(m.motivo, -1);
});

test('sin columna de cantidad, cada fila es una recuperación', () => {
  const m = autoMapearRecuperacion(['Email']);
  const r = validarFilasRecuperacion([['ana@estudio.es'], ['luz@estudio.es']], m, HOY);
  assert.equal(r[0].estado, 'ok');
  assert.equal(r[0].datos.cantidad, 1);
  assert.equal(r[1].datos.cantidad, 1);
});

test('una cantidad ilegible va a cuarentena, NO se convierte en 1', () => {
  const m = autoMapearRecuperacion(['Email', 'Pendientes']);
  const r = validarFilasRecuperacion([['ana@estudio.es', 'varias']], m, HOY);
  assert.equal(r[0].estado, 'error');
  assert.match(r[0].motivo ?? '', /no se entiende la cantidad/i);
});

test('la cantidad admite decimal con coma solo si es entero', () => {
  const m = autoMapearRecuperacion(['Email', 'Pendientes']);
  const r = validarFilasRecuperacion([['ana@estudio.es', '3,0'], ['luz@estudio.es', '2,5']], m, HOY);
  assert.equal(r[0].estado, 'ok');
  assert.equal(r[0].datos.cantidad, 3);
  assert.equal(r[1].estado, 'error');
});

test('cero o negativo es un error, no una fila silenciosa', () => {
  const m = autoMapearRecuperacion(['Email', 'Pendientes']);
  const r = validarFilasRecuperacion([['ana@estudio.es', '0'], ['luz@estudio.es', '-2']], m, HOY);
  assert.equal(r[0].estado, 'error');
  assert.equal(r[1].estado, 'error');
});

test('una cantidad desbocada se corta antes de generar miles de filas', () => {
  const m = autoMapearRecuperacion(['Email', 'Pendientes']);
  const r = validarFilasRecuperacion([['ana@estudio.es', String(MAX_RECUPERACIONES_POR_FILA + 1)]], m, HOY);
  assert.equal(r[0].estado, 'error');
  assert.match(r[0].motivo ?? '', /demasiadas/i);
});

test('sin fecha de caducidad manda la política del estudio (null)', () => {
  const m = autoMapearRecuperacion(['Email', 'Caduca']);
  const r = validarFilasRecuperacion([['ana@estudio.es', '']], m, HOY);
  assert.equal(r[0].estado, 'ok');
  assert.equal(r[0].datos.caducaEl, null);
});

test('una caducidad ya pasada no se importa: nacería muerta', () => {
  const m = autoMapearRecuperacion(['Email', 'Caduca']);
  const r = validarFilasRecuperacion([['ana@estudio.es', '01/01/2020']], m, HOY);
  assert.equal(r[0].estado, 'error');
  assert.match(r[0].motivo ?? '', /ya ha pasado/i);
});

test('fecha española y americana: la columna decide', () => {
  const m = autoMapearRecuperacion(['Email', 'Caduca']);
  // 31/12 solo puede ser día/mes → toda la columna se lee en español.
  const es = validarFilasRecuperacion([['ana@estudio.es', '31/12/2026'], ['luz@estudio.es', '03/11/2026']], m, HOY);
  assert.equal(es[0].datos.caducaEl, '2026-12-31');
  assert.equal(es[1].datos.caducaEl, '2026-11-03');
  // 12/31 solo puede ser mes/día → americana, y entonces 11/03 es 3 de nov.
  const us = validarFilasRecuperacion([['ana@estudio.es', '12/31/2026'], ['luz@estudio.es', '11/03/2026']], m, HOY);
  assert.equal(us[0].datos.caducaEl, '2026-12-31');
  assert.equal(us[1].datos.caducaEl, '2026-11-03');
});

test('el email se normaliza a minúsculas y el motivo vacío es null', () => {
  const m = autoMapearRecuperacion(['Email', 'Motivo']);
  const r = validarFilasRecuperacion([['  Ana@Estudio.ES  ', '   ']], m, HOY);
  assert.equal(r[0].estado, 'ok');
  assert.equal(r[0].datos.email, 'ana@estudio.es');
  assert.equal(r[0].datos.motivo, null);
});

test('sin email no hay a quién dársela', () => {
  const m = autoMapearRecuperacion(['Email']);
  const r = validarFilasRecuperacion([[''], ['esto-no-es-un-email']], m, HOY);
  assert.equal(r[0].estado, 'error');
  assert.equal(r[1].estado, 'error');
  assert.match(r[1].motivo ?? '', /no válido/i);
});

// ─── Que no le robe archivos a otras entidades ───────────────────────────────
// La entidad "recuperaciones" solo exige email, así que sin una barrera encaja
// en cualquier CSV que tenga un correo — incluido el de clientas. Pasó: el
// archivo de clientas se clasificó como recuperaciones porque, al tener menos
// exigencias, sacaba mejor tasa de filas válidas.

test('un CSV de clientas NO se clasifica como recuperaciones', () => {
  const r = clasificarArchivoDeterminista(
    { nombre: 'clientas.csv', contenido: 'Nombre;Email\nMaría;maria@test.com\nLuz;luz@test.com\n' },
    CTX_VACIO,
  );
  assert.equal(r.tipo, 'ok');
  if (r.tipo === 'ok') assert.equal(r.analisis.entidad, 'socias');
});

test('un CSV de bonos NO se clasifica como recuperaciones', () => {
  const r = clasificarArchivoDeterminista(
    { nombre: 'bonos.csv', contenido: 'Email;Plan;Credits Remaining;Expiry Date\nmaria@test.com;Bono 10;4;31/12/2026\n' },
    { planes: ['Bono 10'], instructores: [], salas: [], servicios: [] },
  );
  assert.equal(r.tipo, 'ok');
  if (r.tipo === 'ok') assert.equal(r.analisis.entidad, 'membresias');
});

test('un CSV que SÍ es de recuperaciones se reconoce', () => {
  const r = clasificarArchivoDeterminista(
    { nombre: 'recuperaciones.csv', contenido: 'Email;Recuperaciones pendientes;Caduca\nmaria@test.com;2;31/12/2026\nluz@test.com;1;30/11/2026\n' },
    CTX_VACIO,
  );
  assert.equal(r.tipo, 'ok');
  if (r.tipo === 'ok') assert.equal(r.analisis.entidad, 'recuperaciones');
});
