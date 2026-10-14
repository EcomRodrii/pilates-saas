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
  DENTRO: { fase: 'DENTRO', uso: { alumnasActivas: 42, reservas30Dias: 96 }, planQueToca: null, motivos: [], diasRestantes: 0, cierraEl: null },
  CERCA: { fase: 'CERCA', uso: { alumnasActivas: 128, reservas30Dias: 96 }, planQueToca: null, motivos: ['alumnas'], diasRestantes: 0, cierraEl: null },
  MARGEN: { fase: 'MARGEN', uso: { alumnasActivas: 152, reservas30Dias: 251 }, planQueToca: 'ESTUDIO', motivos: ['alumnas', 'reservas'], diasRestantes: 12, cierraEl: '2026-11-20' },
  MARGEN_RESERVAS: { fase: 'MARGEN', uso: { alumnasActivas: 90, reservas30Dias: 310 }, planQueToca: 'BASE', motivos: ['reservas'], diasRestantes: 20, cierraEl: '2026-11-28' },
  CERRADO: { fase: 'CERRADO', uso: { alumnasActivas: 160, reservas30Dias: 120 }, planQueToca: 'ESTUDIO', motivos: ['alumnas'], diasRestantes: 0, cierraEl: '2026-10-10' },
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
    gratis: { ...GRATIS[fase], limites: { alumnas: 150, reservasMes: 250 }, margenDias: 30 },
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
  await expect(uso.getByRole('meter', { name: 'Alumnas activas' })).toHaveAttribute('aria-valuenow', '42');
  await expect(uso.getByRole('meter', { name: 'Alumnas activas' })).toHaveAttribute('aria-valuemax', '150');
  await expect(uso.getByRole('meter', { name: 'Reservas en los últimos 30 días' })).toHaveAttribute('aria-valuenow', '96');
  await expect(uso.getByRole('meter', { name: 'Reservas en los últimos 30 días' })).toHaveAttribute('aria-valuemax', '250');
  await expect(uso).toContainText('Te corresponde Founding Studio: gratis');

  // Dentro del límite no hay nada que pagar: se ofrece crecer a Estudio o Cadena.
  await expect(page.getByRole('radio', { name: /Estudio/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('radio', { name: /Founding Studio/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Pasarme a Estudio · 59 €\/mes/ })).toBeVisible();
  await expect(page.getByText('29€')).toHaveCount(0);
});

test('pasado un límite: cuántos días quedan, hasta cuándo, y qué pasa si vuelve a bajar', async ({ page }) => {
  await montar(page, 'MARGEN', '/suscripcion');
  const aviso = page.getByRole('region', { name: 'Lo que usas' }).getByRole('alert');
  await expect(aviso).toContainText('Te quedan 12 días en Founding Studio', { timeout: 30_000 });
  await expect(aviso).toContainText('150 alumnas activas y 250 reservas al mes');
  await expect(aviso).toContainText('hasta el 20 de noviembre');
  await expect(aviso).toContainText('Si antes vuelves a estar por debajo, no tienes que hacer nada');
  await expect(aviso).toContainText('Estudio (59 €/mes)');
  // Con más de 150 alumnas, Founding Studio de pago no se ofrece.
  await expect(page.getByRole('radio', { name: /Founding Studio/ })).toHaveCount(0);
});

test('pasado solo de reservas: toca Founding Studio de pago a 29 €, y es lo que sale elegido', async ({ page }) => {
  await montar(page, 'MARGEN_RESERVAS', '/suscripcion');
  const aviso = page.getByRole('region', { name: 'Lo que usas' }).getByRole('alert');
  await expect(aviso).toContainText('Founding Studio de pago (29 €/mes)', { timeout: 30_000 });
  await expect(aviso).toContainText('sin límite de reservas');
  await expect(page.getByRole('radio', { name: /Founding Studio/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: /Pasarme a Founding Studio · 29 €\/mes/ })).toBeVisible();
});

test('margen agotado: dice que la app de las alumnas sigue funcionando', async ({ page }) => {
  await montar(page, 'CERRADO', '/suscripcion');
  const aviso = page.getByRole('region', { name: 'Lo que usas' }).getByRole('alert');
  await expect(aviso).toContainText('es hora de Estudio', { timeout: 30_000 });
  await expect(aviso).toContainText('La app de tus alumnas sigue funcionando');
});

test('en el panel, la píldora sale cerca del límite y en el margen; dentro, no', async ({ page }) => {
  const { montar: montarPanel, ir } = await import('./panel-sembrado');
  let fase: Fase = 'DENTRO';
  await montarPanel(page);
  await page.route('**/api/billing/status**', route => json(route, {
    plan: 'BASE', subscriptionStatus: 'gratis', activo: true, configurado: true, esPropietaria: true, bloqueado: false,
    trial: { fase: 'SIN_PRUEBA', diasRestantes: 0, finaliza: null },
    gratis: { ...GRATIS[fase], limites: { alumnas: 150, reservasMes: 250 }, margenDias: 30 },
  }));
  await ir(page, 'dashboard');
  await expect(page.getByRole('link', { name: /plan gratis/ })).toHaveCount(0);

  fase = 'MARGEN';
  await page.reload();
  const pildora = page.getByRole('link', { name: /Te quedan 12 días para pasarte a Estudio/ }).first();
  await expect(pildora).toBeVisible({ timeout: 30_000 });
  await expect(pildora).toHaveAttribute('href', '/suscripcion');
});
