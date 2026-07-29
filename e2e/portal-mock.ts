import type { Page, Route } from '@playwright/test';

// Montaje del portal de la clienta con datos deterministas, compartido por los
// tests de las dos pantallas del diseño v2. Vive fuera de un `.spec` porque
// Playwright prohíbe que un test importe de otro test.

export const SLUG = 'tentare';
const STUDIO_ID = 'studio-test';
export const SOCIA = { socioId: 'soc-marta', nombre: 'Marta Ruiz', email: 'marta@example.com' };

// Una clase dentro de 3 h 12 min, para que la cuenta atrás tenga algo que decir.
function enHoras(h: number, m = 0) {
  return new Date(Date.now() + (h * 60 + m) * 60_000).toISOString();
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

// OJO: /api/public/studio-data devuelve los datos YA mapeados al dominio
// (camelCase), no las filas crudas de Postgres. Un mock en snake_case cuela
// —la pantalla pinta igual— pero `getHomeCardContext` no encuentra nada y todo
// cae al caso "sin clases". Costó un ciclo entero de tests averiguarlo.
const TIPOS = [
  { id: 'tc-1', studioId: STUDIO_ID, nombre: 'Reformer Flow', color: '#2C352C', duracionMin: 50 },
  { id: 'tc-2', studioId: STUDIO_ID, nombre: 'Mat & Respiración', color: '#6B7A64', duracionMin: 50 },
  { id: 'tc-3', studioId: STUDIO_ID, nombre: 'Barre Sculpt', color: '#8B8779', duracionMin: 45 },
];

const ses = (id: string, tipoClaseId: string, h: number, aforoMaximo: number) => ({
  id, studioId: STUDIO_ID, tipoClaseId, instructorId: 'ins-1', salaId: 'sala-1',
  inicio: enHoras(h, id === 'ses-1' ? 12 : 0), fin: enHoras(h + 1),
  aforoMaximo, cancelada: false, notas: null, precioPuntual: null,
});

const SESIONES = [
  ses('ses-1', 'tc-1', 3, 10), ses('ses-2', 'tc-2', 26, 12),
  ses('ses-3', 'tc-3', 50, 8), ses('ses-4', 'tc-1', 74, 10),
];

// La reserva de Marta para la clase de dentro de 3 h. Tiene que estar en las
// DOS listas: `aforoReservas` (que es lo que cuenta plazas para todo el mundo) y
// `socia.reservas` (la suya, con socioId). El contexto las cruza por id.
// Doce clases repartidas en las últimas semanas, para que Progreso tenga algo
// que contar: sin esto solo se ve el estado vacío.
const HISTORIAL_BASE = Array.from({ length: 12 }, (_, i) => {
  const dias = [2, 4, 9, 11, 16, 18, 23, 25, 30, 32, 37, 44][i];
  const inicio = new Date(Date.now() - dias * 24 * 3600_000);
  inicio.setHours(9, 0, 0, 0);
  return {
    ses: {
      id: `hist-${i}`, studioId: STUDIO_ID, tipoClaseId: i % 3 === 0 ? 'tc-2' : 'tc-1',
      instructorId: 'ins-1', salaId: 'sala-1',
      inicio: inicio.toISOString(), fin: new Date(inicio.getTime() + 55 * 60_000).toISOString(),
      aforoMaximo: 10, cancelada: false, notas: null, precioPuntual: null,
    },
    res: {
      id: `hres-${i}`, studioId: STUDIO_ID, sesionId: `hist-${i}`, socioId: SOCIA.socioId,
      estado: 'ASISTIDA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '',
    },
  };
});

const MI_RESERVA = {
  id: 'res-1', studioId: STUDIO_ID, sesionId: 'ses-1', socioId: SOCIA.socioId,
  estado: 'CONFIRMADA', spotId: null, posicionEspera: null, checkInEn: null, creadoEn: '2026-07-20T10:00:00Z',
};

// Cuatro avisos como los del diseño: dos sin leer arriba, dos ya leídos abajo.
const haceHoras = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const AVISOS_BASE = [
  { id: 'n-1', title: 'Tu clase de hoy sigue en pie', body: 'Reformer Flow, 18:30 con Ana Ferrer. Te esperamos en la Sala Norte.',
    deepLink: null, category: 'clases', priority: 'ALTA', eventType: 'clase.sustituida',
    resourceType: null, resourceId: null, readAt: null, createdAt: haceHoras(2) },
  { id: 'n-2', title: 'María Soler cubre el viernes', body: 'Tu Barre Sculpt del 31 de julio mantiene hora y sala.',
    deepLink: null, category: 'clases', priority: 'NORMAL', eventType: 'clase.sustituida',
    resourceType: null, resourceId: null, readAt: null, createdAt: haceHoras(26) },
  { id: 'n-3', title: 'Te quedan 8 sesiones', body: 'Tu Bono 10 caduca el 30 de septiembre.',
    deepLink: null, category: 'pagos', priority: 'NORMAL', eventType: 'bono.por_agotarse',
    resourceType: null, resourceId: null, readAt: haceHoras(40), createdAt: haceHoras(50) },
  { id: 'n-4', title: 'Nuevo taller el 12 de agosto', body: 'El descanso también es entrenamiento. 8 plazas.',
    deepLink: null, category: 'general', priority: 'BAJA', eventType: 'estudio.aviso',
    resourceType: null, resourceId: null, readAt: haceHoras(60), createdAt: haceHoras(122) },
];

export async function montarPortal(page: Page, opciones: { conSesion: boolean; fotoUrl?: string | null; sinPlazas?: boolean; sinHistorial?: boolean; sinAvisos?: boolean }) {
  const { conSesion, fotoUrl = null, sinPlazas = false, sinHistorial = false, sinAvisos = false } = opciones;

  if (conSesion) {
    await page.addInitScript(([sesion]) => {
      // Misma clave que lib/db/supabase-portal.ts. Con esto getSession()
      // devuelve token y PortalAuthProvider pasa a resolver contra la API.
      localStorage.setItem('sb-portal-auth', JSON.stringify({
        access_token: 'e2e-token', refresh_token: 'e2e-refresh', token_type: 'bearer',
        expires_at: 4102444800, expires_in: 999999999,
        user: { id: 'auth-marta', email: sesion.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
      }));
    }, [SOCIA] as const);
  }

  // Comodines primero: Playwright resuelve las rutas en orden inverso.
  const HISTORIAL = sinHistorial ? [] : HISTORIAL_BASE;

  await page.route('**/api/**', route => json(route, {}));
  await page.route('**/rest/v1/**', route => json(route, []));
  await page.route('**/auth/v1/**', route => json(route, {}));
  await page.route('**/api/theme**', route =>
    json(route, { primary: '#2C352C', secondary: '#6B7A64', logoUrl: null, radius: 12 }));
  await page.route('**/api/notifications', route => {
    const items = sinAvisos ? [] : AVISOS_BASE;
    return json(route, { items, unread: items.filter(a => a.readAt == null).length });
  });
  // El pase de acceso de Marta para su clase de dentro de 3 h.
  await page.route('**/api/public/pase', route => json(route, {
    hayPase: true, vigente: true, yaAsistida: false, minutosParaActivarse: 0,
    seActivaA: new Date(Date.now() - 60_000).toISOString(),
    inicio: enHoras(3, 12),
    token: 'eyJyIjoicmVzLTEiLCJzIjoic3R1ZGlvLXRlc3QifQ.firma-de-pruebas-para-el-lienzo',
    codigo: 'A2C4E6',
  }));
  await page.route('**/api/public/session', route =>
    conSesion ? json(route, SOCIA) : json(route, { error: 'no' }, 401));
  await page.route('**/api/public/studio-data', route => json(route, {
    studio: {
      id: STUDIO_ID, nombre: 'Estudio Alma', ciudad: 'Marbella', slug: SLUG,
      colorPrimario: '#2C352C', temaPortal: 'oliva', logoUrl: null, fotoUrl,
    },
    sesiones: [...SESIONES, ...HISTORIAL.map(h => h.ses)],
    tiposClase: TIPOS,
    salas: [{ id: 'sala-1', studioId: STUDIO_ID, nombre: 'Sala Norte', capacidad: 12 }],
    instructores: [{ id: 'ins-1', studioId: STUDIO_ID, nombre: 'Ana Ferrer', rol: 'INSTRUCTOR', activo: true, color: '#2C352C' }],
    spots: sinPlazas ? [] : Array.from({ length: 14 }, (_, i) => ({ id: `sp-${i + 1}`, salaId: 'sala-1', studioId: STUDIO_ID, numero: i + 1, nombre: String(i + 1), fila: Math.floor(i / 7), columna: i % 7, tipo: 'REFORMER', activo: true })), planesTarifa: [], videosOnDemand: [], rewardRules: [], rewardCatalog: [],
    levelDefinitions: [], achievementDefinitions: [], challengeDefinitions: [],
    citasServicios: [], citasDisponibilidad: [],
    // OJO: studio-context cruza `socia.reservas` con `aforoReservas` POR ID
    // (`aforo.map(r => miasById.get(r.id) ?? r)`). Una reserva que solo esté en
    // `socia.reservas` NO llega a la pantalla. Ya me pasó con la primera.
    aforoReservas: conSesion
      ? [{ id: MI_RESERVA.id, sesion_id: 'ses-1', estado: 'CONFIRMADA', spot_id: null },
         ...HISTORIAL.map(h => ({ id: h.res.id, sesion_id: h.ses.id, estado: 'ASISTIDA', spot_id: null }))]
      : [],
    socia: conSesion ? {
      socio: { id: SOCIA.socioId, studioId: STUDIO_ID, nombre: 'Marta', apellidos: 'Ruiz', email: SOCIA.email, activo: true, fechaAlta: '2026-01-10', telefono: null, nif: null },
      reservas: [MI_RESERVA, ...HISTORIAL.map(h => h.res)],
      suscripciones: [], recibos: [], facturas: [], preferenciasSocio: [],
      memberCredits: [], rewardHistory: [], rewardRedemptions: [],
      achievementProgress: [], challengeProgress: [], creditTransactions: [], citas: [],
    } : null,
  }));
}
