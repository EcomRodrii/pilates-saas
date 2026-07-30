import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// El detalle de una clase (app/portal/[slug]/clases/[sesionId]) cancelaba la
// reserva directamente en el onClick del botón, sin ningún diálogo de
// confirmación — a diferencia de /reservas (Mis reservas), que sí confirma
// con una hoja inferior. Un toque accidental con el pulgar, scrolleando en
// móvil, perdía la plaza sin poder deshacerlo.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Portal — detalle de clase: cancelar pide confirmación', () => {
  test('pulsar "Cancelar reserva" abre una hoja de confirmación, no cancela directo', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/clases/ses-1`);

    await expect(page.getByRole('button', { name: 'Cancelar reserva' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Cancelar reserva' }).click();

    // Todavía no se ha cancelado: sigue viendo el aviso de que ya está reservada.
    await expect(page.getByText('¿Cancelar esta clase?')).toBeVisible();
    await expect(page.getByText('Ya tienes esta clase reservada')).toBeVisible();
  });

  test('"Volver" en la confirmación no cancela la reserva', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/clases/ses-1`);

    await page.getByRole('button', { name: 'Cancelar reserva' }).click();
    await expect(page.getByText('¿Cancelar esta clase?')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Volver' }).click();

    await expect(page.getByText('¿Cancelar esta clase?')).toHaveCount(0);
    await expect(page.getByText('Ya tienes esta clase reservada')).toBeVisible();
  });

  test('"Sí, cancelar" sí cancela la reserva', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/clases/ses-1`);

    await page.getByRole('button', { name: 'Cancelar reserva' }).click();
    await expect(page.getByRole('button', { name: 'Sí, cancelar' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Sí, cancelar' }).click();

    await expect(page.getByText('Reserva cancelada.')).toBeVisible({ timeout: 30_000 });
  });
});
