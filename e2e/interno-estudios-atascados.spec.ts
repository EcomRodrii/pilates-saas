import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Estudios atascados en /interno/crecimiento (app/interno/crecimiento/
// estudios-atascados.tsx). La lógica (umbral, duplicados, seguimiento, motivo)
// está en lib/alta/atascados.test.ts; aquí, lo que se ve y lo que se envía.
// ⚠️ Los caminos de fallo llevan CONTADOR de peticiones: «no anunció éxito»
// también sería verdad si el botón no hubiera enviado nada.
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'sb-example-auth-token';
const CLAVE = '11111111-1111-4111-8111-111111111111';

const alerta = (o: Record<string, unknown> = {}) => ({
  fila: {
    clave: CLAVE, studioId: 's1', nombre: 'Estudio Alba', email: 'alba@example.com',
    altaEn: '2026-11-01T10:00:00Z', emailConfirmadoEn: '2026-11-01T10:05:00Z', estudioCreadoEn: '2026-11-01T10:10:00Z',
    ultimoAccesoEn: null, ultimaActividadEn: '2026-11-01T10:10:00Z', tieneTipoClase: false, tieneClase: false,
    tieneTarifaActiva: false, claseReservable: false, tieneReserva: false, errorEstudioEn: null, version: 'v2', seguimiento: null,
  },
  estado: 'sin_clase', situacion: 'pendiente', diasSinActividad: 9, ultimaActividad: '2026-11-01T10:10:00Z',
  ultimoPaso: 'Creó su estudio', motivo: 'Creó el estudio y no ha vuelto al panel.', ...o,
});
const resumen = { pendientes: 1, contactadas: 0, pospuestas: 0, cerradas: 0 };

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function preparar(page: Page, opts: { alertas?: unknown[]; post?: (route: Route) => Promise<void> | void } = {}) {
  await page.addInitScript(key => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh', expires_at: 4102444800, expires_in: 999999999,
      token_type: 'bearer',
      user: { id: 'u-f', email: 'equipo@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, STORAGE_KEY);
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/api/interno/sesion**', route =>
    json(route, { nombre: 'Equipo', cargo: 'Fundador', email: 'equipo@example.com', permisos: ['admin.full'] }));
  await page.route('**/api/interno/crecimiento**', route => json(route, { leads: [], estudios: [], peticiones: [] }));
  const posts: unknown[] = [];
  await page.route('**/api/interno/crecimiento/atascados', async route => {
    if (route.request().method() === 'POST') {
      posts.push(route.request().postDataJSON());
      return opts.post ? opts.post(route) : json(route, { ok: true });
    }
    return json(route, { alertas: opts.alertas ?? [alerta()], resumen });
  });
  return posts;
}

test.describe('Estudios atascados', () => {
  test('enseña lo que hace falta para escribir a la persona: estudio, correo, paso, días y motivo', async ({ page }) => {
    await preparar(page);
    await page.goto('/interno/crecimiento');
    const fila = page.getByTestId('estudio-atascado');
    await expect(fila).toBeVisible({ timeout: 30_000 });
    await expect(fila).toContainText('Estudio Alba');
    await expect(fila).toContainText('alba@example.com');
    await expect(fila).toContainText('9 días sin actividad');
    await expect(fila).toContainText('Último paso: Creó su estudio');
    await expect(fila).toContainText('Motivo probable');
    const mailto = await fila.getByRole('link', { name: 'Escribirle' }).getAttribute('href');
    expect(mailto).toMatch(/^mailto:alba@example\.com\?subject=/);
  });

  test('sin atascados lo dice, no deja la sección vacía', async ({ page }) => {
    await preparar(page, { alertas: [] });
    await page.goto('/interno/crecimiento');
    await expect(page.getByText('Ahora mismo no hay ningún estudio atascado.')).toBeVisible({ timeout: 30_000 });
  });

  test('«Marcar contactado» manda UNA petición aunque se pulse dos veces', async ({ page }) => {
    const posts = await preparar(page, {
      post: async route => { await new Promise(r => setTimeout(r, 400)); await json(route, { ok: true }); },
    });
    await page.goto('/interno/crecimiento');
    const boton = page.getByRole('button', { name: 'Marcar contactado' });
    await expect(boton).toBeVisible({ timeout: 30_000 });
    await boton.dblclick();
    await expect.poll(() => posts.length).toBeGreaterThan(0);
    await page.waitForTimeout(600);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ clave: CLAVE, accion: 'contactado' });
  });

  test('si el servidor dice que no, se ve el error (y sí se intentó)', async ({ page }) => {
    const posts = await preparar(page, { post: route => json(route, { error: 'No se ha podido guardar el seguimiento' }, 500) });
    await page.goto('/interno/crecimiento');
    await page.getByRole('button', { name: 'Cerrar', exact: true }).click({ timeout: 30_000 });
    await expect(page.getByRole('status')).toContainText('No se ha podido', { timeout: 10_000 });
    expect(posts.length).toBeGreaterThan(0);
  });

  test('posponer manda los días', async ({ page }) => {
    const posts = await preparar(page);
    await page.goto('/interno/crecimiento');
    await page.getByRole('button', { name: 'Posponer 7 días' }).click({ timeout: 30_000 });
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]).toMatchObject({ accion: 'pospuesta', dias: 7 });
  });

  test('sin permiso (403) la sección no se pinta', async ({ page }) => {
    await preparar(page);
    await page.route('**/api/interno/crecimiento/atascados', route => json(route, { error: 'Te falta el permiso "growth.read"' }, 403));
    const respuesta = page.waitForResponse(r => r.url().includes('/crecimiento/atascados') && r.status() === 403, { timeout: 30_000 });
    await page.goto('/interno/crecimiento');
    await respuesta; // la petición SE HIZO y contestó 403: no vale «no aparece» por no haberla pedido
    await expect(page.getByTestId('estudios-atascados')).toHaveCount(0);
  });
});
