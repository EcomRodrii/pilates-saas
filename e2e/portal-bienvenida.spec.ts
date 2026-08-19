import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// La bienvenida del tema, en la raíz del portal.
//
// ⚠️ El kit la trae desde el principio y el portal real NO la montaba nunca:
// `/portal/<slug>` redirigía en el SERVIDOR a `/acceso`, así que la primera
// impresión que diseñó el tema no la veía nadie. Lo reportó el fundador: «el
// inicio no es el mismo que el del zip».
//
// Se sigue acabando en `/acceso` — es lo que hace el botón. Esa parte no se
// toca: es lo que hace que un enlace pelado compartido por WhatsApp funcione
// igual para quien tiene contraseña y para quien no.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

test('la raíz enseña la bienvenida del tema y su botón lleva a /acceso', async ({ page }) => {
  await montarPortal(page, { conSesion: false, kit: 'sereno' });
  await page.goto(`/portal/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  const cta = page.locator('.welcome__cta');
  await expect(cta).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.welcome__title')).toBeVisible();

  await cta.click();
  await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/acceso`), { timeout: 30_000 });
});

test('quien ya tiene sesión NO la ve', async ({ page }) => {
  // ⚠️ Añadir un paso al acceso de quien entra todos los días sería empeorarlo.
  // `PortalShell` la salta directa a /home; esto lo fija.
  await montarPortal(page, { conSesion: true, kit: 'sereno' });
  await page.goto(`/portal/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  await expect(page).toHaveURL(new RegExp(`/portal/${SLUG}/home`), { timeout: 60_000 });
  await expect(page.locator('.welcome__cta')).toHaveCount(0);
});
