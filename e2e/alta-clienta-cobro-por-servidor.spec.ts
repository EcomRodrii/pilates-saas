import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El alta de una clienta que «ya ha pagado»: el recibo nace PENDIENTE y lo cobra el SERVIDOR.
//
// Antes `addSocio` insertaba el recibo ya COBRADO (y su matrícula) desde el navegador, y sellaba
// la factura por su cuenta. La base de datos ya no deja crear un recibo cobrado desde el
// navegador (PR4 de «recibo cobrado»): el recibo se crea pendiente y se cobra por
// `POST /api/cobros/marcar-cobrado`, que es quien sella la factura y apunta la caja.
//
// Lo que fija esta suite:
//   · ningún recibo se escribe cobrado, y el cobro llega al servidor con los ids y el método;
//   · si el servidor no lo confirma, el alta ya está hecha pero se DICE que el cobro no consta
//     (los recibos se quedan pendientes en «Quién me debe»);
//   · la domiciliación ya no se ofrece como «ya cobrado» (un adeudo lo confirma el banco).
//
// ⚠️ Cada «no debe pasar» lleva su contador de «sí se intentó» (ver `.claude/tentare-os.md`).
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
  // Un bono y no una mensual: la mensual abre «¿Le das una plaza fija?» al terminar el alta.
  { id: 'plan-2', studio_id: STUDIO_ID, nombre: 'Bono con matrícula', descripcion: null, precio: 60, tipo: 'BONO', sesiones: 8, validez_dias: 60, limite_semanal: null, activo: true, matricula: 25 },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

type FilaRecibo = Record<string, unknown>;
interface Cobro { reciboIds: string[]; metodo: string | null }

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

async function montar(page: Page, opts: { cobro?: 'aplicada' | 'sin_sellar' | 'no_cobrable' | 'caida' } = {}) {
  const recibos: FilaRecibo[] = [];
  const cobros: Cobro[] = [];

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/api/cobros/marcar-cobrado', route => {
    const cuerpo = JSON.parse(route.request().postData() || '{}') as Cobro;
    cobros.push(cuerpo);
    switch (opts.cobro ?? 'aplicada') {
      case 'caida': return route.abort('failed');
      case 'no_cobrable':
        return json(route, { resultados: cuerpo.reciboIds.map(reciboId => ({ reciboId, resultado: 'no_cobrable', selladoOk: true, error: 'Este recibo ya no se puede cobrar.' })) }, 409);
      case 'sin_sellar':
        // Cobrado, pero el sellado de la factura falló (p. ej. NIF inválido).
        return json(route, { resultados: cuerpo.reciboIds.map(reciboId => ({ reciboId, resultado: 'aplicada', selladoOk: false })) });
      default:
        return json(route, { resultados: cuerpo.reciboIds.map(reciboId => ({ reciboId, resultado: 'aplicada', selladoOk: true })) });
    }
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  // La matrícula la decide la BD: devuelve el importe que se cobra.
  await page.route('**/rest/v1/rpc/reservar_matricula', route => json(route, 25));
  await page.route('**/rest/v1/planes_tarifa**', route => json(route, PLANES));

  for (const tabla of ['socios', 'suscripciones']) {
    await page.route(`**/rest/v1/${tabla}**`, route => json(route, []));
  }
  await page.route('**/rest/v1/recibos**', route => {
    const req = route.request();
    if (req.method() === 'GET') return json(route, []);
    if (req.method() === 'POST') {
      const cuerpo = JSON.parse(req.postData() || '{}') as FilaRecibo | FilaRecibo[];
      recibos.push(...(Array.isArray(cuerpo) ? cuerpo : [cuerpo]));
    }
    return json(route, []);
  });

  await seedSesionDeDuena(page);
  await page.goto('/clientas');
  return { recibos, cobros };
}

async function altaConCobro(page: Page, planId: string, opts: { pagado?: boolean; dobleClic?: boolean } = {}) {
  const pagado = opts.pagado ?? true;
  await page.getByRole('button', { name: /Nueva clienta|Añadir primera clienta/ }).first().click({ timeout: 30_000 });
  await page.getByRole('textbox', { name: /^Nombre\s*\*?$/ }).fill('María');
  await page.getByRole('textbox', { name: 'Apellidos' }).fill('Soler Puig');
  await page.getByRole('textbox', { name: 'Email' }).fill('maria@example.com');
  await page.getByRole('combobox', { name: /Plan/i }).selectOption(planId);
  if (pagado) {
    await page.getByRole('button', { name: /Sí, ya está cobrado/ }).click();
    await page.getByRole('combobox', { name: 'Cómo te lo ha pagado' }).selectOption('BIZUM');
  }
  await page.getByRole('checkbox').check();
  await page.getByPlaceholder(/Nombre completo de la clienta/i).fill('María Soler Puig');
  const crear = page.getByRole('button', { name: /Crear clienta y firmar/ });
  if (opts.dobleClic) await crear.dblclick();
  else await crear.click();
}

test.describe('Alta con «ya está cobrado»', () => {
  test('el recibo se crea PENDIENTE y el cobro llega al servidor con su id y el método', async ({ page }) => {
    const { recibos, cobros } = await montar(page);
    await altaConCobro(page, 'plan-1');

    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });
    await expect.poll(() => cobros.length, { timeout: 15_000, message: 'el cobro no llegó a pedirse' }).toBe(1);

    expect(recibos.length, 'no se creó el recibo del alta').toBe(1);
    expect(recibos.map(r => r.estado), 'un recibo se escribió cobrado desde el navegador').toEqual(['PENDIENTE']);
    expect(cobros[0]).toEqual({ reciboIds: [recibos[0].id], metodo: 'BIZUM' });
    await expect(page.getByText(/cobro no ha quedado registrado/i)).toHaveCount(0);
  });

  test('con matrícula, los dos recibos nacen pendientes y se cobran en UNA petición', async ({ page }) => {
    const { recibos, cobros } = await montar(page);
    await altaConCobro(page, 'plan-2');

    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });
    await expect.poll(() => cobros.length, { timeout: 15_000, message: 'el cobro no llegó a pedirse' }).toBe(1);

    expect(recibos).toHaveLength(2);
    expect(recibos.map(r => r.estado)).toEqual(['PENDIENTE', 'PENDIENTE']);
    expect(recibos.map(r => r.concepto).sort()).toEqual(['Alta — Bono con matrícula', 'Matrícula — Bono con matrícula']);
    expect(cobros[0].reciboIds.slice().sort()).toEqual(recibos.map(r => r.id as string).sort());
    expect(cobros[0].metodo).toBe('BIZUM');
  });

  test('«Todavía no» deja el recibo pendiente y NO pide ningún cobro', async ({ page }) => {
    const { recibos, cobros } = await montar(page);
    await altaConCobro(page, 'plan-1', { pagado: false });

    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });
    await expect.poll(() => recibos.length, { timeout: 15_000, message: 'no llegó a crearse el recibo' }).toBe(1);
    expect(recibos[0].estado).toBe('PENDIENTE');
    expect(cobros, 'se pidió cobrar un alta que no se ha pagado').toHaveLength(0);
  });

  test('cobrado pero con la factura sin sellar: el alta lo dice (antes lo avisaba el navegador)', async ({ page }) => {
    const { cobros } = await montar(page, { cobro: 'sin_sellar' });
    await altaConCobro(page, 'plan-1');

    await expect.poll(() => cobros.length, { timeout: 15_000, message: 'el cobro no llegó a pedirse' }).toBe(1);
    await expect(page.getByText(/la factura ha quedado pendiente de sellar/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/cobro no ha quedado registrado/i)).toHaveCount(0);
  });

  test('un doble clic en «Crear clienta» crea UNA alta y la cobra UNA vez', async ({ page }) => {
    const { recibos, cobros } = await montar(page);
    await altaConCobro(page, 'plan-1', { dobleClic: true });

    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 15_000 });
    await expect.poll(() => cobros.length, { timeout: 15_000, message: 'el cobro no llegó a pedirse' }).toBeGreaterThan(0);
    // Margen para que un segundo envío, si lo hubiera, llegara.
    await page.waitForTimeout(1500);
    expect(recibos, 'el doble clic creó dos recibos').toHaveLength(1);
    expect(cobros, 'el doble clic pidió el cobro dos veces').toHaveLength(1);
  });

  for (const [nombre, cobro] of [
    ['el servidor dice que no se puede cobrar', 'no_cobrable'],
    ['se cae la red', 'caida'],
  ] as const) {
    test(`⚠️ ${nombre}: el alta queda hecha, pero se dice que el cobro no consta`, async ({ page }) => {
      const { recibos, cobros } = await montar(page, { cobro });
      await altaConCobro(page, 'plan-1');

      await expect.poll(() => cobros.length, { timeout: 15_000, message: 'el cobro no llegó a pedirse' }).toBeGreaterThan(0);
      await expect(page.getByText(/cobro no ha quedado registrado/i)).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText(/Quién me debe/)).toBeVisible();
      // El recibo existe y NO se escribió cobrado: es lo que se ve en «Quién me debe».
      expect(recibos.map(r => r.estado)).toEqual(['PENDIENTE']);
    });
  }

  test('la domiciliación ya no se ofrece como método de un cobro ya hecho', async ({ page }) => {
    await montar(page);
    await page.getByRole('button', { name: /Nueva clienta|Añadir primera clienta/ }).first().click({ timeout: 30_000 });
    await page.getByRole('combobox', { name: /Plan/i }).selectOption('plan-1');
    await page.getByRole('button', { name: /Sí, ya está cobrado/ }).click();
    const metodos = page.getByRole('combobox', { name: 'Cómo te lo ha pagado' }).locator('option');
    await expect(metodos).toHaveCount(4);
    await expect(metodos).toHaveText(['Efectivo', 'Tarjeta (datáfono)', 'Bizum', 'Transferencia']);
  });
});
