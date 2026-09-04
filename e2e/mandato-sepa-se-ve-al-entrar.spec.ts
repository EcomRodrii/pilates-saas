import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Mandato SEPA: la ficha tiene que ver el mandato VIGENTE, y la remesa 19.14 de
// Cobros tiene que construirse con él.
//
// Desde #1375 (Sprint 1) el panel no cargaba `mandatos_sepa`: la consulta se
// quitó del arranque y nadie la volvió a pedir. En cada sesión nueva la ficha
// decía «Sin mandato» a una socia domiciliada, y «Preparar recibos para el
// banco» respondía que NINGÚN recibo pendiente tenía mandato — la remesa salía
// vacía con todas las domiciliaciones firmadas. Ahora llegan en la 2ª ola
// (fetchDeferredStudioData). La RLS (`mandatos_sepa_lectura`) sigue siendo
// la cerradura: INSTRUCTOR/MANAGER reciben [] sin error.
//
// Con contador de lecturas: un test que pasara sin haber pedido la tabla no
// probaría nada (ver .claude/tentare-os.md).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

// IBAN de ejemplo (dígitos de control válidos), no el de nadie.
const IBAN_SOCIA = 'ES9121000418450200051332';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR', nif: 'B00000000',
  // Datos de acreedor: sin ellos el botón de remesa manda a Configuración.
  sepa_acreedor_id: 'ES12ZZZ12345678', sepa_iban: 'ES7921000813610123456789', sepa_titular: 'Pilates Centro SL',
};
const SOCIO = {
  id: 'soc-1', studio_id: STUDIO_ID, nombre: 'Ana', apellidos: 'Gil',
  email: 'ana@example.com', telefono: null, activo: true,
  fecha_alta: '2026-01-10T09:00:00+00:00', campos_extra: {},
};
const MANDATO_ROW = {
  id: 'mnd-1', studio_id: STUDIO_ID, socio_id: 'soc-1', iban: IBAN_SOCIA,
  ref_mandato: 'MND-001', fecha_firma: '2026-02-01', estado: 'VIGENTE',
  creada_en: '2026-02-01T10:00:00+00:00',
};
const RECIBO_ROW = {
  id: 'rec-1', studio_id: STUDIO_ID, socio_id: 'soc-1', suscripcion_id: null,
  concepto: 'Mensual', importe: 60, estado: 'PENDIENTE', fecha_vencimiento: '2026-08-20',
  fecha_cobro: null, fecha_devolucion: null, intentos_reintento: 0, metodo_cobro: null, sepa_estado: null,
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, ruta: string) {
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

  const lecturas: string[] = [];
  const patchesRecibos: { url: string; body: Record<string, unknown> }[] = [];

  // OJO con el orden: Playwright resuelve en orden INVERSO al de registro.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/socios**', route => json(route, [SOCIO]));
  await page.route('**/rest/v1/mandatos_sepa**', route => {
    lecturas.push(route.request().url());
    return json(route, [MANDATO_ROW]);
  });
  await page.route('**/rest/v1/recibos**', route => {
    const req = route.request();
    if (req.method() === 'PATCH') {
      patchesRecibos.push({ url: req.url(), body: req.postDataJSON() });
      // dbUpdateRecibosBatch mira las filas que devuelve el UPDATE condicional
      // (`.select('id')`): se simulan los ids que venían en el filtro.
      const idParam = new URL(req.url()).searchParams.get('id') ?? '';
      const ids = idParam.startsWith('in.(') ? idParam.slice(4, -1).split(',').filter(Boolean) : [];
      return json(route, ids.map(id => ({ id })));
    }
    return json(route, [RECIBO_ROW]);
  });

  await page.goto(ruta);
  return { lecturas, patchesRecibos };
}

test.describe('Mandato SEPA: se ve al entrar', () => {
  test('la ficha enseña el mandato vigente que ya estaba en la base de datos', async ({ page }) => {
    const { lecturas } = await montar(page, '/clientas/soc-1');
    await expect(page.getByText('Ana Gil')).toBeVisible({ timeout: 30_000 });

    // Llega en la 2ª ola: hay un instante de «Sin mandato» antes. Se espera el
    // mandato, nunca se aserta la ausencia del vacío.
    await expect(page.getByText(/IBAN ····1332/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('MND-001')).toBeVisible();
    await expect(page.getByText('Entra en la remesa del banco (cuaderno 19.14).')).toBeVisible();
    await expect(page.getByText(/Sin mandato\./)).toHaveCount(0);

    expect(lecturas.length).toBeGreaterThan(0);
    expect(lecturas[0]).toContain(`studio_id=eq.${STUDIO_ID}`);
  });

  test('la remesa 19.14 de Cobros incluye el recibo de la socia domiciliada', async ({ page }) => {
    const { lecturas, patchesRecibos } = await montar(page, '/cobros');
    const boton = page.getByRole('button', { name: 'Preparar recibos para el banco' });
    await expect(boton).toBeVisible({ timeout: 30_000 });
    // El mandato tiene que estar ya en memoria antes de pulsar: si no, el
    // botón contestaría (con razón) que no hay nada domiciliado.
    await expect.poll(() => lecturas.length, { timeout: 15_000 }).toBeGreaterThan(0);

    await boton.click();

    await expect(page.getByText(/Fichero listo: 1 recibo/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Ningún recibo pendiente tiene mandato SEPA/)).toHaveCount(0);
    // Y el recibo quedó marcado como enviado al banco ANTES de ofrecer el fichero.
    expect(patchesRecibos).toHaveLength(1);
    expect(patchesRecibos[0].url).toContain('rec-1');
    expect(patchesRecibos[0].body).toMatchObject({ estado: 'EN_CURSO' });
  });
});
