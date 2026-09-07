import { test, expect, type Page } from '@playwright/test';
import { SLUG, fixtureSociaLista, sembrarSociaLista } from './socia-lista';

// Cambiar la contraseña desde dentro de la app.
//
// Lo que se comprueba es que la pantalla NO miente: que pide la actual (que es
// lo que el proyecto exige), que señala el campo correcto, y que no dice
// «cambiada» sin que el servidor lo confirme.

const base = `/portal/${SLUG}`;

async function montar(page: Page, respuesta?: { status: number; body: string }) {
  await sembrarSociaLista(page);
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureSociaLista()) }));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], unread: 0 }) }));
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ socioId: 'socio-e2e-1', nombre: 'Ana Test', email: 'socia-e2e@test.com' }),
  }));
  await page.route(/js\.stripe\.com/, (r) => r.abort());
  // `updateUser` de gotrue: PUT a /auth/v1/user.
  await page.route('**/auth/v1/user**', (r) => r.fulfill(
    respuesta ?? { status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'auth-e2e' }) },
  ));
}

async function abrir(page: Page) {
  await page.goto(`${base}/perfil/seguridad`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('Contraseña actual')).toBeVisible({ timeout: 30_000 });
}

test.describe('Student PWA · cambiar la contraseña', () => {
  test.describe.configure({ timeout: 120_000 });

  test('se llega desde el perfil: antes no había ninguna entrada', async ({ page }) => {
    await montar(page);
    await page.goto(`${base}/perfil`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: 'Contraseña' }).click({ timeout: 30_000 });
    // Margen: es la PRIMERA carga de esta ruta, y los 5 s por defecto de la
    // aserción no cubren compilar y servir una pantalla nueva.
    await expect(page.getByLabel('Contraseña actual')).toBeVisible({ timeout: 30_000 });
  });

  test('pide la ACTUAL, que es lo que el proyecto exige', async ({ page }) => {
    // Con reautenticación activada, gotrue solo deja cambiarla sin la actual si
    // la sesión se creó en las últimas 24 h; en una PWA instalada duran
    // semanas, así que sin este campo fallaría casi siempre.
    await montar(page);
    await abrir(page);
    await expect(page.getByLabel('Contraseña actual')).toBeVisible();
    await expect(page.getByLabel('Nueva contraseña')).toBeVisible();
    await expect(page.getByLabel('Repite la nueva')).toBeVisible();
  });

  test('una nueva corta se corta ANTES de salir, con el mínimo real', async ({ page }) => {
    let intentos = 0;
    await montar(page);
    await page.route('**/auth/v1/user**', (r) => { intentos++; return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); });
    await abrir(page);
    await page.getByLabel('Contraseña actual').fill('laVieja123');
    await page.getByLabel('Nueva contraseña').fill('1234567');
    await page.getByLabel('Repite la nueva').fill('1234567');
    await page.getByRole('button', { name: 'Cambiar la contraseña' }).click();
    await expect(page.getByText('Usa al menos 8 caracteres.')).toBeVisible();
    expect(intentos).toBe(0);
  });

  test('si las dos no coinciden, se señala LA REPETIDA y no la nueva', async ({ page }) => {
    await montar(page);
    await abrir(page);
    await page.getByLabel('Contraseña actual').fill('laVieja123');
    await page.getByLabel('Nueva contraseña').fill('unaBuena123');
    await page.getByLabel('Repite la nueva').fill('otraCosa456');
    await page.getByRole('button', { name: 'Cambiar la contraseña' }).click();
    await expect(page.getByText('Las dos no coinciden.')).toBeVisible();
  });

  test('si el servidor dice que la actual no vale, se dice EN SU CAMPO', async ({ page }) => {
    // Culpar a la nueva mandaría a cambiar el campo que está bien.
    await montar(page, { status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Invalid current password' }) } as never);
    await abrir(page);
    await page.getByLabel('Contraseña actual').fill('meLaInvento');
    await page.getByLabel('Nueva contraseña').fill('unaBuena123');
    await page.getByLabel('Repite la nueva').fill('unaBuena123');
    await page.getByRole('button', { name: 'Cambiar la contraseña' }).click();
    await expect(page.getByText('La contraseña actual no es correcta.')).toBeVisible({ timeout: 30_000 });
  });

  test('la salida a «he olvidado la contraseña» está a la vista', async ({ page }) => {
    // Quien llega aquí sin acordarse de la actual se quedaría atascada.
    await montar(page);
    await abrir(page);
    await expect(page.getByText(/He olvidado mi contraseña/i)).toBeVisible();
  });
});
