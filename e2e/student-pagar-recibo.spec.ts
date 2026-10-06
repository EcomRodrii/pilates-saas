import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, SOCIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';
import { STRIPE_STUB } from './stripe-stub';

// RECIBOS (6-oct-2026): «Pagar ahora» y «Renovar mi plan» SIN salir de la app.
//
// Antes los dos mandaban a la página de Stripe y volvían a /pagos?pago=ok, que decía
// «Pago recibido ✓» sin mirar nada. Ahora el Checkout de Stripe va dentro de una hoja
// (el stub de e2e lo crea con `createEmbeddedCheckoutPage`), y «Pagado» solo sale
// cuando el servidor lee el recibo COBRADO. Contador en cada camino.

const base = `/portal/${SLUG}`;
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const RENOVACION = {
  reciboId: 'rec-renov-sus-1-2026-08', concepto: 'Renovación Cuota mensual', importe: 60, vence: '2026-08-01', pagableOnline: true,
};

type Resp = { status: number; body?: unknown; abortar?: boolean };

async function montar(page: Page, o: {
  checkout?: (n: number) => Resp; estadoPago?: (n: number) => Resp; conRenovacion?: boolean; agotado?: boolean;
} = {}) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, Record<string, unknown>>;
  f.studio.stripeAccountId = 'acct_test_123';
  f.socia.renovacionPorPagar = o.conRenovacion === false ? null : RENOVACION;
  if (o.agotado) {
    // Un bono gastado: sin nada activo, Bonos ofrece «Renovar mi plan».
    (f as Record<string, unknown>).planesTarifa = [{ id: 'plan-bono', studioId: STUDIO_ID, nombre: 'Bono 8 sesiones', tipo: 'BONO', sesiones: 8, precio: 96, activo: true }];
    f.socia.suscripciones = [{ id: 'sus-1', socioId: SOCIO_ID, planId: 'plan-bono', estado: 'EXPIRADA', sesionesRestantes: 0, fechaInicio: '2026-06-01', fechaFin: '2026-07-31' }];
  }
  await page.route('**/api/public/studio-data', (r) => r.fulfill(json(f)));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [], unread: 0 })));
  await page.route('https://js.stripe.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: STRIPE_STUB }));
  const checkout: Record<string, unknown>[] = [];
  await page.route('**/api/stripe/checkout', (r) => {
    checkout.push(JSON.parse(r.request().postData() ?? '{}') as Record<string, unknown>);
    const res = (o.checkout ?? (() => ({ status: 200, body: { clientSecret: 'cs_test_abc_secret_x', checkoutSessionId: 'cs_test_abc' } })))(checkout.length);
    if (res.abortar) return r.abort();
    return r.fulfill(json(res.body ?? {}, res.status));
  });
  const estado: string[] = [];
  await page.route((u) => u.pathname === '/api/public/estado-pago', (r) => {
    estado.push(r.request().url());
    const res = (o.estadoPago ?? (() => ({ status: 200, body: { estado: 'en_proceso', recibo: { situacion: 'COBRADO', renovadoHasta: '2026-09-30' } } })))(estado.length);
    return r.fulfill(json(res.body ?? {}, res.status));
  });
  const renovar: unknown[] = [];
  await page.route('**/api/public/renovar-plan', (r) => {
    renovar.push(r.request().postDataJSON());
    return r.fulfill(json({ reciboId: 'rec-renov-sus-1-2026-10-06' }));
  });
  return { checkout, estado, renovar };
}

const embebidos = (page: Page) => page.evaluate(() => (window as unknown as { __TENTARE_EMBEDDED?: { montado: boolean }[] }).__TENTARE_EMBEDDED ?? []);

async function pagarAhora(page: Page) {
  await page.goto(`${base}/bonos`);
  await page.getByTestId('renovacion-por-pagar').getByRole('button', { name: /^Pagar \d/ }).click({ timeout: 30_000 });
}

test.describe('Student PWA · pagar un recibo sin salir de la app (RECIBOS)', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('el Checkout se monta en la hoja con la cuenta del estudio, y «Pagado» solo cuando el servidor lo lee COBRADO', async ({ page }) => {
    const m = await montar(page, {
      estadoPago: (n) => (n < 2
        ? { status: 200, body: { estado: 'en_proceso', recibo: { situacion: 'POR_COBRAR' } } }
        : { status: 200, body: { estado: 'en_proceso', recibo: { situacion: 'COBRADO', renovadoHasta: '2026-09-30' } } }),
    });
    await pagarAhora(page);
    await expect(page.getByTestId('checkout-incrustado')).toBeVisible({ timeout: 30_000 });
    expect(m.checkout[0]).toMatchObject({ studioId: STUDIO_ID, reciboId: RENOVACION.reciboId, origen: 'portal', modo: 'incrustado' });
    expect(m.checkout[0].bizum, 'en la hoja no va Bizum').toBeUndefined();
    await expect.poll(async () => (await embebidos(page)).filter((e) => e.montado).length).toBe(1);
    const init = await page.evaluate(() => (window as unknown as { __TENTARE_STRIPE_INIT?: { stripeAccount: string | null }[] }).__TENTARE_STRIPE_INIT ?? []);
    expect(init.map((i) => i.stripeAccount)).toContain('acct_test_123');
    // Ella termina de pagar dentro del Checkout.
    expect(await page.evaluate(() => (window as unknown as { __TENTARE_EMBEDDED_COMPLETE: () => boolean }).__TENTARE_EMBEDDED_COMPLETE())).toBe(true);
    await expect(page.getByText('Comprobando tu pago…')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pagado' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Pagado' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Tu plan sigue activo hasta el/)).toBeVisible();
    expect(m.estado.length).toBeGreaterThanOrEqual(2);
    expect(m.estado[0]).toContain(`reciboId=${RENOVACION.reciboId}`);
    expect(m.checkout).toHaveLength(1);
  });

  test('si se está cobrando (409): el texto del servidor, sin montar Stripe', async ({ page }) => {
    const m = await montar(page, { checkout: () => ({ status: 409, body: { error: 'Se le está cobrando ahora mismo con su método guardado.' } }) });
    await pagarAhora(page);
    await expect(page.getByText('Se le está cobrando ahora mismo con su método guardado.')).toBeVisible({ timeout: 30_000 });
    expect(m.checkout.length).toBeGreaterThanOrEqual(1);
    expect(await embebidos(page)).toHaveLength(0);
  });

  test('servidor caído (500) o sin red: «no se te ha cobrado nada», y se puede reintentar', async ({ page }) => {
    const m = await montar(page, { checkout: (n) => (n === 1 ? { status: 500, body: { error: 'x' } } : { status: 0, abortar: true }) });
    await pagarAhora(page);
    await expect(page.getByText(/no se te ha cobrado nada/i).first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Intentar de nuevo' }).click();
    await expect(page.getByText(/Comprueba tu conexión: no se te ha cobrado nada/)).toBeVisible({ timeout: 30_000 });
    expect(m.checkout.length).toBeGreaterThanOrEqual(2);
    expect(await embebidos(page)).toHaveLength(0);
  });

  test('sesión caducada (401): volver a entrar, sin montar Stripe', async ({ page }) => {
    const m = await montar(page, { checkout: () => ({ status: 401, body: { error: 'x' } }) });
    await pagarAhora(page);
    await expect(page.getByRole('button', { name: 'Volver a entrar' })).toBeVisible({ timeout: 30_000 });
    expect(m.checkout.length).toBeGreaterThanOrEqual(1);
    expect(await embebidos(page)).toHaveLength(0);
  });

  test('si el servidor no lo confirma a tiempo: «tu pago está hecho», sin «Pagado»', async ({ page }) => {
    const m = await montar(page, { estadoPago: () => ({ status: 200, body: { estado: 'en_proceso', recibo: { situacion: 'POR_COBRAR' } } }) });
    await pagarAhora(page);
    await expect.poll(async () => (await embebidos(page)).filter((e) => e.montado).length, { timeout: 30_000 }).toBe(1);
    await page.evaluate(() => (window as unknown as { __TENTARE_EMBEDDED_COMPLETE: () => boolean }).__TENTARE_EMBEDDED_COMPLETE());
    for (let i = 0; i < 8; i++) { await page.clock.fastForward(9_000); await page.waitForTimeout(150); }
    await expect(page.getByText('Tu pago está hecho')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Pagado' })).toHaveCount(0);
    expect(m.estado.length).toBeGreaterThanOrEqual(1);
  });

  test('«Renovar mi plan» prepara el recibo y lo paga en la misma hoja', async ({ page }) => {
    const m = await montar(page, { conRenovacion: false, agotado: true });
    await page.goto(`${base}/bonos`);
    await page.getByRole('button', { name: /^Renovar mi (cuota|bono)$/ }).click({ timeout: 30_000 });
    await expect(page.getByTestId('checkout-incrustado')).toBeVisible({ timeout: 30_000 });
    expect(m.renovar).toHaveLength(1);
    expect(m.checkout[0]).toMatchObject({ reciboId: 'rec-renov-sus-1-2026-10-06', modo: 'incrustado' });
  });

  test('una pasada a 1280 px', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const m = await montar(page);
    await pagarAhora(page);
    await expect(page.getByTestId('checkout-incrustado')).toBeVisible({ timeout: 30_000 });
    expect(m.checkout).toHaveLength(1);
  });
});
