import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El canje dejaba de existir en cuanto la socia lo hacía.
//
// El cobro de créditos y la reserva de stock funcionaban (y son atómicos). Lo
// que faltaba era el otro lado: `updateRewardRedemptionEstado` llevaba meses en
// el contexto SIN un solo consumidor, ninguna pantalla leía
// `reward_redemptions`, y el estado ENTREGADO estaba en el CHECK de la tabla
// sin que nadie lo escribiera. La socia se quedaba sin créditos, el portal le
// decía «El estudio te avisará», y al estudio no se le avisaba.
//
// Lo que de verdad protege este fichero es el SEGUNDO test. Cancelar tiene que
// pasar por la RPC `cancelar_canje` —que devuelve créditos y stock en una
// transacción—, no por un PATCH de estado. Un PATCH deja la etiqueta en
// CANCELADO y a la socia sin recompensa Y sin créditos: parece que funciona,
// no falla nada, y se ha quedado el dinero. Es una simplificación que alguien
// hará tarde o temprano mirando solo la firma de la función.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR', nif: 'B00000000',
  // La gamificación vive tras un PlanGate: sin plan de pago no se renderiza.
  plan: 'ESTUDIO', subscription_status: 'active',
};

const SOCIA = {
  id: 'soc-1', studio_id: STUDIO_ID, nombre: 'Marta Ruiz', email: 'marta@example.com',
  estado: 'ACTIVA', creado_en: '2026-01-01T00:00:00Z',
};

const RECOMPENSA = {
  id: 'rc-1', studio_id: STUDIO_ID, nombre: 'Clase invitada', descripcion: null,
  coste_creditos: 500, icono: '🎁', activo: true, stock: 3, creado_en: '2026-01-01T00:00:00Z',
};

const CANJE_PENDIENTE = {
  id: 'rwd-1', studio_id: STUDIO_ID, socio_id: 'soc-1', catalog_item_id: 'rc-1',
  creditos_gastados: 500, estado: 'PENDIENTE', creado_en: '2026-09-06T10:00:00Z',
};

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
  await page.route('**/rest/v1/socios**', route => json(route, [SOCIA]));
  await page.route('**/rest/v1/reward_catalog**', route => json(route, [RECOMPENSA]));
  await page.route('**/rest/v1/member_credits**', route => json(route, [{
    socio_id: 'soc-1', studio_id: STUDIO_ID, saldo: 120, total_ganado: 620,
    total_canjeado: 500, actualizado_en: '2026-09-06T10:00:00Z',
  }]));
  await seedSesionDeDuena(page);
}

/** Abre Configuración › Logros y motivación › Canjes. */
async function abrirCanjes(page: Page) {
  await page.goto('/configuracion?tab=gamificacion');
  await expect(page.getByRole('heading', { name: 'Logros y motivación' })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('tab', { name: 'Canjes' }).click();
  await expect(page.getByRole('heading', { name: 'Pendientes de entregar' })).toBeVisible({ timeout: 30_000 });
}

test.describe('Canjes pendientes', () => {
  test('un canje pendiente se ve, con quién lo pidió y qué costó', async ({ page }) => {
    await base(page);
    await page.route('**/rest/v1/reward_redemptions**', route => json(route, [CANJE_PENDIENTE]));

    await abrirCanjes(page);

    // Los tres datos que hacen falta para poder entregarlo: qué, a quién y
    // cuánto pagó. Sin el nombre de la socia la lista no sirve de nada.
    await expect(page.getByText('Clase invitada')).toBeVisible();
    await expect(page.getByText(/Marta Ruiz/)).toBeVisible();
    await expect(page.getByText(/500 créditos/)).toBeVisible();
  });

  test('cancelar pasa por la RPC que DEVUELVE los créditos, no por un cambio de estado', async ({ page }) => {
    const llamadasRpc: string[] = [];
    const patchesDeEstado: string[] = [];

    await base(page);
    await page.route('**/rest/v1/reward_redemptions**', route => {
      if (route.request().method() === 'GET') return json(route, [CANJE_PENDIENTE]);
      // Un PATCH aquí al cancelar sería exactamente el fallo: etiqueta
      // cambiada, créditos no devueltos.
      patchesDeEstado.push(route.request().method());
      return json(route, []);
    });
    await page.route('**/rest/v1/rpc/cancelar_canje', route => {
      llamadasRpc.push(route.request().postData() ?? '');
      return json(route, [{ estado: 'CANCELADO', saldo: 620 }]);
    });

    await abrirCanjes(page);
    await page.getByRole('button', { name: 'Cancelar' }).click();

    await expect.poll(() => llamadasRpc.length, { timeout: 10_000 }).toBe(1);
    // Y la RPC recibe el canje y el estudio: sin `p_studio_id` el aislamiento
    // por estudio de la función no puede aplicarse.
    expect(llamadasRpc[0]).toContain('rwd-1');
    expect(llamadasRpc[0]).toContain(STUDIO_ID);
    expect(patchesDeEstado).toHaveLength(0);

    // Y la pantalla dice lo que ha pasado con los créditos, no solo "hecho".
    await expect(page.getByText(/se han devuelto 500 créditos/i)).toBeVisible({ timeout: 10_000 });
  });

  test('entregar no devuelve nada, y deja constancia de quién y cuándo', async ({ page }) => {
    // ⚠️ Este test decía «entregar es SOLO un cambio de estado» y comprobaba un
    // `PATCH` directo. Era cierto y era el problema: un UPDATE suelto no puede
    // grabar QUIÉN entregó ni CUÁNDO, ni rechazar el segundo intento, así que
    // la misma botella podía salir dos veces del estudio. Desde #1806 va por la
    // RPC `entregar_canje`, que hace las tres cosas.
    //
    // Lo que este test protegía y SIGUE protegiendo: entregar no puede devolver
    // créditos. Eso es cancelar, que es otra cosa.
    const cancelaciones: string[] = [];
    const entregas: string[] = [];
    const patches: string[] = [];

    await base(page);
    await page.route('**/rest/v1/reward_redemptions**', route => {
      if (route.request().method() === 'GET') return json(route, [CANJE_PENDIENTE]);
      patches.push(route.request().method());
      return json(route, []);
    });
    await page.route('**/rest/v1/rpc/entregar_canje', route => {
      entregas.push(route.request().postData() ?? '');
      return json(route, 'rwd-1');
    });
    await page.route('**/rest/v1/rpc/cancelar_canje', route => {
      cancelaciones.push('no debería llamarse');
      return json(route, [{ estado: 'CANCELADO', saldo: 620 }]);
    });

    await abrirCanjes(page);
    await page.getByRole('button', { name: 'Entregado' }).click();

    await expect.poll(() => entregas.length, { timeout: 10_000 }).toBe(1);
    // El canje y el estudio: sin `p_studio_id` el aislamiento de la función no
    // puede aplicarse, igual que en la cancelación de arriba.
    expect(entregas[0]).toContain('rwd-1');
    expect(entregas[0]).toContain(STUDIO_ID);
    // Entregar NO puede devolver créditos: la socia se lleva la recompensa.
    expect(cancelaciones).toHaveLength(0);
    // Y ya no se toca la tabla por la puerta de atrás.
    expect(patches).toHaveLength(0);
  });
});
