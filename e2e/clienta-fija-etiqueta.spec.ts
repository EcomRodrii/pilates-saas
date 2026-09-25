import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// «Clienta fija» en la lista de Clientas, y el género que cambia las palabras.
//
// Quien tiene una plaza fija no se distinguía en la lista: había que abrir su
// ficha. Ahora lleva la etiqueta al lado del nombre. Y cada persona puede ser
// Mujer u Hombre («clienta fija» / «cliente fijo»); sin indicar se escribe en
// femenino, como siempre.
//
// Cada «no se guardó» va con su contador de «sí se intentó» (ver
// .claude/tentare-os.md): un test de camino de fallo sin él es hueco.
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
const plaza = (id: string, socioId: string, estado: string) => ({
  id, studio_id: STUDIO_ID, socio_id: socioId, dia_semana: 2, hora_inicio: '10:00:00',
  sala_id: null, tipo_clase_id: null, spot_id: null,
  vigencia_desde: '2026-01-01', vigencia_hasta: null, estado, creada_en: '2026-01-01T00:00:00+00:00',
});

// Ana: fija, sin género indicado. Bruno: fijo, HOMBRE, plaza en pausa (sigue siendo fijo).
// Carla: su plaza está de BAJA. Dani: sin plaza.
const SOCIOS = [
  socio('soc-ana', 'Ana'),
  socio('soc-bruno', 'Bruno', { genero: 'HOMBRE' }),
  socio('soc-carla', 'Carla', { genero: 'MUJER' }),
  socio('soc-dani', 'Dani'),
];
const PLAZAS = [plaza('pf-1', 'soc-ana', 'ACTIVA'), plaza('pf-2', 'soc-bruno', 'PAUSADA'), plaza('pf-3', 'soc-carla', 'BAJA')];

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

  const parches: Record<string, unknown>[] = [];
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
    json(route, [{ total: 4, activas: 4, con_bono: 0, inactivas_30d: 0 }]));
  await page.route('**/rest/v1/socios**', route => {
    if (route.request().method() === 'PATCH') {
      parches.push(JSON.parse(route.request().postData() ?? '{}'));
      return route.fulfill({ status: 204, body: '' });
    }
    return json(route, SOCIOS);
  });
  await page.route('**/rest/v1/plazas_fijas**', route => json(route, route.request().method() === 'GET' ? PLAZAS : []));

  await page.goto(ruta);
  return { parches };
}

test.describe('Clientas: «Clienta fija» al lado del nombre', () => {
  test('la lista marca a quien tiene plaza fija, en femenino o masculino, y a nadie más', async ({ page }) => {
    await montar(page, '/clientas');
    // .first(): la fila de escritorio y la tarjeta móvil conviven en el DOM.
    await expect(page.getByText('Ana Prueba').first()).toBeVisible({ timeout: 30_000 });
    // Las plazas llegan en la segunda ola de carga: se espera la etiqueta, no su ausencia.
    await expect(page.getByTestId('etiqueta-fija').first()).toBeVisible({ timeout: 15_000 });

    const etiquetaDe = (nombre: string) => page.locator('p', { hasText: `${nombre} Prueba` }).getByTestId('etiqueta-fija');

    await expect(etiquetaDe('Ana').first()).toHaveText('Clienta fija');
    await expect(etiquetaDe('Bruno').first()).toHaveText('Cliente fijo');
    // Su plaza está de baja: ya no es fija.
    await expect(etiquetaDe('Carla')).toHaveCount(0);
    await expect(etiquetaDe('Dani')).toHaveCount(0);
  });
});

test.describe('Género: cambia las palabras de la persona', () => {
  test('se elige en la ficha, viaja al guardar y la etiqueta pasa a «Cliente fijo»', async ({ page }) => {
    const { parches } = await montar(page, '/clientas/soc-ana');
    await expect(page.getByTestId('etiqueta-clienta-fija')).toHaveText('Clienta fija', { timeout: 30_000 });

    await page.getByRole('button', { name: 'Editar clienta' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Editar clienta' });
    await expect(dialogo.getByLabel('Género')).toHaveValue('');
    await dialogo.getByLabel('Género').selectOption('HOMBRE');
    await dialogo.getByRole('button', { name: 'Guardar cambios' }).click();

    // Se intentó de verdad, y lo que viajó es el género.
    await expect.poll(() => parches.length).toBeGreaterThan(0);
    expect(parches.some(p => p.genero === 'HOMBRE')).toBe(true);
    await expect(page.getByText('Cliente actualizado')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('etiqueta-clienta-fija')).toHaveText('Cliente fijo');
    await expect(page.getByRole('button', { name: 'Editar cliente' })).toBeVisible();
  });

  test('sin género indicado, todo se escribe en femenino como siempre', async ({ page }) => {
    await montar(page, '/clientas/soc-dani');
    await expect(page.getByRole('button', { name: 'Editar clienta' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('etiqueta-clienta-fija')).toHaveCount(0);
  });
});
