import * as Sentry from '@sentry/nextjs';
import { supabase } from '@/lib/db/supabase';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enviarEmailTransaccional, type DatosClaseEmail } from '@/lib/emails/send-server';
import { enviarWhatsAppTexto, isWhatsAppConfigurado } from '@/lib/whatsapp';
import { uid } from '@/lib/utils';
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
  RowCitasServicios,
  RowCitasDisponibilidad,
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
  RowSesiones,
  RowSocios,
  RowCamposPersonalizados,
  RowPlantillasEmail,
  RowInstructorDependencySnapshots,
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
  ServicioCita,
  DisponibilidadCita,
  TipoCita,
  CodigoDescuento,
  CreditTransaction,
  DashboardChart,
  Factura,
  Instructor,
  Integracion,
  LevelDefinition,
  MemberCredits,
  MensajeEquipo,
  CanalEquipo,
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
  Sala,
  Sesion,
  Socio,
  CampoPersonalizado,
  PlantillaEmail,
  InstructorDependencySnapshot,
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
export let STUDIO_ID = '';

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

// ─── Cliente de escritura sensible al entorno ────────────────────────────────
// Varias funciones de este módulo se invocan desde DOS entornos:
//   · el navegador (staff o socia con sesión) → cliente anónimo; RLS es la
//     garantía de aislamiento entre tenants y debe seguir aplicándose.
//   · jobs de servidor sin sesión (Inngest, crons) → con el cliente anónimo
//     `current_studio_id()` es NULL, RLS rechaza la escritura y `reportDbError`
//     se traga el error: el job "completa" sin haber escrito nada.
// En servidor usamos el service-role; el `studio_id` explícito de cada fila
// mantiene el aislamiento. El patrón ya estaba aplicado en línea en varias
// escrituras de automatizaciones: aquí se le pone nombre para no repetirlo.
function dbEscritura(): SupabaseClient {
  return getSupabaseAdmin() ?? supabase;
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

function _mapStudio(r: RowStudios): Studio {
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
    logoUrl: r.logo_url ?? null,
    ivaPorDefecto: r.iva_por_defecto ?? 21,
    depUmbralAlto: r.dep_umbral_alto ?? 25,
    depUmbralMedio: r.dep_umbral_medio ?? 15,
    depVentanaDias: r.dep_ventana_dias ?? 90,
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

function _mapUsuario(r: RowUsuarios): Usuario {
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

function _mapSocio(r: RowSocios): Socio {
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
    metodoPagoPreferido: (r.metodo_pago_preferido as Socio['metodoPagoPreferido']) ?? 'TARJETA',
    sepaMandateId: r.sepa_mandate_id ?? null,
    sepaPaymentMethodId: r.sepa_payment_method_id ?? null,
    fechaNacimiento: r.fecha_nacimiento ?? null,
    direccion: r.direccion ?? null,
    fotoUrl: r.foto_url ?? null,
    referidoPor: r.referido_por ?? null,
    camposExtra: r.campos_extra ?? {},
  } as Socio;
}

function _mapCampoPersonalizado(r: RowCamposPersonalizados): CampoPersonalizado {
  return {
    id: r.id,
    studioId: r.studio_id ?? '',
    etiqueta: r.etiqueta,
    tipo: (r.tipo ?? 'texto') as CampoPersonalizado['tipo'],
    opciones: r.opciones ?? [],
    requerido: r.requerido ?? false,
    orden: r.orden ?? 0,
    activo: r.activo ?? true,
  };
}

function _mapPreferenciasSocio(r: RowPreferenciasSocio): PreferenciasSocio {
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

function _mapRewardRule(r: RowRewardRules): RewardRule {
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

function _mapRewardAction(r: RowRewardActions): RewardAction {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    trigger: r.trigger,
    refId: r.ref_id ?? null,
    creadoEn: r.creado_en,
  } as RewardAction;
}

function _mapRewardHistory(r: RowRewardHistory): RewardHistory {
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

function _mapCreditTransaction(r: RowCreditTransactions): CreditTransaction {
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

function _mapMemberCredits(r: RowMemberCredits): MemberCredits {
  return {
    socioId: r.socio_id,
    studioId: r.studio_id,
    saldo: r.saldo,
    totalGanado: r.total_ganado,
    totalCanjeado: r.total_canjeado,
    actualizadoEn: r.actualizado_en,
  } as MemberCredits;
}

function _mapRewardCatalogItem(r: RowRewardCatalog): RewardCatalogItem {
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

function _mapRewardRedemption(r: RowRewardRedemptions): RewardRedemption {
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

function _mapAchievementDefinition(r: RowAchievementDefinitions): AchievementDefinition {
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

function _mapAchievementProgress(r: RowAchievementProgress): AchievementProgress {
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

function _mapAchievementHistory(r: RowAchievementHistory): AchievementHistory {
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

function _mapLevelDefinition(r: RowLevelDefinitions): LevelDefinition {
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

function _mapChallengeDefinition(r: RowChallengeDefinitions): ChallengeDefinition {
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

function _mapChallengeProgress(r: RowChallengeProgress): ChallengeProgress {
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

function _mapChallengeHistory(r: RowChallengeHistory): ChallengeHistory {
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

function _mapDashboardChart(r: RowDashboardCharts): DashboardChart {
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

function _mapBackupMeta(r: RowBackups): BackupMeta {
  return {
    id: r.id,
    studioId: r.studio_id,
    tipo: r.tipo,
    creadoEn: r.creado_en,
  } as BackupMeta;
}

function _mapPlanTarifa(r: RowPlanesTarifa): PlanTarifa {
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

function _mapSuscripcion(r: RowSuscripciones): Suscripcion {
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

function _mapSala(r: RowSalas): Sala {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    capacidad: r.capacidad,
    color: r.color,
  } as Sala;
}

function _mapSpot(r: RowSpots): Spot {
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

function _mapTipoClase(r: RowTiposClase): TipoClase {
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

function _mapInstructor(r: RowInstructores): Instructor {
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

function _mapSesion(r: RowSesiones): Sesion {
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

function _mapReserva(r: RowReservas): Reserva {
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

function _mapRecibo(r: RowRecibos): Recibo {
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
    metodoCobro: (r.metodo_cobro as Recibo['metodoCobro']) ?? null,
    sepaEstado: r.sepa_estado ?? null,
  } as Recibo;
}

function _mapFactura(r: RowFacturas): Factura {
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

function _mapCita(r: RowCitas): Cita {
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
    pagada: r.pagada ?? false,
    creadoEn: r.creado_en,
    servicioId: r.servicio_id ?? null,
  } as Cita;
}

function _mapProductoPOS(r: RowProductosPos): ProductoPOS {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    categoria: r.categoria,
    precio: r.precio,
    activo: r.activo,
  } as ProductoPOS;
}

function _mapVentaPOS(r: RowVentasPos): VentaPOS {
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

function _mapIntegracion(r: RowIntegraciones): Integracion {
  return {
    id: r.id,
    studioId: r.studio_id,
    tipo: r.tipo,
    activo: r.activo,
    config: r.config ?? {},
    actualizadoEn: r.actualizado_en,
  } as Integracion;
}

function _mapCampana(r: RowCampanas): Campana {
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
    objetivo: r.objetivo ?? null,
    presupuesto: r.presupuesto ?? null,
    publicaciones: (r.publicaciones as Campana['publicaciones']) ?? null,
  } as Campana;
}

function _mapAutomatizacion(r: RowAutomatizaciones): Automatizacion {
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
    pasos: (r.pasos as Automatizacion['pasos']) ?? null,
  } as Automatizacion;
}

function _mapAutomationRule(r: RowAutomationRules): AutomationRule {
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

function _mapAutomationLog(r: RowAutomationLogs): AutomationLog {
  return {
    id: r.id,
    studioId: r.studio_id,
    ruleId: r.rule_id ?? null,
    automatizacionId: r.automatizacion_id ?? null,
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

function _mapNotaProgreso(r: RowNotasProgreso): NotaProgreso {
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

function _mapCodigoDescuento(r: RowCodigosDescuento): CodigoDescuento {
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
    minImporte: r.min_importe ?? null,
    soloNuevas: r.solo_nuevas ?? false,
  } as CodigoDescuento;
}

function _mapActividadReciente(r: RowActividadReciente): ActividadReciente {
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

export function mapMensajeEquipo(r: RowMensajesEquipo): MensajeEquipo {
  return {
    id: r.id,
    studioId: r.studio_id,
    canalId: r.canal_id ?? '',
    autorInstructorId: r.autor_instructor_id ?? null,
    autorNombre: r.autor_nombre,
    texto: r.texto,
    creadoEn: r.creado_en,
  } as MensajeEquipo;
}

export function mapCanalEquipo(r: RowCanalesEquipo): CanalEquipo {
  return {
    id: r.id,
    studioId: r.studio_id ?? '',
    nombre: r.nombre,
    creadoEn: r.creado_en ?? '',
  };
}

function _mapNotificacion(r: RowNotificaciones): Notificacion {
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

function _mapVideoOnDemand(r: RowVideosOnDemand): VideoOnDemand {
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
    streamUid: r.stream_uid ?? null,
  } as VideoOnDemand;
}

function _mapPostComunidad(r: RowPostsComunidad): PostComunidad {
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

function _mapNotaInterna(r: RowNotasInternas): NotaInterna {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    texto: r.texto,
    tipo: r.tipo,
    creadoEn: r.creado_en,
  } as NotaInterna;
}

function _mapCondicionSalud(r: RowCondicionesSalud): CondicionSalud {
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

function _mapRespuestaSesion(r: RowRespuestasSesion): RespuestaSesionRow {
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

export function mapServicioCita(r: RowCitasServicios): ServicioCita {
  return {
    id: r.id,
    studioId: r.studio_id ?? STUDIO_ID,
    nombre: r.nombre,
    tipo: r.tipo as TipoCita,
    duracionMin: r.duracion_min,
    precio: r.precio ?? null,
    autoReservable: r.auto_reservable ?? false,
    color: r.color ?? null,
    descripcion: r.descripcion ?? null,
    activo: r.activo ?? true,
    orden: r.orden ?? 0,
    creadoEn: r.creado_en ?? '',
  };
}

export function mapDisponibilidadCita(r: RowCitasDisponibilidad): DisponibilidadCita {
  return {
    id: r.id,
    studioId: r.studio_id ?? STUDIO_ID,
    instructorId: r.instructor_id ?? '',
    diaSemana: r.dia_semana,
    horaInicio: (r.hora_inicio ?? '').slice(0, 5),
    horaFin: (r.hora_fin ?? '').slice(0, 5),
    creadoEn: r.creado_en ?? '',
  };
}

function _mapDependencySnapshot(r: RowInstructorDependencySnapshots): InstructorDependencySnapshot {
  return {
    id: r.id,
    studioId: r.studio_id ?? '',
    instructorId: r.instructor_id ?? '',
    periodoInicio: r.periodo_inicio ?? '',
    periodoFin: r.periodo_fin ?? '',
    ventanaDias: r.ventana_dias ?? 90,
    alumnasTotal: r.alumnas_total ?? 0,
    alumnasCautivasCount: r.alumnas_cautivas_count ?? 0,
    ingresosCautivos: Number(r.ingresos_cautivos ?? 0),
    ingresosTotalEstudio: Number(r.ingresos_total_estudio ?? 0),
    porcentajeFacturacion: Number(r.porcentaje_facturacion ?? 0),
    nivelRiesgo: (r.nivel_riesgo ?? 'BAJO') as InstructorDependencySnapshot['nivelRiesgo'],
    detalle: r.detalle ?? [],
    calculadoEn: r.calculado_en ?? '',
  };
}

function _mapPlantillaEmail(r: RowPlantillasEmail): PlantillaEmail {
  return {
    id: r.id,
    studioId: r.studio_id ?? '',
    tipo: r.tipo as PlantillaEmail['tipo'],
    asunto: r.asunto ?? null,
    intro: r.intro ?? null,
    activa: r.activa ?? true,
  };
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
  const db = getSupabaseAdmin() ?? supabase;
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
    citasServiciosRes,
    citasDisponibilidadRes,
  ] = await Promise.all([
    db.from('studios').select('*').eq('id', sid).single(),
    db.from('usuarios').select('*').eq('studio_id', sid),
    db.from('socios').select('*').eq('studio_id', sid).is('borrado_en', null),
    db.from('planes_tarifa').select('*').eq('studio_id', sid),
    db.from('suscripciones').select('*').eq('studio_id', sid),
    db.from('salas').select('*').eq('studio_id', sid),
    db.from('spots').select('*').eq('studio_id', sid),
    db.from('tipos_clase').select('*').eq('studio_id', sid),
    db.from('instructores').select('*').eq('studio_id', sid),
    db.from('sesiones').select('*').eq('studio_id', sid),
    db.from('reservas').select('*').eq('studio_id', sid),
    db.from('recibos').select('*').eq('studio_id', sid),
    db.from('facturas').select('*').eq('studio_id', sid),
    db.from('citas').select('*').eq('studio_id', sid),
    db.from('productos_pos').select('*').eq('studio_id', sid),
    db.from('ventas_pos').select('*').eq('studio_id', sid),
    db.from('campanas').select('*').eq('studio_id', sid),
    db.from('automatizaciones').select('*').eq('studio_id', sid),
    db.from('automation_rules').select('*').eq('studio_id', sid),
    db.from('automation_logs').select('*').eq('studio_id', sid).order('ejecutado_en', { ascending: false }),
    db.from('codigos_descuento').select('*').eq('studio_id', sid),
    db.from('actividad_reciente').select('*').eq('studio_id', sid).order('creado_en', { ascending: false }).limit(RECENT_FEED_LIMIT),
    db.from('notificaciones').select('*').eq('studio_id', sid).order('creada_en', { ascending: false }).limit(RECENT_FEED_LIMIT),
    db.from('videos_on_demand').select('*').eq('studio_id', sid),
    db.from('posts_comunidad').select('*').eq('studio_id', sid),
    db.from('notas_internas').select('*').eq('studio_id', sid),
    db.from('condiciones_salud').select('*').eq('studio_id', sid),
    db.from('respuestas_sesion').select('*').eq('studio_id', sid),
    db.from('integraciones').select('*').eq('studio_id', sid),
    db.from('mensajes_equipo').select('*').eq('studio_id', sid).order('creado_en', { ascending: false }).limit(1),
    db.from('preferencias_socio').select('*').eq('studio_id', sid),
    db.from('reward_rules').select('*').eq('studio_id', sid),
    db.from('reward_actions').select('*').eq('studio_id', sid),
    db.from('member_credits').select('*').eq('studio_id', sid),
    db.from('reward_catalog').select('*').eq('studio_id', sid),
    db.from('reward_redemptions').select('*').eq('studio_id', sid),
    db.from('achievement_definitions').select('*').eq('studio_id', sid),
    db.from('achievement_progress').select('*').eq('studio_id', sid),
    db.from('level_definitions').select('*').eq('studio_id', sid),
    db.from('challenge_definitions').select('*').eq('studio_id', sid),
    db.from('challenge_progress').select('*').eq('studio_id', sid),
    db.from('dashboard_charts').select('*').eq('studio_id', sid),
    db.from('citas_servicios').select('*').eq('studio_id', sid),
    db.from('citas_disponibilidad').select('*').eq('studio_id', sid),
  ]);

  return {
    studio: studioRes.data ? _mapStudio(studioRes.data) : null,
    usuarios: (usuariosRes.data ?? []).map(_mapUsuario),
    socios: (sociosRes.data ?? []).map(_mapSocio),
    planesTarifa: (planesTarifaRes.data ?? []).map(_mapPlanTarifa),
    suscripciones: (suscripcionesRes.data ?? []).map(_mapSuscripcion),
    salas: (salasRes.data ?? []).map(_mapSala),
    spots: (spotsRes.data ?? []).map(_mapSpot),
    tiposClase: (tiposClaseRes.data ?? []).map(_mapTipoClase),
    instructores: (instructoresRes.data ?? []).map(_mapInstructor),
    sesiones: (sesionesRes.data ?? []).map(_mapSesion),
    reservas: (reservasRes.data ?? []).map(_mapReserva),
    recibos: (recibosRes.data ?? []).map(_mapRecibo),
    facturas: (facturasRes.data ?? []).map(_mapFactura),
    citas: (citasRes.data ?? []).map(_mapCita),
    productosPOS: (productosPOSRes.data ?? []).map(_mapProductoPOS),
    ventasPOS: (ventasPOSRes.data ?? []).map(_mapVentaPOS),
    campanas: (campanasRes.data ?? []).map(_mapCampana),
    automatizaciones: (automatizacionesRes.data ?? []).map(_mapAutomatizacion),
    automationRules: (automationRulesRes.data ?? []).map(_mapAutomationRule),
    automationLogs: (automationLogsRes.data ?? []).map(_mapAutomationLog),
    codigosDescuento: (codigosDescuentoRes.data ?? []).map(_mapCodigoDescuento),
    actividadReciente: (actividadRecienteRes.data ?? []).map(_mapActividadReciente),
    notificaciones: (notificacionesRes.data ?? []).map(_mapNotificacion),
    videosOnDemand: (videosOnDemandRes.data ?? []).map(_mapVideoOnDemand),
    postsComunidad: (postsComunidadRes.data ?? []).map(_mapPostComunidad),
    notasInternas: (notasInternasRes.data ?? []).map(_mapNotaInterna),
    condicionesSalud: (condicionesSaludRes.data ?? []).map(_mapCondicionSalud),
    respuestasSesion: (respuestasSesionRes.data ?? []).map(_mapRespuestaSesion),
    integraciones: (integracionesRes.data ?? []).map(_mapIntegracion),
    mensajesEquipo: (mensajesEquipoRes.data ?? []).map(mapMensajeEquipo),
    preferenciasSocio: (preferenciasSocioRes.data ?? []).map(_mapPreferenciasSocio),
    rewardRules: (rewardRulesRes.data ?? []).map(_mapRewardRule),
    rewardActions: (rewardActionsRes.data ?? []).map(_mapRewardAction),
    memberCredits: (memberCreditsRes.data ?? []).map(_mapMemberCredits),
    rewardCatalog: (rewardCatalogRes.data ?? []).map(_mapRewardCatalogItem),
    rewardRedemptions: (rewardRedemptionsRes.data ?? []).map(_mapRewardRedemption),
    achievementDefinitions: (achievementDefinitionsRes.data ?? []).map(_mapAchievementDefinition),
    achievementProgress: (achievementProgressRes.data ?? []).map(_mapAchievementProgress),
    levelDefinitions: (levelDefinitionsRes.data ?? []).map(_mapLevelDefinition),
    challengeDefinitions: (challengeDefinitionsRes.data ?? []).map(_mapChallengeDefinition),
    challengeProgress: (challengeProgressRes.data ?? []).map(_mapChallengeProgress),
    dashboardCharts: (dashboardChartsRes.data ?? []).map(_mapDashboardChart),
    citasServicios: (citasServiciosRes.data ?? []).map((r) => mapServicioCita(r as RowCitasServicios)),
    citasDisponibilidad: (citasDisponibilidadRes.data ?? []).map((r) => mapDisponibilidadCita(r as RowCitasDisponibilidad)),
  };
}

export async function fetchDeferredStudioData(studioId?: string) {
  const sid = studioId ?? STUDIO_ID;
  const db = getSupabaseAdmin() ?? supabase;
  const [
    rewardHistoryRes,
    creditTransactionsRes,
    achievementHistoryRes,
    challengeHistoryRes,
    notasProgresoRes,
    backupsRes,
  ] = await Promise.all([
    db.from('reward_history').select('*').eq('studio_id', sid).order('creado_en', { ascending: false }).limit(RECENT_FEED_LIMIT),
    db.from('credit_transactions').select('*').eq('studio_id', sid),
    db.from('achievement_history').select('*').eq('studio_id', sid).order('creado_en', { ascending: false }).limit(RECENT_FEED_LIMIT),
    db.from('challenge_history').select('*').eq('studio_id', sid).order('creado_en', { ascending: false }).limit(RECENT_FEED_LIMIT),
    db.from('notas_progreso').select('*').eq('studio_id', sid),
    db.from('backups').select('id, studio_id, tipo, creado_en').eq('studio_id', sid).order('creado_en', { ascending: false }),
  ]);

  return {
    rewardHistory: (rewardHistoryRes.data ?? []).map(_mapRewardHistory),
    creditTransactions: (creditTransactionsRes.data ?? []).map(_mapCreditTransaction),
    achievementHistory: (achievementHistoryRes.data ?? []).map(_mapAchievementHistory),
    challengeHistory: (challengeHistoryRes.data ?? []).map(_mapChallengeHistory),
    notasProgreso: (notasProgresoRes.data ?? []).map(_mapNotaProgreso),
    backups: (backupsRes.data ?? []).map(r => _mapBackupMeta(r as RowBackups)),
  };
}

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

function _studioPublico(r: RowStudios) {
  return {
    id: r.id,
    nombre: r.nombre,
    ciudad: r.ciudad,
    direccion: r.direccion,
    email: r.email,
    telefono: r.telefono,
    colorPrimario: r.color_primario,
    logoUrl: r.logo_url ?? null,
    plan: r.plan,
    avatarAdmin: r.avatar_admin ?? null,
    slug: r.slug ?? null,
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

  const [
    sesionesRes, tiposClaseRes, salasRes, instructoresRes, spotsRes, planesRes, videosRes,
    rewardRulesRes, rewardCatalogRes, levelDefsRes, achDefsRes, chalDefsRes,
    citasServiciosRes, citasDisponibilidadRes,
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
    admin.from('citas_servicios').select('*').eq('studio_id', studioId).eq('activo', true).eq('auto_reservable', true),
    admin.from('citas_disponibilidad').select('*').eq('studio_id', studioId),
  ]);

  const { data: reservasAforo } = await admin
    .from('reservas').select('id, sesion_id, estado, spot_id').eq('studio_id', studioId);

  const base = {
    studio: _studioPublico(studioRow as RowStudios),
    sesiones: (sesionesRes.data ?? []).map(_mapSesion),
    tiposClase: (tiposClaseRes.data ?? []).map(_mapTipoClase),
    salas: (salasRes.data ?? []).map(_mapSala),
    instructores: (instructoresRes.data ?? []).map(_mapInstructor),
    spots: (spotsRes.data ?? []).map(_mapSpot),
    planesTarifa: (planesRes.data ?? []).map(_mapPlanTarifa),
    videosOnDemand: (videosRes.data ?? []).map(_mapVideoOnDemand),
    rewardRules: (rewardRulesRes.data ?? []).map(_mapRewardRule),
    rewardCatalog: (rewardCatalogRes.data ?? []).map(_mapRewardCatalogItem),
    levelDefinitions: (levelDefsRes.data ?? []).map(_mapLevelDefinition),
    achievementDefinitions: (achDefsRes.data ?? []).map(_mapAchievementDefinition),
    challengeDefinitions: (chalDefsRes.data ?? []).map(_mapChallengeDefinition),
    aforoReservas: (reservasAforo ?? []) as { id: string; sesion_id: string; estado: string; spot_id: string | null }[],
    citasServicios: (citasServiciosRes.data ?? []).map((r) => mapServicioCita(r as RowCitasServicios)),
    citasDisponibilidad: (citasDisponibilidadRes.data ?? []).map((r) => mapDisponibilidadCita(r as RowCitasDisponibilidad)),
  };

  if (!member) return { ...base, socia: null };

  const { data: socioRow } = await admin
    .from('socios').select('*')
    .eq('id', member.socioId).eq('studio_id', studioId).maybeSingle();

  const emailOk = socioRow &&
    (socioRow.email ?? '').trim().toLowerCase() === member.email.trim().toLowerCase();
  if (!socioRow || !emailOk) return { ...base, socia: null };

  const sid = member.socioId;
  const [susRes, resRes, recRes, facRes, prefRes, credRes, histRes, redRes, achProgRes, chalProgRes, txRes, citasRes] =
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
      admin.from('citas').select('*').eq('studio_id', studioId).eq('socio_id', sid),
    ]);

  const misRecibos = (recRes.data ?? []).map(_mapRecibo);
  const misReciboIds = new Set(misRecibos.map(r => r.id));

  return {
    ...base,
    socia: {
      socio: _mapSocio(socioRow as RowSocios),
      suscripciones: (susRes.data ?? []).map(_mapSuscripcion),
      reservas: (resRes.data ?? []).map(_mapReserva),
      recibos: misRecibos,
      facturas: (facRes.data ?? []).map(_mapFactura).filter(f => f.reciboId && misReciboIds.has(f.reciboId)),
      preferenciasSocio: (prefRes.data ?? []).map(_mapPreferenciasSocio),
      memberCredits: (credRes.data ?? []).map(_mapMemberCredits),
      rewardHistory: (histRes.data ?? []).map(_mapRewardHistory),
      rewardRedemptions: (redRes.data ?? []).map(_mapRewardRedemption),
      achievementProgress: (achProgRes.data ?? []).map(_mapAchievementProgress),
      challengeProgress: (chalProgRes.data ?? []).map(_mapChallengeProgress),
      creditTransactions: (txRes.data ?? []).map(_mapCreditTransaction),
      citas: (citasRes.data ?? []).map(_mapCita),
    },
  };
}

// ─── Studio operations ───────────────────────────────────────────────────────

export async function dbSetTerminalReader(studioId: string, readerId: string | null, locationId: string | null) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('studios')
    .update({ stripe_terminal_reader_id: readerId, stripe_terminal_location_id: locationId })
    .eq('id', studioId);
  if (error) reportDbError('[dbSetTerminalReader]', error);
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
  if ('logoUrl' in changes) db.logo_url = changes.logoUrl;
  if ('ivaPorDefecto' in changes) db.iva_por_defecto = changes.ivaPorDefecto;
  if ('depUmbralAlto' in changes) db.dep_umbral_alto = changes.depUmbralAlto;
  if ('depUmbralMedio' in changes) db.dep_umbral_medio = changes.depUmbralMedio;
  if ('depVentanaDias' in changes) db.dep_ventana_dias = changes.depVentanaDias;
  if ('avatarAdmin' in changes) db.avatar_admin = changes.avatarAdmin;
  if ('cancelacionVentanaHoras' in changes) db.cancelacion_ventana_horas = changes.cancelacionVentanaHoras;
  if ('cancelacionDevolverBonoTardia' in changes) db.cancelacion_devolver_bono_tardia = changes.cancelacionDevolverBonoTardia;
  if ('reservaExigirPlan' in changes) db.reserva_exigir_plan = changes.reservaExigirPlan;
  if ('reservaMaxSimultaneas' in changes) db.reserva_max_simultaneas = changes.reservaMaxSimultaneas;
  if ('stripeAccountId' in changes) db.stripe_account_id = changes.stripeAccountId;
  const { error } = await supabase.from('studios').update(db).eq('id', STUDIO_ID);
  if (error) reportDbError('[dbUpdateStudio]', error);
}

export async function dbSetStripeAccountId(studioId: string, stripeAccountId: string | null) {
  const admin = getSupabaseAdmin();
  if (!admin) { reportDbError('[dbSetStripeAccountId]', new Error('service role no configurada')); return; }
  const { error } = await admin.from('studios').update({ stripe_account_id: stripeAccountId }).eq('id', studioId);
  if (error) reportDbError('[dbSetStripeAccountId]', error);
}

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

// ─── Instructor operations ───────────────────────────────────────────────────

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

export async function dbClaimInstructorAccount(email: string, authUserId: string) {
  const { data, error } = await supabase
    .from('instructores')
    .update({ auth_user_id: authUserId })
    .is('auth_user_id', null)
    .eq('email', email)
    .select()
    .maybeSingle();
  if (error) { reportDbError('[dbClaimInstructorAccount]', error); return null; }
  return data ? _mapInstructor(data) : null;
}

// ─── Studio creation & resolution ────────────────────────────────────────────

function slugify(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'estudio';
}

async function generateUniqueSlug(nombre: string): Promise<string> {
  const base = slugify(nombre);
  let candidate = base;
  let n = 2;
  while (true) {
    const { data } = await supabase.rpc('slug_estudio_disponible', { p_slug: candidate });
    if (data === true) return candidate;
    candidate = `${base}-${n}`;
    n++;
  }
}

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

export async function resolveStudioIdBySlug(slug: string): Promise<string | null> {
  const { data } = await supabase.rpc('studio_id_por_slug', { p_slug: slug });
  return (data as string | null) ?? null;
}

export async function dbUpdateStudioAvatar(avatarId: string | null) {
  return dbUpdateStudio({ avatarAdmin: avatarId });
}

// ─── Auditoría & crons ───────────────────────────────────────────────────────

export async function generarRecordatoriosRevision(nowISO: string, umbralDias = 90) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const hoy = new Date(nowISO);

  const { data: condsRaw, error } = await admin
    .from('condiciones_salud').select('*').eq('estado', 'ACTIVA');
  if (error) throw new Error(error.message);
  const condiciones = (condsRaw ?? []).map(r => _mapCondicionSalud(r as RowCondicionesSalud));

  const recordatorios = recordatoriosRevision(condiciones, hoy, umbralDias);
  if (recordatorios.length === 0) {
    return { condicionesActivas: condiciones.length, recordatorios: 0, notificacionesCreadas: 0 };
  }

  const cutoff = new Date(hoy.getTime() - 30 * 86_400_000).toISOString();
  const { data: notis } = await admin
    .from('notificaciones').select('enlace').gt('creada_en', cutoff).like('enlace', '%?rev=%');
  const yaAvisado = new Set((notis ?? []).map(n => n.enlace as string));

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

export async function enviarRecordatoriosClasesProximas(desdeISO: string, hastaISO: string) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  const { data: sesionesRaw, error } = await admin
    .from('sesiones')
    .select('id, studio_id, inicio, tipo_clase_id, sala_id, instructor_id')
    .eq('cancelada', false)
    .gte('inicio', desdeISO)
    .lt('inicio', hastaISO);
  if (error) throw new Error(error.message);
  const sesiones = sesionesRaw ?? [];
  if (sesiones.length === 0) return { sesiones: 0, enviados: 0, fallidos: 0, sinEmail: 0 };

  const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.filter(Boolean) as string[])];
  const sesionIds = sesiones.map(s => s.id as string);

  const [{ data: tiposR }, { data: salasR }, { data: instR }, { data: studiosR }, { data: reservasR }] = await Promise.all([
    admin.from('tipos_clase').select('id, nombre').in('id', uniq(sesiones.map(s => s.tipo_clase_id as string))),
    admin.from('salas').select('id, nombre').in('id', uniq(sesiones.map(s => s.sala_id as string))),
    admin.from('instructores').select('id, nombre').in('id', uniq(sesiones.map(s => s.instructor_id as string))),
    admin.from('studios').select('id, nombre').in('id', uniq(sesiones.map(s => s.studio_id as string))),
    admin.from('reservas').select('sesion_id, socio_id').in('sesion_id', sesionIds).in('estado', ['CONFIRMADA', 'ASISTIDA']),
  ]);
  const reservas = reservasR ?? [];

  const socioIds = uniq(reservas.map(r => r.socio_id as string));
  const [{ data: sociosR }, { data: prefsR }] = socioIds.length
    ? await Promise.all([
        admin.from('socios').select('id, nombre, email, telefono').in('id', socioIds),
        admin.from('preferencias_socio').select('socio_id, notif_email, notif_whatsapp').in('socio_id', socioIds),
      ])
    : [{ data: [] as { id: string; nombre: string | null; email: string | null; telefono: string | null }[] }, { data: [] as { socio_id: string; notif_email: boolean | null; notif_whatsapp: boolean | null }[] }];
  const prefsPorSocio = new Map((prefsR ?? []).map(p => [p.socio_id, p]));

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
  const whatsappDisponible = isWhatsAppConfigurado();

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
      const prefs = prefsPorSocio.get(r.socio_id);
      const quiereEmail = prefs?.notif_email ?? true;
      const quiereWhatsapp = prefs?.notif_whatsapp ?? true;

      if (quiereEmail) {
        if (!socia.email) {
          sinEmail++;
        } else {
          const res = await enviarEmailTransaccional({
            tipo: 'recordatorio', to: socia.email, toName: socia.nombre ?? 'Socia', data: datos,
            studioId: ses.studio_id as string,
            idempotencyKey: `recordatorio-${ses.id}-${r.socio_id}`,
          });
          if (res.ok) enviados++;
          else if ('error' in res) fallidos++;
        }
      }

      if (quiereWhatsapp && whatsappDisponible && socia.telefono) {
        const texto = `Recordatorio · ${datos.estudioNombre}\nTienes ${datos.claseNombre} el ${datos.fecha} a las ${datos.hora}${datos.sala ? ` en ${datos.sala}` : ''}.`;
        const res = await enviarWhatsAppTexto(socia.telefono, texto);
        if (res.ok) enviadosWhatsapp++;
        else fallidosWhatsapp++;
      }
    }
  }

  return { sesiones: sesiones.length, enviados, fallidos, sinEmail, enviadosWhatsapp, fallidosWhatsapp };
}
