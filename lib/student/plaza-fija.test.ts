import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nombreDia, proyectarPlazaFija, proyectarRecuperaciones } from './plaza-fija.ts';

// 2026-09-04 es viernes (dow 5).
const HOY = '2026-09-04';
const plaza = (p: Partial<Parameters<typeof proyectarPlazaFija>[0][0]> = {}) => ({
  diaSemana: 2, horaInicio: '18:00:00', salaId: 'sala-1', tipoClaseId: 'tc-r', vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'ACTIVA' as const, ...p,
});

test('próxima ocurrencia: el martes que viene, con la hora sin segundos', () => {
  const v = proyectarPlazaFija([plaza()], HOY);
  assert.equal(v?.proximaFecha, '2026-09-08');
  assert.equal(v?.hora, '18:00');
  assert.equal(nombreDia(v!.diaSemana), 'martes');
});

test('si es hoy y la hora no ha pasado, es hoy; si ya pasó, la semana que viene', () => {
  assert.equal(proyectarPlazaFija([plaza({ diaSemana: 5 })], HOY, '17:00')?.proximaFecha, HOY);
  assert.equal(proyectarPlazaFija([plaza({ diaSemana: 5 })], HOY, '18:30')?.proximaFecha, '2026-09-11');
});

test('BAJA no cuenta; PAUSADA se enseña sin próxima fecha; ACTIVA gana a PAUSADA', () => {
  assert.equal(proyectarPlazaFija([plaza({ estado: 'BAJA' })], HOY), null);
  const pausada = proyectarPlazaFija([plaza({ estado: 'PAUSADA' })], HOY);
  assert.equal(pausada?.estado, 'PAUSADA'); assert.equal(pausada?.proximaFecha, null);
  assert.equal(proyectarPlazaFija([plaza({ estado: 'PAUSADA', diaSemana: 1 }), plaza({ diaSemana: 3 })], HOY)?.diaSemana, 3);
});

test('vigencia: terminada → null; la próxima fecha respeta vigenciaHasta', () => {
  assert.equal(proyectarPlazaFija([plaza({ vigenciaHasta: '2026-08-31' })], HOY), null);
  assert.equal(proyectarPlazaFija([plaza({ vigenciaHasta: '2026-09-06' })], HOY)?.proximaFecha, null);
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
