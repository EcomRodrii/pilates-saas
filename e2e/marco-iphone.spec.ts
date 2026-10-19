import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';
import { DEFAULT_THEME } from '../lib/theme-schema';

// ─────────────────────────────────────────────────────────────────────────────
// El móvil de las vistas previas del panel es un iPhone 17 (pantalla de 402 × 874 puntos,
// Dynamic Island, barra de estado, indicador de inicio), y «Descubre» enseña tarjetas anchas
// donde la foto ES la tarjeta. Se mide la forma, no el pixel: la proporción de la pantalla, el
// tamaño de la isla, el 16:9 de la tarjeta, que asome la siguiente y cuándo hay botón.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid', viewport: { width: 1440, height: 950 } });
test.describe.configure({ timeout: 150_000 });

const STUDIO_ID = 'studio-test';
const json = (r: Route, b: unknown, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const FOTO = 'https://fotos.example.com/clase.jpg';

const banner = (id: string, orden: number, extra: Record<string, unknown> = {}) => ({
  id, studio_id: STUDIO_ID, imagen_url: FOTO, titulo: null, texto: null, link_tipo: 'interno', link_valor: '/reservar',
  ubicacion: ['home'], activo: true, orden, fecha_inicio: null, fecha_fin: null, ...extra,
});

async function abrirContenido(page: Page, banners: Record<string, unknown>[]) {
  await page.clock.setFixedTime(new Date('2026-10-15T12:00:00+02:00'));
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, { panelNuevo: true, miWebNueva: true }));
  await page.route('**/fotos.example.com/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.route('**/rest/v1/contenido_portal_banners**', (r) => json(r, banners));
  await page.route('**/rest/v1/novedades_estudio**', (r) => json(r, []));
  await page.route((u) => u.pathname === '/rest/v1/contenido_portal', (r) => json(r, null));
  await page.goto('/configuracion?tab=descubre', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('vista-app-movil')).toBeVisible({ timeout: 90_000 });
}

const caja = async (l: ReturnType<Page['locator']>) => {
  const b = await l.boundingBox();
  expect(b, 'no se pudo medir').not.toBeNull();
  return b!;
};

test('«Contenido de tu app»: la vista previa es un iPhone 17 con su isla, y las tarjetas son fotos anchas que dejan asomar la siguiente', async ({ page }) => {
  await abrirContenido(page, [
    banner('b1', 0, { titulo: 'Taller de Reformer', texto: 'Plazas limitadas' }),
    banner('b2', 1, { titulo: 'Solo informa', link_tipo: 'ninguno', link_valor: '' }),
    banner('b3', 2),
  ]);
  const movil = page.getByTestId('vista-app-movil');
  const pantalla = movil.getByTestId('iphone-pantalla');
  await expect(movil.getByTestId('iphone-isla')).toBeVisible();
  await expect(movil.getByTestId('iphone-estado')).toContainText('9:41');
  await expect(movil.getByTestId('iphone-indicador')).toBeVisible();

  // La pantalla es la de un iPhone 17 (402 × 874) y la isla, 126 × 37 puntos: a la misma escala.
  const p = await caja(pantalla);
  expect(p.width / p.height).toBeCloseTo(402 / 874, 2);
  const isla = await caja(movil.getByTestId('iphone-isla'));
  expect(isla.width / p.width).toBeCloseTo(126 / 402, 2);
  expect(isla.height / p.width).toBeCloseTo(37 / 402, 2);
  // Centrada arriba.
  expect(isla.x + isla.width / 2).toBeCloseTo(p.x + p.width / 2, 0);
  expect(isla.y - p.y).toBeGreaterThan(0);

  // Tres tarjetas con foto en la fila (la `li` de cada una).
  const lis = movil.locator('ul').filter({ has: page.locator('img') }).first().locator('> li');
  await expect(lis).toHaveCount(3);

  // 16:9, a sangre en el ancho de la pantalla menos los márgenes, con la siguiente asomando por la derecha.
  const t0 = await caja(lis.nth(0));
  const t1 = await caja(lis.nth(1));
  expect(t0.width / t0.height).toBeCloseTo(16 / 9, 1);
  expect(t0.width / p.width).toBeCloseTo((402 - 36 - 40) / 402, 1);
  expect(t1.x).toBeLessThan(p.x + p.width);
  expect(t1.x + t1.width).toBeGreaterThan(p.x + p.width);

  // Botón solo con título Y destino; sin título (la foto ya trae su texto), solo la foto.
  await expect(lis.nth(0)).toContainText('Taller de Reformer');
  await expect(lis.nth(0)).toContainText('Ver más');
  await expect(lis.nth(1)).toContainText('Solo informa');
  await expect(lis.nth(1)).not.toContainText('Ver más');
  await expect(lis.nth(2)).toHaveText('');
});

test('una sola tarjeta ocupa todo el ancho: no deja un hueco a la derecha', async ({ page }) => {
  await abrirContenido(page, [banner('b1', 0, { titulo: 'Taller de Reformer' })]);
  const movil = page.getByTestId('vista-app-movil');
  const p = await caja(movil.getByTestId('iphone-pantalla'));
  const li = movil.locator('ul').filter({ has: page.locator('img') }).first().locator('> li').first();
  const t = await caja(li);
  expect(t.width / p.width).toBeCloseTo((402 - 36) / 402, 1);
});

test('«Apariencia de tu app»: la app real va dentro del iPhone, a 402 × 874, con el margen de la isla', async ({ page }) => {
  await montar(page);
  await page.route('**/rest/v1/studios**', (r) => json(r, {
    id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro', owner_auth_user_id: 'auth-e2e-duena',
    plan: 'ESTUDIO', subscription_status: 'active', moneda: 'EUR', iva_por_defecto: 21,
  }));
  await page.route((u) => u.pathname === '/api/theme', (r) => json(r, { ...DEFAULT_THEME, primary: '#666DCC' }));
  await ir(page, 'configuracion/apariencia');
  await expect(page.getByRole('heading', { name: 'Apariencia de tu app' })).toBeVisible({ timeout: 90_000 });

  const marco = page.getByTestId('iphone-pantalla').first();
  await expect(marco.getByTestId('iphone-isla')).toBeVisible();
  const iframe = page.locator('iframe[title="Vista previa de la app de tus alumnas"]');
  const medida = await iframe.evaluate((el) => ({ w: (el as HTMLIFrameElement).offsetWidth, h: (el as HTMLIFrameElement).offsetHeight }));
  expect(medida).toEqual({ w: 402, h: 874 });

  // La app lee el margen de un iPhone de `--safe-top`: sin él, su cabecera quedaría bajo la isla.
  const app = page.frameLocator('iframe[title="Vista previa de la app de tus alumnas"]').locator('.student-app').first();
  await app.waitFor({ timeout: 90_000 });
  await expect.poll(() => app.evaluate((el) => getComputedStyle(el).getPropertyValue('--safe-top').trim())).toBe('62px');
  await expect.poll(() => app.evaluate((el) => getComputedStyle(el).getPropertyValue('--safe-bottom').trim())).toBe('34px');
});
