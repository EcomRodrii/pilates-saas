import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Método de pago.
//
// ⚠️ Lo que había: la hoja enseñaba los cuatro últimos dígitos y un texto que
// explicaba CÓMO se había guardado la tarjeta, sin salida. No se podía añadir
// —había un comentario justificando que ese botón no existía «y no por
// olvido», cuando `/api/stripe/setup-tarjeta` ya existía— ni quitar: no hay un
// solo `paymentMethods.detach` en todo el repo.
//
// El test que más importa es el del CONTADOR: sin él, «tarjeta quitada» sale
// verde con el servidor sin enterarse, y la socia se queda creyendo que ya no
// se le puede cobrar.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

async function abrirHojaDePago(page: import('@playwright/test').Page) {
  await page.goto(`/portal/${SLUG}/perfil`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByRole('button', { name: /Método de pago/ }).click({ timeout: 60_000 });
}

test('quitar la tarjeta pide confirmación y avisa de las consecuencias', async ({ page }) => {
  const intentos: string[] = [];
  await montarPortal(page, { conSesion: true, kit: 'sereno', conTarjeta: true });
  await page.route('**/api/public/tarjeta', async (route) => {
    intentos.push(route.request().method());
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  await abrirHojaDePago(page);
  await expect(page.getByText(/4242/)).toBeVisible();

  // Un solo toque NO la quita: primero avisa de qué implica.
  await page.getByRole('button', { name: 'Quitar esta tarjeta' }).click();
  await expect(page.getByText(/renovaciones automáticas dejarán de cobrarse/i)).toBeVisible();
  expect(intentos).toHaveLength(0);

  await page.getByRole('button', { name: /Sí, quitar la tarjeta/ }).click();
  // ⚠️ Sin esto, el test pasaría con el servidor sin enterarse de nada.
  await expect.poll(() => intentos.length, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(intentos[0]).toBe('DELETE');
});

test('se explica para qué se usa el método de pago', async ({ page }) => {
  // §14: faltaba decirlo. Sin inventar comportamiento — son los cobros que este
  // repo hace de verdad.
  await montarPortal(page, { conSesion: true, kit: 'sereno', conTarjeta: true });
  await abrirHojaDePago(page);
  await expect(page.getByText(/se usa para cobrar los bonos y las cuotas/i)).toBeVisible();
  await expect(page.getByText(/nunca guardamos el número/i)).toBeVisible();
});

test('sin tarjeta, se puede añadir una', async ({ page }) => {
  await montarPortal(page, { conSesion: true, kit: 'sereno' });
  await abrirHojaDePago(page);
  await expect(page.getByRole('button', { name: 'Añadir tarjeta' })).toBeVisible();
  // Y no se ofrece quitar lo que no hay.
  await expect(page.getByRole('button', { name: 'Quitar esta tarjeta' })).toHaveCount(0);
});
