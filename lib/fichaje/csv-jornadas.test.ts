import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvJornadas, nombreCsvJornadas } from './csv-jornadas.ts';
import type { JornadaEquipo } from './jornadas-equipo.ts';

const j = (o: Partial<JornadaEquipo>): JornadaEquipo => ({
  id: 'x', instructorId: 'i1', checkInAt: '2026-09-15T07:00:00.000Z', checkOutAt: '2026-09-15T11:30:00.000Z',
  status: 'CLOSED', minutos: 270, requiereRevision: false, corregida: false, ...o,
});
const nombres: Record<string, string> = { i1: 'Marta Ruiz', i2: 'Ana Peña' };
const lineas = (csv: string) => csv.replace(/^﻿/, '').trimEnd().split('\r\n');

test('BOM, punto y coma y horas en hora de Madrid', () => {
  const csv = csvJornadas([j({})], (id) => nombres[id]);
  assert.ok(csv.startsWith('﻿'));
  const [cab, fila] = lineas(csv);
  assert.equal(cab, 'Instructora;Fecha;Entrada;Salida;Duración (h:mm);Horas;Estado;Corregida');
  // 07:00 UTC en septiembre = 09:00 en Madrid.
  assert.equal(fila, 'Marta Ruiz;2026-09-15;09:00;13:30;4:30;4,50;Cerrada;No');
});

test('la fecha es la del estudio: una entrada a las 00:30 de Madrid no cae el día anterior', () => {
  const [, fila] = lineas(csvJornadas([j({ checkInAt: '2026-09-14T22:30:00.000Z', checkOutAt: '2026-09-15T02:30:00.000Z', minutos: 240 })], (id) => nombres[id]));
  assert.match(fila, /^Marta Ruiz;2026-09-15;00:30;04:30;/);
});

test('abierta y por revisar: sin salida ni horas, y lo dice', () => {
  const [, a, b] = lineas(csvJornadas([
    j({ id: 'a', checkOutAt: null, minutos: null, status: 'OPEN' }),
    j({ id: 'b', checkInAt: '2026-09-16T07:00:00.000Z', checkOutAt: null, minutos: null, status: 'OPEN', requiereRevision: true, corregida: true }),
  ], (id) => nombres[id]));
  assert.equal(a, 'Marta Ruiz;2026-09-15;09:00;;;;Abierta;No');
  assert.equal(b, 'Marta Ruiz;2026-09-16;09:00;;;;Por revisar;Sí');
});

test('ordenado por instructora y luego por fecha', () => {
  const filas = lineas(csvJornadas([
    j({ id: '1', instructorId: 'i1', checkInAt: '2026-09-16T07:00:00.000Z' }),
    j({ id: '2', instructorId: 'i2', checkInAt: '2026-09-17T07:00:00.000Z' }),
    j({ id: '3', instructorId: 'i1', checkInAt: '2026-09-15T07:00:00.000Z' }),
  ], (id) => nombres[id])).slice(1).map((f) => f.split(';').slice(0, 2).join(' '));
  assert.deepEqual(filas, ['Ana Peña 2026-09-17', 'Marta Ruiz 2026-09-15', 'Marta Ruiz 2026-09-16']);
});

test('un nombre con fórmula, comillas o punto y coma no rompe ni ejecuta nada', () => {
  const [, f1, f2] = lineas(csvJornadas([
    j({ id: '1', instructorId: 'malo' }),
    j({ id: '2', instructorId: 'raro', checkInAt: '2026-09-16T07:00:00.000Z' }),
  ], (id) => (id === 'malo' ? '=HYPERLINK("http://x")' : 'Ana; "la de tarde"')));
  assert.ok(f1.startsWith(`"'=HYPERLINK(""http://x"")";`), f1);
  assert.ok(f2.startsWith('"Ana; ""la de tarde""";'), f2);
});

test('nombre del fichero con el mes a dos cifras', () => {
  assert.equal(nombreCsvJornadas(2026, 9), 'tiempo-trabajado-2026-09.csv');
});
