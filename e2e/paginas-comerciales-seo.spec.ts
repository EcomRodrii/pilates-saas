import { test, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Lo que sale por el cable en las páginas comerciales (7-oct-2026):
//  · un solo <h1>, que empieza por la búsqueda que responde la página;
//  · la respuesta directa («En resumen») en las comparativas y las soluciones;
//  · las respuestas de las preguntas frecuentes EN EL HTML (antes solo se
//    pintaban al pulsar: el JSON-LD FAQPage declaraba respuestas que la página
//    no tenía);
//  · sin scroll lateral en el móvil (la tabla de la comparativa pasa a tarjetas);
//  · y la calculadora de plazas vacías responde a los números.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

const PAGINAS = [
  { path: '/', h1: /^Software de gestión para estudios de Pilates y yoga/, resumen: false },
  { path: '/comparativa/tentare-vs-bsport', h1: /^bsport: precios, funciones y la alternativa/, resumen: true },
  { path: '/comparativa/tentare-vs-eversports', h1: /^Eversports: precios/, resumen: true },
  { path: '/soluciones/estudio-de-pilates-reformer', h1: /^Software para estudios de Pilates reformer/, resumen: true },
  { path: '/soluciones/estudio-de-yoga', h1: /^Software para estudios de yoga/, resumen: true },
  { path: '/funcionalidades/reservas-online', h1: /^Software de reservas y pagos para estudios de Pilates/, resumen: false },
  { path: '/precios', h1: /^Precios del software para estudios de Pilates/, resumen: false },
];

for (const p of PAGINAS) {
  test(`${p.path}: h1 con la búsqueda, resumen y FAQ en el HTML del servidor`, async ({ request }) => {
    const res = await request.get(p.path, { timeout: 120_000 });
    expect(res.status()).toBe(200);
    const html = await res.text();

    const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toMatch(p.h1);
    if (p.resumen) expect(html).toContain('aria-label="En resumen"');

    // La primera respuesta del FAQPage tiene que estar en el cuerpo, fuera de los <script>.
    const faq = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .map((m) => JSON.parse(m[1]) as { '@type'?: string; mainEntity?: { acceptedAnswer: { text: string } }[] })
      .find((j) => j['@type'] === 'FAQPage');
    expect(faq, 'la página declara FAQPage').toBeTruthy();
    const sinScripts = html.replace(/<script[\s\S]*?<\/script>/g, '');
    const respuesta = faq!.mainEntity![0].acceptedAnswer.text.slice(0, 50);
    const desescapar = (s: string) => s.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    expect(desescapar(sinScripts)).toContain(respuesta);
  });
}

test('la comparativa no se sale de la pantalla en el móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/comparativa/tentare-vs-eversports', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 60_000 });
  const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(ancho).toBeLessThanOrEqual(390);
});

test('la calculadora de plazas vacías responde a los números', async ({ page }) => {
  await page.goto('/soluciones/estudio-de-pilates-reformer', { waitUntil: 'domcontentloaded' });
  const calc = page.getByRole('group', { name: /los números de partida son un ejemplo/i });
  // Ejemplo de partida: 8 reformers, 30 clases, 80 % y 18,75 € → 3.900 € al mes.
  await expect(calc).toContainText(/3\.?900 €/, { timeout: 60_000 });
  // Si se rellena antes de hidratar, el input enseña «10» pero el estado sigue
  // en 8, y volver a rellenar «10» no dispara ningún cambio: se vacía primero.
  await expect(async () => {
    await calc.getByLabel(/Reformers por clase/).fill('');
    await calc.getByLabel(/Reformers por clase/).fill('10');
    await expect(calc).toContainText(/4\.?875 €/, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
});

test('la home enlaza cada comparativa desde «¿Ya usas otro programa?»', async ({ request }) => {
  const html = await (await request.get('/', { timeout: 120_000 })).text();
  const seccion = html.slice(html.indexOf('id="cambiarte"'), html.indexOf('id="v5-pre-h"'));
  for (const slug of ['bsport', 'eversports', 'mindbody', 'timp', 'momence', 'lorari']) {
    expect(seccion, slug).toContain(`href="/comparativa/tentare-vs-${slug}"`);
  }
  expect(seccion).toContain('href="/soluciones/cambiar-de-software"');
});
