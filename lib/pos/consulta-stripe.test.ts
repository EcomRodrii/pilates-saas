import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type Stripe from 'stripe';
import {
  anularCobroDelDatafono, cerrarSiRechazadoDatafono, consultaDatafono, consultarCobroBizum, envioFallidoDatafono, estadoDesdeStripe,
  lectorConElCobro,
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
const piDatafono = (o: Record<string, unknown> = {}) => ({
  id: 'pi_1', status: 'requires_payment_method', last_payment_error: null, amount_received: 0,
  metadata: { ventaId: 'v-1', studioId: 'st-1', origen: 'pos_terminal' }, ...o,
}) as unknown as Stripe.PaymentIntent;
const RECHAZO = { code: 'card_declined', decline_code: 'insufficient_funds', message: 'Your card has insufficient funds.' };
const accion = (status: string, pi = 'pi_1') => ({ action: { type: 'process_payment_intent', status, process_payment_intent: { payment_intent: pi } } });

function dobleDatafono(o: {
  pis: Record<string, unknown>[]; lector?: unknown; lectorFalla?: boolean; cancelarFalla?: boolean;
  pararLectorFalla?: boolean; leerFalla?: boolean;
}) {
  const llamadas: string[] = [];
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
        retrieve: async () => { llamadas.push('lector.retrieve'); if (o.lectorFalla) throw new Error('red'); return o.lector; },
        cancelAction: async () => { llamadas.push('lector.cancelAction'); if (o.pararLectorFalla) throw new Error('terminal_reader_offline'); return o.lector; },
      },
    },
  };
  return {
    stripe: stripe as unknown as Parameters<typeof cerrarSiRechazadoDatafono>[0] & Parameters<typeof anularCobroDelDatafono>[0],
    llamadas,
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
  // Sin `sinTarjeta` (sondeo de la Caja, webhook) un cobro esperando tarjeta no se toca.
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
  assert.deepEqual(d.llamadas, ['lector.retrieve', 'lector.cancelAction', 'pi.cancel']);
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
  assert.deepEqual(sinLector.llamadas, ['pi.cancel']);
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
