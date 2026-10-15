import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Configuración › Mi app y mi web › Widgets con el panel nuevo (15-oct-2026):
// la línea de pasos, el título-objetivo de cada paso, la vista previa sobre su
// panel de color y Atrás/Siguiente con las piezas del panel nuevo. Lo de dentro
// (el código, los ajustes, las reglas) es lo de siempre: lo vigila
// `widget-builder.spec.ts`, que sigue probando el constructor SIN el panel nuevo.
//
// Mocks de red registrados DESPUÉS del andamiaje (`**/api/**` primero). No hay
// escritura nueva en esta pantalla: nada que contar en un camino de fallo.
// Con CAPTURAS=<carpeta> guarda una captura por vista (la verificación visual).
// ─────────────────────────────────────────────────────────────────────────────

test.use({
  timezoneId: 'Europe/Madrid',
  // Solo para las capturas: ANCHO/ALTO prueban tableta y móvil; OSCURO=1, el modo oscuro del panel.
  ...(process.env.ANCHO ? { viewport: { width: Number(process.env.ANCHO), height: Number(process.env.ALTO ?? 900) } } : {}),
});
test.setTimeout(120_000);

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const SLUG = 'pilates-centro';
const STORAGE_KEY = 'sb-example-auth-token';
const CAPTURAS = process.env.CAPTURAS;

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function montar(page: Page, opts: { panelNuevo: boolean; plataforma?: string; slug?: string | null; copiados?: boolean; destino?: string }) {
  const studioRow: Record<string, unknown> = {
    id: STUDIO_ID, nombre: 'Pilates Centro', slug: opts.slug === undefined ? SLUG : opts.slug, owner_auth_user_id: AUTH_UID,
    email: 'duena@example.com', color_primario: '#343825',
    widget_dominios_autorizados: ['https://midominio.com'],
    widget_builder: {
      ...(opts.plataforma ? { _web: { plataforma: opts.plataforma } } : {}),
      ...(opts.copiados ? { horario: { copiado: { firma: 'a1b2c3d4', en: new Date().toISOString(), metodo: 'iframe' } } } : {}),
    },
  };
  if (process.env.OSCURO === '1') await page.addInitScript(() => localStorage.setItem('panel-dark-mode', '1'));
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'duena@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  await page.route('**/api/**', r => json(r, {}));
  await page.route('**/api/billing/estado**', r => json(r, { bloqueado: false }));
  await page.route('**/api/billing/status**', r => json(r, { bloqueado: false, activo: true, plan: 'BASE', configurado: true }));
  await page.route('**/api/layout**', r => json(r, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/theme**', r => json(r, { primary: '#343825', secondary: '#D9C29E', logoUrl: null, radius: 12 }));
  await page.route('**/api/oauth/consentimientos**', r => json(r, { apps: [] }));
  await page.route('**/api/public/session**', r => json(r, { error: 'no' }, 404));
  await page.route(u => u.pathname === '/api/estudio/interruptores', r => json(r, { panelNuevo: opts.panelNuevo }));
  await page.route('**/rest/v1/**', r => json(r, []));
  await page.route('**/rest/v1/studios**', r => (r.request().method() === 'PATCH' ? json(r, [{ id: STUDIO_ID }]) : json(r, studioRow)));
  await page.route('**/rest/v1/rpc/current_studio_id', r => json(r, STUDIO_ID));
  await page.route('**/rest/v1/tipos_clase**', r => json(r, [{ id: 'tc-r', studio_id: STUDIO_ID, nombre: 'Reformer', color: '#7C6A52', nivel: 'TODOS', duracion_min: 50 }]));
  await page.route('**/rest/v1/instructores**', r => json(r, [{ id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Ana Ruiz', activo: true, rol: 'INSTRUCTOR', color: '#7C6A52' }]));

  await page.goto(opts.destino ?? '/configuracion?tab=web&abrir=widgets');
}

async function captura(page: Page, nombre: string) {
  // En las capturas, que la vista previa (la página real de reservas, lenta en dev) haya cargado.
  if (CAPTURAS) await page.waitForTimeout(16_000);
  if (CAPTURAS) await page.screenshot({ path: `${CAPTURAS}/${nombre}.png`, fullPage: true });
}

test('panel nuevo: la web ya contestada abre «Qué y dónde» con su línea de pasos, su título y la vista previa en su panel', async ({ page }) => {
  await montar(page, { panelNuevo: true, plataforma: 'wordpress' });
  const pasos = page.getByRole('list', { name: 'Pasos' });
  await expect(pasos).toBeVisible({ timeout: 60_000 });
  await expect(pasos.getByRole('button')).toHaveText([/Qué y dónde/, /Cómo se ve/, /Ponlo en tu web/]);
  await expect(pasos.getByRole('button', { name: 'Qué y dónde' })).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('heading', { name: 'Elige qué enseñas y dónde' })).toBeVisible();
  // El widget real sigue ahí: «Así lo verá tu alumna» y el cambio de dispositivo.
  await expect(page.getByRole('heading', { name: 'Así lo verá tu alumna' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Dispositivo de la vista previa' }).getByRole('button')).toHaveText(['Ordenador', 'Móvil']);
  // «Primeros pasos» flota abajo a la derecha y taparía la vista previa: mientras se ve, se esconde.
  await expect(page.locator('[data-primeros-pasos]:visible')).toHaveCount(0);
  await expect(page.getByRole('radiogroup', { name: 'Qué quieres poner en tu web' })).toBeVisible();
  await captura(page, 'widgets-1-que');

  await page.getByRole('button', { name: /Siguiente: cómo se ve/ }).click();
  await expect(pasos.getByRole('button', { name: 'Cómo se ve' })).toHaveAttribute('aria-current', 'step');
  await expect(page.getByRole('heading', { name: 'Cómo se ve', exact: true })).toBeVisible();
  await expect(page.getByText('¿Cómo quieres que se vea?')).toBeVisible();
  await captura(page, 'widgets-2-como');

  await page.getByRole('button', { name: /Siguiente: ponlo en tu web/ }).click();
  await expect(page.getByRole('heading', { name: 'Ponlo en tu web', exact: true })).toBeVisible();
  // El código sigue en el DOM (los tres pasos siempre montados).
  await expect(page.locator('pre')).toHaveCount(1);
  await expect(page.locator('pre')).toContainText(`/reservar/${SLUG}`);
  await captura(page, 'widgets-3-ponlo');

  await page.getByRole('button', { name: 'Atrás' }).click();
  await expect(pasos.getByRole('button', { name: 'Cómo se ve' })).toHaveAttribute('aria-current', 'step');
});

test('panel nuevo: las dos vistas se cambian con las píldoras y la primera pregunta (con qué está hecha tu web) sigue ahí', async ({ page }) => {
  await montar(page, { panelNuevo: true });
  const pregunta = page.getByRole('radiogroup', { name: 'Con qué está hecha tu web' });
  await expect(pregunta).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('list', { name: 'Pasos' })).toHaveCount(0);
  await captura(page, 'widgets-0-plataforma');
  await pregunta.getByRole('radio', { name: /Wix/ }).click();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByRole('list', { name: 'Pasos' })).toBeVisible();
  const vistas = page.getByRole('group', { name: 'Qué ver' });
  await vistas.getByRole('button', { name: 'Cómo le va a tu página' }).click();
  await expect(vistas.getByRole('button', { name: 'Cómo le va a tu página' })).toHaveAttribute('aria-pressed', 'true');
  await captura(page, 'widgets-4-como-le-va');
});

test('panel nuevo: con algo copiado, la portada «Lo que tienes en tu web» y su botón para poner otra cosa', async ({ page }) => {
  await montar(page, { panelNuevo: true, plataforma: 'wordpress', copiados: true });
  const portada = page.getByRole('region', { name: 'Lo que tienes en tu web' });
  await expect(portada).toBeVisible({ timeout: 60_000 });
  await expect(portada.getByRole('button', { name: 'Poner otra cosa en tu web' })).toBeVisible();
  await captura(page, 'widgets-5-tienes');
});

test('panel nuevo: sin dirección de página la pantalla ya no se queda en blanco', async ({ page }) => {
  await montar(page, { panelNuevo: true, slug: null });
  await expect(page.getByRole('heading', { name: 'Primero, la dirección de tu página' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('link', { name: /Poner mi dirección/ })).toHaveAttribute('href', /tab=web/);
  await captura(page, 'widgets-6-sin-direccion');
});

test('sin el panel nuevo: el constructor es el de siempre (navegación «Pasos», sin título-objetivo)', async ({ page }) => {
  await montar(page, { panelNuevo: false, plataforma: 'wordpress' });
  await expect(page.getByRole('navigation', { name: 'Pasos' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('list', { name: 'Pasos' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Elige qué enseñas y dónde' })).toHaveCount(0);
  await captura(page, 'widgets-antes-que');
});

test('panel nuevo: «Contenido de tu app» con el marco del panel nuevo y sus textos de siempre', async ({ page }) => {
  await page.setViewportSize({ width: Number(process.env.ANCHO ?? 1440), height: Number(process.env.ALTO ?? 900) });
  await montar(page, { panelNuevo: true, plataforma: 'wordpress', destino: '/configuracion?tab=web&abrir=contenido-de-tu-app' });
  await expect(page.getByText(/Si no publicas ninguna tarjeta/)).toBeVisible({ timeout: 60_000 });
  await captura(page, 'contenido-de-tu-app');
});
