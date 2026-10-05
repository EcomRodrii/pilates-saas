import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type Stripe from 'stripe';
import {
  anularCobroDelDatafono, cerrarSiRechazadoDatafono, consultaDatafono, consultarCobroBizum, envioFallidoDatafono, estadoDesdeStripe,
  desenlaceDeCobroSoltado, lectorConElCobro, rechazoDelCargo,
} from './consulta-stripe.ts';

// Bizum del mostrador: cuando Stripe crea la sesión de Checkout sin PaymentIntent,
// la referencia guardada es la sesión (`cs_…`). Consultarla como PaymentIntent
// fallaba siempre y el mostrador se quedaba en PROCESANDO para siempre.

const CUENTA = 'acct_estudio';

function doble(opts: {
  sesion?: Record<string, unknown> | Error;
  pis?: Record<string, Record<string, unknown>>;
  tipoCargo?: string;
} = {}) {
  const llamadas: string[] = [];
  const stripe = {
    checkout: {
      sessions: {
        retrieve(id: string, _p: unknown, o?: { stripeAccount?: string }) {
          llamadas.push(`sesion:${id}:${o?.stripeAccount}`);
          return opts.sesion instanceof Error || !opts.sesion ? Promise.reject(opts.sesion ?? new Error('sin sesión')) : Promise.resolve(opts.sesion);
        },
      },
    },
    paymentIntents: {
      retrieve(id: string, _p: unknown, o?: { stripeAccount?: string }) {
        llamadas.push(`pi:${id}:${o?.stripeAccount}`);
        const pi = opts.pis?.[id];
        return pi ? Promise.resolve(pi) : Promise.reject(new Error('No such payment_intent'));
      },
    },
    charges: {
      retrieve(id: string, _p: unknown, o?: { stripeAccount?: string }) {
        llamadas.push(`cargo:${id}:${o?.stripeAccount}`);
        return Promise.resolve({ payment_method_details: { type: opts.tipoCargo ?? 'bizum' } });
      },
    },
  } as never;
  return { stripe, llamadas };
}

const PI_PAGADO = {
  id: 'pi_1', status: 'succeeded', amount_received: 4500, latest_charge: 'ch_1',
  metadata: { studioId: 'st-1', reciboId: 'rec-1', origen: 'pos_bizum' },
};

test('⚠️ sesión caducada → EXPIRADO, sin preguntar por un PaymentIntent que no existe', async () => {
  const { stripe, llamadas } = doble({ sesion: { id: 'cs_1', status: 'expired', payment_status: 'unpaid', payment_intent: null } });
  assert.deepEqual(await consultarCobroBizum(stripe, 'cs_1', CUENTA), { estado: 'EXPIRADO' });
  assert.deepEqual(llamadas, [`sesion:cs_1:${CUENTA}`]);
});

test('sesión abierta → PENDIENTE; completada con el pago sin entrar → PROCESANDO', async () => {
  for (const [sesion, estado] of [
    [{ id: 'cs_1', status: 'open', payment_status: 'unpaid', payment_intent: null }, 'PENDIENTE'],
    [{ id: 'cs_1', status: 'complete', payment_status: 'unpaid', payment_intent: 'pi_1' }, 'PROCESANDO'],
  ] as const) {
    const { stripe, llamadas } = doble({ sesion, pis: { pi_1: PI_PAGADO } });
    assert.deepEqual(await consultarCobroBizum(stripe, 'cs_1', CUENTA), { estado }, sesion.status);
    assert.deepEqual(llamadas, [`sesion:cs_1:${CUENTA}`], 'sin pago no se mira nada más');
  }
});

test('⚠️ sesión pagada con su PaymentIntent → PAGADO con lo que dice ÉL, y devuelve su id', async () => {
  const { stripe, llamadas } = doble({
    sesion: { id: 'cs_1', status: 'complete', payment_status: 'paid', payment_intent: 'pi_1', amount_total: 9999, metadata: { reciboId: 'otro' } },
    pis: { pi_1: PI_PAGADO }, tipoCargo: 'card',
  });
  const r = await consultarCobroBizum(stripe, 'cs_1', CUENTA);
  assert.equal(r.estado, 'PAGADO');
  assert.equal(r.paymentIntentId, 'pi_1');
  assert.equal(r.importeCentimos, 4500, 'el importe cobrado del PaymentIntent, no el de la sesión');
  assert.deepEqual(r.metadata, PI_PAGADO.metadata);
  assert.equal(r.metodoReal, 'TARJETA', 'el método del cargo real');
  assert.deepEqual(llamadas, [`sesion:cs_1:${CUENTA}`, `pi:pi_1:${CUENTA}`, `cargo:ch_1:${CUENTA}`], 'todo en la cuenta Connect del estudio');
});

test('sesión pagada con el PaymentIntent expandido → también su id', async () => {
  const { stripe } = doble({
    sesion: { id: 'cs_1', status: 'complete', payment_status: 'paid', payment_intent: { id: 'pi_1' } },
    pis: { pi_1: PI_PAGADO },
  });
  const r = await consultarCobroBizum(stripe, 'cs_1', CUENTA);
  assert.equal(r.estado, 'PAGADO');
  assert.equal(r.paymentIntentId, 'pi_1');
});

test('sesión pagada sin PaymentIntent → PAGADO con el importe y la metadata de la sesión, sin id que guardar', async () => {
  const { stripe } = doble({
    sesion: { id: 'cs_1', status: 'complete', payment_status: 'paid', payment_intent: null, amount_total: 4500, metadata: { reciboId: 'rec-1', studioId: 'st-1' } },
  });
  const r = await consultarCobroBizum(stripe, 'cs_1', CUENTA);
  assert.deepEqual(r, { estado: 'PAGADO', importeCentimos: 4500, metadata: { reciboId: 'rec-1', studioId: 'st-1' } });
});

test('⚠️ no poder preguntar no es «no pagado»: fallo de la sesión o de su PaymentIntent → PROCESANDO', async () => {
  const caida = doble({ sesion: new Error('Stripe caído') });
  assert.deepEqual(await consultarCobroBizum(caida.stripe, 'cs_1', CUENTA), { estado: 'PROCESANDO' });
  const sinPi = doble({ sesion: { id: 'cs_1', status: 'complete', payment_status: 'paid', payment_intent: 'pi_x' } });
  assert.deepEqual(await consultarCobroBizum(sinPi.stripe, 'cs_1', CUENTA), { estado: 'PROCESANDO' });
});

test('referencia de PaymentIntent → como siempre, sin tocar sesiones', async () => {
  const { stripe, llamadas } = doble({
    pis: { pi_2: { id: 'pi_2', status: 'requires_payment_method', amount_received: 0, latest_charge: null, metadata: {}, last_payment_error: { message: 'Denegada' } } },
  });
  const r = await consultarCobroBizum(stripe, 'pi_2', CUENTA);
  assert.equal(r.estado, 'PENDIENTE');
  assert.equal(r.error, 'Denegada');
  assert.equal(r.paymentIntentId, undefined, 'la referencia ya es el PaymentIntent');
  assert.deepEqual(llamadas, [`pi:pi_2:${CUENTA}`]);
});

test('estados de Stripe: nada desconocido se lee como cobrado', () => {
  assert.equal(estadoDesdeStripe('succeeded'), 'PAGADO');
  assert.equal(estadoDesdeStripe('canceled'), 'CANCELADO');
  assert.equal(estadoDesdeStripe('processing'), 'PROCESANDO');
  assert.equal(estadoDesdeStripe('algo_nuevo' as never), 'ERROR');
});

function sinComentarios(fuente: string): string {
  return fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
const leer = (ruta: string) => sinComentarios(readFileSync(join(import.meta.dirname, '../..', ruta), 'utf8'));

test('⚠️ Bizum consulta con `consultarCobroBizum` y expira la sesión aunque la referencia sea ella', () => {
  const terminal = leer('lib/pos/terminal.ts');
  const bizum = terminal.slice(terminal.indexOf('function crearProveedorBizum('), terminal.indexOf('const PROVEEDOR_MANUAL'));
  assert.ok(bizum.includes('return consultarCobroBizum(ctx.stripe, referencia, ctx.stripeAccount);'));
  assert.ok(bizum.includes("checkoutSessionIdGuardada ?? (referencia.startsWith('cs_') ? referencia : null)"));
  assert.doesNotMatch(terminal, /function estadoDesdeStripe/, 'una sola traducción de estados');
});

test('⚠️ al cerrar un cobro de Bizum se guarda el PaymentIntent que cobró, nunca la sesión', () => {
  const recibo = leer('app/api/pos/recibo/confirmar/route.ts');
  assert.ok(recibo.includes("paymentIntentId: esSumup ? null : est.paymentIntentId\n          ?? (recibo.cobro_mostrador_pi.startsWith('cs_') ? null : recibo.cobro_mostrador_pi),"));
  // Lo de SumUp va a su propia columna: un id suyo en la de Stripe acabaría en una devolución de Stripe.
  assert.ok(recibo.includes('cargoSumup: esSumup ? est.cargoSumup ?? null : null,'));
  const venta = leer('app/api/pos/venta/confirmar/route.ts');
  assert.ok(venta.includes("p_payment_intent_id: estadoProveedor.paymentIntentId\n        ?? (venta.stripe_payment_intent_id.startsWith('cs_') ? null : venta.stripe_payment_intent_id),"));
});

// Datáfono de Stripe. Medido en modo de prueba (5-oct-2026): con una tarjeta
// rechazada el PaymentIntent vuelve a `requires_payment_method` con
// `last_payment_error`, y el lector sigue un instante con él antes de quedar
// `failed`. Con un datáfono físico, el reintento con PIN tras el pago sin contacto
// deja ese mismo error mientras el lector pide el PIN.
const CREADO = 1_790_000_000;
const piDatafono = (o: Record<string, unknown> = {}) => ({
  id: 'pi_1', status: 'requires_payment_method', last_payment_error: null, amount_received: 0, created: CREADO,
  metadata: { ventaId: 'v-1', studioId: 'st-1', origen: 'pos_terminal' }, ...o,
}) as unknown as Stripe.PaymentIntent;
const RECHAZO = { code: 'card_declined', decline_code: 'insufficient_funds', message: 'Your card has insufficient funds.' };
const accion = (status: string, pi = 'pi_1') => ({ action: { type: 'process_payment_intent', status, process_payment_intent: { payment_intent: pi } } });

function dobleDatafono(o: {
  pis: Record<string, unknown>[]; lector?: unknown; lectorFalla?: boolean; cancelarFalla?: boolean;
  pararLectorFalla?: boolean; leerFalla?: boolean; lectorNoExiste?: boolean;
}) {
  const llamadas: string[] = [];
  const lectores: string[] = [];
  const parados: string[] = [];
  let lecturas = 0;
  const stripe = {
    paymentIntents: {
      retrieve: async () => {
        llamadas.push('pi.retrieve');
        if (o.leerFalla) throw new Error('red');
        return piDatafono(o.pis[Math.min(lecturas++, o.pis.length - 1)]);
      },
      cancel: async () => { llamadas.push('pi.cancel'); if (o.cancelarFalla) throw new Error('no'); return piDatafono({ status: 'canceled' }); },
    },
    terminal: {
      readers: {
        retrieve: async (id: string) => {
          llamadas.push('lector.retrieve');
          lectores.push(id);
          if (o.lectorNoExiste) throw Object.assign(new Error('No such reader'), { code: 'resource_missing' });
          if (o.lectorFalla) throw new Error('red');
          return o.lector;
        },
        cancelAction: async (id: string) => {
          llamadas.push('lector.cancelAction');
          parados.push(id);
          if (o.pararLectorFalla) throw new Error('terminal_reader_offline');
          return o.lector;
        },
      },
    },
  };
  return {
    stripe: stripe as unknown as Parameters<typeof cerrarSiRechazadoDatafono>[0] & Parameters<typeof anularCobroDelDatafono>[0],
    llamadas, lectores, parados,
  };
}

test('datáfono: el estado y el motivo; RECHAZADO solo cuando ya se cerró', () => {
  assert.equal(consultaDatafono(piDatafono()).estado, 'PENDIENTE');
  assert.equal(consultaDatafono(piDatafono({ status: 'succeeded', amount_received: 2500 })).importeCentimos, 2500);
  // El error a secas ya no lo da por rechazado: puede que el lector siga (PIN).
  assert.equal(consultaDatafono(piDatafono({ last_payment_error: RECHAZO })).estado, 'PENDIENTE');
  // Cerrado: Stripe borra `last_payment_error` al cancelar; el motivo viaja aparte.
  const r = consultaDatafono(piDatafono({ status: 'canceled', last_payment_error: null }), RECHAZO as Stripe.PaymentIntent.LastPaymentError);
  assert.equal(r.estado, 'RECHAZADO');
  assert.match(r.error ?? '', /no tiene saldo suficiente/);
});

test('lectorConElCobro: solo cuenta la acción de ESTE cobro', () => {
  assert.equal(lectorConElCobro(accion('in_progress'), 'pi_1'), 'con-este');
  assert.equal(lectorConElCobro(accion('failed'), 'pi_1'), 'fallo-este');
  assert.equal(lectorConElCobro(accion('in_progress', 'pi_otro'), 'pi_1'), 'sin-este');
  assert.equal(lectorConElCobro({ action: null }, 'pi_1'), 'sin-este');
  assert.equal(lectorConElCobro(undefined, 'pi_1'), 'no-se-sabe');
});

test('⚠️ rechazo con el lector todavía en marcha (p. ej. pidiendo el PIN): se espera, no se cancela ni se anula', async () => {
  const d = dobleDatafono({ pis: [{ last_payment_error: RECHAZO }], lector: accion('in_progress') });
  const r = await cerrarSiRechazadoDatafono(d.stripe, 'pi_1', 'acct_1', 'tmr_1');
  assert.equal(r.veredicto, 'sigue');
  assert.ok(!d.llamadas.includes('pi.cancel'));
});

test('⚠️ sin poder leer el lector: se espera (no se sabe si sigue con el cobro)', async () => {
  const d = dobleDatafono({ pis: [{ last_payment_error: RECHAZO }], lectorFalla: true });
  assert.equal((await cerrarSiRechazadoDatafono(d.stripe, 'pi_1', 'acct_1', 'tmr_1')).veredicto, 'sigue');
  assert.ok(!d.llamadas.includes('pi.cancel'));
});

test('⚠️ el lector ya falló: se cancela el cobro y SOLO entonces es RECHAZADO', async () => {
  const d = dobleDatafono({ pis: [{ last_payment_error: RECHAZO }, { status: 'canceled', last_payment_error: null }], lector: accion('failed') });
  const r = await cerrarSiRechazadoDatafono(d.stripe, 'pi_1', 'acct_1', 'tmr_1');
  assert.equal(r.veredicto, 'rechazado');
  assert.equal(r.rechazo?.decline_code, 'insufficient_funds', 'el motivo es el de antes de cancelar');
  assert.deepEqual(d.llamadas, ['pi.retrieve', 'lector.retrieve', 'pi.cancel', 'pi.retrieve']);
});

test('el lector ya está con otra venta (o no hay lector guardado): se cierra este cobro igual', async () => {
  const otra = dobleDatafono({ pis: [{ last_payment_error: RECHAZO }, { status: 'canceled' }], lector: accion('in_progress', 'pi_otro') });
  assert.equal((await cerrarSiRechazadoDatafono(otra.stripe, 'pi_1', 'acct_1', 'tmr_1')).veredicto, 'rechazado');
  const sin = dobleDatafono({ pis: [{ last_payment_error: RECHAZO }, { status: 'canceled' }] });
  assert.equal((await cerrarSiRechazadoDatafono(sin.stripe, 'pi_1', 'acct_1', null)).veredicto, 'rechazado');
  assert.ok(!sin.llamadas.includes('lector.retrieve'));
});

test('⚠️ al ir a cerrarlo había entrado: PAGADO; y si no se pudo cerrar, se sigue preguntando', async () => {
  const entro = dobleDatafono({ pis: [{ last_payment_error: RECHAZO }, { status: 'succeeded', amount_received: 2500 }], lector: accion('failed'), cancelarFalla: true });
  assert.equal((await cerrarSiRechazadoDatafono(entro.stripe, 'pi_1', 'acct_1', 'tmr_1')).veredicto, 'pagado');
  const atascado = dobleDatafono({ pis: [{ last_payment_error: RECHAZO }, { last_payment_error: RECHAZO }], lector: accion('failed'), cancelarFalla: true });
  assert.equal((await cerrarSiRechazadoDatafono(atascado.stripe, 'pi_1', 'acct_1', 'tmr_1')).veredicto, 'sigue');
});

test('sin rechazo no se toca nada', async () => {
  const d = dobleDatafono({ pis: [{}] });
  assert.equal((await cerrarSiRechazadoDatafono(d.stripe, 'pi_1', 'acct_1', 'tmr_1')).veredicto, 'no');
  assert.deepEqual(d.llamadas, ['pi.retrieve']);
});

test('⚠️ conciliador (`sinTarjeta`): nadie pasó la tarjeta y el lector ya no lo espera → se cancela y es «abandonado»', async () => {
  const d = dobleDatafono({ pis: [{}, { status: 'canceled' }], lector: { action: null } });
  const r = await cerrarSiRechazadoDatafono(d.stripe, 'pi_1', 'acct_1', 'tmr_1', { sinTarjeta: true });
  assert.equal(r.veredicto, 'abandonado');
  assert.equal(r.rechazo, undefined);
  assert.ok(d.llamadas.includes('pi.cancel'));
  // Sin `sinTarjeta` (el aviso de Stripe) un cobro esperando tarjeta no se toca.
  const sin = dobleDatafono({ pis: [{}] });
  assert.equal((await cerrarSiRechazadoDatafono(sin.stripe, 'pi_1', 'acct_1', 'tmr_1')).veredicto, 'no');
  // Y si el lector sigue esperándola, tampoco con `sinTarjeta`.
  const espera = dobleDatafono({ pis: [{}], lector: accion('in_progress') });
  assert.equal((await cerrarSiRechazadoDatafono(espera.stripe, 'pi_1', 'acct_1', 'tmr_1', { sinTarjeta: true })).veredicto, 'sigue');
  assert.ok(!espera.llamadas.includes('pi.cancel'));
});

// «Cancelar el cobro» del datáfono, y el envío al lector que falla con el cobro ya
// creado. Medido en modo de prueba (5-oct-2026): con el lector esperando la tarjeta
// de otra venta, cancelar este cobro ya no le para el suyo; y con el lector que no
// existe, el cobro se cancela igual.
test('anular: el lector con ESTE cobro se para, y el cobro se cancela', async () => {
  const d = dobleDatafono({ pis: [{}], lector: accion('in_progress') });
  assert.equal(await anularCobroDelDatafono(d.stripe, 'pi_1', 'acct_1', 'tmr_1'), 'canceled');
  assert.deepEqual(d.llamadas, ['pi.retrieve', 'lector.retrieve', 'lector.cancelAction', 'pi.cancel']);
});

test('⚠️ anular: el lector con el cobro de OTRA venta no se toca (antes se le paraba a ciegas)', async () => {
  const d = dobleDatafono({ pis: [{}], lector: accion('in_progress', 'pi_otro') });
  assert.equal(await anularCobroDelDatafono(d.stripe, 'pi_1', 'acct_1', 'tmr_1'), 'canceled');
  assert.ok(!d.llamadas.includes('lector.cancelAction'));
});

test('⚠️ anular: con el lector apagado (no se puede leer ni parar) el cobro se cancela igual', async () => {
  // Antes iban en el mismo `try`: si fallaba lo del lector, el cobro se quedaba vivo.
  const sinLeer = dobleDatafono({ pis: [{}], lectorFalla: true });
  assert.equal(await anularCobroDelDatafono(sinLeer.stripe, 'pi_1', 'acct_1', 'tmr_1'), 'canceled');
  assert.ok(sinLeer.llamadas.includes('pi.cancel'));
  const sinParar = dobleDatafono({ pis: [{}], lector: accion('in_progress'), pararLectorFalla: true });
  assert.equal(await anularCobroDelDatafono(sinParar.stripe, 'pi_1', 'acct_1', 'tmr_1'), 'canceled');
  assert.ok(sinParar.llamadas.includes('pi.cancel'));
  const sinLector = dobleDatafono({ pis: [{}] });
  assert.equal(await anularCobroDelDatafono(sinLector.stripe, 'pi_1', 'acct_1', null), 'canceled');
  assert.deepEqual(sinLector.llamadas, ['pi.retrieve', 'pi.cancel']);
});

test('⚠️ anular: se para el lector al que se MANDÓ el cobro, no el emparejado hoy', async () => {
  const d = dobleDatafono({ pis: [{ metadata: { lector: 'tmr_viejo' } }], lector: accion('in_progress') });
  assert.equal(await anularCobroDelDatafono(d.stripe, 'pi_1', 'acct_1', 'tmr_nuevo'), 'canceled');
  assert.deepEqual(d.lectores, ['tmr_viejo']);
  assert.deepEqual(d.parados, ['tmr_viejo']);
});

test('⚠️ anular: si ya no admitía cancelación, manda lo que diga el cobro (y sin saberlo, null)', async () => {
  const entro = dobleDatafono({ pis: [{ status: 'succeeded' }], cancelarFalla: true });
  assert.equal(await anularCobroDelDatafono(entro.stripe, 'pi_1', 'acct_1', null), 'succeeded');
  const nada = dobleDatafono({ pis: [{}], cancelarFalla: true, leerFalla: true });
  assert.equal(await anularCobroDelDatafono(nada.stripe, 'pi_1', 'acct_1', null), null);
});

test('⚠️ envío al datáfono fallido: solo es «cerrado» si no puede entrar dinero', () => {
  // Al crear: sin cobro, o creado sin que ningún lector lo tenga.
  assert.equal(envioFallidoDatafono({ paso: 'crear', choque: false }), 'cerrado');
  // Choque de clave al crear: otra petición del intento puede haberlo creado y mandado.
  assert.equal(envioFallidoDatafono({ paso: 'crear', choque: true }), 'no-se-sabe');
  // Al mandarlo al lector, tras anularlo.
  assert.equal(envioFallidoDatafono({ paso: 'enviar', choque: false, estado: 'canceled' }), 'cerrado');
  assert.equal(envioFallidoDatafono({ paso: 'enviar', choque: false, estado: 'succeeded' }), 'enviado', 'entró: lo cierra el sondeo');
  assert.equal(envioFallidoDatafono({ paso: 'enviar', choque: false, estado: 'requires_payment_method' }), 'no-se-sabe');
  assert.equal(envioFallidoDatafono({ paso: 'enviar', choque: false, estado: null }), 'no-se-sabe');
  // Choque al mandarlo (el reintento del SDK): el mismo cobro está yendo al lector.
  assert.equal(envioFallidoDatafono({ paso: 'enviar', choque: true, estado: null }), 'enviado');
});

test('⚠️ el datáfono anula con `anularCobroDelDatafono`, y la venta estrena intento SOLO con el cobro cerrado y la venta anulada', () => {
  const terminal = leer('lib/pos/terminal.ts');
  const datafono = terminal.slice(terminal.indexOf('function crearProveedorDatafono'), terminal.indexOf('function crearProveedorBizum'));
  // Ningún `cancelAction` a ciegas: solo el de `anularCobroDelDatafono`, que mira el lector.
  assert.ok(!datafono.includes('cancelAction'));
  assert.ok(datafono.includes('await anularCobroDelDatafono(ctx.stripe, referencia, ctx.stripeAccount, readerId);'));
  // Falla el envío: con choque de clave NO se anula (sería el cobro bueno); sin él, se
  // anula y decide `envioFallidoDatafono`.
  assert.ok(datafono.includes('const estado = choque ? null : await anularCobroDelDatafono(ctx.stripe, pi.id, ctx.stripeAccount, readerId);'));
  assert.ok(datafono.includes("switch (envioFallidoDatafono({ paso: 'enviar', choque, estado })) {"));
  assert.ok(datafono.includes("envioFallidoDatafono({ paso: 'crear', choque: choqueDeClave(err) }) === 'cerrado'"));
  const venta = leer('app/api/pos/venta/route.ts');
  assert.ok(venta.includes("p_pago_estado: p.cerrado ? 'CANCELADO' : 'ERROR', p_motivo: p.motivo,"));
  // El código solo con la venta anulada de verdad, y tras soltar sus plazas de etapa.
  const helper = venta.slice(venta.indexOf('async function anularVentaSinCobro'), venta.indexOf('export async function POST'));
  assert.ok(helper.indexOf('for (const id of p.plazas) await liberarPlaza(admin, id);') < helper.indexOf('return { codigo: CODIGO_INTENTO_CERRADO };'));
  assert.ok(helper.indexOf('if (error) {') < helper.indexOf('return { codigo: CODIGO_INTENTO_CERRADO };'));
  assert.ok(venta.includes('cerrado: !!inicio.cerrado,'));
  assert.ok(venta.includes(".eq('id', base.ventaId).eq('studio_id', sesion.studioId).eq('estado', 'PENDIENTE_PAGO');"));
  const hoja = leer('components/pos/hoja-cobro.tsx');
  assert.ok(hoja.includes('if (r.codigo === CODIGO_INTENTO_CERRADO) onVentaAnuladaRef.current?.();'));
});

// Medido el 5-oct-2026: al cancelar el cobro, Stripe borra `last_payment_error`,
// pero su último cargo (`latest_charge`, expandido) conserva el motivo.
const cargoFallido = (failure_code: string, reason: string) =>
  ({ id: 'ch_1', status: 'failed', failure_code, outcome: { reason, type: 'issuer_declined' } }) as unknown as Stripe.Charge;

test('rechazoDelCargo: solo un cargo fallido y expandido da motivo', () => {
  assert.deepEqual(rechazoDelCargo(cargoFallido('card_declined', 'insufficient_funds')), { code: 'card_declined', decline_code: 'insufficient_funds' });
  assert.equal(rechazoDelCargo({ ...cargoFallido('x', 'y'), status: 'succeeded' } as Stripe.Charge), null);
  assert.equal(rechazoDelCargo('ch_sin_expandir'), null);
  assert.equal(rechazoDelCargo(null), null);
});

test('⚠️ un cobro ya cancelado tras un rechazo es RECHAZADO con su motivo, aunque lo cerrara otro camino', () => {
  const r = consultaDatafono(piDatafono({ status: 'canceled', latest_charge: cargoFallido('card_declined', 'insufficient_funds') }));
  assert.equal(r.estado, 'RECHAZADO');
  assert.match(r.error ?? '', /no tiene saldo suficiente/);
  const caducada = consultaDatafono(piDatafono({ status: 'canceled', latest_charge: cargoFallido('expired_card', 'expired_card') }));
  assert.match(caducada.error ?? '', /caducada/);
  // Cancelado sin cargo fallido (nadie pasó la tarjeta, o lo canceló quien cobra): CANCELADO, sin motivo inventado.
  const sinCargo = consultaDatafono(piDatafono({ status: 'canceled' }));
  assert.equal(sinCargo.estado, 'CANCELADO');
  assert.equal(sinCargo.error, undefined);
  // Un cargo fallido no convierte en rechazo un cobro que sigue vivo o que entró.
  assert.equal(consultaDatafono(piDatafono({ latest_charge: cargoFallido('card_declined', 'generic_decline') })).estado, 'PENDIENTE');
  assert.equal(consultaDatafono(piDatafono({ status: 'succeeded', latest_charge: cargoFallido('card_declined', 'x') })).estado, 'PAGADO');
});

test('⚠️ el sondeo del datáfono cierra el cobro que el lector ya no tiene, y espera «Acerca la tarjeta» mientras lo tiene', () => {
  const terminal = leer('lib/pos/terminal.ts');
  const datafono = terminal.slice(terminal.indexOf('function crearProveedorDatafono'), terminal.indexOf('function crearProveedorBizum'));
  assert.ok(datafono.includes('ctx.stripe, referencia, ctx.stripeAccount, readerId, { sinTarjeta: true },'));
  // El cobro sabe a qué lector se mandó, y el lector enseña el botón de cancelar.
  assert.ok(datafono.includes("concepto: p.concepto, lector: readerId,"));
  // Y de qué intento es (lo mira el arranque de un recibo con otro cobro guardado).
  assert.ok(datafono.includes('...metadataDeIntento(p.claveIdempotencia),'));
  const bizumIni = terminal.slice(terminal.indexOf('function crearProveedorBizum'));
  assert.equal(bizumIni.split('...metadataDeIntento(p.claveIdempotencia)').length - 1, 2, 'en la sesión y en su PaymentIntent');
  assert.ok(datafono.includes('process_config: { enable_customer_cancellation: true }'));
  assert.ok(datafono.includes("if (veredicto === 'abandonado' && canceladoEnLector) {"));
  // PROCESANDO solo con el error del primer intento (el lector pide el PIN); sin él, PENDIENTE.
  assert.ok(datafono.includes("if (veredicto === 'sigue' && pi.last_payment_error) return { ...consultaDatafono(pi), estado: 'PROCESANDO', error: undefined };"));
  // Bizum: el error de clave repetida, en español (no es de configuración).
  const bizum = terminal.slice(terminal.indexOf('function crearProveedorBizum'));
  assert.ok(bizum.indexOf('err instanceof Stripe.errors.StripeIdempotencyError') < bizum.indexOf('Stripe no ha aceptado el cobro por Bizum'));
});



test('⚠️ `sinTarjeta` deja un margen a un cobro recién mandado (el SDK aún puede estar entregándolo)', async () => {
  const d = dobleDatafono({ pis: [{}], lector: { action: null } });
  const r = await cerrarSiRechazadoDatafono(d.stripe, 'pi_1', 'acct_1', 'tmr_1', { sinTarjeta: true, ahoraSeg: CREADO + 3 });
  assert.equal(r.veredicto, 'no');
  assert.deepEqual(d.llamadas, ['pi.retrieve'], 'ni se pregunta al lector ni se cancela');
  const pasado = dobleDatafono({ pis: [{}, { status: 'canceled' }], lector: { action: null } });
  assert.equal((await cerrarSiRechazadoDatafono(pasado.stripe, 'pi_1', 'acct_1', 'tmr_1', { sinTarjeta: true, ahoraSeg: CREADO + 30 })).veredicto, 'abandonado');
});

test('⚠️ se pregunta al lector que recibió el cobro, no al guardado hoy (se puede emparejar otro entre medias)', async () => {
  const d = dobleDatafono({ pis: [{ metadata: { origen: 'pos_terminal', lector: 'tmr_viejo' } }], lector: accion('in_progress') });
  const r = await cerrarSiRechazadoDatafono(d.stripe, 'pi_1', 'acct_1', 'tmr_nuevo', { sinTarjeta: true });
  assert.equal(r.veredicto, 'sigue', 'el viejo sigue con él: no se cancela');
  assert.deepEqual(d.lectores, ['tmr_viejo']);
  // Sin lector guardado ya, el del cobro sigue valiendo.
  const sinGuardado = dobleDatafono({ pis: [{ metadata: { lector: 'tmr_viejo' } }], lector: accion('in_progress') });
  assert.equal((await cerrarSiRechazadoDatafono(sinGuardado.stripe, 'pi_1', 'acct_1', null, { sinTarjeta: true })).veredicto, 'sigue');
});

test('un lector que ya no existe no tiene el cobro: se cierra; uno que no se puede leer, se espera', async () => {
  const borrado = dobleDatafono({ pis: [{}, { status: 'canceled' }], lectorNoExiste: true });
  assert.equal((await cerrarSiRechazadoDatafono(borrado.stripe, 'pi_1', 'acct_1', 'tmr_1', { sinTarjeta: true })).veredicto, 'abandonado');
  const sinRed = dobleDatafono({ pis: [{}], lectorFalla: true });
  assert.equal((await cerrarSiRechazadoDatafono(sinRed.stripe, 'pi_1', 'acct_1', 'tmr_1', { sinTarjeta: true })).veredicto, 'sigue');
  assert.ok(!sinRed.llamadas.includes('pi.cancel'));
});

test('cancelado en la pantalla del datáfono (`customer_canceled`, como lo documenta Stripe): abandonado y se sabe', async () => {
  const lector = { action: { type: 'process_payment_intent', status: 'failed', failure_code: 'customer_canceled', process_payment_intent: { payment_intent: 'pi_1' } } };
  const d = dobleDatafono({ pis: [{}, { status: 'canceled' }], lector });
  const r = await cerrarSiRechazadoDatafono(d.stripe, 'pi_1', 'acct_1', 'tmr_1', { sinTarjeta: true });
  assert.equal(r.veredicto, 'abandonado');
  assert.equal(r.canceladoEnLector, true);
  const otraFalla = dobleDatafono({ pis: [{}, { status: 'canceled' }], lector: accion('failed') });
  assert.equal((await cerrarSiRechazadoDatafono(otraFalla.stripe, 'pi_1', 'acct_1', 'tmr_1', { sinTarjeta: true })).canceladoEnLector, false);
});

// La referencia del cobro que espera la Caja llega del NAVEGADOR: solo se lee.
function dobleLectura(o: { pi?: Record<string, unknown>; sesion?: Record<string, unknown>; falla?: boolean }) {
  const llamadas: string[] = [];
  const stripe = {
    paymentIntents: { retrieve: async () => { llamadas.push('pi.retrieve'); if (o.falla) throw new Error('red'); return piDatafono(o.pi); } },
    checkout: { sessions: { retrieve: async () => { llamadas.push('cs.retrieve'); if (o.falla) throw new Error('red'); return { id: 'cs_1', status: 'open', ...o.sesion }; } } },
  };
  return { stripe: stripe as unknown as Parameters<typeof desenlaceDeCobroSoltado>[0], llamadas };
}
const DE = { reciboId: 'rec-1', studioId: 'st-1' };
const MD_RECIBO = { reciboId: 'rec-1', studioId: 'st-1', origen: 'pos_terminal' };

test('⚠️ desenlace de un cobro soltado: SOLO lee, y solo afirma un final si es de ESTE recibo y estudio', async () => {
  const rechazado = dobleLectura({ pi: { status: 'canceled', metadata: MD_RECIBO, latest_charge: cargoFallido('card_declined', 'insufficient_funds') } });
  const r = await desenlaceDeCobroSoltado(rechazado.stripe, 'pi_1', 'acct_1', DE);
  assert.equal(r?.comprobado, true);
  assert.equal(r?.estado, 'RECHAZADO');
  assert.match(r?.motivo ?? '', /no tiene saldo suficiente/);
  assert.deepEqual(rechazado.llamadas, ['pi.retrieve'], 'ni cancela ni toca nada');
  // De otro recibo (o un cobro online de la socia en la misma cuenta): nada.
  const ajeno = dobleLectura({ pi: { status: 'canceled', metadata: { reciboId: 'rec-otro', studioId: 'st-1' } } });
  assert.equal(await desenlaceDeCobroSoltado(ajeno.stripe, 'pi_1', 'acct_1', DE), null);
  const sinMetadata = dobleLectura({ pi: { status: 'requires_payment_method', metadata: {} } });
  assert.equal(await desenlaceDeCobroSoltado(sinMetadata.stripe, 'pi_1', 'acct_1', DE), null);
  // Vivo o entró, y de este recibo: con su estado de verdad y su intento (quien llama decide).
  assert.deepEqual(await desenlaceDeCobroSoltado(dobleLectura({ pi: { metadata: { ...MD_RECIBO, clave: 'k-1' } } }).stripe, 'pi_1', 'acct_1', DE),
    { comprobado: true, metodo: 'DATAFONO', estado: 'PENDIENTE', motivo: null, clave: 'k-1' });
  assert.equal((await desenlaceDeCobroSoltado(dobleLectura({ pi: { status: 'succeeded', metadata: MD_RECIBO } }).stripe, 'pi_1', 'acct_1', DE))?.comprobado, true);
  assert.deepEqual(await desenlaceDeCobroSoltado(dobleLectura({ pi: { status: 'succeeded', metadata: MD_RECIBO } }).stripe, 'pi_1', 'acct_1', DE),
    { comprobado: true, metodo: 'DATAFONO', estado: 'PAGADO', motivo: null, clave: null });
  // Sin poder leer: SIN comprobar (no se sabe de quién es: no se toca).
  assert.deepEqual(await desenlaceDeCobroSoltado(dobleLectura({ falla: true }).stripe, 'pi_1', 'acct_1', DE), { comprobado: false });
  // Cancelado sin cargo fallido: CANCELADO.
  assert.equal((await desenlaceDeCobroSoltado(dobleLectura({ pi: { status: 'canceled', metadata: MD_RECIBO } }).stripe, 'pi_1', 'acct_1', DE))?.estado, 'CANCELADO');
});

test('desenlace de un cobro soltado por Bizum (la sesión): caducada → EXPIRADO; abierta → PROCESANDO; SumUp → nada', async () => {
  const caducada = dobleLectura({ sesion: { status: 'expired', metadata: MD_RECIBO } });
  assert.deepEqual(await desenlaceDeCobroSoltado(caducada.stripe, 'cs_1', 'acct_1', DE),
    { comprobado: true, metodo: 'BIZUM', estado: 'EXPIRADO', motivo: null, clave: null });
  assert.deepEqual(caducada.llamadas, ['cs.retrieve']);
  const abierta = dobleLectura({ sesion: { status: 'open', metadata: MD_RECIBO } });
  assert.equal((await desenlaceDeCobroSoltado(abierta.stripe, 'cs_1', 'acct_1', DE) as { estado?: string })?.estado, 'PENDIENTE');
  const pagada = dobleLectura({ sesion: { status: 'complete', payment_status: 'paid', metadata: MD_RECIBO } });
  assert.equal((await desenlaceDeCobroSoltado(pagada.stripe, 'cs_1', 'acct_1', DE) as { estado?: string })?.estado, 'PAGADO');
  const ajena = dobleLectura({ sesion: { status: 'expired', metadata: { reciboId: 'rec-otro', studioId: 'st-1' } } });
  assert.equal(await desenlaceDeCobroSoltado(ajena.stripe, 'cs_1', 'acct_1', DE), null);
  assert.equal(await desenlaceDeCobroSoltado(dobleLectura({}).stripe, 'sumup:1790000000:abcdefgh', 'acct_1', DE), null);
});

test('⚠️ la ruta de recibos: la referencia de la Caja se comprueba ANTES de tocarla, y el guardado de otro intento nunca se toca', () => {
  const ruta = leer('app/api/pos/recibo/confirmar/route.ts');
  assert.ok(ruta.includes('const d = await cobroDeReciboSoloLectura(admin, sesion.studioId, reciboId, referenciaCaja);'));
  const ini = ruta.indexOf('if (referenciaCaja && !mismoCobro(referenciaCaja, recibo.cobro_mostrador_pi)) {');
  const rama = ruta.slice(ini, ruta.indexOf("if (!recibo.cobro_mostrador_pi) {", ini));
  assert.ok(ini > 0 && rama.length > 0);
  // Sin comprobar que es de este recibo, se contesta sin tocar nada…
  const comprobado = rama.indexOf("if (!d?.comprobado) return responder('PROCESANDO');");
  assert.ok(comprobado > 0);
  // …y solo después se actúa sobre el cobro de la Caja.
  for (const accion of ['prepararCobroExistente(admin, sesion.studioId, referenciaCaja, d.metodo', 'propio.cobro.cancelar(referenciaCaja', 'propio.cobro.consultar(referenciaCaja)']) {
    assert.ok(rama.indexOf(accion) > comprobado, accion);
  }
  // En esa rama el guardado (de otro intento) no se cancela ni se consulta, y la rama siempre contesta.
  assert.ok(!rama.includes('cobro.cancelar(recibo.cobro_mostrador_pi') && !rama.includes('cobro.consultar(recibo.cobro_mostrador_pi'));
  // Fuera de esa rama, la referencia de la Caja no llega a ningún proveedor.
  const fuera = ruta.slice(0, ini) + ruta.slice(ini + rama.length);
  assert.ok(!fuera.includes('referenciaCaja, metodo') && !/(cancelar|consultar)\(referenciaCaja/.test(fuera));
  const caja = leer('components/pos/deuda-clienta.tsx');
  // No pregunta sin el cobro, y pregunta con él.
  assert.ok(caja.includes("if (fase.f !== 'esperando' || !fase.referencia) return;"));
  assert.ok(caja.includes("confirmarCobroRecibo(reciboId, metodo, 'consultar', referencia)"));
});
