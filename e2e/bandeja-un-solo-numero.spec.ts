import { test, expect, type Page, type Route } from '@playwright/test';

// La bandeja («Lo que espera tu visto bueno») es la ÚNICA cifra de lo que
// espera a la propietaria en esta pantalla, y el banner de automatizaciones se
// recalculaba SU PROPIO número desde los logs del contexto: el mismo dato, dos
// veces en la misma pantalla, desde dos sitios que podían discrepar.
//
// ⚠️ Esto vale para un RESUMEN y no para una tarjeta con la que se trabaja. El
// recuento va cacheado hasta 30 s, así que su cero no significa «no hay nada»
// sino «hace un rato no había»; usarlo para no montar una tarjeta escondería
// trabajo pendiente. Lo fija `estado-del-estudio.spec.ts`.

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const AHORA = '2026-09-08T10:00:00.000Z';

// En local el servidor compila `/dashboard` bajo demanda y la primera vez pasa
// de los 30 s por defecto (en CI se sirve ya construido y no aplica).
test.describe.configure({ timeout: 150_000 });

function json(route: Route, body: unknown) {
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

interface LineaMock { id: string; n: number; texto: string; href: string | null }

async function montar(page: Page, decidir: LineaMock[]) {
  await page.clock.setFixedTime(new Date(AHORA));
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'duena@example.com', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#343825', secondary: '#5A6142', logoUrl: null, radius: 12 }));
  await page.route('**/api/calendario**', route =>
    json(route, { sesiones: [], reservas: [], salas: [], instructores: [] }));
  await page.route('**/api/estado-estudio**', route => json(route, {
    aplica: true,
    decidir,
    enMarcha: [],
    resuelto: [],
    nDecidir: decidir.reduce((s, l) => s + l.n, 0),
    titulo: decidir.length ? 'Algo espera tu visto bueno' : 'Nada espera tu visto bueno',
  }));
  // Todo lo de PostgREST vacío: en particular `automation_logs`, que es de donde
  // el banner sacaba su propio número. Así, si el banner dice «2», solo puede
  // venir de la bandeja.
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));

  await page.goto('/dashboard');
  await expect(page.getByRole('region', { name: 'Hoy en el estudio' })).toBeVisible({ timeout: 60_000 });
}

test('el banner de automatizaciones dice el número de la bandeja, no el suyo', async ({ page }) => {
  // `automation_logs` llega VACÍO (todo PostgREST devuelve []), así que el
  // recuento local sería 0 y el banner diría «ninguna espera tu visto bueno»
  // con la bandeja contando dos. Ese era el bug: dos números del mismo dato en
  // la misma pantalla, y el que se leía primero era el equivocado.
  await montar(page, [
    { id: 'automatizacionesEsperando', n: 2, texto: '2 automatizaciones esperan tu visto bueno', href: null },
  ]);
  const banner = page.getByRole('link', { name: /Sistema autónomo/ });
  await expect(banner).toBeVisible({ timeout: 30_000 });
  await expect(banner).toContainText('2 casos requiere tu atención');
  await expect(banner).not.toContainText('ninguna automatización');
});

test('sin automatizaciones esperando, el banner no se inventa ninguna', async ({ page }) => {
  await montar(page, []);
  const banner = page.getByRole('link', { name: /Sistema autónomo/ });
  await expect(banner).toBeVisible({ timeout: 30_000 });
  await expect(banner).toContainText('ninguna automatización espera tu visto bueno');
});
