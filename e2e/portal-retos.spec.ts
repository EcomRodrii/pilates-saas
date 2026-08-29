import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Tarjeta de reto de Hoy (rediseño "Tentare Studio App") — el primer reto de
// `lib/retos-portal.ts` (Core Pilates), siempre a la vista junto a "Mi
// progreso", con conteo REAL de apuntadas de este estudio y un toggle
// Apuntarme/Apuntada ✓ persistido por socia.
//
// Antes esto era un carrusel de los DOS retos, oculto por defecto tras un
// bloque de sistema "retos" que había que activar en `homeBloques` (tema
// Bloom). El rediseño lo simplifica a UNA tarjeta compacta y siempre visible
// — ya no depende de `homeBloques`.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Portal — Hoy: tarjeta de reto', () => {
  test('sin apuntadas, invita a ser la primera', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByRole('heading', { name: '¿Qué te apetece hoy?' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Core Pilates')).toBeVisible();
    await expect(page.getByText('sé la primera')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apuntarme' })).toBeVisible();
  });

  test('con apuntadas reales de otras socias, muestra el conteo del estudio', async ({ page }) => {
    await montarPortal(page, { conSesion: true, retoConteos: { core: 3 } });
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByText('3 apuntadas')).toBeVisible({ timeout: 30_000 });
  });

  test('pulsar Apuntarme cambia a Apuntada ✓ y sube el conteo, sin recargar', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByRole('button', { name: 'Apuntarme' })).toBeVisible({ timeout: 30_000 });
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/public/retos') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Apuntarme' }).click(),
    ]);

    await expect(page.getByRole('button', { name: 'Apuntada ✓' })).toBeVisible();
    await expect(page.getByText('1 apuntada')).toBeVisible();
  });

  test('ya apuntada de antes, llega marcada como Apuntada ✓', async ({ page }) => {
    await montarPortal(page, { conSesion: true, retosApuntados: ['core'], retoConteos: { core: 1 } });
    await page.goto(`/portal/${SLUG}/home`);

    await expect(page.getByRole('button', { name: 'Apuntada ✓' })).toBeVisible({ timeout: 30_000 });
  });
});
