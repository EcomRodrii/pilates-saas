import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Fase 2 del calendario — "Buscador rápido": saltar a una clase por
// instructora/sala/tipo sin navegar semana a semana. Busca sobre TODO el
// estudio (contexto completo, no /api/calendario) — por eso el punto crítico
// a probar es que una instructora NO vea en los resultados clases de sus
// compañeras, replicando la misma regla que filtrarSesionesPorRol aplica en
// la rejilla (lib/calendario-datos.ts).
// ─────────────────────────────────────────────────────────────────────────────

const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const HOY = '2026-08-05';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: 'auth-e2e-duena', email: 'cloe@example.com', moneda: 'EUR',
};
const EQUIPO = [
  { id: 'ins-marta', studio_id: STUDIO_ID, nombre: 'Marta Sanz', activo: true, rol: 'INSTRUCTOR', color: '#F7A6C4', auth_user_id: 'auth-e2e-instructora', email: 'marta@example.com', telefono: null },
  { id: 'ins-laura', studio_id: STUDIO_ID, nombre: 'Laura', activo: true, rol: 'INSTRUCTOR', color: '#222', auth_user_id: 'auth-e2e-otra', email: 'laura@example.com', telefono: null },
];
const TIPO_CLASE = { id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', duracion_min: 50, color: '#F7A6C4' };
const SALA = { id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala Reformer', capacidad: 10, color: '#F7A6C4' };

const SESION_MARTA = {
  id: 'ses-marta', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1',
  instructor_id: 'ins-marta', inicio: `${HOY}T18:00:00+00:00`, fin: `${HOY}T18:50:00+00:00`,
  aforo_maximo: 10, cancelada: false,
};
const SESION_LAURA = {
  id: 'ses-laura', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1',
  instructor_id: 'ins-laura', inicio: `${HOY}T10:00:00+00:00`, fin: `${HOY}T10:50:00+00:00`,
  aforo_maximo: 10, cancelada: false,
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}
function sesionApi(r: any) {
  return {
    id: r.id, studioId: r.studio_id, tipoClaseId: r.tipo_clase_id, salaId: r.sala_id,
    instructorId: r.instructor_id, inicio: r.inicio, fin: r.fin, aforoMaximo: r.aforo_maximo,
    cancelada: r.cancelada, notas: null, precioPuntual: null, serieId: null,
    incidenciaTexto: null, sustitucionAbierta: false, motivoBaja: null, sustitucionId: null,
  };
}
function salaApi(r: any) {
  return { id: r.id, studioId: r.studio_id, nombre: r.nombre, capacidad: r.capacidad, color: r.color };
}
function instructorApi(r: any) {
  return {
    id: r.id, studioId: r.studio_id, nombre: r.nombre, email: r.email ?? null, telefono: r.telefono ?? null,
    color: r.color, activo: r.activo, avatar: r.avatar ?? null, fotoUrl: r.foto_url ?? null,
    rol: r.rol ?? 'INSTRUCTOR', authUserId: r.auth_user_id ?? null,
  };
}

async function seedAuth(page: Page, uid: string, email: string) {
  await page.addInitScript(([key, id, mail]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: {
        id, email: mail, aud: 'authenticated', role: 'authenticated',
        app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z',
      },
    }));
  }, [STORAGE_KEY, uid, email] as const);
}

async function mockBackend(page: Page, rol: string) {
  await page.clock.setFixedTime(new Date(`${HOY}T12:00:00`));
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/instructores**', route => json(route, EQUIPO));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, [TIPO_CLASE]));
  await page.route('**/rest/v1/salas**', route => json(route, [SALA]));
  await page.route('**/rest/v1/sesiones**', route => json(route, [SESION_MARTA, SESION_LAURA]));
  await page.route('**/api/calendario**', route => json(route, {
    // Rol PROPIETARIO/RECEPCION ve ambas; INSTRUCTOR (Marta) solo la suya —
    // mismo filtrado que hace el servidor de verdad (filtrarSesionesPorRol).
    sesiones: (rol === 'INSTRUCTOR' ? [SESION_MARTA] : [SESION_MARTA, SESION_LAURA]).map(sesionApi),
    reservas: [], sustituciones: [],
    salas: [SALA].map(salaApi), instructores: EQUIPO.map(instructorApi),
    horaApertura: '08:00:00', horaCierre: '22:00:00', rol,
  }));
}

test.describe('Buscador rápido', () => {
  test('encuentra una clase por instructora y salta a su día', async ({ page }) => {
    await mockBackend(page, 'PROPIETARIO');
    await seedAuth(page, 'auth-e2e-duena', 'cloe@example.com');
    await page.goto('/calendario');

    await page.getByRole('button', { name: 'Buscar clase en todo el estudio' }).click({ timeout: 30_000 });
    await page.getByPlaceholder('Instructora, sala o tipo de clase…').fill('laura');
    const resultados = page.getByTestId('buscador-resultados');
    await expect(resultados.getByText('Laura', { exact: false })).toBeVisible();
    await resultados.getByRole('button').click();

    // Saltó a la clase de Laura (10:00), no a la de Marta (18:00).
    await expect(page.getByText('10:00')).toBeVisible({ timeout: 30_000 });
  });

  test('instructora: no ve en los resultados clases de sus compañeras', async ({ page }) => {
    await mockBackend(page, 'INSTRUCTOR');
    await seedAuth(page, 'auth-e2e-instructora', 'marta@example.com');
    await page.goto('/calendario');

    await page.getByRole('button', { name: 'Buscar clase en todo el estudio' }).click({ timeout: 30_000 });
    await page.getByPlaceholder('Instructora, sala o tipo de clase…').fill('reformer');

    // Solo su propia clase (Marta) — la de Laura no debe aparecer.
    const resultados = page.getByTestId('buscador-resultados');
    await expect(resultados.getByText('Sin resultados')).toHaveCount(0);
    await expect(resultados.getByRole('button')).toHaveCount(1);
    await expect(resultados.getByText('Laura')).toHaveCount(0);
  });

  test('sin texto no muestra ningún resultado', async ({ page }) => {
    await mockBackend(page, 'PROPIETARIO');
    await seedAuth(page, 'auth-e2e-duena', 'cloe@example.com');
    await page.goto('/calendario');

    await page.getByRole('button', { name: 'Buscar clase en todo el estudio' }).click({ timeout: 30_000 });
    await expect(page.getByTestId('buscador-resultados')).toHaveCount(0);
  });
});
