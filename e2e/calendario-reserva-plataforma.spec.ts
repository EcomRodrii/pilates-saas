import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Recepción apunta una plaza vendida por ClassPass desde la hoja de la clase
// (`/api/reservas/crear-externa`). La persona no es socia: sin ficha, sin bono.
//
// Los caminos de fallo llevan contador de peticiones (regla del repo): «no
// anunció éxito» sin comprobar que se INTENTÓ puede ser verdad por no hacer nada.
// Que no consume bono ni hace overbooking NO se puede demostrar aquí (la red está
// mockeada): lo prueba el ensayo SQL de la migración 20261001115958.
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

// El día del ESTUDIO, no el de UTC: la semana del Calendario empieza hoy en
// Madrid, y entre las 00:00 y las 02:00 de allí la fecha UTC aún es la de ayer
// (la clase caía fuera de la semana y el test fallaba según la hora).
const HOY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

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
const RESERVAS: { id: string; studio_id: string; sesion_id: string; socio_id: string | null; estado: string; creada_en: string; posicion_espera: null; spot_id: null; origen: string; nombre_externo: string | null }[] = [
  { id: 'r1', studio_id: STUDIO_ID, sesion_id: 'ses-1', socio_id: 's1', estado: 'CONFIRMADA', creada_en: `${HOY}T08:00:00+00:00`, posicion_espera: null, spot_id: null, origen: 'TENTARE', nombre_externo: null },
  { id: 'r-cp', studio_id: STUDIO_ID, sesion_id: 'ses-1', socio_id: null, estado: 'CONFIRMADA', creada_en: `${HOY}T08:10:00+00:00`, posicion_espera: null, spot_id: null, origen: 'CLASSPASS', nombre_externo: 'Carla Pass' },
];

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
    checkInEn: null, creadoEn: r.creada_en, origen: r.origen, nombreExterno: r.nombre_externo,
  };
}

async function montarCalendario(page: Page, respuesta: { status: number; body: unknown }, plataformasActivas: string[] = ['CLASSPASS']) {
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
  await page.route('**/rest/v1/integraciones**', route => json(route, plataformasActivas.map(tipo => ({
    id: `intg-${tipo}`, studio_id: STUDIO_ID, tipo, activo: true, config: null, actualizado_en: `${HOY}T08:00:00+00:00`,
    ultimo_ok_en: null, ultimo_error: null, ultimo_error_en: null,
  }))));
  await page.route('**/api/reservas/crear-externa', route => {
    peticiones.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>);
    return json(route, respuesta.body, respuesta.status);
  });

  await page.goto('/calendario');
  return peticiones;
}


async function abrirAnadir(page: Page) {
  await page.getByRole('button', { name: /Reformer/ }).first().click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Añadir clienta a la clase' }).click();
}

test.describe('Recepción apunta una reserva de ClassPass desde la clase', () => {
  test('con ClassPass activo: nombre, Enter y la reserva va al servidor sin socia ni estudio en el cuerpo', async ({ page }) => {
    const peticiones = await montarCalendario(page, { status: 200, body: { ok: true, reservaId: 'res-x', repetida: false, cupo: null, cupoUsado: 1, plazasLibres: 2, aviso: null } });
    await abrirAnadir(page);
    await page.getByRole('tab', { name: 'ClassPass' }).click();
    const nombre = page.getByLabel('Nombre de quien reservó en ClassPass');
    await nombre.fill('Lucía Pérez');
    await nombre.press('Enter');

    await expect.poll(() => peticiones.length).toBeGreaterThan(0);
    const [p] = peticiones;
    expect(p).toMatchObject({ sesionId: 'ses-1', plataforma: 'CLASSPASS', nombre: 'Lucía Pérez', codigo: null });
    expect(String(p.reservaId)).toMatch(/^res-/);
    expect(p).not.toHaveProperty('studioId');
    expect(p).not.toHaveProperty('socioId');
    await expect(page.getByText(/Lucía Pérez apuntada \(ClassPass\)/)).toBeVisible();
  });

  test('clase llena (409): se enseña el motivo y NO se anuncia la reserva', async ({ page }) => {
    const peticiones = await montarCalendario(page, {
      status: 409, body: { error: 'La clase está completa. Si ClassPass ya se la ha vendido, cancélala allí: aquí no queda plaza.' },
    });
    await abrirAnadir(page);
    await page.getByRole('tab', { name: 'ClassPass' }).click();
    await page.getByLabel('Nombre de quien reservó en ClassPass').fill('Lucía Pérez');
    await page.getByRole('button', { name: 'Apuntar reserva de ClassPass' }).click();

    await expect.poll(() => peticiones.length).toBeGreaterThan(0);
    await expect(page.getByTestId('anadir-reserva-plataforma').getByRole('alert')).toContainText('La clase está completa');
    await expect(page.getByText(/apuntada \(ClassPass\)/)).toHaveCount(0);
  });

  test('sin plataformas activas no aparece la opción', async ({ page }) => {
    await montarCalendario(page, { status: 200, body: {} }, []);
    await abrirAnadir(page);
    await expect(page.getByRole('textbox', { name: 'Buscar clienta' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'ClassPass' })).toHaveCount(0);
  });

  test('en la lista sale con su etiqueta, sin ficha y sin Repetir ni Hacer fija', async ({ page }) => {
    await montarCalendario(page, { status: 200, body: {} });
    await page.getByRole('button', { name: /Reformer/ }).first().click({ timeout: 30_000 });
    const nombre = page.getByText('Carla Pass', { exact: true });
    await expect(nombre).toBeVisible();
    // Sin enlace a /clientas/null.
    await expect(page.getByRole('link', { name: 'Carla Pass' })).toHaveCount(0);
    const fila = page.locator('li[data-reserva-id]', { has: nombre });
    await expect(fila.locator('[data-plataforma="CLASSPASS"]')).toHaveText('ClassPass');
    // Repetir y darle clase fija viven en el ⋯ de cada clienta: en el suyo no están.
    await fila.getByRole('button', { name: /Más acciones de/ }).click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: /semana que viene/ })).toHaveCount(0);
    await expect(menu.getByRole('menuitem', { name: /clase fija/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    // La socia de Tentare sigue enlazando a su ficha.
    await expect(page.getByRole('link', { name: /Ana Ruiz/ })).toHaveAttribute('href', '/clientas/s1');
  });
});
