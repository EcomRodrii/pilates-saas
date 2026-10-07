import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  arrancarArnes, baseEnMemoria, comoAlumna, comoEstudio, cuerpoParaLaVersionDeStripeMock, ecoAlCrear, esperarDespues, fueraDeLocal, parametrosDe, peticiones, rechazadas,
  reiniciar, resumen, retocar, stripeMockEnMarcha, usarBase, SECRETO_WEBHOOK_CONNECT,
  type BaseMemoria, type Rpc,
} from './stripe-mock-arnes.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Las llamadas REALES del servidor a Stripe en los flujos de la alumna, contra
// `stripe-mock` (valida cada petición contra la OpenAPI de Stripe). Cómo lanzarlo
// y qué no comprueba: docs/STRIPE-MODO-TEST.md. Sin stripe-mock en marcha, las
// pruebas de flujos se saltan solas: la CI no depende de él.
// ─────────────────────────────────────────────────────────────────────────────
const enMarcha = await stripeMockEnMarcha();
const omitir = enMarcha ? false : 'stripe-mock no está en marcha (ver docs/STRIPE-MODO-TEST.md)';

// El arnés mismo (corre siempre, también sin stripe-mock).
test('arnés: `payment_method_types` se valida con el nombre de endive solo donde endive lo quitó', () => {
  const t = cuerpoParaLaVersionDeStripeMock;
  assert.deepEqual(t('/v1/checkout/sessions', 'mode=setup&payment_method_types[0]=card'), { cuerpo: 'mode=setup&allowed_payment_method_types[0]=card', traducido: true });
  assert.equal(t('/v1/payment_intents', 'payment_method_types%5B0%5D=sepa_debit&amount=1').cuerpo, 'allowed_payment_method_types%5B0%5D=sepa_debit&amount=1');
  assert.equal(t('/v1/payment_intents/pi_1/confirm', 'payment_method_types[0]=card').traducido, true);
  assert.equal(t('/v1/payment_links', 'payment_method_types[0]=card').traducido, false, 'en otras rutas sigue existiendo');
  assert.equal(t('/v1/checkout/sessions', 'payment_method_options[card][setup_future_usage]=off_session').traducido, false);
});

type Manejador = (req: never) => Promise<Response>;
let NextRequestCtor: new (url: string, init?: RequestInit) => unknown;

before(async () => {
  if (!enMarcha) return;
  await arrancarArnes();
  NextRequestCtor = (await import('next/server.js')).NextRequest as unknown as typeof NextRequestCtor;
});

async function llamar(h: Manejador, url: string, init: { method?: string; body?: unknown; texto?: string; headers?: Record<string, string> } = {}) {
  const req = new NextRequestCtor(`http://localhost:3001${url}`, {
    method: init.method ?? 'GET',
    headers: { ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}), ...(init.headers ?? {}) },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : init.texto !== undefined ? { body: init.texto } : {}),
  });
  const res = await h(req as never);
  const texto = await res.text();
  let json: unknown = null;
  try { json = JSON.parse(texto); } catch { json = texto; }
  return { status: res.status, json: json as Record<string, unknown> };
}

const CUENTA = 'acct_1ArnesEstudio';
const STUDIO = 'studio-arnes';
const SOCIA = 'soc-arnes';
const USUARIO = { userId: 'u-arnes', email: 'alumna@example.com' };
const CUSTOMER = 'cus_ArnesAlumna';
const BEARER = { authorization: 'Bearer token-de-prueba' };

const RPCS_BASE: Record<string, Rpc> = {
  reclamar_webhook_event: () => ({ data: true, error: null }),
};

function baseEstudio(extra: Record<string, Record<string, unknown>[]> = {}, socia: Record<string, unknown> = {}, rpcs: Record<string, Rpc> = {}): BaseMemoria {
  return baseEnMemoria({
    studios: [{ id: STUDIO, stripe_account_id: CUENTA, slug: 'estudio-arnes', nombre: 'Estudio Arnés', subscription_status: 'active', reembolsos_activos: true, reembolso_plazo_dias: 30, reembolso_solo_sin_usar: false }],
    socios: [{
      id: SOCIA, studio_id: STUDIO, auth_user_id: USUARIO.userId, nombre: 'Alumna', email: USUARIO.email,
      stripe_customer_id: CUSTOMER, stripe_payment_method_id: null, sepa_payment_method_id: null, sepa_mandate_id: null, metodo_pago_preferido: null,
      ...socia,
    }],
    ...extra,
  }, { ...RPCS_BASE, ...rpcs });
}

/** Lo de toda prueba: la base, la alumna, la cuenta del estudio que cobra y el eco de lo que se crea. */
function preparar(db: BaseMemoria) {
  reiniciar();
  usarBase(db);
  comoAlumna(USUARIO);
  retocar((p, j) => (p.ruta === `/v1/accounts/${CUENTA}` ? { ...j, id: CUENTA, charges_enabled: true } : undefined));
  ecoAlCrear('/v1/checkout/sessions', '/v1/payment_intents', '/v1/customers', '/v1/refunds', '/v1/customer_sessions');
  // stripe-mock devuelve `client_secret: null` en la sesión incrustada; Stripe la devuelve con él.
  retocar((p, j) => (p.metodo === 'POST' && p.ruta === '/v1/checkout/sessions' && j.ui_mode === 'embedded_page'
    ? { ...j, client_secret: `${String(j.id)}_secret_arnes`, status: 'open' } : undefined));
}

/** Lo que se ve si falla: las peticiones a Stripe y lo que la ruta leyó y escribió. */
function contexto(r: unknown, db: BaseMemoria): string {
  return `${JSON.stringify(r)}\n— Stripe —\n${resumen()}\n— base —\n  ${db.consultas.join('\n  ')}`;
}

function sinRechazos(r: unknown, db: BaseMemoria) {
  // `STRIPE_MOCK_DETALLE=1`: cada prueba cuenta qué le pidió a Stripe y qué contestó stripe-mock.
  if (process.env.STRIPE_MOCK_DETALLE === '1') console.log(resumen().replace(/^/gm, '    '));
  assert.deepEqual(rechazadas().map(p => `${p.metodo} ${p.ruta}: ${p.error}`), [], contexto(r, db));
  assert.deepEqual(fueraDeLocal(), [], 'nada sale de localhost');
}

function unaPeticion(metodo: string, ruta: string | RegExp, r: unknown, db: BaseMemoria) {
  const ps = peticiones(metodo, ruta);
  assert.equal(ps.length, 1, `se esperaba UNA ${metodo} ${ruta}\n${contexto(r, db)}`);
  return ps[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Pagar un recibo pendiente desde Recibos / Mi plan
// ─────────────────────────────────────────────────────────────────────────────

test('1a · Recibos: pagar un recibo con el Checkout incrustado de la app', { skip: omitir }, async () => {
  const db = baseEstudio({
    recibos: [{ id: 'rec-arnes-1', studio_id: STUDIO, socio_id: SOCIA, importe: 45, concepto: 'Cuota octubre', estado: 'PENDIENTE', es_renovacion: false, suscripcion_id: null }],
  });
  preparar(db);
  const { POST } = await import('../../app/api/stripe/checkout/route.ts');
  const r = await llamar(POST as Manejador, '/api/stripe/checkout', {
    method: 'POST', body: { studioId: STUDIO, reciboId: 'rec-arnes-1', origen: 'portal', modo: 'incrustado' }, headers: BEARER,
  });
  sinRechazos(r, db);
  assert.equal(r.status, 200, contexto(r, db));
  assert.ok(r.json.clientSecret, contexto(r, db));
  const p = unaPeticion('POST', '/v1/checkout/sessions', r, db);
  assert.equal(p.cuenta, CUENTA);
  assert.ok(p.idempotencia, 'con clave de idempotencia');
  const params = parametrosDe(p);
  assert.equal(params.mode, 'payment');
  assert.equal(params.ui_mode, 'embedded_page');
  assert.equal(params.redirect_on_completion, 'if_required');
  assert.ok(!('success_url' in params) && !('cancel_url' in params), 'la incrustada no lleva success_url/cancel_url');
  // Stripe exige ≥30 min desde que CREA la sesión (stripe-mock no lo mira): con margen.
  assert.ok(Number(params.expires_at) - Date.now() / 1000 > 31 * 60 - 5, `expires_at con margen: ${String(params.expires_at)}`);
  assert.equal(((params.line_items as Record<string, unknown>[])[0].price_data as Record<string, unknown>).unit_amount, 4500);
});

test('1b · Mi plan: renovar el plan (Checkout de Stripe, con Bizum pedido en una cuota)', { skip: omitir }, async () => {
  const db = baseEstudio({
    recibos: [{ id: 'rec-arnes-renov', studio_id: STUDIO, socio_id: SOCIA, importe: 60, concepto: 'Mensual noviembre', estado: 'PENDIENTE', es_renovacion: true, suscripcion_id: 'sus-arnes-1' }],
    suscripciones: [{ id: 'sus-arnes-1', studio_id: STUDIO, socio_id: SOCIA, plan_id: 'plan-mensual', estado: 'ACTIVA' }],
    planes_tarifa: [{ id: 'plan-mensual', studio_id: STUDIO, nombre: 'Mensual', precio: 60, activo: true, tipo: 'MENSUAL', matricula: 0, es_prueba: false }],
  });
  preparar(db);
  const { POST } = await import('../../app/api/stripe/checkout/route.ts');
  const r = await llamar(POST as Manejador, '/api/stripe/checkout', {
    method: 'POST', body: { studioId: STUDIO, reciboId: 'rec-arnes-renov', origen: 'portal', bizum: true }, headers: BEARER,
  });
  sinRechazos(r, db);
  assert.equal(r.status, 200, contexto(r, db));
  const params = parametrosDe(unaPeticion('POST', '/v1/checkout/sessions', r, db));
  assert.ok(params.success_url && params.cancel_url, 'la hospedada lleva sus URL de vuelta');
  // Una cuota no se paga con Bizum aunque se pida: solo tarjeta, que queda guardada para renovar.
  assert.deepEqual(params.payment_method_types, ['card']);
  assert.equal(peticiones('GET', `/v1/accounts/${CUENTA}`).length, 0, 'ni siquiera pregunta si Bizum está activo');
});

test('1d · Recibos: una hoja abierta a punto de caducar no se devuelve; se cierra (mirando antes si se pagó) y se abre otra', { skip: omitir }, async () => {
  const db = baseEstudio({
    recibos: [{ id: 'rec-arnes-vieja', studio_id: STUDIO, socio_id: SOCIA, importe: 45, concepto: 'Cuota', estado: 'PENDIENTE', es_renovacion: false, suscripcion_id: null, checkout_session_id: 'cs_test_ArnesCasiCaducada' }],
  });
  preparar(db);
  // La misma que se pediría (incrustada, de la titular, mismo importe y método)… con 5 min de vida.
  retocar((p, j) => (p.metodo === 'GET' && p.ruta === '/v1/checkout/sessions/cs_test_ArnesCasiCaducada' ? {
    ...j, status: 'open', payment_status: 'unpaid', amount_total: 4500, ui_mode: 'embedded_page', payment_method_types: ['card'],
    client_secret: 'cs_test_ArnesCasiCaducada_secret_x', expires_at: Math.floor(Date.now() / 1000) + 5 * 60,
    metadata: { studioId: STUDIO, reciboId: 'rec-arnes-vieja', pagadorVerificado: '1' },
  } : undefined));
  retocar((p, j) => (p.metodo === 'POST' && p.ruta === '/v1/checkout/sessions/cs_test_ArnesCasiCaducada/expire' ? { ...j, status: 'expired', payment_status: 'unpaid' } : undefined));
  const { POST } = await import('../../app/api/stripe/checkout/route.ts');
  const r = await llamar(POST as Manejador, '/api/stripe/checkout', {
    method: 'POST', body: { studioId: STUDIO, reciboId: 'rec-arnes-vieja', origen: 'portal', modo: 'incrustado' }, headers: BEARER,
  });
  sinRechazos(r, db);
  assert.equal(r.status, 200, contexto(r, db));
  assert.notEqual(r.json.clientSecret, 'cs_test_ArnesCasiCaducada_secret_x', 'no le da la que caduca en 5 min');
  // La ruta la lee, y el cierre la vuelve a mirar ANTES de cerrarla (por si se acaba de pagar).
  assert.equal(peticiones('GET', '/v1/checkout/sessions/cs_test_ArnesCasiCaducada').length, 2, contexto(r, db));
  unaPeticion('POST', '/v1/checkout/sessions/cs_test_ArnesCasiCaducada/expire', r, db);
  unaPeticion('POST', '/v1/checkout/sessions', r, db);
});

test('1e · Recibos: la que caducaba se acaba de pagar mientras se cerraba: ni se cierra ni se abre otra (nunca dos cobros)', { skip: omitir }, async () => {
  const db = baseEstudio({
    recibos: [{ id: 'rec-arnes-carrera', studio_id: STUDIO, socio_id: SOCIA, importe: 45, concepto: 'Cuota', estado: 'PENDIENTE', es_renovacion: false, suscripcion_id: null, checkout_session_id: 'cs_test_ArnesCarrera' }],
  });
  preparar(db);
  // Abierta y a punto de caducar en las dos primeras lecturas; pagada en la de después del intento de cierre.
  let lecturas = 0;
  retocar((p, j) => {
    if (p.metodo !== 'GET' || p.ruta !== '/v1/checkout/sessions/cs_test_ArnesCarrera') return undefined;
    lecturas++;
    return {
      ...j, status: lecturas <= 2 ? 'open' : 'complete', payment_status: lecturas <= 2 ? 'unpaid' : 'paid', amount_total: 4500,
      ui_mode: 'embedded_page', payment_method_types: ['card'], client_secret: 'cs_test_ArnesCarrera_secret_x',
      expires_at: Math.floor(Date.now() / 1000) + 3 * 60, metadata: { studioId: STUDIO, reciboId: 'rec-arnes-carrera', pagadorVerificado: '1' },
    };
  });
  // Stripe no deja cerrarla: se está pagando.
  retocar((p) => (p.metodo === 'POST' && p.ruta === '/v1/checkout/sessions/cs_test_ArnesCarrera/expire'
    ? { __estado: 400, error: { type: 'invalid_request_error', message: 'This Checkout Session is not in an expirable state.' } } : undefined));
  const { POST } = await import('../../app/api/stripe/checkout/route.ts');
  const r = await llamar(POST as Manejador, '/api/stripe/checkout', {
    method: 'POST', body: { studioId: STUDIO, reciboId: 'rec-arnes-carrera', origen: 'portal', modo: 'incrustado' }, headers: BEARER,
  });
  sinRechazos(r, db);
  assert.equal(r.status, 409, contexto(r, db));
  assert.equal(peticiones('POST', '/v1/checkout/sessions').length, 0, 'no se abre otra sesión');
  assert.equal(db.tablas.recibos[0].checkout_session_id, 'cs_test_ArnesCarrera');
});

test('1f · Recibos: el conciliador suelta la sesión caducada entre el cierre y el guardado: se guarda la nueva igual', { skip: omitir }, async () => {
  const db = baseEstudio({
    recibos: [{ id: 'rec-arnes-concil', studio_id: STUDIO, socio_id: SOCIA, importe: 45, concepto: 'Cuota', estado: 'PENDIENTE', es_renovacion: false, suscripcion_id: null, checkout_session_id: 'cs_test_ArnesConcil' }],
  });
  preparar(db);
  retocar((p, j) => (p.metodo === 'GET' && p.ruta === '/v1/checkout/sessions/cs_test_ArnesConcil' ? {
    ...j, status: 'open', payment_status: 'unpaid', amount_total: 4500, ui_mode: 'embedded_page', payment_method_types: ['card'],
    client_secret: 'cs_test_ArnesConcil_secret_x', expires_at: Math.floor(Date.now() / 1000) + 2 * 60,
    metadata: { studioId: STUDIO, reciboId: 'rec-arnes-concil', pagadorVerificado: '1' },
  } : undefined));
  // Al cerrarla, el conciliador (en paralelo) ya la ha soltado del recibo.
  retocar((p, j) => {
    if (p.metodo !== 'POST' || p.ruta !== '/v1/checkout/sessions/cs_test_ArnesConcil/expire') return undefined;
    db.tablas.recibos[0].checkout_session_id = null;
    return { ...j, status: 'expired', payment_status: 'unpaid' };
  });
  const { POST } = await import('../../app/api/stripe/checkout/route.ts');
  const r = await llamar(POST as Manejador, '/api/stripe/checkout', {
    method: 'POST', body: { studioId: STUDIO, reciboId: 'rec-arnes-concil', origen: 'portal', modo: 'incrustado' }, headers: BEARER,
  });
  sinRechazos(r, db);
  assert.equal(r.status, 200, contexto(r, db));
  const nueva = unaPeticion('POST', '/v1/checkout/sessions', r, db);
  assert.ok(nueva);
  assert.equal(r.json.checkoutSessionId, db.tablas.recibos[0].checkout_session_id, 'la nueva queda guardada en el recibo');
  assert.equal(peticiones('POST', /\/expire$/).length, 1, 'y no se cierra la nueva');
});

test('1c · Recibos: con una sesión anterior abierta por otro importe, la cierra antes de abrir otra', { skip: omitir }, async () => {
  const db = baseEstudio({
    recibos: [{ id: 'rec-arnes-previa', studio_id: STUDIO, socio_id: SOCIA, importe: 45, concepto: 'Cuota', estado: 'PENDIENTE', es_renovacion: false, suscripcion_id: null, checkout_session_id: 'cs_test_ArnesPrevia' }],
  });
  preparar(db);
  retocar((p, j) => (p.metodo === 'GET' && p.ruta === '/v1/checkout/sessions/cs_test_ArnesPrevia'
    ? { ...j, status: 'open', payment_status: 'unpaid', amount_total: 4000, ui_mode: 'embedded_page', payment_method_types: ['card'], metadata: { studioId: STUDIO, reciboId: 'rec-arnes-previa' } } : undefined));
  retocar((p, j) => (p.metodo === 'POST' && p.ruta === '/v1/checkout/sessions/cs_test_ArnesPrevia/expire' ? { ...j, status: 'expired', payment_status: 'unpaid' } : undefined));
  const { POST } = await import('../../app/api/stripe/checkout/route.ts');
  const r = await llamar(POST as Manejador, '/api/stripe/checkout', {
    method: 'POST', body: { studioId: STUDIO, reciboId: 'rec-arnes-previa', origen: 'portal', modo: 'incrustado' }, headers: BEARER,
  });
  sinRechazos(r, db);
  assert.equal(r.status, 200, contexto(r, db));
  assert.equal(unaPeticion('POST', '/v1/checkout/sessions/cs_test_ArnesPrevia/expire', r, db).cuenta, CUENTA);
  unaPeticion('POST', '/v1/checkout/sessions', r, db);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Comprar en la Tienda: bono, cuota y clase suelta
// ─────────────────────────────────────────────────────────────────────────────

const PLANES = [
  { id: 'plan-bono', studio_id: STUDIO, nombre: 'Bono 10', precio: 90, activo: true, tipo: 'BONO', matricula: 0, es_prueba: false },
  { id: 'plan-mensual', studio_id: STUDIO, nombre: 'Mensual', precio: 60, activo: true, tipo: 'MENSUAL', matricula: 0, es_prueba: false },
  { id: 'plan-suelta', studio_id: STUDIO, nombre: 'Clase suelta', precio: 15, activo: true, tipo: 'BONO', matricula: 0, es_prueba: false },
];

for (const caso of [
  { nombre: '2a · Tienda: comprar un bono', planId: 'plan-bono', centimos: 9000, usoFuturo: false },
  { nombre: '2b · Tienda: contratar una cuota mensual (guarda la tarjeta para renovar)', planId: 'plan-mensual', centimos: 6000, usoFuturo: true },
]) {
  test(caso.nombre, { skip: omitir }, async () => {
    const db = baseEstudio({ planes_tarifa: PLANES });
    preparar(db);
    const { POST } = await import('../../app/api/public/checkout-embebido/route.ts');
    const r = await llamar(POST as Manejador, '/api/public/checkout-embebido', {
      method: 'POST', body: { studioId: STUDIO, planId: caso.planId, socioId: SOCIA }, headers: { ...BEARER, origin: 'http://localhost:3001' },
    });
    sinRechazos(r, db);
    assert.equal(r.status, 200, contexto(r, db));
    assert.ok(r.json.clientSecret, contexto(r, db));
    const p = unaPeticion('POST', '/v1/payment_intents', r, db);
    assert.equal(p.cuenta, CUENTA);
    assert.ok(p.idempotencia);
    const params = parametrosDe(p);
    assert.equal(params.amount, caso.centimos);
    assert.equal(params.customer, CUSTOMER);
    assert.equal(params.setup_future_usage === 'off_session', caso.usoFuturo, contexto(r, db));
  });
}

/** `evaluar_reserva`: sin plan que la cubra y con sitio, que es cuando se le vende la clase. */
const evaluarSinPlanConSitio: Rpc = (a) => ({
  data: (a.p_opciones as { exigir_entitlement?: boolean }).exigir_entitlement
    ? { puede: false, codigo: 'sin-plan' }
    : { puede: true, estado: 'CONFIRMADA', pagador: { origen: 'ninguno' } },
  error: null,
});

test('2c · Tienda: pagar una clase suelta', { skip: omitir }, async () => {
  const inicio = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const db = baseEstudio({
    planes_tarifa: PLANES,
    sesiones: [{ id: 'ses-arnes-1', studio_id: STUDIO, inicio, cancelada: false, tipo_clase_id: 'tc-1', precio_puntual: null, capacidad: 10 }],
    plan_tipos_clase: [],
  }, {}, { evaluar_reserva: evaluarSinPlanConSitio });
  preparar(db);
  const { POST } = await import('../../app/api/public/checkout-embebido/route.ts');
  const r = await llamar(POST as Manejador, '/api/public/checkout-embebido', {
    method: 'POST', body: { studioId: STUDIO, planId: 'plan-suelta', socioId: SOCIA, sesionId: 'ses-arnes-1', aceptaCondiciones: true }, headers: BEARER,
  });
  sinRechazos(r, db);
  assert.equal(r.status, 200, contexto(r, db));
  const params = parametrosDe(unaPeticion('POST', '/v1/payment_intents', r, db));
  assert.equal(params.amount, 1500);
});

test('2d · Tienda: pagar con Bizum (Checkout de Stripe con tarjeta y Bizum)', { skip: omitir }, async () => {
  const db = baseEstudio({ planes_tarifa: PLANES });
  preparar(db);
  retocar((p, j) => (p.ruta === `/v1/accounts/${CUENTA}` ? { ...j, capabilities: { ...(j.capabilities as object), bizum_payments: 'active' } } : undefined));
  const { POST } = await import('../../app/api/stripe/checkout/route.ts');
  const r = await llamar(POST as Manejador, '/api/stripe/checkout', {
    method: 'POST', body: { studioId: STUDIO, planId: 'plan-bono', socioId: SOCIA, socioEmail: USUARIO.email, bizum: true, origen: 'portal' }, headers: BEARER,
  });
  sinRechazos(r, db);
  assert.equal(r.status, 200, contexto(r, db));
  const p = unaPeticion('POST', '/v1/checkout/sessions', r, db);
  assert.deepEqual(parametrosDe(p).payment_method_types, ['card', 'bizum']);
});

test('2e · Tienda: una socia sin Customer en el estudio (se crea, con su clave)', { skip: omitir }, async () => {
  const db = baseEstudio({ planes_tarifa: PLANES }, { stripe_customer_id: null });
  preparar(db);
  const { POST } = await import('../../app/api/public/checkout-embebido/route.ts');
  const r = await llamar(POST as Manejador, '/api/public/checkout-embebido', {
    method: 'POST', body: { studioId: STUDIO, planId: 'plan-mensual', socioId: SOCIA }, headers: BEARER,
  });
  sinRechazos(r, db);
  assert.equal(r.status, 200, contexto(r, db));
  const c = unaPeticion('POST', '/v1/customers', r, db);
  assert.ok(c.idempotencia?.endsWith(':customer'));
  assert.equal(parametrosDe(unaPeticion('POST', '/v1/payment_intents', r, db)).customer, db.tablas.socios[0].stripe_customer_id);
});

test('2f · Tienda: volver atrás y pagar otra vez cancela el cobro anterior de esa pantalla', { skip: omitir }, async () => {
  const db = baseEstudio({ planes_tarifa: PLANES });
  preparar(db);
  const secreto = 'pi_ArnesAnterior_secret_abc';
  retocar((p, j) => (p.metodo === 'GET' && p.ruta === '/v1/payment_intents/pi_ArnesAnterior' ? {
    ...j, client_secret: secreto, status: 'requires_payment_method',
    metadata: { origen: 'plan_web_embebido', studioId: STUDIO, socioId: SOCIA, planId: 'plan-bono' },
  } : undefined));
  retocar((p, j) => (p.metodo === 'POST' && p.ruta === '/v1/payment_intents/pi_ArnesAnterior/cancel' ? { ...j, status: 'canceled', metadata: {} } : undefined));
  const { POST } = await import('../../app/api/public/checkout-embebido/route.ts');
  const r = await llamar(POST as Manejador, '/api/public/checkout-embebido', {
    method: 'POST', body: { studioId: STUDIO, planId: 'plan-bono', socioId: SOCIA, pagoAnterior: secreto }, headers: BEARER,
  });
  sinRechazos(r, db);
  assert.equal(r.status, 200, contexto(r, db));
  const cancel = unaPeticion('POST', '/v1/payment_intents/pi_ArnesAnterior/cancel', r, db);
  assert.equal(parametrosDe(cancel).cancellation_reason, 'requested_by_customer');
  unaPeticion('POST', '/v1/payment_intents', r, db);
});

test('2g · Tienda sin cuenta (invitada) paga una clase: Customer de invitada y su nombre aparte', { skip: omitir }, async () => {
  const inicio = new Date(Date.now() + 3 * 86_400_000).toISOString();
  const db = baseEstudio({
    planes_tarifa: PLANES,
    sesiones: [{ id: 'ses-arnes-2', studio_id: STUDIO, inicio, cancelada: false, tipo_clase_id: 'tc-1', precio_puntual: null }],
    plan_tipos_clase: [],
  }, {}, { aforo_efectivo: () => ({ data: 10, error: null }), evaluar_reserva: evaluarSinPlanConSitio });
  preparar(db);
  comoAlumna(null);
  const { POST } = await import('../../app/api/public/checkout-embebido/route.ts');
  const r = await llamar(POST as Manejador, '/api/public/checkout-embebido', {
    method: 'POST',
    body: { studioId: STUDIO, planId: 'plan-suelta', sesionId: 'ses-arnes-2', socioEmail: 'invitada@example.com', socioNombre: 'Invitada', socioTelefono: '+34600000000', aceptaCondiciones: true },
  });
  sinRechazos(r, db);
  assert.equal(r.status, 200, contexto(r, db));
  assert.ok(unaPeticion('POST', '/v1/customers', r, db).idempotencia?.endsWith(':customer-v3'));
  unaPeticion('POST', /^\/v1\/customers\/[^/]+$/, r, db);
  const pi = parametrosDe(unaPeticion('POST', '/v1/payment_intents', r, db));
  assert.equal(pi.amount, 1500);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 y 4. Guardar, cambiar y quitar la tarjeta
// ─────────────────────────────────────────────────────────────────────────────

test('3a · Guardar tarjeta: abre el Checkout incrustado en modo setup (crea el Customer si no hay)', { skip: omitir }, async () => {
  const db = baseEstudio({}, { stripe_customer_id: null });
  preparar(db);
  const { POST } = await import('../../app/api/public/tarjeta/route.ts');
  const r = await llamar(POST as Manejador, '/api/public/tarjeta', { method: 'POST', body: { studioId: STUDIO }, headers: BEARER });
  sinRechazos(r, db);
  assert.equal(r.status, 200, contexto(r, db));
  assert.ok(r.json.clientSecret, contexto(r, db));
  unaPeticion('POST', '/v1/customers', r, db);
  const params = parametrosDe(unaPeticion('POST', '/v1/checkout/sessions', r, db));
  assert.equal(params.mode, 'setup');
  assert.equal(params.ui_mode, 'embedded_page');
  assert.equal(params.redirect_on_completion, 'if_required');
  assert.deepEqual(params.consent_collection, { payment_method_reuse_agreement: { position: 'auto' } });
  assert.ok(Number(params.expires_at) >= Math.floor(Date.now() / 1000) + 30 * 60, 'Stripe exige ≥ 30 min');
});

function sesionDeTarjetaCompletada(pmNueva: string) {
  retocar((p, j) => (p.metodo === 'GET' && p.ruta.startsWith('/v1/checkout/sessions/') ? {
    ...j, mode: 'setup', status: 'complete', customer: CUSTOMER, created: Math.floor(Date.now() / 1000) - 60,
    metadata: { studioId: STUDIO, socioId: SOCIA, purpose: 'tarjeta', origen: 'app' },
    setup_intent: { ...(j.setup_intent as object), status: 'succeeded', payment_method: pmNueva },
  } : undefined));
  retocar((p, j) => (p.metodo === 'GET' && p.ruta.startsWith('/v1/payment_methods/') ? { ...j, customer: CUSTOMER, type: 'card' } : undefined));
}

test('3b · Cambiar tarjeta: la confirmación (GET ?sesion=) la escribe y suelta la anterior', { skip: omitir }, async () => {
  const db = baseEstudio({}, { stripe_payment_method_id: 'pm_ArnesVieja' });
  preparar(db);
  sesionDeTarjetaCompletada('pm_ArnesNueva');
  const { GET } = await import('../../app/api/public/tarjeta/route.ts');
  const r = await llamar(GET as Manejador, `/api/public/tarjeta?studioId=${STUDIO}&sesion=cs_test_ArnesTarjeta`, { headers: BEARER });
  sinRechazos(r, db);
  assert.equal(r.status, 200, contexto(r, db));
  assert.equal(r.json.confirmacion, 'guardada', contexto(r, db));
  const leer = unaPeticion('GET', '/v1/checkout/sessions/cs_test_ArnesTarjeta', r, db);
  assert.match(leer.query, /expand/);
  assert.equal(db.tablas.socios[0].stripe_payment_method_id, 'pm_ArnesNueva');
  unaPeticion('POST', '/v1/payment_methods/pm_ArnesVieja/detach', r, db);
});

test('3c · Guardar tarjeta: el webhook checkout.session.completed (mode setup) la escribe', { skip: omitir }, async () => {
  const db = baseEstudio({}, { stripe_payment_method_id: null });
  preparar(db);
  retocar((p, j) => (p.metodo === 'GET' && p.ruta.startsWith('/v1/setup_intents/')
    ? { ...j, status: 'succeeded', payment_method: { ...(j.payment_method as object), id: 'pm_ArnesWebhook', customer: CUSTOMER, type: 'card' } } : undefined));
  const sesion = await objetoDeStripeMock('/v1/checkout/sessions/cs_test_ArnesSetup');
  const r = await entregarEvento('checkout.session.completed', {
    ...sesion, mode: 'setup', status: 'complete', customer: CUSTOMER, setup_intent: 'seti_ArnesSetup', payment_intent: null,
    metadata: { studioId: STUDIO, socioId: SOCIA, purpose: 'tarjeta', origen: 'app' },
  });
  sinRechazos(r, db);
  assert.equal(r.status, 200, contexto(r, db));
  const si = unaPeticion('GET', '/v1/setup_intents/seti_ArnesSetup', r, db);
  assert.equal(si.cuenta, CUENTA);
  assert.equal(db.tablas.socios[0].stripe_payment_method_id, 'pm_ArnesWebhook', contexto(r, db));
});

test('4a · Quitar la tarjeta de los cobros: se limpia la ficha y se suelta en Stripe', { skip: omitir }, async () => {
  const db = baseEstudio({}, { stripe_payment_method_id: 'pm_ArnesCobros', metodo_pago_preferido: 'TARJETA' });
  preparar(db);
  const { DELETE } = await import('../../app/api/public/tarjeta/route.ts');
  const r = await llamar(DELETE as Manejador, '/api/public/tarjeta', { method: 'DELETE', body: { studioId: STUDIO }, headers: BEARER });
  sinRechazos(r, db);
  assert.equal(r.status, 200, contexto(r, db));
  assert.equal(unaPeticion('POST', '/v1/payment_methods/pm_ArnesCobros/detach', r, db).cuenta, CUENTA);
  assert.equal(db.tablas.socios[0].stripe_payment_method_id, null);
});

test('4b · Quitar una tarjeta guardada para pagar en la app', { skip: omitir }, async () => {
  const db = baseEstudio({}, { stripe_payment_method_id: 'pm_ArnesCobros' });
  preparar(db);
  retocar((p, j) => (p.metodo === 'GET' && p.ruta === '/v1/payment_methods/pm_ArnesGuardada'
    ? { ...j, customer: CUSTOMER, type: 'card', allow_redisplay: 'always' } : undefined));
  const { DELETE } = await import('../../app/api/public/tarjeta/route.ts');
  const r = await llamar(DELETE as Manejador, '/api/public/tarjeta', {
    method: 'DELETE', body: { studioId: STUDIO, paymentMethodId: 'pm_ArnesGuardada' }, headers: BEARER,
  });
  sinRechazos(r, db);
  assert.equal(r.status, 200, contexto(r, db));
  unaPeticion('POST', '/v1/payment_methods/pm_ArnesGuardada/detach', r, db);
});

test('4c · Listar sus tarjetas (GET)', { skip: omitir }, async () => {
  const db = baseEstudio({}, { stripe_payment_method_id: 'pm_ArnesCobros' });
  preparar(db);
  const { GET } = await import('../../app/api/public/tarjeta/route.ts');
  const r = await llamar(GET as Manejador, `/api/public/tarjeta?studioId=${STUDIO}`, { headers: BEARER });
  sinRechazos(r, db);
  assert.equal(r.status, 200, contexto(r, db));
  unaPeticion('GET', '/v1/payment_methods', r, db);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Cobro automático off-session
// ─────────────────────────────────────────────────────────────────────────────

for (const caso of [
  { nombre: '5a · Cobro automático con la tarjeta guardada', socia: { stripe_payment_method_id: 'pm_ArnesCobros' }, pm: 'pm_ArnesCobros', estadoPi: 'succeeded' },
  { nombre: '5b · Cobro automático por SEPA (adeudo en processing)', socia: { sepa_payment_method_id: 'pm_ArnesSepa', sepa_mandate_id: 'mandate_Arnes', metodo_pago_preferido: 'SEPA' }, pm: 'pm_ArnesSepa', estadoPi: 'processing' },
]) {
  test(caso.nombre, { skip: omitir }, async () => {
    const db = baseEstudio({
      recibos: [{ id: 'rec-arnes-off', studio_id: STUDIO, socio_id: SOCIA, importe: 60, concepto: 'Mensual', estado: 'PENDIENTE', intentos_reintento: 1, suscripcion_id: null, es_renovacion: false, proximo_reintento: new Date(Date.now() - 60_000).toISOString() }],
    }, caso.socia);
    preparar(db);
    retocar((p, j) => (p.metodo === 'POST' && p.ruta === '/v1/payment_intents' ? { ...j, status: caso.estadoPi } : undefined));
    const { cobrarReciboOffSession } = await import('./stripe-cobros.ts');
    const r = await cobrarReciboOffSession({ reciboId: 'rec-arnes-off', socioId: SOCIA, studioId: STUDIO, via: 'AUTOMATICO' });
    sinRechazos(r, db);
    const p = unaPeticion('POST', '/v1/payment_intents', r, db);
    assert.equal(p.cuenta, CUENTA);
    assert.equal(p.idempotencia, `offsession-cobro-rec-arnes-off-i1-${caso.pm}-6000`);
    const params = parametrosDe(p);
    assert.equal(params.off_session, 'true');
    assert.equal(params.confirm, 'true');
    assert.equal(params.payment_method, caso.pm);
    assert.ok(r.ok, contexto(r, db));
  });
}

test('5c · Cobro a mano (STAFF) con un pago online abierto: lo cierra en Stripe antes de cobrar', { skip: omitir }, async () => {
  const db = baseEstudio({
    recibos: [{ id: 'rec-arnes-staff', studio_id: STUDIO, socio_id: SOCIA, importe: 60, concepto: 'Mensual', estado: 'PENDIENTE', intentos_reintento: 0, suscripcion_id: null, es_renovacion: false, checkout_session_id: 'cs_test_ArnesAbierta' }],
  }, { stripe_payment_method_id: 'pm_ArnesCobros' });
  preparar(db);
  retocar((p, j) => (p.metodo === 'GET' && p.ruta === '/v1/checkout/sessions/cs_test_ArnesAbierta' ? { ...j, status: 'open', payment_status: 'unpaid' } : undefined));
  retocar((p, j) => (p.metodo === 'POST' && p.ruta === '/v1/checkout/sessions/cs_test_ArnesAbierta/expire' ? { ...j, status: 'expired', payment_status: 'unpaid' } : undefined));
  retocar((p, j) => (p.metodo === 'POST' && p.ruta === '/v1/payment_intents' ? { ...j, status: 'succeeded' } : undefined));
  const { cobrarReciboOffSession } = await import('./stripe-cobros.ts');
  const r = await cobrarReciboOffSession({ reciboId: 'rec-arnes-staff', socioId: SOCIA, studioId: STUDIO });
  sinRechazos(r, db);
  unaPeticion('POST', '/v1/checkout/sessions/cs_test_ArnesAbierta/expire', r, db);
  assert.equal(unaPeticion('POST', '/v1/payment_intents', r, db).idempotencia, 'offsession-cobro-rec-arnes-staff-i0-pm_ArnesCobros-6000');
  assert.ok(r.ok, contexto(r, db));
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Devolución y reversión
// ─────────────────────────────────────────────────────────────────────────────

test('6a · Devolver un recibo cobrado (el estudio lo pide; sin el PI guardado, lo busca)', { skip: omitir }, async () => {
  const db = baseEstudio({
    recibos: [{ id: 'rec-web-arnes', studio_id: STUDIO, socio_id: SOCIA, importe: 15, concepto: 'Clase suelta', estado: 'COBRADO', fecha_cobro: new Date().toISOString(), suscripcion_id: null, stripe_payment_intent_id: null }],
  });
  preparar(db);
  comoEstudio({ userId: 'u-duena', studioId: STUDIO, rol: 'PROPIETARIO' });
  retocar((p, j) => (p.ruta === '/v1/payment_intents/search'
    ? { ...j, data: [{ ...((j.data as object[])[0] ?? {}), id: 'pi_ArnesCobrado', status: 'succeeded' }] } : undefined));
  const { POST } = await import('../../app/api/reembolsos/route.ts');
  const r = await llamar(POST as Manejador, '/api/reembolsos', { method: 'POST', body: { reciboId: 'rec-web-arnes' } });
  sinRechazos(r, db);
  assert.equal(r.status, 200, contexto(r, db));
  unaPeticion('GET', '/v1/payment_intents/search', r, db);
  const ref = unaPeticion('POST', '/v1/refunds', r, db);
  assert.equal(ref.cuenta, CUENTA);
  assert.equal(ref.idempotencia, 'reembolso-v2-rec-web-arnes');
  assert.equal(parametrosDe(ref).payment_intent, 'pi_ArnesCobrado');
});

test('6b · Devolver un cobro con comisión de plataforma (refund_application_fee)', { skip: omitir }, async () => {
  const db = baseEstudio({
    recibos: [{ id: 'rec-arnes-fee', studio_id: STUDIO, socio_id: SOCIA, importe: 45, concepto: 'Cuota', estado: 'COBRADO', fecha_cobro: new Date().toISOString(), suscripcion_id: null, stripe_payment_intent_id: 'pi_ArnesFee' }],
  });
  preparar(db);
  comoEstudio({ userId: 'u-duena', studioId: STUDIO, rol: 'PROPIETARIO' });
  retocar((p, j) => (p.metodo === 'GET' && p.ruta === '/v1/payment_intents/pi_ArnesFee' ? { ...j, application_fee_amount: 90 } : undefined));
  const { POST } = await import('../../app/api/reembolsos/route.ts');
  const r = await llamar(POST as Manejador, '/api/reembolsos', { method: 'POST', body: { reciboId: 'rec-arnes-fee' } });
  sinRechazos(r, db);
  assert.equal(r.status, 200, contexto(r, db));
  const params = parametrosDe(unaPeticion('POST', '/v1/refunds', r, db));
  assert.equal(params.refund_application_fee, 'true');
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Webhooks (firmados como Connect, con objetos con la forma de stripe-mock)
// ─────────────────────────────────────────────────────────────────────────────

/** Un objeto tal como lo devuelve stripe-mock, para construir el evento con su forma. */
async function objetoDeStripeMock(ruta: string): Promise<Record<string, unknown>> {
  const r = await fetch(`http://localhost:${process.env.STRIPE_MOCK_PORT ?? 12191}${ruta}`, { headers: { Authorization: 'Bearer sk_test_123' } });
  return (await r.json()) as Record<string, unknown>;
}

let eventos = 0;
async function entregarEvento(tipo: string, objeto: Record<string, unknown>) {
  const Stripe = (await import('stripe')).default;
  const payload = JSON.stringify({
    id: `evt_arnes_${++eventos}_${Date.now()}`, object: 'event', type: tipo, account: CUENTA, api_version: '2026-06-24.dahlia',
    created: Math.floor(Date.now() / 1000), livemode: false, pending_webhooks: 1, request: { id: null, idempotency_key: null },
    data: { object: objeto },
  });
  const firma = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRETO_WEBHOOK_CONNECT });
  const { POST } = await import('../../app/api/stripe/webhook/route.ts');
  const r = await llamar(POST as Manejador, '/api/stripe/webhook', { method: 'POST', texto: payload, headers: { 'stripe-signature': firma } });
  await esperarDespues();
  return r;
}

test('7a · Webhook checkout.session.completed (mode payment) de un recibo', { skip: omitir }, async () => {
  const db = baseEstudio({
    recibos: [{ id: 'rec-arnes-wh', studio_id: STUDIO, socio_id: SOCIA, importe: 45, concepto: 'Cuota', estado: 'PENDIENTE', suscripcion_id: null, checkout_session_id: 'cs_test_ArnesPago' }],
  });
  preparar(db);
  retocar((p, j) => (p.metodo === 'GET' && p.ruta.startsWith('/v1/payment_intents/')
    ? {
      ...j, status: 'succeeded', amount: 4500, amount_received: 4500, setup_future_usage: 'off_session', payment_method_types: ['card'],
      payment_method: typeof j.payment_method === 'object' && j.payment_method ? { ...j.payment_method, id: 'pm_ArnesPagada', type: 'card' } : 'pm_ArnesPagada',
      metadata: { reciboId: 'rec-arnes-wh', origen: 'tarjeta_recibo', studioId: STUDIO },
    } : undefined));
  const sesion = await objetoDeStripeMock('/v1/checkout/sessions/cs_test_ArnesPago');
  const r = await entregarEvento('checkout.session.completed', {
    ...sesion, mode: 'payment', status: 'complete', payment_status: 'paid', amount_total: 4500, customer: CUSTOMER,
    payment_intent: 'pi_ArnesPago', setup_intent: null,
    metadata: { studioId: STUDIO, reciboId: 'rec-arnes-wh', socioId: SOCIA, pagadorVerificado: '1' },
  });
  sinRechazos(r, db);
  assert.equal(r.status, 200, contexto(r, db));
  assert.equal(db.tablas.recibos[0].estado, 'COBRADO', contexto(r, db));
  // Pagó ella misma con su sesión: se guarda la tarjeta con la que pagó.
  assert.match(unaPeticion('GET', '/v1/payment_intents/pi_ArnesPago', r, db).query, /expand/);
  assert.equal(db.tablas.socios[0].stripe_payment_method_id, 'pm_ArnesPagada', contexto(r, db));
});

// Estos dos eventos no le piden nada a Stripe (todo sale del propio evento): lo que se
// comprueba es que el manejador real los procese con la forma de stripe-mock.
// (`payment_failed` solo lo atiende para un adeudo SEPA: el rechazo de una tarjeta lo
// resuelve en el acto `cobrarReciboOffSession`.)
for (const caso of [
  { tipo: 'payment_intent.succeeded', estadoPi: 'succeeded', cobrado: 6000, origen: 'tarjeta_recibo', recibo: 'PENDIENTE' },
  { tipo: 'payment_intent.payment_failed', estadoPi: 'requires_payment_method', cobrado: 0, origen: 'sepa_recibo', recibo: 'EN_CURSO' },
]) {
  test(`7b · Webhook ${caso.tipo} de un cobro off-session (${caso.origen}; sin llamadas a Stripe: se mira el efecto)`, { skip: omitir }, async () => {
    const db = baseEstudio({
      recibos: [{ id: 'rec-arnes-pi', studio_id: STUDIO, socio_id: SOCIA, importe: 60, concepto: 'Mensual', estado: caso.recibo, suscripcion_id: null, intentos_reintento: 0, stripe_payment_intent_id: 'pi_ArnesOff', fecha_vencimiento: new Date().toISOString().slice(0, 10) }],
    });
    preparar(db);
    const pi = await objetoDeStripeMock('/v1/payment_intents/pi_ArnesOff');
    const r = await entregarEvento(caso.tipo, {
      ...pi, status: caso.estadoPi, amount: 6000, amount_received: caso.cobrado,
      customer: CUSTOMER, payment_method: 'pm_ArnesCobros', metadata: { reciboId: 'rec-arnes-pi', socioId: SOCIA, origen: caso.origen },
      last_payment_error: caso.cobrado ? null : { code: 'card_declined', decline_code: 'insufficient_funds', message: 'Your card has insufficient funds.', type: 'card_error' },
    });
    sinRechazos(r, db);
    assert.equal(r.status, 200, contexto(r, db));
    const recibo = db.tablas.recibos[0];
    if (caso.cobrado) {
      assert.equal(recibo.estado, 'COBRADO', contexto(r, db));
    } else {
      // Dunning: cuenta el intento y programa el siguiente.
      assert.equal(recibo.intentos_reintento, 1, contexto(r, db));
      assert.ok(recibo.proximo_reintento, contexto(r, db));
    }
    assert.equal(peticiones('GET', /./).length + peticiones('POST', /./).length, 0, 'no le pide nada a Stripe');
  });
}

test('7c · Webhook charge.refunded (total) de una clase pagada: lista los reembolsos del cargo', { skip: omitir }, async () => {
  const db = baseEstudio({
    recibos: [{ id: 'rec-web-arnes-cl', studio_id: STUDIO, socio_id: SOCIA, importe: 15, concepto: 'Clase suelta', estado: 'COBRADO', suscripcion_id: 'sus-web-arnes-cl' }],
    pagos_clase: [{ id: 'pc-arnes', studio_id: STUDIO, estado: 'COMPENSADA', payment_intent_id: 'pi_ArnesClase', suscripcion_id: 'sus-web-arnes-cl', importe_centimos: 1500, matricula_centimos: 0 }],
  });
  preparar(db);
  retocar((p, j) => (p.metodo === 'GET' && p.ruta === '/v1/payment_intents/pi_ArnesClase'
    ? { ...j, metadata: { reciboId: 'rec-web-arnes-cl', origen: 'plan_web_embebido', studioId: STUDIO } } : undefined));
  retocar((p, j) => (p.metodo === 'GET' && p.ruta === '/v1/refunds'
    ? { ...j, data: [{ ...((j.data as object[])[0] ?? {}), status: 'succeeded' }], has_more: false } : undefined));
  const cargo = await objetoDeStripeMock('/v1/charges/ch_ArnesClase');
  const r = await entregarEvento('charge.refunded', { ...cargo, id: 'ch_ArnesClase', payment_intent: 'pi_ArnesClase', amount: 1500, amount_refunded: 1500, refunded: true });
  sinRechazos(r, db);
  assert.equal(r.status, 200, contexto(r, db));
  const lista = unaPeticion('GET', '/v1/refunds', r, db);
  assert.match(lista.query, /charge=ch_ArnesClase/);
  assert.equal(lista.cuenta, CUENTA);
});

test('7d · Webhook charge.refund.updated (el reembolso pendiente sale)', { skip: omitir }, async () => {
  const db = baseEstudio({
    recibos: [{ id: 'rec-web-arnes-cl', studio_id: STUDIO, socio_id: SOCIA, importe: 15, concepto: 'Clase suelta', estado: 'DEVUELTO', suscripcion_id: 'sus-web-arnes-cl' }],
    pagos_clase: [{ id: 'pc-arnes', studio_id: STUDIO, estado: 'COMPENSADA', payment_intent_id: 'pi_ArnesClase', suscripcion_id: 'sus-web-arnes-cl', importe_centimos: 1500, matricula_centimos: 0 }],
  }, {}, { revertir_compra_de_clase: () => ({ data: [{ cambiado: true, estado_pago: 'REEMBOLSADA', reserva_cancelada: true, bono_revertido: true, motivo_sin_revertir: null, sesion_clase_id: null, suscripcion_entregada_id: null, promovida_id: null, oferta_id: null, oferta_hasta: null }], error: null }) });
  preparar(db);
  retocar((p, j) => (p.metodo === 'GET' && p.ruta === '/v1/payment_intents/pi_ArnesClase'
    ? { ...j, metadata: { reciboId: 'rec-web-arnes-cl', origen: 'plan_web_embebido', studioId: STUDIO } } : undefined));
  retocar((p, j) => (p.metodo === 'GET' && p.ruta === '/v1/charges/ch_ArnesClase' ? { ...j, amount: 1500, amount_refunded: 1500, refunded: true } : undefined));
  retocar((p, j) => (p.metodo === 'GET' && p.ruta === '/v1/refunds'
    ? { ...j, data: [{ ...((j.data as object[])[0] ?? {}), status: 'succeeded' }], has_more: false } : undefined));
  const refund = await objetoDeStripeMock('/v1/refunds/re_ArnesClase');
  const r = await entregarEvento('charge.refund.updated', { ...refund, status: 'succeeded', charge: 'ch_ArnesClase', payment_intent: 'pi_ArnesClase', amount: 1500 });
  sinRechazos(r, db);
  assert.equal(r.status, 200, contexto(r, db));
  unaPeticion('GET', '/v1/charges/ch_ArnesClase', r, db);
  unaPeticion('GET', '/v1/refunds', r, db);
  assert.ok(db.rpcsLlamadas.some(c => c.nombre === 'revertir_compra_de_clase'), contexto(r, db));
});

test('7e · Webhook charge.dispute.closed (perdida)', { skip: omitir }, async () => {
  const db = baseEstudio({
    recibos: [{ id: 'rec-arnes-disp', studio_id: STUDIO, socio_id: SOCIA, importe: 45, concepto: 'Cuota', estado: 'COBRADO', suscripcion_id: null, disputa_estado: 'needs_response' }],
  });
  preparar(db);
  retocar((p, j) => (p.metodo === 'GET' && p.ruta === '/v1/payment_intents/pi_ArnesDisp'
    ? { ...j, metadata: { reciboId: 'rec-arnes-disp', origen: 'tarjeta_recibo', studioId: STUDIO } } : undefined));
  const disputa = await objetoDeStripeMock('/v1/disputes/dp_ArnesDisp');
  const r = await entregarEvento('charge.dispute.closed', { ...disputa, status: 'lost', amount: 4500, charge: 'ch_ArnesDisp', payment_intent: 'pi_ArnesDisp' });
  sinRechazos(r, db);
  assert.equal(r.status, 200, contexto(r, db));
  unaPeticion('GET', '/v1/payment_intents/pi_ArnesDisp', r, db);
});

test('7f · De la Tienda al webhook: payment_intent.succeeded con la metadata REAL del cobro entrega y guarda la tarjeta', { skip: omitir }, async () => {
  const db = baseEstudio({ planes_tarifa: PLANES }, { stripe_payment_method_id: null });
  preparar(db);
  const { POST } = await import('../../app/api/public/checkout-embebido/route.ts');
  const compra = await llamar(POST as Manejador, '/api/public/checkout-embebido', {
    method: 'POST', body: { studioId: STUDIO, planId: 'plan-mensual', socioId: SOCIA }, headers: BEARER,
  });
  assert.equal(compra.status, 200, contexto(compra, db));
  const creado = parametrosDe(unaPeticion('POST', '/v1/payment_intents', compra, db));
  preparar(db);
  retocar((p, j) => (p.metodo === 'GET' && p.ruta === '/v1/payment_methods/pm_ArnesTienda' ? { ...j, type: 'card', customer: CUSTOMER } : undefined));
  const pi = await objetoDeStripeMock('/v1/payment_intents/pi_ArnesTienda');
  const r = await entregarEvento('payment_intent.succeeded', {
    ...pi, id: 'pi_ArnesTienda', status: 'succeeded', amount: creado.amount, amount_received: creado.amount, customer: CUSTOMER,
    payment_method: 'pm_ArnesTienda', payment_method_types: ['card', 'link'], setup_future_usage: creado.setup_future_usage ?? null,
    metadata: creado.metadata, created: Math.floor(Date.now() / 1000),
  });
  sinRechazos(r, db);
  assert.equal(r.status, 200, contexto(r, db));
  const upd = unaPeticion('POST', '/v1/payment_intents/pi_ArnesTienda', r, db);
  assert.ok((parametrosDe(upd).metadata as Record<string, unknown>).reciboId, contexto(r, db));
  assert.equal(db.tablas.socios[0].stripe_payment_method_id, 'pm_ArnesTienda', contexto(r, db));
});
