import { expect, type Page } from '@playwright/test';

/**
 * Paso 1 → 2 del alta (/crear-estudio).
 *
 * ⚠️ Reintenta a propósito, y no es pereza: es la PRIMERA interacción tras
 * `goto`, la única expuesta a escribir antes de que React hidrate.
 *
 * `/crear-estudio` es un componente de cliente que Next renderiza también en
 * servidor, así que el input existe —y `fill()` funciona— antes de que React
 * tome el control. Cuando hidrata, el input es CONTROLADO: React lo devuelve a
 * su estado, que está vacío, y se lleva por delante lo escrito. El clic sí
 * llega, pero valida contra un nombre vacío y la pantalla no avanza.
 *
 * Se vio primero en WebKit (#1546, #1567, #1581: run 33672459700 enseña el
 * paso 1 con el campo VACÍO y el aviso «Escribe el nombre de tu estudio»), y
 * el 1-oct-2026 también en Chromium, en `alta-otp.spec.ts`, que escribía a
 * pelo: bajo carga, el ruido de `ENOTFOUND example.supabase.co` del servidor
 * ensancha esa ventana en cualquier navegador. Por eso vive aquí y lo usan
 * todos los specs que pasan por el paso 1.
 *
 * No vale con esperar al botón (existe y está habilitado desde el HTML del
 * servidor) ni con comprobar el valor justo tras escribir (sobrevive hasta que
 * hidrata, y entonces se borra). Lo único que demuestra que la app RECIBIÓ el
 * nombre es que la pantalla avance — así que se reintenta hasta eso.
 */
export async function rellenarPaso1(page: Page, nombre = 'Estudio Aurora') {
  const plan = page.getByRole('heading', { name: 'Tu plan' });
  await expect(async () => {
    // Si un intento anterior ya pasó de paso, no se vuelve a escribir: el campo
    // ya no está en pantalla y el reintento fallaría para siempre.
    if (await plan.isVisible()) return;
    await page.getByRole('textbox', { name: 'Nombre de tu estudio' }).fill(nombre);
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(plan).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
}
