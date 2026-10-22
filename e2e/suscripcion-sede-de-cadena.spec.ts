import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Una cadena que deja de pagar (decisiones del fundador, 15-oct-2026):
//
// 1. Una sede SECUNDARIA no contrata un plan suelto: solo se le ofrece Cadena, y
//    se dice por qué. El servidor (/api/billing/checkout) lo rechaza igual con un
//    409 si llega una petición de plan suelto.
// 2. Contratar Cadena cancela, sin prorrateo, el plan suelto que pague alguna
//    sede: se avisa ANTES del botón de pagar, y solo cuando aplica.
//
// Lo que se le ofrece lo deriva /api/billing/status (`opcionesDePlan`).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STORAGE_KEY = 'sb-example-auth-token';

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

const SIN_PLAN = {
  plan: 'CADENA', subscriptionStatus: 'canceled', activo: false, configurado: true, esPropietaria: true,
  bloqueado: true, enPrueba: false, pruebaTermina: null, periodoTermina: null,
  trial: { fase: 'EXPIRADA', diasRestantes: 0, finaliza: null }, gratis: null,
};

const PRINCIPAL_PAGA_SUELTO = {
  plan: 'BASE', otraSede: true, nombreSede: 'Sede Centro', pagadoHasta: '2026-11-03T10:00:00+00:00', pagoEnCurso: false,
};

const MENSAJE_SOLO_CADENA =
  'Esta sede forma parte de tu cadena, así que se contrata con el plan Cadena, que cubre todas tus sedes en una sola suscripción. '
  + 'Founding Studio y Estudio son para un solo estudio: solo los puede contratar tu sede principal.';

// El andamiaje (sesión falsa y respuestas por defecto) primero; los mocks de cada
// prueba, DESPUÉS: Playwright mira primero el último registrado.
async function andamiaje(page: Page) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'duena@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/rest/v1/**', route => json(route, []));
}

async function conEstado(page: Page, estado: Record<string, unknown>) {
  await page.route('**/api/billing/status**', route => json(route, estado));
}

/** Cuenta los intentos de pago y contesta lo que se le diga. */
async function checkout(page: Page, respuesta: { status: number; body: unknown }) {
  const planes: string[] = [];
  await page.route('**/api/billing/checkout', async route => {
    planes.push((route.request().postDataJSON() as { plan: string }).plan);
    await json(route, respuesta.body, respuesta.status);
  });
  return planes;
}

test('sede secundaria: solo se ofrece Cadena, dice por qué, y es lo que se paga', async ({ page }) => {
  await andamiaje(page);
  await conEstado(page, { ...SIN_PLAN, opcionesDePlan: { soloCadena: true, sueltosQueCancelaCadena: [] } });
  const planes = await checkout(page, { status: 200, body: { url: 'https://checkout.stripe.com/c/pay/cs_test_e2e' } });
  await page.route('https://checkout.stripe.com/**', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Stripe</title>' }));
  await page.goto('/suscripcion');

  const porQue = page.locator('[data-solo-cadena]');
  await expect(porQue).toBeVisible({ timeout: 30_000 });
  await expect(porQue).toContainText('Esta sede forma parte de tu cadena, así que se contrata con el plan Cadena');
  await expect(porQue).toContainText('solo los puede contratar tu sede principal');

  const radios = page.getByRole('radiogroup', { name: 'Plan' }).getByRole('radio');
  await expect(radios).toHaveCount(1);
  await expect(page.getByRole('radio', { name: /^Plan Cadena, 149 euros/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: /Founding Studio|Plan Estudio/ })).toHaveCount(0);
  // Ninguna sede paga un plan suelto: no hay nada que avisar.
  await expect(page.locator('[data-aviso-cadena]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Continuar con Cadena · 149€/mes' }).click();
  await expect(page).toHaveURL(/checkout\.stripe\.com/);
  expect(planes).toEqual(['CADENA']);
});

test('sede secundaria con la principal pagando Founding Studio: antes de pagar, cuánto se deja de cobrar y que lo pagado no se devuelve', async ({ page }) => {
  await andamiaje(page);
  await conEstado(page, { ...SIN_PLAN, opcionesDePlan: { soloCadena: true, sueltosQueCancelaCadena: [PRINCIPAL_PAGA_SUELTO] } });
  await page.goto('/suscripcion');

  const aviso = page.getByRole('note', { name: 'Al activar Cadena' });
  await expect(aviso).toBeVisible({ timeout: 30_000 });
  await expect(aviso).toHaveText(
    'El plan Founding Studio de tu sede «Sede Centro», de 29 €/mes, se cancela al activar Cadena: dejas de pagarlo desde ese momento, '
    + 'y el mes que ya has pagado (hasta el 3 de noviembre de 2026) no se devuelve.',
  );
  // Va ANTES del botón de pagar.
  const caja = await aviso.boundingBox();
  const boton = await page.getByRole('button', { name: 'Continuar con Cadena · 149€/mes' }).boundingBox();
  expect(caja && boton && caja.y + caja.height <= boton.y).toBeTruthy();
});

test('estudio en el plan gratis: el aviso sale solo al elegir Cadena, y con su primer pago en curso no promete que deje de cobrarse', async ({ page }) => {
  await andamiaje(page);
  await conEstado(page, {
    plan: 'BASE', subscriptionStatus: 'incomplete', activo: true, configurado: true, esPropietaria: true, bloqueado: false,
    enPrueba: false, pruebaTermina: null, periodoTermina: null, trial: { fase: 'SIN_PRUEBA', diasRestantes: 0, finaliza: null },
    gratis: {
      fase: 'DENTRO', uso: { alumnasActivas: 42, reservas30Dias: 96 }, motivos: [], diasRestantes: 0, cierraEl: null,
      limites: { alumnas: 150, reservasMes: 250 }, margenDias: 30,
    },
    opcionesDePlan: { soloCadena: false, sueltosQueCancelaCadena: [{ plan: 'BASE', otraSede: false, nombreSede: null, pagadoHasta: null, pagoEnCurso: true }] },
  });
  await page.goto('/suscripcion');

  await expect(page.getByRole('radio', { name: /^Founding Studio/ })).toHaveAttribute('aria-checked', 'true', { timeout: 30_000 });
  await expect(page.getByRole('note', { name: 'Al activar Cadena' })).toHaveCount(0);

  await page.getByRole('radio', { name: /^Cadena/ }).click();
  const aviso = page.getByRole('note', { name: 'Al activar Cadena' });
  await expect(aviso).toHaveText(
    'Tu plan Founding Studio, de 29 €/mes, se cancela al activar Cadena. Su primer pago todavía se está procesando '
    + 'y cancelar no lo detiene: si llega a cobrarse, ese mes no se devuelve.',
  );
  // Cancelar no para un cobro en vuelo: no se promete que deje de cobrarse.
  await expect(aviso).not.toContainText('dejas de pagarlo');

  await page.getByRole('radio', { name: /^Estudio/ }).click();
  await expect(page.getByRole('note', { name: 'Al activar Cadena' })).toHaveCount(0);
});

test('estudio en el plan gratis sin planes sueltos vivos: elegir Cadena no avisa de nada', async ({ page }) => {
  await andamiaje(page);
  await conEstado(page, {
    plan: 'BASE', subscriptionStatus: 'gratis', activo: true, configurado: true, esPropietaria: true, bloqueado: false,
    enPrueba: false, pruebaTermina: null, periodoTermina: null, trial: { fase: 'SIN_PRUEBA', diasRestantes: 0, finaliza: null },
    gratis: {
      fase: 'DENTRO', uso: { alumnasActivas: 42, reservas30Dias: 96 }, motivos: [], diasRestantes: 0, cierraEl: null,
      limites: { alumnas: 150, reservasMes: 250 }, margenDias: 30,
    },
    opcionesDePlan: { soloCadena: false, sueltosQueCancelaCadena: [] },
  });
  await page.goto('/suscripcion');
  await page.getByRole('radio', { name: /^Cadena/ }).click({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Pasarme a Cadena · 149 €/mes' })).toBeVisible();
  await expect(page.locator('[data-aviso-cadena]')).toHaveCount(0);
});

test('si el servidor no pudo leer las sedes, al elegir Cadena lo dice en condicional', async ({ page }) => {
  await andamiaje(page);
  await conEstado(page, { ...SIN_PLAN, plan: 'BASE', opcionesDePlan: null });
  await page.goto('/suscripcion');
  await page.getByRole('radio', { name: /^Plan Cadena/ }).click({ timeout: 30_000 });
  await expect(page.getByRole('note', { name: 'Al activar Cadena' })).toHaveText(
    'Si alguna de tus sedes paga ahora Founding Studio o Estudio, ese plan se cancela al activar Cadena, y el mes que ya está pagado no se devuelve.',
  );
});

test('una petición de plan suelto desde una sede secundaria: el servidor dice que no y la pantalla lo cuenta, sin mandar a pagar', async ({ page }) => {
  await andamiaje(page);
  // Sin `opcionesDePlan` (un servidor anterior): la pantalla ofrece los tres y manda la petición.
  await conEstado(page, { ...SIN_PLAN, plan: 'BASE' });
  const planes = await checkout(page, { status: 409, body: { error: MENSAJE_SOLO_CADENA } });
  await page.goto('/suscripcion');

  await page.getByRole('radio', { name: /^Plan Founding Studio/ }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: /Continuar con Founding Studio/ }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'forma parte de tu cadena' })).toHaveText(MENSAJE_SOLO_CADENA);
  expect(planes.length).toBeGreaterThan(0);
  expect(planes).toEqual(['BASE']);
  await expect(page).toHaveURL(/\/suscripcion$/);
});
