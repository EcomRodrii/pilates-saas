import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bookingCountUsc, cancelacionTardiaUsc, cuerpoEventoUsc, duracionUsc, fechaHoraLocal, huellaDe, huellaFijaDe,
  nombreTrainerUsc, planificarHorarioUsc, plazasPublicadas,
  type ConfigUsc, type EventoUscGuardado, type SesionParaUsc,
} from './horario.ts';

const AHORA = Date.parse('2026-10-05T08:00:00Z');
const CFG: ConfigUsc = {
  providerId: '2bf3717c-348d-4e41-a2db-d32c35ae294c',
  locationId: 'b4302549-7d29-4d3e-9605-79ff8867f9d9',
  categoriaId: 4,
};

function sesion(p: Partial<SesionParaUsc> = {}): SesionParaUsc {
  return {
    id: 'ses-1', inicio: '2026-10-06T16:00:00Z', fin: '2026-10-06T16:55:00Z', cancelada: false, aforo: 10,
    nombre: 'Reformer', descripcion: null, instructorId: 'ins-1', cancelacionHoras: 24, cupo: 3,
    ocupadasFueraDeUsc: 0, ...p,
  };
}

function guardado(s: SesionParaUsc, p: Partial<EventoUscGuardado> = {}): EventoUscGuardado {
  const c = cuerpoEventoUsc(s, CFG, 'tr-1');
  return {
    sesionId: s.id, eventoId: 'ev-1', cancelado: false, huellaFija: huellaFijaDe(c), huella: huellaDe(c),
    ocupadasEnviadas: bookingCountUsc(s.ocupadasFueraDeUsc, plazasPublicadas(s.cupo, s.aforo), s.aforo), ...p,
  };
}

const TRAINERS = new Map([['ins-1', 'tr-1']]);
const plan = (sesiones: SesionParaUsc[], eventos: EventoUscGuardado[] = [], extra: { noAntesDe?: number } = {}) =>
  planificarHorarioUsc({ sesiones, eventos, config: CFG, trainerPorInstructora: TRAINERS, ahora: AHORA, ...extra });

test('fecha y hora van en hora LOCAL del estudio, también al cruzar el cambio de hora', () => {
  assert.deepEqual(fechaHoraLocal('2026-10-06T16:00:00Z'), { fecha: '2026-10-06', hora: '18:00' }); // CEST
  assert.deepEqual(fechaHoraLocal('2026-11-03T16:00:00Z'), { fecha: '2026-11-03', hora: '17:00' }); // CET
  assert.deepEqual(fechaHoraLocal('2026-10-06T22:30:00Z'), { fecha: '2026-10-07', hora: '00:30' }); // cambia de día
});

test('duración y plazo de cancelación tardía en el formato y los límites de USC', () => {
  assert.equal(duracionUsc('2026-10-06T16:00:00Z', '2026-10-06T16:55:00Z'), '00:55');
  assert.equal(duracionUsc('2026-10-06T16:00:00Z', '2026-10-06T17:30:00Z'), '01:30');
  assert.equal(cancelacionTardiaUsc(24), '12:00:00'); // USC no admite más de 12 h
  assert.equal(cancelacionTardiaUsc(null), '00:00:00');
  assert.equal(cancelacionTardiaUsc(3), '03:00:00');
});

test('se publica lo cedido, nunca más que el aforo', () => {
  assert.equal(plazasPublicadas(null, 10), 0);
  assert.equal(plazasPublicadas(3, 10), 3);
  assert.equal(plazasPublicadas(15, 10), 10);
});

test('el recuento que se manda hace que USC nunca enseñe más huecos de los que hay', () => {
  // aforo 10, cede 3. Lo que USC ve libre = publicadas - recuento (- sus reservas).
  for (let fuera = 0; fuera <= 10; fuera++) {
    const publicadas = 3;
    const libresUsc = publicadas - bookingCountUsc(fuera, publicadas, 10);
    const libresReal = 10 - fuera;
    assert.equal(libresUsc, Math.min(3, libresReal), `con ${fuera} de fuera`);
  }
  // Cede todo el aforo: el recuento es la ocupación de fuera, tal cual.
  assert.equal(bookingCountUsc(4, 10, 10), 4);
});

test('una clase con plazas cedidas y sin evento se crea, con su trainer y en hora local', () => {
  const [op, ...resto] = plan([sesion()]);
  assert.equal(resto.length, 0);
  assert.equal(op.tipo, 'crear');
  if (op.tipo !== 'crear') return;
  assert.equal(op.cuerpo.startDate, '2026-10-06');
  assert.equal(op.cuerpo.startTime, '18:00');
  assert.equal(op.cuerpo.seats, 3);
  assert.deepEqual(op.cuerpo.trainerIds, ['tr-1']);
  assert.deepEqual(op.cuerpo.description, { es: 'Reformer' });
  assert.equal(op.cuerpo.lateCancellationDeadline, '12:00:00');
  assert.match(op.claveIdempotencia, /^ses-1:/);
});

test('sin plazas cedidas, cancelada, empezada o a más de dos semanas: no se crea', () => {
  assert.deepEqual(plan([sesion({ cupo: null })]), []);
  assert.deepEqual(plan([sesion({ cupo: 0 })]), []);
  assert.deepEqual(plan([sesion({ cancelada: true })]), []);
  assert.deepEqual(plan([sesion({ inicio: '2026-10-05T07:00:00Z', fin: '2026-10-05T08:00:00Z' })]), []);
  assert.deepEqual(plan([sesion({ inicio: '2026-10-25T16:00:00Z', fin: '2026-10-25T17:00:00Z' })]), []);
});

test('antes de la fecha de alta en USC no se crea nada', () => {
  assert.deepEqual(plan([sesion()], [], { noAntesDe: Date.parse('2026-10-10T00:00:00Z') }), []);
});

test('lo que ya está igual allí no genera ninguna llamada', () => {
  const s = sesion({ ocupadasFueraDeUsc: 8 });
  assert.deepEqual(plan([s], [guardado(s)]), []);
});

test('cambia el nombre o las plazas: se edita, sin tocar inicio ni ubicación', () => {
  const s = sesion();
  const ops = plan([sesion({ cupo: 5 })], [guardado(s)]);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].tipo, 'editar');
  if (ops[0].tipo !== 'editar') return;
  assert.equal(ops[0].cambios.seats, 5);
  assert.equal('startDate' in ops[0].cambios, false);
  assert.equal('locationId' in ops[0].cambios, false);
});

test('se mueve la clase de hora: cancelar y crear otro (USC no deja editar el inicio)', () => {
  const s = sesion();
  const ops = plan([sesion({ inicio: '2026-10-06T17:00:00Z', fin: '2026-10-06T17:55:00Z' })], [guardado(s)]);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].tipo, 'recrear');
  if (ops[0].tipo === 'recrear') assert.equal(ops[0].eventoAnterior, 'ev-1');
});

test('entra gente de fuera de USC: solo se manda el recuento nuevo', () => {
  const s = sesion();
  const ops = plan([sesion({ ocupadasFueraDeUsc: 9 })], [guardado(s)]);
  assert.deepEqual(ops, [{ tipo: 'ocupacion', sesionId: 'ses-1', eventoId: 'ev-1', bookingCount: 2 }]);
});

test('se cancela la clase o se dejan de ceder plazas: se cancela allí', () => {
  const s = sesion();
  assert.deepEqual(plan([sesion({ cancelada: true })], [guardado(s)]), [{ tipo: 'cancelar', sesionId: 'ses-1', eventoId: 'ev-1' }]);
  assert.deepEqual(plan([sesion({ cupo: 0 })], [guardado(s)]), [{ tipo: 'cancelar', sesionId: 'ses-1', eventoId: 'ev-1' }]);
});

test('sesión borrada en Tentare (o sin sesión): su evento vivo se cancela allí', () => {
  const s = sesion();
  assert.deepEqual(plan([], [guardado(s)]), [{ tipo: 'cancelar', sesionId: 'ses-1', eventoId: 'ev-1' }]);
  assert.deepEqual(plan([], [guardado(s, { sesionId: null })]), [{ tipo: 'cancelar', sesionId: null, eventoId: 'ev-1' }]);
});

test('una clase ya empezada con evento vivo no se toca', () => {
  const s = sesion({ inicio: '2026-10-05T07:30:00Z', fin: '2026-10-05T08:30:00Z' });
  assert.deepEqual(plan([s], [guardado(s)]), []);
});

test('un evento cancelado allí se vuelve a crear si la clase sigue publicándose', () => {
  const s = sesion();
  assert.equal(plan([s], [guardado(s, { cancelado: true })])[0].tipo, 'crear');
});

test('primero se cancela, lo último se crea (si la pasada se corta, no queda nada fantasma allí)', () => {
  const viva = sesion({ id: 'ses-a', inicio: '2026-10-06T10:00:00Z', fin: '2026-10-06T11:00:00Z' });
  const nueva = sesion({ id: 'ses-b', inicio: '2026-10-06T09:00:00Z', fin: '2026-10-06T10:00:00Z' });
  const ops = plan([{ ...viva, cancelada: true }, nueva], [guardado(viva, { eventoId: 'ev-a' })]);
  assert.deepEqual(ops.map(o => o.tipo), ['cancelar', 'crear']);
});

test('el nombre de la instructora se parte como lo pide USC', () => {
  assert.deepEqual(nombreTrainerUsc('Ana'), { firstName: 'Ana' });
  assert.deepEqual(nombreTrainerUsc('  Ana  María López '), { firstName: 'Ana', lastName: 'María López' });
  assert.deepEqual(nombreTrainerUsc('   '), { firstName: 'Instructora' });
});

test('un estudio va por API solo con providerId y locationId válidos; si no, sigue en manual', async () => {
  const { configUscDe } = await import('./horario.ts');
  assert.equal(configUscDe({ modo: 'manual' }), null);
  assert.equal(configUscDe({ providerId: CFG.providerId }), null);
  assert.equal(configUscDe({ providerId: 'x', locationId: CFG.locationId }), null);
  assert.deepEqual(configUscDe({ providerId: CFG.providerId.toUpperCase(), locationId: ` ${CFG.locationId} ` }), CFG);
  assert.equal(configUscDe({ ...CFG, categoriaId: '6' })?.categoriaId, 6);
});

test('volver a manual conserva los IDs pero deja de publicar', async () => {
  const { uscPublicaPorApi } = await import('./horario.ts');
  assert.equal(uscPublicaPorApi({ ...CFG, modo: 'api' }), true);
  assert.equal(uscPublicaPorApi({ ...CFG }), true);
  assert.equal(uscPublicaPorApi({ ...CFG, modo: 'manual' }), false);
  assert.equal(uscPublicaPorApi({ modo: 'manual' }), false);
});
