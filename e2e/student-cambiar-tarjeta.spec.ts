import { test, expect, type Page } from '@playwright/test';
import { sembrarSociaCompleta, SLUG, STUDIO_ID, type Andamiaje } from './socia-completa';
import { STRIPE_STUB } from './stripe-stub';

// «Cambiar tarjeta» y «Añadir tarjeta» en Perfil → Método de pago (6-oct-2026).
//
// El formulario de Stripe va DENTRO de la app (Checkout incrustado en modo setup:
// en la app de iOS una página de Stripe se abría en Safari). «Tarjeta guardada»
// solo sale cuando el servidor lee en la ficha la tarjeta de ESA sesión
// (`GET /api/public/tarjeta?sesion=`), nunca al cerrarse el formulario.
// Contador de peticiones en todos los caminos: un test de fallo que no llegó a
// intentar nada no prueba nada (.claude/tentare-os.md). Corre también en WebKit:
// es la pantalla que la alumna usa desde su iPhone.

const PAGO = `/portal/${SLUG}/perfil/pago`;
const SESION = 'cs_test_tarjeta123';
const json = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) });

type Resp = { status: number; body?: unknown; abortar?: boolean };
const MASTER = { marca: 'mastercard', ultimos4: '4444', caducidad: '09/2030' };

async function montar(page: Page, o: {
  conTarjeta?: boolean;
  /** Respuesta del POST que abre el formulario (por defecto, la sesión). */
  abrir?: (n: number) => Resp;
  /** Respuesta de cada consulta de confirmación (por defecto: dos «confirmando» y luego «guardada»). */
  confirmar?: (n: number) => Resp;
  /** Lo que contesta la lista (`GET /api/public/tarjeta`). */
  lista?: unknown;
} = {}) {
  let fixture: Record<string, unknown> | null = null;
  const a: Andamiaje = await sembrarSociaCompleta(page, {
    conTarjeta: o.conTarjeta ?? true,
    ajustar: (f) => {
      (f.studio as Record<string, unknown>).stripeAccountId = 'acct_test_123';
      fixture = f;
    },
  });
  // Los page.route propios, SIEMPRE después del andamiaje (gana la última registrada).
  await page.route('https://js.stripe.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: STRIPE_STUB }));
  const c = { abrir: [] as unknown[], confirmar: [] as string[], lista: 0, borrar: [] as unknown[] };
  await page.route((u) => u.pathname === '/api/public/tarjeta', (r) => {
    const req = r.request();
    const url = new URL(req.url());
    if (req.method() === 'POST') {
      c.abrir.push(req.postDataJSON());
      const res = (o.abrir ?? (() => ({ status: 200, body: { clientSecret: 'cs_test_tarjeta123_secret_x', checkoutSessionId: SESION } })))(c.abrir.length);
      if (res.abortar) return r.abort();
      return r.fulfill(json(res.body ?? {}, res.status));
    }
    if (req.method() === 'DELETE') {
      c.borrar.push(req.postDataJSON());
      const socio = ((fixture?.socia as Record<string, unknown>).socio as Record<string, unknown>);
      Object.assign(socio, { tarjetaUltimos4: null, tarjetaMarca: null, tarjetaExpMes: null, tarjetaExpAnio: null });
      o.lista = { tarjetas: [], cobros: { hayMetodo: false } };
      return r.fulfill(json({ ok: true }));
    }
    if (url.searchParams.has('sesion')) {
      c.confirmar.push(req.url());
      const res = (o.confirmar ?? ((n) => (n < 3
        ? { status: 200, body: { confirmacion: 'confirmando', tarjeta: null } }
        : { status: 200, body: { confirmacion: 'guardada', tarjeta: MASTER } })))(c.confirmar.length);
      // Cuando el servidor la confirma, la ficha (studio-data) ya la trae: es lo que la pantalla relee.
      if ((res.body as { confirmacion?: string } | undefined)?.confirmacion === 'guardada') {
        const socio = ((fixture?.socia as Record<string, unknown>).socio as Record<string, unknown>);
        Object.assign(socio, { tarjetaUltimos4: '4444', tarjetaMarca: 'mastercard', tarjetaExpMes: 9, tarjetaExpAnio: 2030 });
      }
      if (res.abortar) return r.abort();
      return r.fulfill(json(res.body ?? {}, res.status));
    }
    c.lista += 1;
    return r.fulfill(json(o.lista ?? { tarjetas: [], cobros: { hayMetodo: !!o.conTarjeta } }));
  });
  await page.goto(PAGO, { waitUntil: 'domcontentloaded' });
  return { a, c };
}

const embebidos = (page: Page) => page.evaluate(() => (window as unknown as { __TENTARE_EMBEDDED?: { montado: boolean }[] }).__TENTARE_EMBEDDED ?? []);
const completar = (page: Page) => page.evaluate(() => (window as unknown as { __TENTARE_EMBEDDED_COMPLETE: () => boolean }).__TENTARE_EMBEDDED_COMPLETE());

test.describe('Student PWA · cambiar y añadir tarjeta sin salir de la app', () => {
  test.describe.configure({ timeout: 150_000 });
  test.use({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });

  test('cambiar: el formulario se monta en la hoja con la cuenta del estudio, y «Tarjeta guardada» solo cuando el servidor la lee', async ({ page }) => {
    const { a, c } = await montar(page);
    await expect(page.getByTestId('tarjeta')).toContainText('4242', { timeout: 60_000 });
    // Cambiar es la acción principal; quitar sigue ahí, como secundaria.
    await expect(page.getByRole('button', { name: 'Quitar tarjeta' })).toBeVisible();
    await page.getByRole('button', { name: 'Cambiar tarjeta' }).click();

    await expect(page.getByTestId('checkout-incrustado')).toBeVisible({ timeout: 30_000 });
    // Lo que permite guardarla vive en los términos del estudio, no a la vista (decisión del fundador, 6-oct).
    await expect(page.getByText(/podrá cobrarte|domiciliación bancaria/)).toHaveCount(0);
    expect(c.abrir).toEqual([{ studioId: STUDIO_ID }]);
    await expect.poll(async () => (await embebidos(page)).filter((e) => e.montado).length).toBe(1);
    const init = await page.evaluate(() => (window as unknown as { __TENTARE_STRIPE_INIT?: { stripeAccount: string | null }[] }).__TENTARE_STRIPE_INIT ?? []);
    expect(init.map((i) => i.stripeAccount), 'cargo directo: la tarjeta va a la cuenta del estudio').toContain('acct_test_123');

    expect(await completar(page)).toBe(true);
    await expect(page.getByText('Comprobando tu tarjeta…')).toBeVisible();
    // Mientras el servidor diga «confirmando», no se afirma nada.
    await expect(page.getByRole('heading', { name: 'Tarjeta guardada' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Tarjeta guardada' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('guardar-tarjeta-guardada')).toContainText('Mastercard •••• 4444');
    expect(c.confirmar.length, 'preguntó hasta que el servidor la confirmó').toBeGreaterThanOrEqual(3);
    expect(c.confirmar[0]).toContain(`sesion=${SESION}`);
    expect(c.confirmar[0]).toContain(`studioId=${STUDIO_ID}`);

    await page.getByRole('button', { name: 'Listo' }).click();
    await expect(page.getByTestId('tarjeta')).toContainText('4444', { timeout: 20_000 });
    expect(c.abrir).toHaveLength(1);
    expect(a.sinMockear()).toEqual([]);
  });

  test('añadir: sin tarjeta, «Añadir tarjeta» y la misma hoja', async ({ page }) => {
    const { a, c } = await montar(page, { conTarjeta: false, confirmar: () => ({ status: 200, body: { confirmacion: 'guardada', tarjeta: MASTER } }) });
    const vacio = page.getByTestId('sin-tarjeta');
    await expect(vacio).toBeVisible({ timeout: 60_000 });
    await expect(vacio).not.toContainText('podrá cobrarte');
    await vacio.getByRole('button', { name: 'Añadir tarjeta' }).click();
    await expect(page.getByRole('dialog', { name: 'Añadir tarjeta' })).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await embebidos(page)).filter((e) => e.montado).length, { timeout: 30_000 }).toBe(1);
    expect(await completar(page)).toBe(true);
    await expect(page.getByRole('heading', { name: 'Tarjeta guardada' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Listo' }).click();
    await expect(page.getByTestId('tarjeta')).toContainText('4444', { timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Cambiar tarjeta' })).toBeVisible();
    expect(c.abrir).toHaveLength(1);
    expect(c.confirmar.length).toBeGreaterThan(0);
    expect(a.sinMockear()).toEqual([]);
  });

  test('⚠️ método de cobros sin sus cuatro dígitos en el payload: se enseña con lo de Stripe y se ofrece CAMBIAR, no añadir', async ({ page }) => {
    const { c } = await montar(page, {
      conTarjeta: false,
      lista: { tarjetas: [{ id: 'pm_cobros', marca: 'visa', ultimos4: '1111', caducidad: '01/29', paraCobros: true }], cobros: { hayMetodo: true } },
    });
    await expect(page.getByTestId('tarjeta')).toContainText('1111', { timeout: 60_000 });
    await expect(page.getByRole('button', { name: 'Cambiar tarjeta' })).toBeVisible();
    await expect(page.getByTestId('sin-tarjeta')).toHaveCount(0);
    expect(c.lista).toBeGreaterThan(0);
  });

  test('quitar sigue funcionando igual: confirma y la quita cuando el servidor dice que sí', async ({ page }) => {
    const { a, c } = await montar(page);
    await expect(page.getByTestId('tarjeta')).toContainText('4242', { timeout: 60_000 });
    await page.getByRole('button', { name: 'Quitar tarjeta' }).click();
    await page.getByRole('button', { name: 'Sí, quitar la tarjeta' }).click();
    await expect(page.getByText('Tarjeta eliminada')).toBeVisible({ timeout: 20_000 });
    expect(c.borrar).toEqual([{ studioId: STUDIO_ID }]);
    await expect(page.getByTestId('sin-tarjeta')).toBeVisible({ timeout: 20_000 });
    expect(c.abrir, 'quitar no abre ningún formulario').toHaveLength(0);
    expect(a.sinMockear()).toEqual([]);
  });

  for (const [nombre, resp, texto] of [
    ['400', { status: 400, body: { error: 'Tu estudio todavía no acepta tarjetas desde la app.' } }, 'Tu estudio todavía no acepta tarjetas desde la app.'],
    ['500', { status: 500, body: { error: 'x' } }, 'No hemos podido abrir el formulario de la tarjeta. Inténtalo de nuevo.'],
    ['red caída', { status: 0, abortar: true }, 'No hemos podido conectar. Comprueba tu conexión e inténtalo de nuevo.'],
  ] as const) {
    test(`⚠️ abrir el formulario falla (${nombre}): se dice, se puede reintentar, y ni se monta Stripe ni dice «guardada»`, async ({ page }) => {
      const { c } = await montar(page, { abrir: (n) => (n === 1 ? resp : { status: 200, body: { clientSecret: 'cs_test_tarjeta123_secret_x', checkoutSessionId: SESION } }) });
      await expect(page.getByTestId('tarjeta')).toContainText('4242', { timeout: 60_000 });
      await page.getByRole('button', { name: 'Cambiar tarjeta' }).click();
      await expect(page.getByRole('alert').filter({ hasText: texto })).toBeVisible({ timeout: 30_000 });
      expect(c.abrir.length, 'no llegó a intentarlo: el test no prueba nada').toBeGreaterThan(0);
      expect(await embebidos(page)).toHaveLength(0);
      await expect(page.getByRole('heading', { name: 'Tarjeta guardada' })).toHaveCount(0);
      // Reintentar vuelve a pedirlo, y esta vez sí se monta.
      await page.getByRole('button', { name: 'Intentar de nuevo' }).click();
      await expect(page.getByTestId('checkout-incrustado')).toBeVisible({ timeout: 30_000 });
      expect(c.abrir).toHaveLength(2);
      // La tarjeta de antes sigue siendo la suya: nada ha cambiado.
      expect(c.confirmar).toHaveLength(0);
    });
  }

  test('⚠️ el servidor no la confirma (500 y «confirmando» sin fin): nunca dice «guardada»', async ({ page }) => {
    const { c } = await montar(page, {
      confirmar: (n) => (n % 2 ? { status: 500, body: { error: 'x' } } : { status: 200, body: { confirmacion: 'confirmando', tarjeta: null } }),
    });
    await expect(page.getByTestId('tarjeta')).toContainText('4242', { timeout: 60_000 });
    await page.getByRole('button', { name: 'Cambiar tarjeta' }).click();
    await expect.poll(async () => (await embebidos(page)).filter((e) => e.montado).length, { timeout: 30_000 }).toBe(1);
    expect(await completar(page)).toBe(true);
    for (let i = 0; i < 8; i++) { await page.clock.fastForward(9_000); await page.waitForTimeout(150); }
    await expect(page.getByText('Todavía no la vemos guardada')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: 'Tarjeta guardada' })).toHaveCount(0);
    expect(c.confirmar.length, 'preguntó al servidor').toBeGreaterThan(1);
    await page.getByRole('button', { name: 'Cerrar' }).click();
    // La pantalla sigue con la tarjeta que el servidor tiene: la de antes.
    await expect(page.getByTestId('tarjeta')).toContainText('4242');
  });
});
