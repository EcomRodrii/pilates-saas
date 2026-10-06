// ─────────────────────────────────────────────────────────────────────────────
// Guardias estáticas de la compra de packs de consultas. Leen el código: lo que
// vigilan son decisiones que un cambio despistado rompería sin que ningún test
// de comportamiento lo notara.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RAIZ = new URL('../../', import.meta.url).pathname;
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const leer = (f: string) => sinComentarios(readFileSync(join(RAIZ, f), 'utf8'));

function ficheros(dir: string): string[] {
  return readdirSync(join(RAIZ, dir)).flatMap(n => {
    const p = join(RAIZ, dir, n);
    return statSync(p).isDirectory() ? ficheros(relative(RAIZ, p)) : [relative(RAIZ, p)];
  }).filter(f => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'));
}

test('toda ruta que abre un Checkout de Stripe lleva el guardia de modo (regla del repo: cada vía de cobro)', () => {
  const rutas = ficheros('app/api').filter(f => /checkout\.sessions\.create|crearCheckoutPack\(/.test(leer(f)));
  assert.ok(rutas.includes('app/api/asistente/packs/route.ts'), 'la ruta de packs abre un Checkout');
  for (const f of rutas) assert.match(leer(f), /comprobarModoStripe\(\)/, `${f}: abre un Checkout sin comprobarModoStripe`);
});

test('el Checkout del pack es de PLATAFORMA y de pago único, con su marca, factura y precio del catálogo', () => {
  const src = leer('lib/asistente/packs-servidor.ts');
  assert.match(src, /mode: 'payment'/);
  assert.doesNotMatch(src, /stripeAccount/, 'nunca sobre una cuenta Connect: es dinero de Tentare');
  assert.match(src, /metadata = \{ origen: ORIGEN_PACK, studio_id: studioId, pack: String\(pack\.unidades\) \}/);
  assert.match(src, /payment_intent_data: \{ metadata/, 'el PaymentIntent lleva la marca: los reembolsos y disputas se reconocen por ella');
  assert.match(src, /invoice_creation: \{ enabled: true/);
  assert.match(src, /unit_amount: centimosDe\(pack\)/);
  assert.doesNotMatch(src, /allow_promotion_codes|discounts/, 'sin códigos: lo cobrado es el precio del catálogo');
  assert.doesNotMatch(src, /automatic_tax/, 'la fiscalidad es decisión del fundador: igual que la suscripción SaaS');
});

test('ia_packs solo la escribe packs-libro.ts (y solo lo llaman el webhook de la plataforma y su red, el conciliador)', () => {
  for (const f of [...ficheros('app'), ...ficheros('lib'), ...ficheros('components')]) {
    if (f === 'lib/asistente/packs-libro.ts' || f.startsWith('lib/db-types')) continue;
    const src = leer(f);
    assert.doesNotMatch(src, /from\('ia_packs'\)\s*\.(insert|upsert|update|delete)\(/, `${f} escribe ia_packs`);
  }
  const quien = [...ficheros('app'), ...ficheros('lib')].filter(f => /acreditarPack\(|retirarPackPorPago\(/.test(leer(f)) && f !== 'lib/asistente/packs-libro.ts');
  assert.deepEqual(quien.sort(), ['app/api/billing/webhook/route.ts', 'lib/asistente/packs-conciliar.ts'],
    'la página de vuelta solo lee: el pack lo crea el webhook (y, si no llega, el conciliador)');
});

test('el webhook de Connect sale ANTES de procesar nada si el evento es de un pack', () => {
  const src = leer('app/api/stripe/webhook/route.ts');
  const proc = src.slice(src.indexOf('async function procesarEvento('));
  const guardia = proc.indexOf('if (!event.account && eventoDePack(event))');
  const primerTipo = proc.indexOf("event.type === '");
  assert.ok(guardia > 0 && guardia < primerTipo, 'la salida de ia_pack va antes del primer manejador');
});

test('el webhook SaaS mira el pack ANTES de la rama de suscripción y de la de «pago de socia»', () => {
  const src = leer('app/api/billing/webhook/route.ts');
  const pack = src.indexOf('esDePack(event.data.object as Stripe.Checkout.Session)');
  assert.ok(pack > 0, 'falta la rama del pack');
  assert.ok(pack < src.indexOf("s.mode === 'subscription'"), 'la rama del pack va antes de la de suscripción');
  assert.match(src, /checkout\.session\.async_payment_succeeded/);
  assert.match(src, /charge\.refunded/);
  assert.match(src, /charge\.dispute\.closed/);
  assert.match(src, /charge\.dispute\.created/, 'las disputas SEPA nacen perdidas');
});

test('la compra es solo de la propietaria, en la ruta (la UI no es el límite)', () => {
  const src = leer('app/api/asistente/packs/route.ts');
  const i = src.indexOf('puedeComprarPacks(sesion.rol)');
  assert.ok(i > 0 && i < src.indexOf('crearCheckoutPack('));
  assert.match(leer('app/api/asistente/packs/estado/route.ts'), /puedeComprarPacks\(sesion\.rol\)/);
  assert.match(leer('lib/asistente/servidor.ts'), /\.\.\.\(puedeComprar \? \{ packs \} : \{\}\)/, 'el detalle de los packs (dinero) solo a la propietaria');
});

test('las rutas del pack pasan el estudio de la SESIÓN, y packs-servidor acota cada consulta a él', () => {
  assert.match(leer('app/api/asistente/packs/route.ts'), /crearCheckoutPack\(\{ admin, stripe, studioId: sesion\.studioId,/);
  assert.match(leer('app/api/asistente/packs/estado/route.ts'), /estadoDeCompra\(admin, stripe, sesion\.studioId, id\)/);
  const src = leer('lib/asistente/packs-servidor.ts');
  const packs = src.match(/\.from\('ia_packs'\)[^;]*;/g) ?? [];
  assert.ok(packs.length > 0);
  for (const q of packs) assert.match(q, /\.eq\('studio_id', studioId\)/, q);
  const estudios = src.match(/\.from\('studios'\)[^;]*;/g) ?? [];
  assert.ok(estudios.length > 0);
  for (const q of estudios) assert.match(q, /\.eq\('id', (studioId|studio\.id)\)/, q);
});
