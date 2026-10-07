import { test, expect, type Page, type Route } from '@playwright/test';

// Las llamadas de puesta en marcha en /interno: el fundador ve quién pidió que
// le llamen (estudio, teléfono, hora preferida), y al marcarla como hecha se
// pide al servidor de verdad. Si el servidor dice que no, no finge que se hizo.
const STORAGE_KEY = 'sb-example-auth-token';

const PENDIENTE = {
  id: '11111111-1111-4111-8111-111111111111', studioId: 'studio-e2e', estudio: 'Estudio de prueba',
  telefono: '+34612345678', horaPreferida: 'tarde', estado: 'pendiente',
  creadaEn: '2026-10-07T09:00:00Z', atendidaEn: null,
};
const HECHA = {
  id: '22222222-2222-4222-8222-222222222222', studioId: 'studio-e2e-2', estudio: 'Otro estudio',
  telefono: null, horaPreferida: null, estado: 'hecha',
  creadaEn: '2026-10-05T09:00:00Z', atendidaEn: '2026-10-06T10:00:00Z',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page, { marcar }: { marcar: number }) {
  await page.addInitScript(key => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: 'u-marco', email: 'marco@tentare.app', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, STORAGE_KEY);
  let llamadas = [PENDIENTE, HECHA] as unknown[];
  const marcadas: string[] = [];
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/api/interno/sesion**', route =>
    json(route, { nombre: 'Marco', cargo: 'Fundador', email: 'marco@tentare.app', permisos: ['crm.update'] }));
  await page.route('**/api/interno/llamadas**', async route => {
    const req = route.request();
    if (req.method() === 'GET') return json(route, { llamadas });
    marcadas.push(req.url());
    if (marcar !== 200) return json(route, { error: 'No se ha podido marcar la llamada. Inténtalo otra vez.' }, marcar);
    llamadas = [{ ...PENDIENTE, estado: 'hecha', telefono: null, atendidaEn: '2026-10-07T12:00:00Z' }, HECHA];
    return json(route, { ok: true });
  });
  await page.goto('/interno/llamadas');
  return marcadas;
}

test.describe('Llamadas de puesta en marcha en /interno', () => {
  test('lista la solicitud con estudio, teléfono y hora preferida', async ({ page }) => {
    await montar(page, { marcar: 200 });
    await expect(page.getByRole('heading', { name: 'Llamadas de puesta en marcha' })).toBeVisible({ timeout: 30_000 });
    const fila = page.getByRole('listitem').filter({ hasText: 'Estudio de prueba' });
    await expect(fila).toContainText('+34 612 34 56 78');
    await expect(fila).toContainText('Por la tarde');
    await expect(fila.getByRole('link', { name: '+34 612 34 56 78' })).toHaveAttribute('href', 'tel:+34612345678');
    // La hecha ya no lleva teléfono.
    await expect(page.getByRole('listitem').filter({ hasText: 'Otro estudio' })).not.toContainText('+34');
    // Y la sección está en el menú del backoffice.
    await expect(page.getByRole('link', { name: 'Llamadas' })).toBeVisible();
  });

  test('«Llamada hecha» lo pide al servidor y la pasa a hechas sin teléfono', async ({ page }) => {
    const marcadas = await montar(page, { marcar: 200 });
    await page.getByRole('button', { name: 'Llamada hecha' }).click({ timeout: 30_000 });
    await expect.poll(() => marcadas.length).toBeGreaterThan(0);
    expect(marcadas[0]).toContain(PENDIENTE.id);
    await expect(page.getByText('No hay ninguna llamada pendiente.')).toBeVisible();
    await expect(page.getByText('+34 612 34 56 78')).toHaveCount(0);
  });

  test('si el servidor dice que no, no finge que se hizo', async ({ page }) => {
    const marcadas = await montar(page, { marcar: 500 });
    await page.getByRole('button', { name: 'Llamada hecha' }).click({ timeout: 30_000 });
    await expect.poll(() => marcadas.length).toBeGreaterThan(0);
    await expect(page.getByRole('alert').filter({ hasText: 'No se ha podido marcar la llamada' })).toBeVisible();
    // Sigue pendiente, con su teléfono.
    await expect(page.getByText('+34 612 34 56 78').first()).toBeVisible();
  });
});
