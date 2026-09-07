import { test, type Page, type Route } from '@playwright/test';

// Captura de pantalla del TPV para revisión visual. No afirma nada — su único
// trabajo es dejar la imagen en test-results/ para mirarla. Lo que sí se
// comprueba está en caja-no-miente.spec.ts.

const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const UID = 'auth-e2e-duena';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: UID, email: 'cloe@example.com', moneda: 'EUR', iva_por_defecto: 21,
};
const EQUIPO = [{ id: 'ins-cloe', studio_id: STUDIO_ID, nombre: 'Cloe', activo: true, rol: 'PROPIETARIO', color: '#343825', auth_user_id: UID }];
const SOCIOS = [{ id: 'soc-1', studio_id: STUDIO_ID, nombre: 'María', apellidos: 'García', email: 'm@e.com', activo: true, fecha_alta: '2026-01-10T09:00:00+00:00', campos_extra: {} }];

const CATALOGO = {
  ivaDefecto: 21,
  cobro: { stripeConectado: true, datafonoEmparejado: true },
  productos: [
    { id: 'p1', nombre: 'Calcetines Pilates', descripcion: 'Antideslizantes', categoria: 'PRODUCTO', precio: 25, activo: true, stock: 12, stockMinimo: 5, ivaPct: 21, imagenUrl: null, sku: 'CAL-01', codigoBarras: null },
    { id: 'p2', nombre: 'Botella Tentare', descripcion: '750 ml', categoria: 'PRODUCTO', precio: 14.9, activo: true, stock: 3, stockMinimo: 5, ivaPct: 21, imagenUrl: null, sku: null, codigoBarras: null },
    { id: 'p3', nombre: 'Banda elástica', descripcion: null, categoria: 'PRODUCTO', precio: 9.5, activo: true, stock: 0, stockMinimo: 2, ivaPct: 21, imagenUrl: null, sku: null, codigoBarras: null },
    { id: 'p4', nombre: 'Toalla', descripcion: null, categoria: 'PRODUCTO', precio: 18, activo: true, stock: null, stockMinimo: 0, ivaPct: 21, imagenUrl: null, sku: null, codigoBarras: null },
  ],
  planes: [
    { id: 'pl1', nombre: 'Bono Reformer 10', descripcion: null, precio: 80, tipo: 'BONO', sesiones: 10, validezDias: 90, ivaPct: 21 },
    { id: 'pl2', nombre: 'Bono Mat 5', descripcion: null, precio: 45, tipo: 'BONO', sesiones: 5, validezDias: 60, ivaPct: 21 },
    { id: 'pl3', nombre: 'Clase suelta', descripcion: null, precio: 15, tipo: 'PUNTUAL', sesiones: 1, validezDias: 30, ivaPct: 21 },
    { id: 'pl4', nombre: 'Mensual ilimitado', descripcion: null, precio: 89, tipo: 'MENSUAL', sesiones: null, validezDias: null, ivaPct: 21 },
  ],
  caja: { id: 'caja-1', fondoInicial: 100, abiertaEn: '2026-09-07T08:00:00Z', abiertaPor: 'Cloe' },
  hoy: { ventas: 27, total: 1245.5, ticketMedio: 46.13, porMetodo: [], ultimas: [] },
};

const json = (r: Route, b: unknown, s = 200) => r.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(b) });

async function montar(page: Page) {
  await page.route('**/rest/v1/**', (r) => json(r, []));
  await page.route('**/api/**', (r) => json(r, {}));
  await page.route('**/api/layout**', (r) => json(r, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', (r) => json(r, { bloqueado: false }));
  await page.route('**/api/theme**', (r) => json(r, { primary: '#343825', secondary: '#D9C29E', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/rpc/current_studio_id', (r) => json(r, STUDIO_ID));
  await page.route('**/rest/v1/studios**', (r) => json(r, STUDIO_ROW));
  await page.route('**/rest/v1/instructores**', (r) => json(r, EQUIPO));
  await page.route('**/rest/v1/socios**', (r) => json(r, SOCIOS));
  await page.route('**/api/pos/catalogo**', (r) => json(r, CATALOGO));
  await page.addInitScript(([k, id]) => {
    localStorage.setItem(k, JSON.stringify({
      access_token: 't', refresh_token: 'r', expires_at: 4102444800, expires_in: 9e8, token_type: 'bearer',
      user: { id, email: 'cloe@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, UID] as const);
}

test('captura del TPV', async ({ page }) => {
  await montar(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/pos');
  await page.getByPlaceholder(/Buscar artículo/i).waitFor({ timeout: 30_000 });
  await page.screenshot({ path: 'test-results/pos-vacio.png' });

  await page.getByRole('button', { name: /^Bono Reformer 10/ }).click();
  await page.getByRole('button', { name: /^Calcetines Pilates/ }).click();
  await page.getByRole('button', { name: /^Calcetines Pilates/ }).click();
  await page.getByPlaceholder(/Buscar artículo/i).fill('María');
  await page.getByRole('button', { name: /María García/ }).click();
  await page.locator('input[aria-label="Descuento"]').fill('10');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/pos-ticket.png' });

  await page.getByRole('button', { name: /Cobrar/ }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/pos-cobro.png' });

  await page.getByRole('button', { name: /^Efectivo/ }).click();
  await page.getByLabel('¿Con cuánto paga?').fill('150');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/pos-efectivo.png' });

  // Tablet vertical: el caso real del mostrador.
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 834, height: 1112 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'test-results/pos-tablet.png' });
});
