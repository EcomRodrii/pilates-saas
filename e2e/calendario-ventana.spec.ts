import { test, expect, type Page } from '@playwright/test';
import { montar, ir } from './panel-sembrado';

// ─────────────────────────────────────────────────────────────────────────────
// Ampliar el calendario y llevarse la agenda a una ventana flotante (solo en un
// ordenador). Lo que se prueba es lo que se rompería sin avisar:
//   · ampliar esconde menú y barra, la rejilla GANA alto, y Escape lo devuelve;
//   · salir del Calendario ampliado no deja el resto del panel sin menú;
//   · la ventana se arrastra, sobrevive al cambio de pantalla y a recargar, y no
//     se puede soltar fuera de la pantalla;
//   · en una tablet no hay ni botones ni ventana, aunque estuviera guardada abierta.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid', viewport: { width: 1440, height: 900 } });
test.describe.configure({ timeout: 120_000 });

const rejilla = (page: Page) => page.getByTestId('grid-semana-scroll');
const ventana = (page: Page) => page.getByTestId('ventana-calendario');
const menu = (page: Page) => page.locator('aside[data-panel-menu]');

async function calendario(page: Page) {
  await montar(page);
  await ir(page, 'calendario');
  await expect(rejilla(page)).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(400); // el alto de la rejilla se mide en el siguiente fotograma
}

async function arrastrar(page: Page, dx: number, dy: number) {
  const barra = page.getByTestId('ventana-calendario-barra');
  const caja = (await barra.boundingBox())!;
  // Por la zona del asa, lejos de los botones de la barra.
  const x = caja.x + 10;
  const y = caja.y + caja.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
}

test('ampliar esconde el menú y la barra, la rejilla gana sitio, y Escape lo devuelve', async ({ page }) => {
  await calendario(page);
  const antes = (await rejilla(page).boundingBox())!;
  await expect(menu(page)).toBeVisible();

  await page.getByRole('button', { name: 'Ampliar a toda la pantalla' }).click();
  await expect(menu(page)).toBeHidden();
  // Con espera: el hueco del menú se cierra con una transición de 200 ms.
  // Medido en 1440×900: la rejilla pasa de 1084×465 a 1364×609.
  await expect.poll(async () => (await rejilla(page).boundingBox())!.height).toBeGreaterThan(antes.height + 100);
  await expect.poll(async () => (await rejilla(page).boundingBox())!.width, { message: 'también gana ancho' }).toBeGreaterThan(antes.width + 200);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - innerHeight), 'la página no se desplaza').toBeLessThanOrEqual(1);
  await page.screenshot({ path: 'test-results/ventana-calendario-1-ampliado.png' });

  await page.keyboard.press('Escape');
  await expect(menu(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ampliar a toda la pantalla' })).toBeVisible();
});

test('con un diálogo abierto, Escape cierra el diálogo y no la vista ampliada', async ({ page }) => {
  await calendario(page);
  await page.getByRole('button', { name: 'Ampliar a toda la pantalla' }).click();
  await expect(menu(page)).toBeHidden();
  await page.getByRole('button', { name: 'Clase recurrente' }).click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialogo).toBeHidden();
  await expect(menu(page), 'sigue ampliado').toBeHidden();
});

test('salir del Calendario ampliado no deja el panel sin menú', async ({ page }) => {
  await montar(page);
  await ir(page, 'dashboard');
  await menu(page).getByRole('link', { name: 'Calendario' }).first().click();
  await expect(rejilla(page)).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Ampliar a toda la pantalla' }).click();
  await expect(menu(page)).toBeHidden();

  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 60_000 });
  await expect(menu(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-calendario-ampliado'))).toBe(false);
});

test('la ventana flotante se arrastra y se queda donde la dejas, también en otra pantalla y al recargar', async ({ page }) => {
  await calendario(page);
  await page.getByRole('button', { name: 'Abrir en una ventana flotante' }).click();
  await expect(ventana(page)).toBeInViewport({ ratio: 1 });
  // Las dos clases de hoy del estudio sembrado, con su aforo.
  await expect(ventana(page).getByRole('listitem')).toHaveCount(2);
  await expect(ventana(page)).toContainText('Hoy ·');

  const inicial = (await ventana(page).boundingBox())!;
  await arrastrar(page, -600, 220);
  const movida = (await ventana(page).boundingBox())!;
  expect(Math.round(movida.x - inicial.x)).toBe(-600);
  expect(Math.round(movida.y - inicial.y)).toBe(220);

  await menu(page).getByRole('link', { name: 'Clientas' }).first().click();
  await expect(page).toHaveURL(/\/clientas/, { timeout: 60_000 });
  await expect(ventana(page)).toBeInViewport({ ratio: 1 });
  const enClientas = (await ventana(page).boundingBox())!;
  expect(Math.round(enClientas.x)).toBe(Math.round(movida.x));
  expect(Math.round(enClientas.y)).toBe(Math.round(movida.y));
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/ventana-calendario-2-flotante-en-clientas.png' });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(ventana(page)).toBeVisible({ timeout: 60_000 });
  const recargada = (await ventana(page).boundingBox())!;
  expect(Math.round(recargada.x)).toBe(Math.round(movida.x));
  expect(Math.round(recargada.y)).toBe(Math.round(movida.y));
});

test('soltarla fuera de la pantalla la devuelve entera, y plegada ocupa solo la barra', async ({ page }) => {
  await calendario(page);
  await page.getByRole('button', { name: 'Abrir en una ventana flotante' }).click();
  await expect(ventana(page)).toBeVisible();
  await arrastrar(page, 900, 900);
  await expect(ventana(page)).toBeInViewport({ ratio: 1 });

  await ventana(page).getByRole('button', { name: 'Plegar la ventana' }).click();
  await expect(ventana(page).getByRole('listitem')).toHaveCount(0);
  expect((await ventana(page).boundingBox())!.height).toBeLessThan(60);
  await page.screenshot({ path: 'test-results/ventana-calendario-3-plegada.png' });

  await ventana(page).getByRole('button', { name: 'Desplegar la ventana' }).click();
  await expect(ventana(page).getByRole('listitem')).toHaveCount(2);
  await expect(ventana(page)).toBeInViewport({ ratio: 1 });
});

test('desde otra pantalla, pulsar una clase de la ventana abre esa clase en el Calendario', async ({ page }) => {
  await calendario(page);
  await page.getByRole('button', { name: 'Abrir en una ventana flotante' }).click();
  await menu(page).getByRole('link', { name: 'Clientas' }).first().click();
  await expect(page).toHaveURL(/\/clientas/, { timeout: 60_000 });

  await ventana(page).getByRole('listitem').first().getByRole('button').click();
  await expect(page).toHaveURL(/\/calendario/, { timeout: 60_000 });
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
});

test('«Ver el calendario entero» cierra la ventana y lleva al Calendario', async ({ page }) => {
  await calendario(page);
  await page.getByRole('button', { name: 'Abrir en una ventana flotante' }).click();
  await menu(page).getByRole('link', { name: 'Clientas' }).first().click();
  await expect(page).toHaveURL(/\/clientas/, { timeout: 60_000 });

  await ventana(page).getByRole('button', { name: 'Ver el calendario entero' }).click();
  await expect(page).toHaveURL(/\/calendario/, { timeout: 60_000 });
  await expect(ventana(page)).toHaveCount(0);
});

test.describe('en una tablet', () => {
  test.use({ viewport: { width: 1024, height: 1366 }, hasTouch: true, isMobile: true });

  test('no hay botones ni ventana, aunque estuviera guardada abierta', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('tentare:calendario-ventana', JSON.stringify({ abierta: true, plegada: false, posicion: { x: 40, y: 120 } }));
    });
    await montar(page);
    await ir(page, 'calendario');
    await expect(page.getByRole('button', { name: /Nueva clase/ }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Ampliar a toda la pantalla' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Abrir en una ventana flotante' })).toHaveCount(0);
    await expect(ventana(page)).toHaveCount(0);
  });
});
