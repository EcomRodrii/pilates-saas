import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseXlsx } from './xlsx-import.ts';

/** Construye un .xlsx en memoria a partir de una matriz de celdas, para probar `parseXlsx` sin un archivo real en disco. */
function libroDesde(filasPorHoja: Record<string, (string | number)[][]>): ArrayBuffer {
  const libro = XLSX.utils.book_new();
  for (const [nombre, filas] of Object.entries(filasPorHoja)) {
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), nombre);
  }
  const buf = XLSX.write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return buf;
}

test('parseXlsx lee cabecera y filas básicas', () => {
  const data = libroDesde({ Hoja1: [['Nombre', 'Email'], ['Ana', 'ana@b.com'], ['Luis', 'luis@b.com']] });
  const r = parseXlsx(data);
  assert.deepEqual(r.headers, ['Nombre', 'Email']);
  assert.deepEqual(r.rows, [['Ana', 'ana@b.com'], ['Luis', 'luis@b.com']]);
});

test('parseXlsx se salta preámbulo antes de la cabecera, igual que parseCsv', () => {
  const data = libroDesde({
    Hoja1: [
      ['Listado de clientas 2026'],
      [],
      ['Nombre', 'Email'],
      ['Ana', 'ana@b.com'],
    ],
  });
  const r = parseXlsx(data);
  assert.deepEqual(r.headers, ['Nombre', 'Email']);
  assert.deepEqual(r.rows, [['Ana', 'ana@b.com']]);
});

test('parseXlsx elige la hoja con más filas cuando el libro tiene varias', () => {
  const data = libroDesde({
    Notas: [['Solo un par de notas sueltas']],
    Clientas: [['Nombre', 'Email'], ['Ana', 'ana@b.com'], ['Luis', 'luis@b.com'], ['Marta', 'marta@b.com']],
  });
  const r = parseXlsx(data);
  assert.deepEqual(r.headers, ['Nombre', 'Email']);
  assert.equal(r.rows.length, 3);
});

test('parseXlsx no tiene delimitador (concepto que no aplica a Excel)', () => {
  const data = libroDesde({ Hoja1: [['Nombre'], ['Ana']] });
  assert.equal(parseXlsx(data).delimiter, '');
});
