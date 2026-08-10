import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularEstadoSuscripcion, textoCaducidad } from './suscripcion-estado.ts';
import type { PlanTarifa, Suscripcion } from './types.ts';

const plan = (o: Partial<PlanTarifa> & { id: string }): PlanTarifa => ({
  studioId: 's', nombre: 'Bono 10', descripcion: null, precio: 175, tipo: 'BONO', sesiones: 10, activo: true, ...o,
} as PlanTarifa);

const sus = (o: Partial<Suscripcion> = {}): Suscripcion => ({
  id: 'sus-1', studioId: 's', socioId: 'soc-1', planId: 'p1', estado: 'ACTIVA',
  fechaInicio: '2026-07-01', fechaFin: null, sesionesRestantes: null, stripeSubscriptionId: null, ...o,
} as Suscripcion);

const HOY = '2026-08-10';

test('sin suscripción o sin plan resuelto → sin_plan', () => {
  assert.equal(calcularEstadoSuscripcion(null, plan({ id: 'p1' }), HOY).kind, 'sin_plan');
  assert.equal(calcularEstadoSuscripcion(sus(), null, HOY).kind, 'sin_plan');
});

test('PAUSADA/CANCELADA/EXPIRADA no calculan countdown de caducidad', () => {
  assert.deepEqual(calcularEstadoSuscripcion(sus({ estado: 'PAUSADA' }), plan({ id: 'p1' }), HOY), { kind: 'pausada' });
  assert.deepEqual(calcularEstadoSuscripcion(sus({ estado: 'CANCELADA' }), plan({ id: 'p1' }), HOY), { kind: 'cancelada' });
  assert.deepEqual(calcularEstadoSuscripcion(sus({ estado: 'EXPIRADA' }), plan({ id: 'p1' }), HOY), { kind: 'expirada' });
});

test('un bono manual (sin stripeSubscriptionId) cuenta clases restantes y días a caducar', () => {
  const e = calcularEstadoSuscripcion(
    sus({ sesionesRestantes: 7, fechaFin: '2026-08-28' }),
    plan({ id: 'p1', sesiones: 10 }),
    HOY,
  );
  assert.deepEqual(e, { kind: 'bono', restantes: 7, total: 10, diasCaduca: 18, caducado: false, urgente: false });
  assert.equal(textoCaducidad(e), 'Caduca en 18 días');
});

test('bono con ≤3 días o ≤2 clases se marca urgente', () => {
  const porDias = calcularEstadoSuscripcion(sus({ sesionesRestantes: 8, fechaFin: '2026-08-12' }), plan({ id: 'p1' }), HOY);
  assert.equal(porDias.kind === 'bono' && porDias.urgente, true);

  const porSesiones = calcularEstadoSuscripcion(sus({ sesionesRestantes: 1 }), plan({ id: 'p1' }), HOY);
  assert.equal(porSesiones.kind === 'bono' && porSesiones.urgente, true);
});

test('bono caducado (fechaFin en el pasado) lo dice en negativo, no como "urgente que llega"', () => {
  const e = calcularEstadoSuscripcion(sus({ sesionesRestantes: 3, fechaFin: '2026-08-08' }), plan({ id: 'p1' }), HOY);
  assert.equal(e.kind === 'bono' && e.caducado, true);
  assert.equal(textoCaducidad(e), 'Caducado hace 2 días');
});

test('caduca hoy y caduca en 1 día usan singular/plural correctos', () => {
  const hoy = calcularEstadoSuscripcion(sus({ sesionesRestantes: 3, fechaFin: HOY }), plan({ id: 'p1' }), HOY);
  assert.equal(textoCaducidad(hoy), 'Caduca hoy');

  const manana = calcularEstadoSuscripcion(sus({ sesionesRestantes: 3, fechaFin: '2026-08-11' }), plan({ id: 'p1' }), HOY);
  assert.equal(textoCaducidad(manana), 'Caduca en 1 día');
});

test('bono sin fecha_fin no tiene countdown que mostrar', () => {
  const e = calcularEstadoSuscripcion(sus({ sesionesRestantes: 5 }), plan({ id: 'p1' }), HOY);
  assert.equal(e.kind === 'bono' && e.diasCaduca, null);
  assert.equal(textoCaducidad(e), null);
});

test('un plan MENSUAL es recurrente: fecha_fin es la PRÓXIMA renovación, no una caducidad', () => {
  const e = calcularEstadoSuscripcion(
    sus({ stripeSubscriptionId: 'sub_123', fechaFin: '2026-08-16', sesionesRestantes: null }),
    plan({ id: 'p1', tipo: 'MENSUAL', sesiones: null }),
    HOY,
  );
  assert.deepEqual(e, { kind: 'recurrente', diasRenueva: 6, urgente: false });
  assert.equal(textoCaducidad(e), 'Próxima renovación en 6 días');
});

test('un MENSUAL renovado a mano (sin stripeSubscriptionId) sigue siendo "recurrente", no "bono" — el discriminador es plan.tipo, igual que renovacion-server.ts', () => {
  const e = calcularEstadoSuscripcion(
    sus({ stripeSubscriptionId: null, fechaFin: '2026-08-16', sesionesRestantes: null }),
    plan({ id: 'p1', tipo: 'MENSUAL', sesiones: null }),
    HOY,
  );
  assert.equal(e.kind, 'recurrente');
});

test('renovación a ≤3 días se marca urgente', () => {
  const e = calcularEstadoSuscripcion(
    sus({ stripeSubscriptionId: 'sub_123', fechaFin: '2026-08-12' }),
    plan({ id: 'p1', tipo: 'MENSUAL' }),
    HOY,
  );
  assert.equal(e.kind === 'recurrente' && e.urgente, true);
});
