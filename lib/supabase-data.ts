import * as Sentry from '@sentry/nextjs';
import { supabase } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { enviarEmailTransaccional, type DatosClaseEmail } from '@/lib/emails/send-server';
import { uid } from '@/lib/utils';
import { siguienteEnEspera, contarReservasActivasFuturas, debeDevolverBono, esCancelacionTardia } from '@/lib/booking-logic';
import { bonoConsumible, calcularConsumoBono, calcularDevolucionBono, tieneEntitlementActivo } from '@/lib/bono-logic';
import { validarCanje, decidirOtorgarCreditos } from '@/lib/reward-engine';
import { decidirPremioReferido } from '@/lib/booking-logic';
import { recordatoriosRevision, textoRecordatorioRevision } from '@/lib/ficha-clinica';
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
  RowCodigosDescuento,
  RowCreditTransactions,
  RowDashboardCharts,
  RowFacturas,
  RowInstructores,
  RowIntegraciones,
  RowLevelDefinitions,
  RowMemberCredits,
  RowMensajesEquipo,
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
  RowSesiones,
  RowSocios,
  RowSpots,
  RowStudios,
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
  CodigoDescuento,
  CreditTransaction,
  DashboardChart,
  Factura,
  Instructor,
  Integracion,
  LevelDefinition,
  MemberCredits,
  MensajeEquipo,
  CondicionSalud,
  RespuestaSesionRow,
  NotaInterna,
  NotaProgreso,
  Notificacion,
  PlanTarifa,
  PostComunidad,
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
  Sesion,
  Socio,
  Spot,
  Studio,
  Suscripcion,
  TipoClase,
  Usuario,
  VentaPOS,
  VideoOnDemand,
} from '@/lib/types';


// Multi-tenancy: STUDIO_ID is resolved per logged-in user (see
// resolveStudioId/setCurrentStudioId) and read at call time by every helper
// below, so changing it here propagates everywhere without touching each of
// the ~45 call sites individually.
//
// The default is an EMPTY sentinel on purpose: until resolution runs, queries
// filter by studio_id = '' and match nothing, instead of silently falling back
// to another tenant's data (the old 'studio-1' default leaked studio-1 to any
// new user whose studio hadn't resolved yet).
let STUDIO_ID = '';

export function setCurrentStudioId(id: string) {
  STUDIO_ID = id;
}

// P0-2/9: techo de la ventana reciente para las tablas append-only de tipo
// feed (actividad, notificaciones). Sin esto, la carga inicial del contexto
// global traía TODO el histórico al navegador; con estudios de años eso son
// cientos de miles de filas por pestaña. 500 cubre de sobra cualquier vista
// de feed ("últimas actividades", bandeja) — nadie scrollea 500 items. Las
// tablas que SÍ se agregan sobre histórico (reservas, recibos, ventas...) no
// se acotan aquí: eso rompería los informes; su fix es agregación server-side.
const RECENT_FEED_LIMIT = 500;

export function getCurrentStudioId() {
  return STUDIO_ID;
}

// Looks up which studio a just-authenticated user belongs to: first as a
// claimed team member (instructores.auth_user_id), then as an owner
// (studios.owner_auth_user_id). Returns null if neither matches (a brand
// new signup that hasn't created or joined a studio yet).
export async function resolveStudioId(userId: string): Promise<string | null> {
  // limit(1) en vez de maybeSingle(): un usuario puede pertenecer a varios
  // estudios (instructor en dos centros, o dueño de varias sedes). maybeSingle()
  // lanzaba error con >1 fila y dejaba el estudio sin resolver. Orden por id
  // determinista = mismo estudio primario que verificarSesionStaff (servidor).
  const { data: instructores } = await supabase
    .from('instructores')
    .select('studio_id')
    .eq('auth_user_id', userId)
    .order('studio_id', { ascending: true })
    .limit(1);
  if (instructores?.[0]?.studio_id) return instructores[0].studio_id;

  const { data: studios } = await supabase
    .from('studios')
    .select('id')
    .eq('owner_auth_user_id', userId)
    .order('id', { ascending: true })
    .limit(1);
  if (studios?.[0]?.id) return studios[0].id;

  return null;
}

// ─── Global DB error reporting ───────────────────────────────────────────────
// Write helpers are fire-and-forget; when a write fails we log to console AND
// notify any registered listener (the UI) so the failure is visible to the user
// instead of silently lost.
type DbErrorListener = (tag: string, error: unknown) => void;
let dbErrorListener: DbErrorListener | null = null;

export function setDbErrorListener(fn: DbErrorListener | null) {
  dbErrorListener = fn;
}

function reportDbError(tag: string, error: unknown) {
  console.error(tag, error);
  // A-6: los fallos de escritura de DB llegan a Sentry (antes solo console.error
  // + un toast → invisibles en producción). Tag por estudio para agrupar por
  // tenant. No-op si Sentry no está inicializado (DSN sin definir).
  try {
    Sentry.captureException(
      error instanceof Error ? error : new Error(`${tag}: ${typeof error === 'string' ? error : JSON.stringify(error)}`),
      { tags: { area: 'db', studioId: STUDIO_ID || 'desconocido' }, extra: { op: tag } },
    );
  } catch {
    /* nunca dejar que el reporte rompa una escritura */
  }
  try {
    dbErrorListener?.(tag, error);
  } catch {
    /* never let the listener break a write */
  }
}

// ─── Mappers: DB (snake_case) → TS (camelCase) ───────────────────────────────

function mapStudio(r: RowStudios): Studio {
  return {
    id: r.id,
    nombre: r.nombre,
    nif: r.nif,
    razonSocial: r.razon_social,
    direccion: r.direccion,
    ciudad: r.ciudad,
    codigoPostal: r.codigo_postal,
    email: r.email,
    telefono: r.telefono,
    colorPrimario: r.color_primario,
    temaPortal: r.tema_portal ?? 'original',
    plan: r.plan,
    avatarAdmin: r.avatar_admin ?? null,
    ownerAuthUserId: r.owner_auth_user_id ?? null,
    slug: r.slug ?? null,
    creadoEn: r.creado_en,
    stripeAccountId: r.stripe_account_id ?? null,
    googleCalendarEmail: r.google_calendar_email ?? null,
    stripeCustomerId: r.stripe_customer_id ?? null,
    subscriptionId: r.subscription_id ?? null,
    subscriptionStatus: r.subscription_status ?? null,
    currentPeriodEnd: r.current_period_end ?? null,
    cancelacionVentanaHoras: r.cancelacion_ventana_horas ?? 12,
    cancelacionDevolverBonoTardia: r.cancelacion_devolver_bono_tardia ?? false,
    reservaExigirPlan: r.reserva_exigir_plan ?? false,
    reservaMaxSimultaneas: r.reserva_max_simultaneas ?? null,
    stripeTerminalReaderId: r.stripe_terminal_reader_id ?? null,
    stripeTerminalLocationId: r.stripe_terminal_location_id ?? null,
  } as Studio;
}

// Guarda el lector (datáfono) emparejado con el estudio. Lo llama la ruta de
// Terminal (servidor, sin sesión de usuario) → service role.
export async function dbSetTerminalReader(studioId: string, readerId: string | null, locationId: string | null) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('studios')
    .update({ stripe_terminal_reader_id: readerId, stripe_terminal_location_id: locationId })
    .eq('id', studioId);
  if (error) reportDbError('[dbSetTerminalReader]', error);
}

function mapUsuario(r: RowUsuarios): Usuario {
  return {
    id: r.id,
    studioId: r.studio_id,
    rol: r.rol,
    nombre: r.nombre,
    email: r.email,
    telefono: r.telefono ?? null,
    avatarUrl: r.avatar_url ?? null,
  } as Usuario;
}

function mapSocio(r: RowSocios): Socio {
  const aceptacionContrato =
    r.aceptacion_fecha
      ? {
          fecha: r.aceptacion_fecha,
          firma: r.aceptacion_firma ?? '',
          versionTexto: r.aceptacion_version ?? '',
        }
      : undefined;

  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    apellidos: r.apellidos,
    email: r.email,
    telefono: r.telefono ?? null,
    nif: r.nif ?? null,
    fechaAlta: r.fecha_alta,
    activo: r.activo,
    leadStage: r.lead_stage ?? undefined,
    tags: r.tags ?? undefined,
    aceptacionContrato,
    avatar: r.avatar ?? null,
    stripeCustomerId: r.stripe_customer_id ?? null,
    stripePaymentMethodId: r.stripe_payment_method_id ?? null,
    fechaNacimiento: r.fecha_nacimiento ?? null,
    direccion: r.direccion ?? null,
    fotoUrl: r.foto_url ?? null,
    referidoPor: r.referido_por ?? null,
  } as Socio;
}

function mapPreferenciasSocio(r: RowPreferenciasSocio): PreferenciasSocio {
  return {
    socioId: r.socio_id,
    studioId: r.studio_id,
    disponibilidad: r.disponibilidad ?? {},
    instructorFavoritoId: r.instructor_favorito_id ?? null,
    tipoClaseFavorita: r.tipo_clase_favorita ?? null,
    duracionPreferida: r.duracion_preferida ?? null,
    nivel: r.nivel ?? null,
    notifEmail: r.notif_email ?? true,
    notifWhatsapp: r.notif_whatsapp ?? true,
    actualizadoEn: r.actualizado_en,
  } as PreferenciasSocio;
}

function mapRewardRule(r: RowRewardRules): RewardRule {
  return {
    id: r.id,
    studioId: r.studio_id,
    trigger: r.trigger,
    nombre: r.nombre,
    descripcion: r.descripcion ?? null,
    creditos: r.creditos,
    activa: r.activa,
    topeMensual: r.tope_mensual ?? null,
    creadoEn: r.creado_en,
  } as RewardRule;
}

function mapRewardAction(r: RowRewardActions): RewardAction {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    trigger: r.trigger,
    refId: r.ref_id ?? null,
    creadoEn: r.creado_en,
  } as RewardAction;
}

function mapRewardHistory(r: RowRewardHistory): RewardHistory {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    ruleId: r.rule_id,
    actionId: r.action_id,
    creditos: r.creditos,
    descripcion: r.descripcion,
    creadoEn: r.creado_en,
  } as RewardHistory;
}

function mapCreditTransaction(r: RowCreditTransactions): CreditTransaction {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    tipo: r.tipo,
    creditos: r.creditos,
    descripcion: r.descripcion,
    refId: r.ref_id ?? null,
    creadoEn: r.creado_en,
  } as CreditTransaction;
}

function mapMemberCredits(r: RowMemberCredits): MemberCredits {
  return {
    socioId: r.socio_id,
    studioId: r.studio_id,
    saldo: r.saldo,
    totalGanado: r.total_ganado,
    totalCanjeado: r.total_canjeado,
    actualizadoEn: r.actualizado_en,
  } as MemberCredits;
}

function mapRewardCatalogItem(r: RowRewardCatalog): RewardCatalogItem {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    descripcion: r.descripcion ?? null,
    costeCreditos: r.coste_creditos,
    icono: r.icono,
    activo: r.activo,
    stock: r.stock ?? null,
    creadoEn: r.creado_en,
  } as RewardCatalogItem;
}

function mapRewardRedemption(r: RowRewardRedemptions): RewardRedemption {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    catalogItemId: r.catalog_item_id,
    creditosGastados: r.creditos_gastados,
    estado: r.estado,
    creadoEn: r.creado_en,
  } as RewardRedemption;
}

function mapAchievementDefinition(r: RowAchievementDefinitions): AchievementDefinition {
  return {
    id: r.id,
    studioId: r.studio_id,
    metric: r.metric,
    nombre: r.nombre,
    descripcion: r.descripcion ?? null,
    umbral: r.umbral,
    icono: r.icono,
    creditosRecompensa: r.creditos_recompensa,
    activo: r.activo,
    creadoEn: r.creado_en,
  } as AchievementDefinition;
}

function mapAchievementProgress(r: RowAchievementProgress): AchievementProgress {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    achievementId: r.achievement_id,
    progresoActual: r.progreso_actual,
    completado: r.completado,
    completadoEn: r.completado_en ?? null,
  } as AchievementProgress;
}

function mapAchievementHistory(r: RowAchievementHistory): AchievementHistory {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    achievementId: r.achievement_id,
    nombre: r.nombre,
    icono: r.icono,
    creadoEn: r.creado_en,
  } as AchievementHistory;
}

function mapLevelDefinition(r: RowLevelDefinitions): LevelDefinition {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    orden: r.orden,
    umbralCreditos: r.umbral_creditos,
    color: r.color,
    icono: r.icono,
    beneficios: r.beneficios ?? null,
    activo: r.activo,
    creadoEn: r.creado_en,
  } as LevelDefinition;
}

function mapChallengeDefinition(r: RowChallengeDefinitions): ChallengeDefinition {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    descripcion: r.descripcion ?? null,
    icono: r.icono,
    metric: r.metric,
    objetivo: r.objetivo,
    fechaInicio: r.fecha_inicio,
    fechaFin: r.fecha_fin,
    creditosRecompensa: r.creditos_recompensa,
    activo: r.activo,
    creadoEn: r.creado_en,
  } as ChallengeDefinition;
}

function mapChallengeProgress(r: RowChallengeProgress): ChallengeProgress {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    challengeId: r.challenge_id,
    progresoActual: r.progreso_actual,
    completado: r.completado,
    completadoEn: r.completado_en ?? null,
  } as ChallengeProgress;
}

function mapChallengeHistory(r: RowChallengeHistory): ChallengeHistory {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    challengeId: r.challenge_id,
    nombre: r.nombre,
    icono: r.icono,
    creadoEn: r.creado_en,
  } as ChallengeHistory;
}

function mapDashboardChart(r: RowDashboardCharts): DashboardChart {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    tipo: r.tipo,
    metrica: r.metrica,
    agrupacion: r.agrupacion,
    rango: r.rango,
    color: r.color,
    creadoEn: r.creado_en,
  } as DashboardChart;
}

function mapBackupMeta(r: RowBackups): BackupMeta {
  return {
    id: r.id,
    studioId: r.studio_id,
    tipo: r.tipo,
    creadoEn: r.creado_en,
  } as BackupMeta;
}

function mapPlanTarifa(r: RowPlanesTarifa): PlanTarifa {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    descripcion: r.descripcion ?? null,
    precio: r.precio,
    tipo: r.tipo,
    sesiones: r.sesiones ?? null,
    activo: r.activo,
  } as PlanTarifa;
}

function mapSuscripcion(r: RowSuscripciones): Suscripcion {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    planId: r.plan_id,
    estado: r.estado,
    fechaInicio: r.fecha_inicio,
    fechaFin: r.fecha_fin ?? null,
    sesionesRestantes: r.sesiones_restantes ?? null,
    stripeSubscriptionId: r.stripe_subscription_id ?? null,
  } as Suscripcion;
}

function mapSala(r: RowSalas): Sala {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    capacidad: r.capacidad,
    color: r.color,
  } as Sala;
}

function mapSpot(r: RowSpots): Spot {
  return {
    id: r.id,
    salaId: r.sala_id,
    studioId: r.studio_id,
    numero: r.numero,
    nombre: r.nombre,
    fila: r.fila,
    columna: r.columna,
    tipo: r.tipo,
    activo: r.activo,
  } as Spot;
}

function mapTipoClase(r: RowTiposClase): TipoClase {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    color: r.color,
    duracionMinutos: r.duracion_minutos,
    descripcion: r.descripcion ?? null,
    nivel: r.nivel,
    fotoUrl: r.foto_url ?? null,
  } as TipoClase;
}

function mapInstructor(r: RowInstructores): Instructor {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    email: r.email ?? null,
    telefono: r.telefono ?? null,
    color: r.color,
    activo: r.activo,
    avatar: r.avatar ?? null,
    rol: r.rol ?? 'INSTRUCTOR',
    authUserId: r.auth_user_id ?? null,
  } as Instructor;
}

function mapSesion(r: RowSesiones): Sesion {
  return {
    id: r.id,
    studioId: r.studio_id,
    tipoClaseId: r.tipo_clase_id,
    salaId: r.sala_id,
    instructorId: r.instructor_id,
    inicio: r.inicio,
    fin: r.fin,
    aforoMaximo: r.aforo_maximo,
    cancelada: r.cancelada,
    notas: r.notas ?? null,
    precioPuntual: r.precio_puntual ?? null,
    googleEventId: r.google_event_id ?? null,
    serieId: r.serie_id ?? null,
  } as Sesion;
}

function mapReserva(r: RowReservas): Reserva {
  return {
    id: r.id,
    studioId: r.studio_id,
    sesionId: r.sesion_id,
    socioId: r.socio_id,
    estado: r.estado,
    spotId: r.spot_id ?? null,
    posicionEspera: r.posicion_espera ?? null,
    checkInEn: r.check_in_en ?? null,
    creadoEn: r.creado_en,
  } as Reserva;
}

function mapRecibo(r: RowRecibos): Recibo {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    suscripcionId: r.suscripcion_id ?? null,
    concepto: r.concepto,
    importe: r.importe,
    estado: r.estado,
    fechaVencimiento: r.fecha_vencimiento,
    fechaCobro: r.fecha_cobro ?? null,
    fechaDevolucion: r.fecha_devolucion ?? null,
    intentosReintento: r.intentos_reintento,
  } as Recibo;
}

function mapFactura(r: RowFacturas): Factura {
  return {
    id: r.id,
    studioId: r.studio_id,
    reciboId: r.recibo_id,
    numeroCompleto: r.numero_completo,
    fechaEmision: r.fecha_emision,
    receptorNombre: r.receptor_nombre,
    receptorNIF: r.receptor_nif ?? null,
    baseImponible: r.base_imponible,
    tipoIVA: r.tipo_iva,
    cuotaIVA: r.cuota_iva,
    total: r.total,
    verifactuHash: r.verifactu_hash ?? null,
    verifactuPrevHash: r.verifactu_prev_hash ?? null,
    verifactuTs: r.verifactu_ts ?? null,
    verifactuSeq: r.verifactu_seq ?? null,
  } as Factura;
}

function mapCita(r: RowCitas): Cita {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    instructorId: r.instructor_id,
    tipo: r.tipo,
    inicio: r.inicio,
    fin: r.fin,
    notas: r.notas ?? null,
    estado: r.estado,
    precio: r.precio ?? null,
    creadoEn: r.creado_en,
  } as Cita;
}

function mapProductoPOS(r: RowProductosPos): ProductoPOS {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    categoria: r.categoria,
    precio: r.precio,
    activo: r.activo,
  } as ProductoPOS;
}

function mapVentaPOS(r: RowVentasPos): VentaPOS {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id ?? null,
    items: r.items ?? [],
    subtotal: r.subtotal,
    descuento: r.descuento,
    total: r.total,
    metodoPago: r.metodo_pago,
    notas: r.notas ?? null,
    realizadaEn: r.realizada_en,
  } as VentaPOS;
}

function mapIntegracion(r: RowIntegraciones): Integracion {
  return {
    id: r.id,
    studioId: r.studio_id,
    tipo: r.tipo,
    activo: r.activo,
    config: r.config ?? {},
    actualizadoEn: r.actualizado_en,
  } as Integracion;
}

function mapCampana(r: RowCampanas): Campana {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    tipo: r.tipo,
    asunto: r.asunto,
    contenido: r.contenido,
    estado: r.estado,
    destinatarios: r.destinatarios,
    enviados: r.enviados,
    abiertos: r.abiertos,
    clics: r.clics,
    creadaEn: r.creada_en,
    enviadaEn: r.enviada_en ?? null,
    programadaEn: r.programada_en ?? null,
  } as Campana;
}

function mapAutomatizacion(r: RowAutomatizaciones): Automatizacion {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    trigger: r.trigger,
    accion: r.accion,
    asunto: r.asunto,
    mensaje: r.mensaje,
    activa: r.activa,
    ejecutadas: r.ejecutadas,
    creadaEn: r.creada_en,
  } as Automatizacion;
}

function mapAutomationRule(r: RowAutomationRules): AutomationRule {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    descripcion: r.descripcion,
    icono: r.icono,
    trigger: r.trigger,
    condicion: r.condicion ?? {},
    pasos: r.pasos ?? [],
    activa: r.activa,
    ejecutadaVeces: r.ejecutada_veces,
    ultimaEjecucion: r.ultima_ejecucion ?? null,
    creadaEn: r.creada_en,
  } as AutomationRule;
}

function mapAutomationLog(r: RowAutomationLogs): AutomationLog {
  return {
    id: r.id,
    studioId: r.studio_id,
    ruleId: r.rule_id,
    ruleName: r.rule_name,
    socioId: r.socio_id ?? null,
    socioNombre: r.socio_nombre ?? null,
    pasoIndex: r.paso_index,
    accion: r.accion,
    resultado: r.resultado,
    detalle: r.detalle,
    ejecutadoEn: r.ejecutado_en,
    proximaAccionEn: r.proxima_accion_en ?? null,
    reciboId: r.recibo_id ?? null,
  } as AutomationLog;
}

function mapNotaProgreso(r: RowNotasProgreso): NotaProgreso {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    instructorId: r.instructor_id,
    sesionId: r.sesion_id ?? null,
    textoLibre: r.texto_libre,
    progreso: r.progreso ?? null,
    alertas: r.alertas ?? null,
    planProximaSesion: r.plan_proxima_sesion ?? null,
    ejerciciosCasa: r.ejercicios_casa ?? null,
    creadaEn: r.creada_en,
  } as NotaProgreso;
}

function mapCodigoDescuento(r: RowCodigosDescuento): CodigoDescuento {
  return {
    id: r.id,
    studioId: r.studio_id,
    codigo: r.codigo,
    descripcion: r.descripcion,
    tipo: r.tipo,
    valor: r.valor,
    usos: r.usos,
    usosMax: r.usos_max ?? null,
    expira: r.expira ?? null,
    activo: r.activo,
    creadoEn: r.creado_en,
  } as CodigoDescuento;
}

function mapActividadReciente(r: RowActividadReciente): ActividadReciente {
  return {
    id: r.id,
    studioId: r.studio_id,
    tipo: r.tipo,
    texto: r.texto,
    socioId: r.socio_id ?? null,
    enlace: r.enlace ?? null,
    creadoEn: r.creado_en,
    actorNombre: r.actor_nombre ?? null,
  } as ActividadReciente;
}

function mapMensajeEquipo(r: RowMensajesEquipo): MensajeEquipo {
  return {
    id: r.id,
    studioId: r.studio_id,
    autorInstructorId: r.autor_instructor_id ?? null,
    autorNombre: r.autor_nombre,
    texto: r.texto,
    creadoEn: r.creado_en,
  } as MensajeEquipo;
}

function mapNotificacion(r: RowNotificaciones): Notificacion {
  return {
    id: r.id,
    studioId: r.studio_id,
    titulo: r.titulo,
    texto: r.texto,
    leida: r.leida,
    tipo: r.tipo,
    enlace: r.enlace ?? null,
    creadaEn: r.creada_en,
  } as Notificacion;
}

function mapVideoOnDemand(r: RowVideosOnDemand): VideoOnDemand {
  return {
    id: r.id,
    studioId: r.studio_id,
    titulo: r.titulo,
    descripcion: r.descripcion ?? null,
    categoria: r.categoria,
    duracionMinutos: r.duracion_minutos,
    nivel: r.nivel,
    instructorId: r.instructor_id,
    vistas: r.vistas,
    likes: r.likes,
    activo: r.activo,
    creadoEn: r.creado_en,
  } as VideoOnDemand;
}

function mapPostComunidad(r: RowPostsComunidad): PostComunidad {
  return {
    id: r.id,
    studioId: r.studio_id,
    autorId: r.autor_id ?? null,
    autorNombre: r.autor_nombre,
    autorInicial: r.autor_inicial,
    texto: r.texto,
    likes: r.likes,
    comentariosCount: r.comentarios_count,
    fijado: r.fijado,
    creadoEn: r.creado_en,
  } as PostComunidad;
}

function mapNotaInterna(r: RowNotasInternas): NotaInterna {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    texto: r.texto,
    tipo: r.tipo,
    creadoEn: r.creado_en,
  } as NotaInterna;
}

function mapCondicionSalud(r: RowCondicionesSalud): CondicionSalud {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    categoria: r.categoria,
    etiqueta: r.etiqueta,
    zona: r.zona,
    restricciones: r.restricciones ?? [],
    severidad: r.severidad,
    estado: r.estado,
    inicio: r.inicio,
    fin: r.fin,
    revisarEn: r.revisar_en,
    notas: r.notas,
    creadoPor: r.creado_por,
    creadoEn: r.creado_en,
    actualizadoEn: r.actualizado_en,
  } as CondicionSalud;
}

function mapRespuestaSesion(r: RowRespuestasSesion): RespuestaSesionRow {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    sesionId: r.sesion_id,
    respuesta: r.respuesta,
    nota: r.nota,
    creadoPor: r.creado_por,
    creadoEn: r.creado_en,
  } as RespuestaSesionRow;
}

// ─── Fetch all studio data in parallel ───────────────────────────────────────

// ── Carga en dos olas (Fase C: lazy-load) ────────────────────────────────────
// El arranque no debe bloquearse esperando tablas de historial/logs que crecen
// sin límite y solo se muestran (ninguna lógica de negocio las lee). Se dividen:
//   · fetchCriticalStudioData(): todo lo necesario para pintar y operar.
//   · fetchDeferredStudioData(): historial/logs, cargado en una 2ª ola.
// fetchAllStudioData() combina ambas (lo usa el cron, que sí necesita todo).

export async function fetchCriticalStudioData(studioId?: string) {
  const sid = studioId ?? STUDIO_ID;
  const [
    studioRes,
    usuariosRes,
    sociosRes,
    planesTarifaRes,
    suscripcionesRes,
    salasRes,
    spotsRes,
    tiposClaseRes,
    instructoresRes,
    sesionesRes,
    reservasRes,
    recibosRes,
    facturasRes,
    citasRes,
    productosPOSRes,
    ventasPOSRes,
    campanasRes,
    automatizacionesRes,
    automationRulesRes,
    automationLogsRes,
    codigosDescuentoRes,
    actividadRecienteRes,
    notificacionesRes,
    videosOnDemandRes,
    postsComunidadRes,
    notasInternasRes,
    condicionesSaludRes,
    respuestasSesionRes,
    integracionesRes,
    mensajesEquipoRes,
    preferenciasSocioRes,
    rewardRulesRes,
    rewardActionsRes,
    memberCreditsRes,
    rewardCatalogRes,
    rewardRedemptionsRes,
    achievementDefinitionsRes,
    achievementProgressRes,
    levelDefinitionsRes,
    challengeDefinitionsRes,
    challengeProgressRes,
    dashboardChartsRes,
  ] = await Promise.all([
    supabase.from('studios').select('*').eq('id', sid).single(),
    supabase.from('usuarios').select('*').eq('studio_id', sid),
    supabase.from('socios').select('*').eq('studio_id', sid),
    supabase.from('planes_tarifa').select('*').eq('studio_id', sid),
    supabase.from('suscripciones').select('*').eq('studio_id', sid),
    supabase.from('salas').select('*').eq('studio_id', sid),
    supabase.from('spots').select('*').eq('studio_id', sid),
    supabase.from('tipos_clase').select('*').eq('studio_id', sid),
    supabase.from('instructores').select('*').eq('studio_id', sid),
    supabase.from('sesiones').select('*').eq('studio_id', sid),
    supabase.from('reservas').select('*').eq('studio_id', sid),
    supabase.from('recibos').select('*').eq('studio_id', sid),
    supabase.from('facturas').select('*').eq('studio_id', sid),
    supabase.from('citas').select('*').eq('studio_id', sid),
    supabase.from('productos_pos').select('*').eq('studio_id', sid),
    supabase.from('ventas_pos').select('*').eq('studio_id', sid),
    supabase.from('campanas').select('*').eq('studio_id', sid),
    supabase.from('automatizaciones').select('*').eq('studio_id', sid),
    supabase.from('automation_rules').select('*').eq('studio_id', sid),
    // automation_logs: ordenado newest-first, SIN límite. El motor de
    // automatizaciones (automation-engine) lo usa como índice de dedup para no
    // re-accionar a una socia ya accionada; acotarlo reintroduciría cobros/
    // emails duplicados. Su bounding real necesita dedup por query (follow-up).
    supabase.from('automation_logs').select('*').eq('studio_id', sid).order('ejecutado_en', { ascending: false }),
    supabase.from('codigos_descuento').select('*').eq('studio_id', sid),
    // Feeds de solo-display: ventana reciente ordenada. Seguro acotar — ningún
    // consumidor agrega sobre el histórico completo (ver P0-2/9).
    supabase.from('actividad_reciente').select('*').eq('studio_id', sid).order('creado_en', { ascending: false }).limit(RECENT_FEED_LIMIT),
    supabase.from('notificaciones').select('*').eq('studio_id', sid).order('creada_en', { ascending: false }).limit(RECENT_FEED_LIMIT),
    supabase.from('videos_on_demand').select('*').eq('studio_id', sid),
    supabase.from('posts_comunidad').select('*').eq('studio_id', sid),
    supabase.from('notas_internas').select('*').eq('studio_id', sid),
    supabase.from('condiciones_salud').select('*').eq('studio_id', sid),
    supabase.from('respuestas_sesion').select('*').eq('studio_id', sid),
    supabase.from('integraciones').select('*').eq('studio_id', sid),
    supabase.from('mensajes_equipo').select('*').eq('studio_id', sid),
    supabase.from('preferencias_socio').select('*').eq('studio_id', sid),
    supabase.from('reward_rules').select('*').eq('studio_id', sid),
    supabase.from('reward_actions').select('*').eq('studio_id', sid),
    supabase.from('member_credits').select('*').eq('studio_id', sid),
    supabase.from('reward_catalog').select('*').eq('studio_id', sid),
    supabase.from('reward_redemptions').select('*').eq('studio_id', sid),
    supabase.from('achievement_definitions').select('*').eq('studio_id', sid),
    supabase.from('achievement_progress').select('*').eq('studio_id', sid),
    supabase.from('level_definitions').select('*').eq('studio_id', sid),
    supabase.from('challenge_definitions').select('*').eq('studio_id', sid),
    supabase.from('challenge_progress').select('*').eq('studio_id', sid),
    supabase.from('dashboard_charts').select('*').eq('studio_id', sid),
  ]);

  return {
    studio: studioRes.data ? mapStudio(studioRes.data) : null,
    usuarios: (usuariosRes.data ?? []).map(mapUsuario),
    socios: (sociosRes.data ?? []).map(mapSocio),
    planesTarifa: (planesTarifaRes.data ?? []).map(mapPlanTarifa),
    suscripciones: (suscripcionesRes.data ?? []).map(mapSuscripcion),
    salas: (salasRes.data ?? []).map(mapSala),
    spots: (spotsRes.data ?? []).map(mapSpot),
    tiposClase: (tiposClaseRes.data ?? []).map(mapTipoClase),
    instructores: (instructoresRes.data ?? []).map(mapInstructor),
    sesiones: (sesionesRes.data ?? []).map(mapSesion),
    reservas: (reservasRes.data ?? []).map(mapReserva),
    recibos: (recibosRes.data ?? []).map(mapRecibo),
    facturas: (facturasRes.data ?? []).map(mapFactura),
    citas: (citasRes.data ?? []).map(mapCita),
    productosPOS: (productosPOSRes.data ?? []).map(mapProductoPOS),
    ventasPOS: (ventasPOSRes.data ?? []).map(mapVentaPOS),
    campanas: (campanasRes.data ?? []).map(mapCampana),
    automatizaciones: (automatizacionesRes.data ?? []).map(mapAutomatizacion),
    automationRules: (automationRulesRes.data ?? []).map(mapAutomationRule),
    automationLogs: (automationLogsRes.data ?? []).map(mapAutomationLog),
    codigosDescuento: (codigosDescuentoRes.data ?? []).map(mapCodigoDescuento),
    actividadReciente: (actividadRecienteRes.data ?? []).map(mapActividadReciente),
    notificaciones: (notificacionesRes.data ?? []).map(mapNotificacion),
    videosOnDemand: (videosOnDemandRes.data ?? []).map(mapVideoOnDemand),
    postsComunidad: (postsComunidadRes.data ?? []).map(mapPostComunidad),
    notasInternas: (notasInternasRes.data ?? []).map(mapNotaInterna),
    condicionesSalud: (condicionesSaludRes.data ?? []).map(mapCondicionSalud),
    respuestasSesion: (respuestasSesionRes.data ?? []).map(mapRespuestaSesion),
    integraciones: (integracionesRes.data ?? []).map(mapIntegracion),
    mensajesEquipo: (mensajesEquipoRes.data ?? []).map(mapMensajeEquipo),
    preferenciasSocio: (preferenciasSocioRes.data ?? []).map(mapPreferenciasSocio),
    rewardRules: (rewardRulesRes.data ?? []).map(mapRewardRule),
    rewardActions: (rewardActionsRes.data ?? []).map(mapRewardAction),
    memberCredits: (memberCreditsRes.data ?? []).map(mapMemberCredits),
    rewardCatalog: (rewardCatalogRes.data ?? []).map(mapRewardCatalogItem),
    rewardRedemptions: (rewardRedemptionsRes.data ?? []).map(mapRewardRedemption),
    achievementDefinitions: (achievementDefinitionsRes.data ?? []).map(mapAchievementDefinition),
    achievementProgress: (achievementProgressRes.data ?? []).map(mapAchievementProgress),
    levelDefinitions: (levelDefinitionsRes.data ?? []).map(mapLevelDefinition),
    challengeDefinitions: (challengeDefinitionsRes.data ?? []).map(mapChallengeDefinition),
    challengeProgress: (challengeProgressRes.data ?? []).map(mapChallengeProgress),
    dashboardCharts: (dashboardChartsRes.data ?? []).map(mapDashboardChart),
  };
}

export async function fetchDeferredStudioData(studioId?: string) {
  const sid = studioId ?? STUDIO_ID;
  const [
    rewardHistoryRes,
    creditTransactionsRes,
    achievementHistoryRes,
    challengeHistoryRes,
    notasProgresoRes,
    backupsRes,
  ] = await Promise.all([
    supabase.from('reward_history').select('*').eq('studio_id', sid),
    supabase.from('credit_transactions').select('*').eq('studio_id', sid),
    supabase.from('achievement_history').select('*').eq('studio_id', sid),
    supabase.from('challenge_history').select('*').eq('studio_id', sid),
    supabase.from('notas_progreso').select('*').eq('studio_id', sid),
    supabase.from('backups').select('id, studio_id, tipo, creado_en').eq('studio_id', sid).order('creado_en', { ascending: false }),
  ]);

  return {
    rewardHistory: (rewardHistoryRes.data ?? []).map(mapRewardHistory),
    creditTransactions: (creditTransactionsRes.data ?? []).map(mapCreditTransaction),
    achievementHistory: (achievementHistoryRes.data ?? []).map(mapAchievementHistory),
    challengeHistory: (challengeHistoryRes.data ?? []).map(mapChallengeHistory),
    notasProgreso: (notasProgresoRes.data ?? []).map(mapNotaProgreso),
    // La query de backups usa un select estrecho (excluye la columna 'datos'
    // pesada); afirmamos la fila para el mapper.
    backups: (backupsRes.data ?? []).map(r => mapBackupMeta(r as RowBackups)),
  };
}

// Combina ambas olas. Lo usa el cron de automatizaciones, que necesita todo.
export async function fetchAllStudioData(studioId?: string) {
  const [critical, deferred] = await Promise.all([
    fetchCriticalStudioData(studioId),
    fetchDeferredStudioData(studioId),
  ]);
  return { ...critical, ...deferred };
}

// ─── Acceso público scopeado (proxy de servidor, service-role) ───────────────
// Reemplaza el acceso anónimo directo de las páginas públicas (reserva/portal/
// kiosk). Devuelve SOLO el catálogo público del estudio y, si se pasa una socia
// validada por email, los datos de ESA socia — nunca la PII de las demás.
// Se ejecuta en el servidor (usa la Service Role Key); NO importar en cliente.

// Campos del estudio seguros para exponer públicamente (nada de NIF/razón
// social/owner). El resto de la ficha fiscal no sale de aquí.
function studioPublico(r: RowStudios) {
  return {
    id: r.id,
    nombre: r.nombre,
    ciudad: r.ciudad,
    direccion: r.direccion,
    email: r.email,
    telefono: r.telefono,
    colorPrimario: r.color_primario,
    plan: r.plan,
    avatarAdmin: r.avatar_admin ?? null,
    slug: r.slug ?? null,
    // Política pública que la página de reservas necesita para avisar a la socia
    // (ventana de cancelación) y hacer el pre-check de derechos/límite.
    cancelacionVentanaHoras: r.cancelacion_ventana_horas ?? 12,
    cancelacionDevolverBonoTardia: r.cancelacion_devolver_bono_tardia ?? false,
    reservaExigirPlan: r.reserva_exigir_plan ?? false,
    reservaMaxSimultaneas: r.reserva_max_simultaneas ?? null,
  };
}

export type PublicStudioData = Awaited<ReturnType<typeof fetchPublicStudioData>>;

export async function fetchPublicStudioData(
  slug: string,
  member?: { socioId: string; email: string },
) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada (SUPABASE_SERVICE_ROLE_KEY)');

  const { data: studioRow } = await admin
    .from('studios').select('*').eq('slug', slug).maybeSingle();
  if (!studioRow) return null;
  const studioId: string = studioRow.id;

  // Catálogo público (nada de PII): clases, horarios, salas, instructoras,
  // planes, spots, vídeos y la configuración de gamificación (niveles, logros,
  // retos, recompensas y sus reglas) — el portal la necesita para pintar.
  const [
    sesionesRes, tiposClaseRes, salasRes, instructoresRes, spotsRes, planesRes, videosRes,
    rewardRulesRes, rewardCatalogRes, levelDefsRes, achDefsRes, chalDefsRes,
  ] = await Promise.all([
    admin.from('sesiones').select('*').eq('studio_id', studioId),
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
  ]);

  // Aforo: para pintar plazas libres se necesita el conteo de reservas por
  // sesión, pero SIN exponer quién reservó. Devolvemos id/sesion/estado y el
  // spot ocupado (para pintar el mapa de sitios; el spot no identifica a nadie).
  const { data: reservasAforo } = await admin
    .from('reservas').select('id, sesion_id, estado, spot_id').eq('studio_id', studioId);

  const base = {
    studio: studioPublico(studioRow as RowStudios),
    sesiones: (sesionesRes.data ?? []).map(mapSesion),
    tiposClase: (tiposClaseRes.data ?? []).map(mapTipoClase),
    salas: (salasRes.data ?? []).map(mapSala),
    instructores: (instructoresRes.data ?? []).map(mapInstructor),
    spots: (spotsRes.data ?? []).map(mapSpot),
    planesTarifa: (planesRes.data ?? []).map(mapPlanTarifa),
    videosOnDemand: (videosRes.data ?? []).map(mapVideoOnDemand),
    rewardRules: (rewardRulesRes.data ?? []).map(mapRewardRule),
    rewardCatalog: (rewardCatalogRes.data ?? []).map(mapRewardCatalogItem),
    levelDefinitions: (levelDefsRes.data ?? []).map(mapLevelDefinition),
    achievementDefinitions: (achDefsRes.data ?? []).map(mapAchievementDefinition),
    challengeDefinitions: (chalDefsRes.data ?? []).map(mapChallengeDefinition),
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
  const [susRes, resRes, recRes, facRes, prefRes, credRes, histRes, redRes, achProgRes, chalProgRes, txRes] =
    await Promise.all([
      admin.from('suscripciones').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('reservas').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('recibos').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('facturas').select('*').eq('studio_id', studioId),
      admin.from('preferencias_socio').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('member_credits').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('reward_history').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('reward_redemptions').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('achievement_progress').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('challenge_progress').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('credit_transactions').select('*').eq('studio_id', studioId).eq('socio_id', sid),
    ]);

  // Facturas de recibos de la socia (facturas no tiene socio_id directo).
  const misRecibos = (recRes.data ?? []).map(mapRecibo);
  const misReciboIds = new Set(misRecibos.map(r => r.id));

  return {
    ...base,
    socia: {
      socio: mapSocio(socioRow as RowSocios),
      suscripciones: (susRes.data ?? []).map(mapSuscripcion),
      reservas: (resRes.data ?? []).map(mapReserva),
      recibos: misRecibos,
      facturas: (facRes.data ?? []).map(mapFactura).filter(f => f.reciboId && misReciboIds.has(f.reciboId)),
      preferenciasSocio: (prefRes.data ?? []).map(mapPreferenciasSocio),
      memberCredits: (credRes.data ?? []).map(mapMemberCredits),
      rewardHistory: (histRes.data ?? []).map(mapRewardHistory),
      rewardRedemptions: (redRes.data ?? []).map(mapRewardRedemption),
      achievementProgress: (achProgRes.data ?? []).map(mapAchievementProgress),
      challengeProgress: (chalProgRes.data ?? []).map(mapChallengeProgress),
      creditTransactions: (txRes.data ?? []).map(mapCreditTransaction),
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
async function consumirBonoServidor(admin: SupabaseClient, studioId: string, socioId: string): Promise<boolean> {
  const [{ data: susRows }, { data: planRows }] = await Promise.all([
    admin.from('suscripciones').select('*').eq('studio_id', studioId).eq('socio_id', socioId),
    admin.from('planes_tarifa').select('*').eq('studio_id', studioId),
  ]);
  const suscripciones = (susRows ?? []).map(mapSuscripcion);
  const planes = (planRows ?? []).map(mapPlanTarifa);
  const consumible = bonoConsumible(socioId, suscripciones, planes);
  if (!consumible) return false;
  const { suscripcion: sus, plan, sesionesRestantes } = consumible;
  const { nuevasRestantes, agotado } = calcularConsumoBono(sesionesRestantes);
  await admin.from('suscripciones').update({ sesiones_restantes: nuevasRestantes }).eq('id', sus.id);
  if (agotado) {
    const hoy = new Date().toISOString().slice(0, 10);
    await admin.from('recibos').insert({
      id: `rec-renov-${uid()}`, studio_id: studioId, socio_id: socioId, suscripcion_id: sus.id,
      concepto: `Renovación ${plan.nombre}`, importe: plan.precio, estado: 'PENDIENTE',
      fecha_vencimiento: hoy, fecha_cobro: null, fecha_devolucion: null, intentos_reintento: 0,
    });
  }
  return true;
}

async function devolverBonoServidor(admin: SupabaseClient, studioId: string, socioId: string) {
  const [{ data: susRows }, { data: planRows }] = await Promise.all([
    admin.from('suscripciones').select('*').eq('studio_id', studioId).eq('socio_id', socioId),
    admin.from('planes_tarifa').select('*').eq('studio_id', studioId),
  ]);
  const consumible = bonoConsumible(socioId, (susRows ?? []).map(mapSuscripcion), (planRows ?? []).map(mapPlanTarifa));
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
  });
}

// Recordatorios de revisión de ficha clínica (FICHA-CLINICA.md §10). Recorre las
// condiciones activas de todos los estudios; para las que necesitan revisión
// (regla pura `recordatoriosRevision`) crea un aviso en `notificaciones`. Dedup:
// no re-avisa la misma condición si ya hay un aviso suyo en los últimos 30 días
// (marca en el enlace `?rev=<condicionId>`). Lo dispara /api/cron/revisiones-salud.
export async function generarRecordatoriosRevision(nowISO: string, umbralDias = 90) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const hoy = new Date(nowISO);

  const { data: condsRaw, error } = await admin
    .from('condiciones_salud').select('*').eq('estado', 'ACTIVA');
  if (error) throw new Error(error.message);
  const condiciones = (condsRaw ?? []).map(r => mapCondicionSalud(r as RowCondicionesSalud));

  const recordatorios = recordatoriosRevision(condiciones, hoy, umbralDias);
  if (recordatorios.length === 0) {
    return { condicionesActivas: condiciones.length, recordatorios: 0, notificacionesCreadas: 0 };
  }

  // Dedup: enlaces de avisos de revisión creados en los últimos 30 días.
  const cutoff = new Date(hoy.getTime() - 30 * 86_400_000).toISOString();
  const { data: notis } = await admin
    .from('notificaciones').select('enlace').gt('creada_en', cutoff).like('enlace', '%?rev=%');
  const yaAvisado = new Set((notis ?? []).map(n => n.enlace as string));

  // Nombres de las socias implicadas (en lotes para no exceder el filtro `in`).
  const socioIds = [...new Set(recordatorios.map(r => r.condicion.socioId))];
  const nombrePorSocio = new Map<string, string>();
  for (let i = 0; i < socioIds.length; i += 200) {
    const lote = socioIds.slice(i, i + 200);
    const { data: socias } = await admin.from('socios').select('id, nombre, apellidos').in('id', lote);
    for (const s of socias ?? []) nombrePorSocio.set(s.id as string, `${s.nombre} ${s.apellidos}`.trim());
  }

  const nuevas = recordatorios
    .map(r => {
      const enlace = `/socios/${r.condicion.socioId}?rev=${r.condicion.id}`;
      if (yaAvisado.has(enlace)) return null;
      const nombre = nombrePorSocio.get(r.condicion.socioId) ?? 'Una socia';
      return {
        id: `noti-${uid()}`,
        studio_id: r.condicion.studioId,
        titulo: 'Revisión de ficha de salud',
        texto: textoRecordatorioRevision(nombre, r),
        leida: false,
        tipo: 'AVISO',
        enlace,
        creada_en: nowISO,
      };
    })
    .filter((n): n is NonNullable<typeof n> => n !== null);

  if (nuevas.length > 0) {
    const { error: insErr } = await admin.from('notificaciones').insert(nuevas);
    if (insErr) throw new Error(insErr.message);
  }
  return { condicionesActivas: condiciones.length, recordatorios: recordatorios.length, notificacionesCreadas: nuevas.length };
}

// Barrido de no-shows: marca NO_ASISTIO toda reserva que siga CONFIRMADA en una
// sesión ya terminada (fin < ahora) y no cancelada. Sin esto, las reservas sin
// check-in se quedan CONFIRMADA para siempre y las métricas de ausencias mienten.
// Lo dispara un cron (ver /api/cron/no-shows). No toca bonos: la sesión ya se
// consumió al reservar; un no-show no se reembolsa (esa es la penalización).
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
export async function enviarRecordatoriosClasesProximas(desdeISO: string, hastaISO: string) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  const { data: sesiones, error } = await admin
    .from('sesiones')
    .select('id, studio_id')
    .eq('cancelada', false)
    .gte('inicio', desdeISO)
    .lt('inicio', hastaISO);
  if (error) throw new Error(error.message);

  let enviados = 0;
  let fallidos = 0;
  let sinEmail = 0;

  for (const ses of sesiones ?? []) {
    const datos = await datosClaseParaEmail(admin, ses.studio_id as string, ses.id as string);
    if (!datos) continue;
    const { data: reservas } = await admin
      .from('reservas')
      .select('socio_id')
      .eq('sesion_id', ses.id)
      .in('estado', ['CONFIRMADA', 'ASISTIDA']);
    for (const r of reservas ?? []) {
      const { data: socia } = await admin
        .from('socios').select('nombre, email').eq('id', r.socio_id).maybeSingle();
      if (!socia?.email) { sinEmail++; continue; }
      const res = await enviarEmailTransaccional({
        tipo: 'recordatorio', to: socia.email, toName: socia.nombre ?? 'Socia', data: datos,
      });
      if (res.ok) enviados++;
      else if ('error' in res) fallidos++;
    }
  }

  return { sesiones: (sesiones ?? []).length, enviados, fallidos, sinEmail };
}

// Lee la política de reservas/cancelaciones del estudio (con defaults sensatos
// si las columnas aún no existen o vienen nulas).
async function cargarPoliticaEstudio(admin: SupabaseClient, studioId: string) {
  const { data } = await admin
    .from('studios')
    .select('cancelacion_ventana_horas, cancelacion_devolver_bono_tardia, reserva_exigir_plan, reserva_max_simultaneas')
    .eq('id', studioId).maybeSingle();
  return {
    ventanaHoras: (data?.cancelacion_ventana_horas ?? 12) as number,
    devolverBonoTardia: (data?.cancelacion_devolver_bono_tardia ?? false) as boolean,
    exigirPlan: (data?.reserva_exigir_plan ?? false) as boolean,
    maxSimultaneas: (data?.reserva_max_simultaneas ?? null) as number | null,
  };
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
  {
    const { data: ses } = await admin
      .from('sesiones').select('inicio, cancelada').eq('id', params.sesionId).eq('studio_id', params.studioId).maybeSingle();
    if (!ses) return { error: 'Sesión no encontrada' as const };
    if (ses.cancelada) return { error: 'Esta clase está cancelada' as const };
    if (new Date(ses.inicio as string).getTime() <= Date.now()) {
      return { error: 'Esta clase ya ha empezado' as const };
    }
  }

  // Gate de derechos (C-4): autoritativo en servidor. Solo aplica a la reserva
  // self-service; el panel (recepción) puede añadir a cualquiera sin plan.
  const pol = await cargarPoliticaEstudio(admin, params.studioId);
  if (pol.exigirPlan || pol.maxSimultaneas != null) {
    const [{ data: susRows }, { data: planRows }, { data: resRows }, { data: sesRows }] = await Promise.all([
      admin.from('suscripciones').select('*').eq('studio_id', params.studioId).eq('socio_id', params.socioId),
      admin.from('planes_tarifa').select('*').eq('studio_id', params.studioId),
      admin.from('reservas').select('*').eq('studio_id', params.studioId).eq('socio_id', params.socioId),
      admin.from('sesiones').select('id, inicio').eq('studio_id', params.studioId),
    ]);
    const hoyISO = new Date().toISOString().slice(0, 10);
    if (pol.exigirPlan && !tieneEntitlementActivo(
      params.socioId, (susRows ?? []).map(mapSuscripcion), (planRows ?? []).map(mapPlanTarifa), hoyISO,
    )) {
      return { error: 'Necesitas un plan o bono activo para reservar' as const };
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
  const reservaId = `res-${uid()}`;
  const { data, error } = await admin.rpc('reservar_plaza', {
    p_studio_id: params.studioId, p_sesion_id: params.sesionId,
    p_socio_id: params.socioId, p_reserva_id: reservaId,
  });
  if (error) {
    if (error.message.includes('YA_RESERVADA')) return { error: 'Ya tienes una reserva en esta clase' as const };
    if (error.message.includes('SESION_NO_ENCONTRADA')) return { error: 'Sesión no encontrada' as const };
    return { error: error.message };
  }
  const row = Array.isArray(data) ? data[0] : data;
  const estado: string = row?.estado ?? 'CONFIRMADA';

  let spotAsignado: string | null = null;
  if (estado === 'CONFIRMADA') {
    await consumirBonoServidor(admin, params.studioId, params.socioId);
    // Sitio elegido por la socia (I-12): solo para reservas confirmadas (la
    // lista de espera no ocupa sitio). Se valida y asigna con guard atómico.
    if (params.spotId) {
      spotAsignado = await asignarSpotReserva(admin, params.studioId, params.sesionId, reservaId, params.spotId);
    }
  }
  return { ok: true as const, estado, reservaId, spotAsignado };
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

// Cancela una reserva de la socia, devuelve su bono y promueve la lista de espera.
export async function cancelarReservaPublica(params: {
  studioId: string; reservaId: string; socioId: string; email: string;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const socia = await validarSociaPublica(admin, params.studioId, params.socioId, params.email);
  if (!socia) return { error: 'No autorizado' as const };

  // Cancelación + promoción de la lista de espera, atómicas en la BD.
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
  const { data: cancelada } = await admin
    .from('reservas').select('sesion_id').eq('id', params.reservaId).maybeSingle();
  let bonoDevuelto = false;
  let tardia = false;
  if (row?.era_confirmada && cancelada?.sesion_id) {
    const pol = await cargarPoliticaEstudio(admin, params.studioId);
    const { data: ses } = await admin
      .from('sesiones').select('inicio').eq('id', cancelada.sesion_id).maybeSingle();
    const inicio = ses?.inicio as string | undefined;
    tardia = inicio ? esCancelacionTardia(inicio, new Date(), pol.ventanaHoras) : false;
    if (inicio && debeDevolverBono(inicio, new Date(), pol.ventanaHoras, pol.devolverBonoTardia)) {
      await devolverBonoServidor(admin, params.studioId, params.socioId);
      bonoDevuelto = true;
    }
  }

  if (row?.promovida_socio_id) {
    const promSocioId = row.promovida_socio_id as string;
    const bonoConsumido = await consumirBonoServidor(admin, params.studioId, promSocioId);
    // Avisar a la socia ascendida de que su plaza está confirmada (indicando si
    // se le ha consumido una sesión del bono — solo si realmente ocurrió).
    // Cierra la mentira "te avisaremos si se libera una plaza". No bloquea.
    if (cancelada?.sesion_id) {
      await notificarPromocionEspera(admin, params.studioId, promSocioId, cancelada.sesion_id as string, bonoConsumido);
    }
  }
  // tardia/bonoDevuelto → la UI puede confirmar a la socia si recuperó la sesión.
  return { ok: true as const, tardia, bonoDevuelto };
}

// Login del portal: resuelve email → socia dentro del estudio (service-role).
// Sustituye la lectura anónima directa sobre socios en la página de login.
export async function resolverLoginSocia(slug: string, email: string) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const { data: studio } = await admin.from('studios').select('id').eq('slug', slug).maybeSingle();
  if (!studio) return null;
  const { data } = await admin
    .from('socios').select('id, nombre, apellidos, email')
    .ilike('email', email.trim()).eq('studio_id', studio.id).maybeSingle();
  if (!data) return null;
  return { socioId: data.id, nombre: `${data.nombre} ${data.apellidos}`.trim(), email: data.email };
}

// Resuelve la socia de un usuario autenticado con Supabase Auth (portal con
// magic link / OTP). A diferencia de resolverLoginSocia —que solo comprueba que
// el email exista, sin ninguna prueba de control—, aquí el usuario YA demostró
// que controla ese email al validar el JWT. Vincula la fila de la socia a su
// usuario de auth la primera vez (claim), igual que el equipo con instructores.
// Devuelve la misma forma que resolverLoginSocia para poder sustituirlo 1:1.
export async function resolverSociaAutenticada(slug: string, authUserId: string, email: string) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const { data: studio } = await admin.from('studios').select('id').eq('slug', slug).maybeSingle();
  if (!studio) return null;

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

// Registra una socia nueva desde el portal/reserva (alta pública). Valida que
// el estudio existe; el id lo genera el cliente (primera reserva).
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
  let referido: string | null = null;
  if (params.referidoPor && params.referidoPor !== params.id) {
    const { data } = await admin.from('socios').select('id').eq('id', params.referidoPor).eq('studio_id', params.studioId).maybeSingle();
    referido = data ? params.referidoPor : null;
  }

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
  const fila = {
    socio_id: params.socioId, studio_id: params.studioId,
    ...(existente ?? {}), ...params.cambios, actualizado_en: new Date().toISOString(),
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
  }
  return { ok: true as const };
}

// ─── Mappers: TS (camelCase) → DB (snake_case) ───────────────────────────────

function socioToDb(socio: Socio) {
  const {
    aceptacionContrato, studioId, fechaAlta, leadStage,
    stripeCustomerId, stripePaymentMethodId, fechaNacimiento, fotoUrl, referidoPor,
    ...rest
  } = socio;
  return {
    ...rest,
    studio_id: studioId ?? STUDIO_ID,
    fecha_alta: fechaAlta,
    lead_stage: leadStage ?? null,
    stripe_customer_id: stripeCustomerId ?? null,
    stripe_payment_method_id: stripePaymentMethodId ?? null,
    fecha_nacimiento: fechaNacimiento ?? null,
    foto_url: fotoUrl ?? null,
    referido_por: referidoPor ?? null,
    aceptacion_fecha: aceptacionContrato?.fecha ?? null,
    aceptacion_firma: aceptacionContrato?.firma ?? null,
    aceptacion_version: aceptacionContrato?.versionTexto ?? null,
  };
}

function planTarifaToDb(plan: PlanTarifa) {
  return {
    id: plan.id,
    studio_id: plan.studioId ?? STUDIO_ID,
    nombre: plan.nombre,
    descripcion: plan.descripcion ?? null,
    precio: plan.precio,
    tipo: plan.tipo,
    sesiones: plan.sesiones ?? null,
    activo: plan.activo,
  };
}

function suscripcionToDb(sus: Suscripcion) {
  return {
    id: sus.id,
    studio_id: sus.studioId ?? STUDIO_ID,
    socio_id: sus.socioId,
    plan_id: sus.planId,
    estado: sus.estado,
    fecha_inicio: sus.fechaInicio,
    fecha_fin: sus.fechaFin ?? null,
    sesiones_restantes: sus.sesionesRestantes ?? null,
    stripe_subscription_id: sus.stripeSubscriptionId ?? null,
  };
}

function sesionToDb(ses: Sesion) {
  return {
    id: ses.id,
    studio_id: ses.studioId ?? STUDIO_ID,
    tipo_clase_id: ses.tipoClaseId,
    sala_id: ses.salaId,
    instructor_id: ses.instructorId,
    inicio: ses.inicio,
    fin: ses.fin,
    aforo_maximo: ses.aforoMaximo,
    cancelada: ses.cancelada,
    notas: ses.notas ?? null,
    precio_puntual: ses.precioPuntual ?? null,
    serie_id: ses.serieId ?? null,
  };
}

function reservaToDb(res: Reserva) {
  return {
    id: res.id,
    studio_id: res.studioId ?? STUDIO_ID,
    sesion_id: res.sesionId,
    socio_id: res.socioId,
    estado: res.estado,
    spot_id: res.spotId ?? null,
    posicion_espera: res.posicionEspera ?? null,
    check_in_en: res.checkInEn ?? null,
    creado_en: res.creadoEn,
  };
}

function reciboToDb(rec: Recibo) {
  return {
    id: rec.id,
    studio_id: rec.studioId ?? STUDIO_ID,
    socio_id: rec.socioId,
    suscripcion_id: rec.suscripcionId ?? null,
    concepto: rec.concepto,
    importe: rec.importe,
    estado: rec.estado,
    fecha_vencimiento: rec.fechaVencimiento,
    fecha_cobro: rec.fechaCobro ?? null,
    fecha_devolucion: rec.fechaDevolucion ?? null,
    intentos_reintento: rec.intentosReintento,
  };
}

function facturaToDb(fac: Factura) {
  return {
    id: fac.id,
    studio_id: fac.studioId ?? STUDIO_ID,
    recibo_id: fac.reciboId,
    numero_completo: fac.numeroCompleto,
    fecha_emision: fac.fechaEmision,
    receptor_nombre: fac.receptorNombre,
    receptor_nif: fac.receptorNIF ?? null,
    base_imponible: fac.baseImponible,
    tipo_iva: fac.tipoIVA,
    cuota_iva: fac.cuotaIVA,
    total: fac.total,
    verifactu_hash: fac.verifactuHash ?? null,
    verifactu_prev_hash: fac.verifactuPrevHash ?? null,
    verifactu_ts: fac.verifactuTs ?? null,
    verifactu_seq: fac.verifactuSeq ?? null,
  };
}

function citaToDb(cita: Cita) {
  return {
    id: cita.id,
    studio_id: cita.studioId ?? STUDIO_ID,
    socio_id: cita.socioId,
    instructor_id: cita.instructorId,
    tipo: cita.tipo,
    inicio: cita.inicio,
    fin: cita.fin,
    notas: cita.notas ?? null,
    estado: cita.estado,
    precio: cita.precio ?? null,
    creado_en: cita.creadoEn,
  };
}

function ventaPOSToDb(venta: VentaPOS) {
  return {
    id: venta.id,
    studio_id: venta.studioId ?? STUDIO_ID,
    socio_id: venta.socioId ?? null,
    items: venta.items ?? [],
    subtotal: venta.subtotal,
    descuento: venta.descuento,
    total: venta.total,
    metodo_pago: venta.metodoPago,
    notas: venta.notas ?? null,
    realizada_en: venta.realizadaEn,
  };
}

function actividadRecienteToDb(act: ActividadReciente) {
  return {
    id: act.id,
    studio_id: act.studioId ?? STUDIO_ID,
    tipo: act.tipo,
    texto: act.texto,
    socio_id: act.socioId ?? null,
    enlace: act.enlace ?? null,
    creado_en: act.creadoEn,
    actor_nombre: act.actorNombre ?? null,
  };
}

function mensajeEquipoToDb(m: MensajeEquipo) {
  return {
    id: m.id,
    studio_id: m.studioId ?? STUDIO_ID,
    autor_instructor_id: m.autorInstructorId ?? null,
    autor_nombre: m.autorNombre,
    texto: m.texto,
    creado_en: m.creadoEn,
  };
}

function notaInternaToDb(nota: NotaInterna) {
  return {
    id: nota.id,
    studio_id: nota.studioId ?? STUDIO_ID,
    socio_id: nota.socioId,
    texto: nota.texto,
    tipo: nota.tipo,
    creado_en: nota.creadoEn,
  };
}

function condicionSaludToDb(c: CondicionSalud) {
  return {
    id: c.id,
    studio_id: c.studioId ?? STUDIO_ID,
    socio_id: c.socioId,
    categoria: c.categoria,
    etiqueta: c.etiqueta,
    zona: c.zona,
    restricciones: c.restricciones ?? [],
    severidad: c.severidad,
    estado: c.estado,
    inicio: c.inicio,
    fin: c.fin,
    revisar_en: c.revisarEn,
    notas: c.notas,
    creado_por: c.creadoPor,
    creado_en: c.creadoEn,
    actualizado_en: c.actualizadoEn,
  };
}

function respuestaSesionToDb(r: RespuestaSesionRow) {
  return {
    id: r.id,
    studio_id: r.studioId ?? STUDIO_ID,
    socio_id: r.socioId,
    sesion_id: r.sesionId,
    respuesta: r.respuesta,
    nota: r.nota,
    creado_por: r.creadoPor,
    creado_en: r.creadoEn,
  };
}

function codigoDescuentoToDb(c: CodigoDescuento) {
  return {
    id: c.id,
    studio_id: c.studioId ?? STUDIO_ID,
    codigo: c.codigo,
    descripcion: c.descripcion,
    tipo: c.tipo,
    valor: c.valor,
    usos: c.usos,
    usos_max: c.usosMax,
    expira: c.expira,
    activo: c.activo,
    creado_en: c.creadoEn,
  };
}

function notaProgresoToDb(n: NotaProgreso) {
  return {
    id: n.id,
    studio_id: n.studioId ?? STUDIO_ID,
    socio_id: n.socioId,
    instructor_id: n.instructorId,
    sesion_id: n.sesionId,
    texto_libre: n.textoLibre,
    progreso: n.progreso,
    alertas: n.alertas,
    plan_proxima_sesion: n.planProximaSesion,
    ejercicios_casa: n.ejerciciosCasa,
    creada_en: n.creadaEn,
  };
}

function campanaToDb(c: Campana) {
  return {
    id: c.id,
    studio_id: c.studioId ?? STUDIO_ID,
    nombre: c.nombre,
    tipo: c.tipo,
    asunto: c.asunto,
    contenido: c.contenido,
    estado: c.estado,
    destinatarios: c.destinatarios,
    enviados: c.enviados,
    abiertos: c.abiertos,
    clics: c.clics,
    creada_en: c.creadaEn,
    enviada_en: c.enviadaEn ?? null,
    programada_en: c.programadaEn ?? null,
  };
}

function automatizacionToDb(a: Automatizacion) {
  return {
    id: a.id,
    studio_id: a.studioId ?? STUDIO_ID,
    nombre: a.nombre,
    trigger: a.trigger,
    accion: a.accion,
    asunto: a.asunto ?? null,
    mensaje: a.mensaje,
    activa: a.activa,
    ejecutadas: a.ejecutadas,
    creada_en: a.creadaEn,
  };
}

function videoOnDemandToDb(v: VideoOnDemand) {
  return {
    id: v.id,
    studio_id: v.studioId ?? STUDIO_ID,
    titulo: v.titulo,
    descripcion: v.descripcion ?? null,
    categoria: v.categoria,
    duracion_minutos: v.duracionMinutos,
    nivel: v.nivel,
    instructor_id: v.instructorId,
    vistas: v.vistas,
    likes: v.likes,
    activo: v.activo,
    creado_en: v.creadoEn,
  };
}

function postComunidadToDb(p: PostComunidad) {
  return {
    id: p.id,
    studio_id: p.studioId ?? STUDIO_ID,
    autor_id: p.autorId ?? null,
    autor_nombre: p.autorNombre,
    autor_inicial: p.autorInicial,
    texto: p.texto,
    likes: p.likes,
    comentarios_count: p.comentariosCount,
    fijado: p.fijado,
    creado_en: p.creadoEn,
  };
}

// ─── Write functions (fire-and-forget, errors logged to console) ──────────────

export async function dbInsertSocio(socio: Socio) {
  const { error } = await supabase.from('socios').insert(socioToDb(socio));
  if (error) reportDbError('[dbInsertSocio]', error);
  return !error;
}

export async function dbUpdateSocio(id: string, changes: Partial<Socio>) {
  const db: Record<string, unknown> = {};
  if ('studioId' in changes) db.studio_id = changes.studioId;
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('apellidos' in changes) db.apellidos = changes.apellidos;
  if ('email' in changes) db.email = changes.email;
  if ('telefono' in changes) db.telefono = changes.telefono;
  if ('nif' in changes) db.nif = changes.nif;
  if ('fechaAlta' in changes) db.fecha_alta = changes.fechaAlta;
  if ('activo' in changes) db.activo = changes.activo;
  if ('leadStage' in changes) db.lead_stage = changes.leadStage;
  if ('tags' in changes) db.tags = changes.tags;
  if ('avatar' in changes) db.avatar = changes.avatar;
  if ('stripeCustomerId' in changes) db.stripe_customer_id = changes.stripeCustomerId;
  if ('stripePaymentMethodId' in changes) db.stripe_payment_method_id = changes.stripePaymentMethodId;
  if ('fechaNacimiento' in changes) db.fecha_nacimiento = changes.fechaNacimiento;
  if ('direccion' in changes) db.direccion = changes.direccion;
  if ('fotoUrl' in changes) db.foto_url = changes.fotoUrl;
  if ('referidoPor' in changes) db.referido_por = changes.referidoPor;
  if ('aceptacionContrato' in changes) {
    db.aceptacion_fecha = changes.aceptacionContrato?.fecha ?? null;
    db.aceptacion_firma = changes.aceptacionContrato?.firma ?? null;
    db.aceptacion_version = changes.aceptacionContrato?.versionTexto ?? null;
  }
  const { error } = await supabase.from('socios').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateSocio]', error);
}

export async function dbDeleteSocio(id: string) {
  const { error } = await supabase.from('socios').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteSocio]', error);
}

export async function dbInsertPlanTarifa(plan: PlanTarifa) {
  const { error } = await supabase.from('planes_tarifa').insert(planTarifaToDb(plan));
  if (error) reportDbError('[dbInsertPlanTarifa]', error);
}

export async function dbUpdatePlanTarifa(id: string, changes: Partial<PlanTarifa>) {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('descripcion' in changes) db.descripcion = changes.descripcion;
  if ('precio' in changes) db.precio = changes.precio;
  if ('tipo' in changes) db.tipo = changes.tipo;
  if ('sesiones' in changes) db.sesiones = changes.sesiones;
  if ('activo' in changes) db.activo = changes.activo;
  const { error } = await supabase.from('planes_tarifa').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdatePlanTarifa]', error);
}

export async function dbDeletePlanTarifa(id: string) {
  const { error } = await supabase.from('planes_tarifa').delete().eq('id', id);
  if (error) reportDbError('[dbDeletePlanTarifa]', error);
}

// ── Productos POS ──────────────────────────────────────────────────────────────
export async function dbInsertProductoPOS(prod: ProductoPOS) {
  const { error } = await supabase.from('productos_pos').insert({
    id: prod.id,
    studio_id: prod.studioId ?? STUDIO_ID,
    nombre: prod.nombre,
    categoria: prod.categoria,
    precio: prod.precio,
    activo: prod.activo,
  });
  if (error) reportDbError('[dbInsertProductoPOS]', error);
}
export async function dbUpdateProductoPOS(id: string, changes: Partial<ProductoPOS>) {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('categoria' in changes) db.categoria = changes.categoria;
  if ('precio' in changes) db.precio = changes.precio;
  if ('activo' in changes) db.activo = changes.activo;
  const { error } = await supabase.from('productos_pos').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateProductoPOS]', error);
}
export async function dbDeleteProductoPOS(id: string) {
  const { error } = await supabase.from('productos_pos').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteProductoPOS]', error);
}

export async function dbInsertSuscripcion(sus: Suscripcion) {
  const { error } = await supabase.from('suscripciones').insert(suscripcionToDb(sus));
  if (error) reportDbError('[dbInsertSuscripcion]', error);
}

export async function dbUpdateSuscripcion(id: string, changes: Partial<Suscripcion>) {
  const db: Record<string, unknown> = {};
  if ('socioId' in changes) db.socio_id = changes.socioId;
  if ('planId' in changes) db.plan_id = changes.planId;
  if ('estado' in changes) db.estado = changes.estado;
  if ('fechaInicio' in changes) db.fecha_inicio = changes.fechaInicio;
  if ('fechaFin' in changes) db.fecha_fin = changes.fechaFin;
  if ('sesionesRestantes' in changes) db.sesiones_restantes = changes.sesionesRestantes;
  if ('stripeSubscriptionId' in changes) db.stripe_subscription_id = changes.stripeSubscriptionId;
  const { error } = await supabase.from('suscripciones').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateSuscripcion]', error);
}

export async function dbInsertSesion(ses: Sesion) {
  const { error } = await supabase.from('sesiones').insert(sesionToDb(ses));
  if (error) reportDbError('[dbInsertSesion]', error);
}

// Inserta muchas sesiones en UNA sola llamada (creación de serie recurrente,
// I-3): sustituye a los N inserts secuenciales sin rollback ni aviso.
export async function dbInsertSesionesBatch(sesiones: Sesion[]) {
  if (sesiones.length === 0) return;
  const { error } = await supabase.from('sesiones').insert(sesiones.map(sesionToDb));
  if (error) reportDbError('[dbInsertSesionesBatch]', error);
}

// Aplica los mismos cambios a varias sesiones (editar/cancelar "esta y futuras"
// de una serie) en una sola llamada. Solo para cambios uniformes (no inicio/fin,
// que varían por sesión — esos se hacen por sesión).
export async function dbUpdateSesionesBatch(ids: string[], changes: Partial<Sesion>) {
  if (ids.length === 0) return;
  const db: Record<string, unknown> = {};
  if ('tipoClaseId' in changes) db.tipo_clase_id = changes.tipoClaseId;
  if ('salaId' in changes) db.sala_id = changes.salaId;
  if ('instructorId' in changes) db.instructor_id = changes.instructorId;
  if ('aforoMaximo' in changes) db.aforo_maximo = changes.aforoMaximo;
  if ('cancelada' in changes) db.cancelada = changes.cancelada;
  if ('notas' in changes) db.notas = changes.notas;
  if (Object.keys(db).length === 0) return;
  const { error } = await supabase.from('sesiones').update(db).in('id', ids);
  if (error) reportDbError('[dbUpdateSesionesBatch]', error);
}

export async function dbUpdateSesion(id: string, changes: Partial<Sesion>) {
  const db: Record<string, unknown> = {};
  if ('tipoClaseId' in changes) db.tipo_clase_id = changes.tipoClaseId;
  if ('salaId' in changes) db.sala_id = changes.salaId;
  if ('instructorId' in changes) db.instructor_id = changes.instructorId;
  if ('inicio' in changes) db.inicio = changes.inicio;
  if ('fin' in changes) db.fin = changes.fin;
  if ('aforoMaximo' in changes) db.aforo_maximo = changes.aforoMaximo;
  if ('cancelada' in changes) db.cancelada = changes.cancelada;
  if ('notas' in changes) db.notas = changes.notas;
  if ('precioPuntual' in changes) db.precio_puntual = changes.precioPuntual;
  if ('googleEventId' in changes) db.google_event_id = changes.googleEventId;
  if ('serieId' in changes) db.serie_id = changes.serieId;
  const { error } = await supabase.from('sesiones').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateSesion]', error);
}

export async function dbDeleteSesion(id: string) {
  const { error } = await supabase.from('sesiones').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteSesion]', error);
}

export async function dbInsertReserva(res: Reserva) {
  const { error } = await supabase.from('reservas').insert(reservaToDb(res));
  if (error) reportDbError('[dbInsertReserva]', error);
}

// Reserva ATÓMICA desde el panel (sesión autenticada de staff): la RPC decide
// aforo/lista de espera con bloqueo de fila y aísla por estudio. Sustituye al
// insert directo (read-decide-insert no atómico → sobreventa).
export async function dbReservarPlaza(
  studioId: string, sesionId: string, socioId: string, reservaId: string,
): Promise<{ estado: string; posicionEspera: number | null } | { error: string }> {
  const { data, error } = await supabase.rpc('reservar_plaza', {
    p_studio_id: studioId, p_sesion_id: sesionId, p_socio_id: socioId, p_reserva_id: reservaId,
  });
  if (error) { reportDbError('[dbReservarPlaza]', error); return { error: error.message }; }
  const row = Array.isArray(data) ? data[0] : data;
  return { estado: row?.estado ?? 'CONFIRMADA', posicionEspera: row?.posicion_espera ?? null };
}

// Cancelación + promoción de lista de espera ATÓMICAS desde el panel.
export async function dbCancelarReservaPlaza(
  studioId: string, reservaId: string,
): Promise<{ eraConfirmada: boolean; promovidaSocioId: string | null } | { error: string }> {
  const { data, error } = await supabase.rpc('cancelar_reserva_plaza', {
    p_studio_id: studioId, p_reserva_id: reservaId, p_socio_id: null,
  });
  if (error) { reportDbError('[dbCancelarReservaPlaza]', error); return { error: error.message }; }
  const row = Array.isArray(data) ? data[0] : data;
  return { eraConfirmada: !!row?.era_confirmada, promovidaSocioId: row?.promovida_socio_id ?? null };
}

export async function dbUpdateReserva(id: string, changes: Partial<Reserva>) {
  const db: Record<string, unknown> = {};
  if ('sesionId' in changes) db.sesion_id = changes.sesionId;
  if ('socioId' in changes) db.socio_id = changes.socioId;
  if ('estado' in changes) db.estado = changes.estado;
  if ('spotId' in changes) db.spot_id = changes.spotId;
  if ('posicionEspera' in changes) db.posicion_espera = changes.posicionEspera;
  if ('checkInEn' in changes) db.check_in_en = changes.checkInEn;
  const { error } = await supabase.from('reservas').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateReserva]', error);
}

export async function dbInsertRecibo(rec: Recibo) {
  const { error } = await supabase.from('recibos').insert(reciboToDb(rec));
  if (error) reportDbError('[dbInsertRecibo]', error);
}

export async function dbUpdateRecibo(id: string, changes: Partial<Recibo>) {
  const db: Record<string, unknown> = {};
  if ('socioId' in changes) db.socio_id = changes.socioId;
  if ('suscripcionId' in changes) db.suscripcion_id = changes.suscripcionId;
  if ('concepto' in changes) db.concepto = changes.concepto;
  if ('importe' in changes) db.importe = changes.importe;
  if ('estado' in changes) db.estado = changes.estado;
  if ('fechaVencimiento' in changes) db.fecha_vencimiento = changes.fechaVencimiento;
  if ('fechaCobro' in changes) db.fecha_cobro = changes.fechaCobro;
  if ('fechaDevolucion' in changes) db.fecha_devolucion = changes.fechaDevolucion;
  if ('intentosReintento' in changes) db.intentos_reintento = changes.intentosReintento;
  const { error } = await supabase.from('recibos').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateRecibo]', error);
}

export async function dbDeleteRecibo(id: string) {
  const { error } = await supabase.from('recibos').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteRecibo]', error);
}

// NOTA: las facturas se crean y sellan (huella Veri*Factu) en el servidor vía
// /api/facturas/sellar. No insertar facturas directamente desde el cliente: se
// saltaría la huella encadenada. facturaToDb se conserva para los backups.

export async function dbInsertCita(cita: Cita) {
  const { error } = await supabase.from('citas').insert(citaToDb(cita));
  if (error) reportDbError('[dbInsertCita]', error);
}

export async function dbUpdateCita(id: string, changes: Partial<Cita>) {
  const db: Record<string, unknown> = {};
  if ('socioId' in changes) db.socio_id = changes.socioId;
  if ('instructorId' in changes) db.instructor_id = changes.instructorId;
  if ('tipo' in changes) db.tipo = changes.tipo;
  if ('inicio' in changes) db.inicio = changes.inicio;
  if ('fin' in changes) db.fin = changes.fin;
  if ('notas' in changes) db.notas = changes.notas;
  if ('estado' in changes) db.estado = changes.estado;
  if ('precio' in changes) db.precio = changes.precio;
  const { error } = await supabase.from('citas').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateCita]', error);
}

export async function dbInsertVentaPOS(venta: VentaPOS) {
  const { error } = await supabase.from('ventas_pos').insert(ventaPOSToDb(venta));
  if (error) reportDbError('[dbInsertVentaPOS]', error);
}

export async function dbInsertActividadReciente(act: ActividadReciente) {
  const { error } = await supabase.from('actividad_reciente').insert(actividadRecienteToDb(act));
  if (error) reportDbError('[dbInsertActividadReciente]', error);
}

export async function dbInsertMensajeEquipo(m: MensajeEquipo) {
  const { error } = await supabase.from('mensajes_equipo').insert(mensajeEquipoToDb(m));
  if (error) reportDbError('[dbInsertMensajeEquipo]', error);
}

export async function dbUpsertPreferenciasSocio(p: PreferenciasSocio) {
  const row = {
    socio_id: p.socioId,
    studio_id: p.studioId ?? STUDIO_ID,
    disponibilidad: p.disponibilidad,
    instructor_favorito_id: p.instructorFavoritoId ?? null,
    tipo_clase_favorita: p.tipoClaseFavorita ?? null,
    duracion_preferida: p.duracionPreferida ?? null,
    nivel: p.nivel ?? null,
    notif_email: p.notifEmail,
    notif_whatsapp: p.notifWhatsapp,
    actualizado_en: new Date().toISOString(),
  };
  const { error } = await supabase.from('preferencias_socio').upsert(row, { onConflict: 'socio_id' });
  if (error) reportDbError('[dbUpsertPreferenciasSocio]', error);
}

// ─── Gamificación: créditos y recompensas ────────────────────────────────────

export async function dbInsertRewardRule(r: RewardRule) {
  const row = {
    id: r.id, studio_id: r.studioId ?? STUDIO_ID, trigger: r.trigger, nombre: r.nombre,
    descripcion: r.descripcion ?? null, creditos: r.creditos, activa: r.activa,
    tope_mensual: r.topeMensual ?? null, creado_en: r.creadoEn,
  };
  const { error } = await supabase.from('reward_rules').insert(row);
  if (error) reportDbError('[dbInsertRewardRule]', error);
}

export async function dbUpdateRewardRule(id: string, changes: Partial<RewardRule>) {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('descripcion' in changes) db.descripcion = changes.descripcion;
  if ('creditos' in changes) db.creditos = changes.creditos;
  if ('activa' in changes) db.activa = changes.activa;
  if ('topeMensual' in changes) db.tope_mensual = changes.topeMensual;
  const { error } = await supabase.from('reward_rules').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateRewardRule]', error);
}

export async function dbInsertRewardAction(a: RewardAction) {
  const row = {
    id: a.id, studio_id: a.studioId ?? STUDIO_ID, socio_id: a.socioId, trigger: a.trigger,
    ref_id: a.refId ?? null, creado_en: a.creadoEn,
  };
  const { error } = await supabase.from('reward_actions').insert(row);
  if (error) reportDbError('[dbInsertRewardAction]', error);
  return !error;
}

// C-11: cerrojo de idempotencia para concesiones de crédito que NO tienen una
// RewardRule detrás (logros y retos). Inserta una fila-guard en reward_actions;
// el UNIQUE(studio_id, trigger, ref_id) hace que solo la PRIMERA evaluación gane.
// Devuelve true si ganó el claim (primera vez → otorgar crédito), false si ya
// existía o hubo error (→ NO otorgar; el lado seguro es no doblar el saldo).
// Usar trigger sintético ('LOGRO'/'RETO') y refId = `${socioId}:${defId}` para
// que sea único por (socia, logro/reto) y no por logro/reto a secas.
export async function dbClaimRecompensaUnica(
  studioId: string, socioId: string, trigger: string, refId: string,
): Promise<boolean> {
  const { error } = await supabase.from('reward_actions').insert({
    id: `rwa-${uid()}`, studio_id: studioId, socio_id: socioId, trigger, ref_id: refId,
    creado_en: new Date().toISOString(),
  });
  return !error;
}

export async function dbInsertRewardHistory(h: RewardHistory) {
  const row = {
    id: h.id, studio_id: h.studioId ?? STUDIO_ID, socio_id: h.socioId, rule_id: h.ruleId,
    action_id: h.actionId, creditos: h.creditos, descripcion: h.descripcion, creado_en: h.creadoEn,
  };
  const { error } = await supabase.from('reward_history').insert(row);
  if (error) reportDbError('[dbInsertRewardHistory]', error);
}

export async function dbInsertCreditTransaction(t: CreditTransaction) {
  const row = {
    id: t.id, studio_id: t.studioId ?? STUDIO_ID, socio_id: t.socioId, tipo: t.tipo,
    creditos: t.creditos, descripcion: t.descripcion, ref_id: t.refId ?? null, creado_en: t.creadoEn,
  };
  const { error } = await supabase.from('credit_transactions').insert(row);
  if (error) reportDbError('[dbInsertCreditTransaction]', error);
}

export async function dbUpsertMemberCredits(m: MemberCredits) {
  const row = {
    socio_id: m.socioId, studio_id: m.studioId ?? STUDIO_ID, saldo: m.saldo,
    total_ganado: m.totalGanado, total_canjeado: m.totalCanjeado, actualizado_en: new Date().toISOString(),
  };
  const { error } = await supabase.from('member_credits').upsert(row, { onConflict: 'socio_id' });
  if (error) reportDbError('[dbUpsertMemberCredits]', error);
}

// P0-20: ajuste ATÓMICO del saldo por deltas (incremento en la BD, no
// leer-calcular-sobrescribir). deltaSaldo/Ganado/Canjeado: p. ej. una ganancia de
// 5 → (+5, +5, 0); un canje de 3 → (-3, 0, +3). Devuelve el nuevo saldo o error
// (SALDO_INSUFICIENTE si quedaría negativo).
export async function dbAjustarCreditos(
  socioId: string, studioId: string, deltaSaldo: number, deltaGanado: number, deltaCanjeado: number,
): Promise<{ ok: true; saldo: number } | { error: string }> {
  const { data, error } = await supabase.rpc('ajustar_creditos', {
    p_socio_id: socioId, p_studio_id: studioId,
    p_delta_saldo: deltaSaldo, p_delta_ganado: deltaGanado, p_delta_canjeado: deltaCanjeado,
  });
  if (error) {
    if (error.message.includes('SALDO_INSUFICIENTE')) return { error: 'Saldo insuficiente' };
    reportDbError('[dbAjustarCreditos]', error);
    return { error: error.message };
  }
  return { ok: true, saldo: data as number };
}

// A-13: ajuste ATÓMICO del stock de una recompensa (delta -1 reservar / +1
// devolver) vía la RPC ajustar_stock. Con el cliente autenticado del panel; el
// aislamiento por estudio lo aplica la propia función. Devuelve error 'SIN_STOCK'
// si el decremento dejaría el stock por debajo de 0.
export async function dbAjustarStock(
  itemId: string, studioId: string, delta: number,
): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.rpc('ajustar_stock', {
    p_item_id: itemId, p_studio_id: studioId, p_delta: delta,
  });
  if (error) {
    if (error.message.includes('SIN_STOCK')) return { error: 'SIN_STOCK' };
    reportDbError('[dbAjustarStock]', error);
    return { error: error.message };
  }
  return { ok: true };
}

export async function dbInsertRewardCatalogItem(c: RewardCatalogItem) {
  const row = {
    id: c.id, studio_id: c.studioId ?? STUDIO_ID, nombre: c.nombre, descripcion: c.descripcion ?? null,
    coste_creditos: c.costeCreditos, icono: c.icono, activo: c.activo, stock: c.stock ?? null, creado_en: c.creadoEn,
  };
  const { error } = await supabase.from('reward_catalog').insert(row);
  if (error) reportDbError('[dbInsertRewardCatalogItem]', error);
}

export async function dbUpdateRewardCatalogItem(id: string, changes: Partial<RewardCatalogItem>) {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('descripcion' in changes) db.descripcion = changes.descripcion;
  if ('costeCreditos' in changes) db.coste_creditos = changes.costeCreditos;
  if ('icono' in changes) db.icono = changes.icono;
  if ('activo' in changes) db.activo = changes.activo;
  if ('stock' in changes) db.stock = changes.stock;
  const { error } = await supabase.from('reward_catalog').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateRewardCatalogItem]', error);
}

export async function dbDeleteRewardCatalogItem(id: string) {
  const { error } = await supabase.from('reward_catalog').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteRewardCatalogItem]', error);
}

export async function dbInsertRewardRedemption(r: RewardRedemption) {
  const row = {
    id: r.id, studio_id: r.studioId ?? STUDIO_ID, socio_id: r.socioId, catalog_item_id: r.catalogItemId,
    creditos_gastados: r.creditosGastados, estado: r.estado, creado_en: r.creadoEn,
  };
  const { error } = await supabase.from('reward_redemptions').insert(row);
  if (error) reportDbError('[dbInsertRewardRedemption]', error);
}

export async function dbUpdateRewardRedemption(id: string, changes: Partial<RewardRedemption>) {
  const db: Record<string, unknown> = {};
  if ('estado' in changes) db.estado = changes.estado;
  const { error } = await supabase.from('reward_redemptions').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateRewardRedemption]', error);
}

// ─── Gamificación: logros ─────────────────────────────────────────────────────

export async function dbInsertAchievementDefinition(a: AchievementDefinition) {
  const row = {
    id: a.id, studio_id: a.studioId ?? STUDIO_ID, metric: a.metric, nombre: a.nombre,
    descripcion: a.descripcion ?? null, umbral: a.umbral, icono: a.icono,
    creditos_recompensa: a.creditosRecompensa, activo: a.activo, creado_en: a.creadoEn,
  };
  const { error } = await supabase.from('achievement_definitions').insert(row);
  if (error) reportDbError('[dbInsertAchievementDefinition]', error);
}

export async function dbUpdateAchievementDefinition(id: string, changes: Partial<AchievementDefinition>) {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('descripcion' in changes) db.descripcion = changes.descripcion;
  if ('umbral' in changes) db.umbral = changes.umbral;
  if ('icono' in changes) db.icono = changes.icono;
  if ('creditosRecompensa' in changes) db.creditos_recompensa = changes.creditosRecompensa;
  if ('activo' in changes) db.activo = changes.activo;
  const { error } = await supabase.from('achievement_definitions').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateAchievementDefinition]', error);
}

export async function dbUpsertAchievementProgress(p: AchievementProgress) {
  const row = {
    id: p.id, studio_id: p.studioId ?? STUDIO_ID, socio_id: p.socioId, achievement_id: p.achievementId,
    progreso_actual: p.progresoActual, completado: p.completado, completado_en: p.completadoEn ?? null,
  };
  const { error } = await supabase.from('achievement_progress').upsert(row, { onConflict: 'socio_id,achievement_id' });
  if (error) reportDbError('[dbUpsertAchievementProgress]', error);
}

export async function dbInsertAchievementHistory(h: AchievementHistory) {
  const row = {
    id: h.id, studio_id: h.studioId ?? STUDIO_ID, socio_id: h.socioId, achievement_id: h.achievementId,
    nombre: h.nombre, icono: h.icono, creado_en: h.creadoEn,
  };
  const { error } = await supabase.from('achievement_history').insert(row);
  if (error) reportDbError('[dbInsertAchievementHistory]', error);
}

// ─── Gamificación: niveles ─────────────────────────────────────────────────────

// ─── Soporte ──────────────────────────────────────────────────────────────────

export async function dbInsertSoporteSolicitud(s: { id: string; tipo: string; mensaje: string; contacto: string | null; creadoEn: string }) {
  const row = {
    id: s.id, studio_id: getCurrentStudioId(), tipo: s.tipo, mensaje: s.mensaje,
    contacto: s.contacto, creado_en: s.creadoEn,
  };
  const { error } = await supabase.from('soporte_solicitudes').insert(row);
  if (error) reportDbError('[dbInsertSoporteSolicitud]', error);
}

export async function dbInsertLevelDefinition(l: LevelDefinition) {
  const row = {
    id: l.id, studio_id: l.studioId ?? STUDIO_ID, nombre: l.nombre, orden: l.orden,
    umbral_creditos: l.umbralCreditos, color: l.color, icono: l.icono,
    beneficios: l.beneficios ?? null, activo: l.activo, creado_en: l.creadoEn,
  };
  const { error } = await supabase.from('level_definitions').insert(row);
  if (error) reportDbError('[dbInsertLevelDefinition]', error);
}

export async function dbUpdateLevelDefinition(id: string, changes: Partial<LevelDefinition>) {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('orden' in changes) db.orden = changes.orden;
  if ('umbralCreditos' in changes) db.umbral_creditos = changes.umbralCreditos;
  if ('color' in changes) db.color = changes.color;
  if ('icono' in changes) db.icono = changes.icono;
  if ('beneficios' in changes) db.beneficios = changes.beneficios;
  if ('activo' in changes) db.activo = changes.activo;
  const { error } = await supabase.from('level_definitions').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateLevelDefinition]', error);
}

export async function dbDeleteLevelDefinition(id: string) {
  const { error } = await supabase.from('level_definitions').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteLevelDefinition]', error);
}

// ─── Gamificación: retos ────────────────────────────────────────────────────────

export async function dbInsertChallengeDefinition(c: ChallengeDefinition) {
  const row = {
    id: c.id, studio_id: c.studioId ?? STUDIO_ID, nombre: c.nombre, descripcion: c.descripcion ?? null,
    icono: c.icono, metric: c.metric, objetivo: c.objetivo, fecha_inicio: c.fechaInicio, fecha_fin: c.fechaFin,
    creditos_recompensa: c.creditosRecompensa, activo: c.activo, creado_en: c.creadoEn,
  };
  const { error } = await supabase.from('challenge_definitions').insert(row);
  if (error) reportDbError('[dbInsertChallengeDefinition]', error);
}

export async function dbUpdateChallengeDefinition(id: string, changes: Partial<ChallengeDefinition>) {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('descripcion' in changes) db.descripcion = changes.descripcion;
  if ('icono' in changes) db.icono = changes.icono;
  if ('metric' in changes) db.metric = changes.metric;
  if ('objetivo' in changes) db.objetivo = changes.objetivo;
  if ('fechaInicio' in changes) db.fecha_inicio = changes.fechaInicio;
  if ('fechaFin' in changes) db.fecha_fin = changes.fechaFin;
  if ('creditosRecompensa' in changes) db.creditos_recompensa = changes.creditosRecompensa;
  if ('activo' in changes) db.activo = changes.activo;
  const { error } = await supabase.from('challenge_definitions').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateChallengeDefinition]', error);
}

export async function dbDeleteChallengeDefinition(id: string) {
  const { error } = await supabase.from('challenge_definitions').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteChallengeDefinition]', error);
}

export async function dbUpsertChallengeProgress(p: ChallengeProgress) {
  const row = {
    id: p.id, studio_id: p.studioId ?? STUDIO_ID, socio_id: p.socioId, challenge_id: p.challengeId,
    progreso_actual: p.progresoActual, completado: p.completado, completado_en: p.completadoEn ?? null,
  };
  const { error } = await supabase.from('challenge_progress').upsert(row, { onConflict: 'socio_id,challenge_id' });
  if (error) reportDbError('[dbUpsertChallengeProgress]', error);
}

export async function dbInsertChallengeHistory(h: ChallengeHistory) {
  const row = {
    id: h.id, studio_id: h.studioId ?? STUDIO_ID, socio_id: h.socioId, challenge_id: h.challengeId,
    nombre: h.nombre, icono: h.icono, creado_en: h.creadoEn,
  };
  const { error } = await supabase.from('challenge_history').insert(row);
  if (error) reportDbError('[dbInsertChallengeHistory]', error);
}

// ─── Dashboard: gráficos personalizados ────────────────────────────────────────

export async function dbInsertDashboardChart(c: DashboardChart) {
  const row = {
    id: c.id, studio_id: c.studioId ?? STUDIO_ID, nombre: c.nombre, tipo: c.tipo,
    metrica: c.metrica, agrupacion: c.agrupacion, rango: c.rango, color: c.color, creado_en: c.creadoEn,
  };
  const { error } = await supabase.from('dashboard_charts').insert(row);
  if (error) reportDbError('[dbInsertDashboardChart]', error);
}

export async function dbDeleteDashboardChart(id: string) {
  const { error } = await supabase.from('dashboard_charts').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteDashboardChart]', error);
}

export async function dbInsertAutomationLog(log: AutomationLog) {
  const row = {
    id: log.id,
    studio_id: log.studioId ?? STUDIO_ID,
    rule_id: log.ruleId,
    rule_name: log.ruleName,
    socio_id: log.socioId,
    socio_nombre: log.socioNombre,
    paso_index: log.pasoIndex,
    accion: log.accion,
    resultado: log.resultado,
    detalle: log.detalle,
    ejecutado_en: log.ejecutadoEn,
    proxima_accion_en: log.proximaAccionEn,
    recibo_id: log.reciboId ?? null,
  };
  const { error } = await supabase.from('automation_logs').insert(row);
  if (error) reportDbError('[dbInsertAutomationLog]', error);
}

// Igual que dbInsertAutomationLog pero idempotente (upsert por id). Lo usa la
// cola durable (Inngest): si un step se reintenta tras un fallo transitorio, el
// log se reescribe en vez de duplicarse. Requiere un id DETERMINISTA por
// candidato (no uid() aleatorio) para que el on-conflict funcione.
export async function dbUpsertAutomationLog(log: AutomationLog) {
  const row = {
    id: log.id,
    studio_id: log.studioId ?? STUDIO_ID,
    rule_id: log.ruleId,
    rule_name: log.ruleName,
    socio_id: log.socioId,
    socio_nombre: log.socioNombre,
    paso_index: log.pasoIndex,
    accion: log.accion,
    resultado: log.resultado,
    detalle: log.detalle,
    ejecutado_en: log.ejecutadoEn,
    proxima_accion_en: log.proximaAccionEn,
    recibo_id: log.reciboId ?? null,
  };
  const { error } = await supabase.from('automation_logs').upsert(row, { onConflict: 'id' });
  if (error) reportDbError('[dbUpsertAutomationLog]', error);
}

export async function dbUpdateAutomationLog(id: string, changes: Partial<AutomationLog>) {
  const db: Record<string, unknown> = {};
  if ('resultado' in changes) db.resultado = changes.resultado;
  if ('detalle' in changes) db.detalle = changes.detalle;
  if ('proximaAccionEn' in changes) db.proxima_accion_en = changes.proximaAccionEn;
  const { error } = await supabase.from('automation_logs').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateAutomationLog]', error);
}

export async function dbInsertAutomationRule(r: AutomationRule) {
  const row = {
    id: r.id, studio_id: r.studioId ?? STUDIO_ID, nombre: r.nombre, descripcion: r.descripcion,
    icono: r.icono, trigger: r.trigger, condicion: r.condicion ?? {}, pasos: r.pasos ?? [],
    activa: r.activa, ejecutada_veces: r.ejecutadaVeces ?? 0, ultima_ejecucion: r.ultimaEjecucion ?? null,
    creada_en: r.creadaEn,
  };
  const { error } = await supabase.from('automation_rules').insert(row);
  if (error) reportDbError('[dbInsertAutomationRule]', error);
}

export async function dbUpdateAutomationRule(id: string, changes: Partial<AutomationRule>) {
  const db: Record<string, unknown> = {};
  if ('activa' in changes) db.activa = changes.activa;
  if ('ejecutadaVeces' in changes) db.ejecutada_veces = changes.ejecutadaVeces;
  if ('ultimaEjecucion' in changes) db.ultima_ejecucion = changes.ultimaEjecucion;
  const { error } = await supabase.from('automation_rules').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateAutomationRule]', error);
}

export async function dbInsertNotaProgreso(nota: NotaProgreso) {
  const { error } = await supabase.from('notas_progreso').insert(notaProgresoToDb(nota));
  if (error) reportDbError('[dbInsertNotaProgreso]', error);
}

export async function dbInsertCodigoDescuento(c: CodigoDescuento) {
  const { error } = await supabase.from('codigos_descuento').insert(codigoDescuentoToDb(c));
  if (error) reportDbError('[dbInsertCodigoDescuento]', error);
}

export async function dbUpdateCodigoDescuento(id: string, changes: Partial<CodigoDescuento>) {
  const db: Record<string, unknown> = {};
  if ('activo' in changes) db.activo = changes.activo;
  if ('usos' in changes) db.usos = changes.usos;
  const { error } = await supabase.from('codigos_descuento').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateCodigoDescuento]', error);
}

export async function dbDeleteCodigoDescuento(id: string) {
  const { error } = await supabase.from('codigos_descuento').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteCodigoDescuento]', error);
}

export async function dbInsertNotaInterna(nota: NotaInterna) {
  const { error } = await supabase.from('notas_internas').insert(notaInternaToDb(nota));
  if (error) reportDbError('[dbInsertNotaInterna]', error);
}

export async function dbDeleteNotaInterna(id: string) {
  const { error } = await supabase.from('notas_internas').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteNotaInterna]', error);
}

export async function dbInsertCondicion(c: CondicionSalud) {
  const { error } = await supabase.from('condiciones_salud').insert(condicionSaludToDb(c));
  if (error) reportDbError('[dbInsertCondicion]', error);
}

export async function dbUpdateCondicion(id: string, changes: Partial<CondicionSalud>) {
  const parcial = condicionSaludToDb({ id, ...changes } as CondicionSalud);
  // Solo enviamos las columnas realmente presentes en `changes` (+ actualizado_en).
  const patch: Record<string, unknown> = { actualizado_en: new Date().toISOString() };
  const clave: Record<keyof CondicionSalud, string> = {
    id: 'id', studioId: 'studio_id', socioId: 'socio_id', categoria: 'categoria',
    etiqueta: 'etiqueta', zona: 'zona', restricciones: 'restricciones', severidad: 'severidad',
    estado: 'estado', inicio: 'inicio', fin: 'fin', revisarEn: 'revisar_en', notas: 'notas',
    creadoPor: 'creado_por', creadoEn: 'creado_en', actualizadoEn: 'actualizado_en',
  };
  for (const k of Object.keys(changes) as (keyof CondicionSalud)[]) {
    patch[clave[k]] = (parcial as Record<string, unknown>)[clave[k]];
  }
  const { error } = await supabase.from('condiciones_salud').update(patch).eq('id', id);
  if (error) reportDbError('[dbUpdateCondicion]', error);
}

export async function dbDeleteCondicion(id: string) {
  const { error } = await supabase.from('condiciones_salud').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteCondicion]', error);
}

export async function dbInsertRespuestaSesion(r: RespuestaSesionRow) {
  const { error } = await supabase.from('respuestas_sesion').insert(respuestaSesionToDb(r));
  if (error) reportDbError('[dbInsertRespuestaSesion]', error);
}

export async function dbUpdateRespuestaSesion(id: string, changes: Partial<Pick<RespuestaSesionRow, 'respuesta' | 'nota'>>) {
  const { error } = await supabase.from('respuestas_sesion').update(changes).eq('id', id);
  if (error) reportDbError('[dbUpdateRespuestaSesion]', error);
}

export async function dbInsertCampana(c: Campana) {
  const { error } = await supabase.from('campanas').insert(campanaToDb(c));
  if (error) reportDbError('[dbInsertCampana]', error);
}

export async function dbUpdateCampana(id: string, changes: Partial<Campana>) {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('tipo' in changes) db.tipo = changes.tipo;
  if ('asunto' in changes) db.asunto = changes.asunto;
  if ('contenido' in changes) db.contenido = changes.contenido;
  if ('estado' in changes) db.estado = changes.estado;
  if ('destinatarios' in changes) db.destinatarios = changes.destinatarios;
  if ('enviados' in changes) db.enviados = changes.enviados;
  if ('abiertos' in changes) db.abiertos = changes.abiertos;
  if ('clics' in changes) db.clics = changes.clics;
  if ('enviadaEn' in changes) db.enviada_en = changes.enviadaEn;
  if ('programadaEn' in changes) db.programada_en = changes.programadaEn;
  const { error } = await supabase.from('campanas').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateCampana]', error);
}

export async function dbDeleteCampana(id: string) {
  const { error } = await supabase.from('campanas').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteCampana]', error);
}

export async function dbInsertAutomatizacion(a: Automatizacion) {
  const { error } = await supabase.from('automatizaciones').insert(automatizacionToDb(a));
  if (error) reportDbError('[dbInsertAutomatizacion]', error);
}

export async function dbUpdateAutomatizacion(id: string, changes: Partial<Automatizacion>) {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('trigger' in changes) db.trigger = changes.trigger;
  if ('accion' in changes) db.accion = changes.accion;
  if ('asunto' in changes) db.asunto = changes.asunto;
  if ('mensaje' in changes) db.mensaje = changes.mensaje;
  if ('activa' in changes) db.activa = changes.activa;
  if ('ejecutadas' in changes) db.ejecutadas = changes.ejecutadas;
  const { error } = await supabase.from('automatizaciones').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateAutomatizacion]', error);
}

export async function dbDeleteAutomatizacion(id: string) {
  const { error } = await supabase.from('automatizaciones').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteAutomatizacion]', error);
}

export async function dbInsertVideoOnDemand(v: VideoOnDemand) {
  const { error } = await supabase.from('videos_on_demand').insert(videoOnDemandToDb(v));
  if (error) reportDbError('[dbInsertVideoOnDemand]', error);
}

export async function dbUpdateVideoOnDemand(id: string, changes: Partial<VideoOnDemand>) {
  const db: Record<string, unknown> = {};
  if ('titulo' in changes) db.titulo = changes.titulo;
  if ('descripcion' in changes) db.descripcion = changes.descripcion;
  if ('categoria' in changes) db.categoria = changes.categoria;
  if ('duracionMinutos' in changes) db.duracion_minutos = changes.duracionMinutos;
  if ('nivel' in changes) db.nivel = changes.nivel;
  if ('instructorId' in changes) db.instructor_id = changes.instructorId;
  if ('vistas' in changes) db.vistas = changes.vistas;
  if ('likes' in changes) db.likes = changes.likes;
  if ('activo' in changes) db.activo = changes.activo;
  const { error } = await supabase.from('videos_on_demand').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateVideoOnDemand]', error);
}

export async function dbDeleteVideoOnDemand(id: string) {
  const { error } = await supabase.from('videos_on_demand').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteVideoOnDemand]', error);
}

export async function dbInsertPostComunidad(p: PostComunidad) {
  const { error } = await supabase.from('posts_comunidad').insert(postComunidadToDb(p));
  if (error) reportDbError('[dbInsertPostComunidad]', error);
}

export async function dbUpdatePostComunidad(id: string, changes: Partial<PostComunidad>) {
  const db: Record<string, unknown> = {};
  if ('texto' in changes) db.texto = changes.texto;
  if ('likes' in changes) db.likes = changes.likes;
  if ('comentariosCount' in changes) db.comentarios_count = changes.comentariosCount;
  if ('fijado' in changes) db.fijado = changes.fijado;
  const { error } = await supabase.from('posts_comunidad').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdatePostComunidad]', error);
}

export async function dbDeletePostComunidad(id: string) {
  const { error } = await supabase.from('posts_comunidad').delete().eq('id', id);
  if (error) reportDbError('[dbDeletePostComunidad]', error);
}

export async function dbUpsertIntegracion(intg: Integracion) {
  const row = {
    id: intg.id,
    studio_id: intg.studioId ?? STUDIO_ID,
    tipo: intg.tipo,
    activo: intg.activo,
    config: intg.config ?? {},
    actualizado_en: intg.actualizadoEn,
  };
  const { error } = await supabase.from('integraciones').upsert(row, { onConflict: 'studio_id,tipo' });
  if (error) reportDbError('[dbUpsertIntegracion]', error);
}

export async function dbInsertTipoClase(t: TipoClase) {
  const row = {
    id: t.id, studio_id: t.studioId ?? STUDIO_ID, nombre: t.nombre, color: t.color,
    duracion_minutos: t.duracionMinutos, descripcion: t.descripcion ?? null, nivel: t.nivel,
    foto_url: t.fotoUrl ?? null,
  };
  const { error } = await supabase.from('tipos_clase').insert(row);
  if (error) reportDbError('[dbInsertTipoClase]', error);
}

export async function dbUpdateTipoClase(id: string, changes: Partial<TipoClase>) {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('color' in changes) db.color = changes.color;
  if ('duracionMinutos' in changes) db.duracion_minutos = changes.duracionMinutos;
  if ('descripcion' in changes) db.descripcion = changes.descripcion;
  if ('nivel' in changes) db.nivel = changes.nivel;
  if ('fotoUrl' in changes) db.foto_url = changes.fotoUrl;
  const { error } = await supabase.from('tipos_clase').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateTipoClase]', error);
}

export async function dbDeleteTipoClase(id: string) {
  const { error } = await supabase.from('tipos_clase').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteTipoClase]', error);
}

// A-2: las mutaciones de equipo (alta/edición/baja) pasan por /api/equipo, que
// exige verificarSesionStaff con rol PROPIETARIO (o autoedición de la propia
// ficha) — antes escribían directamente a `instructores` con el cliente anónimo,
// fiándose solo de la RLS y de una UI que caía a PROPIETARIO por defecto.
async function staffAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export async function dbInsertInstructor(i: Instructor) {
  try {
    const res = await fetch('/api/equipo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await staffAuthHeader()) },
      body: JSON.stringify({
        id: i.id,
        nombre: i.nombre,
        email: i.email ?? null,
        telefono: i.telefono ?? null,
        color: i.color,
        activo: i.activo,
        avatar: i.avatar ?? null,
        rol: i.rol ?? 'INSTRUCTOR',
      }),
    });
    if (!res.ok) reportDbError('[dbInsertInstructor]', await res.json().catch(() => ({ status: res.status })));
  } catch (e) {
    reportDbError('[dbInsertInstructor]', e);
  }
}

export async function dbUpdateInstructor(id: string, changes: Partial<Instructor>) {
  try {
    const res = await fetch('/api/equipo', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await staffAuthHeader()) },
      body: JSON.stringify({ id, changes }),
    });
    if (!res.ok) reportDbError('[dbUpdateInstructor]', await res.json().catch(() => ({ status: res.status })));
  } catch (e) {
    reportDbError('[dbUpdateInstructor]', e);
  }
}

// Vincula la fila de instructor sin reclamar (auth_user_id null) cuyo
// email coincide con el de la sesión recién creada. La política RLS
// "self_claim_instructores" es quien realmente impone que solo se
// pueda reclamar la fila con el email correcto — esto es solo el cliente.
export async function dbClaimInstructorAccount(email: string, authUserId: string) {
  const { data, error } = await supabase
    .from('instructores')
    .update({ auth_user_id: authUserId })
    .is('auth_user_id', null)
    .eq('email', email)
    .select()
    .maybeSingle();
  if (error) { reportDbError('[dbClaimInstructorAccount]', error); return null; }
  return data ? mapInstructor(data) : null;
}

export async function dbUpdateStudio(changes: Partial<Studio>) {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('nif' in changes) db.nif = changes.nif;
  if ('razonSocial' in changes) db.razon_social = changes.razonSocial;
  if ('direccion' in changes) db.direccion = changes.direccion;
  if ('ciudad' in changes) db.ciudad = changes.ciudad;
  if ('codigoPostal' in changes) db.codigo_postal = changes.codigoPostal;
  if ('email' in changes) db.email = changes.email;
  if ('telefono' in changes) db.telefono = changes.telefono;
  if ('colorPrimario' in changes) db.color_primario = changes.colorPrimario;
  if ('temaPortal' in changes) db.tema_portal = changes.temaPortal;
  if ('avatarAdmin' in changes) db.avatar_admin = changes.avatarAdmin;
  if ('cancelacionVentanaHoras' in changes) db.cancelacion_ventana_horas = changes.cancelacionVentanaHoras;
  if ('cancelacionDevolverBonoTardia' in changes) db.cancelacion_devolver_bono_tardia = changes.cancelacionDevolverBonoTardia;
  if ('reservaExigirPlan' in changes) db.reserva_exigir_plan = changes.reservaExigirPlan;
  if ('reservaMaxSimultaneas' in changes) db.reserva_max_simultaneas = changes.reservaMaxSimultaneas;
  const { error } = await supabase.from('studios').update(db).eq('id', STUDIO_ID);
  if (error) reportDbError('[dbUpdateStudio]', error);
}

// Toma el id explícito (no el STUDIO_ID de la sesión del navegador) porque la
// llama el callback de OAuth de Stripe Connect, un servidor sin sesión.
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

function slugify(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'estudio';
}

// Genera un slug único para /reservar/[slug], /kiosk/[slug], /portal/[slug]
// probando sufijos -2, -3... si el base ya existe.
async function generateUniqueSlug(nombre: string): Promise<string> {
  const base = slugify(nombre);
  let candidate = base;
  let n = 2;
  while (true) {
    const { data } = await supabase.from('studios').select('id').eq('slug', candidate).maybeSingle();
    if (!data) return candidate;
    candidate = `${base}-${n}`;
    n++;
  }
}

// Crea un negocio nuevo (multi-tenancy: alta real desde /crear-estudio) y lo
// vincula a la cuenta de Supabase Auth que lo creó. Devuelve el id del nuevo
// negocio, o null si falló.
export async function dbCreateStudio(fields: { nombre: string; ciudad: string; telefono: string; ownerAuthUserId: string }): Promise<string | null> {
  const id = `studio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const slug = await generateUniqueSlug(fields.nombre);
  const { error } = await supabase.from('studios').insert({
    id,
    nombre: fields.nombre,
    ciudad: fields.ciudad,
    telefono: fields.telefono,
    plan: 'BASE',
    owner_auth_user_id: fields.ownerAuthUserId,
    slug,
  });
  if (error) { reportDbError('[dbCreateStudio]', error); return null; }
  return id;
}

// Resuelve el studio_id a partir del slug público de la URL (/reservar/[slug]...).
export async function resolveStudioIdBySlug(slug: string): Promise<string | null> {
  const { data } = await supabase.from('studios').select('id').eq('slug', slug).maybeSingle();
  return data?.id ?? null;
}

export async function dbUpdateStudioAvatar(avatarId: string | null) {
  return dbUpdateStudio({ avatarAdmin: avatarId });
}

export async function dbDeleteInstructor(id: string) {
  try {
    const res = await fetch('/api/equipo', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...(await staffAuthHeader()) },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) reportDbError('[dbDeleteInstructor]', await res.json().catch(() => ({ status: res.status })));
  } catch (e) {
    reportDbError('[dbDeleteInstructor]', e);
  }
}
