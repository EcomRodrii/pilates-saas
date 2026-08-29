process.env.HOME_PREVIEW_TOKEN_SECRET = 'e2e-test-home-preview-secret';

import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';
import { firmarTokenPreviewHome } from '../lib/theme/home-preview-token.ts';

// Fase 5 del editor de temas: /portal-preview/[slug]/{clases,bonos} —
// extensión de /portal-preview/[slug] (Fase 4, ver portal-home-preview.spec.ts)
// para que el editor pueda enseñar más de una pantalla de la app de socias.
// Mismo mecanismo de token, misma sesión de muestra (lib/theme/preview-sesion-muestra.ts).

const STUDIO_ID = 'studio-test';

test.describe('Vista previa de Clases y Bonos — /portal-preview/[slug]/*', () => {
  test('Clases: sin token, placeholder', async ({ page }) => {
    await montarPortal(page, { conSesion: false });
    await page.goto(`/portal-preview/${SLUG}/clases`);
    await expect(page.getByText('Recarga la vista previa desde el editor.')).toBeVisible({ timeout: 30_000 });
  });

  test('Clases: token válido, catálogo real del estudio', async ({ page }) => {
    await montarPortal(page, { conSesion: false });
    const token = firmarTokenPreviewHome(STUDIO_ID);
    await page.goto(`/portal-preview/${SLUG}/clases?t=${token}`);
    await expect(page.getByRole('heading', { name: 'Horario' })).toBeVisible({ timeout: 30_000 });
  });

  test('Bonos: sin token, placeholder', async ({ page }) => {
    await montarPortal(page, { conSesion: false });
    await page.goto(`/portal-preview/${SLUG}/bonos`);
    await expect(page.getByText('Recarga la vista previa desde el editor.')).toBeVisible({ timeout: 30_000 });
  });

  test('Bonos: token válido, sin navegar de verdad al pulsar "Ver los bonos"/"Comprar otro bono"', async ({ page }) => {
    await montarPortal(page, { conSesion: false });
    const token = firmarTokenPreviewHome(STUDIO_ID);
    const url = `/portal-preview/${SLUG}/bonos?t=${token}`;
    await page.goto(url);
    await expect(page.getByRole('heading', { name: 'Bonos' })).toBeVisible({ timeout: 30_000 });
    // Sin sesión real (sesión de muestra), la pantalla cae al estado "sin bono".
    await page.getByRole('button', { name: 'Ver los bonos' }).click();
    // `navegar` es un no-op en preview: sigue en /bonos, no salta a /compras.
    await expect(page).not.toHaveURL(/\/compras/);
    await expect(page.getByRole('heading', { name: 'Bonos' })).toBeVisible();
  });
});
