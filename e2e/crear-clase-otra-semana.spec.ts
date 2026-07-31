import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// P2-17. "Crear una clase en otra semana no confirma nada ni mueve el
// calendario. Creé 4 clases y no supe si existían hasta ir a buscarlas."
//
// El toast sí estaba, pero decía "Clase creada" sobre una rejilla que seguía
// enseñando OTRA semana — o sea, sobre un hueco vacío. Enseñar el resultado es
// la mitad de crear algo: ahora el calendario se mueve hasta la clase.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

// Reloj congelado en MIÉRCOLES 2026-08-05 (semana del lun 3 al dom 9), así que
// el 19 de agosto cae dos semanas más adelante pase lo que pase.
const HOY = '2026-08-05';
const OTRA_SEMANA = '2026-08-19';

const TIPOS = [{ id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', color: '#F7A6C4', duracion_minutos: 55, descripcion: null, nivel: 'TODOS', foto_url: null }];
const SALAS = [{ id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala 1', capacidad: 10, color: '#6366F1' }];
const INSTRUCTORES = [{ id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Marta', email: null, telefono: null, color: '#111', activo: true, rol: 'INSTRUCTOR', avatar: null, foto_url: null, auth_user_id: null }];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

// Rediseño del Calendario: las tarjetas de métricas ("Clases"/"esta semana")
// y la rejilla pintan desde /api/calendario, no desde sesiones/reservas del
// contexto — sin este mock la rejilla se queda en "Cargando…".
function salaApi(r: any) {
  return { id: r.id, studioId: r.studio_id, nombre: r.nombre, capacidad: r.capacidad, color: r.color };
}
function instructorApi(r: any) {
  return {
    id: r.id, studioId: r.studio_id, nombre: r.nombre, email: r.email, telefono: r.telefono,
    color: r.color, activo: r.activo, avatar: r.avatar, fotoUrl: r.foto_url, rol: r.rol ?? 'INSTRUCTOR',
    authUserId: r.auth_user_id,
  };
}

async function montar(page: Page) {
  await page.clock.setFixedTime(new Date(`${HOY}T12:00:00`));

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
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, TIPOS));
  await page.route('**/rest/v1/salas**', route => json(route, SALAS));
  await page.route('**/rest/v1/instructores**', route => json(route, INSTRUCTORES));
  await page.route('**/rest/v1/sesiones**', route =>
    route.request().method() === 'GET' ? json(route, []) : json(route, [], 201));
  await page.route('**/api/calendario**', route => json(route, {
    sesiones: [], reservas: [], sustituciones: [],
    salas: SALAS.map(salaApi), instructores: INSTRUCTORES.map(instructorApi),
    horaApertura: '08:00:00', horaCierre: '22:00:00', rol: 'PROPIETARIO',
  }));

  await page.goto('/calendario');
}

async function crearClaseEl(page: Page, fecha: string) {
  await page.getByRole('button', { name: 'Nueva clase' }).first().click({ timeout: 30_000 });
  // El campo se busca DENTRO del cajón: el modal de clases recurrentes tiene sus
  // propios input[type=date] y `.first()` cogía el que no era.
  const cajon = page.getByRole('dialog', { name: 'Nueva clase' });
  await cajon.locator('input[type="date"]').first().fill(fecha);
  await cajon.getByRole('button', { name: 'Crear clase' }).click();
}

test.describe('Crear una clase en otra semana', () => {
  test('el calendario se mueve hasta ella y el aviso lo dice', async ({ page }) => {
    await montar(page);

    // Arranca en la semana de hoy (3–9 de agosto).
    await expect(page.getByText('esta semana', { exact: true })).toBeVisible({ timeout: 30_000 });

    await crearClaseEl(page, OTRA_SEMANA);

    // El aviso avisa de que te ha llevado allí…
    await expect(page.getByText(/te llevo a esa semana/)).toBeVisible();
    // …y la rejilla ya NO es la semana actual: es la de la clase creada.
    await expect(page.getByText('esa semana', { exact: true })).toBeVisible();
  });

  test('creando en la semana que ya se está viendo, no se mueve nada', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('esta semana', { exact: true })).toBeVisible({ timeout: 30_000 });

    // Jueves de la MISMA semana: no tiene sentido moverla ni anunciarlo.
    await crearClaseEl(page, '2026-08-06');

    await expect(page.getByText('Clase creada')).toBeVisible();
    await expect(page.getByText(/te llevo a esa semana/)).toHaveCount(0);
    await expect(page.getByText('esta semana', { exact: true })).toBeVisible();
  });
});
