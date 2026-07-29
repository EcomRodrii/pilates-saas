import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Los callejones sin salida que quedaban en el acceso.
//
// **1. Confirmar el email.** El proyecto lo exige (se activó para cerrar un
// account-takeover). Al intentar entrar sin confirmar, la aplicación decía
// "busca nuestro correo, mira también en spam" — y nada más. Si el correo no
// llegó, se borró, o el enlace caducó, no había NADA que hacer desde dentro:
// un callejón sin salida en la primera pantalla del producto.
//
// **2. Dar de alta a alguien del equipo interno** obligaba a que esa persona
// hubiera entrado antes en Tentare por su cuenta. Para montar tu propio equipo
// eso es un ida y vuelta absurdo: quien da de alta quiere crear la cuenta,
// pasar las credenciales, y que la otra persona entre.
// ─────────────────────────────────────────────────────────────────────────────

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesion(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('sb-example-auth-token', JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: 'u-marco', email: 'marco@tentare.app', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  });
}

test.describe('Entrar sin confirmar el email deja de ser un callejón sin salida', () => {
  test('ofrece reenviar el correo, y solo cuando el problema es ese', async ({ page }) => {
    await page.route('**/rest/v1/**', route => json(route, []));
    await page.route('**/auth/v1/token**', route =>
      json(route, { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' }, 400));

    await page.goto('/login');
    await page.getByLabel('Email').fill('nueva@ejemplo.com');
    await page.getByLabel('Contraseña').fill('miContrasena1');
    await page.getByRole('button', { name: 'Entrar' }).click({ timeout: 30_000 });

    await expect(page.getByText(/Te falta confirmar tu email/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reenviarme el correo de confirmación' })).toBeVisible();
  });

  test('con la contraseña mal NO se ofrece reenviar nada', async ({ page }) => {
    // El control. Sin esto, el test anterior pasaría igual si el botón
    // estuviera siempre visible — y un botón que invita a pulsarlo a quien no
    // lo necesita gasta el límite de correos del proyecto para todos.
    await page.route('**/rest/v1/**', route => json(route, []));
    await page.route('**/auth/v1/token**', route =>
      json(route, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400));

    await page.goto('/login');
    await page.getByLabel('Email').fill('quien@ejemplo.com');
    await page.getByLabel('Contraseña').fill('loQueSea1');
    await page.getByRole('button', { name: 'Entrar' }).click({ timeout: 30_000 });

    await expect(page.getByText('Email o contraseña incorrectos')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reenviarme el correo de confirmación' })).toHaveCount(0);
  });

  test('al reenviarlo, lo dice con la dirección concreta', async ({ page }) => {
    let pedido = false;
    await page.route('**/rest/v1/**', route => json(route, []));
    await page.route('**/auth/v1/token**', route =>
      json(route, { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' }, 400));
    await page.route('**/auth/v1/resend**', route => { pedido = true; return json(route, {}); });

    await page.goto('/login');
    await page.getByLabel('Email').fill('nueva@ejemplo.com');
    await page.getByLabel('Contraseña').fill('miContrasena1');
    await page.getByRole('button', { name: 'Entrar' }).click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Reenviarme el correo de confirmación' }).click();

    await expect(page.getByText(/reenviado el correo de confirmación a nueva@ejemplo\.com/)).toBeVisible();
    expect(pedido, 'la petición de reenvío tiene que salir de verdad').toBe(true);
  });
});

test.describe('Crear la cuenta de alguien del equipo desde el panel', () => {
  const MARCO = {
    userId: 'u-marco', email: 'marco@tentare.app', nombre: 'Marco', cargo: 'Fundador',
    activo: true, creadoEn: '2026-01-01T00:00:00Z', ultimoAcceso: '2026-07-29T08:00:00Z',
    permisos: ['admin.full'],
  };

  async function mockPanel(page: Page, alAlta: (body: Record<string, unknown>) => unknown) {
    await page.route('**/rest/v1/**', route => json(route, []));
    await page.route('**/api/interno/sesion**', route =>
      json(route, { nombre: 'Marco', cargo: 'Fundador', email: 'marco@tentare.app', permisos: ['admin.full'] }));
    await page.route('**/api/interno/equipo**', route => {
      if (route.request().method() === 'GET') return json(route, { equipo: [MARCO], yo: 'u-marco' });
      return json(route, alAlta(route.request().postDataJSON()));
    });
  }

  test('la contraseña inicial viaja con el alta y luego se enseña qué entregar', async ({ page }) => {
    let enviado: Record<string, unknown> | null = null;
    await mockPanel(page, body => { enviado = body; return { ok: true, userId: 'u-nuevo', cuentaCreada: true }; });
    await seedSesion(page);
    await page.goto('/interno/equipo');

    await page.getByRole('button', { name: 'Añadir a alguien' }).click({ timeout: 30_000 });
    await page.getByPlaceholder('Email').fill('alex@tentare.app');
    await page.getByPlaceholder('Nombre').fill('Álex');
    await page.getByPlaceholder('Cargo (opcional)').fill('Soporte');
    await page.getByPlaceholder(/Contraseña inicial/).fill('unaClaveInicial1');
    await page.getByRole('checkbox', { name: /Ver estudios y su ficha/ }).check();
    await page.getByRole('button', { name: 'Dar de alta' }).click();

    // Lo que hay que entregarle, junto y copiable. Si la pantalla se limpiase y
    // dijera "hecho", la contraseña se pierde: no se puede volver a ver.
    const cred = page.getByTestId('credenciales');
    await expect(cred).toBeVisible();
    await expect(cred).toContainText('alex@tentare.app');
    await expect(cred).toContainText('unaClaveInicial1');
    await expect(cred).toContainText('tentare.app/login');
    await expect(cred).toContainText(/no se puede volver a ver/);

    expect(enviado).toMatchObject({ email: 'alex@tentare.app', password: 'unaClaveInicial1' });
  });

  test('si el email YA tenía cuenta, no se enseña ninguna credencial', async ({ page }) => {
    // Se enlaza la cuenta que ya existe y la contraseña escrita se ignora.
    // Enseñarla como "sus credenciales" sería mentir: no es su contraseña.
    await mockPanel(page, () => ({ ok: true, userId: 'u-existente', cuentaCreada: false }));
    await seedSesion(page);
    await page.goto('/interno/equipo');

    await page.getByRole('button', { name: 'Añadir a alguien' }).click({ timeout: 30_000 });
    await page.getByPlaceholder('Email').fill('meri@tentare.app');
    await page.getByPlaceholder('Nombre').fill('Meri');
    await page.getByPlaceholder(/Contraseña inicial/).fill('estaSeIgnora1');
    await page.getByRole('checkbox', { name: /Ver estudios y su ficha/ }).check();
    await page.getByRole('button', { name: 'Dar de alta' }).click();

    await expect(page.getByTestId('credenciales')).toHaveCount(0);
    await expect(page.getByText('estaSeIgnora1')).toHaveCount(0);
  });

  test('el error del servidor se enseña tal cual', async ({ page }) => {
    await mockPanel(page, () => ({ error: 'x' }));
    await page.route('**/api/interno/equipo', route => {
      if (route.request().method() !== 'POST') return route.fallback();
      return json(route, {
        error: 'alex@tentare.app no tiene cuenta todavía. Ponle una contraseña inicial de al menos 8 caracteres y se la creamos aquí mismo.',
      }, 400);
    });
    await seedSesion(page);
    await page.goto('/interno/equipo');

    await page.getByRole('button', { name: 'Añadir a alguien' }).click({ timeout: 30_000 });
    await page.getByPlaceholder('Email').fill('alex@tentare.app');
    await page.getByPlaceholder('Nombre').fill('Álex');
    await page.getByRole('checkbox', { name: /Ver estudios y su ficha/ }).check();
    await page.getByRole('button', { name: 'Dar de alta' }).click();

    await expect(page.getByText(/Ponle una contraseña inicial de al menos 8 caracteres/)).toBeVisible();
  });
});
