import 'server-only';

import { capturarExcepcion, capturarMensaje } from '@/lib/sentry-cliente';
import { supabase } from '@/lib/db/supabase';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { conCacheCatalogo } from '@/lib/cache/catalogo-estudio';
import { getLayout } from '@/lib/layout-data';
import { enviarEmailTransaccional, type DatosClaseEmail } from '@/lib/emails/send-server';
import { enviarWhatsAppTexto, type WhatsAppCredenciales } from '@/lib/whatsapp';
import { uid } from '@/lib/utils';
// `debeDevolverBono` ya no se usa aquí: quien decide si se devuelve la sesión
// del bono al cancelar es la BD (migr 0129). `esCancelacionTardia` sí sigue,
// porque decide el texto del aviso a la socia, no la política.
import {
  siguienteEnEspera, contarReservasActivasFuturas, esCancelacionTardia,
  heredaOverride, puedeReservarPorAntelacionMaxima, puedeReservarPorVentanaMinima,
} from '@/lib/booking-logic';
import { bonoConsumible, calcularDevolucionBono, tieneEntitlementActivo, hayAlgoQueContratar } from '@/lib/bono-logic';
import { idEstudioDe } from '@/lib/id-estudio';
import { RESERVADAS as SLUGS_RESERVADOS } from '@/lib/slug';
import { validarCanje, decidirOtorgarCreditos } from '@/lib/engines/reward-engine';
import { calcularMetrica } from '@/lib/engines/achievement-engine';
import { calcularProgresoReto } from '@/lib/engines/challenge-engine';
import { decidirPremioReferido } from '@/lib/booking-logic';
import { evaluarFeature, evaluarLimiteSocias } from '@/lib/billing/billing-rules';
import { recordatoriosRevision, textoRecordatorioRevision } from '@/lib/ficha-clinica';
import { mensajeDeFalloAlGuardar, type ResultadoEscritura } from '@/lib/errores';
import { planMasElegido } from '@/lib/estudio-publico';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  RowAchievementDefinitions,
  RowAchievementHistory,
  RowAchievementProgress,
  RowActividadReciente,
  RowAutomationLogs,
  RowAutomationRules,
  RowAutomatizaciones,
  RowBackups,
  RowCampanas,
  RowChallengeDefinitions,
  RowChallengeHistory,
  RowChallengeProgress,
  RowCitas,
  RowCitasServicios,
  RowCitasDisponibilidad,
  RowFavoritosClase,
  RowContenidoPortal,
  RowContenidoPortalBanners,
  RowCodigosDescuento,
  RowCreditTransactions,
  RowDashboardCharts,
  RowFacturas,
  RowInstructores,
  RowIntegraciones,
  RowLevelDefinitions,
  RowMemberCredits,
  RowMensajesEquipo,
  RowCanalesEquipo,
  RowCondicionesSalud,
  RowRespuestasSesion,
  RowNotasInternas,
  RowNotasProgreso,
  RowNotificaciones,
  RowPlanesTarifa,
  RowPostsComunidad,
  RowPreferenciasSocio,
  RowProductosPos,
  RowRecibos,
  RowReservas,
  RowRewardActions,
  RowRewardCatalog,
  RowRewardHistory,
  RowRewardRedemptions,
  RowRewardRules,
  RowSalas,
  RowBloqueosMaquina,
  RowPlazasFijas,
  RowRecuperaciones,
  RowSocioExcepciones,
  RowSesiones,
  RowSocios,
  RowCamposPersonalizados,
  RowPlantillasEmail,
  RowInstructorDependencySnapshots,
  RowSpots,
  RowStudios,
  RowMandatosSepa,
  RowSuscripciones,
  RowTiposClase,
  RowUsuarios,
  RowVentasPos,
  RowVideosOnDemand,
} from '@/lib/db-types';
import type {
  AchievementDefinition,
  AchievementHistory,
  AchievementProgress,
  ActividadReciente,
  AutomationLog,
  AutomationRule,
  Automatizacion,
  BackupMeta,
  Campana,
  ChallengeDefinition,
  ChallengeHistory,
  ChallengeProgress,
  Cita,
  ServicioCita,
  DisponibilidadCita,
  TipoCita,
  CodigoDescuento,
  CreditTransaction,
  DashboardChart,
  Factura,
  Instructor,
  Integracion,
  TipoIntegracion,
  LevelDefinition,
  MemberCredits,
  MensajeEquipo,
  CanalEquipo,
  MetodoCobro,
  CondicionSalud,
  RespuestaSesionRow,
  NotaInterna,
  NotaProgreso,
  Notificacion,
  NivelSemaforo,
  PlanTarifa,
  PostComunidad,
  ComentarioComunidad,
  PreferenciasSocio,
  ProductoPOS,
  Recibo,
  Reserva,
  RewardAction,
  RewardCatalogItem,
  RewardHistory,
  RewardRedemption,
  RewardRule,
  RewardTrigger,
  Sala,
  BloqueoMaquina,
  PlazaFija,
  Recuperacion,
  SocioExcepcion,
  Sesion,
  Socio,
  CampoPersonalizado,
  PlantillaEmail,
  InstructorDependencySnapshot,
  Spot,
  Studio,
  MandatoSEPA,
  Suscripcion,
  TipoClase,
  Usuario,
  VentaPOS,
  VideoOnDemand,
} from '@/lib/types';
import {
  generarHuecosDia, dentroDeDisponibilidad, horaParedAInstante,
  type IntervaloOcupado, type HuecoCita,
} from '@/lib/citas/slots';

import {
  fetchAllRows,
  getCurrentStudioId,
  reportDbError,
  hidratarTiposDePlanes,
  mapInstructor,
  mapSocio,
  mapPlanTarifa,
  mapSuscripcion,
  mapSesion,
  mapReserva,
  mapMensajeEquipo,
  mapAchievementDefinition,
  mapAchievementHistory,
  mapAchievementProgress,
  mapActividadReciente,
  mapAutomationLog,
  mapAutomationRule,
  mapAutomatizacion,
  mapBackupMeta,
  mapBloqueoMaquina,
  mapCampana,
  mapChallengeDefinition,
  mapChallengeHistory,
  mapChallengeProgress,
  mapCita,
  mapCodigoDescuento,
  mapCondicionSalud,
  mapCreditTransaction,
  mapDashboardChart,
  mapDisponibilidadCita,
  mapFactura,
  mapIntegracion,
  mapLevelDefinition,
  mapMandatoSepa,
  mapMemberCredits,
  mapNotaInterna,
  mapNotaProgreso,
  mapNotificacion,
  mapPlazaFija,
  mapPostComunidad,
  mapPreferenciasSocio,
  mapProductoPOS,
  mapRecibo,
  mapRecuperacion,
  mapRespuestaSesion,
  mapRewardAction,
  mapRewardCatalogItem,
  mapRewardHistory,
  mapRewardRedemption,
  mapRewardRule,
  mapSala,
  mapFavoritoClase,
  mapContenidoPortal,
  mapBannerPortal,
  mapServicioCita,
  mapSocioExcepcion,
  mapSpot,
  mapTipoClase,
  mapUsuario,
  mapVentaPOS,
  mapVideoOnDemand,
} from '@/lib/supabase-data';

function dbEscritura(): SupabaseClient {
  return getSupabaseAdmin() ?? supabase;
}

// ─── Global DB error reporting ───────────────────────────────────────────────
// Write helpers are fire-and-forget; when a write fails we log to console AND
// notify any registered listener (the UI) so the failure is visible to the user
// instead of silently lost.

// Sentinel truthy (no se muestra en ningún sitio, solo hace que `!bienvenidaVistaEn`
// sea false) para filas sin la columna `bienvenida_vista_en` — ver mapStudio.

export async function dbSetTerminalReader(studioId: string, readerId: string | null, locationId: string | null) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('studios')
    .update({ stripe_terminal_reader_id: readerId, stripe_terminal_location_id: locationId })
    .eq('id', studioId);
  if (error) reportDbError('[dbSetTerminalReader]', error);
}


function mapInstructorPublico(r: RowInstructores): Instructor {
  return { ...mapInstructor(r), email: null, telefono: null, authUserId: null };
}


function studioPublico(r: RowStudios) {
  return {
    id: r.id,
    nombre: r.nombre,
    ciudad: r.ciudad,
    descripcion: r.descripcion ?? null,
    anioFundacion: r.anio_fundacion ?? null,
    direccion: r.direccion,
    email: r.email,
    telefono: r.telefono,
    colorPrimario: r.color_primario,
    logoUrl: r.logo_url ?? null,
    plan: r.plan,
    avatarAdmin: r.avatar_admin ?? null,
    slug: r.slug ?? null,
    // Política/términos del estudio: el portal se los muestra a la clienta y quedan
    // registrados con su aceptación. null = el cliente usa el texto por defecto.
    politicaPrivacidad: (r as { politica_privacidad?: string | null }).politica_privacidad ?? null,
    terminosServicio: (r as { terminos_servicio?: string | null }).terminos_servicio ?? null,
    // Política pública que la página de reservas necesita para avisar a la socia
    // (ventana de cancelación) y hacer el pre-check de derechos/límite.
    cancelacionVentanaHoras: r.cancelacion_ventana_horas ?? 12,
    cancelacionDevolverBonoTardia: r.cancelacion_devolver_bono_tardia ?? false,
    reservaExigirPlan: r.reserva_exigir_plan ?? true,
    compraPublicaModo: (r.compra_publica_modo as 'EXIGIR_REGISTRO' | 'CREAR_FICHA') ?? 'EXIGIR_REGISTRO',
    reservaMaxSimultaneas: r.reserva_max_simultaneas ?? null,
    reservaVentanaMinimaMinutos: r.reserva_ventana_minima_minutos ?? 0,
    reservaAntelacionMaximaDias: r.reserva_antelacion_maxima_dias ?? null,
    permiteListaEspera: r.permite_lista_espera ?? true,
  };
}


export type PublicStudioData = Awaited<ReturnType<typeof fetchPublicStudioData>>;

/**
 * El estudio al que apunta una dirección pública, mirando también las viejas.
 *
 * Un estudio que se rebautiza cambia su dirección, pero la anterior está en la
 * bio de Instagram, en el QR de la puerta y en cada WhatsApp que ha mandado.
 * Si la dirección es antigua se devuelve `slugActual` para que la ruta redirija
 * en vez de enseñar un 404 a una clienta que hizo lo correcto.
 */

export async function resolverStudioPorSlug(
  admin: SupabaseClient,
  slug: string,
): Promise<{ row: Record<string, unknown>; slugActual: string | null } | null> {
  const { data: directo } = await admin
    .from('studios').select('*').eq('slug', slug).maybeSingle();
  if (directo) return { row: directo, slugActual: null };

  const { data: antiguo } = await admin
    .from('studio_slugs_antiguos').select('studio_id').eq('slug', slug).maybeSingle();
  if (!antiguo) return null;

  const { data: row } = await admin
    .from('studios').select('*').eq('id', antiguo.studio_id).maybeSingle();
  if (!row) return null;
  return { row, slugActual: (row as { slug: string }).slug };
}


export async function fetchPublicStudioData(
  slug: string,
  member?: { socioId: string; email: string },
) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada (SUPABASE_SERVICE_ROLE_KEY)');

  const resuelto = await resolverStudioPorSlug(admin as never, slug);
  if (!resuelto) return null;
  const studioRow = resuelto.row as unknown as RowStudios;
  const studioId: string = studioRow.id;

  // Catálogo público (nada de PII): clases, horarios, salas, instructoras,
  // planes, spots, vídeos y la configuración de gamificación (niveles, logros,
  // retos, recompensas y sus reglas) — el portal la necesita para pintar.
  //
  // Es el mismo catálogo para CUALQUIER visitante de este estudio (nunca varía
  // por socia), y cambia con frecuencia de días/semanas (un plan, una sala) —
  // no de segundos. Se cachea con TTL corto: el mismo estudio recibe muchas
  // visitas de socias distintas en ventanas de segundos/minutos, y hoy cada una
  // repetía las mismas 13 queries desde cero (audit de rendimiento, hallazgo
  // "CACHE"). sesiones y el aforo de plazas quedan FUERA del caché a propósito
  // — cambian con cada reserva/cancelación y una socia no debe ver una plaza
  // como libre cuando ya se ocupó hace 10 segundos.
  const catalogo = await conCacheCatalogo(`catalogo-publico:${studioId}`, async () => {
    const [
      tiposClaseRes, salasRes, instructoresRes, spotsRes, planesRes, videosRes,
      rewardRulesRes, rewardCatalogRes, levelDefsRes, achDefsRes, chalDefsRes,
      citasServiciosRes, citasDisponibilidadRes, susPlanesRes,
      contenidoPortalRes, bannersPortalRes, layout,
    ] = await Promise.all([
      admin.from('tipos_clase').select('*').eq('studio_id', studioId),
      admin.from('salas').select('*').eq('studio_id', studioId),
      admin.from('instructores').select('*').eq('studio_id', studioId),
      admin.from('spots').select('*').eq('studio_id', studioId),
      admin.from('planes_tarifa').select('*').eq('studio_id', studioId),
      admin.from('videos_on_demand').select('*').eq('studio_id', studioId),
      admin.from('reward_rules').select('*').eq('studio_id', studioId),
      admin.from('reward_catalog').select('*').eq('studio_id', studioId),
      admin.from('level_definitions').select('*').eq('studio_id', studioId),
      admin.from('achievement_definitions').select('*').eq('studio_id', studioId),
      admin.from('challenge_definitions').select('*').eq('studio_id', studioId),
      // Catálogo de citas 1:1 (0046): solo servicios auto-reservables y activos +
      // el horario fino. Nada de PII (los huecos se calculan aparte en servidor).
      admin.from('citas_servicios').select('*').eq('studio_id', studioId).eq('activo', true).eq('auto_reservable', true),
      admin.from('citas_disponibilidad').select('*').eq('studio_id', studioId),
      // Solo `plan_id`: es un RECUENTO para «EL MÁS ELEGIDO», no datos de nadie.
      // Tiene que salir del estudio ENTERO — calcularlo en el navegador con las
      // suscripciones que allí hay (las de la socia identificada, y ninguna si
      // no lo está) convertía su propia compra repetida en prueba social.
      admin.from('suscripciones').select('plan_id').eq('studio_id', studioId),
      admin.from('contenido_portal').select('*').eq('studio_id', studioId).maybeSingle(),
      // Filtrado en SQL (activo + ubicación 'home'), no en el cliente — es lo
      // que gana la tabla normalizada frente a un jsonb. La ventana de fechas se
      // filtra en el cliente: "hoy" depende del momento de carga, no de cuándo
      // se rellenó este caché de hasta 60s.
      admin.from('contenido_portal_banners').select('*')
        .eq('studio_id', studioId).eq('activo', true).contains('ubicacion', ['home'])
        .order('orden', { ascending: true }),
      // Orden/visibilidad de los módulos de Inicio del portal (Fase 2 del
      // editor de temas) — getLayout ya es una función pública sin auth
      // (service-role, cacheada con React cache), así que se llama tal cual,
      // sin RLS/endpoint nuevo.
      getLayout(studioId),
    ]);

    // Mismo motivo que en el panel: el portal decide con esto si una clase
    // está incluida en el bono o hay que enseñar precio de suelta.
    const planesConTiposPub = await hidratarTiposDePlanes(admin as never, studioId, (planesRes.data ?? []).map(mapPlanTarifa));
    return {
      tiposClase: (tiposClaseRes.data ?? []).map(mapTipoClase),
      salas: (salasRes.data ?? []).map(mapSala),
      instructores: (instructoresRes.data ?? []).map(mapInstructorPublico),
      spots: (spotsRes.data ?? []).map(mapSpot),
      planesTarifa: planesConTiposPub,
      videosOnDemand: (videosRes.data ?? []).map(mapVideoOnDemand),
      rewardRules: (rewardRulesRes.data ?? []).map(mapRewardRule),
      rewardCatalog: (rewardCatalogRes.data ?? []).map(mapRewardCatalogItem),
      levelDefinitions: (levelDefsRes.data ?? []).map(mapLevelDefinition),
      achievementDefinitions: (achDefsRes.data ?? []).map(mapAchievementDefinition),
      challengeDefinitions: (chalDefsRes.data ?? []).map(mapChallengeDefinition),
      citasServicios: (citasServiciosRes.data ?? []).map((r) => mapServicioCita(r as RowCitasServicios)),
      citasDisponibilidad: (citasDisponibilidadRes.data ?? []).map((r) => mapDisponibilidadCita(r as RowCitasDisponibilidad)),
      contenidoPortal: contenidoPortalRes.data ? mapContenidoPortal(contenidoPortalRes.data as RowContenidoPortal) : null,
      bannersPortal: (bannersPortalRes.data ?? []).map((r) => mapBannerPortal(r as RowContenidoPortalBanners)),
      portalHome: layout.portalHome,
      planMasElegidoId: planMasElegido(
        planesConTiposPub,
        (susPlanesRes.data ?? []).map(r => ({ planId: r.plan_id as string }) as Suscripcion),
      ),
    };
  });

  // Fuera del caché a propósito (ver comentario arriba): disponibilidad real.
  const [{ data: sesionesData }, { data: reservasAforo }] = await Promise.all([
    admin.from('sesiones').select('*').eq('studio_id', studioId),
    admin.from('reservas').select('id, sesion_id, estado, spot_id').eq('studio_id', studioId),
  ]);

  const base = {
    studio: studioPublico(studioRow as RowStudios),
    sesiones: (sesionesData ?? []).map(mapSesion),
    ...catalogo,
    aforoReservas: (reservasAforo ?? []) as { id: string; sesion_id: string; estado: string; spot_id: string | null }[],
  };

  if (!member) return { ...base, socia: null };

  // Datos de la socia: SOLO si el id existe en ese estudio Y el email coincide
  // (prueba mínima de identidad). Si no valida, no se devuelve nada suyo.
  const { data: socioRow } = await admin
    .from('socios').select('*')
    .eq('id', member.socioId).eq('studio_id', studioId).maybeSingle();

  const emailOk = socioRow &&
    (socioRow.email ?? '').trim().toLowerCase() === member.email.trim().toLowerCase();
  if (!socioRow || !emailOk) return { ...base, socia: null };

  const sid = member.socioId;
  const [susRes, resRes, recRes, prefRes, credRes, histRes, redRes, achProgRes, chalProgRes, txRes, citasRes, plazasRes, favRes] =
    await Promise.all([
      admin.from('suscripciones').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('reservas').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('recibos').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('preferencias_socio').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('member_credits').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('reward_history').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('reward_redemptions').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('achievement_progress').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('challenge_progress').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('credit_transactions').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('citas').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      // Su plaza fija (F2). Solo se cargaba en el panel, así que la tarjeta
      // «PLAZA FIJA» del portal no se habría pintado nunca — ni con la plaza
      // contratada y pagada.
      admin.from('plazas_fijas').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('favoritos_clase').select('*').eq('studio_id', studioId).eq('socio_id', sid),
    ]);

  const misRecibos = (recRes.data ?? []).map(mapRecibo);
  const misReciboIds = misRecibos.map(r => r.id);
  // Facturas no tiene socio_id directo, pero SÍ recibo_id: antes se traía la
  // tabla ENTERA del estudio para filtrarla en el cliente por reciboId. Con
  // PostgREST truncando a 1000 filas por defecto, una socia de un estudio con
  // más de 1000 facturas históricas podía dejar de ver algunas de las suyas
  // (auditoría 2026-07-29, hallazgo 2.3) — y de paso se traía miles de filas
  // ajenas para tirar casi todas. Filtrando por sus propios recibo_id, la
  // consulta nunca puede rozar ese límite (acotada al historial de UNA socia).
  // El corto-circuito con longitud 0 no es por corrección (`.in()` con un array
  // vacío ya devuelve cero filas en PostgREST), es a propósito para no gastar
  // un viaje de red entero en una socia recién dada de alta que aún no tiene
  // ningún recibo.
  const { data: facData } = misReciboIds.length > 0
    ? await admin.from('facturas').select('*').eq('studio_id', studioId).in('recibo_id', misReciboIds)
    : { data: [] as RowFacturas[] };

  return {
    ...base,
    socia: {
      socio: mapSocio(socioRow as RowSocios),
      suscripciones: (susRes.data ?? []).map(mapSuscripcion),
      reservas: (resRes.data ?? []).map(mapReserva),
      recibos: misRecibos,
      facturas: (facData ?? []).map(mapFactura),
      preferenciasSocio: (prefRes.data ?? []).map(mapPreferenciasSocio),
      memberCredits: (credRes.data ?? []).map(mapMemberCredits),
      rewardHistory: (histRes.data ?? []).map(mapRewardHistory),
      rewardRedemptions: (redRes.data ?? []).map(mapRewardRedemption),
      achievementProgress: (achProgRes.data ?? []).map(mapAchievementProgress),
      challengeProgress: (chalProgRes.data ?? []).map(mapChallengeProgress),
      creditTransactions: (txRes.data ?? []).map(mapCreditTransaction),
      citas: (citasRes.data ?? []).map(mapCita),
      plazasFijas: (plazasRes.data ?? []).map(mapPlazaFija),
      favoritos: (favRes.data ?? []).map((r) => mapFavoritoClase(r as RowFavoritosClase)),
    },
  };
}

// ─── Escrituras públicas scopeadas (service-role + validación) ───────────────
// Cada operación valida que la socia (id + email) pertenece al estudio antes de
// tocar nada, y usa la lógica pura ya testeada (booking-logic/bono-logic).

// Prueba mínima de identidad: el id de socia existe en ese estudio y su email
// coincide. Devuelve la fila de la socia o null.

async function validarSociaPublica(
  admin: SupabaseClient, studioId: string, socioId: string, email: string,
): Promise<RowSocios | null> {
  const { data } = await admin
    .from('socios').select('*').eq('id', socioId).eq('studio_id', studioId).maybeSingle();
  if (!data) return null;
  const ok = (data.email ?? '').trim().toLowerCase() === email.trim().toLowerCase();
  return ok ? (data as RowSocios) : null;
}

// Descuenta una sesión del bono activo de la socia (si aplica) usando bono-logic.
// Si el bono se agota, genera el recibo de renovación PENDIENTE.
// Devuelve true si realmente descontó una sesión de un bono (false si la socia
// no tenía bono consumible — p. ej. plan mensual). Lo usa el email de promoción
// para no afirmar "se descontó una sesión" cuando no fue así.
// Recibe la SESIÓN, no el tipo de clase: el tipo se resuelve aquí una sola vez
// (antes lo consultaba cada llamante por su cuenta) y así se le puede pasar la
// sesión a la RPC, que vuelve a comprobar la cobertura del lado de la BD.

async function consumirBonoServidor(admin: SupabaseClient, studioId: string, socioId: string, sesionId: string): Promise<boolean> {
  const { data: ses } = await admin.from('sesiones').select('tipo_clase_id').eq('id', sesionId).maybeSingle();
  const tipoClaseId = (ses?.tipo_clase_id as string | null) ?? null;
  const [{ data: susRows }, { data: planRows }] = await Promise.all([
    admin.from('suscripciones').select('*').eq('studio_id', studioId).eq('socio_id', socioId),
    admin.from('planes_tarifa').select('*').eq('studio_id', studioId),
  ]);
  const suscripciones = (susRows ?? []).map(mapSuscripcion);
  // Los tipos que cubre cada plan viven aparte (0111): sin hidratarlos se
  // descontaría de un bono que no cubre esta clase.
  const planes = await hidratarTiposDePlanes(admin as never, studioId, (planRows ?? []).map(mapPlanTarifa));
  const consumible = bonoConsumible(socioId, suscripciones, planes, undefined, tipoClaseId);
  if (!consumible) return false;
  const { suscripcion: sus, plan } = consumible;
  // Decremento ATÓMICO condicional (arregla el sobre-consumo concurrente): N
  // reservas simultáneas de la misma socia ya NO comparten el mismo descuento.
  // Devuelve el nuevo saldo, o null si otra reserva ya agotó el bono / hubo error.
  const { data: nuevoSaldo, error } = await admin.rpc('consumir_sesion_bono', {
    p_suscripcion_id: sus.id,
    p_studio_id: studioId,
    // La BD vuelve a comprobar la cobertura por tipo de clase (migr 0129). Aquí
    // `bonoConsumible` ya la respeta, así que esto no debería rechazar nunca —
    // y justo por eso vale: si algún día deja de respetarla, salta aquí en vez
    // de servir la clase cara contra el bono barato en silencio.
    p_sesion_id: sesionId,
  });
  if (error) { reportDbError('[consumirBonoServidor]', error); return false; }
  if (nuevoSaldo == null) {
    // La socia SÍ tenía un bono consumible (`bonoConsumible` lo confirmó arriba)
    // pero el RPC no descontó: bono agotado en una carrera con otra reserva. La
    // reserva ya está CONFIRMADA, así que esto es una clase servida sin cobrar.
    // No se revierte aquí —cancelar una plaza ya confirmada es peor experiencia
    // y es decisión de producto— pero deja de ser invisible: sin esto no había
    // ni rastro.
    reportDbError(
      '[consumirBonoServidor] bono consumible sin descontar (posible clase no cobrada)',
      { studioId, socioId, suscripcionId: sus.id },
    );
    return false;
  }
  if (nuevoSaldo === 0) {
    const hoy = new Date().toISOString().slice(0, 10);
    // Dunning (0041): el recibo entra al ciclo con su primer reintento programado
    // al día +1 del vencimiento (= hoy + 1 día). El barrido diario lo cobrará.
    const primerReintento = new Date(new Date(hoy).getTime() + 24 * 60 * 60 * 1000).toISOString();
    await admin.from('recibos').insert({
      id: `rec-renov-${uid()}`, studio_id: studioId, socio_id: socioId, suscripcion_id: sus.id,
      concepto: `Renovación ${plan.nombre}`, importe: plan.precio, estado: 'PENDIENTE',
      fecha_vencimiento: hoy, fecha_cobro: null, fecha_devolucion: null, intentos_reintento: 0,
      proximo_reintento: primerReintento,
    });
    // Notification Engine: avisa a la socia de que ha gastado la última sesión.
    const { emitirBonoAgotado } = await import('@/lib/notifications/emit');
    await emitirBonoAgotado(admin, { studioId, socioId, plan: plan.nombre, suscripcionId: sus.id });
  }
  return true;
}


async function devolverBonoServidor(admin: SupabaseClient, studioId: string, socioId: string, tipoClaseId?: string | null) {
  const [{ data: susRows }, { data: planRows }] = await Promise.all([
    admin.from('suscripciones').select('*').eq('studio_id', studioId).eq('socio_id', socioId),
    admin.from('planes_tarifa').select('*').eq('studio_id', studioId),
  ]);
  const planesConTipos = await hidratarTiposDePlanes(admin as never, studioId, (planRows ?? []).map(mapPlanTarifa));
  const consumible = bonoConsumible(socioId, (susRows ?? []).map(mapSuscripcion), planesConTipos, undefined, tipoClaseId);
  if (!consumible) return;
  const { suscripcion: sus, plan, sesionesRestantes } = consumible;
  const nuevas = calcularDevolucionBono(sesionesRestantes, plan.sesiones);
  await admin.from('suscripciones').update({ sesiones_restantes: nuevas }).eq('id', sus.id);
}

// Reúne los datos de una clase para un email transaccional (nombre de clase,
// fecha/hora en hora de España, sala e instructora, nombre del estudio). Formato
// legible para la socia; devuelve null si la sesión no existe.

async function datosClaseParaEmail(
  admin: SupabaseClient, studioId: string, sesionId: string,
): Promise<(DatosClaseEmail & { inicioISO: string }) | null> {
  const { data: ses } = await admin
    .from('sesiones')
    .select('inicio, tipo_clase_id, sala_id, instructor_id')
    .eq('id', sesionId).eq('studio_id', studioId).maybeSingle();
  if (!ses) return null;
  const [{ data: tipo }, { data: sala }, { data: inst }, { data: studio }] = await Promise.all([
    admin.from('tipos_clase').select('nombre').eq('id', ses.tipo_clase_id).maybeSingle(),
    ses.sala_id ? admin.from('salas').select('nombre').eq('id', ses.sala_id).maybeSingle() : Promise.resolve({ data: null }),
    ses.instructor_id ? admin.from('instructores').select('nombre').eq('id', ses.instructor_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from('studios').select('nombre').eq('id', studioId).maybeSingle(),
  ]);
  const inicio = new Date(ses.inicio as string);
  const fecha = inicio.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
  const hora = inicio.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  return {
    inicioISO: ses.inicio as string,
    claseNombre: tipo?.nombre ?? 'Clase',
    fecha, hora,
    sala: sala?.nombre ?? '',
    instructor: inst?.nombre ?? '',
    estudioNombre: studio?.nombre ?? 'Tentare',
  };
}

// Envía a una socia el email de promoción de lista de espera (fire-and-forget:
// no bloquea la respuesta de la reserva; si falla o Resend no está, no rompe).

async function notificarPromocionEspera(
  admin: SupabaseClient, studioId: string, socioId: string, sesionId: string, bonoConsumido: boolean,
) {
  const { data: socia } = await admin
    .from('socios').select('nombre, email').eq('id', socioId).eq('studio_id', studioId).maybeSingle();
  if (!socia?.email) return;
  const datos = await datosClaseParaEmail(admin, studioId, sesionId);
  if (!datos) return;
  await enviarEmailTransaccional({
    tipo: 'promocion', to: socia.email, toName: socia.nombre ?? 'Socia',
    data: { ...datos, bonoConsumido },
    studioId,
    // Una socia solo se promociona una vez por sesión: la clave la identifica.
    idempotencyKey: `promocion-${sesionId}-${socioId}`,
  });
}

// Recordatorios de revisión de ficha clínica (FICHA-CLINICA.md §10). Recorre las
// condiciones activas de todos los estudios; para las que necesitan revisión
// (regla pura `recordatoriosRevision`) crea un aviso en `notificaciones`. Dedup:
// no re-avisa la misma condición si ya hay un aviso suyo en los últimos 30 días
// (marca en el enlace `?rev=<condicionId>`). Lo dispara /api/cron/revisiones-salud.

export async function generarRecordatoriosRevision(studioId: string, nowISO: string, umbralDias = 90) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const hoy = new Date(nowISO);

  const { data: condsRaw, error } = await admin
    .from('condiciones_salud').select('*').eq('estado', 'ACTIVA').eq('studio_id', studioId);
  if (error) throw new Error(error.message);
  const condiciones = (condsRaw ?? []).map(r => mapCondicionSalud(r as RowCondicionesSalud));

  const recordatorios = recordatoriosRevision(condiciones, hoy, umbralDias);
  if (recordatorios.length === 0) {
    return { condicionesActivas: condiciones.length, recordatorios: 0, notificacionesCreadas: 0 };
  }

  // Nombres de las socias implicadas (en lotes para no exceder el filtro `in`).
  const socioIds = [...new Set(recordatorios.map(r => r.condicion.socioId))];
  const nombrePorSocio = new Map<string, string>();
  for (let i = 0; i < socioIds.length; i += 200) {
    const lote = socioIds.slice(i, i + 200);
    const { data: socias } = await admin.from('socios').select('id, nombre, apellidos').in('id', lote);
    for (const s of socias ?? []) nombrePorSocio.set(s.id as string, `${s.nombre} ${s.apellidos}`.trim());
  }

  // Migrado al Notification Engine: se PUBLICA un evento por revisión pendiente
  // (la dueña lo recibe en su centro). La idempotencia la garantiza el dedupKey
  // (por condición y mes) — sustituye al viejo dedup por enlace de 30 días.
  const { publish } = await import('@/lib/notifications/engine');
  const { EVENTOS } = await import('@/lib/notifications/catalog');
  const mes = nowISO.slice(0, 7);
  for (const r of recordatorios) {
    const nombre = nombrePorSocio.get(r.condicion.socioId) ?? 'Una socia';
    await publish({
      type: EVENTOS.SALUD_REVISION, studioId: r.condicion.studioId,
      data: { mensaje: textoRecordatorioRevision(nombre, r), socia: nombre, socioId: r.condicion.socioId, condId: r.condicion.id },
      resource: { type: 'socio', id: r.condicion.socioId },
      dedupKey: `salud-rev:${r.condicion.id}:${mes}`,
    });
  }
  return { condicionesActivas: condiciones.length, recordatorios: recordatorios.length, notificacionesCreadas: recordatorios.length };
}

// Barrido de no-shows: marca NO_ASISTIO toda reserva que siga CONFIRMADA en una
// sesión ya terminada (fin < ahora) y no cancelada. Sin esto, las reservas sin
// check-in se quedan CONFIRMADA para siempre y las métricas de ausencias mienten.
// Lo dispara un cron (ver /api/cron/no-shows). No toca bonos: la sesión ya se
// consumió al reservar; un no-show no se reembolsa (esa es la penalización).
// F2 (B2.2): materializa las plazas fijas → reservas CONFIRMADA de las próximas
// semanas. Lo dispara el cron nocturno. Todo el trabajo (emparejamiento por hora
// local, aforo, idempotencia) es set-based en la RPC. Devuelve cuántas creó.

export async function materializarPlazasFijas(horizonteDias = 42): Promise<{ creadas: number }> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const { data, error } = await admin.rpc('materializar_plazas_fijas', { p_horizonte_dias: horizonteDias });
  if (error) throw new Error(error.message);
  return { creadas: (data as number) ?? 0 };
}


export async function barrerNoShows(nowISO: string) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  const { data: sesiones, error } = await admin
    .from('sesiones')
    .select('id')
    .eq('cancelada', false)
    .lt('fin', nowISO);
  if (error) throw new Error(error.message);

  const ids = (sesiones ?? []).map(s => s.id as string);
  let marcadas = 0;
  // Actualiza por lotes para no exceder límites de longitud del filtro `in`.
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    const { data: upd, error: updErr } = await admin
      .from('reservas')
      .update({ estado: 'NO_ASISTIO' })
      .in('sesion_id', lote)
      .eq('estado', 'CONFIRMADA')
      .select('id');
    if (updErr) throw new Error(updErr.message);
    marcadas += (upd ?? []).length;
  }
  return { sesionesRevisadas: ids.length, reservasMarcadas: marcadas };
}

// Recordatorios de clase: para cada sesión no cancelada cuyo inicio cae en la
// ventana [desdeISO, hastaISO), envía un email a cada socia CONFIRMADA/ASISTIDA.
// Lo dispara un cron (ver /api/cron/recordatorios). Devuelve un resumen.

export async function enviarRecordatoriosClasesProximas(studioId: string, desdeISO: string, hastaISO: string) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  // I4: precarga en lote para evitar el N+1 anidado (antes ~6 queries por sesión
  // + 1 por cada socia → miles de round-trips por ejecución del cron). Ahora es un
  // número constante de queries y todo el emparejamiento se hace en memoria.

  // 1) Sesiones de la ventana, con todo lo que el email necesita (1 query).
  const { data: sesionesRaw, error } = await admin
    .from('sesiones')
    .select('id, studio_id, inicio, tipo_clase_id, sala_id, instructor_id')
    .eq('studio_id', studioId)
    .eq('cancelada', false)
    .gte('inicio', desdeISO)
    .lt('inicio', hastaISO);
  if (error) throw new Error(error.message);
  const sesiones = sesionesRaw ?? [];
  if (sesiones.length === 0) return { sesiones: 0, enviados: 0, fallidos: 0, sinEmail: 0 };

  const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter(Boolean) as string[])];
  const sesionIds = sesiones.map(s => s.id as string);

  // 2) Catálogos + reservas de TODAS las sesiones en paralelo (1 query cada uno).
  const studioIds = uniq(sesiones.map(s => s.studio_id as string));
  const [{ data: tiposR }, { data: salasR }, { data: instR }, { data: studiosR }, { data: reservasR }, { data: whatsappR }] = await Promise.all([
    admin.from('tipos_clase').select('id, nombre').in('id', uniq(sesiones.map(s => s.tipo_clase_id as string))),
    admin.from('salas').select('id, nombre').in('id', uniq(sesiones.map(s => s.sala_id as string))),
    admin.from('instructores').select('id, nombre').in('id', uniq(sesiones.map(s => s.instructor_id as string))),
    admin.from('studios').select('id, nombre').in('id', uniq(sesiones.map(s => s.studio_id as string))),
    admin.from('reservas').select('sesion_id, socio_id').in('sesion_id', sesionIds).in('estado', ['CONFIRMADA', 'ASISTIDA']),
    // WhatsApp ya no es una integración de plataforma (secreto único del
    // operador): cada estudio pega su propio token + phoneId, así que hay que
    // cargar el de CADA estudio implicado en la ventana, no un único flag global.
    admin.from('integraciones').select('studio_id, activo, config').eq('tipo', 'WHATSAPP').in('studio_id', studioIds),
  ]);
  const reservas = reservasR ?? [];
  const whatsappPorStudio = new Map<string, WhatsAppCredenciales>();
  for (const row of whatsappR ?? []) {
    if (!row.activo) continue;
    const config = (row.config as Record<string, string>) ?? {};
    if (config.token && config.phoneId) whatsappPorStudio.set(row.studio_id as string, { token: config.token, phoneId: config.phoneId });
  }

  // 3) Socias implicadas (1 query) y mapas de lookup.
  const socioIds = uniq(reservas.map(r => r.socio_id as string));
  const [{ data: sociosR }, { data: prefsR }, { data: excR }] = socioIds.length
    ? await Promise.all([
        admin.from('socios').select('id, nombre, email, telefono').in('id', socioIds),
        admin.from('preferencias_socio').select('socio_id, notif_email, notif_whatsapp').in('socio_id', socioIds),
        // F2 (B2.9): la dueña puede eximir a una socia de los recordatorios.
        admin.from('socio_excepciones').select('socio_id').eq('tipo', 'SIN_RECORDATORIO').in('socio_id', socioIds),
      ])
    : [{ data: [] as { id: string; nombre: string | null; email: string | null; telefono: string | null }[] }, { data: [] as { socio_id: string; notif_email: boolean | null; notif_whatsapp: boolean | null }[] }, { data: [] as { socio_id: string }[] }];
  // Sin fila de preferencias = valores por defecto (true), igual que mapPreferenciasSocio.
  const prefsPorSocio = new Map((prefsR ?? []).map(p => [p.socio_id, p]));
  const exentosRecordatorio = new Set((excR ?? []).map(e => e.socio_id as string));

  const nombrePorId = (rows: { id: string; nombre: string | null }[] | null) =>
    new Map((rows ?? []).map(x => [x.id, x.nombre]));
  const tipoNombre = nombrePorId(tiposR as { id: string; nombre: string | null }[] | null);
  const salaNombre = nombrePorId(salasR as { id: string; nombre: string | null }[] | null);
  const instNombre = nombrePorId(instR as { id: string; nombre: string | null }[] | null);
  const studioNombre = nombrePorId(studiosR as { id: string; nombre: string | null }[] | null);
  const sociaPorId = new Map((sociosR ?? []).map(x => [x.id, x]));
  const reservasPorSesion = new Map<string, { socio_id: string }[]>();
  for (const r of reservas) {
    const arr = reservasPorSesion.get(r.sesion_id as string) ?? [];
    arr.push({ socio_id: r.socio_id as string });
    reservasPorSesion.set(r.sesion_id as string, arr);
  }

  let enviados = 0;
  let fallidos = 0;
  let sinEmail = 0;
  let enviadosWhatsapp = 0;
  let fallidosWhatsapp = 0;

  for (const ses of sesiones) {
    const rs = reservasPorSesion.get(ses.id as string) ?? [];
    if (rs.length === 0) continue;
    const inicio = new Date(ses.inicio as string);
    const datos = {
      inicioISO: ses.inicio as string,
      claseNombre: tipoNombre.get(ses.tipo_clase_id as string) ?? 'Clase',
      fecha: inicio.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' }),
      hora: inicio.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' }),
      sala: (ses.sala_id ? salaNombre.get(ses.sala_id as string) : '') ?? '',
      instructor: (ses.instructor_id ? instNombre.get(ses.instructor_id as string) : '') ?? '',
      estudioNombre: studioNombre.get(ses.studio_id as string) ?? 'Tentare',
    };
    for (const r of rs) {
      const socia = sociaPorId.get(r.socio_id);
      if (!socia) continue;
      if (exentosRecordatorio.has(r.socio_id)) continue; // "a esta jamás" (B2.9)
      // Preferencias del portal (app/portal/[slug]/perfil): sin fila = valores
      // por defecto (true), igual que mapPreferenciasSocio en el resto de la app.
      const prefs = prefsPorSocio.get(r.socio_id);
      const quiereEmail = prefs?.notif_email ?? true;
      const quiereWhatsapp = prefs?.notif_whatsapp ?? true;

      if (quiereEmail) {
        if (!socia.email) {
          sinEmail++;
        } else {
          const res = await enviarEmailTransaccional({
            tipo: 'recordatorio', to: socia.email, toName: socia.nombre ?? 'Socia', data: datos,
            // studioId: sin él se ignoraba el override de plantilla del estudio; la
            // funcionalidad existía pero no llegaba a los recordatorios.
            studioId: ses.studio_id as string,
            // Clave determinista por (sesión, socia): si el cron expira a medio
            // barrido, el reintento NO reenvía el recordatorio a quien ya lo recibió.
            idempotencyKey: `recordatorio-${ses.id}-${r.socio_id}`,
          });
          if (res.ok) enviados++;
          else if ('error' in res) fallidos++;
        }
      }

      const whatsapp = whatsappPorStudio.get(ses.studio_id as string);
      if (quiereWhatsapp && whatsapp && socia.telefono) {
        const texto = `Recordatorio · ${datos.estudioNombre}\nTienes ${datos.claseNombre} el ${datos.fecha} a las ${datos.hora}${datos.sala ? ` en ${datos.sala}` : ''}.`;
        const res = await enviarWhatsAppTexto(whatsapp, socia.telefono, texto);
        if (res.ok) enviadosWhatsapp++;
        else fallidosWhatsapp++;
      }
    }
  }

  return { sesiones: sesiones.length, enviados, fallidos, sinEmail, enviadosWhatsapp, fallidosWhatsapp };
}

// Lee la política de reservas/cancelaciones del estudio (con defaults sensatos
// si las columnas aún no existen o vienen nulas).

async function cargarPoliticaEstudio(admin: SupabaseClient, studioId: string) {
  const { data } = await admin
    .from('studios')
    .select('cancelacion_ventana_horas, cancelacion_devolver_bono_tardia, reserva_exigir_plan, reserva_max_simultaneas, reserva_ventana_minima_minutos, reserva_antelacion_maxima_dias, permite_lista_espera, requiere_aprobacion')
    .eq('id', studioId).maybeSingle();
  return {
    ventanaHoras: (data?.cancelacion_ventana_horas ?? 12) as number,
    devolverBonoTardia: (data?.cancelacion_devolver_bono_tardia ?? false) as boolean,
    exigirPlan: (data?.reserva_exigir_plan ?? true) as boolean,
    maxSimultaneas: (data?.reserva_max_simultaneas ?? null) as number | null,
    ventanaMinimaMinutos: (data?.reserva_ventana_minima_minutos ?? 0) as number,
    antelacionMaximaDias: (data?.reserva_antelacion_maxima_dias ?? null) as number | null,
    permiteListaEspera: (data?.permite_lista_espera ?? true) as boolean,
    requiereAprobacion: (data?.requiere_aprobacion ?? false) as boolean,
  };
}

// Fase 1 de reglas por tipo de clase (migr 20260730152516): mismo patrón que
// resolverVentanaCancelacion — NULL en tipos_clase = hereda el default del
// estudio. Una sola query trae las 4 columnas de override a la vez.
async function cargarReglasReservaTipoClase(
  admin: SupabaseClient, studioId: string, tipoClaseId: string | null | undefined,
) {
  const vacio = {
    exigirPlan: null as boolean | null,
    ventanaMinimaMinutos: null as number | null,
    antelacionMaximaDias: null as number | null,
    permiteListaEspera: null as boolean | null,
    requiereAprobacion: null as boolean | null,
  };
  if (!tipoClaseId) return vacio;
  const { data } = await admin
    .from('tipos_clase')
    .select('reserva_exigir_plan, reserva_ventana_minima_minutos, reserva_antelacion_maxima_dias, permite_lista_espera, requiere_aprobacion')
    .eq('id', tipoClaseId).eq('studio_id', studioId).maybeSingle();
  if (!data) return vacio;
  return {
    exigirPlan: data.reserva_exigir_plan as boolean | null,
    ventanaMinimaMinutos: data.reserva_ventana_minima_minutos as number | null,
    antelacionMaximaDias: data.reserva_antelacion_maxima_dias as number | null,
    permiteListaEspera: data.permite_lista_espera as boolean | null,
    requiereAprobacion: data.requiere_aprobacion as boolean | null,
  };
}

// P2-8: la ventana de cancelación puede acotarse por tipo de clase (reformer
// necesita más antelación que mat para recolocar la plaza). NULL en
// tipos_clase.ventana_cancelacion_horas = hereda la del estudio — es el
// comportamiento de siempre para todo tipo de clase sin override.

async function resolverVentanaCancelacion(
  admin: SupabaseClient, studioId: string, tipoClaseId: string | null | undefined, ventanaEstudio: number,
): Promise<number> {
  if (!tipoClaseId) return ventanaEstudio;
  const { data } = await admin
    .from('tipos_clase').select('ventana_cancelacion_horas')
    .eq('id', tipoClaseId).eq('studio_id', studioId).maybeSingle();
  const override = data?.ventana_cancelacion_horas as number | null | undefined;
  return override ?? ventanaEstudio;
}

// Crea una reserva respetando aforo/lista de espera (booking-logic) y consume
// bono si queda CONFIRMADA. Valida identidad de la socia y el derecho a reservar
// (C-4: plan/bono activo y tope de reservas simultáneas, si el estudio lo exige).

export async function crearReservaPublica(params: {
  studioId: string; sesionId: string; socioId: string; email: string; spotId?: string | null;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const socia = await validarSociaPublica(admin, params.studioId, params.socioId, params.email);
  if (!socia) return { error: 'No autorizado' as const };

  // No se puede reservar una clase ya empezada/pasada (I-17). La UI lo bloquea,
  // pero la API también debe: evita datos basura y gamificación explotable.
  let tipoClaseId: string | null | undefined;
  let inicioISO: string;
  {
    const { data: ses } = await admin
      .from('sesiones').select('inicio, cancelada, tipo_clase_id')
      .eq('id', params.sesionId).eq('studio_id', params.studioId).maybeSingle();
    if (!ses) return { error: 'Sesión no encontrada' as const };
    if (ses.cancelada) return { error: 'Esta clase está cancelada' as const };
    if (new Date(ses.inicio as string).getTime() <= Date.now()) {
      return { error: 'Esta clase ya ha empezado' as const };
    }
    tipoClaseId = ses.tipo_clase_id as string | null | undefined;
    inicioISO = ses.inicio as string;
  }

  // Gate de derechos (C-4): autoritativo en servidor. Solo aplica a la reserva
  // self-service; el panel (recepción) puede añadir a cualquiera sin plan.
  const pol = await cargarPoliticaEstudio(admin, params.studioId);
  // Fase 1 de reglas por tipo de clase: cada regla puede sobrescribirse en
  // tipos_clase (NULL = hereda el default del estudio, resuelto con heredaOverride).
  const reglasTipo = await cargarReglasReservaTipoClase(admin, params.studioId, tipoClaseId);
  const exigirPlanResuelto = heredaOverride(reglasTipo.exigirPlan, pol.exigirPlan);
  const permiteListaEsperaResuelto = heredaOverride(reglasTipo.permiteListaEspera, pol.permiteListaEspera);
  // Fase 2a: si se exige aprobación, la RPC salta directo a PENDIENTE_APROBACION
  // sin comprobar aforo — el gate de plan/bono de más abajo sigue aplicando
  // igual (no tiene sentido pedir aprobación a quien ni siquiera tiene derecho
  // a reservar esta clase).
  const requiereAprobacionResuelto = heredaOverride(reglasTipo.requiereAprobacion, pol.requiereAprobacion);

  {
    const ventanaMinima = heredaOverride(reglasTipo.ventanaMinimaMinutos, pol.ventanaMinimaMinutos);
    if (!puedeReservarPorVentanaMinima(inicioISO, new Date(), ventanaMinima)) {
      return { error: 'Ya no se puede reservar esta clase: hace falta reservar con más antelación' as const };
    }
    const antelacionMaxima = heredaOverride(reglasTipo.antelacionMaximaDias, pol.antelacionMaximaDias);
    if (!puedeReservarPorAntelacionMaxima(inicioISO, new Date(), antelacionMaxima)) {
      return { error: 'Todavía no se puede reservar esta clase' as const };
    }
  }

  if (exigirPlanResuelto || pol.maxSimultaneas != null) {
    const [{ data: susRows }, { data: planRows }, { data: resRows }, { data: sesRows }] = await Promise.all([
      admin.from('suscripciones').select('*').eq('studio_id', params.studioId).eq('socio_id', params.socioId),
      admin.from('planes_tarifa').select('*').eq('studio_id', params.studioId),
      admin.from('reservas').select('*').eq('studio_id', params.studioId).eq('socio_id', params.socioId),
      admin.from('sesiones').select('id, inicio').eq('studio_id', params.studioId),
    ]);
    const hoyISO = new Date().toISOString().slice(0, 10);
    // El tipo de la clase importa: un bono acotado a Reformer no da derecho a
    // reservar Mat (0111). Ya se resolvió arriba (tipoClaseId), sin repetir la query.
    const tipoDeLaClase = tipoClaseId;
    const planesGate = await hidratarTiposDePlanes(admin as never, params.studioId, (planRows ?? []).map(mapPlanTarifa));
    // Si el estudio no vende ningún plan, exigirlo solo deja a la clienta en un
    // callejón: el mensaje le pide contratar algo que no existe.
    const seVendeAlgo = hayAlgoQueContratar(planesGate);
    if (exigirPlanResuelto && seVendeAlgo && !tieneEntitlementActivo(
      params.socioId, (susRows ?? []).map(mapSuscripcion), planesGate, hoyISO, tipoDeLaClase,
    )) {
      // Se distingue "no tienes bono" de "tu bono no vale para esta clase":
      // con el mensaje genérico la socia no entendería por qué le rechazan una
      // clase teniendo sesiones de sobra.
      const tieneAlgunPlan = tieneEntitlementActivo(
        params.socioId, (susRows ?? []).map(mapSuscripcion), planesGate, hoyISO,
      );
      return tieneAlgunPlan
        ? { error: 'Tu bono no incluye este tipo de clase' as const }
        : { error: 'Necesitas un plan o bono activo para reservar' as const };
    }
    if (pol.maxSimultaneas != null) {
      const activas = contarReservasActivasFuturas(
        params.socioId,
        (resRows ?? []).map(mapReserva),
        (sesRows ?? []).map(r => ({ id: r.id as string, inicio: r.inicio as string })),
        new Date(),
      );
      if (activas >= pol.maxSimultaneas) {
        return { error: `Has alcanzado el máximo de ${pol.maxSimultaneas} reservas activas` as const };
      }
    }
  }

  // Aforo transaccional: la decisión (CONFIRMADA vs LISTA_ESPERA) y la inserción
  // ocurren atómicamente en la BD (SELECT ... FOR UPDATE en la sesión), no en
  // JS — evita la sobreventa por reservas concurrentes de la última plaza.
  // p_permite_lista_espera: si la clase está llena y el tipo/estudio no admite
  // lista de espera, la RPC rechaza en vez de insertar en LISTA_ESPERA.
  const reservaId = `res-${uid()}`;
  const { data, error } = await admin.rpc('reservar_plaza', {
    p_studio_id: params.studioId, p_sesion_id: params.sesionId,
    p_socio_id: params.socioId, p_reserva_id: reservaId,
    p_permite_lista_espera: permiteListaEsperaResuelto,
    p_requiere_aprobacion: requiereAprobacionResuelto,
  });
  if (error) {
    if (error.message.includes('YA_RESERVADA')) return { error: 'Ya tienes una reserva en esta clase' as const };
    if (error.message.includes('SESION_NO_ENCONTRADA')) return { error: 'Sesión no encontrada' as const };
    if (error.message.includes('LIMITE_SEMANAL')) return { error: 'Has alcanzado el máximo de clases por semana de tu plan' as const };
    if (error.message.includes('AFORO_LLENO_SIN_ESPERA')) return { error: 'Esta clase está completa' as const };
    return { error: error.message };
  }
  const row = Array.isArray(data) ? data[0] : data;
  const estado: string = row?.estado ?? 'CONFIRMADA';

  let spotAsignado: string | null = null;
  if (estado === 'CONFIRMADA') {
    // La clase decide de QUÉ bono se descuenta (0111): con un "Bono Reformer" y
    // un "Bono Mat" a la vez, sin esto se quitaría del equivocado.
    await consumirBonoServidor(admin, params.studioId, params.socioId, params.sesionId);
    // Sitio elegido por la socia (I-12): solo para reservas confirmadas (la
    // lista de espera no ocupa sitio). Se valida y asigna con guard atómico.
    if (params.spotId) {
      spotAsignado = await asignarSpotReserva(admin, params.studioId, params.sesionId, reservaId, params.spotId);
    }
  }
  // S-1: la reserva mueve RESERVAS_TOTALES (y la racha, si la sesión ya pasó),
  // tanto para logros como para retos vigentes.
  await evaluarGamificacionServidor(admin, params.studioId, params.socioId);

  // Notification Engine (server-only): la socia recibe confirmación / lista de
  // espera y la propietaria "nueva reserva". Import dinámico para no arrastrar el
  // motor (node:crypto, Inngest) al bundle de cliente de este módulo.
  if (estado === 'CONFIRMADA' || estado === 'LISTA_ESPERA') {
    const { emitirReserva, emitirClaseCasiLlena } = await import('@/lib/notifications/emit');
    await emitirReserva(admin, { studioId: params.studioId, sesionId: params.sesionId, socioId: params.socioId, estado: estado as 'CONFIRMADA' | 'LISTA_ESPERA' });
    // Aviso a la dueña si la clase se acerca al lleno (≥90%).
    if (estado === 'CONFIRMADA') await emitirClaseCasiLlena(admin, { studioId: params.studioId, sesionId: params.sesionId });
  } else if (estado === 'PENDIENTE_APROBACION') {
    // Fase 2a: no consume bono ni asigna spot todavía (bloque de arriba, gateado
    // a `estado === 'CONFIRMADA'`, ya la deja fuera). Solo avisa al mostrador de
    // que hay algo que revisar antes de que empiece la clase.
    const { emitirReservaPendienteAprobacion } = await import('@/lib/notifications/emit');
    await emitirReservaPendienteAprobacion(admin, { studioId: params.studioId, sesionId: params.sesionId, socioId: params.socioId });
  }
  return { ok: true as const, estado, reservaId, spotAsignado };
}

// Aprobar/rechazar una reserva PENDIENTE_APROBACION desde el panel (Fase 2a).
// La autorización real vive en `app/api/reservas/resolver-pendiente/route.ts`
// (verificarSesionStaff + puedeGestionarCalendario): esta función corre con
// service-role, así que el guard `auth.uid()` de la RPC no aplica aquí — el
// mismo motivo por el que crearReservaPublica hace sus propios checks en TS
// en vez de fiarse de la RPC cuando la llama el admin client.
//
// `motivoUI: 'clase_ya_empezada'`: la RPC tiene su propia guardia de inicio
// (nadie aprueba una clase que ya empezó, pase lo que pase con el cron de
// expiración) — si se pidió aprobar y volvió CANCELADA, es el único camino
// posible, así que se detecta aquí sin que la RPC tenga que devolver nada
// extra.
export async function resolverReservaPendiente(params: {
  studioId: string; reservaId: string; aprobar: boolean;
}): Promise<{ ok: true; estado: string; motivoUI?: 'clase_ya_empezada' } | { error: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  const { data, error } = await admin.rpc('resolver_reserva_pendiente', {
    p_studio_id: params.studioId, p_reserva_id: params.reservaId, p_aprobar: params.aprobar,
  });
  if (error) {
    if (error.message.includes('NO_ENCONTRADA_O_YA_RESUELTA')) return { error: 'Esta reserva ya no está pendiente de aprobación' };
    return { error: error.message };
  }
  const row = Array.isArray(data) ? data[0] : data;
  const estado: string = row?.estado ?? 'CANCELADA';

  const { data: res } = await admin.from('reservas').select('sesion_id, socio_id').eq('id', params.reservaId).maybeSingle();
  const sesionId = res?.sesion_id as string | undefined;
  const socioId = res?.socio_id as string | undefined;
  if (!sesionId || !socioId) return { ok: true, estado };

  if (estado === 'CONFIRMADA') {
    // Mismo criterio que una reserva normal: la clase decide de qué bono se
    // descuenta (0111). El spot elegido al pedir la aprobación no se conserva
    // (mismo comportamiento que ya tenía la promoción desde lista de espera:
    // no hay spot guardado durante la espera, se asigna solo al confirmar).
    await consumirBonoServidor(admin, params.studioId, socioId, sesionId);
  }

  if (params.aprobar && estado === 'CANCELADA') {
    const { emitirReservaCancelada } = await import('@/lib/notifications/emit');
    await emitirReservaCancelada(admin, { studioId: params.studioId, sesionId, socioId, reservaId: params.reservaId, motivo: 'expirada' });
    return { ok: true, estado, motivoUI: 'clase_ya_empezada' };
  }

  if (estado === 'CONFIRMADA' || estado === 'LISTA_ESPERA') {
    const { emitirReserva } = await import('@/lib/notifications/emit');
    await emitirReserva(admin, { studioId: params.studioId, sesionId, socioId, estado: estado as 'CONFIRMADA' | 'LISTA_ESPERA' });
  } else if (estado === 'CANCELADA') {
    const { emitirReservaCancelada } = await import('@/lib/notifications/emit');
    await emitirReservaCancelada(admin, { studioId: params.studioId, sesionId, socioId, reservaId: params.reservaId, motivo: 'rechazada' });
  }

  return { ok: true, estado };
}

// Expira una reserva PENDIENTE_APROBACION cuya sesión ya empezó — llamado por
// el cron `lib/inngest/reservas-pendientes.ts`, no por un usuario. Sin sesión
// de staff detrás: la guardia de inicio de la RPC ya obliga a CANCELADA sin
// importar qué se pida, así que aquí basta con pedir "rechazar" tal cual.
export async function expirarReservaPendiente(params: {
  studioId: string; reservaId: string; sesionId: string; socioId: string;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.rpc('resolver_reserva_pendiente', {
    p_studio_id: params.studioId, p_reserva_id: params.reservaId, p_aprobar: false,
  });
  if (error) {
    console.error('[expirarReservaPendiente]', error.message);
    return;
  }
  const { emitirReservaCancelada } = await import('@/lib/notifications/emit');
  await emitirReservaCancelada(admin, {
    studioId: params.studioId, sesionId: params.sesionId, socioId: params.socioId,
    reservaId: params.reservaId, motivo: 'expirada',
  });
}

// Fase 2b: la socia acepta su oferta de plaza de lista de espera dentro del
// plazo. El bono se consume AQUÍ (no en la RPC) — mismo criterio que
// resolverReservaPendiente: la reserva no ocupa plaza real hasta que se
// confirma de verdad.
export async function aceptarOfertaListaEspera(params: {
  studioId: string; reservaId: string; socioId: string;
}): Promise<{ ok: true; estado: string } | { error: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  const { data, error } = await admin.rpc('aceptar_oferta_lista_espera', {
    p_studio_id: params.studioId, p_reserva_id: params.reservaId, p_socio_id: params.socioId,
  });
  if (error) {
    if (error.message.includes('OFERTA_CADUCADA')) return { error: 'Esta oferta ya ha caducado' };
    if (error.message.includes('OFERTA_NO_ENCONTRADA')) return { error: 'Esta reserva ya no está en lista de espera' };
    if (error.message.includes('SIN_OFERTA_ACTIVA')) return { error: 'No hay ninguna oferta activa para esta reserva' };
    if (error.message.includes('NO_AUTORIZADO')) return { error: 'No autorizado' };
    return { error: error.message };
  }

  const { data: res } = await admin.from('reservas').select('sesion_id').eq('id', params.reservaId).maybeSingle();
  const sesionId = res?.sesion_id as string | undefined;
  if (sesionId) {
    await consumirBonoServidor(admin, params.studioId, params.socioId, sesionId);
    const { emitirReserva } = await import('@/lib/notifications/emit');
    await emitirReserva(admin, { studioId: params.studioId, sesionId, socioId: params.socioId, estado: 'CONFIRMADA' });
  }
  return { ok: true, estado: 'CONFIRMADA' };
}

// Fase 2b: cancela (pierde el sitio) la reserva cuya oferta caducó sin
// aceptar y reutiliza promocionar_siguiente_espera (dentro de la RPC) para
// ofrecerla a la siguiente en la cola. Llamado solo por el cron
// (lib/inngest/lista-espera-ofertas.ts), sin sesión de usuario detrás — mismo
// criterio que expirarReservaPendiente.
export async function expirarOfertaListaEspera(params: {
  studioId: string; reservaId: string; sesionId: string; socioId: string;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { data, error } = await admin.rpc('expirar_oferta_lista_espera', {
    p_studio_id: params.studioId, p_reserva_id: params.reservaId,
  });
  if (error) {
    console.error('[expirarOfertaListaEspera]', error.message);
    return;
  }
  const { emitirReservaCancelada } = await import('@/lib/notifications/emit');
  await emitirReservaCancelada(admin, {
    studioId: params.studioId, sesionId: params.sesionId, socioId: params.socioId,
    reservaId: params.reservaId, motivo: 'oferta_caducada',
  });

  const row = Array.isArray(data) ? data[0] : data;
  if (row?.oferta_socio_id) {
    const { emitirOfertaListaEspera } = await import('@/lib/notifications/emit');
    await emitirOfertaListaEspera(admin, {
      studioId: params.studioId, sesionId: params.sesionId,
      socioId: row.oferta_socio_id as string, expiraEn: row.oferta_expira_en as string,
    });
  }
}

// Fase 2c: cancela una sesión completa porque no alcanzó el mínimo de
// asistentes a 2h del inicio — llamado solo por el cron
// (lib/inngest/minimo-asistentes.ts), sin sesión de staff detrás. A
// diferencia de dbCancelarReservasPorSesiones (cancelación manual, cliente,
// nunca devuelve bono), aquí SÍ se devuelve a cada CONFIRMADA: no es
// decisión de la socia, es el sistema el que rompe el compromiso.
//
// Dos guardas de idempotencia INDEPENDIENTES (no una sola compuesta): si el
// cron reintenta tras un fallo parcial, la sesión ya marcada cancelada=true
// no bloquea que se sigan limpiando reservas sueltas.
export async function cancelarSesionPorMinimoNoAlcanzado(params: {
  studioId: string; sesionId: string;
}): Promise<{ ok: true } | { error: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  const { data: ses } = await admin
    .from('sesiones').select('tipo_clase_id, cancelada')
    .eq('id', params.sesionId).eq('studio_id', params.studioId).maybeSingle();
  if (!ses) return { error: 'Sesión no encontrada' };
  const tipoClaseId = ses.tipo_clase_id as string | null;

  if (!ses.cancelada) {
    await admin.from('sesiones')
      .update({ cancelada: true, cancelada_motivo: 'minimo_no_alcanzado' })
      .eq('id', params.sesionId).eq('cancelada', false);
  }

  // Incluye PENDIENTE_APROBACION (Fase 2a) — cierra un gap que ya existía en
  // dbCancelarReservasPorSesiones (solo CONFIRMADA/LISTA_ESPERA): sin esto,
  // una reserva pendiente de aprobar quedaría huérfana en una sesión cancelada.
  const { data: afectadas } = await admin
    .from('reservas').select('id, socio_id, estado')
    .eq('sesion_id', params.sesionId)
    .in('estado', ['CONFIRMADA', 'LISTA_ESPERA', 'PENDIENTE_APROBACION']);
  if (!afectadas?.length) return { ok: true };

  await admin.from('reservas')
    .update({ estado: 'CANCELADA', posicion_espera: null })
    .eq('sesion_id', params.sesionId)
    .in('estado', ['CONFIRMADA', 'LISTA_ESPERA', 'PENDIENTE_APROBACION']);

  const confirmadas = afectadas.filter(r => r.estado === 'CONFIRMADA' && r.socio_id);
  for (const r of confirmadas) {
    await devolverBonoServidor(admin, params.studioId, r.socio_id as string, tipoClaseId);
  }

  const { emitirClaseCancelada } = await import('@/lib/notifications/emit');
  await emitirClaseCancelada(admin, { studioId: params.studioId, sesionId: params.sesionId });

  // CLASE_CANCELADA no manda email a propósito (catalog.ts) — aquí SÍ hay
  // dinero de por medio, así que se manda explícito. CancelacionClaseEmail ya
  // soporta `bonoDevuelto`, reutilizado tal cual vía enviarEmailTransaccional
  // (mismo patrón que notificarPromocionEspera, arriba en este archivo).
  const datos = await datosClaseParaEmail(admin, params.studioId, params.sesionId);
  if (datos && confirmadas.length) {
    const { data: socias } = await admin
      .from('socios').select('id, nombre, email')
      .in('id', confirmadas.map(r => r.socio_id as string));
    for (const s of socias ?? []) {
      if (!s.email) continue;
      await enviarEmailTransaccional({
        tipo: 'cancelacion', to: s.email as string, toName: (s.nombre as string) ?? 'Socia',
        data: { ...datos, bonoDevuelto: true },
        studioId: params.studioId,
        idempotencyKey: `minimo-no-alcanzado-${params.sesionId}-${s.id}`,
      });
    }
  }
  return { ok: true };
}

// Asigna un spot a una reserva confirmada validando que el sitio pertenece a la
// sala de la sesión, está activo y libre. El índice único uq_reserva_spot_activo
// es el backstop atómico ante reservas concurrentes del mismo sitio: si dos van
// a por el mismo, una gana y la otra queda sin sitio (no rompe la reserva).
// Devuelve el spotId asignado o null si no se pudo.

async function asignarSpotReserva(
  admin: SupabaseClient, studioId: string, sesionId: string, reservaId: string, spotId: string,
): Promise<string | null> {
  const [{ data: ses }, { data: spot }] = await Promise.all([
    admin.from('sesiones').select('sala_id').eq('id', sesionId).eq('studio_id', studioId).maybeSingle(),
    admin.from('spots').select('id, activo, sala_id').eq('id', spotId).eq('studio_id', studioId).maybeSingle(),
  ]);
  if (!ses || !spot || !spot.activo || spot.sala_id !== ses.sala_id) return null;
  const { data: ocupada } = await admin
    .from('reservas').select('id')
    .eq('sesion_id', sesionId).eq('spot_id', spotId)
    .in('estado', ['CONFIRMADA', 'ASISTIDA']).maybeSingle();
  if (ocupada) return null;
  const { error } = await admin.from('reservas').update({ spot_id: spotId }).eq('id', reservaId);
  if (error) return null; // violación del índice único en carrera → sin sitio
  return spotId;
}

/**
 * Núcleo de "liberar una plaza": cancela la reserva vía RPC (atómico, promociona
 * la lista de espera), aplica la política de devolución de bono, avisa a quien
 * se promociona y re-evalúa la gamificación de la socia afectada.
 *
 * Compartido por la cancelación pública (`cancelarReservaPublica`, la socia
 * decide) y el corte de confirmación por riesgo de plantón
 * (`lib/inngest/confirmacion-riesgo.ts`, el sistema decide porque no respondió
 * a tiempo) — el resultado para la clase y la lista de espera debe ser
 * IDÉNTICO venga de donde venga: misma regla de bono, mismo aviso a quien sube.
 *
 * `socioId: null` = lo dispara el sistema, no la propia socia (bypassa la
 * comprobación NO_AUTORIZADO de la función; quién puede llamar con null se
 * decide en el caller, nunca aquí).
 */

export async function ejecutarCancelacionReserva(
  admin: SupabaseClient,
  params: { studioId: string; reservaId: string; socioId: string | null },
): Promise<{ ok: true; tardia: boolean; bonoDevuelto: boolean; eraConfirmada: boolean } | { error: string }> {
  const { data, error } = await admin.rpc('cancelar_reserva_plaza', {
    p_studio_id: params.studioId, p_reserva_id: params.reservaId, p_socio_id: params.socioId,
  });
  if (error) {
    if (error.message.includes('NO_AUTORIZADO')) return { error: 'No autorizado' as const };
    if (error.message.includes('RESERVA_NO_ENCONTRADA')) return { error: 'Reserva no encontrada' as const };
    return { error: error.message };
  }
  const row = Array.isArray(data) ? data[0] : data;

  // Sesión cancelada + política (C-2): decide si se devuelve el bono. Una
  // cancelación tardía (dentro de la ventana) no lo devuelve, salvo que el
  // estudio lo permita. La plaza igualmente se libera y promociona la espera.
  // `socio_id` sale de la RESERVA (no de params.socioId, que puede ser null si
  // lo dispara el sistema) — es a ELLA a quien hay que devolverle el bono.
  const { data: cancelada } = await admin
    .from('reservas').select('sesion_id, socio_id').eq('id', params.reservaId).maybeSingle();
  let bonoDevuelto = false;
  let tardia = false;
  // Las plazas fijas materializadas (res-pf-) las inserta el cron CONFIRMADAS sin
  // consumir bono (materializar_plazas_fijas no toca el bono). Por tanto cancelarlas
  // NO debe devolver una sesión que nunca se descontó: su compensación es la
  // recuperación (ver cancelarReservaPublica). Sin este guard, cancelar una plaza
  // fija regalaba una sesión de bono + una recuperación (doble compensación).
  const esPlazaFija = params.reservaId.startsWith('res-pf-');
  if (row?.era_confirmada && cancelada?.sesion_id && cancelada?.socio_id && !esPlazaFija) {
    const pol = await cargarPoliticaEstudio(admin, params.studioId);
    const { data: ses } = await admin
      .from('sesiones').select('inicio, tipo_clase_id').eq('id', cancelada.sesion_id).maybeSingle();
    const inicio = ses?.inicio as string | undefined;
    const ventana = await resolverVentanaCancelacion(admin, params.studioId, ses?.tipo_clase_id as string | null, pol.ventanaHoras);
    // `tardia` se sigue calculando aquí porque decide el TEXTO que se le manda a
    // la socia, no si se le devuelve el bono.
    tardia = inicio ? esCancelacionTardia(inicio, new Date(), ventana) : false;
    // La DECISIÓN es de la BD (migr 0129): misma respuesta para el portal, el
    // panel y cualquier superficie que venga. Este camino ya la resolvía bien,
    // pero tenerla escrita dos veces es exactamente cómo se desincronizó del
    // panel. `?? true` mantiene lo de siempre si la RPC aún no trae la columna.
    if (inicio && (row?.devolver_bono ?? true)) {
      // Se devuelve al bono que cubre esa clase: es del que se descontó.
      await devolverBonoServidor(admin, params.studioId, cancelada.socio_id as string, ses?.tipo_clase_id as string | null);
      bonoDevuelto = true;
    }
  }

  if (row?.promovida_socio_id) {
    const promSocioId = row.promovida_socio_id as string;
    // Entra en la MISMA clase que se acaba de liberar, así que su tipo decide de
    // qué bono se le descuenta. Se resuelve aquí porque la consulta de arriba
    // vive dentro del bloque de la cancelación tardía. `sesion_id` es required
    // en consumirBonoServidor (0132): sin sesión no hay de qué clase decidir la
    // cobertura, así que sin ella tampoco hay nada que consumir.
    const bonoConsumido = cancelada?.sesion_id
      ? await consumirBonoServidor(admin, params.studioId, promSocioId, cancelada.sesion_id as string)
      : false;
    // Avisar a la socia ascendida de que su plaza está confirmada (indicando si
    // se le ha consumido una sesión del bono — solo si realmente ocurrió).
    // Cierra la mentira "te avisaremos si se libera una plaza". No bloquea.
    if (cancelada?.sesion_id) {
      await notificarPromocionEspera(admin, params.studioId, promSocioId, cancelada.sesion_id as string, bonoConsumido);
      // Notification Engine: in-app (+ push cuando aplique) a la socia ascendida.
      const { emitirPlazaLiberada } = await import('@/lib/notifications/emit');
      await emitirPlazaLiberada(admin, { studioId: params.studioId, sesionId: cancelada.sesion_id as string, socioId: promSocioId });
    }
  } else if (row?.oferta_socio_id && cancelada?.sesion_id) {
    // Fase 2b: el estudio/tipo de clase exige plazo de aceptación — NO se
    // confirma sola (sin consumir bono ni asignar spot todavía, eso pasa al
    // aceptar, ver aceptarOfertaListaEspera), solo se le avisa que tiene una
    // oferta viva hasta oferta_expira_en.
    const { emitirOfertaListaEspera } = await import('@/lib/notifications/emit');
    await emitirOfertaListaEspera(admin, {
      studioId: params.studioId, sesionId: cancelada.sesion_id as string,
      socioId: row.oferta_socio_id as string, expiraEn: row.oferta_expira_en as string,
    });
  }
  // Notification Engine: confirmación a la socia de que su plaza ya no está.
  // Clave cuando lo dispara el SISTEMA (corte por riesgo de plantón): si no, se
  // queda sin plaza sin enterarse.
  if (cancelada?.socio_id && cancelada?.sesion_id) {
    const { emitirReservaCancelada } = await import('@/lib/notifications/emit');
    await emitirReservaCancelada(admin, {
      studioId: params.studioId,
      sesionId: cancelada.sesion_id as string,
      socioId: cancelada.socio_id as string,
      reservaId: params.reservaId,
    });
  }

  // S-1: cancelar baja RESERVAS_TOTALES, así que se re-evalúa para que el
  // progreso mostrado (logros y retos) siga siendo cierto. Un logro YA conseguido
  // no se revoca (el bucle salta los completados), igual que hacía la evaluación
  // en cliente.
  if (cancelada?.socio_id) {
    await evaluarGamificacionServidor(admin, params.studioId, cancelada.socio_id as string);
  }
  return { ok: true as const, tardia, bonoDevuelto, eraConfirmada: row?.era_confirmada === true };
}

// Cancela una reserva de la socia, devuelve su bono y promueve la lista de espera.

export async function cancelarReservaPublica(params: {
  studioId: string; reservaId: string; socioId: string; email: string;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const socia = await validarSociaPublica(admin, params.studioId, params.socioId, params.email);
  if (!socia) return { error: 'No autorizado' as const };
  // tardia/bonoDevuelto → la UI puede confirmar a la socia si recuperó la sesión.
  const r = await ejecutarCancelacionReserva(admin, { studioId: params.studioId, reservaId: params.reservaId, socioId: params.socioId });
  if ('error' in r) return r;

  // F2 (B2.5) vía socia mínima: si lo que cancela es su PLAZA FIJA (reserva
  // materializada por el cron, id `res-pf-…`), se le guarda una recuperación en
  // vez de perder la clase — la misma compensación que la vía dueña-first. El tope
  // (4) lo aplica la RPC. Para reservas normales no aplica (rige la devolución de
  // bono habitual).
  // Solo si la cancelación REALMENTE ocurrió ahora (la reserva estaba CONFIRMADA
  // y se ha cancelado). `cancelar_reserva_plaza` devuelve sin error también cuando
  // la reserva YA estaba CANCELADA (era_confirmada=false); sin este gate, re-llamar
  // a cancelar la misma plaza fija minaba una recuperación nueva cada vez (hasta el
  // tope de 4) → clases gratis self-service. La RPC además dedup por origen (0103).
  let recuperacionCreada = false;
  if (params.reservaId.startsWith('res-pf-') && r.eraConfirmada) {
    const { data } = await admin.rpc('crear_recuperacion', {
      p_id: `recup-${uid()}`,
      p_studio_id: params.studioId,
      p_socio_id: params.socioId,
      p_origen_reserva_id: params.reservaId,
      p_motivo: 'Plaza fija — no puede esta semana',
    });
    recuperacionCreada = data === 'CREADA';
  }
  return { ...r, recuperacionCreada };
}

// ─── Citas 1:1 auto-reservables (0046) — escrituras/lecturas públicas ─────────
// Mismo patrón de seguridad que las reservas: service-role + validación de que la
// socia (id+email) pertenece al estudio; la identidad sale del JWT, nunca del body.

// Servicios auto-reservables + instructoras + su horario fino, para pintar el
// selector de la reserva pública. No expone datos de otras socias.

export async function fetchCatalogoCitasPublico(studioId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const [{ data: servicios }, { data: disp }] = await Promise.all([
    admin.from('citas_servicios').select('*')
      .eq('studio_id', studioId).eq('activo', true).eq('auto_reservable', true)
      .order('orden', { ascending: true }),
    admin.from('citas_disponibilidad').select('*').eq('studio_id', studioId),
  ]);
  return {
    servicios: (servicios ?? []).map((r) => mapServicioCita(r as RowCitasServicios)),
    disponibilidad: (disp ?? []).map((r) => mapDisponibilidadCita(r as RowCitasDisponibilidad)),
  };
}

// Intervalos que ya ocupan la agenda de una instructora (citas activas + sesiones
// de grupo no canceladas) en un rango, para restarlos al calcular huecos.

async function cargarOcupadosInstructora(
  admin: SupabaseClient, studioId: string, instructorId: string, desdeISO: string, hastaISO: string,
): Promise<IntervaloOcupado[]> {
  const [{ data: citas }, { data: sesiones }] = await Promise.all([
    admin.from('citas').select('inicio, fin, estado')
      .eq('studio_id', studioId).eq('instructor_id', instructorId)
      .in('estado', ['PENDIENTE', 'CONFIRMADA'])
      .lt('inicio', hastaISO).gte('fin', desdeISO),
    admin.from('sesiones').select('inicio, fin, cancelada')
      .eq('studio_id', studioId).eq('instructor_id', instructorId)
      .lt('inicio', hastaISO).gte('fin', desdeISO),
  ]);
  const out: IntervaloOcupado[] = [];
  for (const c of citas ?? []) out.push({ inicio: c.inicio as string, fin: c.fin as string });
  for (const s of sesiones ?? []) {
    if (s.cancelada) continue;
    out.push({ inicio: s.inicio as string, fin: s.fin as string });
  }
  return out;
}

// Huecos reservables de una instructora para un servicio y un día (Madrid).

export async function fetchHuecosCitaPublico(params: {
  studioId: string; servicioId: string; instructorId: string; fechaLocal: string; ahora?: Date;
}): Promise<{ error: string } | { ok: true; huecos: HuecoCita[] }> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  const { data: srow } = await admin.from('citas_servicios').select('*')
    .eq('id', params.servicioId).eq('studio_id', params.studioId).maybeSingle();
  if (!srow || !srow.activo || !srow.auto_reservable) return { error: 'Servicio no disponible' };
  const servicio = mapServicioCita(srow as RowCitasServicios);

  const { data: disp } = await admin.from('citas_disponibilidad').select('*')
    .eq('studio_id', params.studioId).eq('instructor_id', params.instructorId);
  const franjas = (disp ?? []).map((r) => mapDisponibilidadCita(r as RowCitasDisponibilidad))
    .map((f) => ({ diaSemana: f.diaSemana, horaInicio: f.horaInicio, horaFin: f.horaFin }));

  // Rango del día en Madrid para cargar los ocupados (con holgura de 1 día).
  const desde = horaParedAInstante(params.fechaLocal, '00:00');
  const hasta = new Date(desde.getTime() + 36 * 3600 * 1000);
  const ocupados = await cargarOcupadosInstructora(
    admin, params.studioId, params.instructorId, desde.toISOString(), hasta.toISOString(),
  );

  const huecos = generarHuecosDia({
    fechaLocal: params.fechaLocal, franjas, duracionMin: servicio.duracionMin,
    ocupados, ahora: params.ahora ?? new Date(),
  });
  return { ok: true, huecos };
}

// Reserva self-service de una cita 1:1. Valida socia + servicio auto-reservable +
// que el hueco cae dentro del horario fino de la instructora, y crea la cita de
// forma ATÓMICA (rpc reservar_cita serializa concurrencia y rechaza solapes).

export async function crearCitaPublica(params: {
  studioId: string; servicioId: string; instructorId: string; inicioISO: string;
  socioId: string; email: string;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const socia = await validarSociaPublica(admin, params.studioId, params.socioId, params.email);
  if (!socia) return { error: 'No autorizado' as const };

  const { data: srow } = await admin.from('citas_servicios').select('*')
    .eq('id', params.servicioId).eq('studio_id', params.studioId).maybeSingle();
  if (!srow || !srow.activo || !srow.auto_reservable) return { error: 'Servicio no disponible' as const };
  const servicio = mapServicioCita(srow as RowCitasServicios);

  const inicio = new Date(params.inicioISO);
  if (Number.isNaN(inicio.getTime()) || inicio.getTime() <= Date.now()) {
    return { error: 'Esa hora no es válida' as const };
  }
  const finISO = new Date(inicio.getTime() + servicio.duracionMin * 60000).toISOString();

  // La instructora debe existir en el estudio y estar activa.
  const { data: instr } = await admin.from('instructores').select('id, activo')
    .eq('id', params.instructorId).eq('studio_id', params.studioId).maybeSingle();
  if (!instr || !instr.activo) return { error: 'Instructora no disponible' as const };

  // Guardia de disponibilidad: el hueco debe caer dentro del horario fino de la
  // instructora (autoritativo en servidor; la UI solo ofrece huecos válidos).
  const { data: disp } = await admin.from('citas_disponibilidad').select('*')
    .eq('studio_id', params.studioId).eq('instructor_id', params.instructorId);
  const franjas = (disp ?? []).map((r) => mapDisponibilidadCita(r as RowCitasDisponibilidad))
    .map((f) => ({ diaSemana: f.diaSemana, horaInicio: f.horaInicio, horaFin: f.horaFin }));
  if (!dentroDeDisponibilidad({ inicioISO: inicio.toISOString(), finISO, franjas })) {
    return { error: 'Ese hueco no está disponible' as const };
  }

  const citaId = `cita-${uid()}`;
  const { data, error } = await admin.rpc('reservar_cita', {
    p_id: citaId, p_studio_id: params.studioId, p_socio_id: params.socioId,
    p_instructor_id: params.instructorId, p_servicio_id: params.servicioId,
    p_tipo: servicio.tipo, p_inicio: inicio.toISOString(), p_fin: finISO,
    p_precio: servicio.precio, p_notas: null,
  });
  if (error) return { error: error.message };
  const estado = (Array.isArray(data) ? data[0] : data) as string;
  if (estado === 'CONFLICTO') return { error: 'Ese hueco ya no está disponible' as const };

  return {
    ok: true as const, citaId, estado: 'CONFIRMADA' as const,
    inicio: inicio.toISOString(), fin: finISO,
  };
}

// Cancela una cita self-service: solo si es de la socia y aún no ha pasado.

export async function cancelarCitaPublica(params: {
  studioId: string; citaId: string; socioId: string; email: string;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const socia = await validarSociaPublica(admin, params.studioId, params.socioId, params.email);
  if (!socia) return { error: 'No autorizado' as const };

  const { data: cita } = await admin.from('citas').select('id, socio_id, inicio, estado')
    .eq('id', params.citaId).eq('studio_id', params.studioId).maybeSingle();
  if (!cita || cita.socio_id !== params.socioId) return { error: 'Cita no encontrada' as const };
  if (cita.estado === 'CANCELADA') return { ok: true as const };
  if (new Date(cita.inicio as string).getTime() <= Date.now()) {
    return { error: 'Esta cita ya ha pasado' as const };
  }
  const { error } = await admin.from('citas').update({ estado: 'CANCELADA' })
    .eq('id', params.citaId).eq('studio_id', params.studioId);
  if (error) return { error: error.message };
  return { ok: true as const };
}

// Login del portal: resuelve email → socia dentro del estudio (service-role).
// Sustituye la lectura anónima directa sobre socios en la página de login.
// I13: `resolverLoginSocia(slug, email)` se ELIMINÓ (junto a POST /api/public/login).
// Devolvía socioId/nombre/email para cualquier email existente, sin prueba de
// control → oráculo de enumeración de membresía/PII sin autenticar. La sustituye
// resolverSociaAutenticada (JWT), única vía de login del portal.

// Resuelve la socia de un usuario autenticado con Supabase Auth (portal con
// magic link / OTP). El usuario YA demostró que controla ese email al validar el
// JWT (a diferencia del antiguo login por email suelto, ya retirado). Vincula la
// fila de la socia a su usuario de auth la primera vez (claim), igual que el
// equipo con instructores.

export async function resolverSociaAutenticada(slug: string, authUserId: string, email: string) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  // También por dirección antigua: si no, quien entra al portal desde un enlace
  // viejo se queda sin sesión aunque su ficha exista.
  const resuelto = await resolverStudioPorSlug(admin as never, slug);
  if (!resuelto) return null;
  const studio = resuelto.row as { id: string };

  // 1) Ya vinculada: la socia de este estudio cuyo auth_user_id es este usuario.
  const { data: linked } = await admin
    .from('socios').select('id, nombre, apellidos, email')
    .eq('auth_user_id', authUserId).eq('studio_id', studio.id).maybeSingle();
  if (linked) {
    return { socioId: linked.id, nombre: `${linked.nombre} ${linked.apellidos}`.trim(), email: linked.email };
  }

  // 2) Claim: una socia de este estudio con este email y aún sin vincular. El
  //    email del JWT es de confianza (Supabase lo verificó), así que enlazamos.
  const { data: claimable } = await admin
    .from('socios').select('id, nombre, apellidos, email')
    .ilike('email', email.trim()).eq('studio_id', studio.id).is('auth_user_id', null).maybeSingle();
  if (!claimable) return null;
  await admin.from('socios').update({ auth_user_id: authUserId }).eq('id', claimable.id);
  return { socioId: claimable.id, nombre: `${claimable.nombre} ${claimable.apellidos}`.trim(), email: claimable.email };
}

// Devuelve el id de la socia vinculada a un usuario de Supabase Auth dentro de
// un estudio (por auth_user_id), o null. Se usa en los endpoints que exigen
// sesión real de socia: la identidad sale del JWT verificado, NUNCA del body.

export async function socioAutenticado(authUserId: string, studioId: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin
    .from('socios').select('id')
    .eq('auth_user_id', authUserId).eq('studio_id', studioId).maybeSingle();
  return data?.id ?? null;
}

// Marca/desmarca un tipo de clase como favorito de la socia autenticada.
// `socioId` sale de `socioAutenticado`, nunca del body — mismo criterio que
// crear/cancelar reserva. `unique(socio_id, tipo_clase_id)` en la tabla hace
// el "marcar" idempotente sin necesidad de comprobar antes si ya existía.
export async function toggleFavoritoPublico(params: {
  studioId: string; socioId: string; tipoClaseId: string; accion: 'marcar' | 'desmarcar';
}): Promise<{ ok: true } | { error: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { error: 'Service role no configurada' };
  // El id de tipo de clase llega del body: sin esta comprobación, una socia
  // podía marcar como favorito un tipo_clase de OTRO estudio (el FK solo prueba
  // que la fila existe en algún sitio, no que sea de este estudio) — corrupción
  // de datos cross-tenant. Mismo criterio que socioAutenticado con studioId.
  const { data: tipo } = await admin.from('tipos_clase').select('id')
    .eq('id', params.tipoClaseId).eq('studio_id', params.studioId).maybeSingle();
  if (!tipo) return { error: 'Ese tipo de clase no existe en este estudio.' };
  if (params.accion === 'marcar') {
    const { error } = await admin.from('favoritos_clase').upsert(
      { studio_id: params.studioId, socio_id: params.socioId, tipo_clase_id: params.tipoClaseId },
      { onConflict: 'socio_id,tipo_clase_id', ignoreDuplicates: true },
    );
    if (error) return { error: 'No se ha podido guardar el favorito.' };
    return { ok: true };
  }
  const { error } = await admin.from('favoritos_clase').delete()
    .eq('studio_id', params.studioId).eq('socio_id', params.socioId).eq('tipo_clase_id', params.tipoClaseId);
  if (error) return { error: 'No se ha podido quitar el favorito.' };
  return { ok: true };
}

// Registra una socia nueva desde el portal/reserva (alta pública). Valida que
// el estudio existe; el id lo genera el cliente (primera reserva).
// Socias que cuentan para el tope del plan: activas y no borradas. Mismo
// criterio que el alta manual y el importador, para que los tres den el mismo
// número — si divergen, el tope depende de por dónde entres.

async function contarSociasActivas(admin: SupabaseClient, studioId: string): Promise<number> {
  const { count } = await admin
    .from('socios')
    .select('id', { count: 'exact', head: true })
    .eq('studio_id', studioId)
    .eq('activo', true)
    .is('borrado_en', null);
  return count ?? 0;
}


export async function registrarSociaPublica(params: {
  studioId: string; id: string; nombre: string; email: string;
  authUserId?: string;
  aceptacion?: { fecha: string; firma: string; versionTexto: string };
  referidoPor?: string | null;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const { data: studio } = await admin.from('studios').select('id').eq('id', params.studioId).maybeSingle();
  if (!studio) return { error: 'Estudio no encontrado' as const };

  // Idempotencia: si este usuario de auth ya tiene socia en el estudio (p. ej.
  // reintento tras registrarse), no creamos una duplicada — devolvemos la suya.
  if (params.authUserId) {
    const yaSocia = await socioAutenticado(params.authUserId, params.studioId);
    if (yaSocia) return { ok: true as const, socioId: yaSocia };
  }

  // El referido solo es válido si existe una socia con ese id en el estudio.
  // Se resuelve ANTES de la adopción de ficha fantasma (justo abajo): esa rama
  // también tiene que poder escribir referido_por, o el premio de quien invitó
  // se pierde en silencio cada vez que la referida ya tenía una ficha fantasma.
  let referido: string | null = null;
  if (params.referidoPor && params.referidoPor !== params.id) {
    const { data } = await admin.from('socios').select('id').eq('id', params.referidoPor).eq('studio_id', params.studioId).maybeSingle();
    referido = data ? params.referidoPor : null;
  }

  // Ficha "fantasma": entregarPlanComprado (compra pública vía Stripe, sin
  // login previo) puede haber creado ya una socia con este email pero SIN
  // auth_user_id -- solo pagó, nunca inició sesión. Si no se adopta aquí, este
  // alta crea una SEGUNDA ficha con id distinto, y el bono ya cobrado queda
  // invisible para siempre en la fantasma (auditoría 2026-07-29, hallazgo 2.2).
  // .limit(1) en vez de .maybeSingle(): si dos compras casi simultáneas de un
  // mismo email sin cuenta llegaran a crear dos fantasmas (carrera infrecuente
  // en entregarPlanComprado), .maybeSingle() habría devuelto un error de
  // "more than one row" que este código ignoraba — cayendo al alta normal y
  // dejando AMBOS bonos huérfanos para siempre. Con .limit(1) siempre se
  // adopta uno de forma determinista en vez de no adoptar ninguno.
  const { data: fantasmas } = await admin
    .from('socios')
    .select('id')
    .eq('studio_id', params.studioId)
    .ilike('email', params.email)
    .is('auth_user_id', null)
    .limit(1);
  const fantasma = fantasmas?.[0];
  if (fantasma) {
    const { error } = await admin.from('socios').update({
      auth_user_id: params.authUserId ?? null,
      // La ficha fantasma nace de entregarPlanComprado con lo que Stripe haya
      // recogido (a veces nada más que "Clienta") — se sincroniza con el
      // nombre real que acaba de escribir en el alta, igual que el alta normal.
      nombre: params.nombre,
      apellidos: '',
      aceptacion_fecha: params.aceptacion?.fecha ?? null,
      aceptacion_firma: params.aceptacion?.firma ?? null,
      aceptacion_version: params.aceptacion?.versionTexto ?? null,
      // Sin esto, revisión de auditoría: la ficha fantasma no traía
      // referido_por (entregarPlanComprado no acepta código de referido), así
      // que adoptarla sin escribirlo aquí perdía el premio de quien invitó.
      ...(referido ? { referido_por: referido } : {}),
    }).eq('id', fantasma.id);
    if (error) return { error: error.message };
    return { ok: true as const, socioId: fantasma.id as string };
  }

  // Tope de socias del plan. Va AQUÍ, después de la idempotencia y pegado al
  // insert, y no en la ruta que llama: allí corría ANTES de la salida temprana
  // de arriba, así que un simple reintento de una socia que YA existe se comía
  // el bloqueo aunque no fuese a crear ninguna fila. Y ese error lo lee la
  // CLIENTA, no la dueña — «Tu plan permite hasta N socias, mejóralo» es un
  // mensaje de facturación que no tiene por qué salir del panel del estudio.
  //
  // Separadas, las dos comprobaciones se vuelven a desincronizar; juntas, el
  // tope solo se aplica cuando de verdad va a entrar una socia nueva.
  const denegacion = await evaluarLimiteSocias(params.studioId, await contarSociasActivas(admin, params.studioId), 1);
  if (denegacion) return { error: denegacion.error, code: denegacion.code };

  const { error } = await admin.from('socios').insert({
    id: params.id, studio_id: params.studioId, nombre: params.nombre, apellidos: '',
    email: params.email, activo: true, fecha_alta: new Date().toISOString(),
    auth_user_id: params.authUserId ?? null,
    aceptacion_fecha: params.aceptacion?.fecha ?? null,
    aceptacion_firma: params.aceptacion?.firma ?? null,
    aceptacion_version: params.aceptacion?.versionTexto ?? null,
    referido_por: referido,
  });
  if (error) return { error: error.message };
  return { ok: true as const };
}

// Campos que una socia puede editar de SU propia ficha (whitelist). No puede
// tocar tags, lead_stage, activo, referido_por ni datos de Stripe.

const CAMPOS_SOCIA_EDITABLES: Record<string, string> = {
  telefono: 'telefono', nif: 'nif', avatar: 'avatar', fotoUrl: 'foto_url',
  fechaNacimiento: 'fecha_nacimiento', direccion: 'direccion',
};


export async function actualizarSociaPublica(params: {
  studioId: string; socioId: string; email: string; cambios: Record<string, unknown>;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const socia = await validarSociaPublica(admin, params.studioId, params.socioId, params.email);
  if (!socia) return { error: 'No autorizado' as const };

  const db: Record<string, unknown> = {};
  for (const [camel, snake] of Object.entries(CAMPOS_SOCIA_EDITABLES)) {
    if (camel in params.cambios) db[snake] = params.cambios[camel];
  }
  // Aceptación del contrato (clickwrap): objeto anidado → columnas de registro.
  // Sin esto, la aceptación se perdía y no quedaba evidencia (C-7).
  const ac = params.cambios.aceptacionContrato as
    { fecha?: string; firma?: string; versionTexto?: string } | undefined;
  if (ac && typeof ac === 'object') {
    db.aceptacion_fecha = ac.fecha ?? null;
    db.aceptacion_firma = ac.firma ?? null;
    db.aceptacion_version = ac.versionTexto ?? null;
  }
  if (Object.keys(db).length === 0) return { ok: true as const };
  const { error } = await admin.from('socios').update(db).eq('id', params.socioId);
  if (error) return { error: error.message };
  return { ok: true as const };
}


export async function guardarPreferenciasPublica(params: {
  studioId: string; socioId: string; email: string; cambios: Record<string, unknown>;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const socia = await validarSociaPublica(admin, params.studioId, params.socioId, params.email);
  if (!socia) return { error: 'No autorizado' as const };

  const { data: existente } = await admin
    .from('preferencias_socio').select('*').eq('studio_id', params.studioId).eq('socio_id', params.socioId).maybeSingle();
  // I8: los cambios llegan en camelCase desde el portal (notifEmail,
  // instructorFavoritoId…). Antes se hacían spread DIRECTO al upsert → columnas
  // inexistentes → el write fallaba en silencio. Mapeamos camel→snake con lista
  // blanca (misma correspondencia que dbUpsertPreferenciasSocio); las claves
  // desconocidas se ignoran en vez de intentar escribir una columna que no existe.
  const COLUMNA_PREF: Record<string, string> = {
    disponibilidad: 'disponibilidad',
    instructorFavoritoId: 'instructor_favorito_id',
    tipoClaseFavorita: 'tipo_clase_favorita',
    duracionPreferida: 'duracion_preferida',
    nivel: 'nivel',
    notifEmail: 'notif_email',
    notifWhatsapp: 'notif_whatsapp',
  };
  const cambiosSnake: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params.cambios)) {
    const col = COLUMNA_PREF[k];
    if (col) cambiosSnake[col] = v;
  }
  const fila = {
    socio_id: params.socioId, studio_id: params.studioId,
    ...(existente ?? {}), ...cambiosSnake, actualizado_en: new Date().toISOString(),
  };
  const { error } = await admin.from('preferencias_socio').upsert(fila, { onConflict: 'socio_id' });
  if (error) return { error: error.message };
  return { ok: true as const };
}

// Canjea una recompensa del catálogo con los créditos de la socia. Valida
// identidad, disponibilidad/stock/saldo (reward-engine) y actualiza el saldo.

export async function canjearRecompensaPublica(params: {
  studioId: string; socioId: string; email: string; catalogItemId: string;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const socia = await validarSociaPublica(admin, params.studioId, params.socioId, params.email);
  if (!socia) return { error: 'No autorizado' as const };

  const [{ data: itemRow }, { data: credRow }] = await Promise.all([
    admin.from('reward_catalog').select('*').eq('id', params.catalogItemId).eq('studio_id', params.studioId).maybeSingle(),
    admin.from('member_credits').select('*').eq('socio_id', params.socioId).maybeSingle(),
  ]);
  const item = itemRow ? mapRewardCatalogItem(itemRow as RowRewardCatalog) : undefined;
  const saldo = credRow ? mapMemberCredits(credRow as RowMemberCredits).saldo : 0;

  const validacion = validarCanje(item, saldo);
  if ('error' in validacion) return validacion;
  if (!item) return { error: 'Esta recompensa ya no está disponible.' as const };

  const now = new Date().toISOString();
  const redemptionId = `rwd-${uid()}`;

  // A-13: para ítems con stock limitado, se RESERVA el stock ATÓMICAMENTE (RPC)
  // antes de cobrar créditos. Antes se hacía `update stock = item.stock-1` con un
  // valor leído de un snapshot → dos canjes concurrentes del último ítem lo
  // vendían dos veces. Si está agotado, no se debita nada.
  const stockLimitado = item.stock != null;
  if (stockLimitado) {
    const { error: stockErr } = await admin.rpc('ajustar_stock', {
      p_item_id: params.catalogItemId, p_studio_id: params.studioId, p_delta: -1,
    });
    if (stockErr) {
      if (stockErr.message.includes('SIN_STOCK')) return { error: 'Esta recompensa está agotada.' as const };
      return { error: stockErr.message };
    }
  }

  // P0-20: descuento ATÓMICO del saldo (con guard de saldo suficiente). Si falla,
  // se DEVUELVE el stock que se acababa de reservar.
  const { error: credErr } = await admin.rpc('ajustar_creditos', {
    p_socio_id: params.socioId, p_studio_id: params.studioId,
    p_delta_saldo: -item.costeCreditos, p_delta_ganado: 0, p_delta_canjeado: item.costeCreditos,
  });
  if (credErr) {
    if (stockLimitado) {
      await admin.rpc('ajustar_stock', { p_item_id: params.catalogItemId, p_studio_id: params.studioId, p_delta: 1 });
    }
    if (credErr.message.includes('SALDO_INSUFICIENTE')) return { error: 'Saldo insuficiente' as const };
    return { error: credErr.message };
  }

  await Promise.all([
    admin.from('reward_redemptions').insert({
      id: redemptionId, studio_id: params.studioId, socio_id: params.socioId,
      catalog_item_id: params.catalogItemId, creditos_gastados: item.costeCreditos, estado: 'PENDIENTE', creado_en: now,
    }),
    admin.from('credit_transactions').insert({
      id: `ctx-${uid()}`, studio_id: params.studioId, socio_id: params.socioId, tipo: 'CANJE',
      creditos: -item.costeCreditos, descripcion: `Canje: ${item.nombre}`, ref_id: redemptionId, creado_en: now,
    }),
  ]);
  return { ok: true as const };
}

// Otorga créditos server-side (misma decisión pura que el contexto): si la regla
// está activa y no se otorgó ya para ese refId, inserta action/history/tx y
// actualiza el saldo. El UNIQUE(studio,trigger,ref_id) es el cerrojo real.

async function otorgarCreditosServidor(
  admin: SupabaseClient, studioId: string, socioId: string,
  trigger: RewardTrigger, refId: string | null,
) {
  // R7/gate de plan: la gamificación (créditos, logros, retos, niveles, rachas)
  // es una feature de los planes Estudio/Cadena — un estudio en Base no gana
  // créditos nuevos aquí. `evaluarFeature` falla abierto si BILLING_ENFORCED no
  // está activo, igual que el resto de gates del producto (ver billing-rules.ts).
  if (await evaluarFeature(studioId, 'gamificacion')) return;

  const [{ data: rulesRows }, { data: actionRows }] = await Promise.all([
    admin.from('reward_rules').select('*').eq('studio_id', studioId),
    admin.from('reward_actions').select('*').eq('studio_id', studioId),
  ]);
  const rules = (rulesRows ?? []).map(mapRewardRule);
  const actions = (actionRows ?? []).map(mapRewardAction);
  const { otorgar, regla } = decidirOtorgarCreditos(rules, actions, trigger, refId);
  if (!otorgar || !regla) return;

  const now = new Date().toISOString();
  const actionId = `rwa-${uid()}`;
  const { error } = await admin.from('reward_actions').insert({
    id: actionId, studio_id: studioId, socio_id: socioId, trigger, ref_id: refId, creado_en: now,
  });
  if (error) return; // choque con el UNIQUE → ya otorgado, no seguimos

  // P0-20: incremento ATÓMICO del saldo (una ganancia nunca lo deja negativo).
  await admin.rpc('ajustar_creditos', {
    p_socio_id: socioId, p_studio_id: studioId,
    p_delta_saldo: regla.creditos, p_delta_ganado: regla.creditos, p_delta_canjeado: 0,
  });
  await Promise.all([
    admin.from('reward_history').insert({
      id: `rwh-${uid()}`, studio_id: studioId, socio_id: socioId, rule_id: regla.id, action_id: actionId,
      creditos: regla.creditos, descripcion: regla.nombre, creado_en: now,
    }),
    admin.from('credit_transactions').insert({
      id: `ctx-${uid()}`, studio_id: studioId, socio_id: socioId, tipo: 'GANANCIA', creditos: regla.creditos,
      descripcion: regla.nombre, ref_id: refId, creado_en: now,
    }),
  ]);
}

// ─── Gamificación en servidor (S-1) ──────────────────────────────────────────
// Las escrituras de logros vivían SOLO en el cliente (studio-context) con el
// cliente anónimo. Desde el portal la socia se autentica por OTP y su JWT no
// lleva claim de studio_id, así que la policy `studio_id = current_studio_id()`
// rechazaba la cadena ENTERA —progreso, historial, claim de recompensa,
// transacción de crédito y ajuste de saldo—: la gamificación de socias no se
// persistía nunca. No era un fallo de permisos puntual, era una escritura hecha
// desde el sitio equivocado.
//
// Se evalúa aquí, con service-role y todo acotado por studio_id, en los mismos
// puntos donde la métrica cambia de verdad. Ninguna métrica sube hasta el umbral
// por el mero paso del tiempo (el tiempo solo puede ROMPER una racha), así que
// evaluar en la acción cubre todos los desbloqueos sin exponer un endpoint
// público nuevo que conceda créditos canjeables.
//
// Es best-effort: si algo falla se reporta pero NO se tumba la operación que la
// disparó — perder un logro es peor que perder la reserva, pero mucho menos malo
// que perder la reserva por culpa del logro.
// Datos que comparten logros y retos. Se cargan UNA vez por acción: ambos
// sistemas evalúan sobre las mismas reservas/sesiones/socia y corren seguidos,
// así que separarlos duplicaría las consultas en cada reserva y check-in.

interface ContextoGamificacion {
  socio: Socio;
  reservas: Reserva[];
  sesiones: Sesion[];
  referidas: Socio[];
}


async function cargarContextoGamificacion(
  admin: SupabaseClient, studioId: string, socioId: string,
): Promise<ContextoGamificacion | null> {
  const [{ data: socioRow }, { data: resRows }] = await Promise.all([
    admin.from('socios').select('*').eq('id', socioId).eq('studio_id', studioId).maybeSingle(),
    admin.from('reservas').select('*').eq('studio_id', studioId).eq('socio_id', socioId),
  ]);
  if (!socioRow) return null;
  const reservas = (resRows ?? []).map(mapReserva);

  // Solo las sesiones que sus reservas referencian: las métricas las usan para
  // fechar la asistencia, no hace falta traerse la agenda entera del estudio.
  const sesionIds = [...new Set(reservas.map(r => r.sesionId))];
  const [sesRows, refRows] = await Promise.all([
    sesionIds.length
      ? admin.from('sesiones').select('*').eq('studio_id', studioId).in('id', sesionIds).then(r => r.data)
      : Promise.resolve([]),
    // AMIGOS_INVITADOS solo cuenta socias referidas por ella: basta con las
    // suyas, no el censo del estudio. calcularMetrica filtra por referidoPor,
    // así que pasarle únicamente las referidas da el mismo número.
    admin.from('socios').select('*').eq('studio_id', studioId).eq('referido_por', socioId).then(r => r.data),
  ]);

  return {
    socio: mapSocio(socioRow as RowSocios),
    reservas,
    sesiones: (sesRows ?? []).map(mapSesion),
    referidas: (refRows ?? []).map(mapSocio),
  };
}


async function evaluarLogrosServidor(
  admin: SupabaseClient, studioId: string, socioId: string, ctx: ContextoGamificacion,
): Promise<void> {
  const [{ data: defRows }, { data: progRows }] = await Promise.all([
    admin.from('achievement_definitions').select('*').eq('studio_id', studioId).eq('activo', true),
    admin.from('achievement_progress').select('*').eq('studio_id', studioId).eq('socio_id', socioId),
  ]);
  const definiciones = (defRows ?? []).map(mapAchievementDefinition);
  if (definiciones.length === 0) return;

  const progresos = (progRows ?? []).map(mapAchievementProgress);
  const { socio, reservas, sesiones, referidas } = ctx;

  const now = new Date();
  // Cada logro es independiente de los demás (progreso/historial/crédito solo
  // tocan filas propias de ese achievement_id, y reward_actions se protege con
  // su UNIQUE) — se evalúan en paralelo en vez de un `for` con awaits
  // secuenciales, que serializaba hasta N×4 round-trips en el hot path de
  // cada reserva creada.
  await Promise.all(definiciones.map(async def => {
    const existente = progresos.find(p => p.achievementId === def.id);
    if (existente?.completado) return; // ya conseguido, no se re-evalúa

    const valor = calcularMetrica(def.metric, { reservas, sesiones, socio, now, todosLosSocios: referidas });
    const completadoAhora = valor >= def.umbral;

    const { error: progError } = await admin.from('achievement_progress').upsert({
      id: existente?.id ?? `achp-${uid()}`,
      studio_id: studioId, socio_id: socioId, achievement_id: def.id,
      progreso_actual: valor, completado: completadoAhora,
      completado_en: completadoAhora ? now.toISOString() : null,
    }, { onConflict: 'socio_id,achievement_id' });
    if (progError) { reportDbError('[evaluarLogrosServidor] progreso', progError); return; }

    if (!completadoAhora) return;

    const { error: histError } = await admin.from('achievement_history').insert({
      id: `achh-${uid()}`, studio_id: studioId, socio_id: socioId, achievement_id: def.id,
      nombre: def.nombre, icono: def.icono, creado_en: now.toISOString(),
    });
    if (histError) reportDbError('[evaluarLogrosServidor] historial', histError);

    if (def.creditosRecompensa <= 0) return;
    // C-11: la idempotencia real la da el UNIQUE de reward_actions. Dos
    // evaluaciones concurrentes (dos reservas a la vez) no pueden doblar el
    // saldo: la segunda choca con el UNIQUE y sale.
    const { error: claimError } = await admin.from('reward_actions').insert({
      id: `rwa-${uid()}`, studio_id: studioId, socio_id: socioId,
      trigger: 'LOGRO', ref_id: `${socioId}:${def.id}`, creado_en: now.toISOString(),
    });
    if (claimError) return; // ya otorgado por otra evaluación

    // P0-20: incremento ATÓMICO del saldo.
    await admin.rpc('ajustar_creditos', {
      p_socio_id: socioId, p_studio_id: studioId,
      p_delta_saldo: def.creditosRecompensa, p_delta_ganado: def.creditosRecompensa, p_delta_canjeado: 0,
    });
    await admin.from('credit_transactions').insert({
      id: `ctx-${uid()}`, studio_id: studioId, socio_id: socioId, tipo: 'GANANCIA',
      creditos: def.creditosRecompensa, descripcion: `Logro desbloqueado: ${def.nombre}`,
      ref_id: def.id, creado_en: now.toISOString(),
    });
  }));
}

// Retos: mismo fallo y mismo arreglo que los logros. La diferencia es que un
// reto solo cuenta lo que pasa DENTRO de su ventana de fechas, así que se filtra
// a los activos y vigentes y el progreso lo calcula calcularProgresoReto (que
// recorta las reservas al periodo antes de aplicar la misma métrica).

async function evaluarRetosServidor(
  admin: SupabaseClient, studioId: string, socioId: string, ctx: ContextoGamificacion,
): Promise<void> {
  const now = new Date();
  const [{ data: defRows }, { data: progRows }] = await Promise.all([
    admin.from('challenge_definitions').select('*').eq('studio_id', studioId).eq('activo', true),
    admin.from('challenge_progress').select('*').eq('studio_id', studioId).eq('socio_id', socioId),
  ]);
  const retos = (defRows ?? []).map(mapChallengeDefinition)
    .filter(r => new Date(r.fechaInicio) <= now && now <= new Date(r.fechaFin));
  if (retos.length === 0) return;

  const progresos = (progRows ?? []).map(mapChallengeProgress);
  const { socio, reservas, sesiones, referidas } = ctx;

  // Mismo motivo que evaluarLogrosServidor: cada reto es independiente, se
  // evalúan en paralelo en vez de serializar N×4 round-trips por reserva.
  await Promise.all(retos.map(async reto => {
    const existente = progresos.find(p => p.challengeId === reto.id);
    if (existente?.completado) return; // ya conseguido, no se re-evalúa

    const valor = calcularProgresoReto(reto, reservas, sesiones, socio, referidas, now);
    const completadoAhora = valor >= reto.objetivo;

    const { error: progError } = await admin.from('challenge_progress').upsert({
      id: existente?.id ?? `chap-${uid()}`,
      studio_id: studioId, socio_id: socioId, challenge_id: reto.id,
      progreso_actual: valor, completado: completadoAhora,
      completado_en: completadoAhora ? now.toISOString() : null,
    }, { onConflict: 'socio_id,challenge_id' });
    if (progError) { reportDbError('[evaluarRetosServidor] progreso', progError); return; }

    if (!completadoAhora) return;

    const { error: histError } = await admin.from('challenge_history').insert({
      id: `chah-${uid()}`, studio_id: studioId, socio_id: socioId, challenge_id: reto.id,
      nombre: reto.nombre, icono: reto.icono, creado_en: now.toISOString(),
    });
    if (histError) reportDbError('[evaluarRetosServidor] historial', histError);

    if (reto.creditosRecompensa <= 0) return;
    // Mismo UNIQUE de reward_actions que los logros, con trigger 'RETO'.
    const { error: claimError } = await admin.from('reward_actions').insert({
      id: `rwa-${uid()}`, studio_id: studioId, socio_id: socioId,
      trigger: 'RETO', ref_id: `${socioId}:${reto.id}`, creado_en: now.toISOString(),
    });
    if (claimError) return; // ya otorgado por otra evaluación

    await admin.rpc('ajustar_creditos', {
      p_socio_id: socioId, p_studio_id: studioId,
      p_delta_saldo: reto.creditosRecompensa, p_delta_ganado: reto.creditosRecompensa, p_delta_canjeado: 0,
    });
    await admin.from('credit_transactions').insert({
      id: `ctx-${uid()}`, studio_id: studioId, socio_id: socioId, tipo: 'GANANCIA',
      creditos: reto.creditosRecompensa, descripcion: `Reto completado: ${reto.nombre}`,
      ref_id: reto.id, creado_en: now.toISOString(),
    });
  }));
}

// Punto de entrada único: carga el contexto UNA vez y evalúa ambos sistemas.
// Best-effort de verdad: si la gamificación falla, la reserva o el check-in que
// la disparó siguen adelante — perder un logro es mucho menos malo que perder
// la plaza por culpa del logro.

async function evaluarGamificacionServidor(
  admin: SupabaseClient, studioId: string, socioId: string,
): Promise<void> {
  try {
    // Mismo gate que otorgarCreditosServidor: sin la feature de plan, no se
    // evalúa progreso nuevo de logros/retos. El progreso ya conseguido antes de
    // perder el plan NO se borra (evaluarLogrosServidor/evaluarRetosServidor no
    // tocan lo que ya está `completado`); solo se congela, no retrocede.
    if (await evaluarFeature(studioId, 'gamificacion')) return;
    const ctx = await cargarContextoGamificacion(admin, studioId, socioId);
    if (!ctx) return;
    await evaluarLogrosServidor(admin, studioId, socioId, ctx);
    await evaluarRetosServidor(admin, studioId, socioId, ctx);
  } catch (err) {
    reportDbError('[evaluarGamificacionServidor]', err);
  }
}

// C-2: valida el token de dispositivo de kiosko de un estudio. Sin token
// configurado (NULL) el check-in público queda cerrado (devuelve false), que es
// el lado seguro. Solo tiene sentido en servidor (usa service-role); en cliente
// getSupabaseAdmin() es null y devuelve false.

export async function validarKioskToken(studioId: string, token: string | null): Promise<boolean> {
  if (!token) return false;
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const { data } = await admin.from('studios').select('kiosk_token').eq('id', studioId).maybeSingle();
  const esperado = (data?.kiosk_token ?? '') as string;
  // El token es aleatorio de alta entropía; una comparación directa es
  // suficiente (un ataque de temporización sobre un secreto aleatorio no es
  // práctico) y evita importar `crypto` en un módulo que también corre en cliente.
  return esperado.length > 0 && esperado === token;
}

// Check-in de kiosk: marca la reserva ASISTIDA, otorga créditos de asistencia y,
// si es la primera clase de una socia referida, premia a quien la invitó (con
// tope mensual). La reserva debe pertenecer al estudio.

export async function checkinPublico(params: { studioId: string; reservaId: string }) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  const { data: resRow } = await admin
    .from('reservas').select('*').eq('id', params.reservaId).eq('studio_id', params.studioId).maybeSingle();
  if (!resRow) return { error: 'Reserva no encontrada' as const };
  const reserva = mapReserva(resRow as RowReservas);
  if (reserva.estado === 'ASISTIDA') return { ok: true as const }; // idempotente
  // Solo se hace check-in de una reserva CONFIRMADA. Antes cualquier otro estado
  // (LISTA_ESPERA, CANCELADA, NO_ASISTIO) se sobrescribía a ASISTIDA: como los IDs
  // de reserva son públicos (fetchPublicStudioData los expone), con el kiosk-token
  // se podía resucitar una reserva CANCELADA o colar una de LISTA_ESPERA —saltándose
  // el aforo (plazasOcupadas cuenta ASISTIDA como ocupada) y otorgando créditos de
  // asistencia indebidos.
  if (reserva.estado !== 'CONFIRMADA') return { error: 'La reserva no está confirmada' as const };

  await admin.from('reservas').update({ estado: 'ASISTIDA', check_in_en: new Date().toISOString() }).eq('id', params.reservaId);

  // Créditos por asistencia (dedup por reservaId).
  await otorgarCreditosServidor(admin, params.studioId, reserva.socioId, 'ASISTENCIA_CLASE', params.reservaId);

  // Premio de referido si es su primera clase asistida.
  const { data: todasRes } = await admin.from('reservas').select('*').eq('studio_id', params.studioId).eq('socio_id', reserva.socioId);
  const reservasTrasCheckin = (todasRes ?? []).map(mapReserva)
    .map(r => r.id === reserva.id ? { ...r, estado: 'ASISTIDA' as const } : r);
  const [{ data: sociaRow }, { data: rulesRows }, { data: actionRows }] = await Promise.all([
    admin.from('socios').select('*').eq('id', reserva.socioId).maybeSingle(),
    admin.from('reward_rules').select('*').eq('studio_id', params.studioId),
    admin.from('reward_actions').select('*').eq('studio_id', params.studioId),
  ]);
  const regla = (rulesRows ?? []).map(mapRewardRule).find(r => r.trigger === 'REFERIDO_AMIGO' && r.activa) ?? null;
  const { premiar, referidorId } = decidirPremioReferido({
    socia: sociaRow ? mapSocio(sociaRow as RowSocios) : undefined,
    reservasTrasCheckin,
    rewardActions: (actionRows ?? []).map(mapRewardAction),
    topeMensual: regla?.topeMensual ?? null,
    ahora: new Date(),
  });
  if (premiar && referidorId) {
    await otorgarCreditosServidor(admin, params.studioId, referidorId, 'REFERIDO_AMIGO', reserva.socioId);
    // La referidora acaba de sumar en AMIGOS_INVITADOS.
    await evaluarGamificacionServidor(admin, params.studioId, referidorId);
  }
  // S-1: el check-in mueve CLASES_ASISTIDAS, la racha y la asistencia mensual
  // — en logros y en los retos cuya ventana incluya esta sesión.
  // Antes esto solo se evaluaba en el cliente y desde el portal RLS lo rechazaba.
  await evaluarGamificacionServidor(admin, params.studioId, reserva.socioId);
  return { ok: true as const };
}

// ─── Mappers: TS (camelCase) → DB (snake_case) ───────────────────────────────


export async function dbUpsertAutomationLog(log: AutomationLog) {
  const row = {
    id: log.id,
    studio_id: log.studioId ?? getCurrentStudioId(),
    // S-2: exactamente uno de los dos va informado (CHECK en BD, migr. 0053).
    rule_id: log.ruleId ?? null,
    automatizacion_id: log.automatizacionId ?? null,
    rule_name: log.ruleName,
    socio_id: log.socioId,
    socio_nombre: log.socioNombre,
    paso_index: log.pasoIndex,
    accion: log.accion,
    resultado: log.resultado,
    detalle: log.detalle,
    mensaje_cliente: log.mensajeCliente ?? null,
    ejecutado_en: log.ejecutadoEn,
    proxima_accion_en: log.proximaAccionEn,
    recibo_id: log.reciboId ?? null,
  };
  const { error } = await dbEscritura().from('automation_logs').upsert(row, { onConflict: 'id' });
  if (error) reportDbError('[dbUpsertAutomationLog]', error);
}

// `studioId` obligatorio: dbEscritura() es service-role (bypasa RLS), así que
// sin acotar por estudio, un log de OTRO estudio (id adivinado o filtrado)
// quedaría escribible desde una sesión de staff cualquiera — mismo hueco que
// el de #195, aquí sobre el registro de auditoría, no sobre el cobro en sí.

export async function dbUpdateAutomationLog(id: string, studioId: string, changes: Partial<AutomationLog>) {
  const db: Record<string, unknown> = {};
  if ('resultado' in changes) db.resultado = changes.resultado;
  if ('detalle' in changes) db.detalle = changes.detalle;
  if ('mensajeCliente' in changes) db.mensaje_cliente = changes.mensajeCliente;
  if ('proximaAccionEn' in changes) db.proxima_accion_en = changes.proximaAccionEn;
  const { error } = await dbEscritura().from('automation_logs').update(db).eq('id', id).eq('studio_id', studioId);
  if (error) reportDbError('[dbUpdateAutomationLog]', error);
}


export async function dbSetStripeAccountId(studioId: string, stripeAccountId: string | null) {
  // A-1: se ejecuta en el callback OAuth de Stripe Connect (servidor, sin sesión
  // de usuario). Con el cliente anónimo, la política owner_studios (que exige
  // current_studio_id()) no casa ninguna fila → el binding NO se guardaba y el
  // onboarding de Stripe quedaba roto en silencio. Con service-role sí persiste.
  const admin = getSupabaseAdmin();
  if (!admin) { reportDbError('[dbSetStripeAccountId]', new Error('service role no configurada')); return; }
  const { error } = await admin.from('studios').update({ stripe_account_id: stripeAccountId }).eq('id', studioId);
  if (error) reportDbError('[dbSetStripeAccountId]', error);
}

// Igual que el callback de Stripe: sin sesión de usuario, así que hace falta
// la service role (el cliente anon no tiene permiso de escritura sobre
// `studios` fuera de una sesión autenticada).

export async function dbSetGoogleCalendarEmail(studioId: string, email: string | null) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('studios').update({ google_calendar_email: email }).eq('id', studioId);
  if (error) reportDbError('[dbSetGoogleCalendarEmail]', error);
}


export interface GoogleCalendarCredenciales {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}


export async function dbGetGoogleCalendarCredenciales(studioId: string): Promise<GoogleCalendarCredenciales | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin
    .from('integracion_credenciales')
    .select('access_token, refresh_token, expires_at')
    .eq('studio_id', studioId)
    .eq('provider', 'google_calendar')
    .maybeSingle();
  if (error) { reportDbError('[dbGetGoogleCalendarCredenciales]', error); return null; }
  if (!data || !data.refresh_token) return null;
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: data.expires_at };
}


export async function dbSaveGoogleCalendarCredenciales(studioId: string, c: GoogleCalendarCredenciales) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('integracion_credenciales').upsert({
    studio_id: studioId,
    provider: 'google_calendar',
    access_token: c.accessToken,
    refresh_token: c.refreshToken,
    expires_at: c.expiresAt,
    actualizado_en: new Date().toISOString(),
  }, { onConflict: 'studio_id,provider' });
  if (error) reportDbError('[dbSaveGoogleCalendarCredenciales]', error);
}


export async function dbDeleteGoogleCalendarCredenciales(studioId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('integracion_credenciales').delete().eq('studio_id', studioId).eq('provider', 'google_calendar');
  if (error) reportDbError('[dbDeleteGoogleCalendarCredenciales]', error);
}

// Gmail: mismo patrón exacto que Google Calendar (misma app de Google,
// mismo `integracion_credenciales` genérico por proveedor — solo cambia el
// valor de `provider` a 'gmail' para no mezclar los tokens de las dos
// integraciones, que un estudio puede tener conectadas independientemente).

export async function dbSetGmailEmail(studioId: string, email: string | null) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('studios').update({ gmail_email: email }).eq('id', studioId);
  if (error) reportDbError('[dbSetGmailEmail]', error);
}


export interface GmailCredenciales {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}


export async function dbGetGmailCredenciales(studioId: string): Promise<GmailCredenciales | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin
    .from('integracion_credenciales')
    .select('access_token, refresh_token, expires_at')
    .eq('studio_id', studioId)
    .eq('provider', 'gmail')
    .maybeSingle();
  if (error) { reportDbError('[dbGetGmailCredenciales]', error); return null; }
  if (!data || !data.refresh_token) return null;
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: data.expires_at };
}


export async function dbSaveGmailCredenciales(studioId: string, c: GmailCredenciales) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('integracion_credenciales').upsert({
    studio_id: studioId,
    provider: 'gmail',
    access_token: c.accessToken,
    refresh_token: c.refreshToken,
    expires_at: c.expiresAt,
    actualizado_en: new Date().toISOString(),
  }, { onConflict: 'studio_id,provider' });
  if (error) reportDbError('[dbSaveGmailCredenciales]', error);
}


export async function dbDeleteGmailCredenciales(studioId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('integracion_credenciales').delete().eq('studio_id', studioId).eq('provider', 'gmail');
  if (error) reportDbError('[dbDeleteGmailCredenciales]', error);
}

// Zoom: mismo patrón exacto que Google Calendar/Gmail (una app de Zoom para
// toda la plataforma, `integracion_credenciales` genérico por proveedor con
// provider='zoom'). Sustituye al Server-to-Server OAuth de una sola cuenta:
// cada estudio conecta ahora la suya propia.

export async function dbSetZoomEmail(studioId: string, email: string | null) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('studios').update({ zoom_email: email }).eq('id', studioId);
  if (error) reportDbError('[dbSetZoomEmail]', error);
}


export interface ZoomCredenciales {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}


export async function dbGetZoomCredenciales(studioId: string): Promise<ZoomCredenciales | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin
    .from('integracion_credenciales')
    .select('access_token, refresh_token, expires_at')
    .eq('studio_id', studioId)
    .eq('provider', 'zoom')
    .maybeSingle();
  if (error) { reportDbError('[dbGetZoomCredenciales]', error); return null; }
  if (!data || !data.refresh_token) return null;
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: data.expires_at };
}


export async function dbSaveZoomCredenciales(studioId: string, c: ZoomCredenciales) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('integracion_credenciales').upsert({
    studio_id: studioId,
    provider: 'zoom',
    access_token: c.accessToken,
    refresh_token: c.refreshToken,
    expires_at: c.expiresAt,
    actualizado_en: new Date().toISOString(),
  }, { onConflict: 'studio_id,provider' });
  if (error) reportDbError('[dbSaveZoomCredenciales]', error);
}


export async function dbDeleteZoomCredenciales(studioId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('integracion_credenciales').delete().eq('studio_id', studioId).eq('provider', 'zoom');
  if (error) reportDbError('[dbDeleteZoomCredenciales]', error);
}

// Config guardada por el propio estudio para una integración "campos" (Kisi,
// WhatsApp Business) — cada negocio pega su propia clave/token, no hay
// secreto compartido de plataforma. Lo usan las rutas de "Probar conexión".

export async function dbGetIntegracionConfig(studioId: string, tipo: TipoIntegracion): Promise<{ activo: boolean; config: Record<string, string> } | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin
    .from('integraciones')
    .select('activo, config')
    .eq('studio_id', studioId)
    .eq('tipo', tipo)
    .maybeSingle();
  if (error) { reportDbError('[dbGetIntegracionConfig]', error); return null; }
  if (!data) return null;
  return { activo: !!data.activo, config: (data.config as Record<string, string>) ?? {} };
}


