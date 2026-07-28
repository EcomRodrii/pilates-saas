import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// P2-10. "Disponibilidad por franjas de 8h y solo rellenable vía enlace — con
// 18 personas es inviable."
//
// Investigado antes de tocar código: el motor de asignación ya compara contra
// horas reales, no contra el concepto de franja — afinar la rejilla no habría
// cambiado ninguna sugerencia. El cuello de botella de verdad es mandar y
// hacer seguimiento de 18 enlaces uno a uno por WhatsApp, sin ningún registro
// de a quién se le mandó ni cuándo.
//
// Esta suite fija el contrato del envío masivo:
//   1. "Enviar a todas por email" manda el enlace a quien SÍ tiene email, y
//      cada fila confirma el envío por separado (no es todo-o-nada);
//   2. quien no tiene email en su ficha se ve aparte y no bloquea a las demás;
//   3. quien ya recibió el aviso antes lo dice ("Enviado hace X días"), para
//      no perder de vista a quién ya se le pidió y sigue sin responder.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Studio Cadena', slug: 'studio-cadena',
  owner_auth_user_id: AUTH_UID, email: 'duena@example.com', moneda: 'EUR',
};

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

// `equipo.sinDisponibilidad`: tres instructoras en el estado que motiva P2-10.
const SIN_DISPONIBILIDAD = [
  { id: 'ins-ana', nombre: 'Ana', email: 'ana@example.com', emailEnviadoEn: null },
  { id: 'ins-berta', nombre: 'Berta', email: 'berta@example.com', emailEnviadoEn: '2026-07-01T00:00:00Z' },
  { id: 'ins-carla', nombre: 'Carla', email: null, emailEnviadoEn: null },
];

async function mockBackend(page: Page) {
  const enviosRecibidos: string[][] = [];

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.route('**/api/sustituciones**', route => {
    if (route.request().method() !== 'GET') return json(route, { ok: true });
    return json(route, {
      sustituciones: [], avisarAlumnas: true, modoAutonomia: 'asistido', autonomiaDisponible: true,
      equipo: { total: 3, sinDisponibilidad: SIN_DISPONIBILIDAD },
    });
  });

  await page.route('**/api/sustituciones/pedir-disponibilidad', route => {
    const body = JSON.parse(route.request().postData() || '{}');
    enviosRecibidos.push(body.instructorIds ?? []);
    // Ana → ok. Berta → ok. Carla nunca debería llegar aquí (sin email, filtrada en cliente).
    const resultados = (body.instructorIds as string[]).map((id: string) => ({ id, ok: true }));
    return json(route, { resultados });
  });

  return { enviosRecibidos };
}

async function abrirDialogo(page: Page) {
  await page.goto('/sustituciones');
  await expect(page.getByRole('button', { name: 'Pedirles su disponibilidad' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Pedirles su disponibilidad' }).click();
  await expect(page.getByRole('dialog', { name: 'Pedir disponibilidad' })).toBeVisible();
}

test.describe('Pedir disponibilidad a varias instructoras a la vez', () => {
  test('"Enviar a todas por email" manda solo a quien tiene email, y confirma fila a fila', async ({ page }) => {
    const { enviosRecibidos } = await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirDialogo(page);

    // Solo Ana y Berta tienen email: el botón cuenta 2, no 3.
    const enviarTodas = page.getByRole('button', { name: 'Enviar a las 2 por email' });
    await expect(enviarTodas).toBeVisible();
    await enviarTodas.click();

    await expect.poll(() => enviosRecibidos.length, { timeout: 15_000 }).toBe(1);
    expect(enviosRecibidos[0].sort()).toEqual(['ins-ana', 'ins-berta']);

    // Confirmación por fila, no un aviso genérico de "enviado" para todo el diálogo.
    const filaAna = page.getByText('Ana').locator('../..');
    await expect(filaAna.getByText('Enviado')).toBeVisible();
    const filaBerta = page.getByText('Berta').locator('../..');
    await expect(filaBerta.getByText('Enviado')).toBeVisible();
  });

  test('sin email en su ficha, no bloquea a las demás y se ve aparte', async ({ page }) => {
    await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirDialogo(page);

    const filaCarla = page.getByText('Carla').locator('../..');
    await expect(filaCarla.getByText('Sin email en su ficha')).toBeVisible();
    // Sigue pudiendo copiar el enlace a mano aunque no tenga email en la ficha.
    await expect(filaCarla.getByRole('button', { name: 'Copiar enlace' })).toBeEnabled();
  });

  test('quien ya recibió el aviso antes lo dice, para no perderle la pista', async ({ page }) => {
    await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirDialogo(page);

    const filaBerta = page.getByText('Berta').locator('../..');
    await expect(filaBerta.getByText(/Enviado hace \d+ días/)).toBeVisible();
  });
});
