// Tests de la lógica de consumo de bono. Runner nativo de Node: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Suscripcion, PlanTarifa } from '@/lib/types';
import {
  hayAlgoQueContratar,
  bonoConsumible, calcularConsumoBono, calcularDevolucionBono, tieneEntitlementActivo,
  calcularFechaFinBono, superaLimiteSemanal, nuevaFechaFinTrasCongelar, planCubreTipoClase,
  seArreglaComprando, ERROR_SIN_PLAN, ERROR_BONO_NO_CUBRE, calcularReactivacion,
} from './bono-logic.ts';

// ── Fixtures ─────────────────────────────────────────────────────────────────
function sus(p: Partial<Suscripcion> & Pick<Suscripcion, 'socioId' | 'planId'>): Suscripcion {
  return {
    id: 'sus-1', studioId: 'e1', estado: 'ACTIVA',
    fechaInicio: '2026-01-01', fechaFin: null, sesionesRestantes: 5, stripeSubscriptionId: null, ...p,
  };
}
function plan(p: Partial<PlanTarifa> & Pick<PlanTarifa, 'id' | 'tipo'>): PlanTarifa {
  return { studioId: 'e1', nombre: 'Bono 10', descripcion: null, precio: 100, sesiones: 10, validezDias: null, limiteSemanal: null, activo: true, ...p };
}

// ── bonoConsumible ───────────────────────────────────────────────────────────
test('bonoConsumible devuelve la suscripción de un plan BONO activo', () => {
  const suscripciones = [sus({ socioId: 'a', planId: 'p1', sesionesRestantes: 3 })];
  const planes = [plan({ id: 'p1', tipo: 'BONO' })];
  const r = bonoConsumible('a', suscripciones, planes);
  assert.equal(r?.sesionesRestantes, 3);
  assert.equal(r?.plan.id, 'p1');
});

test('bonoConsumible null si no hay suscripción activa', () => {
  const suscripciones = [sus({ socioId: 'a', planId: 'p1', estado: 'CANCELADA' })];
  assert.equal(bonoConsumible('a', suscripciones, [plan({ id: 'p1', tipo: 'BONO' })]), null);
});

test('bonoConsumible null si el plan es MENSUAL (no de sesiones)', () => {
  const suscripciones = [sus({ socioId: 'a', planId: 'p1' })];
  assert.equal(bonoConsumible('a', suscripciones, [plan({ id: 'p1', tipo: 'MENSUAL' })]), null);
});

test('bonoConsumible null si sesionesRestantes es null (saldo no gestionado por sesiones)', () => {
  const suscripciones = [sus({ socioId: 'a', planId: 'p1', sesionesRestantes: null })];
  assert.equal(bonoConsumible('a', suscripciones, [plan({ id: 'p1', tipo: 'BONO' })]), null);
});

test('bonoConsumible acepta plan PUNTUAL', () => {
  const suscripciones = [sus({ socioId: 'a', planId: 'p1', sesionesRestantes: 1 })];
  assert.ok(bonoConsumible('a', suscripciones, [plan({ id: 'p1', tipo: 'PUNTUAL' })]));
});

test('bonoConsumible ignora un bono ACTIVA pero caducado (fechaFin < hoy)', () => {
  const suscripciones = [sus({ socioId: 'a', planId: 'p1', fechaFin: '2026-07-01' })];
  assert.equal(bonoConsumible('a', suscripciones, [plan({ id: 'p1', tipo: 'BONO' })], '2026-07-25'), null);
});

test('bonoConsumible con varias activas elige la que caduca antes (determinista)', () => {
  const suscripciones = [
    sus({ id: 'sus-Y', socioId: 'a', planId: 'p1', fechaFin: '2026-12-31' }),
    sus({ id: 'sus-X', socioId: 'a', planId: 'p1', fechaFin: '2026-08-01' }),
  ];
  const r = bonoConsumible('a', suscripciones, [plan({ id: 'p1', tipo: 'BONO' })], '2026-07-25');
  assert.equal(r?.suscripcion.id, 'sus-X'); // la que caduca antes, no el orden de la lista
});

// ── calcularConsumoBono ──────────────────────────────────────────────────────
test('calcularConsumoBono descuenta una sesión', () => {
  assert.deepEqual(calcularConsumoBono(3), { nuevasRestantes: 2, agotado: false });
});

test('calcularConsumoBono marca agotado al llegar a 0', () => {
  assert.deepEqual(calcularConsumoBono(1), { nuevasRestantes: 0, agotado: true });
});

test('calcularConsumoBono nunca baja de 0', () => {
  assert.deepEqual(calcularConsumoBono(0), { nuevasRestantes: 0, agotado: true });
});

// ── calcularDevolucionBono ───────────────────────────────────────────────────
test('calcularDevolucionBono suma una sesión', () => {
  assert.equal(calcularDevolucionBono(2, 10), 3);
});

test('calcularDevolucionBono no supera el total del plan', () => {
  assert.equal(calcularDevolucionBono(10, 10), 10);
});

test('calcularDevolucionBono sin tope de plan (sesiones null) suma sin límite', () => {
  assert.equal(calcularDevolucionBono(99, null), 100);
});

// ── tieneEntitlementActivo (C-4) ──────────────────────────────────────────────
const HOY = '2026-07-10';

test('tieneEntitlementActivo: bono ACTIVO con sesiones restantes → true', () => {
  const s = [sus({ socioId: 'a', planId: 'p1', sesionesRestantes: 3 })];
  assert.equal(tieneEntitlementActivo('a', s, [plan({ id: 'p1', tipo: 'BONO' })], HOY), true);
});

test('tieneEntitlementActivo: bono ACTIVO sin sesiones (0) → false', () => {
  const s = [sus({ socioId: 'a', planId: 'p1', sesionesRestantes: 0 })];
  assert.equal(tieneEntitlementActivo('a', s, [plan({ id: 'p1', tipo: 'BONO' })], HOY), false);
});

test('tieneEntitlementActivo: mensual vigente (fin futuro) → true', () => {
  const s = [sus({ socioId: 'a', planId: 'p1', fechaFin: '2026-08-01', sesionesRestantes: null })];
  assert.equal(tieneEntitlementActivo('a', s, [plan({ id: 'p1', tipo: 'MENSUAL' })], HOY), true);
});

test('tieneEntitlementActivo: mensual sin fecha fin → true', () => {
  const s = [sus({ socioId: 'a', planId: 'p1', fechaFin: null, sesionesRestantes: null })];
  assert.equal(tieneEntitlementActivo('a', s, [plan({ id: 'p1', tipo: 'MENSUAL' })], HOY), true);
});

test('tieneEntitlementActivo: mensual caducado (fin pasado) → false', () => {
  const s = [sus({ socioId: 'a', planId: 'p1', fechaFin: '2026-07-01', sesionesRestantes: null })];
  assert.equal(tieneEntitlementActivo('a', s, [plan({ id: 'p1', tipo: 'MENSUAL' })], HOY), false);
});

test('tieneEntitlementActivo: suscripción no ACTIVA → false', () => {
  const s = [sus({ socioId: 'a', planId: 'p1', estado: 'PAUSADA', sesionesRestantes: 5 })];
  assert.equal(tieneEntitlementActivo('a', s, [plan({ id: 'p1', tipo: 'BONO' })], HOY), false);
});

test('tieneEntitlementActivo: sin suscripción → false', () => {
  assert.equal(tieneEntitlementActivo('a', [], [], HOY), false);
});

test('tieneEntitlementActivo: cuenta solo la suscripción de la socia indicada', () => {
  const s = [sus({ socioId: 'otra', planId: 'p1', sesionesRestantes: 5 })];
  assert.equal(tieneEntitlementActivo('a', s, [plan({ id: 'p1', tipo: 'BONO' })], HOY), false);
});

// ── F2: caducidad del bono (fecha_fin) ────────────────────────────────────────
test('tieneEntitlementActivo: bono con saldo pero CADUCADO (fecha_fin pasada) → false', () => {
  const s = [sus({ socioId: 'a', planId: 'p1', sesionesRestantes: 5, fechaFin: '2026-07-01' })];
  assert.equal(tieneEntitlementActivo('a', s, [plan({ id: 'p1', tipo: 'BONO' })], HOY), false);
});

test('tieneEntitlementActivo: bono con saldo y fecha_fin futura → true', () => {
  const s = [sus({ socioId: 'a', planId: 'p1', sesionesRestantes: 5, fechaFin: '2026-08-01' })];
  assert.equal(tieneEntitlementActivo('a', s, [plan({ id: 'p1', tipo: 'BONO' })], HOY), true);
});

test('tieneEntitlementActivo: bono sin fecha_fin (legado, null) sigue valiendo → true', () => {
  const s = [sus({ socioId: 'a', planId: 'p1', sesionesRestantes: 5, fechaFin: null })];
  assert.equal(tieneEntitlementActivo('a', s, [plan({ id: 'p1', tipo: 'BONO' })], HOY), true);
});

// ── calcularFechaFinBono ──────────────────────────────────────────────────────
test('calcularFechaFinBono: validez null → null (sin caducidad)', () => {
  assert.equal(calcularFechaFinBono('2026-07-01', null), null);
});

test('calcularFechaFinBono: suma los días de validez a la fecha de compra', () => {
  assert.equal(calcularFechaFinBono('2026-07-01', 60), '2026-08-30');
});

test('calcularFechaFinBono: acepta timestamp ISO y usa solo la fecha', () => {
  assert.equal(calcularFechaFinBono('2026-07-01T18:30:00.000Z', 30), '2026-07-31');
});

// ── superaLimiteSemanal ───────────────────────────────────────────────────────
test('superaLimiteSemanal: sin tope (null) nunca supera', () => {
  assert.equal(superaLimiteSemanal(10, null), false);
});

test('superaLimiteSemanal: por debajo del tope → false', () => {
  assert.equal(superaLimiteSemanal(1, 2), false);
});

test('superaLimiteSemanal: en el tope o por encima → true', () => {
  assert.equal(superaLimiteSemanal(2, 2), true);
  assert.equal(superaLimiteSemanal(3, 2), true);
});

// ── nuevaFechaFinTrasCongelar ─────────────────────────────────────────────────
test('nuevaFechaFinTrasCongelar: sin caducidad (null) sigue null', () => {
  assert.equal(nuevaFechaFinTrasCongelar(null, '2026-07-01', '2026-07-15'), null);
});

test('nuevaFechaFinTrasCongelar: empuja fecha_fin por los días congelados', () => {
  assert.equal(nuevaFechaFinTrasCongelar('2026-08-30', '2026-07-01', '2026-07-15'), '2026-09-13');
});

// ── Bonos acotados a tipos de clase (0111) ───────────────────────────────────
// "El reformer me cuesta el doble de producir que el mat, y no puedo hacer un
// Bono 10 Reformer que no sirva para Mat — esto me obliga a cobrar mal."

test('un plan sin tipos asignados cubre todas las clases (como siempre)', () => {
  const p = plan({ id: 'p1', tipo: 'BONO' });
  assert.equal(planCubreTipoClase(p, 'tc-reformer'), true);
  assert.equal(planCubreTipoClase(p, 'tc-mat'), true);
  assert.equal(planCubreTipoClase({ ...p, tiposClaseIds: [] }, 'tc-mat'), true);
});

test('un plan acotado cubre los suyos y NO los demás', () => {
  const p = plan({ id: 'p1', tipo: 'BONO', tiposClaseIds: ['tc-ref-ini', 'tc-ref-int'] });
  assert.equal(planCubreTipoClase(p, 'tc-ref-ini'), true);
  assert.equal(planCubreTipoClase(p, 'tc-ref-int'), true, 'un bono de reformer cubre sus niveles');
  assert.equal(planCubreTipoClase(p, 'tc-mat'), false);
});

test('sin clase concreta delante no se descarta la cobertura', () => {
  // "¿Tiene bono?" sin una sesión en la mano: no se puede responder que no.
  const p = plan({ id: 'p1', tipo: 'BONO', tiposClaseIds: ['tc-reformer'] });
  assert.equal(planCubreTipoClase(p, undefined), true);
  assert.equal(planCubreTipoClase(p, null), true);
});

test('un bono de Reformer no da derecho a reservar Mat', () => {
  const suscripciones = [sus({ socioId: 'a', planId: 'p1', sesionesRestantes: 5 })];
  const planes = [plan({ id: 'p1', tipo: 'BONO', tiposClaseIds: ['tc-reformer'] })];
  assert.equal(tieneEntitlementActivo('a', suscripciones, planes, '2026-07-26', 'tc-reformer'), true);
  assert.equal(tieneEntitlementActivo('a', suscripciones, planes, '2026-07-26', 'tc-mat'), false);
  // Sin tipo, el comportamiento de siempre.
  assert.equal(tieneEntitlementActivo('a', suscripciones, planes, '2026-07-26'), true);
});

test('con dos bonos a la vez se descuenta el que CUBRE la clase, no el que caduca antes', () => {
  // El bug silencioso: bonoConsumible ordena por fechaFin. Con un bono de Mat
  // que caduca antes, reservar un Reformer le habría quitado una sesión de Mat.
  const suscripciones = [
    sus({ id: 'sus-mat', socioId: 'a', planId: 'p-mat', sesionesRestantes: 5, fechaFin: '2026-08-01' }),
    sus({ id: 'sus-ref', socioId: 'a', planId: 'p-ref', sesionesRestantes: 5, fechaFin: '2026-12-01' }),
  ];
  const planes = [
    plan({ id: 'p-mat', tipo: 'BONO', tiposClaseIds: ['tc-mat'] }),
    plan({ id: 'p-ref', tipo: 'BONO', tiposClaseIds: ['tc-reformer'] }),
  ];
  assert.equal(bonoConsumible('a', suscripciones, planes, '2026-07-26', 'tc-reformer')?.suscripcion.id, 'sus-ref');
  assert.equal(bonoConsumible('a', suscripciones, planes, '2026-07-26', 'tc-mat')?.suscripcion.id, 'sus-mat');
  // Sin bono que cubra esa clase, no se descuenta nada de nada.
  assert.equal(bonoConsumible('a', suscripciones, planes, '2026-07-26', 'tc-prenatal'), null);
});

test('el desempate por caducidad sigue mandando entre bonos que SÍ cubren', () => {
  const suscripciones = [
    sus({ id: 'sus-b', socioId: 'a', planId: 'p1', sesionesRestantes: 5, fechaFin: '2026-12-01' }),
    sus({ id: 'sus-a', socioId: 'a', planId: 'p1', sesionesRestantes: 5, fechaFin: '2026-08-01' }),
  ];
  const planes = [plan({ id: 'p1', tipo: 'BONO', tiposClaseIds: ['tc-reformer'] })];
  assert.equal(bonoConsumible('a', suscripciones, planes, '2026-07-26', 'tc-reformer')?.suscripcion.id, 'sus-a');
});

// ── Exigir un plan que no se puede comprar ──────────────────────────────────
// Desde la 0114 el ajuste «exigir plan» viene activado de fábrica. Un estudio
// recién creado lo tiene activado y aún no ha creado ningún plan: su primera
// clienta vería "necesitas un plan o bono activo" y, al ir a contratarlo, nada
// que comprar. Medido en prod: 13 de los 15 estudios estaban justo así.

test('sin ningún plan a la venta, exigir plan no tiene sentido', () => {
  assert.equal(hayAlgoQueContratar([]), false);
});

test('con planes pero todos desactivados, tampoco', () => {
  // Desactivar todos los planes es la forma de "cerrar la tienda": el gate no
  // puede seguir pidiendo algo que ya no se vende.
  assert.equal(hayAlgoQueContratar([{ activo: false }, { activo: false }]), false);
});

test('basta UN plan activo para que el gate vuelva a tener sentido', () => {
  assert.equal(hayAlgoQueContratar([{ activo: false }, { activo: true }]), true);
});

// ── El eslabón que faltaba entre "no puedes reservar" y "compra un bono" ─────
// El portal ya tenía tienda (/compras) y la pantalla de Bonos ya invitaba a ir
// a ella. Pero al intentar reservar sin plan, la hoja mostraba el error como
// texto plano y ahí se acababa: la socia tenía que deducir sola que existía una
// pestaña «Bonos» con un botón dentro. Reportado desde un estudio real.

test('sin plan: el error ofrece comprar', () => {
  assert.equal(seArreglaComprando(ERROR_SIN_PLAN), true);
});

test('bono que no cubre este tipo de clase: también se arregla comprando', () => {
  // Puede pagar la clase suelta, que se vende en la misma pantalla.
  assert.equal(seArreglaComprando(ERROR_BONO_NO_CUBRE), true);
});

test('la coletilla de la página pública no rompe el reconocimiento', () => {
  // /reservar/[slug] añade «Contrata uno en la pestaña "El estudio"» al mismo
  // mensaje. Por eso se compara con `includes` y no con igualdad.
  assert.equal(
    seArreglaComprando(`${ERROR_SIN_PLAN}. Contrata uno en la pestaña "El estudio".`),
    true,
  );
});

test('un fallo que NO se arregla comprando no ofrece la tienda', () => {
  // Mandar a comprar a quien ya tiene bono y lo que pasa es que la clase está
  // llena, o que ha llegado a su tope de reservas, es ruido —y encima sugiere
  // que le van a cobrar por algo que ya pagó.
  assert.equal(seArreglaComprando('La clase está completa.'), false);
  assert.equal(seArreglaComprando('Has alcanzado el máximo de 3 reservas activas. Cancela una para reservar otra.'), false);
  assert.equal(seArreglaComprando('No se ha podido confirmar la reserva.'), false);
  assert.equal(seArreglaComprando(''), false);
});

// ── calcularReactivacion (Hallazgo B, auditoría dunning 2026-08-10) ──────────
test('calcularReactivacion: MENSUAL → próximo ciclo a un mes vista, sin sesiones', () => {
  const r = calcularReactivacion(plan({ id: 'p1', tipo: 'MENSUAL', sesiones: null, validezDias: null }), '2026-01-15');
  assert.equal(r.fechaFin, '2026-02-15');
  assert.equal(r.sesionesRestantes, null);
});

test('calcularReactivacion: BONO → recalcula fecha_fin desde HOY (nunca la vieja) y rellena sesiones', () => {
  const r = calcularReactivacion(plan({ id: 'p1', tipo: 'BONO', sesiones: 10, validezDias: 60 }), '2026-01-15');
  assert.equal(r.fechaFin, '2026-03-16'); // 15 ene + 60 días
  assert.equal(r.sesionesRestantes, 10, 'siempre a tope, igual que un alta nueva — no solo cuando estaba a 0');
});

test('calcularReactivacion: BONO sin validez → sin caducidad, igual que un alta nueva', () => {
  const r = calcularReactivacion(plan({ id: 'p1', tipo: 'BONO', sesiones: 5, validezDias: null }), '2026-01-15');
  assert.equal(r.fechaFin, null);
  assert.equal(r.sesionesRestantes, 5);
});

test('calcularReactivacion: PUNTUAL se comporta como BONO (misma rama)', () => {
  const r = calcularReactivacion(plan({ id: 'p1', tipo: 'PUNTUAL', sesiones: 1, validezDias: 30 }), '2026-01-15');
  assert.equal(r.fechaFin, '2026-02-14');
  assert.equal(r.sesionesRestantes, 1);
});
