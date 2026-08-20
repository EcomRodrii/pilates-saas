import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// El portal DICE lo que ha pasado.
//
// ⚠️ El portal real no montaba `<Toast>` en ninguna parte —solo lo hacía la
// previsualización de temas—, así que TODOS los avisos del store se descartaban
// en silencio: «Reserva cancelada», «Datos guardados», «Guardada en favoritas»,
// «Tarjeta quitada»…
//
// Y lo grave no es perderse una confirmación: `notify(error)` tampoco se veía,
// así que un FALLO era indistinguible de un éxito. Toda la disciplina del kit
// —nada de escritura optimista, se avisa con lo que responde el servidor— se
// apoyaba en un mensaje que no se pintaba.
//
// Es también parte de por qué la app «no respondía»: tocabas y nunca decía nada.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

test('un fallo del servidor SE VE, no se traga', async ({ page }) => {
  await montarPortal(page, { conSesion: true, kit: 'sereno', conTarjeta: true });
  // El servidor rechaza quitar la tarjeta.
  await page.route('**/api/public/tarjeta', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"No se ha podido quitar la tarjeta."}' }));

  await page.goto(`/portal/${SLUG}/perfil`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByRole('button', { name: /Método de pago/ }).click({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Quitar esta tarjeta' }).click();
  await page.getByRole('button', { name: /Sí, quitar la tarjeta/ }).click();

  // ⚠️ Lo que fallaba: esto no aparecía por ninguna parte, y la socia se
  // quedaba creyendo que su tarjeta ya no estaba.
  await expect(page.getByText('No se ha podido quitar la tarjeta.')).toBeVisible({ timeout: 15_000 });
});

test('una confirmación también se ve', async ({ page }) => {
  await montarPortal(page, { conSesion: true, kit: 'sereno' });
  await page.route('**/api/public/favoritos', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));

  await page.goto(`/portal/${SLUG}/home`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.locator('.tab-bar')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /ver clase/i }).first().click();
  await page.getByRole('button', { name: 'Favorita' }).click();

  await expect(page.getByText(/guardada en favoritas/i)).toBeVisible({ timeout: 15_000 });
});
