import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// P2-8. "La política de cancelación es única, no por tipo de clase — un
// reformer necesita más antelación que un mat para recolocar la plaza."
//
// Antes solo existía una cifra para todo el estudio. Ahora cada tipo de clase
// puede tener su propia ventana de cancelación; sin marcar nada, sigue
// heredando la del estudio (ningún tipo de clase existente cambia de
// comportamiento).
//
// Esta suite fija dos contratos:
//   1. la ventana propia de un tipo de clase se GUARDA (llega a la BD, no solo
//      se pinta) y sigue ahí al recargar;
//   2. dejarla vacía sigue significando "hereda la del estudio" — lo que ya
//      hacían todos los tipos de clase existentes.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen',
  owner_auth_user_id: AUTH_UID, email: 'carmen@example.com', moneda: 'EUR',
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
        id: uid, email: 'carmen@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
}

function tipoClaseRow(id: string, nombre: string, ventana: number | null = null): Record<string, unknown> {
  return {
    id, studio_id: STUDIO_ID, nombre, color: '#F7A6C4', duracion_minutos: 55,
    descripcion: null, nivel: 'TODOS', foto_url: null, ventana_cancelacion_horas: ventana,
  };
}

async function mockBackend(page: Page, opts: { tiposIniciales?: Record<string, unknown>[] } = {}) {
  const tipos: Record<string, unknown>[] = [...(opts.tiposIniciales ?? [])];

  // OJO: Playwright resuelve las rutas en orden INVERSO al de registro, así que
  // los comodines van PRIMERO y las específicas después.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.route('**/rest/v1/tipos_clase**', async route => {
    const req = route.request();
    if (req.method() === 'POST') {
      const payload = JSON.parse(req.postData() || '{}');
      tipos.push(...(Array.isArray(payload) ? payload : [payload]));
      return json(route, [], 201);
    }
    if (req.method() === 'PATCH') {
      const cambios = JSON.parse(req.postData() || '{}');
      const id = decodeURIComponent(req.url().match(/id=eq\.([^&]+)/)?.[1] ?? '');
      const i = tipos.findIndex(t => t.id === id);
      if (i >= 0) tipos[i] = { ...tipos[i], ...cambios };
      return json(route, [], 200);
    }
    return json(route, tipos);
  });

  return { tipos };
}

async function abrirClases(page: Page) {
  await page.goto('/configuracion?tab=clases');
  await expect(page.getByRole('button', { name: 'Nuevo tipo de clase' })).toBeVisible({ timeout: 30_000 });
}

test.describe('Ventana de cancelación por tipo de clase', () => {
  test('poner una ventana propia se guarda y sigue ahí al recargar', async ({ page }) => {
    const { tipos } = await mockBackend(page);
    await seedSesionDeDuena(page);
    await abrirClases(page);

    await page.getByRole('button', { name: 'Nuevo tipo de clase' }).click();
    await page.getByPlaceholder('Ej: Reformer Avanzado').fill('Reformer');
    await page.getByPlaceholder('Ventana del estudio').fill('24');
    await page.getByRole('button', { name: 'Crear tipo de clase' }).click();

    // Llegó a la BD como su propio campo, no solo a la pantalla.
    await expect.poll(() => tipos.length, { timeout: 15_000 }).toBe(1);
    expect(tipos[0]).toMatchObject({ nombre: 'Reformer', ventana_cancelacion_horas: 24 });

    // Y se ve en la tarjeta sin tener que abrir el modal.
    await expect(page.getByText('Cancelación: 24h de antelación (propia de este tipo)')).toBeVisible();

    // La comprobación de la dueña: recargar y ver si le dijimos la verdad.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Nuevo tipo de clase' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Cancelación: 24h de antelación (propia de este tipo)')).toBeVisible();
  });

  test('sin marcar nada, sigue heredando la ventana del estudio', async ({ page }) => {
    // Compatibilidad hacia atrás: un tipo de clase que ya existía sin override
    // no debe empezar a comportarse distinto por su cuenta.
    const { tipos } = await mockBackend(page, { tiposIniciales: [tipoClaseRow('tc-mat', 'Mat')] });
    await seedSesionDeDuena(page);
    await abrirClases(page);

    // No hay ninguna nota de "propia de este tipo" para Mat: hereda la del estudio.
    await expect(page.getByText('Mat')).toBeVisible();
    await expect(page.getByText(/propia de este tipo/)).toHaveCount(0);

    await page.getByRole('button', { name: 'Editar' }).first().click();
    await expect(page.getByPlaceholder('Ventana del estudio')).toHaveValue('');

    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Tipo de clase actualizado')).toBeVisible({ timeout: 15_000 });
    expect(tipos[0].ventana_cancelacion_horas).toBeNull();
  });
});
