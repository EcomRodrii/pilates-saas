import { test, expect } from '@playwright/test';
import { sembrarSociaCompleta, SLUG } from './socia-completa';

// Las fotos de la app de la alumna.
//
// ⚠️ Estos tests existen por un fallo que no se ve mirando la pantalla: una
// `<img>` sin `decoding="async"` se descodifica en el HILO PRINCIPAL, el mismo
// que dibuja el scroll, y sin `width`/`height` la página salta cuando la foto
// entra. Las dos cosas se ven perfectas en una captura y se sufren al usar.

const base = `/portal/${SLUG}`;

test.describe('Fotos de la alumna', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 393, height: 852 } });

  test('el héroe reserva su hueco y no bloquea el hilo principal', async ({ page }) => {
    await sembrarSociaCompleta(page, { bono: 5 });
    await page.goto(base, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(2200);

    const heroe = page.locator('section img').first();
    await expect(heroe).toHaveAttribute('decoding', 'async');
    await expect(heroe).toHaveAttribute('width', /\d+/);
    await expect(heroe).toHaveAttribute('height', /\d+/);
    // Se ve sin desplazarse: diferirla retrasaría justo lo que se vino a ver.
    await expect(heroe).toHaveAttribute('loading', 'eager');
  });

  test('la foto POR DEFECTO se sirve tal cual, sin pasar por el redimensionador', async ({ page }) => {
    // `/por-defecto/*` son estáticos de Next, NO objetos de Storage: pedirlos
    // por `render/image` devuelve 404 y la alumna se queda con un hueco negro.
    await sembrarSociaCompleta(page, { bono: 5 });
    await page.goto(base, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(2200);

    const src = await page.locator('section img').first().getAttribute('src');
    expect(src).toContain('/por-defecto/');
    expect(src).not.toContain('render/image');
    expect(src).not.toContain('width=');
  });

  test('ninguna foto se queda sin descodificar en asíncrono', async ({ page }) => {
    await sembrarSociaCompleta(page, { bono: 5, descubre: 3 });
    await page.goto(base, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(2400);

    // Se excluyen los logos: llevan `decoding` pero no dimensiones a propósito
    // —cada estudio sube el suyo con su proporción y fijarlas lo deformaría—,
    // así que se comprueban por separado.
    const sinDecoding = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img'))
        .filter((i) => !i.hasAttribute('decoding'))
        .map((i) => i.getAttribute('src')?.slice(0, 60)));
    expect(sinDecoding, `estas <img> descodifican en el hilo principal: ${sinDecoding.join(', ')}`).toEqual([]);
  });
});
