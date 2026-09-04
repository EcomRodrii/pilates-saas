import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Averías de máquina: Configuración → Salas tiene que enseñar las que YA hay.
//
// Desde #1375 (Sprint 1) el panel no cargaba `bloqueos_maquina` en absoluto:
// la consulta se quitó del arranque "para cargarla desde su página", y ninguna
// página la pidió nunca (`dbListBloqueosMaquina` se quedó sin un solo caller).
// Cada sesión nueva decía «No hay averías activas» con averías abiertas en BD
// — y `aforoEfectivoSesion` (bandeja «Para hoy») seguía contando la máquina
// rota como si funcionara. Ahora llegan en la 2ª ola (fetchDeferredStudioData),
// igual que condiciones_salud, plazas_fijas y recuperaciones.
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
const SALA = { id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala Reformer', capacidad: 10, color: '#F7A6C4' };
// Avería ABIERTA (sin fecha de arreglo), tal y como la devuelve PostgREST.
const AVERIA_ROW = {
  id: 'bm-1', studio_id: STUDIO_ID, sala_id: 'sala-1', spot_id: null,
  desde: '2026-08-01T09:00:00+00:00', hasta: null, motivo: 'Muelle roto',
  creado_en: '2026-08-01T09:00:00+00:00',
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
  const patches: { url: string; body: Record<string, unknown> }[] = [];

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
  await page.route('**/rest/v1/salas**', route => json(route, [SALA]));
  await page.route('**/rest/v1/bloqueos_maquina**', route => {
    const req = route.request();
    if (req.method() === 'PATCH') {
      patches.push({ url: req.url(), body: req.postDataJSON() });
      return json(route, []);
    }
    lecturas.push(req.url());
    return json(route, [AVERIA_ROW]);
  });

  await page.goto('/configuracion?tab=salas');
  await expect(page.getByRole('button', { name: 'Nueva sala' })).toBeVisible({ timeout: 30_000 });
  return { lecturas, patches };
}

test.describe('Averías de máquina: se ven al entrar', () => {
  test('la lista enseña la avería abierta que ya estaba en la base de datos', async ({ page }) => {
    const { lecturas } = await montar(page);

    // Llega en la 2ª ola: hay un instante de «No hay averías activas» antes.
    // Se espera la avería, nunca se aserta la ausencia del vacío.
    await expect(page.getByText('Sala Reformer — Muelle roto')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/sin fecha de arreglo/)).toBeVisible();
    await expect(page.getByText('No hay averías activas.')).toHaveCount(0);

    // El panel PIDIÓ la tabla de verdad (antes no salía ninguna petición).
    expect(lecturas.length).toBeGreaterThan(0);
    expect(lecturas[0]).toContain(`studio_id=eq.${STUDIO_ID}`);
  });

  test('«Marcar arreglada» cierra ESA avería: el PATCH lleva el id que vino de la base de datos', async ({ page }) => {
    const { patches } = await montar(page);
    await expect(page.getByText('Sala Reformer — Muelle roto')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Marcar arreglada' }).click();

    await expect(page.getByText('Máquina marcada como arreglada')).toBeVisible();
    expect(patches).toHaveLength(1);
    expect(patches[0].url).toContain('id=eq.bm-1');
    expect(typeof patches[0].body.hasta).toBe('string');
  });
});
