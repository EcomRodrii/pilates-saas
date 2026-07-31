import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  confirmadasPorSesion,
  estadoAhoraInstructor,
  ocupacionSemanalInstructor,
  barrasOcupacionSemanal,
  horasSemanaInstructor,
  fmtHoras,
} from './equipo-ocupacion.ts';
import type { Sesion, Reserva, TipoClase, Sala } from './types.ts';

const TIPOS: TipoClase[] = [
  {
    id: 'tc-1', studioId: 's1', nombre: 'Reformer Flow', color: '#000', duracionMinutos: 55,
    descripcion: null, nivel: 'TODOS', fotoUrl: null, ventanaCancelacionHoras: null,
    reservaExigirPlan: null, reservaVentanaMinimaMinutos: null, reservaAntelacionMaximaDias: null,
    permiteListaEspera: null, requiereAprobacion: null, listaEsperaPlazoAceptacionMinutos: null,
    minimoAsistentesPorClase: null, penalizacionImporteEur: null,
  },
];
const SALAS: Sala[] = [{ id: 'sala-1', studioId: 's1', nombre: 'Sala Norte', capacidad: 10, color: '#000' }];

function sesion(over: Partial<Sesion>): Sesion {
  return {
    id: 'ses-1', studioId: 's1', tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-1',
    inicio: '2026-08-01T18:00:00.000Z', fin: '2026-08-01T18:55:00.000Z',
    aforoMaximo: 10, cancelada: false, notas: null, precioPuntual: null,
    ...over,
  };
}
function reserva(over: Partial<Reserva>): Reserva {
  return {
    id: 'r-1', studioId: 's1', sesionId: 'ses-1', socioId: 'soc-1', estado: 'CONFIRMADA',
    spotId: null, posicionEspera: null, ofertaExpiraEn: null, checkInEn: null, creadoEn: '2026-01-01T00:00:00Z',
    ...over,
  };
}

test('confirmadasPorSesion: solo cuenta CONFIRMADA/ASISTIDA, no LISTA_ESPERA ni NO_ASISTIO', () => {
  const map = confirmadasPorSesion([
    reserva({ id: 'r1', sesionId: 'a', estado: 'CONFIRMADA' }),
    reserva({ id: 'r2', sesionId: 'a', estado: 'ASISTIDA' }),
    reserva({ id: 'r3', sesionId: 'a', estado: 'LISTA_ESPERA' }),
    reserva({ id: 'r4', sesionId: 'b', estado: 'NO_ASISTIO' }),
    reserva({ id: 'r5', sesionId: 'b', estado: 'CANCELADA' }),
  ]);
  assert.equal(map.get('a'), 2);
  assert.equal(map.get('b'), undefined);
});

test('estadoAhoraInstructor: sin clase en curso → enClase false', () => {
  const ahora = new Date('2026-08-01T10:00:00.000Z');
  const r = estadoAhoraInstructor([sesion({})], TIPOS, SALAS, 'ins-1', ahora);
  assert.equal(r.enClase, false);
});

test('estadoAhoraInstructor: clase en curso → frase con tipo, sala y hora de fin', () => {
  const ahora = new Date('2026-08-01T18:30:00.000Z');
  const r = estadoAhoraInstructor([sesion({})], TIPOS, SALAS, 'ins-1', ahora);
  assert.equal(r.enClase, true);
  if (r.enClase) {
    assert.match(r.texto, /Reformer Flow/);
    assert.match(r.texto, /Sala Norte/);
  }
});

test('estadoAhoraInstructor: clase cancelada no cuenta como "en curso"', () => {
  const ahora = new Date('2026-08-01T18:30:00.000Z');
  const r = estadoAhoraInstructor([sesion({ cancelada: true })], TIPOS, SALAS, 'ins-1', ahora);
  assert.equal(r.enClase, false);
});

test('ocupacionSemanalInstructor: sin clases en la ventana → null', () => {
  const ahora = new Date('2026-08-01T10:00:00.000Z');
  const r = ocupacionSemanalInstructor([], new Map(), 'ins-1', ahora);
  assert.equal(r, null);
});

test('ocupacionSemanalInstructor: media ponderada con aforo mixto entre sesiones', () => {
  const ahora = new Date('2026-08-01T10:00:00.000Z');
  const sesiones = [
    sesion({ id: 'a', inicio: '2026-08-01T18:00:00.000Z', fin: '2026-08-01T18:55:00.000Z', aforoMaximo: 10 }),
    sesion({ id: 'b', inicio: '2026-08-02T18:00:00.000Z', fin: '2026-08-02T18:55:00.000Z', aforoMaximo: 20 }),
  ];
  const confirmadas = new Map([['a', 5], ['b', 5]]); // 10 ocupadas / 30 aforo = 33%
  const r = ocupacionSemanalInstructor(sesiones, confirmadas, 'ins-1', ahora);
  assert.equal(r, 33);
});

test('ocupacionSemanalInstructor: ignora sesiones fuera de la ventana de 7 días o de otro instructor', () => {
  const ahora = new Date('2026-08-01T10:00:00.000Z');
  const sesiones = [
    sesion({ id: 'lejos', inicio: '2026-09-01T18:00:00.000Z', fin: '2026-09-01T18:55:00.000Z' }),
    sesion({ id: 'otra', instructorId: 'ins-2', inicio: '2026-08-02T18:00:00.000Z', fin: '2026-08-02T18:55:00.000Z' }),
  ];
  const r = ocupacionSemanalInstructor(sesiones, new Map([['lejos', 5], ['otra', 5]]), 'ins-1', ahora);
  assert.equal(r, null);
});

test('barrasOcupacionSemanal: longitud fija 7, día sin clases → ratio null', () => {
  const ahora = new Date('2026-08-01T10:00:00.000Z');
  const barras = barrasOcupacionSemanal([sesion({ inicio: '2026-08-01T18:00:00.000Z', fin: '2026-08-01T18:55:00.000Z' })], new Map([['ses-1', 3]]), 'ins-1', ahora);
  assert.equal(barras.length, 7);
  assert.equal(barras[0].ratio, 0.3);
  assert.equal(barras[1].ratio, null);
});

test('horasSemanaInstructor: suma la duración del tipo de clase, no la resta de fin-inicio', () => {
  const ahora = new Date('2026-08-01T10:00:00.000Z');
  const sesiones = [
    sesion({ id: 'a', inicio: '2026-08-01T18:00:00.000Z', fin: '2026-08-01T18:55:00.000Z' }),
    sesion({ id: 'b', inicio: '2026-08-02T18:00:00.000Z', fin: '2026-08-02T18:55:00.000Z' }),
  ];
  const r = horasSemanaInstructor(sesiones, TIPOS, 'ins-1', ahora);
  assert.equal(r, (55 * 2) / 60);
});

test('fmtHoras: formatea horas y minutos, sin minutos sueltos cuando es exacto', () => {
  assert.equal(fmtHoras(33.75), '33 h 45');
  assert.equal(fmtHoras(2), '2 h');
});
