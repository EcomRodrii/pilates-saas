import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// «El stock no se teclea: se mueve.»
//
// Antes, las existencias eran un campo de texto en la ficha del producto. Se
// pasaba de 3 a 300 y no quedaba rastro de nada — ni quién, ni cuándo, ni por
// qué. Eso no es control de existencias, es un número editable, y es
// exactamente el hueco por el que en una tienda se tapa una merma.
//
// Esta suite fija las dos mitades del contrato:
//   1. al EDITAR un artículo, el número no se puede sobrescribir a mano;
//   2. lo que sí se puede es moverlo, y cada movimiento viaja con su tipo, su
//      cantidad y su motivo.
//
// El saldo de apertura sigue escribiéndose al CREAR: ahí empieza el libro, y
// no tendría sentido pedir una «entrada» para estrenar un artículo.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen',
  owner_auth_user_id: AUTH_UID, email: 'carmen@example.com', moneda: 'EUR',
};

const PRODUCTOS = [
  {
    id: 'p-calcetines', studio_id: STUDIO_ID, nombre: 'Calcetines Pilates',
    categoria: 'PRODUCTO', precio: 25, activo: true, stock: 10, stock_minimo: 5,
    descripcion: null, imagen_url: null, sku: null, codigo_barras: null, iva_pct: 21, orden: 0,
  },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

interface Movimientos { enviados: Record<string, unknown>[] }

async function montar(page: Page): Promise<Movimientos> {
  const m: Movimientos = { enviados: [] };

  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'carmen@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  // ⚠️ Los comodines PRIMERO: Playwright da prioridad a la ruta registrada más
  // tarde, así que lo específico va después o se lo traga el genérico.
  await page.route('**/rest/v1/**', (route) => json(route, []));
  await page.route('**/api/**', (route) => json(route, {}));

  await page.route('**/api/layout**', (route) =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', (route) => json(route, { bloqueado: false }));
  await page.route('**/api/billing/status**', (route) => json(route, { activa: true, plan: 'ESTUDIO', features: {} }));
  await page.route('**/api/theme**', (route) =>
    json(route, { primary: '#343825', secondary: '#D9C29E', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/rpc/current_studio_id', (route) => json(route, STUDIO_ID));
  await page.route('**/rest/v1/studios**', (route) => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/productos_pos**', (route) => json(route, PRODUCTOS));

  await page.route('**/api/pos/stock**', async (route) => {
    if (route.request().method() === 'POST') {
      m.enviados.push(JSON.parse(route.request().postData() ?? '{}'));
      return json(route, { ok: true, stockAnterior: 10, stock: 22, delta: 12 });
    }
    return json(route, {
      producto: { id: 'p-calcetines', nombre: 'Calcetines Pilates', stock: 10, stockMinimo: 5 },
      movimientos: [
        { id: 'venta-x', fecha: '2026-09-06T10:00:00Z', tipo: 'VENTA', cantidad: -2,
          stockResultante: null, detalle: 'Venta #000019', quien: null },
      ],
    });
  });

  return m;
}

async function abrirFicha(page: Page) {
  await page.goto('/productos');
  // La pantalla abre en «Planes de suscripción»; los artículos del TPV viven
  // en su propia pestaña.
  await page.getByRole('button', { name: 'Productos POS' }).click({ timeout: 30_000 });
  await expect(page.getByText('Calcetines Pilates').first()).toBeVisible({ timeout: 30_000 });
  // En escritorio la fila es una tabla y solo abre por su botón; el texto de
  // la celda no es pulsable.
  await page.getByRole('button', { name: 'Editar producto' }).first().click();
}

test('al editar, las existencias no se pueden sobrescribir a mano', async ({ page }) => {
  await montar(page);
  await abrirFicha(page);

  const campo = page.getByLabel('Existencias');
  await expect(campo).toHaveValue('10');
  // `readOnly`, no `disabled`: el número se sigue leyendo, pero no se cambia
  // tecleando. Un stock sobrescribible no deja rastro de la merma.
  await expect(campo).toHaveAttribute('readonly', '');
});

test('mover existencias manda tipo, cantidad y motivo', async ({ page }) => {
  const m = await montar(page);
  await abrirFicha(page);

  await page.getByRole('button', { name: /Entradas, mermas y recuento/ }).click();

  // El historial trae ya la venta, DERIVADA de ventas_pos_lineas: el libro no
  // guarda copias de las ventas, las lee de donde viven.
  await expect(page.getByText('Venta #000019')).toBeVisible();
  await expect(page.getByText('Ahora hay')).toBeVisible();

  await page.getByRole('button', { name: 'Entrada', exact: true }).click();
  await page.getByLabel('¿Cuántas han entrado?').fill('12');
  await page.getByLabel(/^Motivo/).fill('Pedido del lunes');
  await page.getByRole('button', { name: 'Guardar entrada' }).click();

  await expect.poll(() => m.enviados.length).toBeGreaterThan(0);
  const enviado = m.enviados[0] as { productoId: string; tipo: string; cantidad: number; motivo: string };
  expect(enviado.tipo).toBe('ENTRADA');
  expect(enviado.cantidad).toBe(12);
  expect(enviado.motivo).toBe('Pedido del lunes');
  expect(
    enviado.productoId,
    'el movimiento tiene que decir de qué artículo es, o mueve el stock de otro',
  ).toBe('p-calcetines');
});
