import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// P2-18. "Al meter a alguien en una clase llena, la mete en lista de espera sin
// avisarme. Solo pone 'Espera #1' en letra pequeña. Si la tengo delante en el
// mostrador, le digo que está apuntada y no lo está."
//
// Había un toast, pero llega DESPUÉS y dura tres segundos: para cuando aparece,
// ella ya le ha dicho a la clienta que está dentro. Ahora se avisa antes de
// elegir el nombre, y se pregunta antes de dejar a nadie en espera.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

const HOY = new Date().toISOString().slice(0, 10);

const TIPOS = [{ id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', color: '#F7A6C4', duracion_minutos: 55, descripcion: null, nivel: 'TODOS', foto_url: null }];
const SALAS = [{ id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala 1', capacidad: 2, color: '#6366F1' }];
const INSTRUCTORES = [{ id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Marta', email: null, telefono: null, color: '#111', activo: true, rol: 'INSTRUCTOR', avatar: null, foto_url: null, auth_user_id: null }];

function socia(id: string, nombre: string) {
  return { id, studio_id: STUDIO_ID, nombre, apellidos: 'Ruiz', email: `${id}@example.com`, telefono: null, activo: true, fecha_alta: '2026-01-01', campos_extra: {}, tags: [] };
}

// Plan MENSUAL activo para las tres: así el flujo no se desvía al aviso de "sin bono".
const PLANES = [{ id: 'plan-1', studio_id: STUDIO_ID, nombre: 'Mensual', descripcion: null, precio: 60, tipo: 'MENSUAL', sesiones: null, validez_dias: null, limite_semanal: null, activo: true }];
function suscripcion(id: string, socioId: string) {
  return { id, studio_id: STUDIO_ID, socio_id: socioId, plan_id: 'plan-1', estado: 'ACTIVA', fecha_inicio: '2026-01-01', fecha_fin: '2030-01-01', sesiones_restantes: null, stripe_subscription_id: null };
}

// Aforo 1 y una reserva confirmada: la clase está LLENA.
const SESION = {
  id: 'ses-1', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'ins-1',
  inicio: `${HOY}T09:00:00+00:00`, fin: `${HOY}T09:55:00+00:00`, aforo_maximo: 1, cancelada: false,
  notas: null, serie_id: null, precio_puntual: null,
};
const RESERVAS = [{ id: 'r1', studio_id: STUDIO_ID, sesion_id: 'ses-1', socio_id: 's1', estado: 'CONFIRMADA', creada_en: `${HOY}T08:00:00+00:00`, posicion_espera: null, spot_id: null }];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

// Rediseño del Calendario: la rejilla pinta desde /api/calendario (payload por
// rol), no desde sesiones/reservas del contexto — mismo mapeo que
// mapSesion/mapReserva/mapSala/mapInstructor (lib/supabase-data.ts).
function sesionApi(r: any) {
  return {
    id: r.id, studioId: r.studio_id, tipoClaseId: r.tipo_clase_id, salaId: r.sala_id,
    instructorId: r.instructor_id, inicio: r.inicio, fin: r.fin, aforoMaximo: r.aforo_maximo,
    cancelada: r.cancelada, notas: r.notas, precioPuntual: r.precio_puntual, serieId: r.serie_id ?? null,
    incidenciaTexto: null, sustitucionAbierta: false, motivoBaja: null, sustitucionId: null,
  };
}
function reservaApi(r: any) {
  return {
    id: r.id, studioId: r.studio_id, sesionId: r.sesion_id, socioId: r.socio_id, estado: r.estado,
    spotId: r.spot_id ?? null, posicionEspera: r.posicion_espera ?? null, ofertaExpiraEn: null,
    checkInEn: null, creadoEn: r.creada_en,
  };
}
function salaApi(r: any) {
  return { id: r.id, studioId: r.studio_id, nombre: r.nombre, capacidad: r.capacidad, color: r.color };
}
function instructorApi(r: any) {
  return {
    id: r.id, studioId: r.studio_id, nombre: r.nombre, email: r.email, telefono: r.telefono,
    color: r.color, activo: r.activo, avatar: r.avatar, fotoUrl: r.foto_url, rol: r.rol ?? 'INSTRUCTOR',
    authUserId: r.auth_user_id,
  };
}

/**
 * Devuelve las llamadas a `reservar_plaza`: la inserción real pasa por esa
 * función de Postgres (atómica, decide aforo bajo bloqueo), NO por un POST a la
 * tabla. Si la lista está vacía, no se ha apuntado a nadie.
 */
async function montarCalendario(page: Page) {
  const altas: string[] = [];

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
  // Rediseño del Calendario: sin este mock no aparece ningún bloque de clase.
  await page.route('**/api/calendario**', route => json(route, {
    sesiones: [SESION].map(sesionApi),
    reservas: RESERVAS.map(reservaApi),
    sustituciones: [],
    salas: SALAS.map(salaApi),
    instructores: INSTRUCTORES.map(instructorApi),
    horaApertura: '08:00:00', horaCierre: '22:00:00', rol: 'PROPIETARIO',
  }));
  await page.route('**/rest/v1/rpc/reservar_plaza', route => {
    altas.push(route.request().postData() ?? '');
    return json(route, [{ estado: 'LISTA_ESPERA', posicion_espera: 1 }]);
  });

  await page.goto('/calendario');
  return altas;
}

async function abrirBuscador(page: Page) {
  await page.getByRole('button', { name: /Reformer/ }).first().click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Añadir clienta a la clase' }).click();
}

test.describe('Apuntar a alguien a una clase llena', () => {
  test('el buscador avisa de que la clase está llena antes de elegir', async ({ page }) => {
    await montarCalendario(page);
    await abrirBuscador(page);

    await expect(page.getByText(/Clase llena \(1\/1\)/)).toBeVisible();
    await expect(page.getByText(/entrará en lista de espera/)).toBeVisible();
  });

  test('pregunta antes de dejar a nadie en espera, y decir que no NO apunta', async ({ page }) => {
    const altas = await montarCalendario(page);
    await abrirBuscador(page);

    await page.getByRole('button', { name: /Bea/ }).click();

    const dialogo = page.getByRole('dialog').filter({ hasText: 'Esta clase está llena' });
    await expect(dialogo).toContainText('Bea');
    await expect(dialogo).toContainText('nº 1');
    await expect(dialogo).toContainText('Solo entrará si alguien cancela');

    // Nada escrito todavía.
    expect(altas).toHaveLength(0);

    await dialogo.getByRole('button', { name: 'No, déjalo' }).click();
    await expect(dialogo).toHaveCount(0);
    expect(altas).toHaveLength(0);
  });

  test('si dice que sí, se apunta y se dice que va a la espera', async ({ page }) => {
    const altas = await montarCalendario(page);
    await abrirBuscador(page);

    await page.getByRole('button', { name: /Bea/ }).click();
    await page.getByRole('dialog').filter({ hasText: 'Esta clase está llena' })
      .getByRole('button', { name: 'Sí, a la lista de espera' }).click();

    await expect.poll(() => altas.length).toBeGreaterThan(0);
    await expect(page.getByText(/lista de espera/).first()).toBeVisible();
  });
});
