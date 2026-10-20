import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Un solo armazón para toda la web pública (fase 2.1, 19-oct-2026): la isla de
// vidrio arriba y el mismo pie abajo, en la home, en las interiores, en las
// legales y en los artículos. Antes había tres cabeceras y tres pies.
//
// Lo que fija esta spec es lo que un unitario no ve: que la isla y el pie estén
// de verdad en cada tipo de página (y los antiguos no), que el menú «Producto»
// se maneje con el teclado, que cada enlace del menú y del pie responda 200, que
// nada se salga de lado de 360 a 1440 px y que el texto del pie llegue a AA.
//
// ⚠️ Cada test lleva su control: una comprobación que no puede fallar no prueba nada.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(240_000);

const PAGINAS = [
  { nombre: 'home', path: '/' },
  { nombre: 'interior', path: '/funcionalidades/reservas-online' },
  { nombre: 'legal', path: '/privacidad' },
  { nombre: 'artículo', path: '/recursos/cuanto-cuesta-abrir-un-estudio-de-pilates' },
];

const isla = (page: Page) => page.locator('nav.v5-nav');

async function abrir(page: Page, path: string) {
  await page.addInitScript(() => {
    localStorage.setItem('tentare:intro-vista', String(Date.now()));
    localStorage.setItem('tentare:popup-empezar', JSON.stringify({ vistas: 1, ultimaVista: 1, cerradoEn: null, convertido: true }));
  });
  await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  await expect(isla(page)).toBeVisible();
  // El HTML llega antes que React: hasta que la isla hidrata, ni encoge al bajar
  // ni abre un panel, y la prueba fallaría por llegar pronto (con `next dev`
  // compilando, segundos). React marca cada nodo hidratado con `__reactFiber…`.
  await expect.poll(() => page.evaluate(() => {
    const nav = document.querySelector('nav.v5-nav');
    return Boolean(nav && Object.keys(nav).some((k) => k.startsWith('__reactFiber')));
  }), { timeout: 60_000 }).toBe(true);
}

for (const p of PAGINAS) {
  test(`${p.nombre} (${p.path}): la isla y el pie de toda la web, y ni rastro de los antiguos`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await abrir(page, p.path);
    await expect(page.getByRole('navigation', { name: 'Principal' })).toHaveCount(1);
    const cta = isla(page).getByRole('link', { name: 'Empezar gratis' });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute('href', '/crear-estudio');
    await expect(isla(page).getByRole('button', { name: 'Producto' })).toBeVisible();
    await expect(page.locator('footer.w-pie')).toHaveCount(1);
    // Los antiguos: la barra de las interiores, su pie, el pie de la home y la cabecera legal.
    await expect(page.locator('.sitenav, footer.sf, footer.v5-pie')).toHaveCount(0);
    await expect(page.getByText('← Volver a Tentare')).toHaveCount(0);
    // CONTROL: el localizador de los antiguos sí encuentra algo cuando lo hay.
    await page.evaluate(() => document.body.insertAdjacentHTML('beforeend', '<nav class="sitenav" id="control-sitenav"></nav>'));
    await expect(page.locator('.sitenav, footer.sf, footer.v5-pie')).toHaveCount(1);
    await page.evaluate(() => document.getElementById('control-sitenav')?.remove());

    // Sigue pegada arriba al bajar (sticky dentro de su contenedor), encogida.
    for (let y = 0; y <= 1500; y += 60) await page.evaluate((v) => window.scrollTo(0, v), y);
    await expect(isla(page)).toHaveAttribute('data-compacta', '');
    const b = (await isla(page).boundingBox())!;
    expect(b.y).toBeGreaterThanOrEqual(10);
    expect(b.y).toBeLessThanOrEqual(18);
    await expect(cta).toBeVisible();
  });
}

test('el menú «Producto» se abre y se cierra con el teclado, y cuelga del ancho de la isla', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await abrir(page, '/funcionalidades/reservas-online');
  const boton = isla(page).getByRole('button', { name: 'Producto' });
  const panel = isla(page).getByRole('region', { name: 'Producto' });
  // CONTROL: cerrado de entrada.
  await expect(boton).toHaveAttribute('aria-expanded', 'false');
  await expect(panel).toBeHidden();

  await boton.focus();
  await page.keyboard.press('Enter');
  await expect(boton).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Reservas online' })).toBeVisible();
  // Las cinco áreas por resultado.
  for (const area of ['Reservas y horario', 'Cobros, bonos y cuotas', 'Alumnas y app', 'Equipo y sustituciones', 'Informes y control']) {
    await expect(panel.getByText(area, { exact: true })).toBeVisible();
  }
  // Mismo ancho que la píldora.
  const bi = (await isla(page).boundingBox())!;
  const bp = (await panel.boundingBox())!;
  expect(Math.abs(bp.width - bi.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(bp.x - bi.x)).toBeLessThanOrEqual(1);
  // Con Tab, del botón se entra en sus enlaces.
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.activeElement?.closest('[role="region"]')?.getAttribute('aria-label'))).toBe('Producto');
  // Foco visible en el enlace enfocado.
  const contorno = await page.evaluate(() => getComputedStyle(document.activeElement as Element).outlineStyle);
  expect(contorno).not.toBe('none');

  // Esc lo cierra y devuelve el foco al botón.
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(boton).toHaveAttribute('aria-expanded', 'false');
  await expect(boton).toBeFocused();

  // Espacio lo abre también; un clic fuera lo cierra.
  await page.keyboard.press('Space');
  await expect(panel).toBeVisible();
  await page.mouse.click(20, 600);
  await expect(panel).toBeHidden();
});

test('en móvil el menú a pantalla completa trae el mismo contenido y Esc lo cierra', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await abrir(page, '/privacidad');
  // CONTROL: a 375 px los enlaces no están en la píldora.
  await expect(isla(page).getByRole('button', { name: 'Producto' })).toBeHidden();
  const burger = page.getByRole('button', { name: 'Abrir el menú' });
  const caja = (await burger.boundingBox())!;
  expect(caja.width).toBeGreaterThanOrEqual(44);
  expect(caja.height).toBeGreaterThanOrEqual(44);
  await burger.click();
  const menu = page.getByRole('dialog', { name: 'Menú' });
  await expect(menu).toBeVisible();
  for (const seccion of ['Producto', 'Soluciones', 'Recursos']) await expect(menu.getByRole('button', { name: seccion })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Precios' })).toHaveAttribute('href', '/precios');
  await menu.getByRole('button', { name: 'Producto' }).click();
  await expect(menu.getByRole('link', { name: 'Lista de espera' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Empezar gratis' })).toHaveAttribute('href', '/crear-estudio');
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(burger).toBeFocused();
});

test('todos los enlaces internos del menú y del pie responden 200', async ({ page, request }) => {
  // Más de 40 páginas una tras otra: con `next dev` cada una se compila la primera vez.
  test.setTimeout(900_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await abrir(page, '/glosario');
  // Los paneles cerrados están en el HTML (con `hidden`): se leen del DOM.
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('nav.v5-nav a[href], footer.w-pie a[href]')]
    .map((a) => a.getAttribute('href')!)
    .filter((h) => h.startsWith('/')));
  const unicos = [...new Set(hrefs)];
  // CONTROL de cobertura: el menú y el pie juntos pasan de 40 destinos.
  expect(unicos.length).toBeGreaterThan(40);
  const fallos: string[] = [];
  for (const h of unicos) {
    const r = await request.get(h, { timeout: 300_000, maxRedirects: 0 });
    if (r.status() !== 200) fallos.push(`${h} → ${r.status()}`);
  }
  expect(fallos).toEqual([]);
  // CONTROL: una ruta inventada no da 200, así que los 200 de arriba dicen algo.
  expect((await request.get('/funcionalidades/no-existe-esta')).status()).toBe(404);
});

for (const ancho of [360, 375, 768, 1024, 1440]) {
  test(`a ${ancho} px nada del armazón se sale de lado`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    for (const p of PAGINAS) {
      await abrir(page, p.path);
      // ⚠️ `scrollWidth` solo no basta (el body lleva `overflow-x: clip`): se mide cada caja del armazón.
      const desborde = () => page.evaluate(() => {
        const cajas = [...document.querySelectorAll('nav.v5-nav, nav.v5-nav *, footer.w-pie, footer.w-pie *')]
          .filter((e) => getComputedStyle(e).display !== 'none');
        return Math.max(...cajas.map((e) => e.getBoundingClientRect().right), document.documentElement.scrollWidth) - innerWidth;
      });
      expect(await desborde(), `${p.path} a ${ancho} px`).toBeLessThanOrEqual(0.5);
    }
    // CONTROL: una caja más ancha que la pantalla dentro del pie SÍ da desborde.
    await page.evaluate(() => document.querySelector('footer.w-pie')!.insertAdjacentHTML('beforeend', '<div style="width:2400px;height:1px"></div>'));
    const conControl = await page.evaluate(() => Math.max(...[...document.querySelectorAll('footer.w-pie *')].map((e) => e.getBoundingClientRect().right)) - innerWidth);
    expect(conControl).toBeGreaterThan(0);
  });
}

test('todo el texto del pie llega a AA (4,5:1) sobre su fondo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await abrir(page, '/');
  const medir = () => page.evaluate(() => {
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const pie = document.querySelector('footer.w-pie') as HTMLElement;
    const fondo = lum(rgb(getComputedStyle(pie).backgroundColor));
    const peores: { texto: string; ratio: number }[] = [];
    for (const el of pie.querySelectorAll('*')) {
      const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
      if (!propio) continue;
      const l = lum(rgb(getComputedStyle(el).color));
      const ratio = (Math.max(l, fondo) + 0.05) / (Math.min(l, fondo) + 0.05);
      peores.push({ texto: el.textContent!.trim().slice(0, 40), ratio: Math.round(ratio * 100) / 100 });
    }
    return peores.sort((a, b) => a.ratio - b.ratio);
  });
  const medidas = await medir();
  expect(medidas.length).toBeGreaterThan(30);
  expect(medidas.filter((m) => m.ratio < 4.5)).toEqual([]);
  // CONTROL: el gris del pie antiguo (2,76:1 sobre negro) sí lo caza.
  await page.evaluate(() => document.querySelector('footer.w-pie')!.insertAdjacentHTML('beforeend', '<span style="color:#3a3d33">control</span>'));
  expect((await medir()).some((m) => m.texto === 'control' && m.ratio < 4.5)).toBe(true);
});
