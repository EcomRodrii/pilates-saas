import { test, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La portada enlaza las guías de /recursos. Desde la home v2 (20-oct-2026) no hay
// banda de guías (el blog está en el menú): las enlazan la etapa «Voy a abrir mi
// estudio», el panel «Recursos» de la isla y el pie.
//  · Esos enlaces y el del listado están en el HTML del SERVIDOR: es lo que
//    rastrea Google, y la portada es la página con más autoridad del dominio.
//  · Y el texto de los artículos NO viaja en el JavaScript de la home ni del
//    listado: el cliente solo ve lib/recursos/articulos/meta.ts. Pasó con el
//    lote 1 (el registro SEO importaba los artículos enteros); si vuelve, este
//    test lo caza.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

test('la portada enlaza al menos tres guías y el listado, en el HTML del servidor', async ({ request }) => {
  const res = await request.get('/');
  expect(res.status()).toBe(200);
  const html = await res.text();
  const enlaces = [...html.matchAll(/href="(\/recursos\/[a-z0-9-]+)"/g)].map((m) => m[1]);
  expect(new Set(enlaces).size).toBeGreaterThanOrEqual(3);
  expect(html).toContain('href="/recursos"');
});

// Frases del cuerpo de dos artículos que no salen en ninguna tarjeta.
const FRASES_DEL_CUERPO = ['Elina Pilates Aluminum HL1', 'Consulta vinculante DGT V2661-14'];

for (const ruta of ['/', '/recursos']) {
  test(`el texto de las guías no viaja en el JavaScript de ${ruta}`, async ({ page }) => {
    const scripts: string[] = [];
    page.on('response', async (r) => {
      if (r.request().resourceType() === 'script' && r.ok()) scripts.push(await r.text().catch(() => ''));
    });
    await page.goto(ruta, { waitUntil: 'networkidle' });
    await expect(page.getByRole('link', { name: /abrir un estudio de pilates/i }).first()).toBeVisible();
    expect(scripts.length).toBeGreaterThan(0);
    for (const frase of FRASES_DEL_CUERPO) {
      expect(scripts.some((s) => s.includes(frase)), `«${frase}» está en el JS de ${ruta}`).toBe(false);
    }
  });
}
