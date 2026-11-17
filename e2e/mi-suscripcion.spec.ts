import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// «Mi suscripción» (Fase 3 de Billing & Revenue, 17-nov-2026). Es dinero: lo que se ve sale de
// lo que contesta el servidor (que lee Stripe), se enseña lo que se pagará ANTES de confirmar y
// un «no» del servidor se dice sin dar el cambio por hecho. Cada camino de fallo cuenta sus
// peticiones: «no mintió» sin haber intentado nada no prueba nada.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sb-example-auth-token';
const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const ESTADO = {
  plan: 'BASE', subscriptionStatus: 'active', activo: true, configurado: true, esPropietaria: true,
  bloqueado: false, enPrueba: false, pruebaTermina: null, periodoTermina: '2026-12-16T10:00:00+00:00',
  complementos: { pagaAparte: false, contratados: [] as string[], disponibles: [] as string[] },
};

const FICHA = {
  plan: 'BASE', complementos: [], intervalo: 'mensual', importePeriodoCents: 2900, moneda: 'eur',
  proximaRenovacion: '2026-12-16T10:00:00.000Z', accesoHasta: null, estado: 'al_dia', estadoTexto: 'Al día',
  esCadena: false, mensajeSinCambios: null,
  metodoPago: { tipo: 'tarjeta', marca: 'visa', ultimos4: '4242', caduca: '08/28' },
  acciones: { actualizarTarjeta: true, cambiarAAnual: true, pasarAEstudio: true, cancelar: true, reactivar: false },
  facturas: [
    { id: 'in_1', numero: 'TEN-0002', fecha: '2026-11-16T10:00:00.000Z', importeCents: 2900, estado: 'paid', moneda: 'eur', urlFactura: 'https://example.invalid/f2', urlPdf: 'https://example.invalid/f2.pdf' },
    { id: 'in_0', numero: 'TEN-0001', fecha: '2026-10-16T10:00:00.000Z', importeCents: 2900, estado: 'paid', moneda: 'eur', urlFactura: 'https://example.invalid/f1', urlPdf: null },
  ],
};

const BAJA = { ...FICHA, estado: 'baja_programada', estadoTexto: 'Baja programada', proximaRenovacion: null, accesoHasta: '2026-12-16T10:00:00.000Z',
  acciones: { ...FICHA.acciones, cancelar: false, reactivar: true, cambiarAAnual: false, pasarAEstudio: false } };

const PREVIA_ANUAL = {
  cuando: 'ahora', fecha: null, importeCents: 29000,
  lineas: [{ descripcion: 'Tiempo no usado de Founding Studio', importeCents: -1800 }, { descripcion: 'Founding Studio (anual)', importeCents: 30800 }],
};

interface Montaje { baja: unknown[]; periodo: unknown[]; previas: unknown[] }

async function montar(page: Page, opts: {
  ficha?: () => unknown;
  baja?: (route: Route) => Promise<void>;
  periodo?: (route: Route) => Promise<void>;
} = {}): Promise<Montaje> {
  await page.addInitScript((key) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: 'auth-e2e-duena', email: 'duena@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, STORAGE_KEY);
  const m: Montaje = { baja: [], periodo: [], previas: [] };
  await page.route('**/api/**', (route) => json(route, {}));
  await page.route('**/api/billing/status**', (route) => json(route, ESTADO));
  await page.route('**/api/billing/mi-suscripcion', (route) => json(route, (opts.ficha ?? (() => FICHA))()));
  await page.route('**/api/billing/vista-previa', (route) => { m.previas.push(route.request().postDataJSON()); return json(route, PREVIA_ANUAL); });
  await page.route('**/api/billing/baja', async (route) => { m.baja.push(route.request().postDataJSON()); await (opts.baja ?? ((r) => json(r, { ok: true })))(route); });
  await page.route('**/api/billing/cambio-periodo', async (route) => { m.periodo.push(route.request().postDataJSON()); await (opts.periodo ?? ((r) => json(r, { ok: true })))(route); });
  await page.route('**/rest/v1/**', (route) => json(route, []));
  await page.goto('/suscripcion');
  await expect(page.getByRole('heading', { name: 'Mi suscripción' })).toBeVisible({ timeout: 30_000 });
  return m;
}

test.describe('Mi suscripción', () => {
  test('enseña lo que paga, su tarjeta y sus facturas descargables', async ({ page }) => {
    await montar(page);
    const seccion = page.getByRole('region', { name: 'Mi suscripción' });
    await expect(seccion.getByText('Al día')).toBeVisible();
    await expect(seccion.getByText(/29,00\s*€/).first()).toBeVisible();
    await expect(seccion.getByText(/VISA •••• 4242 · caduca 08\/28/)).toBeVisible();
    await expect(seccion.getByText('TEN-0002')).toBeVisible();
    // Descarga el PDF; si una factura no lo tiene, cae a la página de Stripe.
    const enlaces = seccion.getByRole('link', { name: /Descargar la factura/ });
    await expect(enlaces).toHaveCount(2);
    await expect(enlaces.nth(0)).toHaveAttribute('href', 'https://example.invalid/f2.pdf');
    await expect(enlaces.nth(1)).toHaveAttribute('href', 'https://example.invalid/f1');
  });

  test('cancelar: confirma con la fecha de fin y solo cambia con lo que dice el servidor', async ({ page }) => {
    let estado: unknown = FICHA;
    const m = await montar(page, { ficha: () => estado, baja: async (route) => { estado = BAJA; await json(route, { ok: true, bajaProgramada: true }); } });
    await page.getByRole('button', { name: 'Cancelar suscripción' }).click();
    await expect(page.getByRole('dialog')).toContainText('Seguirás teniendo todo hasta el 16 de diciembre de 2026');
    await page.getByRole('button', { name: 'Sí, cancelar al final del periodo' }).click();
    await expect(page.getByText(/Tu suscripción termina el/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reactivar mi suscripción' })).toBeVisible();
    expect(m.baja).toEqual([{ accion: 'programar' }]);
  });

  test('cancelar con un «no» del servidor: lo dice y no da la baja por hecha', async ({ page }) => {
    const m = await montar(page, { baja: (route) => json(route, { error: 'No se ha podido confirmar el cambio.' }, 500) });
    await page.getByRole('button', { name: 'Cancelar suscripción' }).click();
    await page.getByRole('button', { name: 'Sí, cancelar al final del periodo' }).click();
    await expect(page.getByRole('alert')).toContainText('No se ha podido');
    await expect(page.getByText(/Tu suscripción termina el/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cancelar suscripción' })).toBeVisible();
    expect(m.baja.length).toBeGreaterThan(0);
  });

  test('reactivar quita la baja programada', async ({ page }) => {
    let estado: unknown = BAJA;
    const m = await montar(page, { ficha: () => estado, baja: async (route) => { estado = FICHA; await json(route, { ok: true, bajaProgramada: false }); } });
    await expect(page.getByText(/Tu suscripción termina el/)).toBeVisible();
    await page.getByRole('button', { name: 'Reactivar mi suscripción' }).click();
    await expect(page.getByText(/Tu suscripción termina el/)).toHaveCount(0);
    expect(m.baja).toEqual([{ accion: 'reactivar' }]);
  });

  test('pasar a anual: enseña lo que se pagará hoy ANTES de confirmar, y luego aplica', async ({ page }) => {
    let estado: unknown = FICHA;
    const m = await montar(page, {
      ficha: () => estado,
      periodo: async (route) => { estado = { ...FICHA, intervalo: 'anual', importePeriodoCents: 29000, acciones: { ...FICHA.acciones, cambiarAAnual: false } }; await json(route, { ok: true }); },
    });
    await page.getByRole('button', { name: 'Pasar a pago anual' }).click();
    await expect(page.getByRole('dialog')).toContainText(/Pagarás hoy 290,00\s*€/);
    await expect(page.getByRole('dialog')).toContainText('Tiempo no usado de Founding Studio');
    expect(m.previas).toEqual([{ cambio: 'anual' }]);
    expect(m.periodo, 'la vista previa no cobra nada').toHaveLength(0);
    await page.getByRole('button', { name: 'Confirmar el cambio' }).click();
    await expect(page.getByRole('button', { name: 'Pasar a pago anual' })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Mi suscripción' }).getByText('al año')).toBeVisible();
    expect(m.periodo).toEqual([{ a: 'anual' }]);
  });

  test('pasar a anual con el cobro rechazado: lo dice y sigue en mensual', async ({ page }) => {
    const m = await montar(page, { periodo: (route) => json(route, { error: 'No hemos podido cobrar el año por adelantado, así que no se ha cambiado nada.' }, 402) });
    await page.getByRole('button', { name: 'Pasar a pago anual' }).click();
    await page.getByRole('button', { name: 'Confirmar el cambio' }).click();
    await expect(page.getByRole('alert')).toContainText('no se ha cambiado nada');
    await expect(page.getByRole('region', { name: 'Mi suscripción' }).getByText('al mes')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pasar a pago anual' })).toBeVisible();
    expect(m.periodo.length).toBeGreaterThan(0);
  });

  test('con la baja programada no se ofrece cambiar de plan', async ({ page }) => {
    await montar(page, { ficha: () => BAJA });
    await expect(page.getByRole('button', { name: 'Pasar a pago anual' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pasar a Estudio' })).toHaveCount(0);
  });
});
