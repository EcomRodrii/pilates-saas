import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Casilla de consentimiento de marketing en el alta walk-in de /reservar
// (22-sep-2026): desmarcada por defecto, aparte del contrato, y solo el «sí»
// viaja al servidor — no marcarla no puede parecer una negativa activa
// (RGPD art. 7.4: nunca condiciona el servicio).
// ─────────────────────────────────────────────────────────────────────────────

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const SLUG = 'tentare';
const STUDIO_ID = 'studio-test';
const AHORA = '2026-08-12T08:00:00';

function fixture() {
  return {
    studio: {
      id: STUDIO_ID, nombre: 'Estudio Alma', slug: SLUG, ciudad: 'Marbella',
      direccion: 'Calle Larios 1', email: 'hola@alma.es', telefono: '+34 600 111 222',
      cancelacionVentanaHoras: 12,
    },
    tiposClase: [{ id: 'tc-r', studioId: STUDIO_ID, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', ventanaCancelacionHoras: null }],
    salas: [{ id: 'sala-1', studioId: STUDIO_ID, nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: STUDIO_ID, nombre: 'Ana', rol: 'INSTRUCTOR' }],
    spots: [], planesTarifa: [],
    sesiones: [{ id: 'ses-r', studioId: STUDIO_ID, tipoClaseId: 'tc-r', salaId: 'sala-1', instructorId: 'ins-1', inicio: '2026-08-12T10:00:00', fin: '2026-08-12T10:50:00', aforoMaximo: 10, cancelada: false }],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [],
    achievementDefinitions: [], challengeDefinitions: [], citasServicios: [], citasDisponibilidad: [],
    aforoReservas: [], socia: null,
  };
}

async function mocksBase(page: Page) {
  await page.clock.install({ time: new Date(AHORA) });
  await page.route('**/rest/v1/**', r => json(r, { id: STUDIO_ID }));
  await page.route('**/api/theme**', r => json(r, { primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }));
  await page.route('**/api/public/studio-data', r => json(r, fixture()));
}

async function seedSesionAutenticada(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('sb-portal-auth', JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: 'u-walkin', email: 'walkin@example.com', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  });
}

async function llegarAAceptarTerminos(page: Page) {
  await mocksBase(page);
  await seedSesionAutenticada(page);
  await page.route('**/api/public/session', r => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));

  await page.goto(`/reservar/${SLUG}?tab=clases&acceso=1`);
  await expect(page.getByRole('heading', { name: '¿Cómo te llamas?' })).toBeVisible({ timeout: 30_000 });
  await page.getByPlaceholder('Tu nombre completo').fill('Ana');
  await page.getByPlaceholder(/Tu teléfono/).fill('+34 600 000 000');
  await page.getByRole('button', { name: 'Continuar →' }).click();
  await expect(page.getByRole('heading', { name: 'Acepta los términos' })).toBeVisible({ timeout: 30_000 });
}

test('nace desmarcada, aparte del contrato, y no bloquea el alta', async ({ page }) => {
  await llegarAAceptarTerminos(page);
  const marketing = page.getByRole('checkbox', { name: /novedades y ofertas/ });
  await expect(marketing).toBeVisible();
  await expect(marketing).not.toBeChecked();
  // El botón depende solo de los términos, nunca de esta casilla.
  await expect(page.getByRole('checkbox', { name: /términos de servicio/ })).not.toBeChecked();
  await expect(page.getByRole('button', { name: /Aceptar y continuar/ })).toBeDisabled();
});

test('sin marcarla, el alta sale sin la clave `marketing` — no marcarla no es un «no»', async ({ page }) => {
  await llegarAAceptarTerminos(page);
  let body: Record<string, unknown> | null = null;
  await page.route('**/api/public/socio', async route => {
    body = route.request().postDataJSON() as Record<string, unknown>;
    return json(route, { ok: true });
  });

  await page.getByRole('checkbox', { name: /términos de servicio/ }).check();
  await page.getByRole('button', { name: /Aceptar y continuar/ }).click();

  await expect.poll(() => body).not.toBeNull();
  expect(body!.accion).toBe('registrar');
  expect(body).not.toHaveProperty('marketing');
});

test('marcada, el alta manda `marketing: true` — solo el «sí» viaja al servidor', async ({ page }) => {
  await llegarAAceptarTerminos(page);
  let body: Record<string, unknown> | null = null;
  await page.route('**/api/public/socio', async route => {
    body = route.request().postDataJSON() as Record<string, unknown>;
    return json(route, { ok: true });
  });

  await page.getByRole('checkbox', { name: /términos de servicio/ }).check();
  await page.getByRole('checkbox', { name: /novedades y ofertas/ }).check();
  await page.getByRole('button', { name: /Aceptar y continuar/ }).click();

  await expect.poll(() => body).not.toBeNull();
  expect(body!.marketing).toBe(true);
});
