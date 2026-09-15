import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cuotaParaPlazaFija, superaLimiteSemanal } from './plazas-fijas-reglas.ts';
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
