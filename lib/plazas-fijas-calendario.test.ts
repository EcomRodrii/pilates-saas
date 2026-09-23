import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  marcasDelMes, nombreMes, semanasDelMes, sumarMeses, ultimoMesConClases,
  type PlazaCalendario, type ReservaCalendario, type SesionCalendario,
} from './plazas-fijas-calendario.ts';

// Junio de 2026 empieza en lunes: lunes 1, 8, 15, 22, 29 y miércoles 3, 10, 17, 24.
const LUNES: PlazaCalendario = { diaSemana: 1, hora: '10:00:00', salaId: 'sala-1', tipoClaseId: 'tc-r', estado: 'ACTIVA', vigenciaDesde: '2026-05-01', vigenciaHasta: null };
const MIERCOLES: PlazaCalendario = { ...LUNES, diaSemana: 3 };
const LUNES_JUNIO = ['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29'];
const MIERCOLES_JUNIO = ['2026-06-03', '2026-06-10', '2026-06-17', '2026-06-24'];

const sesion = (fecha: string, cambios: Partial<SesionCalendario> = {}): SesionCalendario =>
  ({ id: `ses-${fecha}`, fecha, hora: '10:00', salaId: 'sala-1', tipoClaseId: 'tc-r', cancelada: false, ...cambios });
const reserva = (fecha: string, estado = 'CONFIRMADA'): ReservaCalendario => ({ sesionId: `ses-${fecha}`, estado });

const SESIONES = [...LUNES_JUNIO, ...MIERCOLES_JUNIO].map((f) => sesion(f));
const HOY = '2026-05-20';

const marcas = (m: Map<string, { marca: string }[]>) => Object.fromEntries([...m].map(([f, d]) => [f, d.map((x) => x.marca).join('+')]));

test('lunes y miércoles con sus reservas: cada día que le toca, reservado', () => {
  const m = marcasDelMes('2026-06', [LUNES, MIERCOLES], SESIONES, [...LUNES_JUNIO, ...MIERCOLES_JUNIO].map((f) => reserva(f)), HOY);
  assert.equal(m.size, 9);
  for (const f of [...LUNES_JUNIO, ...MIERCOLES_JUNIO]) assert.deepEqual(m.get(f), [{ hora: '10:00', marca: 'RESERVADA', sesionId: `ses-${f}` }]);
  assert.equal(m.get('2026-06-02'), undefined, 'un martes no le toca');
});

test('un check es una reserva que existe: sin reserva, «sin reservar» (y en el pasado, nada)', () => {
  const m = marcasDelMes('2026-06', [LUNES], SESIONES, [reserva('2026-06-01')], '2026-06-10');
  assert.deepEqual(marcas(m), {
    '2026-06-01': 'RESERVADA',
    // El 8 ya pasó y no hay reserva: no se sabe nada, no se inventa nada.
    '2026-06-15': 'SIN_RESERVA', '2026-06-22': 'SIN_RESERVA', '2026-06-29': 'SIN_RESERVA',
  });
});

test('el día que canceló sale como «no va»; si luego volvió a reservar, reservado', () => {
  const m = marcasDelMes('2026-06', [LUNES], SESIONES, [
    reserva('2026-06-01'), reserva('2026-06-08', 'CANCELADA'),
    reserva('2026-06-15', 'CANCELADA'), reserva('2026-06-15'),
  ], HOY);
  assert.equal(m.get('2026-06-08')?.[0].marca, 'NO_VA');
  assert.equal(m.get('2026-06-15')?.[0].marca, 'RESERVADA');
});

test('asistió y no vino se distinguen; la lista de espera no cuenta como sitio', () => {
  const m = marcasDelMes('2026-06', [LUNES], SESIONES, [
    reserva('2026-06-01', 'ASISTIDA'), reserva('2026-06-08', 'NO_ASISTIO'), reserva('2026-06-15', 'LISTA_ESPERA'),
  ], '2026-06-10');
  assert.equal(m.get('2026-06-01')?.[0].marca, 'ASISTIDA');
  assert.equal(m.get('2026-06-08')?.[0].marca, 'NO_ASISTIO');
  assert.equal(m.get('2026-06-15')?.[0].marca, 'SIN_RESERVA');
});

test('las semanas en pausa salen en pausa, pero si vino, vino', () => {
  const conPausa = { ...LUNES, pausaDesde: '2026-06-08', pausaHasta: '2026-06-21' };
  const m = marcasDelMes('2026-06', [conPausa], SESIONES, [reserva('2026-06-08', 'ASISTIDA'), reserva('2026-06-22')], '2026-06-10');
  assert.equal(m.get('2026-06-08')?.[0].marca, 'ASISTIDA');
  assert.equal(m.get('2026-06-15')?.[0].marca, 'PAUSA');
  assert.equal(m.get('2026-06-22')?.[0].marca, 'RESERVADA');
});

test('en pausa sin fechas (su sitio quedó libre): de hoy en adelante, en pausa', () => {
  const m = marcasDelMes('2026-06', [{ ...LUNES, estado: 'PAUSADA' }], SESIONES, [], '2026-06-10');
  assert.deepEqual(marcas(m), { '2026-06-15': 'PAUSA', '2026-06-22': 'PAUSA', '2026-06-29': 'PAUSA' });
});

test('sin clase ese día no se marca nada: festivo, clase cancelada o de otro tipo', () => {
  const sesiones = [
    sesion('2026-06-01'),
    sesion('2026-06-08', { cancelada: true }),
    sesion('2026-06-15', { tipoClaseId: 'tc-otro' }),
    sesion('2026-06-22', { salaId: 'sala-2' }),
    // el 29, ni la hay
  ];
  const m = marcasDelMes('2026-06', [LUNES], sesiones, [reserva('2026-06-01')], HOY);
  assert.deepEqual(marcas(m), { '2026-06-01': 'RESERVADA' });
});

test('fuera de su vigencia no le toca', () => {
  const m = marcasDelMes('2026-06', [{ ...LUNES, vigenciaDesde: '2026-06-08', vigenciaHasta: '2026-06-22' }], SESIONES, [], HOY);
  assert.deepEqual(Object.keys(marcas(m)), ['2026-06-08', '2026-06-15', '2026-06-22']);
});

test('dos clases fijas el mismo día: las dos, por hora', () => {
  const tarde = { ...LUNES, hora: '18:30' };
  const sesiones = [sesion('2026-06-01'), sesion('2026-06-01', { id: 'ses-tarde', hora: '18:30' })];
  const m = marcasDelMes('2026-06', [tarde, LUNES], sesiones, [reserva('2026-06-01'), { sesionId: 'ses-tarde', estado: 'CANCELADA' }], HOY);
  assert.deepEqual(m.get('2026-06-01'), [{ hora: '10:00', marca: 'RESERVADA', sesionId: 'ses-2026-06-01' }, { hora: '18:30', marca: 'NO_VA', sesionId: 'ses-tarde' }]);
});

test('una plaza de baja no pinta nada', () => {
  assert.equal(marcasDelMes('2026-06', [{ ...LUNES, estado: 'BAJA' }], SESIONES, [], HOY).size, 0);
});

test('semanas del mes: lunes primero, con huecos antes del 1 y después del último', () => {
  const junio = semanasDelMes('2026-06');
  assert.equal(junio.length, 5);
  assert.deepEqual(junio[0], ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07']);
  assert.deepEqual(junio[4], ['2026-06-29', '2026-06-30', null, null, null, null, null]);
  // Septiembre de 2026 empieza en martes.
  assert.deepEqual(semanasDelMes('2026-09')[0].slice(0, 2), [null, '2026-09-01']);
  // Febrero de 2026: 28 días empezando en domingo → 5 semanas.
  const feb = semanasDelMes('2026-02');
  assert.equal(feb[0][6], '2026-02-01');
  assert.equal(feb.flat().filter(Boolean).length, 28);
});

test('meses: sumar cruza de año y el nombre va en castellano', () => {
  assert.equal(sumarMeses('2026-12', 1), '2027-01');
  assert.equal(sumarMeses('2026-01', -1), '2025-12');
  assert.equal(nombreMes('2026-06'), 'junio de 2026');
});

test('último mes con clases: hasta la última de su horario, sin pasar de su vigencia', () => {
  const sesiones = [sesion('2026-06-01'), sesion('2026-08-03'), sesion('2026-10-05'), sesion('2026-12-01', { hora: '19:00' })];
  assert.equal(ultimoMesConClases([LUNES], sesiones, HOY), '2026-10');
  assert.equal(ultimoMesConClases([{ ...LUNES, vigenciaHasta: '2026-08-31' }], sesiones, HOY), '2026-08');
  assert.equal(ultimoMesConClases([LUNES], [], HOY), '2026-05', 'sin clases, el mes de hoy');
});
