import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// RECIBOS (6-oct-2026): «Pagar ahora» y «Renovar mi plan» dentro de la app, con el
// Checkout de Stripe incrustado, por la MISMA rama de recibo de /api/stripe/checkout.
// Se fija leyendo el fuente lo que no puede perderse:
//   · solo para un recibo, y solo la titular con su sesión (PAY-3): antes de leer
//     o crear ninguna sesión de Stripe;
//   · sin Bizum;
//   · `ui_mode: 'embedded_page'` con `return_url` y `expires_at` del minuto de la clave;
//   · la respuesta es lo que monta la app, también al reutilizar y en la carrera.

const f = readFileSync(join(process.cwd(), 'app/api/stripe/checkout/route.ts'), 'utf8');
const pos = (t: string, desde = 0) => {
  const i = f.indexOf(t, desde);
  assert.ok(i >= 0, `falta «${t}»`);
  return i;
};

test('incrustado solo para un recibo', () => {
  const corte = pos("if (incrustado && !body.reciboId) {");
  assert.ok(corte < pos('if (body.reciboId) {'));
});

test('incrustado solo la titular con su sesión, antes de tocar Stripe', () => {
  const guardia = pos('if (incrustado && !pagadorVerificado) {');
  assert.ok(pos('pagadorVerificado = !!socioIdDeSesion && socioIdDeSesion === socioId;') < guardia);
  assert.ok(guardia < pos('stripe.checkout.sessions.retrieve('), 'antes de mirar la sesión previa');
  assert.ok(guardia < pos('stripe.checkout.sessions.create('), 'antes de crear nada');
  const rama = f.slice(guardia, guardia + 500);
  assert.match(rama, /status: 403/);
  assert.match(rama, /status: 401/);
});

test('sin Bizum en la hoja', () => {
  assert.match(f, /const conBizum = !incrustado && ofrecerBizum\(/);
});

test('los parámetros de la incrustada: embedded_page, return_url y expires_at del minuto de la clave', () => {
  const p = f.slice(pos('...(incrustado ? {'), pos("locale: 'es',"));
  assert.match(p, /ui_mode: 'embedded_page'/);
  assert.match(p, /redirect_on_completion: 'if_required'/);
  assert.match(p, /return_url: /);
  assert.match(p, /expires_at: expiraSesionIncrustada\(ahoraMs\)/);
  assert.ok(!/success_url/.test(p.slice(0, p.indexOf('} : {'))), 'la incrustada no lleva success_url');
  assert.match(f, /claveCheckoutRecibo\(body\.reciboId, paymentMethodTypes, Math\.round\(importe \* 100\), peticionCheckout, ahoraMs\)/);
});

test('la app recibe lo que monta, al crear, al reutilizar y en la carrera de dos peticiones', () => {
  assert.match(f, /if \(decision === 'reutilizar' && \(incrustado \? previa\.client_secret : previa\.url\)\) \{\s*return responderSesion\(previa\);/);
  assert.match(f, /if \(ahora\?\.checkout_session_id === session\.id\) \{\s*return responderSesion\(session\);/);
  assert.match(f, /return responderSesion\(session\);\s*\} catch \(err\) \{/);
});
