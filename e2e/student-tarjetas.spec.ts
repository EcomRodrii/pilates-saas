import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';
import { STRIPE_STUB } from './stripe-stub';

// P16 (6-oct-2026): tarjetas guardadas para pagar en un toque dentro de la app, SOLO si la alumna marcó
// «Guárdala para la próxima» (la casilla la pinta Stripe, desmarcada).
//   · Perfil → Método de pago enseña las que guardó y deja quitarlas (DELETE con su id); si el servidor dice que no,
//     se dice y la tarjeta sigue en la lista.
//   · En la hoja de compra, la sesión de tarjetas que da el servidor llega al Payment Element.
// Contadores en todos los caminos. Solo Chromium.

const base = `/portal/${SLUG}`;
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const VISA = { id: 'pm_visa4242', marca: 'visa', ultimos4: '4242', caducidad: '09/27', paraCobros: false };
const MASTER = { id: 'pm_master4444', marca: 'mastercard', ultimos4: '4444', caducidad: '01/28', paraCobros: false };

async function montar(page: Page, o: { borrar?: { status: number; body: unknown } } = {}) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, Record<string, unknown> | unknown[]>;
  Object.assign(f.studio as Record<string, unknown>, { stripeAccountId: 'acct_test_123' });
  f.planesTarifa = [{ id: 'plan-bono8', studioId: STUDIO_ID, nombre: 'Bono 8 sesiones', tipo: 'BONO', sesiones: 8, precio: 96, activo: true }];
  // Los page.route propios, SIEMPRE después del andamiaje.
  await page.route('**/api/public/studio-data', (r) => r.fulfill(json(f)));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [], unread: 0 })));
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill(
    json({ socioId: 'socio-e2e-1', nombre: 'Ana Test', email: 'socia-e2e@test.com' }),
  ));
  await page.route('https://js.stripe.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: STRIPE_STUB }));
  const c = { lista: 0, borrados: [] as Record<string, unknown>[] };
  let tarjetas = [VISA, MASTER];
  await page.route((u) => u.pathname === '/api/public/tarjeta', (r) => {
    if (r.request().method() === 'GET') {
      c.lista += 1;
      return r.fulfill(json({ tarjetas }));
    }
    c.borrados.push(r.request().postDataJSON() as Record<string, unknown>);
    if (o.borrar) return r.fulfill(json(o.borrar.body, o.borrar.status));
    const id = (r.request().postDataJSON() as { paymentMethodId?: string }).paymentMethodId;
    tarjetas = tarjetas.filter((t) => t.id !== id);
    return r.fulfill(json({ ok: true }));
  });
  return c;
}

test.describe('Student PWA · tarjetas guardadas (P16)', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

  test('Perfil enseña las que guardó, y «Quitar» manda SU id y la quita cuando el servidor dice que sí', async ({ page }) => {
    const c = await montar(page);
    await page.goto(`${base}/perfil/pago`, { waitUntil: 'domcontentloaded' });
    const lista = page.getByTestId('tarjetas-app');
    await expect(lista).toBeVisible({ timeout: 45_000 });
    await expect(lista.locator('[data-tarjeta]')).toHaveCount(2);
    await lista.locator('[data-tarjeta="pm_visa4242"]').getByRole('button', { name: 'Quitar' }).click();
    await page.getByRole('button', { name: 'Sí, quitarla' }).click();
    await expect(lista.locator('[data-tarjeta]')).toHaveCount(1, { timeout: 20_000 });
    await expect(lista.locator('[data-tarjeta="pm_master4444"]')).toBeVisible();
    expect(c.borrados).toHaveLength(1);
    expect(c.borrados[0]).toMatchObject({ studioId: STUDIO_ID, paymentMethodId: 'pm_visa4242' });
  });

  for (const [nombre, resp] of [
    ['500', { status: 500, body: { error: 'x' } }],
    ['403 (no es suya)', { status: 403, body: { error: 'No autorizado' } }],
  ] as const) {
    test(`⚠️ quitar falla (${nombre}): se dice, y la tarjeta sigue en la lista`, async ({ page }) => {
      const c = await montar(page, { borrar: resp });
      await page.goto(`${base}/perfil/pago`, { waitUntil: 'domcontentloaded' });
      const lista = page.getByTestId('tarjetas-app');
      await expect(lista.locator('[data-tarjeta]')).toHaveCount(2, { timeout: 45_000 });
      await lista.locator('[data-tarjeta="pm_visa4242"]').getByRole('button', { name: 'Quitar' }).click();
      await page.getByRole('button', { name: 'Sí, quitarla' }).click();
      await expect(page.getByText(nombre === '500' ? 'No se ha podido quitar la tarjeta. Inténtalo de nuevo.' : 'No autorizado')).toBeVisible({ timeout: 20_000 });
      expect(c.borrados.length, 'no llegó a intentarlo: el test no prueba nada').toBeGreaterThan(0);
      await expect(lista.locator('[data-tarjeta="pm_visa4242"]')).toBeVisible();
    });
  }

  test('en la hoja de compra, la sesión de tarjetas del servidor llega al Payment Element', async ({ page }) => {
    await montar(page);
    let pedidos = 0;
    await page.route((u) => u.pathname === '/api/public/checkout-embebido', (r) => {
      pedidos += 1;
      return r.fulfill(json({ clientSecret: 'pi_tarjetas_secret_x', importe: 96, matricula: 0, total: 96, customerSessionClientSecret: 'cuss_secret_e2e' }));
    });
    await page.goto(`${base}/comprar`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Comprar · / }).first().click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Continuar al pago' }).click();
    await expect.poll(() => page.evaluate(() => ((window as unknown as { __TENTARE_STRIPE_ELEMENTS?: unknown[] }).__TENTARE_STRIPE_ELEMENTS ?? []).length), { timeout: 30_000 }).toBeGreaterThan(0);
    const opciones = await page.evaluate(() => (window as unknown as { __TENTARE_STRIPE_ELEMENTS: { customerSessionClientSecret?: string }[] }).__TENTARE_STRIPE_ELEMENTS);
    expect(opciones.some((o) => o?.customerSessionClientSecret === 'cuss_secret_e2e')).toBe(true);
    expect(pedidos).toBe(1);
  });
});
