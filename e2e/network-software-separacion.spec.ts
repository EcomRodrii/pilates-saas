import { test, expect, type Page, type Route } from '@playwright/test';
import { fragmentoDeRecuperacion, tokenDeSesion } from './enlace-de-correo';
import { ACCESO_NETWORK_EN_MANTENIMIENTO } from '../lib/network/mantenimiento';

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

// Los tests que rellenan el formulario de /network/acceso no tienen qué
// rellenar mientras esa puerta esté en mantenimiento: se saltan, no se
// borran, y vuelven a correr solos en cuanto el interruptor pase a `false`.
const MOTIVO_ACCESO_CERRADO =
  'Login de Tentare Network en mantenimiento desde el 29-sep-2026 (decisión del fundador): '
  + '/network/acceso enseña el aviso y no el formulario. Vuelve a correr cuando '
  + 'ACCESO_NETWORK_EN_MANTENIMIENTO (lib/network/mantenimiento.ts) sea false.';

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
    test.skip(ACCESO_NETWORK_EN_MANTENIMIENTO, MOTIVO_ACCESO_CERRADO);
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
    test.skip(ACCESO_NETWORK_EN_MANTENIMIENTO, MOTIVO_ACCESO_CERRADO);
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
    test.skip(ACCESO_NETWORK_EN_MANTENIMIENTO, MOTIVO_ACCESO_CERRADO);
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

test.describe('Login y alta de Network en mantenimiento (29-sep-2026)', () => {
  // La otra cara de los test.skip de arriba: mientras las dos puertas estén
  // cerradas, lo que se ve es el aviso y NINGÚN formulario — si una de ellas
  // volviera a pintar el login o el alta sin haber tocado el interruptor, la
  // decisión del fundador se estaría saltando en producción.
  test.beforeEach(async ({ page }) => {
    test.skip(!ACCESO_NETWORK_EN_MANTENIMIENTO, 'Las puertas de Network están abiertas: no hay aviso que comprobar.');
    await page.route('**/rest/v1/**', route => json(route, []));
  });

  test('/network/acceso enseña el aviso, sin formulario, y manda a Software a /login', async ({ page }) => {
    await page.goto('/network/acceso');

    await expect(page.getByRole('heading', { name: 'Estamos en mantenimiento' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('El acceso a Tentare Network está temporalmente cerrado.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'inicia sesión aquí' })).toHaveAttribute('href', '/login');
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Continuar con Google/ })).toHaveCount(0);
  });

  test('/network/crear-perfil sin sesión enseña el aviso en vez del alta', async ({ page }) => {
    await page.goto('/network/crear-perfil');

    await expect(page.getByRole('heading', { name: 'Estamos en mantenimiento' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('La creación de perfiles nuevos en Tentare Network está temporalmente cerrada.')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Continuar con Google/ })).toHaveCount(0);
  });
});

test.describe('/clave-nueva manda a donde la cuenta pertenece de verdad, no siempre al dashboard', () => {
  // Bug independiente, misma familia: antes de este cambio, terminar de fijar
  // la contraseña nueva mandaba SIEMPRE a /dashboard con un setTimeout fijo,
  // sin mirar si la cuenta era de Network. Recuperar la contraseña no es
  // "entrar en" ningún producto (se demuestra controlar el correo), así que
  // esta ruta usa la resolución SIN GATE — nunca "cuenta-de-otro-producto".
  //
  // ⚠️ FE-02 (auditoría 23-sep): esta pantalla ya no acepta CUALQUIER sesión
  // — exige haber visto el evento `PASSWORD_RECOVERY` de gotrue. Sembrar la
  // sesión a mano en localStorage (como hacía este test antes) simulaba
  // exactamente la sesión "cualquiera" que el arreglo dejó de aceptar. La
  // forma real de llegar aquí es el enlace mágico con el fragmento
  // `#access_token=…&type=recovery`, que gotrue-js parsea SOLO porque
  // `/clave-nueva` está en `RUTAS_RETORNO_AUTH_STAFF` y dispara
  // `PASSWORD_RECOVERY` — sin llamar a la red para nada más que
  // `GET /auth/v1/user` (ya mockeado). El token tiene la forma de uno de
  // gotrue porque la pantalla lo lee: ver e2e/enlace-de-correo.ts.
  test('una cuenta de Network termina en /network/inicio, no en /dashboard', async ({ page }) => {
    await page.route('**/rest/v1/**', route => json(route, []));
    await page.route('**/auth/v1/user**', route => json(route, sesionOk('red@example.com').user));
    await page.route('**/api/auth/destino-post-login**', route => {
      // Sin `producto`: la resolución ungated, no la que bloquea por producto.
      expect(new URL(route.request().url()).searchParams.has('producto')).toBe(false);
      return json(route, { destino: '/network/inicio' });
    });

    await page.goto(`/clave-nueva#${fragmentoDeRecuperacion(tokenDeSesion('auth-e2e-usuario'))}`);
    await page.getByPlaceholder('Contraseña nueva').fill('unaClaveLarga1');
    await page.getByPlaceholder('Repite la contraseña').fill('unaClaveLarga1');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click({ timeout: 30_000 });

    await page.waitForURL(/\/network\/inicio/, { timeout: 30_000, waitUntil: 'commit' });
  });
});
