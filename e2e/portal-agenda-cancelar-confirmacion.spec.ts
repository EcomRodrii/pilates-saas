import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// La Agenda de clases (app/portal/[slug]/clases) cancelaba una reserva sin
// confirmación cuando la cancelación no era tardía, y con `window.confirm()`
// nativo (sin marca) cuando sí lo era. Ahora siempre confirma con el mismo
// BottomSheet que el resto del portal.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Portal — Agenda: cancelar pide confirmación', () => {
  test('pulsar "Cancelar" abre una hoja de confirmación, no cancela directo', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/clases`);
    await expect(page.getByRole('heading', { name: 'Horario' })).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Cancelar' }).click();

    await expect(page.getByText('¿Cancelar esta clase?')).toBeVisible();
    // Todavía reservada: no ha cancelado nada al abrir la confirmación.
    await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toBeVisible();
  });

  test('"Sí, cancelar" sí cancela la reserva', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.goto(`/portal/${SLUG}/clases`);
    await expect(page.getByRole('heading', { name: 'Horario' })).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('button', { name: 'Sí, cancelar' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Sí, cancelar' }).click();

    await expect(page.getByText('Reserva cancelada.')).toBeVisible({ timeout: 30_000 });
  });
});
