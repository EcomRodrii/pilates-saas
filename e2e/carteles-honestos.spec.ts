import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// P2-13. "Dos carteles que me mandan a sitios donde no está lo que busco."
//
//   · Citas: "Añade instructoras en Configuración → Estudio" — ahí no hay
//     instructoras, están en Equipo.
//   · Mi perfil: "tu nombre se gestiona en Configuración > Estudio" — ahí
//     tampoco hay campo de nombre de la propietaria. Esa pestaña son los datos
//     del ESTUDIO (nombre comercial, NIF, dirección).
//
// Actualizado (Fase 1 del perfil de la propietaria): el nombre de la
// propietaria ya no era solo un cartel honesto sobre una limitación — se
// resolvió de raíz (auth.users.user_metadata) y ahora hay un formulario real
// de Nombre/Apellidos, así que el segundo test comprueba eso en vez de solo
// la ausencia de las dos promesas falsas.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Sin instructoras: es el estado que dispara el cartel de Citas. */
async function montar(page: Page, ruta: string) {
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

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto(ruta);
}

test.describe('Carteles que llevan a donde dicen', () => {
  test('Citas manda a Equipo, que es donde están las instructoras', async ({ page }) => {
    await montar(page, '/configuracion?tab=horario-citas');

    await expect(page.getByText(/No hay instructoras activas/)).toBeVisible({ timeout: 30_000 });

    // Ya no manda a Configuración → Estudio, donde no hay ninguna.
    await expect(page.getByText(/Añade instructoras en Configuración/)).toHaveCount(0);

    // Y el enlace del CARTEL lleva de verdad a /equipo. Se busca dentro del
    // propio aviso: "Equipo" también existe en el menú lateral.
    const aviso = page.locator('div').filter({ hasText: /^No hay instructoras activas/ }).last();
    const enlace = aviso.getByRole('link', { name: 'Equipo' });
    await expect(enlace).toHaveAttribute('href', '/equipo');
  });

  test('Mi perfil ya deja a la propietaria poner su nombre, no solo un cartel honesto', async ({ page }) => {
    await montar(page, '/configuracion?tab=perfil');

    await expect(page.getByText('Nombre', { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Apellidos', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeVisible();

    // Las ausencias van DESPUÉS de anclar en algo visible: contra una pantalla
    // todavía en blanco (`next dev` compila la ruta bajo demanda) un
    // toHaveCount(0) pasa al instante aunque el cartel siguiera ahí.
    // La promesa falsa nunca vuelve…
    await expect(page.getByText(/Tu nombre y datos de contacto de propietaria se gestionan/)).toHaveCount(0);
    // …y el cartel "aún no se puede" (Fase 1 del perfil de la propietaria) ya
    // quedó obsoleto: ahora hay un formulario real.
    await expect(page.getByText(/Todavía no puedes poner tu nombre aquí/)).toHaveCount(0);
  });
});
