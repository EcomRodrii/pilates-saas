import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// P2-12. El email de invitación al equipo salía SOLO, al guardar la ficha. Sin
// preguntar y sin forma de posponerlo.
//
// Una dueña con 18 instructoras montó su estudio un domingo por la noche:
// "mis 18 instructoras habrían recibido un correo un domingo por la noche".
//
// Dar de alta a alguien y avisarle son dos decisiones distintas, y la segunda es
// suya. Esta suite fija las tres garantías:
//   1. guardar la ficha NO manda nada;
//   2. si marca "enviarle ahora", se manda — y el toast lo dice;
//   3. quien se quedó sin invitar se ve en la lista y se le puede invitar luego.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

// Marta ya está en el equipo, con email y SIN cuenta reclamada (auth_user_id
// null): es exactamente "dada de alta pero todavía sin acceso".
const MARTA = {
  id: 'ins-marta', studio_id: STUDIO_ID, nombre: 'Marta', email: 'marta@example.com',
  telefono: null, color: '#111', activo: true, rol: 'INSTRUCTOR',
  avatar: null, foto_url: null, auth_user_id: null,
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** `invitaciones` recoge cada POST a /api/equipo/invitar: si está vacío, no ha salido ningún correo. */
async function montarEquipo(page: Page, instructores: unknown[] = [MARTA]) {
  const invitaciones: string[] = [];
  const altas: string[] = [];

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

  // Comodines primero: Playwright resuelve las rutas en orden inverso.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/api/equipo/invitar**', route => {
    invitaciones.push(route.request().postData() ?? '');
    return json(route, { ok: true, email: 'nueva@example.com' });
  });
  // OJO: '**/api/equipo**' también casaría con /invitar, pero al registrarse
  // ANTES pierde contra la específica (orden inverso). El alta responde ok.
  await page.route('**/api/equipo', route => {
    altas.push(route.request().postData() ?? '');
    return json(route, { ok: true });
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/instructores**', route => json(route, instructores));

  await page.goto('/equipo');
  return { invitaciones, altas };
}

async function rellenarAlta(page: Page, nombre: string, email: string) {
  await page.getByRole('button', { name: /Nuev[ao]/ }).first().click({ timeout: 30_000 });
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Nombre', { exact: false }).first().fill(nombre);
  await dialogo.getByLabel('Email', { exact: false }).first().fill(email);
  return dialogo;
}

test.describe('Invitación al equipo', () => {
  test('dar de alta NO manda ningún correo si no se pide', async ({ page }) => {
    const { invitaciones, altas } = await montarEquipo(page);

    const dialogo = await rellenarAlta(page, 'Laura', 'laura@example.com');

    // La casilla existe y viene APAGADA: es la garantía del domingo por la noche.
    const casilla = dialogo.getByRole('checkbox', { name: /Enviarle ahora el email/ });
    await expect(casilla).toBeVisible();
    await expect(casilla).not.toBeChecked();

    await dialogo.getByRole('button', { name: 'Guardar' }).click();

    // La ficha se crea…
    await expect.poll(() => altas.length).toBe(1);
    // …y no ha salido ni un correo.
    expect(invitaciones).toHaveLength(0);
    // Y se dice, para que no se quede pensando que ya está avisada.
    await expect(page.getByText(/todavía sin invitar/i)).toBeVisible();
  });

  test('si marca la casilla, se manda y el toast lo confirma', async ({ page }) => {
    const { invitaciones } = await montarEquipo(page);

    const dialogo = await rellenarAlta(page, 'Laura', 'laura@example.com');
    await dialogo.getByRole('checkbox', { name: /Enviarle ahora el email/ }).check();
    await dialogo.getByRole('button', { name: 'Guardar' }).click();

    await expect.poll(() => invitaciones.length).toBe(1);
    await expect(page.getByText(/invitación enviada a/i)).toBeVisible();
  });

  test('quien se quedó sin invitar se ve y se le puede invitar luego', async ({ page }) => {
    const { invitaciones } = await montarEquipo(page);

    // Marta tiene email y no ha reclamado cuenta: la lista lo dice.
    await expect(page.getByText('Todavía sin acceso').first()).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Enviar invitación' }).first().click();

    await expect.poll(() => invitaciones.length).toBe(1);
    expect(invitaciones[0]).toContain('ins-marta');
    await expect(page.getByText(/invitación enviada a/i)).toBeVisible();
  });
});
