import { test, expect } from '@playwright/test';
import { sembrarSociaLista, SLUG } from './socia-lista';

// ─────────────────────────────────────────────────────────────────────────────
// Pase visual del widget — dos defectos MEDIDOS en el navegador, no supuestos.
//
//   1. La hoja de detalle era una banda a TODO el ancho pegada al borde
//      inferior. A 1280px eso son ~1000px de vacío entre cada etiqueta y su
//      valor («HORARIO ......... 10:00 – 10:50») y un botón «RESERVAR» de
//      1240px: un patrón de móvil ampliado, no un diseño de escritorio.
//   2. La barra lateral pintaba una tarjeta blanca de 320x42 con CERO
//      contenido cuando el rail de filtros decidía no mostrarse (con una sola
//      instructora y un solo tipo de clase, no hay nada que filtrar).
//
// Las dos se comprueban por MEDIDA, que es como se encontraron.
// ─────────────────────────────────────────────────────────────────────────────

/** Tarjetas visibles, con fondo y sin una sola letra dentro. */
async function tarjetasVacias(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    let n = 0;
    document.querySelectorAll('div').forEach((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const pinta = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.borderTopWidth !== '0px';
      if (r.width > 200 && r.height > 30 && r.height < 90
        && (el as HTMLElement).innerText.trim() === ''
        && pinta && !el.querySelector('img,svg')) n++;
    });
    return n;
  });
}

test('en escritorio la hoja es una tarjeta legible, no una banda de 1280px', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await sembrarSociaLista(page);
  await page.goto(`/reservar/${SLUG}?tab=clases`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });
  await page.getByRole('button', { name: /Reformer a las 10:00/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });

  const caja = await page.locator('div[role=dialog] > div').first().boundingBox();
  expect(caja).not.toBeNull();
  // Una columna legible, no el ancho de la ventana.
  expect(caja!.width).toBeLessThanOrEqual(640);
  // Y centrada: sin esto, "estrecha" podría significar pegada a un lado.
  const centro = caja!.x + caja!.width / 2;
  expect(Math.abs(centro - 640)).toBeLessThan(4);
});

test('en móvil la hoja sigue ocupando todo el ancho', async ({ page }) => {
  // El arreglo de escritorio no puede encoger la hoja en un teléfono: ahí el
  // patrón correcto ES el panel inferior a todo el ancho.
  await page.setViewportSize({ width: 390, height: 844 });
  await sembrarSociaLista(page);
  await page.goto(`/reservar/${SLUG}?tab=clases`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });
  await page.getByRole('button', { name: /Reformer a las 10:00/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });

  const caja = await page.locator('div[role=dialog] > div').first().boundingBox();
  expect(caja!.width).toBe(390);
});

test('la barra lateral no pinta tarjetas vacías', async ({ page }) => {
  // La fixture tiene UN tipo de clase y UNA instructora, así que el rail de
  // filtros no se pinta — que es justo cuando aparecía la tarjeta fantasma.
  await page.setViewportSize({ width: 1280, height: 900 });
  await sembrarSociaLista(page);
  await page.goto(`/reservar/${SLUG}?tab=clases`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });

  expect(await tarjetasVacias(page)).toBe(0);
});
