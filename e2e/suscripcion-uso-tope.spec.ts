import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El tope del plan («hasta 150 alumnas activas» en Base) se ENSEÑA en
// Suscripción y no bloquea (decisión del 1-oct-2026, `.claude/tentare-os.md`).
// Cuenta el chip «Activa» de Clientas, el mismo número que el Resumen: aquí,
// de tres fichas solo cuenta Ana (cuota vigente). Bea nunca ha venido ni
// comprado (Interesada) y Eva está de baja.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const dia = (n: number) => { const d = new Date(`${hoy}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const socia = (id: string, nombre: string, extra: Record<string, unknown> = {}) => ({
  id, studio_id: STUDIO_ID, nombre, apellidos: 'Prueba', email: `${id}@example.com`, telefono: null, activo: true,
  fecha_alta: `${dia(-60)}T10:00:00Z`, campos_extra: {}, tags: [], lead_stage: null, ...extra,
});
const SOCIOS = [socia('s1', 'Ana'), socia('s2', 'Bea'), socia('s3', 'Eva', { activo: false })];
const PLANES = [{ id: 'pl-m', studio_id: STUDIO_ID, nombre: 'Mensual', precio: 89, tipo: 'MENSUAL', sesiones: null, validez_dias: null, activo: true, es_prueba: false }];
const SUSCRIPCIONES = [{
  id: 'sus-1', studio_id: STUDIO_ID, socio_id: 's1', plan_id: 'pl-m', estado: 'ACTIVA',
  fecha_inicio: dia(-10), fecha_fin: dia(20), sesiones_restantes: null, stripe_subscription_id: null,
}];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, plan: string) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'duena@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/billing/status**', route => json(route, {
    plan, subscriptionStatus: 'active', activo: true, configurado: true, esPropietaria: true,
    bloqueado: false, enPrueba: false, pruebaTermina: null, periodoTermina: `${dia(15)}T10:00:00+00:00`,
  }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID, plan }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/socios**', route => json(route, SOCIOS));
  await page.route('**/rest/v1/planes_tarifa**', route => json(route, PLANES));
  await page.route('**/rest/v1/suscripciones**', route => json(route, SUSCRIPCIONES));

  await page.goto('/suscripcion');
}

test.describe('Suscripción · cuántas cuentan para el tope del plan', () => {
  test('en Base dice «1 de 150 clientas activas»: solo la Activa, no las interesadas ni las de baja', async ({ page }) => {
    await montar(page, 'BASE');
    const uso = page.locator('[data-uso-tope]');
    await expect(uso).toContainText('1 de 150 clientas activas', { timeout: 30_000 });
    await expect(uso.getByRole('link', { name: '1 de 150 clientas activas' })).toHaveAttribute('href', '/clientas?estado=ACTIVA');
    // Nada de prometer un bloqueo que no existe.
    await expect(uso).not.toContainText(/no podr|bloque/i);
  });

  test('en un plan sin tope no hay nada que contar', async ({ page }) => {
    await montar(page, 'ESTUDIO');
    await expect(page.getByText('Plan actual')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('[data-uso-tope]')).toHaveCount(0);
  });
});
