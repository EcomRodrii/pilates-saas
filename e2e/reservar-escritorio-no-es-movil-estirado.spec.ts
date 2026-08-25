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
  // ⚠️ Rediseño "sin popup": la ficha ya no es `role="dialog"` — es
  // contenido normal de la página (BookingSheet en modo 'vista',
  // components/reserva/reserva-calendario.tsx), identificado aquí por su
  // propia clase de entrada (`paso-anim`, reutilizada del resto del sitio).
  const hoja = page.locator('.paso-anim').first();
  await expect(hoja).toBeVisible({ timeout: 30_000 });

  const caja = await hoja.boundingBox();
  expect(caja).not.toBeNull();
  // Una columna legible, no el ancho de la ventana. El contenedor de la
  // pestaña «Clases» acota a 760px centrados (app/reservar/[slug]/page.tsx)
  // — más ancho que la vieja tarjeta modal (560/640), pero sigue siendo una
  // columna de lectura, no una banda de 1280px pegada al viewport.
  expect(caja!.width).toBeLessThanOrEqual(760);
  // Y centrada: sin esto, "estrecha" podría significar pegada a un lado.
  const centro = caja!.x + caja!.width / 2;
  expect(Math.abs(centro - 640)).toBeLessThan(4);
});

test('en móvil la hoja sigue ocupando todo el ancho', async ({ page }) => {
  // El arreglo de escritorio no puede encoger la hoja en un teléfono: ahí el
  // patrón correcto ES el panel a todo el ancho ("prácticamente full-screen
  // dentro del widget", el criterio explícito del rediseño).
  await page.setViewportSize({ width: 390, height: 844 });
  await sembrarSociaLista(page);
  await page.goto(`/reservar/${SLUG}?tab=clases`);
  await page.locator('#horario').waitFor({ timeout: 150_000 });
  await page.getByRole('button', { name: /Reformer a las 10:00/ }).click();
  const hoja = page.locator('.paso-anim').first();
  await expect(hoja).toBeVisible({ timeout: 30_000 });

  const caja = await hoja.boundingBox();
  // 390 - 40: el contenedor de la ficha lleva su propio padding horizontal
  // de 20px por lado (BookingSheet en modo 'vista',
  // components/reserva/reserva-calendario.tsx) en vez del padding de página
  // que llevaba la vieja tarjeta modal — sigue siendo "todo el ancho
  // disponible", solo que medido desde dentro del propio padding.
  expect(caja!.width).toBe(350);
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
