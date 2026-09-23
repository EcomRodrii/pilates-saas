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

/** La ventana nace escalada desde el botón: medirla antes de que acabe da una caja de juguete. */
async function quieta(page: Page) {
  await expect.poll(async () => Math.round((await ventana(page).boundingBox())?.width ?? 0)).toBe(320);
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

test.describe('en el portátil más común (1366×768)', () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  // Primero iban al final de la fila de acciones y en CI (Linux) bajaban solos a
  // una segunda fila, robándole alto a la rejilla. Junto al título hay sitio.
  test('los controles van en la línea del título, sin hacerla más alta', async ({ page }) => {
    await calendario(page);
    const titulo = (await page.locator('[data-slot="page-header-title"]').boundingBox())!;
    for (const nombre of ['Abrir en una ventana flotante', 'Ampliar a toda la pantalla']) {
      const b = (await page.getByRole('button', { name: nombre }).boundingBox())!;
      expect(Math.abs((b.y + b.height / 2) - (titulo.y + titulo.height / 2)), `${nombre}: en la línea del título`).toBeLessThanOrEqual(4);
      expect(b.height, `${nombre}: no más alto que el título`).toBeLessThanOrEqual(titulo.height);
    }
    const acciones = page.locator('[data-slot="page-header-actions"]');
    await expect(acciones.getByRole('button', { name: 'Ampliar a toda la pantalla' })).toHaveCount(0);
  });
});

test('ampliar esconde el menú y la barra, la rejilla gana sitio, y Escape lo devuelve', async ({ page }) => {
  await calendario(page);
  const antes = (await rejilla(page).boundingBox())!;
  await expect(menu(page)).toBeVisible();

  await page.getByRole('button', { name: 'Ampliar a toda la pantalla' }).click();
  await expect(menu(page)).toBeHidden();
  // Con espera: el hueco del menú se cierra con una transición de 200 ms.
  // Medido en 1440×900: la rejilla pasa de 1084×515 a 1364×609 (antes de «Crear
  // clase» —un botón menos en la cabecera— partía de 465 y el umbral era +100).
  await expect.poll(async () => (await rejilla(page).boundingBox())!.height).toBeGreaterThan(antes.height + 60);
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
  await page.getByRole('button', { name: 'Crear clase', exact: true }).click();
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
  expect(await page.evaluate(() => document.documentElement.hasAttribute('data-panel-ampliado'))).toBe(false);
});

test('la ventana flotante se arrastra y se queda donde la dejas, también en otra pantalla y al recargar', async ({ page }) => {
  await calendario(page);
  await page.getByRole('button', { name: 'Abrir en una ventana flotante' }).click();
  await quieta(page);
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
  // Al recargar vuelve a entrar animada (escalada al 96 %): medirla a mitad daba
  // 1-3 px de más en CI. Se mide quieta.
  await quieta(page);
  const recargada = (await ventana(page).boundingBox())!;
  expect(Math.round(recargada.x)).toBe(Math.round(movida.x));
  expect(Math.round(recargada.y)).toBe(Math.round(movida.y));
});

test('soltarla fuera de la pantalla la devuelve entera, y plegada ocupa solo la barra', async ({ page }) => {
  await calendario(page);
  await page.getByRole('button', { name: 'Abrir en una ventana flotante' }).click();
  await quieta(page);
  await arrastrar(page, 900, 900);
  await expect(ventana(page)).toBeInViewport({ ratio: 1 });

  await ventana(page).getByRole('button', { name: 'Plegar la ventana' }).click();
  await expect(ventana(page).getByRole('listitem')).toHaveCount(0);
  // La altura se anima: se espera a que llegue, no se mide a mitad.
  await expect.poll(async () => (await ventana(page).boundingBox())!.height).toBeLessThan(60);
  await page.screenshot({ path: 'test-results/ventana-calendario-3-plegada.png' });

  await ventana(page).getByRole('button', { name: 'Desplegar la ventana' }).click();
  await expect(ventana(page).getByRole('listitem')).toHaveCount(2);
  await expect.poll(async () => (await ventana(page).boundingBox())!.height).toBeGreaterThan(120);
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

test('saltar a una clase de mañana no saca hoy de la semana', async ({ page }) => {
  // El fallo que vio la dueña: la semana pasaba a empezar el día de la clase y
  // «hoy no aparece en el calendario».
  await calendario(page);
  await expect(page.locator('[data-cabecera-dia="0"]')).toContainText('HOY');
  await page.getByRole('button', { name: 'Abrir en una ventana flotante' }).click();
  await ventana(page).getByRole('button', { name: 'Día siguiente' }).click();
  await expect(ventana(page)).toContainText('Mañana');
  await ventana(page).getByRole('listitem').first().getByRole('button').click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  await page.getByRole('button', { name: /^Semana$/ }).click();
  await expect(page.locator('[data-cabecera-dia="0"]'), 'la semana sigue empezando hoy').toContainText('HOY');
});

test('⤢ agranda la ventana a la semana SIN cerrarla, y ⤡ la devuelve a pequeña', async ({ page }) => {
  // La dueña: «no expande, se quita la pestaña». La ventana tiene que seguir ahí.
  await calendario(page);
  await page.getByRole('button', { name: 'Abrir en una ventana flotante' }).click();
  await quieta(page);
  const pequena = (await ventana(page).boundingBox())!;

  await ventana(page).getByRole('button', { name: 'Agrandar la ventana' }).click();
  await expect(ventana(page), 'no se cierra').toBeVisible();
  await expect.poll(async () => Math.round((await ventana(page).boundingBox())!.width)).toBeGreaterThan(1000);
  await expect(ventana(page).getByTestId('ventana-dia')).toHaveCount(7);
  await expect(ventana(page).getByTestId('ventana-dia').first()).toContainText('HOY');
  await expect(ventana(page)).toContainText('Esta semana');
  // El estudio sembrado tiene 6 clases de hoy en adelante (la de ayer no entra).
  await expect(ventana(page).getByRole('listitem')).toHaveCount(6);
  await expect(ventana(page)).toBeInViewport({ ratio: 1 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/ventana-calendario-agrandada.png' });

  await ventana(page).getByRole('button', { name: 'Reducir la ventana' }).click();
  await expect(ventana(page), 'tampoco se cierra al reducir').toBeVisible();
  await expect.poll(async () => Math.round((await ventana(page).boundingBox())!.width)).toBe(320);
  await expect(ventana(page).getByRole('listitem')).toHaveCount(2);
  // Y vuelve a donde estaba antes de agrandarla, no se queda donde la empujó.
  // Con espera: posición y tamaño se animan juntos y se leía el último fotograma.
  await expect.poll(async () => Math.round((await ventana(page).boundingBox())!.x)).toBe(Math.round(pequena.x));
  await expect.poll(async () => Math.round((await ventana(page).boundingBox())!.y)).toBe(Math.round(pequena.y));

  // Agrandada, recargar la deja agrandada.
  await ventana(page).getByRole('button', { name: 'Agrandar la ventana' }).click();
  await expect.poll(async () => Math.round((await ventana(page).boundingBox())!.width)).toBeGreaterThan(1000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(ventana(page)).toBeVisible({ timeout: 60_000 });
  await expect.poll(async () => Math.round((await ventana(page).boundingBox())!.width)).toBeGreaterThan(1000);
});

test('agrandada, las flechas pasan de semana en semana', async ({ page }) => {
  await calendario(page);
  await page.getByRole('button', { name: 'Abrir en una ventana flotante' }).click();
  await quieta(page);
  await ventana(page).getByRole('button', { name: 'Agrandar la ventana' }).click();
  await expect(ventana(page).getByTestId('ventana-dia')).toHaveCount(7);
  await ventana(page).getByRole('button', { name: 'Semana siguiente' }).click();
  await expect(ventana(page)).not.toContainText('Esta semana');
  await expect(ventana(page).getByTestId('ventana-dia').first()).not.toContainText('HOY');
  // El título vuelve a hoy.
  await ventana(page).getByRole('button', { name: /–/ }).first().click();
  await expect(ventana(page)).toContainText('Esta semana');
});

test.describe('en una tablet', () => {
  test.use({ viewport: { width: 1024, height: 1366 }, hasTouch: true, isMobile: true });

  test('no hay botones ni ventana, aunque estuviera guardada abierta', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('tentare:calendario-ventana', JSON.stringify({ abierta: true, plegada: false, posicion: { x: 40, y: 120 } }));
    });
    await montar(page);
    await ir(page, 'calendario');
    await expect(page.getByRole('button', { name: 'Crear clase', exact: true }).first()).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Ampliar a toda la pantalla' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Abrir en una ventana flotante' })).toHaveCount(0);
    await expect(ventana(page)).toHaveCount(0);
  });
});
