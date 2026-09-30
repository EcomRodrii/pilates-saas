import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// «Facturación» (29-sep-2026): cada estudio elige si Tentare emite sus facturas
// (con registro Veri*Factu) o si las hace fuera. Por defecto, no.
//
// Lo que se prueba aquí es el panel: el interruptor pregunta antes con la
// consecuencia, manda SOLO su campo, no se deja encender sin NIF, y un rechazo
// del servidor no dice «guardado». Y la pantalla de Facturas dice la verdad con
// el modo apagado. Que la base de datos no deje nacer una factura con el modo
// apagado se ensayó en producción con transacción revertida (ver la migración
// 20260929214142_studios_modo_facturacion.sql).
//
// Todos los caminos de fallo cuentan intentos: «no dijo guardado» también sería
// verdad con un botón que no manda nada.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
// DNI de ejemplo con la letra de control bien puesta. No vale `12345678Z`:
// la guardia del emisor lo da por NIF de relleno (el del estudio demo).
const NIF = '48392017V';

const FILA = {
  id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen',
  owner_auth_user_id: AUTH_UID, email: 'carmen@example.com', moneda: 'EUR',
  iva_por_defecto: 21, modo_facturacion: 'sin_facturas',
  // Lo que devuelve la BD sin datos fiscales: `null`, no la columna ausente.
  nif: null, razon_social: null,
};

type Respuesta = 'ok' | 'cero-filas';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

interface Exportacion { total: number; fichero?: 'ok' | 'error' }

async function montar(page: Page, ruta: string, opts: { fila?: Record<string, unknown>; respuesta?: Respuesta; exportacion?: Exportacion } = {}) {
  const patches: Record<string, unknown>[] = [];
  const descargas: string[] = [];
  const { fila = FILA, respuesta = 'ok', exportacion } = opts;
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
  // La red de seguridad PRIMERO: la ruta registrada después gana.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/studios**', async route => {
    if (route.request().method() !== 'PATCH') return json(route, fila);
    patches.push(route.request().postDataJSON() as Record<string, unknown>);
    // Lo que devuelve PostgREST con `select=id`; `[]` es «la RLS no casó».
    return json(route, respuesta === 'cero-filas' ? [] : [{ id: STUDIO_ID }]);
  });
  if (exportacion) {
    // Antes del goto: el panel pregunta cuántos registros hay al montarse.
    await page.route('**/api/verifactu/exportacion**', route => {
      const formato = new URL(route.request().url()).searchParams.get('formato');
      if (!formato) return json(route, { total: exportacion.total });
      descargas.push(formato);
      if (exportacion.fichero === 'error') return json(route, { error: 'No se han podido leer tus registros de facturación.' }, 500);
      return route.fulfill({
        status: 200, contentType: 'text/csv; charset=utf-8',
        headers: { 'Content-Disposition': 'attachment; filename="registros-verifactu-2026-09-30.csv"' },
        body: '\uFEFFPosición;Tipo de registro\r\n1;Alta\r\n',
      });
    });
  }
  await page.goto(ruta);
  return { patches, descargas };
}

const emitir = (page: Page) => page.getByRole('radiogroup', { name: 'Facturación' })
  .getByRole('radio', { name: /Emitir facturas con registro Veri\*Factu/ });

test('por defecto no emite, y la fila lo dice sin prometer el envío a la AEAT', async ({ page }) => {
  await montar(page, '/configuracion?tab=cobros');
  const fila = page.locator('#facturacion');
  await expect(fila).toContainText('No se emiten desde Tentare: tus alumnas reciben su justificante de pago', { timeout: 30_000 });
  // Sin facturas desde Tentare, un NIF que falta no sale como problema.
  await expect(page.locator('#datos-fiscales')).toContainText('solo hace falta si Tentare emite tus facturas');
});

test('encenderlo pregunta antes, con la consecuencia, y manda solo su campo', async ({ page }) => {
  const { patches } = await montar(page, '/configuracion?tab=cobros#facturacion', { fila: { ...FILA, nif: NIF } });
  await expect(emitir(page)).toBeVisible({ timeout: 30_000 });
  await emitir(page).click();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();

  const pregunta = page.getByRole('dialog', { name: '¿Emitir facturas desde Tentare?' });
  await expect(pregunta).toContainText('rectificativa');
  await expect(pregunta).toContainText('confírmalo con tu asesoría');
  expect(patches).toHaveLength(0);
  await pregunta.getByRole('button', { name: 'Sí, emitir facturas' }).click();

  await expect.poll(() => patches.length, { timeout: 10_000 }).toBe(1);
  expect(patches[0]).toEqual({ modo_facturacion: 'verifactu' });
  await expect(page.getByText('Tentare emitirá tus facturas')).toBeVisible();
});

test('sin un NIF válido no se deja encender (0 peticiones)', async ({ page }) => {
  const { patches } = await montar(page, '/configuracion?tab=cobros#facturacion');
  await expect(emitir(page)).toBeVisible({ timeout: 30_000 });
  await emitir(page).click();
  await expect(page.getByText('Pon un NIF válido en «Datos fiscales e IVA» para emitir facturas.').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toBeDisabled();
  await page.waitForTimeout(400);
  expect(patches).toHaveLength(0);
});

test('si el servidor no lo guarda, no dice que Tentare emitirá tus facturas', async ({ page }) => {
  const { patches } = await montar(page, '/configuracion?tab=cobros#facturacion', { fila: { ...FILA, nif: NIF }, respuesta: 'cero-filas' });
  await expect(emitir(page)).toBeVisible({ timeout: 30_000 });
  await emitir(page).click();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.getByRole('button', { name: 'Sí, emitir facturas' }).click();
  await expect.poll(() => patches.length, { timeout: 10_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(800);
  await expect(page.getByText('Tentare emitirá tus facturas')).toHaveCount(0);
  await expect(page.getByText('No se ha guardado').first()).toBeVisible();
  await expect(emitir(page)).toHaveAttribute('aria-checked', 'true');
});

test('apagarlo después de haber facturado se deja, y dice qué pasa con lo ya emitido', async ({ page }) => {
  const { patches } = await montar(page, '/configuracion?tab=cobros#facturacion', { fila: { ...FILA, nif: NIF, modo_facturacion: 'verifactu' } });
  const noEmitir = page.getByRole('radiogroup', { name: 'Facturación' }).getByRole('radio', { name: /No emitir facturas desde Tentare/ });
  await expect(noEmitir).toBeVisible({ timeout: 30_000 });
  await noEmitir.click();
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  const pregunta = page.getByRole('dialog', { name: '¿Dejar de emitir facturas desde Tentare?' });
  await expect(pregunta).toContainText('se quedan como están');
  await pregunta.getByRole('button', { name: 'Sí, dejar de emitirlas' }).click();
  await expect.poll(() => patches.length, { timeout: 10_000 }).toBe(1);
  expect(patches[0]).toEqual({ modo_facturacion: 'sin_facturas' });
});

test('Facturas, con el modo apagado: lo dice y lleva a activarlo, sin el aviso rojo del NIF', async ({ page }) => {
  await montar(page, '/facturas');
  await expect(page.getByText('Tentare no emite tus facturas')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: 'Emitir facturas desde Tentare' })).toHaveAttribute('href', '/configuracion?tab=cobros#facturacion');
  await expect(page.getByText('No se está emitiendo ninguna factura')).toHaveCount(0);
});

// Exportación de los registros (mandato, cláusula 8). Se ofrece aunque el
// estudio ya no emita con Tentare: es cuando más falta hace llevárselos.

test('sin registros no ofrece exportar nada', async ({ page }) => {
  await montar(page, '/configuracion?tab=cobros#facturacion', { exportacion: { total: 0 } });
  await expect(emitir(page)).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(400);
  await expect(page.getByText(/registros? de facturación/)).toHaveCount(0);
});

test('con registros, aunque ya no emita, descarga el CSV con el nombre del servidor', async ({ page }) => {
  const { descargas } = await montar(page, '/configuracion?tab=cobros#facturacion', { exportacion: { total: 20 } });
  await expect(page.getByText('20 registros de facturación')).toBeVisible({ timeout: 30_000 });
  const descarga = page.waitForEvent('download');
  await page.getByRole('button', { name: /CSV/ }).click();
  expect((await descarga).suggestedFilename()).toBe('registros-verifactu-2026-09-30.csv');
  expect(descargas).toEqual(['csv']);
});

test('si el servidor no puede leerlos, lo dice y no descarga nada', async ({ page }) => {
  const { descargas } = await montar(page, '/configuracion?tab=cobros#facturacion', { exportacion: { total: 3, fichero: 'error' } });
  await expect(page.getByText('3 registros de facturación')).toBeVisible({ timeout: 30_000 });
  let huboDescarga = false;
  page.on('download', () => { huboDescarga = true; });
  await page.getByRole('button', { name: /XML/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No se han podido leer tus registros de facturación.' })).toBeVisible();
  expect(descargas.length).toBeGreaterThan(0);
  expect(huboDescarga).toBe(false);
});
