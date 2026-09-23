import { test, expect, type Route } from '@playwright/test';

// La agenda del día no puede esperar al arranque del panel.
//
// `DashboardShell` tapa la página con el esqueleto hasta que `studio` deja de
// ser `null`, y eso pasa al TERMINAR las ~28 consultas del arranque. Antes de
// este arreglo, «Hoy en el estudio» ni siquiera podía EMPEZAR a pedir su día
// hasta entonces: primero el arranque entero, y solo después el viaje de red de
// la agenda.
//
// ⚠️ Este test tiene que medir el ORDEN, no el resultado. Comprobar que la
// agenda acaba pintándose pasa en verde con el arreglo y sin él — la diferencia
// no es QUÉ se ve, es CUÁNDO se pide. Por eso la consulta del estudio se queda
// en vuelo a propósito y se fotografía, en ese preciso instante, si la agenda ya
// se había pedido. Sin arreglo esa foto sale en `false`.
//
// Andamiaje propio y no `hoy-home-mock.ts`: aquí hacen falta rutas que se
// registren ANTES de navegar y que se contesten en un orden concreto, que es lo
// contrario de lo que ese ayudante hace (montar y listo).

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const AHORA = '2026-09-08T10:00:00.000Z';

function json(route: Route, body: unknown) {
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
}

// En local el servidor compila `/dashboard` bajo demanda y la primera vez pasa
// de los 30 s por defecto (en CI se sirve ya construido y no aplica). Estos
// tests además dejan una consulta en vuelo a propósito, así que el margen tiene
// que cubrir las dos cosas.
test.describe.configure({ timeout: 150_000 });

const ESPERA_MAX_MS = 8_000;

async function esperarA(cond: () => boolean): Promise<void> {
  const limite = Date.now() + ESPERA_MAX_MS;
  while (!cond() && Date.now() < limite) await new Promise(r => setTimeout(r, 25));
}

test('la agenda del día se pide MIENTRAS carga el arranque, no después', async ({ page }) => {
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

  let agendaPedida = false;
  /** Si la agenda ya estaba pedida en el instante en que el arranque contestó
   *  la consulta del estudio. `null` = esa consulta no llegó a pasar. */
  let agendaPedidaAntesDelEstudio: boolean | null = null;

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#343825', secondary: '#5A6142', logoUrl: null, radius: 12 }));
  await page.route('**/api/calendario**', route => {
    agendaPedida = true;
    json(route, { sesiones: [], reservas: [], salas: [], instructores: [] });
  });

  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  // La consulta que abre el gate: se deja en vuelo hasta que la agenda se pida
  // (o hasta que se acabe la paciencia), y se fotografía el estado justo aquí.
  await page.route('**/rest/v1/studios**', async route => {
    if (agendaPedidaAntesDelEstudio === null) {
      await esperarA(() => agendaPedida);
      agendaPedidaAntesDelEstudio = agendaPedida;
    }
    await json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID });
  });

  await page.goto('/dashboard');

  // El panel termina de cargar igual: el arreglo adelanta la petición, no
  // cambia lo que se ve.
  await expect(page.getByRole('region', { name: 'Hoy en el estudio' })).toBeVisible({ timeout: 60_000 });

  expect(
    agendaPedidaAntesDelEstudio,
    'la agenda tiene que pedirse mientras el arranque sigue en vuelo, no al terminar',
  ).toBe(true);
});

test('el relevo es de un solo uso: cambiar de día vuelve a pedir de verdad', async ({ page }) => {
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

  const rangos: string[] = [];
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#343825', secondary: '#5A6142', logoUrl: null, radius: 12 }));
  await page.route('**/api/calendario**', route => {
    rangos.push(new URL(route.request().url()).searchParams.get('desde') ?? '');
    json(route, { sesiones: [], reservas: [], salas: [], instructores: [] });
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));

  await page.goto('/dashboard');
  const agenda = page.getByRole('region', { name: 'Hoy en el estudio' });
  await expect(agenda).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => rangos.length, { timeout: 30_000 }).toBeGreaterThan(0);

  await agenda.getByRole('button', { name: 'Día siguiente' }).click();
  // Otro día es otro rango, y tiene que viajar de verdad: si el relevo se
  // pudiera recoger dos veces, aquí se serviría el día de hoy otra vez.
  await expect.poll(() => new Set(rangos).size, { timeout: 30_000 }).toBeGreaterThan(1);
});

