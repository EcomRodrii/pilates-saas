import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// "Mis tarifas se llaman distinto que en mi software anterior."
//
// El importador de membresías casa el plan por NOMBRE. Eso funciona si el
// estudio llega vacío y copia los nombres del software viejo — que es como se
// probó. Con un estudio que YA tiene su catálogo montado no casaba NADA:
// Momence exporta "10 Class Pack" y en Tentare esa tarifa se llama "Bono 10
// Reformer". TODAS las filas de bonos fallaban con «No existe el plan X en tu
// catálogo» y la dueña no tenía dónde decir que X es su Y.
//
// Esta suite fija el contrato del emparejador:
//   1. los planes que no existen salen a decidir, ordenados por cuántas filas
//      arrastran (primero el que salva 300, no el que salva 2);
//   2. elegir una tarifa lo saca de pendientes;
//   3. "no importar" también lo saca — decir que no es una decisión válida;
//   4. si el catálogo está vacío se explica qué hacer, en vez de un desplegable
//      sin opciones;
//   5. un CSV cuyos planes YA casan no enseña el panel: no molestar sin motivo.
//
// Mismo enfoque que el resto: env dummy y backend interceptado.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Cloe Pilates', slug: 'cloe', owner_auth_user_id: AUTH_UID,
  email: 'cloe@example.com', moneda: 'EUR',
  // Sin esto, el layout secuestra la ruta con la pantalla de bienvenida del alta.
  bienvenida_vista_en: '2026-01-01T00:00:00Z',
};

// El catálogo de la dueña, en español.
const TARIFAS = [
  { id: 'pt-ref', studio_id: STUDIO_ID, nombre: 'Bono 10 Reformer', precio: 150, tipo: 'BONO', sesiones: 10, activo: true },
  { id: 'pt-mes', studio_id: STUDIO_ID, nombre: 'Mensual ilimitado', precio: 89, tipo: 'MENSUAL', sesiones: null, activo: true },
];

// El CSV que le da Momence, en inglés.
const CSV_MOMENCE = [
  'email,membershipName,creditsRemaining',
  'maria@example.com,10 Class Pack,4',
  'nuria@example.com,10 Class Pack,7',
  'bego@example.com,Monthly Unlimited,',
  'sol@example.com,Drop-in,1',
].join('\n');

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesionDeDuena(page: Page) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'cloe@example.com', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
}

/**
 * `analizar` se mockea con el plan que devolvería el servidor para ese CSV. El
 * mapeo de columnas tiene que ser el REAL, porque la página vuelve a parsear el
 * archivo en local para construir las filas que envía.
 */
async function mockBackend(page: Page, opts: { tarifas?: typeof TARIFAS } = {}) {
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/api/migracion/recientes**', route => json(route, { batches: [] }));
  await page.route('**/api/migracion/analizar**', route => json(route, {
    orden: ['membresias'],
    avisos: [],
    archivos: [{
      nombre: 'bonos.csv', entidad: 'membresias', entidadEtiqueta: 'Bonos y membresías',
      origen: 'auto', confianza: 1, columnas: ['email', 'membershipName', 'creditsRemaining'],
      mapeo: { email: 0, plan: 1, sesiones: 2, fecha_inicio: -1, fecha_fin: -1, estado: -1 },
      total: 4, ok: 4, duplicadas: 0, errores: 0,
      muestra: [{ email: 'maria@example.com', plan: '10 Class Pack', sesiones: 4 }],
      cuarentena: [], avisos: [],
    }],
  }));

  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/planes_tarifa**', route => json(route, opts.tarifas ?? TARIFAS));
}

async function subirYRevisar(page: Page, csv = CSV_MOMENCE) {
  await page.goto('/migracion');
  await expect(page.getByRole('button', { name: /Analizar|Subir|arrastra/i }).first())
    .toBeVisible({ timeout: 30_000 });
  await page.locator('input[type=file]').setInputFiles({
    name: 'bonos.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8'),
  });
  await page.getByRole('button', { name: /Analizar/i }).click();
  await expect(page.getByText(/Bonos y membresías/i).first()).toBeVisible({ timeout: 30_000 });
}

test.describe('Emparejar los planes del CSV con las tarifas del estudio', () => {
  test('los planes que no existen salen a decidir, ordenados por impacto', async ({ page }) => {
    await mockBackend(page);
    await seedSesionDeDuena(page);
    await subirYRevisar(page);

    await expect(page.getByText('Tus tarifas se llaman distinto que en tu software anterior')).toBeVisible();
    // Los tres nombres ingleses, y el que arrastra 2 filas va primero.
    await expect(page.getByText('10 Class Pack')).toBeVisible();
    await expect(page.getByText('Monthly Unlimited')).toBeVisible();
    await expect(page.getByText('Drop-in')).toBeVisible();
    await expect(page.getByText('2 filas')).toBeVisible();
  });

  test('elegir una tarifa lo saca de pendientes', async ({ page }) => {
    await mockBackend(page);
    await seedSesionDeDuena(page);
    await subirYRevisar(page);

    await page.getByLabel('Tarifa para «10 Class Pack»').selectOption('pt-ref');
    await expect(page.getByText('10 Class Pack')).toHaveCount(0);
    // Los otros dos siguen ahí: se resuelve uno a uno.
    await expect(page.getByText('Monthly Unlimited')).toBeVisible();
  });

  test('"no importar" también es una decisión y también lo cierra', async ({ page }) => {
    // No todo lo del software viejo se quiere traer. Antes esto no se podía
    // decir, y el plan seguía marcado como pendiente para siempre.
    await mockBackend(page);
    await seedSesionDeDuena(page);
    await subirYRevisar(page);

    await page.getByLabel('Tarifa para «Drop-in»').selectOption('NO_IMPORTAR');
    await expect(page.getByText('Drop-in')).toHaveCount(0);
  });

  test('resueltos los tres, el panel deja de pedir nada', async ({ page }) => {
    await mockBackend(page);
    await seedSesionDeDuena(page);
    await subirYRevisar(page);

    await page.getByLabel('Tarifa para «10 Class Pack»').selectOption('pt-ref');
    await page.getByLabel('Tarifa para «Monthly Unlimited»').selectOption('pt-mes');
    await page.getByLabel('Tarifa para «Drop-in»').selectOption('NO_IMPORTAR');

    await expect(page.getByText('Planes emparejados')).toBeVisible();
    await expect(page.getByText('Todo listo: cada plan del archivo tiene su tarifa.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Deshacer los 3 emparejamientos/ })).toBeVisible();
  });

  test('sin tarifas creadas se explica qué hacer, no un desplegable vacío', async ({ page }) => {
    await mockBackend(page, { tarifas: [] });
    await seedSesionDeDuena(page);
    await subirYRevisar(page);

    await expect(page.getByText(/Todavía no tienes tarifas creadas/)).toBeVisible();
    await expect(page.getByText(/Configuración → Planes y tarifas/)).toBeVisible();
  });

  test('si los planes YA casan, no se molesta con el panel', async ({ page }) => {
    await mockBackend(page);
    await seedSesionDeDuena(page);
    // Mismo archivo pero con los nombres del catálogo de la dueña.
    await subirYRevisar(page, [
      'email,membershipName,creditsRemaining',
      'maria@example.com,Bono 10 Reformer,4',
      'bego@example.com,Mensual ilimitado,',
    ].join('\n'));

    await expect(page.getByText('Tus tarifas se llaman distinto que en tu software anterior')).toHaveCount(0);
  });
});
