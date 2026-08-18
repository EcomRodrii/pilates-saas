import { test, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Historial de clases.
//
// ⚠️ Dos cosas rotas que se arreglan juntas porque son la misma:
//
//   1. «Historial de clases» del perfil llamaba a `goBookings`: llevaba a la
//      AGENDA. La agenda mira hacia delante («¿qué tengo?») y el historial
//      hacia atrás («¿a qué fui?»).
//   2. La consulta solo devolvía `ASISTIDA`, así que ni siquiera habiendo
//      pantalla habría sido un historial: enseñaba la mitad de lo que pasó.
//
// Va contra la previsualización, con sus datos de muestra —dos asistidas y una
// cancelada— para no depender de una socia real con historia.
// ─────────────────────────────────────────────────────────────────────────────

async function abrirPerfil(page: import('@playwright/test').Page) {
  await page.goto('/portal-tema-preview/sereno');
  await page.locator('.welcome__cta').click();
  await page.locator('.tab', { hasText: 'Perfil' }).click();
}

test('«Historial de clases» abre el historial, no la agenda', async ({ page }) => {
  await abrirPerfil(page);
  await page.getByRole('button', { name: /Historial de clases/ }).click();

  await expect(page.getByText('Historial', { exact: true })).toBeVisible({ timeout: 30_000 });
  // Y NO es la agenda: su segmentado no está por ninguna parte.
  await expect(page.getByRole('tab', { name: 'Semana' })).toHaveCount(0);
});

test('distingue lo asistido de lo cancelado', async ({ page }) => {
  await abrirPerfil(page);
  await page.getByRole('button', { name: /Historial de clases/ }).click();

  await expect(page.getByText('Asistida').first()).toBeVisible({ timeout: 30_000 });
  // ⚠️ La cancelada TIENE que estar: un historial que solo cuenta las asistidas
  // es media verdad, y la mitad que falta es la que se mira al discutir un cargo.
  await expect(page.getByText('Cancelada')).toBeVisible();
});

test('«Completadas» de la agenda NO cuenta la cancelada', async ({ page }) => {
  // ⚠️ La regresión que abre ampliar la consulta: si «Completadas» no filtrara,
  // una clase que la socia canceló aparecería como completada — lo contrario de
  // lo que pasó, y encima le cuadraría mal el bono.
  await page.goto('/portal-tema-preview/sereno');
  await page.locator('.welcome__cta').click();
  await page.locator('.tab', { hasText: 'Agenda' }).click();
  // El segmentado son `role="tab"` dentro de un `tablist`, no botones sueltos.
  await page.getByRole('tab', { name: 'Lista' }).click();

  await expect(page.getByText('Pilates Reformer').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Reformer suave')).toHaveCount(0);
});
