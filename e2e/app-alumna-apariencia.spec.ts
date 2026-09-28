import { test, expect, type Page, type Route } from '@playwright/test';
import { montar, ir } from './panel-sembrado';
import { DEFAULT_THEME } from '../lib/theme-schema';

// «Apariencia de tu app» (Configuración): elegir estilo, tipografía y color,
// verlo en la app REAL de la vista previa y publicarlo.
//
// ⚠️ Cada camino que escribe lleva su contador de peticiones: un «Publicado»
// sin petición, o un «no se pudo» sin haberlo intentado, pasarían igual.

const json = (r: Route, cuerpo: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) });

async function preparar(page: Page, publicar: (cuerpo: { campos: Record<string, unknown> }) => { status: number; cuerpo: unknown }) {
  await montar(page);
  // El estudio con el plan que incluye la marca y la suscripción activa.
  await page.route('**/rest/v1/studios**', (r) => json(r, {
    id: 'studio-test', nombre: 'Pilates Centro', slug: 'pilates-centro', owner_auth_user_id: 'auth-e2e-duena',
    plan: 'ESTUDIO', subscription_status: 'active', moneda: 'EUR', iva_por_defecto: 21,
  }));
  const envios: { campos: Record<string, unknown> }[] = [];
  const escriturasStudio: Record<string, unknown>[] = [];
  await page.route((u) => u.pathname.startsWith('/rest/v1/studios'), async (r) => {
    if (r.request().method() === 'PATCH') {
      escriturasStudio.push(r.request().postDataJSON() as Record<string, unknown>);
      return json(r, [{ id: 'studio-test' }]);
    }
    return r.fallback();
  });
  await page.route((u) => u.pathname === '/api/theme', (r) => json(r, { ...DEFAULT_THEME, primary: '#666DCC' }));
  await page.route((u) => u.pathname === '/api/theme/publish', async (r) => {
    const cuerpo = r.request().postDataJSON() as { campos: Record<string, unknown> };
    envios.push(cuerpo);
    const res = publicar(cuerpo);
    return json(r, res.cuerpo, res.status);
  });
  return { envios, escriturasStudio };
}

/** Nombre de la alumna con la que entra la vista previa: el saludo de Inicio lo lleva. */
const ALUMNA = 'Alumna Prueba';

/**
 * Una alumna con sesión en el navegador, para que la vista previa pueda enseñar
 * «Inicio».
 *
 * ⚠️ Sin esto «Inicio» NO es Inicio. La vista previa es la app REAL, y su
 * guardia (`GuardiaSesion`) manda a `/acceso/login` a quien no tiene sesión de
 * alumna —la propietaria del panel no la tiene: la suya es de staff, en otro
 * almacén—. El login vive en el mismo marco que «Entrada» (`/acceso` → 308 →
 * `/acceso/login`), así que sin alumna las dos opciones pintan LA MISMA
 * pantalla. Medido el 28-sep-2026: mismo texto en las dos.
 *
 * El test de Inicio/Entrada miraba `toHaveCount(0)` sobre `.st-auth-hero` en
 * «Inicio» y pasaba solo si llegaba ANTES de que el iframe hidratase y la
 * guardia redirigiera: verde en CI por lento, rojo en local con el servidor ya
 * caliente, que se leía como estado arrastrado entre tests. No lo era: fallaba
 * igual corriendo solo.
 *
 * Se registra DESPUÉS de `preparar()`: gana la última ruta, y el comodín
 * `/api/**` del panel contestaría `{}` a la sesión.
 */
async function conAlumna(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('sb-portal-auth', JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: 'auth-e2e-alumna', email: 'alumna@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  });
  let sesiones = 0;
  await page.route((u) => u.pathname === '/api/public/session', (r) => {
    sesiones++;
    return json(r, { socioId: 'socio-e2e-alumna', nombre: ALUMNA, email: 'alumna@example.com' });
  });
  return { sesiones: () => sesiones };
}

/** El `--background` que ve la app dentro del iframe de la vista previa. */
async function fondoDeLaApp(page: Page) {
  const marco = page.frameLocator('iframe[title="Vista previa de la app de tus alumnas"]');
  await marco.locator('.student-app').first().waitFor({ timeout: 60_000 });
  return marco.locator('.student-app').first().evaluate((el) => getComputedStyle(el).getPropertyValue('--background').trim().toUpperCase());
}

test.describe('Apariencia de tu app', () => {
  test.describe.configure({ timeout: 180_000 });
  test.use({ viewport: { width: 1440, height: 950 } });

  test('elegir un estilo lo pinta en la vista previa y «Publicar» lo manda', async ({ page }) => {
    const { envios } = await preparar(page, (c) => ({ status: 200, cuerpo: { ...DEFAULT_THEME, primary: '#666DCC', ...c.campos } }));
    await ir(page, 'configuracion/apariencia');
    await expect(page.getByRole('heading', { name: 'Apariencia de tu app' })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Todo publicado.')).toBeVisible();
    // Con reintento, como las demás lecturas del fondo: `--background` sale de
    // `student.css`, una hoja EXTERNA, y entre que el iframe pinta `.student-app`
    // y que esa hoja carga la propiedad vale ''. Leerlo una sola vez fallaba a
    // ratos (CI de main, 28-sep: rojo a la primera en esta línea).
    await expect.poll(() => fondoDeLaApp(page)).toBe('#FAF9F5');

    await page.getByRole('radio', { name: /Arena/ }).click();
    await page.getByRole('radio', { name: /Serena/ }).click();
    await expect(page.getByText('Tienes cambios sin publicar.')).toBeVisible();
    await expect.poll(() => fondoDeLaApp(page)).toBe('#F4EEE5');

    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByText('Publicado. Tus alumnas ya ven tu app así.')).toBeVisible({ timeout: 30_000 });
    expect(envios.length).toBe(1);
    // Solo lo que ha cambiado: ni el color ni el secundario viajan si no se tocaron.
    expect(envios[0].campos).toEqual({
      appAlumna: { estilo: 'arena', tipografia: 'serena', marca: 'suave', boton: 'tinta', encuadre: null },
    });
  });

  test('si el servidor lo rechaza, lo dice y los cambios siguen sin publicar', async ({ page }) => {
    const { envios } = await preparar(page, () => ({ status: 422, cuerpo: { errores: [{ mensaje: 'Ese color no se lee sobre el fondo.', categoriaId: 'color-marca' }] } }));
    await ir(page, 'configuracion/apariencia');
    await expect(page.getByRole('heading', { name: 'Apariencia de tu app' })).toBeVisible({ timeout: 60_000 });
    await page.getByRole('radio', { name: /Rubor/ }).click();
    await page.getByRole('button', { name: 'Publicar' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Ese color no se lee sobre el fondo.' })).toBeVisible({ timeout: 30_000 });
    expect(envios.length).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'Publicar' })).toBeEnabled();
  });

  test('el titular de la entrada se guarda y la vista previa salta a esa pantalla', async ({ page }) => {
    const { escriturasStudio } = await preparar(page, () => ({ status: 200, cuerpo: DEFAULT_THEME }));
    await conAlumna(page);
    await ir(page, 'configuracion/apariencia');
    await expect(page.getByRole('heading', { name: 'Apariencia de tu app' })).toBeVisible({ timeout: 60_000 });
    // Arranca en Inicio DE VERDAD. Sin esto el `.st-auth-hero` del final ya
    // estaba ahí desde el principio (el login) y el «salta» no probaba nada.
    const marco = page.frameLocator('iframe[title="Vista previa de la app de tus alumnas"]');
    await expect(marco.getByRole('heading', { name: new RegExp(ALUMNA) })).toBeVisible({ timeout: 60_000 });
    await expect(marco.locator('.st-auth-hero')).toHaveCount(0);

    await page.getByLabel('Titular de la entrada').fill('Respira.\nEmpieza.');
    await page.getByRole('button', { name: 'Guardar el titular' }).click();
    await expect(page.getByText('Titular guardado. Ya se lee en tu entrada.')).toBeVisible({ timeout: 30_000 });
    // Verde por no haber escrito nada no vale.
    expect(escriturasStudio.length).toBe(1);
    expect(escriturasStudio[0]).toMatchObject({ titulo_acceso: 'Respira.\nEmpieza.' });
    // Y se enseña dónde se lee: la vista previa pasa a la pantalla de entrada.
    await expect(page.getByRole('radio', { name: 'Entrada', exact: true })).toHaveAttribute('aria-checked', 'true');
    await expect(marco.locator('.st-auth-hero')).toBeVisible({ timeout: 60_000 });
    await expect(marco.getByRole('heading', { name: new RegExp(ALUMNA) })).toHaveCount(0);
  });

  test('la vista previa cambia entre Inicio y Entrada', async ({ page }) => {
    await preparar(page, () => ({ status: 200, cuerpo: DEFAULT_THEME }));
    const alumna = await conAlumna(page);
    await ir(page, 'configuracion/apariencia');
    await expect(page.getByRole('heading', { name: 'Apariencia de tu app' })).toBeVisible({ timeout: 60_000 });
    const marco = page.frameLocator('iframe[title="Vista previa de la app de tus alumnas"]');
    // Primero lo que SÍ es Inicio —su saludo—, y solo entonces la ausencia de
    // la entrada: un `toHaveCount(0)` a secas se cumple con el iframe aún en
    // blanco, que es como este test estuvo verde sin mirar nada.
    await expect(marco.getByRole('heading', { name: new RegExp(ALUMNA) })).toBeVisible({ timeout: 60_000 });
    await expect(marco.locator('.st-auth-hero')).toHaveCount(0);
    expect(alumna.sesiones()).toBeGreaterThan(0);

    await page.getByRole('radio', { name: 'Entrada', exact: true }).click();
    await expect(marco.locator('.st-auth-hero')).toBeVisible({ timeout: 60_000 });
    await expect(marco.getByRole('heading', { name: new RegExp(ALUMNA) })).toHaveCount(0);

    // Y de vuelta: el selector va en los dos sentidos.
    await page.getByRole('radio', { name: 'Inicio', exact: true }).click();
    await expect(marco.getByRole('heading', { name: new RegExp(ALUMNA) })).toBeVisible({ timeout: 60_000 });
    await expect(marco.locator('.st-auth-hero')).toHaveCount(0);
  });

  test('«Descartar» vuelve a lo publicado, también en la vista previa', async ({ page }) => {
    await preparar(page, () => ({ status: 500, cuerpo: {} }));
    await ir(page, 'configuracion/apariencia');
    await expect(page.getByRole('heading', { name: 'Apariencia de tu app' })).toBeVisible({ timeout: 60_000 });
    await page.getByRole('radio', { name: /Piedra/ }).click();
    await expect.poll(() => fondoDeLaApp(page)).toBe('#E6EAE5');
    await page.getByRole('button', { name: 'Descartar' }).click();
    await expect(page.getByText('Todo publicado.')).toBeVisible();
    await expect.poll(() => fondoDeLaApp(page)).toBe('#FAF9F5');
  });
});
