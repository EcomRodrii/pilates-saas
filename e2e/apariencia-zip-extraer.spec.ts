import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// «Extraer a tema nativo» — components/theme/importar-tema-zip.tsx.
//
// El camino real a lo que se pidió del ZIP importado: no publicarlo como "Tu
// tema" (reabriría el aislamiento de origen, decisión de seguridad ya
// cerrada — ver app/tema-publicado/[slug]/[[...ruta]]/route.ts), sino leer su
// color de marca declarado e instalar un tema NATIVO nuevo con ese color,
// editable visualmente y publicable de verdad. El lado servidor
// (extraerColorDeclarado) ya tiene sus propios tests unitarios
// (lib/theme-import/extraer-tema.test.ts); esto verifica que el botón manda
// la acción correcta y seguía a donde promete — el fallo que ya le costó a
// esta pantalla dos veces (P1 de la auditoría Momence: el rail prometía algo
// que la página no cumplía).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const TEMA_LISTO = {
  id: 'zip-1',
  nombre: 'Tentade',
  manifest: { ficheros: [{ ruta: 'index.html', bytes: 1000, clase: 'html' }], assets: [], fonts: [], entryPoints: ['index.html'], stylesheets: [], framework: 'desconocido', dependencias: [], incompatibilidades: [] },
  estado: 'listo',
  detalle: null,
  publicado: false,
  publicado_en: null,
  creado_en: '2026-08-15T00:00:00Z',
};

async function montar(page: Page, temas: unknown[] = [TEMA_LISTO]) {
  const patches: Record<string, unknown>[] = [];
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

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/billing/status**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  await page.route('**/api/theme**', route => json(route, { primary: '#6D28D9', secondary: '#7C3AED' }));
  await page.route('**/api/layout**', route => json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/portal-bloques**', route => {
    const todas = new URL(route.request().url()).searchParams.get('pantalla') === 'todas';
    return json(route, todas ? { home: [], clases: [], bonos: [], reservar: [] } : []);
  });
  await page.route('**/api/theme/importado', route => json(route, { temas }));
  await page.route('**/api/theme/importado/*', route => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      patches.push(body);
      if (body.accion === 'extraer') {
        // El tema de prueba "no declara color" salvo que se le pida lo
        // contrario — así el mismo mock cubre éxito y fallo.
        const conColor = (temas[0] as { conColor?: boolean })?.conColor;
        return conColor
          ? json(route, { ok: true, primary: '#333B24' })
          : json(route, { error: 'Este tema no declara un color de marca extraíble.' }, 422);
      }
      return json(route, { ok: true });
    }
    return json(route, {});
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/configuracion/apariencia');
  return { patches };
}

test('extraer con éxito manda la acción correcta y lleva al editor nativo', async ({ page }) => {
  const { patches } = await montar(page, [{ ...TEMA_LISTO, conColor: true }]);
  await expect(page.getByText('Tentade', { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Extraer a tema nativo' }).click();
  await page.waitForURL(/\/configuracion\/apariencia\/editor$/, { timeout: 15_000 });

  expect(patches).toContainEqual({ accion: 'extraer' });
});

test('sin color declarado, avisa del motivo y NO navega', async ({ page }) => {
  await montar(page, [{ ...TEMA_LISTO, conColor: false }]);
  await expect(page.getByText('Tentade', { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.getByRole('button', { name: 'Extraer a tema nativo' }).click();
  await expect(page.getByText('Este tema no declara un color de marca extraíble.')).toBeVisible();
  await expect(page).toHaveURL(/\/configuracion\/apariencia$/);
});
