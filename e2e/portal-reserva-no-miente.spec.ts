import { test, expect } from '@playwright/test';
import { montarPortal, abrirHojaDeReserva, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// El portal no puede decir «Reservada» si el servidor ha dicho que no.
//
// Esto pasó en producción: el estudio exigía bono, la socia no tenía ninguno,
// el servidor devolvía 400 con el motivo — y la pantalla anunciaba «Reservada.
// Te esperamos.» igual. En el panel la clase seguía a 0/8. Nadie se enteraba
// hasta que alguien miraba la lista de asistentes.
//
// La causa era que `addReserva` lanzaba el POST sin `await` y sin mirar la
// respuesta. Estos dos tests fijan las dos mitades: que el «no» se dice, y que
// el «sí» sigue diciéndose.
// ─────────────────────────────────────────────────────────────────────────────

const MOTIVO = 'Necesitas un plan o bono activo para reservar';

async function abrirHojaYConfirmar(page: import('@playwright/test').Page) {
  await page.goto(`/portal/${SLUG}/clases`);
  await expect(page.getByRole('heading', { name: 'Clases' })).toBeVisible({ timeout: 30_000 });
  await abrirHojaDeReserva(page);
  const hoja = page.getByRole('dialog', { name: /^Reservar / });
  await expect(hoja).toBeVisible();
  await hoja.getByRole('button', { name: 'Confirmar reserva' }).click();
}

test('si el servidor rechaza la reserva, la pantalla dice POR QUÉ', async ({ page }) => {
  await montarPortal(page, { conSesion: true, reservaRechazada: MOTIVO });
  await abrirHojaYConfirmar(page);

  await expect(page.getByText(MOTIVO)).toBeVisible();
  // Y sobre todo: NO se anuncia una reserva que no existe.
  await expect(page.getByText('Reservada. Te esperamos.')).toHaveCount(0);
});

test('si el servidor la acepta, se confirma como siempre', async ({ page }) => {
  await montarPortal(page, { conSesion: true });
  await abrirHojaYConfirmar(page);

  await expect(page.getByText('Reservada. Te esperamos.')).toBeVisible();
});
