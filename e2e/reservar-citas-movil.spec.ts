import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Reserva pública de una cita 1:1 (pestaña «Citas» del widget /reservar), en
// móvil. El widget se abre casi siempre desde el móvil de una clienta (mismo
// criterio que el resto de SPECS_WEBKIT en playwright.config.ts), y hasta
// ahora la única cobertura móvil de esta pestaña era con `citasServicios: []`
// (reservar-acoplar-widget.spec.ts) — nunca se había ejercitado de verdad
// elegir servicio → instructora → hueco → confirmar en un viewport táctil.
// ─────────────────────────────────────────────────────────────────────────────

const SLUG = 'tentare';
const S = 'studio-test';
const SOCIO_ID = 'socio-e2e-citas';
const AHORA = '2026-08-12T08:00:00';
const HUECO_INICIO = '2026-08-12T11:00:00';
const HUECO_FIN = '2026-08-12T11:50:00';

function fixture() {
  return {
    studio: { id: S, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella', email: 'hola@alma.es', telefono: '+34 600 111 222', cancelacionVentanaHoras: 12 },
    tiposClase: [], salas: [],
    instructores: [{ id: 'ins-1', studioId: S, nombre: 'Ana Ferrer', rol: 'INSTRUCTOR', activo: true }],
    spots: [], planesTarifa: [], sesiones: [],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [],
    achievementDefinitions: [], challengeDefinitions: [],
    citasServicios: [{
      id: 'serv-1', studioId: S, nombre: 'Evaluación inicial', tipo: 'EVALUACION',
      duracionMin: 50, precio: 45, autoReservable: true, color: null,
      descripcion: 'Primera valoración postural.', activo: true, orden: 0, creadoEn: '2026-01-01T00:00:00Z',
    }],
    citasDisponibilidad: [{
      id: 'disp-1', studioId: S, instructorId: 'ins-1', diaSemana: new Date(AHORA).getDay(),
      horaInicio: '09:00', horaFin: '18:00', creadoEn: '2026-01-01T00:00:00Z',
    }],
    citas: [], aforoReservas: [],
    socia: null,
  };
}

async function montar(page: Page) {
  await page.clock.install({ time: new Date(AHORA) });
  await page.addInitScript(() => {
    localStorage.setItem('sb-portal-auth', JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: 'auth-e2e-citas', email: 'socia-citas@test.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  });
  await page.route('**/rest/v1/**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: S }) }));
  await page.route('**/api/theme**', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture()) }));
  await page.route('**/api/public/session', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ socioId: SOCIO_ID, nombre: 'Marta E2E', email: 'socia-citas@test.com' }) }));
}

test('en móvil: elegir servicio, instructora y hueco reserva la cita de verdad', async ({ page }) => {
  const peticiones: Record<string, unknown>[] = [];
  await montar(page);
  await page.route('**/api/public/citas**', async route => {
    const req = route.request();
    if (req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ huecos: [{ inicio: HUECO_INICIO, fin: HUECO_FIN }] }) });
    }
    const payload = JSON.parse(req.postData() || '{}');
    peticiones.push(payload);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, inicio: HUECO_INICIO, fin: HUECO_FIN }) });
  });

  await page.goto(`/reservar/${SLUG}?tab=citas`);
  await page.getByText('Evaluación inicial').click();
  await page.getByRole('button', { name: /Ana/ }).click();
  await page.getByRole('button', { name: new RegExp(new Date(HUECO_INICIO).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })) }).click();

  await expect(page.getByRole('button', { name: 'Confirmar cita' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Confirmar cita' }).click();

  await expect(page.getByText('¡Cita reservada!')).toBeVisible({ timeout: 15_000 });
  expect(peticiones).toHaveLength(1);
  expect(peticiones[0]).toMatchObject({ accion: 'crear', studioId: S, servicioId: 'serv-1', instructorId: 'ins-1', inicioISO: HUECO_INICIO });
});

test('en móvil: un hueco que ya no está disponible se rechaza con el motivo real, no un error genérico', async ({ page }) => {
  await montar(page);
  await page.route('**/api/public/citas**', async route => {
    const req = route.request();
    if (req.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ huecos: [{ inicio: HUECO_INICIO, fin: HUECO_FIN }] }) });
    }
    return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Ese hueco ya no está disponible' }) });
  });

  await page.goto(`/reservar/${SLUG}?tab=citas`);
  await page.getByText('Evaluación inicial').click();
  await page.getByRole('button', { name: /Ana/ }).click();
  await page.getByRole('button', { name: new RegExp(new Date(HUECO_INICIO).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })) }).click();
  await page.getByRole('button', { name: 'Confirmar cita' }).click();

  await expect(page.getByText('Ese hueco ya no está disponible')).toBeVisible({ timeout: 15_000 });
  // No se cierra la hoja sola ni se pinta "reservada" con el servidor diciendo que no.
  await expect(page.getByText('¡Cita reservada!')).toHaveCount(0);
});
