import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nombreDia, proyectarPlazasFijas, proyectarRecuperaciones, type SesionSlotMin } from './plaza-fija.ts';

// 2026-09-04 es viernes (dow 5).
const HOY = '2026-09-04';
const plaza = (p: Partial<Parameters<typeof proyectarPlazasFijas>[0][0]> = {}) => ({
  diaSemana: 2, horaInicio: '18:00:00', salaId: 'sala-1', tipoClaseId: 'tc-r', vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'ACTIVA' as const, ...p,
});
const una = (...args: Parameters<typeof proyectarPlazasFijas>) => proyectarPlazasFijas(...args)[0];
const sesion = (s: Partial<SesionSlotMin> = {}): SesionSlotMin => ({
  fecha: '2026-09-08', hora: '18:00', salaId: 'sala-1', tipoClaseId: 'tc-r', cancelada: false, ...s,
});

test('próxima ocurrencia: el martes que viene, con la hora sin segundos', () => {
  const v = una([plaza()], HOY);
  assert.equal(v?.proximaFecha, '2026-09-08');
  assert.equal(v?.hora, '18:00');
  assert.equal(v?.sinClase, false);
  assert.equal(nombreDia(v!.diaSemana), 'martes');
});

test('si es hoy y la hora no ha pasado, es hoy; si ya pasó, la semana que viene', () => {
  assert.equal(una([plaza({ diaSemana: 5 })], HOY, '17:00')?.proximaFecha, HOY);
  assert.equal(una([plaza({ diaSemana: 5 })], HOY, '18:30')?.proximaFecha, '2026-09-11');
});

test('BAJA no cuenta; PAUSADA se enseña sin próxima fecha', () => {
  assert.deepEqual(proyectarPlazasFijas([plaza({ estado: 'BAJA' })], HOY), []);
  const pausada = una([plaza({ estado: 'PAUSADA' })], HOY);
  assert.equal(pausada?.estado, 'PAUSADA'); assert.equal(pausada?.proximaFecha, null);
});

test('enseña TODAS sus plazas, lunes primero (antes solo se veía una)', () => {
  const v = proyectarPlazasFijas([
    plaza({ diaSemana: 0, horaInicio: '10:00:00' }),
    plaza({ diaSemana: 3, horaInicio: '09:00:00' }),
    plaza({ diaSemana: 1, horaInicio: '19:00:00', estado: 'PAUSADA' }),
    plaza({ diaSemana: 3, horaInicio: '08:00:00' }),
  ], HOY);
  assert.deepEqual(v.map((p) => `${p.diaSemana} ${p.hora}`), ['1 19:00', '3 08:00', '3 09:00', '0 10:00']);
});

test('vigencia: terminada → no sale; la próxima fecha respeta vigenciaHasta', () => {
  assert.deepEqual(proyectarPlazasFijas([plaza({ vigenciaHasta: '2026-08-31' })], HOY), []);
  assert.equal(una([plaza({ vigenciaHasta: '2026-09-06' })], HOY)?.proximaFecha, null);
});

test('pausa con fechas: la próxima se salta las semanas en pausa y la vista dice hasta cuándo', () => {
  // Hoy viernes 4; los martes 8 y 15 caen en la pausa → próxima el 22.
  const programada = una([plaza({ pausaDesde: '2026-09-07', pausaHasta: '2026-09-20' })], HOY);
  assert.equal(programada?.proximaFecha, '2026-09-22');
  assert.deepEqual(programada?.pausa, { desde: '2026-09-07', hasta: '2026-09-20', enCurso: false });

  const enCurso = una([plaza({ pausaDesde: '2026-09-01', pausaHasta: '2026-09-10' })], HOY);
  assert.equal(enCurso?.pausa?.enCurso, true);
  assert.equal(enCurso?.proximaFecha, '2026-09-15');

  // Terminada: ya no se enseña.
  assert.equal(una([plaza({ pausaDesde: '2026-08-01', pausaHasta: '2026-09-03' })], HOY)?.pausa, null);
  // La pausa llega más allá del fin de la plaza: no queda próxima.
  assert.equal(una([plaza({ pausaDesde: '2026-09-07', pausaHasta: '2026-12-31', vigenciaHasta: '2026-10-31' })], HOY)?.proximaFecha, null);
});

// ── La próxima, del horario publicado ────────────────────────────────────────

test('con horario: la próxima es la primera clase de verdad en su hueco (una cancelada no cuenta)', () => {
  const v = una([plaza()], HOY, '00:00', [
    sesion({ fecha: '2026-09-08', cancelada: true }),
    sesion({ fecha: '2026-09-15' }),
    sesion({ fecha: '2026-09-15', hora: '19:00' }),
  ]);
  assert.equal(v?.proximaFecha, '2026-09-15');
  assert.equal(v?.sinClase, false);
});

test('si el horario publicado llega más allá y en su hueco no hay clase, lo dice en vez de inventar una próxima', () => {
  // Hay horario hasta el 30, pero nada los martes a las 18:00 en su sala y tipo.
  const v = una([plaza()], HOY, '00:00', [
    sesion({ fecha: '2026-09-30', hora: '10:00' }),
    sesion({ fecha: '2026-09-15', tipoClaseId: 'tc-otro' }),
    sesion({ fecha: '2026-09-22', salaId: 'sala-2' }),
  ]);
  assert.equal(v?.proximaFecha, null);
  assert.equal(v?.sinClase, true);
});

test('si el horario publicado no llega a su próxima semana, se cuenta por calendario', () => {
  const v = una([plaza()], HOY, '00:00', [sesion({ fecha: '2026-09-05', hora: '10:00' })]);
  assert.equal(v?.proximaFecha, '2026-09-08');
  assert.equal(v?.sinClase, false);
});

test('una clase de hoy que ya ha empezado no es la próxima', () => {
  const martes = '2026-09-08';
  const v = una([plaza()], martes, '18:30', [sesion({ fecha: martes }), sesion({ fecha: '2026-09-15' })]);
  assert.equal(v?.proximaFecha, '2026-09-15');
});

test('recuperaciones: solo DISPONIBLE y no caducadas; caducidad más cercana primero', () => {
  const r = proyectarRecuperaciones([
    { caducaEl: '2026-09-20', estado: 'DISPONIBLE' },
    { caducaEl: '2026-09-10', estado: 'DISPONIBLE' },
    { caducaEl: '2026-09-01', estado: 'DISPONIBLE' }, // caducada de hecho
    { caducaEl: '2026-09-30', estado: 'USADA' },
  ], HOY);
  // `detalle` es nuevo: las vivas, en el mismo orden, para poder decir de dónde
  // salió cada una. El resumen de arriba no cambia.
  assert.deepEqual(r, {
    disponibles: 2,
    proximaCaducidad: '2026-09-10',
    detalle: [
      { caducaEl: '2026-09-10', deRecompensa: null },
      { caducaEl: '2026-09-20', deRecompensa: null },
    ],
  });
  assert.deepEqual(proyectarRecuperaciones([], HOY), { disponibles: 0, proximaCaducidad: null, detalle: [] });
});

// ── De dónde salió cada recuperación ─────────────────────────────────────────
// ⚠️ El origen NO puede salir de `recuperaciones.motivo`: es texto libre que
// escribe el mostrador, y en producción hay uno que pone literalmente «mm».
// Sale del vínculo `reward_redemptions.recuperacion_id`, que por eso existe.

const CATALOGO = [{ id: 'rwc-1', nombre: 'Clase invitada' }];

test('la recuperación que vino de un canje dice de qué recompensa salió', () => {
  const v = proyectarRecuperaciones(
    [{ id: 'rec-1', caducaEl: '2026-12-01', estado: 'DISPONIBLE' }],
    HOY,
    [{ catalogItemId: 'rwc-1', recuperacionId: 'rec-1' }],
    CATALOGO,
  );
  assert.equal(v.disponibles, 1);
  assert.equal(v.detalle[0].deRecompensa, 'Clase invitada');
});

test('una recuperación normal no se inventa un origen', () => {
  // Cancelar a tiempo o el reparto semanal no son «premios»: decirlo sería
  // contarle algo que no ha pasado.
  const v = proyectarRecuperaciones(
    [{ id: 'rec-2', caducaEl: '2026-12-01', estado: 'DISPONIBLE' }],
    HOY, [], CATALOGO,
  );
  assert.equal(v.detalle[0].deRecompensa, null);
});

test('un canje sin recuperación asociada no marca a ninguna', () => {
  // Una botella no da clases. Si el canje no tiene `recuperacionId`, no puede
  // teñir la recuperación que casualmente esté al lado.
  const v = proyectarRecuperaciones(
    [{ id: 'rec-3', caducaEl: '2026-12-01', estado: 'DISPONIBLE' }],
    HOY,
    [{ catalogItemId: 'rwc-1', recuperacionId: null }],
    CATALOGO,
  );
  assert.equal(v.detalle[0].deRecompensa, null);
});

test('sin id en la recuperación no se adivina el origen', () => {
  // Las que llegan de un payload viejo no traen id. Antes que emparejar a
  // ciegas, no decir nada.
  const v = proyectarRecuperaciones(
    [{ caducaEl: '2026-12-01', estado: 'DISPONIBLE' }],
    HOY,
    [{ catalogItemId: 'rwc-1', recuperacionId: 'rec-1' }],
    CATALOGO,
  );
  assert.equal(v.detalle[0].deRecompensa, null);
});

test('el detalle va de la que antes caduca a la que menos, como el resumen', () => {
  const v = proyectarRecuperaciones([
    { id: 'b', caducaEl: '2026-12-20', estado: 'DISPONIBLE' },
    { id: 'a', caducaEl: '2026-12-01', estado: 'DISPONIBLE' },
  ], HOY, [], CATALOGO);
  assert.deepEqual(v.detalle.map((r) => r.caducaEl), ['2026-12-01', '2026-12-20']);
  assert.equal(v.proximaCaducidad, '2026-12-01');
});
