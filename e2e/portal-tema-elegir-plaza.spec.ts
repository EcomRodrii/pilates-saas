import { test, expect } from '@playwright/test';

/**
 * Elegir sitio en el detalle del kit.
 *
 * ⚠️ Existe porque esta pantalla estuvo APAGADA para los estudios con plaza
 * fija: el kit reservaba con `spotId: null` y dejaba a la socia de un reformer
 * sin máquina. Al encenderla, lo que hay que proteger no es que «se pinte algo»
 * sino tres cosas concretas que se rompen calladas:
 *   · que la rejilla tenga la FORMA de la sala (no un número fijo de columnas),
 *   · que una plaza cogida no se pueda elegir,
 *   · y que elegir y soltar funcionen, porque soltar es la única forma de
 *     cambiar de opinión sin salir de la pantalla.
 *
 * Va contra `/portal-tema-preview`, que usa los datos de muestra: deterministas
 * y sin tocar ningún estudio. La sala de muestra copia la del piloto — 8 plazas
 * en dos filas de cuatro, con los índices desde 0, como en producción.
 */
async function abrirReformer(page: import('@playwright/test').Page, tema: string) {
  await page.goto(`/portal-tema-preview/${tema}`);
  await page.locator('.welcome__cta').click();
  await page.getByRole('button', { name: /Ver horario/i }).first().click();
  await page.getByText('Pilates Reformer').first().click();
  await expect(page.locator('.plaza').first()).toBeVisible();
}

test('la rejilla tiene la forma de la sala y las cogidas no se pueden elegir', async ({ page }) => {
  await abrirReformer(page, 'tentada');

  await expect(page.locator('.plaza')).toHaveCount(8);
  // Cinco cogidas en los datos de muestra. Si alguien las cambia, este número
  // canta antes de que cante una socia.
  await expect(page.locator('.plaza--ocupada')).toHaveCount(5);
  for (const p of await page.locator('.plaza--ocupada').all()) await expect(p).toBeDisabled();

  // La FORMA: 4 columnas, porque la sala son 4 columnas. Con el 7 fijo que usa
  // la hoja de reserva de siempre saldrían 7 arriba y 1 huérfana debajo.
  const columnas = await page.locator('.plazas').evaluate(
    (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length,
  );
  expect(columnas).toBe(4);
});

test('elegir una plaza y soltarla', async ({ page }) => {
  await abrirReformer(page, 'tentada');
  const libre = page.locator('.plaza:not(.plaza--ocupada)').first();

  await expect(page.locator('.plaza--elegida')).toHaveCount(0);
  await libre.click();
  await expect(page.locator('.plaza--elegida')).toHaveCount(1);
  await expect(libre).toHaveAttribute('aria-pressed', 'true');

  // Tocarla otra vez la suelta: sin esto, cambiar de opinión obliga a salir.
  await libre.click();
  await expect(page.locator('.plaza--elegida')).toHaveCount(0);
});

test('la plaza elegida NO viaja a otra clase', async ({ page }) => {
  // ⚠️ El bug que esto vigila: elegir la 1 aquí y que siga elegida al abrir
  // otra clase, donde puede estar cogida — el servidor la rechazaría con un
  // mensaje que no explica nada.
  await abrirReformer(page, 'tentada');
  await page.locator('.plaza:not(.plaza--ocupada)').first().click();
  await expect(page.locator('.plaza--elegida')).toHaveCount(1);

  await page.locator('.topbar .icon-btn').first().click();
  // «Reformer fuerza» es del día siguiente: hay que cambiar de día antes.
  await page.getByRole('button', { name: /MIÉ 5/i }).click();
  await page.getByText('Reformer fuerza').first().click();
  await expect(page.locator('.plaza').first()).toBeVisible();
  await expect(page.locator('.plaza--elegida')).toHaveCount(0);
});

test('una clase sin plazas no pinta ninguna rejilla', async ({ page }) => {
  // ⚠️ Vacío significa «este estudio no asigna sitio», que es la mayoría — NO
  // «la sala está llena». Pintar una rejilla vacía ahí sería mentir.
  await page.goto('/portal-tema-preview/tentada');
  await page.locator('.welcome__cta').click();
  await page.getByRole('button', { name: /Ver horario/i }).first().click();
  await page.getByText('Pilates de suelo').first().click();
  await expect(page.getByText('Sobre la clase')).toBeVisible();
  await expect(page.locator('.plaza')).toHaveCount(0);
});
