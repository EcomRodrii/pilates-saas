process.env.HOME_PREVIEW_TOKEN_SECRET = 'e2e-test-home-preview-secret';

import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';
import { firmarTokenPreviewHome } from '../lib/theme/home-preview-token.ts';

// Fase 4 del Theme Builder: /portal-preview/[slug]/{perfil,reservas} —
// extiende la vista previa navegable (antes Inicio/Clases/Bonos, Fases 4/5
// del editor de temas) a las dos pantallas que faltaban sin dinero real de
// por medio. Mismo mecanismo de token, misma sesión de muestra
// (lib/theme/preview-sesion-muestra.ts) — Perfil además necesita una ficha
// de socia de muestra (SOCIO_MUESTRA), porque el socioId de la sesión de
// muestra no existe en el catálogo real del estudio.

const STUDIO_ID = 'studio-test';

test.describe('Vista previa de Perfil y Reservas — /portal-preview/[slug]/*', () => {
  test('Perfil: sin token, placeholder', async ({ page }) => {
    await montarPortal(page, { conSesion: false });
    await page.goto(`/portal-preview/${SLUG}/perfil`);
    await expect(page.getByText('Recarga la vista previa desde el editor.')).toBeVisible({ timeout: 30_000 });
  });

  test('Perfil: token válido, ficha de muestra (no la de una socia real)', async ({ page }) => {
    await montarPortal(page, { conSesion: false });
    const token = firmarTokenPreviewHome(STUDIO_ID);
    await page.goto(`/portal-preview/${SLUG}/perfil?t=${token}`);
    await expect(page.getByRole('heading', { name: 'Vista Previa' })).toBeVisible({ timeout: 30_000 });
  });

  test('Perfil: guardar datos no persiste de verdad en preview', async ({ page }) => {
    await montarPortal(page, { conSesion: false });
    const token = firmarTokenPreviewHome(STUDIO_ID);
    await page.goto(`/portal-preview/${SLUG}/perfil?t=${token}`);
    await expect(page.getByRole('heading', { name: 'Vista Previa' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Mis datos' }).click();
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Vista previa: esto no se guarda de verdad.')).toBeVisible();
  });

  test('Perfil: "Métodos de pago" no navega de verdad a /compras', async ({ page }) => {
    await montarPortal(page, { conSesion: false });
    const token = firmarTokenPreviewHome(STUDIO_ID);
    await page.goto(`/portal-preview/${SLUG}/perfil?t=${token}`);
    await expect(page.getByRole('heading', { name: 'Vista Previa' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Métodos de pago' }).click();
    await expect(page).not.toHaveURL(/\/compras/);
    await expect(page.getByRole('heading', { name: 'Vista Previa' })).toBeVisible();
  });

  test('Reservas: sin token, placeholder', async ({ page }) => {
    await montarPortal(page, { conSesion: false });
    await page.goto(`/portal-preview/${SLUG}/reservas`);
    await expect(page.getByText('Recarga la vista previa desde el editor.')).toBeVisible({ timeout: 30_000 });
  });

  test('Reservas: token válido, sin reservas propias (socioId ficticio) muestra el vacío real', async ({ page }) => {
    await montarPortal(page, { conSesion: false });
    const token = firmarTokenPreviewHome(STUDIO_ID);
    await page.goto(`/portal-preview/${SLUG}/reservas?t=${token}`);
    await expect(page.getByRole('heading', { name: 'Mis reservas' })).toBeVisible({ timeout: 30_000 });
    // "No tienes clases próximas" — verificado contra capturas reales de
    // Claude Design (título nuevo de la tarjeta de borde discontinuo, ver
    // portal-reservas-view.tsx); antes era "Sin clases reservadas".
    await expect(page.getByText('No tienes clases próximas')).toBeVisible();
  });

  test('Reservas: "Ver horarios" no navega de verdad a /clases', async ({ page }) => {
    await montarPortal(page, { conSesion: false });
    const token = firmarTokenPreviewHome(STUDIO_ID);
    await page.goto(`/portal-preview/${SLUG}/reservas?t=${token}`);
    await expect(page.getByRole('heading', { name: 'Mis reservas' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Ver horarios' }).click();
    await expect(page).not.toHaveURL(/\/clases/);
    await expect(page.getByRole('heading', { name: 'Mis reservas' })).toBeVisible();
  });
});
