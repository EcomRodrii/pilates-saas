import { test, expect, type Locator, type Page } from '@playwright/test';
import { abrirPanel as abrir, controlesCortos as medir, quitarMarcaPanelNuevo } from './zona-tactil';

// El panel nuevo en el iPad de recepción, con el dedo: lo que se pulsa tiene
// 44 px de zona táctil (WCAG 2.5.5 y la guía de Apple). Medido a 768 y a 1024
// antes del arreglo: el ⓘ de cada cabecera era de 20 px, las píldoras de
// periodo de 27, los botones de 32–36, y a 1024 (donde el iPad tumbado ya ve
// la barra lateral) los iconos de arriba de 36 y «Cerrar sesión» de 26.
//
// Se mide como se toca (`zona-tactil.ts`): un círculo de 44 px centrado en el
// control tiene que caer en ÉL. Así cuenta la zona que crece sin cambiar el
// dibujo (`.zona-tactil`, un `::after`) y se ve también si la de un control se
// mete en la del de al lado. Las pantallas del mostrador, en
// `panel-nuevo-tableta-mostrador.spec.ts`.

test.use({ timezoneId: 'Europe/Madrid', hasTouch: true });
// Contra un `next dev` que compila al vuelo, una ruta nueva tarda en la primera petición.
test.describe.configure({ timeout: 90_000 });

/** Las piezas comunes de una pantalla del panel nuevo: cabecera, pestañas y píldoras. */
function piezasDeClientas(page: Page): [string, Locator][] {
  const cabecera = page.locator('[data-slot="page-header"]');
  return [
    ['ⓘ de la cabecera', cabecera.getByRole('button', { name: 'Ayuda: Clientas' })],
    ['«Cómo funciona»', cabecera.getByTestId('boton-tutorial')],
    ['«Importar» (BOTON_BORDE)', cabecera.getByRole('button', { name: 'Importar' })],
    ['«Nueva clienta» (BotonVivo)', cabecera.getByRole('button', { name: 'Nueva clienta' })],
    ['pestaña «Clientas» (PestanasVivas)', page.getByRole('tab', { name: /^Clientas/ })],
    ['pestaña «Interesadas y pruebas»', page.getByRole('tab', { name: /^Interesadas y pruebas/ })],
    ['píldora «3 meses» (Pildoras)', page.getByRole('group', { name: 'Periodo' }).first().getByRole('button', { name: '3 meses' })],
    ['píldora «1 año»', page.getByRole('group', { name: 'Periodo' }).first().getByRole('button', { name: '1 año' })],
  ];
}

test.describe('iPad vertical (768×1024)', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('Clientas: la cabecera, las pestañas y las píldoras tienen 44 px de zona táctil', async ({ page }) => {
    await abrir(page, 'clientas');
    expect(await medir(piezasDeClientas(page))).toEqual([]);
  });

  test('Resumen: el ⓘ y los enlaces «Ver …» (VerMas) también', async ({ page }) => {
    await abrir(page, 'dashboard');
    const malos = await medir([
      ['ⓘ de la cabecera', page.getByRole('button', { name: 'Ayuda: Resumen' })],
      ['«Ver informe» (VerMas)', page.getByRole('link', { name: 'Ver informe' })],
      ['«Ver clientas» (VerMas)', page.getByRole('link', { name: 'Ver clientas' })],
    ]);
    expect(malos).toEqual([]);
  });

  test('sin la marca del panel nuevo la medida ve el diseño de antes (quitada con JavaScript)', async ({ page }) => {
    await abrir(page, 'clientas');
    await quitarMarcaPanelNuevo(page);
    const malos = await medir(piezasDeClientas(page));
    // El ⓘ (20 px), las píldoras (27) y los botones (32–36) vuelven a quedarse cortos.
    expect(malos.length, malos.join('\n')).toBeGreaterThanOrEqual(6);
    expect(malos.some(m => m.startsWith('ⓘ'))).toBe(true);
  });
});

test.describe('iPad tumbado (1024×768)', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('el marco: la barra de arriba y el menú lateral tienen 44 px de zona táctil', async ({ page }) => {
    await abrir(page, 'informes');
    const arriba = page.locator('[data-panel-topbar]');
    const menu = page.locator('[data-panel-menu]');
    const malos = await medir([
      ['buscador ⌘K', arriba.getByRole('button', { name: /Qué quieres hacer o buscar/ })],
      ['ocultar cifras', arriba.getByRole('button', { name: /Ocultar cifras/ })],
      ['Mensajería (arriba)', arriba.getByRole('link', { name: 'Mensajería' })],
      ['campana', arriba.getByRole('button', { name: /Notificaciones/ })],
      ['menú de perfil', arriba.getByRole('button', { name: 'Abrir menú de perfil' })],
      ['fila «Calendario»', menu.getByRole('link', { name: 'Calendario', exact: true })],
      ['fila «Clientas»', menu.getByRole('link', { name: 'Clientas', exact: true })],
      ['fila «Cobros»', menu.getByRole('link', { name: 'Cobros', exact: true })],
      ['fila «Paquetes»', menu.getByRole('link', { name: 'Paquetes', exact: true })],
      ['«Portal clientes»', menu.getByRole('link', { name: 'Portal clientes' })],
      ['avatar → mi perfil', menu.locator('a[href="/mi-perfil"]')],
      ['«Cerrar sesión»', menu.getByRole('button', { name: 'Cerrar sesión' })],
      ['tamaño del menú', menu.getByRole('button', { name: /Tamaño del menú|Normal/ })],
    ]);
    expect(malos).toEqual([]);
  });
});

test.describe('lo que no cambia', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test('el panel de siempre no lleva la marca ni la zona', async ({ page }) => {
    await abrir(page, 'clientas', false);
    await expect(page.locator('.panel-app')).toHaveCount(1, { timeout: 30_000 });
    await expect(page.locator('[data-slot="page-header"]')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('.panel-app[data-panel-nuevo]')).toHaveCount(0);
    const boton = page.locator('button.zona-tactil').first();
    const estilo = await boton.evaluate((el) => ({ antes: getComputedStyle(el, '::after').content, pos: getComputedStyle(el).position }));
    expect(estilo).toEqual({ antes: 'none', pos: 'static' });
  });
});

test.describe('con ratón', () => {
  test.use({ viewport: { width: 1440, height: 900 }, hasTouch: false });

  test('el panel nuevo en escritorio no cambia ni un píxel: ni zona ni filas más altas', async ({ page }) => {
    await abrir(page, 'clientas');
    await expect(page.locator('.panel-app[data-panel-nuevo]')).toHaveCount(1, { timeout: 30_000 });
    const info = page.locator('[data-slot="page-header"]').getByRole('button', { name: 'Ayuda: Clientas' });
    await expect(info).toBeVisible({ timeout: 30_000 });
    expect(await info.evaluate((el) => getComputedStyle(el, '::after').content)).toBe('none');
    expect((await info.boundingBox())!.width).toBeLessThan(24);
    const fila = page.locator('[data-panel-menu]').getByRole('link', { name: 'Clientas', exact: true });
    expect(Math.round((await fila.boundingBox())!.height)).toBe(36);
  });
});
