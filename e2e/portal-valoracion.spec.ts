import { test, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La nota de una instructora solo se enseña con muestra suficiente.
//
// ⚠️ En producción hay DOS valoraciones en toda la base de datos, las dos de 5.
// Un «5,0 ★» ahí dice que esa instructora es perfecta cuando lo que pasa es que
// la han puntuado dos veces — el mismo número sin dato que el
// «Compatibilidad 87 %» de la tarjeta de sustituciones, que salía de un
// `clamp(score, 55, 99)`.
//
// La muestra tiene los dos casos a propósito: Marta con 12 (se enseña) y Emma
// con 2 (no se enseña NADA, ni un hueco).
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(120_000);

test('con muestra suficiente se enseña la nota, y nunca sin su respaldo', async ({ page }) => {
  await page.goto('/portal-tema-preview/tentada');
  await page.locator('.welcome__cta').click();
  // La lista vive dentro de «Mi centro» → «Profesores».
  await page.getByRole('button', { name: 'Mi centro' }).first().click();
  await page.getByRole('button', { name: 'Profesores' }).click();

  const nota = page.locator('.valoracion').first();
  await expect(nota).toBeVisible({ timeout: 30_000 });
  await expect(nota).toContainText('4,6');
  // ⚠️ La nota NUNCA va sola: sin el número detrás vuelve a ser un número sin dato.
  await expect(nota).toContainText('12 valoraciones');
});

test('por debajo del mínimo no se pinta nada, ni un hueco', async ({ page }) => {
  await page.goto('/portal-tema-preview/tentada');
  await page.locator('.welcome__cta').click();
  // La lista vive dentro de «Mi centro» → «Profesores».
  await page.getByRole('button', { name: 'Mi centro' }).first().click();
  await page.getByRole('button', { name: 'Profesores' }).click();
  await expect(page.locator('.valoracion').first()).toBeVisible({ timeout: 30_000 });

  // Emma tiene 2 valoraciones de 5. Ni «5,0», ni «Sin valoraciones», ni estrellas
  // vacías: un hueco en la ficha se lee como «mala».
  await expect(page.getByText('5,0')).toHaveCount(0);
  await expect(page.getByText(/sin valoraciones/i)).toHaveCount(0);
  // Y solo hay UNA nota en la lista, la de quien sí llega al mínimo.
  await expect(page.locator('.valoracion')).toHaveCount(1);
});
