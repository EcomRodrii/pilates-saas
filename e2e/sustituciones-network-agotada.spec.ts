import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Sustitución agotada → Tentare Network. Cuando no queda nadie del equipo, la
// tarjeta propone profesionales de Network y la propietaria pide, con UN toque
// por persona. Estas pruebas vigilan tres cosas:
//  1. las propuestas salen, con el enlace a la ficha DENTRO del panel;
//  2. el toque manda de verdad el POST (contador de peticiones: un «no mintió»
//     sin intentos sería un test hueco), una vez, con solo clase/día/hora;
//  3. un 409 o un 500 NUNCA enseñan «Solicitud enviada».
// Datos inventados: nombres de ejemplo y @example.com.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = { id: STUDIO_ID, nombre: 'Studio Ejemplo', slug: 'studio-ejemplo', owner_auth_user_id: AUTH_UID, email: 'duena@example.com', moneda: 'EUR' };
const TIPO_CLASE_ROW = { id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', duracion_min: 50, color: '#5A6142' };
const INSTRUCTORES_ROWS = [
  { id: 'inst-laura', studio_id: STUDIO_ID, nombre: 'Laura Ejemplo', activo: true, rol: 'INSTRUCTOR', color: '#5A6142' },
];
const MOTIVO = 'Motivo privado de ejemplo';

function sustitucionAgotada() {
  return {
    id: 'sust-1', studio_id: STUDIO_ID, estado: 'agotada', motivo: MOTIVO, origen: 'panel',
    instructor_original_id: 'inst-laura', sustituta_final_id: null, sesion_id: 'ses-1',
    sesiones: { inicio: '2099-08-03T08:00:00+00:00', fin: '2099-08-03T08:50:00+00:00', tipo_clase_id: 'tc-1', cancelada: false },
    ranking: [],
    candidatos_network: [
      { perfilId: 'perfil-ana', slug: 'ana-ejemplo', nombre: 'Ana Ejemplo', fotoUrl: null, ciudad: 'Almería' },
      { perfilId: 'perfil-bea', slug: null, nombre: 'Bea Ejemplo', fotoUrl: null, ciudad: null },
    ],
    sustitucion_contactos: [],
    creado_en: '2026-07-26T00:00:00+00:00', resuelto_en: null,
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

type Contacto = { status: number; body: unknown };

/** Devuelve la lista de cuerpos POST recibidos en /api/network/contacto. */
async function mockBackend(page: Page, contacto: Contacto): Promise<Array<{ perfilId?: string; mensaje?: string }>> {
  const posts: Array<{ perfilId?: string; mensaje?: string }> = [];
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

  await page.route('**/api/sustituciones**', route => {
    if (route.request().method() !== 'GET') return json(route, { ok: true });
    return json(route, {
      sustituciones: [sustitucionAgotada()], avisarAlumnas: true, modoAutonomia: 'asistido', autonomiaDisponible: true,
      equipo: { total: 1, sinDisponibilidad: [] },
    });
  });

  await page.route('**/api/network/contacto**', async route => {
    if (route.request().method() !== 'POST') return json(route, { solicitud: null });
    posts.push(route.request().postDataJSON() as { perfilId?: string; mensaje?: string });
    // Un poco de latencia: el segundo toque llega con la primera petición en vuelo.
    await new Promise(r => setTimeout(r, 300));
    return json(route, contacto.body, contacto.status);
  });
  return posts;
}

async function abrirSustituciones(page: Page) {
  await page.goto('/sustituciones');
  await expect(page.getByText('Sustituciones').first()).toBeVisible({ timeout: 30_000 });
}

test.describe('Sustitución agotada → propuestas de Tentare Network', () => {
  test('propone profesionales con su ficha dentro del panel, y el toque pide contacto una sola vez', async ({ page }) => {
    const posts = await mockBackend(page, { status: 200, body: { ok: true, solicitudId: 'redcontacto-1' } });
    await seedSesionDeDuena(page);
    await abrirSustituciones(page);

    await expect(page.getByText('No queda nadie de tu equipo. Estas profesionales de Tentare Network podrían cubrirla')).toBeVisible();
    const fichaAna = page.getByRole('link', { name: /Ana Ejemplo/ });
    await expect(fichaAna).toHaveAttribute('href', '/network/perfil-ana');
    await expect(fichaAna).not.toHaveAttribute('target', '_blank');

    const botones = page.getByRole('button', { name: 'Pedir que la cubra' });
    await expect(botones).toHaveCount(2); // uno por profesional, ningún «pedir a todas»

    await botones.first().dblclick();
    await expect(page.getByText('Solicitud enviada')).toBeVisible();

    expect(posts.length).toBeGreaterThan(0);
    expect(posts).toHaveLength(1);
    expect(posts[0].perfilId).toBe('perfil-ana');
    expect(posts[0].mensaje).toContain('Reformer');
    expect(posts[0].mensaje).toContain('10:00');
    expect(posts[0].mensaje).not.toContain(MOTIVO);
    expect(posts[0].mensaje).not.toContain('Laura');
    // Bea sigue sin pedir: nada se manda a nadie que no se haya tocado.
    await expect(page.getByRole('button', { name: 'Pedir que la cubra' })).toHaveCount(1);
  });

  test('409 (ya había una solicitud) dice «Ya le has pedido contacto», no «Solicitud enviada»', async ({ page }) => {
    const posts = await mockBackend(page, { status: 409, body: { error: 'Ya tienes una solicitud pendiente con esta profesional.' } });
    await seedSesionDeDuena(page);
    await abrirSustituciones(page);

    await page.getByRole('button', { name: 'Pedir que la cubra' }).first().click();
    await expect(page.getByText('Ya le has pedido contacto')).toBeVisible();
    expect(posts.length).toBeGreaterThan(0);
    await expect(page.getByText('Solicitud enviada')).toHaveCount(0);
  });

  test('500 enseña el error y deja volver a intentarlo, sin «Solicitud enviada»', async ({ page }) => {
    const posts = await mockBackend(page, { status: 500, body: { error: 'No se ha podido enviar la solicitud.' } });
    await seedSesionDeDuena(page);
    await abrirSustituciones(page);

    await page.getByRole('button', { name: 'Pedir que la cubra' }).first().click();
    await expect(page.getByRole('alert').filter({ hasText: 'No se ha podido enviar la solicitud.' })).toBeVisible();
    expect(posts.length).toBeGreaterThan(0);
    await expect(page.getByText('Solicitud enviada')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pedir que la cubra' })).toHaveCount(2);
  });
});
