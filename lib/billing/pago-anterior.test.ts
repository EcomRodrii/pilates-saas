import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { claveTrasCobro, decidirPagoAnterior, queHacerConCobroRepetido, type CobroAnterior } from './pago-anterior.ts';

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
  assert.equal(queHacerConCobroRepetido('requires_action'), 'en-curso', 'un 3DS a medias no se toca');
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

test('el cobro anterior de ESTA pantalla, todavía pagable: se cancela antes de crear el nuevo', () => {
  assert.equal(decidirPagoAnterior(cobro(), SECRETO, intento), 'cancelar');
});

test('sin su client_secret no se toca: nadie cancela el cobro de otra persona sabiendo solo su id', () => {
  assert.equal(decidirPagoAnterior(cobro(), 'pi_3Abc000000000000_secret_OTRO', intento), 'ajeno');
  assert.equal(decidirPagoAnterior(cobro({ client_secret: null }), SECRETO, intento), 'ajeno');
});

test('de otro estudio, otra clase, otra vía o otra persona: no se toca', () => {
  assert.equal(decidirPagoAnterior(cobro({ md: { studioId: 'otro' } }), SECRETO, intento), 'ajeno');
  assert.equal(decidirPagoAnterior(cobro({ md: { sesionId: 'otra-clase' } }), SECRETO, intento), 'ajeno');
  assert.equal(decidirPagoAnterior(cobro({ md: { origen: 'tarjeta_recibo' } }), SECRETO, intento), 'ajeno');
  assert.equal(decidirPagoAnterior(cobro({ md: { socioEmail: 'otra@example.com' } }), SECRETO, intento), 'ajeno');
  // Una socia con sesión solo cancela los suyos (por su ficha), nunca uno de invitada.
  assert.equal(decidirPagoAnterior(cobro(), SECRETO, { ...intento, socioId: 'soc-1' }), 'ajeno');
  assert.equal(decidirPagoAnterior(cobro({ md: { socioId: 'soc-1' } }), SECRETO, { ...intento, socioId: 'soc-1' }), 'cancelar');
});

test('ya cobrado, a medias o ya cancelado: ni se cancela ni se crea otro a ciegas', () => {
  assert.equal(decidirPagoAnterior(cobro({ status: 'succeeded' }), SECRETO, intento), 'pagado');
  assert.equal(decidirPagoAnterior(cobro({ status: 'processing' }), SECRETO, intento), 'pagado');
  assert.equal(decidirPagoAnterior(cobro({ status: 'requires_action' }), SECRETO, intento), 'en-curso');
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
  // Y el nuevo cobro lleva otra clave.
  assert.match(s, /const claveCobro = cobroSustituido \? claveTrasCobro\(claveBase, cobroSustituido\) : claveBase;/);
});

test('/reservar manda el cobro que ya tenía en pantalla al volver a «Tus datos» y continuar', () => {
  const s = readFileSync(join(raiz, 'app/reservar/[slug]/page.tsx'), 'utf8');
  const llamada = s.indexOf("await fetch('/api/public/checkout-embebido'");
  assert.ok(llamada > 0);
  assert.match(s.slice(llamada, llamada + 3000), /pagoAnterior: datosClientSecret \?\? undefined,/);
});
