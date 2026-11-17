import { test, expect } from '@playwright/test';

// Los dos índices comerciales («Producto» = /funcionalidades, y /soluciones) en el idioma de la home nueva (components/web/hub/).
// Lo que fija, y por qué:
//  · la cabecera es la de la home y marca DÓNDE estás: sin esto el menú dejaba de decir en qué página caías, y «Precios» apuntaba a un
//    ancla (#precio) que fuera de la home no existe;
//  · cada pastilla del índice de /funcionalidades salta a un área que existe (un ancla rota es un clic que no hace nada);
//  · TODAS las funcionalidades del registro siguen enlazadas desde el índice: el rediseño no puede dejar una página huérfana;
//  · los fragmentos de producto son de muestra y no se leen como datos del estudio (aria-hidden dentro de un <figure> con descripción);
//  · ninguna de las dos se sale de la pantalla en un móvil.

test('/funcionalidades: la cabecera marca «Producto», «Precios» lleva a /precios y el índice salta a áreas que existen', async ({ page }) => {
  await page.goto('/funcionalidades', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });

  const menu = page.getByRole('navigation', { name: 'Principal', exact: true });
  await expect(menu.getByRole('link', { name: 'Producto' })).toHaveAttribute('aria-current', 'page');
  await expect(menu.getByRole('link', { name: 'Precios' })).toHaveAttribute('href', '/precios');
  await expect(menu.getByRole('link', { name: 'Soluciones' })).not.toHaveAttribute('aria-current', 'page');

  const anclas = await page.locator('.hx-indice a').evaluateAll(els => els.map(e => e.getAttribute('href')));
  expect(anclas.length).toBeGreaterThanOrEqual(5);
  for (const href of anclas) {
    expect(href, 'el índice solo lleva a anclas de la página').toMatch(/^#[\w-]+$/);
    await expect(page.locator(href!), `existe ${href}`).toHaveCount(1);
  }
});

test('/funcionalidades: las 17 funcionalidades del registro siguen enlazadas desde el índice', async ({ page }) => {
  await page.goto('/funcionalidades', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  const hrefs = await page.locator('main a.hx-fila').evaluateAll(els => els.map(e => e.getAttribute('href')));
  expect(new Set(hrefs).size, hrefs.join(' ')).toBe(17);
  for (const h of hrefs) expect(h).toMatch(/^\/funcionalidades\/[a-z-]+$/);
});

test('/soluciones: la cabecera marca «Soluciones» y las seis soluciones están enlazadas', async ({ page }) => {
  await page.goto('/soluciones', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  const menu = page.getByRole('navigation', { name: 'Principal', exact: true });
  await expect(menu.getByRole('link', { name: 'Soluciones' })).toHaveAttribute('aria-current', 'page');
  const hrefs = await page.locator('main a.hx-sol-card').evaluateAll(els => els.map(e => e.getAttribute('href')));
  expect(hrefs.sort()).toEqual([
    '/funcionalidades/multi-centro',
    '/soluciones/abrir-un-estudio',
    '/soluciones/cambiar-de-software',
    '/soluciones/estudio-de-pilates-reformer',
    '/soluciones/estudio-de-yoga',
    '/soluciones/programa-de-gestion-para-estudio-de-pilates',
  ]);
});

for (const ruta of ['/funcionalidades', '/soluciones']) {
  test(`${ruta}: los fragmentos de muestra no se leen como datos del estudio`, async ({ page }) => {
    await page.goto(ruta, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
    const escenas = await page.locator('figure.hx-fig').evaluateAll(els => els.map(e => ({
      piezasOcultas: e.querySelector('.hx-fig-piezas')?.getAttribute('aria-hidden') === 'true',
      descripcion: (e.querySelector('figcaption')?.textContent ?? '').trim().length,
    })));
    expect(escenas.length).toBeGreaterThan(0);
    for (const e of escenas) {
      expect(e.piezasOcultas).toBe(true);
      expect(e.descripcion).toBeGreaterThan(40);
    }
  });

  test(`${ruta}: en un móvil no se sale de la pantalla`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ruta, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
    const [ancho, visible] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    expect(ancho, 'scroll horizontal').toBeLessThanOrEqual(visible);
  });
}

// Las páginas HIJAS llevan la misma cabecera que los índices y la home: la de «Producto» marca Producto y la de una solución, Soluciones.
for (const [ruta, activo] of [
  ['/funcionalidades/reservas-online', 'Producto'],
  ['/funcionalidades/sustituciones', 'Producto'],
  ['/soluciones/estudio-de-yoga', 'Soluciones'],
  ['/soluciones/cambiar-de-software', 'Soluciones'],
] as const) {
  test(`${ruta}: misma cabecera que la home, marca «${activo}» y tiene un solo h1`, async ({ page }) => {
    await page.goto(ruta, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1, { timeout: 60_000 });
    const menu = page.getByRole('navigation', { name: 'Principal', exact: true });
    await expect(menu.getByRole('link', { name: activo, exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('nav.v5-nav'), 'ya no queda la isla antigua').toHaveCount(0);
  });
}
