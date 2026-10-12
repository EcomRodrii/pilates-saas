import { test, expect, type Page } from '@playwright/test';
import { sembrarSociaLista, SLUG } from './socia-lista';

// ─────────────────────────────────────────────────────────────────────────────
// La analítica no sale NUNCA de lo que ve la alumna (P0.2, 12-oct-2026).
//
// `lib/posthog-privacidad.ts` excluye la app de la alumna y la reserva pública,
// y `lib/analytics-catalogo.test.ts` vigila que su código ni importe la
// analítica. Esto lo comprueba en un navegador de verdad: cero envíos a
// PostHog en /portal y en /reservar.
//
// ⚠️ Un «0 envíos» sin más pasaría también si PostHog no se cargara en ningún
// sitio: sin `NEXT_PUBLIC_POSTHOG_KEY` en el build, el SDK no arranca nunca y el
// test saldría verde sin probar nada. Por eso:
//   · el build tiene que llevar una clave —una FICTICIA con un host `.invalid`
//     basta—, y aquí se intercepta cualquier host de PostHog;
//   · antes se exige el control positivo: en la web comercial SÍ hay envíos.
// Sin la clave en el entorno del test, se salta.
// ⚠️ Y HOY EL CI NO LA LLEVA, así que en CI se salta. Ponerla en el `env:` de
// `.github/workflows/ci.yml` exige el permiso `workflow`, que no tenía la sesión
// que escribió esto (12-oct-2026). Son dos líneas:
//     NEXT_PUBLIC_POSTHOG_KEY: phc_e2e_ficticia_no_es_ninguna_cuenta
//     NEXT_PUBLIC_POSTHOG_HOST: https://posthog.e2e.invalid
// y entonces conviene cambiar el `skip` de abajo para que en CI FALLE sin clave
// (si no, se volvería a quedar ciego sin que nadie lo notara). Mientras, en local:
// esas dos variables, `npm run build:e2e` y `E2E_USA_BUILD=1`.
//
// ⚠️ Y una segunda forma de quedarse ciego, medida: `posthog-js` tira todo lo
// que capture un navegador que parezca un bot —«HeadlessChrome» en el
// `userAgent` o en `navigator.userAgentData.brands`, o `navigator.webdriver`—,
// y el Chromium de Playwright es las tres cosas. Sin `pareceUnaPersona`, el SDK
// carga y no envía NADA en ningún sitio: el control positivo fallaba y los
// «cero envíos» salían verdes por el filtro de bots, no por nuestra puerta.
// ─────────────────────────────────────────────────────────────────────────────

const CLAVE = process.env.NEXT_PUBLIC_POSTHOG_KEY;

/** Que el SDK no tome el navegador de pruebas por un bot (ver la cabecera). */
async function pareceUnaPersona(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });
    Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined });
    const ua = navigator.userAgent.replace(/HeadlessChrome/g, 'Chrome');
    Object.defineProperty(Navigator.prototype, 'userAgent', { get: () => ua });
  });
}

/** Intercepta todo lo que va a PostHog (el host ficticio del CI o el real de un .env.local) y lo cuenta. */
async function contarEnvios(page: Page): Promise<{ n: number }> {
  const envios = { n: 0 };
  await page.route((url) => url.hostname.includes('posthog'), (route) => {
    envios.n++;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1}' });
  });
  return envios;
}

// El SDK se carga en el primer hueco libre del navegador (hasta 5 s) y envía en
// lotes cada pocos segundos: esperar menos que esto haría pasar un envío tardío.
const ESPERA_SIN_ENVIOS_MS = 12_000;

// Cargar la página, esperar al SDK (hasta 5 s) y a su primer lote: con `next dev`
// compilando en la primera visita, los 30 s por defecto no llegan.
test.setTimeout(180_000);

test.describe('analítica: nada sale de lo que ve la alumna', () => {
  test.skip(!CLAVE, 'Sin NEXT_PUBLIC_POSTHOG_KEY en el entorno: el SDK no arranca y esto no probaría nada (ver la cabecera: el CI aún no la lleva).');
  test.beforeEach(async ({ page }) => { await pareceUnaPersona(page); });

  test('control positivo: en la web comercial PostHog sí envía', async ({ page }) => {
    const envios = await contarEnvios(page);
    await page.goto('/');
    await expect.poll(() => envios.n, {
      timeout: 90_000,
      message: 'PostHog no ha enviado nada ni en la web comercial: el build no lleva NEXT_PUBLIC_POSTHOG_KEY y el resto de este fichero no probaría nada.',
    }).toBeGreaterThan(0);
  });

  test('la app de la alumna: cero envíos', async ({ page }) => {
    await sembrarSociaLista(page);
    const envios = await contarEnvios(page);
    await page.goto(`/portal/${SLUG}`);
    await expect(page.locator('body')).not.toBeEmpty();
    await page.waitForTimeout(ESPERA_SIN_ENVIOS_MS);
    expect(envios.n, 'La app de la alumna ha enviado algo a PostHog').toBe(0);
  });

  test('la reserva pública: cero envíos', async ({ page }) => {
    await sembrarSociaLista(page);
    const envios = await contarEnvios(page);
    await page.goto(`/reservar/${SLUG}?tab=clases`);
    await page.locator('#horario').waitFor({ timeout: 150_000 });
    await page.waitForTimeout(ESPERA_SIN_ENVIOS_MS);
    expect(envios.n, 'La reserva pública ha enviado algo a PostHog').toBe(0);
  });
});
