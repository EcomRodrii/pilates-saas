import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';
import { STRIPE_STUB } from './stripe-stub';

// ──────────────────────────────────────────────────────────────
// Bizum fuera de las cuotas.
//
// Bizum es un pago puntual: no deja tarjeta guardada. En una cuota (mensual,
// trimestral o anual — todas son `tipo: 'MENSUAL'` con su `periodicidadMeses`)
// el primer ciclo se cobraba y el siguiente no tenía con qué cobrarse solo: la
// alumna seguía con su plan sin pagar, o se quedaba sin su mensualidad.
//
// La cerradura está en el servidor (`/api/stripe/checkout` ignora `bizum` en
// una cuota); esto vigila la pantalla, que no debe ofrecer un botón que el
// servidor no va a atender. Con contraprueba: si el bono dejara de enseñar
// «Pagar con Bizum», la ausencia en las cuotas no probaría nada.
// ──────────────────────────────────────────────────────────────

const base = `/portal/${SLUG}`;

async function montar(page: Page, plan: { id: string; nombre: string; precio: number; tipo: string; sesiones?: number; periodicidadMeses?: number }) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  f.planesTarifa = [{ studioId: STUDIO_ID, activo: true, ...plan }];
  (f.studio as Record<string, unknown>).stripeAccountId = 'acct_test';
  await page.route('**/api/public/studio-data', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
  // Sin Stripe «cargado», `CheckoutEmbebido` no monta el formulario y ni el
  // botón de pagar ni el de Bizum existirían: la ausencia no probaría nada.
  await page.route('https://js.stripe.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: STRIPE_STUB }));
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ socioId: 'socio-e2e-1', nombre: 'Ana Test', email: 'socia-e2e@test.com' }),
  }));
  await page.route((u) => u.pathname === '/api/public/checkout-embebido', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ clientSecret: 'pi_x_secret_y', importe: plan.precio }),
  }));
}

async function abrirPago(page: Page, nombre: string, boton: 'Comprar' | 'Contratar') {
  await page.goto(`${base}/comprar`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(nombre)).toBeVisible({ timeout: 30_000 });
  await page.locator('article').filter({ hasText: nombre }).getByRole('button', { name: boton, exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar al pago' }).click();
}

test.describe('Bizum fuera de las cuotas', () => {
  test.describe.configure({ timeout: 120_000 });

  for (const [periodo, meses, precio] of [['mensual', 1, 89], ['trimestral', 3, 240], ['anual', 12, 890]] as const) {
    test(`una cuota ${periodo} se paga solo con tarjeta`, async ({ page }) => {
      const nombre = `Cuota ${periodo}`;
      await montar(page, { id: `p-${periodo}`, nombre, precio, tipo: 'MENSUAL', periodicidadMeses: meses });
      await abrirPago(page, nombre, 'Contratar');
      // Primero que el formulario de pago está: sin él, «no hay Bizum» sería verdad por no haber nada.
      await expect(page.getByRole('button', { name: `Pagar ${precio} €`, exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByRole('button', { name: 'Pagar con Bizum' })).toHaveCount(0);
    });
  }

  test('contraprueba: un bono sí ofrece Bizum', async ({ page }) => {
    await montar(page, { id: 'p-bono', nombre: 'Bono Reformer', precio: 70, sesiones: 5, tipo: 'BONO' });
    await abrirPago(page, 'Bono Reformer', 'Comprar');
    await expect(page.getByRole('button', { name: 'Pagar 70 €', exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Pagar con Bizum' })).toHaveCount(1);
  });
});
