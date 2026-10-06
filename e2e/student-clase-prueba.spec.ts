import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, SESION_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';
import { STRIPE_STUB } from './stripe-stub';

// P07 (6-oct-2026): «Tu primera clase» dentro de la app, SOLO para quien el servidor considera nueva.
//
// Antes la app escondía la clase de prueba (la web sí la tenía): quien llegaba a probar desde la app no la veía.
// Ahora:
//   · la tienda pregunta al servidor (GET /api/public/prueba) SOLO si el estudio tiene una prueba activa, y enseña la
//     tarjeta solo si el servidor dice que puede estrenarla;
//   · en la hoja de pagar y reservar, la prueba va PRIMERA (la manda opciones-clase); gratis = «Reservar gratis»,
//     que es la reserva de siempre con `pruebaPlanId`; de pago, el cobro de P06;
//   · si el servidor dice que la prueba no vale, se dice y las demás opciones siguen a la vista.
// Contadores en todos los caminos. Solo Chromium (lógica de negocio).

const base = `/portal/${SLUG}`;
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const SUELTA = { id: 'plan-suelta', studioId: STUDIO_ID, nombre: 'Clase suelta', tipo: 'PUNTUAL', sesiones: 1, precio: 15, activo: true };
const BONO = { id: 'plan-bono', studioId: STUDIO_ID, nombre: 'Bono 8 sesiones', tipo: 'BONO', sesiones: 8, precio: 96, activo: true };
const PRUEBA = { id: 'plan-prueba', studioId: STUDIO_ID, nombre: 'Clase de prueba', tipo: 'PUNTUAL', sesiones: 1, precio: 0, activo: true, esPrueba: true };
const OP_SUELTA = { tipo: 'suelta', planId: 'plan-suelta', nombre: 'Clase suelta', importe: 15, sesiones: 1, precioPorClase: 15, validezDias: null, quedanTrasEsta: 0 };
const op = (precio: number) => ({
  tipo: 'prueba', planId: 'plan-prueba', nombre: 'Clase de prueba', importe: precio, sesiones: 1, precioPorClase: precio,
  validezDias: null, quedanTrasEsta: 0, ...(precio === 0 ? { gratis: true } : {}),
});
const PI = 'pi_3PruebaE2E00001';

type Resp = { status?: number; body?: unknown; abortar?: boolean };

async function montar(page: Page, o: {
  conPrueba?: boolean;
  prueba?: Resp;
  opciones?: Resp;
  reserva?: Resp;
  checkout?: Resp;
  estado?: Resp;
} = {}) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, Record<string, unknown> | unknown[]>;
  Object.assign(f.studio as Record<string, unknown>, { reservaExigirPlan: true, stripeAccountId: 'acct_test_123' });
  f.planesTarifa = o.conPrueba === false ? [SUELTA, BONO] : [SUELTA, BONO, PRUEBA];
  // Los page.route propios, SIEMPRE después del andamiaje.
  await page.route('**/api/public/studio-data', (r) => r.fulfill(json(f)));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [], unread: 0 })));
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill(
    json({ socioId: 'socio-e2e-1', nombre: 'Ana Test', email: 'socia-e2e@test.com' }),
  ));
  await page.route('https://js.stripe.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: STRIPE_STUB }));
  const c = { prueba: 0, opciones: 0, reservas: [] as Record<string, unknown>[], checkout: [] as Record<string, unknown>[], estado: 0 };
  const servir = (route: Parameters<Parameters<Page['route']>[1]>[0], resp: Resp) =>
    (resp.abortar ? route.abort() : route.fulfill(json(resp.body ?? {}, resp.status ?? 200)));
  await page.route((u) => u.pathname === '/api/public/prueba', (r) => {
    c.prueba += 1;
    return servir(r, o.prueba ?? { body: { disponible: true, oferta: { planId: 'plan-prueba', nombre: 'Clase de prueba', precio: 0, gratis: true, tiposClaseIds: [] } } });
  });
  await page.route((u) => u.pathname === '/api/public/opciones-clase', (r) => {
    c.opciones += 1;
    return servir(r, o.opciones ?? { body: { pagosOnline: true, plaza: { ok: true }, precioEspecial: false, opciones: [op(0), OP_SUELTA] } });
  });
  await page.route('**/api/public/reserva', (r) => {
    if (r.request().method() !== 'POST') return r.continue();
    c.reservas.push(r.request().postDataJSON() as Record<string, unknown>);
    return servir(r, o.reserva ?? { body: { ok: true, estado: 'CONFIRMADA', reservaId: 'res-1' } });
  });
  await page.route((u) => u.pathname === '/api/public/checkout-embebido', (r) => {
    c.checkout.push(r.request().postDataJSON() as Record<string, unknown>);
    return servir(r, o.checkout ?? { body: { clientSecret: `${PI}_secret_x`, importe: 16, descuento: 0, matricula: 0 } });
  });
  await page.route((u) => u.pathname === '/api/public/estado-pago', (r) => {
    c.estado += 1;
    return servir(r, o.estado ?? { body: { estado: 'confirmada', clase: { nombre: 'Reformer', inicio: '2026-08-12T08:00:00Z' } } });
  });
  return c;
}

async function abrirPago(page: Page) {
  await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Reservar$/ }).first().click({ timeout: 45_000 });
  await page.locator('[role="dialog"]').last().getByRole('button', { name: /^Ver cómo venir · desde/ }).click();
  await expect(page.getByTestId('pagar-clase-elegir')).toBeVisible({ timeout: 30_000 });
}

const confirmLlamadas = (page: Page) =>
  page.evaluate(() => (window as unknown as { __TENTARE_CONFIRM_LLAMADAS?: number }).__TENTARE_CONFIRM_LLAMADAS ?? 0);

test.describe('Student PWA · tu primera clase (P07)', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

  test('tienda: quien puede estrenarla ve «Tu primera clase» y va a elegir su clase', async ({ page }) => {
    const c = await montar(page);
    await page.goto(`${base}/comprar`, { waitUntil: 'domcontentloaded' });
    const tarjeta = page.getByTestId('tu-primera-clase');
    await expect(tarjeta).toBeVisible({ timeout: 45_000 });
    await expect(tarjeta).toContainText('Gratis');
    await expect(tarjeta).toContainText('Solo una vez por persona');
    await expect(tarjeta.getByRole('link', { name: 'Elegir mi clase' })).toHaveAttribute('href', /\/reservar$/);
    // ≥1: en desarrollo React monta dos veces (StrictMode); lo que importa es que preguntó al servidor.
    expect(c.prueba).toBeGreaterThanOrEqual(1);
  });

  test('tienda: si el servidor dice que no (ya ha venido), no aparece nada', async ({ page }) => {
    const c = await montar(page, { prueba: { body: { disponible: false } } });
    await page.goto(`${base}/comprar`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /^Comprar · / }).first()).toBeVisible({ timeout: 45_000 });
    await expect.poll(() => c.prueba, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
    await expect(page.getByTestId('tu-primera-clase')).toHaveCount(0);
  });

  test('tienda: un estudio sin clase de prueba no pregunta nada', async ({ page }) => {
    const c = await montar(page, { conPrueba: false });
    await page.goto(`${base}/comprar`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('button', { name: /^Comprar · / }).first()).toBeVisible({ timeout: 45_000 });
    expect(c.prueba).toBe(0);
    await expect(page.getByTestId('tu-primera-clase')).toHaveCount(0);
  });

  test('gratis: la prueba va primera, «Reservar gratis» reserva con pruebaPlanId y sin cobrar', async ({ page }) => {
    const c = await montar(page);
    await abrirPago(page);
    const radios = page.locator('[role="dialog"] [role="radiogroup"] label');
    await expect(radios.first()).toContainText('Tu primera clase');
    await expect(radios.first()).toContainText('Gratis');
    await page.getByRole('button', { name: 'Reservar gratis' }).click();
    await expect(page.getByTestId('reserva-pagada-confirmada')).toBeVisible({ timeout: 20_000 });
    expect(c.reservas).toHaveLength(1);
    expect(c.reservas[0]).toMatchObject({ accion: 'crear', studioId: STUDIO_ID, sesionId: SESION_ID, pruebaPlanId: 'plan-prueba' });
    expect(c.checkout).toHaveLength(0);
  });

  test('⚠️ gratis y el servidor dice que no cubre esta clase: lo dice, y las demás opciones siguen', async ({ page }) => {
    const c = await montar(page, { reserva: { status: 409, body: { codigo: 'prueba-no-cubre', error: 'La clase de prueba no sirve para esta clase.' } } });
    await abrirPago(page);
    await page.getByRole('button', { name: 'Reservar gratis' }).click();
    await expect(page.getByTestId('aviso-prueba')).toHaveText('La clase de prueba no sirve para esta clase.', { timeout: 20_000 });
    expect(c.reservas.length, 'no llegó a intentarlo: el test no prueba nada').toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: 'Continuar · 15 €' })).toBeVisible();
    await expect(page.getByTestId('reserva-pagada-confirmada')).toHaveCount(0);
  });

  test('gratis con el servidor caído (500): avería, nunca reservada', async ({ page }) => {
    const c = await montar(page, { reserva: { status: 500, body: { error: 'x', codigo: 'error' } } });
    await abrirPago(page);
    await page.getByRole('button', { name: 'Reservar gratis' }).click();
    await expect(page.getByText(/No hemos podido reservar tu clase de prueba/)).toBeVisible({ timeout: 20_000 });
    expect(c.reservas.length).toBeGreaterThan(0);
    await expect(page.getByTestId('reserva-pagada-confirmada')).toHaveCount(0);
  });

  test('⚠️ de pago con otra prueba a medio pagar (409 prueba-en-curso): lo dice, sin cobro, y las demás opciones siguen', async ({ page }) => {
    const c = await montar(page, {
      opciones: { body: { pagosOnline: true, plaza: { ok: true }, precioEspecial: false, opciones: [op(16), OP_SUELTA] } },
      checkout: { status: 409, body: { codigo: 'prueba-en-curso', error: 'Ya tienes tu clase de prueba a medio pagar en otra clase. No te hemos cobrado nada.' } },
    });
    await abrirPago(page);
    await page.getByRole('button', { name: 'Continuar · 16 €' }).click();
    await expect(page.getByTestId('aviso-prueba')).toContainText('Ya tienes tu clase de prueba a medio pagar', { timeout: 20_000 });
    expect(c.checkout.length).toBeGreaterThan(0);
    expect(c.checkout[0]).toMatchObject({ planId: 'plan-prueba', sesionId: SESION_ID });
    expect(await confirmLlamadas(page)).toBe(0);
    await expect(page.getByRole('button', { name: 'Continuar · 15 €' })).toBeVisible();
  });

  test('control: de pago y válida, se cobra (confirm = 1) y «Reservada» cuando el servidor lo dice', async ({ page }) => {
    const c = await montar(page, { opciones: { body: { pagosOnline: true, plaza: { ok: true }, precioEspecial: false, opciones: [op(16), OP_SUELTA] } } });
    await abrirPago(page);
    await page.getByRole('button', { name: 'Continuar · 16 €' }).click();
    await page.getByRole('button', { name: 'Pagar 16 € y reservar' }).click({ timeout: 30_000 });
    await page.clock.fastForward(9_000);
    await expect(page.getByTestId('reserva-pagada-confirmada')).toBeVisible({ timeout: 20_000 });
    expect(await confirmLlamadas(page)).toBe(1);
    expect(c.checkout[0]).toMatchObject({ planId: 'plan-prueba' });
    expect(c.estado).toBeGreaterThan(0);
  });
});
