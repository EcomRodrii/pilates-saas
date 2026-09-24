import { test, expect, type Page } from '@playwright/test';
import { SLUG, fixtureSociaLista } from './socia-lista';

// ─────────────────────────────────────────────────────────────────────────────
// Turnstile REAL, no el captcha inerte de siempre. OPT-IN: no corre en CI.
//
// El resto de la suite se construye SIN `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, así
// que `useCaptcha` no monta nada y `pedirToken()` devuelve `''`: ningún test ve
// jamás el widget de verdad. Ahí se escondieron dos fallos reales que solo
// aparecen con el script de Cloudflare cargado:
//
//   · un widget que deja de existir hacía LANZAR a `pedirToken` (Sentry
//     JAVASCRIPT-NEXTJS-2T): el botón «Continuar» no hacía nada y no decía por qué;
//   · si React remontaba el `<div>` contenedor (cambio de pantalla dentro de la
//     misma hoja), el widget se quedaba enganchado al que ya no estaba en el DOM
//     y `execute()` no resolvía nunca: el «volver a enviar» del código moría a
//     los 30 s con «no eres un robot».
//
// Para correrlo (usa la clave de PRUEBA de Cloudflare, que aprueba siempre, y
// necesita red hacia challenges.cloudflare.com):
//
//     NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA npm run build:e2e
//     E2E_CAPTCHA_REAL=1 E2E_USA_BUILD=1 npx playwright test e2e/captcha-real.spec.ts
//
// ⚠️ Sin `page.clock.install`, a propósito: Turnstile compara la hora del
// navegador con la suya y con un reloj congelado el desafío falla con el error
// 200100.
// ─────────────────────────────────────────────────────────────────────────────

test.skip(process.env.E2E_CAPTCHA_REAL !== '1', 'opt-in: necesita el build con la clave de prueba de Cloudflare (ver la cabecera)');

const base = `/portal/${SLUG}`;

async function montar(page: Page) {
  const envios = { n: 0 };
  await page.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: 'studio-test' }) }));
  await page.route('**/api/theme**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtureSociaLista()) }));
  await page.route('**/api/public/aforo**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sesionIds: [], aforoReservas: [] }) }));
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"sin ficha"}' }));
  await page.route(/js\.stripe\.com/, (r) => r.abort());
  await page.route('**/auth/v1/otp*', (r) => { envios.n++; return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' }); });
  return envios;
}

/** Cloudflare deja en el DOM un input oculto `cf-chl-widget-<id>_response` por widget vivo. */
const idDelWidget = (page: Page) => page.evaluate(() =>
  document.querySelector('input[id^="cf-chl-widget-"][id$="_response"]')?.id.replace(/_response$/, '') ?? null);

/** Abre el login y espera a que el widget esté montado: eso implica que React ya hidrató. */
async function abrirLoginConWidget(page: Page): Promise<string> {
  await page.goto(`${base}/acceso/login`, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => idDelWidget(page), { timeout: 60_000 }).not.toBeNull();
  return (await idDelWidget(page))!;
}

test.describe('Turnstile real', () => {
  test.describe.configure({ timeout: 180_000 });

  test('«volver a enviar» funciona tras cambiar de pantalla (el contenedor se remonta)', async ({ page }) => {
    const envios = await montar(page);
    await abrirLoginConWidget(page);
    await page.getByLabel('Email', { exact: true }).fill('nueva@example.com');
    await page.getByRole('button', { name: /mándame un enlace/i }).click();
    await expect(page.getByTestId('codigo-correo')).toBeVisible({ timeout: 45_000 });
    const antes = envios.n;
    expect(antes, 'el primer correo tenía que salir').toBeGreaterThan(0);

    await page.getByRole('button', { name: /volver a enviar/i }).click();

    await expect(page.getByText(/Te hemos escrito otra vez/i)).toBeVisible({ timeout: 45_000 });
    expect(envios.n, 'el reenvío tenía que salir').toBe(antes + 1);
  });

  test('un widget muerto se reconstruye y el clic sigue, sin excepciones', async ({ page }) => {
    const envios = await montar(page);
    const errores: string[] = [];
    page.on('pageerror', (e) => errores.push(e.message));
    const viejo = await abrirLoginConWidget(page);

    // Se mata como lo dejaría un widget caído: desaparece del registro de Cloudflare.
    const lanza = await page.evaluate((id) => {
      const t = (window as unknown as { turnstile: { remove: (i: string) => void; getResponse: (i: string) => string } }).turnstile;
      t.remove(id);
      try { t.getResponse(id); return false; } catch { return true; }
    }, viejo);
    expect(lanza, 'el widget tenía que quedar muerto para que la prueba valga').toBe(true);

    await page.getByLabel('Email', { exact: true }).fill('nueva@example.com');
    await page.getByRole('button', { name: /mándame un enlace/i }).click();

    await expect(page.getByTestId('codigo-correo')).toBeVisible({ timeout: 45_000 });
    expect(envios.n, 'el correo tenía que salir').toBeGreaterThan(0);
    expect(errores.filter((m) => /turnstile/i.test(m)), 'ninguna excepción de Turnstile sin capturar').toEqual([]);
  });
});
