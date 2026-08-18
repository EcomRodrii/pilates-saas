import { test, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Cada tema pinta SU forma de fila del horario, y la elige el tema.
//
// ⚠️ Antes lo elegía la pantalla, y de dos maneras distintas: la fila de Sereno
// con `day_strip_style === "cajas"` —una bandera de la TIRA DE DÍAS— y la de
// Tentada llamando a otro componente exportado aparte. Dos ejes montados encima
// de otros dos: un tema que quisiera días en caja con la fila clásica no podía
// pedirlo, y nadie lo habría notado hasta intentarlo.
//
// Ahora el eje se llama `row_style` y la entrada es una sola. Esto fija que la
// unificación no cambió lo que ve nadie.
// ─────────────────────────────────────────────────────────────────────────────

const FORMAS = [
  { tema: 'oliva', selector: '.class-row:not(.class-row--sereno)', nombre: 'clásica' },
  { tema: 'bloom', selector: '.class-row:not(.class-row--sereno)', nombre: 'clásica' },
  { tema: 'noir', selector: '.class-row:not(.class-row--sereno)', nombre: 'clásica' },
  { tema: 'sereno', selector: '.class-row--sereno', nombre: 'de Sereno' },
  { tema: 'tentada', selector: '.row-mia, .row-libre', nombre: 'plana' },
];

for (const { tema, selector, nombre } of FORMAS) {
  test(`${tema} pinta la fila ${nombre}`, async ({ page }) => {
    await page.goto(`/portal-tema-preview/${tema}`);
    await page.locator('.welcome__cta').click();
    await page.getByRole('button', { name: /Ver horario|Ver la agenda|Reservar/i }).first().click();

    await expect(page.locator(selector).first()).toBeVisible({ timeout: 30_000 });

    // Y NINGUNA de las otras dos formas: si se colaran las dos, la pantalla
    // estaría pintando la fila dos veces y el test seguiría en verde.
    for (const otra of FORMAS.filter((f) => f.nombre !== nombre)) {
      await expect(page.locator(otra.selector)).toHaveCount(0);
    }
  });
}
