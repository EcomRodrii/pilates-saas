import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// Favoritas, de punta a punta — en el portal de siempre (`components/portal/`),
// que es donde vive de verdad: `PortalClasesView` marca/filtra favoritas desde
// antes de que existiera el kit de temas. Esto se escribió montando el estudio
// con `kit: 'sereno'` como atajo y describiendo una pantalla dedicada
// («Favoritas», acceso rápido de Inicio) que es EXCLUSIVA del kit — el Inicio
// de siempre nunca tuvo ese acceso rápido (el bloque "Accesos rápidos" con
// Mis reservas/Mi progreso/Notificaciones/El equipo se retiró del todo del
// Inicio el 31-ago, no está en el diseño real). Lo que SÍ es núcleo y se
// preserva aquí es el filtro «Favoritas» dentro de Clases.
//
// ⚠️ El bug real que esto vigila: el corazón escribía el id de la SESIÓN en
// `localStorage` y no llamaba a nadie. El backend (`/api/public/favoritos`)
// siempre guardó `tipo_clase_id`: la socia marcaba «el Reformer del martes»,
// el corazón se apagaba solo al cambiar de semana —porque la sesión ya era
// otra— y el servidor no se enteraba nunca. Por eso el test más importante de
// aquí es el CONTADOR de peticiones: sin él, «el corazón se puso» sale verde
// con el servidor sin enterarse de nada.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

test('el corazón escribe en el servidor, y manda el TIPO de clase', async ({ page }) => {
  const enviados: { tipoClaseId?: string; accion?: string }[] = [];
  await montarPortal(page, { conSesion: true });
  await page.route('**/api/public/favoritos', async (route) => {
    enviados.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });

  await page.goto(`/portal/${SLUG}/clases`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const corazon = page.getByRole('button', { name: 'Marcar Reformer Flow como favorita' });
  await expect(corazon).toBeVisible({ timeout: 30_000 });
  await corazon.click();

  // ⚠️ Sin esto, el test pasaría con el servidor sin enterarse — el bug exacto.
  await expect.poll(() => enviados.length, { timeout: 10_000 }).toBeGreaterThan(0);
  // Y lo que se manda es el TIPO, no la sesión: `tc-1`, no `ses-1`.
  expect(enviados[0].tipoClaseId).toBe('tc-1');
  expect(enviados[0].accion).toBe('marcar');
});

test('con una favorita marcada, el filtro "Favoritas" aparece de verdad y funciona', async ({ page }) => {
  await montarPortal(page, { conSesion: true, favoritos: ['tc-1'] });
  await page.goto(`/portal/${SLUG}/clases`, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  const chip = page.getByRole('button', { name: /^Favoritas$/ });
  await expect(chip).toBeVisible({ timeout: 30_000 });
  await chip.click();

  // No es un aviso que se apaga solo: es un filtro real de la lista, y la
  // clase favorita sigue ahí después de aplicarlo.
  await expect(page.getByText('Reformer Flow').first()).toBeVisible();
});

test('sin ninguna favorita, no aparece un filtro roto', async ({ page }) => {
  await montarPortal(page, { conSesion: true, favoritos: [] });
  await page.goto(`/portal/${SLUG}/clases`, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  await expect(page.getByRole('button', { name: 'Marcar Reformer Flow como favorita' })).toBeVisible({ timeout: 30_000 });
  // El chip solo se pinta si hay al menos una favorita (idsFavoritos.size > 0)
  // — sin ninguna, no hay un control muerto ofreciendo un filtro vacío.
  await expect(page.getByRole('button', { name: /^Favoritas$/ })).toHaveCount(0);
});
