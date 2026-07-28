import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Una instructora veía la cuenta de resultados del negocio al abrir el panel.
//
// El panel de inicio pintaba "Ingresos cobrados este mes", su gráfica de seis
// meses, la comparativa con el mes pasado y la lista de pagos pendientes — sin
// mirar el rol ni una sola vez. En una cadena con 18 instructoras eso es la
// facturación del estudio repartida a 18 personas sin que nadie lo decidiera.
//
// `CifraPrivada` no servía: es un difuminado contra miradas de reojo, lo activa
// y desactiva quien mira, y no es un permiso.
//
// La otra mitad del arreglo está en la migración 0114 (la RLS deja de servirle
// los recibos). Aquí se fija lo que se ve en pantalla, que es lo que la dueña
// puede comprobar: con la RLS cerrada y la UI sin tocar, la tarjeta seguiría
// ahí enseñando "0 €" — más falso todavía.
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const UID_DUENA = 'auth-e2e-duena';
const UID_INSTRUCTORA = 'auth-e2e-instructora';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: UID_DUENA, email: 'cloe@example.com', moneda: 'EUR',
};

const EQUIPO = [
  { id: 'ins-cloe', studio_id: STUDIO_ID, nombre: 'Cloe', activo: true, rol: 'PROPIETARIO',
    color: '#F7A6C4', auth_user_id: UID_DUENA },
  { id: 'ins-marta', studio_id: STUDIO_ID, nombre: 'Marta Sanz', activo: true, rol: 'INSTRUCTOR',
    color: '#F7A6C4', auth_user_id: UID_INSTRUCTORA },
];

// Un recibo cobrado con un importe reconocible: si el número aparece en
// pantalla, es que se le está enseñando la caja.
const IMPORTE = 1234;
const RECIBOS = [
  {
    id: 'rec-1', studio_id: STUDIO_ID, socio_id: 'soc-1', suscripcion_id: null,
    concepto: 'Bono 10', importe: IMPORTE, estado: 'COBRADO',
    fecha_vencimiento: '2026-07-01', fecha_cobro: '2026-07-02T10:00:00+00:00',
    fecha_devolucion: null, intentos_reintento: 0, metodo_cobro: 'TARJETA',
  },
];

const SOCIO = {
  id: 'soc-1', studio_id: STUDIO_ID, nombre: 'Ana', apellidos: 'Gil',
  email: 'ana@example.com', activo: true, fecha_alta: '2026-01-10T09:00:00+00:00',
  campos_extra: {},
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesion(page: Page, uid: string, email: string) {
  await page.addInitScript(([key, id, mail]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id, email: mail, aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, uid, email] as const);
}

/**
 * `verRecibos` imita lo que hace la RLS de la 0114: al personal que no lleva la
 * caja, PostgREST le devuelve una lista vacía en vez de un error. Así el test
 * comprueba las dos mitades a la vez — que la RLS no se los sirve y que la UI
 * tampoco deja un hueco con un 0 € falso.
 */
async function mockBackend(page: Page, opts: { verRecibos: boolean }) {
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/instructores**', route => json(route, EQUIPO));
  await page.route('**/rest/v1/socios**', route => json(route, [SOCIO]));
  await page.route('**/rest/v1/recibos**', route => json(route, opts.verRecibos ? RECIBOS : []));
}

test.describe('Quien no lleva la caja no ve la caja', () => {
  test('la dueña sí ve sus ingresos del mes', async ({ page }) => {
    // El control: sin esto, un test que solo comprueba ausencias pasaría
    // igualmente si la tarjeta hubiera desaparecido para todo el mundo.
    await mockBackend(page, { verRecibos: true });
    await seedSesion(page, UID_DUENA, 'cloe@example.com');
    await page.goto('/dashboard');

    await expect(page.getByText('Ingresos cobrados este mes')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(String(IMPORTE)).first()).toBeVisible();
  });

  test('la instructora no ve ingresos, ni gráfica, ni pagos pendientes', async ({ page }) => {
    await mockBackend(page, { verRecibos: false });
    await seedSesion(page, UID_INSTRUCTORA, 'marta@example.com');
    await page.goto('/dashboard');

    // Su panel carga con normalidad: esto no va de romperle la pantalla.
    await expect(page.getByRole('link', { name: /Clientas hoy/i })
      .or(page.getByText(/Clientas hoy/i)).first()).toBeVisible({ timeout: 30_000 });

    // Y no queda ni la tarjeta, ni el hueco con un 0 € falso.
    await expect(page.getByText('Ingresos cobrados este mes')).toHaveCount(0);
    await expect(page.getByText('Ingresos del mes')).toHaveCount(0);
    await expect(page.getByText('Pagos pendientes')).toHaveCount(0);
    await expect(page.getByText(String(IMPORTE))).toHaveCount(0);
  });

  test('no se le ofrece un enlace que la devolvería donde estaba', async ({ page }) => {
    // "Ocupación semana" enlazaba a /informes también para ella, que no puede
    // verlo: el guardia del layout la rebotaba al panel. Un enlace que te deja
    // donde estabas no es un enlace.
    await mockBackend(page, { verRecibos: false });
    await seedSesion(page, UID_INSTRUCTORA, 'marta@example.com');
    await page.goto('/dashboard');

    await expect(page.getByText(/Ocupación semana/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: /Ocupación semana/i })).toHaveCount(0);
  });
});
