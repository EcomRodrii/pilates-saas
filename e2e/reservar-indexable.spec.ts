import { test, expect } from '@playwright/test';
import { sembrarSociaLista, SLUG } from './socia-lista';

// ─────────────────────────────────────────────────────────────────────────────
// La página de reservas de cada estudio pasa a ser indexable (decisión del
// fundador, 2026-08-17). Este test mira lo que de verdad sale por el cable.
//
// Se comprueban las DOS puertas, porque levantar una sola no hace nada: Google
// no puede leer una etiqueta de una URL que le hemos prohibido rastrear. Y
// sobre todo el `canonical`, que es lo que separa «indexar» de «llenar el
// índice de duplicados»: esta página vive con `?tab=` (5 valores), `?embed=1`,
// `?fondo=`, `?texto=`, `?ref=`… y cada combinación es la misma página.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(240_000);

async function abrir(page: import('@playwright/test').Page, url: string) {
  await sembrarSociaLista(page);
  // Calentado con reintento: en frío la primera petición puede devolver el 404
  // del servidor de desarrollo mientras compila.
  for (let intento = 0; intento < 3; intento++) {
    await page.goto(url);
    if (await page.locator('#horario').waitFor({ timeout: 30_000 }).then(() => true).catch(() => false)) break;
  }
}

const robots = (page: import('@playwright/test').Page) =>
  page.locator('meta[name="robots"]').first().getAttribute('content');
const canonical = (page: import('@playwright/test').Page) =>
  page.locator('link[rel="canonical"]').first().getAttribute('href');

test('la página del estudio se declara indexable', async ({ page }) => {
  await abrir(page, `/reservar/${SLUG}`);
  const r = await robots(page);
  // Puede venir como "index, follow" o ausente (que también significa indexable).
  expect(r ?? 'index').not.toMatch(/noindex/);
});

test('el canonical apunta SIEMPRE a la URL limpia, sin parámetros', async ({ page }) => {
  // Sin esto, un solo estudio genera decenas de URLs con el mismo contenido
  // compitiendo entre sí. Es la parte que hace que abrir el índice sea sensato.
  for (const sufijo of ['', '?tab=citas', '?tab=clases&ref=insta', '?embed=1&fondo=transparente&texto=claro']) {
    await abrir(page, `/reservar/${SLUG}${sufijo}`);
    const href = await canonical(page);
    expect(href, `canonical con «${sufijo || 'sin parámetros'}»`).toMatch(new RegExp(`/reservar/${SLUG}$`));
  }
});

test('robots.txt ya no bloquea /reservar, y sigue bloqueando lo que debe', async ({ page }) => {
  const res = await page.request.get('/robots.txt');
  expect(res.status()).toBe(200);
  const txt = await res.text();

  // La otra puerta. `\s` al final para no casar con `/reservar-algo` inventado.
  expect(txt, 'robots.txt sigue bloqueando /reservar').not.toMatch(/Disallow:\s*\/reservar\s*$/m);
  // `/i` sirve el MISMO contenido que /reservar: abrirlo también sería
  // duplicarlo en dos URLs. Sigue cerrado a propósito.
  expect(txt, '/i debería seguir bloqueada').toMatch(/Disallow:\s*\/i\s*$/m);
  expect(txt, '/portal debería seguir bloqueada').toMatch(/Disallow:\s*\/portal\s*$/m);
});
