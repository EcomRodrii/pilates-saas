import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Apps e integraciones» (12-nov-2026): la entrada del menú con su desplegable y
// sus tres páginas — Tienda de apps, Integraciones de terceros y API de
// desarrollador. Propietaria y gerencia; recepción no.
//
// Lo que se prueba de verdad, y no solo que «salga»:
//   · el desplegable abre sus tres páginas y cada una carga;
//   · la tienda enseña los precios de los complementos tal y como salen de
//     ADDONS, y las tarjetas «Próximamente» no se pueden activar;
//   · la gerencia VE todo pero no ve nada que configurar (ni claves ni
//     credenciales: solo las lee la propietaria);
//   · recepción no entra: ni entrada en el menú ni la ruta.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

const STUDIO = {
  id: 'studio-test', nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR',
};
const LAYOUT = { orden: [], ocultos: [] as string[], activados: [] as string[], menuPosition: 'lateral', home: { orden: [], ocultos: [] } };

async function abrir(page: Page, ruta: string, o: { rol?: 'MANAGER' | 'RECEPCION'; plan?: string } = {}) {
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo: true,
  }));
  await page.route('**/rest/v1/studios**', (r) => json(r, {
    ...STUDIO, plan: o.plan ?? 'BASE', subscription_status: 'active', regimen_addons: true, addons: ['decisiones'],
  }));
  if (o.rol) {
    await page.route('**/rest/v1/instructores**', (r) => json(r, [
      { id: 'ins-yo', studio_id: STUDIO.id, nombre: 'Yo', activo: true, rol: o.rol, color: '#5A6142', auth_user_id: 'auth-e2e-duena' },
    ]));
  }
  await page.route('**/api/layout**', (r) => json(r, LAYOUT));
  await ir(page, ruta);
}

const menuApps = (page: Page) => page.locator('nav').getByRole('button', { name: /Apps e integraciones/ });

test.describe('Apps e integraciones', () => {
  test('el menú abre un desplegable con sus tres páginas', async ({ page }) => {
    await abrir(page, 'dashboard');
    await expect(menuApps(page)).toBeVisible({ timeout: 60_000 });
    await menuApps(page).click();
    const desplegable = page.getByTestId('desplegable-apps');
    await expect(desplegable).toBeVisible();
    for (const nombre of ['Tienda de apps', 'Integraciones de terceros', 'API de desarrollador']) {
      await expect(desplegable.getByRole('menuitem', { name: new RegExp(nombre) })).toBeVisible();
    }
    await desplegable.getByRole('menuitem', { name: /Integraciones de terceros/ }).click();
    await expect(page).toHaveURL(/\/apps\/integraciones/);
    await expect(page.getByTestId('integraciones-de-terceros')).toBeVisible({ timeout: 60_000 });
  });

  test('al pasar el ratón se abre sola la tarjeta, con sus grupos, y se cierra al salir', async ({ page }) => {
    await abrir(page, 'dashboard');
    await expect(menuApps(page)).toBeVisible({ timeout: 60_000 });
    await menuApps(page).hover();
    const desplegable = page.getByTestId('desplegable-apps');
    await expect(desplegable).toBeVisible();
    for (const grupo of ['Catálogo', 'Conexiones', 'Desarrollo']) await expect(desplegable.getByText(grupo, { exact: true })).toBeVisible();
    // Cruzar el hueco entre la entrada y la tarjeta no la cierra.
    await desplegable.getByRole('menuitem', { name: /API de desarrollador/ }).hover();
    await expect(desplegable).toBeVisible();
    await page.mouse.move(900, 500);
    await expect(desplegable).toHaveCount(0);
  });

  test('Escape cierra el desplegable', async ({ page }) => {
    await abrir(page, 'dashboard');
    await menuApps(page).click();
    await expect(page.getByTestId('desplegable-apps')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('desplegable-apps')).toHaveCount(0);
  });

  test('la tienda enseña los complementos con su precio y lo próximo sin botón', async ({ page }) => {
    await abrir(page, 'apps');
    await expect(page.getByTestId('tienda-de-apps')).toBeVisible({ timeout: 60_000 });

    const tarjeta = (id: string) => page.locator(`[data-testid="tarjeta-app"][data-app="${id}"]`);
    await expect(tarjeta('complemento-sustituciones').getByTestId('precio-app')).toHaveText('6 €/mes');
    await expect(tarjeta('complemento-ia').getByTestId('precio-app')).toHaveText('9 €/mes');
    // Centro de Control ya está en su plan (addons: ['decisiones']): activo, sin botón de activar.
    await expect(tarjeta('complemento-decisiones').getByText('Activo').first()).toBeVisible();
    await expect(tarjeta('complemento-sustituciones').getByRole('link', { name: 'Activar' })).toBeVisible();

    // Los módulos del menú no mezclan con las apps: tienen su pestaña.
    await expect(page.getByTestId('tarjeta-modulo')).toHaveCount(0);
    await expect(page.getByTestId('app-destacada')).toContainText('Sustituciones automáticas');
    await page.getByRole('tab', { name: /^Módulos/ }).click();
    expect(await page.getByTestId('tarjeta-modulo').count()).toBeGreaterThan(10);
    await expect(page.locator('[data-testid="tarjeta-modulo"][data-app="/apps"]')).toHaveCount(0);
    await page.getByRole('tab', { name: /^Próximamente/ }).click();
    const proximas = page.locator('[data-testid="tarjeta-app"]');
    await expect(proximas).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(proximas.nth(i).getByTestId('precio-app')).toHaveText('Próximamente');
      await expect(proximas.nth(i).getByRole('link')).toHaveCount(0);
    }
  });

  test('buscar y filtrar la tienda', async ({ page }) => {
    await abrir(page, 'apps');
    await expect(page.getByTestId('tienda-de-apps')).toBeVisible({ timeout: 60_000 });
    await page.getByRole('searchbox', { name: 'Buscar una app' }).fill('zoom');
    await expect(page.locator('[data-testid="tarjeta-app"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="tarjeta-app"][data-app="zoom"]').getByRole('link', { name: /Conectar/ })).toHaveAttribute('href', '/apps/integraciones?pestana=zoom');
    await page.getByRole('searchbox', { name: 'Buscar una app' }).fill('xyzqq');
    await expect(page.getByTestId('tienda-vacia')).toBeVisible();
  });

  test('integraciones: una pestaña por herramienta y el enlace directo elige la suya', async ({ page }) => {
    await abrir(page, 'apps/integraciones?pestana=zoom');
    await expect(page.getByTestId('integraciones-de-terceros')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('tab', { name: 'Zoom' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('que-hace')).toContainText('reunión de Zoom');
    await expect(page.getByRole('tab')).toHaveCount(12);
    await page.getByRole('tab', { name: 'Kisi' }).click();
    await expect(page).toHaveURL(/pestana=kisi/);
    await expect(page.getByTestId('que-hace')).toContainText('puerta');
  });

  test('integraciones: una pestaña desconocida no rompe nada y cae en la primera', async ({ page }) => {
    await abrir(page, 'apps/integraciones?pestana=inventada');
    await expect(page.getByRole('tab', { name: 'Stripe' })).toHaveAttribute('aria-selected', 'true', { timeout: 60_000 });
  });

  test('la API enseña su dirección, la cabecera y cada endpoint sin la clave en la URL', async ({ page }) => {
    await abrir(page, 'apps/api');
    await expect(page.getByTestId('api-de-desarrollador')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('base-api')).toHaveText('https://www.tentare.app/api/v1');
    await expect(page.getByText('Authorization: Bearer').first()).toBeVisible();
    const n = await page.getByTestId('endpoint').count();
    expect(n).toBeGreaterThanOrEqual(10);
    // Nunca un token en la dirección, que es lo que hace insegura la «Legacy API» de la que se copió el formato.
    expect(await page.getByTestId('api-de-desarrollador').innerText()).not.toMatch(/[?&]token=/);
    const clientes = page.locator('[data-testid="endpoint"][data-ruta="/clientas"][data-metodo="GET"]');
    await expect(clientes).toBeVisible();
    // Se despliega con su permiso y un ejemplo con la clave en la cabecera.
    await clientes.getByRole('button').first().click();
    await expect(clientes).toContainText('Authorization: Bearer');
    await expect(clientes).toContainText('clientas:leer');
    // Escritura: solo los POST.
    await page.getByRole('tab', { name: 'Escritura' }).click();
    expect(await page.locator('[data-testid="endpoint"][data-metodo="GET"]').count()).toBe(0);
    expect(await page.locator('[data-testid="endpoint"][data-metodo="POST"]').count()).toBeGreaterThan(3);
  });

  test('gerencia: ve la tienda, las integraciones y la API, pero nada que configurar', async ({ page }) => {
    await abrir(page, 'apps/integraciones?pestana=stripe', { rol: 'MANAGER' });
    await expect(page.getByTestId('solo-estado')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('solo-estado')).toContainText('cosa de la propietaria');
    await page.goto('/apps/api', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('claves-solo-propietaria')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('endpoint').first()).toBeVisible();
  });

  test('recepción no entra: sin entrada en el menú y la ruta no pinta la tienda', async ({ page }) => {
    await abrir(page, 'dashboard', { rol: 'RECEPCION' });
    await expect(page.getByRole('link', { name: /^Calendario/ }).first()).toBeVisible({ timeout: 60_000 });
    await expect(menuApps(page)).toHaveCount(0);
    // La ruta no pinta la tienda. (No se mira la redirección: en este entorno simulado el guardia de
    // cualquier ruta bloqueada —p. ej. /informes— choca con un proveedor del tour que no monta.)
    await page.goto('/apps', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6_000);
    await expect(page.getByTestId('tienda-de-apps')).toHaveCount(0);
  });
});
