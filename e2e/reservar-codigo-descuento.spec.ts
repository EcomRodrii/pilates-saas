import { test, expect, type Page } from '@playwright/test';
import { abrirClaseSinSesion, AHORA, fixtureClaseConPlanPuntual, SLUG, STUDIO_ID } from './reservar-sin-cuenta';

test.use({ timezoneId: 'Europe/Madrid' });
test.setTimeout(180_000);

// ─────────────────────────────────────────────────────────────────────────────
// Código de descuento en /reservar (P0.4, 12-oct-2026): lo que se cobra y lo que
// se enseña son lo mismo, y un código que no entra se dice.
//
// Antes, en la clase pagada sin cuenta, el botón decía el precio del plan
// (`datosPlan.precio`) aunque el servidor hubiera aplicado el código: pantalla
// 18 €, Stripe 15 €. Y un código que no valía se ignoraba sin una palabra. En la
// pestaña de planes, el código ni se comprobaba: se iba a Stripe y se pagaba el
// precio entero.
//
// El importe lo decide SIEMPRE el servidor: aquí solo se mira que la pantalla
// enseñe el suyo. Todo camino que espera una petición exige intentos > 0.
// ─────────────────────────────────────────────────────────────────────────────

const SECRETO = 'pi_3QeXaMPLe000000000000_secret_ExAmPle0000000000000000';

async function hastaElPago(page: Page, respuesta: Record<string, unknown>) {
  await abrirClaseSinSesion(page);
  await expect(page.getByRole('heading', { name: 'Tus datos' })).toBeVisible({ timeout: 30_000 });
  // La comprobación en vivo del campo (permisiva para quien aún no tiene cuenta).
  await page.route('**/api/public/validar-codigo-descuento', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, descuento: 3 }) }));
  const pedidas: Record<string, unknown>[] = [];
  await page.route('**/api/public/checkout-embebido', (r) => {
    pedidas.push(r.request().postDataJSON() as Record<string, unknown>);
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ clientSecret: SECRETO, ...respuesta }) });
  });

  await page.getByPlaceholder('Nombre y apellido').fill('Persona Prueba');
  await page.getByPlaceholder('Email').fill('persona@example.com');
  await page.getByPlaceholder('Móvil').fill('+34 600 123 456');
  await page.getByRole('button', { name: '¿Tienes un código promocional?' }).click();
  await page.getByPlaceholder('Código promocional').fill('VERANO');
  await page.getByRole('checkbox', { name: /política de privacidad/i }).check();
  await page.getByRole('button', { name: /Continuar al pago/ }).click();
  await expect.poll(() => pedidas.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(pedidas[0].codigoDescuento).toBe('VERANO');
}

test('con el código aplicado, el botón dice lo que cobra Stripe, no el precio de catálogo', async ({ page }) => {
  await hastaElPago(page, { importe: 15, descuento: 3, codigoAplicado: true, matricula: 0, total: 15 });
  await expect(page.getByRole('button', { name: 'Pagar 15 € y reservar' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Pagar 18 € y reservar' })).toHaveCount(0);
});

test('un código que el servidor no aplica: se dice por qué, y el botón pide el precio entero', async ({ page }) => {
  await hastaElPago(page, { importe: 18, descuento: 0, codigoAplicado: false, matricula: 0, total: 18, motivoCodigo: 'Ese código ya ha caducado' });
  await expect(page.getByRole('status').filter({ hasText: 'Ese código ya ha caducado. Pagas el precio normal.' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Pagar 18 € y reservar' })).toBeVisible();
});

test('un servidor que no manda el total: el botón sigue con el precio del plan (como antes)', async ({ page }) => {
  await hastaElPago(page, {});
  await expect(page.getByRole('button', { name: 'Pagar 18 € y reservar' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Pagas el precio normal' })).toHaveCount(0);
});

// ── La pestaña de planes (el widget «Planes y precios») ─────────────────────

async function abrirPlanes(page: Page) {
  await page.clock.install({ time: new Date(`${AHORA}+02:00`) });
  const fixture = fixtureClaseConPlanPuntual();
  fixture.planesTarifa = [
    ...fixture.planesTarifa,
    { id: 'plan-bono', studioId: STUDIO_ID, nombre: 'Bono 10 clases', tipo: 'BONO', precio: 150, sesiones: 10, activo: true },
  ];
  await page.route('**/rest/v1/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ id: STUDIO_ID }) }));
  await page.route('**/api/theme**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }) }));
  await page.route('**/api/public/studio-data', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) }));
  await page.route('**/api/public/session', (r) => r.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'sin sesión' }) }));
  await page.goto(`/reservar/${SLUG}?tab=planes&embed=1`);
  await expect(page.getByText('Bono 10 clases')).toBeVisible({ timeout: 60_000 });
}

test('planes: un código caducado se dice ANTES de ir a Stripe, y no se sale a pagar', async ({ page }) => {
  await abrirPlanes(page);
  const comprobaciones: Record<string, unknown>[] = [];
  await page.route('**/api/public/validar-codigo-descuento', (r) => {
    comprobaciones.push(r.request().postDataJSON() as Record<string, unknown>);
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, motivo: 'Ese código ya ha caducado' }) });
  });
  let checkouts = 0;
  await page.route('**/api/stripe/checkout', (r) => {
    checkouts++;
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: 'https://checkout.stripe.com/c/pay/e2e' }) });
  });

  await page.getByRole('button', { name: '¿Tienes un código de descuento?' }).click();
  await page.getByPlaceholder('Código de descuento').fill('VERANO');
  await page.getByRole('button', { name: 'Contratar' }).first().click();

  await expect.poll(() => comprobaciones.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(comprobaciones[0]).toMatchObject({ studioId: STUDIO_ID, codigo: 'VERANO' });
  await expect(page.getByText('Ese código ya ha caducado. Bórralo para pagar sin descuento o prueba otro.')).toBeVisible({ timeout: 15_000 });
  expect(checkouts).toBe(0);
});

test('planes: con un código válido se va a pagar como siempre', async ({ page }) => {
  await abrirPlanes(page);
  await page.route('**/api/public/validar-codigo-descuento', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, descuento: 15 }) }));
  const checkouts: Record<string, unknown>[] = [];
  await page.route('**/api/stripe/checkout', (r) => {
    checkouts.push(r.request().postDataJSON() as Record<string, unknown>);
    // Sin `url`: la página no navega fuera y se puede comprobar que la petición salió.
    return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Stripe de prueba' }) });
  });

  await page.getByRole('button', { name: '¿Tienes un código de descuento?' }).click();
  await page.getByPlaceholder('Código de descuento').fill('VERANO');
  await page.getByRole('button', { name: 'Contratar' }).first().click();

  await expect.poll(() => checkouts.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(checkouts[0].codigoDescuento).toBe('VERANO');
});

test('planes: si el código no se puede comprobar (límite, servidor caído), se va a pagar como antes', async ({ page }) => {
  await abrirPlanes(page);
  let comprobaciones = 0;
  await page.route('**/api/public/validar-codigo-descuento', (r) => {
    comprobaciones++;
    return r.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'Demasiadas peticiones' }) });
  });
  const checkouts: Record<string, unknown>[] = [];
  await page.route('**/api/stripe/checkout', (r) => {
    checkouts.push(r.request().postDataJSON() as Record<string, unknown>);
    return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Stripe de prueba' }) });
  });

  await page.getByRole('button', { name: '¿Tienes un código de descuento?' }).click();
  await page.getByPlaceholder('Código de descuento').fill('VERANO');
  await page.getByRole('button', { name: 'Contratar' }).first().click();

  await expect.poll(() => comprobaciones, { timeout: 15_000 }).toBeGreaterThan(0);
  // No se bloquea la venta por un fallo que no es de la alumna: el cobro decide, como siempre.
  await expect.poll(() => checkouts.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(checkouts[0].codigoDescuento).toBe('VERANO');
});

test('el importe con céntimos se escribe a la española', async ({ page }) => {
  await hastaElPago(page, { importe: 15.3, descuento: 2.7, codigoAplicado: true, matricula: 0, total: 15.3 });
  await expect(page.getByRole('button', { name: 'Pagar 15,3 € y reservar' })).toBeVisible({ timeout: 15_000 });
});
