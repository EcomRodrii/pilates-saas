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
    ['/configuracion?tab=estudio&sub=legal', 'Alta de alumnas', '#contrato-y-privacidad'],
    ['/configuracion?tab=estudio&sub=general#datos-fiscales', 'Cobros y facturas', '#datos-fiscales'],
    // Canjes, salas, widgets y correos tienen su propia pantalla desde el
    // 15-sep (v2): sus enlaces los prueba e2e/configuracion-herramientas.spec.ts.
    // Tarjetas que cambiaron de sección el 15-sep: su enlace de antes las sigue.
    // «Marca» es una sección desde el 15-sep (v2): el ancla de la tarjeta de antes lleva al logo.
    ['/configuracion?tab=estudio#marca', 'Marca', '#logo-y-favicon'],
    ['/configuracion?tab=estudio#textos-de-tu-app', 'Marca', '#textos-de-tu-app'],
    ['/configuracion?tab=conexiones#integracion-whatsapp', 'Cómo me comunico', '#integracion-whatsapp'],
    // «Exportar a Excel» se retiró: su enlace lleva a «Exportar mis datos».
    ['/configuracion?tab=conexiones#integracion-excel', 'Datos y seguridad', '#exportar'],
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

  // La vuelta de cada conexión: los cinco callbacks de OAuth y el Embedded
  // Signup de WhatsApp. Cada aviso lo pinta la sección que tiene su tarjeta; si
  // la URL llevara a otra, el aviso no saldría nunca. Con el `tab=` que
  // mandaban hasta el 15-sep, con el de hoy y sin ninguno.
  const VUELTAS: [string, string, string, string, string][] = [
    ['/configuracion?stripe_connected=1', 'Cobros y facturas', 'Stripe conectado — ya puedes cobrar en tu propia cuenta', '#integracion-stripe', 'cobros'],
    ['/configuracion?tab=integraciones&gmail_connected=1', 'Cómo me comunico', 'Gmail conectado', '#integracion-gmail', 'comunicacion'],
    ['/configuracion?tab=conexiones&google_calendar_connected=1', 'Conexiones', 'Google Calendar conectado', '#integracion-google_calendar', 'conexiones'],
    ['/configuracion?tab=integraciones&zoom_error=denegado', 'Conexiones', 'Error al conectar Zoom: denegado', '#integracion-zoom', 'conexiones'],
    // Klaviyo tiene su fila desde el 15-sep (v2): antes vivía en «Más integraciones».
    ['/configuracion?tab=conexiones&klaviyo_connected=1', 'Conexiones', 'Klaviyo conectado', '#integracion-klaviyo', 'conexiones'],
    ['/configuracion?tab=conexiones&whatsapp_connected=1', 'Cómo me comunico', 'WhatsApp conectado', '#integracion-whatsapp', 'comunicacion'],
  ];
  for (const [href, seccion, aviso, tarjeta, tab] of VUELTAS) {
    test(`la vuelta ${href} abre «${seccion}», enseña su aviso y limpia la URL`, async ({ page }) => {
      await panel(page);
      await page.goto(href);

      await expect(tituloSeccion(page, seccion)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(aviso)).toBeVisible();
      await expect(page.locator(tarjeta)).toBeInViewport({ timeout: 15_000 });
      // El aviso se consume y la URL se queda en la sección: recargar no lo repite.
      await expect(page).toHaveURL(new RegExp(`/configuracion\\?tab=${tab}$`));
      // Y limpiar la URL no cambia de sección.
      await page.waitForTimeout(500);
      await expect(tituloSeccion(page, seccion)).toBeVisible();
    });
  }

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

    // Sin sección en la URL, también en pantalla ancha se ve el inicio: ya no se
    // abre la primera sección por su cuenta.
    await expect(page.locator('#inicio-seccion-estudio')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#seccion-titulo')).toHaveCount(0);
    await expect(rail(page).getByRole('link', { name: 'Configuración', exact: true })).toHaveAttribute('aria-current', 'page');
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

  test('lo que salió de las reglas de reserva: sus enlaces viejos llevan a su sección', async ({ page }) => {
    await panel(page);
    await page.goto('/configuracion?tab=reservas#compra-desde-tu-enlace');
    await expect(tituloSeccion(page, 'Alta de alumnas')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#compra-desde-tu-enlace')).toBeInViewport({ timeout: 15_000 });

    await page.goto('/configuracion?tab=estudio&sub=reservas#ajuste-instructoras-crean-clases');
    await expect(tituloSeccion(page, 'Mi equipo')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('switch', { name: /Las instructoras pueden crear sus clases/ })).toBeFocused({ timeout: 15_000 });

    // La tarjeta única de reglas se partió en cinco: su ancla lleva a la primera.
    await page.goto('/configuracion?tab=reservas#reglas-de-reserva');
    await expect(tituloSeccion(page, 'Cómo reservan mis alumnas')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('#reservar-titulo')).toBeFocused({ timeout: 15_000 });
  });

  test('las tarjetas que ya están en su sección no dejan filas que apunten a otra', async ({ page }) => {
    await panel(page);
    await page.goto('/configuracion?tab=cobros');
    await expect(tituloSeccion(page, 'Cobros y facturas')).toBeVisible({ timeout: 30_000 });
    // Su fila, que abre su cajón aquí (15-sep, v2), no una que lleve a Mi estudio.
    await page.locator('#datos-fiscales').click({ timeout: 15_000 });
    await expect(page.getByRole('textbox', { name: 'NIF / CIF' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#integracion-stripe')).toBeAttached();
    await expect(page.getByText(/mientras terminamos de ordenarlo/)).toHaveCount(0);

    // Las dos últimas que vivían en otra sección, con su control de verdad.
    await page.goto('/configuracion?tab=altas#compra-desde-tu-enlace');
    await expect(page.getByRole('radio', { name: /Que se registre antes de pagar/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/mientras terminamos de ordenarlo/)).toHaveCount(0);
    await page.goto('/configuracion?tab=equipo');
    await expect(page.getByRole('switch', { name: /Las instructoras pueden crear sus clases/ })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/mientras terminamos de ordenarlo/)).toHaveCount(0);
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
