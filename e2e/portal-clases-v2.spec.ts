import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// La pantalla de Clases del prototipo de Claude Design.
//
// Fija lo que el diseño da por sentado y un refactor podría llevarse sin que
// salte nada: la semana navegable, el segmentado, los chips por tipo, la tira
// de siete días y los cuatro estados de tarjeta (libre, pocas plazas,
// reservada, completa). Y sobre todo la hoja de reserva con su rejilla de
// plazas, que es lo que distingue esto de un botón de «reservar» a secas.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Portal — Clases', () => {
  test.beforeEach(async ({ page }) => { await montarPortal(page, { conSesion: true }); });

  test('cabecera, semana navegable y los siete días', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/clases`);
    await expect(page.getByRole('heading', { name: 'Clases' })).toBeVisible({ timeout: 30_000 });

    // Los siete días de la semana, con hoy señalado.
    const dias = page.getByRole('button', { name: /^(lunes|martes|miércoles|jueves|viernes|sábado|domingo)/ });
    await expect(dias).toHaveCount(7);
    await expect(page.getByRole('button', { name: 'Semana anterior' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Semana siguiente' })).toBeVisible();
  });

  test('el segmentado separa todas las clases de las mías', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/clases`);
    await expect(page.getByRole('heading', { name: 'Clases' })).toBeVisible({ timeout: 30_000 });

    const mias = page.getByRole('button', { name: /Mis reservas · \d/ });
    await expect(mias).toBeVisible();
    await mias.click();
    // En «mis reservas» desaparecen la tira de días y los chips: ahí no filtras
    // por día, ves lo tuyo.
    await expect(page.getByRole('button', { name: /^lunes/ })).toHaveCount(0);
    await expect(page.getByText(/Reservada|En lista de espera/).first()).toBeVisible();
  });

  test('una clase reservada ofrece su pase y cancelar, no reservar otra vez', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/clases`);
    await expect(page.getByRole('heading', { name: 'Clases' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Ver mi pase' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar' })).toBeVisible();
  });

  test('la hoja de reserva deja elegir plaza en la sala', async ({ page }) => {
    await page.goto(`/portal/${SLUG}/clases`);
    await expect(page.getByRole('heading', { name: 'Clases' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /jueves/i }).click();
    await page.getByRole('button', { name: /^Reservar / }).first().click();

    const hoja = page.getByRole('dialog', { name: /^Reservar / });
    await expect(hoja).toBeVisible();
    await expect(hoja.getByText('Elige tu plaza')).toBeVisible();
    // Las 14 plazas de la sala, y elegir una la marca.
    await expect(hoja.getByRole('button', { name: /^Plaza \d+$/ })).toHaveCount(14);
    const plaza = hoja.getByRole('button', { name: 'Plaza 7' });
    await plaza.click();
    await expect(plaza).toHaveAttribute('aria-pressed', 'true');
    await expect(hoja.getByRole('button', { name: 'Confirmar reserva' })).toBeVisible();
  });

  // Una sala de mat no tiene plazas numeradas: obligar a elegir sería inventarse
  // un paso que no existe.
  test('sin plazas en la sala, la hoja no pide elegir ninguna', async ({ page }) => {
    await montarPortal(page, { conSesion: true, sinPlazas: true });
    await page.goto(`/portal/${SLUG}/clases`);
    await expect(page.getByRole('heading', { name: 'Clases' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /jueves/i }).click();
    await page.getByRole('button', { name: /^Reservar / }).first().click();

    const hoja = page.getByRole('dialog', { name: /^Reservar / });
    await expect(hoja.getByText('Elige tu plaza')).toHaveCount(0);
    await expect(hoja.getByRole('button', { name: 'Confirmar reserva' })).toBeVisible();
  });
});
