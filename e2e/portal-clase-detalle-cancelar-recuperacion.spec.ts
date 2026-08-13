import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Feature #1 (ficha Lorari-vs-Tentare): cancelar la ocurrencia de una plaza
// fija genera un crédito de recuperación. `cancelarReservaPublica` ya lo
// concedía en servidor, pero antes de este cambio la pantalla se quedaba en
// "Reserva cancelada." a secas — el crédito existía en la BD y la socia nunca
// se enteraba. Cubre lo que portal-clase-detalle-cancelar.spec.ts NO cubre:
// el camino con `recuperacionCreada`, no solo el simple.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Portal — detalle de clase: cancelar con crédito de recuperación', () => {
  test('cancelar una plaza fija muestra el crédito y el CTA "Reagendar"', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.route('**/api/public/reserva', route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, tardia: false, bonoDevuelto: false, eraConfirmada: true, recuperacionCreada: true, recuperacionCaducaEl: '2026-09-15' }),
      }));
    await page.goto(`/portal/${SLUG}/clases/ses-1`);

    await page.getByRole('button', { name: 'Cancelar reserva' }).click();
    await expect(page.getByRole('button', { name: 'Sí, cancelar' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Sí, cancelar' }).click();

    await expect(page.getByText(/Recupérala antes del/)).toBeVisible({ timeout: 30_000 });
    const cta = page.getByRole('button', { name: 'Reagendar' });
    await expect(cta).toBeVisible();
    await cta.click();

    // 30_000, no el 5_000 por defecto: mismo criterio que CUALQUIER OTRO
    // `toHaveURL` tras una navegación dentro de /portal en toda la suite
    // (portal-bonos-compras, portal-avisos-v2, portal-sesion-guiada...). Este
    // era el único que se había quedado con el timeout por defecto.
    await expect(page).toHaveURL(`/portal/${SLUG}/clases`, { timeout: 30_000 });
  });

  test('cancelar una reserva normal (sin plaza fija) no promete recuperación', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    await page.route('**/api/public/reserva', route =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, tardia: false, bonoDevuelto: true, eraConfirmada: true, recuperacionCreada: false, recuperacionCaducaEl: null }),
      }));
    await page.goto(`/portal/${SLUG}/clases/ses-1`);

    await page.getByRole('button', { name: 'Cancelar reserva' }).click();
    await page.getByRole('button', { name: 'Sí, cancelar' }).click();

    await expect(page.getByText('Reserva cancelada.', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Reagendar' })).toHaveCount(0);
  });
});
