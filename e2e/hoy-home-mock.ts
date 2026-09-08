import type { Page, Route } from '@playwright/test';

// Andamiaje compartido de «Hoy en el estudio»: el estudio de prueba, el día
// mockeado y el montaje de /dashboard con sesión falsa. Vive aparte para que
// otras specs (y las capturas) lo reutilicen en vez de copiarlo — Playwright
// además prohíbe que un fichero de test importe de otro.

const AUTH_UID = 'auth-e2e-duena';
const STUDIO_ID = 'studio-test';
const STORAGE_KEY = 'sb-example-auth-token';

// Martes 8 de septiembre de 2026, 10:00 UTC = 12:00 en Madrid (UTC+2). Todas
// las horas del fixture van en UTC y se leen en pantalla en hora del estudio.
const AHORA = '2026-09-08T10:00:00.000Z';

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function sesion(p: {
  id: string; inicio: string; fin: string; aforo: number;
  instructorId?: string; sustitucionAbierta?: boolean;
}) {
  return {
    id: p.id, studioId: STUDIO_ID, tipoClaseId: 'tc-1', salaId: 'sala-1',
    instructorId: p.instructorId ?? 'ins-1',
    inicio: p.inicio, fin: p.fin, aforoMaximo: p.aforo,
    cancelada: false, notas: null, precioPuntual: null, serieId: null,
    incidenciaTexto: null, googleEventId: null,
    sustitucionAbierta: p.sustitucionAbierta ?? false,
    motivoBaja: p.sustitucionAbierta ? 'Baja médica' : null,
    sustitucionId: p.sustitucionAbierta ? 'sub-1' : null,
  };
}

function reserva(p: { id: string; sesionId: string; socioId: string; estado: string; checkIn?: boolean }) {
  return {
    id: p.id, studioId: STUDIO_ID, sesionId: p.sesionId, socioId: p.socioId,
    estado: p.estado, spotId: null, posicionEspera: null, ofertaExpiraEn: null,
    checkInEn: p.checkIn ? '2026-09-08T06:05:00.000Z' : null,
    creadoEn: '2026-09-01T09:00:00.000Z',
    confirmacionPedidaEn: null, confirmadoEn: null, valoracionExperiencia: null,
  };
}

/** Tres clases que cuentan tres historias distintas del mismo día. */
function agendaDelDia() {
  const sesiones = [
    // 08:00–09:00 Madrid, ya terminada y con la lista pasada.
    sesion({ id: 'ses-pasada', inicio: '2026-09-08T06:00:00.000Z', fin: '2026-09-08T07:00:00.000Z', aforo: 4 }),
    // 14:00–15:00 Madrid: 7 de 10 → 3 huecos que llenar.
    sesion({ id: 'ses-hueco', inicio: '2026-09-08T12:00:00.000Z', fin: '2026-09-08T13:00:00.000Z', aforo: 10 }),
    // 17:00–18:00 Madrid: llena, pero la instructora avisó de que no viene.
    sesion({ id: 'ses-sin-instr', inicio: '2026-09-08T15:00:00.000Z', fin: '2026-09-08T16:00:00.000Z', aforo: 8, instructorId: 'ins-2', sustitucionAbierta: true }),
    // 19:30–20:30 Madrid: completa y sin nada pendiente.
    sesion({ id: 'ses-llena', inicio: '2026-09-08T17:30:00.000Z', fin: '2026-09-08T18:30:00.000Z', aforo: 6 }),
  ];
  const reservas = [
    ...[0, 1, 2, 3].map(i => reserva({ id: `rp${i}`, sesionId: 'ses-pasada', socioId: `soc-${i}`, estado: 'ASISTIDA', checkIn: true })),
    ...[0, 1, 2, 3, 4, 5, 6].map(i => reserva({ id: `rh${i}`, sesionId: 'ses-hueco', socioId: `soc-${i}`, estado: 'CONFIRMADA' })),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => reserva({ id: `rs${i}`, sesionId: 'ses-sin-instr', socioId: `soc-${i}`, estado: 'CONFIRMADA' })),
    ...[0, 1, 2, 3, 4, 5].map(i => reserva({ id: `rl${i}`, sesionId: 'ses-llena', socioId: `soc-${i}`, estado: 'CONFIRMADA' })),
  ];
  return {
    sesiones,
    reservas,
    sustituciones: [],
    salas: [{ id: 'sala-1', studioId: STUDIO_ID, nombre: 'Sala Reformer', capacidad: 10, color: '#6366F1', fotoUrl: null }],
    instructores: [
      { id: 'ins-1', studioId: STUDIO_ID, nombre: 'Marta', email: null, telefono: null, color: '#8A9165', activo: true, avatar: null, fotoUrl: null, rol: 'INSTRUCTOR', authUserId: null, bio: null },
      { id: 'ins-2', studioId: STUDIO_ID, nombre: 'Sonia', email: null, telefono: null, color: '#A8B37A', activo: true, avatar: null, fotoUrl: null, rol: 'INSTRUCTOR', authUserId: null, bio: null },
    ],
    horaApertura: '07:00:00',
    horaCierre: '22:00:00',
    horarioSemana: [],
    rol: 'PROPIETARIO',
  };
}

/** Socias del estudio. De la 0 a la 6 ya están en la clase de las 14:00; la 7
 *  y la 8 son las que podrían llenar el hueco. */
function sociosDelEstudio() {
  return [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => ({
    id: `soc-${i}`, studio_id: STUDIO_ID, nombre: `Socia${i}`, apellidos: 'Prueba',
    email: `socia${i}@example.com`, telefono: '+34600000000', nif: null,
    fecha_alta: '2026-01-01', activo: true, lead_stage: 'ACTIVA',
  }));
}

// El panel de candidatas se apoya en el histórico que carga el contexto, no en
// el endpoint del día: quién tiene bono en vigor y quién ya vino antes a este
// mismo tipo de clase. Sin esto la lista sale vacía —y con razón—, así que el
// test no probaría nada.
const PLAN = {
  id: 'plan-1', studio_id: STUDIO_ID, nombre: 'Bono 10', descripcion: null,
  precio: 100, tipo: 'BONO', sesiones: 10, validez_dias: null, limite_semanal: null,
  activo: true, oferta_hasta: null, periodicidad_meses: 1, matricula: 0,
};

function suscripcionesDelEstudio() {
  return [7, 8].map(i => ({
    id: `sus-${i}`, studio_id: STUDIO_ID, socio_id: `soc-${i}`, plan_id: 'plan-1',
    estado: 'ACTIVA', fecha_inicio: '2026-01-01', fecha_fin: null,
    sesiones_restantes: 5, stripe_subscription_id: null,
  }));
}

/** Un martes anterior a la misma hora: la 7 y la 8 ya vinieron. */
function historicoDelContexto() {
  const sesiones = [{
    id: 'ses-anterior', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1',
    instructor_id: 'ins-1', inicio: '2026-09-01T12:00:00.000Z', fin: '2026-09-01T13:00:00.000Z',
    aforo_maximo: 10, cancelada: false, notas: null, serie_id: null, precio_puntual: null,
    google_event_id: null, incidencia_texto: null, zoom_meeting_id: null, zoom_join_url: null,
  }];
  const reservas = [7, 8].map(i => ({
    id: `ra-${i}`, studio_id: STUDIO_ID, sesion_id: 'ses-anterior', socio_id: `soc-${i}`,
    estado: 'ASISTIDA', spot_id: null, posicion_espera: null, oferta_expira_en: null,
    check_in_en: '2026-09-01T12:02:00.000Z', creado_en: '2026-08-30T09:00:00.000Z',
    confirmacion_pedida_en: null, confirmado_en: null, recordatorio_confirmacion_en: null,
    valoracion_experiencia: null, cancelada_tardia: false,
  }));
  return { sesiones, reservas };
}

export async function montarHome(page: Page, opciones?: { calendarioVacio?: boolean }) {
  await page.clock.setFixedTime(new Date(AHORA));

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

  // El genérico va PRIMERO: Playwright resuelve la última ruta registrada que
  // encaje, así que los específicos de abajo ganan.
  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/api/layout**', route =>
    json(route, { orden: [], ocultos: [], menuPosition: 'lateral', home: { orden: [], ocultos: [] } }));
  await page.route('**/api/billing/estado**', route => json(route, { bloqueado: false }));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#343825', secondary: '#5A6142', logoUrl: null, radius: 12 }));
  await page.route('**/api/calendario**', route =>
    json(route, opciones?.calendarioVacio ? {} : agendaDelDia()));

  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/socios**', route => json(route, sociosDelEstudio()));
  await page.route('**/rest/v1/suscripciones**', route => json(route, suscripcionesDelEstudio()));
  await page.route('**/rest/v1/planes_tarifa**', route => json(route, [PLAN]));
  await page.route('**/rest/v1/sesiones**', route => json(route, historicoDelContexto().sesiones));
  await page.route('**/rest/v1/reservas**', route => json(route, historicoDelContexto().reservas));
  await page.route('**/rest/v1/tipos_clase**', route =>
    json(route, [{ id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Pilates Máquina', color: '#66704A', duracion_minutos: 60, descripcion: null, nivel: 'TODOS', foto_url: null }]));

  await page.goto('/dashboard');
}

