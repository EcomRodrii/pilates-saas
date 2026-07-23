import { test, expect, type Page } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Suite E2E básica: registro · reserva · pago (página pública /reservar/[slug]).
//
// Tras el Paso 2d, /reservar exige login por MAGIC LINK. El clic del enlace del
// correo no es automatizable, así que los tests SIEMBRAN una sesión de socia en
// localStorage (cliente supabasePortal, storageKey 'sb-portal-auth') y mockean
// /api/public/session — equivale a "ya autenticada por magic link".
//
// El dev server apunta a la Supabase de PRODUCCIÓN y no hay entorno de test, así
// que además interceptan la LECTURA del catálogo con un fixture y MOCKEAN las
// escrituras + el checkout de Stripe: deterministas, sin depender de datos
// reales y sin escribir en producción.
// ─────────────────────────────────────────────────────────────────────────────

const SLUG = 'tentare';
const FECHA = '2026-07-09';
const AHORA = `${FECHA}T08:00:00`;

// Catálogo mínimo: una clase reservable hoy + un plan activo. `socia` opcional:
// cuando se pasa, la ficha (con contrato) ya existe → el flujo va directo a
// confirmar; cuando es null, es un walk-in que se registrará.
function studioDataFixture(socia?: { socioId: string; nombre: string; email: string }) {
  const hoy = FECHA;
  return {
    studio: { id: 'studio-test', nombre: 'Tentare', slug: SLUG, ciudad: 'Málaga', direccion: 'Calle Test 1', email: 'hola@tentare.app', telefono: '+34 000 000 000' },
    tiposClase: [{ id: 'tc-1', studioId: 'studio-test', nombre: 'Reformer', color: '#F7A6C4', nivel: 'TODOS' }],
    salas: [{ id: 'sala-1', studioId: 'studio-test', nombre: 'Sala 1', capacidad: 10 }],
    instructores: [{ id: 'ins-1', studioId: 'studio-test', nombre: 'Ana Test', rol: 'INSTRUCTOR' }],
    spots: [],
    planesTarifa: [{ id: 'plan-test', studioId: 'studio-test', nombre: 'Mensual Ilimitado', descripcion: 'Clases ilimitadas', precio: 85, tipo: 'MENSUAL', sesiones: null, activo: true }],
    sesiones: [{ id: 'ses-test', studioId: 'studio-test', tipoClaseId: 'tc-1', salaId: 'sala-1', instructorId: 'ins-1', inicio: `${hoy}T10:00:00`, fin: `${hoy}T11:00:00`, aforoMaximo: 10, cancelada: false }],
    videosOnDemand: [], rewardRules: [], rewardCatalog: [], levelDefinitions: [],
    achievementDefinitions: [], challengeDefinitions: [], aforoReservas: [],
    socia: socia
      ? {
          socio: { id: socia.socioId, studioId: 'studio-test', nombre: socia.nombre, apellidos: '', email: socia.email, activo: true,
            aceptacionContrato: { fecha: `${FECHA}T00:00:00`, firma: socia.nombre, versionTexto: 'v1.1' } },
          suscripciones: [], reservas: [], recibos: [], facturas: [], preferenciasSocio: [],
          memberCredits: [], rewardHistory: [], rewardRedemptions: [], achievementProgress: [], challengeProgress: [], creditTransactions: [],
        }
      : null,
  };
}

// Siembra una sesión de Supabase (magic link ya completado) para el cliente
// del portal. Se ejecuta antes de cargar la página.
async function seedSession(page: Page, email: string) {
  await page.addInitScript(([e]) => {
    localStorage.setItem('sb-portal-auth', JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: 'auth-e2e', email: e, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [email]);
}

// Intercepta catálogo, sesión de socia, escrituras y checkout.
async function mockBackend(page: Page, opts: {
  socia?: { socioId: string; nombre: string; email: string } | null;
  sessionStatus?: number;
  onCheckout?: (body: unknown) => void;
} = {}) {
  // Resolución del slug → estudio (studio-slug-gate hace un
  // supabase.from('studios') real, cross-origin a Supabase). Sin este mock la
  // E2E depende de una Supabase real y de que 'tentare' exista (rompe en CI con
  // env dummy). Devolvemos el estudio del fixture y respondemos el preflight CORS.
  await page.route('**/rest/v1/studios*', route => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: {
        'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*',
      } });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ id: 'studio-test' }),
    });
  });

  await page.route('**/api/public/studio-data', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(studioDataFixture(opts.socia ?? undefined)) }));

  await page.route('**/api/public/session', route =>
    route.fulfill({
      status: opts.sessionStatus ?? (opts.socia ? 200 : 404),
      contentType: 'application/json',
      body: JSON.stringify(opts.socia ?? { error: 'No hay ninguna socia con este email en el estudio' }),
    }));

  for (const p of ['**/api/public/socio', '**/api/public/reserva']) {
    await page.route(p, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, estado: 'CONFIRMADA' }) }));
  }

  await page.route('**/api/stripe/checkout', route => {
    try { opts.onCheckout?.(route.request().postDataJSON()); } catch { /* ignore */ }
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: '/e2e/checkout-mock' }) });
  });
}

// B0.3: la resolución server-side del estudio (app/reservar/[slug]/layout.tsx →
// getStudioSeo()) se siembra con E2E_TEST=1 (ver lib/studio-seo.ts y el env del
// webServer en playwright.config.ts), así que estos tests ya SÍ corren: cargan la
// página pública real y ejercen registro · reserva · pago con el backend mockeado
// a nivel navegador. Bloquean el deploy vía el job `test` de CI.
// (Follow-up: una Supabase efímera/branch permitiría ejercer también las
//  ESCRITURAS reales — hoy mockeadas — y cazar bugs de BD como las FK-races.)
test.describe('Reserva pública (registro · reserva · pago)', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: new Date(AHORA) });
  });

  test('carga la página con el estudio y el calendario', async ({ page }) => {
    await mockBackend(page);
    await page.goto(`/reservar/${SLUG}`);
    await expect(page.getByText('Tentare').first()).toBeVisible();
    await expect(page.getByText('Reformer').first()).toBeVisible();
  });

  // Nueva UI de reserva: calendario → día → slot (SlotRow) → hoja inferior
  // (BookingSheet, role=dialog) → acción "Reservar". Ver
  // components/reserva/reserva-calendario.tsx.
  async function abrirYReservar(page: Page) {
    await page.getByRole('tab', { name: /9 de julio/i }).click();
    await page.getByRole('button', { name: /Reformer a las/i }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^reservar/i }).click();
  }

  test('reserva (socia autenticada con contrato): slot → reservar → confirmada', async ({ page }) => {
    const socia = { socioId: 'soc-e2e', nombre: 'Socia E2E', email: 'socia-e2e@test.com' };
    await seedSession(page, socia.email);
    await mockBackend(page, { socia });

    await page.goto(`/reservar/${SLUG}`);
    await abrirYReservar(page);
    // Socia con contrato → la reserva se confirma in situ (sin nombre ni firma).
    await expect(page.getByText(/reserva confirmada|lista de espera/i)).toBeVisible();
  });

  test('registro (walk-in autenticado): reservar → nombre → firma → confirmar', async ({ page }) => {
    await seedSession(page, `walkin+${Date.now()}@test.com`);
    await mockBackend(page, { socia: null }); // autenticada pero aún no socia → walk-in

    await page.goto(`/reservar/${SLUG}`);
    await abrirYReservar(page);

    // Paso registro: nombre → Continuar.
    await page.getByPlaceholder(/tu nombre completo/i).fill('Walk In E2E');
    await page.getByRole('button', { name: /^continuar/i }).click();

    // Contrato (clickwrap, ya no hay firma en canvas): aceptar términos → continuar.
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: /aceptar y continuar/i }).click();

    // Confirmar reserva.
    await page.getByRole('button', { name: /confirmar reserva/i }).click();
    await expect(page.getByText(/reserva confirmada|lista de espera/i)).toBeVisible();
  });

  test('login: sin sesión, reservar pide magic link (no deja pasar sin email)', async ({ page }) => {
    await mockBackend(page); // sin seedSession → no autenticada
    await page.goto(`/reservar/${SLUG}`);
    await abrirYReservar(page);
    // Paso de login por magic link (email), NO el flujo antiguo de nombre+email.
    await expect(page.getByPlaceholder(/tu email/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /enlace de acceso/i })).toBeVisible();
  });

  test('pago: "Contratar" plan llama al checkout con planId + studioId (sin importe)', async ({ page }) => {
    let checkoutBody: any = null;
    await mockBackend(page, { onCheckout: (b) => { checkoutBody = b; } });

    await page.goto(`/reservar/${SLUG}`);
    await page.getByRole('button', { name: /el estudio/i }).click();

    const reqPromise = page.waitForRequest('**/api/stripe/checkout');
    await page.getByRole('button', { name: /contratar/i }).first().click();
    await reqPromise;

    expect(checkoutBody).toBeTruthy();
    expect(checkoutBody.planId).toBe('plan-test');
    expect(checkoutBody.studioId).toBeTruthy();
    expect(checkoutBody.importe).toBeUndefined();
  });
});
