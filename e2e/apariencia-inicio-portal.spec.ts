import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Fase 3 del editor de temas: constructor de bloques del Inicio del portal
// (pestaña "Bloques del portal" del dashboard, con Home como pantalla activa
// por defecto). Generaliza Fase 2 (reordenar/ocultar 4 módulos fijos) a
// añadir/quitar/configurar bloques del catálogo (banner/texto/cta/faq), con
// borrador/publicar propio — ver lib/portal-home-bloques.ts y
// lib/layout-data.ts. La Fase 1 del Theme Builder generalizó el mismo editor
// a Clases y Bonos (selector de pantalla arriba); este spec cubre solo Home.
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

const BLOQUES_DEFAULT = [
  { id: 'sistema-estaSemana', kind: 'sistema', sistemaId: 'estaSemana' },
  { id: 'sistema-accesosRapidos', kind: 'sistema', sistemaId: 'accesosRapidos' },
  { id: 'sistema-invitarAmiga', kind: 'sistema', sistemaId: 'invitarAmiga' },
  { id: 'sistema-contenidoEstudio', kind: 'sistema', sistemaId: 'contenidoEstudio' },
];

async function montar(page: Page, opts: { bloquesGuardar?: unknown[] } = {}) {
  const peticionesGuardar: unknown[][] = [];
  let publicadas = 0;

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
  await page.route('**/api/theme**', route => json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/api/layout**', route => json(route, {
    orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] }, portalHome: { orden: [], ocultos: [] },
  }));
  let bloquesActuales = opts.bloquesGuardar ?? BLOQUES_DEFAULT;
  await page.route('**/api/portal-bloques**', route => {
    const url = route.request().url();
    if (url.includes('/publish')) { publicadas++; return json(route, bloquesActuales); }
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as unknown[];
      peticionesGuardar.push(body);
      bloquesActuales = body;
      return json(route, body);
    }
    return json(route, bloquesActuales);
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  // El editor único (theme-workspace.tsx) arranca ya en "Secciones" con
  // "Portal — Inicio" como página por defecto — antes había que entrar a la
  // pestaña "Bloques del portal" a propósito, ahora es la vista de llegada.
  await page.goto('/configuracion/apariencia/editor');
  return { peticionesGuardar, publicadasRef: () => publicadas };
}

test.describe('Editor de temas — Fase 3: constructor de bloques del Inicio del portal', () => {
  test('los 4 módulos de siempre se listan, con la opción de ocultar cada uno', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('Esta semana')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Accesos rápidos/)).toBeVisible();
    await expect(page.getByText('Invita a una amiga')).toBeVisible();
    await expect(page.getByText(/Contenido del estudio/)).toBeVisible();
  });

  test('ocultar "Invita a una amiga" y guardar borrador manda el patch correcto, sin publicar', async ({ page }) => {
    const { peticionesGuardar, publicadasRef } = await montar(page);
    await expect(page.getByText('Invita a una amiga')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Ocultar Invita a una amiga' }).click();

    const [req] = await Promise.all([
      page.waitForRequest(r => r.url().includes('/api/portal-bloques?') && r.method() === 'PUT'),
      page.getByRole('button', { name: /Guardar borrador/ }).click(),
    ]);
    const body = req.postDataJSON() as Array<{ sistemaId?: string; oculto?: boolean }>;
    const invitar = body.find((b) => b.sistemaId === 'invitarAmiga');
    expect(invitar?.oculto).toBe(true);
    expect(body).toHaveLength(4);
    expect(peticionesGuardar).toHaveLength(1);
    expect(publicadasRef()).toBe(0); // "guardar borrador" no publica

    await expect(page.getByRole('button', { name: 'Mostrar Invita a una amiga' })).toBeVisible();
  });

  test('añadir un bloque de texto desde el catálogo, configurarlo y publicar', async ({ page }) => {
    const { publicadasRef } = await montar(page);
    await expect(page.getByText('Esta semana')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Añadir bloque' }).click();
    await page.getByRole('button', { name: /^Texto/ }).click();

    // El bloque nuevo se añade expandido, listo para configurar.
    const textos = page.locator('textarea');
    await textos.first().fill('Bienvenidas al estudio');

    await Promise.all([
      page.waitForResponse(r => r.url().includes('/api/portal-bloques/publish') && r.request().method() === 'POST'),
      page.getByRole('button', { name: /Publicar/ }).click(),
    ]);
    expect(publicadasRef()).toBe(1);
    await expect(page.getByText('¡Publicado!')).toBeVisible();
  });

  test('eliminar un bloque del catálogo (no un bloque sistema) lo quita de la lista', async ({ page }) => {
    await montar(page, {
      bloquesGuardar: [
        ...BLOQUES_DEFAULT,
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
});
