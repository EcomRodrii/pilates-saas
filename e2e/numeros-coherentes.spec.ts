import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// P2-3. "Números que se contradicen entre pantallas. […] Si dos pantallas me dan
// cifras distintas, dejo de fiarme de las dos."
//
// Dos problemas distintos, y ninguno era un cálculo mal hecho:
//
//   · "Media por cliente" (Cobros) y "Ticket medio / cliente" (Informes) medían
//     cosas DISTINTAS con nombres casi idénticos: la primera reparte lo cobrado
//     entre TODAS las clientas activas, la segunda solo entre quienes pagaron.
//     Con 850 clientas y 65 pagadoras, 10 € y 130 € son las dos correctas.
//
//   · "30d sin venir" (Resumen) y el filtro «Sin venir en 30 días» de Clientas
//     sí eran una inconsistencia REAL: cada pantalla lo contaba con su regla. La
//     tarjeta enlaza a ese filtro, así que enseñaba un número y te llevaba a
//     otro. Ahora las dos usan la misma (`sinVenir`, lib/clientas/estado.ts).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

// La RPC antigua (`stats_clientas`) devuelve OTRO número a propósito: si alguna
// pantalla volviera a leerla, esta prueba lo vería.
const STATS = { total: 20, activas: 12, con_bono: 5, inactivas_30d: 99 };

// Fechas en el día del estudio.
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const haceDias = (n: number, h = 10) => {
  const d = new Date(`${hoy}T${String(h).padStart(2, '0')}:00:00+02:00`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString();
};
const socia = (id: string, nombre: string, extra: Record<string, unknown> = {}) => ({
  id, studio_id: STUDIO_ID, nombre, apellidos: 'Prueba', email: `${id}@example.com`, telefono: null, activo: true,
  fecha_alta: haceDias(300), campos_extra: {}, tags: [], lead_stage: 'ACTIVA', ...extra,
});
// Sin venir en 30 días: Bea (vino hace 45), Carla (paga y nunca ha venido) y
// Eva (de baja; vino hace 200). NO: Ana (vino hace 5) ni Dani (interesada).
const SOCIOS = [
  socia('s1', 'Ana'), socia('s2', 'Bea'), socia('s3', 'Carla'),
  socia('s4', 'Dani', { lead_stage: 'LEAD' }), socia('s5', 'Eva', { activo: false }),
];
const SESIONES = [5, 45, 200].map(d => ({
  id: `ses-${d}`, studio_id: STUDIO_ID, tipo_clase_id: null, sala_id: null, instructor_id: null,
  inicio: haceDias(d), fin: haceDias(d, 11), aforo_maximo: 8, cancelada: false, notas: null,
}));
const RESERVAS = [['s1', 5], ['s2', 45], ['s5', 200]].map(([socio, d]) => ({
  id: `r-${socio}`, studio_id: STUDIO_ID, sesion_id: `ses-${d}`, socio_id: socio, estado: 'ASISTIDA',
  spot_id: null, posicion_espera: null, creado_en: haceDias(Number(d) + 3),
}));
const PLANES = [{ id: 'pl-m', studio_id: STUDIO_ID, nombre: 'Mensual', precio: 89, tipo: 'MENSUAL', sesiones: null, validez_dias: null, activo: true, es_prueba: false }];
const SUSCRIPCIONES = [{
  id: 'sus-3', studio_id: STUDIO_ID, socio_id: 's3', plan_id: 'pl-m', estado: 'ACTIVA',
  fecha_inicio: haceDias(40).slice(0, 10), fecha_fin: haceDias(-20).slice(0, 10), sesiones_restantes: null, stripe_subscription_id: null,
}];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, ruta: string) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'duena@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/billing/status**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE' }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/rpc/stats_clientas', route => json(route, [STATS]));
  await page.route('**/rest/v1/socios**', route => json(route, SOCIOS));
  await page.route('**/rest/v1/sesiones**', route => json(route, SESIONES));
  await page.route('**/rest/v1/reservas**', route => json(route, RESERVAS));
  await page.route('**/rest/v1/planes_tarifa**', route => json(route, PLANES));
  await page.route('**/rest/v1/suscripciones**', route => json(route, SUSCRIPCIONES));

  await page.goto(ruta);
}

test.describe('Los números dicen lo mismo entre pantallas', () => {
  test('"Sin venir 30d" es el mismo en Resumen y en el filtro de Clientas al que lleva', async ({ page }) => {
    await montar(page, '/dashboard');
    const enResumen = page.getByRole('link', { name: /Sin venir 30d/ });
    await expect(enResumen).toBeVisible({ timeout: 30_000 });
    await expect(enResumen).toContainText('3', { timeout: 30_000 });
    await expect(enResumen).not.toContainText('99');
    await expect(enResumen).toHaveAttribute('href', '/clientas?mas=sin_venir_30d');

    // La tarjeta lleva al filtro: las filas de destino tienen que ser las mismas 3.
    await enResumen.click();
    await expect(page).toHaveURL(/\/clientas\?mas=sin_venir_30d$/);
    await expect(page.getByText('Mostrando 3 de 3 (de 5) clientas')).toBeVisible({ timeout: 30_000 });
    for (const quien of ['Bea Prueba', 'Carla Prueba', 'Eva Prueba']) await expect(page.getByText(quien).first()).toBeVisible();
    for (const quien of ['Ana Prueba', 'Dani Prueba']) await expect(page.getByText(quien)).toHaveCount(0);
  });

  test('"Clientas activas" de Resumen es el chip «Activa» de Clientas', async ({ page }) => {
    await montar(page, '/dashboard');
    // Ana (vino hace 5 días) y Carla (cuota vigente): 2. Antes contaba «no está
    // de baja» (4) y la pantalla de Clientas decía otra cosa.
    const kpi = page.locator('[data-slot="card"]').filter({ hasText: 'Clientas activas' });
    await expect(kpi.getByText('2', { exact: true })).toBeVisible({ timeout: 30_000 });
    await montar(page, '/clientas');
    await expect(page.locator('[data-estado-filtro="ACTIVA"]')).toContainText('2', { timeout: 30_000 });
  });

  test('"Clientas activas" de Informes es el mismo número, y la «Tasa retención» de antes ya no está', async ({ page }) => {
    // Informes contaba «no está de baja» con la RPC antigua (aquí sembrada con
    // 12 activas de 20, a propósito): una tercera cifra para lo mismo.
    await montar(page, '/informes');
    const activas = page.locator('a[href="/clientas?estado=ACTIVA"]');
    await expect(activas).toHaveText('2', { timeout: 30_000 });
    await expect(page.getByText('Tasa retención')).toHaveCount(0);
    await expect(page.getByText(/\d+ activas de \d+/)).toHaveCount(0);
    // Y la tabla de cohortes cuenta por cuando EMPEZARON, no por la fecha de alta.
    await expect(page.getByRole('heading', { name: 'Cuántas siguen viniendo, por mes en que empezaron' })).toBeVisible();
  });

  test('las dos medias de dinero ya no se llaman igual', async ({ page }) => {
    // Cobros ya no enseña ninguna media (rediseño del 2-oct-2026, decisión 3: el
    // «Ingreso medio por clienta» vuelve con Informes). La pantalla cargó de verdad.
    await montar(page, '/cobros');
    await expect(page.getByTestId('linea-resumen-cobros')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Ingreso medio por clienta')).toHaveCount(0);
    // El nombre que se confundía con el de Informes ya no está.
    await expect(page.getByText('Media por cliente')).toHaveCount(0);

    // En Informes vuelve con su nombre entero y su base (rediseño de Informes, 2-oct-2026).
    await montar(page, '/informes');
    await expect(page.getByText('Ingreso medio por clienta que pagó')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('informe-ingreso-medio')).toContainText(/no cuenta las ventas de caja sin clienta|Ninguna clienta ha pagado/);
    await expect(page.getByText('Ticket medio / cliente')).toHaveCount(0);
    await expect(page.getByText('Ticket medio de quien pagó')).toHaveCount(0);
  });
});
