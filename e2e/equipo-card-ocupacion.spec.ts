import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Rediseño de la card de "Equipo" (canvas "2a", diseño del fundador): ocupación
// semanal (cifra + 7 barras), "dónde está ahora", coste/horas SEGÚN ROL, y una
// acción principal ("Pedir disponibilidad a…") fuera del menú. No se puede
// verificar en el preview de Vercel de la PR (Turnstile bloquea el login en
// *.vercel.app), así que la verificación pasa por aquí, mockeando red con
// page.route (mismo patrón que e2e/equipo-invitacion.spec.ts).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-yo';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const ANA = {
  id: 'ins-ana', studio_id: STUDIO_ID, nombre: 'Ana Ferrer', email: 'ana@example.com',
  telefono: null, color: '#111', activo: true, rol: 'INSTRUCTOR',
  avatar: null, foto_url: null, auth_user_id: null,
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

// `miRol`: PROPIETARIO si `owner_auth_user_id === AUTH_UID`; MANAGER si hay
// una fila de `instructores` con `auth_user_id === AUTH_UID` y `rol: 'MANAGER'`
// (lib/permisos.ts:useRol). `enlaces` recoge cada POST a la acción principal.
async function montarEquipo(page: Page, opts: { comoManager?: boolean; instructores?: unknown[] } = {}) {
  const { comoManager = false, instructores = [ANA] } = opts;
  const enlaces: string[] = [];

  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'yo@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  const filas = comoManager
    ? [...instructores, { id: 'ins-yo-manager', studio_id: STUDIO_ID, nombre: 'Yo Manager', email: null, telefono: null, color: '#222', activo: true, rol: 'MANAGER', avatar: null, foto_url: null, auth_user_id: AUTH_UID }]
    : instructores;

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/api/equipo/tarifas**', route =>
    json(route, { items: [{ instructorId: 'ins-ana', tarifaHora: 22 }] }));
  await page.route('**/api/sustituciones/enlace-instructora', route => {
    enlaces.push(route.request().postData() ?? '');
    return json(route, { url: 'https://tentare.app/e/abc123' });
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: comoManager ? 'otra-persona' : AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/instructores**', route => json(route, filas));

  await page.goto('/equipo');
  return { enlaces };
}

test.describe('Card de Equipo — ocupación semanal y campos por rol', () => {
  test('PROPIETARIO ve coste y €/h', async ({ page }) => {
    await montarEquipo(page);
    await expect(page.getByText('Ana Ferrer')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/22,00\s?€\/h/)).toBeVisible();
    await expect(page.getByText(/€.*·.*22,00\s?€\/h/)).toBeVisible();
  });

  test('MANAGER no ve ningún importe en €', async ({ page }) => {
    await montarEquipo(page, { comoManager: true });
    await expect(page.getByText('Ana Ferrer')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('€', { exact: false })).toHaveCount(0);
  });

  test('la acción principal "Pedir disponibilidad a…" es visible sin abrir el menú y dispara el enlace', async ({ page }) => {
    const { enlaces } = await montarEquipo(page);
    await expect(page.getByText('Ana Ferrer')).toBeVisible({ timeout: 30_000 });

    const boton = page.getByRole('button', { name: /Pedir disponibilidad a Ana/ });
    await expect(boton).toBeVisible();
    await boton.click();

    await expect.poll(() => enlaces.length).toBe(1);
    expect(enlaces[0]).toContain('ins-ana');
    expect(enlaces[0]).toContain('disponibilidad');
  });

  test('las 7 barras de ocupación semanal se pintan por cada instructora', async ({ page }) => {
    await montarEquipo(page);
    await expect(page.getByText('Ana Ferrer')).toBeVisible({ timeout: 30_000 });
    const barras = page.getByTestId('barra-ocupacion');
    await expect(async () => {
      expect(await barras.count()).toBeGreaterThanOrEqual(7);
    }).toPass({ timeout: 10_000 });
  });
});
