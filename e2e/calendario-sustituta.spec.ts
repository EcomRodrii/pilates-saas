import { test, expect, type Page, type Route } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// La ficha de una clase sin cubrir busca sustituta con el MOTOR (maqueta
// aprobada del rediseño del Calendario, 1-oct-2026). Antes «Buscar sustituta»
// abría un diálogo que cambiaba la instructora a pelo: sin historial, sin avisar
// a la nueva y sin pasar por el modo del estudio.
//
// Lo que tiene que ser cierto:
//  · Antes de pulsar dice a quién avisaría y qué hace el modo del estudio, y lo
//    que dice es lo que el motor HACE (en asistido no pasa solo a la siguiente).
//  · «Buscar sustituta» abre la baja por el servidor; «Avisar a…» es el visto
//    bueno; «¿Ya sabes quién la da?» la asigna por el servidor.
//  · Los caminos de fallo llevan contador (regla del repo).
// ─────────────────────────────────────────────────────────────────────────────

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';
const HOY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

const TIPOS = [{ id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Reformer', color: '#F7A6C4', duracion_minutos: 55, descripcion: null, nivel: 'TODOS', foto_url: null }];
const SALAS = [{ id: 'sala-1', studio_id: STUDIO_ID, nombre: 'Sala 1', capacidad: 4, color: '#6366F1' }];
const INSTRUCTORES = [
  { id: 'ins-1', studio_id: STUDIO_ID, nombre: 'Marta Ruiz', email: 'marta@example.com', telefono: null, color: '#111', activo: true, rol: 'INSTRUCTOR', avatar: null, foto_url: null, auth_user_id: null },
  { id: 'ins-2', studio_id: STUDIO_ID, nombre: 'Irene Sanz', email: 'irene@example.com', telefono: null, color: '#222', activo: true, rol: 'INSTRUCTOR', avatar: null, foto_url: null, auth_user_id: null },
  { id: 'ins-3', studio_id: STUDIO_ID, nombre: 'Cloe Pons', email: 'cloe@example.com', telefono: '600000003', color: '#333', activo: true, rol: 'INSTRUCTOR', avatar: null, foto_url: null, auth_user_id: null },
];

// Dentro de dos horas en punto: ni empezada (no se busca sustituta a una clase
// empezada) ni fuera de la semana que se ve.
const INICIO = (() => { const d = new Date(Date.now() + 2 * 3_600_000); d.setUTCMinutes(0, 0, 0); return d; })();
const SESION = {
  id: 'ses-1', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1', instructor_id: 'ins-1',
  inicio: INICIO.toISOString(), fin: new Date(INICIO.getTime() + 55 * 60_000).toISOString(), aforo_maximo: 4, cancelada: false,
  notas: null, serie_id: null, precio_puntual: null,
};
const RESERVAS = [{ id: 'r1', studio_id: STUDIO_ID, sesion_id: 'ses-1', socio_id: 's1', estado: 'CONFIRMADA', creada_en: `${HOY}T08:00:00+00:00`, posicion_espera: null, spot_id: null }];

const COLA = [
  { instructorId: 'ins-2', nombre: 'Irene Sanz', motivo: 'ya ha dado esta clase 12 veces', sinEmail: false, avisada: false },
  { instructorId: 'ins-3', nombre: 'Cloe Pons', motivo: 'este mes va holgada de horas', sinEmail: false, avisada: false },
];

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

interface Opciones {
  modo?: string;
  sustitucion?: { id: string; estado: string; instructorOriginalId: string | null } | null;
  asignar?: { status: number; body: unknown };
  /** `studios.avisar_alumnas`; sin ponerlo, la fila no trae la columna. */
  avisarAlumnas?: boolean;
}

async function montarCalendario(page: Page, opts: Opciones = {}) {
  const posts: Record<string, unknown>[] = [];
  const patches: Record<string, unknown>[] = [];

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
    json(route, {
      id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID,
      ...(opts.avisarAlumnas === undefined ? {} : { avisar_alumnas: opts.avisarAlumnas }),
    }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/tipos_clase**', route => json(route, TIPOS));
  await page.route('**/rest/v1/salas**', route => json(route, SALAS));
  await page.route('**/rest/v1/instructores**', route => json(route, INSTRUCTORES));
  await page.route('**/rest/v1/socios**', route => json(route, [{ id: 's1', studio_id: STUDIO_ID, nombre: 'Ana', apellidos: 'Ruiz', email: 's1@example.com', telefono: null, activo: true, fecha_alta: '2026-01-01', campos_extra: {}, tags: [] }]));
  await page.route('**/rest/v1/sesiones**', route => json(route, [SESION]));
  await page.route('**/rest/v1/reservas**', route => json(route, RESERVAS));
  await page.route('**/api/calendario**', route => json(route, {
    sesiones: [{
      id: SESION.id, studioId: SESION.studio_id, tipoClaseId: SESION.tipo_clase_id, salaId: SESION.sala_id,
      instructorId: SESION.instructor_id, inicio: SESION.inicio, fin: SESION.fin, aforoMaximo: SESION.aforo_maximo,
      cancelada: false, notas: null, precioPuntual: null, serieId: null,
      incidenciaTexto: null, sustitucionAbierta: !!opts.sustitucion, motivoBaja: null, sustitucionId: opts.sustitucion?.id ?? null,
      sustitucionEstado: opts.sustitucion?.estado ?? null,
      // Marta está de vacaciones: la clase sale sin cubrir.
      ausencia: { tipo: 'VACACIONES', desde: HOY, hasta: HOY },
      instructoraInactiva: false, floja: null,
    }],
    reservas: RESERVAS.map(r => ({
      id: r.id, studioId: r.studio_id, sesionId: r.sesion_id, socioId: r.socio_id, estado: r.estado,
      spotId: null, posicionEspera: null, ofertaExpiraEn: null, checkInEn: null, creadoEn: r.creada_en,
    })),
    sustituciones: [],
    salas: SALAS.map(r => ({ id: r.id, studioId: r.studio_id, nombre: r.nombre, capacidad: r.capacidad, color: r.color })),
    instructores: INSTRUCTORES.map(r => ({
      id: r.id, studioId: r.studio_id, nombre: r.nombre, email: r.email, telefono: r.telefono,
      color: r.color, activo: r.activo, avatar: r.avatar, fotoUrl: r.foto_url, rol: r.rol, authUserId: r.auth_user_id,
    })),
    horaApertura: '00:00:00', horaCierre: '23:59:00', ausenciasCargadas: true, rol: 'PROPIETARIO',
  }));
  await page.route('**/api/sustituciones/clase**', route => json(route, {
    modo: opts.modo ?? 'asistido',
    sustitucion: opts.sustitucion ?? null,
    cola: COLA,
    siguienteId: 'ins-2',
    contactos: [],
  }));
  await page.route(u => u.pathname === '/api/sustituciones', route => {
    const req = route.request();
    const cuerpo = req.postDataJSON() as Record<string, unknown>;
    if (req.method() === 'PATCH') {
      patches.push(cuerpo);
      return json(route, { ok: true, candidata: 'Irene Sanz', emailEnviado: true });
    }
    posts.push(cuerpo);
    if (cuerpo.asignarA) {
      const r = opts.asignar ?? { status: 200, body: { ok: true, sesion_id: 'ses-1', alumnas: { avisadas: 1, total: 1, skipped: false, desactivado: false } } };
      return json(route, r.body, r.status);
    }
    return json(route, { sustitucion: { id: 'sust-1', estado: 'pendiente_aprobacion' }, yaExistia: false });
  });

  await page.goto('/calendario');
  await page.getByRole('button', { name: /Reformer/ }).first().click({ timeout: 30_000 });
  return { posts, patches };
}

test.describe('Buscar sustituta desde la ficha de la clase', () => {
  test('dice a quién y cómo antes de buscar, y «Buscar sustituta» abre la baja por el servidor', async ({ page }) => {
    const { posts } = await montarCalendario(page);
    await expect(page.getByText(/Las que mejor encajan:/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Irene Sanz \(ya ha dado esta clase 12 veces\), Cloe Pons/)).toBeVisible();
    // En asistido no se promete que se pase sola a la siguiente.
    await expect(page.getByText(/Tú das el visto bueno antes de avisar a cada una/)).toBeVisible();
    await expect(page.getByText(/Avisamos por orden/)).toHaveCount(0);

    await page.getByRole('button', { name: 'Buscar sustituta' }).click();
    await expect(page.getByText(/Búsqueda abierta: dale el visto bueno/)).toBeVisible({ timeout: 30_000 });
    expect(posts).toEqual([{ sesionId: 'ses-1' }]);
  });

  test('en autónomo dice que avisa solo, por orden', async ({ page }) => {
    await montarCalendario(page, { modo: 'autonomo' });
    await expect(page.getByText(/Avisamos por orden a quien mejor encaja/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/La primera que acepte se queda la clase/)).toBeVisible();
  });

  test('con la búsqueda esperando el visto bueno, «Avisar a Irene» la avisa', async ({ page }) => {
    const { patches } = await montarCalendario(page, { sustitucion: { id: 'sust-1', estado: 'pendiente_aprobacion', instructorOriginalId: 'ins-1' } });
    await page.getByRole('button', { name: 'Avisar a Irene Sanz' }).click({ timeout: 30_000 });
    await expect(page.getByText('Avisada Irene Sanz')).toBeVisible({ timeout: 30_000 });
    expect(patches).toEqual([{ action: 'contactar', sustitucionId: 'sust-1', instructorId: 'ins-2' }]);
  });

  test('«¿Ya sabes quién la da?» la asigna por el servidor, avisando a las clientas', async ({ page }) => {
    const { posts } = await montarCalendario(page);
    await page.getByRole('combobox', { name: 'Instructora que la da' }).selectOption({ label: 'Cloe Pons' }, { timeout: 30_000 });
    // Cloe tiene teléfono: se le puede preguntar antes por WhatsApp, como en el diálogo de antes.
    await expect(page.getByRole('link', { name: /Preguntarle antes por WhatsApp/ })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Avisar a la clienta apuntada' })).toBeChecked();
    await page.getByRole('button', { name: 'Asignar y avisarla' }).click();

    await expect(page.getByText('Clase cubierta con Cloe Pons · avisadas 1 de 1 clientas')).toBeVisible({ timeout: 30_000 });
    expect(posts).toEqual([{ sesionId: 'ses-1', asignarA: 'ins-3', avisar: true }]);
  });

  test('con el aviso a las clientas apagado en el estudio, lo dice en vez de ofrecer una casilla que no haría nada', async ({ page }) => {
    const { posts } = await montarCalendario(page, {
      avisarAlumnas: false,
      // Lo que devuelve el servidor con el aviso apagado: ni las cuenta.
      asignar: { status: 200, body: { ok: true, sesion_id: 'ses-1', alumnas: { avisadas: 0, total: 0, skipped: false, desactivado: true } } },
    });
    await page.getByRole('combobox', { name: 'Instructora que la da' }).selectOption({ label: 'Cloe Pons' }, { timeout: 30_000 });
    await expect(page.getByText('A las clientas no se les avisa del cambio: ese aviso está apagado en Sustituciones.')).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Avisar a/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Asignar y avisarla' }).click();

    // Antes este «sin avisar» no salía nunca: se miraba el total (0) antes que `desactivado`.
    await expect(page.getByText('Clase cubierta con Cloe Pons · sin avisar a las clientas (el aviso está apagado en Sustituciones)'))
      .toBeVisible({ timeout: 30_000 });
    expect(posts.length, 'tiene que haber asignado por el servidor').toBe(1);
  });

  test('si el servidor no deja asignarla, lo dice y no anuncia nada', async ({ page }) => {
    const { posts } = await montarCalendario(page, {
      asignar: { status: 409, body: { error: 'No se puede: esta instructora ya tiene otra clase en ese horario. Elige a otra.', motivo: 'conflicto_horario' } },
    });
    await page.getByRole('combobox', { name: 'Instructora que la da' }).selectOption({ label: 'Irene Sanz' }, { timeout: 30_000 });
    await page.getByRole('button', { name: 'Asignar y avisarla' }).click();

    await expect(page.getByText(/ya tiene otra clase en ese horario/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Clase cubierta con/)).toHaveCount(0);
    expect(posts.length, 'tiene que haber intentado asignar').toBeGreaterThan(0);
  });
});
