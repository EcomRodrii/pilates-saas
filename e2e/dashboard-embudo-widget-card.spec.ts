import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Auditoría Momence vs Tentare — "Vista de embudo de carrito abandonado" ya
// estaba construida (Fase 8 CRO, embudo_widget/embudo_widget_por_dia) pero
// escondida dentro de Configuración → API. Esta tarjeta la sube a la home
// (components/dashboard/embudo-widget-card.tsx) para que la propietaria la
// vea sin ir a buscarla. Mismo patrón de mocking que dashboard-action-center.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montarDashboard(page: Page, opts: {
  /** Filas que devuelve la RPC embudo_widget para el mes en curso. */
  embudo?: { tipo: string; n: number }[];
  /** Rol del que abre el panel. La propietaria es dueña del estudio. */
  rol?: 'PROPIETARIO' | 'RECEPCION';
} = {}) {
  const { embudo = [], rol = 'PROPIETARIO' } = opts;

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
  await page.route('**/api/decisiones**', route => json(route, {
    resumen: null,
    veredicto: { tipo: 'SIN_ANALIZAR', recomendacion: null, fraseConfianza: null, semanaTranquila: false },
    seguimiento: [], prioridades: [], masSituaciones: [], porEspecialista: [], actividad: [],
  }));
  await page.route('**/rest/v1/**', route => json(route, []));
  // Playwright resuelve las rutas en orden INVERSO de registro (la última
  // registrada gana), así que cualquier override específico va DESPUÉS del
  // fallback genérico de arriba — mismo orden que dashboard-action-center.spec.ts.
  // Con rol RECEPCION la dueña del estudio es OTRA persona: es lo que hace que
  // `useRol` no devuelva PROPIETARIO ni MANAGER.
  await page.route('**/rest/v1/studios**', route =>
    json(route, {
      id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen',
      owner_auth_user_id: rol === 'PROPIETARIO' ? AUTH_UID : 'auth-otra-persona',
    }));
  await page.route('**/rest/v1/instructores**', route =>
    json(route, rol === 'PROPIETARIO' ? [] : [
      { id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Recepción', activo: true, rol: 'RECEPCION', auth_user_id: AUTH_UID },
    ]));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/rpc/embudo_widget**', route => json(route, embudo));

  await page.goto('/dashboard');
}

test.describe('La home enseña el embudo del widget sin ir a buscarlo a Configuración', () => {
  test('con visitas este mes, la propietaria ve la tarjeta con las cifras y el enlace al detalle', async ({ page }) => {
    await montarDashboard(page, {
      embudo: [
        { tipo: 'widget_loaded', n: 240 },
        { tipo: 'booking_started', n: 60 },
        { tipo: 'checkout_started', n: 10 },
        { tipo: 'booking_completed', n: 48 },
      ],
    });

    await expect(page.getByText('Crecimiento web este mes')).toBeVisible({ timeout: 30_000 });
    // 240 visitas, 48 completadas, 48/240 = 20% conversión, abandono bruto = 70-48 = 22.
    await expect(page.getByText('240 visitas · 48 reservas completadas · 20% conversión · 22 abandonos')).toBeVisible();

    const link = page.getByRole('link', { name: /Crecimiento web este mes/ });
    await expect(link).toHaveAttribute('href', '/configuracion?tab=api');
  });

  test('sin visitas este mes no ocupa sitio (se oculta sola, igual que el resto de tarjetas de estado)', async ({ page }) => {
    await montarDashboard(page, { embudo: [] });
    await expect(page.getByText('Clientas hoy')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Crecimiento web este mes')).toHaveCount(0);
  });

  test('recepción no la ve: es un canal de marketing/captación, no de finanzas', async ({ page }) => {
    await montarDashboard(page, {
      rol: 'RECEPCION',
      embudo: [
        { tipo: 'widget_loaded', n: 100 },
        { tipo: 'booking_completed', n: 10 },
      ],
    });
    await expect(page.getByText('Clientas hoy')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Crecimiento web este mes')).toHaveCount(0);
  });
});
