import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// P2-4 (la otra mitad). El "0 esperando respuesta" del panel de
// automatizaciones no tenía nada que ver con sustituciones — y ni el
// briefing ni el dashboard miraban la tabla `sustituciones`, que es donde
// vive "Marta no ha contestado". Este contador SÍ sale de ahí: cuenta las
// bajas activas en estado 'contactando' (candidatas avisadas, plazo abierto).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = { id: STUDIO_ID, nombre: 'Studio Cadena', slug: 'studio-cadena', owner_auth_user_id: AUTH_UID, email: 'duena@example.com', moneda: 'EUR' };
const TIPO_CLASE_ROW = { id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', duracion_min: 50, color: '#F7A6C4' };
const INSTRUCTORES_ROWS = [
  { id: 'inst-laura', studio_id: STUDIO_ID, nombre: 'Laura Gil', activo: true, rol: 'INSTRUCTOR', color: '#F7A6C4' },
  { id: 'inst-marta', studio_id: STUDIO_ID, nombre: 'Marta Sanz', activo: true, rol: 'INSTRUCTOR', color: '#F7A6C4' },
];

function sesionRow(id: string, inicio: string) {
  return { id, studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'inst-laura', inicio, fin: inicio, aforo_maximo: 10, cancelada: false };
}

// Una baja "contactando": ya se avisó a candidatas, ninguna ha respondido —
// exactamente lo que "Marta no ha contestado" describe.
function sustitucionContactando(id: string, sesionId: string) {
  return {
    id, studio_id: STUDIO_ID, estado: 'contactando', instructor_original_id: 'inst-laura', sesion_id: sesionId,
    sesiones: { id: sesionId, inicio: '2099-08-03T08:00:00+00:00', tipo_clase_id: 'tc-1' },
    ranking: [{ instructor_id: 'inst-marta', nombre: 'Marta Sanz', compatibilidad: 65, veces: 0, motivos: ['está disponible'] }],
    sustitucion_contactos: [{ instructor_id: 'inst-marta', estado: 'enviado' }],
    creado_en: '2026-07-26T00:00:00+00:00', resuelto_en: null,
  };
}

// Una ya cubierta: no debe sumar al contador (no está esperando nada).
function sustitucionConfirmada(id: string, sesionId: string) {
  return {
    id, studio_id: STUDIO_ID, estado: 'confirmada', instructor_original_id: 'inst-laura', sesion_id: sesionId,
    sesiones: { id: sesionId, inicio: '2099-08-04T08:00:00+00:00', tipo_clase_id: 'tc-1' },
    ranking: [], sustitucion_contactos: [{ instructor_id: 'inst-marta', estado: 'aceptado' }],
    creado_en: '2026-07-26T00:00:00+00:00', resuelto_en: '2026-07-26T01:00:00+00:00',
  };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesionDeDuena(page: Page) {
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
}

async function mockBackend(page: Page, sustituciones: Record<string, unknown>[]) {
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, [TIPO_CLASE_ROW]));
  await page.route('**/rest/v1/instructores**', route => json(route, INSTRUCTORES_ROWS));
  await page.route('**/rest/v1/sesiones**', route => json(route, [sesionRow('ses-1', '2099-08-03T08:00:00+00:00'), sesionRow('ses-2', '2099-08-04T08:00:00+00:00')]));

  await page.route('**/api/sustituciones**', route => {
    if (route.request().method() !== 'GET') return json(route, { ok: true });
    return json(route, {
      sustituciones, avisarAlumnas: true, modoAutonomia: 'asistido', autonomiaDisponible: true,
      equipo: { total: 2, sinDisponibilidad: [] },
    });
  });
}

async function abrirSustituciones(page: Page) {
  await page.goto('/sustituciones');
  await expect(page.getByText('Sustituciones')).toBeVisible({ timeout: 30_000 });
}

test.describe('"Esperando respuesta" sale de datos reales, no de un contador muerto', () => {
  test('con una baja en "contactando", el contador dice 1', async ({ page }) => {
    await mockBackend(page, [sustitucionContactando('sust-1', 'ses-1')]);
    await seedSesionDeDuena(page);
    await abrirSustituciones(page);

    await expect(page.getByText('1 esperando respuesta')).toBeVisible();
  });

  test('con dos "contactando" y una ya cubierta, el contador dice 2 (no 3)', async ({ page }) => {
    await mockBackend(page, [
      sustitucionContactando('sust-1', 'ses-1'),
      sustitucionContactando('sust-2', 'ses-2'),
      sustitucionConfirmada('sust-3', 'ses-1'),
    ]);
    await seedSesionDeDuena(page);
    await abrirSustituciones(page);

    await expect(page.getByText('2 esperando respuesta')).toBeVisible();
  });

  test('sin ninguna "contactando", no se enseña ningún contador', async ({ page }) => {
    await mockBackend(page, [sustitucionConfirmada('sust-1', 'ses-1')]);
    await seedSesionDeDuena(page);
    await abrirSustituciones(page);

    await expect(page.getByText(/esperando respuesta/)).toHaveCount(0);
  });
});
