import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Buscador global (⌘K) — grupo "Secciones". Hallazgo de la auditoría de
// cliente "Veredicto de Marta": escribir el nombre EXACTO de una sección del
// menú lateral a un clic de distancia ("Calendario", "Cobros") daba CERO
// resultados. El índice solo cubría entidades de negocio (socios/sesiones/
// recibos/instructores) y el catálogo de tareas-verbo de lib/tareas.ts, cuyas
// `claves` no incluyen el rótulo literal del menú — "Equipo" solo funcionaba
// por casualidad, como substring de "Añadir una instructora al equipo".
//
// Fix (#1288): grupo nuevo "Secciones" que busca sobre MODULOS
// (lib/nav-config.ts), con prioridad sobre las coincidencias parciales de
// TAREAS y filtrado por permiso — igual que el resto del buscador.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const HOY = '2026-08-20';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR',
};
const INSTRUCTORA = {
  id: 'ins-marta', studio_id: STUDIO_ID, nombre: 'Marta Sanz', activo: true, rol: 'INSTRUCTOR',
  color: '#F7A6C4', auth_user_id: 'auth-e2e-instructora', email: 'marta@example.com', telefono: null,
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedAuth(page: Page, uid: string, email: string) {
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

async function mockBackend(page: Page, { comoInstructora = false } = {}) {
  await page.clock.setFixedTime(new Date(`${HOY}T12:00:00`));
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  // Sin fila en instructores, useRol() cae a PROPIETARIO por owner_auth_user_id.
  await page.route('**/rest/v1/instructores**', route => json(route, comoInstructora ? [INSTRUCTORA] : []));
}

// El trigger real de /dashboard es el botón del Topbar ("¿Qué quieres hacer o
// buscar?"), montado con renderTrigger=false — DISTINTO del botón de icono
// con title="Buscar (⌘K)" que pinta el sidebar. Un selector por ese title
// falla en silencio (timeout) en cualquier pantalla que solo tenga el topbar.
async function abrirBuscador(page: Page) {
  await page.getByRole('button', { name: /Qué quieres hacer o buscar/ }).click({ timeout: 30_000 });
  const input = page.getByPlaceholder('¿Qué quieres hacer? O busca una clienta, clase o pago…');
  await expect(input).toBeVisible();
  return input;
}

test.describe('Buscador global (⌘K) — secciones del menú', () => {
  test('encuentra "Calendario" y "Cobros" por su nombre exacto y navega', async ({ page }) => {
    await mockBackend(page);
    await seedAuth(page, 'auth-e2e-duena', 'cloe@example.com');
    await page.goto('/dashboard');

    const input = await abrirBuscador(page);
    await input.fill('Calendario');
    await expect(page.getByText('Secciones')).toBeVisible();
    await page.getByRole('button', { name: /^Calendario$/ }).click();
    await expect(page).toHaveURL(/\/calendario/, { timeout: 30_000 });

    await page.goto('/dashboard');
    const input2 = await abrirBuscador(page);
    await input2.fill('Cobros');
    await expect(page.getByRole('button', { name: /^Cobros$/ })).toBeVisible();
  });

  test('"Equipo" no aparece por casualidad — sale como sección propia, no como substring de una tarea', async ({ page }) => {
    await mockBackend(page);
    await seedAuth(page, 'auth-e2e-duena', 'cloe@example.com');
    await page.goto('/dashboard');

    const input = await abrirBuscador(page);
    await input.fill('Equipo');
    // El resultado exacto de "Secciones" (href /equipo), no solo la tarea
    // "Añadir una instructora al equipo" que ya existía antes del fix.
    await expect(page.getByText('Secciones')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Equipo$/ })).toBeVisible();
  });

  test('instructora: "Cobros" no está en su lista blanca y no aparece en Secciones', async ({ page }) => {
    await mockBackend(page, { comoInstructora: true });
    await seedAuth(page, 'auth-e2e-instructora', 'marta@example.com');
    await page.goto('/dashboard');

    const input = await abrirBuscador(page);
    await input.fill('Cobros');
    // Ni Secciones (nuevo) ni Acciones (ya filtraba por permiso) deben ofrecer
    // una ruta fuera de PERMITIDO_INSTRUCTOR.
    await expect(page.getByText('Secciones')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Cobros$/ })).toHaveCount(0);
  });

  test('instructora: "Calendario", que sí está en su lista blanca, se sigue encontrando', async ({ page }) => {
    await mockBackend(page, { comoInstructora: true });
    await seedAuth(page, 'auth-e2e-instructora', 'marta@example.com');
    await page.goto('/dashboard');

    const input = await abrirBuscador(page);
    await input.fill('Calendario');
    await expect(page.getByRole('button', { name: /^Calendario$/ })).toBeVisible();
  });
});
