import { test, expect, type Page } from '@playwright/test';

// El blog personal del fundador (/blog, /blog/marcos-roca, /blog/marcos-roca/<slug>): que esté, que se vea bien en móvil y
// escritorio, que lo que lee Google (canonical, JSON-LD, sitemap, robots, RSS) diga lo que debe, que un borrador no
// salga nunca, y que lo que ya existía —las guías de /recursos, /sobre-tentare— no se rompa.

test.describe.configure({ timeout: 120_000 });

const SLUG = 'marcos-roca-rodriguez-quien-es-el-fundador-de-tentare';
const ARTICULO = `/blog/marcos-roca/${SLUG}`;
const BORRADOR = '/blog/marcos-roca/por-que-decidi-construir-tentare';
const ORIGEN = 'https://www.tentare.app';

async function jsonLd(page: Page): Promise<any[]> {
  const textos = await page.locator('script[type="application/ld+json"]').allTextContents();
  return textos.map((t) => JSON.parse(t)).flatMap((d) => (d['@graph'] ? d['@graph'] : [d]));
}
const sinDesborde = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { localStorage.setItem('tentare:popup-empezar', JSON.stringify({ vistas: 1, ultimaVista: 1, cerradoEn: null, convertido: true })); } catch { /* sin almacenamiento */ }
  });
});

test('/blog: el listado, su canonical, su RSS y el artículo destacado llevan al artículo', async ({ page }) => {
  const r = await page.goto('/blog', { waitUntil: 'domcontentloaded' });
  expect(r?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Blog de Marcos Roca Rodríguez');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${ORIGEN}/blog`);
  await expect(page.locator('link[rel="alternate"][type="application/rss+xml"]')).toHaveAttribute('href', `${ORIGEN}/blog/feed.xml`);
  await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
  const nodos = await jsonLd(page);
  expect(nodos.map((n) => n['@type'])).toEqual(expect.arrayContaining(['Blog', 'BreadcrumbList']));
  const blog = nodos.find((n) => n['@type'] === 'Blog');
  expect(blog.blogPost).toHaveLength(1);
  await expect(page.getByRole('link', { name: 'Sobre el autor' })).toHaveAttribute('href', '/blog/marcos-roca');
  await page.getByRole('link', { name: /quién es el fundador de Tentare/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`${SLUG}$`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText('quién es el fundador de Tentare');
});

test('página de autor: nombre, foto cargada, Person con @id estable y solo enlaces que constan', async ({ page }) => {
  await page.goto('/blog/marcos-roca', { waitUntil: 'load' });
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Marcos Roca Rodríguez');
  await expect(page.getByText('Fundador de Tentare').first()).toBeVisible();
  await expect(page.getByText('Barcelona, España')).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${ORIGEN}/blog/marcos-roca`);
  const foto = page.locator('picture img').first();
  await expect(foto).toHaveAttribute('alt', /Marcos Roca Rodríguez/);
  await expect.poll(() => foto.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0);
  const nodos = await jsonLd(page);
  const persona = nodos.find((n) => n['@type'] === 'Person');
  expect(persona['@id']).toBe(`${ORIGEN}/blog/marcos-roca#persona`);
  expect(persona.name).toBe('Marcos Roca Rodríguez');
  expect(persona.worksFor).toEqual({ '@id': `${ORIGEN}/#organizacion` });
  expect(persona.sameAs, 'sin perfil personal verificado no hay sameAs').toBeUndefined();
  expect(nodos.some((n) => n['@type'] === 'ProfilePage')).toBe(true);
  // Los únicos enlaces externos son los de la empresa: nada de perfiles inventados.
  const externos = await page.locator('main a[href^="http"]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
  for (const h of externos) expect(h).toMatch(/^https:\/\/www\.linkedin\.com\/company\/tentare\/?$/);
});

test('artículo: miga, índice con anclas, FAQ visible = FAQ del JSON-LD, firma y compartir', async ({ page }) => {
  await page.goto(ARTICULO, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${ORIGEN}${ARTICULO}`);
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute('content', 'article');
  await expect(page.locator('nav[aria-label="Migas de pan"] a')).toHaveText(['Inicio', 'Blog', 'Marcos Roca Rodríguez']);
  await expect(page.locator('a[rel="author"]').first()).toHaveAttribute('href', '/blog/marcos-roca');
  await expect(page.locator('time').first()).toHaveAttribute('datetime', '2026-11-05');
  // El índice: cada ancla existe.
  const anclas = await page.locator('.bl-toc a').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')!));
  expect(anclas.length).toBeGreaterThanOrEqual(3);
  for (const href of anclas) await expect(page.locator(href)).toHaveCount(1);
  // FAQ: lo que se ve es lo que declara el JSON-LD.
  const visibles = await page.locator('.afaq-q span:first-child').allTextContents();
  const nodos = await jsonLd(page);
  const faq = nodos.find((n) => n['@type'] === 'FAQPage');
  expect(faq.mainEntity.map((q: any) => q.name)).toEqual(visibles.map((t) => t.trim()));
  const post = nodos.find((n) => n['@type'] === 'BlogPosting');
  expect(post.author).toEqual({ '@id': `${ORIGEN}/blog/marcos-roca#persona` });
  expect(post.publisher).toEqual({ '@id': `${ORIGEN}/#organizacion` });
  expect(post.datePublished).toBe('2026-11-05');
  const migas = nodos.find((n) => n['@type'] === 'BreadcrumbList');
  expect(migas.itemListElement).toHaveLength(4);
  for (const red of ['LinkedIn', 'X', 'WhatsApp', 'Correo']) await expect(page.getByRole('link', { name: `Compartir en ${red}` })).toBeVisible();
});

test('un borrador no existe: 404 y fuera del sitemap y del RSS', async ({ page, request }) => {
  const r = await page.goto(BORRADOR, { waitUntil: 'domcontentloaded' });
  expect(r?.status()).toBe(404);
  const rss = await request.get('/blog/feed.xml');
  expect(rss.status()).toBe(200);
  expect(rss.headers()['content-type']).toContain('application/rss+xml');
  const xml = await rss.text();
  expect(xml).toContain(SLUG);
  expect(xml).not.toContain('por-que-decidi');
  const mapa = await (await request.get('/sitemap.xml')).text();
  for (const ruta of ['/blog</loc>', '/blog/marcos-roca</loc>', `${SLUG}</loc>`]) expect(mapa).toContain(ruta);
  expect(mapa).not.toContain('por-que-decidi');
  const robots = await (await request.get('/robots.txt')).text();
  expect(robots).not.toMatch(/Disallow:\s*\/blog/);
});

test('lo que ya existía sigue: las guías enlazan al autor y /sobre-tentare delega la persona en su página', async ({ page }) => {
  await page.goto('/recursos/precio-clase-de-pilates', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.art-byline a[href="/blog/marcos-roca"]')).toContainText('Marcos Roca Rodríguez');
  const guia = (await jsonLd(page)).find((n) => n['@type'] === 'BlogPosting');
  expect(guia.author['@id']).toBe(`${ORIGEN}/blog/marcos-roca#persona`);
  await page.goto('/sobre-tentare', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const nodos = await jsonLd(page);
  expect(nodos.some((n) => n['@type'] === 'Person'), '/sobre-tentare ya no define una segunda persona').toBe(false);
  expect(nodos.find((n) => n['@type'] === 'Organization').founder).toEqual({ '@id': `${ORIGEN}/blog/marcos-roca#persona` });
  await expect(page.locator('a[href="/blog/marcos-roca"]').first()).toBeVisible();
});

for (const [nombre, ancho, alto] of [['móvil', 390, 844], ['tableta', 768, 1024], ['escritorio', 1440, 900]] as const) {
  test(`${nombre}: ninguna página del blog desborda de ancho y el contenido se ve`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: alto });
    for (const ruta of ['/blog', '/blog/marcos-roca', ARTICULO]) {
      await page.goto(ruta, { waitUntil: 'load' });
      expect(await sinDesborde(page), `${ruta} a ${ancho}px`).toBeLessThanOrEqual(1);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });
}
