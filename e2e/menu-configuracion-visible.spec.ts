import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// «Configuración» no puede quedar escondida bajo el pliegue del menú lateral.
// En un portátil el menú no cabe entero y el grupo «Estudio» caía bajo el
// scroll interno, con «Configuración» cortada al borde (auditoría de usabilidad,
// 10-nov-2026; OPEN DECISION 18). Se ancla abajo del menú (`position: sticky`).
//
// Lo que se mide es la caja real: que el enlace esté DENTRO del área visible del
// <nav> que se desplaza, a varias alturas de pantalla, y que al llegar al final
// del menú siga ahí (no se pierde ni se duplica).
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function preparar(page: Page) {
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/instructores**', route => json(route, []));
  await page.route('**/rest/v1/menu_novedades**', route => json(route, []));
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: 'auth-e2e-duena', email: 'cloe@example.com', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, STORAGE_KEY);
}

// La caja del menú que se desplaza (la que contiene el enlace a Configuración).
async function cajas(page: Page) {
  return page.evaluate(() => {
    const enlace = [...document.querySelectorAll('a[href="/configuracion"]')]
      .find(a => (a as HTMLElement).offsetParent !== null && a.closest('nav')?.className.includes('overflow-y-auto')) as HTMLElement | undefined;
    const nav = enlace?.closest('nav') as HTMLElement | null;
    if (!enlace || !nav) return null;
    const e = enlace.getBoundingClientRect();
    const n = nav.getBoundingClientRect();
    return { enlaceTop: e.top, enlaceBottom: e.bottom, navTop: n.top, navBottom: n.bottom, desborda: nav.scrollHeight > nav.clientHeight };
  });
}

for (const alto of [700, 760, 900]) {
  test(`a 1440×${alto} «Configuración» se ve dentro del menú, sin desplazarlo`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: alto });
    await preparar(page);
    await page.goto('/dashboard');
    await expect(page.getByRole('link', { name: /^Calendario/ }).first()).toBeVisible({ timeout: 30_000 });

    const c = await cajas(page);
    expect(c, 'el enlace a Configuración está en el menú lateral').not.toBeNull();
    expect(c!.enlaceTop, 'no empieza por encima del menú').toBeGreaterThanOrEqual(c!.navTop - 1);
    expect(c!.enlaceBottom, 'no queda cortada por abajo').toBeLessThanOrEqual(c!.navBottom + 1);
  });
}

test('al llegar al final del menú sigue habiendo un solo enlace a Configuración, visible', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await preparar(page);
  await page.goto('/dashboard');
  await expect(page.getByRole('link', { name: /^Calendario/ }).first()).toBeVisible({ timeout: 30_000 });

  await page.evaluate(() => {
    const nav = [...document.querySelectorAll('nav')].find(n => n.className.includes('overflow-y-auto') && n.querySelector('a[href="/configuracion"]'));
    nav!.scrollTop = nav!.scrollHeight;
  });
  const c = await cajas(page);
  expect(c).not.toBeNull();
  expect(c!.enlaceBottom).toBeLessThanOrEqual(c!.navBottom + 1);
  const n = await page.locator('nav a[href="/configuracion"]:visible').count();
  expect(n, 'un solo enlace visible a Configuración en el menú').toBe(1);
});
