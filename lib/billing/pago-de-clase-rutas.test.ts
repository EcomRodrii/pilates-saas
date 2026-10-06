import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// P06 · Fase A: contrato de las DOS puertas de cobro con clase, leyendo el fuente.
//   · la plaza se comprueba ANTES de gastar nada: matrícula, Customer, cobro;
//   · el pago vivo de esa clase (pagos_clase) se decide también antes;
//   · con cabecera Authorization, la identidad es la del token (nunca invitada);
//   · con clase, la casilla de condiciones se exige (si el estudio las reescribió);
//   · por debajo de 0,50 € no se crea nada.

const raiz = join(import.meta.dirname, '..', '..');
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const leer = (r: string) => sinComentarios(readFileSync(join(raiz, r), 'utf8'));

function antes(f: string, primero: string, despues: string[], ruta: string) {
  const i = f.indexOf(primero);
  assert.ok(i > 0, `${ruta}: falta «${primero}»`);
  for (const d of despues) {
    const j = f.indexOf(d);
    assert.ok(j > 0, `${ruta}: falta «${d}»`);
    assert.ok(i < j, `${ruta}: «${primero}» tiene que ir antes de «${d}»`);
  }
}

test('checkout-embebido: plaza y pago vivo antes de matrícula, Customer y cobro', () => {
  const ruta = 'app/api/public/checkout-embebido/route.ts';
  const f = leer(ruta);
  antes(f, 'comprobarPlazaAntesDeCobrar(admin', ['reservarMatricula(', 'stripe.customers.create(', 'stripe.paymentIntents.create(', 'prepararPagoDeClase('], ruta);
  antes(f, 'prepararPagoDeClase(admin', ['reservarMatricula(', 'stripe.customers.create(', 'stripe.paymentIntents.create(', 'reservarPlazaEtapa('], ruta);
  // La clave de Stripe, la de la fila cuando la hay.
  assert.match(f, /const idemKey = pagoClase \? claveDePagoDeClase\(pagoClase\.id\) : claveCheckoutEmbebido\(/);
  // Y el cobro queda anclado a su fila antes de entregarse.
  antes(f, 'anclarCobroDePago(admin, pagoClase.id, paymentIntent.id', ['clientSecret: paymentIntent.client_secret'], ruta);
});

test('checkout-embebido: con Authorization, la identidad SIEMPRE del token', () => {
  const f = leer('app/api/public/checkout-embebido/route.ts');
  assert.match(f, /if \(body\.socioId \|\| req\.headers\.get\('authorization'\)\) \{\s*const usuario = await verificarUsuarioSupabase\(req\);/);
});

test('checkout-embebido: con clase, la casilla de condiciones; y nunca por debajo del mínimo de Stripe', () => {
  const ruta = 'app/api/public/checkout-embebido/route.ts';
  const f = leer(ruta);
  assert.match(f, /exigeAceptacionExplicita\(admin, body\.studioId\) && body\.aceptaCondiciones !== true/);
  antes(f, 'importe < IMPORTE_MINIMO_EUR', ['stripe.paymentIntents.create('], ruta);
  antes(f, "codigo: 'precio-especial'", ['stripe.paymentIntents.create('], ruta);
});

test('/api/stripe/checkout (Bizum con clase): plaza antes de matrícula y sesión, y caduca con la clase', () => {
  const ruta = 'app/api/stripe/checkout/route.ts';
  const f = leer(ruta);
  antes(f, 'comprobarPlazaAntesDeCobrar(admin', ['reservarMatricula(', 'stripe.checkout.sessions.create('], ruta);
  antes(f, 'caducidadCheckoutDeClase(', ['stripe.checkout.sessions.create('], ruta);
  assert.match(f, /expires_at: expiraPorClase/);
  antes(f, "codigo: 'precio-especial'", ['stripe.checkout.sessions.create('], ruta);
});

test('/reservar manda la casilla de condiciones al cobrar la clase', () => {
  const f = readFileSync(join(raiz, 'app/reservar/[slug]/page.tsx'), 'utf8');
  const ini = f.indexOf("fetch('/api/public/checkout-embebido'");
  assert.ok(ini > 0);
  assert.match(f.slice(ini, ini + 3000), /aceptaCondiciones: privacidadAceptada/);
});
