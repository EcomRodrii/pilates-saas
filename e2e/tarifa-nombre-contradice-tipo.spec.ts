import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Una dueña llamó «Clase suelta» a una tarifa que se había quedado en «Cuota»
// (el formulario se abre en Cuota desde Suscripciones) y no la avisó nadie: sus
// alumnas habrían pagado 23 € cada mes. El formulario avisa cuando el nombre
// contradice el tipo, y lo arregla de un clic. Andamiaje copiado de
// planes-por-tipo-de-clase.spec.ts.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID,
  nombre: 'Studio Carmen',
  slug: 'studio-carmen',
  owner_auth_user_id: AUTH_UID,
  email: 'carmen@example.com',
  moneda: 'EUR',
};

const TIPOS_CLASE = [
  { id: 'tc-reformer', studio_id: STUDIO_ID, nombre: 'Reformer', duracion_min: 50, color: '#6D28D9' },
  { id: 'tc-mat', studio_id: STUDIO_ID, nombre: 'Mat', duracion_min: 50, color: '#F7A6C4' },
];

async function seedSesionDeDuena(page: Page) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token',
      refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800,
      expires_in: 999999999,
      token_type: 'bearer',
      user: {
        id: uid, email: 'carmen@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/**
 * Backend interceptado. Tanto `planes_tarifa` como `plan_tipos_clase` viven en
 * arrays del test: lo que la app escriba es lo que un reload devuelve, que es
 * justo lo que hay que comprobar (que se guardó de verdad, no que se pintó).
 */
async function mockBackend(page: Page, opts: {
  planesIniciales?: Record<string, unknown>[];
  vinculosIniciales?: Record<string, unknown>[];
} = {}) {
  const planes: Record<string, unknown>[] = [...(opts.planesIniciales ?? [])];
  const vinculos: Record<string, unknown>[] = [...(opts.vinculosIniciales ?? [])];

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
  await page.route('**/rest/v1/tipos_clase**', route => json(route, TIPOS_CLASE));

  await page.route('**/rest/v1/planes_tarifa**', async route => {
    const req = route.request();
    if (req.method() === 'POST') {
      const payload = JSON.parse(req.postData() || '{}');
      planes.push(...(Array.isArray(payload) ? payload : [payload]));
      return json(route, [], 201);
    }
    if (req.method() === 'PATCH') {
      const cambios = JSON.parse(req.postData() || '{}');
      const id = decodeURIComponent(req.url().match(/id=eq\.([^&]+)/)?.[1] ?? '');
      const i = planes.findIndex(p => p.id === id);
      if (i >= 0) planes[i] = { ...planes[i], ...cambios };
      // Las filas TOCADAS, como PostgREST con `.select()`: la escritura ahora
      // distingue «0 filas» de «escrito» para no cantar «Tarifa actualizada»
      // cuando la RLS rechaza.
      return json(route, i >= 0 ? [{ id }] : [], 200);
    }
    return json(route, planes);
  });

  await page.route('**/rest/v1/plan_tipos_clase**', async route => {
    const req = route.request();
    if (req.method() === 'POST') {
      const payload = JSON.parse(req.postData() || '{}');
      vinculos.push(...(Array.isArray(payload) ? payload : [payload]));
      return json(route, [], 201);
    }
    if (req.method() === 'DELETE') {
      // El guardado sincroniza: borra los vínculos del plan y reinserta.
      const planId = decodeURIComponent(req.url().match(/plan_id=eq\.([^&]+)/)?.[1] ?? '');
      let quitados = 0;
      for (let i = vinculos.length - 1; i >= 0; i--) {
        if (vinculos[i].plan_id === planId) { vinculos.splice(i, 1); quitados++; }
      }
      // Las filas borradas, como PostgREST con `select`: el guardado distingue
      // «0 filas» (sin permiso) de «borrado».
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Array.from({ length: quitados }, () => ({ plan_id: planId }))) });
    }
    return json(route, vinculos);
  });

  return { planes, vinculos };
}


async function abrirFormulario(page: Page) {
  await mockBackend(page);
  await seedSesionDeDuena(page);
  await page.goto('/productos');
  await expect(page.getByRole('button', { name: 'Crear', exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Crear', exact: true }).click();
}

test.describe('El nombre de la tarifa no contradice su tipo', () => {
  test('«Clase suelta» en una cuota avisa y se corrige de un clic', async ({ page }) => {
    await abrirFormulario(page);
    await expect(page.getByRole('radio', { name: /Cuota/ })).toHaveAttribute('aria-checked', 'true');

    await page.getByPlaceholder('Ej. Mensual ilimitado').fill('Tarifa Clase Suelta');
    const aviso = page.getByTestId('aviso-nombre-tipo');
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText('cuota');

    await aviso.getByRole('button', { name: /Hacerla clase suelta/ }).click();
    await expect(page.getByRole('radio', { name: /Clase suelta/ })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('aviso-nombre-tipo')).toHaveCount(0);
  });

  test('un nombre coherente no avisa de nada', async ({ page }) => {
    await abrirFormulario(page);
    await page.getByPlaceholder('Ej. Mensual ilimitado').fill('Mensual ilimitado');
    await expect(page.getByTestId('aviso-nombre-tipo')).toHaveCount(0);
  });
});
