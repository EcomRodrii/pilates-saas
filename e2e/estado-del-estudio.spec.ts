import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La bandeja única de la home («lo que espera tu visto bueno») y el contador
// sobre Inicio (lib/estado-estudio.ts, /api/estado-estudio).
//
// Lo que se fija aquí:
//   · lo que espera decisión, lo que Tentare está haciendo y lo resuelto se ven
//     separados, y el contador del menú suma SOLO lo primero;
//   · sin nada pendiente dice «nada espera tu visto bueno» — nunca «todo bien»;
//   · si el endpoint falla, la home (la pantalla principal del negocio) sigue en
//     pie y no se inventa un cero;
//   · el menú reorganizado: «Inicio» con un solo nombre, Comunidad sin entrada
//     duplicada y Mensajería visible en el modo por defecto.
//
// Montaje propio y no `montarHome` (e2e/hoy-home-mock.ts): allí el comodín
// `**/api/**` se registra dentro y ganaría a cualquier mock que se pusiera antes.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const CON_PENDIENTES = {
  aplica: true,
  nDecidir: 3,
  titulo: '3 cosas esperan tu visto bueno',
  decidir: [
    { id: 'sustitucionesPorDecidir', n: 1, texto: 'Una clase sin cubrir necesita que decidas', href: '/sustituciones' },
    { id: 'reservasPorAprobar', n: 2, texto: '2 reservas esperan tu aprobación', href: '/calendario' },
  ],
  enMarcha: [
    { id: 'sustitucionesBuscando', n: 1, texto: 'Buscando sustituta para una clase', href: '/sustituciones' },
  ],
  resuelto: [
    { id: 'sustitucionesCubiertas24h', n: 1, texto: 'Una clase cubierta por una sustituta', href: '/sustituciones' },
  ],
};

const SIN_NADA = {
  aplica: true, nDecidir: 0, titulo: 'Nada espera tu visto bueno', decidir: [], enMarcha: [], resuelto: [],
};

async function montar(
  page: Page,
  estado: { cuerpo?: unknown; status?: number },
  rest: Record<string, unknown[]> = {},
) {
  const intentos = { n: 0 };

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

  // El genérico PRIMERO: Playwright resuelve la última ruta que encaje.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#343825', secondary: '#5A6142', logoUrl: null, radius: 12 }));
  await page.route('**/api/estado-estudio**', route => {
    intentos.n++;
    return json(route, estado.cuerpo ?? {}, estado.status ?? 200);
  });
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  // Tablas concretas que una prueba quiere sembrar (después del genérico: gana).
  for (const [tabla, filas] of Object.entries(rest)) {
    await page.route(`**/rest/v1/${tabla}**`, route => json(route, filas));
  }

  await page.goto('/dashboard');
  return intentos;
}

test.describe('Estado del estudio en Inicio', () => {
  test('separa lo que espera tu decisión de lo que Tentare hace y ya ha hecho', async ({ page }) => {
    await montar(page, { cuerpo: CON_PENDIENTES });

    const bandeja = page.getByRole('region', { name: 'Lo que espera tu visto bueno' });
    await expect(bandeja).toBeVisible({ timeout: 30_000 });
    await expect(bandeja.getByText('3 cosas esperan tu visto bueno')).toBeVisible();

    // Lo que espera decisión lleva a donde se resuelve.
    await expect(bandeja.getByRole('link', { name: /Una clase sin cubrir necesita que decidas/ }))
      .toHaveAttribute('href', '/sustituciones');
    await expect(bandeja.getByRole('link', { name: /2 reservas esperan tu aprobación/ }))
      .toHaveAttribute('href', '/calendario');

    await expect(bandeja.getByText('Tentare lo está haciendo')).toBeVisible();
    await expect(bandeja.getByText('Buscando sustituta para una clase')).toBeVisible();
    await expect(bandeja.getByText('Resuelto por Tentare')).toBeVisible();
    await expect(bandeja.getByText('Una clase cubierta por una sustituta')).toBeVisible();
  });

  test('el contador de Inicio suma solo lo que espera decisión (3), no lo que está en marcha', async ({ page }) => {
    await montar(page, { cuerpo: CON_PENDIENTES });
    const inicio = page.getByRole('link', { name: /^Inicio/ }).first();
    await expect(inicio).toBeVisible({ timeout: 30_000 });
    await expect(inicio).toContainText('3');
    await expect(inicio.getByText('3 por decidir')).toBeAttached();
  });

  test('sin nada pendiente lo dice sin exagerar: nunca «todo bien»', async ({ page }) => {
    await montar(page, { cuerpo: SIN_NADA });
    await expect(page.getByText('Nada espera tu visto bueno')).toBeVisible({ timeout: 30_000 });
    // Una sola línea, no una tarjeta que diga lo mismo cada mañana.
    await expect(page.getByRole('region', { name: 'Lo que espera tu visto bueno' })).toHaveCount(0);
    await expect(page.getByText(/todo bien|todo bajo control|todo en orden/i)).toHaveCount(0);
  });

  test('si el endpoint falla, la home sigue en pie y no se inventa un «nada pendiente»', async ({ page }) => {
    const intentos = await montar(page, { cuerpo: { error: 'boom' }, status: 500 });
    // El menú y la home siguen montados.
    await expect(page.getByRole('link', { name: /^Inicio/ }).first()).toBeVisible({ timeout: 30_000 });
    // ⚠️ Sin contador, «no mintió» podría ser cierto por no haberlo intentado.
    await expect.poll(() => intentos.n).toBeGreaterThan(0);
    await expect(page.getByText('Nada espera tu visto bueno')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Lo que espera tu visto bueno' })).toHaveCount(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Un solo sitio para decidir: las tarjetas que resuelven lo que la bandeja
// cuenta sin enlace (penalizaciones, devoluciones, canjes) viven DENTRO de ella,
// bajo «Decidir», y ya no sueltas más abajo en la home.
// ─────────────────────────────────────────────────────────────────────────────

const PENALIZACION = { id: 'pen-1', socio_id: 'soc-1', importe: 12, tipo: 'NO_SHOW', detectada_en: '2026-09-10T09:00:00Z' };
const CON_PENALIZACION_REST = {
  penalizaciones: [PENALIZACION],
  socios: [{ id: 'soc-1', nombre: 'María', apellidos: 'Soler' }],
};

test.describe('Lo que se aprueba, dentro de la bandeja', () => {
  test('la penalización pendiente se aprueba DENTRO de la región, y su línea lleva a la tarjeta', async ({ page }) => {
    await montar(page, {
      cuerpo: {
        aplica: true, nDecidir: 1, titulo: 'Una cosa espera tu visto bueno',
        decidir: [{ id: 'penalizacionesPorAprobar', n: 1, texto: 'Una penalización espera tu visto bueno para cobrarse', href: null }],
        enMarcha: [], resuelto: [],
      },
    }, CON_PENALIZACION_REST);

    const bandeja = page.getByRole('region', { name: 'Lo que espera tu visto bueno' });
    await expect(bandeja.getByText('1 penalización pendiente de aprobar')).toBeVisible({ timeout: 30_000 });
    await expect(bandeja.getByText('María Soler')).toBeVisible();
    await expect(bandeja.getByRole('button', { name: 'Aprobar y cobrar' })).toBeVisible();
    // Una sola vez en la página: no queda una copia suelta más abajo.
    await expect(page.getByText('1 penalización pendiente de aprobar')).toHaveCount(1);

    // La línea ya no es texto muerto: lleva a su tarjeta y le pasa el foco.
    const linea = bandeja.getByRole('link', { name: /Una penalización espera tu visto bueno/ });
    await expect(linea).toHaveAttribute('href', '#decidir-penalizaciones');
    await linea.click();
    await expect(page.locator('#decidir-penalizaciones')).toBeFocused();
    await expect(page).not.toHaveURL(/#decidir-/);
  });

  test('si el recuento aún dice «nada» y la tarjeta sí tiene algo, se ve la tarjeta y no se afirma «nada»', async ({ page }) => {
    // El recuento lleva hasta 30 s de caché y la tarjeta lee en vivo: pueden
    // no coincidir un momento. Lo que no puede pasar es enseñar las dos cosas.
    await montar(page, { cuerpo: SIN_NADA }, CON_PENALIZACION_REST);

    const bandeja = page.getByRole('region', { name: 'Lo que espera tu visto bueno' });
    await expect(bandeja.getByText('1 penalización pendiente de aprobar')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Nada espera tu visto bueno')).toBeHidden();
  });
});

test.describe('Menú reorganizado', () => {
  test('«Inicio» con un solo nombre, Comunidad sin entrada duplicada, Mensajería visible por defecto', async ({ page }) => {
    await montar(page, { cuerpo: SIN_NADA });
    await expect(page.getByRole('link', { name: /^Inicio/ }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('link', { name: 'Dashboard' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Mensajería/ }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Comunidad', exact: true })).toHaveCount(0);
  });
});
