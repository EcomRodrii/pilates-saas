import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Los enlaces a Configuración aterrizan donde dicen.
//
// Hasta el 15-sep: la notificación «Canje pendiente de entregar» abría
// Recompensas, «Configurar mis salas» abría Clases, la vuelta de conectar Stripe
// abría la primera pestaña —y el aviso de «conectado» no salía nunca—, y
// recargar después de cambiar de pestaña devolvía a la primera. Nada fallaba:
// solo mandaba a otro sitio.
//
// Ese mismo día Configuración se reorganizó por preguntas, y los enlaces viejos
// (notificaciones ya enviadas, correos, callbacks de OAuth) tienen que seguir
// llegando. La traducción URL → sección está en lib/configuracion/destino.ts,
// con su test unitario que barre el repo. Esto comprueba lo que ese test no ve:
// que la página la aplica al montar, que baja a la tarjeta y que escribe la URL
// al elegir.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID, email: 'duena@example.com', moneda: 'EUR', nif: 'B00000000',
  // La motivación vive tras un PlanGate: sin plan de pago no se renderiza.
  plan: 'ESTUDIO', subscription_status: 'active',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesion(page: Page) {
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
}

async function panel(page: Page) {
  // Playwright resuelve las rutas en orden INVERSO: comodines primero.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await seedSesion(page);
}

const tituloSeccion = (page: Page, nombre: string) => page.getByRole('heading', { level: 2, name: nombre, exact: true });
const rail = (page: Page) => page.getByRole('navigation', { name: 'Secciones de Configuración' });

test.describe('Los enlaces a Configuración aterrizan donde dicen', () => {
  // Los enlaces que de verdad hay repartidos por correos, notificaciones y la
  // guía, con la sección y la tarjeta en la que tienen que caer.
  const ENLACES_VIEJOS: [string, string, string][] = [
    ['/configuracion?tab=gamificacion&sub=canjes', 'Motivación', '#canjes'],
    ['/configuracion?tab=estudio&sub=legal', 'Alta de alumnas', '#contrato-y-privacidad'],
    ['/configuracion?tab=estudio&sub=general#datos-fiscales', 'Mi estudio', '#datos-fiscales'],
    ['/configuracion?tab=salas', 'Mi estudio', '#salas'],
    ['/configuracion?tab=api&sub=crecimiento', 'Mi app y mi web', '#widgets'],
    ['/configuracion?tab=emails', 'Cómo me comunico', '#correos-automaticos'],
    ['/configuracion?tab=estudio&sub=salas', 'Mi estudio', '#salas'],
  ];

  for (const [href, seccion, tarjeta] of ENLACES_VIEJOS) {
    test(`${href} abre «${seccion}» y baja a ${tarjeta}`, async ({ page }) => {
      await panel(page);
      await page.goto(href);

      await expect(tituloSeccion(page, seccion)).toBeVisible({ timeout: 30_000 });
      await expect(rail(page).getByRole('link', { name: seccion, exact: true })).toHaveAttribute('aria-current', 'page');
      await expect(page.locator(tarjeta)).toBeInViewport({ timeout: 15_000 });
    });
  }

  test('la vuelta de conectar Stripe abre Conexiones, enseña su aviso y limpia la URL', async ({ page }) => {
    await panel(page);
    // Lo que manda /api/stripe/connect/callback al terminar. Sin `tab=`: el
    // parámetro de conexión basta para saber a dónde ir.
    await page.goto('/configuracion?stripe_connected=1');

    await expect(tituloSeccion(page, 'Conexiones')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Stripe conectado — ya puedes cobrar en tu propia cuenta')).toBeVisible();
    await expect(page.locator('#integracion-stripe')).toBeInViewport({ timeout: 15_000 });
    // El aviso se consume y la URL se queda en la sección: recargar no lo repite.
    await expect(page).toHaveURL(/\/configuracion\?tab=conexiones$/);
  });

  test('lo que ya vive fuera de Configuración redirige: Mi perfil y las tarifas', async ({ page }) => {
    await panel(page);
    await page.goto('/configuracion?tab=perfil');
    await expect(page).toHaveURL(/\/mi-perfil$/, { timeout: 30_000 });

    await page.goto('/configuracion?tab=planes');
    await expect(page).toHaveURL(/\/productos$/, { timeout: 30_000 });
  });

  test('elegir sección en la columna queda en la URL, sin llenar el historial, y recargar la mantiene', async ({ page }) => {
    await panel(page);
    await page.goto('/configuracion');

    // Sin sección en la URL, en pantalla ancha se abre la primera.
    await expect(tituloSeccion(page, 'Mi estudio')).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/configuracion$/);
    const historialAntes = await page.evaluate(() => history.length);

    await rail(page).getByRole('link', { name: 'Conexiones', exact: true }).click();
    await expect(page).toHaveURL(/\/configuracion\?tab=conexiones$/);
    await expect(tituloSeccion(page, 'Conexiones')).toBeVisible();

    await rail(page).getByRole('link', { name: 'Alta de alumnas', exact: true }).click();
    await expect(page).toHaveURL(/\/configuracion\?tab=altas$/);
    await expect(rail(page).getByRole('link', { name: 'Alta de alumnas', exact: true })).toHaveAttribute('aria-current', 'page');

    // `replace`, no `push`: dos clics en la columna no son dos pasos atrás.
    expect(await page.evaluate(() => history.length)).toBe(historialAntes);

    await page.reload();
    await expect(tituloSeccion(page, 'Alta de alumnas')).toBeVisible({ timeout: 30_000 });
    await expect(rail(page).getByRole('link', { name: 'Alta de alumnas', exact: true })).toHaveAttribute('aria-current', 'page');
  });

  test('una fila que apunta a otra sección lleva a la tarjeta de verdad', async ({ page }) => {
    await panel(page);
    await page.goto('/configuracion?tab=cobros');

    await expect(tituloSeccion(page, 'Cobros y facturas')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('link', { name: /Datos fiscales e IVA/ }).click();

    await expect(tituloSeccion(page, 'Mi estudio')).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/configuracion\?tab=estudio#datos-fiscales$/);
    await expect(page.locator('#datos-fiscales')).toBeInViewport({ timeout: 15_000 });
  });
});

test.describe('La vuelta del pago de la suscripción', () => {
  async function suscripcion(page: Page, estado: Record<string, unknown>) {
    await panel(page);
    await page.route('**/api/billing/status**', route => json(route, estado));
  }

  const ACTIVA = {
    plan: 'ESTUDIO', subscriptionStatus: 'active', activo: true, configurado: true,
    esPropietaria: true, bloqueado: false, enPrueba: false, pruebaTermina: null,
    periodoTermina: '2026-10-15T10:00:00+00:00',
  };

  test('un Checkout que volvía a Configuración llega a Suscripción y dice lo que hay', async ({ page }) => {
    await suscripcion(page, ACTIVA);
    // La success_url vieja: una sesión de Stripe abierta antes del cambio.
    await page.goto('/configuracion?suscripcion=ok');

    await expect(page).toHaveURL(/\/suscripcion$/, { timeout: 30_000 });
    await expect(page.getByText('Listo: tu suscripción está activa.')).toBeVisible({ timeout: 30_000 });
  });

  test('si el webhook aún no ha llegado, no felicita: dice que está esperando', async ({ page }) => {
    let consultas = 0;
    await suscripcion(page, {});
    await page.route('**/api/billing/status**', route => {
      consultas++;
      return json(route, { ...ACTIVA, subscriptionStatus: null, activo: false });
    });
    await page.goto('/suscripcion?suscripcion=ok');

    await expect(page.getByText(/Estamos esperando su confirmación/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Listo: tu suscripción está activa.')).toHaveCount(0);
    // Y vuelve a preguntar en vez de quedarse con la primera respuesta.
    await expect.poll(() => consultas, { timeout: 15_000 }).toBeGreaterThan(1);
  });
});
