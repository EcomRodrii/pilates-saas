import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// P2-9. "Exigir plan o bono activo para reservar" era una decisión de negocio
// que nadie tomó: heredaba un DEFAULT false de hace meses, dejando reservar
// sin plan ni bono activo. Ahora el estudio nace protegido en eso — migración
// 0109 aplicada en producción (default true + backfill de las filas).
//
// "Devolver la sesión del bono en cancelaciones tardías" se aparcó (#427):
// el PR original decía que activarla por defecto protegía, pero el código
// hace lo CONTRARIO — `devolverEnTardia=true` es la opción PERMISIVA (nunca
// penaliza una cancelación tardía). Los 15 estudios de producción ya estaban
// en `false` (protegidos); aplicar el default a `true` tal cual se lo habría
// quitado a todos en silencio. Se queda exactamente como estaba — decisión
// de negocio pendiente, no arrastre.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page) {
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
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  // Fila SIN reserva_exigir_plan ni cancelacion_devolver_bono_tardia: como
  // cualquier estudio anterior a la migración 0114 que aún no haya recargado
  // esas columnas, o el tipo antes de que el backfill llegara al cliente.
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/configuracion?tab=estudio');
}

test.describe('Reservas y cancelaciones: solo lo que sí se decidió nace activado', () => {
  test('sin dato del servidor, "exigir plan" arranca activado y "devolver bono" no', async ({ page }) => {
    await montar(page);

    // El <label> hace de nombre accesible del botón (elemento "labelable").
    const toggleDevolver = page.getByRole('button', { name: /Devolver la sesión del bono/ });
    const toggleExigir = page.getByRole('button', { name: /Exigir plan o bono activo/ });

    await expect(toggleExigir).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
    // Aparcada (#427): activarla por defecto habría quitado la penalización
    // por cancelar tarde a los estudios reales sin que nadie lo decidiera.
    await expect(toggleDevolver).toHaveAttribute('aria-pressed', 'false');
  });

  test('el texto sigue llamando "(recomendado)" a la opción que protege de verdad', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Devolver la sesión del bono en cancelaciones tardías')).toBeVisible({ timeout: 30_000 });

    // Protectora = que la cancelación tardía SÍ pierda la sesión. Esa es la
    // que el copy recomienda, no la contraria.
    await expect(page.getByText(/Desactivado:.*pierde la sesión.*recomendado/)).toBeVisible();
  });
});
