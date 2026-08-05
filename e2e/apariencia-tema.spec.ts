import { test, expect, type Page, type Route } from '@playwright/test';
import { resolveTheme } from '../lib/theme-schema.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Biblioteca de temas (/configuracion/apariencia) — la pantalla de llegada de
// Apariencia, donde se elige el tema viéndolo pintado. Antes esto era la
// categoría "Tema" dentro del editor; al mudarse a su propia pantalla, estas
// pruebas se mudaron con ella (el editor ya no duplica la galería).
//
// No se puede verificar en el preview de Vercel de la PR (Turnstile bloquea el
// login en *.vercel.app — ver README), así que la verificación pasa por aquí,
// mockeando red con page.route (mismo patrón que apariencia-boton-tarjeta).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const BLOQUES_HOME_DEFAULT = [
  { id: 'sistema-estaSemana', kind: 'sistema', sistemaId: 'estaSemana' },
  { id: 'sistema-accesosRapidos', kind: 'sistema', sistemaId: 'accesosRapidos' },
  { id: 'sistema-invitarAmiga', kind: 'sistema', sistemaId: 'invitarAmiga' },
  { id: 'sistema-contenidoEstudio', kind: 'sistema', sistemaId: 'contenidoEstudio' },
  { id: 'sistema-tiraSemana', kind: 'sistema', sistemaId: 'tiraSemana', oculto: true },
  { id: 'sistema-progresoSemanal', kind: 'sistema', sistemaId: 'progresoSemanal', oculto: true },
  // Bloque del catálogo ya añadido por la propietaria — tiene que sobrevivir
  // a instalar un tema nuevo.
  { id: 'b-texto-1', kind: 'texto', config: { titulo: 'Bienvenidas', texto: 'x' } },
];

async function montar(page: Page, themeGuardado: Record<string, unknown> = {}) {
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

  const puts: Record<string, unknown>[] = [];
  const putsBloquesHome: unknown[][] = [];

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/billing/status**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  const themeResuelto = resolveTheme({ primary: '#6D28D9', secondary: '#7C3AED', ...themeGuardado });
  await page.route('**/api/theme**', route => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      puts.push(body);
      return json(route, resolveTheme(body));
    }
    return json(route, themeResuelto);
  });
  let bloquesHomeActuales: unknown[] = BLOQUES_HOME_DEFAULT;
  await page.route('**/api/portal-bloques**', route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('pantalla') !== 'home') return json(route, []);
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as unknown[];
      putsBloquesHome.push(body);
      bloquesHomeActuales = body;
      return json(route, body);
    }
    return json(route, bloquesHomeActuales);
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.goto('/configuracion/apariencia');
  return { puts, putsBloquesHome };
}

/** La fila de un tema dentro de la tarjeta "Biblioteca de temas". */
function filaTema(page: Page, id: string) {
  return page.locator(`[data-tema="${id}"]`);
}

test.describe('Biblioteca de temas', () => {
  test('lista los temas de la galería, con el activo marcado "En uso"', async ({ page }) => {
    await montar(page);
    await expect(page.getByRole('heading', { name: 'Biblioteca de temas' })).toBeVisible({ timeout: 30_000 });

    // Los tres temas con paleta propia de la última tanda, y los previos.
    for (const id of ['classic', 'geometric', 'editorial', 'oliva', 'bloom', 'noir']) {
      await expect(filaTema(page, id)).toBeVisible();
    }
    // Sin themeId guardado, el tema resuelto es "classic" → es el que está en uso.
    await expect(filaTema(page, 'classic').getByText('En uso')).toBeVisible();
    await expect(filaTema(page, 'noir').getByText('En uso')).toHaveCount(0);
  });

  test('"Tu tema" muestra el tema instalado con su versión', async ({ page }) => {
    await montar(page, { themeId: 'editorial', themeVersion: 1 });
    await expect(page.getByRole('heading', { name: 'Tu tema' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('v1').first()).toBeVisible();
  });

  test('"Usar" en un tema lo guarda en el borrador con sus defaults', async ({ page }) => {
    const { puts } = await montar(page);
    await expect(page.getByRole('heading', { name: 'Biblioteca de temas' })).toBeVisible({ timeout: 30_000 });

    // "Usar" solo aparece en los temas que NO están en uso.
    const usarGeometrico = filaTema(page, 'geometric').getByRole('button', { name: 'Usar' });
    await Promise.all([
      page.waitForRequest(r => r.url().includes('/api/theme') && r.method() === 'PUT'),
      usarGeometrico.click(),
    ]);

    const body = puts.at(-1)!;
    expect(body.themeId).toBe('geometric');
    expect(body.themeVersion).toBe(1);
    expect(body.portalHeadingFontId).toBe('outfit');
    expect(body.themeCustomized).toBe(false);
  });

  test('"Usar" en Noir manda su paleta, la barra oscura y el acento destacado', async ({ page }) => {
    const { puts } = await montar(page);
    await expect(page.getByRole('heading', { name: 'Biblioteca de temas' })).toBeVisible({ timeout: 30_000 });

    await Promise.all([
      page.waitForRequest(r => r.url().includes('/api/theme') && r.method() === 'PUT'),
      filaTema(page, 'noir').getByRole('button', { name: 'Usar' }).click(),
    ]);

    const body = puts.at(-1)!;
    expect(body.themeId).toBe('noir');
    expect(body.barraOscura).toBe(true);
    expect(body.barraClasica).toBe(true);
    expect(body.primary).toBe('#1E2B22');
    expect(body.secondary).toBe('#A9B79B');
    expect(body.destacado).toBe('#D9B166');
    expect(body.cardStyle).toBe('flat');
    expect(body.radioTema).toEqual({ card: 24, boton: 18 });
  });

  test('"Usar" en Bloom manda la barra flotante y el radio de la tarjeta', async ({ page }) => {
    const { puts } = await montar(page);
    await expect(page.getByRole('heading', { name: 'Biblioteca de temas' })).toBeVisible({ timeout: 30_000 });

    await Promise.all([
      page.waitForRequest(r => r.url().includes('/api/theme') && r.method() === 'PUT'),
      filaTema(page, 'bloom').getByRole('button', { name: 'Usar' }).click(),
    ]);

    const body = puts.at(-1)!;
    expect(body.themeId).toBe('bloom');
    expect(body.barraFlotante).toBe(true);
    expect(body.barraClasica).toBeFalsy(); // sigue flotando — el prototipo solo hace clásica Oliva/Noir
    expect(body.destacado).toBe('#FF8FB1');
    expect(body.cardStyle).toBe('elevated');
    expect(body.radioTema).toEqual({ card: 30, boton: 999 });
  });

  test('"Usar" en Oliva manda su radio de tarjeta/botón y la barra clásica', async ({ page }) => {
    const { puts } = await montar(page);
    await expect(page.getByRole('heading', { name: 'Biblioteca de temas' })).toBeVisible({ timeout: 30_000 });

    await Promise.all([
      page.waitForRequest(r => r.url().includes('/api/theme') && r.method() === 'PUT'),
      filaTema(page, 'oliva').getByRole('button', { name: 'Usar' }).click(),
    ]);

    const body = puts.at(-1)!;
    expect(body.themeId).toBe('oliva');
    expect(body.barraClasica).toBe(true);
    expect(body.barraOscura).toBeFalsy(); // clásica, no oscura — esa es solo de Noir
    expect(body.cardStyle).toBe('flat');
    expect(body.radioTema).toEqual({ card: 26, boton: 20 });
  });

  test('"Usar" en Oliva siembra el Inicio: tiraSemana visible, estaSemana/invitarAmiga ocultos, catálogo intacto', async ({ page }) => {
    const { putsBloquesHome } = await montar(page);
    await expect(page.getByRole('heading', { name: 'Biblioteca de temas' })).toBeVisible({ timeout: 30_000 });

    // waitForResponse, no waitForRequest: el evento "request" puede llegar
    // ANTES de que nuestro propio handler de page.route (que hace el
    // putsBloquesHome.push) termine de ejecutarse — carrera real, vista en
    // vivo (waitForRequest resolvía con el array todavía vacío). La
    // respuesta solo llega DESPUÉS de que route.fulfill() corra, así que
    // esperar a la respuesta garantiza que el push ya sucedió.
    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/portal-bloques') && r.url().includes('pantalla=home') && r.request().method() === 'PUT'),
      filaTema(page, 'oliva').getByRole('button', { name: 'Usar' }).click(),
    ]);

    const body = putsBloquesHome.at(-1) as Array<Record<string, unknown>>;
    const porId = (id: string) => body.find((b) => b.sistemaId === id);
    expect(porId('accesosRapidos')?.oculto).toBeFalsy();
    expect(porId('tiraSemana')?.oculto).toBeFalsy();
    expect(porId('contenidoEstudio')?.oculto).toBeFalsy();
    expect(porId('estaSemana')?.oculto).toBe(true);
    expect(porId('invitarAmiga')?.oculto).toBe(true);
    expect(porId('progresoSemanal')?.oculto).toBe(true); // Oliva no lo pide
    // El bloque del catálogo que ya tenía la propietaria sigue ahí.
    expect(body.some((b) => b.kind === 'texto' && b.id === 'b-texto-1')).toBe(true);
  });

  test('"Personalizar" lleva al editor', async ({ page }) => {
    await montar(page);
    await expect(page.getByRole('heading', { name: 'Tu tema' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('link', { name: 'Personalizar' }).first().click();
    await expect(page).toHaveURL(/\/configuracion\/apariencia\/editor/);
  });
});
