import { test, expect } from '@playwright/test';
import { montarPortal, SLUG } from './portal-mock';

// ─────────────────────────────────────────────────────────────────────────────
// «Mis datos» — que no le borre el perfil a nadie.
//
// ⚠️ El bug que vigila esto podía DESTRUIR datos de una socia. El formulario
// hacía una foto de `vm.profile` al montar y el fichero no tenía ni un solo
// efecto: si la pantalla se abría sin socia cargada, los seis campos salían
// vacíos y «Guardar cambios» mandaba esos vacíos encima de sus datos reales.
//
// Y es alcanzable de verdad, no en teoría: `sinSocia` reproduce lo que devuelve
// el servidor cuando el token de la socia ya no vale y el navegador todavía cree
// que hay sesión — catálogo completo, socia ausente. La app se monta entera y el
// perfil llega vacío.
//
// (Un catálogo que responde con error NO sirve para probar esto: el tema
// publicado viaja en esa misma respuesta, así que sin ella el kit ni se monta y
// se cae al portal de siempre.)
// ─────────────────────────────────────────────────────────────────────────────

async function abrirMisDatos(page: import('@playwright/test').Page) {
  await page.goto(`/portal/${SLUG}/perfil`, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.getByRole('button', { name: 'Datos personales' }).click({ timeout: 30_000 });
}

test.setTimeout(180_000);

test.describe('Mis datos', () => {
  test('sin datos cargados NO se puede guardar', async ({ page }) => {
    await montarPortal(page, { conSesion: true, kit: 'sereno', sinSocia: true });
    await abrirMisDatos(page);

    const guardar = page.getByRole('button', { name: /guardar cambios/i });
    await expect(guardar).toBeVisible({ timeout: 30_000 });
    // Lo importante: apagado. Antes estaba encendido y mandaba seis campos
    // vacíos al servidor.
    await expect(guardar).toBeDisabled();
    // Y se dice por qué, en vez de dejar un botón muerto sin explicación.
    await expect(page.getByText(/cargando tus datos/i)).toBeVisible();
  });

  test('con datos cargados el formulario los trae', async ({ page }) => {
    await montarPortal(page, { conSesion: true, kit: 'sereno' });
    await abrirMisDatos(page);

    await expect(page.locator('#nombre')).toHaveValue('Marta', { timeout: 30_000 });
    await expect(page.locator('#email')).toHaveValue('marta@example.com');
    await expect(page.getByRole('button', { name: /guardar cambios/i })).toBeEnabled();
  });

  test('un email a medias no llega al servidor', async ({ page }) => {
    await montarPortal(page, { conSesion: true, kit: 'sereno' });
    await abrirMisDatos(page);
    await expect(page.locator('#email')).toHaveValue('marta@example.com', { timeout: 30_000 });

    await page.locator('#email').fill('marta@gmail');
    await page.getByRole('button', { name: /guardar cambios/i }).click();

    await expect(page.getByText(/ese email no parece completo/i)).toBeVisible();
    // Sigue en la pantalla: si hubiera guardado, `guardarDatos` haría `back()`.
    await expect(page.locator('#email')).toBeVisible();

    // Y el mensaje se apaga en cuanto lo arregla, sin tener que volver a pulsar.
    await page.locator('#email').fill('marta@gmail.com');
    await expect(page.getByText(/ese email no parece completo/i)).toHaveCount(0);
  });

  test('el teléfono de fuera de España se acepta', async ({ page }) => {
    // ⚠️ Regresión de criterio: una validación «española» dejaría a una socia
    // sin poder guardar su propio teléfono.
    await montarPortal(page, { conSesion: true, kit: 'sereno' });
    await abrirMisDatos(page);
    await expect(page.locator('#tel')).toBeVisible({ timeout: 30_000 });

    await page.locator('#tel').fill('+44 7700 900123');
    await page.getByRole('button', { name: /guardar cambios/i }).click();

    await expect(page.getByText(/faltan dígitos/i)).toHaveCount(0);
  });
});
