import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_DIAS_REPETICION, avisoHorario, cierreDeFecha, fechaCorta, fechasDeRepeticion, finConDuracion, fraseAlLlenarse,
  instantesDe, minutosEntre, motivoSalto, planDeFechas, planesQueLaIncluyen, textoDuracion, tituloSaltos,
} from './nueva-clase.ts';
import type { SlotSesion } from '../calendar-logic.ts';
import type { DiaHorario, Studio } from '../types.ts';
import type { TipoConReglas } from '../configuracion/reglas-reserva.ts';

// ── Fin automático ──────────────────────────────────────────────────────────

test('el fin sale de la duración del tipo de clase', () => {
  assert.equal(finConDuracion('09:00', 45), '09:45');
  assert.equal(finConDuracion('18:30', 55), '19:25');
  assert.equal(finConDuracion('09:15', 120), '11:15');
});

test('el fin no pasa al día siguiente: se queda en 23:59, como antes', () => {
  assert.equal(finConDuracion('23:30', 45), '23:59');
});

test('sin hora de inicio válida o sin duración no hay fin que proponer', () => {
  assert.equal(finConDuracion('', 45), null);
  assert.equal(finConDuracion('9:00', 45), null);
  assert.equal(finConDuracion('09:00', 0), null);
  assert.equal(finConDuracion('09:00', null), null);
});

test('la duración entre dos horas, y nada si el fin no va después', () => {
  assert.equal(minutosEntre('09:00', '09:45'), 45);
  assert.equal(minutosEntre('09:00', '09:00'), null);
  assert.equal(minutosEntre('10:00', '09:00'), null);
  assert.equal(minutosEntre('', '09:00'), null);
});

test('la duración, dicha como la lee una persona', () => {
  assert.equal(textoDuracion(45), '45 min');
  assert.equal(textoDuracion(60), '1 h');
  assert.equal(textoDuracion(75), '1 h 15 min');
});

// ── Repetición → fechas ─────────────────────────────────────────────────────

test('martes y jueves de dos semanas: cuatro fechas, en orden', () => {
  // 2026-10-06 es martes.
  assert.deepEqual(fechasDeRepeticion('2026-10-06', '2026-10-15', [2, 4]),
    ['2026-10-06', '2026-10-08', '2026-10-13', '2026-10-15']);
});

test('la primera fecha solo cuenta si su día está marcado', () => {
  // Martes 6, pero solo jueves: la primera clase es el 8.
  assert.deepEqual(fechasDeRepeticion('2026-10-06', '2026-10-15', [4]), ['2026-10-08', '2026-10-15']);
});

test('el domingo es el 0, como extract(dow)', () => {
  assert.deepEqual(fechasDeRepeticion('2026-10-04', '2026-10-11', [0]), ['2026-10-04', '2026-10-11']);
});

test('cruzar el cambio de hora no descoloca ningún día', () => {
  // El 25-oct-2026 España pasa a horario de invierno.
  assert.deepEqual(fechasDeRepeticion('2026-10-19', '2026-11-02', [1]), ['2026-10-19', '2026-10-26', '2026-11-02']);
});

test('rango al revés, sin días o de más de un año: ninguna fecha', () => {
  assert.deepEqual(fechasDeRepeticion('2026-10-15', '2026-10-06', [2]), []);
  assert.deepEqual(fechasDeRepeticion('2026-10-06', '2026-10-15', []), []);
  assert.deepEqual(fechasDeRepeticion('2026-10-06', '2027-10-06', [2]), []);
  assert.equal(fechasDeRepeticion('2026-10-06', '2027-10-05', [2]).length, 53);
  assert.equal(MAX_DIAS_REPETICION, 364);
});

test('la fecha corta, sin depender del reloj', () => {
  assert.equal(fechaCorta('2026-11-06'), 'vie 6 nov');
  assert.equal(fechaCorta('2026-09-01'), 'mar 1 sept');
});

// ── Solapes en TODAS las fechas ─────────────────────────────────────────────

type Slot = SlotSesion & { id: string; tipo: string };
const sesion = (id: string, fecha: string, desde: string, hasta: string, sala: string, instructora: string, tipo = 'Mat', cancelada = false): Slot => ({
  id, tipo, salaId: sala, instructorId: instructora, cancelada, ...instantesDe(fecha, desde, hasta),
});

const base = { horaInicio: '09:00', horaFin: '09:45', salaId: 'sala-1', instructorId: 'ins-1' };

test('un solape en una semana POSTERIOR se ve y solo se salta esa fecha', () => {
  const fechas = fechasDeRepeticion('2026-10-06', '2026-10-27', [2]);
  const existentes = [sesion('x', '2026-10-20', '09:30', '10:30', 'sala-1', 'otra', 'Reformer Avanzado')];
  const plan = planDeFechas({ ...base, fechas, existentes });
  assert.deepEqual(plan.crear.map(f => f.fecha), ['2026-10-06', '2026-10-13', '2026-10-27']);
  assert.deepEqual(plan.saltadas.map(f => f.fecha), ['2026-10-20']);
  assert.equal(plan.saltadas[0].sala[0].id, 'x');
});

test('la instructora ocupada en otra sala también salta la fecha', () => {
  const existentes = [sesion('y', '2026-10-13', '08:30', '09:30', 'sala-2', 'ins-1')];
  const plan = planDeFechas({ ...base, fechas: ['2026-10-06', '2026-10-13'], existentes });
  assert.deepEqual(plan.saltadas.map(f => f.fecha), ['2026-10-13']);
  assert.equal(plan.saltadas[0].instructor[0].id, 'y');
  assert.equal(plan.saltadas[0].sala.length, 0);
});

test('una clase cancelada o que solo se toca en el borde no choca', () => {
  const existentes = [
    sesion('c', '2026-10-06', '09:00', '10:00', 'sala-1', 'otra', 'Mat', true),
    sesion('b', '2026-10-06', '09:45', '10:30', 'sala-1', 'otra'),
  ];
  const plan = planDeFechas({ ...base, fechas: ['2026-10-06'], existentes });
  assert.equal(plan.crear.length, 1);
  assert.equal(plan.saltadas.length, 0);
});

test('si todas chocan, no queda nada que crear', () => {
  const existentes = [sesion('x', '2026-10-06', '09:00', '10:00', 'sala-1', 'otra')];
  const plan = planDeFechas({ ...base, fechas: ['2026-10-06'], existentes });
  assert.equal(plan.crear.length, 0);
  assert.equal(plan.saltadas.length, 1);
});

test('el cierre del centro solo salta fechas cuando se pide (la clase que se repite)', () => {
  const cierres = [{ id: 'c1', desde: '2026-12-24', hasta: '2026-12-26', motivo: 'Navidad' }];
  const fechas = ['2026-12-22', '2026-12-24'];
  assert.equal(planDeFechas({ ...base, fechas, existentes: [], cierres }).saltadas.length, 0);
  const plan = planDeFechas({ ...base, fechas, existentes: [], cierres, saltarCierres: true });
  assert.deepEqual(plan.saltadas.map(s => s.fecha), ['2026-12-24']);
  assert.equal(plan.saltadas[0].cierre?.motivo, 'Navidad');
});

test('con la hora al revés no se inventa ningún plan', () => {
  const plan = planDeFechas({ ...base, horaFin: '08:00', fechas: ['2026-10-06'], existentes: [] });
  assert.deepEqual(plan, { crear: [], saltadas: [] });
});

test('cada fecha saltada dice cuándo y por qué, con la clase que ocupa el hueco', () => {
  const existentes = [
    sesion('x', '2026-11-05', '09:00', '10:00', 'sala-1', 'otra', 'Reformer Avanzado'),
    sesion('y', '2026-11-24', '09:00', '09:55', 'sala-2', 'ins-1', 'Pilates Mat'),
  ];
  const plan = planDeFechas({ ...base, fechas: ['2026-11-05', '2026-11-24'], existentes });
  const nombres = {
    sala: (id: string) => ({ 'sala-1': 'Sala Reformer', 'sala-2': 'Sala Mat' }[id] ?? 'sala'),
    instructora: (id: string) => (id === 'ins-1' ? 'María' : 'otra'),
    clase: (s: Slot) => s.tipo,
  };
  assert.deepEqual(plan.saltadas.map(s => motivoSalto(s, nombres)), [
    'jue 5 nov · Sala Reformer ocupada 09:00–10:00 (Reformer Avanzado)',
    'mar 24 nov · María ya da clase 09:00–09:55 (Pilates Mat)',
  ]);
});

test('la misma clase ocupando sala e instructora se cuenta una vez', () => {
  const existentes = [sesion('x', '2026-11-05', '09:00', '10:00', 'sala-1', 'ins-1', 'Mat')];
  const [s] = planDeFechas({ ...base, fechas: ['2026-11-05'], existentes }).saltadas;
  assert.equal(motivoSalto(s, { sala: () => 'Sala 1', instructora: () => 'María', clase: (x: Slot) => x.tipo }),
    'jue 5 nov · Sala 1 ocupada 09:00–10:00 (Mat)');
});

test('el título del aviso dice qué pasa con esas fechas', () => {
  const choque = { fecha: '2026-11-05', inicio: '', fin: '', sala: [{ salaId: 's', instructorId: 'i', inicio: '', fin: '' }], instructor: [], cierre: null };
  const cierre = { ...choque, sala: [], cierre: { id: 'c', desde: '2026-11-05', hasta: '2026-11-05', motivo: null } };
  assert.equal(tituloSaltos([choque]), '1 fecha choca con otra clase');
  assert.equal(tituloSaltos([choque, choque]), '2 fechas chocan con otra clase');
  assert.equal(tituloSaltos([cierre]), '1 fecha cae en un cierre del centro');
  assert.equal(tituloSaltos([choque, cierre]), '2 fechas no se pueden crear');
  assert.equal(cierreDeFecha('2026-11-05', [cierre.cierre]), cierre.cierre);
  assert.equal(cierreDeFecha('2026-11-06', [cierre.cierre]), null);
});

// ── Horario del estudio ─────────────────────────────────────────────────────

const semana: DiaHorario[] = [
  { diaSemana: 0, abierto: false, horaApertura: null, horaCierre: null },
  ...[1, 2, 3, 5, 6].map(d => ({ diaSemana: d, abierto: true, horaApertura: '08:00:00', horaCierre: '21:00:00' })),
  { diaSemana: 4, abierto: true, horaApertura: '09:30:00', horaCierre: '20:00:00' },
];

test('antes de abrir ese día: lo dice con la hora de ESE día', () => {
  assert.equal(avisoHorario(4, '09:00', '09:45', { semana }), 'Tu estudio abre a las 09:30 los jueves.');
  assert.equal(avisoHorario(1, '09:00', '09:45', { semana }), null);
});

test('después de cerrar, las dos cosas, y un día cerrado', () => {
  assert.equal(avisoHorario(4, '19:30', '20:30', { semana }), 'Tu estudio cierra a las 20:00 los jueves.');
  assert.equal(avisoHorario(4, '07:00', '22:00', { semana }), 'Los jueves tu estudio abre de 09:30 a 20:00.');
  assert.equal(avisoHorario(0, '10:00', '11:00', { semana }), 'Los domingos tu estudio está cerrado.');
});

test('sin horario por día, el horario único de siempre', () => {
  assert.equal(avisoHorario(6, '07:00', '08:00', { apertura: '08:00:00', cierre: '22:00:00' }), 'Tu estudio abre a las 08:00 los sábados.');
  assert.equal(avisoHorario(6, '07:00', '08:00', {}), null);
  assert.equal(avisoHorario(6, '', '08:00', { semana }), null);
});

// ── Al llenarse: la regla que se aplica de verdad ───────────────────────────

const estudio: Partial<Studio> = { permiteListaEspera: true, listaEsperaPlazoAceptacionMinutos: 0 };
const tipo = (extra: Partial<TipoConReglas> = {}): TipoConReglas => ({ id: 'tc-1', nombre: 'HIIT Reformer', permiteListaEspera: null, listaEsperaPlazoAceptacionMinutos: null, ...extra });

test('con lista de espera al momento', () => {
  assert.equal(fraseAlLlenarse(estudio, tipo()),
    'Al llenarse, las siguientes entran en lista de espera y la plaza que se libere pasa al momento a la primera.');
});

test('con plazo para aceptar la plaza, el del tipo pisa al del estudio', () => {
  assert.equal(fraseAlLlenarse({ ...estudio, listaEsperaPlazoAceptacionMinutos: 30 }, tipo()),
    'Al llenarse, las siguientes entran en lista de espera; si se libera una plaza, la primera tiene 30 min para aceptarla.');
  assert.match(fraseAlLlenarse(estudio, tipo({ listaEsperaPlazoAceptacionMinutos: 120 })), /tiene 2 h para aceptarla/);
});

test('SIN lista de espera ya no promete que entran en ella, y dice quién lo decide', () => {
  assert.equal(fraseAlLlenarse({ ...estudio, permiteListaEspera: false }, tipo()),
    'Al llenarse, tus alumnas ya no pueden reservarla: tu estudio no tiene lista de espera.');
  assert.equal(fraseAlLlenarse(estudio, tipo({ permiteListaEspera: false })),
    'Al llenarse, tus alumnas ya no pueden reservarla: «HIIT Reformer» no tiene lista de espera.');
  // El tipo puede tener la lista de espera que el estudio no tiene.
  assert.match(fraseAlLlenarse({ ...estudio, permiteListaEspera: false }, tipo({ permiteListaEspera: true })), /entran en lista de espera/);
});

test('sin estudio cargado todavía, los valores de fábrica (los de Configuración)', () => {
  assert.match(fraseAlLlenarse(null, null), /entran en lista de espera/);
});

test('los planes a la venta que la incluyen, por nombre; los inactivos no', () => {
  const planes = [
    { nombre: 'Bono 10', activo: true, tiposClaseIds: [] },
    { nombre: 'Bono Mat', activo: true, tiposClaseIds: ['tc-mat'] },
    { nombre: 'Viejo', activo: false, tiposClaseIds: [] },
  ];
  assert.deepEqual(planesQueLaIncluyen(planes, 'tc-1'), ['Bono 10']);
  assert.deepEqual(planesQueLaIncluyen(planes, 'tc-mat'), ['Bono 10', 'Bono Mat']);
  assert.deepEqual(planesQueLaIncluyen([], 'tc-1'), []);
});
