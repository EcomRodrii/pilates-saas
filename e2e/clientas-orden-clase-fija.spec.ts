import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Clientas: ordenar por el día y la hora de la clase fija (petición de un estudio,
// 10-nov-2026). Quien no tiene clase fija queda al final, también al invertir el
// orden, y el horario se ve al lado de la etiqueta mientras se ordena así.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR',
};
const socio = (id: string, nombre: string, extra: Record<string, unknown> = {}) => ({
  id, studio_id: STUDIO_ID, nombre, apellidos: 'Prueba', email: `${id}@example.com`, telefono: null,
  activo: true, fecha_alta: '2026-01-10T09:00:00+00:00', lead_stage: 'ACTIVA', campos_extra: {}, tags: [], ...extra,
});
const plaza = (id: string, socioId: string, dia: number, hora: string, estado = 'ACTIVA') => ({
  id, studio_id: STUDIO_ID, socio_id: socioId, dia_semana: dia, hora_inicio: hora,
  sala_id: null, tipo_clase_id: null, spot_id: null,
  vigencia_desde: '2026-01-01', vigencia_hasta: null, estado, creada_en: '2026-01-01T00:00:00+00:00',
});

const SOCIOS = [
  socio('soc-zoe', 'Zoe'), socio('soc-ana', 'Ana'), socio('soc-bea', 'Bea'),
  socio('soc-dani', 'Dani'), socio('soc-eva', 'Eva'),
];
// Bea lun 10:00 · Ana lun 12:00 · Zoe mar 08:00 · Eva dom 09:00 · Dani sin clase fija.
const PLAZAS = [
  plaza('pf-1', 'soc-zoe', 2, '08:00:00'), plaza('pf-2', 'soc-ana', 1, '12:00:00'),
  plaza('pf-3', 'soc-bea', 1, '10:00:00'), plaza('pf-4', 'soc-eva', 0, '09:00:00'),
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, ruta: string) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'cloe@example.com', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  // Playwright resuelve en orden INVERSO al de registro: primero lo genérico.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/billing/status**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/rpc/stats_clientas', route =>
    json(route, [{ total: 5, activas: 5, con_bono: 0, inactivas_30d: 0 }]));
  await page.route('**/rest/v1/socios**', route => json(route, SOCIOS));
  await page.route('**/rest/v1/plazas_fijas**', route => json(route, route.request().method() === 'GET' ? PLAZAS : []));

  await page.goto(ruta);
}


const horarios = (page: Page) => page.locator('[data-testid="clase-fija-horario"]:visible').allTextContents();
const nombres = (page: Page) => page.locator('tbody tr:visible a[href^="/clientas/"]').allTextContents();

test.describe('Clientas: orden por clase fija', () => {
  test('por día y hora: el lunes temprano primero, el domingo al final y quien no tiene, la última', async ({ page }) => {
    await montar(page, '/clientas?orden=clase_fija');
    await expect(page.getByTestId('etiqueta-fija').first()).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => horarios(page)).toEqual(['lun 10:00', 'lun 12:00', 'mar 08:00', 'dom 09:00']);
    const lista = (await nombres(page)).map(n => n.trim());
    expect(lista).toEqual(['Bea Prueba', 'Ana Prueba', 'Zoe Prueba', 'Eva Prueba', 'Dani Prueba']);
  });

  test('al invertirlo, el domingo va primero y quien no tiene clase fija sigue al final', async ({ page }) => {
    await montar(page, '/clientas?orden=clase_fija');
    await expect(page.getByTestId('etiqueta-fija').first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: /Orden ascendente/ }).click();
    await expect.poll(() => horarios(page)).toEqual(['dom 09:00', 'mar 08:00', 'lun 12:00', 'lun 10:00']);
    const lista = (await nombres(page)).map(n => n.trim());
    expect(lista[lista.length - 1]).toBe('Dani Prueba');
  });

  test('se elige desde el selector «Orden», también en pantalla de escritorio', async ({ page }) => {
    await montar(page, '/clientas');
    await expect(page.getByText('Ana Prueba').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('clase-fija-horario')).toHaveCount(0);
    await page.getByRole('combobox', { name: /Orden/ }).selectOption({ label: 'Clase fija (día y hora)' });
    await expect.poll(() => horarios(page)).toEqual(['lun 10:00', 'lun 12:00', 'mar 08:00', 'dom 09:00']);
  });
});
