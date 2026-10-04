import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avisoTopeAutomatico, cuotaParaPlazaFija, cupoAutomatico, motivoNoAutomatica, superaLimiteSemanal } from './plazas-fijas-reglas.ts';
import type { PlanTarifa, Suscripcion } from './types.ts';

const HOY = '2026-09-15';

const plan = (p: Partial<PlanTarifa> & Pick<PlanTarifa, 'id'>): PlanTarifa => ({
  studioId: 'e1', nombre: 'Plan', descripcion: null, precio: 60, tipo: 'MENSUAL', sesiones: null,
  validezDias: null, limiteSemanal: null, activo: true, ...p,
}) as PlanTarifa;

const sus = (p: Partial<Suscripcion> & Pick<Suscripcion, 'planId'>): Suscripcion => ({
  id: `sus-${p.planId}`, studioId: 'e1', socioId: 'soc-1', estado: 'ACTIVA', fechaInicio: '2026-01-01',
  fechaFin: null, sesionesRestantes: null, stripeSubscriptionId: null, ...p,
}) as Suscripcion;

test('una cuota activa y vigente que cubre la clase da derecho a plaza fija', () => {
  const cuota = plan({ id: 'mensual', limiteSemanal: 2 });
  assert.equal(cuotaParaPlazaFija('soc-1', [sus({ planId: 'mensual' })], [cuota], HOY, 'tc-ref')?.id, 'mensual');
});

test('con bono NO: sus reservas de plaza fija nunca descuentan sesiones', () => {
  const bono = plan({ id: 'bono', tipo: 'BONO', sesiones: 10 });
  assert.equal(cuotaParaPlazaFija('soc-1', [sus({ planId: 'bono', sesionesRestantes: 8 })], [bono], HOY, 'tc-ref'), null);
});

test('una cuota vencida, pausada, de otra clienta o que no cubre la clase no cuenta', () => {
  const soloMat = plan({ id: 'mat', tiposClaseIds: ['tc-mat'] });
  const libre = plan({ id: 'libre' });
  assert.equal(cuotaParaPlazaFija('soc-1', [sus({ planId: 'libre', fechaFin: '2026-09-14' })], [libre], HOY, 'tc-ref'), null);
  assert.equal(cuotaParaPlazaFija('soc-1', [sus({ planId: 'libre', estado: 'PAUSADA' })], [libre], HOY, 'tc-ref'), null);
  assert.equal(cuotaParaPlazaFija('soc-1', [sus({ planId: 'libre', socioId: 'soc-2' })], [libre], HOY, 'tc-ref'), null);
  assert.equal(cuotaParaPlazaFija('soc-1', [sus({ planId: 'mat' })], [soloMat], HOY, 'tc-ref'), null);
  // Vence hoy: sigue vigente todo el día.
  assert.equal(cuotaParaPlazaFija('soc-1', [sus({ planId: 'libre', fechaFin: HOY })], [libre], HOY, 'tc-ref')?.id, 'libre');
});

test('con varias cuotas manda la más holgada', () => {
  const dos = plan({ id: 'dos', limiteSemanal: 2 });
  const tres = plan({ id: 'tres', limiteSemanal: 3 });
  const ilimitada = plan({ id: 'ilimitada', limiteSemanal: null });
  const suscripciones = [sus({ planId: 'dos' }), sus({ planId: 'tres' })];
  assert.equal(cuotaParaPlazaFija('soc-1', suscripciones, [dos, tres], HOY, null)?.id, 'tres');
  assert.equal(cuotaParaPlazaFija('soc-1', [...suscripciones, sus({ planId: 'ilimitada' })], [dos, tres, ilimitada], HOY, null)?.id, 'ilimitada');
});

test('superaLimiteSemanal: avisa al pasar del límite, nunca sin límite', () => {
  const dos = plan({ id: 'dos', limiteSemanal: 2 });
  assert.equal(superaLimiteSemanal(dos, 0), null);
  assert.equal(superaLimiteSemanal(dos, 1), null);
  assert.deepEqual(superaLimiteSemanal(dos, 2), { limite: 2 });
  assert.equal(superaLimiteSemanal(plan({ id: 'libre' }), 7), null);
});

// ─── Aprobación automática: el tope de plazas fijas por clase ───────────────

test('el cupo automático es un porcentaje del aforo, redondeado HACIA ABAJO: nunca se pasa del tope que puso el estudio', () => {
  assert.equal(cupoAutomatico(10, 50), 5);
  assert.equal(cupoAutomatico(12, 25), 3);
  assert.equal(cupoAutomatico(8, 100), 8);
  assert.equal(cupoAutomatico(3, 50), 1, '1,5 → 1, no 2');
  assert.equal(cupoAutomatico(9, 25), 2, '2,25 → 2');
});

test('una clase de una plaza al 50 % no admite ninguna automática: decide el estudio', () => {
  assert.equal(cupoAutomatico(1, 50), 0);
  assert.equal(cupoAutomatico(1, 100), 1);
});

test('⚠️ sin dato (aforo o porcentaje que no son un número) no se aprueba solo: el cupo es 0', () => {
  for (const [aforo, pct] of [[null, 50], [undefined, 50], [10, null], [10, undefined], [Number.NaN, 50], [10, Number.NaN], [0, 50], [-4, 50], [10, 0], [10, -5]] as const) {
    assert.equal(cupoAutomatico(aforo, pct), 0, `${aforo}/${pct}`);
  }
});

test('un porcentaje por encima de 100 nunca da más plazas que el aforo', () => {
  assert.equal(cupoAutomatico(10, 250), 10);
});

// ─── Aprobación automática: qué reglas se miran antes de escribir ───────────

const CUMPLE = { modo: 'AUTOMATICA' as const, superaLimite: false, reservaConAprobacion: false, impagoBloqueante: false };

test('con todo en regla, una petición se aprueba sola', () => {
  assert.equal(motivoNoAutomatica(CUMPLE), null);
});

test('⚠️ manual NUNCA se aprueba solo, cumpla lo que cumpla', () => {
  assert.equal(motivoNoAutomatica({ ...CUMPLE, modo: 'MANUAL' }), 'MANUAL');
});

test('⚠️ pasar del límite semanal de su cuota NUNCA se aprueba solo (decisión del fundador, 16-sep)', () => {
  assert.equal(motivoNoAutomatica({ ...CUMPLE, superaLimite: true }), 'SUPERA_LIMITE');
});

test('una clase que exige aprobar cada reserva no se llena de reservas sin pasar por ahí', () => {
  assert.equal(motivoNoAutomatica({ ...CUMPLE, reservaConAprobacion: true }), 'RESERVA_CON_APROBACION');
});

test('un impago que le bloquea reservar tampoco se salta con una plaza fija', () => {
  assert.equal(motivoNoAutomatica({ ...CUMPLE, impagoBloqueante: true }), 'IMPAGO');
});

test('con varios motivos, manda el primero: el límite semanal gana a lo demás', () => {
  assert.equal(motivoNoAutomatica({ ...CUMPLE, superaLimite: true, reservaConAprobacion: true, impagoBloqueante: true }), 'SUPERA_LIMITE');
  assert.equal(motivoNoAutomatica({ ...CUMPLE, reservaConAprobacion: true, impagoBloqueante: true }), 'RESERVA_CON_APROBACION');
});

// ─── Por qué una petición no entra sola: el tope de la clase ───────────────────
// Probado con un estudio de verdad (4-oct-2026): con «se da sola» al 50 % y aforo 8, la 5.ª petición se quedó en el Resumen
// sin ninguna explicación, igual que en un estudio que aprueba a mano, y la propietaria no sabía por qué esa no.

test('avisoTopeAutomatico: con la clase en su tope, dice cuántas tiene, el tope y el porcentaje', () => {
  const t = avisoTopeAutomatico({ modo: 'AUTOMATICA', superaLimite: false, ocupadas: 4, cupo: 4, pct: 50 });
  assert.equal(t, 'Esta clase ya tiene 4 alumnas con clase fija y tu tope para darlas solas es 4 (el 50 % del aforo): esta la decides tú.');
  assert.match(avisoTopeAutomatico({ modo: 'AUTOMATICA', superaLimite: false, ocupadas: 1, cupo: 1, pct: 25 }) ?? '', /1 alumna con clase fija y/);
});

test('avisoTopeAutomatico: nada que explicar si aprueba a mano, si pasa del límite (ya se dice aparte) o si cabe', () => {
  assert.equal(avisoTopeAutomatico({ modo: 'MANUAL', superaLimite: false, ocupadas: 9, cupo: 4, pct: 50 }), null);
  assert.equal(avisoTopeAutomatico({ modo: 'AUTOMATICA', superaLimite: true, ocupadas: 9, cupo: 4, pct: 50 }), null);
  assert.equal(avisoTopeAutomatico({ modo: 'AUTOMATICA', superaLimite: false, ocupadas: 3, cupo: 4, pct: 50 }), null);
});

test('avisoTopeAutomatico: una clase sin aforo (tope 0) se explica sin inventar un porcentaje', () => {
  assert.match(avisoTopeAutomatico({ modo: 'AUTOMATICA', superaLimite: false, ocupadas: 0, cupo: 0, pct: 50 }) ?? '', /no tiene aforo/);
});
