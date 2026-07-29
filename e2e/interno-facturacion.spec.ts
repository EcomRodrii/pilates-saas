import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El panel de fundador enseñaba un MRR que no era dinero.
//
// Lo sumaba del PRECIO DE LISTA de los estudios con `stripe_customer_id` +
// `subscription_status = 'active'`, sin preguntarle nunca a Stripe. Tres
// consecuencias, y las tres se fijan aquí:
//
//   · un customer no es una suscripción (se crea al abrir el Checkout, aunque
//     no se pague) → dinero contado que nadie cobra;
//   · una cadena factura en `cadenas` y sus sedes heredan `active` sin customer
//     → una cadena que pague sale como N «accesos a mano» y 0 € de MRR;
//   · si Stripe no contesta, un 0 € se lee como «no cobras nada», que es una
//     afirmación que el panel no puede hacer.
//
// La lógica de cruce está en `lib/interno/facturacion-real.test.ts`. Aquí se
// comprueba lo único que la dueña del producto ve: qué pone en pantalla.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sb-example-auth-token';
const UID = 'auth-e2e-founder';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesion(page: Page) {
  await page.addInitScript(([key, id]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id, email: 'marco@tentare.app', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, UID] as const);
}

const linea = (o: Record<string, unknown>) => ({
  tipo: 'estudio', sedes: 1, planEnBd: 'ESTUDIO', estadoEnBd: 'active',
  eurosMes: 0, renuevaEl: null, diasDePrueba: null,
  stripeCustomerId: null, motivoDescuadre: null, ...o,
});

async function mockPanel(page: Page, facturacion: Record<string, unknown>) {
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/api/interno/sesion**', route =>
    json(route, { nombre: 'Marco', cargo: 'Fundador', email: 'marco@tentare.app', permisos: ['admin.full'] }));
  await page.route('**/api/interno/facturacion**', route =>
    json(route, {
      lineas: [], mrrEuros: 0, mrrEnPruebaEuros: 0,
      pagando: 0, enPrueba: 0, impagos: 0, manuales: 0, descuadres: 0,
      pruebasQueAcaban: [], stripeDisponible: true, avisoStripe: null,
      suscripcionesEnStripe: 0, ...facturacion,
    }));
}

test.describe('El panel de fundador no inventa dinero', () => {
  test('el MRR que enseña es el que cobra Stripe, no la tarifa de lista', async ({ page }) => {
    // Plan ESTUDIO en la base, pero Stripe le cobra 49 € (precio heredado).
    await mockPanel(page, {
      mrrEuros: 49, pagando: 1, suscripcionesEnStripe: 1,
      lineas: [linea({ id: 'e1', nombre: 'Pilates Gràcia', estado: 'pagando', eurosMes: 49 })],
    });
    await seedSesion(page);
    await page.goto('/interno/facturacion');

    await expect(page.getByText('MRR real')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('49 €').first()).toBeVisible();
    await expect(page.getByText(/1 suscripción\(es\) cobrando de verdad/)).toBeVisible();
  });

  test('una cadena aparece UNA vez, con sus sedes, no una línea por sede', async ({ page }) => {
    await mockPanel(page, {
      mrrEuros: 149, pagando: 1, suscripcionesEnStripe: 1,
      lineas: [linea({
        tipo: 'cadena', id: 'c1', nombre: 'Pilates Boutique', sedes: 4,
        estado: 'pagando', eurosMes: 149, planEnBd: 'CADENA',
      })],
    });
    await seedSesion(page);
    await page.goto('/interno/facturacion');

    await expect(page.getByText('Pilates Boutique')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('cadena · 4 sede(s)')).toBeVisible();
    await expect(page.getByText('149 €').first()).toBeVisible();
  });

  test('un customer sin suscripción sale como descuadre, no como cliente', async ({ page }) => {
    await mockPanel(page, {
      descuadres: 1,
      lineas: [linea({
        id: 'e1', nombre: 'Estudio Sant Cugat', estado: 'descuadre',
        stripeCustomerId: 'cus_1',
        motivoDescuadre: 'Tiene cliente en Stripe pero ninguna suscripción viva',
      })],
    });
    await seedSesion(page);
    await page.goto('/interno/facturacion');

    await expect(page.getByText('1 cuenta(s) no cuadran')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/ninguna suscripción viva/)).toBeVisible();
    // Y no se ha colado en el MRR.
    await expect(page.getByText(/suscripción\(es\) cobrando de verdad/)).toHaveCount(0);
  });

  test('las pruebas que caducan esta semana salen arriba, con los días que quedan', async ({ page }) => {
    await mockPanel(page, {
      enPrueba: 1, mrrEnPruebaEuros: 79,
      lineas: [linea({ id: 'e1', nombre: 'Estudio Sants', estado: 'en_prueba', eurosMes: 79, diasDePrueba: 2 })],
      pruebasQueAcaban: [linea({ id: 'e1', nombre: 'Estudio Sants', estado: 'en_prueba', eurosMes: 79, diasDePrueba: 2 })],
    });
    await seedSesion(page);
    await page.goto('/interno/facturacion');

    await expect(page.getByText('1 prueba(s) acaban esta semana')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/quedan 2 día\(s\)/)).toBeVisible();
    // Una prueba no es MRR: la tarjeta de MRR sigue a cero y lo explica.
    await expect(page.getByText(/Ninguna suscripción activa en Stripe/)).toBeVisible();
  });

  test('si Stripe no contesta se dice, no se enseña 0 €', async ({ page }) => {
    // El caso más importante de todos: 0 € se lee como «no cobras nada», y eso
    // el panel no lo sabe. Tiene que decir que no ha podido preguntar.
    await mockPanel(page, {
      stripeDisponible: false,
      avisoStripe: 'STRIPE_SECRET_KEY no está configurada en este entorno',
      lineas: [linea({ id: 'e1', nombre: 'Pilates Gràcia', estado: 'descuadre', motivoDescuadre: 'Tiene acceso en la base y no hay nada en Stripe' })],
    });
    await seedSesion(page);
    await page.goto('/interno/facturacion');

    await expect(page.getByText('Estos números no vienen de Stripe')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/STRIPE_SECRET_KEY no está configurada/)).toBeVisible();
    await expect(page.getByText('0 €')).toHaveCount(0);
  });
});
