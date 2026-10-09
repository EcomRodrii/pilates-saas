import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Importar reservas que no caben en el aforo (9-oct-2026, decisión del fundador):
// se AVISA antes de escribir nada y, solo con el OK, se amplía el aforo de esas
// clases y se importa. Sin el OK, no se importa nada (y no se vuelve a llamar).
//
// ⚠️ Con contador de peticiones: «no mintió» sin contar intentos puede ser verdad
// por no haber intentado nada.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Cloe Pilates', slug: 'cloe', owner_auth_user_id: AUTH_UID,
  email: 'cloe@example.com', moneda: 'EUR', bienvenida_vista_en: '2026-01-01T00:00:00Z',
};
const CSV = [
  'email,clase,fecha,hora_inicio,estado',
  'ana@example.com,Mat Suave,2027-03-01,08:00,CONFIRMADA',
  'bea@example.com,Mat Suave,2027-03-01,08:00,CONFIRMADA',
].join('\n');

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function preparar(page: Page) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh', expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'cloe@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route => json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route => json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
}

/** El servidor: 409 con el detalle sin `aforo: 'ampliar'`; con él, importa y dice cuántas amplió. */
async function servidorDeImportacion(page: Page) {
  const cuerpos: { aforo?: string }[] = [];
  await page.route('**/api/reservas/import', async route => {
    const cuerpo = route.request().postDataJSON() as { aforo?: string };
    cuerpos.push(cuerpo);
    if (cuerpo.aforo !== 'ampliar') {
      return json(route, {
        necesitaConfirmacion: 'aforo', error: 'Hay clases que se quedarían por encima de su aforo.',
        clasesSobreAforo: 1, sobreAforoFuturas: 1, sobreAforoPasadas: 0,
        detalleSobreAforo: ['Mat Suave · lun 1 mar 08:00: 2 reservas para 1 plazas'],
      }, 409);
    }
    return json(route, { ok: true, importadas: 2, duplicadas: 0, sinSocia: 0, sinSesion: 0, aforoAmpliado: 1, errores: [] });
  });
  return cuerpos;
}

async function subirYImportar(page: Page) {
  await page.goto('/calendario/importar/reservas');
  await page.locator('input[type=file]').setInputFiles({ name: 'reservas.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV, 'utf8') });
  await page.getByRole('button', { name: 'Importar reservas' }).click();
}

test('con el OK se amplía el aforo e importa: dos peticiones, la segunda con «ampliar»', async ({ page }) => {
  await preparar(page);
  const cuerpos = await servidorDeImportacion(page);
  await subirYImportar(page);

  const dialogo = page.getByRole('dialog');
  await expect(dialogo.getByText('Hay clases que no caben')).toBeVisible({ timeout: 30_000 });
  await expect(dialogo.getByText(/Mat Suave · lun 1 mar 08:00/)).toBeVisible();
  expect(cuerpos).toHaveLength(1);
  expect(cuerpos[0].aforo).toBeUndefined();

  await dialogo.getByRole('button', { name: 'Ampliar aforo e importar' }).click();
  await expect(page.getByText('Reservas importadas', { exact: true })).toBeVisible();
  await expect(page.getByText(/Se ha ampliado el aforo de 1 clase/)).toBeVisible();
  expect(cuerpos).toHaveLength(2);
  expect(cuerpos[1].aforo).toBe('ampliar');
});

test('sin el OK no se importa nada: una sola petición y la pantalla sigue en las columnas', async ({ page }) => {
  await preparar(page);
  const cuerpos = await servidorDeImportacion(page);
  await subirYImportar(page);

  const dialogo = page.getByRole('dialog');
  await expect(dialogo.getByText('Hay clases que no caben')).toBeVisible({ timeout: 30_000 });
  await dialogo.getByRole('button', { name: 'No importar' }).click();
  await expect(dialogo).toHaveCount(0);
  await expect(page.getByText('Reservas importadas', { exact: true })).toHaveCount(0);
  expect(cuerpos.length).toBeGreaterThan(0);
  expect(cuerpos).toHaveLength(1);
});
