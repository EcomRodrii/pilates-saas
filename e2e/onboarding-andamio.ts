import { expect, type Page, type Route } from '@playwright/test';

// Andamiaje del alta nueva (logo → tres pantallas → «Tu estudio está listo»).
// Mismo montaje que el resto de e2e del panel: sesión sembrada en localStorage y
// `**/api/**` → `{}` por defecto, con rutas concretas DESPUÉS (la última
// registrada gana en Playwright).
export const AUTH_UID = 'auth-e2e-duena';
export const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

export function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

export type RespuestaAyuda = (route: Route, cuerpo: Record<string, unknown>) => Promise<void> | void;

export async function montarAlta(
  page: Page,
  { estudio = {}, ayuda, antes }: { estudio?: Record<string, unknown>; ayuda?: RespuestaAyuda; antes?: (page: Page) => Promise<void> } = {},
) {
  const peticiones = {
    /** Cada POST a /api/onboarding/ayuda-alta, con su cuerpo. */
    ayuda: [] as Record<string, unknown>[],
    /** Cada PATCH a studios (sellar el alta, guardar respuestas, logo). */
    patches: [] as Record<string, unknown>[],
    configurar: [] as Record<string, unknown>[],
  };
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
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#343825', secondary: '#5A6142', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => {
    const req = route.request();
    if (req.method() === 'PATCH') {
      peticiones.patches.push((req.postDataJSON() ?? {}) as Record<string, unknown>);
      return json(route, [{ id: STUDIO_ID }]);
    }
    return json(route, {
      id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', color_primario: '#4F46E5',
      owner_auth_user_id: AUTH_UID, bienvenida_vista_en: null,
      ...estudio,
    });
  });
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/api/onboarding/configurar', route => {
    peticiones.configurar.push(route.request().postDataJSON() as Record<string, unknown>);
    return json(route, { ok: true, salas: 1, tiposClase: 2, planes: 0 });
  });
  await page.route('**/api/onboarding/ayuda-alta', async route => {
    const cuerpo = route.request().postDataJSON() as Record<string, unknown>;
    peticiones.ayuda.push(cuerpo);
    if (ayuda) return ayuda(route, cuerpo);
    return json(route, { ok: true, guardada: cuerpo.ayuda === 'Prefiero que me llamen' });
  });

  if (antes) await antes(page);
  await page.goto('/dashboard');
  return peticiones;
}

/** Salta la pantalla del logo y llega a la primera del asistente. */
export async function saltarLogo(page: Page) {
  await page.getByRole('button', { name: 'Saltar', exact: true }).click({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Cuéntanos de tu estudio' })).toBeVisible();
}

/** Pantalla 1 → 3 con «Continuar». */
export async function irAlCierre(page: Page) {
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Tus clases y tu sala' })).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Antes de entrar' })).toBeVisible();
}
