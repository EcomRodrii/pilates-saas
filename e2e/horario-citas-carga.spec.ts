import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La pantalla del horario de citas tiene que ENSEÑAR lo que hay guardado.
//
// Parece una obviedad hasta que se mira cómo guarda: `setDisponibilidadCitas`
// REEMPLAZA —borra todas las franjas de esa instructora e inserta las del
// borrador—, y el borrador nace de `citasDisponibilidad`. Si la pantalla arranca
// vacía porque nadie cargó esa tabla, no es solo que se vea mal: quien edite un
// día y guarde se lleva por delante los demás.
//
// Y aquí lo que se pierde está VIVO de cara al público. `/reservar/[slug]` lee
// esas franjas del catálogo de servidor, no del estado del panel, así que las
// clientas siguen viendo huecos que el estudio cree que no ha configurado. En
// producción había 15 franjas reales de tres instructoras, diez creadas el
// 6-sep-2026 — o sea, con la función en uso.
//
// Eso fue exactamente lo que pasó entre el 25-ago-2026 (#1375 sacó la tabla del
// arranque y nadie escribió la carga posterior) y esta reparación. Ningún test
// lo veía: tsc en verde, lint en verde, y una pantalla que decía «Sin
// disponibilidad», indistinguible de una instructora sin horario.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR', nif: 'B00000000',
  plan: 'ESTUDIO', subscription_status: 'active',
};

const INSTRUCTORA = {
  id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Indira Herrero', email: 'indira@example.com',
  activo: true, imparte_clases: true, color: '#B08D57',
};

// Dos franjas del lunes: el caso que rompía. Con una sola no se distingue
// «cargó bien» de «el borrador se quedó con lo último que tecleé».
const FRANJAS = [
  { id: 'cd-1', studio_id: STUDIO_ID, instructor_id: 'ins-1', dia_semana: 1, hora_inicio: '09:00', hora_fin: '11:00', creado_en: '2026-09-06T10:00:00Z' },
  { id: 'cd-2', studio_id: STUDIO_ID, instructor_id: 'ins-1', dia_semana: 1, hora_inicio: '17:00', hora_fin: '20:00', creado_en: '2026-09-06T10:00:00Z' },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesionDeDuena(page: Page) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'cloe@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
}

async function base(page: Page) {
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/instructores**', route => json(route, [INSTRUCTORA]));
  await seedSesionDeDuena(page);
}

test.describe('Horario de citas', () => {
  test('las franjas guardadas se ven al abrir la pantalla', async ({ page }) => {
    let vecesPedida = 0;
    await base(page);
    await page.route('**/rest/v1/citas_disponibilidad**', route => {
      if (route.request().method() === 'GET') { vecesPedida += 1; return json(route, FRANJAS); }
      return json(route, []);
    });

    await page.goto('/configuracion?tab=horario-citas');
    await expect(page.getByRole('heading', { name: 'Citas' })).toBeVisible({ timeout: 30_000 });

    // Las dos franjas del lunes, con sus horas. Si la tabla no se carga, aquí
    // pone «Sin disponibilidad» y el test cae — que es lo que se busca.
    const horas = page.locator('input[type="time"]');
    await expect(horas).toHaveCount(4, { timeout: 30_000 });
    await expect(horas.nth(0)).toHaveValue('09:00');
    await expect(horas.nth(1)).toHaveValue('11:00');
    await expect(horas.nth(2)).toHaveValue('17:00');
    await expect(horas.nth(3)).toHaveValue('20:00');
    await expect(page.getByText('Sin disponibilidad').first()).toBeVisible(); // otros días, sí vacíos

    // Y se pide UNA vez, no una por render: la carga se marca antes de esperar.
    expect(vecesPedida).toBe(1);
  });
});
