// Tests de la lógica de consumo de bono. Runner nativo de Node: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Suscripcion, PlanTarifa } from '@/lib/types';
import {
  hayAlgoQueContratar, exigePlanAlReservar,
  bonoConsumible, bonoDevolvible, calcularConsumoBono, tieneEntitlementActivo,
  calcularFechaFinBono, nuevaFechaFinTrasCongelar, planCubreTipoClase,
  seArreglaComprando, ERROR_SIN_PLAN, ERROR_BONO_NO_CUBRE, calcularReactivacion,
  saldoSesionesBono, avisaBonoAgotado, cicloInicialDe,
  mesesDeCiclo, nombrePeriodo, proximoFinAlineadoDia1, proximoFinDesdeVencimiento } from './bono-logic.ts';

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

// ── Coherencia entre la PUERTA y el COBRO ────────────────────────────────────
//
// Que `bonoConsumible` no elija un bono agotado ya lo cubren los tests del bloque
// "Varios bonos a la vez" (más abajo, del arreglo del mismo fallo encontrado en
// paralelo). Lo que se blinda AQUÍ es otra propiedad, la que explicaba por qué
// el fallo era invisible: `tieneEntitlementActivo` (¿puede reservar?) y
// `bonoConsumible` (¿de dónde se descuenta?) tienen que estar de acuerdo sobre
// qué bonos cuentan.
//
// Cuando no lo estaban, la puerta veía el bono LLENO y dejaba reservar con toda
// la razón, y el cobro descontaba de otro DISTINTO que estaba vacío. Ninguna de
// las dos funciones estaba mal por separado — y por eso ningún test de una sola
// de ellas lo habría cazado.
test('la puerta y el cobro coinciden: si hay saldo, ambas lo ven en el MISMO bono', () => {
  const suscripciones = [
    sus({ id: 'sus-aaa', socioId: 'a', planId: 'p1', sesionesRestantes: 0 }),
    sus({ id: 'sus-zzz', socioId: 'a', planId: 'p1', sesionesRestantes: 4 }),
  ];
  const planes = [plan({ id: 'p1', tipo: 'BONO' })];
  assert.equal(tieneEntitlementActivo('a', suscripciones, planes, '2026-08-11'), true);
  assert.equal(bonoConsumible('a', suscripciones, planes)?.suscripcion.id, 'sus-zzz');
});

test('sin ningún bono con saldo, ni la puerta deja entrar ni el cobro elige nada', () => {
  const suscripciones = [sus({ socioId: 'a', planId: 'p1', sesionesRestantes: 0 })];
  const planes = [plan({ id: 'p1', tipo: 'BONO' })];
  assert.equal(tieneEntitlementActivo('a', suscripciones, planes, '2026-08-11'), false);
  assert.equal(bonoConsumible('a', suscripciones, planes), null);
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

// Decisión cerrada (motor de derechos): con varios bonos que cubren la clase manda la ESPECIFICIDAD,
// luego la caducidad, luego el id. Su gemela en SQL es `elegir_bono_consumible` (migr 20261002150000).
test('bonoConsumible: el bono acotado a ese tipo de clase se gasta antes que el general, aunque caduque después', () => {
  const suscripciones = [
    sus({ id: 'sus-general', socioId: 'a', planId: 'p-todo', fechaFin: '2026-08-01' }),
    sus({ id: 'sus-reformer', socioId: 'a', planId: 'p-reformer', fechaFin: '2026-12-31' }),
  ];
  const planes = [
    plan({ id: 'p-todo', tipo: 'BONO' }),
    plan({ id: 'p-reformer', tipo: 'BONO', tiposClaseIds: ['tc-reformer'] }),
  ];
  assert.equal(bonoConsumible('a', suscripciones, planes, '2026-07-25', 'tc-reformer')?.suscripcion.id, 'sus-reformer');
  // En una clase que el específico NO cubre, solo vale el general.
  assert.equal(bonoConsumible('a', suscripciones, planes, '2026-07-25', 'tc-mat')?.suscripcion.id, 'sus-general');
  // Quien se lo gaste lo devuelve al MISMO: `bonoDevolvible` comparte el orden.
  assert.equal(bonoDevolvible('a', suscripciones, planes, '2026-07-25', 'tc-reformer')?.suscripcion.id, 'sus-reformer');
});

test('bonoConsumible: entre dos bonos igual de específicos sigue mandando la caducidad, y después el id', () => {
  const planes = [
    plan({ id: 'p1', tipo: 'BONO', tiposClaseIds: ['tc-reformer'] }),
    plan({ id: 'p2', tipo: 'BONO', tiposClaseIds: ['tc-reformer', 'tc-mat'] }),
  ];
  const porCaducidad = [
    sus({ id: 'sus-b', socioId: 'a', planId: 'p1', fechaFin: '2026-12-31' }),
    sus({ id: 'sus-a', socioId: 'a', planId: 'p2', fechaFin: '2026-09-01' }),
  ];
  assert.equal(bonoConsumible('a', porCaducidad, planes, '2026-07-25', 'tc-reformer')?.suscripcion.id, 'sus-a');
  const porId = [
    sus({ id: 'sus-z', socioId: 'a', planId: 'p1', fechaFin: null }),
    sus({ id: 'sus-m', socioId: 'a', planId: 'p2', fechaFin: null }),
  ];
  assert.equal(bonoConsumible('a', porId, planes, '2026-07-25', 'tc-reformer')?.suscripcion.id, 'sus-m');
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

// ── bonoDevolvible (I-5) ─────────────────────────────────────────────────────
// El tope ya no se calcula aquí: lo aplica la RPC `devolver_sesion_bono` dentro
// de su WHERE (I-10). Lo que se prueba aquí es a QUÉ bono hay que devolverle la
// sesión, que es donde estaba el fallo.

test('bonoDevolvible SÍ elige un bono agotado — el caso que bonoConsumible descarta', () => {
  const suscripciones = [sus({ id: 's-0', socioId: 'a', planId: 'p1', sesionesRestantes: 0 })];
  const planes = [plan({ id: 'p1', tipo: 'BONO', sesiones: 10 })];
  // Este es el bug I-5: cancelar la clase que gastó la ÚLTIMA sesión no
  // devolvía nada, porque un bono a 0 no es "consumible".
  assert.equal(bonoConsumible('a', suscripciones, planes), null);
  assert.equal(bonoDevolvible('a', suscripciones, planes)?.suscripcion.id, 's-0');
});

test('bonoDevolvible ignora el bono que ya está al total del plan (no hay hueco)', () => {
  const suscripciones = [sus({ id: 's-lleno', socioId: 'a', planId: 'p1', sesionesRestantes: 10 })];
  assert.equal(bonoDevolvible('a', suscripciones, [plan({ id: 'p1', tipo: 'BONO', sesiones: 10 })]), null);
});

test('bonoDevolvible con un plan sin tope de sesiones siempre admite la devolución', () => {
  const suscripciones = [sus({ id: 's-x', socioId: 'a', planId: 'p1', sesionesRestantes: 99 })];
  assert.equal(bonoDevolvible('a', suscripciones, [plan({ id: 'p1', tipo: 'BONO', sesiones: null })])?.suscripcion.id, 's-x');
});

test('bonoDevolvible respeta la cobertura por tipo de clase, igual que consumir', () => {
  const suscripciones = [sus({ id: 's-ref', socioId: 'a', planId: 'p-ref', sesionesRestantes: 0 })];
  const planes = [plan({ id: 'p-ref', tipo: 'BONO', sesiones: 10, tiposClaseIds: ['tc-reformer'] })];
  assert.equal(bonoDevolvible('a', suscripciones, planes, '2026-07-26', 'tc-reformer')?.suscripcion.id, 's-ref');
  assert.equal(bonoDevolvible('a', suscripciones, planes, '2026-07-26', 'tc-mat'), null);
});

test('bonoDevolvible no resucita un bono caducado', () => {
  const suscripciones = [sus({ id: 's-cad', socioId: 'a', planId: 'p1', sesionesRestantes: 0, fechaFin: '2026-07-01' })];
  assert.equal(bonoDevolvible('a', suscripciones, [plan({ id: 'p1', tipo: 'BONO' })], '2026-07-25'), null);
});

test('bonoDevolvible usa el MISMO orden que consumir: devuelve al que caduca antes', () => {
  const suscripciones = [
    sus({ id: 's-tarde', socioId: 'a', planId: 'p1', sesionesRestantes: 0, fechaFin: '2026-12-31' }),
    sus({ id: 's-pronto', socioId: 'a', planId: 'p1', sesionesRestantes: 0, fechaFin: '2026-08-31' }),
  ];
  // Si el orden divergiera del de consumir, se devolvería a un bono distinto del
  // que se descontó.
  assert.equal(bonoDevolvible('a', suscripciones, [plan({ id: 'p1', tipo: 'BONO' })], '2026-07-25')?.suscripcion.id, 's-pronto');
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

// P-9 (auditoría 21ª pasada): un cobro de madrugada en Madrid cae en un día
// UTC distinto — la fecha de inicio de la validez tiene que ser la del
// estudio, no la de UTC. 23:30 UTC del 1 de enero son las 00:30 del 2 de
// enero en Madrid (CET, UTC+1 en invierno).
test('calcularFechaFinBono: un cobro de madrugada en Madrid usa el día de Madrid, no el de UTC', () => {
  assert.equal(calcularFechaFinBono('2026-01-01T23:30:00.000Z', 30), '2026-02-01');
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

// Lo que de verdad llega a la RPC. Un estudio recién creado: ajuste activado de
// fábrica y las tarifas del asistente en borrador (`activo: false`). La RPC
// recibía `true` y rechazaba a la primera alumna aunque no hubiera nada que comprar.
test('exigePlanAlReservar: estudio nuevo con tarifas en borrador → no se exige', () => {
  assert.equal(exigePlanAlReservar(true, [{ activo: false }, { activo: false }]), false);
  assert.equal(exigePlanAlReservar(true, []), false);
});

test('exigePlanAlReservar: con algo a la venta se exige, y sin el ajuste nunca', () => {
  assert.equal(exigePlanAlReservar(true, [{ activo: false }, { activo: true }]), true);
  assert.equal(exigePlanAlReservar(false, [{ activo: true }]), false);
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

// P-9 (auditoría 21ª pasada): misma clase de bug que calcularFechaFinBono —
// una reactivación de madrugada en Madrid usaba el día de UTC.
test('calcularReactivacion: MENSUAL de madrugada en Madrid usa el día de Madrid, no el de UTC', () => {
  const r = calcularReactivacion(plan({ id: 'p1', tipo: 'MENSUAL', sesiones: null, validezDias: null }), '2026-01-01T23:30:00.000Z');
  assert.equal(r.fechaFin, '2026-02-02'); // 2 ene (Madrid) + 1 mes
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

// ── Varios bonos a la vez, y uno de ellos agotado ───────────────────────────
// Caso real de producción (11-ago-2026): una socia compró el mismo bono cuatro
// veces. El primero se gastó entero; los otros tres seguían intactos. Como el
// filtro solo miraba `sesionesRestantes !== null`, el agotado seguía siendo
// candidato y —con el desempate por id— GANABA siempre. Resultado: reservaba y
// no se descontaba de ningún sitio. Doce sesiones pagadas que no se iban a
// gastar nunca, sin un error por ninguna parte.

test('⚠️ un bono agotado no puede ser el elegido habiendo otros con saldo', () => {
  const suscripciones = [
    sus({ id: 'sus-web-a1CyAA', socioId: 'a', planId: 'p1', sesionesRestantes: 0 }),
    sus({ id: 'sus-web-a1VCh2', socioId: 'a', planId: 'p1', sesionesRestantes: 4 }),
    sus({ id: 'sus-web-a1wx3R', socioId: 'a', planId: 'p1', sesionesRestantes: 4 }),
  ];
  const planes = [plan({ id: 'p1', tipo: 'BONO', sesiones: 4 })];
  const elegido = bonoConsumible('a', suscripciones, planes, '2026-08-11');
  assert.ok(elegido, 'con saldo disponible tiene que haber bono del que descontar');
  assert.ok(elegido!.sesionesRestantes > 0, 'nunca se elige uno a cero');
  // El id del agotado es el más bajo: sin el filtro, el desempate lo elegía.
  assert.notEqual(elegido!.suscripcion.id, 'sus-web-a1CyAA');
});

test('con TODOS agotados no hay nada que consumir', () => {
  const suscripciones = [
    sus({ id: 's1', socioId: 'a', planId: 'p1', sesionesRestantes: 0 }),
    sus({ id: 's2', socioId: 'a', planId: 'p1', sesionesRestantes: 0 }),
  ];
  const planes = [plan({ id: 'p1', tipo: 'BONO', sesiones: 4 })];
  assert.equal(bonoConsumible('a', suscripciones, planes, '2026-08-11'), null);
});

test('la caducidad sigue mandando entre los que SÍ tienen saldo', () => {
  // El filtro nuevo no puede haberse llevado por delante la regla de siempre:
  // entre bonos con saldo, primero el que caduca antes.
  const suscripciones = [
    sus({ id: 's-tarde', socioId: 'a', planId: 'p1', sesionesRestantes: 4, fechaFin: '2026-12-31' }),
    sus({ id: 's-pronto', socioId: 'a', planId: 'p1', sesionesRestantes: 4, fechaFin: '2026-09-01' }),
    sus({ id: 's-cero', socioId: 'a', planId: 'p1', sesionesRestantes: 0, fechaFin: '2026-08-15' }),
  ];
  const planes = [plan({ id: 'p1', tipo: 'BONO', sesiones: 4 })];
  assert.equal(bonoConsumible('a', suscripciones, planes, '2026-08-11')?.suscripcion.id, 's-pronto');
});

// ── saldoSesionesBono ────────────────────────────────────────────────────────
//
// El caso de producción del 2026-08-18: 6 bonos activos, 17 sesiones pagadas, y
// todas las pantallas enseñando el saldo de uno solo. Comprar otro bono no
// recarga el anterior (los bonos con saldo conviven a propósito), así que
// "cuánto le queda" solo se responde sumando.

const HOY_S = '2026-08-18';

test('saldoSesionesBono suma TODOS los bonos vigentes, no el primero', () => {
  const suscripciones = [
    sus({ id: 's1', socioId: 'a', planId: 'p1', sesionesRestantes: 3, fechaFin: '2026-10-10' }),
    sus({ id: 's2', socioId: 'a', planId: 'p1', sesionesRestantes: 4, fechaFin: '2026-10-17' }),
    sus({ id: 's3', socioId: 'a', planId: 'p1', sesionesRestantes: 2, fechaFin: '2026-10-08' }),
  ];
  const planes = [plan({ id: 'p1', tipo: 'BONO', sesiones: 4 })];
  assert.deepEqual(saldoSesionesBono('a', suscripciones, planes, HOY_S), { restantes: 9, total: 12, bonos: 3 });
});

test('saldoSesionesBono: comprar otro bono sube el saldo', () => {
  const planes = [plan({ id: 'p1', tipo: 'BONO', sesiones: 4 })];
  const antes = [sus({ id: 's1', socioId: 'a', planId: 'p1', sesionesRestantes: 3 })];
  const despues = [...antes, sus({ id: 's2', socioId: 'a', planId: 'p1', sesionesRestantes: 4 })];
  assert.equal(saldoSesionesBono('a', antes, planes, HOY_S)?.restantes, 3);
  assert.equal(saldoSesionesBono('a', despues, planes, HOY_S)?.restantes, 7);
});

test('saldoSesionesBono no cuenta caducados, PAUSADAS ni de otra socia', () => {
  const planes = [plan({ id: 'p1', tipo: 'BONO', sesiones: 4 })];
  const suscripciones = [
    sus({ id: 's1', socioId: 'a', planId: 'p1', sesionesRestantes: 4, fechaFin: '2026-08-17' }), // caducado ayer
    sus({ id: 's2', socioId: 'a', planId: 'p1', sesionesRestantes: 4, estado: 'PAUSADA' }),
    sus({ id: 's3', socioId: 'b', planId: 'p1', sesionesRestantes: 4 }),
    sus({ id: 's4', socioId: 'a', planId: 'p1', sesionesRestantes: 1, fechaFin: HOY_S }), // caduca HOY: vale
  ];
  assert.deepEqual(saldoSesionesBono('a', suscripciones, planes, HOY_S), { restantes: 1, total: 4, bonos: 1 });
});

test('saldoSesionesBono: un bono agotado cuenta en el denominador, no en el saldo', () => {
  // Si saliera del total, «12/24» pasaría a «12/20» al gastar un bono entero:
  // el total comprado bajaría solo. Mismo criterio que bonos-portal.
  const planes = [plan({ id: 'p1', tipo: 'BONO', sesiones: 4 })];
  const suscripciones = [
    sus({ id: 's1', socioId: 'a', planId: 'p1', sesionesRestantes: 0 }),
    sus({ id: 's2', socioId: 'a', planId: 'p1', sesionesRestantes: 4 }),
  ];
  assert.deepEqual(saldoSesionesBono('a', suscripciones, planes, HOY_S), { restantes: 4, total: 8, bonos: 2 });
});

test('saldoSesionesBono: sin bonos devuelve null, no 0', () => {
  // Un 0 se lee como «se le acabó»; null es «no tiene nada que contar».
  const planes = [plan({ id: 'p1', tipo: 'MENSUAL', sesiones: null })];
  const suscripciones = [sus({ socioId: 'a', planId: 'p1', sesionesRestantes: null })];
  assert.equal(saldoSesionesBono('a', suscripciones, planes, HOY_S), null);
  assert.equal(saldoSesionesBono('a', [], planes, HOY_S), null);
});

test('saldoSesionesBono respeta los tipos de clase del bono', () => {
  const planes = [
    plan({ id: 'p-ref', tipo: 'BONO', sesiones: 10, tiposClaseIds: ['tc-reformer'] }),
    plan({ id: 'p-mat', tipo: 'BONO', sesiones: 5, tiposClaseIds: ['tc-mat'] }),
  ];
  const suscripciones = [
    sus({ id: 's1', socioId: 'a', planId: 'p-ref', sesionesRestantes: 6 }),
    sus({ id: 's2', socioId: 'a', planId: 'p-mat', sesionesRestantes: 2 }),
  ];
  assert.equal(saldoSesionesBono('a', suscripciones, planes, HOY_S, 'tc-mat')?.restantes, 2);
  assert.equal(saldoSesionesBono('a', suscripciones, planes, HOY_S)?.restantes, 8, 'sin clase concreta, todo');
});

// Guard de regresión sobre el CÓDIGO, no sobre una función pura: lo que hay
// que impedir es que vuelva a nacer una deuda al agotarse un bono, y eso pasa
// en dos ficheros gemelos que no se pueden ejecutar desde un test unitario
// (uno es un contexto de React, el otro habla con Supabase). El bug del
// 2026-09-04 se coló justo por ahí: la lógica pura ya distinguía los tipos, y
// aun así los dos caminos insertaban el recibo.
test('⚠️ ningún camino de consumo de bono crea un recibo de «Renovación»', async () => {
  const { readFile } = await import('node:fs/promises');
  // Eran dos gemelos. El de cliente (`consumirSesionBono`, studio-context) se
  // borró cuando el panel pasó a reservar por el servidor: queda un solo sitio
  // que descuenta, y ese es el que se vigila.
  const gemelos = [
    { fichero: 'lib/db/supabase-data-admin.ts', funcion: 'consumirBonoServidor' },
  ];
  for (const { fichero, funcion } of gemelos) {
    const codigo = await readFile(new URL(`../${fichero}`, import.meta.url), 'utf8');
    const desde = codigo.indexOf(`function ${funcion}`);
    assert.notEqual(desde, -1, `${funcion} ya no está en ${fichero}: actualiza este test`);
    // Hasta la siguiente declaración de función, sea cual sea su indentación:
    // `consumirBonoServidor` es de primer nivel y `consumirSesionBono` está
    // anidada en el provider, así que un solo patrón no vale para las dos.
    const resto = codigo.slice(desde + 1);
    const siguiente = resto.search(/\n\s*(?:export\s+)?(?:async\s+)?function\s/);
    const cuerpo = siguiente === -1 ? resto : resto.slice(0, siguiente);
    assert.ok(
      !/concepto:\s*`Renovación/.test(cuerpo),
      `${funcion} (${fichero}) vuelve a crear un recibo de renovación al agotarse un bono: `
      + 'eso entra en el dunning y le cobra la tarjeta a la socia por algo que no ha pedido',
    );
  }
});

test('un bono agotado sí AVISA — el aviso no era el problema, la deuda sí', () => {
  // Quitar el recibo no puede llevarse por delante la notificación: la
  // propietaria y la socia siguen necesitando saber que se acabó.
  assert.equal(avisaBonoAgotado({ tipo: 'BONO' }), true);
});

test('⚠️ una clase suelta ni renueva ni avisa de «bono agotado»', () => {
  // El arreglo del 2026-08-20: usar una clase suelta ES su ciclo de vida, no
  // quedarse sin bono. Si al quitar el recibo se hubiera quitado el guard
  // entero, PUNTUAL habría empezado a anunciar «bono agotado» al usarse.
  assert.equal(avisaBonoAgotado({ tipo: 'PUNTUAL' }), false);
});

test('un mensual no pasa por aquí: su renovación la lleva el cron', () => {
  // `lib/inngest/renovaciones.ts` filtra por MENSUAL y sigue intacto — es el
  // único camino que renueva solo, y debe seguir haciéndolo.
  assert.equal(avisaBonoAgotado({ tipo: 'MENSUAL' }), false);
});

// ── El primer ciclo de un plan (cicloInicialDe) ──────────────────────────────

test('⚠️ un MENSUAL nace con fecha de fin: sin ella no se cobra NUNCA más', () => {
  // El agujero de caja encontrado en producción el 2026-09-05: 4 de 14
  // suscripciones mensuales activas tenían `fecha_fin` a NULL, o sea 172 €/mes
  // que no se iban a volver a cobrar. Los tres caminos de alta llamaban a
  // `calcularFechaFinBono(ahora, plan.validezDias)` sin mirar el tipo, y un
  // MENSUAL tiene `validezDias` null POR DEFINICIÓN (se renueva, no caduca).
  const ciclo = cicloInicialDe({ tipo: 'MENSUAL', sesiones: null, validezDias: null }, '2026-09-06T10:00:00Z');
  assert.equal(ciclo.fechaFin, '2026-10-06', 'un mes vista');
  assert.equal(ciclo.sesionesRestantes, null, 'un mensual no gasta sesiones');
});

test('el mensual ignora `validezDias` aunque venga con valor', () => {
  // Si un plan mensual trae días por lo que sea, no convierten el mensual en
  // un bono: sigue siendo un ciclo de un mes.
  const ciclo = cicloInicialDe({ tipo: 'MENSUAL', sesiones: 8, validezDias: 90 }, '2026-09-06T10:00:00Z');
  assert.equal(ciclo.fechaFin, '2026-10-06');
  assert.equal(ciclo.sesionesRestantes, null);
});

test('un BONO conserva su caducidad por días y sus sesiones', () => {
  const ciclo = cicloInicialDe({ tipo: 'BONO', sesiones: 10, validezDias: 60 }, '2026-09-06T10:00:00Z');
  assert.equal(ciclo.fechaFin, '2026-11-05');
  assert.equal(ciclo.sesionesRestantes, 10);
});

test('un BONO sin caducidad sigue sin caducar — eso sí es intencionado', () => {
  // Aquí NULL sí significa «no caduca», y es una opción real del formulario.
  // La diferencia con el mensual es que allí nadie lo había elegido.
  const ciclo = cicloInicialDe({ tipo: 'BONO', sesiones: 4, validezDias: null }, '2026-09-06T10:00:00Z');
  assert.equal(ciclo.fechaFin, null);
  assert.equal(ciclo.sesionesRestantes, 4);
});

test('una CLASE SUELTA se comporta como el bono', () => {
  const ciclo = cicloInicialDe({ tipo: 'PUNTUAL', sesiones: 1, validezDias: 30 }, '2026-09-06T10:00:00Z');
  assert.equal(ciclo.fechaFin, '2026-10-06');
  assert.equal(ciclo.sesionesRestantes, 1);
});

test('reactivar y dar de alta son el MISMO ciclo, no dos criterios', () => {
  // `calcularReactivacion` ya tenía la lógica buena y su comentario decía
  // «mismo criterio que assignPlan» — pero assignPlan hacía otra cosa. Ahora
  // delega, así que no pueden volver a separarse.
  for (const plan of [
    { tipo: 'MENSUAL' as const, sesiones: null, validezDias: null },
    { tipo: 'BONO' as const, sesiones: 10, validezDias: 60 },
    { tipo: 'PUNTUAL' as const, sesiones: 1, validezDias: null },
  ]) {
    assert.deepEqual(
      calcularReactivacion(plan, '2026-09-06T10:00:00Z'),
      cicloInicialDe(plan, '2026-09-06T10:00:00Z'),
      `divergen en ${plan.tipo}`,
    );
  }
});

test('el mensual de madrugada usa el día de Madrid, no el de UTC', () => {
  // 01:30 de Madrid son las 23:30 UTC del día anterior: sin esto el ciclo
  // empezaría (y acabaría) un día antes de lo que vivió la propietaria.
  assert.equal(
    cicloInicialDe({ tipo: 'MENSUAL', sesiones: null, validezDias: null }, '2026-09-05T23:30:00Z').fechaFin,
    '2026-10-06',
  );
});

// ── Cuotas que no son mensuales (periodicidadMeses) ──────────────────────────
//
// Una cuota podía ser SOLO mensual: los tres sitios que extienden una
// suscripción sumaban `+ 1` a pelo. Un estudio que cobra por trimestres —de
// septiembre a junio, lo normal en Pilates— no podía reproducir su lista de
// precios sin fingirlo con un bono. Lo que se prueba aquí es que el ciclo
// nuevo no altera NADA de lo que ya funcionaba.

test('una cuota trimestral nace con tres meses de vigencia, no con uno', () => {
  const ciclo = cicloInicialDe(
    { tipo: 'MENSUAL', sesiones: null, validezDias: null, periodicidadMeses: 3 },
    '2026-09-06T10:00:00Z',
  );
  assert.equal(ciclo.fechaFin, '2026-12-06');
  assert.equal(ciclo.sesionesRestantes, null);
});

test('semestral y anual salen del mismo cálculo, sin casos aparte', () => {
  const de = (meses: number) => cicloInicialDe(
    { tipo: 'MENSUAL', sesiones: null, validezDias: null, periodicidadMeses: meses },
    '2026-09-06T10:00:00Z',
  ).fechaFin;
  assert.equal(de(6), '2027-03-06');
  assert.equal(de(12), '2027-09-06');
});

test('⚠️ sin periodicidad, una cuota sigue siendo mensual', () => {
  // Es lo que garantiza que las tarifas que ya existen —y las leídas de un
  // backup anterior a la columna— se comporten EXACTAMENTE igual que antes.
  for (const plan of [
    { tipo: 'MENSUAL' as const, sesiones: null, validezDias: null },
    { tipo: 'MENSUAL' as const, sesiones: null, validezDias: null, periodicidadMeses: null },
    { tipo: 'MENSUAL' as const, sesiones: null, validezDias: null, periodicidadMeses: 1 },
  ]) {
    assert.equal(cicloInicialDe(plan, '2026-09-06T10:00:00Z').fechaFin, '2026-10-06');
  }
});

test('⚠️ un valor imposible cae a mensual, no a una fecha absurda', () => {
  // Una fila tocada a mano o un import viejo podría traer cualquier número. El
  // CHECK de la BD ya lo impide, pero aquí se lee también de payloads públicos
  // y de backups. Cobrar de menos por un dato corrupto es recuperable;
  // extender una suscripción 99 meses, no.
  for (const meses of [0, -3, 2, 99, NaN]) {
    assert.equal(mesesDeCiclo({ periodicidadMeses: meses }), 1, `${meses} debería caer a 1`);
  }
});

test('la periodicidad no toca a los bonos ni a las clases sueltas', () => {
  // Ahí el ciclo lo marcan `validezDias`/`sesiones`. Si se colara, un bono con
  // una periodicidad heredada cambiaría de caducidad sin que nadie la tocara.
  const bono = cicloInicialDe(
    { tipo: 'BONO', sesiones: 10, validezDias: 60, periodicidadMeses: 12 },
    '2026-09-06T10:00:00Z',
  );
  assert.equal(bono.fechaFin, '2026-11-05');
  const puntual = cicloInicialDe(
    { tipo: 'PUNTUAL', sesiones: 1, validezDias: 30, periodicidadMeses: 3 },
    '2026-09-06T10:00:00Z',
  );
  assert.equal(puntual.fechaFin, '2026-10-06');
});

test('reactivar una trimestral la reactiva TRES meses, como el alta', () => {
  // El mismo emparejamiento que ya fijaba el test de arriba, ahora con ciclo.
  const plan = { tipo: 'MENSUAL' as const, sesiones: null, validezDias: null, periodicidadMeses: 3 };
  assert.deepEqual(
    calcularReactivacion(plan, '2026-09-06T10:00:00Z'),
    cicloInicialDe(plan, '2026-09-06T10:00:00Z'),
  );
});

test('el nombre del periodo se dice en castellano, y uno por cada valor', () => {
  assert.equal(nombrePeriodo({ periodicidadMeses: 1 }), 'mes');
  assert.equal(nombrePeriodo({ periodicidadMeses: 3 }), 'trimestre');
  assert.equal(nombrePeriodo({ periodicidadMeses: 6 }), 'semestre');
  assert.equal(nombrePeriodo({ periodicidadMeses: 12 }), 'año');
  // Las tres formas que usan las pantallas se construyen anteponiendo la
  // preposición, así que las cuatro palabras tienen que encajar con las tres.
  assert.equal(`al ${nombrePeriodo({ periodicidadMeses: 12 })}`, 'al año');
  assert.equal(`cada ${nombrePeriodo({ periodicidadMeses: 3 })}`, 'cada trimestre');
});

test('⚠️ el fin de mes no se desborda al mes siguiente', () => {
  // `setUTCMonth` normaliza: 31 de agosto + 6 meses no existe (31 de febrero)
  // y JS lo empuja a marzo. Se documenta el comportamiento real para que
  // nadie lo descubra en un recibo: la socia gana un día o dos, nunca pierde.
  const ciclo = cicloInicialDe(
    { tipo: 'MENSUAL', sesiones: null, validezDias: null, periodicidadMeses: 6 },
    '2026-08-31T10:00:00Z',
  );
  assert.equal(ciclo.fechaFin, '2027-03-03');
});

// ── proximoFinDesdeVencimiento (ancla a fecha_fin, no a "ahora") ────────────
//
// Bug real de auditoría, confirmado en producción: la renovación ancla al
// vencimiento, no a cuándo se consiguió cobrar — si no, cada retraso del
// dunning regala días y desplaza el ciclo siguiente PARA SIEMPRE.

test('⚠️ ancla al vencimiento, no a cuándo se cobró — caso real de producción', () => {
  // rec-renov-sus-8-2026-08: fecha_vencimiento=2026-08-10, cobrado tarde el
  // 2026-08-20 (10 días de dunning). El ciclo siguiente tiene que seguir
  // siendo el 10 de cada mes, no el 20.
  const mensual = { periodicidadMeses: 1 };
  assert.equal(proximoFinDesdeVencimiento('2026-08-10', mensual), '2026-09-10');
});

test('un cobro que tarda meses en llegar no desplaza el aniversario', () => {
  // Da igual "cuándo" se llama: el resultado solo depende del vencimiento
  // anterior, nunca del reloj — a diferencia de `proximoFinNatural`.
  const mensual = { periodicidadMeses: 1 };
  assert.equal(proximoFinDesdeVencimiento('2026-01-14', mensual), '2026-02-14');
});

test('trimestral: tres meses desde el vencimiento, mismo desbordamiento ya aceptado en fin de mes', () => {
  const trimestral = { periodicidadMeses: 3 };
  assert.equal(proximoFinDesdeVencimiento('2026-08-31', trimestral), '2026-12-01'); // mismo quirk que cicloInicialDe
});

// ── proximoFinAlineadoDia1 (cobro_dia_1_activo) ──────────────────────────────

test('primera alineación: nunca cobra antes de lo que ya tenía pagado', () => {
  const mensual = { periodicidadMeses: 1 };
  // Se apuntó el 14: su fecha_fin natural (sin alinear) sería el 14 del mes
  // siguiente. Redondear ABAJO al día 1 de ese mismo mes le quitaría días ya
  // pagados — tiene que redondear ARRIBA, al día 1 del mes de después.
  assert.equal(proximoFinAlineadoDia1('2026-10-14', mensual), '2026-11-30');
});

test('ya alineada: el ciclo siguiente cae justo un mes después, sin desviarse', () => {
  const mensual = { periodicidadMeses: 1 };
  assert.equal(proximoFinAlineadoDia1('2026-11-30', mensual), '2026-12-31');
  assert.equal(proximoFinAlineadoDia1('2026-12-31', mensual), '2027-01-31');
});

test('⚠️ ya alineada y el mes tiene menos días: no se salta ningún mes de cobro', () => {
  // Aquí es donde `setUTCMonth` a pelo sobre un día 31 desbordaría (31 ene + 1
  // mes = 3 mar) y se saltaría febrero entero. La aritmética de día 1 no
  // desborda nunca.
  const mensual = { periodicidadMeses: 1 };
  assert.equal(proximoFinAlineadoDia1('2027-01-31', mensual), '2027-02-28');
  // Y en año bisiesto, el día 29 también sale solo del objeto Date, sin
  // tabla de días-por-mes a mano.
  assert.equal(proximoFinAlineadoDia1('2028-01-31', mensual), '2028-02-29');
});

test('⚠️ primera alineación desde un aniversario de día 29/30: no regala un mes entero', () => {
  // Bug real encontrado en revisión: el 30 de enero desborda igual que
  // `cicloInicialDe` (30 ene + 1 mes cae en el 2 de marzo, no existe el 30 de
  // febrero) — unos días de propina, el criterio ya aceptado en este
  // fichero. Pero redondear ESE resultado desbordado a día 1 lo amplificaba
  // a un mes entero gratis (1 de abril en vez de 1 de marzo). Correcto: fin
  // de febrero, cobro el 1 de marzo.
  const mensual = { periodicidadMeses: 1 };
  assert.equal(proximoFinAlineadoDia1('2026-01-30', mensual), '2026-02-28');
  assert.equal(proximoFinAlineadoDia1('2026-04-29', mensual), '2026-05-31');
});

test('trimestral: la alineación respeta los tres meses del ciclo', () => {
  const trimestral = { periodicidadMeses: 3 };
  assert.equal(proximoFinAlineadoDia1('2026-10-14', trimestral), '2027-01-31');
  assert.equal(proximoFinAlineadoDia1('2027-01-31', trimestral), '2027-04-30');
});

test('el natural ya cae en día 1: no hace falta redondear más', () => {
  // 2026-11-01 + 1 mes natural = 2026-12-01, que ya es día 1: el objetivo es
  // ese mismo día, sin saltar al mes siguiente.
  assert.equal(proximoFinAlineadoDia1('2026-11-01', { periodicidadMeses: 1 }), '2026-11-30');
});
