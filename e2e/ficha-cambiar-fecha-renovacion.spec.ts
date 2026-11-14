import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Ficha de la clienta → su cuota mensual → «Cambiar fecha» (lib/cobros/fecha-renovacion-reglas.ts).
//
// La fecha en que una cuota se renueva era la del alta más un mes y no había forma de moverla: un estudio que cobra a mano y quiere
// todas el día 1 (o que cobró «hasta el 30» un primer mes parcial) se encontraba con cuotas que acababan el 9 o el 13. Ahora quien cobra
// la mueve desde la ficha. `fecha_fin` es el ÚLTIMO día cubierto y la renovación es el día siguiente: la pantalla enseña las dos.
//
// El cambio lo escribe el navegador (RLS de `suscripciones`, igual que «baja programada»), así que el contador son los PATCH que salen.
// La pantalla cambia SOLO con lo que contesta el servidor: si dice que no, la fecha se queda como estaba.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
test.describe.configure({ timeout: 120_000 });

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const ymdMadrid = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const HOY = ymdMadrid(new Date());
const enDias = (n: number) => {
  const [a, m, d] = HOY.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
};
const FIN_DE_ESTE_MES = (() => { const [a, m] = HOY.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); })();

const STUDIO_ROW = { id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro', owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR' };
const SOCIO = { id: 'soc-1', studio_id: STUDIO_ID, nombre: 'Ana', apellidos: 'Gil', email: 'ana@example.com', telefono: null, activo: true, fecha_alta: `${HOY}T09:00:00+00:00`, campos_extra: {} };
const PLANES = [{ id: 'plan-cuota', studio_id: STUDIO_ID, nombre: 'Cuota mensual', descripcion: null, precio: 45, tipo: 'MENSUAL', sesiones: null, validez_dias: null, limite_semanal: 2, periodicidad_meses: 1, matricula: 0, activo: true }];
const cuota = (o: Record<string, unknown> = {}) => ({
  id: 'sus-cuota', studio_id: STUDIO_ID, socio_id: 'soc-1', plan_id: 'plan-cuota', estado: 'ACTIVA', fecha_inicio: HOY, fecha_fin: enDias(25),
  sesiones_restantes: null, stripe_subscription_id: null, ...o,
});

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function montar(page: Page, opts: { suscripcion?: Record<string, unknown>; patch?: { status: number; body: unknown } } = {}) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh', expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'cloe@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
  const patches: Record<string, unknown>[] = [];
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/api/layout**', route => json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route => json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/socios**', route => json(route, [SOCIO]));
  await page.route('**/rest/v1/planes_tarifa**', route => json(route, PLANES));
  await page.route('**/rest/v1/suscripciones**', route => {
    if (route.request().method() === 'PATCH') {
      patches.push(route.request().postDataJSON() as Record<string, unknown>);
      const r = opts.patch ?? { status: 204, body: [] };
      return r.status === 204 ? route.fulfill({ status: 204 }) : json(route, r.body, r.status);
    }
    return json(route, [cuota(opts.suscripcion)]);
  });
  await page.goto('/clientas/soc-1');
  await expect(page.getByText('Ana Gil').first()).toBeVisible({ timeout: 60_000 });
  return { patches };
}

test('la ficha enseña cuándo se renueva y «Cambiar fecha» la mueve; la pantalla cambia tras guardar', async ({ page }) => {
  const { patches } = await montar(page);
  await expect(page.getByText(/Cubierta hasta el/)).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('cambiar-fecha-renovacion').click();

  const dialogo = page.getByTestId('dialogo-fecha-renovacion');
  await expect(dialogo).toContainText('último día cubierto');
  // El atajo rellena el último día del mes; el diálogo dice qué día se le generará el cobro (el siguiente).
  await dialogo.getByRole('button', { name: /^Fin de este mes/ }).click();
  await expect(dialogo.getByTestId('fecha-renovacion-nueva')).toHaveValue(FIN_DE_ESTE_MES);
  await expect(dialogo).toContainText('Se le generará el cobro el');
  expect(patches, 'no se escribe nada hasta guardar').toHaveLength(0);

  await dialogo.getByTestId('guardar-fecha-renovacion').click();
  await expect(page.getByText(/La cuota se renueva el/)).toBeVisible({ timeout: 15_000 });
  expect(patches).toEqual([{ fecha_fin: FIN_DE_ESTE_MES }]);
  await expect(dialogo).toHaveCount(0);
});

test('una fecha anterior a hoy se rechaza con su motivo y no se escribe nada', async ({ page }) => {
  const { patches } = await montar(page);
  await page.getByTestId('cambiar-fecha-renovacion').click({ timeout: 30_000 });
  await page.getByTestId('fecha-renovacion-nueva').fill(enDias(-3));
  await page.getByTestId('guardar-fecha-renovacion').click();
  await expect(page.getByTestId('error-fecha-renovacion')).toContainText('anterior a hoy');
  expect(patches, 'se rechaza antes de escribir: aquí la ausencia de escrituras ES lo correcto').toHaveLength(0);
});

test('si la base de datos dice que no, lo dice y la fecha se queda como estaba', async ({ page }) => {
  const { patches } = await montar(page, { patch: { status: 403, body: { message: 'no permitido' } } });
  await page.getByTestId('cambiar-fecha-renovacion').click({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Fin del mes que viene/ }).click();
  await page.getByTestId('guardar-fecha-renovacion').click();
  await expect(page.getByTestId('error-fecha-renovacion')).toBeVisible({ timeout: 15_000 });
  expect(patches.length, 'tiene que haberlo intentado').toBeGreaterThan(0);
  await expect(page.getByText(/La cuota se renueva el/)).toHaveCount(0);
  await expect(page.getByTestId('dialogo-fecha-renovacion')).toBeVisible();
});

test('una cuota que cobra Stripe no ofrece mover la fecha: la marca Stripe', async ({ page }) => {
  await montar(page, { suscripcion: { stripe_subscription_id: 'sub_123' } });
  await expect(page.getByText(/Cubierta hasta el/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('cambiar-fecha-renovacion')).toHaveCount(0);
});
