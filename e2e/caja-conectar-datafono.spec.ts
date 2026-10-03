import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Conectar el datáfono de Stripe desde la Caja.
//
// Antes el botón «Datáfono» salía apagado con «Sin datáfono emparejado» y no
// existía ninguna pantalla para emparejarlo. Ahora el botón lo conecta y, al
// terminar, se vuelve a la MISMA venta con el datáfono listo.
//
// ⚠️ Como en caja-no-miente.spec.ts, se cuentan las PETICIONES: un camino de
// fallo que «no mintió» sin haber intentado nada sería un test hueco.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const UID_DUENA = 'auth-e2e-duena';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: UID_DUENA, email: 'cloe@example.com', moneda: 'EUR', iva_por_defecto: 21,
};
const EQUIPO = [{ id: 'ins-cloe', studio_id: STUDIO_ID, nombre: 'Cloe', activo: true, rol: 'PROPIETARIO', color: '#343825', auth_user_id: UID_DUENA }];

const catalogo = (datafonoEmparejado: boolean) => ({
  ivaDefecto: 21,
  cobro: { stripeConectado: true, datafonoEmparejado },
  productos: [{
    id: 'p-calcetines', nombre: 'Calcetines Pilates', descripcion: null, categoria: 'PRODUCTO', precio: 25, activo: true,
    stock: 10, stockMinimo: 5, ivaPct: 21, imagenUrl: null, sku: null, codigoBarras: null,
  }],
  planes: [],
  caja: { id: 'caja-1', fondoInicial: 100, abiertaEn: '2026-09-07T08:00:00Z', abiertaPor: 'Cloe' },
  hoy: { ventas: 0, total: 0, ticketMedio: 0, porMetodo: [], ultimas: [] },
});

const DIRECCION = { linea: 'Calle de Ejemplo 12', codigoPostal: '28010', ciudad: 'Madrid' };
const LECTOR_LISTO = { etiqueta: 'Mostrador', modelo: 'Stripe Reader S700', estado: 'online' };

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

type Contadores = { lecturas: number; conexiones: number; ventas: number; cuerpos: Record<string, unknown>[] };

async function montar(page: Page, o: {
  emparejado: boolean;
  lectura: unknown;
  conectar?: (route: Route) => Promise<void> | void;
}): Promise<Contadores> {
  const c: Contadores = { lecturas: 0, conexiones: 0, ventas: 0, cuerpos: [] };
  // Comodines primero: Playwright da prioridad a la ruta registrada más tarde.
  await page.route('**/rest/v1/**', (route) => json(route, []));
  await page.route('**/api/**', (route) => json(route, {}));
  await page.route('**/api/layout**', (route) => json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', (route) => json(route, { bloqueado: false }));
  await page.route('**/api/billing/status**', (route) => json(route, { activa: true, plan: 'ESTUDIO', features: {} }));
  await page.route('**/api/theme**', (route) => json(route, { primary: '#343825', secondary: '#D9C29E', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/rpc/current_studio_id', (route) => json(route, STUDIO_ID));
  await page.route('**/rest/v1/studios**', (route) => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/instructores**', (route) => json(route, EQUIPO));
  await page.route('**/api/pos/catalogo**', (route) => json(route, catalogo(o.emparejado)));
  await page.route('**/api/pos/caja**', (route) => json(route, { caja: catalogo(o.emparejado).caja, esperado: 100, movimientos: [] }));
  await page.route('**/api/pos/venta', async (route) => { c.ventas++; await json(route, {}); });
  await page.route('**/api/terminal/lector', async (route) => {
    if (route.request().method() === 'GET') { c.lecturas++; await json(route, o.lectura); return; }
    if (route.request().method() === 'POST') {
      c.conexiones++;
      c.cuerpos.push(JSON.parse(route.request().postData() ?? '{}'));
      if (o.conectar) await o.conectar(route);
      else await json(route, { ok: true, lector: LECTOR_LISTO });
      return;
    }
    await json(route, { ok: true });
  });

  await page.addInitScript(([key, id]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh', expires_at: 4102444800, expires_in: 999999999,
      token_type: 'bearer',
      user: { id, email: 'cloe@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, UID_DUENA] as const);
  return c;
}

async function abrirCobro(page: Page) {
  await page.goto('/pos');
  await expect(page.getByPlaceholder(/Buscar artículo/i)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Calcetines Pilates/ }).click();
  await page.getByRole('button', { name: /Cobrar/ }).click();
  await expect(page.getByText('Total a cobrar')).toBeVisible();
}

const SIN_DATAFONO = { ok: true, stripeConectado: true, emparejado: false, lector: null, direccion: DIRECCION, test: false };

test('sin datáfono, el botón lo conecta y se vuelve a la misma venta con el datáfono listo', async ({ page }) => {
  const c = await montar(page, { emparejado: false, lectura: SIN_DATAFONO });
  await abrirCobro(page);

  await page.getByRole('button', { name: /^Conectar datáfono/ }).click();
  await page.getByRole('button', { name: /Sí, lo tengo aquí/ }).click();
  // La dirección es la del estudio, a la vista.
  await expect(page.getByText('Calle de Ejemplo 12, 28010 Madrid')).toBeVisible();
  await page.getByLabel('Las tres palabras').fill('Sepia Cerulean Aqua');
  await page.getByRole('button', { name: 'Conectar', exact: true }).click();

  await expect(page.getByText('Datáfono conectado')).toBeVisible();
  expect(c.conexiones).toBe(1);
  expect(c.cuerpos[0]).toMatchObject({ codigo: 'sepia-cerulean-aqua', nombre: 'Mostrador', direccion: null });

  await page.getByRole('button', { name: /Volver a cobrar 25,00/ }).click();
  // La misma venta: el total sigue ahí, y el datáfono ya está listo.
  await expect(page.getByText('Total a cobrar')).toBeVisible();
  await expect(page.getByRole('button', { name: /Datáfono.*Mostrador · listo/ })).toBeVisible();
  expect(c.ventas).toBe(0);
});

test('un código que Stripe rechaza se dice junto al campo, y no se da por conectado', async ({ page }) => {
  const c = await montar(page, {
    emparejado: false, lectura: SIN_DATAFONO,
    conectar: (route) => json(route, { error: 'Ese código no vale o ha caducado. Genera otro en el datáfono y vuelve a escribirlo.', falta: 'codigo' }, 400),
  });
  await abrirCobro(page);
  await page.getByRole('button', { name: /^Conectar datáfono/ }).click();
  await page.getByRole('button', { name: /Sí, lo tengo aquí/ }).click();
  await page.getByLabel('Las tres palabras').fill('sepia-cerulean-agua');
  await page.getByRole('button', { name: 'Conectar', exact: true }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'Ese código no vale' })).toBeVisible();
  expect(c.conexiones).toBeGreaterThan(0);
  await expect(page.getByText('Datáfono conectado')).toHaveCount(0);
});

test('un código mal escrito no llega al servidor', async ({ page }) => {
  const c = await montar(page, { emparejado: false, lectura: SIN_DATAFONO });
  await abrirCobro(page);
  await page.getByRole('button', { name: /^Conectar datáfono/ }).click();
  await page.getByRole('button', { name: /Sí, lo tengo aquí/ }).click();
  await page.getByLabel('Las tres palabras').fill('hola');
  await page.getByRole('button', { name: 'Conectar', exact: true }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'tres palabras' })).toBeVisible();
  expect(c.lecturas).toBeGreaterThan(0);
  expect(c.conexiones).toBe(0);
});

test('sin conexión: no manda el cobro al datáfono, dice qué hacer y vuelve a comprobar', async ({ page }) => {
  const c = await montar(page, {
    emparejado: true,
    lectura: { ok: true, stripeConectado: true, emparejado: true, lector: { ...LECTOR_LISTO, estado: 'offline' }, direccion: DIRECCION, test: false },
  });
  await abrirCobro(page);

  const boton = page.getByRole('button', { name: /Datáfono.*Mostrador · sin conexión/ });
  await expect(boton).toBeVisible();
  const lecturasAntes = c.lecturas;
  await boton.click();

  await expect(page.getByRole('alert').filter({ hasText: 'El datáfono Mostrador no responde' })).toBeVisible();
  // Se volvió a preguntar a Stripe, y no se intentó ninguna venta.
  await expect.poll(() => c.lecturas).toBeGreaterThan(lecturasAntes);
  expect(c.ventas).toBe(0);
});
