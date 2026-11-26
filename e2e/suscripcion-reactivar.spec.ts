import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La pantalla de reactivación (26-nov-2026): a un estudio al que se le ha acabado
// el plazo se le lleva a /studio/<id>/access_account/reactivate y paga ahí.
// El formulario de Stripe no se puede probar aquí (hace falta una clave real): se
// prueba a dónde se llega, qué se le pide al servidor y que, si el formulario no
// carga, se pueda pagar igual en la página de Stripe.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const RUTA = `/studio/${STUDIO_ID}/access_account/reactivate`;

// `next dev` compila cada ruta la primera vez que se pide.
test.setTimeout(180_000);

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const BLOQUEADA = {
  estudioId: STUDIO_ID, plan: 'BASE', subscriptionStatus: 'gratis_cerrado', activo: false, configurado: true,
  esPropietaria: true, bloqueado: true, enPrueba: false, pruebaTermina: null, periodoTermina: null,
  trial: { fase: 'SIN_PRUEBA', diasRestantes: 0, finaliza: null },
  gratis: { fase: 'CERRADO', uso: { alumnasActivas: 12, reservas30Dias: 180 }, motivos: ['reservas'], diasRestantes: 0, cierraEl: null, limites: { reservasMes: 150 }, margenDias: 30 },
  complementos: { pagaAparte: false, contratados: [], disponibles: ['decisiones', 'sustituciones', 'ia'] },
};

async function montar(page: Page, estado: Record<string, unknown> = BLOQUEADA) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'duena@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/billing/status**', route => json(route, estado));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  // Sin Stripe de verdad: su script no llega.
  await page.route('https://js.stripe.com/**', route => route.abort());
}

/** Apunta lo que se le pide al cobro y contesta, por orden, lo que se le diga (la última se repite). */
async function cobro(page: Page, ...respuestas: { status: number; body: unknown }[]) {
  const pedidos: Record<string, unknown>[] = [];
  await page.route('**/api/billing/checkout', async route => {
    pedidos.push(route.request().postDataJSON() as Record<string, unknown>);
    const r = respuestas[Math.min(pedidos.length, respuestas.length) - 1];
    await json(route, r.body, r.status);
  });
  await page.route('https://checkout.stripe.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Stripe</title>' }));
  return pedidos;
}

test('con el plazo pasado, abrir el panel lleva a la pantalla de reactivación y pide el pago una sola vez', async ({ page }) => {
  await montar(page);
  const pedidos = await cobro(page, { status: 200, body: { alojado: true } });
  await page.goto('/dashboard');

  await expect(page).toHaveURL(new RegExp(`${RUTA}$`), { timeout: 120_000 });
  await expect(page.getByRole('heading', { name: 'Retoma tu estudio por 29 €' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Founding Studio · IVA incluido')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continuar al pago' })).toBeVisible();
  await expect(page.getByText(/aceptas pagar 29\s€\/mes/)).toBeVisible();
  await expect(page.getByText(/se contratan aparte/)).toBeVisible();
  expect(pedidos).toEqual([{ plan: 'BASE', incrustado: true }]);
});

test('con descuento, el botón lleva a la página de Stripe', async ({ page }) => {
  await montar(page);
  const pedidos = await cobro(page,
    { status: 200, body: { alojado: true } },
    { status: 200, body: { url: 'https://checkout.stripe.com/c/pay/cs_test_e2e' } });
  await page.goto(RUTA);

  await page.getByRole('button', { name: 'Continuar al pago' }).click({ timeout: 120_000 });
  await expect(page).toHaveURL(/checkout\.stripe\.com/);
  expect(pedidos[1]).toEqual({ plan: 'BASE' });
});

test('si el formulario de Stripe no carga, se puede pagar en su página', async ({ page }) => {
  await montar(page);
  await cobro(page, { status: 200, body: { clientSecret: 'cs_test_e2e_secret_x' } });
  await page.goto(RUTA);

  await expect(page.getByText('Termina el pago en la página segura de Stripe.')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByRole('button', { name: 'Continuar al pago' })).toBeEnabled();
});

test('si el servidor dice que no, se dice por qué y se puede reintentar', async ({ page }) => {
  await montar(page);
  const pedidos = await cobro(page,
    { status: 409, body: { error: 'Ya hay un pago en marcha para esta suscripción. Espera unos segundos y vuelve a intentarlo.' } },
    { status: 200, body: { alojado: true } });
  await page.goto(RUTA);

  await expect(page.getByRole('alert').filter({ hasText: 'Ya hay un pago en marcha' })).toBeVisible({ timeout: 120_000 });
  await page.getByRole('button', { name: 'Volver a intentarlo' }).click();
  await expect(page.getByRole('button', { name: 'Continuar al pago' })).toBeVisible();
  expect(pedidos).toHaveLength(2);
});

test('el estudio de la dirección no manda: se corrige al de la sesión', async ({ page }) => {
  await montar(page);
  await cobro(page, { status: 200, body: { alojado: true } });
  await page.goto('/studio/studio-de-otra/access_account/reactivate');
  await expect(page).toHaveURL(new RegExp(`${RUTA}$`), { timeout: 120_000 });
});

test('«Ver todos los planes» lleva a /suscripcion y no rebota', async ({ page }) => {
  await montar(page);
  await cobro(page, { status: 200, body: { alojado: true } });
  await page.goto(RUTA);

  await page.getByRole('link', { name: 'Ver todos los planes' }).click({ timeout: 120_000 });
  await expect(page.getByRole('radiogroup', { name: 'Plan' })).toBeVisible({ timeout: 60_000 });
  await expect(page).toHaveURL(/\/suscripcion#tu-plan$/);
});

test('quien llega a /suscripcion a secas estando bloqueada acaba en la pantalla de reactivación', async ({ page }) => {
  await montar(page);
  await cobro(page, { status: 200, body: { alojado: true } });
  await page.goto('/suscripcion');
  await expect(page).toHaveURL(new RegExp(`${RUTA}$`), { timeout: 120_000 });
});

test('sin plazo pasado no hay pantalla ni se abre ningún pago', async ({ page }) => {
  await montar(page, { ...BLOQUEADA, bloqueado: false, activo: true, gratis: null, subscriptionStatus: 'active' });
  const pedidos = await cobro(page, { status: 200, body: { alojado: true } });
  await page.goto(RUTA);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 120_000 });
  expect(pedidos).toHaveLength(0);
});
