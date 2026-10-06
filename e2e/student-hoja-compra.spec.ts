import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, SOCIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';
import { STRIPE_STUB } from './stripe-stub';
import { contarGoogleFonts } from './letras-sin-google';

// La hoja de compra: la ÚLTIMA pantalla antes de pagar.
//
// ⚠️ Existe porque el escaparate y la hoja decían precios distintos del mismo
// plan. La tarjeta de la tienda ponía «89 €/mes»; la hoja, ya con el dedo en
// «Continuar al pago», ponía **«89 €»** a secas. Un cobro que se repite cada mes
// presentado como pago único, justo en el momento de confirmarlo.
//
// El escaparate ya sabía hacerlo (`familia === 'suscripcion'` → `/mes`); la hoja
// no preguntaba. Ahora la regla es una sola (`esSuscripcion`) y la usan las dos.

const base = `/portal/${SLUG}`;

async function montar(page: Page, o: { conStripe?: boolean } = {}) {
  const { conStripe = true } = o;
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  (f.studio as Record<string, unknown>).stripeAccountId = conStripe ? 'acct_test_123' : null;
  f.planesTarifa = [
    { id: 'plan-mes', studioId: STUDIO_ID, nombre: 'Mensual ilimitado', tipo: 'MENSUAL', sesiones: null, precio: 89, activo: true, periodicidadMeses: 1 },
    { id: 'plan-tri', studioId: STUDIO_ID, nombre: 'Trimestral', tipo: 'MENSUAL', sesiones: null, precio: 240, activo: true, periodicidadMeses: 3 },
    { id: 'plan-bono8', studioId: STUDIO_ID, nombre: 'Bono 8 sesiones', tipo: 'BONO', sesiones: 8, precio: 96, activo: true },
  ];
  const json = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  await page.route('**/api/public/studio-data', (r) => r.fulfill(json(f)));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [], unread: 0 })));
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill(
    json({ socioId: SOCIO_ID, nombre: 'Ana Test', email: 'socia-e2e@test.com' }),
  ));
  await page.route(/js\.stripe\.com/, (r) => r.abort());
}

/** El texto de la hoja abierta, que es lo último que se lee antes de pagar. */
async function textoDeLaHoja(page: Page) {
  await expect(page.getByText('El cobro lo hace el estudio')).toBeVisible({ timeout: 30_000 });
  const hoja = page.locator('[role="dialog"]').last();
  return (await hoja.innerText()).replace(/\n+/g, ' | ');
}

test.describe('Student PWA · hoja de compra', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('una suscripción mensual dice «/mes» también al confirmar', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/comprar`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Contratar · / }).first().click({ timeout: 30_000 });
    const texto = await textoDeLaHoja(page);
    expect(texto, 'la hoja presenta un cobro recurrente como pago único').toContain('89 €/mes');
  });

  test('y una trimestral dice «/trimestre», no «/mes»', async ({ page }) => {
    // El periodo sale de `nombrePeriodo`, que es de donde ya salía en la tienda:
    // no se reinventa aquí ni se da por hecho que toda suscripción es mensual.
    await montar(page);
    await page.goto(`${base}/comprar`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Contratar · / }).nth(1).click({ timeout: 30_000 });
    const texto = await textoDeLaHoja(page);
    expect(texto).toContain('240 €/trimestre');
  });

  test('un bono NO lleva periodo: se paga una vez', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/comprar`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Comprar · / }).first().click({ timeout: 30_000 });
    const texto = await textoDeLaHoja(page);
    expect(texto).toContain('96 €');
    expect(texto, 'a un bono se le ha colado un periodo').not.toMatch(/96 €\s*\/\s*\w/);
  });

  test('sin pagos activados no se ofrece pagar, y se dice por qué', async ({ page }) => {
    await montar(page, { conStripe: false });
    await page.goto(`${base}/comprar`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Comprar · / }).first().click({ timeout: 30_000 });
    await expect(page.getByText(/todavía no tiene los pagos activados/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Continuar al pago/ })).toHaveCount(0);
  });

  // ⚠️ Bug real visto en producción (2026-09-11): la hoja es UNA sola instancia
  // que el padre reutiliza para cualquier plan (no hay `key={plan.id}`), así
  // que cancelar la compra de un plan y abrir "Comprar" en OTRO dejaba el
  // `clientSecret`/importe del plan ANTERIOR en el estado — el título ya decía
  // el plan nuevo (viene de la prop), pero el Total y el botón de pagar seguían
  // mostrando el precio del que se acababa de cancelar. Encontrado a mano
  // (Bono 12 clases 95 € cancelado → Clase suelta 1 € abierta acto seguido →
  // "Total 95 €"), reproducido aquí con Bono 8 sesiones (96 €) y Mensual (89 €).
  test('cancelar un plan y comprar OTRO no arrastra el precio del anterior', async ({ page }) => {
    await montar(page);
    // Sin esto, CheckoutEmbebido cae al aviso de «pago no disponible» y nunca
    // llega a pintar el Total que este test necesita comprobar.
    await page.route('https://js.stripe.com/**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/javascript', body: STRIPE_STUB }));
    await page.route((u) => u.pathname === '/api/public/checkout-embebido', async (r) => {
      const body = r.request().postDataJSON() as { planId?: string };
      const importe = body.planId === 'plan-bono8' ? 96 : 89;
      return r.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ clientSecret: `pi_${body.planId}_secret_x`, importe }),
      });
    });

    await page.goto(`${base}/comprar`, { waitUntil: 'domcontentloaded' });
    // El catálogo detrás de la hoja también enseña "96 €"/"89 €" en sus
    // propias tarjetas — todas las comprobaciones de precio se acotan a la
    // hoja abierta (el diálogo), nunca a la página entera.
    const hoja = page.locator('[role="dialog"]').last();

    // Abre "Bono 8 sesiones" (96 €), llega hasta el paso de pago, y cancela.
    await page.getByRole('button', { name: /^Comprar · / }).first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Continuar al pago' }).click();
    await expect(hoja.getByText('Confirmar reserva')).toBeVisible({ timeout: 30_000 });
    await expect(hoja.getByText('96 €').first()).toBeVisible();
    await hoja.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByText('Confirmar reserva')).not.toBeVisible();

    // Abre "Mensual ilimitado" (89 €) justo después: el Total tiene que ser
    // el de ESTE plan, no el arrastrado del anterior.
    await page.getByRole('button', { name: /^Contratar · / }).first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Continuar al pago' }).click();
    await expect(hoja.getByText('Confirmar reserva')).toBeVisible({ timeout: 30_000 });
    await expect(hoja.getByText('96 €')).toHaveCount(0);
    await expect(hoja.getByText('89 €').first()).toBeVisible();
  });

  test('⚠️ con matrícula, el total y el botón son cuota + matrícula (un solo cargo), no solo la cuota', async ({ page }) => {
    await montar(page);
    await page.route('https://js.stripe.com/**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/javascript', body: STRIPE_STUB }));
    let pedidos = 0;
    await page.route((u) => u.pathname === '/api/public/checkout-embebido', (r) => {
      pedidos += 1;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clientSecret: 'pi_matricula_secret_x', importe: 96, matricula: 30, descuento: 0 }) });
    });
    await page.goto(`${base}/comprar`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Comprar · / }).first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Continuar al pago' }).click();
    const hoja = page.locator('[role="dialog"]').last();
    await expect(hoja.getByTestId('desglose')).toContainText('126 €', { timeout: 30_000 });
    await expect(hoja.getByRole('button', { name: /^Pagar 126/ })).toBeVisible({ timeout: 30_000 });
    expect(pedidos).toBe(1);
  });

  test('un rechazo del banco se dice con su motivo, y la hoja no da la compra por hecha', async ({ page }) => {
    // El stub de Stripe responde como un rechazo real (`{ error }` con
    // `decline_code`). Con su contador: «no se cobró» solo vale si se intentó.
    await montar(page);
    await page.route('https://js.stripe.com/**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/javascript', body: STRIPE_STUB }));
    await page.addInitScript(() => { (window as unknown as { __TENTARE_CONFIRM: string }).__TENTARE_CONFIRM = 'card_error'; });
    await page.route((u) => u.pathname === '/api/public/checkout-embebido', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clientSecret: 'pi_rechazo123_secret_x', importe: 96 }) }));
    await page.goto(`${base}/comprar`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Comprar · / }).first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Continuar al pago' }).click();
    const hoja = page.locator('[role="dialog"]').last();
    await hoja.getByRole('button', { name: /^Pagar 96/ }).click({ timeout: 30_000 });
    await expect(page.getByText(/Tu tarjeta no tiene fondos suficientes/)).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => (window as unknown as { __TENTARE_CONFIRM_LLAMADAS?: number }).__TENTARE_CONFIRM_LLAMADAS ?? 0)).toBe(1);
    // El Stripe de la hoja se cargó con la cuenta del estudio (cargo directo).
    const init = await page.evaluate(() => (window as unknown as { __TENTARE_STRIPE_INIT?: { stripeAccount: string | null }[] }).__TENTARE_STRIPE_INIT ?? []);
    expect(init.map(i => i.stripeAccount)).toContain('acct_test_123');
    await expect(page.getByText('Compra realizada')).toHaveCount(0);
  });

  test('⚠️ el pago no le pide la letra a Google: la de su app, de Tentare', async ({ page }) => {
    // El iframe de Stripe no ve las fuentes de la app: se le dan sus caras.
    // Eran de Google (Instrument Sans), o sea la IP de la alumna a un tercero
    // al pagar.
    const google = await contarGoogleFonts(page);
    await montar(page);
    await page.route('https://js.stripe.com/**', (r) =>
      r.fulfill({ status: 200, contentType: 'application/javascript', body: STRIPE_STUB }));
    await page.route((u) => u.pathname === '/api/public/checkout-embebido', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clientSecret: 'pi_plan_secret_x', importe: 96 }) }));
    await page.goto(`${base}/comprar`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Comprar · / }).first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Continuar al pago' }).click();
    await expect(page.locator('[role="dialog"]').last().getByText('Confirmar reserva')).toBeVisible({ timeout: 30_000 });
    // El control: Elements se creó (lo que apunta el stub) y con una letra.
    await expect.poll(() => page.evaluate(() => ((window as unknown as { __TENTARE_STRIPE_ELEMENTS?: unknown[] }).__TENTARE_STRIPE_ELEMENTS ?? []).length)).toBeGreaterThan(0);
    const opciones = await page.evaluate(() =>
      (window as unknown as { __TENTARE_STRIPE_ELEMENTS: { fonts?: { family?: string; src?: string }[]; appearance?: { variables?: { fontFamily?: string } } }[] }).__TENTARE_STRIPE_ELEMENTS);
    const tentare = `url(${new URL(page.url()).origin}/widget-fuentes/v1/`;
    for (const o of opciones) {
      // La de su pareja de letras, sea cual sea: de las que sirve Tentare.
      const familia = /^'(Tentare [A-Za-z ]+)', system-ui, sans-serif$/.exec(o.appearance?.variables?.fontFamily ?? '')?.[1];
      expect(familia, o.appearance?.variables?.fontFamily).toBeTruthy();
      expect(o.fonts?.length).toBeGreaterThan(0);
      for (const cara of o.fonts ?? []) {
        expect(cara.family).toBe(familia);
        expect(cara.src?.startsWith(tentare), cara.src).toBe(true);
      }
    }
    expect(google).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// P01 (6-oct-2026): después de pagar, la hoja NO dice «ya está en tu cuenta»
// hasta que el servidor lo confirma (`estado-pago` con `compra.entregada`).
// Antes salía «Compra realizada · Ya está en tu cuenta» en cuanto Stripe
// contestaba, con el bono todavía sin entregar (lo hace el webhook).
// Contador de `estado-pago` en todos: «no dijo ✓» solo vale si preguntó.
// ─────────────────────────────────────────────────────────────────────────────

const PI = 'pi_3AbcDEF1234567';
const ENTREGADA = { estado: 'en_proceso', compra: { entregada: true, plan: 'Bono 8 sesiones', sesionesRestantes: 8, fechaFin: '2026-12-31' } };

type Respuesta = { status: number; body?: unknown; headers?: Record<string, string>; abortar?: boolean };

/** Monta la hoja hasta el botón de pagar, con `estado-pago` contestando lo que diga `responder(n)`. */
async function pagarYEsperar(page: Page, responder: (n: number) => Respuesta) {
  await montar(page);
  await page.route('https://js.stripe.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: STRIPE_STUB }));
  await page.route((u) => u.pathname === '/api/public/checkout-embebido', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clientSecret: `${PI}_secret_x`, importe: 96 }) }));
  const peticiones: { url: string; auth: string | null }[] = [];
  await page.route((u) => u.pathname === '/api/public/estado-pago', (r) => {
    peticiones.push({ url: r.request().url(), auth: r.request().headers()['authorization'] ?? null });
    const res = responder(peticiones.length);
    if (res.abortar) return r.abort();
    return r.fulfill({ status: res.status, contentType: 'application/json', headers: res.headers, body: JSON.stringify(res.body ?? {}) });
  });
  await page.goto(`${base}/comprar`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Comprar · / }).first().click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Continuar al pago' }).click();
  await page.getByRole('button', { name: /^Pagar 96/ }).click({ timeout: 30_000 });
  return peticiones;
}

/** Adelanta el reloj de la página para no esperar los ~35 s del sondeo de verdad. */
async function adelantar(page: Page, veces: number) {
  for (let i = 0; i < veces; i++) {
    await page.clock.fastForward(9_000);
    await page.waitForTimeout(150);
  }
}

test.describe('Student PWA · hoja de compra · después de pagar (P01)', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('mientras el servidor no lo confirma: «Activando tu bono…», nunca «Compra realizada»', async ({ page }) => {
    const peticiones = await pagarYEsperar(page, () => ({ status: 200, body: { estado: 'en_proceso' } }));
    await expect(page.getByText('Pago recibido. Activando tu bono…')).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => peticiones.length, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
    await expect(page.getByText('Compra realizada')).toHaveCount(0);
    // Pregunta con SU sesión y por su pago, no por email.
    expect(peticiones[0].auth).toMatch(/^Bearer /);
    expect(peticiones[0].url).toContain(`pi=${PI}`);
    expect(peticiones[0].url).not.toContain('email=');
  });

  test('cuando el servidor dice que está: «activo · te quedan N», y a Mis bonos comprobando', async ({ page }) => {
    const peticiones = await pagarYEsperar(page, (n) => (n < 2 ? { status: 200, body: { estado: 'en_proceso' } } : { status: 200, body: ENTREGADA }));
    await expect(page.getByText('Compra realizada')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('compra-entregada')).toContainText('Bono 8 sesiones activo · te quedan 8 clases');
    expect(peticiones.length).toBeGreaterThanOrEqual(2);
    await page.getByRole('button', { name: 'Ver Mi plan' }).click();
    await expect(page).toHaveURL(/\/bonos\?compra=ok&plan=plan-bono8/, { timeout: 30_000 });
  });

  test('si el servidor falla siempre: el texto de «tarda», sin ✓ y sin «vuelve a pagar»', async ({ page }) => {
    const peticiones = await pagarYEsperar(page, () => ({ status: 500, body: { error: 'x' } }));
    await expect(page.getByText('Pago recibido. Activando tu bono…')).toBeVisible({ timeout: 15_000 });
    await adelantar(page, 8);
    await expect(page.getByText('El pago está hecho')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/No vuelvas a pagar/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Escribir al estudio' })).toHaveAttribute('href', /\/mensajes$/);
    await expect(page.getByText('Compra realizada')).toHaveCount(0);
    expect(peticiones.length).toBeGreaterThanOrEqual(1);
  });

  test('un 429 se lee como «en proceso»: sigue preguntando y respeta el Retry-After', async ({ page }) => {
    const peticiones = await pagarYEsperar(page, (n) => (n === 1
      ? { status: 429, headers: { 'retry-after': '2' }, body: { error: 'Demasiadas peticiones' } }
      : n < 4 ? { status: 200, body: { estado: 'en_proceso' } } : { status: 200, body: ENTREGADA }));
    await expect(page.getByText('Pago recibido. Activando tu bono…')).toBeVisible({ timeout: 15_000 });
    // Ni error ni ✓ por el 429.
    // (El `alert` vacío de la página es el anunciador de rutas de Next: se mira solo dentro de la hoja.)
    await expect(page.locator('[role="dialog"] [role="alert"]')).toHaveCount(0);
    await adelantar(page, 3);
    await expect(page.getByText('Compra realizada')).toBeVisible({ timeout: 20_000 });
    expect(peticiones.length - 1, 'después del 429 siguió preguntando').toBeGreaterThanOrEqual(2);
  });

  test('sin red a mitad del sondeo: sigue preguntando hasta que el servidor contesta', async ({ page }) => {
    const peticiones = await pagarYEsperar(page, (n) => (n <= 2 ? { status: 0, abortar: true } : { status: 200, body: ENTREGADA }));
    await adelantar(page, 2);
    await expect(page.getByText('Compra realizada')).toBeVisible({ timeout: 20_000 });
    expect(peticiones.length).toBeGreaterThanOrEqual(3);
  });

  test('sesión caducada al confirmar: vuelve a entrar, y el pago no se da por perdido', async ({ page }) => {
    const peticiones = await pagarYEsperar(page, () => ({ status: 401, body: { error: 'Tu sesión ha caducado' } }));
    await expect(page.getByText(/tu pago está hecho y no se pierde/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Volver a entrar' })).toBeVisible();
    // Nunca «Intentar de nuevo»: crearía otro cobro.
    await expect(page.getByRole('button', { name: 'Intentar de nuevo' })).toHaveCount(0);
    expect(peticiones.length).toBe(1);
  });
});
