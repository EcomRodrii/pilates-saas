import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El botón "Cancelar" de "Mis reservas" en /reservar/[slug] (y por tanto en
// cada widget embebido que apunta ahí, ?embed=1&tab=misreservas) no tenía
// ningún e2e que hiciera clic de verdad y comprobara el resultado — solo había
// un test del AVISO de ventana de cancelación (reservar-ventana-por-tipo),
// nunca de la acción. Encontrado auditando el widget en producción.
//
// Cubre el camino real: cancelarReserva() → POST /api/public/reserva
// (accion: cancelar) → cancelarReservaPublica() → RPC cancelar_reserva_plaza.
// Aquí se mockea esa POST (nunca hay servidor real en e2e), pero se comprueba
// que la petición sale con el reservaId correcto y que la reserva desaparece
// de la lista tras la re-sincronización — el mismo contrato que ve una socia
// real.
// ─────────────────────────────────────────────────────────────────────────────

const SLUG = 'tentare';
const FECHA = '2026-07-09';
const AHORA = `${FECHA}T08:00:00`;
const SOCIO_ID = 'socio-e2e-1';
const RESERVA_ID = 'res-e2e-1';
const SESION_ID = 'ses-futura';

function studioDataFixture(cancelada: boolean) {
  const socio = { id: SOCIO_ID, studioId: 'studio-test', nombre: 'Ana Test', email: 'socia-e2e@test.com' };
  const reserva = {
    id: RESERVA_ID, studioId: 'studio-test', sesionId: SESION_ID, socioId: SOCIO_ID,
    estado: cancelada ? 'CANCELADA' : 'CONFIRMADA', spotId: null, posicionEspera: null,
    ofertaExpiraEn: null, checkInEn: null, creadoEn: `${FECHA}T07:00:00Z`,
  };
  return {
    studio: {
      id: 'studio-test', nombre: 'Tentare', slug: SLUG, ciudad: 'Málaga', direccion: 'Calle Test 1',
      email: 'hola@tentare.app', telefono: '+34 000 000 000', cancelacionVentanaHoras: 12,
    },
    tiposClase: [{ id: 'tc-reformer', studioId: 'studio-test', nombre: 'Reformer', color: '#F7A6C4', nivel: 'TODOS', ventanaCancelacionHoras: null }],
    salas: [{ id: 'sala-1', studioId: 'studio-test', nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: 'studio-test', nombre: 'Ana Instructora', rol: 'INSTRUCTOR' }],
    spots: [],
    planesTarifa: [],
    // Sesión bien lejos en el futuro: nunca "cancelación tardía", el modal de
    // confirmación pide el camino simple ("Liberarás tu plaza"), no el de bono.
    sesiones: [{ id: SESION_ID, studioId: 'studio-test', tipoClaseId: 'tc-reformer', salaId: 'sala-1', instructorId: 'ins-1', inicio: '2026-08-20T10:00:00', fin: '2026-08-20T11:00:00', aforoMaximo: 10, cancelada: false }],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [],
    achievementDefinitions: [], challengeDefinitions: [], aforoReservas: [
      { id: RESERVA_ID, sesion_id: SESION_ID, estado: reserva.estado, spot_id: null },
    ],
    // La socia autenticada: sus propias reservas llegan aquí (nunca por
    // aforoReservas, que va anonimizado) — mismo contrato que el servidor real.
    socia: { socio, reservas: [reserva], suscripciones: [], plazasFijas: [], recibos: [] },
  };
}

async function seedSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('sb-portal-auth', JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: 'auth-e2e', email: 'socia-e2e@test.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  });
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Red de seguridad: cualquier llamada a Supabase REST que no sea la que el
 * test mockea a propósito no debe tumbar la página — mismo patrón que
 * reservar-ventana-por-tipo.spec.ts. */
async function mockRedComun(page: Page) {
  await page.route('**/rest/v1/studios*', route => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: {
        'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*',
      } });
    }
    return route.fulfill({
      status: 200, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ id: 'studio-test' }),
    });
  });
  await page.route('**/rest/v1/**', route => json(route, []));
}

test.describe('Cancelar una reserva desde el widget (/reservar/[slug])', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date(AHORA) });
  });

  test('pulsar Cancelar → confirmar hace la petición real y la reserva desaparece de la lista', async ({ page }) => {
    let cancelada = false;
    const peticionesCancelar: unknown[] = [];

    await seedSession(page);
    await mockRedComun(page);

    await page.route('**/api/public/studio-data', route =>
      json(route, studioDataFixture(cancelada)));

    await page.route('**/api/public/session', route =>
      json(route, { socioId: SOCIO_ID, nombre: 'Ana Test', email: 'socia-e2e@test.com' }));

    await page.route('**/api/public/reserva', async route => {
      const body = route.request().postDataJSON();
      peticionesCancelar.push(body);
      cancelada = true; // la próxima carga de studio-data ya la devuelve CANCELADA
      return json(route, { ok: true });
    });

    await page.goto(`/reservar/${SLUG}?embed=1&tab=misreservas`);

    const fila = page.getByText('Reformer', { exact: true }).locator('..').locator('..');
    await expect(fila.getByText('Confirmada', { exact: true })).toBeVisible({ timeout: 30_000 });

    // Fase 4 del rediseño (docs/widget-reservas-fase4-brief-diseno.md): la
    // confirmación de cancelar ya no es un modal aparte, es una caja inline
    // bajo la fila — pero HERMANA del contenedor que resuelve `fila` (que
    // solo llega hasta la fila de datos+acciones), así que se busca en la
    // página: hay una sola reserva en la fixture, sin ambigüedad posible.
    await fila.getByRole('button', { name: 'Cancelar reserva' }).click();
    await expect(page.getByText(/¿Quieres cancelar esta reserva\?/)).toBeVisible();

    await page.getByRole('button', { name: 'Sí, cancelar' }).click();

    // La petición real salió, con el id de ESTA reserva — nunca uno inventado
    // por el cliente ni tomado de otra fila.
    await expect.poll(() => peticionesCancelar.length).toBe(1);
    expect(peticionesCancelar[0]).toMatchObject({ accion: 'cancelar', reservaId: RESERVA_ID });

    // Tras re-sincronizar con el servidor, la reserva cancelada ya no aparece
    // en "Mis reservas" (misReservas filtra estado !== 'CANCELADA').
    await expect(page.getByText('No tienes reservas próximas')).toBeVisible({ timeout: 30_000 });
  });

  test('si el servidor rechaza la cancelación, la caja inline se queda abierta con el motivo', async ({ page }) => {
    await seedSession(page);
    await mockRedComun(page);

    await page.route('**/api/public/studio-data', route => json(route, studioDataFixture(false)));
    await page.route('**/api/public/session', route =>
      json(route, { socioId: SOCIO_ID, nombre: 'Ana Test', email: 'socia-e2e@test.com' }));
    await page.route('**/api/public/reserva', route =>
      json(route, { error: 'Esa reserva ya no se puede cancelar.' }, 400));

    await page.goto(`/reservar/${SLUG}?embed=1&tab=misreservas`);

    const fila = page.getByText('Reformer', { exact: true }).locator('..').locator('..');
    await expect(fila.getByText('Confirmada', { exact: true })).toBeVisible({ timeout: 30_000 });
    await fila.getByRole('button', { name: 'Cancelar reserva' }).click();
    await page.getByRole('button', { name: 'Sí, cancelar' }).click();

    // NO se cierra sola: es la única superficie que la socia está mirando en
    // ese momento, así que el motivo se enseña ahí mismo, y la reserva sigue
    // en la lista (petición real: la reserva NO desaparece).
    await expect(page.getByText('Esa reserva ya no se puede cancelar.')).toBeVisible({ timeout: 30_000 });
    await expect(fila.getByText('Confirmada', { exact: true })).toBeVisible();
  });
});
