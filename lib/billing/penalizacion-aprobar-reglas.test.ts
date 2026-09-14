import test from 'node:test';
import assert from 'node:assert/strict';
import type { CobroErrorCode, ResultadoCobro } from './stripe-cobros.ts';
import { leerAvisoCobro } from './resultado-cobro.ts';
import {
  CODIGOS_STRIPE_NO_LISTO,
  DESDE_DETECTADA,
  ESTADOS_QUE_CORRIGE_UN_COBRO,
  TEXTO_COBRADA_INCOMPLETA,
  cuerpoRespuesta,
  decidirAntesDeCobrar,
  escrituraAlCrearRecibo,
  escrituraTrasCobroAutomatico,
  hayQueLeerReciboAntesDeCobrar,
  hayQueReleerRecibo,
  planificarTrasCobro,
  queHaceLaTarjeta,
  resolverEscrituraSinEfecto,
  respaldoAprobacion,
  type EstadoPenalizacion,
  type Escritura,
  type LecturaRecibo,
  type Plan,
} from './penalizacion-aprobar-reglas.ts';

// Aprobar una penalización a mano: la tabla de verdad de «resultado del cobro +
// estado del recibo → estado de la penalización + HTTP + tipo de mensaje».
// La ruta (`app/api/penalizaciones/aprobar`) y el cron solo ejecutan lo que
// sale de aquí.

const ESTADOS: EstadoPenalizacion[] = [
  'DETECTADA', 'OMITIDA_SIN_TARJETA', 'OMITIDA_SIN_CONSENTIMIENTO', 'OMITIDA_COMPENSADA', 'OMITIDA_REVERTIDA',
  'PENDIENTE_APROBACION', 'RECIBO_CREADO', 'COBRADA', 'FALLIDA', 'REEMBOLSADA',
];
const CODIGOS: CobroErrorCode[] = [
  'NO_CONFIGURADO', 'NO_ENCONTRADO', 'NO_PENDIENTE', 'SIN_TARJETA', 'SIN_STRIPE_CONECTADO', 'CUENTA_NO_LISTA',
  'FALLO_COBRO', 'ERROR_TRANSITORIO', 'SUSCRIPCION_PAUSADA', 'MODO_STRIPE_CRUZADO',
];
const CODIGOS_NO_TRANSITORIOS = CODIGOS.filter(c => c !== 'ERROR_TRANSITORIO');
/** Los que SÍ llegan a decidir sobre el recibo: ni transitorio ni «Stripe no está listo». */
const CODIGOS_DE_VEREDICTO = CODIGOS_NO_TRANSITORIOS.filter(c => !CODIGOS_STRIPE_NO_LISTO.includes(c));
const ESTADOS_RECIBO = ['PENDIENTE', 'FALLIDO', 'COBRADO', 'EN_CURSO', 'ANULADA', 'DEVUELTO', null];

const fallo = (errorCode: CobroErrorCode, extra: Partial<ResultadoCobro> = {}): ResultadoCobro =>
  ({ ok: false, errorCode, error: `texto de ${errorCode}`, ...extra });
const leido = (estado: string | null): LecturaRecibo => ({ ok: true, estado });

/** CAS en memoria, igual que `.in('estado', desde)` + contar filas. */
function cas(fila: { estado: string }, e: Escritura): boolean {
  if (!e.desde.includes(fila.estado as EstadoPenalizacion)) return false;
  fila.estado = e.estado;
  return true;
}

// ── Antes de cobrar ─────────────────────────────────────────────────────────

test('antes de cobrar: solo PENDIENTE_APROBACION con recibo sigue adelante', () => {
  assert.equal(decidirAntesDeCobrar({ estado: 'PENDIENTE_APROBACION', reciboId: 'rec-1' }), null);
  assert.equal(decidirAntesDeCobrar({ estado: 'PENDIENTE_APROBACION', reciboId: null })?.desenlace.http, 409);
});

test('antes de cobrar: una ya COBRADA contesta 200 «ya estaba cobrada», sin escribir', () => {
  const p = decidirAntesDeCobrar({ estado: 'COBRADA', reciboId: 'rec-1' });
  assert.deepEqual(p, { escritura: null, desenlace: { tipo: 'YA_COBRADA', http: 200, notificar: false } });
});

test('antes de cobrar: cualquier otro estado es 409 NO_PENDIENTE, sin escribir', () => {
  for (const estado of ESTADOS.filter(e => e !== 'PENDIENTE_APROBACION' && e !== 'COBRADA')) {
    const p = decidirAntesDeCobrar({ estado, reciboId: 'rec-1' });
    assert.equal(p?.desenlace.tipo, 'NO_PENDIENTE', estado);
    assert.equal(p?.desenlace.http, 409, estado);
    assert.equal(p?.escritura, null, estado);
  }
});

test('solo una FALLIDA con recibo hace leer el recibo antes de cobrar', () => {
  assert.equal(hayQueLeerReciboAntesDeCobrar({ estado: 'FALLIDA', reciboId: 'rec-1' }), true);
  assert.equal(hayQueLeerReciboAntesDeCobrar({ estado: 'FALLIDA', reciboId: null }), false);
  for (const estado of ESTADOS.filter(e => e !== 'FALLIDA')) {
    assert.equal(hayQueLeerReciboAntesDeCobrar({ estado, reciboId: 'rec-1' }), false, estado);
  }
});

test('⚠️ FALLIDA con el recibo COBRADO (3DS por enlace, webhook que cerró el recibo) → COBRADA sin cobrar, 200', () => {
  const p = decidirAntesDeCobrar({ estado: 'FALLIDA', reciboId: 'rec-1' }, leido('COBRADO'));
  assert.deepEqual(p?.escritura, { estado: 'COBRADA', desde: ['FALLIDA'] });
  assert.deepEqual(p?.desenlace, { tipo: 'YA_COBRADA', http: 200, notificar: false });
});

test('FALLIDA con el recibo sin cobrar (o ilegible): se mantiene el 409 sin escribir', () => {
  for (const recibo of [...ESTADOS_RECIBO.filter(e => e !== 'COBRADO').map(leido), { ok: false } as const, undefined]) {
    const p = decidirAntesDeCobrar({ estado: 'FALLIDA', reciboId: 'rec-1' }, recibo);
    assert.equal(p?.desenlace.http, 409, JSON.stringify(recibo));
    assert.equal(p?.escritura, null, JSON.stringify(recibo));
  }
});

test('un recibo COBRADO no corrige nada que no sea FALLIDA antes de cobrar', () => {
  for (const estado of ESTADOS.filter(e => e !== 'FALLIDA' && e !== 'PENDIENTE_APROBACION')) {
    assert.equal(decidirAntesDeCobrar({ estado, reciboId: 'rec-1' }, leido('COBRADO'))?.escritura, null, estado);
  }
});

// ── ¿Releer el recibo? ──────────────────────────────────────────────────────

test('se relee el recibo ante todo fallo, transitorio incluido', () => {
  assert.equal(hayQueReleerRecibo({ ok: true }), false);
  assert.equal(hayQueReleerRecibo({ ok: true, aviso: 'COBRADO_SIN_PERSISTIR' }), false);
  for (const c of CODIGOS) assert.equal(hayQueReleerRecibo(fallo(c)), true, c);
});

// ── Tras cobrar ─────────────────────────────────────────────────────────────

test('cobro limpio: COBRADA, 200, notifica', () => {
  const p = planificarTrasCobro({ ok: true, status: 'succeeded', importe: 12 });
  assert.equal(p.escritura?.estado, 'COBRADA');
  assert.deepEqual(p.desenlace, { tipo: 'COBRADA', http: 200, notificar: true });
});

test('adeudo SEPA en processing: mismo desenlace que hoy (COBRADA, 200)', () => {
  const p = planificarTrasCobro({ ok: true, status: 'processing', importe: 12 });
  assert.equal(p.escritura?.estado, 'COBRADA');
  assert.equal(p.desenlace.http, 200);
});

test('⚠️ COBRADA puede corregir un FALLIDA, pero nunca pisa REEMBOLSADA ni una OMITIDA', () => {
  assert.ok(ESTADOS_QUE_CORRIGE_UN_COBRO.includes('PENDIENTE_APROBACION'));
  assert.ok(ESTADOS_QUE_CORRIGE_UN_COBRO.includes('FALLIDA'));
  for (const e of ['COBRADA', 'REEMBOLSADA', 'OMITIDA_SIN_TARJETA', 'OMITIDA_SIN_CONSENTIMIENTO', 'OMITIDA_COMPENSADA', 'OMITIDA_REVERTIDA'] as const) {
    assert.ok(!ESTADOS_QUE_CORRIGE_UN_COBRO.includes(e), e);
  }
});

test('cobrado sin persistir: FALLIDA solo desde PENDIENTE_APROBACION, 202, texto del servidor', () => {
  const p = planificarTrasCobro({ ok: true, aviso: 'COBRADO_SIN_PERSISTIR', error: 'detalle de stripe-cobros', status: 'succeeded' });
  assert.deepEqual(p.escritura, { estado: 'FALLIDA', desde: ['PENDIENTE_APROBACION'] });
  assert.equal(p.desenlace.http, 202);
  assert.equal(p.desenlace.tipo, 'COBRADA_SIN_REGISTRAR');
  assert.equal(p.desenlace.mensaje, 'detalle de stripe-cobros');
  assert.equal(p.desenlace.notificar, false);
  assert.ok(planificarTrasCobro({ ok: true, aviso: 'COBRADO_SIN_PERSISTIR' }).desenlace.mensaje);
});

test('transitorio con el recibo sin cobrar (o sin releer): no se escribe nada y es 503', () => {
  for (const recibo of [undefined, { ok: false } as const, leido('PENDIENTE'), leido('FALLIDO'), leido('EN_CURSO')]) {
    const p = planificarTrasCobro(fallo('ERROR_TRANSITORIO'), recibo);
    assert.equal(p.escritura, null, JSON.stringify(recibo));
    assert.equal(p.desenlace.tipo, 'SIN_CONFIRMAR', JSON.stringify(recibo));
    assert.equal(p.desenlace.http, 503);
    // El texto de stripe-cobros promete «se reintentará solo», que en el camino
    // manual es falso: no se reenvía.
    assert.doesNotMatch(p.desenlace.mensaje ?? '', /reintentará solo/);
  }
});

test('⚠️ excepción DESPUÉS de un cobro que entró (transitorio + recibo COBRADO): COBRADA, texto veraz y aviso', () => {
  const p = planificarTrasCobro(fallo('ERROR_TRANSITORIO'), leido('COBRADO'));
  assert.deepEqual(p.escritura, { estado: 'COBRADA', desde: ESTADOS_QUE_CORRIGE_UN_COBRO });
  assert.deepEqual(p.desenlace, { tipo: 'COBRADA_INCOMPLETA', http: 200, notificar: true });
  // No es «ya estaba cobrada»: este intento sí cobró.
  assert.notEqual(p.desenlace.tipo, 'YA_COBRADA');
  assert.equal(TEXTO_COBRADA_INCOMPLETA, 'Cobrado. No hemos podido completar el resto: revisa el recibo en Cobros.');
});

test('⚠️ F1: NO_PENDIENTE con el recibo ya COBRADO → COBRADA y 200 «ya estaba cobrada», nunca FALLIDA', () => {
  const p = planificarTrasCobro(fallo('NO_PENDIENTE'), leido('COBRADO'));
  assert.deepEqual(p.escritura, { estado: 'COBRADA', desde: ESTADOS_QUE_CORRIGE_UN_COBRO });
  assert.deepEqual(p.desenlace, { tipo: 'YA_COBRADA', http: 200, notificar: false });
});

test('cualquier fallo no transitorio con el recibo COBRADO es «ya estaba cobrada»', () => {
  for (const c of CODIGOS_NO_TRANSITORIOS) {
    const p = planificarTrasCobro(fallo(c), leido('COBRADO'));
    assert.equal(p.escritura?.estado, 'COBRADA', c);
    assert.equal(p.desenlace.tipo, 'YA_COBRADA', c);
  }
});

test('⚠️ Stripe no está listo: no se escribe, sigue pendiente, 503 que la tarjeta deja en pantalla', () => {
  assert.deepEqual([...CODIGOS_STRIPE_NO_LISTO].sort(), ['CUENTA_NO_LISTA', 'MODO_STRIPE_CRUZADO', 'NO_CONFIGURADO', 'SIN_STRIPE_CONECTADO']);
  for (const c of CODIGOS_STRIPE_NO_LISTO) {
    for (const recibo of [undefined, { ok: false } as const, ...ESTADOS_RECIBO.filter(e => e !== 'COBRADO').map(leido)]) {
      const p = planificarTrasCobro(fallo(c), recibo);
      const etiqueta = `${c} / ${JSON.stringify(recibo)}`;
      assert.equal(p.escritura, null, etiqueta);
      assert.equal(p.desenlace.tipo, 'STRIPE_NO_LISTO', etiqueta);
      assert.equal(p.desenlace.http, 503, etiqueta);
      assert.match(p.desenlace.mensaje ?? '', /^No se ha cobrado: .*La penalización sigue pendiente\.$/, etiqueta);
      assert.equal(queHaceLaTarjeta({ error: p.desenlace.mensaje ?? '', status: 503, resultado: 'STRIPE_NO_LISTO' }).quitarFila, false);
    }
  }
});

test('Stripe no está listo: lo del estudio manda a Integraciones; lo de Tentare, no', () => {
  for (const c of ['SIN_STRIPE_CONECTADO', 'CUENTA_NO_LISTA'] as const) {
    assert.match(planificarTrasCobro(fallo(c), leido('PENDIENTE')).desenlace.mensaje ?? '', /Configuración → Integraciones/, c);
  }
  for (const c of ['NO_CONFIGURADO', 'MODO_STRIPE_CRUZADO'] as const) {
    const m = planificarTrasCobro(fallo(c), leido('PENDIENTE')).desenlace.mensaje ?? '';
    assert.doesNotMatch(m, /Integraciones/, c);
    assert.match(m, /No depende de tu estudio/, c);
  }
});

test('sin poder releer el recibo no se da nada por fallido: 503 sin escribir', () => {
  for (const c of CODIGOS_NO_TRANSITORIOS) {
    for (const recibo of [undefined, { ok: false } as const]) {
      const p = planificarTrasCobro(fallo(c), recibo);
      assert.equal(p.escritura, null, c);
      assert.equal(p.desenlace.http, 503, c);
    }
  }
});

test('recibo EN_CURSO (adeudo o remesa saliendo): no se escribe, 409', () => {
  for (const c of CODIGOS_DE_VEREDICTO) {
    const p = planificarTrasCobro(fallo(c), leido('EN_CURSO'));
    assert.equal(p.escritura, null, c);
    assert.equal(p.desenlace.http, 409, c);
  }
});

test('sin tarjeta con el recibo sin cobrar: FALLIDA desde pendiente, 409, y dice que queda no cobrada', () => {
  const p = planificarTrasCobro(fallo('SIN_TARJETA', { error: 'La socia no tiene método de pago guardado' }), leido('PENDIENTE'));
  assert.deepEqual(p.escritura, { estado: 'FALLIDA', desde: ['PENDIENTE_APROBACION'] });
  assert.equal(p.desenlace.tipo, 'NO_COBRABLE');
  assert.equal(p.desenlace.http, 409);
  assert.equal(p.desenlace.mensaje, 'La socia no tiene método de pago guardado. La penalización queda como no cobrada.');
});

test('NO_PENDIENTE con el recibo en otro estado (anulado, devuelto…): FALLIDA desde pendiente, 409', () => {
  for (const estado of ['ANULADA', 'DEVUELTO', null]) {
    const p = planificarTrasCobro(fallo('NO_PENDIENTE'), leido(estado));
    assert.equal(p.escritura?.estado, 'FALLIDA', String(estado));
    assert.equal(p.desenlace.http, 409, String(estado));
  }
});

test('rechazo del `catch` (sin status): 402 sin prometer un reintento que la home ya no ofrece', () => {
  const p = planificarTrasCobro(fallo('FALLO_COBRO', { error: 'No se pudo completar el cobro. Inténtalo de nuevo más tarde.' }), leido('PENDIENTE'));
  assert.equal(p.desenlace.http, 402);
  assert.equal(p.desenlace.tipo, 'RECHAZADA');
  assert.doesNotMatch(p.desenlace.mensaje ?? '', /Inténtalo de nuevo/);
  assert.match(p.desenlace.mensaje ?? '', /queda como no cobrada/);
});

test('3DS (FALLO_COBRO con status): 402 conservando el texto útil del servidor', () => {
  const p = planificarTrasCobro(fallo('FALLO_COBRO', { status: 'requires_action', error: 'El banco pidió autenticación adicional (3DS).' }), leido('PENDIENTE'));
  assert.equal(p.desenlace.http, 402);
  assert.match(p.desenlace.mensaje ?? '', /^El banco pidió autenticación adicional \(3DS\)\. La penalización/);
});

test('tabla completa: códigos HTTP acotados, FALLIDA solo desde pendiente, COBRADA nunca en `desde`', () => {
  const casos: Array<[ResultadoCobro, LecturaRecibo | undefined]> = [
    [{ ok: true, status: 'succeeded' }, undefined],
    [{ ok: true, status: 'processing' }, undefined],
    [{ ok: true, aviso: 'COBRADO_SIN_PERSISTIR' }, undefined],
  ];
  for (const c of CODIGOS) {
    casos.push([fallo(c), undefined], [fallo(c), { ok: false }]);
    for (const e of ESTADOS_RECIBO) casos.push([fallo(c), leido(e)]);
  }
  for (const [cobro, recibo] of casos) {
    const etiqueta = `${JSON.stringify(cobro)} / ${JSON.stringify(recibo)}`;
    const { escritura, desenlace } = planificarTrasCobro(cobro, recibo);
    assert.ok([200, 202, 402, 409, 503].includes(desenlace.http), etiqueta);
    if (desenlace.http >= 400) assert.ok(desenlace.mensaje, etiqueta);
    if (escritura) {
      assert.ok(!escritura.desde.includes('COBRADA'), etiqueta);
      if (escritura.estado === 'FALLIDA') assert.deepEqual(escritura.desde, ['PENDIENTE_APROBACION'], etiqueta);
    }
    // Solo notifica quien acaba de cobrar.
    assert.equal(desenlace.notificar, desenlace.tipo === 'COBRADA' || desenlace.tipo === 'COBRADA_INCOMPLETA', etiqueta);
    // Un 503 no escribe: la penalización sigue pendiente para reintentar.
    if (desenlace.http === 503) assert.equal(escritura, null, etiqueta);
    // Stripe no listo nunca termina la penalización.
    if (!cobro.ok && cobro.errorCode && CODIGOS_STRIPE_NO_LISTO.includes(cobro.errorCode)) {
      assert.ok(escritura === null || escritura.estado === 'COBRADA', etiqueta);
    }
  }
});

// ── El compare-and-set no tocó ninguna fila ─────────────────────────────────

const PLAN_COBRADA = planificarTrasCobro({ ok: true, status: 'succeeded' });
const PLAN_YA_COBRADA = planificarTrasCobro(fallo('NO_PENDIENTE'), leido('COBRADO'));
const PLAN_FALLIDA_402 = planificarTrasCobro(fallo('FALLO_COBRO'), leido('PENDIENTE'));
const PLAN_FALLIDA_202 = planificarTrasCobro({ ok: true, aviso: 'COBRADO_SIN_PERSISTIR' });
const PLAN_INCOMPLETA = planificarTrasCobro(fallo('ERROR_TRANSITORIO'), leido('COBRADO'));

test('⚠️ íbamos a escribir FALLIDA y otra petición ya la dejó COBRADA: 200 «ya estaba cobrada»', () => {
  assert.equal(resolverEscrituraSinEfecto(PLAN_FALLIDA_402, 'COBRADA').tipo, 'YA_COBRADA');
  assert.equal(resolverEscrituraSinEfecto(PLAN_FALLIDA_202, 'COBRADA').tipo, 'YA_COBRADA');
});

test('íbamos a escribir COBRADA y ya lo estaba: se mantiene nuestro desenlace', () => {
  assert.deepEqual(resolverEscrituraSinEfecto(PLAN_COBRADA, 'COBRADA'), PLAN_COBRADA.desenlace);
  assert.deepEqual(resolverEscrituraSinEfecto(PLAN_YA_COBRADA, 'COBRADA'), PLAN_YA_COBRADA.desenlace);
  assert.deepEqual(resolverEscrituraSinEfecto(PLAN_INCOMPLETA, 'COBRADA'), PLAN_INCOMPLETA.desenlace);
});

test('el dinero entró y la penalización no se pudo marcar COBRADA: 202, nunca 200', () => {
  const planFallidaCorregida = decidirAntesDeCobrar({ estado: 'FALLIDA', reciboId: 'rec-1' }, leido('COBRADO'));
  assert.ok(planFallidaCorregida);
  for (const actual of ['OMITIDA_REVERTIDA', 'REEMBOLSADA', 'PENDIENTE_APROBACION', null]) {
    for (const plan of [PLAN_COBRADA, PLAN_YA_COBRADA, PLAN_INCOMPLETA, planFallidaCorregida]) {
      const d = resolverEscrituraSinEfecto(plan, actual);
      assert.equal(d.http, 202, String(actual));
      assert.equal(d.notificar, false);
    }
  }
});

test('FALLIDA sin efecto tras un cobro que sí entró sigue siendo 202', () => {
  assert.equal(resolverEscrituraSinEfecto(PLAN_FALLIDA_202, 'PENDIENTE_APROBACION').http, 202);
  assert.equal(resolverEscrituraSinEfecto(PLAN_FALLIDA_202, null).http, 202);
});

test('FALLIDA sin efecto tras un rechazo: 409 si otro la cambió, 503 si no se pudo releer', () => {
  assert.equal(resolverEscrituraSinEfecto(PLAN_FALLIDA_402, 'REEMBOLSADA').http, 409);
  assert.equal(resolverEscrituraSinEfecto(PLAN_FALLIDA_402, 'OMITIDA_REVERTIDA').http, 409);
  assert.equal(resolverEscrituraSinEfecto(PLAN_FALLIDA_402, null).http, 503);
});

test('un plan sin escritura se devuelve tal cual', () => {
  const plan: Plan = planificarTrasCobro(fallo('ERROR_TRANSITORIO'));
  assert.deepEqual(resolverEscrituraSinEfecto(plan, 'COBRADA'), plan.desenlace);
});

// ── Las carreras, de punta a punta ──────────────────────────────────────────

/** Lo que hace la ruta con un plan: CAS y, si no toca nada, releer y resolver. */
function ejecutar(fila: { estado: string }, plan: Plan) {
  if (!plan.escritura || cas(fila, plan.escritura)) return plan.desenlace;
  return resolverEscrituraSinEfecto(plan, fila.estado);
}

test('⚠️ carrera de F1: B (NO_PENDIENTE) escribe antes que A (cobró) → queda COBRADA y los dos contestan 200', () => {
  const fila = { estado: 'PENDIENTE_APROBACION' };
  const b = ejecutar(fila, planificarTrasCobro(fallo('NO_PENDIENTE'), leido('COBRADO')));
  const a = ejecutar(fila, planificarTrasCobro({ ok: true, status: 'succeeded' }));
  assert.equal(fila.estado, 'COBRADA');
  assert.equal(b.tipo, 'YA_COBRADA');
  assert.equal(a.tipo, 'COBRADA');
  assert.equal(a.notificar, true);
});

test('⚠️ carrera: A escribe COBRADA antes y B trae un rechazo → COBRADA se queda', () => {
  const fila = { estado: 'PENDIENTE_APROBACION' };
  ejecutar(fila, planificarTrasCobro({ ok: true, status: 'succeeded' }));
  const b = ejecutar(fila, planificarTrasCobro(fallo('FALLO_COBRO'), leido('PENDIENTE')));
  assert.equal(fila.estado, 'COBRADA');
  assert.equal(b.tipo, 'YA_COBRADA');
});

test('carrera: B deja FALLIDA mientras A sigue cobrando y A confirma después → COBRADA', () => {
  const fila = { estado: 'PENDIENTE_APROBACION' };
  ejecutar(fila, planificarTrasCobro(fallo('FALLO_COBRO'), leido('PENDIENTE')));
  assert.equal(fila.estado, 'FALLIDA');
  const a = ejecutar(fila, planificarTrasCobro({ ok: true, status: 'succeeded' }));
  assert.equal(fila.estado, 'COBRADA');
  assert.equal(a.http, 200);
});

test('una FALLIDA cuyo recibo se cobró después se corrige una sola vez: la segunda ya es COBRADA', () => {
  const fila = { estado: 'FALLIDA' };
  const primera = ejecutar(fila, decidirAntesDeCobrar({ estado: fila.estado, reciboId: 'rec-1' }, leido('COBRADO'))!);
  assert.equal(fila.estado, 'COBRADA');
  assert.equal(primera.tipo, 'YA_COBRADA');
  const segunda = decidirAntesDeCobrar({ estado: fila.estado, reciboId: 'rec-1' });
  assert.deepEqual(segunda?.escritura, null);
  assert.equal(segunda?.desenlace.tipo, 'YA_COBRADA');
});

// ── El cron ─────────────────────────────────────────────────────────────────

test('cron: al crear el recibo, RECIBO_CREADO o PENDIENTE_APROBACION y solo desde DETECTADA', () => {
  assert.deepEqual(DESDE_DETECTADA, ['DETECTADA']);
  assert.deepEqual(escrituraAlCrearRecibo(true), { estado: 'RECIBO_CREADO', desde: ['DETECTADA'] });
  assert.deepEqual(escrituraAlCrearRecibo(false), { estado: 'PENDIENTE_APROBACION', desde: ['DETECTADA'] });
});

test('cron: tras cobrar, mismo criterio de siempre (limpio → COBRADA; si no, FALLIDA) con CAS', () => {
  assert.equal(escrituraTrasCobroAutomatico({ ok: true }).estado, 'COBRADA');
  assert.deepEqual(escrituraTrasCobroAutomatico({ ok: true, aviso: 'COBRADO_SIN_PERSISTIR' }), { estado: 'FALLIDA', desde: ['RECIBO_CREADO'] });
  assert.deepEqual(escrituraTrasCobroAutomatico({ ok: false }), { estado: 'FALLIDA', desde: ['RECIBO_CREADO'] });
  assert.deepEqual(escrituraTrasCobroAutomatico({ ok: true }).desde, ESTADOS_QUE_CORRIGE_UN_COBRO);
});

test('⚠️ cron: dos pasadas solapadas no devuelven una COBRADA a PENDIENTE ni la pisan con FALLIDA', () => {
  const fila = { estado: 'DETECTADA' };
  // Pasada 1: recibo creado y cobrada.
  assert.equal(cas(fila, escrituraAlCrearRecibo(true)), true);
  assert.equal(cas(fila, escrituraTrasCobroAutomatico({ ok: true })), true);
  assert.equal(fila.estado, 'COBRADA');
  // Pasada 2, que leyó la fila cuando aún era DETECTADA: no toca nada.
  assert.equal(cas(fila, escrituraAlCrearRecibo(true)), false);
  assert.equal(cas(fila, escrituraAlCrearRecibo(false)), false);
  assert.equal(cas(fila, escrituraTrasCobroAutomatico({ ok: false })), false);
  assert.equal(fila.estado, 'COBRADA');
});

test('cron: una penalización revertida por el trigger entre SELECT y UPDATE ni se reescribe ni se cobra', () => {
  const fila = { estado: 'OMITIDA_REVERTIDA' };
  assert.equal(cas(fila, escrituraAlCrearRecibo(true)), false);
  assert.equal(cas(fila, { estado: 'OMITIDA_SIN_TARJETA', desde: DESDE_DETECTADA }), false);
  assert.equal(fila.estado, 'OMITIDA_REVERTIDA');
});

// ── Cuerpo de la respuesta ──────────────────────────────────────────────────

test('cuerpo: el 202 lo reconoce `leerAvisoCobro`; los 200 llevan `resultado`; los errores también', () => {
  assert.ok(leerAvisoCobro(cuerpoRespuesta(PLAN_FALLIDA_202.desenlace, 'succeeded')));
  assert.deepEqual(cuerpoRespuesta(PLAN_COBRADA.desenlace, 'succeeded'), { ok: true, resultado: 'COBRADA', status: 'succeeded' });
  assert.deepEqual(cuerpoRespuesta(PLAN_YA_COBRADA.desenlace), { ok: true, resultado: 'YA_COBRADA' });
  assert.deepEqual(cuerpoRespuesta(PLAN_INCOMPLETA.desenlace), { ok: true, resultado: 'COBRADA_INCOMPLETA' });
  assert.equal(leerAvisoCobro(cuerpoRespuesta(PLAN_COBRADA.desenlace)), null);
  const err = cuerpoRespuesta(PLAN_FALLIDA_402.desenlace);
  assert.equal(err.ok, undefined);
  assert.equal(typeof err.error, 'string');
  const noListo = cuerpoRespuesta(planificarTrasCobro(fallo('SIN_STRIPE_CONECTADO')).desenlace);
  assert.equal(noListo.resultado, 'STRIPE_NO_LISTO');
});

// ── La tarjeta ──────────────────────────────────────────────────────────────

test('tarjeta: sin respuesta o 5xx se queda la fila con el texto de reintento (nunca el del servidor)', () => {
  for (const status of [0, 500, 503, 504]) {
    const t = queHaceLaTarjeta({ error: 'Se reintentará solo con la misma clave', status });
    assert.equal(t.quitarFila, false, String(status));
    assert.equal(t.mensaje, 'No hemos podido confirmar el cobro. Puedes reintentar: si ya entró, no se cobra dos veces.');
  }
});

test('tarjeta: Stripe no listo se queda la fila y enseña el texto del servidor', () => {
  const t = queHaceLaTarjeta({ error: 'No se ha cobrado: revisa Integraciones.', status: 503, resultado: 'STRIPE_NO_LISTO' });
  assert.deepEqual(t, { quitarFila: false, mensaje: 'No se ha cobrado: revisa Integraciones.' });
});

test('tarjeta: 402 y 409 quitan la fila y enseñan el texto del servidor, no «Cobro aprobado»', () => {
  for (const status of [402, 409]) {
    const t = queHaceLaTarjeta({ error: 'Esta penalización ya no está pendiente de aprobación.', status });
    assert.equal(t.quitarFila, true);
    assert.notEqual(t.mensaje, 'Cobro aprobado');
  }
});

test('tarjeta: otros 4xx (sesión, no encontrada) dejan la fila y su texto', () => {
  for (const status of [400, 401, 403, 404]) {
    assert.deepEqual(queHaceLaTarjeta({ error: 'x', status }), { quitarFila: false, mensaje: 'x' });
  }
});

test('tarjeta: 202, cobrada a medias, «ya estaba cobrada» y cobro normal quitan la fila con su texto', () => {
  assert.deepEqual(queHaceLaTarjeta({ ok: true, aviso: 'COBRADO_SIN_PERSISTIR', detalle: 'detalle' }), { quitarFila: true, mensaje: 'detalle' });
  assert.match(queHaceLaTarjeta({ ok: true, aviso: 'COBRADO_SIN_PERSISTIR' }).mensaje, /no ha quedado registrado/);
  const incompleta = queHaceLaTarjeta({ ok: true, incompleta: true });
  assert.deepEqual(incompleta, { quitarFila: true, mensaje: TEXTO_COBRADA_INCOMPLETA });
  assert.doesNotMatch(incompleta.mensaje, /no se ha vuelto a cobrar/);
  const ya = queHaceLaTarjeta({ ok: true, yaCobrada: true });
  assert.equal(ya.quitarFila, true);
  assert.match(ya.mensaje, /ya estaba cobrada/);
  assert.deepEqual(queHaceLaTarjeta({ ok: true }), { quitarFila: true, mensaje: 'Cobro aprobado' });
});

test('respaldo: 402 y 409 tienen texto propio; el resto usa el genérico', () => {
  assert.match(respaldoAprobacion(402) ?? '', /no cobrada/);
  assert.match(respaldoAprobacion(409) ?? '', /ya no está pendiente/);
  assert.equal(respaldoAprobacion(500), null);
});
