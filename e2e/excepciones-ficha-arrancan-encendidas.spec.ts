import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Excepciones de la socia («porque lo digo yo»): la ficha tiene que arrancar
// con los toggles COMO ESTÁN en la base de datos.
//
// Desde #1375 (Sprint 1) el panel no cargaba `socio_excepciones`: la consulta
// se quitó del arranque y nadie la volvió a pedir. Efecto doble en cada sesión
// nueva: los toggles salían todos apagados aunque la excepción existiera, y al
// «encender» una que ya estaba puesta el toggle hacía un upsert de la misma
// fila — imposible QUITARLA desde la ficha sin recargar el estado por otra vía.
// Ahora llegan en la 2ª ola (fetchDeferredStudioData).
//
// Con contador de lecturas: un test que pasara sin haber pedido la tabla no
// probaría nada (ver .claude/tentare-os.md).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR',
};
const SOCIO = {
  id: 'soc-1', studio_id: STUDIO_ID, nombre: 'Ana', apellidos: 'Gil',
  email: 'ana@example.com', telefono: null, activo: true,
  fecha_alta: '2026-01-10T09:00:00+00:00', campos_extra: {},
};
// Una de las dos excepciones del catálogo (lib/excepciones.ts) ya activa.
const EXCEPCION_ROW = {
  id: 'exc-1', studio_id: STUDIO_ID, socio_id: 'soc-1', tipo: 'SIN_RECORDATORIO',
  motivo: null, creada_en: '2026-02-01T10:00:00+00:00',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function montar(page: Page) {
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
  const escrituras: { metodo: string; url: string }[] = [];

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
  await page.route('**/rest/v1/socio_excepciones**', route => {
    const req = route.request();
    if (req.method() !== 'GET') {
      escrituras.push({ metodo: req.method(), url: req.url() });
      return route.fulfill({ status: req.method() === 'DELETE' ? 204 : 201, contentType: 'application/json', body: '[]' });
    }
    lecturas.push(req.url());
    return json(route, [EXCEPCION_ROW]);
  });

  await page.goto('/clientas/soc-1');
  await expect(page.getByText('Ana Gil')).toBeVisible({ timeout: 30_000 });
  return { lecturas, escrituras };
}

test.describe('Excepciones de la ficha: arrancan como están en la base de datos', () => {
  test('la excepción que ya existe sale ENCENDIDA; la que no, apagada', async ({ page }) => {
    const { lecturas } = await montar(page);

    // Llega en la 2ª ola: hay un instante con todo apagado antes. Se espera el
    // toggle encendido, nunca se aserta que "ya" esté al primer pintado.
    await expect(page.getByRole('checkbox', { name: 'No enviarle recordatorios' })).toBeChecked({ timeout: 15_000 });
    await expect(page.getByRole('checkbox', { name: 'No avisarle de clases con hueco' })).not.toBeChecked();

    expect(lecturas.length).toBeGreaterThan(0);
    expect(lecturas[0]).toContain(`studio_id=eq.${STUDIO_ID}`);
  });

  test('apagar una excepción que ya existía la QUITA (DELETE), no la vuelve a poner', async ({ page }) => {
    const { escrituras } = await montar(page);
    const recordatorios = page.getByRole('checkbox', { name: 'No enviarle recordatorios' });
    await expect(recordatorios).toBeChecked({ timeout: 15_000 });

    await recordatorios.click();

    await expect(recordatorios).not.toBeChecked();
    // El intento SALIÓ de verdad, y fue un borrado de ESA excepción — con el
    // estado a ciegas de antes, esto habría sido un POST (upsert) de la misma fila.
    expect(escrituras).toHaveLength(1);
    expect(escrituras[0].metodo).toBe('DELETE');
    expect(escrituras[0].url).toContain('socio_id=eq.soc-1');
    expect(escrituras[0].url).toContain('tipo=eq.SIN_RECORDATORIO');
  });
});
