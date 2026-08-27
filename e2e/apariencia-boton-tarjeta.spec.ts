import { test, expect, type Page, type Route } from '@playwright/test';
import { resolveTheme } from '../lib/theme-schema.ts';
import { abrirCategoriaTema } from './apariencia-mock.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Estilo de botón principal y de tarjetas, por estudio — dentro del editor a
// pantalla completa (PR 4). Antes vivían en la pestaña "Ajustes" del
// workspace, cada una como categoría propia; ahora esas mismas categorías
// están siempre visibles en el grupo "Tema" del rail izquierdo — no hace
// falta clicar una pestaña "Ajustes" para llegar a ellas. No se puede
// verificar en el preview de Vercel de la PR (Turnstile bloquea el login en
// *.vercel.app — ver README), así que la verificación pasa por aquí,
// mockeando red con page.route.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, themeGuardado: Record<string, unknown> = {}) {
  const puts: Record<string, unknown>[] = [];
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
  const themeResuelto = resolveTheme({ primary: '#6D28D9', secondary: '#7C3AED', ...themeGuardado });
  await page.route('**/api/theme**', route => {
    if (route.request().url().endsWith('/publish')) return json(route, themeResuelto);
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      puts.push(body);
      return json(route, resolveTheme(body));
    }
    return json(route, themeResuelto);
  });
  await page.route('**/api/portal-bloques**', route => {
    if (route.request().url().endsWith('/publish')) return json(route, []);
    if (route.request().method() === 'PUT') return json(route, route.request().postDataJSON());
    // El editor carga las tres pantallas de una sola vez; con la forma de una
    // sola se quedaba sin bloques.
    if (new URL(route.request().url()).searchParams.get('pantalla') === 'todas') {
      return json(route, { home: [], clases: [], bonos: [], reservar: [] });
    }
    return json(route, []);
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/configuracion/apariencia/editor');
  return { puts };
}

async function publicar(page: Page) {
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Publicar/ }).click();
}

test.describe('Editor a pantalla completa — estilo de botón y tarjetas', () => {
  test('un tema sin buttonStyle/cardStyle (guardado antes de esta fase) muestra Sólido/Plana seleccionados', async ({ page }) => {
    await montar(page);

    await abrirCategoriaTema(page, 'Botón principal');
    const solido = page.getByRole('button', { name: 'Sólido' });
    await expect(solido).toBeVisible({ timeout: 30_000 });
    await expect(solido).toHaveClass(/bg-brand/);
    await expect(page.getByRole('button', { name: 'Contorno', exact: true })).toBeVisible();

    await abrirCategoriaTema(page, 'Tarjetas');
    const plana = page.getByRole('button', { name: 'Plana' });
    await expect(plana).toBeVisible();
    await expect(plana).toHaveClass(/bg-brand/);
    await expect(page.getByRole('button', { name: 'Elevada' })).toBeVisible();
  });

  test('elegir Contorno + Elevada y publicar manda el patch correcto a /api/theme', async ({ page }) => {
    const { puts } = await montar(page);

    await abrirCategoriaTema(page, 'Botón principal');
    const contorno = page.getByRole('button', { name: 'Contorno', exact: true });
    await expect(contorno).toBeVisible({ timeout: 30_000 });
    await contorno.click();
    await expect(contorno).toHaveClass(/bg-brand/);

    await abrirCategoriaTema(page, 'Tarjetas');
    const elevada = page.getByRole('button', { name: 'Elevada' });
    await expect(elevada).toBeVisible();
    await elevada.click();
    await expect(elevada).toHaveClass(/bg-brand/);

    await Promise.all([
      page.waitForRequest(r => r.url().includes('/api/theme') && !r.url().includes('/publish') && r.method() === 'PUT'),
      publicar(page),
    ]);
    const body = puts.at(-1)!;
    expect(body.buttonStyle).toBe('outline');
    expect(body.cardStyle).toBe('elevated');
  });

  // Fase 2 de "unificar los 3 sistemas de temas": primer control que pisa una
  // FEATURE del kit (qué CLASE se pinta), no solo un color/radio. Solo tiene
  // efecto en un tema del kit — ver el comentario de ESTILOS_ACCESOS_RAPIDOS
  // en theme-schema.ts.
  test('sin un tema del kit instalado, "Accesos rápidos" explica por qué no aplica', async ({ page }) => {
    await montar(page);

    await abrirCategoriaTema(page, 'Tarjetas');
    await expect(page.getByRole('button', { name: 'Plana' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/solo se pueden personalizar en un tema de la biblioteca/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Círculo sin tarjeta' })).toHaveCount(0);
  });

});
