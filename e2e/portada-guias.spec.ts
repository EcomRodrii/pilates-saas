import { test, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La portada enlaza las guías de /recursos (components/landing/SeccionGuias).
//  · Las seis guías y «Ver todas» están en el HTML del SERVIDOR: es lo que
//    rastrea Google, y la portada es la página con más autoridad del dominio.
//  · Y el texto de los artículos NO viaja en el JavaScript de la home: la
//    sección es de servidor a propósito; si alguien la importa desde el
//    cliente, este test lo caza.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

test('la portada enlaza seis guías y el listado, en el HTML del servidor', async ({ request }) => {
  const res = await request.get('/');
  expect(res.status()).toBe(200);
  const html = await res.text();
  const seccion = html.slice(html.indexOf('id="guias"'));
  expect(html).toContain('id="guias"');
  const enlaces = [...seccion.matchAll(/href="(\/recursos\/[a-z0-9-]+)"/g)].map((m) => m[1]);
  expect(new Set(enlaces).size).toBeGreaterThanOrEqual(6);
  expect(seccion).toContain('href="/recursos"');
});

test('el texto de las guías no viaja en el JavaScript de la home', async ({ page }) => {
  const scripts: string[] = [];
  page.on('response', async (r) => {
    if (r.request().resourceType() === 'script' && r.ok()) scripts.push(await r.text().catch(() => ''));
  });
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('#guias')).toBeVisible();
  expect(scripts.length).toBeGreaterThan(0);
  // Frases del cuerpo de dos artículos que no salen en la tarjeta.
  for (const frase of ['Elina Pilates Aluminum HL1', 'Consulta vinculante DGT V2661-14']) {
    expect(scripts.some((s) => s.includes(frase)), `«${frase}» está en el JS de la home`).toBe(false);
  }
});
