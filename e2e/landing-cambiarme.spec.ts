import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// «Cambiarme a Tentare» en la cabecera y en el héroe de la landing (ronda 2,
// 19-oct-2026), y el héroe a 375 px.
//
// La mayoría de estudios ya paga otro programa: la página que cuenta cómo se
// cambia (/soluciones/cambiar-de-software) existía, pero desde arriba no se veía.
// Lo que fija esta spec es lo que un test unitario no ve porque depende del
// navegador: que la entrada quepa en la isla sin partir líneas, que ya encogida
// la isla siga enseñando el logo y el botón principal SIN recortes (el fallo de
// Bsport: «Iniciar sesión» partido en dos), que el segundo botón del héroe sea
// secundario (contorno) y que a 375 px el botón principal quede sobre el pliegue
// y la página no se salga de lado.
//
// ⚠️ Cada test lleva su control: una comprobación que no puede fallar no prueba
// nada. Los controles son lo que cambia al otro lado (la ruta inventada da 404,
// el estado expandido sí enseña lo que el encogido esconde, un elemento ancho
// SÍ provoca scroll lateral…).
//
// Pública y la sufre quien llega de Google desde el móvil: la parte móvil corre
// también en WebKit-iPhone (proyecto webkit-publico). La de escritorio, solo en
// Chromium (el iPhone no tiene isla ancha).
// ─────────────────────────────────────────────────────────────────────────────

const DESTINO = '/soluciones/cambiar-de-software';
const ENTRADA = 'Cambiarme a Tentare';
const BOTON_HEROE = 'Traer mis datos de otro programa';

const isla = (page: Page) => page.locator('nav.v5-nav');

async function prepararPagina(page: Page) {
  await page.addInitScript(() => {
    // Sin cortina del logo ni popup de «Empieza gratis» por en medio.
    localStorage.setItem('tentare:intro-vista', String(Date.now()));
    localStorage.setItem('tentare:popup-empezar', JSON.stringify({ vistas: 1, ultimaVista: 1, cerradoEn: null, convertido: true }));
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(isla(page)).toBeVisible();
}

/** Baja en escalones, como una rueda o un dedo: cada uno es un evento de scroll real. */
async function bajar(page: Page, hasta: number) {
  for (let y = 0; y < hasta; y += 40) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
  }
  await page.evaluate((v) => window.scrollTo(0, v), hasta);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
}

/** Cuántas líneas ocupa el texto de un elemento (rectángulos de línea distintos). */
const lineasDe = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel)!;
    const rg = document.createRange();
    rg.selectNodeContents(el);
    return new Set([...rg.getClientRects()].filter((q) => q.height > 2).map((q) => Math.round(q.top))).size;
  }, selector);

test.describe('«Cambiarme a Tentare» — escritorio', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'chromium', 'la isla ancha es de escritorio: el proyecto de iPhone solo cubre el móvil');
  });

  test('la isla trae la entrada, en una sola línea, y lleva a una página que existe', async ({ page }) => {
    await prepararPagina(page);
    const entrada = isla(page).getByRole('link', { name: ENTRADA });
    await expect(entrada).toBeVisible();
    await expect(entrada).toHaveAttribute('href', DESTINO);
    // No parte líneas: ni la entrada ni ninguna otra de la barra.
    expect(await lineasDe(page, 'nav.v5-nav .v5-nav-cambiarse')).toBe(1);
    const alturas = await isla(page).getByRole('link').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    expect(Math.max(...alturas)).toBeLessThan(48);

    // El destino existe de verdad…
    const ok = await page.request.get(DESTINO);
    expect(ok.status()).toBe(200);
    // …y el control: una ruta inventada NO lo da, así que el 200 de arriba dice algo.
    const falsa = await page.request.get(`${DESTINO}-que-no-existe`);
    expect(falsa.status()).toBe(404);

    await entrada.click();
    await expect(page).toHaveURL(new RegExp(`${DESTINO}$`));
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Cambiarte a Tentare');
  });

  test('ya encogida, la isla sigue con el logo y el botón principal, sin recortes', async ({ page }) => {
    await prepararPagina(page);
    const caja = async () => (await isla(page).boundingBox())!;

    // Control: expandida SÍ enseña la entrada y «Entrar»; si no, «encogida no los
    // enseña» no demostraría nada.
    await expect(isla(page)).not.toHaveAttribute('data-compacta', /.*/);
    await expect(isla(page).getByRole('link', { name: ENTRADA })).toBeVisible();
    await expect(isla(page).getByRole('link', { name: 'Entrar' })).toBeVisible();
    const anchoExpandida = (await caja()).width;

    await bajar(page, 900);
    await expect(isla(page)).toHaveAttribute('data-compacta', '');
    await expect.poll(async () => (await caja()).width).toBeLessThan(anchoExpandida - 150);

    // Lo que se esconde, escondido del todo (ni a la vista ni tabulable)…
    await expect(isla(page).getByRole('link', { name: ENTRADA })).toBeHidden();
    await expect(isla(page).getByRole('link', { name: 'Entrar' })).toBeHidden();
    // …y lo que queda, entero y dentro de la isla.
    const logo = isla(page).getByRole('link', { name: /Tentare.*inicio/ });
    const cta = isla(page).getByRole('link', { name: 'Empezar gratis' });
    await expect(logo).toBeVisible();
    await expect(cta).toBeVisible();
    const marco = await caja();
    for (const el of [logo, cta]) {
      const b = (await el.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(marco.x);
      expect(b.x + b.width).toBeLessThanOrEqual(marco.x + marco.width + 0.5);
    }
    // El botón no se parte en dos líneas ni recorta su texto (el fallo que se ve en Bsport).
    expect(await lineasDe(page, 'nav.v5-nav .v5-nav-cta')).toBe(1);
    const recortado = await cta.evaluate((e) => e.scrollWidth > e.clientWidth + 1);
    expect(recortado).toBe(false);
    // La isla entera sigue dentro de la ventana.
    expect(marco.x).toBeGreaterThanOrEqual(0);
    expect(marco.x + marco.width).toBeLessThanOrEqual(1440);
  });

  test('el segundo botón del héroe es secundario y lleva al mismo sitio', async ({ page }) => {
    await prepararPagina(page);
    const heroe = page.locator('header#top');
    const principal = heroe.locator('a.v5-hero-cta');
    const secundario = heroe.getByRole('link', { name: BOTON_HEROE });

    await expect(secundario).toBeVisible();
    await expect(secundario).toHaveAttribute('href', DESTINO);
    // El botón que empuja sigue siendo UNO, y es el del alta.
    await expect(principal).toHaveCount(1);
    await expect(principal).toHaveAttribute('href', '/crear-estudio');

    // Jerarquía: el principal va relleno; el secundario, de contorno y sin relleno.
    const estilo = (loc: typeof principal) => loc.evaluate((e) => {
      const cs = getComputedStyle(e);
      return { fondo: cs.backgroundColor, borde: parseFloat(cs.borderTopWidth) };
    });
    const ep = await estilo(principal);
    const es = await estilo(secundario);
    expect(ep.fondo).not.toBe('rgba(0, 0, 0, 0)'); // control: «relleno» se distingue de «transparente»
    expect(es.fondo).toBe('rgba(0, 0, 0, 0)');
    expect(es.borde).toBeGreaterThanOrEqual(1);
    // Va DESPUÉS del principal y no es más grande que él (no le roba el sitio).
    const bp = (await principal.boundingBox())!;
    const bs = (await secundario.boundingBox())!;
    expect(bs.y + bs.height).toBeGreaterThan(bp.y);
    expect(bs.width * bs.height).toBeLessThan(bp.width * bp.height * 2.5);
    // Nada de mosaico: el principal, este y el enlace de «Ver cómo funciona». Ni uno más.
    expect(await heroe.locator('.v5-hero-acciones > a').count()).toBe(3);
  });

  // Hasta la fase 2.1 (19-oct-2026) la entrada salía entre 761 y 1000 px. La isla
  // es ahora la de toda la web y lleva «Producto», «Soluciones» y «Recursos»: la
  // entrada se queda en la isla desde 1180 px (lo que mide con todo dentro) y,
  // por debajo, vive en el menú; por debajo de 1024 px TODO el menú va tras el botón.
  test('por debajo de 1180 px la entrada se quita y la isla no se sale de la pantalla', async ({ page }) => {
    await prepararPagina(page);
    // Control: a 1440 está y la isla cabe.
    await expect(isla(page).getByRole('link', { name: ENTRADA })).toBeVisible();
    for (const ancho of [800, 900, 1023, 1024, 1100, 1179]) {
      await page.setViewportSize({ width: ancho, height: 800 });
      await expect(isla(page).getByRole('link', { name: ENTRADA })).toBeHidden();
      const b = (await isla(page).boundingBox())!;
      expect(b.x, `a ${ancho}px la isla empieza dentro`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width, `a ${ancho}px la isla acaba dentro`).toBeLessThanOrEqual(ancho);
      await expect(isla(page).getByRole('link', { name: 'Empezar gratis' })).toBeVisible();
      // De 1024 en adelante el menú está en la isla; por debajo, tras el botón.
      if (ancho >= 1024) await expect(isla(page).getByRole('button', { name: 'Producto' })).toBeVisible();
      else await expect(isla(page).getByRole('button', { name: 'Abrir el menú' })).toBeVisible();
    }
    // Y a 1180 vuelve, en una línea, y cabe.
    await page.setViewportSize({ width: 1180, height: 800 });
    await expect(isla(page).getByRole('link', { name: ENTRADA })).toBeVisible();
    expect(await lineasDe(page, 'nav.v5-nav .v5-nav-cambiarse')).toBe(1);
    const b = (await isla(page).boundingBox())!;
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(1180);
  });
});

test.describe('«Cambiarme a Tentare» y el héroe — móvil', () => {
  test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

  test('el menú móvil trae la entrada y lleva a la página', async ({ page }) => {
    await prepararPagina(page);
    // Control: en la barra de arriba, en móvil, la entrada NO está (los enlaces viven en el menú).
    await expect(isla(page).getByRole('link', { name: ENTRADA })).toBeHidden();

    await page.getByRole('button', { name: 'Abrir el menú' }).click();
    const menu = page.getByRole('dialog', { name: 'Menú' });
    await expect(menu).toBeVisible();
    // Control: es el menú de siempre (trae los otros enlaces).
    await expect(menu.getByRole('link', { name: 'Precios' })).toBeVisible();
    const entrada = menu.getByRole('link', { name: ENTRADA });
    await expect(entrada).toBeVisible();
    await expect(entrada).toHaveAttribute('href', DESTINO);
    // Cabe en pantalla y en una línea a 375 px.
    const b = (await entrada.boundingBox())!;
    expect(b.x + b.width).toBeLessThanOrEqual(375);
    await entrada.click();
    await expect(page).toHaveURL(new RegExp(`${DESTINO}$`));
  });

  test('a 375 px el botón principal queda sobre el pliegue, hay un segundo botón y nada se sale de lado', async ({ page }) => {
    await prepararPagina(page);
    // Control: el viewport es el que decimos.
    expect(await page.evaluate(() => innerWidth)).toBe(375);
    const vh = await page.evaluate(() => innerHeight);

    const heroe = page.locator('header#top');
    const principal = heroe.locator('a.v5-hero-cta');
    const secundario = heroe.getByRole('link', { name: BOTON_HEROE });
    await expect(principal).toBeVisible();
    await expect(secundario).toBeVisible();
    const bp = (await principal.boundingBox())!;
    const bs = (await secundario.boundingBox())!;
    // Los dos botones, enteros, sobre el pliegue; el principal primero.
    expect(bp.y + bp.height).toBeLessThanOrEqual(vh);
    expect(bs.y + bs.height).toBeLessThanOrEqual(vh);
    expect(bs.y).toBeGreaterThan(bp.y + bp.height - 1);
    // El secundario cabe a lo ancho y en una línea.
    expect(bs.x).toBeGreaterThanOrEqual(0);
    expect(bs.x + bs.width).toBeLessThanOrEqual(375);
    expect(await lineasDe(page, '.v5-hero-secundario')).toBe(1);

    // El titular, el de siempre y dentro de sus cuatro líneas.
    const lineasPromesa = await lineasDe(page, '.v5-hero-promesa');
    expect(lineasPromesa).toBeGreaterThanOrEqual(2); // control: de verdad se parte y se mide
    expect(lineasPromesa).toBeLessThanOrEqual(4);

    // Nada del texto del héroe ni de la isla se sale por la derecha. ⚠️ `scrollWidth` no vale aquí:
    // el body lleva `overflow-x: clip` (globals.css) y en Chromium la página nunca se ensancha,
    // así que mediría 0 aunque algo se saliera. Se mide cada caja contra la ventana.
    const desborde = () => page.evaluate(() => {
      const cajas = [...document.querySelectorAll('nav.v5-nav, nav.v5-nav *, .v5-hero-texto, .v5-hero-texto *')];
      return Math.max(...cajas.map((e) => e.getBoundingClientRect().right)) - innerWidth;
    });
    expect(await desborde()).toBeLessThanOrEqual(0.5);
    // …y el control: una caja más ancha que la pantalla dentro del texto SÍ da desborde, así que la medida puede fallar.
    await page.evaluate(() => {
      const d = document.createElement('div');
      d.id = 'control-ancho';
      d.style.cssText = 'width:600px;height:1px';
      document.querySelector('.v5-hero-texto')!.appendChild(d);
    });
    expect(await desborde()).toBeGreaterThan(0);
    await page.evaluate(() => document.getElementById('control-ancho')?.remove());
  });

  test('ya encogida, la isla en móvil sigue con el logo y el botón principal', async ({ page }) => {
    await prepararPagina(page);
    const cta = isla(page).getByRole('link', { name: 'Empezar gratis' });
    const logo = isla(page).getByRole('link', { name: /Tentare.*inicio/ });
    await expect(isla(page)).not.toHaveAttribute('data-compacta', /.*/);
    await expect(logo).toBeVisible();
    await expect(cta).toBeVisible();

    await bajar(page, 900);
    await expect(isla(page)).toHaveAttribute('data-compacta', '');
    await expect(logo).toBeVisible();
    await expect(cta).toBeVisible();
    const marco = (await isla(page).boundingBox())!;
    for (const el of [logo, cta]) {
      const b = (await el.boundingBox())!;
      expect(b.x).toBeGreaterThanOrEqual(marco.x);
      expect(b.x + b.width).toBeLessThanOrEqual(marco.x + marco.width + 0.5);
    }
    expect(await lineasDe(page, 'nav.v5-nav .v5-nav-cta')).toBe(1);
    expect(await cta.evaluate((e) => e.scrollWidth > e.clientWidth + 1)).toBe(false);
    expect(marco.x).toBeGreaterThanOrEqual(0);
    expect(marco.x + marco.width).toBeLessThanOrEqual(375);
  });
});
