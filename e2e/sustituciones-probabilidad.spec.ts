import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Tentare Brain · Fase 1 — la card de sustituta ya no enseña un porcentaje
// inventado.
//
// Antes: "Compatibilidad 87 %", donde el 87 era LEAST(99, GREATEST(55, score))
// sobre una heurística fija. No medía nada, y dos candidatas con historiales
// opuestos salían las dos al 99 %.
//
// Ahora hay dos cosas separadas: el ENCAJE (barra, sin cifra) y la PROBABILIDAD
// real de que acepte, que sale del historial de respuestas de esa instructora
// (rankear_candidatas, migr 20260810231458) y que solo aparece cuando existe.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const STUDIO_ROW = { id: STUDIO_ID, nombre: 'Studio Cadena', slug: 'studio-cadena', owner_auth_user_id: AUTH_UID, email: 'duena@example.com', moneda: 'EUR' };
const TIPO_CLASE_ROW = { id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', duracion_min: 50, color: '#F7A6C4' };
const INSTRUCTORES_ROWS = [
  { id: 'inst-laura', studio_id: STUDIO_ID, nombre: 'Laura Gil', activo: true, rol: 'INSTRUCTOR', color: '#F7A6C4' },
  { id: 'inst-marta', studio_id: STUDIO_ID, nombre: 'Marta Sanz', activo: true, rol: 'INSTRUCTOR', color: '#F7A6C4' },
];

const SESION = { id: 'ses-1', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'inst-laura', inicio: '2099-08-03T08:00:00+00:00', fin: '2099-08-03T08:50:00+00:00', aforo_maximo: 10, cancelada: false };

/** Baja abierta, con el ranking que devolvería rankear_candidatas. */
function bajaConRanking(ranking: Record<string, unknown>[]) {
  return {
    id: 'sust-1', studio_id: STUDIO_ID, estado: 'buscando', instructor_original_id: 'inst-laura', sesion_id: 'ses-1',
    sesiones: { id: 'ses-1', inicio: '2099-08-03T08:00:00+00:00', tipo_clase_id: 'tc-1' },
    ranking, sustitucion_contactos: [],
    creado_en: '2026-07-26T00:00:00+00:00', resuelto_en: null,
  };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function seedSesionDeDuena(page: Page) {
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
}

async function mockBackend(page: Page, ranking: Record<string, unknown>[]) {
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, [TIPO_CLASE_ROW]));
  await page.route('**/rest/v1/instructores**', route => json(route, INSTRUCTORES_ROWS));
  await page.route('**/rest/v1/sesiones**', route => json(route, [SESION]));

  await page.route('**/api/sustituciones**', route => {
    if (route.request().method() !== 'GET') return json(route, { ok: true });
    return json(route, {
      sustituciones: [bajaConRanking(ranking)], avisarAlumnas: true,
      modoAutonomia: 'asistido', autonomiaDisponible: true,
      equipo: { total: 2, sinDisponibilidad: [] },
    });
  });
}

async function abrirSustituciones(page: Page) {
  await page.goto('/sustituciones');
  await expect(page.getByText('Sustituta ideal encontrada')).toBeVisible({ timeout: 30_000 });
}

test.describe('La card de sustituta no enseña porcentajes sin respaldo', () => {
  test('con historial: dice cuánto acepta Y de cuántas veces', async ({ page }) => {
    await mockBackend(page, [{
      instructor_id: 'inst-marta', nombre: 'Marta Sanz', score: 142, compatibilidad: 99, veces: 3,
      motivos: ['está disponible', 'ha dicho que sí 9 de las últimas 10 veces que se le pidió'],
      prob_aceptacion: 0.817, prob_aceptadas: 9, prob_ofertas: 10,
    }]);
    await seedSesionDeDuena(page);
    await abrirSustituciones(page);

    await expect(page.getByText('Suele aceptar')).toBeVisible();
    await expect(page.getByText('82 %')).toBeVisible();
    // La cifra NUNCA va suelta: su respaldo se pinta al lado.
    await expect(page.getByText('ha dicho que sí 9 de las últimas 10 veces').first()).toBeVisible();
    // Y el rótulo viejo, el del número inventado, ya no existe.
    await expect(page.getByText('Compatibilidad')).toHaveCount(0);
    await expect(page.getByText('Encaje con esta clase')).toBeVisible();
  });

  test('sin historial suficiente: barra de encaje sí, porcentaje NO', async ({ page }) => {
    await mockBackend(page, [{
      instructor_id: 'inst-marta', nombre: 'Marta Sanz', score: 115, compatibilidad: 99, veces: 5,
      motivos: ['está disponible', 'ya ha dado esta clase 5 veces — las alumnas la conocen'],
      prob_aceptacion: null, prob_aceptadas: 4, prob_ofertas: 4,
    }]);
    await seedSesionDeDuena(page);
    await abrirSustituciones(page);

    await expect(page.getByText('Encaje con esta clase')).toBeVisible();
    // 4 de 4 aceptadas es un 100 % que no significa nada: no se enseña ninguno.
    await expect(page.getByText('99%')).toHaveCount(0);
    await expect(page.getByText('100 %')).toHaveCount(0);
    await expect(page.getByText(/Suele aceptar|Responde a veces|Rara vez acepta/)).toHaveCount(0);
  });

  test('un ranking guardado antes de la migración no rompe la card', async ({ page }) => {
    await mockBackend(page, [{
      instructor_id: 'inst-marta', nombre: 'Marta Sanz', score: 115, compatibilidad: 90, veces: 2,
      motivos: ['está disponible'],
      // sin prob_* ninguno, como las filas viejas de `sustituciones.ranking`
    }]);
    await seedSesionDeDuena(page);
    await abrirSustituciones(page);

    await expect(page.getByText('Marta Sanz')).toBeVisible();
    await expect(page.getByText('Encaje con esta clase')).toBeVisible();
    await expect(page.getByText(/Suele aceptar|Responde a veces|Rara vez acepta/)).toHaveCount(0);
  });
});
