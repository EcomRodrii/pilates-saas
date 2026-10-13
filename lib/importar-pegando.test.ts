import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_FILAS_LEIDAS, MAX_FILAS_PEGADAS, camposConSalud, columnasConFechaDeExcel, columnasDeSalud, leerPegado,
  mapeoConservado, mapeoPegado, pareceCabecera, tablaPegada,
} from './importar-pegando.ts';
import { validarFilas } from './csv.ts';

// Lo que deja en el portapapeles copiar un bloque de celdas (texto con
// tabuladores). Excel cierra cada fila con CRLF y deja una línea al final;
// Google Sheets y Numbers usan LF y no la dejan.
const EXCEL_WIN = 'Nombre\tApellidos\tEmail\tTeléfono\tLesiones\r\nAna\tGarcía López\tana@example.com\t600123456\tHernia lumbar\r\nLucía\tMartín\tlucia@example.com\t611 654 321\t\r\n';
const SHEETS = 'Nombre\tEmail\nAna\tana@example.com\nLucía\tlucia@example.com';

test('Excel (CRLF y línea final) y Google Sheets (LF): misma tabla, con sus títulos', () => {
  const e = leerPegado(EXCEL_WIN)!;
  assert.equal(e.cabeceraAdivinada, true);
  const t = tablaPegada(e, true);
  assert.deepEqual(t.headers, ['Nombre', 'Apellidos', 'Email', 'Teléfono', 'Lesiones']);
  assert.equal(t.rows.length, 2);
  assert.equal(t.rows[1][3], '611 654 321');

  const s = leerPegado(SHEETS)!;
  assert.equal(s.cabeceraAdivinada, true);
  assert.deepEqual(tablaPegada(s, true).rows, [['Ana', 'ana@example.com'], ['Lucía', 'lucia@example.com']]);
});

test('con tabuladores, las comas y los «;» de dentro de una celda NO separan (Excel no las entrecomilla)', () => {
  const p = leerPegado('Nombre\tEmail\tNotas\tEtiquetas\nGarcía López, Ana\tana@example.com\tmartes, jueves, reformer\treformer;mañana;vip\n')!;
  const t = tablaPegada(p, true);
  assert.deepEqual(t.headers, ['Nombre', 'Email', 'Notas', 'Etiquetas']);
  assert.deepEqual(t.rows[0], ['García López, Ana', 'ana@example.com', 'martes, jueves, reformer', 'reformer;mañana;vip']);
  assert.deepEqual(validarFilas(t.rows, mapeoPegado(t, true)).map((f) => f.estado), ['ok']);
});

test('las filas de solo tabuladores que arrastra Excel no son filas', () => {
  const p = leerPegado('Nombre\tEmail\r\nAna\tana@example.com\r\n\t\r\n\t\r\n')!;
  assert.equal(tablaPegada(p, true).rows.length, 1);
  assert.equal(leerPegado('\t\t\r\n\t\t\r\n'), null);
  assert.equal(leerPegado('   '), null);
});

test('una celda con un salto de línea dentro (Excel la copia entre comillas) sigue siendo una celda', () => {
  const p = leerPegado('Nombre\tEmail\tDirección\r\nAna\tana@example.com\t"C/ Mayor 3\n2.º B"\r\n')!;
  const t = tablaPegada(p, true);
  assert.equal(t.rows.length, 1);
  assert.equal(t.rows[0][2], 'C/ Mayor 3\n2.º B');
  assert.equal(p.comillasSinCerrar, false);
});

test('unas comillas en MITAD de una celda son texto: no se tragan las filas de debajo', () => {
  const p = leerPegado('Nombre\tEmail\tNotas\nAna\tana@example.com\tpantalla 5"\nBea\tbea@example.com\t\nCris\tcris@example.com\tTV 40"\n')!;
  const t = tablaPegada(p, true);
  assert.equal(t.rows.length, 3);
  assert.equal(t.rows[0][2], 'pantalla 5"');
  assert.equal(p.comillasSinCerrar, false);
});

test('unas comillas que abren una celda y no cierran se avisan', () => {
  assert.equal(leerPegado('Nombre\tEmail\n"Ana la del martes\tana@example.com\nLucía\tlucia@example.com')!.comillasSinCerrar, true);
});

test('un «\\r» suelto es un salto de línea: nunca dos clientas en una', () => {
  const t = tablaPegada(leerPegado('Nombre\tEmail\rAna\tana@example.com\rBea\tbea@example.com\r')!, true);
  assert.deepEqual(t.rows, [['Ana', 'ana@example.com'], ['Bea', 'bea@example.com']]);
});

test('sin títulos: «Columna 1…N», la primera fila no se pierde aunque sea más corta, y la propuesta sale del contenido', () => {
  const p = leerPegado('Ana García\tana@example.com\nBea Ruiz\tbea@example.com\t611654321\nCris Sanz\tcris@example.com\t622333444\n')!;
  assert.equal(p.cabeceraAdivinada, false, 'la primera fila trae un correo: es una clienta');
  const t = tablaPegada(p, false);
  assert.deepEqual(t.headers, ['Columna 1', 'Columna 2', 'Columna 3']);
  assert.equal(t.rows.length, 3, 'Ana, más corta, sigue ahí');
  const m = mapeoPegado(t, false);
  assert.deepEqual([m.email, m.telefono, m.nombre], [1, 2, 0]);
  assert.deepEqual(validarFilas(t.rows, m).map((f) => f.estado), ['ok', 'ok', 'ok']);
});

test('títulos que no se reconocen («Correu», «Courriel»): lo que falte se propone por el contenido', () => {
  const t = tablaPegada(leerPegado('Nom\tCorreu\tTelèfon\nAna\tana@example.com\t600123456\nBea\tbea@example.com\t611654321\n')!, true);
  const m = mapeoPegado(t, true);
  assert.deepEqual([m.nombre, m.email, m.telefono], [0, 1, 2]);
});

test('con títulos manda el mapeo de siempre; quitar la casilla convierte la primera fila en datos', () => {
  const p = leerPegado(SHEETS)!;
  assert.equal(mapeoPegado(tablaPegada(p, true), true).email, 1);
  const sin = tablaPegada(p, false);
  assert.equal(sin.rows.length, 3);
  assert.deepEqual(sin.rows[0], ['Nombre', 'Email']);
});

test('cambiar la casilla conserva lo que se relacionó a mano', () => {
  const p = leerPegado('Nombre\tEmail\tMóvil 2\nAna\tana@example.com\t600123456\n')!;
  const t = tablaPegada(p, true);
  const aMano = { ...mapeoPegado(t, true), telefono: -1, tags: 2 };
  const tras = mapeoConservado(aMano, tablaPegada(p, false), false);
  assert.equal(tras.tags, 2, 'lo elegido a mano se queda');
  assert.equal(tras.email, 1);
});

test('adivinar los títulos', () => {
  assert.equal(pareceCabecera(['Nombre', 'Correo']), true, 'nombran campos tal cual');
  assert.equal(pareceCabecera(['Ana', 'ana@example.com']), false, 'un correo: es una clienta');
  assert.equal(pareceCabecera(['Ana', '600123456']), false, 'un teléfono: es una clienta');
  assert.equal(pareceCabecera(['Calle Mayor 3']), false, 'solo una coincidencia exacta cuenta: «calle» no basta');
  assert.equal(pareceCabecera(['Nom', 'Correu'], [['Ana', 'ana@example.com']]), true,
    'títulos que no conocemos, con correos debajo (una fila sin correo no se podría importar igualmente)');
});

test('fechas como número de serie de Excel (también con la hora): se señala la columna', () => {
  const t = tablaPegada(leerPegado('Nombre\tEmail\tFecha de alta\nAna\tana@example.com\t44562\nLucía\tlucia@example.com\t45000,5\n')!, true);
  assert.deepEqual([...columnasConFechaDeExcel(t)], [2]);
  const normal = tablaPegada(leerPegado('Nombre\tEmail\tFecha de alta\nAna\tana@example.com\t01/03/2022\n')!, true);
  assert.equal(columnasConFechaDeExcel(normal).size, 0);
});

test('columnas de salud: por su título, o por lo que traen; un nombre o un correo con «dolores» no', () => {
  assert.deepEqual(columnasDeSalud(tablaPegada(leerPegado(EXCEL_WIN)!, true)).map((c) => c.nombre), ['Lesiones']);
  const sinTitulos = tablaPegada(leerPegado('Ana\tana@example.com\tHernia discal\nBea\tbea@example.com\tLumbalgia\nCris\tcris@example.com\t\n')!, false);
  assert.deepEqual(columnasDeSalud(sinTitulos), [{ indice: 2, nombre: 'Columna 3' }]);
  const dolores = tablaPegada(leerPegado('María Dolores\tmariadolores@example.com\nDolors Puig\tmdolores@example.com\n')!, false);
  assert.deepEqual(columnasDeSalud(dolores), []);
});

test('una columna de salud NUNCA se propone: ni como etiquetas, ni como nombre', () => {
  // «Etiquetas» casa sola con `tags`, pero trae una condición: no se relaciona.
  const t = tablaPegada(leerPegado('Nombre\tEmail\tEtiquetas\nAna\tana@example.com\tVIP; embarazada\nBea\tbea@example.com\tlesion lumbar\n')!, true);
  const m = mapeoPegado(t, true);
  assert.equal(m.tags, -1);
  assert.doesNotMatch(JSON.stringify(validarFilas(t.rows, m).map((f) => f.datos)), /embarazada|lesion/);
  // Sin títulos y la columna de salud la primera: el nombre no es «Lumbalgia».
  const s = tablaPegada(leerPegado('Lumbalgia\tAna García\tana@example.com\nAsma\tBea Ruiz\tbea@example.com\n')!, false);
  assert.equal(mapeoPegado(s, false).nombre, 1);
});

test('si alguien relaciona a mano una columna de salud, se sabe (y la pantalla no deja importar)', () => {
  const t = tablaPegada(leerPegado(EXCEL_WIN)!, true);
  const salud = columnasDeSalud(t);
  const m = { ...mapeoPegado(t, true), tags: 4 };
  assert.deepEqual(camposConSalud(m, salud), [{ campo: 'tags', columna: 'Lesiones' }]);
  assert.deepEqual(camposConSalud(mapeoPegado(t, true), salud), []);
});

test('lo que no se relaciona no viaja: las filas validadas solo llevan campos de la clienta', () => {
  const t = tablaPegada(leerPegado(EXCEL_WIN)!, true);
  const v = validarFilas(t.rows, mapeoPegado(t, true));
  assert.doesNotMatch(JSON.stringify(v.map((f) => f.datos)), /Hernia/);
});

test('el tope de filas es el del servidor; y lo desmesurado ni se lee (no cuelga la pestaña)', async () => {
  const { readFileSync } = await import('node:fs');
  const ruta = readFileSync(new URL('../app/api/socios/import/route.ts', import.meta.url), 'utf8');
  assert.match(ruta, new RegExp(`const MAX_FILAS = ${MAX_FILAS_PEGADAS};`));
  const enorme = ['Nombre\tEmail', ...Array.from({ length: MAX_FILAS_LEIDAS + 5 }, (_, i) => `N${i}\tn${i}@example.com`)].join('\n');
  assert.equal(leerPegado(enorme)!.demasiadas, true);
  const muchas = ['Nombre\tEmail', ...Array.from({ length: MAX_FILAS_PEGADAS + 1 }, (_, i) => `N${i}\tn${i}@example.com`)].join('\n');
  assert.equal(tablaPegada(leerPegado(muchas)!, true).rows.length, MAX_FILAS_PEGADAS + 1, 'se leen todas para poder decir cuántas son');
});

test('con TZ=UTC o Madrid, lo mismo (no hay fechas que convertir aquí)', () => {
  const antes = process.env.TZ;
  try {
    process.env.TZ = 'UTC';
    const a = tablaPegada(leerPegado(EXCEL_WIN)!, true);
    process.env.TZ = 'Europe/Madrid';
    const b = tablaPegada(leerPegado(EXCEL_WIN)!, true);
    assert.deepEqual(a, b);
  } finally {
    if (antes === undefined) delete process.env.TZ; else process.env.TZ = antes;
  }
});
