import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Consultas del formulario de contacto, en Clientas
// (components/clientas/consultas-contacto.tsx).
//
// ⚠️ Un UPDATE/DELETE que la RLS no deja pasar NO da error: vuelve 0 filas. La
// tarjeta solo da algo por hecho si vuelve la fila; se prueba con un PATCH que
// devuelve `[]` y con un 403, y siempre con contador de intentos.
// ─────────────────────────────────────────────────────────────────────────────

test.setTimeout(180_000);

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR', nif: 'B00000000',
};
const CONSULTA = {
  id: 'cc-1', nombre: 'Nueva Visitante', email: 'nueva@example.com', telefono: '+34 611 222 333',
  mensaje: '¿Tenéis clases para principiantes?', origen: 'web-contacto', estado: 'nueva',
  creada_en: '2026-09-26T10:00:00Z', atendida_en: null,
};

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

type Escritura = { status: number; body: unknown };

async function montar(page: Page, o: { patch?: Escritura; nuevas?: unknown[] } = {}) {
  const patches: string[] = [];
  let nuevas = o.nuevas ?? [CONSULTA];
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route => json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route => json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/socios**', route => json(route, []));
  // Después del catch-all: el último registrado manda.
  await page.route('**/rest/v1/consultas_contacto**', route => {
    const req = route.request();
    if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers: { 'content-range': '*/0' }, body: '' });
    if (req.method() === 'GET') return json(route, req.url().includes('estado=eq.nueva') ? nuevas : []);
    patches.push(req.url());
    const r = o.patch ?? { status: 200, body: [{ id: CONSULTA.id }] };
    if (r.status === 200 && Array.isArray(r.body) && r.body.length === 1) nuevas = [];
    return json(route, r.body, r.status);
  });
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'cloe@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);
  await page.goto('/clientas');
  return { patches: () => patches.length };
}

test('la consulta se ve arriba de Clientas, con cómo responder', async ({ page }) => {
  await montar(page);
  await expect(page.getByRole('heading', { name: '1 consulta nueva de tu web' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('¿Tenéis clases para principiantes?')).toBeVisible();
  const responder = page.getByRole('link', { name: 'Responder' });
  await expect(responder).toHaveAttribute('href', /^mailto:nueva@example\.com\?subject=/);
  await expect(page.getByRole('link', { name: 'Llamar' })).toHaveAttribute('href', 'tel:+34611222333');
});

test('sin consultas no ocupa sitio', async ({ page }) => {
  await montar(page, { nuevas: [] });
  await expect(page.getByRole('heading', { name: 'Clientas' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('heading', { name: /consulta/i })).toHaveCount(0);
});

test('marcar como atendida: solo desaparece si la fila vuelve', async ({ page }) => {
  const api = await montar(page);
  await page.getByRole('button', { name: 'Marcar como atendida' }).click({ timeout: 60_000 });
  await expect.poll(api.patches, { timeout: 15_000 }).toBe(1);
  await expect(page.getByText('¿Tenéis clases para principiantes?')).toHaveCount(0);
});

for (const [nombre, patch] of [
  ['la RLS no la deja pasar (0 filas)', { status: 200, body: [] }],
  ['un 403', { status: 403, body: { message: 'permission denied' } }],
] as const) {
  test(`⚠️ ${nombre}: la consulta sigue y se dice`, async ({ page }) => {
    const api = await montar(page, { patch });
    await page.getByRole('button', { name: 'Marcar como atendida' }).click({ timeout: 60_000 });
    await expect.poll(api.patches, { timeout: 15_000 }).toBeGreaterThan(0);
    // Por texto: el anunciador de rutas de Next también es un role="alert".
    await expect(page.getByText(/No se ha podido marcar como atendida/)).toBeVisible();
    await expect(page.getByText('¿Tenéis clases para principiantes?')).toBeVisible();
  });
}

test('dar de alta: abre el alta de siempre con sus datos, sin crear nada solo', async ({ page }) => {
  const api = await montar(page);
  await page.getByRole('button', { name: 'Dar de alta' }).click({ timeout: 60_000 });
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toBeVisible();
  await expect(page.getByRole('textbox', { name: /^Nombre\s*\*?$/ })).toHaveValue('Nueva');
  await expect(page.getByRole('textbox', { name: 'Apellidos' })).toHaveValue('Visitante');
  await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue('nueva@example.com');
  // Abrir el alta no cierra la consulta: eso solo pasa si el alta se guarda.
  expect(api.patches()).toBe(0);
});
