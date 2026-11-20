import { test, expect, type Page } from '@playwright/test';
import { montar, ir, enOscuro } from './panel-sembrado';
import { conAsistente } from './asistente-andamiaje';

// ─────────────────────────────────────────────────────────────────────────────
// Shell a sangre (`SHELL_NUEVO`, 18-nov-2026). Deja capturas en test-results/ para
// mirarlas (claro, oscuro, 1440 y 1024, y el de siempre para comparar) y comprueba
// lo que SÍ se puede afirmar: el menú pega al borde izquierdo, el hueco del
// contenido es el de `grid.panel` (224) y el buscador ya no es el color de marca.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 240_000 });

async function preparar(page: Page, shellNuevo: boolean) {
  await montar(page);
  // Después de `montar`: gana a su comodín.
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ panelNuevo: true, shellNuevo }),
  }));
}

/**
 * `ir` solo espera 20 s al panel: con `next dev` sobre WASM (sin bindings nativos) compilar
 * cada trozo bajo demanda tarda más y se medía el esqueleto. Aquí se espera al menú de verdad
 * y a que se vaya el esqueleto de datos.
 */
async function listo(page: Page) {
  await page.locator('aside[data-panel-menu]').waitFor({ state: 'attached', timeout: 300_000 });
  await page.waitForFunction(() => !document.querySelector('.animate-pulse'), null, { timeout: 120_000 }).catch(() => {});
  await page.waitForTimeout(600);
}

for (const [nombre, ancho, alto] of [['1440', 1440, 900], ['1024', 1024, 768]] as const) {
  for (const nuevo of [true, false]) {
    test(`${nuevo ? 'a sangre' : 'de siempre'} — ${nombre} claro`, async ({ page }) => {
      await preparar(page, nuevo);
      await page.setViewportSize({ width: ancho, height: alto });
      await ir(page, 'dashboard');
      await listo(page);
      await page.screenshot({ path: `test-results/shell-${nuevo ? 'sangre' : 'previo'}-${nombre}-claro.png` });
      if (!nuevo) return;
      const menu = page.locator('aside[data-panel-menu]');
      const caja = await menu.boundingBox();
      expect(caja?.x, 'el menú pega al borde izquierdo').toBe(0);
      expect(caja?.y, 'y empieza bajo el logo (56 px), no a 104').toBe(56);
      const hueco = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w').trim());
      expect(hueco).toBe('224px');
      await expect(page.locator('aside[data-panel-menu] [data-tour="buscador"]'), 'el buscador está en el menú').toHaveCount(1);
    });
  }
}

test('a sangre — 1440 oscuro', async ({ page }) => {
  await preparar(page, true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await enOscuro(page);
  await ir(page, 'dashboard');
  await listo(page);
  await expect(page.locator('.panel-app.dark')).toHaveCount(1, { timeout: 60_000 });
  await page.waitForFunction(() => !document.querySelector('.animate-pulse'), null, { timeout: 120_000 });
  await page.screenshot({ path: 'test-results/shell-sangre-1440-oscuro.png' });
});

test('a sangre — clientas y configuración', async ({ page }) => {
  await preparar(page, true);
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const ruta of ['clientas', 'configuracion']) {
    await ir(page, ruta);
    await listo(page);
    await page.screenshot({ path: `test-results/shell-sangre-${ruta}.png` });
  }
});

test('a sangre — el botón Buscar del menú abre el buscador', async ({ page }) => {
  await preparar(page, true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await ir(page, 'dashboard');
  await listo(page);
  await page.locator('aside[data-panel-menu] [data-tour="buscador"]').click();
  await expect(page.getByRole('dialog').first()).toBeVisible({ timeout: 120_000 });
});

test('a sangre — Configuración: el menú pasa a ser el de sus secciones', async ({ page }) => {
  await preparar(page, true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await ir(page, 'configuracion');
  await listo(page);
  await expect(page.locator('#host-menu-configuracion')).toHaveCount(1);
  await expect(page.locator('#host-menu-configuracion a').first(), 'la lista de secciones está en el menú').toBeVisible({ timeout: 120_000 });
  await page.screenshot({ path: 'test-results/shell-sangre-config-menu.png' });
});

test('a sangre — Informes (tarjetas y gráficos)', async ({ page }) => {
  await preparar(page, true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await ir(page, 'informes');
  await listo(page);
  await page.screenshot({ path: 'test-results/shell-sangre-informes.png' });
});

test('a sangre — el asistente abre como columna y el lienzo se encoge', async ({ page }) => {
  const errores: string[] = [];
  page.on('pageerror', (e) => errores.push(e.message));
  await conAsistente(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ panelNuevo: true, shellNuevo: true }),
  }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await ir(page, 'dashboard');
  await listo(page);
  const lienzo = page.locator('main > div').first();
  const antes = (await lienzo.boundingBox())?.width ?? 0;
  const pildora = page.locator('[data-pildora-asistente]');
  await expect(pildora).toBeVisible({ timeout: 120_000 });
  await pildora.click();
  await expect(page.locator('[data-columna-asistente]')).toBeVisible();
  await page.waitForTimeout(600);
  const despues = (await lienzo.boundingBox())?.width ?? 0;
  expect(despues, 'el lienzo cede ~352 px a la columna').toBeLessThan(antes - 300);
  await page.screenshot({ path: 'test-results/shell-sangre-asistente.png' });
  await expect(page.getByText('Algo ha ido mal')).toHaveCount(0);
  expect(errores, errores.join('\n')).toEqual([]);
});

test('a sangre — la letra del panel es Inter y se carga', async ({ page }) => {
  await preparar(page, true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await ir(page, 'dashboard');
  await listo(page);
  const familia = await page.locator('aside[data-panel-menu]').evaluate((e) => getComputedStyle(e).fontFamily);
  expect(familia).toContain('Inter');
  await page.evaluate(() => document.fonts.load('450 13px Inter'));
  const cargada = await page.evaluate(() => document.fonts.check('450 13px Inter'));
  expect(cargada, 'Inter está cargada (el navegador la pidió)').toBe(true);
  await page.screenshot({ path: 'test-results/shell-sangre-inter.png' });
});

test('a sangre — Resumen de un estudio nuevo: tarjetas de paso con imagen', async ({ page }) => {
  await preparar(page, true);
  // Un estudio nacido ahora (con tutoriales): la lista de arranque sale con sus pasos pendientes.
  await page.route('**/rest/v1/studios**', (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      id: 'studio-test', nombre: 'Pilates Centro', slug: 'pilates-centro', owner_auth_user_id: 'auth-e2e-duena',
      email: 'cloe@example.com', moneda: 'EUR', iva_por_defecto: 21, nif: 'B12345678', direccion: 'Calle Mayor 4', ciudad: 'Almería',
      creado_en: new Date().toISOString(),
    }),
  }));
  await page.route('**/rest/v1/sesiones**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.route('**/rest/v1/reservas**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await ir(page, 'dashboard');
  await listo(page);
  await page.keyboard.press('Escape');
  const tarjetas = page.getByTestId('tarjetas-de-paso');
  await expect(tarjetas).toBeVisible({ timeout: 120_000 });
  await expect(tarjetas.locator('li')).not.toHaveCount(0);
  await page.screenshot({ path: 'test-results/shell-sangre-tarjetas-paso.png' });
  // Descartar una tarjeta la quita sin recargar.
  const titulo = (await tarjetas.locator('h3').first().innerText()).trim();
  await tarjetas.getByRole('button', { name: /^Descartar:/ }).first().click();
  await expect(tarjetas.getByRole('heading', { name: titulo })).toHaveCount(0);
});

// ── Revisión de lo que dependía del hueco del menú y del móvil ───────────────────────────────

test('a sangre — móvil (390): marco oscuro, lienzo blanco, botón de menú y sin desbordes', async ({ page }) => {
  await preparar(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await ir(page, 'dashboard');
  await listo(page).catch(() => {});
  await page.waitForTimeout(1200);
  const ancho = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, ventana: window.innerWidth }));
  expect(ancho.doc, 'ni una barra de scroll horizontal').toBeLessThanOrEqual(ancho.ventana + 1);
  await expect(page.locator('[data-movil-menu]'), 'el botón redondo del menú').toBeVisible({ timeout: 120_000 });
  await expect(page.locator('[data-movil-inferior]'), 'sin barra de abajo').toBeHidden();
  await expect(page.locator('[data-movil-superior]'), 'sin barra de arriba').toBeHidden();
  await expect(page.locator('[data-pildora-asistente]')).toBeHidden();
  await page.screenshot({ path: 'test-results/shell-sangre-movil.png' });
  await page.locator('[data-movil-menu]').click();
  await expect(page.getByText('Menú', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/shell-sangre-movil-menu.png' });
});

test('a sangre — tablet (768): el mismo menú a sangre que en escritorio (Shopify corta en 48 em), sin desbordes', async ({ page }) => {
  await preparar(page, true);
  await page.setViewportSize({ width: 768, height: 1024 });
  await ir(page, 'clientas');
  await page.waitForTimeout(1500);
  const ancho = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, ventana: window.innerWidth }));
  if (ancho.doc > ancho.ventana + 1) {
    const culpables = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && (!e.parentElement || e.parentElement.getBoundingClientRect().right <= window.innerWidth + 1 || getComputedStyle(e.parentElement).overflowX !== 'visible')).slice(0, 12).map((e) => `${e.tagName}.${String(e.className).slice(0, 70)} → ${Math.round(e.getBoundingClientRect().right)}`));
    console.log('DESBORDE', JSON.stringify(culpables, null, 1));
  }
  expect(ancho.doc).toBeLessThanOrEqual(ancho.ventana + 1);
  await expect(page.locator('aside[data-panel-menu]'), 'el menú a sangre ya sale a 768').toBeVisible({ timeout: 120_000 });
  await expect(page.locator('[data-movil-menu]'), 'y no hay botón flotante').toBeHidden();
  const menu = await page.locator('aside[data-panel-menu]').boundingBox();
  expect(menu?.x).toBe(0);
  await page.screenshot({ path: 'test-results/shell-sangre-tablet-768.png' });
});

test('a sangre — tablet (1024): clientas sin desbordes', async ({ page }) => {
  await preparar(page, true);
  await page.setViewportSize({ width: 1024, height: 768 });
  await ir(page, 'clientas');
  await listo(page);
  const ancho = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, ventana: window.innerWidth }));
  expect(ancho.doc).toBeLessThanOrEqual(ancho.ventana + 1);
  await page.screenshot({ path: 'test-results/shell-sangre-tablet-clientas.png' });
});

test('a sangre — /asistente a pantalla completa respeta el hueco del menú', async ({ page }) => {
  await conAsistente(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ panelNuevo: true, shellNuevo: true }),
  }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await ir(page, 'asistente');
  await listo(page);
  const chat = page.getByTestId('chat-asistente');
  await expect(chat).toBeVisible({ timeout: 120_000 });
  const caja = await chat.boundingBox();
  expect(caja?.x ?? 0, 'empieza donde acaba el menú (224 px)').toBeGreaterThanOrEqual(222);
  await page.screenshot({ path: 'test-results/shell-sangre-asistente-pagina.png' });
});

test('a sangre — oscuro: Clientes, Configuración y el asistente', async ({ page }) => {
  await conAsistente(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ panelNuevo: true, shellNuevo: true }),
  }));
  await enOscuro(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await ir(page, 'clientas');
  await listo(page);
  await expect(page.locator('.panel-app.dark')).toHaveCount(1, { timeout: 60_000 });
  await page.screenshot({ path: 'test-results/shell-sangre-oscuro-clientas.png' });
  await ir(page, 'dashboard');
  await listo(page);
  await page.locator('[data-pildora-asistente]').click();
  await expect(page.locator('[data-columna-asistente]')).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/shell-sangre-oscuro-asistente.png' });
});

test('a sangre — el compositor de Inicio abre la columna con la pregunta enviada', async ({ page }) => {
  await conAsistente(page);
  await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ panelNuevo: true, shellNuevo: true }),
  }));
  await page.setViewportSize({ width: 1440, height: 900 });
  await ir(page, 'dashboard');
  await listo(page);
  const compositor = page.locator('[data-compositor-inicio]');
  await expect(compositor).toBeVisible({ timeout: 120_000 });
  await page.screenshot({ path: 'test-results/shell-sangre-compositor-inicio.png' });
  await compositor.getByLabel('Pregúntale a Tentare').fill('¿Cuántos clientes activos tengo?');
  await compositor.getByRole('button', { name: 'Preguntar' }).click();
  const columna = page.locator('[data-columna-asistente]');
  await expect(columna).toBeVisible();
  // El chat de la columna recibe la pregunta y la manda: aparece como turno de la conversación.
  await expect(columna.getByText('¿Cuántos clientes activos tengo?').first()).toBeVisible({ timeout: 60_000 });
  await page.screenshot({ path: 'test-results/shell-sangre-compositor-columna.png' });
});

// Barrido de módulos con el marco a sangre: ninguna pantalla rompe y se deja una captura de cada una.
for (const ruta of ['calendario', 'cobros', 'equipo', 'productos', 'informes', 'citas', 'mensajeria', 'centro-de-control', 'automatizaciones', 'cierre']) {
  test(`a sangre — módulo ${ruta}`, async ({ page }) => {
    const errores: string[] = [];
    page.on('pageerror', (e) => errores.push(e.message));
    await preparar(page, true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await ir(page, ruta);
    await listo(page);
    await expect(page.getByText('Algo ha ido mal')).toHaveCount(0);
    expect(errores, errores.join('\n')).toEqual([]);
    await page.screenshot({ path: `test-results/shell-modulo-${ruta}.png` });
  });
}

test('a sangre — Mensajería: las cuatro tarjetas y el cajón de notificaciones', async ({ page }) => {
  await preparar(page, true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await ir(page, 'mensajeria');
  await listo(page);
  const tabs = page.getByRole('tab');
  await expect(tabs.first()).toBeVisible({ timeout: 120_000 });
  const alto = (await tabs.first().boundingBox())?.height ?? 0;
  expect(alto, 'las tarjetas de Mensajería no se aplastan a 28 px').toBeGreaterThan(56);
  await page.screenshot({ path: 'test-results/shell-sangre-mensajeria.png' });
  await page.getByRole('button', { name: /notificaciones/i }).first().click().catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/shell-sangre-notificaciones.png' });
});

for (const ancho of [768, 900, 1024, 1180]) {
  test(`a sangre — la columna del asistente a ${ancho} px no tapa ni aprieta el lienzo`, async ({ page }) => {
    await conAsistente(page);
    await page.route((u) => u.pathname === '/api/estudio/interruptores', (r) => r.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ panelNuevo: true, shellNuevo: true }),
    }));
    await page.setViewportSize({ width: ancho, height: 900 });
    await ir(page, 'dashboard');
    await listo(page);
    await page.locator('[data-pildora-asistente]').click();
    await expect(page.locator('[data-columna-asistente]')).toBeVisible();
    await page.waitForTimeout(700);
    const col = await page.locator('[data-columna-asistente]').boundingBox();
    expect((col?.x ?? 0) + (col?.width ?? 0), 'la columna cabe en la ventana').toBeLessThanOrEqual(ancho);
    const lienzo = await page.locator('main > div').first().boundingBox();
    console.log(`ANCHO ${ancho}: columna x=${col?.x} w=${col?.width}, lienzo x=${lienzo?.x} w=${lienzo?.width}`);
    await page.screenshot({ path: `test-results/shell-columna-${ancho}.png` });
  });
}

test('a sangre — el menú despliega las vistas de un módulo en línea (Paquetes) y navega entre ellas', async ({ page }) => {
  await preparar(page, true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await ir(page, 'productos');
  await listo(page);
  const acordeon = page.locator('[data-acordeon="/productos"]');
  await expect(acordeon).toBeVisible({ timeout: 120_000 });
  const lista = acordeon.locator('[data-sublista]');
  await expect(lista, 'al entrar en Paquetes se abre solo').toHaveAttribute('data-abierta', '');
  await expect(lista.getByRole('link', { name: 'Tarifas' })).toHaveAttribute('aria-current', 'page');
  await page.screenshot({ path: 'test-results/shell-menu-desplegado.png' });
  // El chevron la cierra y la abre.
  await acordeon.getByRole('button', { name: /Cerrar Paquetes/ }).click();
  await expect(lista).not.toHaveAttribute('data-abierta', '');
  await acordeon.getByRole('button', { name: /Abrir Paquetes/ }).click();
  await expect(lista).toHaveAttribute('data-abierta', '');
  // Pulsar otra vista: la URL la sigue y el menú marca la nueva sin recargar la página.
  const regalo = lista.getByRole('link', { name: 'Tarjeta regalo' });
  if (await regalo.count()) {
    await regalo.click();
    await expect(page).toHaveURL(/tab=regalo/, { timeout: 30_000 });
    await expect(regalo).toHaveAttribute('aria-current', 'page', { timeout: 30_000 });
  }
});

test('a sangre — el resplandor del menú sigue bajo la esquina del lienzo', async ({ page }) => {
  await preparar(page, true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await ir(page, 'dashboard');
  await listo(page);
  await expect(page.locator('[data-marco-brillo]')).toBeAttached();
  await page.screenshot({ path: 'test-results/shell-brillo-esquina.png', clip: { x: 0, y: 780, width: 700, height: 120 } });
});

for (const [nombre, ancho, alto] of [['escritorio', 1440, 900], ['movil', 390, 844]] as const) {
  test(`a sangre — calendario (${nombre})`, async ({ page }) => {
    await preparar(page, true);
    await page.setViewportSize({ width: ancho, height: alto });
    await ir(page, 'calendario');
    await listo(page);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `test-results/shell-calendario-${nombre}.png` });
  });
}

test('a sangre — calendario: sin tarjeta exterior, columnas iguales y atajos ← → y T', async ({ page }) => {
  await preparar(page, true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await ir(page, 'calendario');
  await listo(page);
  const marco = page.locator('[data-calendario-marco]');
  await expect(marco).toBeVisible({ timeout: 120_000 });
  expect(await marco.evaluate((e) => getComputedStyle(e).borderTopWidth), 'sin la tarjeta con borde de antes').toBe('0px');
  // Ningún día queda plegado a una tira: los vacíos miden al menos 64 px y los de clases, 150 o más (que «Reformer» quepa entero).
  const anchos = await page.locator('[data-cabecera-dia]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
  if (anchos.length === 7) {
    expect(Math.min(...anchos), `columnas ${anchos.join(',')}`).toBeGreaterThanOrEqual(64);
    expect(Math.max(...anchos), `columnas ${anchos.join(',')}`).toBeGreaterThanOrEqual(150);
  }
  // → pasa a la semana siguiente; T vuelve a hoy.
  const cab = page.locator('[data-calendario-cabecera]');
  const antes = (await cab.innerText()).replace(/\s+/g, ' ');
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await cab.innerText()).replace(/\s+/g, ' '), { timeout: 20_000, message: '→ cambia la semana' }).not.toBe(antes);
  await page.keyboard.press('t');
  await expect.poll(async () => (await cab.innerText()).replace(/\s+/g, ' '), { timeout: 20_000, message: 'T vuelve a hoy' }).toBe(antes);
  await page.screenshot({ path: 'test-results/shell-calendario-fase1.png' });
});
