import { test, expect, type Page, type Route } from '@playwright/test';
import { resolveTheme } from '../lib/theme-schema.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Fase 1 del editor de temas (roadmap Shopify/Webflow): estilo de botón
// principal y de tarjetas, por estudio. No se puede verificar en el preview de
// Vercel de la PR (Turnstile bloquea el login en *.vercel.app — ver README),
// así que la verificación de la pantalla real pasa por aquí, mockeando red con
// page.route (mismo patrón que e2e/vocabulario-clientas.spec.ts).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, themeGuardado: Record<string, unknown> = {}) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'duena@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/billing/status**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  // El servidor real SIEMPRE pasa el tema por resolveTheme() antes de
  // responder (lib/theme-data.ts) — nunca manda un JSON parcial al cliente.
  // Se simula aquí lo mismo: un tema guardado ANTES de esta fase llega ya
  // resuelto a solid/flat, que es el caso que motivó ese default.
  const themeResuelto = resolveTheme({ primary: '#6D28D9', secondary: '#7C3AED', ...themeGuardado });
  await page.route('**/api/theme**', route => {
    if (route.request().method() === 'PUT') return json(route, resolveTheme(themeGuardado));
    return json(route, themeResuelto);
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/configuracion/apariencia/editor');
  // El editor único (theme-workspace.tsx): "Botón principal"/"Tarjetas" viven
  // en "Ajustes", cada una como categoría propia (panel derecho, una a la
  // vez) — ya no las dos a la vista simultáneamente en un formulario largo.
  await page.getByRole('tab', { name: 'Ajustes' }).click();
}

test.describe('Editor de temas — Fase 1: estilo de botón y tarjetas', () => {
  test('un tema sin buttonStyle/cardStyle (guardado antes de esta fase) muestra Sólido/Plana seleccionados', async ({ page }) => {
    await montar(page);

    // Categorías propias, una a la vez en el panel derecho — no las dos
    // familias de botones a la vista simultáneamente.
    await page.getByRole('button', { name: 'Botón principal' }).click();
    const solido = page.getByRole('button', { name: 'Sólido' });
    await expect(solido).toBeVisible({ timeout: 30_000 });
    await expect(solido).toHaveClass(/bg-brand/);
    await expect(page.getByRole('button', { name: 'Contorno' })).toBeVisible();

    await page.getByRole('button', { name: 'Tarjetas' }).click();
    const plana = page.getByRole('button', { name: 'Plana' });
    await expect(plana).toBeVisible();
    await expect(plana).toHaveClass(/bg-brand/);
    await expect(page.getByRole('button', { name: 'Elevada' })).toBeVisible();
  });

  test('elegir Contorno + Elevada y guardar manda el patch correcto a /api/theme', async ({ page }) => {
    await montar(page);

    await page.getByRole('button', { name: 'Botón principal' }).click();
    const contorno = page.getByRole('button', { name: 'Contorno' });
    await expect(contorno).toBeVisible({ timeout: 30_000 });
    await contorno.click();
    await expect(contorno).toHaveClass(/bg-brand/);

    await page.getByRole('button', { name: 'Tarjetas' }).click();
    const elevada = page.getByRole('button', { name: 'Elevada' });
    await expect(elevada).toBeVisible();
    await elevada.click();
    await expect(elevada).toHaveClass(/bg-brand/);

    const [req] = await Promise.all([
      page.waitForRequest(r => r.url().includes('/api/theme') && r.method() === 'PUT'),
      page.getByRole('button', { name: /Guardar borrador/ }).click(),
    ]);
    const body = req.postDataJSON() as Record<string, unknown>;
    expect(body.buttonStyle).toBe('outline');
    expect(body.cardStyle).toBe('elevated');
  });
});
