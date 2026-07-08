import { supabase } from '@/lib/supabase';
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

export function getCurrentStudioId() {
  return STUDIO_ID;
}

// Looks up which studio a just-authenticated user belongs to: first as a
// claimed team member (instructores.auth_user_id), then as an owner
// (studios.owner_auth_user_id). Returns null if neither matches (a brand
// new signup that hasn't created or joined a studio yet).
export async function resolveStudioId(userId: string): Promise<string | null> {
  const { data: instructor } = await supabase
    .from('instructores')
    .select('studio_id')
    .eq('auth_user_id', userId)
    .maybeSingle();
  if (instructor?.studio_id) return instructor.studio_id;

  const { data: studio } = await supabase
    .from('studios')
    .select('id')
    .eq('owner_auth_user_id', userId)
    .maybeSingle();
  if (studio?.id) return studio.id;

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
    plan: r.plan,
    avatarAdmin: r.avatar_admin ?? null,
    ownerAuthUserId: r.owner_auth_user_id ?? null,
    slug: r.slug ?? null,
    creadoEn: r.creado_en,
    stripeAccountId: r.stripe_account_id ?? null,
  } as Studio;
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

// ─── Fetch all studio data in parallel ───────────────────────────────────────

export async function fetchAllStudioData() {
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
    notasProgresoRes,
    codigosDescuentoRes,
    actividadRecienteRes,
    notificacionesRes,
    videosOnDemandRes,
    postsComunidadRes,
    notasInternasRes,
    integracionesRes,
    mensajesEquipoRes,
    preferenciasSocioRes,
    rewardRulesRes,
    rewardActionsRes,
    rewardHistoryRes,
    creditTransactionsRes,
    memberCreditsRes,
    rewardCatalogRes,
    rewardRedemptionsRes,
    achievementDefinitionsRes,
    achievementProgressRes,
    achievementHistoryRes,
    levelDefinitionsRes,
    challengeDefinitionsRes,
    challengeProgressRes,
    challengeHistoryRes,
    dashboardChartsRes,
    backupsRes,
  ] = await Promise.all([
    supabase.from('studios').select('*').eq('id', STUDIO_ID).single(),
    supabase.from('usuarios').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('socios').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('planes_tarifa').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('suscripciones').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('salas').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('spots').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('tipos_clase').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('instructores').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('sesiones').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('reservas').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('recibos').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('facturas').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('citas').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('productos_pos').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('ventas_pos').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('campanas').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('automatizaciones').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('automation_rules').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('automation_logs').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('notas_progreso').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('codigos_descuento').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('actividad_reciente').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('notificaciones').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('videos_on_demand').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('posts_comunidad').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('notas_internas').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('integraciones').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('mensajes_equipo').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('preferencias_socio').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('reward_rules').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('reward_actions').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('reward_history').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('credit_transactions').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('member_credits').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('reward_catalog').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('reward_redemptions').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('achievement_definitions').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('achievement_progress').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('achievement_history').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('level_definitions').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('challenge_definitions').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('challenge_progress').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('challenge_history').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('dashboard_charts').select('*').eq('studio_id', STUDIO_ID),
    supabase.from('backups').select('id, studio_id, tipo, creado_en').eq('studio_id', STUDIO_ID).order('creado_en', { ascending: false }),
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
    notasProgreso: (notasProgresoRes.data ?? []).map(mapNotaProgreso),
    codigosDescuento: (codigosDescuentoRes.data ?? []).map(mapCodigoDescuento),
    actividadReciente: (actividadRecienteRes.data ?? []).map(mapActividadReciente),
    notificaciones: (notificacionesRes.data ?? []).map(mapNotificacion),
    videosOnDemand: (videosOnDemandRes.data ?? []).map(mapVideoOnDemand),
    postsComunidad: (postsComunidadRes.data ?? []).map(mapPostComunidad),
    notasInternas: (notasInternasRes.data ?? []).map(mapNotaInterna),
    integraciones: (integracionesRes.data ?? []).map(mapIntegracion),
    mensajesEquipo: (mensajesEquipoRes.data ?? []).map(mapMensajeEquipo),
    preferenciasSocio: (preferenciasSocioRes.data ?? []).map(mapPreferenciasSocio),
    rewardRules: (rewardRulesRes.data ?? []).map(mapRewardRule),
    rewardActions: (rewardActionsRes.data ?? []).map(mapRewardAction),
    rewardHistory: (rewardHistoryRes.data ?? []).map(mapRewardHistory),
    creditTransactions: (creditTransactionsRes.data ?? []).map(mapCreditTransaction),
    memberCredits: (memberCreditsRes.data ?? []).map(mapMemberCredits),
    rewardCatalog: (rewardCatalogRes.data ?? []).map(mapRewardCatalogItem),
    rewardRedemptions: (rewardRedemptionsRes.data ?? []).map(mapRewardRedemption),
    achievementDefinitions: (achievementDefinitionsRes.data ?? []).map(mapAchievementDefinition),
    achievementProgress: (achievementProgressRes.data ?? []).map(mapAchievementProgress),
    achievementHistory: (achievementHistoryRes.data ?? []).map(mapAchievementHistory),
    levelDefinitions: (levelDefinitionsRes.data ?? []).map(mapLevelDefinition),
    challengeDefinitions: (challengeDefinitionsRes.data ?? []).map(mapChallengeDefinition),
    challengeProgress: (challengeProgressRes.data ?? []).map(mapChallengeProgress),
    challengeHistory: (challengeHistoryRes.data ?? []).map(mapChallengeHistory),
    dashboardCharts: (dashboardChartsRes.data ?? []).map(mapDashboardChart),
    // La query de backups usa un select estrecho (excluye la columna 'datos'
    // pesada); afirmamos la fila para el mapper.
    backups: (backupsRes.data ?? []).map(r => mapBackupMeta(r as RowBackups)),
  };
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

export async function dbInsertFactura(fac: Factura) {
  const { error } = await supabase.from('facturas').insert(facturaToDb(fac));
  if (error) reportDbError('[dbInsertFactura]', error);
}

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

export async function dbInsertNotaInterna(nota: NotaInterna) {
  const { error } = await supabase.from('notas_internas').insert(notaInternaToDb(nota));
  if (error) reportDbError('[dbInsertNotaInterna]', error);
}

export async function dbDeleteNotaInterna(id: string) {
  const { error } = await supabase.from('notas_internas').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteNotaInterna]', error);
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

export async function dbInsertInstructor(i: Instructor) {
  const row = {
    id: i.id,
    studio_id: i.studioId ?? STUDIO_ID,
    nombre: i.nombre,
    email: i.email ?? null,
    telefono: i.telefono ?? null,
    color: i.color,
    activo: i.activo,
    avatar: i.avatar ?? null,
    rol: i.rol ?? 'INSTRUCTOR',
    auth_user_id: i.authUserId ?? null,
  };
  const { error } = await supabase.from('instructores').insert(row);
  if (error) reportDbError('[dbInsertInstructor]', error);
}

export async function dbUpdateInstructor(id: string, changes: Partial<Instructor>) {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('email' in changes) db.email = changes.email;
  if ('telefono' in changes) db.telefono = changes.telefono;
  if ('color' in changes) db.color = changes.color;
  if ('activo' in changes) db.activo = changes.activo;
  if ('avatar' in changes) db.avatar = changes.avatar;
  if ('rol' in changes) db.rol = changes.rol;
  if ('authUserId' in changes) db.auth_user_id = changes.authUserId;
  const { error } = await supabase.from('instructores').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateInstructor]', error);
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
  if ('avatarAdmin' in changes) db.avatar_admin = changes.avatarAdmin;
  const { error } = await supabase.from('studios').update(db).eq('id', STUDIO_ID);
  if (error) reportDbError('[dbUpdateStudio]', error);
}

// Toma el id explícito (no el STUDIO_ID de la sesión del navegador) porque la
// llama el callback de OAuth de Stripe Connect, un servidor sin sesión.
export async function dbSetStripeAccountId(studioId: string, stripeAccountId: string | null) {
  const { error } = await supabase.from('studios').update({ stripe_account_id: stripeAccountId }).eq('id', studioId);
  if (error) reportDbError('[dbSetStripeAccountId]', error);
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
  const { error } = await supabase.from('instructores').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteInstructor]', error);
}
