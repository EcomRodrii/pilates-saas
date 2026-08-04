import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Constructor de bloques del portal, dentro del editor a pantalla completa
// (PR 4 — components/theme/theme-editor-fullscreen.tsx). Antes vivía en su
// propia pestaña ("Bloques del portal" → "Secciones", con un selector de
// página); ahora es el grupo "Pantallas" del rail izquierdo, con Inicio
// desplegado por defecto (mismo motivo que antes: es la vista de llegada).
// Guardar borrador/Publicar por pantalla desaparecen — todo pasa por el
// botón único "Publicar" de la barra superior + el diálogo "Antes de
// publicar", que guarda y publica tema + bloques de Inicio/Clases/Bonos
// juntos.
//
// Verifica el lado del EDITOR — el lado del consumo (portal cliente) se
// verifica en e2e/portal-home-modulos.spec.ts (legacy) y
// e2e/portal-home-bloques-render.spec.ts (bloques nuevos).
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
];
const BLOQUES_CLASES_DEFAULT = [{ id: 'sistema-listadoClases', kind: 'sistema', sistemaId: 'listadoClases' }];
const BLOQUES_BONOS_DEFAULT = [{ id: 'sistema-listadoBonos', kind: 'sistema', sistemaId: 'listadoBonos' }];

async function montar(page: Page, opts: { bloquesHomeGuardar?: unknown[] } = {}) {
  const putsPorPantalla: Record<string, unknown[][]> = { home: [], clases: [], bonos: [] };
  const publicadasPorPantalla: Record<string, number> = { home: 0, clases: 0, bonos: 0 };
  let temaPublicaciones = 0;

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
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/billing/status**', route => json(route, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  await page.route('**/api/layout**', route => json(route, {
    orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] }, portalHome: { orden: [], ocultos: [] },
  }));
  await page.route('**/api/theme**', route => {
    if (route.request().url().endsWith('/publish')) { temaPublicaciones++; return json(route, { primary: '#6D28D9', secondary: '#7C3AED' }); }
    return json(route, { primary: '#6D28D9', secondary: '#7C3AED' });
  });

  const bloques: Record<string, unknown[]> = {
    home: opts.bloquesHomeGuardar ?? BLOQUES_HOME_DEFAULT,
    clases: BLOQUES_CLASES_DEFAULT,
    bonos: BLOQUES_BONOS_DEFAULT,
  };
  await page.route('**/api/portal-bloques**', route => {
    const url = new URL(route.request().url());
    const pantalla = url.searchParams.get('pantalla') ?? 'home';
    if (url.pathname.endsWith('/publish')) { publicadasPorPantalla[pantalla]++; return json(route, bloques[pantalla]); }
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as unknown[];
      putsPorPantalla[pantalla].push(body);
      bloques[pantalla] = body;
      return json(route, body);
    }
    return json(route, bloques[pantalla]);
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  // El editor a pantalla completa arranca con "Inicio" ya desplegado en el
  // grupo Pantallas del rail — es la vista de llegada, no hace falta
  // clicar nada para ver sus bloques.
  await page.goto('/configuracion/apariencia/editor');
  return { putsPorPantalla, publicadasPorPantalla, temaPublicacionesRef: () => temaPublicaciones };
}

/** Publica desde el botón único de la barra superior + el diálogo "Antes de publicar". */
async function publicar(page: Page) {
  await page.getByRole('button', { name: 'Publicar', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Publicar/ }).click();
}

test.describe('Editor a pantalla completa — constructor de bloques del portal', () => {
  test('Inicio llega desplegado, con los 4 módulos de siempre listados', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Esta semana')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Accesos rápidos/)).toBeVisible();
    await expect(page.getByText('Invita a una amiga')).toBeVisible();
    await expect(page.getByText(/Contenido del estudio/)).toBeVisible();
  });

  test('ocultar "Invita a una amiga" es local hasta publicar — no manda nada al servidor solo', async ({ page }) => {
    const { putsPorPantalla } = await montar(page);
    await expect(page.getByText('Invita a una amiga')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Ocultar Invita a una amiga' }).click();
    await expect(page.getByRole('button', { name: 'Mostrar Invita a una amiga' })).toBeVisible();

    // Nada de "guardar borrador" suelto en el editor a pantalla completa: sin
    // pulsar Publicar, no hay ningún PUT.
    await page.waitForTimeout(300);
    expect(putsPorPantalla.home).toHaveLength(0);
  });

  test('añadir un bloque de texto, configurarlo y publicar manda el borrador y publica las 3 pantallas', async ({ page }) => {
    const { putsPorPantalla, publicadasPorPantalla, temaPublicacionesRef } = await montar(page);
    await expect(page.getByText('Esta semana')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Añadir bloque' }).click();
    await page.getByRole('button', { name: /^Texto/ }).click();
    await page.locator('textarea').first().fill('Bienvenidas al estudio');

    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/portal-bloques/publish') && r.url().includes('pantalla=home')),
      publicar(page),
    ]);

    expect(putsPorPantalla.home.at(-1)).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'texto' })]));
    expect(publicadasPorPantalla.home).toBe(1);
    expect(publicadasPorPantalla.clases).toBe(1);
    expect(publicadasPorPantalla.bonos).toBe(1);
    expect(temaPublicacionesRef()).toBe(1);
    await expect(page.getByText('¡Publicado!')).toBeVisible();
  });

  test('un bloque de texto vacío bloquea Publicar con "está incompleto"', async ({ page }) => {
    await montar(page, { bloquesHomeGuardar: [...BLOQUES_HOME_DEFAULT, { id: 'b-vacio', kind: 'texto', config: { titulo: '', texto: '' } }] });
    await expect(page.getByText('Esta semana')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Publicar', exact: true }).click();
    const dialogo = page.getByRole('dialog');
    await expect(dialogo.getByText(/está incompleto/)).toBeVisible();
    await expect(dialogo.getByRole('button', { name: /Publicar/ })).toBeDisabled();
  });

  test('eliminar un bloque del catálogo (no un bloque sistema) lo quita de la lista', async ({ page }) => {
    await montar(page, {
      bloquesHomeGuardar: [
        ...BLOQUES_HOME_DEFAULT,
        { id: 'b-1', kind: 'texto', config: { titulo: 'Aviso', texto: 'x' } },
      ],
    });
    await expect(page.getByText('Aviso').or(page.getByText('Texto'))).toBeVisible({ timeout: 30_000 });
    // Los bloques `sistema` no tienen botón de eliminar; el nuevo sí.
    await expect(page.getByRole('button', { name: /Eliminar Esta semana/ })).toHaveCount(0);
    const eliminar = page.getByRole('button', { name: /Eliminar Texto/ });
    await expect(eliminar).toBeVisible();
    await eliminar.click();
    await expect(eliminar).toHaveCount(0);
  });

  test('desplegar Clases muestra su bloque sistema propio', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Esta semana')).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Desplegar Clases' }).click();
    await expect(page.getByText('Calendario de clases', { exact: true })).toBeVisible();
  });
});
