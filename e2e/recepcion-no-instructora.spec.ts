import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// "Sara es de recepción, no da clases."
//
// `instructores` es la tabla del STAFF completo y toda la UI la trataba como
// "instructoras": el desplegable de asignar clase filtraba por `i.activo` y
// NUNCA por `i.rol`. Di de alta a una recepcionista y me aparecía como
// instructora asignable — y, si era la primera activa de la lista, quedaba
// preseleccionada al crear una clase sin tocar nada.
//
// El mismo defecto estaba en el horario de citas, en la reserva pública, en el
// diagnóstico de "quién no tiene disponibilidad" (decía "7 de tus 8
// instructoras" contando a recepción) y en el listado PÚBLICO de profesorado
// del portal de socias.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR',
};

// Sara va PRIMERA a propósito: era el caso que dejaba a recepción
// preseleccionada en el formulario de nueva clase.
const EQUIPO = [
  { id: 'ins-sara', studio_id: STUDIO_ID, nombre: 'Sara Recepcion', activo: true, rol: 'RECEPCION', color: '#F7A6C4' },
  { id: 'ins-marta', studio_id: STUDIO_ID, nombre: 'Marta Sanz', activo: true, rol: 'INSTRUCTOR', color: '#F7A6C4' },
];

const TIPO_CLASE = { id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', duracion_min: 50, color: '#F7A6C4' };
const SALA = { id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala Reformer', capacidad: 10, color: '#F7A6C4' };

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function salaApi(r: any) {
  return { id: r.id, studioId: r.studio_id, nombre: r.nombre, capacidad: r.capacidad, color: r.color };
}
function instructorApi(r: any) {
  return {
    id: r.id, studioId: r.studio_id, nombre: r.nombre, email: r.email ?? null, telefono: r.telefono ?? null,
    color: r.color, activo: r.activo, avatar: r.avatar ?? null, fotoUrl: r.foto_url ?? null,
    rol: r.rol ?? 'INSTRUCTOR', authUserId: r.auth_user_id ?? null,
  };
}

async function seedSesionDeDuena(page: Page) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'cloe@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
}

async function mockBackend(page: Page) {
  // OJO con el orden: Playwright resuelve en orden INVERSO al de registro.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/instructores**', route => json(route, EQUIPO));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, [TIPO_CLASE]));
  await page.route('**/rest/v1/salas**', route => json(route, [SALA]));
  await page.route('**/api/calendario**', route => json(route, {
    sesiones: [], reservas: [], sustituciones: [],
    salas: [SALA].map(salaApi), instructores: EQUIPO.map(instructorApi),
    horaApertura: '08:00:00', horaCierre: '22:00:00', rol: 'PROPIETARIO',
  }));
}

test.describe('Recepción no es instructora', () => {
  test('no aparece en el filtro de instructoras del calendario', async ({ page }) => {
    await mockBackend(page);
    await seedSesionDeDuena(page);
    await page.goto('/calendario');

    // Por contenido: el filtro de la barra superior no tiene etiqueta accesible
    // (sale como `combobox` sin nombre), a diferencia del del formulario.
    const filtro = page.locator('select').filter({ hasText: 'Todas las instructoras' });
    await expect(filtro).toBeVisible({ timeout: 30_000 });
    await expect(filtro.getByRole('option', { name: 'Marta Sanz' })).toHaveCount(1);
    await expect(filtro.getByRole('option', { name: 'Sara Recepcion' })).toHaveCount(0);
  });

  test('no se le puede asignar una clase, ni queda preseleccionada', async ({ page }) => {
    await mockBackend(page);
    await seedSesionDeDuena(page);
    await page.goto('/calendario');

    await page.getByRole('button', { name: /Nueva clase|Crear primera clase/ }).first().click({ timeout: 30_000 });

    const selector = page.getByRole('combobox', { name: 'Instructora' });
    await expect(selector).toBeVisible();
    await expect(selector.getByRole('option', { name: 'Sara Recepcion' })).toHaveCount(0);
    // Sara es la primera del equipo: antes quedaba preseleccionada y crear la
    // clase sin tocar el desplegable se la asignaba.
    await expect(selector).toHaveValue('ins-marta');
  });
});
