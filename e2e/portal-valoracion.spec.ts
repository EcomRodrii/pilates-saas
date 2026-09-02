import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// La nota de una instructora solo se enseña con muestra suficiente.
//
// ⚠️ En producción hay DOS valoraciones en toda la base de datos, las dos de
// 5. Un «5,0 ★» ahí dice que esa instructora es perfecta cuando lo que pasa
// es que la han puntuado dos veces — el mismo número sin dato que el
// «Compatibilidad 87 %» de la tarjeta de sustituciones, que salía de un
// `clamp(score, 55, 99)`.
//
// Escrito originalmente contra `/portal-tema-preview/tentada` (el KIT), con
// la nota pintada en una lista de instructores dentro de "Mi centro" — esa
// lista con nota no existe en el portal de siempre (`app/portal/[slug]/
// instructores/page.tsx` no pinta ninguna valoración). La lógica que decide
// SI se enseña la nota es de negocio, no de tema: vive en
// `lib/portal-tema/valoracion.ts` (`valoracionParaPantalla`,
// `MINIMO_VALORACIONES = 5`) y la usa también la ficha de instructora del
// portal de siempre (`app/portal/[slug]/instructores/[instructorId]/page.tsx`),
// que es donde se verifica aquí. La muestra tiene los dos casos a propósito:
// Ana con 12 (se enseña) y Emma con 2 (no se enseña NADA, ni un hueco).
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(120_000);

test('con muestra suficiente se enseña la nota, y nunca sin su respaldo', async ({ page }) => {
  await montarPortal(page, { conSesion: true, instructoresValoracion: true });
  await page.goto(`/portal/${SLUG}/instructores/ins-1`, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  await expect(page.getByRole('heading', { name: 'Ana Ferrer' })).toBeVisible({ timeout: 30_000 });
  // ⚠️ La nota NUNCA va sola: sin el número detrás vuelve a ser un número sin dato.
  await expect(page.getByText('4,6')).toBeVisible();
  await expect(page.getByText('(12 valoraciones)')).toBeVisible();
});

test('por debajo del mínimo no se pinta nada, ni un hueco', async ({ page }) => {
  await montarPortal(page, { conSesion: true, instructoresValoracion: true });
  await page.goto(`/portal/${SLUG}/instructores/ins-2`, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  // Emma tiene 2 valoraciones de 5. Ni «5,0», ni «Sin valoraciones», ni
  // estrellas vacías: un hueco en la ficha se lee como «mala».
  await expect(page.getByRole('heading', { name: 'Emma López' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('5,0')).toHaveCount(0);
  await expect(page.getByText(/valoracion/i)).toHaveCount(0);
});
