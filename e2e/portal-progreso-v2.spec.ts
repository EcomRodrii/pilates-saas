import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Progreso, del prototipo de Claude Design.
//
// Todo lo que enseña se calcula de las clases a las que de verdad fue: no hay
// contadores guardados que puedan desincronizarse cuando alguien corrige una
// asistencia a mano en el panel. Estos tests fijan que sigue siendo así.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Portal — Progreso', () => {
  test('las tres cifras salen de las clases asistidas', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/progreso`);
    await expect(page.getByRole('heading', { name: 'Progreso' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Tu constancia, en silencio.')).toBeVisible();

    // 12 clases de 55 min ≈ 11 h. Si alguien cambia el cálculo, salta.
    // `exact` no sobra: sin él, 'CLASES' casa también con «8 de tus 12 clases»
    // de la tarjeta de favorita, y el test falla por ambigüedad, no por el dato.
    await expect(page.getByText('CLASES', { exact: true })).toBeVisible();
    await expect(page.getByText('EN LA SALA', { exact: true })).toBeVisible();
    await expect(page.getByText('11 h')).toBeVisible();
  });

  test('el gráfico enseña siempre doce semanas', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/progreso`);
    await expect(page.getByRole('heading', { name: 'Progreso' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Últimas 12 semanas')).toBeVisible();
    // Doce barras: un gráfico que cambia de ancho con los datos se nota al entrar.
    const barras = page.locator('div[title$="clases"], div[title$="clase"]');
    await expect(barras).toHaveCount(12);
  });

  test('la clase favorita dice cuántas veces y con quién', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/progreso`);
    await expect(page.getByText('Tu clase favorita')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/\d+ de tus \d+ clases · siempre con Ana Ferrer/)).toBeVisible();
  });

  // Quien acaba de entrar no tiene historial, y la pantalla tiene que
  // sostenerse igual — es la primera que verá.
  test('sin historial la pantalla no se rompe ni inventa una favorita', async ({ page }) => {
    await montarPortal(page, { conSesion: true, sinHistorial: true });
    await page.goto(`/portal/${SLUG}/progreso`);
    await expect(page.getByRole('heading', { name: 'Progreso' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('0 h')).toBeVisible();
    await expect(page.getByText('Tu clase favorita')).toHaveCount(0);
    await expect(page.getByText('Últimas 12 semanas')).toBeVisible();
  });
});
