import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// El mostrador apunta a una clienta desde el calendario, y ahora lo hace por el
// SERVIDOR (`/api/reservas/crear`): la alumna recibe el aviso de su reserva como
// cualquier otra, salvo que recepción desmarque «Avisar a la alumna».
//
// Los dos caminos de fallo llevan contador de peticiones (regla del repo): un
// «no anunció éxito» sin comprobar que se INTENTÓ reservar puede ser verdad por
// no haber hecho nada.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const HOY = new Date().toISOString().slice(0, 10);

const TIPOS = [{ id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', color: '#F7A6C4', duracion_minutos: 55, descripcion: null, nivel: 'TODOS', foto_url: null }];
const SALAS = [{ id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala 1', capacidad: 4, color: '#6366F1' }];
const INSTRUCTORES = [{ id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Marta', email: null, telefono: null, color: '#111', activo: true, rol: 'INSTRUCTOR', avatar: null, foto_url: null, auth_user_id: null }];

function socia(id: string, nombre: string) {
  return { id, studio_id: STUDIO_ID, nombre, apellidos: 'Ruiz', email: `${id}@example.com`, telefono: null, activo: true, fecha_alta: '2026-01-01', campos_extra: {}, tags: [] };
}

// Plan MENSUAL activo: así el flujo no se desvía al aviso de "sin bono".
const PLANES = [{ id: 'plan-1', studio_id: STUDIO_ID, nombre: 'Mensual', descripcion: null, precio: 60, tipo: 'MENSUAL', sesiones: null, validez_dias: null, limite_semanal: null, activo: true }];
function suscripcion(id: string, socioId: string) {
  return { id, studio_id: STUDIO_ID, socio_id: socioId, plan_id: 'plan-1', estado: 'ACTIVA', fecha_inicio: '2026-01-01', fecha_fin: '2030-01-01', sesiones_restantes: null, stripe_subscription_id: null };
}

// Aforo 4 con una sola reserva: hay sitio, así que no pasa por el diálogo de
// lista de espera y va directo a reservar.
const SESION = {
  id: 'ses-1', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'ins-1',
  inicio: `${HOY}T09:00:00+00:00`, fin: `${HOY}T09:55:00+00:00`, aforo_maximo: 4, cancelada: false,
  notas: null, serie_id: null, precio_puntual: null,
};
const RESERVAS = [{ id: 'r1', studio_id: STUDIO_ID, sesion_id: 'ses-1', socio_id: 's1', estado: 'CONFIRMADA', creada_en: `${HOY}T08:00:00+00:00`, posicion_espera: null, spot_id: null }];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

// Mismo mapeo que lib/supabase-data.ts, igual que lista-espera-mostrador.spec.ts.
function sesionApi(r: typeof SESION) {
  return {
    id: r.id, studioId: r.studio_id, tipoClaseId: r.tipo_clase_id, salaId: r.sala_id,
    instructorId: r.instructor_id, inicio: r.inicio, fin: r.fin, aforoMaximo: r.aforo_maximo,
    cancelada: r.cancelada, notas: r.notas, precioPuntual: r.precio_puntual, serieId: r.serie_id ?? null,
    incidenciaTexto: null, sustitucionAbierta: false, motivoBaja: null, sustitucionId: null,
  };
}
function reservaApi(r: typeof RESERVAS[number]) {
  return {
    id: r.id, studioId: r.studio_id, sesionId: r.sesion_id, socioId: r.socio_id, estado: r.estado,
    spotId: r.spot_id ?? null, posicionEspera: r.posicion_espera ?? null, ofertaExpiraEn: null,
    checkInEn: null, creadoEn: r.creada_en,
  };
}

const RESERVA_OK = { ok: true, estado: 'CONFIRMADA', posicionEspera: null, reservaId: 'res-e2e', repetida: false };

async function montarCalendario(page: Page, respuesta: { status: number; body: unknown }) {
  const peticiones: Record<string, unknown>[] = [];

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
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#6D28D9', secondary: '#7C3AED', logoUrl: null, radius: 12 }));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, TIPOS));
  await page.route('**/rest/v1/salas**', route => json(route, SALAS));
  await page.route('**/rest/v1/instructores**', route => json(route, INSTRUCTORES));
  await page.route('**/rest/v1/planes_tarifa**', route => json(route, PLANES));
  await page.route('**/rest/v1/suscripciones**', route =>
    json(route, [suscripcion('sus-1', 's1'), suscripcion('sus-2', 's2')]));
  await page.route('**/rest/v1/socios**', route => json(route, [socia('s1', 'Ana'), socia('s2', 'Bea')]));
  await page.route('**/rest/v1/sesiones**', route => json(route, [SESION]));
  await page.route('**/rest/v1/reservas**', route => json(route, RESERVAS));
  await page.route('**/api/calendario**', route => json(route, {
    sesiones: [SESION].map(sesionApi),
    reservas: RESERVAS.map(reservaApi),
    sustituciones: [],
    salas: SALAS.map(r => ({ id: r.id, studioId: r.studio_id, nombre: r.nombre, capacidad: r.capacidad, color: r.color })),
    instructores: INSTRUCTORES.map(r => ({
      id: r.id, studioId: r.studio_id, nombre: r.nombre, email: r.email, telefono: r.telefono,
      color: r.color, activo: r.activo, avatar: r.avatar, fotoUrl: r.foto_url, rol: r.rol, authUserId: r.auth_user_id,
    })),
    horaApertura: '08:00:00', horaCierre: '22:00:00', rol: 'PROPIETARIO',
  }));
  // Si el navegador volviera a llamar a la RPC directo, esto lo delataría.
  await page.route('**/rest/v1/rpc/reservar_plaza', route => {
    peticiones.push({ rpcDirecta: true });
    return json(route, [{ estado: 'CONFIRMADA', posicion_espera: null }]);
  });
  await page.route('**/api/reservas/crear', route => {
    peticiones.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>);
    return json(route, respuesta.body, respuesta.status);
  });

  await page.goto('/calendario');
  return peticiones;
}

async function apuntarABea(page: Page, { desmarcarAviso = false } = {}) {
  await page.getByRole('button', { name: /Reformer/ }).first().click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Añadir clienta a la clase' }).click();
  const casilla = page.getByRole('checkbox', { name: 'Avisar a la alumna' });
  await expect(casilla).toBeChecked();
  if (desmarcarAviso) await casilla.uncheck();
  await page.getByRole('button', { name: /Bea/ }).click();
}

test.describe('El mostrador apunta a una clienta por el servidor', () => {
  test('por defecto se avisa a la alumna, y la reserva se anuncia', async ({ page }) => {
    const peticiones = await montarCalendario(page, { status: 200, body: RESERVA_OK });
    await apuntarABea(page);

    await expect.poll(() => peticiones.length).toBeGreaterThan(0);
    expect(peticiones).not.toContainEqual({ rpcDirecta: true });
    const [p] = peticiones;
    expect(p).toMatchObject({ sesionId: 'ses-1', socioId: 's2', avisar: true });
    expect(String(p.reservaId)).toMatch(/^res-/);
    // El estudio no viaja en la petición: lo pone la sesión de staff.
    expect(p).not.toHaveProperty('studioId');
    await expect(page.getByText(/Bea añadida/)).toBeVisible();
  });

  test('desmarcar «Avisar a la alumna» manda avisar:false y el toast lo recuerda', async ({ page }) => {
    const peticiones = await montarCalendario(page, { status: 200, body: RESERVA_OK });
    await apuntarABea(page, { desmarcarAviso: true });

    await expect.poll(() => peticiones.length).toBeGreaterThan(0);
    expect(peticiones[0]).toMatchObject({ socioId: 's2', avisar: false });
    await expect(page.getByText(/Bea añadida.*sin avisarla/)).toBeVisible();
  });

  test('el servidor dice que no (400): se enseña el motivo y NO se anuncia la reserva', async ({ page }) => {
    const peticiones = await montarCalendario(page, {
      status: 400, body: { error: 'Ya tiene otra clase o cita a esa misma hora.' },
    });
    await apuntarABea(page);

    await expect.poll(() => peticiones.length).toBeGreaterThan(0);
    await expect(page.getByText('Ya tiene otra clase o cita a esa misma hora.')).toBeVisible();
    await expect(page.getByText(/Bea añadida/)).toHaveCount(0);
  });

  test('el servidor se cae (500 sin cuerpo): mensaje genérico y NO se anuncia la reserva', async ({ page }) => {
    const peticiones = await montarCalendario(page, { status: 500, body: {} });
    await apuntarABea(page);

    await expect.poll(() => peticiones.length).toBeGreaterThan(0);
    await expect(page.getByText('No se ha podido apuntar. Inténtalo otra vez.')).toBeVisible();
    await expect(page.getByText(/Bea añadida/)).toHaveCount(0);
  });
});
