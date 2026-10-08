import { test, expect, type Page } from '@playwright/test';
import { SLUG, SOCIO_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// Tarjeta regalo · la alumna canjea el código y ve su saldo. Con contador en los caminos de fallo.
const base = `/portal/${SLUG}/regalo`;
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });

async function montar(page: Page, tarjetas: unknown[] = []) {
  await sembrarSociaLista(page, { relojMadrid: true });
  const f = fixtureSociaLista() as unknown as Record<string, unknown>;
  await page.route('**/api/public/studio-data', (r) => r.fulfill(json(f)));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [], unread: 0 })));
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill(json({ socioId: SOCIO_ID, nombre: 'Ana Test', email: 'socia-e2e@test.com' })));
  await page.route('**/api/public/regalo/mis-tarjetas**', (r) => r.fulfill(json({ tarjetas })));
}

test.describe('Tarjeta regalo · canje de la alumna', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('canjea un código válido y enseña el saldo que contesta el servidor', async ({ page }) => {
    await montar(page);
    const peticiones: Record<string, unknown>[] = [];
    await page.route('**/api/public/regalo/canjear', (r) => {
      peticiones.push(r.request().postDataJSON() ?? {});
      return r.fulfill(json({ ok: true, saldo: 50, caducaEn: '2027-10-09' }));
    });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Código de la tarjeta').fill('rg-abcd-2345-efgh-6789');
    await page.getByRole('button', { name: 'Canjear' }).click();
    await expect.poll(() => peticiones.length, { timeout: 30_000 }).toBe(1);
    expect(peticiones[0]).toMatchObject({ codigo: 'rg-abcd-2345-efgh-6789' });
    expect(peticiones[0], 'la identidad sale del token, no del body').not.toHaveProperty('socioId');
  });

  test('⚠️ un código que el servidor rechaza se explica y no se da por canjeado', async ({ page }) => {
    await montar(page);
    let intentos = 0;
    await page.route('**/api/public/regalo/canjear', (r) => { intentos += 1; return r.fulfill(json({ error: 'Ese código no es válido. Revisa que lo hayas escrito igual que en el correo.' }, 400)); });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Código de la tarjeta').fill('RG-AAAA-AAAA-AAAA-AAAA');
    await page.getByRole('button', { name: 'Canjear' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Ese código no es válido' })).toBeVisible({ timeout: 30_000 });
    expect(intentos, 'el canje no llegó a intentarse').toBe(1);
    await expect(page.getByTestId('tarjeta-regalo')).toHaveCount(0);
  });

  test('⚠️ con la red caída el botón vuelve a estar libre y lo dice', async ({ page }) => {
    await montar(page);
    let intentos = 0;
    await page.route('**/api/public/regalo/canjear', (r) => { intentos += 1; return r.abort('connectionfailed'); });
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Código de la tarjeta').fill('RG-AAAA-AAAA-AAAA-AAAA');
    await page.getByRole('button', { name: 'Canjear' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'No hemos podido canjear' })).toBeVisible({ timeout: 30_000 });
    expect(intentos).toBe(1);
    await expect(page.getByRole('button', { name: 'Canjear' })).toBeEnabled();
  });

  test('lista sus tarjetas con saldo, estado y caducidad', async ({ page }) => {
    await montar(page, [{ id: 't1', importeInicial: 100, saldo: 35, caducaEn: '2027-10-09', estado: 'ACTIVA' }]);
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    const t = page.getByTestId('tarjeta-regalo');
    await expect(t).toBeVisible({ timeout: 60_000 });
    await expect(t).toContainText('35');
    await expect(t).toContainText('De 100');
  });
});
