import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Fase 2 del calendario — "Duplicar clase": clonar tipo/sala/instructora/aforo
// a un hueco +7 días, sin rellenar el formulario desde cero. Reutiliza el
// flujo de "Nueva clase" ya existente (openNueva/crearSesion) — este spec
// verifica el pre-rellenado y que NO se copian notas/precio/serie.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

// Reloj congelado en MIÉRCOLES 2026-08-05 — misma fecha que ya usa
// crear-clase-otra-semana.spec.ts, para reutilizar el mismo razonamiento de
// semanas sin reinventar otra fecha de referencia.
const HOY = '2026-08-05';
const ORIGEN_FECHA = HOY;
const DUPLICADO_FECHA = '2026-08-12'; // +7 días exactos

const STUDIO_ROW = {
  id: STUDIO_ID, nombre: 'Pilates Centro', slug: 'pilates-centro',
  owner_auth_user_id: AUTH_UID, email: 'cloe@example.com', moneda: 'EUR',
};
const EQUIPO = [
  { id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Marta Sanz', activo: true, rol: 'INSTRUCTOR', color: '#F7A6C4' },
];
const TIPO_CLASE = { id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', duracion_min: 50, color: '#F7A6C4' };
const SALA = { id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala Reformer', capacidad: 12, color: '#F7A6C4' };

const SESION_ORIGEN = {
  id: 'ses-origen', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1',
  instructor_id: 'ins-1', inicio: `${ORIGEN_FECHA}T10:00:00+00:00`, fin: `${ORIGEN_FECHA}T10:50:00+00:00`,
  aforo_maximo: 12, cancelada: false, notas: 'Traer esterilla propia',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function sesionApi(r: any) {
  return {
    id: r.id, studioId: r.studio_id, tipoClaseId: r.tipo_clase_id, salaId: r.sala_id,
    instructorId: r.instructor_id, inicio: r.inicio, fin: r.fin, aforoMaximo: r.aforo_maximo,
    cancelada: r.cancelada, notas: r.notas ?? null, precioPuntual: r.precio_puntual ?? null, serieId: r.serie_id ?? null,
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
  await page.route('**/rest/v1/sesiones**', route =>
    route.request().method() === 'GET' ? json(route, [SESION_ORIGEN]) : json(route, [], 201));
  await page.route('**/api/calendario**', route => json(route, {
    sesiones: [SESION_ORIGEN].map(sesionApi), reservas: [], sustituciones: [],
    salas: [SALA].map(salaApi), instructores: EQUIPO.map(instructorApi),
    horaApertura: '08:00:00', horaCierre: '22:00:00', rol: 'PROPIETARIO',
  }));

  await page.goto('/calendario');
  await page.getByRole('button', { name: /Reformer/i }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Duplicar' }).click();
}

test.describe('Duplicar clase', () => {
  test('abre "Nueva clase" pre-rellenada +7 días, sin notas', async ({ page }) => {
    await montar(page);

    const cajon = page.getByRole('dialog', { name: 'Nueva clase' });
    await expect(cajon).toBeVisible({ timeout: 30_000 });

    await expect(cajon.getByRole('combobox', { name: 'Tipo de clase' })).toHaveValue('tc-1');
    await expect(cajon.getByRole('combobox', { name: 'Sala' })).toHaveValue('sala-1');
    await expect(cajon.getByRole('combobox', { name: 'Instructora' })).toHaveValue('ins-1');
    await expect(cajon.locator('input[type="date"]')).toHaveValue(DUPLICADO_FECHA);
    await expect(cajon.getByRole('textbox', { name: 'Hora inicio' })).toHaveValue('10:00');
    await expect(cajon.getByRole('textbox', { name: 'Hora fin' })).toHaveValue('10:50');
    await expect(cajon.getByRole('spinbutton', { name: /Aforo/i })).toHaveValue('12');

    // La nota es de la instancia de origen, no de la plantilla — no se copia.
    await expect(cajon.getByLabel(/Notas/i)).toHaveValue('');
  });

  test('guardar el duplicado crea la clase y avisa de que lleva a otra semana', async ({ page }) => {
    await montar(page);

    const cajon = page.getByRole('dialog', { name: 'Nueva clase' });
    await cajon.getByRole('button', { name: 'Crear clase' }).click();

    await expect(page.getByText(/te llevo a esa semana/)).toBeVisible({ timeout: 30_000 });
  });
});
