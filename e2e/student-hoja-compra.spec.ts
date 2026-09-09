import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, SOCIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

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
    await page.getByRole('button', { name: /^Contratar$/ }).first().click({ timeout: 30_000 });
    const texto = await textoDeLaHoja(page);
    expect(texto, 'la hoja presenta un cobro recurrente como pago único').toContain('89 €/mes');
  });

  test('y una trimestral dice «/trimestre», no «/mes»', async ({ page }) => {
    // El periodo sale de `nombrePeriodo`, que es de donde ya salía en la tienda:
    // no se reinventa aquí ni se da por hecho que toda suscripción es mensual.
    await montar(page);
    await page.goto(`${base}/comprar`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Contratar$/ }).nth(1).click({ timeout: 30_000 });
    const texto = await textoDeLaHoja(page);
    expect(texto).toContain('240 €/trimestre');
  });

  test('un bono NO lleva periodo: se paga una vez', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/comprar`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Comprar$/ }).first().click({ timeout: 30_000 });
    const texto = await textoDeLaHoja(page);
    expect(texto).toContain('96 €');
    expect(texto, 'a un bono se le ha colado un periodo').not.toMatch(/96 €\s*\/\s*\w/);
  });

  test('sin pagos activados no se ofrece pagar, y se dice por qué', async ({ page }) => {
    await montar(page, { conStripe: false });
    await page.goto(`${base}/comprar`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Comprar$/ }).first().click({ timeout: 30_000 });
    await expect(page.getByText(/todavía no tiene los pagos activados/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Continuar al pago/ })).toHaveCount(0);
  });
});
