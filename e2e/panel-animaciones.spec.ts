import { test, expect, type Page } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Las animaciones de todo el panel. No se prueba que «se vean bonitas» (eso se
// revisó fotograma a fotograma en vídeo), sino lo que se rompería sin avisar:
//   · «Ampliar a toda la pantalla» en cada pantalla grande, y en ninguna más;
//   · que se anime el cambio de SECCIÓN (menú) y no cualquier navegación —
//     animar todo haría parpadear el panel;
//   · que un diálogo, ya abierto, no deje un `transform` puesto: una matriz
//     identidad residual ancla los `position: fixed` de dentro a su caja.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid', viewport: { width: 1440, height: 900 } });
test.describe.configure({ timeout: 120_000 });

const menu = (page: Page) => page.locator('aside[data-panel-menu]');

async function esperarPantalla(page: Page) {
  await expect(page.locator('[data-slot="page-header-title"]').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(300);
}

for (const ruta of ['clientas', 'cobros', 'informes', 'mensajeria', 'equipo']) {
  test(`/${ruta}: ampliar esconde menú y barra, el contenido se ensancha, y Escape lo devuelve`, async ({ page }) => {
    await montar(page);
    await ir(page, ruta);
    await esperarPantalla(page);
    const contenido = page.locator('[data-panel-contenido]');
    const antes = (await contenido.boundingBox())!;

    await page.getByRole('button', { name: 'Ampliar a toda la pantalla' }).click();
    await expect(menu(page)).toBeHidden();
    await expect(page.locator('[data-panel-topbar]')).toBeHidden();
    await expect.poll(async () => (await contenido.boundingBox())!.width).toBeGreaterThan(antes.width + 150);

    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.hasAttribute('data-panel-ampliado'))).toBe(false);
  });
}

test('las pantallas que no son de trabajo grande no llevan el botón', async ({ page }) => {
  await montar(page);
  await ir(page, 'productos');
  await esperarPantalla(page);
  await expect(page.getByRole('button', { name: 'Ampliar a toda la pantalla' })).toHaveCount(0);
});

test('cambiar de pantalla con la vista ampliada devuelve el menú', async ({ page }) => {
  await montar(page);
  await ir(page, 'dashboard');
  await menu(page).getByRole('link', { name: 'Clientas' }).first().click();
  await expect(page).toHaveURL(/\/clientas/, { timeout: 60_000 });
  await esperarPantalla(page);
  await page.getByRole('button', { name: 'Ampliar a toda la pantalla' }).click();
  await expect(menu(page)).toBeHidden();

  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
  await expect(menu(page)).toBeVisible();
});

test('se anima el cambio de sección desde el menú, y no un enlace de dentro de una pantalla', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __transiciones: number };
    w.__transiciones = 0;
    const doc = document as Document & { startViewTransition?: (...a: unknown[]) => unknown };
    const original = doc.startViewTransition?.bind(document);
    if (original) {
      doc.startViewTransition = (...a: unknown[]) => { w.__transiciones++; return original(...a); };
    }
  });
  await montar(page);
  await ir(page, 'dashboard');
  await esperarPantalla(page);
  const contar = () => page.evaluate(() => (window as unknown as { __transiciones: number }).__transiciones);
  // Sin soporte (otro navegador) no hay nada que medir.
  test.skip(!(await page.evaluate(() => 'startViewTransition' in document)), 'sin View Transitions');

  const inicial = await contar();
  await menu(page).getByRole('link', { name: 'Clientas' }).first().click();
  await expect(page).toHaveURL(/\/clientas/, { timeout: 60_000 });
  await expect.poll(contar, { message: 'el menú anima el cambio de sección' }).toBeGreaterThan(inicial);

  // Un enlace de dentro de la pantalla (Inicio → una clase del día) no se anima.
  await menu(page).getByRole('link', { name: 'Inicio' }).first().click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
  const enlaceClase = page.locator('a[href^="/calendario?sesion="]').first();
  await expect(enlaceClase).toBeVisible({ timeout: 60_000 });
  const antesDelEnlace = await contar();
  await enlaceClase.click();
  await expect(page).toHaveURL(/\/calendario/, { timeout: 60_000 });
  await page.waitForTimeout(600);
  expect(await contar(), 'un enlace de dentro de la pantalla no anima').toBe(antesDelEnlace);
});

test('un diálogo abierto no deja ningún transform puesto al terminar de entrar', async ({ page }) => {
  await montar(page);
  await ir(page, 'calendario');
  await expect(page.getByTestId('grid-semana-scroll')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Clase recurrente' }).click();
  const dialogo = page.locator('[data-slot="dialog-content"]');
  await expect(dialogo).toBeVisible();
  // Nace del botón: el origen de la escala no es su centro.
  const origen = await dialogo.evaluate(el => (el as HTMLElement).style.transformOrigin);
  expect(origen, 'origen puesto desde el clic').not.toBe('');
  await expect.poll(() => dialogo.evaluate(el => getComputedStyle(el).transform), { message: 'sin matriz identidad residual' }).toBe('none');
  await page.keyboard.press('Escape');
  await expect(dialogo).toBeHidden();
});
