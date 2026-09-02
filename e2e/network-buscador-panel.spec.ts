import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Buscador de Tentare Network desde el panel del estudio
// (app/(dashboard)/network/buscar/page.tsx, movido desde /network en el
// rediseño público #1053) — pieza aplazada de la reconstrucción 0→100 (ver
// PRs #1039-#1053). Cubre el camino de éxito (buscar → contactar) y el de fallo
// (contactar falla en el servidor: nunca un "Solicitud enviada" falso), con
// contador de intentos en el segundo — el punto ciego histórico de #500/#505/
// #560/#565 documentado en .claude/tentare-os.md.
//
// Todo el tráfico de datos de esta pantalla pasa por fetch() del navegador
// hacia /api/network/* (buscarPerfilesNetwork/contactarPerfilNetwork en
// lib/api-client.ts) — interceptable entero con page.route, sin necesitar
// ninguna semilla server-side (a diferencia de las páginas públicas SSR de
// Network, que si se testean necesitan su propio E2E_TEST=1 como
// lib/studio-seo.ts, y quedan fuera de esta ronda).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

const PERFIL = {
  id: 'red-perfil-1', slug: 'ana-gil', destacado: false,
  resumenResenas: { promedio: 4.8, total: 3 },
  nombre: 'Ana Gil', fotoUrl: null, ciudad: 'Barcelona', zona: null, radioKm: null,
  descripcion: 'Instructora certificada.',
  especialidades: ['reformer'], aniosExperiencia: 5, tarifaRango: '25_35',
  experienciaVerificada: true,
  disponibilidadEstado: 'disponible', disponibilidadHorarios: ['manana'], tipoTrabajo: ['fijo'],
  estado: 'published', identidadVerificadaEn: null, idiomas: [],
  creadoEn: '2026-01-01T00:00:00Z', actualizadoEn: '2026-01-01T00:00:00Z', ultimoAccesoEn: null,
};

async function montarBuscador(page: Page, opts: { contactoStatus?: number } = {}) {
  const { contactoStatus = 200 } = opts;
  let intentosContacto = 0;

  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id: uid, email: 'cloe@example.com', aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro', owner_auth_user_id: AUTH_UID, moneda: 'EUR' }));
  await page.route('**/rest/v1/instructores**', route => json(route, []));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));

  await page.route('**/api/network/buscar**', route => json(route, { perfiles: [PERFIL] }));
  await page.route('**/api/network/favoritos**', route => json(route, { perfiles: [] }));
  await page.route('**/api/network/perfil/**', route =>
    json(route, {
      perfil: PERFIL,
      experiencias: [],
      badges: {
        emailVerificado: false, experienciaVerificada: true, referenciaProfesional: false,
        identidadVerificada: false, activaRecientemente: false,
      },
    }));

  await page.route('**/api/network/contacto', route => {
    if (route.request().method() !== 'POST') return json(route, { solicitudes: [] });
    intentosContacto++;
    return contactoStatus === 200
      ? json(route, { ok: true, solicitudId: 'red-solicitud-1' })
      : json(route, { error: 'No se ha podido enviar la solicitud.' }, contactoStatus);
  });

  return { intentos: () => intentosContacto };
}

test.describe('Buscador de Network (panel del estudio)', () => {
  test('busca, ve el resultado con su rating y "cerca de mí", y contacta con éxito', async ({ page }) => {
    await montarBuscador(page);
    await page.goto('/network/buscar');

    await expect(page.getByText('Ana Gil')).toBeVisible({ timeout: 30_000 });
    // El rating es real (resumenResenas.total > 0) — nunca un "4.8 ★" fabricado.
    await expect(page.getByText('4.8')).toBeVisible();
    await expect(page.getByRole('button', { name: /Cerca de mí/i })).toBeVisible();

    await page.getByRole('link', { name: /Ana Gil/i }).click();
    // Timeout largo: primera visita a esta ruta dispara la compilación
    // on-demand del dev server (Next.js), que puede tardar varios segundos.
    await expect(page).toHaveURL(/\/network\/red-perfil-1/, { timeout: 20_000 });

    await page.getByRole('button', { name: /^Contactar$/ }).click();
    await page.getByPlaceholder(/Cuéntale por qué la contactas/i).fill('Buscamos sustituta para reformer los martes.');
    await page.getByRole('button', { name: /Enviar solicitud/i }).click();

    // F1: tras enviar con éxito, la solicitud queda 'pendiente' y la UI ya
    // no muestra el texto viejo "Solicitud enviada" — pasa directo al estado
    // con el botón de mensajería pre-match (mismo dato, mejor affordance).
    await expect(page.getByText(/Solicitud pendiente de aceptar/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Mensajes/i })).toBeVisible();
  });

  test('si el servidor rechaza el contacto, no se anuncia un envío que no ocurrió', async ({ page }) => {
    const { intentos } = await montarBuscador(page, { contactoStatus: 500 });
    await page.goto('/network/buscar');

    await page.getByRole('link', { name: /Ana Gil/i }).click();
    await page.getByRole('button', { name: /^Contactar$/ }).click();
    await page.getByPlaceholder(/Cuéntale por qué la contactas/i).fill('Hola.');
    await page.getByRole('button', { name: /Enviar solicitud/i }).click();

    // Nunca "Solicitud enviada" con un 500 real detrás.
    await expect(page.getByText(/Solicitud enviada/i)).toHaveCount(0);
    await expect(page.getByText(/No se ha podido enviar/i)).toBeVisible({ timeout: 10_000 });

    // El punto ciego histórico (#500/#505/#560/#565): un test de fallo sin
    // contar intentos puede pasar "en verde" sin que la petición saliera.
    expect(intentos()).toBeGreaterThan(0);
  });
});
