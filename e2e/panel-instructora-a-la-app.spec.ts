import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Tentare Core retirado (paso 2, decisión del fundador 14-sep-2026): quien
// entra al panel con rol INSTRUCTOR en la sede activa acaba en la app de su
// estudio. Lo que se fija aquí:
//   · la instructora que abre el panel —o un enlace viejo a una pantalla suya—
//     termina en `/portal/<slug>/…`;
//   · recepción, que también da clases, se queda en el panel (el rol mínimo
//     mientras carga también es INSTRUCTOR: no se la puede echar por eso);
//   · si en otra sede gestiona, elige entre abrir la app o cambiar de sede.
//
// Andamiaje: el mismo que `instructora-no-ve-la-caja.spec.ts`.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const UID_DUENA = 'auth-e2e-duena';
const UID_INSTRUCTORA = 'auth-e2e-instructora';
const UID_RECEPCION = 'auth-e2e-recepcion';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: UID_DUENA, email: 'cloe@example.com', moneda: 'EUR',
};

const EQUIPO = [
  { id: 'ins-marta', studio_id: STUDIO_ID, nombre: 'Marta Sanz', activo: true, rol: 'INSTRUCTOR',
    color: '#F7A6C4', auth_user_id: UID_INSTRUCTORA, email: 'marta@example.com', telefono: null },
  { id: 'ins-sara', studio_id: STUDIO_ID, nombre: 'Sara Gil', activo: true, rol: 'RECEPCION',
    color: '#2C352C', auth_user_id: UID_RECEPCION, email: 'sara@example.com', telefono: null },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesion(page: Page, uid: string, email: string) {
  await page.addInitScript(([key, id, mail]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id, email: mail, aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, uid, email] as const);
}

// `mis_estudios()` es quien CONFIRMA el rol: sin esta fila no se saca a nadie del panel.
const SEDE_INSTRUCTORA = { id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro', ciudad: null, rol: 'INSTRUCTOR' };

async function mockBackend(page: Page, sedes: unknown[] = [SEDE_INSTRUCTORA]) {
  const intentos = { misEstudios: 0 };
  // Playwright resuelve en orden INVERSO al de registro: el genérico va primero.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/instructores**', route => json(route, EQUIPO));
  await page.route('**/rest/v1/rpc/mis_estudios', route => {
    intentos.misEstudios++;
    return json(route, sedes);
  });
  return intentos;
}

test.describe('Tentare Core retirado: la instructora va a la app del estudio', () => {
  test('la instructora que abre el panel acaba en la app de su estudio', async ({ page }) => {
    const intentos = await mockBackend(page);
    await seedSesion(page, UID_INSTRUCTORA, 'marta@example.com');
    await page.goto('/dashboard');

    await expect(page).toHaveURL(/\/portal\/pilates-centro\//, { timeout: 30_000 });
    // Decidió con sus sedes delante, no por defecto.
    expect(intentos.misEstudios).toBeGreaterThan(0);
  });

  test('un enlace viejo a una pantalla suya del panel también la lleva a la app', async ({ page }) => {
    await mockBackend(page);
    await seedSesion(page, UID_INSTRUCTORA, 'marta@example.com');
    await page.goto('/calendario?sesion=ses-1');

    await expect(page).toHaveURL(/\/portal\/pilates-centro\//, { timeout: 30_000 });
  });

  test('recepción, que también puede dar clases, se queda en el panel', async ({ page }) => {
    await mockBackend(page);
    await seedSesion(page, UID_RECEPCION, 'sara@example.com');
    await page.goto('/dashboard');

    await expect(page.getByRole('link', { name: /^Inicio/ }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByTestId('puerta-app-instructora')).toHaveCount(0);
  });

  test('si en otra sede lleva la gestión, elige entre abrir la app o cambiar de sede', async ({ page }) => {
    const intentos = await mockBackend(page, [
      SEDE_INSTRUCTORA,
      { id: 'studio-norte', nombre: 'Pilates Norte', slug: 'pilates-norte', ciudad: null, rol: 'MANAGER' },
    ]);
    await seedSesion(page, UID_INSTRUCTORA, 'marta@example.com');
    await page.goto('/dashboard');

    const puerta = page.getByTestId('puerta-app-instructora');
    await expect(puerta).toBeVisible({ timeout: 30_000 });
    await expect(puerta.getByRole('link', { name: 'Abrir la app de Pilates Centro', exact: true }))
      .toHaveAttribute('href', '/portal/pilates-centro/equipo');
    await expect(puerta.getByRole('button', { name: /Sede activa: Pilates Centro/ })).toBeVisible();
    // No se la saca del panel sin dejarla elegir, ni se le enseña el panel.
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('link', { name: /^Inicio/ })).toHaveCount(0);
    expect(intentos.misEstudios).toBeGreaterThan(0);
  });

  test('si la BD no confirma que es instructora aquí, no la saca del panel: le pide recargar', async ({ page }) => {
    // El caso real: falla la lectura del equipo y el cliente resuelve el rol
    // mínimo (INSTRUCTOR) a una gerente o a recepción. `mis_estudios()` dice otra cosa.
    const intentos = await mockBackend(page, [{ ...SEDE_INSTRUCTORA, rol: 'MANAGER' }]);
    await seedSesion(page, UID_INSTRUCTORA, 'marta@example.com');
    await page.goto('/dashboard');

    await expect(page.getByTestId('puerta-sin-confirmar')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Recargar', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard/);
    expect(intentos.misEstudios).toBeGreaterThan(0);
  });
});
