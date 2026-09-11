import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';
import { STRIPE_STUB } from './stripe-stub';

// ─────────────────────────────────────────────────────────────────────────────
// La casilla de aceptación en el checkout.
//
// Antes, lo único «legal» que veía la clienta al pagar era el aviso de Stripe,
// que va sobre el MEDIO DE PAGO. Ahora hay una casilla que tiene que marcar, y
// hasta que la marca el botón de pagar no funciona.
//
// Lo que se vigila:
//
//  · Nace SIN marcar. Una casilla premarcada no es una aceptación: es un
//    trámite que alguien atravesó sin mirar.
//  · El botón está BLOQUEADO hasta marcarla — no basta con enseñar el texto.
//  · Los documentos se pueden LEER ahí mismo. «Acepto» sobre algo que no se
//    puede abrir no significa nada.
//  · Sin textos que enseñar no hay casilla, en vez de una que bloquee el pago
//    contra documentos que no existen.
// ─────────────────────────────────────────────────────────────────────────────

const base = `/portal/${SLUG}`;

const LEGAL = {
  politicaPrivacidad: 'Política de privacidad de Pilates Centro. Responsable: Pilates Centro SL, NIF B00000000.',
  terminosServicio: 'Condiciones del servicio. Cancelación gratuita hasta 12 horas antes.',
};

async function montar(page: Page, opts: { conTextos?: boolean } = {}) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  f.planesTarifa = [{ id: 'p-ref', studioId: STUDIO_ID, nombre: 'Bono Reformer', precio: 70, sesiones: 5, activo: true, tipo: 'BONO' }];
  const studio = f.studio as Record<string, unknown>;
  studio.stripeAccountId = 'acct_test';
  if (opts.conTextos !== false) {
    studio.politicaPrivacidad = LEGAL.politicaPrivacidad;
    studio.terminosServicio = LEGAL.terminosServicio;
  } else {
    studio.politicaPrivacidad = null;
    studio.terminosServicio = null;
  }
  await page.route('**/api/public/studio-data', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
  // Con `js.stripe.com` abortado, `CheckoutEmbebido` cae a su aviso de «no se
  // ha podido cargar el pago» y NO monta el formulario: ni Payment Element, ni
  // botón de pagar, ni casilla. Hace falta que Stripe «cargue».
  await page.route('https://js.stripe.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: STRIPE_STUB }));
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ socioId: 'socio-e2e-1', nombre: 'Ana Test', email: 'socia-e2e@test.com' }),
  }));
  await page.route((u) => u.pathname === '/api/public/checkout-embebido', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ clientSecret: 'pi_x_secret_y', importe: 70 }),
  }));
}

async function abrirPago(page: Page) {
  await page.goto(`${base}/comprar`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Bono Reformer')).toBeVisible({ timeout: 30_000 });
  await page.locator('article').filter({ hasText: 'Bono Reformer' }).getByRole('button', { name: 'Comprar' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar al pago' }).click();
}

test.describe('Casilla de aceptación en el checkout', () => {
  test('nace sin marcar, y hasta marcarla no se puede pagar', async ({ page }) => {
    await montar(page);
    await abrirPago(page);

    const casilla = page.getByRole('checkbox');
    await expect(casilla).toBeVisible({ timeout: 30_000 });
    // Premarcada no sería una aceptación, sería un trámite atravesado sin mirar.
    await expect(casilla).not.toBeChecked();

    // Nombre EXACTO, no /^Pagar/: el fallback de Bizum ("Pagar con Bizum")
    // también empieza por "Pagar" y el regex resolvía a dos botones.
    const pagar = page.getByRole('button', { name: 'Pagar 70 €' });
    await expect(pagar).toBeDisabled();

    await casilla.check();
    await expect(pagar).toBeEnabled();

    // Y se puede volver atrás: desmarcarla vuelve a bloquear el cobro.
    await casilla.uncheck();
    await expect(pagar).toBeDisabled();
  });

  test('los documentos se pueden leer ahí mismo', async ({ page }) => {
    // «Acepto» sobre algo que no se puede abrir no significa nada.
    await montar(page);
    await abrirPago(page);

    await page.getByRole('button', { name: 'condiciones del servicio' }).click();
    await expect(page.getByText(/Cancelación gratuita hasta 12 horas antes/)).toBeVisible();

    await page.getByRole('button', { name: 'política de privacidad' }).click();
    await expect(page.getByText(/Responsable: Pilates Centro SL/)).toBeVisible();
  });

  test('sin textos que enseñar no hay casilla, y el pago no queda bloqueado', async ({ page }) => {
    // Una casilla que exige aceptar documentos inexistentes dejaría al estudio
    // sin poder cobrar. El servidor compone los efectivos, así que este caso es
    // el de un payload que no los trae; el pago sigue su curso.
    await montar(page, { conTextos: false });
    await abrirPago(page);

    await expect(page.getByRole('button', { name: 'Pagar 70 €' })).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByRole('checkbox')).toHaveCount(0);
  });
});
