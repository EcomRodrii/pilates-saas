// AUTO-GENERADO desde supabase/migrations/*.sql — filas de BD (snake_case).
// Regenerar con: python3 scripts/gen-db-types.py  (no editar a mano).
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RowReservas {
  id: string;
  studio_id: string;
  sesion_id: string | null;
  socio_id: string | null;
  estado: string;
  spot_id: string | null;
  posicion_espera: number | null;
  check_in_en: string | null;
  creado_en: string | null;
}

export interface RowAchievementDefinitions {
  id: string;
  studio_id: string;
  metric: string;
  nombre: string;
  descripcion: string | null;
  umbral: number;
  icono: string;
  creditos_recompensa: number;
  activo: boolean;
  creado_en: string;
}

export interface RowAchievementHistory {
  id: string;
  studio_id: string;
  socio_id: string | null;
  achievement_id: string | null;
  nombre: string;
  icono: string;
  creado_en: string;
}

export interface RowAchievementProgress {
  id: string;
  studio_id: string;
  socio_id: string | null;
  achievement_id: string | null;
  progreso_actual: number;
  completado: boolean;
  completado_en: string | null;
}

export interface RowActividadReciente {
  id: string;
  studio_id: string;
  tipo: string;
  texto: string;
  socio_id: string | null;
  enlace: string | null;
  creado_en: string | null;
  actor_nombre: string | null;
}

export interface RowAutomationLogs {
  id: string;
  studio_id: string;
  rule_id: string | null;
  rule_name: string | null;
  socio_id: string | null;
  socio_nombre: string | null;
  paso_index: number | null;
  accion: string | null;
  resultado: string | null;
  detalle: string | null;
  mensaje_cliente: string | null;
  ejecutado_en: string | null;
  proxima_accion_en: string | null;
  recibo_id: string | null;
  automatizacion_id: string | null;
}

export interface RowAutomationRules {
  id: string;
  studio_id: string;
  nombre: string;
  descripcion: string | null;
  icono: string | null;
  trigger: string;
  condicion: any | null;
  pasos: any | null;
  activa: boolean | null;
  ejecutada_veces: number | null;
  ultima_ejecucion: string | null;
  creada_en: string | null;
}

export interface RowAutomatizaciones {
  id: string;
  studio_id: string;
  nombre: string;
  trigger: string;
  accion: string;
  asunto: string | null;
  mensaje: string | null;
  activa: boolean | null;
  ejecutadas: number | null;
  creada_en: string | null;
  pasos: unknown | null;
}

export interface RowBackups {
  id: string;
  studio_id: string;
  tipo: string;
  datos: any;
  creado_en: string;
  storage_key: string | null;
}

export interface RowCampanas {
  id: string;
  studio_id: string;
  nombre: string;
  tipo: string;
  asunto: string | null;
  contenido: string | null;
  estado: string | null;
  destinatarios: string | null;
  enviados: number | null;
  abiertos: number | null;
  clics: number | null;
  creada_en: string | null;
  enviada_en: string | null;
  programada_en: string | null;
  objetivo: string | null;
  presupuesto: number | null;
  publicaciones: unknown | null;
}

export interface RowChallengeDefinitions {
  id: string;
  studio_id: string;
  nombre: string;
  descripcion: string | null;
  icono: string;
  metric: string;
  objetivo: number;
  fecha_inicio: string;
  fecha_fin: string;
  creditos_recompensa: number;
  activo: boolean;
  creado_en: string;
}

export interface RowChallengeHistory {
  id: string;
  studio_id: string;
  socio_id: string | null;
  challenge_id: string | null;
  nombre: string;
  icono: string;
  creado_en: string;
}

export interface RowChallengeProgress {
  id: string;
  studio_id: string;
  socio_id: string | null;
  challenge_id: string | null;
  progreso_actual: number;
  completado: boolean;
  completado_en: string | null;
}

export interface RowCitas {
  id: string;
  studio_id: string;
  socio_id: string | null;
  instructor_id: string | null;
  tipo: string;
  inicio: string;
  fin: string;
  notas: string | null;
  estado: string;
  precio: number | null;
  creado_en: string | null;
  pagada: boolean | null;
  servicio_id: string | null;
}

export interface RowCodigosDescuento {
  id: string;
  studio_id: string;
  codigo: string;
  descripcion: string | null;
  tipo: string;
  valor: number;
  usos: number | null;
  usos_max: number | null;
  expira: string | null;
  activo: boolean | null;
  creado_en: string | null;
  min_importe: number | null;
  solo_nuevas: boolean | null;
}

export interface RowCreditTransactions {
  id: string;
  studio_id: string;
  socio_id: string | null;
  tipo: string;
  creditos: number;
  descripcion: string;
  ref_id: string | null;
  creado_en: string;
}

export interface RowDashboardCharts {
  id: string;
  studio_id: string;
  nombre: string;
  tipo: string;
  metrica: string;
  agrupacion: string;
  rango: number;
  color: string;
  creado_en: string;
}

export interface RowFacturas {
  id: string;
  studio_id: string;
  recibo_id: string | null;
  numero_completo: string;
  fecha_emision: string;
  receptor_nombre: string | null;
  receptor_nif: string | null;
  base_imponible: number | null;
  tipo_iva: number | null;
  cuota_iva: number | null;
  total: number | null;
  verifactu_hash: string | null;
  verifactu_prev_hash: string | null;
  verifactu_ts: string | null;
  verifactu_seq: number | null;
}

export interface RowIngresosManuales {
  id: string;
  studio_id: string;
  fecha: string;
  concepto: string;
  cliente: string | null;
  nif: string | null;
  base_imponible: number;
  tipo_iva: number;
  cuota_iva: number;
  total: number;
  nota: string | null;
  creado_en: string;
}

export interface RowInstructores {
  id: string;
  studio_id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  color: string | null;
  activo: boolean | null;
  rol: string | null;
  auth_user_id: string | null;
  avatar: string | null;
  foto_url: string | null;
}

export interface RowIntegracionCredenciales {
  studio_id: string;
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  actualizado_en: string | null;
}

export interface RowIntegraciones {
  id: string;
  studio_id: string;
  tipo: string;
  activo: boolean;
  config: any;
  actualizado_en: string;
}

export interface RowLevelDefinitions {
  id: string;
  studio_id: string;
  nombre: string;
  orden: number;
  umbral_creditos: number;
  color: string;
  icono: string;
  beneficios: string | null;
  activo: boolean;
  creado_en: string;
}

export interface RowMemberCredits {
  socio_id: string;
  studio_id: string;
  saldo: number;
  total_ganado: number;
  total_canjeado: number;
  actualizado_en: string;
}

export interface RowMensajesEquipo {
  id: string;
  studio_id: string;
  autor_instructor_id: string | null;
  autor_nombre: string;
  texto: string;
  creado_en: string | null;
  canal_id: string | null;
}

export interface RowNotasInternas {
  id: string;
  studio_id: string;
  socio_id: string | null;
  texto: string;
  tipo: string | null;
  creado_en: string | null;
}

export interface RowNotasProgreso {
  id: string;
  studio_id: string;
  socio_id: string | null;
  instructor_id: string | null;
  sesion_id: string | null;
  texto_libre: string | null;
  progreso: string | null;
  alertas: string | null;
  plan_proxima_sesion: string | null;
  ejercicios_casa: string | null;
  creada_en: string | null;
}

export interface RowNotificaciones {
  id: string;
  studio_id: string;
  titulo: string;
  texto: string;
  leida: boolean | null;
  tipo: string | null;
  enlace: string | null;
  creada_en: string | null;
}

export interface RowPlanesTarifa {
  id: string;
  studio_id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  tipo: string;
  sesiones: number | null;
  validez_dias: number | null;
  limite_semanal: number | null;
  activo: boolean | null;
}

export interface RowCongelaciones {
  id: string;
  studio_id: string;
  suscripcion_id: string;
  desde: string;
  hasta: string | null;
  dias_aplicados: number | null;
  motivo: string | null;
  creada_en: string;
}

export interface RowPostsComunidad {
  id: string;
  studio_id: string;
  autor_id: string | null;
  autor_nombre: string;
  autor_inicial: string | null;
  texto: string;
  likes: number | null;
  comentarios_count: number | null;
  fijado: boolean | null;
  creado_en: string | null;
}

export interface RowPreferenciasSocio {
  socio_id: string;
  studio_id: string;
  disponibilidad: any;
  instructor_favorito_id: string | null;
  tipo_clase_favorita: string | null;
  duracion_preferida: number | null;
  nivel: string | null;
  notif_email: boolean;
  notif_whatsapp: boolean;
  actualizado_en: string;
}

export interface RowProductosPos {
  id: string;
  studio_id: string;
  nombre: string;
  categoria: string;
  precio: number;
  activo: boolean | null;
}

export interface RowRecibos {
  id: string;
  studio_id: string;
  socio_id: string | null;
  suscripcion_id: string | null;
  concepto: string;
  importe: number;
  estado: string;
  fecha_vencimiento: string;
  fecha_cobro: string | null;
  fecha_devolucion: string | null;
  intentos_reintento: number | null;
  metodo_cobro: string | null;
  sepa_estado: string | null;
  proximo_reintento: string | null;
}

export interface RowRewardActions {
  id: string;
  studio_id: string;
  socio_id: string | null;
  trigger: string;
  ref_id: string | null;
  creado_en: string;
}

export interface RowRewardCatalog {
  id: string;
  studio_id: string;
  nombre: string;
  descripcion: string | null;
  coste_creditos: number;
  icono: string;
  activo: boolean;
  stock: number | null;
  creado_en: string;
}

export interface RowRewardHistory {
  id: string;
  studio_id: string;
  socio_id: string | null;
  rule_id: string | null;
  action_id: string | null;
  creditos: number;
  descripcion: string;
  creado_en: string;
}

export interface RowRewardRedemptions {
  id: string;
  studio_id: string;
  socio_id: string | null;
  catalog_item_id: string | null;
  creditos_gastados: number;
  estado: string;
  creado_en: string;
}

export interface RowRewardRules {
  id: string;
  studio_id: string;
  trigger: string;
  nombre: string;
  descripcion: string | null;
  creditos: number;
  activa: boolean;
  creado_en: string;
  tope_mensual: number | null;
}

export interface RowSalas {
  id: string;
  studio_id: string;
  nombre: string;
  capacidad: number;
  color: string | null;
}

export interface RowBloqueosMaquina {
  id: string;
  studio_id: string;
  sala_id: string;
  spot_id: string | null;
  desde: string;
  hasta: string | null;
  motivo: string | null;
  creado_en: string;
}

export interface RowPlazasFijas {
  id: string;
  studio_id: string;
  socio_id: string;
  dia_semana: number;
  hora_inicio: string;
  sala_id: string;
  tipo_clase_id: string | null;
  spot_id: string | null;
  vigencia_desde: string;
  vigencia_hasta: string | null;
  estado: string;
  creada_en: string;
}

export interface RowRecuperaciones {
  id: string;
  studio_id: string;
  socio_id: string;
  origen_reserva_id: string | null;
  motivo: string | null;
  caduca_el: string;
  estado: string;
  usada_en_reserva_id: string | null;
  creada_en: string;
}

export interface RowSocioExcepciones {
  id: string;
  studio_id: string;
  socio_id: string;
  tipo: string;
  motivo: string | null;
  creada_en: string;
}

export interface RowSesiones {
  id: string;
  studio_id: string;
  tipo_clase_id: string | null;
  sala_id: string | null;
  instructor_id: string | null;
  inicio: string;
  fin: string;
  aforo_maximo: number;
  cancelada: boolean | null;
  notas: string | null;
  precio_puntual: number | null;
  google_event_id: string | null;
  serie_id: string | null;
  valoracion_pedida_en: string | null;
}

export interface RowSocios {
  id: string;
  studio_id: string;
  nombre: string;
  apellidos: string;
  email: string;
  telefono: string | null;
  nif: string | null;
  fecha_alta: string | null;
  activo: boolean | null;
  lead_stage: string | null;
  tags: string[] | null;
  aceptacion_fecha: string | null;
  aceptacion_firma: string | null;
  aceptacion_version: string | null;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  avatar: string | null;
  referido_por: string | null;
  fecha_nacimiento: string | null;
  foto_url: string | null;
  auth_user_id: string | null;
  direccion: string | null;
  borrado_en: string | null;
  campos_extra: Record<string, string | number | boolean | null> | null;
  metodo_pago_preferido: string | null;
  sepa_mandate_id: string | null;
  sepa_payment_method_id: string | null;
}

export interface RowSoporteSolicitudes {
  id: string;
  studio_id: string;
  tipo: string;
  mensaje: string;
  contacto: string | null;
  creado_en: string;
}

export interface RowSpots {
  id: string;
  sala_id: string | null;
  studio_id: string;
  numero: number;
  nombre: string | null;
  fila: number | null;
  columna: number | null;
  tipo: string | null;
  activo: boolean | null;
}

export interface RowStudios {
  id: string;
  nombre: string;
  nif: string | null;
  razon_social: string | null;
  direccion: string | null;
  ciudad: string | null;
  codigo_postal: string | null;
  email: string | null;
  telefono: string | null;
  color_primario: string | null;
  plan: string | null;
  creado_en: string | null;
  owner_auth_user_id: string | null;
  slug: string | null;
  stripe_account_id: string | null;
  avatar_admin: string | null;
  foto_url: string | null;
  tema_portal: string | null;
  google_calendar_email: string | null;
  gmail_email: string | null;
  zoom_email: string | null;
  gestoria_email: string | null;
  cadena_id: string | null;
  cancelacion_ventana_horas: number | null;
  cancelacion_devolver_bono_tardia: boolean | null;
  reserva_exigir_plan: boolean | null;
  reserva_max_simultaneas: number | null;
  stripe_customer_id: string | null;
  subscription_id: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  kiosk_token: string | null;
  stripe_terminal_reader_id: string | null;
  stripe_terminal_location_id: string | null;
  logo_url: string | null;
  iva_por_defecto: number | null;
  dep_umbral_alto: number | null;
  dep_umbral_medio: number | null;
  dep_ventana_dias: number | null;
  modo_autonomia: string | null;
  umbral_score_autonomo: number | null;
  avisar_alumnas: boolean | null;
  onboarding_descartado_en: string | null;
  sepa_acreedor_id: string | null;
  sepa_iban: string | null;
  sepa_titular: string | null;
}

export interface RowMandatosSepa {
  id: string;
  studio_id: string;
  socio_id: string;
  iban: string;
  ref_mandato: string;
  fecha_firma: string;
  estado: string;
  creada_en: string;
}

export interface RowSuscripciones {
  id: string;
  studio_id: string;
  socio_id: string | null;
  plan_id: string | null;
  estado: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  sesiones_restantes: number | null;
  stripe_subscription_id: string | null;
}

export interface RowTiposClase {
  id: string;
  studio_id: string;
  nombre: string;
  color: string | null;
  duracion_minutos: number | null;
  descripcion: string | null;
  nivel: string | null;
  foto_url: string | null;
}

export interface RowUsuarios {
  id: string;
  studio_id: string | null;
  rol: string | null;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  avatar_url: string | null;
}

export interface RowVentasPos {
  id: string;
  studio_id: string;
  socio_id: string | null;
  items: any;
  subtotal: number;
  descuento: number | null;
  total: number;
  metodo_pago: string;
  notas: string | null;
  realizada_en: string | null;
  stripe_payment_intent_id: string | null;
}

export interface RowVideosOnDemand {
  id: string;
  studio_id: string;
  titulo: string;
  descripcion: string | null;
  categoria: string;
  duracion_minutos: number | null;
  nivel: string | null;
  instructor_id: string | null;
  vistas: number | null;
  likes: number | null;
  activo: boolean | null;
  creado_en: string | null;
  stream_uid: string | null;
}

export interface RowDecisionSessions {
  id: string;
  studio_id: string;
  disparado_por: string;
  algorithm_version: string;
  iniciado_en: string | null;
  finalizado_en: string | null;
  snapshot_stats: any | null;
  n_candidatas_generadas: number;
  n_candidatas_descartadas: number;
  n_recomendaciones_persistidas: number;
  resumen_diario_id: string | null;
  errores: any | null;
  estado: string;
}

export interface RowRecomendaciones {
  id: string;
  studio_id: string;
  decision_session_id: string;
  algorithm_version: string;
  especialista: string;
  tipo: string;
  dedupe_key: string;
  titulo: string;
  motivo: string;
  datos_usados: any;
  riesgo: string;
  impacto: any | null;
  confianza: any;
  score: number;
  prioridad: string;
  nivel_autonomia: number;
  accion: any;
  socio_id: string | null;
  sesion_id: string | null;
  recibo_id: string | null;
  tiempo_estimado_min: number;
  estado: string;
  vista_en: string | null;
  expira_en: string;
  creado_en: string | null;
  resuelto_en: string | null;
  resuelto_por: string | null;
}

export interface RowRecomendacionOutcomes {
  id: string;
  studio_id: string;
  recomendacion_id: string;
  evento: string;
  outcome: string;
  senal_observada: string | null;
  ventana_dias: number;
  medido_en: string | null;
  creado_en: string | null;
}

export interface RowMemoriaSocio {
  id: string;
  studio_id: string;
  socio_id: string;
  clave: string;
  valor: any;
  nivel: string;
  confianza: string;
  origen: string;
  creado_por: string | null;
  evidencia: string;
  activa: boolean;
  expira_en: string | null;
  creado_en: string | null;
  actualizado_en: string | null;
}

export interface RowResumenDiario {
  id: string;
  studio_id: string;
  fecha: string;
  estado_general: string;
  saludo: string;
  mientras_dormias: any;
  n_decisiones: number;
  tiempo_estimado_min: number;
  impacto_total: any | null;
  generado_en: string | null;
}

export interface RowDecisionFeatureFlags {
  id: string;
  studio_id: string;
  flag: string;
  activo: boolean;
  activado_en: string | null;
  activado_por: string | null;
  creado_en: string | null;
}

export interface RowCondicionesSalud {
  id: string;
  studio_id: string;
  socio_id: string;
  categoria: string;
  etiqueta: string;
  zona: string | null;
  restricciones: string[];
  severidad: string;
  estado: string;
  inicio: string;
  fin: string | null;
  revisar_en: string | null;
  notas: string | null;
  creado_por: string | null;
  creado_en: string | null;
  actualizado_en: string | null;
}

export interface RowRespuestasSesion {
  id: string;
  studio_id: string;
  socio_id: string;
  sesion_id: string | null;
  respuesta: string;
  nota: string | null;
  creado_por: string | null;
  creado_en: string | null;
}

export interface RowReconciliacionesPos {
  payment_intent_id: string;
  studio_id: string;
  importe: number;
  concepto: string | null;
  estado: string;
  venta_id: string | null;
  creado_en: string;
  reconciliado_en: string | null;
}

export interface RowComentariosComunidad {
  id: string;
  studio_id: string;
  post_id: string;
  autor_id: string | null;
  autor_nombre: string;
  autor_inicial: string | null;
  texto: string;
  creado_en: string | null;
}

export interface RowCamposPersonalizados {
  id: string;
  studio_id: string;
  etiqueta: string;
  tipo: string;
  opciones: string[] | null;
  requerido: boolean;
  orden: number;
  activo: boolean;
  creado_en: string | null;
}

export interface RowPlantillasEmail {
  id: string;
  studio_id: string;
  tipo: string;
  asunto: string | null;
  intro: string | null;
  activa: boolean;
  actualizado_en: string | null;
}

export interface RowInstructorDependencySnapshots {
  id: string;
  studio_id: string;
  instructor_id: string;
  periodo_inicio: string;
  periodo_fin: string;
  ventana_dias: number;
  alumnas_total: number;
  alumnas_cautivas_count: number;
  ingresos_cautivos: number;
  ingresos_total_estudio: number;
  porcentaje_facturacion: number;
  nivel_riesgo: string;
  detalle: Array<{ socioId: string; nombre: string; gasto: number; pctConInstructor: number }> | null;
  calculado_en: string | null;
}

export interface RowStudioTheme {
  studio_id: string;
  config_draft: any | null;
  config_published: any | null;
  actualizado_en: string | null;
  publicado_en: string | null;
}

export interface RowStudioLayout {
  studio_id: string;
  config: any | null;
  actualizado_en: string | null;
}

export interface RowPostLikes {
  post_id: string;
  user_id: string;
  studio_id: string;
  creado_en: string;
}

export interface RowCanalesEquipo {
  id: string;
  studio_id: string;
  nombre: string;
  creado_en: string;
}

export interface RowRateLimits {
  bucket_key: string;
  count: number;
  reset_at: string;
}

export interface RowWebhookEvents {
  id: string;
  tipo: string | null;
  recibido_en: string;
}

export interface RowInstructoraDisponibilidad {
  id: string;
  studio_id: string;
  instructor_id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  creado_en: string | null;
}

export interface RowInstructoraDisponibilidadExcepciones {
  id: string;
  studio_id: string;
  instructor_id: string;
  fecha: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  tipo: string;
  creado_en: string | null;
}

export interface RowSustituciones {
  id: string;
  studio_id: string;
  sesion_id: string;
  instructor_original_id: string | null;
  motivo: string | null;
  estado: string;
  ranking: any;
  candidata_actual: number;
  sustituta_final_id: string | null;
  aprobada_por: string | null;
  aprobada_at: string | null;
  creado_en: string | null;
  resuelto_en: string | null;
}

export interface RowSustitucionContactos {
  id: string;
  studio_id: string;
  sustitucion_id: string;
  instructor_id: string;
  canal: string;
  estado: string;
  token: string | null;
  enviado_en: string | null;
  respondido_en: string | null;
}

export interface RowValoraciones {
  id: string;
  studio_id: string;
  instructor_id: string;
  sesion_id: string;
  socio_id: string;
  puntuacion: number;
  comentario: string | null;
  creado_en: string | null;
}

export interface RowCitasServicios {
  id: string;
  studio_id: string;
  nombre: string;
  tipo: string;
  duracion_min: number;
  precio: number | null;
  auto_reservable: boolean;
  color: string | null;
  descripcion: string | null;
  activo: boolean;
  orden: number;
  creado_en: string | null;
}

export interface RowCitasDisponibilidad {
  id: string;
  studio_id: string;
  instructor_id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  creado_en: string | null;
}

export interface RowDecisionAutonomiaConfig {
  studio_id: string;
  activa: boolean;
  tipos_permitidos: string[];
  max_diario: number;
  actualizado_en: string | null;
  actualizado_por: string | null;
}
