import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estadoGratis, finDelMargen, limitesCerca, limitesPasados, pagaPlan, pasaAGratis, siguienteExcedidoDesde,
  FRASE_PLAN_GRATIS, LIMITE_ALUMNAS, LIMITE_COBROS_MES, MARGEN_DIAS, type UsoGratis,
} from './plan-gratis.ts';

const uso = (o: Partial<UsoGratis> = {}): UsoGratis => ({ alumnasActivas: 0, cobros30Dias: 0, ...o });

test('los límites del fundador: 150 alumnas y 30 cobros al mes, 30 días de margen', () => {
  assert.equal(LIMITE_ALUMNAS, 150);
  assert.equal(LIMITE_COBROS_MES, 30);
  assert.equal(MARGEN_DIAS, 30);
  assert.equal(FRASE_PLAN_GRATIS, 'Tú eres la prioridad. Si tu estudio crece, crecemos contigo.');
});

test('justo en el límite no se ha pasado; uno más, sí', () => {
  assert.deepEqual(limitesPasados(uso({ alumnasActivas: 150, cobros30Dias: 30 })), []);
  assert.deepEqual(limitesPasados(uso({ alumnasActivas: 151 })), ['alumnas']);
  assert.deepEqual(limitesPasados(uso({ cobros30Dias: 31 })), ['cobros']);
});

test('se avisa desde el 80 %: 120 alumnas o 24 cobros', () => {
  assert.deepEqual(limitesCerca(uso({ alumnasActivas: 119, cobros30Dias: 23 })), []);
  assert.deepEqual(limitesCerca(uso({ alumnasActivas: 120 })), ['alumnas']);
  assert.deepEqual(limitesCerca(uso({ cobros30Dias: 24 })), ['cobros']);
});

test('el margen empieza el día que se pasa, no se reinicia y se borra al volver a estar dentro', () => {
  assert.equal(siguienteExcedidoDesde(null, uso({ alumnasActivas: 151 }), '2026-10-15'), '2026-10-15');
  assert.equal(siguienteExcedidoDesde('2026-10-01', uso({ alumnasActivas: 160 }), '2026-10-15'), '2026-10-01');
  assert.equal(siguienteExcedidoDesde('2026-10-01', uso({ alumnasActivas: 140 }), '2026-10-15'), null);
});

test('las fases: dentro, cerca, margen con su cuenta atrás y cerrado', () => {
  assert.equal(estadoGratis({ uso: uso({ alumnasActivas: 50 }), excedidoDesde: null, hoy: '2026-10-15' }).fase, 'DENTRO');
  assert.equal(estadoGratis({ uso: uso({ alumnasActivas: 130 }), excedidoDesde: null, hoy: '2026-10-15' }).fase, 'CERCA');
  const margen = estadoGratis({ uso: uso({ alumnasActivas: 151 }), excedidoDesde: '2026-10-01', hoy: '2026-10-15' });
  assert.equal(margen.fase, 'MARGEN');
  assert.equal(margen.diasRestantes, 16);
  assert.equal(margen.cierraEl, '2026-10-31');
  const cerrado = estadoGratis({ uso: uso({ alumnasActivas: 151 }), excedidoDesde: '2026-10-01', hoy: '2026-10-31' });
  assert.equal(cerrado.fase, 'CERRADO');
  assert.equal(cerrado.diasRestantes, 0);
});

test('pasado sin fecha guardada todavía: el margen empieza hoy, nunca antes', () => {
  const e = estadoGratis({ uso: uso({ cobros30Dias: 40 }), excedidoDesde: null, hoy: '2026-10-15' });
  assert.equal(e.fase, 'MARGEN');
  assert.equal(e.diasRestantes, MARGEN_DIAS);
  assert.equal(e.cierraEl, finDelMargen('2026-10-15'));
});

test('sin cifras no se cierra nada', () => {
  assert.equal(estadoGratis({ uso: null, excedidoDesde: null, hoy: '2026-10-15' }).fase, 'SIN_MEDIR');
});

test('el margen cruza meses y años en días de calendario', () => {
  assert.equal(finDelMargen('2026-12-15'), '2027-01-14');
  assert.equal(finDelMargen('2027-02-01'), '2027-03-03');
});

test('quién paga: Stripe vivo o la sede de una cadena; la prueba local no', () => {
  assert.equal(pagaPlan({ subscriptionStatus: 'active', subscriptionId: 'sub_1' }), true);
  assert.equal(pagaPlan({ subscriptionStatus: 'active', subscriptionId: null }), true); // sede o alta a mano en /interno
  assert.equal(pagaPlan({ subscriptionStatus: 'past_due', subscriptionId: 'sub_1' }), true);
  assert.equal(pagaPlan({ subscriptionStatus: 'trialing', subscriptionId: 'sub_1' }), true);
  assert.equal(pagaPlan({ subscriptionStatus: 'trialing', subscriptionId: null }), false);
  assert.equal(pagaPlan({ subscriptionStatus: 'gratis', subscriptionId: null }), false);
});

test('pasan a gratis los que no pagan; nunca una sede, lo que paga ni un Checkout a medias', () => {
  const sin = { subscriptionId: null, cadenaId: null };
  for (const st of [null, 'trialing', 'trial_expirado', 'canceled', 'incomplete_expired']) {
    assert.equal(pasaAGratis({ ...sin, subscriptionStatus: st }), true, String(st));
  }
  // Con Stripe aún vivo (impagada) o a medio pagar, no: lo resuelve Stripe.
  assert.equal(pasaAGratis({ ...sin, subscriptionStatus: 'unpaid' }), false);
  assert.equal(pasaAGratis({ ...sin, subscriptionStatus: 'incomplete' }), false);
  // Una cancelada de Stripe conserva su subscription_id: pasa igual.
  assert.equal(pasaAGratis({ subscriptionStatus: 'canceled', subscriptionId: 'sub_viejo', cadenaId: null }), true);
  assert.equal(pasaAGratis({ ...sin, subscriptionStatus: 'gratis_cerrado' }), false);
  assert.equal(pasaAGratis({ ...sin, subscriptionStatus: 'gratis' }), false);
  assert.equal(pasaAGratis({ subscriptionStatus: 'active', subscriptionId: 'sub_1', cadenaId: null }), false);
  assert.equal(pasaAGratis({ subscriptionStatus: 'trialing', subscriptionId: 'sub_1', cadenaId: null }), false);
  assert.equal(pasaAGratis({ subscriptionStatus: 'trial_expirado', subscriptionId: null, cadenaId: 'cad-1' }), false);
});

test('gratis da acceso y todo menos varias sedes; Founding Studio de pago sigue como estaba', async () => {
  const { tieneFeature, entitlementsDe, suscripcionActiva } = await import('./entitlements.ts');
  const gratis = { plan: 'BASE', subscriptionStatus: 'gratis' };
  assert.equal(suscripcionActiva('gratis'), true);
  for (const f of ['gamificacion', 'marketing', 'ia', 'decisiones', 'marca', 'sustitucionesAutonomas', 'asistente'] as const) {
    assert.equal(tieneFeature(gratis, f), true, f);
  }
  assert.equal(tieneFeature(gratis, 'multiCentro'), false);
  assert.equal(entitlementsDe(gratis).maxSocios, 150);
  assert.equal(entitlementsDe(gratis).consultasAsistenteMes, 50);
  // El estudio que paga Founding Studio no cambia hasta que deje de pagar.
  assert.equal(tieneFeature({ plan: 'BASE', subscriptionStatus: 'active' }, 'decisiones'), false);
});

test('gratis no es una prueba ni una prueba agotada', async () => {
  const { estadoTrial } = await import('./trial.ts');
  const e = estadoTrial({ trialEndsAt: '2026-01-01T00:00:00Z', subscriptionStatus: 'gratis', subscriptionId: null }, new Date('2026-10-15T10:00:00Z'));
  assert.equal(e.agotada, false);
  assert.equal(e.enPrueba, false);
});

test('si vuelve a bajar dentro del margen, se borra; acabado el margen, el cierre se queda aunque baje', () => {
  assert.equal(siguienteExcedidoDesde('2026-10-01', uso({ alumnasActivas: 100 }), '2026-10-20'), null);
  assert.equal(siguienteExcedidoDesde('2026-10-01', uso({ alumnasActivas: 100 }), '2026-10-31'), '2026-10-01');
  const e = estadoGratis({ uso: uso({ alumnasActivas: 90, cobros30Dias: 5 }), excedidoDesde: '2026-09-01', hoy: '2026-11-15' });
  assert.equal(e.fase, 'CERRADO');
  assert.deepEqual(e.motivos, []);
  // Sin cifras y con el margen acabado, también cerrado.
  assert.equal(estadoGratis({ uso: null, excedidoDesde: '2026-09-01', hoy: '2026-11-15' }).fase, 'CERRADO');
});

test('los cobros cuentan en 30 días, no por mes natural: el día 1 no reinicia nada', () => {
  assert.equal(estadoGratis({ uso: uso({ cobros30Dias: 33 }), excedidoDesde: '2026-10-28', hoy: '2026-11-01' }).fase, 'MARGEN');
});
