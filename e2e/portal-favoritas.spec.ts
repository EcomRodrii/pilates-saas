import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Favoritas, de punta a punta.
//
// ⚠️ Antes esto NO EXISTÍA de dos maneras a la vez:
//
//   1. El corazón escribía el id de la SESIÓN en `localStorage` y no llamaba a
//      nadie. El backend (`/api/public/favoritos`) siempre guardó
//      `tipo_clase_id`: la socia marcaba «el Reformer del martes», el corazón
//      se apagaba solo al cambiar de semana —porque la sesión ya era otra— y
//      el servidor no se enteraba nunca.
//   2. El acceso rápido «Favoritas» lanzaba un AVISO («3 clases guardadas») y
//      se apagaba a los dos segundos. No había pantalla ninguna.
//
// Por eso el test más importante de aquí es el CONTADOR de peticiones: sin él,
// «el corazón se puso» sale verde con el servidor sin enterarse de nada — que
// es exactamente el estado del que se viene.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

test('el corazón escribe en el servidor, y manda el TIPO de clase', async ({ page }) => {
  const enviados: { tipoClaseId?: string; accion?: string }[] = [];
  await montarPortal(page, { conSesion: true, kit: 'sereno' });
  await page.route('**/api/public/favoritos', async (route) => {
    enviados.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  await page.goto(`/portal/${SLUG}/home`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.locator('.tab-bar')).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /ver clase/i }).first().click();
  await page.getByRole('button', { name: 'Favorita' }).click();

  // ⚠️ Sin esto, el test pasaría con el servidor sin enterarse — el bug exacto.
  await expect.poll(() => enviados.length, { timeout: 10_000 }).toBeGreaterThan(0);
  // Y lo que se manda es el TIPO, no la sesión: `tc-1`, no `ses-1`.
  expect(enviados[0].tipoClaseId).toBe('tc-1');
  expect(enviados[0].accion).toBe('marcar');
});

test('el acceso rápido lleva a una PANTALLA, no a un aviso', async ({ page }) => {
  await montarPortal(page, { conSesion: true, kit: 'sereno', favoritos: ['tc-1'] });
  await page.goto(`/portal/${SLUG}/home`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.locator('.tab-bar')).toBeVisible({ timeout: 60_000 });

  await page.getByRole('button', { name: 'Favoritas' }).click();

  await expect(page.getByText('Favoritas', { exact: true })).toBeVisible();
  // Y su clase está ahí de verdad, no solo el título.
  await expect(page.getByText('Reformer Flow').first()).toBeVisible();
});

test('sin ninguna favorita, el vacío dice qué hacer y lleva ahí', async ({ page }) => {
  // ⚠️ «No tienes favoritas» a secas deja a la socia sin saber ni qué es esto
  // ni cómo se usa. El vacío tiene que enseñar el gesto y dar la salida.
  await montarPortal(page, { conSesion: true, kit: 'sereno', favoritos: [] });
  await page.goto(`/portal/${SLUG}/home`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await expect(page.locator('.tab-bar')).toBeVisible({ timeout: 60_000 });

  await page.getByRole('button', { name: 'Favoritas' }).click();

  await expect(page.getByText(/toca el corazón/i)).toBeVisible();
  await page.getByText(/ver el horario/i).click();
  await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/clases`));
});
