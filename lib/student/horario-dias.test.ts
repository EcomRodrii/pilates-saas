import test from 'node:test';
import assert from 'node:assert/strict';
import {
  avisoDeSalto, diasConClases, diasConReserva, filtrarHorario, franjaDe, leerFiltrosGuardados, marcaDeMes, primerDiaConClases, salasDelHorario,
} from './horario-dias.ts';

// El horario: qué día abre, la tira de 14 días y los filtros de franja y sala (P13).

const HOY = '2026-10-06';
const c = (id: string, fecha: string, hora: string, o: Record<string, unknown> = {}) => ({
  id, fecha, hora, inicio: `${fecha}T${hora}:00+02:00`, fin: `${fecha}T${hora.slice(0, 2)}:50:00+02:00`,
  tipo: 'Reformer', nombre: 'Reformer', tipoClaseId: 'tc-r', plazasLibres: 3, instructoraId: 'i1', salaId: 's1', sala: 'Sala Sol', ...o,
});
const a = (iso: string) => Date.parse(iso);

test('abre hoy si queda alguna clase por empezar', () => {
  const clases = [c('x1', HOY, '09:00'), c('x2', HOY, '22:00'), c('x3', '2026-10-07', '09:00')];
  assert.deepEqual(primerDiaConClases(clases, { hoy: HOY, ahoraMs: a('2026-10-06T21:00:00+02:00') }), { dia: HOY, saltado: false });
});

test('si hoy ya han empezado todas, abre el siguiente día con clases y lo dice', () => {
  const clases = [c('x1', HOY, '09:00'), c('x3', '2026-10-07', '09:00')];
  assert.deepEqual(primerDiaConClases(clases, { hoy: HOY, ahoraMs: a('2026-10-06T21:00:00+02:00') }), { dia: '2026-10-07', saltado: true });
  // Salta varios días si hace falta.
  const lejos = [c('x1', HOY, '09:00'), c('x4', '2026-10-09', '18:00')];
  assert.deepEqual(primerDiaConClases(lejos, { hoy: HOY, ahoraMs: a('2026-10-06T21:00:00+02:00') }), { dia: '2026-10-09', saltado: true });
});

test('con una SUYA en curso se queda en hoy; una ajena en curso no cuenta', () => {
  const clases = [c('x1', HOY, '20:30'), c('x3', '2026-10-07', '09:00')];
  // 20:40: su clase de las 20:30 (hasta las 20:50) se está dando y no queda ninguna por empezar.
  const ahora = a('2026-10-06T20:40:00+02:00');
  assert.deepEqual(primerDiaConClases(clases, { hoy: HOY, ahoraMs: ahora, reservas: [{ claseId: 'x1', estado: 'confirmada' }] }), { dia: HOY, saltado: false });
  assert.deepEqual(primerDiaConClases(clases, { hoy: HOY, ahoraMs: ahora }), { dia: '2026-10-07', saltado: true });
});

test('sin nada en 14 días, hoy y sin salto; sin reloj, sin salto', () => {
  assert.deepEqual(primerDiaConClases([c('x1', HOY, '09:00')], { hoy: HOY, ahoraMs: a('2026-10-06T21:00:00+02:00') }), { dia: HOY, saltado: false });
  assert.deepEqual(primerDiaConClases([c('x3', '2026-10-07', '09:00')], { hoy: HOY, ahoraMs: null }), { dia: HOY, saltado: false });
  // Un día pasado no es candidato.
  assert.deepEqual(primerDiaConClases([c('x0', '2026-10-05', '22:00')], { hoy: HOY, ahoraMs: a('2026-10-06T21:00:00+02:00') }), { dia: HOY, saltado: false });
});

test('el aviso del salto: mañana o el día por su nombre', () => {
  assert.equal(avisoDeSalto(HOY, '2026-10-07'), 'Hoy ya no quedan clases por empezar. Te enseñamos las de mañana.');
  assert.equal(avisoDeSalto(HOY, '2026-10-09'), 'Hoy ya no quedan clases por empezar. Te enseñamos el viernes 9.');
});

test('días con clases, y con una reserva suya CONFIRMADA (la lista de espera no)', () => {
  const clases = [c('x1', HOY, '09:00'), c('x2', '2026-10-08', '09:00'), c('x3', '2026-10-09', '09:00')];
  assert.deepEqual([...diasConClases(clases)].sort(), [HOY, '2026-10-08', '2026-10-09']);
  assert.deepEqual([...diasConReserva([{ claseId: 'x2', estado: 'confirmada' }, { claseId: 'x3', estado: 'en-espera' }], clases)], ['2026-10-08']);
});

test('marca de mes y franja (corte a las 14:00)', () => {
  assert.equal(marcaDeMes('2026-11-01'), '1 nov');
  assert.equal(franjaDe('13:59'), 'manana');
  assert.equal(franjaDe('14:00'), 'tarde');
});

test('salas del horario: únicas, sin vacías, en orden, solo en esos días', () => {
  const clases = [
    c('x1', HOY, '09:00', { salaId: 's2', sala: 'Sala Luna' }), c('x2', HOY, '10:00'), c('x3', HOY, '11:00', { salaId: 's1', sala: 'Sala Sol' }),
    c('x4', HOY, '12:00', { salaId: '', sala: '' }), c('x5', '2026-10-30', '12:00', { salaId: 's9', sala: 'Lejana' }),
  ];
  assert.deepEqual(salasDelHorario(clases, HOY, '2026-10-19'), [{ id: 's2', nombre: 'Sala Luna' }, { id: 's1', nombre: 'Sala Sol' }]);
});

test('filtrar: buscar mira todo el horario sin tildes; franja, sala y «Con hueco» se combinan; una sala sola no filtra', () => {
  const clases = [
    c('x1', HOY, '09:00', { nombre: 'Yoga Flow', tipo: 'Yoga' }), c('x2', HOY, '13:30'), c('x3', HOY, '14:00', { salaId: 's2' }),
    c('x4', HOY, '18:00', { plazasLibres: 0 }), c('x5', '2026-10-07', '09:00', { nombre: 'Yóga suave', tipo: 'Yoga' }),
  ];
  const base = { dia: HOY, consulta: '', tipo: 'Todo', favoritos: new Set<string>(), franja: 'todo' as const, sala: null, salasVisibles: 2, nombreInstructora: () => 'Ana' };
  assert.deepEqual(filtrarHorario(clases, { ...base, consulta: 'yoga' }).map((x) => x.id), ['x1', 'x5']);
  assert.deepEqual(filtrarHorario(clases, { ...base, franja: 'manana' }).map((x) => x.id), ['x1', 'x2']);
  assert.deepEqual(filtrarHorario(clases, { ...base, franja: 'tarde', sala: 's1', tipo: 'Con hueco' }).map((x) => x.id), []);
  assert.deepEqual(filtrarHorario(clases, { ...base, franja: 'tarde', sala: 's2' }).map((x) => x.id), ['x3']);
  // Con una sola sala visible, la recordada no filtra.
  assert.deepEqual(filtrarHorario(clases, { ...base, sala: 's2', salasVisibles: 1 }).map((x) => x.id), ['x1', 'x2', 'x3', 'x4']);
});

test('filtros guardados: lo roto vuelve a «sin filtro»', () => {
  const salas = [{ id: 's1', nombre: 'Sala Sol' }, { id: 's2', nombre: 'Sala Luna' }];
  assert.deepEqual(leerFiltrosGuardados(JSON.stringify({ franja: 'tarde', sala: 's2' }), salas), { franja: 'tarde', sala: 's2' });
  assert.deepEqual(leerFiltrosGuardados('{roto', salas), { franja: 'todo', sala: null });
  assert.deepEqual(leerFiltrosGuardados(JSON.stringify({ franja: 'noche', sala: 's9' }), salas), { franja: 'todo', sala: null });
  assert.deepEqual(leerFiltrosGuardados(null, salas), { franja: 'todo', sala: null });
});
