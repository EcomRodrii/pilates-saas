import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Clientas: cada cifra cuenta lo mismo que la lista que enseña.
//
// Origen (auditoría de cliente): "Total clientas" decía 2 con 3 filas en la
// tabla, porque la tarjeta y la tabla contaban con reglas distintas. Desde el
// estado único (`lib/clientas/estado.ts`) hay UNA cuenta: el número de cada chip,
// el de la cabecera («1 activa · 1 sin renovar») y las filas que salen al
// pulsarlo salen del mismo cálculo. Aquí se fija que sigan diciendo lo mismo.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

// Fechas en el día del estudio: la cuenta de «sin renovar» va por días.
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
const fecha = (n: number) => {
  const d = new Date(`${hoy}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const socia = (id: string, nombre: string, apellidos: string, extra: Record<string, unknown> = {}) => ({
  id, studio_id: STUDIO_ID, nombre, apellidos, email: `${id}@example.com`, telefono: null, activo: true,
  fecha_alta: '2026-01-01T09:00:00+00:00', campos_extra: {}, tags: [], lead_stage: 'ACTIVA', ...extra,
});

// Una de cada: activa (cuota vigente), interesada (ficha sin venir ni comprar),
// sin renovar (su bono acabó hace 10 días) e inactiva (acabó hace 200).
const SOCIOS = [
  socia('s1', 'Ana', 'Ruiz'),
  socia('s2', 'Bea', 'Soto', { lead_stage: 'LEAD' }),
  socia('s3', 'Carla', 'Vela'),
  socia('s4', 'Dani', 'Mora'),
];
const PLANES = [
  { id: 'pl-mensual', studio_id: STUDIO_ID, nombre: 'Mensual', precio: 89, tipo: 'MENSUAL', sesiones: null, validez_dias: null, activo: true, es_prueba: false },
  { id: 'pl-bono', studio_id: STUDIO_ID, nombre: 'Bono 10', precio: 130, tipo: 'BONO', sesiones: 10, validez_dias: 90, activo: true, es_prueba: false },
];
const cuota = (id: string, socio: string, plan: string, estado: string, ini: number, fin: number, restantes: number | null) => ({
  id, studio_id: STUDIO_ID, socio_id: socio, plan_id: plan, estado,
  fecha_inicio: fecha(ini), fecha_fin: fecha(fin), sesiones_restantes: restantes, stripe_subscription_id: null,
});
const SUSCRIPCIONES = [
  cuota('sus-1', 's1', 'pl-mensual', 'ACTIVA', -10, 20, null),
  cuota('sus-3', 's3', 'pl-bono', 'EXPIRADA', -100, -10, 0),
  cuota('sus-4', 's4', 'pl-bono', 'EXPIRADA', -300, -200, 0),
];

async function montar(page: Page) {
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
  await page.route('**/api/billing/status**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/socios**', route => json(route, SOCIOS));
  await page.route('**/rest/v1/planes_tarifa**', route => json(route, PLANES));
  await page.route('**/rest/v1/suscripciones**', route => json(route, SUSCRIPCIONES));

  await page.goto('/clientas');
}

const chip = (page: Page, estado: string) => page.locator(`[data-estado-filtro="${estado}"]`);

test.describe('Clientas: cada cifra cuenta lo mismo que su lista', () => {
  test('cada chip de estado enseña exactamente las filas que dice', async ({ page }) => {
    await montar(page);
    await expect(chip(page, 'TODAS')).toContainText('4', { timeout: 30_000 });

    const esperado: [string, number, string][] = [
      ['ACTIVA', 1, 'Ana Ruiz'],
      ['SIN_RENOVAR', 1, 'Carla Vela'],
      ['INACTIVA', 1, 'Dani Mora'],
      ['INTERESADA', 1, 'Bea Soto'],
    ];
    for (const [estado, n, quien] of esperado) {
      await expect(chip(page, estado)).toContainText(String(n));
      await chip(page, estado).click();
      await expect(chip(page, estado)).toHaveAttribute('aria-checked', 'true');
      // El pie cuenta las filas de verdad, y solo sale quien tiene ese estado.
      await expect(page.getByText(`Mostrando ${n} de ${n} (de 4) clientas`)).toBeVisible();
      // .first(): la fila de escritorio y la tarjeta móvil conviven en el DOM.
      await expect(page.getByText(quien).first()).toBeVisible();
      for (const [, , otra] of esperado.filter(([e]) => e !== estado)) {
        await expect(page.getByText(otra)).toHaveCount(0);
      }
    }

    await chip(page, 'TODAS').click();
    await expect(page.getByText('Mostrando 4 de 4 clientas')).toBeVisible();
    // Un estado sin nadie no ocupa sitio (salvo «Activa», que siempre está).
    await expect(chip(page, 'DE_PRUEBA')).toHaveCount(0);
    await expect(chip(page, 'DE_BAJA')).toHaveCount(0);
  });

  test('la cabecera dice las mismas cifras que los chips', async ({ page }) => {
    await montar(page);
    await expect(chip(page, 'TODAS')).toContainText('4', { timeout: 30_000 });
    await expect(page.getByText('1 activa · 1 sin renovar', { exact: true })).toBeVisible();
    // La pestaña «Clientas» lleva el total; «Interesadas y pruebas», a quien está entrando.
    await expect(page.getByRole('tab', { name: /^Clientas\s*4$/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /^Interesadas y pruebas\s*1$/ })).toBeVisible();
  });
});
