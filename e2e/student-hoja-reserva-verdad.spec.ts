import { test, expect, type Page } from '@playwright/test';
import { SLUG, STUDIO_ID, SESION_ID, fixtureSociaLista, sembrarSociaLista } from './socia-lista';
import { STRIPE_STUB } from './stripe-stub';

// P01 (6-oct-2026): la hoja de reserva dice DESDE EL PRINCIPIO cómo se viene a esta clase.
//
// Antes, a quien no tenía nada que cubriera la clase le ofrecía «Confirmar 10:00 · 15 €»; el servidor contestaba
// «Necesitas un plan o bono activo» y la hoja la mandaba a «Perfil → Comprar». Un botón que dice que sí y un servidor
// que dice que no. Ahora hay cuatro casos, con la misma regla de «exigir plan» que el servidor:
//
//   · el estudio exige plan y aquí no se vende nada → ni botón de reservar: «pídelo en recepción»;
//   · exige plan y se vende online → «Ver cómo venir · desde X €», que abre el pago de ESTA clase (P06);
//   · no exige plan y la clase tiene precio → «Reservar · pagas en el estudio»;
//   · y la tienda, tras confirmar el SERVIDOR la compra, ofrece volver a reservarla.
//
// Solo Chromium: es lógica de negocio y el motor no cambia nada (criterio de SPECS_WEBKIT). Contador de POST en todo
// camino: «no reservó» solo vale si se demuestra que lo intentó cuando debía.

const base = `/portal/${SLUG}`;
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });
const SUELTA = { id: 'plan-suelta', studioId: STUDIO_ID, nombre: 'Clase suelta', tipo: 'PUNTUAL', sesiones: 1, precio: 15, activo: true };
const BONO = { id: 'plan-bono', studioId: STUDIO_ID, nombre: 'Bono 8 sesiones', tipo: 'BONO', sesiones: 8, precio: 96, activo: true };
const MENSUAL = { id: 'plan-mes', studioId: STUDIO_ID, nombre: 'Mensual ilimitado', tipo: 'MENSUAL', sesiones: null, precio: 89, activo: true, periodicidadMeses: 1 };

async function montar(page: Page, o: { exige: boolean; stripe: boolean }) {
  await sembrarSociaLista(page);
  const f = fixtureSociaLista() as unknown as Record<string, Record<string, unknown> | unknown[]>;
  Object.assign(f.studio as Record<string, unknown>, { reservaExigirPlan: o.exige, stripeAccountId: o.stripe ? 'acct_test_123' : null });
  f.planesTarifa = [SUELTA, BONO, MENSUAL];
  await page.route('**/api/public/studio-data', (r) => r.fulfill(json(f)));
  await page.route((u) => u.pathname === '/api/notifications', (r) => r.fulfill(json({ items: [], unread: 0 })));
  // La sesión con su query (`?slug=`): el glob del andamiaje no la alcanza, y sin socia la tienda manda a entrar.
  await page.route((u) => u.pathname === '/api/public/session', (r) => r.fulfill(
    json({ socioId: 'socio-e2e-1', nombre: 'Ana Test', email: 'socia-e2e@test.com' }),
  ));
  const reservas: unknown[] = [];
  return {
    reservas,
    async responder(r: { cuerpo?: unknown; status?: number; abortar?: boolean }) {
      await page.route('**/api/public/reserva', (route) => {
        if (route.request().method() !== 'POST') return route.continue();
        reservas.push(route.request().postDataJSON());
        if (r.abortar) return route.abort();
        return route.fulfill(json(r.cuerpo ?? {}, r.status ?? 200));
      });
    },
  };
}

async function abrirHoja(page: Page) {
  await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /^Reservar$/ }).first().click({ timeout: 45_000 });
  return page.locator('[role="dialog"]').last();
}

test.describe('Student PWA · la hoja de reserva dice la verdad sin bono (P01)', () => {
  test.describe.configure({ timeout: 120_000 });
  test.use({ viewport: { width: 390, height: 844 } });

  test('exige plan y el estudio no cobra online: «pídelo en recepción», sin botón de reservar y sin POST', async ({ page }) => {
    const m = await montar(page, { exige: true, stripe: false });
    await m.responder({ cuerpo: { ok: true, estado: 'CONFIRMADA' } });
    const hoja = await abrirHoja(page);
    await expect(hoja.getByText('Para esta clase necesitas un bono. Este estudio no vende online: pídelo en recepción.')).toBeVisible({ timeout: 30_000 });
    await expect(hoja.getByRole('button', { name: /^Confirmar/ })).toHaveCount(0);
    await hoja.getByRole('button', { name: 'Cerrar' }).click();
    expect(m.reservas, 'se mandó una reserva que el servidor iba a rechazar').toHaveLength(0);
  });

  test('control: sin exigir plan la misma clase SÍ se reserva, y se dice que se paga en el estudio', async ({ page }) => {
    const m = await montar(page, { exige: false, stripe: false });
    await m.responder({ cuerpo: { ok: true, estado: 'CONFIRMADA', reservaId: 'res-1' } });
    const hoja = await abrirHoja(page);
    await expect(hoja.getByText('Pagas 15 € en el estudio, el día de la clase.')).toBeVisible({ timeout: 30_000 });
    await hoja.getByRole('button', { name: 'Reservar · pagas en el estudio' }).click();
    await expect(page.getByText('Reserva confirmada')).toBeVisible({ timeout: 30_000 });
    expect(m.reservas.length).toBeGreaterThanOrEqual(1);
  });

  test('«pagas en el estudio» y el servidor dice que no: su texto, nunca una confirmación', async ({ page }) => {
    const m = await montar(page, { exige: false, stripe: false });
    await m.responder({ cuerpo: { error: 'Necesitas un plan o bono activo para reservar', codigo: 'sin-plan' }, status: 400 });
    const hoja = await abrirHoja(page);
    await hoja.getByRole('button', { name: 'Reservar · pagas en el estudio' }).click();
    await expect(page.getByText(/Necesitas un plan o bono activo/).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Reserva confirmada')).toHaveCount(0);
    expect(m.reservas.length).toBeGreaterThanOrEqual(1);
  });

  test('«pagas en el estudio» con el servidor caído (500) o sin red: avería u offline, nunca confirmada', async ({ page }) => {
    const m = await montar(page, { exige: false, stripe: false });
    await m.responder({ cuerpo: { error: 'x' }, status: 500 });
    const hoja = await abrirHoja(page);
    await hoja.getByRole('button', { name: 'Reservar · pagas en el estudio' }).click();
    await expect(page.getByText('Algo no ha salido como esperábamos')).toBeVisible({ timeout: 30_000 });
    expect(m.reservas.length).toBeGreaterThanOrEqual(1);
    await expect(page.getByText('Reserva confirmada')).toHaveCount(0);
  });

  test('sin red al reservar: lo dice, y no se da por reservada', async ({ page }) => {
    const m = await montar(page, { exige: false, stripe: false });
    await m.responder({ abortar: true });
    const hoja = await abrirHoja(page);
    await hoja.getByRole('button', { name: 'Reservar · pagas en el estudio' }).click();
    await expect(page.getByText('Reserva confirmada')).toHaveCount(0);
    await expect.poll(() => m.reservas.length, { timeout: 30_000 }).toBeGreaterThanOrEqual(1);
    await expect(hoja.getByText(/no se ha hecho ningún cargo|no se ha usado ninguna sesión|conexión/i).first()).toBeVisible({ timeout: 30_000 });
  });

  test('exige plan y se vende online: las opciones con su precio, «Ver cómo venir» abre el pago de ESTA clase, y la tienda con ella', async ({ page }) => {
    const m = await montar(page, { exige: true, stripe: true });
    await m.responder({ cuerpo: { ok: true, estado: 'CONFIRMADA' } });
    // P06: «Ver cómo venir» ya no sale de la ficha: abre la hoja de pagar y reservar, que pregunta al servidor.
    const opcionesClase: unknown[] = [];
    await page.route((u) => u.pathname === '/api/public/opciones-clase', (r) => {
      opcionesClase.push(r.request().postDataJSON());
      return r.fulfill(json({ pagosOnline: true, plaza: { ok: true }, precioEspecial: false, opciones: [
        { tipo: 'suelta', planId: 'plan-suelta', nombre: 'Clase suelta', importe: 15, sesiones: 1, precioPorClase: 15, validezDias: null, quedanTrasEsta: 0 },
      ] }));
    });
    await page.goto(`${base}/reservar/${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    // En la ficha, las formas de venir con su precio (sin la cuota: no es «venir a esta clase»).
    const opciones = page.getByTestId('opciones-de-clase');
    await expect(opciones).toBeVisible({ timeout: 45_000 });
    await expect(opciones.locator('li')).toHaveCount(2);
    await expect(opciones).toContainText('Clase suelta');
    await expect(opciones).toContainText('15 €');
    await expect(opciones).toContainText('ahorras un 20 %');
    await page.getByRole('button', { name: /^Reservar$/ }).first().click();
    const hoja = page.locator('[role="dialog"]').last();
    await expect(hoja.getByRole('button', { name: /^Confirmar/ })).toHaveCount(0);
    await hoja.getByRole('button', { name: 'Ver cómo venir · desde 15 €' }).click();
    await expect(page.getByTestId('pagar-clase-elegir')).toBeVisible({ timeout: 30_000 });
    expect(opcionesClase).toHaveLength(1);
    // La tienda con esta clase sigue existiendo (el «Ver opciones» de «Cómo vienes»).
    await page.goto(`${base}/comprar?para=${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    // Solo lo que cubre la clase; el resto, a un toque.
    await expect(page.getByTestId('comprar-para-clase')).toContainText('Reformer');
    await expect(page.getByRole('button', { name: /^Comprar · 15/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /^Contratar · / })).toHaveCount(0);
    await page.getByRole('button', { name: 'Ver todo el catálogo' }).click();
    await expect(page.getByRole('button', { name: /^Contratar · / })).toBeVisible();
    expect(m.reservas, 'no se reserva nada antes de pagar').toHaveLength(0);
  });

  test('comprado para la clase: «Reservar Reformer» solo cuando el servidor confirma, y abre la hoja de esa clase', async ({ page }) => {
    const m = await montar(page, { exige: true, stripe: true });
    await m.responder({ cuerpo: { ok: true, estado: 'CONFIRMADA' } });
    await page.route('https://js.stripe.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: STRIPE_STUB }));
    await page.route((u) => u.pathname === '/api/public/checkout-embebido', (r) =>
      r.fulfill(json({ clientSecret: 'pi_3Suelta12345678_secret_x', importe: 15 })));
    let estadoPago = 0;
    await page.route((u) => u.pathname === '/api/public/estado-pago', (r) => {
      estadoPago += 1;
      return r.fulfill(json(estadoPago < 2
        ? { estado: 'en_proceso' }
        : { estado: 'en_proceso', compra: { entregada: true, plan: 'Clase suelta', sesionesRestantes: 1, fechaFin: null } }));
    });
    await page.goto(`${base}/comprar?para=${SESION_ID}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /^Comprar · 15/ }).click({ timeout: 45_000 });
    await page.getByRole('button', { name: 'Continuar al pago' }).click();
    await page.getByRole('button', { name: /^Pagar 15/ }).click({ timeout: 30_000 });
    await expect(page.getByText('Pago recibido. Activando tu clase suelta…')).toBeVisible({ timeout: 15_000 });
    // Mientras el servidor no confirma, no hay botón para reservar (el servidor la rechazaría «sin plan»).
    await expect(page.getByRole('button', { name: 'Reservar Reformer' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Reservar Reformer' }).click({ timeout: 30_000 });
    expect(estadoPago).toBeGreaterThanOrEqual(2);
    await expect(page).toHaveURL(new RegExp(`/reservar/${SESION_ID}\\?reservar=1$`), { timeout: 30_000 });
    // La hoja nace abierta, y confirmar sigue siendo un toque suyo: no se ha reservado nada solo.
    await expect(page.getByRole('heading', { name: 'Confirma tu plaza' })).toBeVisible({ timeout: 45_000 });
    expect(m.reservas, 'se reservó sin que ella lo confirmara').toHaveLength(0);
  });
});
