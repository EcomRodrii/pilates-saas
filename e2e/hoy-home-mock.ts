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
export const AHORA = '2026-09-08T10:00:00.000Z';

export function json(route: Route, body: unknown, status = 200) {
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
function agendaDelDia(conClaseEnCurso = false, huecoDeUnaPlaza = false) {
  const sesiones = [
    // 11:30–12:30 Madrid: empezó hace media hora y le queda otra media. Solo
    // con `conClaseEnCurso`, para no mover las cuentas del resto de specs.
    ...(conClaseEnCurso
      ? [
        sesion({ id: 'ses-en-curso', inicio: '2026-09-08T09:30:00.000Z', fin: '2026-09-08T10:30:00.000Z', aforo: 6 }),
        // Mañana a las 10:00 Madrid: «Próximas clases» cruza de día sola, y sin
        // una del día siguiente no se prueba que cada tarjeta lleve su fecha.
        sesion({ id: 'ses-manana', inicio: '2026-09-09T08:00:00.000Z', fin: '2026-09-09T09:00:00.000Z', aforo: 6 }),
      ]
      : []),
    // 08:00–09:00 Madrid, ya terminada y con la lista pasada.
    sesion({ id: 'ses-pasada', inicio: '2026-09-08T06:00:00.000Z', fin: '2026-09-08T07:00:00.000Z', aforo: 4 }),
    // 14:00–15:00 Madrid: 7 de 10 → 3 huecos que llenar. Con `huecoDeUnaPlaza`
    // la sala es más pequeña (7 de 8 → UNA plaza): se baja el AFORO y no se
    // añaden reservas, porque las socias que llenarían esas dos plazas son
    // justo las candidatas que el panel tiene que seguir ofreciendo.
    sesion({ id: 'ses-hueco', inicio: '2026-09-08T12:00:00.000Z', fin: '2026-09-08T13:00:00.000Z', aforo: huecoDeUnaPlaza ? 8 : 10 }),
    // 17:00–18:00 Madrid: llena, pero la instructora avisó de que no viene.
    sesion({ id: 'ses-sin-instr', inicio: '2026-09-08T15:00:00.000Z', fin: '2026-09-08T16:00:00.000Z', aforo: 8, instructorId: 'ins-2', sustitucionAbierta: true }),
    // 19:30–20:30 Madrid: completa y sin nada pendiente.
    sesion({ id: 'ses-llena', inicio: '2026-09-08T17:30:00.000Z', fin: '2026-09-08T18:30:00.000Z', aforo: 6 }),
  ];
  const reservas = [
    ...(conClaseEnCurso
      ? [0, 1, 2, 3, 4].map(i => reserva({ id: `rc${i}`, sesionId: 'ses-en-curso', socioId: `soc-${i}`, estado: 'CONFIRMADA', checkIn: true }))
      : []),
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

// Con `huecoDeUnaPlaza` el estudio tiene DOCE candidatas (7…18) en vez de dos:
// las que caben en el panel (MAX_CANDIDATAS). Es el escenario que destapa el
// tope — doce seleccionadas para una sola plaza libre, que admite cuatro.
const CANDIDATAS = [7, 8];
const CANDIDATAS_MUCHAS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const candidatasDe = (huecoDeUnaPlaza: boolean) => (huecoDeUnaPlaza ? CANDIDATAS_MUCHAS : CANDIDATAS);

/** Socias del estudio. De la 0 a la 6 ya están en la clase de las 14:00; de la
 *  7 en adelante son las que podrían llenar el hueco. */
function sociosDelEstudio(huecoDeUnaPlaza = false) {
  return [0, 1, 2, 3, 4, 5, 6, ...candidatasDe(huecoDeUnaPlaza)].map(i => ({
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

function suscripcionesDelEstudio(huecoDeUnaPlaza = false) {
  return candidatasDe(huecoDeUnaPlaza).map(i => ({
    id: `sus-${i}`, studio_id: STUDIO_ID, socio_id: `soc-${i}`, plan_id: 'plan-1',
    estado: 'ACTIVA', fecha_inicio: '2026-01-01', fecha_fin: null,
    sesiones_restantes: 5, stripe_subscription_id: null,
  }));
}

/** Un martes anterior a la misma hora: las candidatas ya vinieron. */
function historicoDelContexto(huecoDeUnaPlaza = false) {
  const sesiones = [{
    id: 'ses-anterior', studio_id: STUDIO_ID, tipo_clase_id: 'tc-1', sala_id: 'sala-1',
    instructor_id: 'ins-1', inicio: '2026-09-01T12:00:00.000Z', fin: '2026-09-01T13:00:00.000Z',
    // Solo con el flag: doce asistencias no caben en una sala de diez. Sin él,
    // el fixture se queda EXACTAMENTE como estaba — las otras specs que montan
    // esta home no deben moverse ni un valor por este escenario.
    aforo_maximo: huecoDeUnaPlaza ? 20 : 10, cancelada: false, notas: null, serie_id: null, precio_puntual: null,
    google_event_id: null, incidencia_texto: null, zoom_meeting_id: null, zoom_join_url: null,
  }];
  const reservas = candidatasDe(huecoDeUnaPlaza).map(i => ({
    id: `ra-${i}`, studio_id: STUDIO_ID, sesion_id: 'ses-anterior', socio_id: `soc-${i}`,
    estado: 'ASISTIDA', spot_id: null, posicion_espera: null, oferta_expira_en: null,
    check_in_en: '2026-09-01T12:02:00.000Z', creado_en: '2026-08-30T09:00:00.000Z',
    confirmacion_pedida_en: null, confirmado_en: null, recordatorio_confirmacion_en: null,
    valoracion_experiencia: null, cancelada_tardia: false,
  }));
  return { sesiones, reservas };
}

export async function montarHome(
  page: Page,
  opciones?: { calendarioVacio?: boolean; conClaseEnCurso?: boolean; ahora?: string; huecoDeUnaPlaza?: boolean },
) {
  // Con una clase en curso hace falta poder ADELANTAR el reloj (el cronómetro
  // de «Próximas clases» cuenta segundos, y un reloj fijo no demuestra que
  // corra). `install` congela igual que `setFixedTime` mientras no se adelante
  // a mano, así que el resto de la pantalla se comporta igual.
  if (opciones?.conClaseEnCurso) await page.clock.install({ time: new Date(opciones.ahora ?? AHORA) });
  else await page.clock.setFixedTime(new Date(opciones?.ahora ?? AHORA));

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
  const unaPlaza = opciones?.huecoDeUnaPlaza ?? false;
  await page.route('**/api/calendario**', route =>
    json(route, opciones?.calendarioVacio ? {} : agendaDelDia(opciones?.conClaseEnCurso, unaPlaza)));

  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/rest/v1/studios**', route =>
    json(route, { id: STUDIO_ID, nombre: 'Studio Carmen', slug: 'studio-carmen', owner_auth_user_id: AUTH_UID }));
  await page.route('**/rest/v1/rpc/current_studio_id', route => json(route, STUDIO_ID));
  await page.route('**/rest/v1/socios**', route => json(route, sociosDelEstudio(unaPlaza)));
  await page.route('**/rest/v1/suscripciones**', route => json(route, suscripcionesDelEstudio(unaPlaza)));
  await page.route('**/rest/v1/planes_tarifa**', route => json(route, [PLAN]));
  await page.route('**/rest/v1/sesiones**', route => json(route, historicoDelContexto(unaPlaza).sesiones));
  await page.route('**/rest/v1/reservas**', route => json(route, historicoDelContexto(unaPlaza).reservas));
  await page.route('**/rest/v1/tipos_clase**', route =>
    json(route, [{ id: 'tc-1', studio_id: STUDIO_ID, nombre: 'Pilates Máquina', color: '#66704A', duracion_minutos: 60, descripcion: null, nivel: 'TODOS', foto_url: null }]));

  await page.goto('/dashboard');
}

