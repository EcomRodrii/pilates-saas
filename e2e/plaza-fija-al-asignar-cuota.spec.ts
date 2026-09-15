import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Al asignar una cuota desde la ficha, se pregunta si le das plaza fija.
//
// La plaza fija va con la cuota (con bono se reserva clase a clase), así que el
// momento de darla es justo al asignar la cuota. Solo se ofrece: «Ahora no» no
// guarda nada, y con un bono no se pregunta. Con contadores: que salga (o no) la
// pregunta no dice nada si el alta del plan no se ha escrito.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR',
};
const SOCIO = {
  id: 'soc-1', studio_id: STUDIO_ID, nombre: 'Ana', apellidos: 'Gil',
  email: 'ana@example.com', telefono: null, activo: true,
  fecha_alta: '2026-01-10T09:00:00+00:00', campos_extra: {},
};
const PLAN_CUOTA = {
  id: 'plan-cuota', studio_id: STUDIO_ID, nombre: 'Cuota mensual 2x',
  descripcion: null, precio: 85, tipo: 'MENSUAL', sesiones: null, validez_dias: null,
  limite_semanal: 2, periodicidad_meses: 1, matricula: 0, activo: true,
};
const PLAN_BONO = {
  id: 'plan-bono', studio_id: STUDIO_ID, nombre: 'Bono 10 sesiones',
  descripcion: null, precio: 90, tipo: 'BONO', sesiones: 10, validez_dias: 90,
  limite_semanal: null, periodicidad_meses: null, matricula: 0, activo: true,
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page) {
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

  const cuenta = { altas: [] as string[], plazas: [] as string[] };

  // OJO con el orden: Playwright resuelve en orden INVERSO al de registro.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/socios**', route => json(route, [SOCIO]));
  await page.route('**/rest/v1/planes_tarifa**', route => json(route, [PLAN_CUOTA, PLAN_BONO]));
  await page.route('**/rest/v1/suscripciones**', route => {
    const req = route.request();
    if (req.method() !== 'GET') {
      cuenta.altas.push(`${req.method()} ${req.postData() ?? ''}`);
      return json(route, [], 201);
    }
    return json(route, []);
  });
  await page.route('**/api/pos/ventas/por-asignar**', route => json(route, { ventas: [] }));
  await page.route('**/api/plazas-fijas**', route => {
    if (route.request().method() !== 'GET') cuenta.plazas.push(route.request().postData() ?? '');
    return json(route, {});
  });

  await page.goto('/clientas/soc-1');
  await expect(page.getByText('Ana Gil')).toBeVisible({ timeout: 30_000 });
  return cuenta;
}

async function elegirPlan(page: Page, nombre: RegExp) {
  await page.getByRole('button', { name: 'Asignar plan', exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: nombre }).click();
}

test('al asignar una cuota pregunta por la plaza fija, y «Elegir su clase» abre el diálogo de plaza fija', async ({ page }) => {
  const cuenta = await montar(page);
  await elegirPlan(page, /Cuota mensual 2x/);

  await expect.poll(() => cuenta.altas.length, { timeout: 10_000 }).toBeGreaterThan(0);
  const pregunta = page.getByRole('dialog').filter({ hasText: '¿Le das una plaza fija?' });
  await expect(pregunta).toBeVisible();
  await expect(pregunta).toContainText('«Cuota mensual 2x» ya está asignado');

  await pregunta.getByRole('button', { name: 'Elegir su clase' }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Asignar plaza fija' })).toBeVisible();
  // Abrir el diálogo no guarda nada: la plaza se guarda al elegir la clase.
  expect(cuenta.plazas).toHaveLength(0);
});

test('«Ahora no» cierra la pregunta sin guardar ninguna plaza fija', async ({ page }) => {
  const cuenta = await montar(page);
  await elegirPlan(page, /Cuota mensual 2x/);

  const pregunta = page.getByRole('dialog').filter({ hasText: '¿Le das una plaza fija?' });
  await pregunta.getByRole('button', { name: 'Ahora no' }).click();
  await expect(pregunta).toBeHidden();
  expect(cuenta.altas.length).toBeGreaterThan(0);
  expect(cuenta.plazas).toHaveLength(0);
});

test('con un bono no se pregunta: la plaza fija es solo con cuota', async ({ page }) => {
  const cuenta = await montar(page);
  await elegirPlan(page, /Bono 10 sesiones/);

  await expect.poll(() => cuenta.altas.length, { timeout: 10_000 }).toBeGreaterThan(0);
  await expect(page.getByText('Plan "Bono 10 sesiones" asignado')).toBeVisible();
  await expect(page.getByText('¿Le das una plaza fija?')).toHaveCount(0);
});
