import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rejillaSemana, lunesDe, semanaInicial, navegacionSemana, etiquetaRangoSemana, cabeceraDia,
  etiquetaHora, horaDe, empiezaEnPunto, plazasDeClase, nombreAccesibleClase, recuentoClases,
} from './horario-semana.ts';

// Semana del lunes 21 al domingo 27 de septiembre de 2026 (verano: Madrid = UTC+2).
const LUNES = '2026-09-21';
const clase = (id: string, inicio: string) => ({ id, inicio });

test('el lunes de cualquier día, también del domingo (la semana empieza en lunes)', () => {
  assert.equal(lunesDe('2026-09-21'), '2026-09-21');
  assert.equal(lunesDe('2026-09-23'), '2026-09-21');
  // `getDay()` es 0 = domingo: sin corregirlo, el domingo abriría la semana SIGUIENTE.
  assert.equal(lunesDe('2026-09-27'), '2026-09-21');
  assert.equal(lunesDe('2026-09-28'), '2026-09-28');
  // Cruzando de mes y de año.
  assert.equal(lunesDe('2026-10-01'), '2026-09-28');
  assert.equal(lunesDe('2027-01-01'), '2026-12-28');
});

test('siete columnas de lunes a domingo, con hoy marcado y los días pasados apagados', () => {
  const r = rejillaSemana([], LUNES, '2026-09-23');
  assert.deepEqual(r.dias.map(d => d.fecha), [
    '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27',
  ]);
  assert.deepEqual(r.dias.map(d => d.hoy), [false, false, true, false, false, false, false]);
  assert.deepEqual(r.dias.map(d => d.pasado), [true, true, false, false, false, false, false]);
  assert.equal(r.total, 0);
  assert.deepEqual(r.franjas, []);
});

test('solo hay fila para las horas con clase ESA semana, ordenadas y con el salto marcado', () => {
  const r = rejillaSemana([
    clase('tarde', '2026-09-23T18:00:00+02:00'),
    clase('manana', '2026-09-21T08:00:00+02:00'),
    clase('manana-2', '2026-09-22T09:00:00+02:00'),
    // Otra semana: no inventa la fila de las 12.
    clase('fuera', '2026-09-28T12:00:00+02:00'),
  ], LUNES, '2026-09-21');
  assert.deepEqual(r.franjas.map(f => f.hora), [8, 9, 18]);
  assert.deepEqual(r.franjas.map(f => f.saltoAntes), [false, false, true]);
  assert.equal(r.total, 3);
});

test('cada clase cae en su día y su hora DEL ESTUDIO, no en UTC', () => {
  // 22:30 UTC del martes = 00:30 del miércoles en Madrid.
  const r = rejillaSemana([clase('madrugada', '2026-09-22T22:30:00Z')], LUNES, LUNES);
  assert.deepEqual(r.franjas.map(f => f.hora), [0]);
  assert.equal(r.franjas[0].celdas[2][0].id, 'madrugada'); // miércoles
  assert.equal(r.franjas[0].celdas[1].length, 0); // no el martes
});

test('en invierno también (el desfase cambia con la hora, no se puede fijar)', () => {
  // 1 de diciembre de 2026, martes: Madrid = UTC+1. 09:00 UTC son las 10:00.
  const r = rejillaSemana([clase('inv', '2026-12-01T09:00:00Z')], '2026-11-30', '2026-11-30');
  assert.deepEqual(r.franjas.map(f => f.hora), [10]);
  assert.equal(r.franjas[0].celdas[1][0].id, 'inv');
});

test('dos clases a la misma hora comparten celda, ordenadas por instante aunque el ISO venga distinto', () => {
  const r = rejillaSemana([
    clase('b', '2026-09-21T08:30:00.000Z'), // 10:30
    clase('a', '2026-09-21T10:00:00+02:00'), // 10:00
  ], LUNES, LUNES);
  assert.deepEqual(r.franjas.map(f => f.hora), [10]);
  assert.deepEqual(r.franjas[0].celdas[0].map(c => c.id), ['a', 'b']);
});

test('una fecha rota no inventa fila ni cuenta', () => {
  const r = rejillaSemana([clase('x', 'no-es-una-fecha')], LUNES, LUNES);
  assert.equal(r.total, 0);
  assert.deepEqual(r.franjas, []);
});

test('abre en la semana de hoy si le quedan clases…', () => {
  const clases = [clase('a', '2026-09-26T10:00:00+02:00'), clase('b', '2026-10-05T10:00:00+02:00')];
  assert.equal(semanaInicial(clases, '2026-09-23'), LUNES);
});

test('…y si esta semana ya no queda ninguna, en la de la próxima clase', () => {
  // Domingo por la tarde: lo que queda es la semana que viene (o después de unas vacaciones).
  assert.equal(semanaInicial([clase('a', '2026-10-14T10:00:00+02:00')], '2026-09-27'), '2026-10-12');
  // Sin ninguna clase, la de hoy (con su «no hay clases»), nunca una fecha inventada.
  assert.equal(semanaInicial([], '2026-09-23'), LUNES);
});

test('navegación: nunca a una semana pasada, y hacia delante solo mientras quede algo', () => {
  const clases = [
    clase('esta', '2026-09-24T10:00:00+02:00'),
    clase('dentro-de-tres', '2026-10-15T10:00:00+02:00'),
  ];
  const hoy = '2026-09-23';
  const esta = navegacionSemana(LUNES, hoy, clases);
  assert.equal(esta.anterior, null);
  assert.equal(esta.siguiente, '2026-09-28');
  // La semana que viene está vacía: el aviso lleva directo a la de la próxima clase.
  assert.equal(esta.proximaConClases, '2026-10-12');

  const ultima = navegacionSemana('2026-10-12', hoy, clases);
  assert.equal(ultima.anterior, '2026-10-05');
  assert.equal(ultima.siguiente, null);
  assert.equal(ultima.proximaConClases, null);
});

test('sin clases no hay adónde ir (ni un «siguiente» que lleve a semanas vacías para siempre)', () => {
  const n = navegacionSemana(LUNES, LUNES, []);
  assert.deepEqual(n, { anterior: null, siguiente: null, proximaConClases: null });
});

test('el rango de la semana, en castellano y sin mayúsculas de más', () => {
  assert.equal(etiquetaRangoSemana('2026-09-21'), '21 – 27 de septiembre');
  assert.equal(etiquetaRangoSemana('2026-09-28'), '28 de septiembre – 4 de octubre');
  assert.equal(etiquetaRangoSemana('2025-12-29'), '29 de diciembre de 2025 – 4 de enero de 2026');
});

test('cabecera de columna: corta para verla, completa para oírla', () => {
  assert.deepEqual(cabeceraDia('2026-09-23'), { corta: 'Mié', numero: 23, larga: 'miércoles 23 de septiembre' });
  assert.deepEqual(cabeceraDia('2026-09-27'), { corta: 'Dom', numero: 27, larga: 'domingo 27 de septiembre' });
});

test('horas: la fila en punto, el chip con sus minutos, todo en hora del estudio', () => {
  assert.equal(etiquetaHora(8), '08:00');
  assert.equal(etiquetaHora(18), '18:00');
  assert.equal(horaDe('2026-09-23T08:30:00Z'), '10:30');
  assert.equal(horaDe('roto'), '');
  assert.equal(empiezaEnPunto('2026-09-23T08:00:00Z'), true);
  assert.equal(empiezaEnPunto('2026-09-23T08:30:00Z'), false);
});

test('plazas: las mismas reglas que la tarjeta de la lista', () => {
  assert.deepEqual(plazasDeClase({ aforoMaximo: 10, ocupadas: 4 }), { texto: '6 libres', tono: 'libre' });
  assert.deepEqual(plazasDeClase({ aforoMaximo: 10, ocupadas: 8 }), { texto: 'Quedan 2', tono: 'ultimas' });
  assert.deepEqual(plazasDeClase({ aforoMaximo: 10, ocupadas: 9 }), { texto: 'Quedan 1', tono: 'ultimas' });
  assert.deepEqual(plazasDeClase({ aforoMaximo: 10, ocupadas: 10 }), { texto: 'Completa', tono: 'completa' });
  // Sobreaforo (staff por encima del aforo) y aforo sin fijar: completa, nunca «-2 libres» ni infinitas.
  assert.deepEqual(plazasDeClase({ aforoMaximo: 10, ocupadas: 12 }), { texto: 'Completa', tono: 'completa' });
  assert.deepEqual(plazasDeClase({ aforoMaximo: 0, ocupadas: 0 }), { texto: 'Completa', tono: 'completa' });
  // Lo suyo va antes que el aforo: a quien ya tiene plaza no le sirve el recuento.
  assert.deepEqual(plazasDeClase({ aforoMaximo: 10, ocupadas: 10, miEstado: 'CONFIRMADA' }), { texto: 'Tu plaza', tono: 'mia' });
  assert.deepEqual(plazasDeClase({ aforoMaximo: 10, ocupadas: 10, miEstado: 'LISTA_ESPERA' }), { texto: 'En espera', tono: 'mia' });
});

test('nombre accesible: clase, día y hora del estudio, y lo que dice de sus plazas', () => {
  assert.equal(
    nombreAccesibleClase('Reformer', '2026-09-23T08:00:00Z'),
    'Reformer, miércoles 23 a las 10:00',
  );
  assert.equal(
    nombreAccesibleClase('Reformer', '2026-09-23T08:00:00Z', 'Quedan 2'),
    'Reformer, miércoles 23 a las 10:00, quedan 2',
  );
  // Un lector de pantalla en otro huso oye la hora del estudio, no la suya.
  assert.equal(nombreAccesibleClase('Mat', '2026-09-22T22:30:00Z'), 'Mat, miércoles 23 a las 00:30');
  // Dos Reformer a la misma hora (dos salas) se distinguen por quién la da.
  assert.equal(
    nombreAccesibleClase('Reformer', '2026-09-23T08:00:00Z', '6 libres', 'Ana'),
    'Reformer, miércoles 23 a las 10:00, con Ana, 6 libres',
  );
  // Sin instructora asignada (o en blanco), ni «con» suelto ni coma de más.
  assert.equal(nombreAccesibleClase('Reformer', '2026-09-23T08:00:00Z', '6 libres', null), 'Reformer, miércoles 23 a las 10:00, 6 libres');
  assert.equal(nombreAccesibleClase('Reformer', '2026-09-23T08:00:00Z', '6 libres', '  '), 'Reformer, miércoles 23 a las 10:00, 6 libres');
  assert.equal(nombreAccesibleClase('Mat', 'roto'), 'Mat');
});

test('recuento', () => {
  assert.equal(recuentoClases(1), '1 clase');
  assert.equal(recuentoClases(0), '0 clases');
  assert.equal(recuentoClases(12), '12 clases');
});
