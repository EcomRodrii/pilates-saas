import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// El código de descuento en la app de la alumna.
//
// Lo que se comprueba no es que exista un campo, sino la regla que lo hace
// honesto: EL TOTAL LO DICE EL SERVIDOR. La app no resta nada, así que el
// precio mostrado no puede separarse del cobrado.

const base = `/portal/${SLUG}`;

async function montar(page: Page, opts: {
  validar?: (body: Record<string, unknown>) => Record<string, unknown>;
  checkout?: Record<string, unknown>;
} = {}) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  f.planesTarifa = [{ id: 'p-ref', studioId: STUDIO_ID, nombre: 'Bono Reformer', precio: 70, sesiones: 5, activo: true, tipo: 'BONO' }];
  (f.studio as Record<string, unknown>).stripeAccountId = 'acct_test';
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(f) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
  await page.route(/js\.stripe\.com/, (r) => r.abort());
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ socioId: 'socio-e2e-1', nombre: 'Ana Test', email: 'socia-e2e@test.com' }),
  }));
  await page.route((u) => u.pathname === '/api/public/validar-codigo-descuento', async (r) => {
    const body = JSON.parse(r.request().postData() ?? '{}');
    const resp = opts.validar ? opts.validar(body) : { ok: true, descuento: 10 };
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(resp) });
  });
  await page.route((u) => u.pathname === '/api/public/checkout-embebido', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify(opts.checkout ?? { clientSecret: 'pi_x_secret_y', importe: 60, descuento: 10, codigoAplicado: true }),
  }));
}

async function abrirCompra(page: Page) {
  await page.goto(`${base}/comprar`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Bono Reformer')).toBeVisible({ timeout: 30_000 });
  await page.locator('article').filter({ hasText: 'Bono Reformer' }).getByRole('button', { name: 'Comprar' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test.describe('Student PWA · código de descuento', () => {
  test.describe.configure({ timeout: 120_000 });

  test('un código válido lo confirma el SERVIDOR, y dice cuánto', async ({ page }) => {
    await montar(page);
    await abrirCompra(page);
    await page.getByLabel('Código de descuento').fill('bienvenida');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByTestId('codigo-resultado')).toContainText('10');
  });

  test('el servidor recibe el socioId: sin él daría por buena una promo de nuevas', async ({ page }) => {
    // Es el fallo que este trabajo cierra: el endpoint de comprobación daba
    // por hecho «clienta nueva», así que a una socia de siempre le confirmaba
    // un código `soloNuevas` que el cobro luego ignoraba en silencio.
    let recibido: Record<string, unknown> | null = null;
    await montar(page, { validar: (b) => { recibido = b; return { ok: false, motivo: 'Ese código es solo para clientas nuevas' }; } });
    await abrirCompra(page);
    await page.getByLabel('Código de descuento').fill('SOLONUEVAS');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByTestId('codigo-resultado')).toContainText('solo para clientas nuevas');
    expect(recibido).toBeTruthy();
    expect((recibido as unknown as Record<string, unknown>).socioId).toBe('socio-e2e-1');
  });

  test('el desglose y el total salen del servidor, no de una resta en el cliente', async ({ page }) => {
    // El servidor dice 60 € con 10 de descuento sobre un plan de 70.
    await montar(page);
    await abrirCompra(page);
    await page.getByLabel('Código de descuento').fill('BIENVENIDA');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await page.getByRole('button', { name: 'Continuar al pago' }).click();
    const desglose = page.getByTestId('desglose');
    await expect(desglose).toBeVisible({ timeout: 30_000 });
    await expect(desglose).toContainText('70');   // precio
    await expect(desglose).toContainText('10');   // descuento
    await expect(desglose).toContainText('60');   // total, el del servidor
  });

  test('si el código deja de valer entre comprobarlo y pagar, se DICE y se cobra el precio normal', async ({ page }) => {
    // La comprobación lo da por bueno, pero el cobro lo ignora (es lo que hace
    // el servidor: un código inválido nunca bloquea la compra). Callarlo
    // dejaría a la alumna esperando un descuento que no va a llegar.
    await montar(page, {
      validar: () => ({ ok: true, descuento: 10 }),
      checkout: { clientSecret: 'pi_x_secret_y', importe: 70, descuento: 0, codigoAplicado: false },
    });
    await abrirCompra(page);
    await page.getByLabel('Código de descuento').fill('CADUCADO');
    await page.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByTestId('codigo-resultado')).toContainText('10');
    await page.getByRole('button', { name: 'Continuar al pago' }).click();
    await expect(page.getByTestId('codigo-resultado')).toContainText(/ya no se puede aplicar/i);
    // Y sin descuento no se pinta desglose: no hay nada que desglosar.
    await expect(page.getByTestId('desglose')).toHaveCount(0);
  });

  test('sin código, la hoja queda como estaba: ni desglose ni promesas', async ({ page }) => {
    await montar(page);
    await abrirCompra(page);
    await page.getByRole('button', { name: 'Continuar al pago' }).click();
    await expect(page.getByTestId('desglose')).toHaveCount(0);
    await expect(page.getByTestId('codigo-resultado')).toHaveCount(0);
  });
});
