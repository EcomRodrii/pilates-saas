import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Fase 2 del calendario — "Vista de Mes": ocupación agregada por día, sin
// detalle hora a hora. Solo lectura (reutiliza /api/calendario tal cual, con
// un rango de mes en vez de día/semana).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

// Reloj congelado en MIÉRCOLES 2026-08-05.
const HOY = '2026-08-05';

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR',
};
const EQUIPO = [
  { id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Marta Sanz', activo: true, rol: 'INSTRUCTOR', color: '#F7A6C4' },
];
const TIPO_CLASE = { id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', duracion_min: 50, color: '#F7A6C4' };
const SALA = { id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala Reformer', capacidad: 10, color: '#F7A6C4' };

// Dos clases el día 5, una el día 12, una CANCELADA el día 20 (no debe contar).
function sesion(id: string, fecha: string, horaInicio: string, horaFin: string, cancelada = false) {
  return {
    id, studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'ins-1',
    inicio: `${fecha}T${horaInicio}:00+00:00`, fin: `${fecha}T${horaFin}:00+00:00`,
    aforo_maximo: 10, cancelada,
  };
}
const SESIONES = [
  sesion('ses-1', '2026-08-05', '09:00', '09:50'),
  sesion('ses-2', '2026-08-05', '11:00', '11:50'),
  sesion('ses-3', '2026-08-12', '10:00', '10:50'),
  sesion('ses-4', '2026-08-20', '10:00', '10:50', true),
];

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

async function montar(page: Page) {
  await page.clock.setFixedTime(new Date(`${HOY}T12:00:00`));

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
  await page.route('**/rest/v1/studios**', route => json(route, STUDIO_ROW));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/instructores**', route => json(route, EQUIPO));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, [TIPO_CLASE]));
  await page.route('**/rest/v1/salas**', route => json(route, [SALA]));
  await page.route('**/rest/v1/sesiones**', route => json(route, SESIONES));
  // Un único mock cubre cualquier rango (día/semana/mes) — el punto es la
  // agregación en el cliente, no simular el filtrado gte/lt del servidor.
  await page.route('**/api/calendario**', route => json(route, {
    sesiones: SESIONES.map(sesionApi), reservas: [], sustituciones: [],
    salas: [SALA].map(salaApi), instructores: EQUIPO.map(instructorApi),
    horaApertura: '08:00:00', horaCierre: '22:00:00', rol: 'PROPIETARIO',
  }));

  await page.goto('/calendario');
  await page.getByRole('button', { name: 'Mes' }).click();
}

test.describe('Vista de Mes', () => {
  test('agrega las clases por día y no cuenta las canceladas', async ({ page }) => {
    await montar(page);

    await expect(page.getByText('agosto de 2026', { exact: true })).toBeVisible({ timeout: 30_000 });

    const dia5 = page.getByRole('button', { name: '5 de agosto de 2026' });
    await expect(dia5.getByText('2 clases')).toBeVisible();

    const dia12 = page.getByRole('button', { name: '12 de agosto de 2026' });
    await expect(dia12.getByText('1 clase', { exact: true })).toBeVisible();

    // Día 20 solo tiene una sesión CANCELADA — no debe contar ninguna clase.
    const dia20 = page.getByRole('button', { name: '20 de agosto de 2026' });
    await expect(dia20.getByText(/clase/)).toHaveCount(0);
  });

  test('click en un día lleva a la vista de Día de esa fecha', async ({ page }) => {
    await montar(page);

    await page.getByRole('button', { name: '12 de agosto de 2026' }).click();

    // Vuelve a Día, ya en esa fecha — se ve la clase de las 10:00 (Reformer).
    await expect(page.getByRole('button', { name: 'Día', exact: true })).toHaveClass(/bg-card/);
    await expect(page.getByRole('button', { name: /Reformer/i })).toBeVisible({ timeout: 30_000 });
  });

  test('navegar de mes cambia la etiqueta sin tocar el mes original', async ({ page }) => {
    await montar(page);
    await expect(page.getByText('agosto de 2026', { exact: true })).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: 'Mes siguiente' }).click();
    await expect(page.getByText('septiembre de 2026', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Hoy' }).click();
    await expect(page.getByText('agosto de 2026', { exact: true })).toBeVisible();
  });
});
