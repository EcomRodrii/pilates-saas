import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsv,
  detectarDelimitador,
  serializeCsv,
  autoMapear,
  validarFilas,
  parsearTags,
  emailValido,
  type CampoSocia,
} from './csv.ts';

test('detecta coma como delimitador por defecto', () => {
  assert.equal(detectarDelimitador('a,b,c\n1,2,3'), ',');
});

test('detecta punto y coma (Excel español)', () => {
  assert.equal(detectarDelimitador('nombre;email;telefono\nAna;a@b.com;600'), ';');
});

test('detecta tabulador', () => {
  assert.equal(detectarDelimitador('nombre\temail\nAna\ta@b.com'), '\t');
});

test('parsea cabeceras y filas básicas', () => {
  const r = parseCsv('nombre,email\nAna,ana@b.com\nLuis,luis@b.com');
  assert.deepEqual(r.headers, ['nombre', 'email']);
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows[0], ['Ana', 'ana@b.com']);
});

test('respeta comas dentro de comillas', () => {
  const r = parseCsv('nombre,nota\n"García, Ana","vip, mañana"');
  assert.deepEqual(r.rows[0], ['García, Ana', 'vip, mañana']);
});

test('maneja comillas escapadas y saltos de línea dentro del campo', () => {
  const r = parseCsv('nombre,nota\n"Ana ""la jefa""","línea1\nlínea2"');
  assert.deepEqual(r.rows[0], ['Ana "la jefa"', 'línea1\nlínea2']);
});

test('quita el BOM y maneja CRLF', () => {
  const r = parseCsv('﻿nombre,email\r\nAna,ana@b.com\r\n');
  assert.deepEqual(r.headers, ['nombre', 'email']);
  assert.deepEqual(r.rows[0], ['Ana', 'ana@b.com']);
});

test('ignora líneas totalmente vacías', () => {
  const r = parseCsv('nombre,email\nAna,ana@b.com\n\n\nLuis,luis@b.com\n');
  assert.equal(r.rows.length, 2);
});

test('serializeCsv escapa comas, comillas y saltos', () => {
  const csv = serializeCsv(['a', 'b'], [['x,y', 'z"w'], ['s\nt', 'u']]);
  assert.equal(csv, 'a,b\r\n"x,y","z""w"\r\n"s\nt",u');
  // round-trip
  const back = parseCsv(csv);
  assert.deepEqual(back.rows[0], ['x,y', 'z"w']);
});

test('auto-mapea cabeceras en español con acentos', () => {
  const m = autoMapear(['Nombre', 'Apellidos', 'Correo electrónico', 'Teléfono', 'DNI']);
  assert.equal(m.nombre, 0);
  assert.equal(m.apellidos, 1);
  assert.equal(m.email, 2);
  assert.equal(m.telefono, 3);
  assert.equal(m.nif, 4);
});

test('auto-mapea cabeceras en inglés', () => {
  const m = autoMapear(['First Name', 'Last Name', 'E-mail', 'Phone']);
  assert.equal(m.email, 2);
  assert.equal(m.telefono, 3);
  assert.equal(m.tags, -1); // no presente
});

test('no reutiliza la misma columna para dos campos', () => {
  const m = autoMapear(['email', 'mail']);
  assert.notEqual(m.email, -1);
  // el segundo "mail" no debe robar la asignación exacta de "email"
  assert.equal(m.email, 0);
});

test('emailValido acepta y rechaza correctamente', () => {
  assert.equal(emailValido('a@b.com'), true);
  assert.equal(emailValido('a @b.com'), false);
  assert.equal(emailValido('sin-arroba'), false);
  assert.equal(emailValido('a@b'), false);
});

test('parsearTags separa por ; | y coma', () => {
  assert.deepEqual(parsearTags('vip; mañana |reformer'), ['vip', 'mañana', 'reformer']);
  assert.deepEqual(parsearTags(''), []);
});

test('validarFilas marca falta de nombre y email inválido', () => {
  const mapeo: Record<CampoSocia, number> = { nombre: 0, apellidos: 1, email: 2, telefono: -1, nif: -1, tags: -1 };
  const filas = validarFilas(
    [
      ['Ana', 'García', 'ana@b.com'],
      ['', 'Pérez', 'x@b.com'], // sin nombre
      ['Luis', 'Ruiz', 'no-email'], // email inválido
    ],
    mapeo,
  );
  assert.equal(filas[0].estado, 'ok');
  assert.equal(filas[1].estado, 'error');
  assert.match(filas[1].motivo!, /nombre/i);
  assert.equal(filas[2].estado, 'error');
  assert.match(filas[2].motivo!, /email/i);
});

test('validarFilas detecta duplicados de email dentro del archivo (case-insensitive)', () => {
  const mapeo: Record<CampoSocia, number> = { nombre: 0, apellidos: -1, email: 1, telefono: -1, nif: -1, tags: -1 };
  const filas = validarFilas(
    [
      ['Ana', 'ana@b.com'],
      ['Ana2', 'ANA@b.com'],
    ],
    mapeo,
  );
  assert.equal(filas[0].estado, 'ok');
  assert.equal(filas[1].estado, 'duplicada');
});

test('validarFilas normaliza el email a minúsculas en los datos', () => {
  const mapeo: Record<CampoSocia, number> = { nombre: 0, apellidos: -1, email: 1, telefono: -1, nif: -1, tags: -1 };
  const filas = validarFilas([['Ana', 'Ana@B.com']], mapeo);
  assert.equal(filas[0].datos.email, 'ana@b.com');
});
