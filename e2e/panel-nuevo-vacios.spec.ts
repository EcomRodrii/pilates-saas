import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir, enOscuro } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Pantallas vacías que enseñan (patrón A4 de Bonsai: b-10, b-20), con el panel
// nuevo: icono grande, un título que es un objetivo, una frase de qué es, los
// ejemplos (lo que pasa en negrita) y UNA acción con verbo y objeto. Aquí, las
// que decían «No hay…» a secas: la Libreta, Productos POS (Paquetes), la
// actividad del equipo e Interesadas y pruebas. Sin el panel nuevo, el vacío
// de siempre. Ninguna de estas pantallas escribe al mostrarse.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

const json = (r: Route, b: unknown) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });

/** Un estudio que empieza: sin clientas, sin productos, sin actividad. */
async function vacio(page: Page, o: { nuevo?: boolean } = {}) {
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo: o.nuevo ?? true,
  }));
  for (const t of ['socios', 'suscripciones', 'productos_pos', 'actividad_reciente', 'recibos']) {
    await page.route(`**/rest/v1/${t}**`, (r) => json(r, []));
  }
}

const vacia = (page: Page) => page.locator('section').filter({ has: page.getByText('Ejemplos', { exact: true }) });

test('Libreta: sin clientas activas, enseña qué llevará y lleva a dar de alta a la primera', async ({ page }) => {
  await vacio(page);
  await ir(page, 'libreta');
  const v = vacia(page);
  await expect(v.getByRole('heading', { name: 'Tu libreta, por si cae internet' })).toBeVisible({ timeout: 60_000 });
  await expect(v.getByRole('listitem')).toHaveCount(3);
  await expect(v.getByRole('link', { name: 'Dar de alta a mi primera clienta' })).toHaveAttribute('href', '/clientas?nuevo=1');
  await expect(v.getByRole('link', { name: 'Tráelas de tu programa anterior' })).toHaveAttribute('href', '/migracion');
  // La hoja vacía no se pinta (no hay nada que imprimir).
  await expect(page.getByText('No hay clientas activas todavía.')).toHaveCount(0);
});

test('Paquetes › Productos POS: sin productos, los ejemplos y «Añadir mi primer producto» abre el alta', async ({ page }) => {
  await vacio(page);
  await ir(page, 'productos');
  await page.getByRole('button', { name: 'Productos POS', exact: true }).first().click({ timeout: 60_000 });
  const v = vacia(page);
  await expect(v.getByRole('heading', { name: 'Vende algo más que clases' })).toBeVisible();
  await expect(v.getByText('Calcetines antideslizantes')).toBeVisible();
  await v.getByRole('button', { name: 'Añadir mi primer producto' }).click();
  await expect(page.getByRole('heading', { name: 'Nuevo producto' })).toBeVisible();
});

test('Equipo › Actividad: sin movimientos, dice qué se apunta aquí (sin botón: se llena solo)', async ({ page }) => {
  await vacio(page);
  await ir(page, 'equipo');
  await page.getByRole('tab', { name: 'Actividad', exact: true }).first().click({ timeout: 60_000 });
  const v = vacia(page);
  await expect(v.getByRole('heading', { name: 'Aquí verás quién ha hecho qué' })).toBeVisible();
  await expect(v.getByRole('listitem')).toHaveCount(3);
  await expect(v.getByRole('button')).toHaveCount(0);
  await expect(page.getByText('Todavía no hay movimientos registrados.')).toHaveCount(0);
});

test('sin el panel nuevo, los vacíos de siempre', async ({ page }) => {
  await vacio(page, { nuevo: false });
  await ir(page, 'libreta');
  await expect(page.getByText('No hay clientas activas todavía.')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('heading', { name: 'Tu libreta, por si cae internet' })).toHaveCount(0);
});

// Fuera del run normal: `E2E_CAPTURAS=1` (y `E2E_CAPTURAS_DIR`, por defecto test-results).
test.describe('capturas', () => {
  test.skip(!process.env.E2E_CAPTURAS, 'solo a mano, para mirar la pantalla');
  const OUT = process.env.E2E_CAPTURAS_DIR ?? 'test-results';
  for (const [ancho, alto, oscuro] of [[1440, 900, false], [1440, 900, true], [375, 812, false]] as const) {
    test(`vacíos a ${ancho}${oscuro ? ' en oscuro' : ''}`, async ({ page }) => {
      if (oscuro) await enOscuro(page);
      await page.setViewportSize({ width: ancho, height: alto });
      const sufijo = `${ancho}${oscuro ? '-oscuro' : ''}`;
      await vacio(page);
      await ir(page, 'libreta');
      await expect(vacia(page)).toBeVisible({ timeout: 60_000 });
      await page.screenshot({ path: `${OUT}/vacio-libreta-${sufijo}.png`, fullPage: true });
      await ir(page, 'productos');
      await page.getByRole('button', { name: 'Productos POS', exact: true }).first().click({ timeout: 60_000 });
      await expect(vacia(page)).toBeVisible();
      await page.screenshot({ path: `${OUT}/vacio-pos-${sufijo}.png`, fullPage: true });
      await ir(page, 'equipo');
      await page.getByRole('tab', { name: 'Actividad', exact: true }).first().click({ timeout: 60_000 });
      await expect(vacia(page)).toBeVisible();
      await page.screenshot({ path: `${OUT}/vacio-actividad-${sufijo}.png`, fullPage: true });
      await ir(page, 'clientas');
      await page.getByRole('tab', { name: /Interesadas y pruebas/ }).first().click({ timeout: 60_000 });
      await expect(vacia(page)).toBeVisible();
      await page.screenshot({ path: `${OUT}/vacio-interesadas-${sufijo}.png`, fullPage: true });
    });
  }
});
