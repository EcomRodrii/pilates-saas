import test from 'node:test';
import assert from 'node:assert/strict';
import type { CobroErrorCode, ResultadoCobro } from './stripe-cobros.ts';
import { leerAvisoCobro } from './resultado-cobro.ts';
import {
  BARRIDO_RECIBO_RESUELTO,
  CODIGOS_STRIPE_NO_LISTO,
  DESDE_DETECTADA,
  ESTADOS_QUE_CORRIGE_UN_COBRO,
  ESTADOS_QUE_DEJAN_COBRAR_AL_DUNNING,
  TEXTO_COBRADA_INCOMPLETA,
  VUELTA_A_DETECTADA,
  crearReciboYCobrar,
  cuerpoRespuesta,
  decidirAntesDeCobrar,
  decidirTrasArmar,
  dunningPuedeCobrarPenalizacion,
  escrituraAlCrearRecibo,
  escrituraPorEstadoDelRecibo,
  hayQueLeerReciboAntesDeCobrar,
  hayQueRevisarLiquidacion,
  hayQueReleerRecibo,
  limpiezaTrasCasFallido,
  origenDelRecibo,
  penalizacionDelRecibo,
  planificarCobroAutomatico,
  planificarTrasCobro,
  queHaceLaTarjeta,
  reciboEntraEnDunning,
  reciboQuedaDesarmado,
  resolverEscrituraSinEfecto,
  respaldoAprobacion,
  seguirAlRecibo,
  type AlertaCron,
  type EstadoPenalizacion,
  type Escritura,
  type IoCronPenalizacion,
  type IoPenalizacionSigueAlRecibo,
  type LecturaPuntero,
  type LecturaRecibo,
  type Plan,
  type Reintento,
} from './penalizacion-aprobar-reglas.ts';

// Aprobar una penalización a mano, y el cron que crea su recibo y la cobra: la
// tabla de verdad de «resultado del cobro + estado del recibo → estado de la
// penalización + HTTP + tipo de mensaje», y el orden del cron. La ruta
// (`app/api/penalizaciones/aprobar`) y el cron solo ejecutan lo que sale de aquí.

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

/** Todas las combinaciones de cobro × lectura del recibo. */
function todosLosCasos(): Array<[ResultadoCobro, LecturaRecibo | undefined]> {
  const casos: Array<[ResultadoCobro, LecturaRecibo | undefined]> = [
    [{ ok: true, status: 'succeeded' }, undefined],
    [{ ok: true, status: 'processing' }, undefined],
    [{ ok: true, aviso: 'COBRADO_SIN_PERSISTIR' }, undefined],
  ];
  for (const c of CODIGOS) {
    casos.push([fallo(c), undefined], [fallo(c), { ok: false }]);
    for (const e of ESTADOS_RECIBO) casos.push([fallo(c), leido(e)]);
  }
  return casos;
}

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
  for (const [cobro, recibo] of todosLosCasos()) {
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

// ── Las carreras de la aprobación, de punta a punta ─────────────────────────

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

// ── El cron: decisiones sueltas ─────────────────────────────────────────────

const RID = 'rec-penaliz-pen-1';

test('cron: al crear el recibo, RECIBO_CREADO o PENDIENTE_APROBACION y solo desde DETECTADA', () => {
  assert.deepEqual(DESDE_DETECTADA, ['DETECTADA']);
  assert.deepEqual(escrituraAlCrearRecibo(true), { estado: 'RECIBO_CREADO', desde: ['DETECTADA'] });
  assert.deepEqual(escrituraAlCrearRecibo(false), { estado: 'PENDIENTE_APROBACION', desde: ['DETECTADA'] });
});

test('cron: origen del recibo — creado ahora, ya existía (23505) o error', () => {
  assert.equal(origenDelRecibo(null), 'CREADO');
  assert.equal(origenDelRecibo(undefined), 'CREADO');
  assert.equal(origenDelRecibo({ code: '23505' }), 'YA_EXISTIA');
  assert.equal(origenDelRecibo({ code: '42501' }), 'ERROR');
  assert.equal(origenDelRecibo({}), 'ERROR');
});

test('⚠️ cron: el recibo solo entra en el dunning en automático y con la penalización ya enlazada', () => {
  assert.equal(reciboEntraEnDunning({ automatico: true, casAplicado: true }), true);
  assert.equal(reciboEntraEnDunning({ automatico: true, casAplicado: false }), false);
  assert.equal(reciboEntraEnDunning({ automatico: false, casAplicado: true }), false);
  assert.equal(reciboEntraEnDunning({ automatico: false, casAplicado: false }), false);
});

test('⚠️ cron: CAS fallido → se borra el recibo creado en esta pasada solo si la penalización no apunta a él', () => {
  assert.equal(limpiezaTrasCasFallido({ origen: 'CREADO', reciboId: RID, puntero: { ok: true, reciboId: null } }), 'BORRAR');
  assert.equal(limpiezaTrasCasFallido({ origen: 'CREADO', reciboId: RID, puntero: { ok: true, reciboId: RID } }), 'NADA');
  assert.equal(limpiezaTrasCasFallido({ origen: 'CREADO', reciboId: RID, puntero: { ok: false } }), 'NADA');
});

test('⚠️ cron: un recibo que ya existía (23505) no se borra NUNCA; como mucho se desarma', () => {
  const punteros: LecturaPuntero[] = [
    { ok: true, reciboId: null }, { ok: true, reciboId: RID }, { ok: true, reciboId: 'otro' }, { ok: false },
  ];
  for (const puntero of punteros) {
    assert.notEqual(limpiezaTrasCasFallido({ origen: 'YA_EXISTIA', reciboId: RID, puntero }), 'BORRAR', JSON.stringify(puntero));
  }
  assert.equal(limpiezaTrasCasFallido({ origen: 'YA_EXISTIA', reciboId: RID, puntero: { ok: true, reciboId: null } }), 'DESARMAR');
  assert.equal(limpiezaTrasCasFallido({ origen: 'YA_EXISTIA', reciboId: RID, puntero: { ok: true, reciboId: RID } }), 'NADA');
});

test('⚠️ cron: tras armar, solo se cobra si no puede quedar nada que nadie reintente', () => {
  const COBRAR = { accion: 'COBRAR', alerta: null, reintento: 'DUNNING' };
  const DEVOLVER = { accion: 'DEVOLVER_A_DETECTADA', alerta: 'NO_SE_PUDO_ARMAR' };
  // Armado de verdad, o ya lo estaba (código anterior): el dunning cubre un transitorio.
  assert.deepEqual(decidirTrasArmar({ error: false, tocadas: 1 }), COBRAR);
  assert.deepEqual(decidirTrasArmar({ error: false, tocadas: 0 }, { ok: true, estado: 'PENDIENTE', armado: true }), COBRAR);
  assert.deepEqual(decidirTrasArmar({ error: true, tocadas: 0 }, { ok: true, estado: 'PENDIENTE', armado: true }), COBRAR);
  // El recibo ya no es cobrable: el guardia no cobra y la relectura cierra la penalización.
  for (const estado of ['COBRADO', 'ANULADA', 'EN_CURSO', 'DEVUELTO', null]) {
    assert.deepEqual(
      decidirTrasArmar({ error: false, tocadas: 0 }, { ok: true, estado, armado: false }),
      { accion: 'COBRAR', alerta: 'RECIBO_NO_PENDIENTE_AL_ARMAR', reintento: 'NINGUNO' }, String(estado),
    );
  }
  // Sin confirmar el armado y con el recibo PENDIENTE: no se cobra.
  assert.deepEqual(decidirTrasArmar({ error: true, tocadas: 0 }), DEVOLVER);
  assert.deepEqual(decidirTrasArmar({ error: true, tocadas: 0 }, { ok: false }), DEVOLVER);
  assert.deepEqual(decidirTrasArmar({ error: false, tocadas: 0 }, { ok: true, estado: 'PENDIENTE', armado: false }), DEVOLVER);
  // ⚠️ FALLIDO: armar exige PENDIENTE y nunca va a tocar fila. Devolverlo a DETECTADA
  // era un bucle con alerta cada pasada; cobrarlo, un cargo con clave nueva. Se cierra FALLIDA.
  for (const armado of [false, true]) {
    for (const error of [false, true]) {
      assert.deepEqual(
        decidirTrasArmar({ error, tocadas: 0 }, { ok: true, estado: 'FALLIDO', armado }),
        { accion: 'CERRAR_FALLIDA', alerta: null },
      );
    }
  }
  assert.deepEqual(VUELTA_A_DETECTADA, { estado: 'DETECTADA', desde: ['RECIBO_CREADO'] });
});

test('⚠️ cron: desarmar solo cuenta como hecho si tocó el recibo o la relectura lo confirma', () => {
  assert.equal(reciboQuedaDesarmado({ error: false, tocadas: 1 }), true);
  // Sin fila o con error: manda la relectura.
  for (const desarme of [{ error: false, tocadas: 0 }, { error: true, tocadas: 0 }]) {
    assert.equal(reciboQuedaDesarmado(desarme), false, 'sin relectura no está confirmado');
    assert.equal(reciboQuedaDesarmado(desarme, { ok: false }), false, 'relectura fallida');
    assert.equal(reciboQuedaDesarmado(desarme, { ok: true, estado: 'PENDIENTE', armado: true }), false, 'sigue armado');
    assert.equal(reciboQuedaDesarmado(desarme, { ok: true, estado: 'PENDIENTE', armado: false }), true);
    // El dunning solo cobra PENDIENTE: otro estado (o borrado) ya está fuera, armado o no.
    for (const estado of ['FALLIDO', 'COBRADO', 'EN_CURSO', 'ANULADA', null]) {
      assert.equal(reciboQuedaDesarmado(desarme, { ok: true, estado, armado: true }), true, String(estado));
    }
  }
});

test('cron: tras cobrar decide igual que la aprobación a mano, salvo el adeudo en curso y lo que sigue en el dunning', () => {
  const reintentos: Reintento[] = ['DUNNING', 'NINGUNO'];
  for (const [cobro, recibo] of todosLosCasos()) {
    for (const reintento of reintentos) {
      const etiqueta = `${reintento} ${JSON.stringify(cobro)} / ${JSON.stringify(recibo)}`;
      const manual = planificarTrasCobro(cobro, recibo);
      const auto = planificarCobroAutomatico(cobro, recibo, reintento);
      // La ruta de aprobar usa `planificarTrasCobro`: nunca puede recibir un
      // «adeudo en curso» que su tarjeta leería como «Cobro aprobado» sin escribir nada.
      assert.notEqual(manual.desenlace.tipo, 'ADEUDO_EN_CURSO', etiqueta);
      if (cobro.ok && !cobro.aviso && cobro.status === 'processing') {
        assert.equal(manual.escritura?.estado, 'COBRADA', etiqueta);
        assert.equal(auto.escritura, null, etiqueta);
        assert.deepEqual(auto.desenlace, { tipo: 'ADEUDO_EN_CURSO', http: 200, notificar: false }, etiqueta);
        continue;
      }
      assert.deepEqual(auto.desenlace, manual.desenlace, etiqueta);
      const sigueEnElDunning = reintento === 'DUNNING' && (cobro.errorCode === 'FALLO_COBRO' || cobro.errorCode === 'SIN_TARJETA')
        && recibo?.ok === true && recibo.estado === 'PENDIENTE';
      if (sigueEnElDunning) {
        assert.equal(manual.escritura?.estado, 'FALLIDA', etiqueta);
        assert.equal(auto.escritura, null, etiqueta);
        continue;
      }
      assert.equal(auto.escritura?.estado, manual.escritura?.estado, etiqueta);
      if (auto.escritura?.estado === 'FALLIDA') assert.deepEqual(auto.escritura.desde, ['RECIBO_CREADO'], etiqueta);
      if (auto.escritura?.estado === 'COBRADA') assert.deepEqual(auto.escritura.desde, ESTADOS_QUE_CORRIGE_UN_COBRO, etiqueta);
    }
  }
});

test('⚠️ cron automático: rechazo o sin tarjeta con el recibo en el dunning no se escribe; con el recibo agotado, FALLIDA', () => {
  for (const codigo of ['FALLO_COBRO', 'SIN_TARJETA'] as CobroErrorCode[]) {
    assert.equal(planificarCobroAutomatico(fallo(codigo), leido('PENDIENTE'), 'DUNNING').escritura, null, codigo);
    // El dunning lo agotó entre medias: ya nadie lo reintenta.
    assert.deepEqual(planificarCobroAutomatico(fallo(codigo), leido('FALLIDO'), 'DUNNING').escritura, { estado: 'FALLIDA', desde: ['RECIBO_CREADO'] }, codigo);
  }
  // Si el recibo ya lo cobró otro, manda el recibo.
  assert.equal(planificarCobroAutomatico(fallo('FALLO_COBRO'), leido('COBRADO'), 'DUNNING').escritura?.estado, 'COBRADA');
});

test('⚠️ cron automático: un adeudo SEPA en processing no se da por cobrado ni se avisa; un cobro sin registrar sí queda FALLIDA', () => {
  const enCurso = planificarCobroAutomatico({ ok: true, status: 'processing' }, undefined, 'DUNNING');
  assert.deepEqual(enCurso, { escritura: null, desenlace: { tipo: 'ADEUDO_EN_CURSO', http: 200, notificar: false } });
  const sinRegistrar = planificarCobroAutomatico({ ok: true, status: 'succeeded', aviso: 'COBRADO_SIN_PERSISTIR' }, undefined, 'DUNNING');
  assert.deepEqual(sinRegistrar.escritura, { estado: 'FALLIDA', desde: ['RECIBO_CREADO'] });
  assert.equal(planificarCobroAutomatico({ ok: true, status: 'succeeded' }, undefined, 'DUNNING').escritura?.estado, 'COBRADA');
});

// ── El cron: el orden real, con datos en memoria ────────────────────────────
//
// `crearReciboYCobrar` con un `IoCronPenalizacion` falso que se comporta como
// las consultas del cron (CAS con `.in('estado')`, borrar solo PENDIENTE sin
// armar, el guardia de estado del recibo al cobrar…). Lo que se mira siempre:
// ¿queda algún recibo que el DUNNING cobraría (PENDIENTE y armado) sin que
// cobrar esté decidido? ¿Y algo que NADIE reintentaría sin haber avisado?

interface ReciboMem { estado: string; armado: boolean }
interface Mundo {
  pen: { estado: string; reciboId: string | null };
  recibos: Map<string, ReciboMem>;
  /** Cargos que el guardia del recibo dejó llegar a Stripe. */
  cargos: number;
  avisos: number;
  alertas: AlertaCron[];
  armadoAlCobrar: boolean | null;
}

function mundo(estado = 'DETECTADA', recibo?: ReciboMem, reciboId: string | null = null): Mundo {
  const recibos = new Map<string, ReciboMem>();
  if (recibo) recibos.set(RID, { ...recibo });
  return { pen: { estado, reciboId }, recibos, cargos: 0, avisos: 0, alertas: [], armadoAlCobrar: null };
}

const cobraBien = (m: Mundo): ResultadoCobro => {
  m.recibos.get(RID)!.estado = 'COBRADO';
  return { ok: true, status: 'succeeded' };
};
/** El cargo entró y el UPDATE del recibo falló: sigue PENDIENTE. */
const cobraSinRegistrar = (): ResultadoCobro => ({ ok: true, status: 'succeeded', aviso: 'COBRADO_SIN_PERSISTIR' });
/** Adeudo SEPA enviado: el recibo pasa a EN_CURSO. */
const adeudoEnCurso = (m: Mundo): ResultadoCobro => {
  m.recibos.get(RID)!.estado = 'EN_CURSO';
  return { ok: true, status: 'processing' };
};

interface OpcionesIo {
  cobro?: (m: Mundo) => ResultadoCobro;
  /** Lo que pasa entre el SELECT del cron y su UPDATE (el trigger, otra pasada). */
  antesDelEnlace?: (m: Mundo) => void;
  /** Lo que pasa entre enlazar y armar (alguien en Cobros, otra escritura). */
  antesDeArmar?: (m: Mundo) => void;
  errorInsert?: string;
  errorEnlace?: boolean;
  errorArmar?: boolean;
  errorLecturaArmado?: boolean;
  errorDevolver?: boolean;
  /** El UPDATE de desarmar da error y no toca nada. */
  errorDesarmar?: boolean;
  /** El UPDATE de desarmar se aplica, pero la respuesta llega con error. */
  desarmeSinRespuesta?: boolean;
}

function io(m: Mundo, op: OpcionesIo = {}): IoCronPenalizacion {
  const casMem = (e: Escritura, recibo: boolean) => {
    if (!e.desde.includes(m.pen.estado as EstadoPenalizacion)) return { error: false, tocadas: 0 };
    m.pen = { estado: e.estado, reciboId: recibo ? RID : m.pen.reciboId };
    return { error: false, tocadas: 1 };
  };
  return {
    insertarRecibo: async () => {
      if (op.errorInsert) return { code: op.errorInsert };
      if (m.recibos.has(RID)) return { code: '23505' };
      m.recibos.set(RID, { estado: 'PENDIENTE', armado: false });
      return null;
    },
    enlazarRecibo: async (e) => {
      op.antesDelEnlace?.(m);
      if (op.errorEnlace) return { error: true, tocadas: 0 };
      return casMem(e, true);
    },
    leerPunteroRecibo: async () => ({ ok: true, reciboId: m.pen.reciboId }),
    borrarRecibo: async () => {
      const r = m.recibos.get(RID);
      if (r && r.estado === 'PENDIENTE' && !r.armado) m.recibos.delete(RID);
    },
    desarmarRecibo: async () => {
      if (op.errorDesarmar) return { error: true, tocadas: 0 };
      const r = m.recibos.get(RID);
      const tocadas = r && r.estado === 'PENDIENTE' ? 1 : 0;
      if (r && tocadas) r.armado = false;
      return op.desarmeSinRespuesta ? { error: true, tocadas: 0 } : { error: false, tocadas };
    },
    armarRecibo: async () => {
      op.antesDeArmar?.(m);
      if (op.errorArmar) return { error: true, tocadas: 0 };
      const r = m.recibos.get(RID);
      if (r && r.estado === 'PENDIENTE' && !r.armado) { r.armado = true; return { error: false, tocadas: 1 }; }
      return { error: false, tocadas: 0 };
    },
    leerArmadoRecibo: async () => {
      if (op.errorLecturaArmado) return { ok: false };
      const r = m.recibos.get(RID);
      return { ok: true, estado: r?.estado ?? null, armado: r?.armado ?? false };
    },
    devolverPenalizacion: async (e) => (op.errorDevolver ? { error: true, tocadas: 0 } : casMem(e, false)),
    cobrar: async () => {
      const r = m.recibos.get(RID);
      m.armadoAlCobrar = r?.armado ?? null;
      // El guardia de `cobrarReciboOffSession`: sin recibo, o no PENDIENTE/FALLIDO, no cobra.
      if (!r) return fallo('NO_ENCONTRADO');
      if (r.estado !== 'PENDIENTE' && r.estado !== 'FALLIDO') return fallo('NO_PENDIENTE');
      m.cargos++;
      return (op.cobro ?? cobraBien)(m);
    },
    leerRecibo: async () => ({ ok: true, estado: m.recibos.get(RID)?.estado ?? null }),
    cerrarPenalizacion: async (e) => casMem(e, false),
    leerEstadoPenalizacion: async () => m.pen.estado,
    notificarPago: async () => { m.avisos++; },
    alertar: (motivo) => { m.alertas.push(motivo); },
  };
}

/** ¿Lo cobraría el dunning? PENDIENTE y con `proximo_reintento`. */
const cobrableEnDunning = (m: Mundo) => [...m.recibos.values()].some(r => r.estado === 'PENDIENTE' && r.armado);
/** Lo que cuenta la comprobación de salud `penalizaciones-recibo-sin-programar`. */
const loCuentaLaSalud = (m: Mundo) => {
  const r = m.recibos.get(RID);
  return m.pen.estado === 'RECIBO_CREADO' && r?.estado === 'PENDIENTE' && !r.armado;
};
const trigger = (m: Mundo) => {
  if (m.pen.estado === 'DETECTADA' || m.pen.estado === 'PENDIENTE_APROBACION') m.pen.estado = 'OMITIDA_REVERTIDA';
};

test('⚠️ BLOQUEANTE: el trigger la revierte entre el SELECT y el UPDATE → ni cargo, ni recibo que el dunning cobre', async () => {
  for (const automatico of [true, false]) {
    const m = mundo();
    const r = await crearReciboYCobrar(io(m, { antesDelEnlace: trigger }), { reciboId: RID, automatico });
    assert.deepEqual(r, { paso: 'YA_NO_DETECTADA', limpieza: 'BORRAR' }, String(automatico));
    assert.equal(m.recibos.has(RID), false, 'el recibo creado en esta pasada se borra');
    assert.equal(m.cargos, 0);
    assert.equal(cobrableEnDunning(m), false);
    assert.equal(m.pen.estado, 'OMITIDA_REVERTIDA');
  }
});

test('⚠️ revertida con un recibo de una pasada anterior (23505, incluso armado por el código viejo): no se borra, se desarma', async () => {
  const m = mundo('DETECTADA', { estado: 'PENDIENTE', armado: true });
  const r = await crearReciboYCobrar(io(m, { antesDelEnlace: trigger }), { reciboId: RID, automatico: true });
  assert.deepEqual(r, { paso: 'YA_NO_DETECTADA', limpieza: 'DESARMAR' });
  assert.deepEqual(m.recibos.get(RID), { estado: 'PENDIENTE', armado: false });
  assert.equal(cobrableEnDunning(m), false);
  assert.equal(m.cargos, 0);
});

test('⚠️ dos pasadas solapadas: la segunda no toca el recibo de la primera ni devuelve la COBRADA a pendiente', async () => {
  const m = mundo();
  assert.equal((await crearReciboYCobrar(io(m), { reciboId: RID, automatico: true })).paso, 'COBRO');
  assert.equal(m.pen.estado, 'COBRADA');
  for (const automatico of [true, false]) {
    const r = await crearReciboYCobrar(io(m), { reciboId: RID, automatico });
    assert.deepEqual(r, { paso: 'YA_NO_DETECTADA', limpieza: 'NADA' });
  }
  assert.equal(m.pen.estado, 'COBRADA');
  assert.deepEqual(m.recibos.get(RID), { estado: 'COBRADO', armado: true });
  assert.equal(m.cargos, 1);
});

test('dos pasadas: la segunda llega entre el enlace de la primera y su cobro → no borra ni cobra', async () => {
  const m = mundo();
  m.recibos.set(RID, { estado: 'PENDIENTE', armado: true });
  m.pen = { estado: 'RECIBO_CREADO', reciboId: RID };
  const r = await crearReciboYCobrar(io(m), { reciboId: RID, automatico: true });
  assert.deepEqual(r, { paso: 'YA_NO_DETECTADA', limpieza: 'NADA' });
  assert.deepEqual(m.recibos.get(RID), { estado: 'PENDIENTE', armado: true });
  assert.equal(m.cargos, 0);
});

test('⚠️ modo MANUAL: PENDIENTE_APROBACION con el recibo SIN armar; ni cargo ni dunning', async () => {
  const m = mundo();
  const r = await crearReciboYCobrar(io(m), { reciboId: RID, automatico: false });
  assert.deepEqual(r, { paso: 'ESPERA_APROBACION' });
  assert.equal(m.pen.estado, 'PENDIENTE_APROBACION');
  assert.deepEqual(m.recibos.get(RID), { estado: 'PENDIENTE', armado: false });
  assert.equal(m.cargos, 0);
  assert.equal(cobrableEnDunning(m), false);
});

test('⚠️ modo MANUAL con un recibo previo ya armado (código anterior, o el estudio cambió de modo): se desarma', async () => {
  const m = mundo('DETECTADA', { estado: 'PENDIENTE', armado: true });
  const r = await crearReciboYCobrar(io(m), { reciboId: RID, automatico: false });
  assert.deepEqual(r, { paso: 'ESPERA_APROBACION' });
  assert.equal(m.pen.estado, 'PENDIENTE_APROBACION');
  assert.deepEqual(m.recibos.get(RID), { estado: 'PENDIENTE', armado: false });
  assert.equal(cobrableEnDunning(m), false);
  assert.equal(m.cargos, 0);
});

test('límite documentado: revertida DESPUÉS desde PENDIENTE_APROBACION → el recibo queda en Cobros, pero el dunning no lo cobra', async () => {
  const m = mundo();
  await crearReciboYCobrar(io(m), { reciboId: RID, automatico: false });
  trigger(m);
  assert.equal(m.pen.estado, 'OMITIDA_REVERTIDA');
  assert.equal(m.recibos.get(RID)?.estado, 'PENDIENTE');
  assert.equal(cobrableEnDunning(m), false);
});

test('automático: se arma el dunning ANTES de cobrar, y un cobro limpio cierra COBRADA con aviso', async () => {
  const m = mundo();
  const r = await crearReciboYCobrar(io(m), { reciboId: RID, automatico: true });
  assert.equal(m.armadoAlCobrar, true);
  assert.equal(r.paso === 'COBRO' && r.desenlace.tipo, 'COBRADA');
  assert.equal(m.pen.estado, 'COBRADA');
  assert.equal(m.avisos, 1);
  assert.equal(m.cargos, 1);
  assert.deepEqual(m.alertas, []);
});

test('⚠️ automático: excepción DESPUÉS de cobrar (transitorio con el recibo COBRADO) → COBRADA con aviso, nunca FALLIDA', async () => {
  const m = mundo();
  const r = await crearReciboYCobrar(io(m, {
    cobro: (mm) => { mm.recibos.get(RID)!.estado = 'COBRADO'; return fallo('ERROR_TRANSITORIO'); },
  }), { reciboId: RID, automatico: true });
  assert.equal(r.paso === 'COBRO' && r.desenlace.tipo, 'COBRADA_INCOMPLETA');
  assert.equal(m.pen.estado, 'COBRADA');
  assert.equal(m.avisos, 1);
});

test('⚠️ automático: transitorio de verdad o Stripe no listo → sin FALLIDA; sigue RECIBO_CREADO y armado para el dunning', async () => {
  for (const codigo of ['ERROR_TRANSITORIO', ...CODIGOS_STRIPE_NO_LISTO] as CobroErrorCode[]) {
    const m = mundo();
    await crearReciboYCobrar(io(m, { cobro: () => fallo(codigo) }), { reciboId: RID, automatico: true });
    assert.equal(m.pen.estado, 'RECIBO_CREADO', codigo);
    assert.deepEqual(m.recibos.get(RID), { estado: 'PENDIENTE', armado: true }, codigo);
    assert.equal(m.avisos, 0, codigo);
    assert.equal(loCuentaLaSalud(m), false, codigo);
  }
});

test('⚠️ automático: rechazo real → sigue RECIBO_CREADO con el recibo armado; los reintentos son del dunning', async () => {
  const m = mundo();
  await crearReciboYCobrar(io(m, { cobro: () => fallo('FALLO_COBRO') }), { reciboId: RID, automatico: true });
  assert.equal(m.pen.estado, 'RECIBO_CREADO', 'nunca FALLIDA con el recibo todavía en el ciclo de reintentos');
  assert.deepEqual(m.recibos.get(RID), { estado: 'PENDIENTE', armado: true });
  assert.equal(m.avisos, 0);
  assert.equal(dunningPuedeCobrarPenalizacion({ ok: true, estado: m.pen.estado }), true);
  assert.equal(loCuentaLaSalud(m), false);
});

test('⚠️ armar falla: no se cobra, alerta, vuelve a DETECTADA sin armar, y la pasada siguiente lo cobra una vez', async () => {
  const m = mundo();
  const r = await crearReciboYCobrar(io(m, { errorArmar: true, errorLecturaArmado: true }), { reciboId: RID, automatico: true });
  assert.deepEqual(r, { paso: 'SIN_ARMAR', devuelta: true });
  assert.equal(m.cargos, 0);
  assert.equal(m.pen.estado, 'DETECTADA');
  assert.deepEqual(m.alertas, ['NO_SE_PUDO_ARMAR']);
  assert.equal(cobrableEnDunning(m), false);
  assert.equal(loCuentaLaSalud(m), false);

  const siguiente = await crearReciboYCobrar(io(m), { reciboId: RID, automatico: true });
  assert.equal(siguiente.paso, 'COBRO');
  assert.equal(m.cargos, 1);
  assert.equal(m.pen.estado, 'COBRADA');
  assert.equal(m.recibos.size, 1);
});

test('⚠️ armar falla y devolver también: doble alerta, sin cargo, y queda justo lo que cuenta la salud', async () => {
  const m = mundo();
  const r = await crearReciboYCobrar(
    io(m, { errorArmar: true, errorLecturaArmado: true, errorDevolver: true }), { reciboId: RID, automatico: true },
  );
  assert.deepEqual(r, { paso: 'SIN_ARMAR', devuelta: false });
  assert.deepEqual(m.alertas, ['NO_SE_PUDO_ARMAR', 'NO_SE_PUDO_DEVOLVER']);
  assert.equal(m.cargos, 0);
  assert.equal(cobrableEnDunning(m), false);
  assert.equal(loCuentaLaSalud(m), true);
});

test('armar da error pero el recibo quedó armado (se perdió la respuesta): se cobra, sin alerta', async () => {
  const m = mundo();
  const r = await crearReciboYCobrar(io(m, {
    antesDeArmar: (mm) => { mm.recibos.get(RID)!.armado = true; },
    errorArmar: true,
  }), { reciboId: RID, automatico: true });
  assert.equal(r.paso, 'COBRO');
  assert.equal(m.cargos, 1);
  assert.deepEqual(m.alertas, []);
});

test('el recibo se cobró a mano entre enlazar y armar: no se cobra otra vez y la penalización queda COBRADA', async () => {
  const m = mundo();
  const r = await crearReciboYCobrar(io(m, {
    antesDeArmar: (mm) => { mm.recibos.get(RID)!.estado = 'COBRADO'; },
  }), { reciboId: RID, automatico: true });
  assert.equal(r.paso === 'COBRO' && r.desenlace.tipo, 'YA_COBRADA');
  assert.equal(m.cargos, 0);
  assert.equal(m.pen.estado, 'COBRADA');
  assert.deepEqual(m.alertas, ['RECIBO_NO_PENDIENTE_AL_ARMAR']);
});

test('armar falla con un recibo previo ya armado (código anterior): se desarma antes de devolver a DETECTADA', async () => {
  const m = mundo('DETECTADA', { estado: 'PENDIENTE', armado: true });
  const r = await crearReciboYCobrar(io(m, { errorArmar: true, errorLecturaArmado: true }), { reciboId: RID, automatico: true });
  assert.deepEqual(r, { paso: 'SIN_ARMAR', devuelta: true });
  assert.equal(m.pen.estado, 'DETECTADA');
  assert.deepEqual(m.recibos.get(RID), { estado: 'PENDIENTE', armado: false });
  assert.equal(cobrableEnDunning(m), false);
});

test('error al enlazar: se sale sin cobrar y el recibo queda sin armar (nada lo cobra hasta la próxima pasada)', async () => {
  const m = mundo();
  const r = await crearReciboYCobrar(io(m, { errorEnlace: true }), { reciboId: RID, automatico: true });
  assert.deepEqual(r, { paso: 'ERROR_ENLACE' });
  assert.equal(m.cargos, 0);
  assert.equal(m.pen.estado, 'DETECTADA');
  assert.equal(cobrableEnDunning(m), false);
  const siguiente = await crearReciboYCobrar(io(m), { reciboId: RID, automatico: true });
  assert.equal(siguiente.paso, 'COBRO');
  assert.equal(m.cargos, 1);
  assert.equal(m.recibos.size, 1);
});

test('error al insertar el recibo (no 23505): no se toca nada más', async () => {
  const m = mundo();
  const r = await crearReciboYCobrar(io(m, { errorInsert: '42501' }), { reciboId: RID, automatico: true });
  assert.deepEqual(r, { paso: 'ERROR_RECIBO' });
  assert.equal(m.pen.estado, 'DETECTADA');
  assert.equal(m.recibos.size, 0);
  assert.equal(m.cargos, 0);
});

test('invariante: ningún escenario deja un recibo cobrable sin cobro decidido, ni algo que nadie reintente sin alerta', async () => {
  const cobros: Array<(m: Mundo) => ResultadoCobro> = [
    cobraBien, () => fallo('FALLO_COBRO'), () => fallo('ERROR_TRANSITORIO'), () => fallo('SIN_STRIPE_CONECTADO'),
    () => fallo('SIN_TARJETA'), cobraSinRegistrar, adeudoEnCurso,
  ];
  const fallosAlArmar: OpcionesIo[] = [
    {}, { errorArmar: true, errorLecturaArmado: true }, { errorArmar: true, errorLecturaArmado: true, errorDevolver: true },
    // Los tres fallos encadenados: armar, releer y desarmar.
    { errorArmar: true, errorLecturaArmado: true, errorDesarmar: true },
    { errorArmar: true, desarmeSinRespuesta: true },
  ];
  const previos: Array<ReciboMem | undefined> = [
    undefined, { estado: 'PENDIENTE', armado: false }, { estado: 'PENDIENTE', armado: true }, { estado: 'FALLIDO', armado: false },
  ];
  for (const automatico of [true, false]) {
    for (const revertir of [false, true]) {
      for (const previo of previos) {
        for (const cobro of cobros) {
          for (const fallos of fallosAlArmar) {
            const m = mundo('DETECTADA', previo);
            await crearReciboYCobrar(
              io(m, { ...fallos, cobro, antesDelEnlace: revertir ? trigger : undefined }), { reciboId: RID, automatico },
            );
            const etiqueta = `auto=${automatico} revertir=${revertir} previo=${JSON.stringify(previo)} fallos=${JSON.stringify(fallos)}`;
            const decidido = automatico && ['RECIBO_CREADO', 'FALLIDA', 'COBRADA'].includes(m.pen.estado);
            // El cron solo deja un recibo armado sin cobro decidido si no pudo
            // confirmar el desarme, y entonces lo ha avisado.
            if (!decidido && cobrableEnDunning(m)) assert.ok(m.alertas.includes('NO_SE_PUDO_DESARMAR'), etiqueta);
            // Y aun así el dunning no lo cobra: la segunda cerradura.
            if (!decidido) assert.equal(loCobraElDunning(m), false, etiqueta);
            // Nunca a DETECTADA (revertible) con el recibo armado.
            if (m.pen.estado === 'DETECTADA') assert.equal(cobrableEnDunning(m), false, etiqueta);
            if (!automatico || revertir) assert.equal(m.cargos, 0, etiqueta);
            // Nada sin reintentar en silencio: si queda lo que cuenta la salud, se avisó.
            if (loCuentaLaSalud(m)) {
              assert.ok(m.alertas.some(a => a === 'NO_SE_PUDO_DEVOLVER' || a === 'NO_SE_PUDO_DESARMAR'), etiqueta);
            }
            // Una RECIBO_CREADO con el recibo FALLIDO no la reintenta nadie: solo queda
            // así con alerta (y el barrido horario la deja FALLIDA).
            if (m.pen.estado === 'RECIBO_CREADO' && m.recibos.get(RID)?.estado === 'FALLIDO') {
              assert.ok(m.alertas.includes('NO_SE_PUDO_DESARMAR'), etiqueta);
            }
            // ⚠️ Un recibo que ya estaba FALLIDO no se vuelve a cobrar nunca solo.
            if (previo?.estado === 'FALLIDO') assert.equal(m.cargos, 0, etiqueta);
            // Toda FALLIDA sale del dunning (o avisó de que no pudo sacarla).
            if (m.pen.estado === 'FALLIDA' && cobrableEnDunning(m)) assert.ok(m.alertas.includes('NO_SE_PUDO_DESARMAR'), etiqueta);
          }
        }
      }
    }
  }
});

// ── Hueco 2: desarmar sin confirmar ─────────────────────────────────────────

test('⚠️ tres fallos encadenados (armar, releer, desarmar): NO vuelve a DETECTADA, así que el trigger no la puede revertir con el recibo armado', async () => {
  const m = mundo('DETECTADA', { estado: 'PENDIENTE', armado: true });
  const r = await crearReciboYCobrar(
    io(m, { errorArmar: true, errorLecturaArmado: true, errorDesarmar: true }), { reciboId: RID, automatico: true },
  );
  assert.deepEqual(r, { paso: 'SIN_ARMAR', devuelta: false });
  assert.deepEqual(m.alertas, ['NO_SE_PUDO_ARMAR', 'NO_SE_PUDO_DESARMAR']);
  assert.equal(m.cargos, 0);
  assert.equal(m.pen.estado, 'RECIBO_CREADO');
  trigger(m);
  assert.equal(m.pen.estado, 'RECIBO_CREADO', 'el trigger no revierte desde RECIBO_CREADO');
  // Si el dunning lo cobra, lo hace con el cobro ya decidido, y la penalización le sigue.
  assert.equal(loCobraElDunning(m), true);
  await pasadaDunning(m, cobraBien);
  assert.equal(m.pen.estado, 'COBRADA');
  assert.equal(m.avisos, 1);
});

test('tres fallos encadenados con un recibo sin armar: queda justo lo que cuenta la salud, con alerta', async () => {
  const m = mundo('DETECTADA', { estado: 'PENDIENTE', armado: false });
  await crearReciboYCobrar(io(m, { errorArmar: true, errorLecturaArmado: true, errorDesarmar: true }), { reciboId: RID, automatico: true });
  assert.equal(m.pen.estado, 'RECIBO_CREADO');
  assert.equal(loCuentaLaSalud(m), true);
  assert.ok(m.alertas.includes('NO_SE_PUDO_DESARMAR'));
});

test('el desarme se aplicó pero la respuesta llegó con error: la relectura lo confirma y vuelve a DETECTADA', async () => {
  const m = mundo('DETECTADA', { estado: 'PENDIENTE', armado: false });
  const r = await crearReciboYCobrar(io(m, { errorArmar: true, desarmeSinRespuesta: true }), { reciboId: RID, automatico: true });
  assert.deepEqual(r, { paso: 'SIN_ARMAR', devuelta: true });
  assert.deepEqual(m.alertas, ['NO_SE_PUDO_ARMAR']);
  assert.equal(m.pen.estado, 'DETECTADA');
  assert.equal(cobrableEnDunning(m), false);
});

test('⚠️ revertida con un recibo previo armado y el desarme sin confirmar: alerta, y el dunning tampoco lo cobra', async () => {
  const m = mundo('DETECTADA', { estado: 'PENDIENTE', armado: true });
  const r = await crearReciboYCobrar(
    io(m, { antesDelEnlace: trigger, errorDesarmar: true, errorLecturaArmado: true }), { reciboId: RID, automatico: true },
  );
  assert.deepEqual(r, { paso: 'YA_NO_DETECTADA', limpieza: 'DESARMAR' });
  assert.deepEqual(m.alertas, ['NO_SE_PUDO_DESARMAR']);
  assert.equal(m.pen.estado, 'OMITIDA_REVERTIDA');
  assert.equal(cobrableEnDunning(m), true);
  assert.equal(await pasadaDunning(m, cobraBien), 'OMITIDO');
  assert.equal(m.cargos, 0);
});

test('modo manual con un recibo previo armado y el desarme sin confirmar: alerta, y el dunning no cobra una PENDIENTE_APROBACION', async () => {
  const m = mundo('DETECTADA', { estado: 'PENDIENTE', armado: true });
  const r = await crearReciboYCobrar(io(m, { errorDesarmar: true, errorLecturaArmado: true }), { reciboId: RID, automatico: false });
  assert.deepEqual(r, { paso: 'ESPERA_APROBACION' });
  assert.deepEqual(m.alertas, ['NO_SE_PUDO_DESARMAR']);
  assert.equal(await pasadaDunning(m, cobraBien), 'OMITIDO');
  assert.equal(m.cargos, 0);
});

// ── Hueco 3: DETECTADA con el recibo FALLIDO ────────────────────────────────

test('⚠️ DETECTADA con el recibo FALLIDO: FALLIDA SIN cobrar, sin alerta, y la pasada siguiente ya no la ve', async () => {
  const m = mundo('DETECTADA', { estado: 'FALLIDO', armado: false });
  const r = await crearReciboYCobrar(io(m), { reciboId: RID, automatico: true });
  assert.deepEqual(r, { paso: 'RECIBO_FALLIDO', cerrada: true });
  assert.equal(m.cargos, 0, 'tras agotar los reintentos la clave es nueva: cobrarlo sería un cargo nuevo');
  assert.equal(m.pen.estado, 'FALLIDA');
  assert.equal(m.avisos, 0);
  assert.deepEqual(m.alertas, []);
  assert.deepEqual(await crearReciboYCobrar(io(m), { reciboId: RID, automatico: true }), { paso: 'YA_NO_DETECTADA', limpieza: 'NADA' });
  assert.equal(m.cargos, 0);
  // Si alguien lo cobra después desde Cobros, la penalización le sigue.
  m.recibos.get(RID)!.estado = 'COBRADO';
  assert.deepEqual(await seguirAlRecibo(ioSeguimiento(m)), { paso: 'ESCRITA', estado: 'COBRADA', notificada: true });
});

test('modo manual con el recibo FALLIDO: espera aprobación, sin cobrar ni alertar', async () => {
  const m = mundo('DETECTADA', { estado: 'FALLIDO', armado: false });
  const r = await crearReciboYCobrar(io(m), { reciboId: RID, automatico: false });
  assert.deepEqual(r, { paso: 'ESPERA_APROBACION' });
  assert.equal(m.cargos, 0);
  assert.deepEqual(m.alertas, []);
});

// ── Hueco 1: el dunning y la penalización ───────────────────────────────────

test('recibo de penalización: el id de la penalización sale del id del recibo', () => {
  assert.equal(penalizacionDelRecibo(RID), 'pen-1');
  assert.equal(penalizacionDelRecibo('rec-penaliz-'), null);
  assert.equal(penalizacionDelRecibo('rec-renov-sus-1-2026-09'), null);
  assert.equal(penalizacionDelRecibo('x-rec-penaliz-pen-1'), null);
});

test('⚠️ el dunning solo cobra el recibo de una penalización con el cobro decidido (o un SEPA que falló después)', () => {
  assert.deepEqual(ESTADOS_QUE_DEJAN_COBRAR_AL_DUNNING, ['RECIBO_CREADO', 'COBRADA']);
  for (const estado of ESTADOS) {
    assert.equal(
      dunningPuedeCobrarPenalizacion({ ok: true, estado }), estado === 'RECIBO_CREADO' || estado === 'COBRADA', estado,
    );
  }
  assert.equal(dunningPuedeCobrarPenalizacion({ ok: true, estado: null }), false, 'no existe o no apunta al recibo');
  assert.equal(dunningPuedeCobrarPenalizacion({ ok: false }), false, 'ilegible: se omite');
});

test('el estado del recibo decide: COBRADO → COBRADA, FALLIDO → FALLIDA desde RECIBO_CREADO o COBRADA, el resto no resuelve', () => {
  assert.deepEqual(escrituraPorEstadoDelRecibo('COBRADO'), { estado: 'COBRADA', desde: ESTADOS_QUE_CORRIGE_UN_COBRO });
  assert.deepEqual(escrituraPorEstadoDelRecibo('FALLIDO'), { estado: 'FALLIDA', desde: ['RECIBO_CREADO', 'COBRADA'] });
  for (const estado of ['PENDIENTE', 'EN_CURSO', 'ANULADA', 'DEVUELTO', null]) {
    assert.equal(escrituraPorEstadoDelRecibo(estado), null, String(estado));
  }
});

test('⚠️ el barrido nunca busca lo que no puede escribir (si no, lo encontraría cada hora) ni una DETECTADA', () => {
  for (const { estadoRecibo, estados } of BARRIDO_RECIBO_RESUELTO) {
    const escritura = escrituraPorEstadoDelRecibo(estadoRecibo);
    assert.ok(escritura, estadoRecibo);
    for (const estado of estados) {
      assert.ok(escritura.desde.includes(estado), `${estadoRecibo}/${estado}`);
      assert.notEqual(estado, 'DETECTADA');
      assert.notEqual(estado, escritura.estado);
    }
  }
});

/** `seguirAlRecibo` sobre el mundo en memoria. */
function ioSeguimiento(m: Mundo, op: { errorLecturaRecibo?: boolean; errorCierre?: boolean; errorLecturaPen?: boolean } = {}): IoPenalizacionSigueAlRecibo {
  return {
    leerRecibo: async () => (op.errorLecturaRecibo ? { ok: false } : { ok: true, estado: m.recibos.get(RID)?.estado ?? null }),
    cerrarPenalizacion: async (e) => {
      if (op.errorCierre) return { error: true, tocadas: 0 };
      if (!cas(m.pen, e)) return { error: false, tocadas: 0 };
      return { error: false, tocadas: 1 };
    },
    leerEstadoPenalizacion: async () => (op.errorLecturaPen ? null : m.pen.estado),
    notificarPago: async () => { m.avisos++; },
  };
}

/** Lo que el dunning haría con el recibo: si es candidato, guardia, cobro, fallo registrado y seguimiento. */
async function pasadaDunning(m: Mundo, cobro: (m: Mundo) => ResultadoCobro, agotaReintentos = false) {
  if (!cobrableEnDunning(m)) return 'NO_CANDIDATO';
  if (!dunningPuedeCobrarPenalizacion({ ok: true, estado: m.pen.estado })) return 'OMITIDO';
  m.cargos++;
  const res = cobro(m);
  const r = m.recibos.get(RID)!;
  if (!res.ok && res.errorCode === 'FALLO_COBRO' && agotaReintentos) { r.estado = 'FALLIDO'; r.armado = false; }
  await seguirAlRecibo(ioSeguimiento(m));
  return 'INTENTADO';
}

/** ¿Lo cobraría de verdad el dunning, con su guardia de penalización? */
const loCobraElDunning = (m: Mundo) => cobrableEnDunning(m) && dunningPuedeCobrarPenalizacion({ ok: true, estado: m.pen.estado });

test('⚠️ HUECO 1: el cron no cobra, el dunning sí → la penalización queda COBRADA con aviso', async () => {
  const m = mundo();
  await crearReciboYCobrar(io(m, { cobro: () => fallo('FALLO_COBRO') }), { reciboId: RID, automatico: true });
  assert.equal(m.pen.estado, 'RECIBO_CREADO');
  // Primer reintento del dunning: rechazo, se reprograma. Nada que reflejar.
  assert.equal(await pasadaDunning(m, () => fallo('FALLO_COBRO')), 'INTENTADO');
  assert.equal(m.pen.estado, 'RECIBO_CREADO');
  // Segundo: entra.
  await pasadaDunning(m, cobraBien);
  assert.equal(m.pen.estado, 'COBRADA');
  assert.equal(m.avisos, 1);
});

test('⚠️ HUECO 1: el dunning agota los reintentos → la penalización queda FALLIDA, y el barrido ya no la vuelve a ver', async () => {
  const m = mundo();
  await crearReciboYCobrar(io(m, { cobro: () => fallo('FALLO_COBRO') }), { reciboId: RID, automatico: true });
  await pasadaDunning(m, () => fallo('FALLO_COBRO'), true);
  assert.equal(m.pen.estado, 'FALLIDA');
  assert.equal(m.avisos, 0);
  assert.equal(cobrableEnDunning(m), false);
  const barridoLaVe = BARRIDO_RECIBO_RESUELTO.some(b => b.estadoRecibo === m.recibos.get(RID)?.estado && b.estados.includes(m.pen.estado as EstadoPenalizacion));
  assert.equal(barridoLaVe, false);
});

test('FALLIDA con el recibo armado (no debería existir: el cron lo desarma): el dunning no la cobra', async () => {
  const m = mundo('FALLIDA', { estado: 'PENDIENTE', armado: true }, RID);
  assert.equal(await pasadaDunning(m, cobraBien), 'OMITIDO');
  assert.equal(m.cargos, 0);
});

test('⚠️ cobro que entró sin quedar registrado: FALLIDA, el recibo SALE del dunning, y cuando el webhook lo marca COBRADO pasa a COBRADA', async () => {
  const m = mundo();
  const r = await crearReciboYCobrar(io(m, { cobro: cobraSinRegistrar }), { reciboId: RID, automatico: true });
  assert.equal(r.paso === 'COBRO' && r.desenlace.tipo, 'COBRADA_SIN_REGISTRAR');
  assert.equal(m.pen.estado, 'FALLIDA');
  assert.deepEqual(m.recibos.get(RID), { estado: 'PENDIENTE', armado: false }, 'pasadas ~24 h, reintentarlo sería un cargo nuevo');
  assert.equal(await pasadaDunning(m, cobraBien), 'NO_CANDIDATO');
  m.recibos.get(RID)!.estado = 'COBRADO'; // el webhook
  await seguirAlRecibo(ioSeguimiento(m));
  assert.equal(m.pen.estado, 'COBRADA');
  assert.equal(m.cargos, 1);
});

test('⚠️ sin tarjeta en el cron: sigue RECIBO_CREADO y armado; cuando la socia guarda tarjeta, el dunning cobra', async () => {
  const m = mundo();
  await crearReciboYCobrar(io(m, { cobro: () => fallo('SIN_TARJETA') }), { reciboId: RID, automatico: true });
  assert.equal(m.pen.estado, 'RECIBO_CREADO');
  assert.deepEqual(m.recibos.get(RID), { estado: 'PENDIENTE', armado: true });
  assert.equal(await pasadaDunning(m, () => fallo('SIN_TARJETA')), 'INTENTADO');
  assert.equal(m.pen.estado, 'RECIBO_CREADO');
  await pasadaDunning(m, cobraBien);
  assert.equal(m.pen.estado, 'COBRADA');
  assert.equal(m.avisos, 1);
});

test('⚠️ BLOQUEANTE B2: adeudo SEPA en processing en el cron → RECIBO_CREADO sin aviso; si falla, el dunning lo persigue; si entra, COBRADA', async () => {
  for (const entra of [true, false]) {
    const m = mundo();
    const r = await crearReciboYCobrar(io(m, { cobro: adeudoEnCurso }), { reciboId: RID, automatico: true });
    assert.equal(r.paso === 'COBRO' && r.desenlace.tipo, 'ADEUDO_EN_CURSO');
    assert.equal(m.pen.estado, 'RECIBO_CREADO');
    assert.equal(m.avisos, 0);
    assert.equal((await seguirAlRecibo(ioSeguimiento(m))).paso, 'RECIBO_SIN_RESOLVER', 'EN_CURSO no prueba nada');
    const rec = m.recibos.get(RID)!;
    if (entra) {
      rec.estado = 'COBRADO'; // webhook payment_intent.succeeded
      await seguirAlRecibo(ioSeguimiento(m));
      assert.equal(m.pen.estado, 'COBRADA');
      assert.equal(m.avisos, 1);
    } else {
      rec.estado = 'PENDIENTE'; rec.armado = true; // registrarFalloCobro SEPA
      await pasadaDunning(m, cobraBien);
      assert.equal(m.pen.estado, 'COBRADA');
    }
  }
});

test('⚠️ BLOQUEANTE B2: COBRADA por un processing de la aprobación a mano cuyo adeudo falla → el dunning lo persigue, y si lo agota, FALLIDA con revisión de liquidación', async () => {
  const m = mundo('COBRADA', { estado: 'PENDIENTE', armado: true }, RID); // registrarFalloCobro reprogramó el recibo
  assert.equal(loCobraElDunning(m), true);
  assert.equal(await pasadaDunning(m, () => fallo('FALLO_COBRO'), true), 'INTENTADO');
  assert.equal(m.pen.estado, 'FALLIDA');
  assert.equal(hayQueRevisarLiquidacion('COBRADA', escrituraPorEstadoDelRecibo('FALLIDO')!), true);
});

test('revisión de liquidación: solo cuando una COBRADA deja de serlo', () => {
  const fallida = escrituraPorEstadoDelRecibo('FALLIDO')!;
  const cobrada = escrituraPorEstadoDelRecibo('COBRADO')!;
  for (const estado of [...ESTADOS, null]) {
    assert.equal(hayQueRevisarLiquidacion(estado, fallida), estado === 'COBRADA', String(estado));
    assert.equal(hayQueRevisarLiquidacion(estado, cobrada), false, String(estado));
  }
});

test('seguir al recibo: el recibo cobrado por otro camino (webhook, Cobros) lo recoge el barrido igual', async () => {
  for (const estado of ['PENDIENTE_APROBACION', 'RECIBO_CREADO', 'FALLIDA']) {
    const m = mundo(estado, { estado: 'COBRADO', armado: false }, RID);
    const s = await seguirAlRecibo(ioSeguimiento(m));
    assert.deepEqual(s, { paso: 'ESCRITA', estado: 'COBRADA', notificada: true }, estado);
    assert.equal(m.pen.estado, 'COBRADA', estado);
  }
});

test('⚠️ seguir al recibo nunca pisa lo que no toca: REEMBOLSADA, OMITIDA_* se quedan; FALLIDO no toca pendientes', async () => {
  for (const estado of ['REEMBOLSADA', 'OMITIDA_REVERTIDA', 'OMITIDA_SIN_TARJETA']) {
    const m = mundo(estado, { estado: 'FALLIDO', armado: false }, RID);
    await seguirAlRecibo(ioSeguimiento(m));
    assert.equal(m.pen.estado, estado, estado);
  }
  // COBRADA con el recibo FALLIDO: solo un adeudo SEPA que no entró. Sí pasa a FALLIDA.
  const sepa = mundo('COBRADA', { estado: 'FALLIDO', armado: false }, RID);
  assert.deepEqual(await seguirAlRecibo(ioSeguimiento(sepa)), { paso: 'ESCRITA', estado: 'FALLIDA', notificada: false });
  for (const estado of ['DETECTADA', 'PENDIENTE_APROBACION', 'FALLIDA', 'REEMBOLSADA', 'OMITIDA_COMPENSADA']) {
    const m = mundo(estado, { estado: 'FALLIDO', armado: false }, RID);
    const s = await seguirAlRecibo(ioSeguimiento(m));
    assert.equal(m.pen.estado, estado, estado);
    assert.equal(s.paso, 'SIN_EFECTO', estado);
  }
  for (const estado of ['REEMBOLSADA', 'OMITIDA_REVERTIDA']) {
    const m = mundo(estado, { estado: 'COBRADO', armado: false }, RID);
    const s = await seguirAlRecibo(ioSeguimiento(m));
    assert.equal(m.pen.estado, estado, estado);
    assert.deepEqual(s, { paso: 'SIN_EFECTO', estado, notificada: false }, estado);
    assert.equal(m.avisos, 0, estado);
  }
});

test('seguir al recibo: recibo sin resolver o ilegible → no escribe ni avisa', async () => {
  for (const estado of ['PENDIENTE', 'EN_CURSO', 'ANULADA']) {
    const m = mundo('RECIBO_CREADO', { estado, armado: true }, RID);
    assert.deepEqual(await seguirAlRecibo(ioSeguimiento(m)), { paso: 'RECIBO_SIN_RESOLVER' }, estado);
    assert.equal(m.pen.estado, 'RECIBO_CREADO');
  }
  const m = mundo('RECIBO_CREADO', { estado: 'COBRADO', armado: false }, RID);
  assert.deepEqual(await seguirAlRecibo(ioSeguimiento(m, { errorLecturaRecibo: true })), { paso: 'RECIBO_ILEGIBLE' });
  assert.equal(m.pen.estado, 'RECIBO_CREADO');
  assert.equal(m.avisos, 0);
});

test('seguir al recibo es idempotente: repetirlo (reintento del step) no escribe dos veces; el aviso lo deduplica el motor', async () => {
  const m = mundo('RECIBO_CREADO', { estado: 'COBRADO', armado: false }, RID);
  assert.equal((await seguirAlRecibo(ioSeguimiento(m))).paso, 'ESCRITA');
  const segunda = await seguirAlRecibo(ioSeguimiento(m));
  assert.deepEqual(segunda, { paso: 'SIN_EFECTO', estado: 'COBRADA', notificada: true });
  // Dos llamadas a `notificarPago` con la misma clave `pago-penalizacion:<id>`: un solo aviso real.
  assert.equal(m.avisos, 2);
});

test('seguir al recibo: el CAS falla y no se puede releer → ni aviso ni nada escrito', async () => {
  const m = mundo('RECIBO_CREADO', { estado: 'COBRADO', armado: false }, RID);
  const s = await seguirAlRecibo(ioSeguimiento(m, { errorCierre: true, errorLecturaPen: true }));
  assert.deepEqual(s, { paso: 'SIN_EFECTO', estado: null, notificada: false });
  assert.equal(m.avisos, 0);
  assert.equal(m.pen.estado, 'RECIBO_CREADO', 'lo recoge el barrido de la hora siguiente');
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
