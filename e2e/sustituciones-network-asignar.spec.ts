import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Sustitución agotada → profesional de Tentare Network → clase asignada.
// La tarjeta dice en qué punto está cada profesional, con datos del servidor
// (`cobertura_network` de GET /api/sustituciones):
//  · solicitud pendiente → «Solicitud enviada»;
//  · aceptó pero no está en el equipo → enlace al chat, donde se formaliza;
//  · ya tiene ficha en el equipo → «Asignar la clase», con confirmación, por la
//    MISMA acción 'confirmar' que cualquier instructora.
// Un 409 o un 500 al asignar NUNCA enseñan éxito, y cada test de fallo cuenta
// que la petición salió de verdad (un «no mintió» sin intentos es un test hueco).
// Datos inventados: nombres de ejemplo y @example.com.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = { id: STUDIO_ID, nombre: 'Studio Ejemplo', slug: 'studio-ejemplo', owner_auth_user_id: AUTH_UID, email: 'duena@example.com', moneda: 'EUR' };
const TIPO_CLASE_ROW = { id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', duracion_min: 50, color: '#5A6142' };
const INSTRUCTORES_ROWS = [
  { id: 'inst-laura', studio_id: STUDIO_ID, nombre: 'Laura Ejemplo', activo: true, rol: 'INSTRUCTOR', color: '#5A6142' },
  // La ficha `temporal` que dejó la formalización: visible en el equipo como cualquier otra.
  { id: 'red-eq-ana', studio_id: STUDIO_ID, nombre: 'Ana Ejemplo', activo: true, rol: 'INSTRUCTOR', color: '#5A6142', tipo_contrato: 'temporal' },
];

function sustitucionAgotada() {
  return {
    id: 'sust-1', studio_id: STUDIO_ID, estado: 'agotada', motivo: null, origen: 'panel',
    instructor_original_id: 'inst-laura', sustituta_final_id: null, sesion_id: 'ses-1',
    sesiones: { inicio: '2099-08-03T08:00:00+00:00', fin: '2099-08-03T08:50:00+00:00', tipo_clase_id: 'tc-1', cancelada: false },
    ranking: [],
    candidatos_network: [
      { perfilId: 'perfil-ana', slug: null, nombre: 'Ana Ejemplo', fotoUrl: null, ciudad: 'Almería' },
      { perfilId: 'perfil-bea', slug: null, nombre: 'Bea Ejemplo', fotoUrl: null, ciudad: null },
      { perfilId: 'perfil-cris', slug: null, nombre: 'Cris Ejemplo', fotoUrl: null, ciudad: null },
      { perfilId: 'perfil-dani', slug: null, nombre: 'Dani Ejemplo', fotoUrl: null, ciudad: null },
    ],
    cobertura_network: {
      'perfil-ana': { tipo: 'asignable', instructorId: 'red-eq-ana' },
      'perfil-bea': { tipo: 'aceptada', solicitudId: 'redcontacto-bea' },
      'perfil-cris': { tipo: 'solicitada', paraEstaClase: true },
      'perfil-dani': { tipo: 'sin-solicitud' },
    },
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

type Respuesta = { status: number; body: unknown };
type Llamadas = { patches: Array<Record<string, unknown>>; contactos: Array<Record<string, unknown>> };

async function mockBackend(page: Page, confirmar: Respuesta): Promise<Llamadas> {
  const llamadas: Llamadas = { patches: [], contactos: [] };
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

  await page.route('**/api/sustituciones**', async route => {
    const req = route.request();
    if (req.method() === 'PATCH') {
      llamadas.patches.push(req.postDataJSON() as Record<string, unknown>);
      // Latencia: el doble toque llega con la primera petición en vuelo.
      await new Promise(r => setTimeout(r, 300));
      return json(route, confirmar.body, confirmar.status);
    }
    return json(route, {
      sustituciones: [sustitucionAgotada()], avisarAlumnas: true, modoAutonomia: 'asistido', autonomiaDisponible: true,
      equipo: { total: 2, sinDisponibilidad: [] },
    });
  });

  await page.route('**/api/network/contacto**', route => {
    if (route.request().method() !== 'POST') return json(route, { solicitud: null });
    llamadas.contactos.push(route.request().postDataJSON() as Record<string, unknown>);
    return json(route, { ok: true, solicitudId: 'redcontacto-dani' });
  });
  return llamadas;
}

async function abrirSustituciones(page: Page) {
  await page.goto('/sustituciones');
  await expect(page.getByText('No queda nadie de tu equipo. Estas profesionales de Tentare Network podrían cubrirla')).toBeVisible({ timeout: 30_000 });
}

test.describe('Sustitución agotada → asignar la clase a una profesional de Network', () => {
  test('cada profesional enseña su punto del camino, sacado del servidor', async ({ page }) => {
    const llamadas = await mockBackend(page, { status: 200, body: { ok: true } });
    await seedSesionDeDuena(page);
    await abrirSustituciones(page);

    // Pendiente → «Solicitud enviada», sin botón para volver a pedir.
    await expect(page.getByRole('status').filter({ hasText: 'Solicitud enviada' })).toHaveCount(1);
    // Aceptó pero no está en el equipo → al chat donde se formaliza (no se duplica aquí).
    const formalizar = page.getByRole('link', { name: 'Formalizar en el chat' });
    await expect(formalizar).toHaveCount(1);
    await expect(formalizar).toHaveAttribute('href', '/network/mensajes?hilo=redcontacto-bea');
    // Ya en el equipo → asignar. Solo ella.
    await expect(page.getByRole('button', { name: 'Asignar la clase' })).toHaveCount(1);
    // Sin solicitud → el toque de siempre, que ahora dice para qué clase era.
    await expect(page.getByRole('button', { name: 'Pedir que la cubra' })).toHaveCount(1);

    await page.getByRole('button', { name: 'Pedir que la cubra' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Solicitud enviada' })).toHaveCount(2);
    expect(llamadas.contactos.length).toBeGreaterThan(0);
    expect(llamadas.contactos[0].perfilId).toBe('perfil-dani');
    expect(llamadas.contactos[0].sustitucionId).toBe('sust-1');
    // Nada se ha asignado sin pedirlo.
    expect(llamadas.patches).toHaveLength(0);
  });

  test('asignar pide confirmación, manda UNA vez la acción confirmar con su ficha y solo entonces dice que está asignada', async ({ page }) => {
    const llamadas = await mockBackend(page, { status: 200, body: { ok: true, sesion_id: 'ses-1' } });
    await seedSesionDeDuena(page);
    await abrirSustituciones(page);

    // Volver atrás en la confirmación no escribe nada.
    await page.getByRole('button', { name: 'Asignar la clase' }).click();
    await expect(page.getByRole('dialog')).toContainText('Ana Ejemplo');
    await expect(page.getByRole('dialog')).toContainText('liquidación');
    await page.getByRole('button', { name: 'Volver' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(llamadas.patches).toHaveLength(0);

    await page.getByRole('button', { name: 'Asignar la clase' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Asignar la clase' }).click();
    await expect(page.getByText('Clase asignada a Ana Ejemplo.')).toBeVisible();

    expect(llamadas.patches.length).toBeGreaterThan(0);
    expect(llamadas.patches).toHaveLength(1);
    expect(llamadas.patches[0]).toMatchObject({ action: 'confirmar', sustitucionId: 'sust-1', instructorId: 'red-eq-ana' });
  });

  test('409 (ya tiene otra clase a esa hora) enseña el motivo del servidor y NUNCA «asignada»', async ({ page }) => {
    const motivo = 'No se puede: esta instructora ya tiene otra clase en ese horario. Elige otra candidata.';
    const llamadas = await mockBackend(page, { status: 409, body: { error: motivo, ok: false, motivo: 'conflicto_horario' } });
    await seedSesionDeDuena(page);
    await abrirSustituciones(page);

    await page.getByRole('button', { name: 'Asignar la clase' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Asignar la clase' }).click();
    await expect(page.getByRole('alert').filter({ hasText: motivo })).toBeVisible();

    expect(llamadas.patches.length).toBeGreaterThan(0);
    await expect(page.getByText('Clase asignada', { exact: false })).toHaveCount(0);
    // Sigue pudiendo intentarlo (o elegir a otra): el botón no desaparece.
    await expect(page.getByRole('button', { name: 'Asignar la clase' })).toBeEnabled();
  });

  test('500 enseña el error y NUNCA «asignada»', async ({ page }) => {
    const llamadas = await mockBackend(page, { status: 500, body: { error: 'No se ha podido confirmar la sustituta. La clase sigue sin cubrir; inténtalo de nuevo.' } });
    await seedSesionDeDuena(page);
    await abrirSustituciones(page);

    await page.getByRole('button', { name: 'Asignar la clase' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Asignar la clase' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'La clase sigue sin cubrir' })).toBeVisible();

    expect(llamadas.patches.length).toBeGreaterThan(0);
    await expect(page.getByText('Clase asignada', { exact: false })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Asignar la clase' })).toBeEnabled();
  });
});
