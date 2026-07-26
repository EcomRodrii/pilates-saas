import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// P2-1. "Cuatro palabras para lo mismo: Clientas, socias, alumnas, clientes. En
// el mismo panel: menú 'Clientas', botón 'Nuevo cliente', 'Libreta de socias',
// '1 Alumnos hoy'. Mi recepcionista pregunta si son cosas distintas. Y 'Alumnos'
// en masculino en un estudio de mujeres."
//
// El panel usa UNA palabra: clienta(s). Este test recorre las pantallas del día
// a día y falla si vuelve a aparecer otra para referirse a lo mismo.
//
// OJO con lo que NO entra: "Miembros" en Equipo son las INSTRUCTORAS, que es
// otro concepto y ahí está bien dicho. Y el portal, los emails y la landing
// tienen su propia voz — se revisan aparte, no de rebote.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

// Sinónimos desterrados del panel cuando se habla de la clientela.
const SINONIMOS = [/\bAlumnos\b/, /\bAlumnas\b/, /\bsocias\b/, /\bSocias\b/, /\bNuevo cliente\b/];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const SOCIA = {
  id: 's1', studio_id: STUDIO_ID, nombre: 'Ana', apellidos: 'Ruiz', email: 'ana@example.com',
  telefono: null, activo: true, fecha_alta: '2026-01-01', campos_extra: {}, tags: [],
};

async function montar(page: Page, ruta: string) {
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
  await page.route('**/api/billing/status**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/rpc/stats_clientas', route =>
    json(route, [{ total: 1, activas: 1, con_bono: 0, inactivas_30d: 0 }]));
  await page.route('**/rest/v1/socios**', route => json(route, [SOCIA]));

  await page.goto(ruta);
}

/**
 * Espera a un ancla ANTES de leer: varias pantallas cargan en diferido y barrer
 * demasiado pronto da un verde falso sobre una página vacía (nos pasó ya una vez).
 *
 * El ancla NO puede ser una de las cadenas que se están comprobando: si lo es y
 * hay una regresión, el test muere por timeout en vez de decir qué sinónimo se
 * coló. Se usa siempre algo estable y ajeno al vocabulario.
 */
async function textoDe(page: Page, ancla: RegExp): Promise<string> {
  await page.getByText(ancla).first().waitFor({ timeout: 30_000 });
  return page.locator('body').innerText();
}

test.describe('El panel usa una sola palabra: clientas', () => {
  test('el dashboard no mezcla alumnos, socias y clientes', async ({ page }) => {
    await montar(page, '/dashboard');
    const texto = await textoDe(page, /Pagos pendientes/);

    for (const s of SINONIMOS) {
      expect(texto, `sinónimo suelto en el dashboard: ${s}`).not.toMatch(s);
    }
    // Y lo que ella citaba, ya en su idioma y en femenino.
    await expect(page.getByText('Clientas hoy')).toBeVisible();
    await expect(page.getByText('Nueva clienta').first()).toBeVisible();
  });

  test('la libreta habla de clientas, no de socias', async ({ page }) => {
    await montar(page, '/libreta');
    const texto = await textoDe(page, /Libreta del estudio/);

    for (const s of SINONIMOS) {
      expect(texto, `sinónimo suelto en la libreta: ${s}`).not.toMatch(s);
    }
    await expect(page.getByText(/Copia de tus clientas siempre al día/)).toBeVisible();
  });

  test('el menú lateral dice "Configuración", que es la palabra que se busca', async ({ page }) => {
    await montar(page, '/dashboard');
    // Estaba en el menú, pero llamado "Mi estudio" — mientras la página se titula
    // "Configuración". Ella lo daba por ausente y llegaba pinchando su propia foto.
    await expect(page.getByRole('link', { name: 'Configuración' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Mi estudio' })).toHaveCount(0);
    // "Libreta de clientas" no se comprueba aquí: /libreta no está en el modo
    // Esencial, que es el que trae el menú por defecto.
  });

  test('"Miembros" sigue significando el EQUIPO, que es otra cosa', async ({ page }) => {
    await montar(page, '/equipo');
    // Aquí sí debe seguir diciendo Miembros: son las instructoras, no la clientela.
    await expect(page.getByText('Miembros').first()).toBeVisible({ timeout: 30_000 });
  });
});
