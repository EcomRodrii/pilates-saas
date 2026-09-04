import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La tira de sub-pestañas (`TabsList`) no puede ensanchar la página.
//
// `inline-flex w-fit` significa "tan ancha como sus pestañas", sin techo: con
// etiquetas largas —"Reservas y cancelaciones"— la lista se salía del viewport
// y arrastraba a la PÁGINA entera. Medido en Configuración → Estudio a 390px:
// 129px de scroll horizontal, el sitio moviéndose de lado, y la última pestaña
// igualmente inalcanzable.
//
// Este test fija DOS cosas, y la segunda es la que de verdad costó verse:
//
//   1. la página no se desplaza de lado;
//   2. la pestaña ACTIVA sigue siendo visible dentro de la tira.
//
// ⚠️ Sin (2) esto pasaría en verde estando roto. El primer intento puso
// `overflow-x-auto` y dejó `justify-center`: el overflow de página bajó a 0 y
// la lista scrolleaba —o sea, los números decían "arreglado"— pero al centrar
// el exceso, "General", que además era la pestaña activa, quedaba cortada por
// la izquierda y fuera del alcance del scroll. Se vio en una captura, no en una
// medición. De ahí `justify-start` en `components/ui/tabs.tsx`: si alguien lo
// devuelve a `justify-center` "por simetría", este test lo caza.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Boutique', slug: 'pilates-boutique',
  owner_auth_user_id: AUTH_UID, email: 'hola@pilatesboutique.es', moneda: 'EUR',
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
        id: uid, email: 'hola@pilatesboutique.es', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
}

async function mockBackend(page: Page) {
  // OJO: Playwright resuelve las rutas en orden INVERSO al de registro, así que
  // los comodines van PRIMERO y las específicas después.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route => json(route, { primary: '#6D28D9', secondary: '#7C3AED', radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
}

test.describe('Las sub-pestañas de Configuración en un móvil', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Estudio: ni la página se mueve de lado, ni se pierde la pestaña activa', async ({ page }) => {
    await mockBackend(page);
    await seedSesionDeDuena(page);
    await page.goto('/configuracion?tab=estudio');

    const general = page.getByRole('tab', { name: 'General' }).first();
    await expect(general).toBeVisible({ timeout: 30_000 });

    const medida = await page.evaluate(() => {
      const lista = document.querySelector('[data-slot="tabs-list"]');
      const activa = lista?.querySelector('[data-slot="tabs-trigger"][data-active]')
        ?? lista?.querySelector('[data-slot="tabs-trigger"]');
      const lr = lista?.getBoundingClientRect();
      const ar = activa?.getBoundingClientRect();
      return {
        overflowPagina: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        // ¿La pestaña activa cae DENTRO de la caja visible de la tira? Con
        // `justify-center` sobre contenido que desborda, no caía.
        activaDentro: !!lr && !!ar && ar.left >= lr.left - 1 && ar.right <= lr.right + 1,
      };
    });

    expect(medida.overflowPagina, 'la página no debe desplazarse de lado').toBeLessThanOrEqual(0);
    expect(medida.activaDentro, 'la pestaña activa debe verse dentro de la tira').toBe(true);
  });
});
