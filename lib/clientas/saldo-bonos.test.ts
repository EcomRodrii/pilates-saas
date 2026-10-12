import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlanTarifa, Suscripcion } from '../types.ts';
import { hoyEnEstudio } from '../utils.ts';
import { saldoSesionesBono } from '../bono-logic.ts';
import { saldoBonosPorSocia } from './saldo-bonos.ts';

// Se corre también con TZ=UTC: el «hoy» no puede depender de la zona del proceso.

const sus = (p: Partial<Suscripcion> & Pick<Suscripcion, 'id' | 'socioId' | 'planId'>): Suscripcion => ({
  studioId: 'e1', estado: 'ACTIVA', fechaInicio: '2026-10-01', fechaFin: null,
  sesionesRestantes: 5, stripeSubscriptionId: null, ...p,
});
const plan = (p: Partial<PlanTarifa> & Pick<PlanTarifa, 'id' | 'tipo'>): PlanTarifa => ({
  studioId: 'e1', nombre: p.id, descripcion: null, precio: 100, sesiones: 10,
  validezDias: null, limiteSemanal: null, activo: true, ...p,
});
const PLANES = [
  plan({ id: 'bono', tipo: 'BONO' }),
  plan({ id: 'suelta', tipo: 'PUNTUAL', sesiones: 1 }),
  plan({ id: 'mensual', tipo: 'MENSUAL', sesiones: null }),
];

test('a las 00:30 de Madrid, un bono que caducó ayer ya no suma (en UTC aún era ayer)', () => {
  // 17-nov-2026, horario de invierno (+01:00): las 23:30 UTC del 16 son las 00:30 del 17.
  const ahora = new Date('2026-11-16T23:30:00Z');
  const hoy = hoyEnEstudio(ahora);
  assert.equal(hoy, '2026-11-17');
  assert.equal(ahora.toISOString().slice(0, 10), '2026-11-16', 'el «hoy» de UTC, el que se usaba');

  const suscripciones = [
    sus({ id: 'caducado', socioId: 'a', planId: 'bono', fechaFin: '2026-11-16', sesionesRestantes: 4 }),
    sus({ id: 'vigente', socioId: 'a', planId: 'bono', fechaFin: '2026-11-17', sesionesRestantes: 2 }),
    sus({ id: 'solo-caducado', socioId: 'b', planId: 'bono', fechaFin: '2026-11-16', sesionesRestantes: 3 }),
  ];
  const saldo = saldoBonosPorSocia(suscripciones, PLANES, hoy);
  assert.equal(saldo.get('a'), 2, 'el que caduca hoy cuenta; el de ayer, no');
  assert.equal(saldo.has('b'), false, 'sin bono vigente no hay «Quedan N»');

  // Con el «hoy» de UTC volvían a contar los dos: el bug.
  const conUtc = saldoBonosPorSocia(suscripciones, PLANES, ahora.toISOString().slice(0, 10));
  assert.equal(conUtc.get('a'), 6);
  assert.equal(conUtc.get('b'), 3);
});

test('en verano la franja es de dos horas: a las 01:30 de Madrid ya es el día siguiente', () => {
  // 16-jul-2026 (+02:00): las 23:30 UTC del 15 son las 01:30 del 16.
  const hoy = hoyEnEstudio(new Date('2026-07-15T23:30:00Z'));
  assert.equal(hoy, '2026-07-16');
  const suscripciones = [sus({ id: 'x', socioId: 'a', planId: 'bono', fechaFin: '2026-07-15' })];
  assert.equal(saldoBonosPorSocia(suscripciones, PLANES, hoy).has('a'), false);
});

test('suma todos los bonos vigentes de cada socia y deja fuera lo que no es saldo', () => {
  const suscripciones = [
    sus({ id: '1', socioId: 'a', planId: 'bono', sesionesRestantes: 3 }),
    sus({ id: '2', socioId: 'a', planId: 'suelta', sesionesRestantes: 1 }),
    sus({ id: '3', socioId: 'a', planId: 'bono', estado: 'PAUSADA', sesionesRestantes: 7 }),
    sus({ id: '4', socioId: 'a', planId: 'bono', sesionesRestantes: null }),
    sus({ id: '5', socioId: 'b', planId: 'mensual', sesionesRestantes: null }),
    sus({ id: '6', socioId: 'c', planId: 'bono', sesionesRestantes: 0 }),
    sus({ id: '7', socioId: 'd', planId: 'plan-borrado', sesionesRestantes: 9 }),
  ];
  const saldo = saldoBonosPorSocia(suscripciones, PLANES, '2026-11-17');
  assert.equal(saldo.get('a'), 4);
  assert.equal(saldo.has('b'), false, 'una cuota no tiene saldo');
  assert.equal(saldo.get('c'), 0, 'agotado pero vigente: le quedan 0, no «sin bono»');
  assert.equal(saldo.has('d'), false);
});

test('da lo mismo que saldoSesionesBono socia a socia', () => {
  const hoy = '2026-11-17';
  const suscripciones = [
    sus({ id: '1', socioId: 'a', planId: 'bono', sesionesRestantes: 3, fechaFin: '2026-11-17' }),
    sus({ id: '2', socioId: 'b', planId: 'bono', sesionesRestantes: 2, fechaFin: '2026-11-16' }),
    sus({ id: '3', socioId: 'a', planId: 'suelta', sesionesRestantes: 1 }),
    sus({ id: '4', socioId: 'c', planId: 'mensual', sesionesRestantes: null }),
    sus({ id: '5', socioId: 'b', planId: 'bono', estado: 'CANCELADA', sesionesRestantes: 8 }),
  ];
  const saldo = saldoBonosPorSocia(suscripciones, PLANES, hoy);
  for (const socioId of ['a', 'b', 'c']) {
    assert.equal(saldo.get(socioId), saldoSesionesBono(socioId, suscripciones, PLANES, hoy)?.restantes, socioId);
  }
});
