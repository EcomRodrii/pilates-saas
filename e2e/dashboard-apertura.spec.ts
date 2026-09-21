import { test, expect, type Page, type Route } from '@playwright/test';

// Opening OS en la home: aparece solo mientras el estudio abre, pide la fecha,
// y enseña capacidad frente a demanda con el origen de cada cifra.

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const CAPTURAS = process.env.E2E_CAPTURAS_DIR;
// El primer test compila /dashboard en frío con `next dev`.
const ARRANQUE_MS = 60_000;

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const ANALISIS = {
  ventana: { desde: '2026-10-01T00:00:00Z', hasta: '2026-11-12T00:00:00Z', dias: 42 },
  capacidadPublicada: 240,
  sesionesEnVentana: 24,
  demandaComprometida: 180,
  desglose: { OBSERVADA: { suscripciones: 0, plazas: 0 }, ESTIMADA_POR_PLAN: { suscripciones: 15, plazas: 180 } },
  demandaPotencial: 34,
  leads: 7,
  ocupacionPrevista: 0.75,
  riesgo: 'AMARILLO',
};
const SUPUESTOS = { sesionesSemanaSinTope: 2, semanasBonoSinCaducidad: 8, conversionLeads: 0.2 };

interface Opciones {
  rol?: 'PROPIETARIO' | 'RECEPCION';
  inicial: unknown;
  trasGuardar?: unknown;
  patchStatus?: number;
}

async function montar(page: Page, o: Opciones) {
  const peticiones = { get: 0, patch: [] as unknown[] };
  let guardado = false;

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
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/api/opening', async route => {
    if (route.request().method() === 'PATCH') {
      peticiones.patch.push(route.request().postDataJSON());
      const status = o.patchStatus ?? 200;
      if (status === 200) guardado = true;
      return json(route, status === 200 ? { ok: true } : { error: 'No se pudo guardar' }, status);
    }
    peticiones.get++;
    return json(route, guardado && o.trasGuardar ? o.trasGuardar : o.inicial);
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, {
      id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen',
      owner_auth_user_id: (o.rol ?? 'PROPIETARIO') === 'PROPIETARIO' ? AUTH_UID : 'auth-otra-persona',
    }));
  await page.route('**/rest/v1/instructores**', route =>
    json(route, (o.rol ?? 'PROPIETARIO') === 'PROPIETARIO' ? [] : [
      { id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Recepción', activo: true, rol: 'RECEPCION', auth_user_id: AUTH_UID },
    ]));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/dashboard');
  return peticiones;
}

test.describe('Apertura del estudio en la home', () => {
  test('sin fecha: la pide, la guarda y enseña la previsión con su origen', async ({ page }) => {
    const peticiones = await montar(page, {
      inicial: { visible: true, fechaApertura: null, diasHastaApertura: null, fase: null, analisis: ANALISIS, supuestos: SUPUESTOS },
      trasGuardar: { visible: true, fechaApertura: '2026-10-15', diasHastaApertura: 14, fase: null, analisis: ANALISIS, supuestos: SUPUESTOS },
    });

    await expect(page.getByText('¿Cuándo abres tu estudio?')).toBeVisible({ timeout: ARRANQUE_MS });
    if (CAPTURAS) await page.screenshot({ path: `${CAPTURAS}/apertura-sin-fecha.png`, fullPage: false });

    await page.getByLabel('Fecha de apertura').fill('2026-10-15');
    await page.getByRole('button', { name: 'Guardar fecha' }).click();

    await expect(page.getByText('Abres en 14 días')).toBeVisible();
    expect(peticiones.patch).toEqual([{ fechaApertura: '2026-10-15' }]);
    expect(peticiones.get).toBeGreaterThan(1);

    await expect(page.getByText('75 %')).toBeVisible();
    await expect(page.getByText('240 en 24 clases')).toBeVisible();
    await expect(page.getByText(/15 de tus cuotas aún no tienen historial/)).toBeVisible();
    await expect(page.getByText(/tus 7 interesadas/)).toBeVisible();
    if (CAPTURAS) {
      const tarjeta = page.getByText('Abres en 14 días').locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
      await tarjeta.screenshot({ path: `${CAPTURAS}/apertura-con-fecha.png` });
    }
  });

  test('si el servidor dice que no, lo dice y no finge que guardó', async ({ page }) => {
    const peticiones = await montar(page, {
      inicial: { visible: true, fechaApertura: null, diasHastaApertura: null, fase: null, analisis: ANALISIS, supuestos: SUPUESTOS },
      patchStatus: 500,
    });
    await expect(page.getByText('¿Cuándo abres tu estudio?')).toBeVisible({ timeout: ARRANQUE_MS });
    await page.getByLabel('Fecha de apertura').fill('2026-10-15');
    await page.getByRole('button', { name: 'Guardar fecha' }).click();

    await expect(page.locator('p[role="alert"]')).toHaveText('No se pudo guardar');
    expect(peticiones.patch.length).toBeGreaterThan(0);
    await expect(page.getByText('¿Cuándo abres tu estudio?')).toBeVisible();
  });

  test('«ya está abierto» la quita de la home', async ({ page }) => {
    const peticiones = await montar(page, {
      inicial: { visible: true, fechaApertura: null, diasHastaApertura: null, fase: null, analisis: ANALISIS, supuestos: SUPUESTOS },
      trasGuardar: { visible: false },
    });
    await expect(page.getByText('¿Cuándo abres tu estudio?')).toBeVisible({ timeout: ARRANQUE_MS });
    await page.getByRole('button', { name: 'Mi estudio ya está abierto' }).click();

    await expect(page.getByText('¿Cuándo abres tu estudio?')).toHaveCount(0);
    expect(peticiones.patch).toEqual([{ yaAbierto: true }]);
  });

  test('sin clases publicadas manda a crear horario en vez de enseñar un 0 %', async ({ page }) => {
    await montar(page, {
      inicial: {
        visible: true, fechaApertura: '2026-10-15', diasHastaApertura: 14, fase: null, supuestos: SUPUESTOS,
        analisis: { ...ANALISIS, capacidadPublicada: 0, sesionesEnVentana: 0, ocupacionPrevista: null, riesgo: 'SIN_OFERTA' },
      },
    });
    await expect(page.getByText('Abres en 14 días')).toBeVisible({ timeout: ARRANQUE_MS });
    await expect(page.getByRole('link', { name: /Aún no hay clases publicadas/ })).toHaveAttribute('href', '/calendario');
    await expect(page.getByText('Ocupación prevista')).toHaveCount(0);
  });

  test('un estudio que ya opera no ve nada', async ({ page }) => {
    const peticiones = await montar(page, { inicial: { visible: false } });
    await expect(page.getByText('Clientas hoy')).toBeVisible({ timeout: ARRANQUE_MS });
    expect(peticiones.get).toBeGreaterThan(0);
    await expect(page.getByText(/Cuándo abres|Abres en/)).toHaveCount(0);
  });

  test('recepción ni siquiera la pide', async ({ page }) => {
    const peticiones = await montar(page, {
      rol: 'RECEPCION',
      inicial: { visible: true, fechaApertura: null, diasHastaApertura: null, fase: null, analisis: ANALISIS, supuestos: SUPUESTOS },
    });
    await expect(page.getByText('Clientas hoy')).toBeVisible({ timeout: ARRANQUE_MS });
    expect(peticiones.get).toBe(0);
    await expect(page.getByText('¿Cuándo abres tu estudio?')).toHaveCount(0);
  });
});
