import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// No se podía cambiar la contraseña. Dos agujeros distintos, los dos reales.
//
// **1. El cambio desde Configuración estaba roto para TODO EL MUNDO.**
// `updatePassword` reautentica con `signInWithPassword` antes de aceptar la
// nueva. Eso es una llamada de auth más, y el captcha se exige a nivel de
// PROYECTO en Supabase, no por pantalla. Comprobado contra producción:
//
//     POST /auth/v1/token?grant_type=password  (sin captcha_token)
//     → {"error_code":"captcha_failed","msg":"captcha protection: request disallowed"}
//
// Como el código mapeaba CUALQUIER fallo de la reautenticación a "La contraseña
// actual no es correcta", escribías tu contraseña buena y la aplicación te
// acusaba de equivocarte. Una y otra vez.
//
// **2. No había forma de recuperarla si no podías entrar.**
// `resetPasswordForEmail` no se llamaba desde ningún sitio del código y
// `/login` no ofrecía "he olvidado mi contraseña". La clienta sí lo tenía
// (/portal/[slug]/acceso); la propietaria de un estudio se quedaba fuera de su
// propio negocio, y la única salida era el panel de Supabase — cuyo enlace
// además dejaba a la persona en la raíz del sitio, con el token ya gastado y
// sin ninguna pantalla donde escribir la nueva.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesion(page: Page) {
  await page.addInitScript(key => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: 'auth-e2e-duena', email: 'cloe@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, STORAGE_KEY);
}

test.describe('Se puede recuperar la contraseña sin poder entrar', () => {
  test('la pantalla de login ofrece «he olvidado mi contraseña»', async ({ page }) => {
    // Lo que faltaba y dejaba a una propietaria fuera de su propio negocio.
    await page.route('**/rest/v1/**', route => json(route, []));
    await page.goto('/login');

    await expect(page.getByRole('button', { name: 'He olvidado mi contraseña' }))
      .toBeVisible({ timeout: 30_000 });
  });

  test('sin email escrito, dice qué hacer en vez de no hacer nada', async ({ page }) => {
    await page.route('**/rest/v1/**', route => json(route, []));
    await page.goto('/login');

    await page.getByRole('button', { name: 'He olvidado mi contraseña' }).click({ timeout: 30_000 });
    await expect(page.getByText('Escribe tu email arriba y vuelve a pulsar.')).toBeVisible();
  });

  test('pide el enlace y NO revela si ese email tiene cuenta', async ({ page }) => {
    // Decir "no existe esa cuenta" convertiría el login en una forma de
    // averiguar quién es cliente de Tentare.
    let pedido: Record<string, unknown> | null = null;
    await page.route('**/rest/v1/**', route => json(route, []));
    await page.route('**/auth/v1/recover**', route => {
      pedido = route.request().postDataJSON();
      return json(route, {});
    });
    await page.goto('/login');

    await page.getByLabel('Email').fill('quien.sea@ejemplo.com');
    await page.getByRole('button', { name: 'He olvidado mi contraseña' }).click({ timeout: 30_000 });

    await expect(page.getByText(/Si hay una cuenta con quien\.sea@ejemplo\.com/)).toBeVisible();
    await expect(page.getByText(/un solo uso y caduca/)).toBeVisible();
    // Ni "no existe", ni "te hemos enviado" en firme.
    await expect(page.getByText(/no existe|no está registrad/i)).toHaveCount(0);
    expect(pedido, 'la petición de recuperación tiene que salir').not.toBeNull();
  });

  test('el enlace lleva a /clave-nueva, que es la única pantalla que sabe recogerlo', async ({ page }) => {
    let redirect: string | null = null;
    await page.route('**/rest/v1/**', route => json(route, []));
    await page.route('**/auth/v1/recover**', route => {
      redirect = new URL(route.request().url()).searchParams.get('redirect_to');
      return json(route, {});
    });
    await page.goto('/login');

    await page.getByLabel('Email').fill('cloe@example.com');
    await page.getByRole('button', { name: 'He olvidado mi contraseña' }).click({ timeout: 30_000 });
    await expect(page.getByText(/Si hay una cuenta/)).toBeVisible();

    expect(redirect, 'sin redirect_to el enlace deja a la persona en la raíz sin dónde escribir')
      .toContain('/clave-nueva');
  });
});

test.describe('La pantalla de contraseña nueva', () => {
  test('con la sesión del enlace, deja fijarla sin pedir la actual', async ({ page }) => {
    // Quien llega ya ha demostrado que controla el correo. Pedirle la actual
    // sería absurdo: no se la sabe, por eso está aquí.
    await page.route('**/rest/v1/**', route => json(route, []));
    await seedSesion(page);
    await page.goto('/clave-nueva');

    await expect(page.getByText('Elige tu contraseña nueva')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('cloe@example.com')).toBeVisible();
    await expect(page.getByPlaceholder('Contraseña nueva')).toBeVisible();
    await expect(page.getByPlaceholder(/actual/i)).toHaveCount(0);
  });

  test('avisa si las contraseñas no coinciden, antes de llamar a nadie', async ({ page }) => {
    await page.route('**/rest/v1/**', route => json(route, []));
    await seedSesion(page);
    await page.goto('/clave-nueva');

    await page.getByPlaceholder('Contraseña nueva').fill('unaClaveLarga1');
    await page.getByPlaceholder('Repite la contraseña').fill('otraDistinta1');
    await page.getByRole('button', { name: 'Guardar contraseña' }).click({ timeout: 30_000 });

    await expect(page.getByText('Las contraseñas no coinciden.')).toBeVisible();
  });

  test('un enlace ya gastado no enseña un formulario que va a fallar', async ({ page }) => {
    // Son de un solo uso y caducan, y el escáner de enlaces del correo los
    // consume solo. Sin sesión hay que decirlo y dar la salida, no dejar un
    // formulario que reviente al pulsar Guardar.
    await page.route('**/rest/v1/**', route => json(route, []));
    await page.goto('/clave-nueva');

    await expect(page.getByText(/Este enlace ya no vale/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Pedir otro enlace' })).toBeVisible();
    await expect(page.getByPlaceholder('Contraseña nueva')).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// El bug que dejó al fundador sin poder cambiar su propia contraseña.
//
// La reautenticación se rechazaba por captcha, pero el código contaba
// CUALQUIER fallo de esa llamada como "La contraseña actual no es correcta".
// Escribías tu contraseña buena y la aplicación te acusaba de equivocarte, sin
// ninguna pista de que el problema era otro.
//
// Aquí se fuerza justo esa respuesta de gotrue y se comprueba que ya no se
// traduce a una acusación falsa.
// ─────────────────────────────────────────────────────────────────────────────
const STUDIO_ID = 'studio-test';

test.describe('Un fallo de captcha ya no se cuenta como contraseña equivocada', () => {
  test('el mensaje habla de la verificación, no de tu contraseña', async ({ page }) => {
    await page.route('**/api/**', route => json(route, {}));
    await page.route('**/api/layout**', route =>
      json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
    await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
    await page.route('**/api/theme**', route =>
      json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
    await page.route('**/rest/v1/**', route => json(route, []));
    await page.route('**/rest/v1/studios**', route =>
      json(route, { id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
        owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR' }));
    await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

    // Exactamente lo que devuelve gotrue en producción con Turnstile activo y
    // sin token — comprobado con una sonda contra el proyecto real.
    await page.route('**/auth/v1/token**', route =>
      json(route, {
        code: 400, error_code: 'captcha_failed',
        msg: 'captcha protection: request disallowed (no captcha_token found)',
      }, 400));

    await seedSesion(page);
    await page.goto('/configuracion?tab=perfil');

    await page.getByRole('button', { name: 'Cambiar contraseña' }).waitFor({ timeout: 60_000 });
    const claves = page.locator('input[type="password"]');
    await claves.nth(0).fill('miContrasenaBuena');
    await claves.nth(1).fill('unaNuevaLarga1');
    await claves.nth(2).fill('unaNuevaLarga1');
    await page.getByRole('button', { name: 'Cambiar contraseña' }).click();

    // Lo que decía antes, y era mentira.
    await expect(page.getByText('La contraseña actual no es correcta.')).toHaveCount(0);
    await expect(page.getByText(/no eres un robot/i)).toBeVisible();
  });
});
