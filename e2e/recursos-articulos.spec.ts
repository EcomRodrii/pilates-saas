import { test, expect } from '@playwright/test';
import { ARTICULOS } from '../lib/recursos/articulos/index.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Los artículos de /recursos escritos como datos (lib/recursos/articulos):
// lo que de verdad sale por el cable para Google y para los buscadores con IA.
//  · <title>, meta description y canonical propios (no los del listado);
//  · un solo <h1>, la respuesta directa («En resumen») y la FAQ en el HTML;
//  · JSON-LD que se puede parsear: BlogPosting, FAQPage y BreadcrumbList;
//  · ningún enlace interno roto (cada uno responde 200);
//  · y el listado /recursos los enlaza.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(240_000);

// Uno por categoría basta para el renderizado; los enlaces se comprueban todos.
const MUESTRA = [...new Map(ARTICULOS.map((a) => [a.categoria, a])).values()];

for (const a of MUESTRA) {
  test(`«${a.slug}» sale completo en el HTML del servidor`, async ({ page }) => {
    const res = await page.goto(`/recursos/${a.slug}`, { waitUntil: 'domcontentloaded' });
    expect(res?.status()).toBe(200);
    await expect(page).toHaveTitle(`${a.tituloSeo} | Tentare`);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', a.descripcion);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`/recursos/${a.slug}$`));
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.getByRole('region', { name: 'En resumen' })).toBeVisible();
    await expect(page.locator('#preguntas-frecuentes')).toBeVisible();

    const tipos = await page.locator('script[type="application/ld+json"]').evaluateAll((els) =>
      els.map((e) => (JSON.parse(e.textContent ?? '{}') as { '@type'?: string })['@type']));
    for (const t of ['BlogPosting', 'FAQPage', 'BreadcrumbList']) expect(tipos, `JSON-LD ${t}`).toContain(t);
  });
}

test('ningún enlace interno de los artículos está roto', async ({ request }) => {
  // ~40 rutas: con `next dev` cada una se compila la primera vez que se pide,
  // y de una en una no cabían en el tiempo. De cuatro en cuatro sí.
  test.setTimeout(600_000);
  const rutas = new Set<string>();
  for (const a of ARTICULOS) {
    const textos = JSON.stringify(a);
    for (const m of textos.matchAll(/\]\((\/[^)\s#?]*)/g)) rutas.add(m[1]);
    a.relacionadas.forEach((r) => rutas.add(r));
  }
  const pendientes = [...rutas];
  const rotas: string[] = [];
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let r = pendientes.shift(); r; r = pendientes.shift()) {
      const res = await request.get(r, { maxRedirects: 3, timeout: 120_000 });
      if (res.status() >= 400) rotas.push(`${r} → ${res.status()}`);
    }
  }));
  expect(rotas.sort()).toEqual([]);
});

test('el listado /recursos enlaza a cada artículo', async ({ page }) => {
  await page.goto('/recursos', { waitUntil: 'domcontentloaded' });
  for (const a of ARTICULOS) {
    await expect(page.locator(`a[href="/recursos/${a.slug}"]`).first()).toBeAttached();
  }
});

test('la calculadora de rentabilidad arranca con el ejemplo del artículo y responde a los números', async ({ page }) => {
  await page.goto('/recursos/rentabilidad-estudio-de-pilates', { waitUntil: 'domcontentloaded' });
  const calc = page.getByRole('region', { name: 'Calculadora de rentabilidad' });
  // El escenario A de la tabla: equilibrio hacia el 53 %.
  await expect(calc).toContainText('53 %');
  // Rellenar antes de hidratar se pierde: se reintenta hasta que React lo recoge.
  await expect(async () => {
    await calc.getByLabel(/Ocupación media/).fill('70');
    await expect(calc).toContainText(/2\.?040 €/, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
});
