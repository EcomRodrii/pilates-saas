import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Founding Studio gratis (decisión del fundador, 15-oct-2026; reglas en
// lib/billing/plan-gratis.ts). Lo que deriva el servidor (/api/billing/status →
// `gratis`) se ve como «Planes» de Bonsai: el plan que tienes con la frase del
// fundador, lo que usas frente a los dos límites y a qué se sube. La píldora del
// panel sale solo cerca del límite o dentro del margen.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

type Fase = 'DENTRO' | 'CERCA' | 'MARGEN' | 'CERRADO';
type FaseMock = Fase | 'MARGEN_RESERVAS';
const GRATIS: Record<FaseMock, Record<string, unknown>> = {
  DENTRO: { fase: 'DENTRO', uso: { alumnasActivas: 42, reservas30Dias: 96 }, motivos: [], diasRestantes: 0, cierraEl: null },
  CERCA: { fase: 'CERCA', uso: { alumnasActivas: 128, reservas30Dias: 128 }, motivos: ['reservas'], diasRestantes: 0, cierraEl: null },
  MARGEN: { fase: 'MARGEN', uso: { alumnasActivas: 152, reservas30Dias: 151 }, motivos: ['reservas'], diasRestantes: 12, cierraEl: '2026-11-20' },
  MARGEN_RESERVAS: { fase: 'MARGEN', uso: { alumnasActivas: 90, reservas30Dias: 310 }, motivos: ['reservas'], diasRestantes: 20, cierraEl: '2026-11-28' },
  CERRADO: { fase: 'CERRADO', uso: { alumnasActivas: 160, reservas30Dias: 160 }, motivos: ['reservas'], diasRestantes: 0, cierraEl: '2026-10-10' },
};

async function montar(page: Page, fase: FaseMock, ruta: string) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'duena@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/billing/status**', route => json(route, {
    plan: 'BASE', subscriptionStatus: 'gratis', activo: fase !== 'CERRADO', configurado: true, esPropietaria: true,
    bloqueado: fase === 'CERRADO', enPrueba: false, pruebaTermina: null, periodoTermina: null,
    trial: { fase: 'SIN_PRUEBA', diasRestantes: 0, finaliza: null },
    gratis: { ...GRATIS[fase], limites: { reservasMes: 150 }, margenDias: 30 },
  }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID, plan: 'BASE', subscription_status: 'gratis' }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.goto(ruta);
}

test('Tu plan: Founding Studio gratis, con la frase del fundador y lo que usas frente a cada límite', async ({ page }) => {
  await montar(page, 'DENTRO', '/suscripcion');
  await expect(page.getByRole('heading', { level: 1, name: 'Tu plan' })).toBeVisible({ timeout: 30_000 });
  const plan = page.getByRole('region', { name: 'Tu plan' });
  await expect(plan).toContainText('Founding Studio');
  await expect(plan).toContainText('Gratis');
  await expect(plan).toContainText('Tú eres la prioridad. Si tu estudio crece, crecemos contigo.');

  const uso = page.getByRole('region', { name: 'Lo que usas' });
  // Sin tope de alumnas (13-nov-2026): solo se mide el de reservas.
  await expect(uso.getByRole('meter', { name: 'Clientes activos' })).toHaveCount(0);
  await expect(uso.getByRole('meter', { name: 'Reservas en los últimos 30 días' })).toHaveAttribute('aria-valuenow', '96');
  await expect(uso.getByRole('meter', { name: 'Reservas en los últimos 30 días' })).toHaveAttribute('aria-valuemax', '150');
  await expect(uso).toContainText('Te corresponde Founding Studio: gratis');

  // Crecer es Founding Studio de pago a 29 €/mes (fundador, 15-oct-2026), también dentro del límite:
  // va elegido; Estudio y Cadena se ofrecen, pero no se eligen solos.
  await expect(page.getByRole('radio', { name: /^Founding Studio/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: /^Estudio/ })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('button', { name: /Pasarme a Founding Studio · 29 €\/mes/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /59 €\/mes/ })).toHaveCount(0);
});

test('pasado un límite: cuántos días quedan, hasta cuándo, y qué pasa si vuelve a bajar', async ({ page }) => {
  await montar(page, 'MARGEN', '/suscripcion');
  const aviso = page.getByRole('region', { name: 'Lo que usas' }).getByRole('alert');
  await expect(aviso).toContainText('Te quedan 12 días en Founding Studio', { timeout: 30_000 });
  await expect(aviso).toContainText('150 reservas al mes');
  await expect(aviso).toContainText('hasta el 20 de noviembre');
  await expect(aviso).toContainText('Si antes vuelves a estar por debajo, no tienes que hacer nada');
  // Pase el límite que pase, lo que toca es Founding Studio de pago (fundador, 15-oct-2026):
  // también con más de 150 alumnas. Estudio y Cadena se ofrecen, pero no se eligen solos.
  await expect(aviso).toContainText('Founding Studio de pago (29 €/mes)');
  await expect(aviso).toContainText('sin límites');
  await expect(aviso).not.toContainText('Estudio (59');
  await expect(page.getByRole('radio', { name: /^Founding Studio/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: /^Estudio/ })).toHaveAttribute('aria-checked', 'false');
});

test('pasado solo de reservas: toca Founding Studio de pago a 29 €, y es lo que sale elegido', async ({ page }) => {
  await montar(page, 'MARGEN_RESERVAS', '/suscripcion');
  const aviso = page.getByRole('region', { name: 'Lo que usas' }).getByRole('alert');
  await expect(aviso).toContainText('Founding Studio de pago (29 €/mes)', { timeout: 30_000 });
  await expect(aviso).toContainText('sin límites');
  await expect(page.getByRole('radio', { name: /^Founding Studio/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: /Pasarme a Founding Studio · 29 €\/mes/ })).toBeVisible();
});

test('margen agotado: dice que la app de los clientes sigue funcionando', async ({ page }) => {
  await montar(page, 'CERRADO', '/suscripcion');
  const aviso = page.getByRole('region', { name: 'Lo que usas' }).getByRole('alert');
  await expect(aviso).toContainText('Founding Studio de pago (29 €/mes)', { timeout: 30_000 });
  await expect(aviso).toContainText('La app de tus clientes sigue funcionando');
});

test('en el panel, la píldora sale cerca del límite y en el margen; dentro, no', async ({ page }) => {
  const { montar: montarPanel, ir } = await import('./panel-sembrado');
  let fase: Fase = 'DENTRO';
  // La felicitación del margen ya vista: abierta, el diálogo deja el resto del panel fuera del árbol de accesibilidad.
  await page.addInitScript(() => localStorage.setItem('tentare:felicidades-crecimiento:2026-11-20', '1'));
  await montarPanel(page);
  await page.route('**/api/billing/status**', route => json(route, {
    plan: 'BASE', subscriptionStatus: 'gratis', activo: true, configurado: true, esPropietaria: true, bloqueado: false,
    trial: { fase: 'SIN_PRUEBA', diasRestantes: 0, finaliza: null },
    gratis: { ...GRATIS[fase], limites: { reservasMes: 150 }, margenDias: 30 },
  }));
  await ir(page, 'dashboard');
  await expect(page.getByRole('link', { name: /plan gratis/ })).toHaveCount(0);

  fase = 'MARGEN';
  await page.reload();
  const pildora = page.getByRole('link', { name: /Te quedan 12 días para pasarte a Founding Studio de pago/ }).first();
  await expect(pildora).toBeVisible({ timeout: 30_000 });
  await expect(pildora).toHaveAttribute('href', '/suscripcion');
});

test('al pasarse de un límite sale «¡Felicidades!» con el plan de pago a un clic, una sola vez', async ({ page }) => {
  const { montar: montarPanel, ir } = await import('./panel-sembrado');
  await montarPanel(page);
  let contrataciones = 0;
  await page.route('**/api/billing/status**', route => json(route, {
    plan: 'BASE', subscriptionStatus: 'gratis', activo: true, configurado: true, esPropietaria: true, bloqueado: false,
    trial: { fase: 'SIN_PRUEBA', diasRestantes: 0, finaliza: null },
    gratis: { ...GRATIS.MARGEN, limites: { reservasMes: 150 }, margenDias: 30 },
  }));
  await page.route('**/api/billing/checkout**', route => { contrataciones += 1; return json(route, { error: 'sin Stripe en el e2e' }, 500); });
  await ir(page, 'dashboard');

  const felicidades = page.getByTestId('felicidades-crecimiento');
  await expect(felicidades).toBeVisible({ timeout: 30_000 });
  await expect(felicidades).toContainText('¡Felicidades!');
  await expect(felicidades).toContainText('150 reservas al mes');
  await expect(felicidades).toContainText('29 €');
  await expect(felicidades).toContainText('hasta el 20 de noviembre');

  // Contratar es UN clic y va al pago; si el pago falla lo dice, no se queda mudo.
  await felicidades.getByTestId('felicidades-contratar').click();
  await expect.poll(() => contrataciones, { message: 'el clic no llegó a pedir el pago' }).toBeGreaterThan(0);
  await expect(felicidades.getByRole('alert')).toBeVisible();

  // «Ahora no» la cierra y no vuelve a salir al recargar.
  await felicidades.getByRole('button', { name: 'Ahora no' }).click();
  await expect(felicidades).toHaveCount(0);
  await page.reload();
  await page.waitForTimeout(2_000);
  await expect(page.getByTestId('felicidades-crecimiento')).toHaveCount(0);
});

test('vista previa del «¡Felicidades!»: se ve con cifras de ejemplo en un estudio que no ha llegado al límite, y no guarda ni cobra nada', async ({ page }) => {
  const { montar: montarPanel, ir } = await import('./panel-sembrado');
  await montarPanel(page);
  let pagos = 0;
  await page.route('**/api/billing/status**', route => json(route, {
    plan: 'CADENA', subscriptionStatus: 'active', activo: true, configurado: true, esPropietaria: true, bloqueado: false,
    trial: { fase: 'SIN_PRUEBA', diasRestantes: 0, finaliza: null }, gratis: null,
  }));
  await page.route('**/api/billing/checkout**', route => { pagos += 1; return json(route, { error: 'no debería pedirse' }, 500); });
  await ir(page, 'dashboard?vista-previa=felicidades');

  const felicidades = page.getByTestId('felicidades-crecimiento');
  await expect(felicidades).toBeVisible({ timeout: 30_000 });
  await expect(felicidades).toContainText('¡Felicidades!');
  await expect(felicidades).toContainText('Vista previa con cifras de ejemplo');

  // «Seguir creciendo» en la vista previa NO abre ningún pago: cierra.
  await felicidades.getByTestId('felicidades-contratar').click();
  await expect(felicidades).toHaveCount(0);
  expect(pagos, 'la vista previa pidió un pago').toBe(0);
  // Y no marca la felicitación como vista: la de verdad saldrá cuando toque.
  const marcas = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('tentare:felicidades-crecimiento:')));
  expect(marcas).toEqual([]);
});
