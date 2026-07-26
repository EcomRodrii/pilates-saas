import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// "Si no se ha guardado, no me digas que sí."
//
// `addSocio` era optimista y fire-and-forget: metía la socia en el estado, y si
// llevaba plan creaba además su suscripción, un recibo COBRADO y una factura que
// se SELLABA (Veri*Factu, cadena de hashes) — todo ANTES de saber si el insert
// había funcionado. El `.then(ok => { if (!ok) return; ... })` se limitaba a no
// insertar las hijas: la pantalla se quedaba con una clienta que no existía, con
// su bono y su factura fiscal. Y `handleCrear` cerraba el diálogo igualmente.
//
// Contrato que fija esta suite:
//   1. si la BD rechaza, se dice, el diálogo NO se cierra y no aparece nadie;
//   2. si acepta, se guarda de verdad y en el orden correcto (socia → bono).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR', nif: 'B00000000',
};

const PLANES = [
  { id: 'plan-1', studio_id: STUDIO_ID, nombre: 'Bono 10 sesiones', descripcion: null, precio: 130, tipo: 'BONO', sesiones: 10, validez_dias: 90, limite_semanal: null, activo: true },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesionDeDuena(page: Page) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'cloe@example.com', aud: 'authenticated',
        role: 'authenticated', app_metadata: {}, user_metadata: {},
        created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
}

/** Devuelve las tablas escritas, en orden: sirve para comprobar que la socia va primero. */
async function montar(page: Page, opts: { rechazarSocia?: boolean } = {}) {
  const escrituras: string[] = [];

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/planes_tarifa**', route => json(route, PLANES));

  for (const tabla of ['socios', 'suscripciones', 'recibos']) {
    await page.route(`**/rest/v1/${tabla}**`, route => {
      if (route.request().method() === 'GET') return json(route, []);
      escrituras.push(tabla);
      if (tabla === 'socios' && opts.rechazarSocia) {
        return json(route, { message: 'new row violates row-level security policy' }, 403);
      }
      return json(route, []);
    });
  }

  await seedSesionDeDuena(page);
  await page.goto('/clientas');
  return escrituras;
}

async function rellenarAlta(page: Page, conPlan: boolean) {
  await page.getByRole('button', { name: /Nueva clienta|Añadir primera clienta/ }).first().click({ timeout: 30_000 });
  await page.getByRole('textbox', { name: 'Nombre' }).fill('María');
  await page.getByRole('textbox', { name: 'Apellidos' }).fill('Soler Puig');
  await page.getByRole('textbox', { name: 'Email' }).fill('maria@example.com');
  if (conPlan) await page.getByRole('combobox', { name: /Plan/i }).selectOption('plan-1');
  await page.getByRole('button', { name: /Siguiente — Contrato/ }).click();
  await page.getByRole('checkbox').check();
  await page.getByPlaceholder(/Nombre completo de la clienta/i).fill('María Soler Puig');
}

test.describe('El alta de una clienta solo cuenta si se guarda', () => {
  test('si la BD rechaza, lo dice y no cierra el diálogo', async ({ page }) => {
    const escrituras = await montar(page, { rechazarSocia: true });
    await rellenarAlta(page, true);

    await page.getByRole('button', { name: /Crear clienta y firmar/ }).click();

    // Se explica el fallo y el formulario sigue ahí con los datos puestos.
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText(/no se ha podido guardar|permiso|inténtalo/i, { timeout: 15_000 });

    // Y lo esencial: NO se ha creado bono ni recibo colgando de una socia que no existe.
    expect(escrituras).not.toContain('suscripciones');
    expect(escrituras).not.toContain('recibos');

    // Tampoco puede haberse quedado pintada en el listado: eso era exactamente
    // lo que pasaba antes — una clienta fantasma, visible hasta recargar.
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByText('María Soler Puig')).toHaveCount(0);
  });

  test('si la BD acepta, guarda en orden: primero la socia, luego su bono', async ({ page }) => {
    const escrituras = await montar(page);
    await rellenarAlta(page, true);

    await page.getByRole('button', { name: /Crear clienta y firmar/ }).click();

    // El diálogo se cierra solo cuando está guardado de verdad.
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });

    expect(escrituras[0]).toBe('socios');
    expect(escrituras).toContain('suscripciones');
    expect(escrituras).toContain('recibos');
    // La suscripción nunca antes que la socia: por FK la BD la rechazaría.
    expect(escrituras.indexOf('socios')).toBeLessThan(escrituras.indexOf('suscripciones'));
  });
});
