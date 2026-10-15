import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La clase suelta de una clase que YA cubre su cuota. Se le vendió la clase
// suelta de una clase y después pasó a cuota, que empieza hoy y la incluye: sin
// aviso, la clase se cobraba dos veces y el estudio iba borrando cargos a mano.
//
// La ficha lo dice. Si está pendiente, «anularla» va por el SERVIDOR
// (`/api/cobros/anular-clase-suelta`), que lo vuelve a comprobar todo; el
// navegador no toca el recibo. Si ya la pagó, solo lo cuenta: devolver el dinero
// es decisión del estudio. Los caminos de fallo llevan contador de peticiones.
// ─────────────────────────────────────────────────────────────────────────────

test.use({ timezoneId: 'Europe/Madrid' });
// La ficha es pesada de compilar en `next dev`: el primer test se lleva la compilación.
test.describe.configure({ timeout: 120_000 });

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
// El día del ESTUDIO, no el de UTC: la cuota empieza hoy en Madrid.
const ymdMadrid = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const HOY = ymdMadrid(new Date());
const enDias = (n: number) => {
  const [a, m, d] = HOY.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
};
// La clase de la clase suelta: pasado mañana a las 17:00 UTC, dentro de la cuota.
const INICIO = `${enDias(2)}T17:00:00.000Z`;

const STUDIO_ROW = { id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro', owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR' };
const SOCIO = { id: 'soc-1', studio_id: STUDIO_ID, nombre: 'Ana', apellidos: 'Gil', email: 'ana@example.com', telefono: null, activo: true, fecha_alta: `${HOY}T09:00:00+00:00`, campos_extra: {} };
const PLANES = [
  { id: 'plan-cuota', studio_id: STUDIO_ID, nombre: '2 días Semana Mensual', descripcion: null, precio: 115, tipo: 'MENSUAL', sesiones: null, validez_dias: null, limite_semanal: null, periodicidad_meses: 1, matricula: 0, activo: true },
  { id: 'plan-suelta', studio_id: STUDIO_ID, nombre: 'Clase Suelta', descripcion: null, precio: 23, tipo: 'PUNTUAL', sesiones: 1, validez_dias: 30, limite_semanal: null, periodicidad_meses: null, matricula: 0, activo: true },
];
const SUSCRIPCIONES = [
  { id: 'sus-cuota', studio_id: STUDIO_ID, socio_id: 'soc-1', plan_id: 'plan-cuota', estado: 'ACTIVA', fecha_inicio: HOY, fecha_fin: enDias(31), sesiones_restantes: null, stripe_subscription_id: null },
  { id: 'sus-suelta-res-1', studio_id: STUDIO_ID, socio_id: 'soc-1', plan_id: 'plan-suelta', estado: 'ACTIVA', fecha_inicio: HOY, fecha_fin: null, sesiones_restantes: 0, stripe_subscription_id: null },
];
const SESIONES = [{
  id: 'ses-1', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'ins-1',
  inicio: INICIO, fin: new Date(Date.parse(INICIO) + 55 * 60_000).toISOString(), aforo_maximo: 8, cancelada: false, notas: null,
}];
const RESERVAS = [{
  id: 'res-1', studio_id: STUDIO_ID, sesion_id: 'ses-1', socio_id: 'soc-1', estado: 'CONFIRMADA', spot_id: null,
  posicion_espera: null, creado_en: `${HOY}T08:00:00+00:00`, bono_suscripcion_id: 'sus-suelta-res-1',
}];
const reciboSuelta = (o: Record<string, unknown> = {}) => ({
  id: 'rec-suelta-res-1', studio_id: STUDIO_ID, socio_id: 'soc-1', suscripcion_id: 'sus-suelta-res-1', concepto: 'Clase suelta — Reformer',
  importe: 23, estado: 'PENDIENTE', fecha_vencimiento: HOY, fecha_cobro: null, fecha_devolucion: null, intentos_reintento: 0, ...o,
});
const RECIBO_CUOTA = {
  id: 'rec-cuota', studio_id: STUDIO_ID, socio_id: 'soc-1', suscripcion_id: 'sus-cuota', concepto: '2 días Semana Mensual',
  importe: 115, estado: 'PENDIENTE', fecha_vencimiento: HOY, fecha_cobro: null, fecha_devolucion: null, intentos_reintento: 0,
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, opts: { suelta?: Record<string, unknown>; anular?: { status: number; body: unknown } } = {}) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh', expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'cloe@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  const anulaciones: Record<string, unknown>[] = [];
  const escriturasRecibos: string[] = [];
  let anulado = false;

  // OJO con el orden: Playwright resuelve en orden INVERSO al de registro.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/api/layout**', route => json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route => json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/socios**', route => json(route, [SOCIO]));
  await page.route('**/rest/v1/planes_tarifa**', route => json(route, PLANES));
  await page.route('**/rest/v1/suscripciones**', route => json(route, SUSCRIPCIONES));
  await page.route('**/rest/v1/sesiones**', route => json(route, SESIONES));
  await page.route('**/rest/v1/reservas**', route => json(route, RESERVAS));
  await page.route('**/rest/v1/recibos**', route => {
    // El navegador no escribe el recibo: lo anula el servidor.
    if (route.request().method() !== 'GET') { escriturasRecibos.push(route.request().method()); return json(route, []); }
    return json(route, [anulado ? reciboSuelta({ estado: 'ANULADO' }) : reciboSuelta(opts.suelta), RECIBO_CUOTA]);
  });
  await page.route('**/api/cobros/anular-clase-suelta', route => {
    anulaciones.push(route.request().postDataJSON() as Record<string, unknown>);
    const r = opts.anular ?? { status: 200, body: { ok: true } };
    if (r.status === 200) anulado = true;
    return json(route, r.body, r.status);
  });

  await page.goto('/clientas/soc-1');
  await expect(page.getByText('Ana Gil').first()).toBeVisible({ timeout: 30_000 });
  return { anulaciones, escriturasRecibos };
}

test('pendiente: la ficha lo dice, y «Anular la clase suelta» la anula por el servidor; el aviso se va', async ({ page }) => {
  const { anulaciones, escriturasRecibos } = await montar(page);
  const aviso = page.getByText(/Su cuota ya cubre la clase del .* y tiene pendiente su clase suelta de 23,00\s€ · anularla/);
  await expect(aviso).toBeVisible({ timeout: 30_000 });
  await aviso.click();

  const dialogo = page.getByRole('dialog').filter({ hasText: '¿Anular la clase suelta?' });
  await expect(dialogo).toContainText('ya entra en su cuota «2 días Semana Mensual»');
  await expect(dialogo).toContainText('Se anula el recibo de 23,00');
  expect(anulaciones).toHaveLength(0);

  await dialogo.getByRole('button', { name: 'Anular la clase suelta' }).click();
  await expect(page.getByText(/Clase suelta anulada: no se le cobrarán 23,00\s€/)).toBeVisible({ timeout: 30_000 });
  expect(anulaciones).toEqual([{ reciboId: 'rec-suelta-res-1' }]);
  expect(escriturasRecibos).toEqual([]);
  // Con el recibo ya anulado (lo que relee la ficha), no queda nada que avisar.
  await expect(aviso).toHaveCount(0);
});

test('si el servidor dice que no, se enseña su motivo y no se da por anulada', async ({ page }) => {
  const { anulaciones } = await montar(page, {
    anular: { status: 409, body: { error: 'Esa clase suelta ya no está pendiente: alguien la ha cobrado o ha empezado a cobrarla. Revísala en Cobros.', motivo: 'NO_PENDIENTE' } },
  });
  await page.getByText(/tiene pendiente su clase suelta de 23,00\s€ · anularla/).click({ timeout: 30_000 });
  const dialogo = page.getByRole('dialog').filter({ hasText: '¿Anular la clase suelta?' });
  await dialogo.getByRole('button', { name: 'Anular la clase suelta' }).click();

  await expect(page.getByText(/ya no está pendiente: alguien la ha cobrado/)).toBeVisible({ timeout: 30_000 });
  // El intento SALIÓ: sin esto el test sería hueco.
  expect(anulaciones.length).toBeGreaterThan(0);
  await expect(page.getByText(/Clase suelta anulada/)).toHaveCount(0);
  await expect(dialogo).toBeVisible();
});

test('ya pagada: solo se cuenta (devolver es decisión del estudio), sin anular nada', async ({ page }) => {
  const { anulaciones, escriturasRecibos } = await montar(page, { suelta: { estado: 'COBRADO', fecha_cobro: HOY, metodo_cobro: 'EFECTIVO' } });
  const aviso = page.getByText(/Pagó 23,00\s€ por la clase suelta del .*, que ya cubre su cuota · si se los devuelves, márcalo en Pagos/);
  await expect(aviso).toBeVisible({ timeout: 30_000 });
  await aviso.click();
  await expect(page.getByRole('dialog').filter({ hasText: '¿Anular la clase suelta?' })).toHaveCount(0);
  expect(anulaciones).toHaveLength(0);
  expect(escriturasRecibos).toEqual([]);
});
