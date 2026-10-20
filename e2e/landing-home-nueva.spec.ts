import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La home nueva (fase 2.2, 19-oct-2026): lo que solo se ve en un navegador.
//  · El héroe: un solo h1, que empieza por texto, y el botón principal entero
//    sobre el pliegue a 375 × 812 (bsport lo pierde; nosotros no).
//  · Las pestañas por resultado se manejan con el teclado (flechas, Inicio, Fin)
//    y cada panel enlaza a su página de función.
//  · Todos los enlaces internos de la home responden 200.
//  · Nada se sale de lado en cinco anchos (360, 768, 1024, 1440 y 1920).
// Cada comprobación lleva su control: una que no puede fallar no prueba nada.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(240_000);

async function abrir(page: Page, ancho: number, alto = 900) {
  await page.setViewportSize({ width: ancho, height: alto });
  await page.addInitScript(() => {
    localStorage.setItem('tentare:intro-vista', String(Date.now()));
    localStorage.setItem('tentare:popup-empezar', JSON.stringify({ vistas: 1, ultimaVista: 1, cerradoEn: null, convertido: true }));
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
}

test('el héroe: un solo h1, con la categoría, la promesa y los dos botones', async ({ page }) => {
  await abrir(page, 1440);
  await expect(page.locator('h1')).toHaveCount(1);
  const h1 = page.locator('header#top h1');
  await expect(h1).toContainText('Software de gestión para estudios de Pilates y yoga');
  await expect(h1).toContainText('Todo tu estudio. Bajo control.');
  const principal = page.locator('header#top a.v5-hero-cta');
  await expect(principal).toHaveAttribute('href', '/crear-estudio');
  await expect(principal).toHaveText('Empezar gratis');
  await expect(page.locator('header#top').getByRole('link', { name: 'Cambiarme a Tentare' })).toHaveAttribute('href', '/soluciones/cambiar-de-software');
  // La foto a sangre es la única con prioridad; los fragmentos van encima.
  await expect(page.locator('header#top .wh-heroe-foto img')).toHaveAttribute('fetchpriority', 'high');
  await expect(page.locator('header#top .wh-heroe-escena figcaption')).toHaveCount(1);
});

test('a 375 × 812, el botón principal y el secundario, enteros sobre el pliegue y a todo el ancho', async ({ page }) => {
  await abrir(page, 375, 812);
  const p = (await page.locator('header#top a.v5-hero-cta').boundingBox())!;
  const s = (await page.locator('header#top a.v5-hero-secundario').boundingBox())!;
  expect(p.y + p.height).toBeLessThanOrEqual(812);
  expect(s.y + s.height).toBeLessThanOrEqual(812);
  expect(p.width).toBeGreaterThan(300); // a todo el ancho (343 con el margen de 16)
  // CONTROL: el pie de la página sí está bajo el pliegue, así que la medida distingue.
  const pie = (await page.locator('footer').first().boundingBox())!;
  expect(pie.y).toBeGreaterThan(812);
});

test('las pestañas: con teclado, una seleccionada cada vez y su panel con su enlace', async ({ page }) => {
  await abrir(page, 1440);
  const lista = page.getByRole('tablist', { name: 'Áreas de Tentare' });
  const tabs = lista.getByRole('tab');
  await expect(tabs).toHaveText(['Reservas', 'Cobros', 'Alumnas', 'Equipo', 'Informes']);
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  // Hasta que React hidrata, los botones no responden: un clic que cambia la pestaña lo demuestra.
  await expect(async () => {
    await tabs.nth(2).click();
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 60_000 });
  await tabs.nth(0).click();
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await tabs.nth(0).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByRole('tabpanel').filter({ visible: true })).toHaveCount(1);
  await expect(page.getByRole('tabpanel').filter({ visible: true }).getByRole('link', { name: /cobros recurrentes/i })).toHaveAttribute('href', '/funcionalidades/cobros-recurrentes');
  await page.keyboard.press('End');
  await expect(tabs.nth(4)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight'); // vuelve a la primera
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft'); // y da la vuelta hacia atrás
  await expect(tabs.nth(4)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
  // Solo la activa entra en el orden de tabulación.
  expect(await tabs.evaluateAll((ts) => ts.map((t) => t.getAttribute('tabindex')))).toEqual(['0', '-1', '-1', '-1', '-1']);
  // Todos los paneles están en el HTML (los inactivos ocultos): el buscador los lee.
  await expect(page.locator('[role="tabpanel"]')).toHaveCount(5);
});

test('todos los enlaces internos de la home responden 200', async ({ page, request }) => {
  // Con `next dev` cada ruta se compila la primera vez que se pide: un margen amplio.
  test.setTimeout(1_200_000);
  await abrir(page, 1440);
  const hrefs = await page.locator('a[href^="/"]').evaluateAll((as) =>
    [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!.split('#')[0]).filter((h) => h && !h.startsWith('//')))]);
  expect(hrefs.length).toBeGreaterThan(40);
  const malos: string[] = [];
  for (const h of hrefs) {
    const r = await request.get(h, { timeout: 300_000, maxRedirects: 0 });
    if (r.status() !== 200) malos.push(`${h} → ${r.status()}`);
  }
  expect(malos).toEqual([]);
  // CONTROL: una ruta que no existe no da 200.
  expect((await request.get('/funcionalidades/no-existe', { timeout: 120_000 })).status()).toBe(404);
});

/** Lo que sobresale a la derecha de la ventana, sin contar lo que recorta a propósito un contenedor. */
function desbordeDerecho(page: Page) {
  return page.evaluate(() => {
    const ancho = document.documentElement.clientWidth;
    const recortado = (el: Element) => {
      // Se sube hasta `.wh` sin contarla: su `overflow-x: clip` es justo lo que esconde un desborde de verdad.
      for (let n = el.parentElement; n && !n.classList.contains('wh'); n = n.parentElement) {
        const o = getComputedStyle(n);
        if (/(hidden|clip|auto|scroll)/.test(o.overflowX) && n.getBoundingClientRect().right <= ancho + 0.5) return true;
      }
      return false;
    };
    let peor = 0;
    let quien = '';
    // El pie no es de esta fase (lo sustituye el pie común de la fase 2.1): se mide la home.
    for (const el of document.querySelectorAll('.wh *:not(footer, footer *)')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const exceso = r.right - ancho;
      if (exceso > peor && !recortado(el)) { peor = exceso; quien = `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`; }
    }
    return { peor, quien };
  });
}

for (const ancho of [360, 768, 1024, 1440, 1920]) {
  test(`a ${ancho} px nada se sale por la derecha`, async ({ page }) => {
    await abrir(page, ancho);
    const alto = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < alto; y += 800) await page.evaluate((v) => window.scrollTo(0, v), y);
    const { peor, quien } = await desbordeDerecho(page);
    expect(peor, `sobresale ${quien}`).toBeLessThanOrEqual(1);
    if (ancho === 360) {
      // CONTROL: una caja más ancha que la ventana dentro de la home SÍ da desborde.
      await page.evaluate(() => { const d = document.createElement('div'); d.style.cssText = 'width:900px;height:2px'; document.querySelector('#te-suena')!.appendChild(d); });
      expect((await desbordeDerecho(page)).peor).toBeGreaterThan(1);
    }
  });
}
