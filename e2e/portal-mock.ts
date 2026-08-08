import type { Page, Route } from '@playwright/test';
import { resolveBloquesPantalla, sembrarBloquesHome, type BloqueHome } from '../lib/portal-home-bloques.ts';
import type { VariantesPortal } from '../lib/theme-variantes.ts';
import { getThemeDefinition } from '../lib/theme-definitions.ts';
import { DEFAULT_THEME } from '../lib/theme-schema.ts';
import { themeToCssVars } from '../lib/theme-runtime.ts';

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

// Igual que enHoras, pero SIN CRUZAR MEDIANOCHE. ses-1 es "la clase reservada
// de HOY": varios tests (cuenta atrás, "Ver mi pase") dan por hecho que sigue
// apareciendo en la vista de hoy sin importar a qué hora corra la suite.
// "+3h12m desde ahora" cruzaba al día siguiente si la CI arrancaba de noche
// (la ventana de fallo real: entre las ~20:48 y las 23:59 UTC) — la pantalla
// de Clases filtra estrictamente por MISMO día, así que la reserva
// desaparecía de la vista por defecto y "Ver mi pase" dejaba de encontrarse.
function enHorasHoy(h: number, m = 0) {
  const ahora = new Date();
  const minutosHastaMedianoche = (23 - ahora.getHours()) * 60 + (59 - ahora.getMinutes());
  const minutosDeseados = Math.min(h * 60 + m, Math.max(1, minutosHastaMedianoche));
  return new Date(ahora.getTime() + minutosDeseados * 60_000).toISOString();
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

const ses = (id: string, tipoClaseId: string, h: number, aforoMaximo: number) => {
  // ses-1 es "la reserva de hoy" (ver enHorasHoy) — el resto usa enHoras a
  // secas porque su offset (26h/50h/74h) ya está pensado para caer en OTRO
  // día (navegación entre semanas), no en el de hoy.
  const inicio = id === 'ses-1' ? enHorasHoy(h, 12) : enHoras(h, 0);
  const fin = id === 'ses-1' ? new Date(new Date(inicio).getTime() + 55 * 60_000).toISOString() : enHoras(h + 1);
  return {
    id, studioId: STUDIO_ID, tipoClaseId, instructorId: 'ins-1', salaId: 'sala-1',
    inicio, fin,
    aforoMaximo, cancelada: false, notas: null, precioPuntual: null,
  };
};

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

// Catálogo del estudio: un bono acotado a Reformer, uno libre y un mensual.
const PLANES = [
  { id: 'plan-b10', studioId: STUDIO_ID, nombre: 'Bono 10', descripcion: null, precio: 175, tipo: 'BONO', sesiones: 10, activo: true, validezDias: 90, limiteSemanal: null, tiposClaseIds: ['tc-1'] },
  { id: 'plan-b5', studioId: STUDIO_ID, nombre: 'Bono 5', descripcion: null, precio: 95, tipo: 'BONO', sesiones: 5, activo: true, validezDias: 60, limiteSemanal: null },
  { id: 'plan-mes', studioId: STUDIO_ID, nombre: 'Ilimitado', descripcion: 'Clases ilimitadas', precio: 129, tipo: 'MENSUAL', sesiones: null, activo: true },
  { id: 'plan-suelta', studioId: STUDIO_ID, nombre: 'Clase suelta', descripcion: null, precio: 20, tipo: 'PUNTUAL', sesiones: 1, activo: true },
];

const SUSCRIPCION = {
  id: 'sus-1', studioId: STUDIO_ID, socioId: SOCIA.socioId, planId: 'plan-b10',
  estado: 'ACTIVA', fechaInicio: '2026-07-01', fechaFin: '2026-09-30',
  sesionesRestantes: 8, stripeSubscriptionId: null,
};

const PLAZA_FIJA = {
  id: 'pf-1', studioId: STUDIO_ID, socioId: SOCIA.socioId, diaSemana: 3, horaInicio: '18:30:00',
  salaId: 'sala-1', tipoClaseId: 'tc-1', spotId: 'sp-7', vigenciaDesde: '2026-01-01',
  vigenciaHasta: null, estado: 'ACTIVA', creadaEn: '2026-01-01T00:00:00Z',
};

// Uno cobrado con factura (enseña «PDF») y uno pendiente (enseña «Pagar»).
const RECIBOS = [
  { id: 'rec-1', studioId: STUDIO_ID, socioId: SOCIA.socioId, concepto: 'Bono 10', importe: 175, estado: 'COBRADO', fechaVencimiento: '2026-07-01', fechaCobro: '2026-07-01', metodoCobro: 'TARJETA' },
  { id: 'rec-2', studioId: STUDIO_ID, socioId: SOCIA.socioId, concepto: 'Bono 10', importe: 175, estado: 'PENDIENTE', fechaVencimiento: '2026-08-01', fechaCobro: null, metodoCobro: null },
];
const FACTURAS = [
  { id: 'fac-1', studioId: STUDIO_ID, reciboId: 'rec-1', numero: 'F-2026-001', fecha: '2026-07-01', baseImponible: 144.63, iva: 30.37, total: 175 },
];

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

export async function montarPortal(page: Page, opciones: {
  conSesion: boolean; fotoUrl?: string | null; sinPlazas?: boolean; sinHistorial?: boolean; sinAvisos?: boolean;
  /** Motivo con el que el servidor RECHAZA la reserva (400). Sin esto, acepta. */
  reservaRechazada?: string;
  /** Sin bono activo: la pantalla de Bonos tiene que decir qué hacer. */
  sinBono?: boolean;
  /** El pase arranca pendiente y pasa a «dentro» tras N peticiones (simula el
   *  escaneo de recepción SIN recargar la página). 0 = ya dentro desde el
   *  principio; undefined = nunca. */
  entraTrasPeticiones?: number;
  /** Id del plan que el SERVIDOR marca como «el más elegido». */
  planMasElegidoId?: string | null;
  /** Orden/visibilidad de los módulos de Inicio del portal (Fase 2, legacy).
   *  Se sintetiza a `homeBloques` con resolveBloquesPantalla() — mismo camino que
   *  toma el servidor de verdad (lib/db/supabase-data-admin.ts) — para que
   *  un test que solo pase esto siga viendo el comportamiento correcto sin
   *  tener que conocer el sistema de bloques (Fase 3). */
  portalHome?: { orden: string[]; ocultos: string[] };
  /** Bloques del Inicio del portal (Fase 3 — constructor). Si se pasa, GANA
   *  sobre `portalHome` (mismo criterio que resolveBloquesPantalla: en cuanto
   *  hay bloques guardados, dejan de mirar el legacy). */
  homeBloques?: BloqueHome[];
  /** Comportamiento de la barra inferior del tema (galería de temas,
   *  "Editorial"). Sin esto, `'clasica'` — el de siempre. */
  tabBarStyle?: 'clasica' | 'pestanaActiva';
  /** Variantes de FORMA por bloque (lib/theme-variantes.ts). Sin esto,
   *  ausentes — el portal se ve con la forma de siempre en todos los ejes. */
  variantes?: Partial<VariantesPortal>;
  /** Conteo REAL de apuntadas por reto (bloque "retos", tema Bloom), del
   *  estudio ENTERO. Sin esto, {} — cada reto se ve con 0. */
  retoConteos?: Record<string, number>;
  /** Retos a los que YA está apuntada la socia en sesión. Sin esto, ninguno. */
  retosApuntados?: string[];
  /** Recibos de la socia. Sin esto, los de siempre (uno COBRADO y uno
   *  PENDIENTE). Se pasa cuando el test necesita un estado concreto —p. ej.
   *  FALLIDO, que es el que el dunning deja al agotar los reintentos. */
  recibos?: typeof RECIBOS;
  /**
   * Id de un tema de la galería ('oliva'|'bloom'|'noir'|...). Monta el portal
   * COMO SI ese tema estuviera publicado: sus `variantes`/`barraClasica` por
   * studio-data (igual que el servidor) y sus CSS vars en `:root`.
   *
   * ⚠️ Sin esto, un e2e del portal corre SIEMPRE con los fallbacks del
   * componente: las vars las emite `ThemeStyle`, que es servidor y lee
   * Supabase, así que aquí no llega ninguna. Ese hueco dejó pasar tres
   * desviaciones de la barra inferior respecto al encargo sin que ningún test
   * se pusiera rojo — se veían los cuatro temas con la misma píldora blanca.
   */
  tema?: string;
}) {
  const { conSesion, fotoUrl = null, sinPlazas = false, sinHistorial = false, sinAvisos = false, reservaRechazada,
          sinBono = false, planMasElegidoId = null, entraTrasPeticiones,
          portalHome = { orden: [], ocultos: [] }, homeBloques, tabBarStyle = 'clasica', variantes,
          retoConteos = {}, retosApuntados = [], recibos = RECIBOS, tema } = opciones;

  // Un tema de la galería decide DOS cosas por caminos distintos: los ejes JS
  // (studio-data, más abajo) y las CSS vars (aquí). Hay que montar los dos o
  // el portal se ve a medias — que es exactamente lo que pasaba en el editor.
  const temaConfig = tema ? { ...DEFAULT_THEME, ...getThemeDefinition(tema)!.defaults } : null;
  if (temaConfig) {
    const vars = themeToCssVars(temaConfig) as Record<string, string>;
    await page.addInitScript((pares: [string, string][]) => {
      const aplicar = () => {
        for (const [k, v] of pares) document.documentElement.style.setProperty(k, v);
      };
      if (document.documentElement) aplicar();
      document.addEventListener('DOMContentLoaded', aplicar);
    }, Object.entries(vars));
  }
  const definicionTema = tema ? getThemeDefinition(tema) : undefined;
  let bloquesResueltos = homeBloques ?? resolveBloquesPantalla(null, 'home', portalHome).publicado;
  // ⚠️ Un tema NO es solo colores y variantes: también siembra QUÉ bloques del
  // Inicio se ven y en qué orden (`bloquesHome`). Sin esto, montar un tema en
  // un e2e enseñaba el Inicio POR DEFECTO con su paleta encima — parecido
  // pero con otros bloques y otro orden, que es justo lo que hay que comparar.
  if (!homeBloques && definicionTema?.bloquesHome?.length) {
    bloquesResueltos = sembrarBloquesHome(bloquesResueltos, [...definicionTema.bloquesHome]);
  }

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
  // El endpoint de reserva es el que decide de verdad: puede aceptar (200 con el
  // estado) o rechazar (400 con el motivo). El comodín `**/api/**` devolvía
  // siempre 200 y por eso ningún test veía nunca un "no".
  await page.route('**/api/public/reserva', route =>
    reservaRechazada
      ? json(route, { error: reservaRechazada }, 400)
      : json(route, { estado: 'CONFIRMADA', reservaId: 'res-nueva' }));
  // Con estado, no siempre `{ ok: true }`: toggleReto (studio-context.tsx)
  // re-sincroniza con /api/public/studio-data en su `finally` — un mock
  // estático revertiría el apunte justo tras la respuesta optimista.
  const retoConteosVivos: Record<string, number> = { ...retoConteos };
  const retosApuntadosVivos = new Set(retosApuntados);
  await page.route('**/api/public/retos', route => {
    const body = route.request().postDataJSON() as { retoKey: string; accion: 'marcar' | 'desmarcar' };
    if (body.accion === 'marcar' && !retosApuntadosVivos.has(body.retoKey)) {
      retosApuntadosVivos.add(body.retoKey);
      retoConteosVivos[body.retoKey] = (retoConteosVivos[body.retoKey] ?? 0) + 1;
    } else if (body.accion === 'desmarcar' && retosApuntadosVivos.has(body.retoKey)) {
      retosApuntadosVivos.delete(body.retoKey);
      retoConteosVivos[body.retoKey] = Math.max(0, (retoConteosVivos[body.retoKey] ?? 0) - 1);
    }
    return json(route, { ok: true });
  });
  // Con estado, igual que `retoConteosVivos`: el contador de la campana del
  // Inicio y el `read-all` que dispara la pantalla de Avisos al abrirse son
  // dos peticiones distintas contra la MISMA bandeja. Con un mock estático el
  // contador salía siempre igual y no se podía probar que baja — que es
  // justamente el bug que tuvo esa campana (contaba por su cuenta y nunca
  // bajaba).
  const avisosVivos: { id: string; readAt: string | null }[] =
    (sinAvisos ? [] : AVISOS_BASE).map(a => ({ ...a }));
  await page.route('**/api/notifications*', route => {
    const req = route.request();
    if (req.method() === 'PATCH') {
      const { action, id } = req.postDataJSON() as { action: string; id?: string };
      const ahora = new Date().toISOString();
      for (const a of avisosVivos) {
        if (action === 'read-all' && a.readAt == null) a.readAt = ahora;
        else if (action === 'read' && a.id === id) a.readAt = ahora;
        else if (action === 'unread' && a.id === id) a.readAt = null;
      }
      return json(route, { ok: true });
    }
    return json(route, { items: avisosVivos, unread: avisosVivos.filter(a => a.readAt == null).length });
  });
  // El pase de acceso de Marta para su clase de dentro de 3 h.
  let pasePeticiones = 0;
  await page.route('**/api/public/pase', route => json(route, {
    hayPase: true,
    vigente: true,
    yaAsistida: entraTrasPeticiones != null && pasePeticiones++ >= entraTrasPeticiones,
    minutosParaActivarse: 0,
    seActivaA: new Date(Date.now() - 60_000).toISOString(),
    inicio: enHorasHoy(3, 12),
    token: 'eyJyIjoicmVzLTEiLCJzIjoic3R1ZGlvLXRlc3QifQ.firma-de-pruebas-para-el-lienzo',
    codigo: 'A2C4E6',
  }));
  await page.route('**/api/public/session', route =>
    conSesion ? json(route, SOCIA) : json(route, { error: 'no' }, 401));
  // Refresco de aforo (el tic de REFRESCO_ACTIVO_MS). Sin este mock lo atraparía
  // el catch-all de '**/api/**' de arriba, que devuelve `{}`.
  //
  // Solo las sesiones FUTURAS, como en producción (el endpoint acota a los
  // próximos AFORO_VENTANA_DIAS). Eso hace que este mock ejerza justo el punto
  // delicado de `refrescarAforo`: las reservas de HISTORIAL quedan FUERA de la
  // ventana y tienen que sobrevivir intactas al tic. Si algún día alguien
  // convierte la fusión en un reemplazo, la pestaña «Pasadas» se vaciará sola a
  // los 5 segundos y estos tests lo verán.
  await page.route('**/api/public/aforo**', route => json(route, {
    sesionIds: SESIONES.map(s => s.id),
    aforoReservas: conSesion
      ? [{ id: MI_RESERVA.id, sesion_id: 'ses-1', estado: 'CONFIRMADA', spot_id: null }]
      : [],
  }));
  await page.route('**/api/public/studio-data', route => json(route, {
    studio: {
      id: STUDIO_ID, nombre: 'Estudio Alma', ciudad: 'Marbella', slug: SLUG,
      colorPrimario: '#2C352C', temaPortal: 'oliva', logoUrl: null, fotoUrl,
    },
    sesiones: [...SESIONES, ...HISTORIAL.map(h => h.ses)],
    tiposClase: TIPOS,
    salas: [{ id: 'sala-1', studioId: STUDIO_ID, nombre: 'Sala Norte', capacidad: 12 }],
    instructores: [{ id: 'ins-1', studioId: STUDIO_ID, nombre: 'Ana Ferrer', rol: 'INSTRUCTOR', activo: true, color: '#2C352C' }],
    spots: sinPlazas ? [] : Array.from({ length: 14 }, (_, i) => ({ id: `sp-${i + 1}`, salaId: 'sala-1', studioId: STUDIO_ID, numero: i + 1, nombre: String(i + 1), fila: Math.floor(i / 7), columna: i % 7, tipo: 'REFORMER', activo: true })), planesTarifa: PLANES, videosOnDemand: [], rewardRules: [], rewardCatalog: [],
    levelDefinitions: [], achievementDefinitions: [], challengeDefinitions: [],
    citasServicios: [], citasDisponibilidad: [],
    planMasElegidoId,
    portalHome,
    homeBloques: bloquesResueltos,
    tabBarStyle,
    barraClasica: temaConfig?.barraClasica ?? false,
    variantes: variantes ?? temaConfig?.variantes ?? null,
    retoConteos: retoConteosVivos,
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
      suscripciones: sinBono ? [] : [SUSCRIPCION],
      recibos, facturas: FACTURAS,
      plazasFijas: [PLAZA_FIJA],
      memberCredits: [], rewardHistory: [], rewardRedemptions: [],
      achievementProgress: [], challengeProgress: [], creditTransactions: [], citas: [],
      favoritos: [], retosApuntados: Array.from(retosApuntadosVivos),
    } : null,
  }));
}

/**
 * Abre la hoja de reserva de la primera clase libre que haya en la semana.
 *
 * Las clases del mock son relativas a `Date.now()`, así que caen en un día de la
 * semana distinto según cuándo se ejecute la suite. Fijar «jueves» a mano —como
 * hacía la spec de Clases— pasa hoy y falla el martes que viene.
 */
export async function abrirHojaDeReserva(page: Page) {
  const reservar = page.getByRole('button', { name: /^Reservar / });
  const dias = page.getByRole('button', { name: /^(lunes|martes|miércoles|jueves|viernes|sábado|domingo)/ });

  // ⚠️ Y si esta semana no queda ninguna, se pasa a la siguiente.
  //
  // Las clases del mock están a +3h, +26h, +50h y +74h de AHORA, así que a qué
  // semana caen depende de la hora a la que corra la suite. Un sábado por la
  // noche solo la de +3h sigue en esta semana — y esa es justo la que ya tiene
  // reservada Marta, así que no hay ningún botón "Reservar" y este ayudante
  // moría con "no hay ninguna clase libre". Pasó en CI un sábado a las 23:16,
  // tumbando una PR que no tocaba el portal.
  //
  // Mirar también la semana siguiente lo hace funcionar a cualquier hora del
  // año sin fijar ningún día a mano, que es lo que ya evitaba el bucle de días.
  for (const semana of [0, 1]) {
    if (semana > 0) await page.getByRole('button', { name: 'Semana siguiente' }).click();
    if (await reservar.count() > 0) { await reservar.first().click(); return; }
    for (let i = 0; i < await dias.count(); i++) {
      await dias.nth(i).click();
      if (await reservar.count() > 0) { await reservar.first().click(); return; }
    }
  }
  throw new Error('No hay ninguna clase libre ni esta semana ni la siguiente en el mock');
}
