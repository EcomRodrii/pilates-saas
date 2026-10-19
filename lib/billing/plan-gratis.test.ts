import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cadenaSinPlan, empiezaDeCeroAlConvertir, estadoDeLoGuardado, estadoGratis, excedidoMasAntiguo, finDelMargen, limitesCerca, limitesPasados,
  medicionDelGrupo, pagaPlan, pasaAGratis, sedeAdmiteGratis, siguienteExcedidoDesde, sumarUsos,
  FRASE_PLAN_GRATIS, LIMITE_ALUMNAS, LIMITE_RESERVAS_MES, MARGEN_DIAS, type UsoGratis,
} from './plan-gratis.ts';

const uso = (o: Partial<UsoGratis> = {}): UsoGratis => ({ alumnasActivas: 0, reservas30Dias: 0, ...o });

test('los límites del fundador: 150 alumnas y 250 reservas al mes, 30 días de margen', () => {
  assert.equal(LIMITE_ALUMNAS, 150);
  assert.equal(LIMITE_RESERVAS_MES, 250);
  assert.equal(MARGEN_DIAS, 30);
  assert.equal(FRASE_PLAN_GRATIS, 'Tú eres la prioridad. Si tu estudio crece, crecemos contigo.');
});

test('justo en el límite no se ha pasado; uno más, sí', () => {
  assert.deepEqual(limitesPasados(uso({ alumnasActivas: 150, reservas30Dias: 250 })), []);
  assert.deepEqual(limitesPasados(uso({ alumnasActivas: 151 })), ['alumnas']);
  assert.deepEqual(limitesPasados(uso({ reservas30Dias: 251 })), ['reservas']);
});

test('se avisa desde el 80 %: 120 alumnas o 200 reservas', () => {
  assert.deepEqual(limitesCerca(uso({ alumnasActivas: 119, reservas30Dias: 199 })), []);
  assert.deepEqual(limitesCerca(uso({ alumnasActivas: 120 })), ['alumnas']);
  assert.deepEqual(limitesCerca(uso({ reservas30Dias: 200 })), ['reservas']);
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
  const e = estadoGratis({ uso: uso({ reservas30Dias: 300 }), excedidoDesde: null, hoy: '2026-10-15' });
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

test('pasan a gratis los que no pagan; nunca una sede sin saber de su cadena, lo que paga ni un Checkout a medias', () => {
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

// Una cadena que deja de pagar (decisión del fundador, 15-oct-2026): su sede
// principal pasa a gratis; las demás siguen cerradas hasta que vuelva a pagar.
test('cadena que paga: ninguna de sus sedes pasa a gratis, ni la principal', () => {
  const sede = { subscriptionStatus: 'canceled', subscriptionId: 'sub_suelta_vieja', cadenaId: 'cad-1' };
  for (const [estado, subId] of [['active', 'sub_c'], ['active', null], ['past_due', 'sub_c'], ['trialing', 'sub_c'], ['unpaid', 'sub_c'], ['incomplete', 'sub_c']] as const) {
    assert.equal(pasaAGratis({ ...sede, cadena: { subscriptionStatus: estado, subscriptionId: subId, esPrincipal: true, otraSedeGratis: false } }), false, `${estado}/${subId}`);
  }
});

test('cadena que no paga: la principal sí, las demás no', () => {
  for (const estadoCadena of [null, 'canceled', 'incomplete_expired']) {
    const cadena = { subscriptionStatus: estadoCadena, subscriptionId: estadoCadena ? 'sub_c' : null };
    // La sede sigue a su cadena: 'canceled' propagado (o la prueba local de un Checkout de Cadena abandonado).
    for (const estadoSede of ['canceled', 'incomplete_expired', 'trial_expirado', 'trialing', null]) {
      const sede = { subscriptionStatus: estadoSede, subscriptionId: null, cadenaId: 'cad-1' };
      assert.equal(pasaAGratis({ ...sede, cadena: { ...cadena, esPrincipal: true, otraSedeGratis: false } }), true, `principal ${estadoCadena}/${estadoSede}`);
      assert.equal(pasaAGratis({ ...sede, cadena: { ...cadena, esPrincipal: false, otraSedeGratis: false } }), false, `otra sede ${estadoCadena}/${estadoSede}`);
    }
  }
});

test('la principal de una cadena sin pagar sigue sus propias reglas: si paga su plan suelto o ya es gratis, no', () => {
  const cadena = { subscriptionStatus: 'canceled', subscriptionId: 'sub_c', esPrincipal: true, otraSedeGratis: false };
  assert.equal(pasaAGratis({ subscriptionStatus: 'active', subscriptionId: 'sub_suelta', cadenaId: 'cad-1', cadena }), false);
  assert.equal(pasaAGratis({ subscriptionStatus: 'incomplete', subscriptionId: 'sub_suelta', cadenaId: 'cad-1', cadena }), false);
  assert.equal(pasaAGratis({ subscriptionStatus: 'gratis', subscriptionId: null, cadenaId: 'cad-1', cadena }), false);
  assert.equal(pasaAGratis({ subscriptionStatus: 'gratis_cerrado', subscriptionId: null, cadenaId: 'cad-1', cadena }), false);
});

test('una sede sin saber de su cadena nunca pasa a gratis', () => {
  assert.equal(pasaAGratis({ subscriptionStatus: 'canceled', subscriptionId: null, cadenaId: 'cad-1', cadena: null }), false);
  assert.equal(pasaAGratis({ subscriptionStatus: 'canceled', subscriptionId: null, cadenaId: 'cad-1' }), false);
});

test('qué cadena ha dejado de pagar y qué estudio admite el gratis por su cadena', () => {
  assert.equal(cadenaSinPlan({ subscriptionStatus: 'canceled', subscriptionId: 'sub_c' }), true);
  assert.equal(cadenaSinPlan({ subscriptionStatus: null, subscriptionId: null }), true); // Checkout de Cadena abandonado
  assert.equal(cadenaSinPlan({ subscriptionStatus: 'unpaid', subscriptionId: 'sub_c' }), false); // Stripe aún puede cobrarla
  assert.equal(cadenaSinPlan({ subscriptionStatus: 'incomplete', subscriptionId: 'sub_c' }), false); // pago a medias
  assert.equal(cadenaSinPlan({ subscriptionStatus: 'active', subscriptionId: null }), false); // alta a mano en /interno
  assert.equal(sedeAdmiteGratis({ cadenaId: null }), true);
  assert.equal(sedeAdmiteGratis({ cadenaId: 'cad-1', cadena: { subscriptionStatus: 'canceled', subscriptionId: 'sub_c', esPrincipal: true, otraSedeGratis: false } }), true);
  assert.equal(sedeAdmiteGratis({ cadenaId: 'cad-1', cadena: { subscriptionStatus: 'canceled', subscriptionId: 'sub_c', esPrincipal: false, otraSedeGratis: false } }), false);
  assert.equal(sedeAdmiteGratis({ cadenaId: 'cad-1', cadena: { subscriptionStatus: 'active', subscriptionId: 'sub_c', esPrincipal: true, otraSedeGratis: false } }), false);
});

test('nunca dos sedes gratis en la misma cadena: si otra ya lo está, la principal no pasa', () => {
  const cadena = { subscriptionStatus: 'canceled', subscriptionId: 'sub_c', esPrincipal: true, otraSedeGratis: true };
  assert.equal(sedeAdmiteGratis({ cadenaId: 'cad-1', cadena }), false);
  assert.equal(pasaAGratis({ subscriptionStatus: 'canceled', subscriptionId: null, cadenaId: 'cad-1', cadena }), false);
});

test('al pasar a gratis, la medición empieza de cero solo tras un periodo pagado (canceled)', () => {
  assert.equal(empiezaDeCeroAlConvertir('canceled'), true);
  // Un pago abandonado no reabre un gratis_cerrado con 30 días más; una prueba agotada no tiene medición que borrar.
  for (const st of ['incomplete_expired', 'trial_expirado', 'trialing', null, undefined]) {
    assert.equal(empiezaDeCeroAlConvertir(st), false, String(st));
  }
});

test('gratis da acceso y todo menos varias sedes, como Founding Studio de pago', async () => {
  const { tieneFeature, entitlementsDe, suscripcionActiva } = await import('./entitlements.ts');
  const gratis = { plan: 'BASE', subscriptionStatus: 'gratis' };
  assert.equal(suscripcionActiva('gratis'), true);
  for (const f of ['gamificacion', 'marketing', 'ia', 'decisiones', 'marca', 'sustitucionesAutonomas', 'asistente'] as const) {
    assert.equal(tieneFeature(gratis, f), true, f);
  }
  assert.equal(tieneFeature(gratis, 'multiCentro'), false);
  assert.equal(entitlementsDe(gratis).maxSocios, 150);
  assert.equal(entitlementsDe(gratis).consultasAsistenteMes, 50);
  // Founding Studio de pago (29 €) incluye lo mismo (decisión del 15-oct ~01:30).
  assert.equal(tieneFeature({ plan: 'BASE', subscriptionStatus: 'active' }, 'decisiones'), true);
  assert.equal(tieneFeature({ plan: 'BASE', subscriptionStatus: 'active' }, 'multiCentro'), false);
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
  const e = estadoGratis({ uso: uso({ alumnasActivas: 90, reservas30Dias: 50 }), excedidoDesde: '2026-09-01', hoy: '2026-11-15' });
  assert.equal(e.fase, 'CERRADO');
  assert.deepEqual(e.motivos, []);
  // Sin cifras y con el margen acabado, también cerrado.
  assert.equal(estadoGratis({ uso: null, excedidoDesde: '2026-09-01', hoy: '2026-11-15' }).fase, 'CERRADO');
});

test('las reservas cuentan en 30 días, no por mes natural: el día 1 no reinicia nada', () => {
  assert.equal(estadoGratis({ uso: uso({ reservas30Dias: 260 }), excedidoDesde: '2026-10-28', hoy: '2026-11-01' }).fase, 'MARGEN');
});

test('al pasarse de cualquiera de los dos límites, Founding Studio de pago: el gratis no manda a nadie a Estudio', async () => {
  const mod = await import('./plan-gratis.ts');
  // Ya no existe una regla que elija Estudio por tener más alumnas (fundador, 15-oct-2026, 08:30).
  assert.equal('planQueToca' in mod, false);
  assert.equal('puedeContratarFounding' in mod, false);
  for (const u of [uso({ alumnasActivas: 151 }), uso({ reservas30Dias: 251 }), uso({ alumnasActivas: 400, reservas30Dias: 900 })]) {
    const e = estadoGratis({ uso: u, excedidoDesde: '2026-10-10', hoy: '2026-10-15' });
    assert.equal(e.fase, 'MARGEN');
    assert.equal('planQueToca' in e, false);
  }
  // Founding de pago: lo mismo que el gratis, sin tope de alumnas y sin la app propia (que es de Estudio).
  const { PLAN_ENTITLEMENTS, ENTITLEMENTS_GRATIS } = await import('./entitlements.ts');
  assert.equal(PLAN_ENTITLEMENTS.BASE.maxSocios, Infinity);
  assert.equal(PLAN_ENTITLEMENTS.BASE.features.appPropia, false);
  assert.equal(ENTITLEMENTS_GRATIS.features.appPropia, false);
  assert.equal(PLAN_ENTITLEMENTS.ESTUDIO.features.appPropia, true);
  assert.equal(PLAN_ENTITLEMENTS.CADENA.features.appPropia, true);
});

// ─── El grupo de la dueña: lo comparten el gate y el informe en seco ─────────

test('el grupo: se suma lo de cada estudio y manda la fecha de exceso más antigua', () => {
  assert.deepEqual(sumarUsos([uso({ alumnasActivas: 100, reservas30Dias: 10 }), uso({ alumnasActivas: 60, reservas30Dias: 5 })]), uso({ alumnasActivas: 160, reservas30Dias: 15 }));
  assert.deepEqual(sumarUsos([]), uso());
  assert.equal(excedidoMasAntiguo([null, '2026-10-05', '2026-09-30', null]), '2026-09-30');
  assert.equal(excedidoMasAntiguo([null, null]), null);
});

test('una medición nueva del grupo deja el uso sumado y el margen al día (lo que guarda quien mide)', () => {
  // Trocear no lo hace gratis: 100 + 60 pasa de 150 y el margen empieza hoy.
  assert.deepEqual(medicionDelGrupo([uso({ alumnasActivas: 100 }), uso({ alumnasActivas: 60 })], [null, null], '2026-10-16'),
    { uso: uso({ alumnasActivas: 160 }), excedidoDesde: '2026-10-16' });
  // La fecha de una hermana se hereda mientras siga pasado; vuelto a estar dentro antes del fin del margen, se borra.
  assert.equal(medicionDelGrupo([uso({ alumnasActivas: 160 })], ['2026-10-10', null], '2026-10-16').excedidoDesde, '2026-10-10');
  assert.equal(medicionDelGrupo([uso({ alumnasActivas: 10 })], ['2026-10-10'], '2026-10-16').excedidoDesde, null);
  // Acabado el margen se queda, aunque baje.
  assert.equal(medicionDelGrupo([uso({ alumnasActivas: 10 })], ['2026-09-01'], '2026-10-16').excedidoDesde, '2026-09-01');
});

test('lo guardado de un grupo: sin cifras de todos no hay uso, pero un margen acabado sigue cerrado', () => {
  const medido = (a: number, r: number, excedidoDesde: string | null = null) => ({ alumnasActivas: a, reservas30Dias: r, excedidoDesde, medidoEn: '2026-10-16T08:00:00Z' });
  const sinMedir = { alumnasActivas: null, reservas30Dias: null, excedidoDesde: null, medidoEn: null };
  assert.equal(estadoDeLoGuardado([medido(10, 5)], 1, '2026-10-16').estado.fase, 'DENTRO');
  assert.deepEqual(estadoDeLoGuardado([medido(100, 5), medido(60, 5)], 2, '2026-10-16').estado.uso, uso({ alumnasActivas: 160, reservas30Dias: 10 }));
  // Le falta la fila de un estudio del grupo, o la tiene sin medir: SIN_MEDIR.
  assert.equal(estadoDeLoGuardado([medido(10, 5)], 2, '2026-10-16').estado.fase, 'SIN_MEDIR');
  assert.equal(estadoDeLoGuardado([medido(10, 5), sinMedir], 2, '2026-10-16').estado.fase, 'SIN_MEDIR');
  const cerrado = estadoDeLoGuardado([medido(10, 5, '2026-09-01'), sinMedir], 2, '2026-10-16');
  assert.deepEqual([cerrado.estado.fase, cerrado.excedidoDesde], ['CERRADO', '2026-09-01']);
});
