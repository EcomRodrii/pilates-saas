import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Dar de alta a alguien en el backoffice era SQL escrito a mano.
//
// Consecuencia práctica: no se hacía nunca. Nadie revisa trimestralmente una
// tabla que solo se toca abriendo un editor de consultas, así que `users.create`
// y `users.delete` eran permisos declarados que no cerraban ninguna puerta, y
// `PRESETS` / `PERMISOS_SOLO_CEO` eran código muerto escrito para una pantalla
// que nunca se construyó.
//
// Las reglas de quién puede tocar el acceso de quién se prueban en
// `lib/interno/equipo-reglas.test.ts` (14 casos). Aquí se prueba lo otro: que la
// pantalla no OFREZCA lo que la API va a rechazar. Una casilla que puedes marcar
// y luego falla es peor que una casilla en gris.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sb-example-auth-token';

const MARCO = {
  userId: 'u-marco', email: 'marco@tentare.app', nombre: 'Marco', cargo: 'Fundador y CEO',
  activo: true, creadoEn: '2026-01-01T00:00:00Z', ultimoAcceso: '2026-07-28T10:00:00Z',
  permisos: ['admin.full'],
};
const MERI = {
  userId: 'u-meri', email: 'meri@tentare.app', nombre: 'Meri', cargo: 'Cofundadora',
  activo: true, creadoEn: '2026-01-01T00:00:00Z', ultimoAcceso: '2026-07-27T10:00:00Z',
  permisos: ['studios.read', 'billing.read', 'marketing.send', 'crm.update', 'logs.read'],
};
const ANTIGUO = {
  userId: 'u-viejo', email: 'alex@tentare.app', nombre: 'Álex', cargo: 'Soporte',
  activo: false, creadoEn: '2026-01-01T00:00:00Z', ultimoAcceso: '2026-02-01T10:00:00Z',
  permisos: ['studios.read'],
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesion(page: Page) {
  await page.addInitScript(key => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: 'u-marco', email: 'marco@tentare.app', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, STORAGE_KEY);
}

/** `permisos` son los de QUIEN MIRA: cambian lo que la pantalla ofrece. */
async function mockPanel(page: Page, permisos: string[], opts: { equipo?: unknown[] } = {}) {
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/api/interno/sesion**', route =>
    json(route, { nombre: 'Marco', cargo: 'Fundador', email: 'marco@tentare.app', permisos }));
  await page.route('**/api/interno/equipo**', route => {
    if (route.request().method() !== 'GET') return json(route, { ok: true, sinCambios: false });
    return json(route, { equipo: opts.equipo ?? [MARCO, MERI, ANTIGUO], yo: 'u-marco' });
  });
}

test.describe('La pantalla de equipo no ofrece lo que la API rechaza', () => {
  test('el CEO ve el equipo, quién puede tocar dinero y quién no entra', async ({ page }) => {
    await mockPanel(page, ['admin.full']);
    await seedSesion(page);
    await page.goto('/interno/equipo');

    await expect(page.getByRole('heading', { name: 'Equipo' })).toBeVisible({ timeout: 30_000 });
    // El titular no es "3 personas": es cuántas pueden tocar planes o dinero.
    await expect(page.getByText(/2 persona\(s\) con acceso.*1 de ellas pueden tocar planes o dinero/)).toBeVisible();
    await expect(page.getByTestId('miembro-u-meri')).toContainText('Cofundadora');
    // Las bajas no desaparecen, se separan.
    await expect(page.getByRole('heading', { name: 'De baja' })).toBeVisible();
    await expect(page.getByTestId('miembro-u-viejo')).toContainText('De baja');
  });

  test('nadie puede cambiarse su propio acceso, y se dice por qué', async ({ page }) => {
    await mockPanel(page, ['admin.full']);
    await seedSesion(page);
    await page.goto('/interno/equipo');

    const miFicha = page.getByTestId('miembro-u-marco');
    await expect(miFicha).toContainText('(tú)', { timeout: 30_000 });
    await expect(miFicha).toContainText('No puedes cambiar tu propio acceso');
    await expect(miFicha.getByRole('button', { name: 'Cambiar acceso' })).toHaveCount(0);
    // El control: a los demás sí se les puede cambiar, así que el botón existe.
    await expect(page.getByTestId('miembro-u-meri').getByRole('button', { name: 'Cambiar acceso' }))
      .toBeVisible();
  });

  test('con users.create NO se puede marcar admin.full: la escalada en un clic', async ({ page }) => {
    // El ataque que cierra esta pantalla: doy de alta a un cómplice como CEO, o
    // asciendo a alguien y entro por su cuenta. La casilla ni se puede marcar.
    await mockPanel(page, ['users.create', 'studios.read']);
    await seedSesion(page);
    await page.goto('/interno/equipo');

    await page.getByRole('button', { name: 'Añadir a alguien' }).click({ timeout: 30_000 });
    const total = page.getByRole('checkbox', { name: /Todos los permisos/ });
    await expect(total).toBeDisabled();
    await expect(page.getByRole('checkbox', { name: /Eliminar un estudio/ })).toBeDisabled();
    // Y lo que sí tiene, sí lo puede conceder.
    await expect(page.getByRole('checkbox', { name: /Ver estudios y su ficha/ })).toBeEnabled();
  });

  test('un preset que incluye permisos que no puedes conceder sale desactivado', async ({ page }) => {
    await mockPanel(page, ['users.create', 'studios.read']);
    await seedSesion(page);
    await page.goto('/interno/equipo');

    await page.getByRole('button', { name: 'Añadir a alguien' }).click({ timeout: 30_000 });
    // CEO = ['admin.full'] → imposible de conceder desde aquí.
    await expect(page.getByRole('button', { name: 'CEO', exact: true })).toBeDisabled();
    // Finanzas incluye billing.refund, que tampoco tiene.
    await expect(page.getByRole('button', { name: 'Finanzas', exact: true })).toBeDisabled();
  });

  test('el CEO sí puede conceder los permisos que no se delegan', async ({ page }) => {
    // El control del test anterior: sin esto, un test que solo comprueba
    // "está en gris" pasaría igual si estuviera en gris para todo el mundo.
    await mockPanel(page, ['admin.full']);
    await seedSesion(page);
    await page.goto('/interno/equipo');

    await page.getByRole('button', { name: 'Añadir a alguien' }).click({ timeout: 30_000 });
    await expect(page.getByRole('checkbox', { name: /Todos los permisos/ })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'CEO', exact: true })).toBeEnabled();
  });

  test('una cuenta que lleva meses sin entrar se señala sola', async ({ page }) => {
    // El trabajo real de esta pantalla no es dar de alta: es que mirarla
    // incomode. Un acceso al backoffice sin usar desde hace medio año sobra.
    const dormido = { ...MERI, ultimoAcceso: '2026-01-05T10:00:00Z' };
    await mockPanel(page, ['admin.full'], { equipo: [MARCO, dormido] });
    await seedSesion(page);
    await page.goto('/interno/equipo');

    await expect(page.getByText(/Sin entrar hace \d+ días/)).toBeVisible({ timeout: 30_000 });
  });

  test('el error del servidor se enseña tal cual, no se traduce a "algo ha fallado"', async ({ page }) => {
    await mockPanel(page, ['admin.full']);
    await page.route('**/api/interno/equipo', route => {
      if (route.request().method() !== 'POST') return route.fallback();
      return json(route, { error: 'nadie@ejemplo.com todavía no tiene cuenta en Tentare.' }, 404);
    });
    await seedSesion(page);
    await page.goto('/interno/equipo');

    await page.getByRole('button', { name: 'Añadir a alguien' }).click({ timeout: 30_000 });
    await page.getByPlaceholder('Email').fill('nadie@ejemplo.com');
    await page.getByPlaceholder('Nombre').fill('Nadie');
    await page.getByRole('checkbox', { name: /Ver estudios y su ficha/ }).check();
    await page.getByRole('button', { name: 'Dar de alta' }).click();

    await expect(page.getByText(/todavía no tiene cuenta en Tentare/)).toBeVisible();
  });
});
