import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

test('captura: pase sin clase cerca (caja verde noche)', async ({ page }) => {
  await montarPortal(page, { conSesion: true });
  await page.route('**/api/public/pase', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hayPase: false }) }));
  await page.goto(`/portal/${SLUG}/clases`);
  await expect(page.getByRole('heading', { name: 'Clases' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Mis reservas · \d/ }).click();
  await page.getByRole('button', { name: 'Ver mi pase' }).first().click();
  const hoja = page.getByRole('dialog', { name: 'Tu pase de acceso' });
  await expect(hoja).toBeVisible();
  await expect(page.getByText('No tienes ninguna clase cerca')).toBeVisible();
  await page.waitForTimeout(700);
  await page.screenshot({ path: '.comparacion-visual/mirar-pase.png' });
});

test('captura: error de campo en la puerta de acceso', async ({ page }) => {
  await montarPortal(page, { conSesion: false });
  await page.goto(`/portal/${SLUG}/acceso`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '.comparacion-visual/mirar-acceso.png' });
});
