import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El calendario de un estudio sin ninguna clase. El asistente «Te lo montamos
// nosotros» se retiró (confundía y generaba clases que nadie había pedido);
// queda un estado vacío con las dos salidas reales.
// Andamiaje copiado de calendario-reasignar-varias.spec.ts.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const TIPOS = [{ id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', color: '#B9C7A6', duracion_minutos: 55, descripcion: null, nivel: 'TODOS', foto_url: null }];
const SALAS = [{ id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala 1', capacidad: 10, color: '#6366F1' }];
const INSTRUCTORES = [
  { id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Marta', email: null, telefono: null, color: '#111', activo: true, rol: 'INSTRUCTOR', avatar: null, foto_url: null, auth_user_id: null },
  { id: 'ins-2', studio_id: STUDIO_ID, nombre: 'Laura', email: null, telefono: null, color: '#222', activo: true, rol: 'INSTRUCTOR', avatar: null, foto_url: null, auth_user_id: null },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

/** Tres clases futuras el mismo día, sin solaparse. */
function sesiones() {
  const base = new Date(Date.now() + 3 * 3600_000);
  base.setSeconds(0, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 19);
  const hacer = (i: number, instructor: string) => {
    const ini = new Date(base.getTime() + i * 90 * 60_000);
    const fin = new Date(ini.getTime() + 55 * 60_000);
    return {
      id: `ses-${i}`, studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1',
      instructor_id: instructor, inicio: iso(ini), fin: iso(fin),
      aforo_maximo: 10, cancelada: false, notas: null, serie_id: null, precio_puntual: null,
    };
  };
  // La tercera YA la da Laura: no debe contar como movida.
  return [hacer(0, 'ins-1'), hacer(1, 'ins-1'), hacer(2, 'ins-2')];
}

const SESIONES: ReturnType<typeof sesiones> = [];

// Ana está en las DOS clases que se mueven: tiene que contar UNA vez.
const RESERVAS = [
  { id: 'r1', studio_id: STUDIO_ID, sesion_id: 'ses-0', socio_id: 'ana', estado: 'CONFIRMADA' },
  { id: 'r2', studio_id: STUDIO_ID, sesion_id: 'ses-1', socio_id: 'ana', estado: 'CONFIRMADA' },
  { id: 'r3', studio_id: STUDIO_ID, sesion_id: 'ses-1', socio_id: 'bea', estado: 'CONFIRMADA' },
];

const sesionApi = (r: Record<string, unknown>) => ({
  id: r.id, studioId: r.studio_id, tipoClaseId: r.tipo_clase_id, salaId: r.sala_id,
  instructorId: r.instructor_id, inicio: r.inicio, fin: r.fin, aforoMaximo: r.aforo_maximo,
  cancelada: r.cancelada, notas: r.notas, precioPuntual: r.precio_puntual, serieId: null,
  incidenciaTexto: null, sustitucionAbierta: false, motivoBaja: null, sustitucionId: null,
});
const reservaApi = (r: Record<string, unknown>) => ({
  id: r.id, studioId: r.studio_id, sesionId: r.sesion_id, socioId: r.socio_id,
  estado: r.estado, spotId: null, posicionEspera: null, ofertaExpiraEn: null,
  checkInEn: null, creadoEn: '2026-01-01T00:00:00',
});

async function montar(page: Page, tipos = TIPOS) {
  await page.addInitScript(([key, uid]) => {
    localStorage.setItem(key, JSON.stringify({
      access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
      expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
      user: { id: uid, email: 'carmen@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }));
  }, [STORAGE_KEY, AUTH_UID] as const);

  await page.route('**/auth/v1/**', route => json(route, {
    access_token: 'e2e-fake-token', refresh_token: 'e2e-fake-refresh',
    expires_at: 4102444800, expires_in: 999999999, token_type: 'bearer',
    user: { id: AUTH_UID, email: 'carmen@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  }));
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route => json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, tipos));
  await page.route('**/rest/v1/salas**', route => json(route, SALAS));
  await page.route('**/rest/v1/instructores**', route => json(route, INSTRUCTORES));
  await page.route('**/api/calendario**', route => json(route, {
    sesiones: SESIONES.map(sesionApi), reservas: RESERVAS.map(reservaApi), sustituciones: [],
    salas: SALAS.map(s => ({ id: s.id, studioId: s.studio_id, nombre: s.nombre, capacidad: s.capacidad, color: s.color })),
    instructores: INSTRUCTORES.map(i => ({ id: i.id, studioId: i.studio_id, nombre: i.nombre, email: i.email, telefono: i.telefono, color: i.color, activo: i.activo, avatar: i.avatar, fotoUrl: i.foto_url, rol: i.rol, authUserId: i.auth_user_id })),
    horaApertura: '08:00:00', horaCierre: '22:00:00', horarioSemana: [], rol: 'PROPIETARIO',
  }));
  await page.route('**/rest/v1/sesiones**', route => {
    return json(route, SESIONES);
  });
  await page.route('**/rest/v1/reservas**', route => json(route, RESERVAS));

  await page.goto('/calendario');
}




test('sin clases dice qué falta y da las dos salidas, y el asistente ya no existe', async ({ page }) => {
  await montar(page);
  const vacio = page.getByTestId('calendario-sin-clases');
  await expect(vacio.getByText('Tu horario todavía está vacío')).toBeVisible({ timeout: 30_000 });
  await expect(vacio.getByRole('link', { name: /Importar mi horario/ })).toHaveAttribute('href', '/calendario/importar');
  await expect(page.getByText('Te lo montamos nosotros')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Ver el horario propuesto/ })).toHaveCount(0);
});

test('«Crear mi primera clase» abre la misma pregunta que el botón de la cabecera', async ({ page }) => {
  await montar(page);
  await page.getByTestId('calendario-sin-clases').getByRole('button', { name: 'Crear mi primera clase' }).click({ timeout: 30_000 });
  // Quien gestiona elige entre Clase y Clase fija: no se salta esa pregunta.
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('sin tipos de clase, lo primero es crearlos', async ({ page }) => {
  await montar(page, []);
  const vacio = page.getByTestId('calendario-sin-clases');
  await expect(vacio.getByRole('link', { name: 'Primero, crea tus tipos de clase' })).toBeVisible({ timeout: 30_000 });
  await expect(vacio.getByRole('button', { name: 'Crear mi primera clase' })).toHaveCount(0);
});
