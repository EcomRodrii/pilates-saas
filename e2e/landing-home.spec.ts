import { test, expect, type Page } from '@playwright/test';

// La home nueva (nov-2026, el diseño de Figma): que se ve entera y sin desbordes, que la cabecera lleva el logotipo oficial y la
// navegación exacta y se comporta como la isla (se encoge al bajar y se alarga al subir), que el menú del móvil funciona, que el <h1>
// empieza por texto, que las preguntas son las reales (y las del JSON-LD), que las fotos cargan y que el pie solo enlaza lo que existe.

// Sin el popup de «Empezar gratis» por en medio (aparece al bajar por la página y taparía los clics): como en el resto de specs de la web.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tentare:intro-vista', String(Date.now()));
    localStorage.setItem('tentare:popup-empezar', JSON.stringify({ vistas: 1, ultimaVista: 1, cerradoEn: null, convertido: true }));
  });
});

/** Baja (o sube) `px` con el scroll del navegador: la rueda del ratón no existe en WebKit móvil. */
const desplazar = (page: Page, px: number) => page.evaluate(y => window.scrollBy(0, y), px);

async function hidratada(page: Page) {
  // El oyente de scroll y el menú los pone React al hidratar: hasta entonces la rueda y el botón no hacen nada.
  await page.waitForFunction(() => Object.keys(document.querySelector('.lf-hamburguesa') ?? {}).some(k => k.startsWith('__react')), null, { timeout: 60_000 });
  await page.waitForTimeout(400);
}

for (const [nombre, ancho, alto] of [['móvil', 390, 844], ['tableta', 820, 1180], ['escritorio', 1440, 900]] as const) {
  test(`${nombre}: la home se ve completa y sin desbordes`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: alto });
    const r = await page.goto('/', { waitUntil: 'load' });
    expect(r?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tu estudio sigue funcionando aunque sueltes el móvil.');
    for (const sel of ['.lf-heroe', '#funciones', '.lf-beneficios', '.lf-cta', '#precio', '#faq', '#contacto', 'footer.w-pie']) {
      await expect(page.locator(sel).first(), sel).toBeAttached();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'se sale de lado').toBeLessThanOrEqual(0);
    // El héroe ocupa todo el ancho.
    expect(await page.locator('.lf-heroe').evaluate(e => Math.round(e.getBoundingClientRect().width))).toBe(ancho);
  });
}

test('el <h1> empieza por texto en el HTML del servidor: la categoría en pequeño y la promesa dentro', async ({ page }) => {
  const html = await (await page.request.get('/')).text();
  expect(html).toMatch(/<h1[^>]*>\s*<span class="lf-h1-categoria">Software de gestión para estudios de Pilates y yoga<\/span>/);
  expect(html).toContain('Tu estudio sigue funcionando');
});

test('cabecera: logotipo oficial y navegación exacta, sin «Sobre nosotros»', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('.lf-cabecera a.lf-marca svg.t-logo')).toBeVisible();
  expect(await page.locator('.lf-cabecera .lf-menu a').allInnerTexts()).toEqual(['Inicio', 'Producto', 'Precios', 'Soluciones']);
  expect((await page.locator('.lf-cabecera').innerText()).toLowerCase()).not.toContain('sobre nosotros');
  await expect(page.locator('.lf-cabecera-barra .lf-acceso-empezar')).toHaveAttribute('href', '/crear-estudio');
  await expect(page.locator('.lf-cabecera-barra .lf-acceso-login')).toHaveAttribute('href', '/login');
});

test('cabecera: al bajar se encoge a logo + botón y al subir se alarga', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'load' });
  await hidratada(page);
  const barra = page.locator('.lf-cabecera-barra');
  await expect(barra).not.toHaveAttribute('data-compacta', /.*/);
  const ancho = async () => (await barra.boundingBox())!.width;
  const abierta = await ancho();
  for (let i = 0; i < 6; i++) { await desplazar(page, 250); await page.waitForTimeout(120); }
  await expect(barra).toHaveAttribute('data-compacta', '');
  await expect.poll(ancho).toBeLessThan(abierta * 0.6);
  for (let i = 0; i < 4; i++) { await desplazar(page, -250); await page.waitForTimeout(120); }
  await expect(barra).not.toHaveAttribute('data-compacta', /.*/);
  await expect.poll(ancho).toBeGreaterThan(abierta * 0.95);
});

test('móvil: el menú abre, se cierra con Esc y las fotos cargan', async ({ page }) => {
  const errores: string[] = [];
  page.on('pageerror', e => errores.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/', { waitUntil: 'load' });
  await hidratada(page);
  await page.getByRole('button', { name: 'Abrir el menú' }).click();
  await expect(page.getByRole('navigation', { name: 'Principal (móvil)' }).getByRole('link', { name: 'Soluciones' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Abrir el menú' })).toHaveAttribute('aria-expanded', 'false');
  // Todas las fotos (hierba, panel, alumnas, cobros, postura, meditación, retrato) salen de public/landing-nueva, con alt y cargadas.
  // Las fotos de más abajo son `loading="lazy"`: se piden todas, para no depender de cuánto tarda el recorrido.
  await page.$$eval('.lf picture img', ims => ims.forEach(i => { (i as HTMLImageElement).loading = 'eager'; }));
  await expect.poll(() => page.$$eval('.lf picture img', ims => ims.filter(i => !i.complete || i.naturalWidth === 0).map(i => i.currentSrc || i.src)), { message: 'fotos que no cargan', timeout: 30_000 }).toEqual([]);
  expect(await page.$$eval('.lf picture img', ims => ims.length)).toBeGreaterThanOrEqual(9);
  expect(await page.$$eval('.lf picture img', ims => ims.filter(i => !i.hasAttribute('alt')).length)).toBe(0);
  expect(errores).toEqual([]);
});

test('el héroe: la foto de fondo carga la primera, con prioridad, y «Pedir una demo» lleva a un sitio que existe', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  const fondo = page.locator('.lf-heroe .lf-fondo img');
  await expect(fondo).toHaveAttribute('fetchpriority', 'high');
  await expect(fondo).toHaveAttribute('loading', 'eager');
  const demo = page.locator('.lf-heroe').getByRole('link', { name: 'Pedir una demo' });
  expect(['/demo', '#contacto']).toContain(await demo.getAttribute('href'));
});

test('las preguntas son las reales: las del JSON-LD, enteras y con su respuesta en el HTML', async ({ page }) => {
  const html = await (await page.request.get('/')).text();
  const jsons = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
  const faq = jsons.flatMap(j => (Array.isArray(j) ? j : [j])).find(j => j?.['@type'] === 'FAQPage');
  expect(faq, 'falta el FAQPage del JSON-LD').toBeTruthy();
  const decodifica = (t: string) => t.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  for (const q of faq.mainEntity) {
    expect(decodifica(html), q.name).toContain(q.name);
    expect(decodifica(html), q.acceptedAnswer.text.slice(0, 40)).toContain(q.acceptedAnswer.text.slice(0, 40));
  }
  expect(faq.mainEntity.length).toBeGreaterThanOrEqual(8);
  // Nada de botones al alta dentro de las preguntas.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#faq a[href="/crear-estudio"]')).toHaveCount(0);
});

test('el pie solo enlaza lo que existe: Instagram y LinkedIn (ni Facebook ni X) y los enlaces reales de la web', async ({ page }) => {
  await page.goto('/', { waitUntil: 'load' });
  const pie = page.locator('footer.w-pie');
  await expect(pie.getByRole('link', { name: 'LinkedIn' })).toHaveAttribute('href', /linkedin\.com\/company\/tentare/);
  await expect(pie.getByRole('link', { name: 'Instagram' })).toHaveAttribute('href', /instagram\.com\/tentareapp/);
  const externos = await pie.locator('a[href^="http"]').evaluateAll(as => as.map(a => (a as HTMLAnchorElement).hostname));
  for (const h of externos) expect(h).not.toMatch(/facebook|twitter|x\.com/);
  await expect(pie.locator('[role="navigation"][aria-label="Mapa del sitio"]')).toHaveCount(1);
  expect((await pie.innerText()).toLowerCase()).not.toContain('sobre nosotros');
});

test('el formulario de contacto abre el correo con el mensaje (no hay servidor detrás) y avisa', async ({ page }) => {
  // Sin movimiento: el desplazamiento suave y la entrada al scroll mantienen el botón «no estable» y Playwright no lo pulsa.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(() => Object.keys(document.querySelector('form.lf-form') ?? {}).some(k => k.startsWith('__react')), null, { timeout: 60_000 });
  await page.getByLabel('Nombre', { exact: true }).fill('Prueba');
  // `mailto:` no navega: se intercepta para no abrir ningún cliente de correo.
  await page.evaluate(() => { (window as unknown as { __destino?: string }).__destino = ''; });
  await page.route(/^mailto:/, r => r.abort());
  await page.getByRole('button', { name: 'Pedir una demo' }).last().click();
  await expect(page.getByText('Se abre tu correo con el mensaje listo para enviar.')).toBeVisible();
});

test('todos los enlaces internos de la home responden 200', async ({ page, request, browserName }) => {
  test.skip(browserName === 'webkit', 'es una comprobación de servidor: con un motor basta');
  test.setTimeout(900_000);
  await page.goto('/', { waitUntil: 'load' });
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')!).filter(h => h.startsWith('/') && !h.startsWith('//')));
  const unicos = [...new Set(hrefs.map(h => h.split('#')[0]).filter(Boolean))];
  expect(unicos.length).toBeGreaterThan(20);
  const fallos: string[] = [];
  for (const h of unicos) {
    const r = await request.get(h, { timeout: 120_000, maxRedirects: 3 });
    if (r.status() >= 400) fallos.push(`${h} → ${r.status()}`);
  }
  expect(fallos).toEqual([]);
});
