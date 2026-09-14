import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Dar de alta desde la ficha un plan que ya está cobrado en el TPV «por asignar».
//
// El 10-sep, en un estudio real, se vendió una cuota en el mostrador sin clienta
// y 66 segundos después se dio de alta el mismo plan desde la ficha de la socia,
// en vez de asignarle esa venta: dos recibos cobrados por un solo pago. Ahora la
// ficha pregunta antes y ofrece asignar la venta.
//
// ⚠️ CON CONTADORES (ver .claude/tentare-os.md): que salga el aviso no prueba
// nada si el alta ya se ha escrito debajo. Lo que prueba el arreglo es QUÉ
// petición sale — la de asignar la venta, y ninguna a `suscripciones`.
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
const VENTA_31 = { id: 'vpos-31', numero: 31, total: 85.5, realizadaEn: '2026-09-10T10:12:00+00:00' };

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, ventasPorAsignar: typeof VENTA_31[]) {
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

  const cuenta = {
    consultas: [] as string[],
    asignaciones: [] as string[],
    altas: [] as string[],
  };

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
  await page.route('**/rest/v1/planes_tarifa**', route => json(route, [PLAN_CUOTA]));
  await page.route('**/rest/v1/suscripciones**', route => {
    const req = route.request();
    if (req.method() !== 'GET') {
      cuenta.altas.push(`${req.method()} ${req.postData() ?? ''}`);
      return json(route, [], 201);
    }
    return json(route, []);
  });
  await page.route('**/api/pos/ventas/por-asignar**', route => {
    cuenta.consultas.push(route.request().url());
    return json(route, { ventas: ventasPorAsignar });
  });
  await page.route('**/api/pos/venta/asignar', route => {
    cuenta.asignaciones.push(route.request().postData() ?? '');
    return json(route, { ventaId: VENTA_31.id, entregadas: 1 });
  });

  await page.goto('/clientas/soc-1');
  await expect(page.getByText('Ana Gil')).toBeVisible({ timeout: 30_000 });
  return cuenta;
}

async function elegirCuota(page: Page) {
  await page.getByRole('button', { name: 'Asignar plan', exact: true }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: /Cuota mensual 2x/ }).click();
}

test('la cuota ya cobrada en el TPV: avisa, y «Asignar la venta» asigna SIN dar de alta otra vez', async ({ page }) => {
  const cuenta = await montar(page, [VENTA_31]);
  await elegirCuota(page);

  const aviso = page.getByRole('dialog');
  await expect(aviso).toContainText('Este plan ya está cobrado en el TPV');
  await expect(aviso).toContainText('Venta nº 31');
  expect(cuenta.consultas[0]).toContain('planId=plan-cuota');

  await aviso.getByRole('button', { name: 'Asignar la venta nº 31 a Ana' }).click();

  // EL CORAZÓN DEL TEST: sale la asignación, con esa venta y esta clienta…
  await expect.poll(() => cuenta.asignaciones.length, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(JSON.parse(cuenta.asignaciones[0])).toEqual({ ventaId: 'vpos-31', socioId: 'soc-1' });
  await expect(page.getByText('Venta nº 31 asignada')).toBeVisible();
  // …y NINGÚN alta: eso era el segundo recibo.
  expect(cuenta.altas).toHaveLength(0);
});

test('«Dar de alta igualmente» sigue pudiendo dar el alta (el aviso no bloquea)', async ({ page }) => {
  const cuenta = await montar(page, [VENTA_31]);
  await elegirCuota(page);

  await page.getByRole('button', { name: 'Dar de alta igualmente (se cobra otra vez)' }).click();

  await expect.poll(() => cuenta.altas.length, { timeout: 10_000 }).toBeGreaterThan(0);
  expect(cuenta.asignaciones).toHaveLength(0);
});

test('«Volver» no escribe nada', async ({ page }) => {
  const cuenta = await montar(page, [VENTA_31]);
  await elegirCuota(page);

  await page.getByRole('button', { name: 'Volver' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  expect(cuenta.altas).toHaveLength(0);
  expect(cuenta.asignaciones).toHaveLength(0);
});

test('sin ventas por asignar, el alta va directa y sin aviso', async ({ page }) => {
  const cuenta = await montar(page, []);
  await elegirCuota(page);

  await expect.poll(() => cuenta.altas.length, { timeout: 10_000 }).toBeGreaterThan(0);
  // La consulta se hizo: el test no pasa por no haber preguntado.
  expect(cuenta.consultas.length).toBeGreaterThan(0);
  await expect(page.getByText('Este plan ya está cobrado en el TPV')).toHaveCount(0);
});
