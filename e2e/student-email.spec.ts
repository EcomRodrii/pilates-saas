import { test, expect, type Page } from '@playwright/test';
import { SLUG, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// Cambiar el email con el que entra.
//
// Lo que se comprueba no es que haya un campo, sino que la pantalla NO MIENTE:
// con la confirmación doble activada el cambio queda PENDIENTE, y decir
// «cambiado» dejaría a la alumna creyendo que ya entra con el nuevo.

const base = `/portal/${SLUG}`;
const ACTUAL = 'socia-e2e@test.com';

async function montar(page: Page, respuesta?: { status: number; contentType: string; body: string }) {
  await sembrarSociaLista(page);
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureSociaLista()) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ socioId: 'socio-e2e-1', nombre: 'Ana Test', email: ACTUAL }),
  }));
  await page.route(/js\.stripe\.com/, (r) => r.abort());
  // `updateUser` de gotrue. Por defecto responde con el email VIEJO, que es lo
  // que hace un servidor con confirmación segura: el cambio queda pendiente.
  await page.route('**/auth/v1/user**', (r) => r.fulfill(
    respuesta ?? { status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'auth-e2e', email: ACTUAL }) },
  ));
}

async function abrir(page: Page) {
  await page.goto(`${base}/perfil/datos`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('Email')).toBeVisible({ timeout: 30_000 });
}

test.describe('Student PWA · cambiar el email', () => {
  test.describe.configure({ timeout: 120_000 });

  test('el campo ya NO está muerto: antes decía «pídeselo al estudio»', async ({ page }) => {
    await montar(page);
    await abrir(page);
    const campo = page.getByLabel('Email');
    await expect(campo).toBeEnabled();
    await expect(campo).toHaveValue(ACTUAL);
    // Sin tocarlo no se ofrece cambiar nada.
    await expect(page.getByRole('button', { name: 'Cambiar el email' })).toHaveCount(0);
  });

  test('al escribir otro, avisa de que hará falta confirmarlo', async ({ page }) => {
    await montar(page);
    await abrir(page);
    await page.getByLabel('Email').fill('nuevo@test.com');
    await expect(page.getByText(/Te mandaremos un enlace para confirmarlo/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cambiar el email' })).toBeVisible();
  });

  test('tras pedirlo dice PENDIENTE, no «cambiado»', async ({ page }) => {
    // Es la mentira más cara de esta pantalla: si cree que ya entra con el
    // nuevo y no abre el enlace, se queda fuera.
    await montar(page);
    await abrir(page);
    await page.getByLabel('Email').fill('nuevo@test.com');
    await page.getByRole('button', { name: 'Cambiar el email' }).click();
    const aviso = page.getByTestId('email-aviso');
    await expect(aviso).toBeVisible({ timeout: 30_000 });
    await expect(aviso).toContainText('nuevo@test.com');
    await expect(aviso).toContainText(/entras con el de ahora/i);
    await expect(aviso).not.toContainText(/actualizado/i);
  });

  test('si el email ya es de otra cuenta, se dice con palabras', async ({ page }) => {
    // Sin esto saldría el texto crudo de gotrue, que no significa nada para
    // quien lo lee.
    await montar(page, { status: 422, contentType: 'application/json', body: JSON.stringify({ message: 'A user with this email address has already been registered' }) });
    await abrir(page);
    await page.getByLabel('Email').fill('ocupado@test.com');
    await page.getByRole('button', { name: 'Cambiar el email' }).click();
    const aviso = page.getByTestId('email-aviso');
    await expect(aviso).toContainText(/ya está en uso en otra cuenta/i, { timeout: 30_000 });
    await expect(aviso).not.toContainText(/already been registered/i);
  });

  test('si el servidor SÍ confirma al momento, se dice actualizado', async ({ page }) => {
    // Pasa si el proyecto no exigiera confirmación. La pantalla se adapta a lo
    // que el servidor responde en vez de dar por hecho un flujo.
    await montar(page, { status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'auth-e2e', email: 'nuevo@test.com' }) });
    await abrir(page);
    await page.getByLabel('Email').fill('nuevo@test.com');
    await page.getByRole('button', { name: 'Cambiar el email' }).click();
    await expect(page.getByTestId('email-aviso')).toContainText(/actualizado/i, { timeout: 30_000 });
  });
});
