import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Tentare Software y Tentare Network como dos productos independientes
// (2026-08-19) — sin selector, sin sesión compartida, sin auto-login cruzado.
// El contexto (la página por la que se entra) decide el producto, nunca la
// identidad.
//
// El bug real que motivó esto: `/api/auth/destino-post-login` resolvía "¿a
// dónde pertenece esta cuenta?" mirando solo si tenía estudio, sin saber por
// qué puerta se había llamado. Una identidad dual (self-claim: ficha de
// instructora de Software + perfil de Network) entrando por /network/acceso
// acababa SIEMPRE en /dashboard. Y una cuenta de un solo producto entrando
// por la puerta del otro no se bloqueaba: se le redirigía en silencio a donde
// sí tenía algo, lo cual "acertaba" el destino pero por una puerta que el
// encargo pide tratar como bloqueada, no como un router universal.
//
// Estos tests mockean `/api/auth/destino-post-login` directamente (en vez de
// las llamadas a Supabase que hace SERVIDOR→Supabase dentro de esa ruta,
// invisibles a page.route: solo intercepta lo que pide el NAVEGADOR). La
// lógica de resolución en sí ya está probada exhaustivamente en
// lib/network/routing-post-login.test.ts; aquí se prueba que cada PÁGINA
// reacciona correctamente a lo que esa ruta devuelve — que es justo donde
// vivía el bug.
// ─────────────────────────────────────────────────────────────────────────────

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Respuesta real de gotrue para un login por contraseña que sale bien. */
function sesionOk(email: string, id = 'auth-e2e-usuario') {
  return {
    access_token: 'e2e-fake-token', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'e2e-fake-refresh',
    user: {
      id, email, aud: 'authenticated', role: 'authenticated',
      app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
    },
  };
}

async function mockLoginOk(page: Page, email: string) {
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/auth/v1/token**', route => json(route, sesionOk(email)));
  // El bloqueo cierra la sesión que se acaba de abrir (supabase.auth.signOut()).
  await page.route('**/auth/v1/logout**', route => route.fulfill({ status: 204, body: '' }));
}

test.describe('Bloqueo cruzado al iniciar sesión (TEST 5 / TEST 6 del encargo)', () => {
  test('credenciales de Network en /login: mensaje claro, nunca el dashboard', async ({ page }) => {
    await mockLoginOk(page, 'instructora@example.com');
    await page.route('**/api/auth/destino-post-login**', route => {
      expect(new URL(route.request().url()).searchParams.get('producto')).toBe('software');
      return json(route, { tipo: 'cuenta-de-otro-producto' });
    });

    await page.goto('/login');
    await page.getByLabel('Email').fill('instructora@example.com');
    await page.getByLabel('Contraseña').fill('unaClaveLarga1');
    await page.getByRole('button', { name: 'Entrar' }).click({ timeout: 30_000 });

    await expect(page.getByRole('heading', { name: 'Esta cuenta es de Tentare Network' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Ir a Tentare Network' })).toHaveAttribute('href', '/network/acceso');
    // Nunca se queda en el panel de Software con esta identidad.
    await expect(page).not.toHaveURL(/\/dashboard/);
  });

  test('credenciales de Software en /network/acceso: mensaje claro, nunca el autoservicio', async ({ page }) => {
    await mockLoginOk(page, 'propietaria@example.com');
    await page.route('**/api/auth/destino-post-login**', route => {
      expect(new URL(route.request().url()).searchParams.get('producto')).toBe('network');
      return json(route, { tipo: 'cuenta-de-otro-producto' });
    });

    await page.goto('/network/acceso');
    await page.locator('input[type="email"]').fill('propietaria@example.com');
    await page.locator('input[type="password"]').fill('unaClaveLarga1');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click({ timeout: 30_000 });

    await expect(page.getByText('Esta cuenta es de Tentare Software')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Ir a Tentare Software' }).last()).toHaveAttribute('href', '/login');
    await expect(page).not.toHaveURL(/\/network\/(inicio|reanudar)/);
  });
});

test.describe('Identidad dual (self-claim): cada puerta respeta lo suyo', () => {
  // El bug real encontrado auditando: una instructora con ficha de Software Y
  // perfil de Network, entrando por /network/acceso, acababa SIEMPRE en
  // /dashboard — la resolución vieja miraba "¿tiene estudio?" antes que nada.
  test('entra a Software por /login', async ({ page }) => {
    await mockLoginOk(page, 'dual@example.com');
    await page.route('**/api/auth/destino-post-login**', route => json(route, { tipo: 'entra', destino: '/dashboard' }));

    await page.goto('/login');
    await page.getByLabel('Email').fill('dual@example.com');
    await page.getByLabel('Contraseña').fill('unaClaveLarga1');
    await page.getByRole('button', { name: 'Entrar' }).click({ timeout: 30_000 });

    await page.waitForURL(/\/dashboard/, { timeout: 30_000, waitUntil: 'commit' });
  });

  test('la MISMA identidad entra a Network por /network/acceso, no al dashboard', async ({ page }) => {
    await mockLoginOk(page, 'dual@example.com');
    await page.route('**/api/auth/destino-post-login**', route => json(route, { tipo: 'entra', destino: '/network/inicio' }));

    await page.goto('/network/acceso');
    await page.locator('input[type="email"]').fill('dual@example.com');
    await page.locator('input[type="password"]').fill('unaClaveLarga1');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click({ timeout: 30_000 });

    await page.waitForURL(/\/network\/inicio/, { timeout: 30_000, waitUntil: 'commit' });
  });
});

test.describe('El contexto de Google se conserva por producto', () => {
  // Antes, signInWithGoogle() siempre volvía a /login (única ruta que sabía
  // leer el fragmento de la vuelta de OAuth) — cualquier alta/entrada por
  // Google desde Network se procesaba con la lógica de Software. Se prueba
  // que cada botón pide a gotrue el redirect_to correcto, sin necesidad de
  // completar el viaje real a Google.
  test('el botón de Google en /network/acceso pide volver a /network/acceso', async ({ page }) => {
    await page.route('**/rest/v1/**', route => json(route, []));
    let redirectTo: string | null = null;
    await page.route('**/auth/v1/authorize**', route => {
      redirectTo = new URL(route.request().url()).searchParams.get('redirect_to');
      return json(route, { url: 'https://accounts.google.com/o/oauth2/mock' });
    });

    await page.goto('/network/acceso');
    await page.getByRole('button', { name: /Continuar con Google/ }).click({ timeout: 30_000 });

    await expect.poll(() => redirectTo).toContain('/network/acceso');
  });

  test('el botón de Google en /login pide volver a /login', async ({ page }) => {
    await page.route('**/rest/v1/**', route => json(route, []));
    let redirectTo: string | null = null;
    await page.route('**/auth/v1/authorize**', route => {
      redirectTo = new URL(route.request().url()).searchParams.get('redirect_to');
      return json(route, { url: 'https://accounts.google.com/o/oauth2/mock' });
    });

    await page.goto('/login');
    await page.getByRole('button', { name: /Continuar con Google/ }).click({ timeout: 30_000 });

    await expect.poll(() => redirectTo).toContain('/login');
    expect(redirectTo, 'el retorno de Network no debe colarse en el de Software').not.toContain('/network');
  });
});

test.describe('/clave-nueva manda a donde la cuenta pertenece de verdad, no siempre al dashboard', () => {
  // Bug independiente, misma familia: antes de este cambio, terminar de fijar
  // la contraseña nueva mandaba SIEMPRE a /dashboard con un setTimeout fijo,
  // sin mirar si la cuenta era de Network. Recuperar la contraseña no es
  // "entrar en" ningún producto (se demuestra controlar el correo), así que
  // esta ruta usa la resolución SIN GATE — nunca "cuenta-de-otro-producto".
  const STORAGE_KEY = 'sb-example-auth-token';

  async function seedSesion(page: Page, email: string) {
    await page.addInitScript(({ key, email }) => {
      localStorage.setItem(key, JSON.stringify({
        access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
        expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
        user: {
          id: 'auth-e2e-network', email, aud: 'authenticated', role: 'authenticated',
          app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
        },
      }));
    }, { key: STORAGE_KEY, email });
  }

  test('una cuenta de Network termina en /network/inicio, no en /dashboard', async ({ page }) => {
    await page.route('**/rest/v1/**', route => json(route, []));
    await page.route('**/auth/v1/user**', route => json(route, sesionOk('red@example.com').user));
    await page.route('**/api/auth/destino-post-login**', route => {
      // Sin `producto`: la resolución ungated, no la que bloquea por producto.
      expect(new URL(route.request().url()).searchParams.has('producto')).toBe(false);
      return json(route, { destino: '/network/inicio' });
    });
    await seedSesion(page, 'red@example.com');

    await page.goto('/clave-nueva');
    await page.getByPlaceholder('Contraseña nueva').fill('unaClaveLarga1');
    await page.getByPlaceholder('Repite la contraseña').fill('unaClaveLarga1');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click({ timeout: 30_000 });

    await page.waitForURL(/\/network\/inicio/, { timeout: 30_000, waitUntil: 'commit' });
  });
});
