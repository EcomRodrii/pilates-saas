import { test, expect, type Page } from '@playwright/test';
import { SLUG, sembrarSociaLista } from './socia-lista';

// Interruptor «Novedades y ofertas» en Preferencias (22-sep-2026): retirar el
// consentimiento de marketing tiene que ser tan fácil como darlo (RGPD art.
// 7.3), así que vive en la misma pantalla y el mismo patrón que los demás
// avisos por email — no un formulario aparte ni un enlace de baja escondido.

const PREFS = `/portal/${SLUG}/perfil/preferencias`;

interface PeticionMarketing { method: string; body: Record<string, unknown> }

/** Mocks mínimos de la pantalla + captura de lo que llega a `accion: 'marketing'`. */
async function montarPreferencias(page: Page, o: { inicial: boolean | null; patchResultado?: boolean | 'error' }) {
  await sembrarSociaLista(page);
  const peticiones: PeticionMarketing[] = [];
  await page.route((u) => u.pathname === '/api/notifications', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [] }) }));
  await page.route('**/api/notifications/preferences', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(r.request().method() === 'GET' ? { prefs: {} } : { ok: true }) }));
  await page.route('**/api/public/socio', async (r) => {
    const body = r.request().postDataJSON() as Record<string, unknown>;
    if (body.accion !== 'marketing') return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    // Solo se cuenta la ESCRITURA (trae `marketing`): la lectura inicial al
    // montar la pantalla no es lo que este test vigila.
    if ('marketing' in body) {
      peticiones.push({ method: r.request().method(), body });
      if (o.patchResultado === 'error') return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ marketing: o.patchResultado ?? body.marketing }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ marketing: o.inicial }) });
  });
  return peticiones;
}

const interruptor = (page: Page) => page.getByRole('switch', { name: /Novedades y ofertas/ });

test('sin poder leer el estado, no se enseña un interruptor a ciegas', async ({ page }) => {
  await montarPreferencias(page, { inicial: null });
  await page.goto(PREFS);
  await expect(page.getByText('Avisos en el móvil')).toBeVisible({ timeout: 30_000 });
  await expect(interruptor(page)).toHaveCount(0);
});

test('lo tiene dado: se ve encendido, y apagarlo lo retira igual de fácil que darlo', async ({ page }) => {
  const peticiones = await montarPreferencias(page, { inicial: true, patchResultado: false });
  await page.goto(PREFS);

  await expect(interruptor(page)).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
  await interruptor(page).click();

  await expect.poll(() => peticiones.length).toBe(1);
  expect(peticiones[0].body.marketing).toBe(false);
  await expect(interruptor(page)).toHaveAttribute('aria-checked', 'false');
});

test('si el servidor no guarda, el interruptor vuelve a como estaba', async ({ page }) => {
  await montarPreferencias(page, { inicial: false, patchResultado: 'error' });
  await page.goto(PREFS);

  await expect(interruptor(page)).toHaveAttribute('aria-checked', 'false', { timeout: 30_000 });
  await interruptor(page).click();

  // Es optimista (cambia al instante), pero si el servidor no lo confirma
  // vuelve a como estaba: nunca se queda mintiendo que se guardó.
  await expect(interruptor(page)).toHaveAttribute('aria-checked', 'false');
});
