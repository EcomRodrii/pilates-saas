import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// «Tu app» y «Tu web» SOLO dentro de Configuración (MI_WEB_NUEVA, 16-oct-2026, corrección del
// fundador: «en el menú principal no lo quiero, solo en configuración»). Con el interruptor:
//   · «Marca» se llama «Tu app»: Apariencia, Contenido de tu app y su app en la App Store, y debajo
//     tu marca y tus textos;
//   · «Mi app y mi web» se llama «Tu web»: dirección, widgets y ocultar la página; Network aparte;
//   · nada de esto en el menú lateral.
// Sin el interruptor, Configuración como siempre. Deja capturas en test-results/ para enseñarlas.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

const json = (r: Route, b: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(b) });

async function abrir(page: Page, ruta: string, miWeb: boolean) {
  await montar(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => json(r, {
    filtrosClientas: false, importarPegando: false, invitarWhatsApp: false, horarioDesdeImagen: false,
    nivelesConRitmo: false, tarjetaClase: false, panelNuevo: true, pedirApp: true, miWebNueva: miWeb,
  }));
  await ir(page, ruta);
}

const titulo = (page: Page) => page.locator('#seccion-titulo');

for (const ancho of [1440, 375] as const) {
  test(`encendido (${ancho}): «Mi app» y «Mi web» separadas, cada una con lo suyo, sin entrada en el menú`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: ancho === 375 ? 812 : 900 });
    await abrir(page, 'configuracion?tab=marca', true);
    await expect(titulo(page)).toHaveText('Mi app', { timeout: 60_000 });
    const app = page.locator('main');
    // «Mi app» guiada (21-oct-2026): siete pasos en orden, con progreso arriba. La App Store va en el 7.
    const guiada = app.getByTestId('mi-app-guiada');
    await expect(guiada).toBeVisible({ timeout: 60_000 });
    await expect(guiada.locator('[data-paso]')).toHaveCount(7);
    await expect(guiada.getByTestId('mi-app-progreso')).toContainText('de 4 pasos hechos');
    await expect(guiada.locator('[data-paso="estilo"]').getByRole('link', { name: /Editar/ })).toHaveAttribute('href', '/configuracion/apariencia?paso=estilo');
    await expect(guiada.locator('[data-paso="compartir"]')).toContainText('App Store');
    await expect(guiada.locator('[data-paso="compartir"]').getByRole('link')).toHaveAttribute('href', '/configuracion/apariencia?paso=instalar');
    await page.screenshot({ path: `test-results/configuracion-tu-app-${ancho}-despues.png`, fullPage: true });

    await abrir(page, 'configuracion?tab=web', true);
    await expect(titulo(page)).toHaveText('Mi web', { timeout: 60_000 });
    // «Mi web» guiada (21-oct-2026): los cinco pasos, los widgets el tercero.
    await expect(page.getByTestId('mi-web-guiada')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('main').getByText('Ponla en tu web: tus widgets').first()).toBeVisible();
    await expect(page.locator('main').getByText('Contenido de tu app')).toHaveCount(0);
    await page.screenshot({ path: `test-results/configuracion-tu-web-${ancho}-despues.png`, fullPage: true });
    // Decisión 4: la descripción se escribe aquí, sola. Decisión 2: el enlace de la app lleva a «Mi app».
    await page.locator('#paso-presentacion').getByRole('button', { name: /Escribir|Cambiar/ }).click();
    await expect(page.getByRole('dialog').getByLabel('Cómo te presentas')).toBeVisible();
    await expect(page.getByRole('dialog').getByLabel('Tu lema')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await page.locator('#paso-direccion').getByRole('button', { name: /Cambiar|Ponerle dirección/ }).click();
    await expect(page.getByRole('dialog').getByRole('link', { name: 'Mi app → Compártela' })).toHaveAttribute('href', '/configuracion/apariencia?paso=instalar');

    // «Mi app» y «Mi web», separadas: cada una su entrada en la columna de Configuración, sin el grupo
    // común «Tu app y tu web» (fundador, 16-oct: «antes ponía MI APP / MI WEB y ahora todo está junto»).
    if (ancho === 1440) {
      const columna = page.getByRole('navigation', { name: 'Secciones de Configuración' });
      await expect(columna.getByRole('link', { name: 'Mi app', exact: true })).toBeVisible();
      await expect(columna.getByRole('link', { name: 'Mi web', exact: true })).toBeVisible();
      await expect(columna.getByText('Tu app y tu web', { exact: true })).toHaveCount(0);
    }
    await abrir(page, 'configuracion', true);
    await expect(page.locator('#inicio-grupo-mi-app')).toHaveText('Mi app', { timeout: 60_000 });
    await expect(page.locator('#inicio-grupo-mi-web')).toHaveText('Mi web');
    await expect(page.locator('#inicio-grupo-tu-app-y-tu-web')).toHaveCount(0);
    await page.screenshot({ path: `test-results/configuracion-inicio-${ancho}-despues.png`, fullPage: true });

    // Ninguna entrada propia en el menú lateral.
    await expect(page.locator('aside').getByRole('link', { name: 'Mi app', exact: true })).toHaveCount(0);
    await expect(page.locator('aside').getByRole('link', { name: 'Mi web', exact: true })).toHaveCount(0);
  });

  test(`apagado (${ancho}): Configuración como siempre`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: ancho === 375 ? 812 : 900 });
    await abrir(page, 'configuracion?tab=marca', false);
    await expect(titulo(page)).toHaveText('Marca', { timeout: 60_000 });
    await expect(page.locator('main').getByText('Tu app en la App Store')).toHaveCount(0);
    await page.screenshot({ path: `test-results/configuracion-tu-app-${ancho}-antes.png`, fullPage: true });
    await abrir(page, 'configuracion?tab=web', false);
    await expect(titulo(page)).toHaveText('Mi app y mi web', { timeout: 60_000 });
    await expect(page.locator('main').getByText('Contenido de tu app').first()).toBeVisible();
    await page.screenshot({ path: `test-results/configuracion-tu-web-${ancho}-antes.png`, fullPage: true });
  });
}

test('encendido: «Contenido de tu app» abierto desde «Mi app» vuelve a «Mi app»', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await abrir(page, 'configuracion?tab=marca', true);
  await expect(titulo(page)).toHaveText('Mi app', { timeout: 60_000 });
  await page.locator('main [data-paso="inicio"]').getByRole('link', { name: /Editar/ }).click();
  await expect(page.getByRole('button', { name: /Volver a Mi app/ }).or(page.getByRole('link', { name: /Volver a Mi app/ })).first()).toBeVisible({ timeout: 60_000 });
});
