import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Tu app» y «Tu web» (MI_WEB_NUEVA, 16-oct-2026): la app de la alumna y los widgets de su web, dos
// entradas propias del menú en el grupo «Tus alumnas te ven en». Con el interruptor apagado (o sin el
// panel nuevo), el menú es el de siempre. «Tu app» abre el editor de siempre; «Tu web», los widgets.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

async function abrir(page: Page, ruta: string, o: { nuevo: boolean; miWeb: boolean }) {
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo: o.nuevo, pedirApp: false, miWebNueva: o.miWeb,
  }));
  await ir(page, ruta);
}

const menu = (page: Page) => page.locator('aside');
const enElMenu = (page: Page, nombre: string) => menu(page).getByRole('link', { name: nombre, exact: true });

test('encendido: «Tu app» y «Tu web» en el menú, y cada una abre lo suyo', async ({ page }) => {
  await abrir(page, 'clientas', { nuevo: true, miWeb: true });
  await expect(enElMenu(page, 'Clientas')).toBeVisible({ timeout: 60_000 });
  await expect(menu(page).getByText('Tus alumnas te ven en')).toBeVisible();
  await expect(enElMenu(page, 'Tu app')).toHaveAttribute('href', '/tu-app');
  await expect(enElMenu(page, 'Tu web')).toHaveAttribute('href', '/tu-web');

  await enElMenu(page, 'Tu app').click();
  await expect(page).toHaveURL(/\/tu-app$/);
  await expect(page.getByText('Elige el estilo de tu app').first()).toBeVisible({ timeout: 60_000 });
  // La entrada activa es la suya, no Configuración.
  await expect(enElMenu(page, 'Configuración')).not.toHaveAttribute('aria-current', 'page');

  await enElMenu(page, 'Tu web').click();
  await expect(page).toHaveURL(/\/tu-web$/);
  await expect(page.getByText(/tu web/i).first()).toBeVisible({ timeout: 60_000 });
});

test('apagado (o sin el panel nuevo): el menú es el de siempre', async ({ page }) => {
  await abrir(page, 'clientas', { nuevo: true, miWeb: false });
  await expect(enElMenu(page, 'Clientas')).toBeVisible({ timeout: 60_000 });
  await expect(enElMenu(page, 'Tu app')).toHaveCount(0);
  await expect(enElMenu(page, 'Tu web')).toHaveCount(0);
});

test('sin el panel nuevo, aunque el interruptor esté encendido, tampoco salen', async ({ page }) => {
  await abrir(page, 'clientas', { nuevo: false, miWeb: true });
  await expect(enElMenu(page, 'Clientas')).toBeVisible({ timeout: 60_000 });
  await expect(enElMenu(page, 'Tu app')).toHaveCount(0);
  await expect(enElMenu(page, 'Tu web')).toHaveCount(0);
});

test('Configuración ya no tiene el apartado «Demo»', async ({ page }) => {
  await abrir(page, 'configuracion', { nuevo: true, miWeb: false });
  await expect(page.getByText('Lo básico').or(page.getByText('Tu estudio')).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Vídeo de la demo')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Aprende' })).toHaveCount(0);
});
