import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// P2-3. "El dashboard dice 0% ocupación con la clase de hoy llena."
//
// El lunes de la semana se calculaba a mano: `getDate() - getDay() + 1`. De
// lunes a sábado sale bien; el DOMINGO `getDay()` vale 0, así que suma un día y
// la ventana pasa a ser la semana SIGUIENTE. Hoy queda fuera, no hay sesiones
// que contar, y la ocupación se muestra como 0% con las clases del día llenas.
//
// Seis de cada siete días el bug es invisible, así que el reloj se congela: un
// DOMINGO y un MIÉRCOLES, con exactamente los mismos datos. Antes del arreglo el
// domingo daba 0% y el miércoles 100%.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

// 2026-08-09 es DOMINGO; 2026-08-05, MIÉRCOLES. Misma semana natural (lun 3 → dom 9).
const DOMINGO = '2026-08-09';
const MIERCOLES = '2026-08-05';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Una clase HOY, llena: 4 plazas y 4 reservas confirmadas → 100 %. */
function datosDelDia(hoy: string) {
  const sesiones = [{
    id: 'ses-hoy', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1',
    instructor_id: 'ins-1', inicio: `${hoy}T09:00:00+00:00`, fin: `${hoy}T10:00:00+00:00`,
    aforo_maximo: 4, cancelada: false, notas: null, serie_id: null, precio_puntual: null,
  }];
  const reservas = ['r1', 'r2', 'r3', 'r4'].map((id, n) => ({
    id, studio_id: STUDIO_ID, sesion_id: 'ses-hoy', socio_id: `s${n}`,
    estado: 'CONFIRMADA', creada_en: `${hoy}T08:00:00+00:00`,
  }));
  return { sesiones, reservas };
}

async function montarDashboard(page: Page, hoy: string) {
  // Congela el reloj del navegador: el dashboard hace `new Date()` en el cliente.
  await page.clock.setFixedTime(new Date(`${hoy}T12:00:00`));

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

  const { sesiones, reservas } = datosDelDia(hoy);

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/tipos_clase**', route =>
    json(route, [{ id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', color: '#F7A6C4', duracion_minutos: 60, descripcion: null, nivel: 'TODOS', foto_url: null }]));
  await page.route('**/rest/v1/salas**', route =>
    json(route, [{ id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala 1', capacidad: 4, color: '#6366F1' }]));
  await page.route('**/rest/v1/sesiones**', route => json(route, sesiones));
  await page.route('**/rest/v1/reservas**', route => json(route, reservas));

  await page.goto('/dashboard');
}

/**
 * El % de "Ocupación semana". Se lee del enlace a /informes del resumen de
 * arriba, que lleva cifra y etiqueta en el mismo nodo. (La otra tarjeta con esa
 * etiqueta pinta la MISMA variable `ocupacionMedia`, así que basta con una.)
 */
async function ocupacionMostrada(page: Page): Promise<string> {
  const tile = page.getByRole('link', { name: /Ocupación semana/ });
  await tile.waitFor({ timeout: 30_000 });
  const txt = await tile.innerText();
  return txt.match(/(\d+)\s*%/)?.[1] ?? `sin % (${txt.replace(/\n/g, ' | ')})`;
}

test.describe('Ocupación de la semana en el dashboard', () => {
  test('un MIÉRCOLES cuenta la clase de hoy', async ({ page }) => {
    await montarDashboard(page, MIERCOLES);
    expect(await ocupacionMostrada(page)).toBe('100');
  });

  test('un DOMINGO cuenta la misma clase igual (era 0%)', async ({ page }) => {
    await montarDashboard(page, DOMINGO);
    // Con el cálculo roto la ventana era la semana siguiente → 0 sesiones → 0 %.
    expect(await ocupacionMostrada(page)).toBe('100');
  });
});
