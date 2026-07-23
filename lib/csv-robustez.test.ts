import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, parsearFecha, separarNombre, autoMapear, validarFilas } from './csv.ts';
import { analizarDeterminista } from './migracion/clasificador.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Robustez del importador frente a exports REALES y desordenados. Estos casos
// salieron de una batería adversarial: el objetivo es que la migración funcione
// "muchísimo mejor de como se explica", no solo con archivos de laboratorio.
// ─────────────────────────────────────────────────────────────────────────────

function analiza(contenido: string) {
  return analizarDeterminista([{ nombre: 'x.csv', contenido }]).archivos[0];
}

// ── Detección de la fila de cabecera (preámbulos que rompían la migración) ────

test('salta un título + fila en blanco antes de la cabecera (Excel casero)', () => {
  const { headers, rows } = parseCsv(
    'Listado de clientas 2026\n\nNombre,Apellidos,Email\nMaría,Soler,maria@gmail.com\n',
  );
  assert.deepEqual(headers, ['Nombre', 'Apellidos', 'Email']);
  assert.equal(rows.length, 1);
});

test('salta un título aunque haya una columna índice vacía', () => {
  const { headers } = parseCsv('Mi estudio\n\n,Nombre,Apellidos,Email\n1,María,Soler,m@g.com\n');
  assert.deepEqual(headers, ['', 'Nombre', 'Apellidos', 'Email']);
});

test('NO se salta la cabecera cuando las filas de datos son más estrechas', () => {
  // Cabecera de 5 columnas, datos con celdas finales omitidas (3-4 columnas).
  const { headers, rows } = parseCsv(
    'Nombre,Apellidos,Email,Teléfono,Notas\nMaría,Soler,maria@gmail.com,600,VIP\nNora,Ruiz,nora@hotmail.com\n',
  );
  assert.deepEqual(headers, ['Nombre', 'Apellidos', 'Email', 'Teléfono', 'Notas']);
  assert.equal(rows.length, 2);
});

test('un Excel casero con título se clasifica igualmente como clientas', () => {
  const a = analiza('Clientas\n\nNombre,Email\nMaría,maria@gmail.com\nNora,nora@hotmail.com\n');
  assert.equal(a.entidad, 'socias');
  assert.equal(a.ok, 2);
});

// ── Fechas: nombre de mes y año de 2 dígitos ──────────────────────────────────

test('parsearFecha entiende ISO, europeo, 2 dígitos y nombre de mes (ES/EN)', () => {
  assert.equal(parsearFecha('2024-03-15'), '2024-03-15');
  assert.equal(parsearFecha('15/03/2024'), '2024-03-15');
  assert.equal(parsearFecha('2024-03-15T10:30:00Z'), '2024-03-15');
  assert.equal(parsearFecha('15/03/23'), '2023-03-15');
  assert.equal(parsearFecha('03/11/88'), '1988-11-03');
  assert.equal(parsearFecha('Mar 15, 2024'), '2024-03-15');
  assert.equal(parsearFecha('15 mar 2024'), '2024-03-15');
  assert.equal(parsearFecha('15 de marzo de 2024'), '2024-03-15');
  assert.equal(parsearFecha('January 2, 2023'), '2023-01-02');
});

test('parsearFecha rechaza fechas imposibles y basura', () => {
  assert.equal(parsearFecha('31/02/2024'), null);
  assert.equal(parsearFecha('no es fecha'), null);
  assert.equal(parsearFecha(''), null);
});

// ── Separación de nombre cuando no hay columna de apellidos ────────────────────

test('separarNombre reconoce "Apellidos, Nombre" y "Nombre Apellidos"', () => {
  assert.deepEqual(separarNombre('Soler, María'), { nombre: 'María', apellidos: 'Soler' });
  assert.deepEqual(separarNombre('María Soler López'), { nombre: 'María', apellidos: 'Soler López' });
  assert.deepEqual(separarNombre('Madonna'), { nombre: 'Madonna', apellidos: '' });
});

test('una sola columna de nombre se reparte en nombre + apellidos al validar', () => {
  const headers = ['Nombre completo', 'Email'];
  const filas = validarFilas([['María Soler López', 'maria@gmail.com']], autoMapear(headers));
  assert.equal(filas[0].estado, 'ok');
  assert.equal(filas[0].datos.nombre, 'María');
  assert.equal(filas[0].datos.apellidos, 'Soler López');
});

// ── Limpiezas de celda ────────────────────────────────────────────────────────

test('se quita el apóstrofo con que Excel fuerza texto en teléfonos/NIF', () => {
  const headers = ['Nombre', 'Email', 'Teléfono'];
  const filas = validarFilas([['María', 'MARIA@GMAIL.COM', "'600111222"]], autoMapear(headers));
  assert.equal(filas[0].datos.telefono, '600111222');
  assert.equal(filas[0].datos.email, 'maria@gmail.com');
});
