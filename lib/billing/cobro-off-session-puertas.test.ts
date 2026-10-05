import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Dónde se pone, se quita y se respeta la marca de «cobro con tarjeta o
// domiciliación guardada en marcha» en los ficheros que `node --test` no puede
// cargar (alias de Next, Stripe, rutas). La lógica vive en
// cobro-off-session-marca.ts y tiene sus propios tests; aquí se fija que cada
// puerta la use, y en el orden que cierra la carrera.

const raiz = join(import.meta.dirname, '..', '..');
const leer = (p: string) => readFileSync(join(raiz, p), 'utf8');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

test('cobrarReciboOffSession: comprueba la cuenta, RESERVA el recibo y solo entonces llama a Stripe', () => {
  const s = sinComentarios(leer('lib/billing/stripe-cobros.ts'));
  const cuenta = s.indexOf('estadoCobroCuenta(');
  const reserva = s.indexOf('reservarCobroOffSession(');
  const cargo = s.indexOf('paymentIntents.create(');
  assert.ok(cuenta > 0 && reserva > cuenta && cargo > reserva, 'el orden tiene que ser cuenta → reserva → cargo');
  // La misma clave en la marca y en Stripe.
  assert.match(s, /claveCobroOffSession\(params\.reciboId, intentosLeidos\)/);
  assert.match(s, /clave: idempotencyKey/);
  assert.match(s, /\{ stripeAccount: studio\.stripe_account_id, idempotencyKey \}/);
});

test('cobrarReciboOffSession: suelta la marca en el rechazo y en el 3DS, y la MANTIENE en un desenlace desconocido', () => {
  const s = sinComentarios(leer('lib/billing/stripe-cobros.ts'));
  const transitorio = s.slice(s.indexOf("if (clasificarErrorCobro(err) === 'ERROR_TRANSITORIO')"));
  const finTransitorio = transitorio.indexOf("errorCode: 'ERROR_TRANSITORIO'");
  assert.ok(finTransitorio > 0);
  assert.equal(transitorio.slice(0, finTransitorio).includes('soltarMarca('), false, 'un transitorio no suelta: el cargo pudo entrar');
  const rechazo = transitorio.slice(finTransitorio);
  assert.ok(rechazo.indexOf('await soltarMarca();') >= 0 && rechazo.indexOf('await soltarMarca();') < rechazo.indexOf("errorCode: 'FALLO_COBRO'"),
    'el rechazo del catch suelta antes de devolver FALLO_COBRO');
  const sinTerminar = s.slice(s.indexOf("desenlaceDeEstadoPi(paymentIntent.status, esSepa) === 'DESCONOCIDO'"));
  assert.ok(sinTerminar.indexOf("errorCode: 'ERROR_TRANSITORIO'") < sinTerminar.indexOf('await soltarMarca();'),
    'una tarjeta procesando devuelve antes de soltar');
  assert.match(s, /await soltarMarca\(\);\s*return \{\s*ok: false, status: paymentIntent\.status, errorCode: 'FALLO_COBRO'/, 'el 3DS suelta');
  // SEPA processing pasa a EN_CURSO quitando la marca en el mismo UPDATE.
  assert.match(s, /marcarAdeudoEnCurso\(admin, \{/);
  assert.equal(/\.update\(\{ estado: 'EN_CURSO'/.test(s), false, 'un UPDATE a EN_CURSO a mano no quitaría la marca');
});

test('las puertas que abren otro cobro del recibo respetan la marca, antes y en su propio compare-and-set', () => {
  const pos = sinComentarios(leer('app/api/pos/recibo/route.ts'));
  assert.match(pos, /cobro_off_session_clave, entrega_tipo/, 'el datáfono lee la marca');
  assert.match(pos, /if \(recibo\.cobro_off_session_clave\)/);
  assert.match(pos, /cobro_mostrador_pi: inicio\.referencia,[\s\S]{0,400}\.is\('cobro_off_session_clave', null\)\s*\.eq\('id', reciboId\)/,
    'y la exige al guardar su referencia');

  const checkout = sinComentarios(leer('app/api/stripe/checkout/route.ts'));
  const comprueba = checkout.indexOf('if (recibo.cobro_off_session_clave)');
  assert.ok(comprueba > 0 && comprueba < checkout.indexOf('sesionAbiertaId = (recibo.checkout_session_id'),
    'el enlace mira la marca antes de reutilizar una sesión abierta');
  assert.match(checkout, /\.update\(\{ checkout_session_id: session\.id \}\)[\s\S]{0,200}\.is\('cobro_off_session_clave', null\)/);
});

test('cobrar a mano uno a uno: la marca se mira antes de cerrar el enlace o cancelar el datáfono', () => {
  const guarda = sinComentarios(leer('lib/cobros/antes-de-cobrar-a-mano-servidor.ts'));
  const cuerpo = guarda.slice(guarda.indexOf('export async function soltarPagosEnMarchaAntesDeCobrar('));
  const mira = cuerpo.indexOf("if (fila?.cobro_off_session_clave) return { ok: false, motivo: 'COBRO_CON_METODO_GUARDADO', mensaje: MENSAJE_COBRO_CON_METODO_GUARDADO };");
  assert.ok(mira > 0, 'la guarda compartida no mira la marca');
  assert.ok(mira < cuerpo.indexOf('soltarCobroDeMostradorAntesDeCobrarAMano(') && mira < cuerpo.indexOf('cerrarPagoOnlineAntesDeCobrarAMano('),
    'antes de tocar el datáfono o el enlace de la clienta');
});

test('lo que borra o anula un recibo sin cobro en marcha mira también la marca', () => {
  const borrar = sinComentarios(leer('lib/billing/penalizacion-recibo-server.ts'));
  assert.match(borrar, /\.is\('cobro_off_session_clave', null\)/);
  const anular = sinComentarios(leer('lib/billing/clase-suelta-mostrador.ts'));
  assert.match(anular, /update\(\{ estado: 'ANULADO'[\s\S]{0,400}\.is\('cobro_off_session_clave', null\)/);
});

test('el conciliador resuelve las marcas colgadas en cada barrido, preguntando a Stripe', () => {
  const s = sinComentarios(leer('lib/inngest/conciliar-cobros.ts'));
  const cuerpo = s.slice(s.indexOf('async function conciliarEstudio('), s.indexOf('async function resolverCobrosConMetodoGuardadoColgados('));
  assert.match(cuerpo, /await resolverCobrosConMetodoGuardadoColgados\(admin, stripe, studio, \[\.\.\.piPorId\.values\(\)\], inicioListado\)/);
  const resolver = s.slice(s.indexOf('async function resolverCobrosConMetodoGuardadoColgados('));
  assert.match(resolver, /decidirMarcaHuerfana\(/);
  assert.match(resolver, /\.lt\('cobro_off_session_desde', limite\)/, 'solo las que pasan de MINUTOS_HUERFANA');
  // Nunca se suelta sin decidir: el único `soltar` cuelga de la decisión SOLTAR.
  assert.equal((resolver.match(/soltarMarcaCobroOffSession\(/g) ?? []).length, 1);
  assert.match(resolver, /case 'SOLTAR':\s*await soltarMarcaCobroOffSession\(/);
});

test('⚠️ un cobro de la Caja MUERTO no deja el recibo sin cobrarse solo: se suelta y se reserva otra vez, una', () => {
  // Un Bizum del mostrador caducado (que nadie suelta: no hay aviso `checkout.session.expired`)
  // o un cobro del datáfono cancelado frenaban el cobro con la tarjeta guardada para siempre.
  const cobros = sinComentarios(leer('lib/billing/stripe-cobros.ts'));
  const caso = cobros.indexOf("case 'EN_MARCHA': {");
  const soltar = cobros.indexOf('await soltarCobroDeLaCajaSiEstaMuerto(admin, {', caso);
  const otra = cobros.indexOf('const otra = await reservarCobroOffSession(admin, {', soltar);
  const gana = cobros.indexOf("if (otra.tipo === 'RESERVADA') {", otra);
  const frena = cobros.indexOf("return { ok: false, error: MENSAJE_COBRO_EN_MARCHA[perdida.por], errorCode: 'COBRO_EN_MARCHA' };", gana);
  assert.ok(caso > 0 && soltar > caso && otra > soltar && gana > otra && frena > gana,
    'solo con el cobro de la Caja muerto y soltado se vuelve a reservar; si no, sigue frenando');
  assert.ok(cobros.includes("if (perdida.por === 'MOSTRADOR' && cobroCaja && await soltarCobroDeLaCajaSiEstaMuerto("));
  // Se suelta solo si está muerto (se mira sin tocarlo) y solo ESA referencia.
  const caja = sinComentarios(leer('lib/pos/cobro-del-estudio.ts'));
  const fn = caja.slice(caja.indexOf('export async function soltarCobroDeLaCajaSiEstaMuerto'));
  assert.ok(fn.indexOf("if (vida !== 'muerto') return false;") < fn.indexOf('.update({ cobro_mostrador_pi: null'));
  assert.ok(fn.includes(".eq('cobro_mostrador_pi', p.referencia)"));
});
