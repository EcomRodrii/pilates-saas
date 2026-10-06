import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  claveTrasCobro, decidirPagoAnterior, mensajeClaseYaPagada, MENSAJE_PAGO_A_MEDIAS, MINUTOS_3DS_ABANDONADO, queHacerConCobroRepetido,
  type CobroAnterior,
} from './pago-anterior.ts';

// El intento de pago de una clase (checkout embebido): qué hacer con el cobro que
// ya existe para él. Un cobro pagable por pantalla, y nunca un client_secret de un
// cobro muerto o ya cobrado.

test('repetición de Stripe: se decide con el estado de AHORA', () => {
  assert.equal(queHacerConCobroRepetido('requires_payment_method'), 'usar');
  assert.equal(queHacerConCobroRepetido('requires_confirmation'), 'usar');
  // El conciliador cancela los abandonados con matrícula gratis: su client_secret
  // ya no sirve para pagar. Otro, con otra clave.
  assert.equal(queHacerConCobroRepetido('canceled'), 'nuevo');
  for (const s of ['succeeded', 'processing', 'requires_capture']) assert.equal(queHacerConCobroRepetido(s), 'pagado', s);
  assert.equal(queHacerConCobroRepetido('requires_action'), 'en-curso', 'un 3DS a medias, sin saber cuándo empezó, no se toca');
  assert.equal(queHacerConCobroRepetido(null), 'no-se-sabe');
  assert.equal(queHacerConCobroRepetido('algo-nuevo-de-stripe'), 'no-se-sabe');
  assert.notEqual(claveTrasCobro('checkout-embebido-v2-x', 'pi_muerto'), 'checkout-embebido-v2-x');
});

const SECRETO = 'pi_3Abc000000000000_secret_Xyz000000000000';
const intento = { studioId: 'studio-1', sesionId: 'ses-1', socioId: null, socioEmail: 'Alguien@Example.com' };
const cobro = (extra: Partial<CobroAnterior> & { md?: Record<string, string> } = {}): CobroAnterior => ({
  id: 'pi_3Abc000000000000',
  status: 'requires_payment_method',
  client_secret: SECRETO,
  metadata: { origen: 'plan_web_embebido', studioId: 'studio-1', sesionId: 'ses-1', socioEmail: 'alguien@example.com', ...(extra.md ?? {}) },
  ...extra,
});

// Revisión del 5-oct (#3/#7): un 3DS abandonado (pestaña o navegador de Instagram
// cerrados a mitad) se queda en `requires_action` para siempre; con la misma clave,
// cada intento nuevo de esa clase recibía «a medias» durante 24 h.
test('un 3DS reciente no se toca; uno abandonado se cancela y el intento sigue', () => {
  const creado = Date.UTC(2026, 9, 5, 10, 0, 0) / 1000;
  const a = (min: number) => new Date(creado * 1000 + min * 60_000);
  assert.equal(queHacerConCobroRepetido('requires_action', { creadoEnSeg: creado, ahora: a(MINUTOS_3DS_ABANDONADO - 1) }), 'en-curso');
  assert.equal(queHacerConCobroRepetido('requires_action', { creadoEnSeg: creado, ahora: a(MINUTOS_3DS_ABANDONADO) }), 'cancelar-y-nuevo');
  assert.equal(queHacerConCobroRepetido('requires_action', { creadoEnSeg: null, ahora: a(600) }), 'en-curso', 'sin saber cuándo nació, no se cancela');
  // El texto no promete lo que no pasa: ni «unos minutos» ni un pago que terminar en esta pantalla.
  assert.doesNotMatch(MENSAJE_PAGO_A_MEDIAS, /unos minutos/);
  assert.match(MENSAJE_PAGO_A_MEDIAS, /No se te cobrará dos veces/);
});

test('un pago devuelto entero es un intento nuevo; uno cobrado, no', () => {
  assert.equal(queHacerConCobroRepetido('succeeded', { reembolsado: true }), 'nuevo');
  assert.equal(queHacerConCobroRepetido('succeeded', { reembolsado: false }), 'pagado');
});

// Revisión del 5-oct (#10): «te llegará la confirmación» solo si es verdad.
test('«ya has pagado esta clase» dice lo que tiene: plaza, cola, pendiente, preparando o sin plaza', () => {
  const m = (reserva: string | null, entregado = true, cobro: 'cobrado' | 'procesando' = 'cobrado') => mensajeClaseYaPagada({ cobro, entregado, reserva });
  assert.match(m('CONFIRMADA'), /tienes tu plaza/);
  assert.match(m('ASISTIDA'), /tienes tu plaza/);
  assert.match(m('LISTA_ESPERA'), /lista de espera/);
  assert.match(m('PENDIENTE_APROBACION'), /pendiente de que el estudio la apruebe/);
  assert.match(m(null, false), /estamos preparando tu reserva/);
  // Pagó y no tiene plaza (llena, tope semanal, la canceló): nunca «te llegará la confirmación».
  for (const sin of [null, 'CANCELADA']) {
    const t = m(sin);
    assert.match(t, /no tienes plaza/);
    assert.doesNotMatch(t, /confirmación|tienes tu plaza/);
  }
  assert.match(m(null, false, 'procesando'), /se está procesando/);
});

test('el cobro anterior de ESTA pantalla, todavía pagable: se cancela antes de crear el nuevo', () => {
  assert.equal(decidirPagoAnterior(cobro(), SECRETO, intento), 'cancelar');
});

test('sin su client_secret no se toca: nadie cancela el cobro de otra persona sabiendo solo su id', () => {
  assert.equal(decidirPagoAnterior(cobro(), 'pi_3Abc000000000000_secret_OTRO', intento), 'ajeno');
  assert.equal(decidirPagoAnterior(cobro({ client_secret: null }), SECRETO, intento), 'ajeno');
});

test('de otro estudio, otra clase u otra vía: no se toca', () => {
  assert.equal(decidirPagoAnterior(cobro({ md: { studioId: 'otro' } }), SECRETO, intento), 'ajeno');
  assert.equal(decidirPagoAnterior(cobro({ md: { sesionId: 'otra-clase' } }), SECRETO, intento), 'ajeno');
  assert.equal(decidirPagoAnterior(cobro({ md: { origen: 'tarjeta_recibo' } }), SECRETO, intento), 'ajeno');
  assert.equal(decidirPagoAnterior(cobro({ md: { socioId: 'soc-1' } }), SECRETO, { ...intento, socioId: 'soc-1' }), 'cancelar');
});

test('⚠️ misma pantalla (tiene el secreto) pero otra persona: se cancela si se puede; nunca «pagado» de otra', () => {
  // Cambió el email en /reservar: el cobro anterior seguía pagable y quedaban dos de la misma clase.
  assert.equal(decidirPagoAnterior(cobro({ md: { socioEmail: 'otra@example.com' } }), SECRETO, intento), 'cancelar');
  assert.equal(decidirPagoAnterior(cobro(), SECRETO, { ...intento, socioId: 'soc-1' }), 'cancelar');
  assert.equal(decidirPagoAnterior(cobro({ status: 'requires_action', md: { socioEmail: 'otra@example.com' } }), SECRETO, intento), 'cancelar');
  assert.equal(decidirPagoAnterior(cobro({ status: 'canceled', md: { socioEmail: 'otra@example.com' } }), SECRETO, intento), 'ya-cancelado');
  for (const status of ['succeeded', 'processing']) {
    assert.equal(decidirPagoAnterior(cobro({ status, md: { socioEmail: 'otra@example.com' } }), SECRETO, intento), 'ajeno', status);
  }
});

test('ya cobrado o ya cancelado: ni se cancela ni se crea otro a ciegas; a medias, se cancela', () => {
  assert.equal(decidirPagoAnterior(cobro({ status: 'succeeded' }), SECRETO, intento), 'pagado');
  assert.equal(decidirPagoAnterior(cobro({ status: 'processing' }), SECRETO, intento), 'pagado');
  // Un 3DS a medias de esta pantalla: ha vuelto atrás, lo ha dejado. Se cancela.
  assert.equal(decidirPagoAnterior(cobro({ status: 'requires_action' }), SECRETO, intento), 'cancelar');
  assert.equal(decidirPagoAnterior(cobro({ status: 'canceled' }), SECRETO, intento), 'ya-cancelado');
});

// ── Contrato con la ruta y con /reservar (alias `@/` y Stripe: no se cargan aquí) ──

const raiz = join(import.meta.dirname, '..', '..');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const leer = (ruta: string) => sinComentarios(readFileSync(join(raiz, ruta), 'utf8'));

test('el pago anterior se resuelve ANTES de reservar la matrícula y la plaza de cupo, y lo cancelado devuelve lo suyo una sola vez', () => {
  const s = leer('app/api/public/checkout-embebido/route.ts');
  const anterior = s.indexOf('decidirPagoAnterior(anterior, secretoAnterior,');
  const matricula = s.indexOf('await reservarMatricula(');
  const plaza = s.indexOf('await reservarPlazaEtapa(');
  assert.ok(anterior > 0 && matricula > anterior && plaza > anterior);
  const tramo = s.slice(anterior, matricula);
  // Solo se da por cancelado si Stripe lo confirma; si no, se vuelve a mirar.
  assert.match(tramo, /if \(cancelado\?\.status !== 'canceled'\)/);
  // Las mismas claves que el conciliador: la plaza por su referencia, la matrícula «una vez».
  assert.match(tramo, /await liberarPlazaPorRef\(admin, cancelado\.id\);/);
  assert.match(tramo, /await liberarCupoMatriculaUnaVez\(admin, matriculaRetenida\.clave, matriculaRetenida\.planId, body\.studioId\);/);
  assert.match(tramo, /cobroSustituido = cancelado\.id;/);
  // ⚠️ La clave NO se deriva del pago anterior (revisión del 5-oct, #8): otra pestaña
  // sin él usaba la clave a secas y creaba un segundo cobro pagable. Solo si la clave a
  // secas la ocupa ESE cobro cancelado con otro importe (`idempotency_error`), esta
  // petición —la única que sabe que está muerto— sigue con la derivada.
  assert.doesNotMatch(s, /cobroSustituido \? claveTrasCobro/);
  assert.match(s, /let clave = claveBase;/);
  assert.match(s, /if \(esErrorDeIdempotencia\(errCrear\) && cobroSustituido && !probadaTrasSustituido && clave === claveBase\) \{\s*probadaTrasSustituido = true;\s*clave = claveTrasCobro\(claveBase, cobroSustituido\);/);
});

// Revisión del 5-oct (#2): la repetición de una clave DERIVADA tampoco se entrega a ciegas.
test('cada repetición (también la de una clave derivada) se mira contra el cobro de ahora', () => {
  const s = leer('app/api/public/checkout-embebido/route.ts');
  const bucle = s.slice(s.indexOf('for (let vuelta = 0; vuelta < 4; vuelta++) {'), s.indexOf('if (!paymentIntent) {'));
  assert.ok(bucle.length > 0);
  // Un solo sitio crea el cobro, y tras cada creación se pregunta si es repetición.
  assert.equal((bucle.match(/await crearCobro\(/g) ?? []).length, 1);
  assert.match(bucle, /if \(!esRespuestaRepetida\(pi\)\) \{ paymentIntent = pi; creadoAqui = true; break; \}/);
  assert.match(bucle, /await stripe\.paymentIntents\.retrieve\(pi\.id, \{ expand: \['latest_charge'\] \}/);
  // Cancelado o devuelto: otra clave, y la vuelta siguiente vuelve a mirar.
  assert.match(bucle, /if \(que === 'nuevo'\) \{ clave = claveTrasCobro\(clave, pi\.id\); continue; \}/);
  // 3DS abandonado: se cancela y solo si Stripe lo confirma se sigue; sin plaza de etapa.
  assert.match(bucle, /if \(que === 'cancelar-y-nuevo' && actual && !plaza\) \{/);
  assert.match(bucle, /if \(tras\?\.status === 'canceled'\) \{/);
  // El client_secret que se devuelve es SIEMPRE el de un cobro creado aquí o el mirado ahora.
  assert.match(bucle, /if \(que === 'usar' && actual\) \{ paymentIntent = actual; break; \}/);
});

test('«ya has pagado» se responde con lo que dice su reserva, en las dos rutas', () => {
  const emb = leer('app/api/public/checkout-embebido/route.ts');
  assert.doesNotMatch(emb, /MENSAJE_CLASE_YA_PAGADA/);
  assert.match(emb, /const error = mensajeClaseYaPagada\(\{/);
  assert.match(emb, /admin\.from\('reservas'\)\.select\('estado'\)\.eq\('id', ids\.reservaId\)/);
  const hosp = leer('app/api/stripe/checkout/route.ts');
  assert.match(hosp, /return mensajeClaseYaPagada\(\{/);
});

test('/reservar manda el cobro que ya tenía en pantalla al volver a «Tus datos» y continuar', () => {
  const s = readFileSync(join(raiz, 'app/reservar/[slug]/page.tsx'), 'utf8');
  const llamada = s.indexOf("await fetch('/api/public/checkout-embebido'");
  assert.ok(llamada > 0);
  assert.match(s.slice(llamada, llamada + 3000), /pagoAnterior: datosClientSecret \?\? undefined,/);
});
