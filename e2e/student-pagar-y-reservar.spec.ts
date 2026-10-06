import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, SESION_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';
import { STRIPE_STUB } from './stripe-stub';

// P06 · Fase A (6-oct-2026): pagar y reservar UNA clase sin salir de su ficha.
//
// Antes, sin bono, «Ver cómo venir» llevaba a la tienda: comprar el bono, volver, reservar. Y el cobro no
// miraba si quedaba plaza PARA ELLA: con la clase llena se cobraba y luego no había sitio. Ahora:
//   1. la hoja pregunta al servidor (opciones-clase) si hay plaza y con qué puede venir;
//   2. «Continuar» crea el cobro con la clase (el servidor vuelve a comprobar la plaza);
//   3. Stripe cobra;
//   4. «Reservada ✓» SOLO cuando estado-pago dice «confirmada»; si no hubo plaza, lo que tiene a su favor.
//
// Contadores en TODOS los caminos: «no cobró» o «no dijo ✓» solo valen si se demuestra que preguntó.
// Solo Chromium: es lógica de negocio y la app de la alumna ya pasa por WebKit en sus pantallas propias.

const base = `/portal/${SLUG}`;
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const SUELTA = { id: 'plan-suelta', studioId: STUDIO_ID, nombre: 'Clase suelta', tipo: 'PUNTUAL', sesiones: 1, precio: 15, activo: true };
const BONO = { id: 'plan-bono', studioId: STUDIO_ID, nombre: 'Bono 8 sesiones', tipo: 'BONO', sesiones: 8, precio: 96, activo: true };
const OPCIONES = [
  { tipo: 'suelta', planId: 'plan-suelta', nombre: 'Clase suelta', importe: 15, sesiones: 1, precioPorClase: 15, validezDias: null, quedanTrasEsta: 0 },
  { tipo: 'bono', planId: 'plan-bono', nombre: 'Bono 8 sesiones', importe: 96, sesiones: 8, precioPorClase: 12, ahorroPct: 20, validezDias: 90, quedanTrasEsta: 7 },
];
const PI = 'pi_3ClaseE2E000001';
const OK_OPCIONES = { pagosOnline: true, plaza: { ok: true }, precioEspecial: false, opciones: OPCIONES };

type Resp = { status?: number; body?: unknown; abortar?: boolean };

async function montar(page: Page, o: {
  opciones?: (n: number) => Resp;
  checkout?: (n: number) => Resp;
  estado?: (n: number) => Resp;
  confirm?: string;
} = {}) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, Record<string, unknown> | unknown[]>;
  Object.assign(f.studio as Record<string, unknown>, { reservaExigirPlan: true, stripeAccountId: 'acct_test_123' });
  f.planesTarifa = [SUELTA, BONO];
  // Los page.route propios, SIEMPRE después del andamiaje (gana el último registrado).
  await page.route('**/api/public/studio-data', (r) => r.fulfill(json(f)));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [], unread: 0 })));
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill(
    json({ socioId: 'socio-e2e-1', nombre: 'Ana Test', email: 'socia-e2e@test.com' }),
  ));
  await page.route('https://js.stripe.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: STRIPE_STUB }));
  if (o.confirm) {
    const modo = o.confirm;
    await page.addInitScript((m) => { (window as unknown as { __TENTARE_CONFIRM: string }).__TENTARE_CONFIRM = m; }, modo);
  }
  const c = { opciones: [] as unknown[], checkout: [] as Record<string, unknown>[], estado: [] as string[], reservas: 0 };
  const servir = (resp: Resp) => (resp.abortar ? null : json(resp.body ?? {}, resp.status ?? 200));
  await page.route((u) => u.pathname === '/api/public/opciones-clase', (r) => {
    c.opciones.push(r.request().postDataJSON());
    const s = servir((o.opciones ?? (() => ({ body: OK_OPCIONES })))(c.opciones.length));
    return s ? r.fulfill(s) : r.abort();
  });
  await page.route((u) => u.pathname === '/api/public/checkout-embebido', (r) => {
    c.checkout.push(r.request().postDataJSON() as Record<string, unknown>);
    const s = servir((o.checkout ?? (() => ({ body: { clientSecret: `${PI}_secret_x`, importe: 15, descuento: 0, matricula: 0 } })))(c.checkout.length));
    return s ? r.fulfill(s) : r.abort();
  });
  await page.route((u) => u.pathname === '/api/public/estado-pago', (r) => {
    c.estado.push(r.request().url());
    const s = servir((o.estado ?? (() => ({ body: { estado: 'en_proceso' } })))(c.estado.length));
    return s ? r.fulfill(s) : r.abort();
  });
  await page.route('**/api/public/reserva', (r) => {
    if (r.request().method() === 'POST') c.reservas += 1;
    return r.fulfill(json({ error: 'no debería reservarse por aquí' }, 400));
  });
  return c;
}

async function abrirPago(page: Page) {
  await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Reservar$/ }).first().click({ timeout: 45_000 });
  await page.locator('[role="dialog"]').last().getByRole('button', { name: 'Ver cómo venir · desde 15 €' }).click();
}

const confirmLlamadas = (page: Page) =>
  page.evaluate(() => (window as unknown as { __TENTARE_CONFIRM_LLAMADAS?: number }).__TENTARE_CONFIRM_LLAMADAS ?? 0);

/** Adelanta el reloj de la página para no esperar los ~35 s del sondeo de verdad. */
async function adelantar(page: Page, veces: number) {
  for (let i = 0; i < veces; i++) {
    await page.clock.fastForward(9_000);
    await page.waitForTimeout(150);
  }
}

test.describe('Student PWA · pagar y reservar una clase (P06)', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

  test('camino feliz: plaza comprobada → cobro con la clase → «Reservada» solo cuando el servidor la confirma', async ({ page }) => {
    const c = await montar(page, { estado: (n) => ({ body: n < 2 ? { estado: 'en_proceso' } : { estado: 'confirmada', clase: { nombre: 'Reformer', inicio: '2026-08-12T08:00:00Z' } } }) });
    await abrirPago(page);
    await expect(page.getByTestId('pagar-clase-elegir')).toBeVisible({ timeout: 30_000 });
    expect(c.opciones).toHaveLength(1);
    expect(c.opciones[0]).toMatchObject({ studioId: STUDIO_ID, sesionId: SESION_ID });
    // Las formas de venir con su precio; por defecto, la primera.
    await expect(page.getByRole('radio')).toHaveCount(2);
    await page.getByRole('button', { name: 'Continuar · 15 €' }).click();
    await page.getByRole('button', { name: 'Pagar 15 € y reservar' }).click({ timeout: 30_000 });
    await expect(page.getByText('Pago hecho. Confirmando tu plaza…')).toBeVisible({ timeout: 15_000 });
    await adelantar(page, 2);
    await expect(page.getByTestId('reserva-pagada-confirmada')).toBeVisible({ timeout: 20_000 });
    expect(c.checkout).toHaveLength(1);
    expect(c.checkout[0]).toMatchObject({ studioId: STUDIO_ID, planId: 'plan-suelta', sesionId: SESION_ID, aceptaCondiciones: true });
    expect(c.estado.length).toBeGreaterThanOrEqual(2);
    expect(c.estado[0]).toContain(`pi=${PI}`);
    expect(await confirmLlamadas(page)).toBe(1);
    expect(c.reservas, 'la reserva la hace el servidor tras cobrar, no la app').toBe(0);
  });

  test('elegir el bono: el cobro lleva ESE plan', async ({ page }) => {
    const c = await montar(page);
    await abrirPago(page);
    await page.locator('[role="dialog"] [data-plan="plan-bono"]').click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Continuar · 96 €' }).click();
    await expect.poll(() => c.checkout.length, { timeout: 15_000 }).toBe(1);
    expect(c.checkout[0]).toMatchObject({ planId: 'plan-bono', sesionId: SESION_ID });
  });

  test('⚠️ la clase está llena para ella: el texto del servidor y NADA de pago', async ({ page }) => {
    const c = await montar(page, { opciones: () => ({ body: {
      pagosOnline: true, opciones: [], precioEspecial: false,
      rechazo: { codigo: 'llena-con-espera', error: 'Esta clase se acaba de llenar. No te hemos cobrado nada.', posicionEspera: 1 },
    } }) });
    await abrirPago(page);
    await expect(page.getByText('Esta clase se acaba de llenar. No te hemos cobrado nada.')).toBeVisible({ timeout: 30_000 });
    expect(c.opciones.length, 'el servidor no llegó a preguntarse: el test no prueba nada').toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: /^Continuar/ })).toHaveCount(0);
    expect(c.checkout).toHaveLength(0);
    expect(await confirmLlamadas(page)).toBe(0);
  });

  test('⚠️ con un impago que bloquea: se dice y se ofrece pagar lo pendiente, no la clase', async ({ page }) => {
    const c = await montar(page, { opciones: () => ({ body: {
      pagosOnline: true, opciones: [], rechazo: { codigo: 'impago', error: 'Tienes un pago pendiente con el estudio. No te hemos cobrado nada.' },
    } }) });
    await abrirPago(page);
    await expect(page.getByText(/Tienes un pago pendiente/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Pagar lo pendiente' })).toHaveAttribute('href', /\/pagos$/);
    expect(c.opciones.length).toBeGreaterThan(0);
    expect(c.checkout).toHaveLength(0);
  });

  test('opciones-clase caído (500) o sin red: «inténtalo en un momento», sin cobro', async ({ page }) => {
    const c = await montar(page, { opciones: (n) => (n === 1 ? { status: 500, body: { error: 'detalle interno' } } : { abortar: true }) });
    await abrirPago(page);
    await expect(page.getByText(/Inténtalo en un momento: no se te ha cobrado nada/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('detalle interno')).toHaveCount(0);
    await page.getByRole('button', { name: 'Intentar de nuevo' }).click();
    await expect(page.getByText(/Revisa tu conexión: no se te ha cobrado nada/)).toBeVisible({ timeout: 30_000 });
    expect(c.opciones.length).toBeGreaterThanOrEqual(2);
    expect(c.checkout).toHaveLength(0);
  });

  test('⚠️ se llena entre mirar y pagar: el cobro dice que no (409) y no se monta ningún pago', async ({ page }) => {
    const c = await montar(page, { checkout: () => ({ status: 409, body: { codigo: 'llena-con-espera', error: 'Esta clase se acaba de llenar. No te hemos cobrado nada.' } }) });
    await abrirPago(page);
    await page.getByRole('button', { name: 'Continuar · 15 €' }).click({ timeout: 30_000 });
    await expect(page.getByText('Esta clase se acaba de llenar. No te hemos cobrado nada.')).toBeVisible({ timeout: 15_000 });
    expect(c.checkout.length).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: /^Pagar / })).toHaveCount(0);
    expect(await confirmLlamadas(page)).toBe(0);
  });

  test('ya la había pagado y se está confirmando: no se le ofrece pagar otra vez, se espera su pago', async ({ page }) => {
    const c = await montar(page, {
      opciones: () => ({ body: { pagosOnline: true, pagoEnCurso: { pi: PI }, opciones: [] } }),
      estado: (n) => ({ body: n < 2 ? { estado: 'en_proceso' } : { estado: 'confirmada', clase: { nombre: 'Reformer', inicio: '2026-08-12T08:00:00Z' } } }),
    });
    await abrirPago(page);
    await expect(page.getByText('Pago hecho. Confirmando tu plaza…')).toBeVisible({ timeout: 30_000 });
    await adelantar(page, 2);
    await expect(page.getByTestId('reserva-pagada-confirmada')).toBeVisible({ timeout: 20_000 });
    expect(c.checkout, 'ni un cobro nuevo').toHaveLength(0);
    expect(c.estado[0]).toContain(`pi=${PI}`);
  });

  test('⚠️ pagó y la clase se llenó mientras pagaba: lista de espera con su puesto y lo que tiene a su favor, sin ✓', async ({ page }) => {
    const c = await montar(page, { estado: () => ({ body: {
      estado: 'compensada',
      compensacion: { motivo: 'EN_ESPERA', enEspera: true, posicion: 1, bono: { nombre: 'Clase suelta', sesionesRestantes: 1, fechaFin: null }, estudioAvisado: true },
    } }) });
    await abrirPago(page);
    await page.getByRole('button', { name: 'Continuar · 15 €' }).click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Pagar 15 € y reservar' }).click({ timeout: 30_000 });
    await adelantar(page, 1);
    await expect(page.getByText('Estás la 1.ª en la lista de espera')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Tienes 1 clase en Clase suelta/)).toBeVisible();
    await expect(page.getByText(/El estudio ya lo sabe/)).toBeVisible();
    await expect(page.getByTestId('reserva-pagada-confirmada')).toHaveCount(0);
    expect(c.estado.length).toBeGreaterThanOrEqual(1);
  });

  test('si la plaza tarda: «tu pago está hecho… no vuelvas a pagar», nunca ✓', async ({ page }) => {
    const c = await montar(page);
    await abrirPago(page);
    await page.getByRole('button', { name: 'Continuar · 15 €' }).click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Pagar 15 € y reservar' }).click({ timeout: 30_000 });
    await expect(page.getByText('Pago hecho. Confirmando tu plaza…')).toBeVisible({ timeout: 15_000 });
    await adelantar(page, 8);
    await expect(page.getByText('Tu pago está hecho')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/no vuelvas a pagar/)).toBeVisible();
    await expect(page.getByTestId('reserva-pagada-confirmada')).toHaveCount(0);
    expect(c.estado.length).toBeGreaterThanOrEqual(2);
  });

  test('un rechazo del banco: su motivo, y ni se pregunta por la plaza', async ({ page }) => {
    const c = await montar(page, { confirm: 'card_error' });
    await abrirPago(page);
    await page.getByRole('button', { name: 'Continuar · 15 €' }).click({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Pagar 15 € y reservar' }).click({ timeout: 30_000 });
    await expect(page.getByText(/Tu tarjeta no tiene fondos suficientes/)).toBeVisible({ timeout: 15_000 });
    expect(await confirmLlamadas(page)).toBe(1);
    expect(c.estado).toHaveLength(0);
  });
});
