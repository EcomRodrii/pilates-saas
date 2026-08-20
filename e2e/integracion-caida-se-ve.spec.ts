import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Una integración caída, dicha donde la propietaria entra.
//
// La tarjeta de Configuración → Integraciones ya dice la verdad, pero solo si
// vas a mirarla, y nadie abre Configuración a diario. Con el token de Meta
// revocado, un estudio se enteraba semanas después de que sus clientas habían
// dejado de recibir recordatorios.
//
// Se prueba en /dashboard y no en la pantalla de Integraciones a propósito: el
// sitio ES el arreglo.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montarDashboard(page: Page, integraciones: unknown[]) {
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
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/instructores**', route => json(route, []));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  // Se registra AL FINAL: Playwright da prioridad a la última ruta que encaja,
  // así que esta gana al comodín `**/rest/v1/**` de arriba.
  await page.route('**/rest/v1/integraciones**', route => json(route, integraciones));

  await page.goto('/dashboard');
}

const wa = (extra: Record<string, unknown>) => ({
  id: 'intg-whatsapp', studio_id: STUDIO_ID, tipo: 'WHATSAPP', activo: true,
  config: { token: 'x', phoneId: '1' }, actualizado_en: '2026-08-01T10:00:00Z',
  ultimo_ok_en: null, ultimo_error: null, ultimo_error_en: null, ...extra,
});

test.describe('Una integración caída se ve sin ir a buscarla', () => {
  test('con el token caducado, lo dice en el panel y con el motivo real', async ({ page }) => {
    await montarDashboard(page, [wa({
      ultimo_ok_en: '2026-08-15T10:00:00Z',
      ultimo_error: 'Error validating access token: Session has expired',
      ultimo_error_en: '2026-08-18T09:00:00Z',
    })]);

    await expect(page.getByText('WhatsApp Business ha dejado de funcionar')).toBeVisible({ timeout: 30_000 });
    // El motivo del servicio, no un «revisa la configuración»: es lo único que
    // distingue un token caducado de un número mal puesto.
    await expect(page.getByText(/Session has expired/)).toBeVisible();
    // Y qué está costando mientras tanto.
    await expect(page.getByText(/no está llegando a tus clientas/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Arreglarlo en Integraciones/ })).toBeVisible();
  });

  test('funcionando no interrumpe: cero píxeles', async ({ page }) => {
    // Un aviso que también aparece cuando todo va bien deja de ser un aviso.
    await montarDashboard(page, [wa({ ultimo_ok_en: '2026-08-18T10:00:00Z' })]);
    await expect(page.getByText('Clientas hoy')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/ha dejado de funcionar/)).toHaveCount(0);
  });

  test('un fallo VIEJO con un envío posterior tampoco avisa', async ({ page }) => {
    // Si un error de la semana pasada dejara esto puesto para siempre, la
    // propietaria aprendería a ignorarlo — y entonces no vería el que importa.
    await montarDashboard(page, [wa({
      ultimo_ok_en: '2026-08-18T10:00:00Z',
      ultimo_error: 'timeout', ultimo_error_en: '2026-08-17T10:00:00Z',
    })]);
    await expect(page.getByText('Clientas hoy')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/ha dejado de funcionar/)).toHaveCount(0);
  });

  // Falta a propósito un test de «/rest/v1/integraciones devuelve algo con otra
  // forma». Se escribió, y resultó que asumía una garantía que el código no da:
  // PostgREST no devuelve un objeto en una lectura de tabla, y con ese mock lo
  // que falla es la carga entera del estudio, que cae —sin un solo error de
  // JS— en la pantalla «Esta cuenta no tiene ningún estudio». Degrada bien; no
  // hay bug que fijar aquí. La tolerancia a datos con otra forma SÍ se prueba,
  // donde sí es alcanzable: `integracionesCaidas` en lib/integraciones/salud.test.ts.
});
