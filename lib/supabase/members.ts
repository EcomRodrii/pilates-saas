import { supabase } from '@/lib/db/supabase';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { uid } from '@/lib/utils';
import type {
  RowSocios,
  RowCamposPersonalizados,
  RowPlantillasEmail,
  RowInstructorDependencySnapshots,
  RowPlanesTarifa,
  RowRewardRules,
  RowRewardActions,
  RowRewardHistory,
  RowCreditTransactions,
  RowMemberCredits,
  RowRewardCatalog,
  RowRewardRedemptions,
  RowAchievementDefinitions,
  RowAchievementProgress,
  RowAchievementHistory,
  RowLevelDefinitions,
  RowChallengeDefinitions,
  RowChallengeProgress,
  RowChallengeHistory,
  RowDashboardCharts,
  RowAutomationLogs,
  RowAutomationRules,
  RowNotasProgreso,
  RowCodigosDescuento,
  RowNotasInternas,
  RowCondicionesSalud,
  RowRespuestasSesion,
  RowCampanas,
  RowAutomatizaciones,
  RowVideosOnDemand,
  RowPostsComunidad,
  RowIntegraciones,
  RowActividadReciente,
  RowMensajesEquipo,
  RowCanalesEquipo,
  RowTiposClase,
} from '@/lib/db-types';
import type {
  Socio,
  CampoPersonalizado,
  PlantillaEmail,
  InstructorDependencySnapshot,
  PlanTarifa,
  RewardRule,
  RewardAction,
  RewardHistory,
  CreditTransaction,
  MemberCredits,
  RewardCatalogItem,
  RewardRedemption,
  AchievementDefinition,
  AchievementProgress,
  AchievementHistory,
  LevelDefinition,
  ChallengeDefinition,
  ChallengeProgress,
  ChallengeHistory,
  DashboardChart,
  AutomationLog,
  AutomationRule,
  NotaProgreso,
  CodigoDescuento,
  NotaInterna,
  CondicionSalud,
  RespuestaSesionRow,
  Campana,
  Automatizacion,
  VideoOnDemand,
  PostComunidad,
  ComentarioComunidad,
  Integracion,
  ActividadReciente,
  MensajeEquipo,
  CanalEquipo,
  TipoClase,
} from '@/lib/types';
import { getCurrentStudioId, STUDIO_ID } from './studios';

function reportDbError(tag: string, error: unknown) {
  console.error(tag, error);
}

// Mappers for read operations
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

function _mapMensajeEquipo(r: RowMensajesEquipo): MensajeEquipo {
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

function _mapCanalEquipo(r: RowCanalesEquipo): CanalEquipo {
  return {
    id: r.id,
    studioId: r.studio_id ?? '',
    nombre: r.nombre,
    creadoEn: r.creado_en ?? '',
  };
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

// Reverse mappers
function _socioToDb(socio: Socio) {
  const {
    aceptacionContrato, studioId, fechaAlta, leadStage,
    stripeCustomerId, stripePaymentMethodId, fechaNacimiento, fotoUrl, referidoPor,
    metodoPagoPreferido, sepaMandateId, sepaPaymentMethodId,
    camposExtra,
    ...rest
  } = socio;
  return {
    ...rest,
    studio_id: studioId ?? getCurrentStudioId(),
    fecha_alta: fechaAlta,
    lead_stage: leadStage ?? null,
    stripe_customer_id: stripeCustomerId ?? null,
    stripe_payment_method_id: stripePaymentMethodId ?? null,
    metodo_pago_preferido: metodoPagoPreferido ?? 'TARJETA',
    sepa_mandate_id: sepaMandateId ?? null,
    sepa_payment_method_id: sepaPaymentMethodId ?? null,
    fecha_nacimiento: fechaNacimiento ?? null,
    foto_url: fotoUrl ?? null,
    referido_por: referidoPor ?? null,
    campos_extra: camposExtra ?? {},
    aceptacion_fecha: aceptacionContrato?.fecha ?? null,
    aceptacion_firma: aceptacionContrato?.firma ?? null,
    aceptacion_version: aceptacionContrato?.versionTexto ?? null,
  };
}

function _campoToDb(c: CampoPersonalizado) {
  return {
    id: c.id,
    studio_id: c.studioId ?? getCurrentStudioId(),
    etiqueta: c.etiqueta,
    tipo: c.tipo,
    opciones: c.opciones ?? [],
    requerido: c.requerido,
    orden: c.orden,
    activo: c.activo,
  };
}

function _planTarifaToDb(plan: PlanTarifa) {
  return {
    id: plan.id,
    studio_id: plan.studioId ?? getCurrentStudioId(),
    nombre: plan.nombre,
    descripcion: plan.descripcion ?? null,
    precio: plan.precio,
    tipo: plan.tipo,
    sesiones: plan.sesiones ?? null,
    activo: plan.activo,
  };
}

function _notaProgresoToDb(n: NotaProgreso) {
  return {
    id: n.id,
    studio_id: n.studioId ?? getCurrentStudioId(),
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

function _codigoDescuentoToDb(c: CodigoDescuento) {
  return {
    id: c.id,
    studio_id: c.studioId ?? getCurrentStudioId(),
    codigo: c.codigo,
    descripcion: c.descripcion,
    tipo: c.tipo,
    valor: c.valor,
    usos: c.usos,
    usos_max: c.usosMax,
    expira: c.expira,
    activo: c.activo,
    creado_en: c.creadoEn,
    min_importe: c.minImporte ?? null,
    solo_nuevas: c.soloNuevas ?? false,
  };
}

function _condicionSaludToDb(c: CondicionSalud) {
  return {
    id: c.id,
    studio_id: c.studioId ?? getCurrentStudioId(),
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

function _respuestaSesionToDb(r: RespuestaSesionRow) {
  return {
    id: r.id,
    studio_id: r.studioId ?? getCurrentStudioId(),
    socio_id: r.socioId,
    sesion_id: r.sesionId,
    respuesta: r.respuesta,
    nota: r.nota,
    creado_por: r.creadoPor,
    creado_en: r.creadoEn,
  };
}

function _notaInternaToDb(nota: NotaInterna) {
  return {
    id: nota.id,
    studio_id: nota.studioId ?? getCurrentStudioId(),
    socio_id: nota.socioId,
    texto: nota.texto,
    tipo: nota.tipo,
    creado_en: nota.creadoEn,
  };
}

function _campanaToDb(c: Campana) {
  return {
    id: c.id,
    studio_id: c.studioId ?? getCurrentStudioId(),
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
    objetivo: c.objetivo ?? null,
    presupuesto: c.presupuesto ?? null,
    publicaciones: c.publicaciones ?? null,
  };
}

function _automatizacionToDb(a: Automatizacion) {
  return {
    id: a.id,
    studio_id: a.studioId ?? getCurrentStudioId(),
    nombre: a.nombre,
    trigger: a.trigger,
    accion: a.accion,
    asunto: a.asunto ?? null,
    mensaje: a.mensaje,
    activa: a.activa,
    ejecutadas: a.ejecutadas,
    creada_en: a.creadaEn,
    pasos: a.pasos ?? null,
  };
}

function _videoOnDemandToDb(v: VideoOnDemand) {
  return {
    id: v.id,
    studio_id: v.studioId ?? getCurrentStudioId(),
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
    stream_uid: v.streamUid ?? null,
  };
}

function _postComunidadToDb(p: PostComunidad) {
  return {
    id: p.id,
    studio_id: p.studioId ?? getCurrentStudioId(),
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

function _mensajeEquipoToDb(m: MensajeEquipo) {
  return {
    id: m.id,
    studio_id: m.studioId ?? getCurrentStudioId(),
    canal_id: m.canalId,
    autor_instructor_id: m.autorInstructorId ?? null,
    autor_nombre: m.autorNombre,
    texto: m.texto,
    creado_en: m.creadoEn,
  };
}

function _actividadRecienteToDb(act: ActividadReciente) {
  return {
    id: act.id,
    studio_id: act.studioId ?? getCurrentStudioId(),
    tipo: act.tipo,
    texto: act.texto,
    socio_id: act.socioId ?? null,
    enlace: act.enlace ?? null,
    creado_en: act.creadoEn,
    actor_nombre: act.actorNombre ?? null,
  };
}

// ─── Member CRUD ────────────────────────────────────────────────────────────

export async function dbInsertSocio(socio: Socio) {
  const { error } = await supabase.from('socios').insert(_socioToDb(socio));
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
  if ('metodoPagoPreferido' in changes) db.metodo_pago_preferido = changes.metodoPagoPreferido;
  if ('sepaMandateId' in changes) db.sepa_mandate_id = changes.sepaMandateId;
  if ('sepaPaymentMethodId' in changes) db.sepa_payment_method_id = changes.sepaPaymentMethodId;
  if ('fechaNacimiento' in changes) db.fecha_nacimiento = changes.fechaNacimiento;
  if ('direccion' in changes) db.direccion = changes.direccion;
  if ('fotoUrl' in changes) db.foto_url = changes.fotoUrl;
  if ('referidoPor' in changes) db.referido_por = changes.referidoPor;
  if ('camposExtra' in changes) db.campos_extra = changes.camposExtra ?? {};
  if ('aceptacionContrato' in changes) {
    db.aceptacion_fecha = changes.aceptacionContrato?.fecha ?? null;
    db.aceptacion_firma = changes.aceptacionContrato?.firma ?? null;
    db.aceptacion_version = changes.aceptacionContrato?.versionTexto ?? null;
  }
  const { error } = await supabase.from('socios').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateSocio]', error);
}

export async function dbDeleteSocio(id: string) {
  try {
    const res = await fetch('/api/socios/eliminar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ socioId: id }),
    });
    if (!res.ok) reportDbError('[dbDeleteSocio]', await res.json().catch(() => ({ status: res.status })));
  } catch (e) {
    reportDbError('[dbDeleteSocio]', e);
  }
}

// ─── Custom fields ──────────────────────────────────────────────────────────

export async function dbFetchCamposPersonalizados(): Promise<CampoPersonalizado[]> {
  const { data, error } = await supabase
    .from('campos_personalizados')
    .select('*')
    .order('orden', { ascending: true });
  if (error) { reportDbError('[dbFetchCamposPersonalizados]', error); return []; }
  return (data ?? []).map(_mapCampoPersonalizado);
}

export async function dbInsertCampoPersonalizado(campo: CampoPersonalizado) {
  const { error } = await supabase.from('campos_personalizados').insert(_campoToDb(campo));
  if (error) reportDbError('[dbInsertCampoPersonalizado]', error);
  return !error;
}

export async function dbUpdateCampoPersonalizado(id: string, changes: Partial<CampoPersonalizado>) {
  const db: Record<string, unknown> = {};
  if ('etiqueta' in changes) db.etiqueta = changes.etiqueta;
  if ('tipo' in changes) db.tipo = changes.tipo;
  if ('opciones' in changes) db.opciones = changes.opciones ?? [];
  if ('requerido' in changes) db.requerido = changes.requerido;
  if ('orden' in changes) db.orden = changes.orden;
  if ('activo' in changes) db.activo = changes.activo;
  const { error } = await supabase.from('campos_personalizados').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateCampoPersonalizado]', error);
}

export async function dbDeleteCampoPersonalizado(id: string) {
  const { error } = await supabase.from('campos_personalizados').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteCampoPersonalizado]', error);
}

// ─── Instructor dependency ──────────────────────────────────────────────────

export async function dbFetchDependencySnapshots(): Promise<InstructorDependencySnapshot[]> {
  const { data, error } = await supabase
    .from('instructor_dependency_snapshots')
    .select('*');
  if (error) { reportDbError('[dbFetchDependencySnapshots]', error); return []; }
  return (data ?? []).map(_mapDependencySnapshot);
}

// ─── Email templates ────────────────────────────────────────────────────────

export async function dbFetchPlantillasEmail(): Promise<PlantillaEmail[]> {
  const { data, error } = await supabase.from('plantillas_email').select('*');
  if (error) { reportDbError('[dbFetchPlantillasEmail]', error); return []; }
  return (data ?? []).map(_mapPlantillaEmail);
}

export async function dbUpsertPlantillaEmail(p: PlantillaEmail) {
  const { error } = await supabase.from('plantillas_email').upsert({
    id: p.id,
    studio_id: p.studioId ?? getCurrentStudioId(),
    tipo: p.tipo,
    asunto: p.asunto,
    intro: p.intro,
    activa: p.activa,
    actualizado_en: new Date().toISOString(),
  }, { onConflict: 'studio_id,tipo' });
  if (error) reportDbError('[dbUpsertPlantillaEmail]', error);
}

// ─── Community comments ──────────────────────────────────────────────────────

export async function dbListComentariosComunidad(): Promise<ComentarioComunidad[]> {
  try {
    const res = await fetch('/api/comunidad/comentarios', {
      headers: {},
    });
    if (!res.ok) {
      reportDbError('[dbListComentariosComunidad]', await res.json().catch(() => ({ status: res.status })));
      return [];
    }
    const data = (await res.json()) as { comentarios?: ComentarioComunidad[] };
    return data.comentarios ?? [];
  } catch (e) {
    reportDbError('[dbListComentariosComunidad]', e);
    return [];
  }
}

export async function dbAddComentarioComunidad(postId: string, texto: string): Promise<ComentarioComunidad | null> {
  try {
    const res = await fetch('/api/comunidad/comentarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId, texto }),
    });
    if (!res.ok) {
      reportDbError('[dbAddComentarioComunidad]', await res.json().catch(() => ({ status: res.status })));
      return null;
    }
    const data = (await res.json()) as { comentario?: ComentarioComunidad };
    return data.comentario ?? null;
  } catch (e) {
    reportDbError('[dbAddComentarioComunidad]', e);
    return null;
  }
}

// ─── Plans CRUD ──────────────────────────────────────────────────────────────

export async function dbInsertPlanTarifa(plan: PlanTarifa) {
  const { error } = await supabase.from('planes_tarifa').insert(_planTarifaToDb(plan));
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

// ─── Reward Rules ───────────────────────────────────────────────────────────

export async function dbInsertRewardRule(r: RewardRule) {
  const row = {
    id: r.id, studio_id: r.studioId ?? getCurrentStudioId(), trigger: r.trigger, nombre: r.nombre,
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

// ─── Reward Claims ──────────────────────────────────────────────────────────

export async function dbClaimRecompensaUnica(
  studioId: string, socioId: string, trigger: string, refId: string,
): Promise<boolean> {
  const { error } = await supabase.from('reward_actions').insert({
    id: `rwa-${uid()}`, studio_id: studioId, socio_id: socioId, trigger, ref_id: refId,
    creado_en: new Date().toISOString(),
  });
  return !error;
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
    id: h.id, studio_id: h.studioId ?? getCurrentStudioId(), socio_id: h.socioId, rule_id: h.ruleId,
    action_id: h.actionId, creditos: h.creditos, descripcion: h.descripcion, creado_en: h.creadoEn,
  };
  const { error } = await supabase.from('reward_history').insert(row);
  if (error) reportDbError('[dbInsertRewardHistory]', error);
}

export async function dbInsertCreditTransaction(t: CreditTransaction) {
  const row = {
    id: t.id, studio_id: t.studioId ?? getCurrentStudioId(), socio_id: t.socioId, tipo: t.tipo,
    creditos: t.creditos, descripcion: t.descripcion, ref_id: t.refId ?? null, creado_en: t.creadoEn,
  };
  const { error } = await supabase.from('credit_transactions').insert(row);
  if (error) reportDbError('[dbInsertCreditTransaction]', error);
}

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

export async function dbConsumirSesionBono(
  suscripcionId: string, studioId: string,
): Promise<{ ok: true; saldo: number } | { error: string }> {
  const { data, error } = await supabase.rpc('consumir_sesion_bono', {
    p_suscripcion_id: suscripcionId, p_studio_id: studioId,
  });
  if (error) {
    reportDbError('[dbConsumirSesionBono]', error);
    return { error: error.message };
  }
  if (data == null) return { error: 'SIN_SESION' };
  return { ok: true, saldo: data as number };
}

export async function dbUpsertMemberCredits(m: MemberCredits) {
  const row = {
    socio_id: m.socioId, studio_id: m.studioId ?? getCurrentStudioId(), saldo: m.saldo,
    total_ganado: m.totalGanado, total_canjeado: m.totalCanjeado, actualizado_en: new Date().toISOString(),
  };
  const { error } = await supabase.from('member_credits').upsert(row, { onConflict: 'socio_id' });
  if (error) reportDbError('[dbUpsertMemberCredits]', error);
}

// ─── Reward Catalog CRUD ────────────────────────────────────────────────────

export async function dbInsertRewardCatalogItem(c: RewardCatalogItem) {
  const row = {
    id: c.id, studio_id: c.studioId ?? getCurrentStudioId(), nombre: c.nombre, descripcion: c.descripcion ?? null,
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
    id: r.id, studio_id: r.studioId ?? getCurrentStudioId(), socio_id: r.socioId, catalog_item_id: r.catalogItemId,
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

// ─── Achievements ───────────────────────────────────────────────────────────

export async function dbInsertAchievementDefinition(a: AchievementDefinition) {
  const row = {
    id: a.id, studio_id: a.studioId ?? getCurrentStudioId(), metric: a.metric, nombre: a.nombre,
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
    id: p.id, studio_id: p.studioId ?? getCurrentStudioId(), socio_id: p.socioId, achievement_id: p.achievementId,
    progreso_actual: p.progresoActual, completado: p.completado, completado_en: p.completadoEn ?? null,
  };
  const { error } = await supabase.from('achievement_progress').upsert(row, { onConflict: 'socio_id,achievement_id' });
  if (error) reportDbError('[dbUpsertAchievementProgress]', error);
}

export async function dbInsertAchievementHistory(h: AchievementHistory) {
  const row = {
    id: h.id, studio_id: h.studioId ?? getCurrentStudioId(), socio_id: h.socioId, achievement_id: h.achievementId,
    nombre: h.nombre, icono: h.icono, creado_en: h.creadoEn,
  };
  const { error } = await supabase.from('achievement_history').insert(row);
  if (error) reportDbError('[dbInsertAchievementHistory]', error);
}

// ─── Levels ─────────────────────────────────────────────────────────────────

export async function dbInsertLevelDefinition(l: LevelDefinition) {
  const row = {
    id: l.id, studio_id: l.studioId ?? getCurrentStudioId(), nombre: l.nombre, orden: l.orden,
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

// ─── Challenges ─────────────────────────────────────────────────────────────

export async function dbInsertChallengeDefinition(c: ChallengeDefinition) {
  const row = {
    id: c.id, studio_id: c.studioId ?? getCurrentStudioId(), nombre: c.nombre, descripcion: c.descripcion ?? null,
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
    id: p.id, studio_id: p.studioId ?? getCurrentStudioId(), socio_id: p.socioId, challenge_id: p.challengeId,
    progreso_actual: p.progresoActual, completado: p.completado, completado_en: p.completadoEn ?? null,
  };
  const { error } = await supabase.from('challenge_progress').upsert(row, { onConflict: 'socio_id,challenge_id' });
  if (error) reportDbError('[dbUpsertChallengeProgress]', error);
}

export async function dbInsertChallengeHistory(h: ChallengeHistory) {
  const row = {
    id: h.id, studio_id: h.studioId ?? getCurrentStudioId(), socio_id: h.socioId, challenge_id: h.challengeId,
    nombre: h.nombre, icono: h.icono, creado_en: h.creadoEn,
  };
  const { error } = await supabase.from('challenge_history').insert(row);
  if (error) reportDbError('[dbInsertChallengeHistory]', error);
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export async function dbInsertDashboardChart(c: DashboardChart) {
  const row = {
    id: c.id, studio_id: c.studioId ?? getCurrentStudioId(), nombre: c.nombre, tipo: c.tipo,
    metrica: c.metrica, agrupacion: c.agrupacion, rango: c.rango, color: c.color, creado_en: c.creadoEn,
  };
  const { error } = await supabase.from('dashboard_charts').insert(row);
  if (error) reportDbError('[dbInsertDashboardChart]', error);
}

export async function dbDeleteDashboardChart(id: string) {
  const { error } = await supabase.from('dashboard_charts').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteDashboardChart]', error);
}

// ─── Automation ──────────────────────────────────────────────────────────────

export async function dbInsertAutomationLog(log: AutomationLog) {
  const row = {
    id: log.id,
    studio_id: log.studioId ?? getCurrentStudioId(),
    rule_id: log.ruleId ?? null,
    automatizacion_id: log.automatizacionId ?? null,
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

export async function dbUpsertAutomationLog(log: AutomationLog) {
  const admin = getSupabaseAdmin() ?? supabase;
  const row = {
    id: log.id,
    studio_id: log.studioId ?? getCurrentStudioId(),
    rule_id: log.ruleId ?? null,
    automatizacion_id: log.automatizacionId ?? null,
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
  const { error } = await admin.from('automation_logs').upsert(row, { onConflict: 'id' });
  if (error) reportDbError('[dbUpsertAutomationLog]', error);
}

export async function dbUpdateAutomationLog(id: string, changes: Partial<AutomationLog>) {
  const db: Record<string, unknown> = {};
  if ('resultado' in changes) db.resultado = changes.resultado;
  if ('detalle' in changes) db.detalle = changes.detalle;
  if ('proximaAccionEn' in changes) db.proxima_accion_en = changes.proximaAccionEn;
  const admin = getSupabaseAdmin() ?? supabase;
  const { error } = await admin.from('automation_logs').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateAutomationLog]', error);
}

export async function dbInsertAutomationRule(r: AutomationRule) {
  const row = {
    id: r.id, studio_id: r.studioId ?? getCurrentStudioId(), nombre: r.nombre, descripcion: r.descripcion,
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
  const admin = getSupabaseAdmin() ?? supabase;
  const { error } = await admin.from('automation_rules').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateAutomationRule]', error);
}

// ─── Notes ──────────────────────────────────────────────────────────────────

export async function dbInsertNotaProgreso(nota: NotaProgreso) {
  const { error } = await supabase.from('notas_progreso').insert(_notaProgresoToDb(nota));
  if (error) reportDbError('[dbInsertNotaProgreso]', error);
}

export async function dbInsertNotaInterna(nota: NotaInterna) {
  const { error } = await supabase.from('notas_internas').insert(_notaInternaToDb(nota));
  if (error) reportDbError('[dbInsertNotaInterna]', error);
}

export async function dbDeleteNotaInterna(id: string) {
  const { error } = await supabase.from('notas_internas').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteNotaInterna]', error);
}

// ─── Discount codes ──────────────────────────────────────────────────────────

export async function dbInsertCodigoDescuento(c: CodigoDescuento) {
  const { error } = await supabase.from('codigos_descuento').insert(_codigoDescuentoToDb(c));
  if (error) reportDbError('[dbInsertCodigoDescuento]', error);
}

export async function dbUpdateCodigoDescuento(id: string, changes: Partial<CodigoDescuento>) {
  const db: Record<string, unknown> = {};
  if ('activo' in changes) db.activo = changes.activo;
  if ('usos' in changes) db.usos = changes.usos;
  if ('minImporte' in changes) db.min_importe = changes.minImporte;
  if ('soloNuevas' in changes) db.solo_nuevas = changes.soloNuevas;
  const { error } = await supabase.from('codigos_descuento').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateCodigoDescuento]', error);
}

export async function dbConsumirCodigoDescuento(id: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('consumir_codigo_descuento', { p_codigo_id: id });
  if (error) { reportDbError('[dbConsumirCodigoDescuento]', error); return null; }
  return typeof data === 'number' ? data : null;
}

export async function dbDeleteCodigoDescuento(id: string) {
  const { error } = await supabase.from('codigos_descuento').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteCodigoDescuento]', error);
}

// ─── Health conditions ──────────────────────────────────────────────────────

export async function dbInsertCondicion(c: CondicionSalud) {
  const { error } = await supabase.from('condiciones_salud').insert(_condicionSaludToDb(c));
  if (error) reportDbError('[dbInsertCondicion]', error);
}

export async function dbUpdateCondicion(id: string, changes: Partial<CondicionSalud>) {
  const parcial = _condicionSaludToDb({ id, ...changes } as CondicionSalud);
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

// ─── Session responses ──────────────────────────────────────────────────────

export async function dbInsertRespuestaSesion(r: RespuestaSesionRow) {
  const { error } = await supabase.from('respuestas_sesion').insert(_respuestaSesionToDb(r));
  if (error) reportDbError('[dbInsertRespuestaSesion]', error);
}

export async function dbUpdateRespuestaSesion(id: string, changes: Partial<Pick<RespuestaSesionRow, 'respuesta' | 'nota'>>) {
  const { error } = await supabase.from('respuestas_sesion').update(changes).eq('id', id);
  if (error) reportDbError('[dbUpdateRespuestaSesion]', error);
}

// ─── Campaigns ──────────────────────────────────────────────────────────────

export async function dbInsertCampana(c: Campana) {
  const { error } = await supabase.from('campanas').insert(_campanaToDb(c));
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
  if ('objetivo' in changes) db.objetivo = changes.objetivo;
  if ('presupuesto' in changes) db.presupuesto = changes.presupuesto;
  if ('publicaciones' in changes) db.publicaciones = changes.publicaciones;
  const { error } = await supabase.from('campanas').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateCampana]', error);
}

export async function dbDeleteCampana(id: string) {
  const { error } = await supabase.from('campanas').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteCampana]', error);
}

// ─── Automations (legacy) ────────────────────────────────────────────────────

export async function dbInsertAutomatizacion(a: Automatizacion) {
  const { error } = await supabase.from('automatizaciones').insert(_automatizacionToDb(a));
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
  if ('pasos' in changes) db.pasos = changes.pasos;
  const admin = getSupabaseAdmin() ?? supabase;
  const { error } = await admin.from('automatizaciones').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateAutomatizacion]', error);
}

export async function dbDeleteAutomatizacion(id: string) {
  const { error } = await supabase.from('automatizaciones').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteAutomatizacion]', error);
}

// ─── Videos ─────────────────────────────────────────────────────────────────

export async function dbInsertVideoOnDemand(v: VideoOnDemand) {
  const { error } = await supabase.from('videos_on_demand').insert(_videoOnDemandToDb(v));
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
  if ('streamUid' in changes) db.stream_uid = changes.streamUid;
  const { error } = await supabase.from('videos_on_demand').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateVideoOnDemand]', error);
}

export async function dbDeleteVideoOnDemand(id: string) {
  const { error } = await supabase.from('videos_on_demand').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteVideoOnDemand]', error);
}

// ─── Community posts ────────────────────────────────────────────────────────

export async function dbInsertPostComunidad(p: PostComunidad) {
  const { error } = await supabase.from('posts_comunidad').insert(_postComunidadToDb(p));
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

export async function dbToggleLikePost(
  postId: string,
  studioId: string,
): Promise<{ liked: boolean; likes: number } | null> {
  const { data, error } = await supabase.rpc('toggle_like_post', { p_post_id: postId, p_studio_id: studioId });
  if (error) {
    reportDbError('[dbToggleLikePost]', error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return { liked: !!row.liked, likes: Number(row.likes ?? 0) };
}

export async function dbMisLikesComunidad(): Promise<string[]> {
  const { data, error } = await supabase.rpc('mis_likes_comunidad');
  if (error) {
    reportDbError('[dbMisLikesComunidad]', error);
    return [];
  }
  return (data as string[] | null) ?? [];
}

export async function dbDeletePostComunidad(id: string) {
  const { error } = await supabase.from('posts_comunidad').delete().eq('id', id);
  if (error) reportDbError('[dbDeletePostComunidad]', error);
}

// ─── Integrations ───────────────────────────────────────────────────────────

export async function dbUpsertIntegracion(intg: Integracion) {
  const row = {
    id: intg.id,
    studio_id: intg.studioId ?? getCurrentStudioId(),
    tipo: intg.tipo,
    activo: intg.activo,
    config: intg.config ?? {},
    actualizado_en: intg.actualizadoEn,
  };
  const { error } = await supabase.from('integraciones').upsert(row, { onConflict: 'studio_id,tipo' });
  if (error) reportDbError('[dbUpsertIntegracion]', error);
}

// ─── Activity & Team ─────────────────────────────────────────────────────────

export async function dbInsertActividadReciente(act: ActividadReciente) {
  const { error } = await supabase.from('actividad_reciente').insert(_actividadRecienteToDb(act));
  if (error) reportDbError('[dbInsertActividadReciente]', error);
}

export async function dbListMensajesEquipo(canalId: string, limite = 200): Promise<MensajeEquipo[]> {
  const { data, error } = await supabase
    .from('mensajes_equipo')
    .select('*')
    .eq('studio_id', getCurrentStudioId())
    .eq('canal_id', canalId)
    .order('creado_en', { ascending: false })
    .limit(limite);
  if (error) {
    reportDbError('[dbListMensajesEquipo]', error);
    return [];
  }
  return (data ?? []).map(_mapMensajeEquipo).reverse();
}

export async function dbListCanalesEquipo(): Promise<CanalEquipo[]> {
  const { data, error } = await supabase
    .from('canales_equipo')
    .select('*')
    .eq('studio_id', getCurrentStudioId())
    .order('creado_en', { ascending: true });
  if (error) {
    reportDbError('[dbListCanalesEquipo]', error);
    return [];
  }
  return (data ?? []).map(_mapCanalEquipo);
}

export async function dbCreateCanalEquipo(canal: CanalEquipo): Promise<boolean> {
  const { error } = await supabase.from('canales_equipo').insert({
    id: canal.id,
    studio_id: canal.studioId,
    nombre: canal.nombre,
    creado_en: canal.creadoEn,
  });
  if (error) {
    reportDbError('[dbCreateCanalEquipo]', error);
    return false;
  }
  return true;
}

export async function dbInsertMensajeEquipo(m: MensajeEquipo): Promise<boolean> {
  const { error } = await supabase.from('mensajes_equipo').insert(_mensajeEquipoToDb(m));
  if (error) {
    reportDbError('[dbInsertMensajeEquipo]', error);
    return false;
  }
  return true;
}

// ─── Class types ────────────────────────────────────────────────────────────

export async function dbInsertTipoClase(t: TipoClase) {
  const row = {
    id: t.id, studio_id: t.studioId ?? getCurrentStudioId(), nombre: t.nombre, color: t.color,
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

// ─── Support ────────────────────────────────────────────────────────────────

export async function dbInsertSoporteSolicitud(s: { id: string; tipo: string; mensaje: string; contacto: string | null; creadoEn: string }) {
  const row = {
    id: s.id, studio_id: getCurrentStudioId(), tipo: s.tipo, mensaje: s.mensaje,
    contacto: s.contacto, creado_en: s.creadoEn,
  };
  const { error } = await supabase.from('soporte_solicitudes').insert(row);
  if (error) reportDbError('[dbInsertSoporteSolicitud]', error);
}
