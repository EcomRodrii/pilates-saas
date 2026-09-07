import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// «Cancelar suscripción» en la ficha de la clienta NO HACÍA NADA.
//
// El botón llamaba a `assignPlan(socioId, null)`, que es otra operación:
// «quítale el plan». Y esa protege a propósito los bonos con sesiones sin
// gastar (`conservaSaldo`) porque son dinero ya pagado — se puso justo para que
// venderle un bono nuevo no le borrara el anterior con saldo. Consecuencia no
// buscada: en la tarjeta de un bono con saldo, el botón no escribía nada y el
// aviso decía «Plan retirado». Medido en producción el 2026-09-07: 7 de las 27
// socias con tarjeta de suscripción estaban en ese caso.
//
// ⚠️ CON CONTADOR DE ESCRITURAS. Un test que solo mirase la pantalla pasaría
// igual con el bug delante: el estado optimista pintaba lo que hiciera falta.
// Lo que prueba que el botón hace algo es que salga la petición (ver
// .claude/tentare-os.md).
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
// Un bono de 10 con 8 sin gastar: exactamente el caso que el botón no tocaba.
const PLAN_BONO = {
  id: 'plan-bono', studio_id: STUDIO_ID, nombre: 'Bono 10 Reformer',
  descripcion: null, precio: 120, tipo: 'BONO', sesiones: 10, validez_dias: 90,
  limite_semanal: null, activo: true,
};
const SUS_BONO = {
  id: 'sus-1', studio_id: STUDIO_ID, socio_id: 'soc-1', plan_id: 'plan-bono',
  estado: 'ACTIVA', fecha_inicio: '2026-08-01', fecha_fin: '2026-10-30',
  sesiones_restantes: 8, stripe_subscription_id: null,
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

  const escrituras: { metodo: string; cuerpo: string }[] = [];

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
  await page.route('**/rest/v1/planes_tarifa**', route => json(route, [PLAN_BONO]));
  await page.route('**/rest/v1/suscripciones**', route => {
    const req = route.request();
    if (req.method() !== 'GET') {
      escrituras.push({ metodo: req.method(), cuerpo: req.postData() ?? '' });
      return json(route, [], 204);
    }
    return json(route, [SUS_BONO]);
  });

  await page.goto('/clientas/soc-1');
  await expect(page.getByText('Ana Gil')).toBeVisible({ timeout: 30_000 });
  return escrituras;
}

test('cancelar un bono con saldo escribe de verdad — y avisa de lo que se pierde', async ({ page }) => {
  const escrituras = await montar(page);

  await page.getByRole('button', { name: 'Cancelar suscripción' }).click();

  // Antes de tocar nada: la confirmación dice cuántas sesiones pagadas se van.
  // Es la diferencia entre una decisión y un susto.
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toContainText('Bono 10 Reformer');
  await expect(dialogo).toContainText('8 sesiones sin usar');

  await dialogo.getByRole('button', { name: 'Cancelar suscripción' }).click();

  // EL CORAZÓN DEL TEST: con el bug, aquí no salía ni una sola petición y la
  // pantalla decía «Plan retirado» igualmente.
  await expect.poll(() => escrituras.length, { timeout: 10_000 }).toBeGreaterThan(0);
  const patch = escrituras.find(e => e.metodo === 'PATCH');
  expect(patch, 'no se ha mandado ningún PATCH a suscripciones').toBeTruthy();
  expect(patch!.cuerpo).toContain('CANCELADA');

  await expect(page.getByText('Suscripción cancelada')).toBeVisible();
});

test('se puede echar atrás: «Volver» no escribe nada', async ({ page }) => {
  const escrituras = await montar(page);

  await page.getByRole('button', { name: 'Cancelar suscripción' }).click();
  await page.getByRole('button', { name: 'Volver' }).click();

  await expect(page.getByRole('dialog')).toBeHidden();
  expect(escrituras).toHaveLength(0);
});
