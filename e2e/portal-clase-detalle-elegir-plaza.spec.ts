import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Reservar desde el detalle de clase (llegando por el carrusel de Inicio) no
// dejaba elegir plaza numerada, mientras que reservar desde la Agenda
// (HojaReserva) sí — misma clase, misma sala, dos resultados distintos según
// el camino que tomara la socia. El detalle ahora abre el mismo componente
// de reserva con selector de plaza.
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Portal — detalle de clase: reservar deja elegir plaza', () => {
  test('pulsar "Reservar" abre la hoja con la rejilla de plazas de la sala', async ({ page }) => {
    await montarPortal(page, { conSesion: true });
    // ses-2 no tiene reserva previa de Marta (a diferencia de ses-1).
    await page.goto(`/portal/${SLUG}/clases/ses-2`);

    await expect(page.getByRole('button', { name: /^Reservar/ })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /^Reservar/ }).click();

    const hoja = page.getByRole('dialog', { name: /^Reservar / });
    await expect(hoja).toBeVisible();
    await expect(hoja.getByText('Elige tu plaza')).toBeVisible();
    await expect(hoja.getByRole('button', { name: /^Plaza \d+$/ })).toHaveCount(14);
  });

  test('elegir una plaza y confirmar reserva la clase', async ({ page }) => {
    let posteado: any = null;
    await montarPortal(page, { conSesion: true });
    await page.route('**/api/public/reserva', async route => {
      posteado = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ estado: 'CONFIRMADA', reservaId: 'res-nueva' }) });
    });
    await page.goto(`/portal/${SLUG}/clases/ses-2`);

    await page.getByRole('button', { name: /^Reservar/ }).click();
    const hoja = page.getByRole('dialog', { name: /^Reservar / });
    await hoja.getByRole('button', { name: 'Plaza 5' }).click();
    await hoja.getByRole('button', { name: 'Confirmar reserva' }).click();

    await expect(page.getByText('Reservada. Te esperamos.')).toBeVisible({ timeout: 30_000 });
    expect(posteado?.spotId).toBeTruthy();
  });
});
