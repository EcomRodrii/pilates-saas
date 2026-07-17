// AUTO-GENERADO desde supabase/schema.sql — filas de BD (snake_case).
// Regenerar con: python3 scripts/gen-db-types.py  (no editar a mano).
/* eslint-disable @typescript-eslint/no-explicit-any */

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
  tema_portal: string | null;
  logo_url: string | null;
  iva_por_defecto: number | null;
  dep_umbral_alto: number | null;
  dep_umbral_medio: number | null;
  dep_ventana_dias: number | null;
  plan: string | null;
  avatar_admin: string | null;
  owner_auth_user_id: string | null;
  slug: string | null;
  creado_en: string | null;
  stripe_account_id: string | null;
  stripe_customer_id: string | null;
  subscription_id: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  stripe_terminal_reader_id: string | null;
  stripe_terminal_location_id: string | null;
  cancelacion_ventana_horas: number | null;
  cancelacion_devolver_bono_tardia: boolean | null;
  reserva_exigir_plan: boolean | null;
  reserva_max_simultaneas: number | null;
  google_calendar_email: string | null;
}

export interface RowSocios {
  id: string;
  studio_id: string | null;
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
  avatar: string | null;
  auth_user_id: string | null;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  fecha_nacimiento: string | null;
  direccion: string | null;
  foto_url: string | null;
  referido_por: string | null;
  campos_extra: Record<string, string | number | boolean | null> | null;
}

export interface RowInstructorDependencySnapshots {
  id: string;
  studio_id: string | null;
  instructor_id: string | null;
  periodo_inicio: string | null;
  periodo_fin: string | null;
  ventana_dias: number | null;
  alumnas_total: number | null;
  alumnas_cautivas_count: number | null;
  ingresos_cautivos: number | null;
  ingresos_total_estudio: number | null;
  porcentaje_facturacion: number | null;
  nivel_riesgo: string | null;
  detalle: Array<{ socioId: string; nombre: string; gasto: number; pctConInstructor: number }> | null;
  calculado_en: string | null;
}

export interface RowCamposPersonalizados {
  id: string;
  studio_id: string | null;
  etiqueta: string;
  tipo: string | null;
  opciones: string[] | null;
  requerido: boolean | null;
  orden: number | null;
  activo: boolean | null;
  creado_en: string | null;
}

export interface RowPlantillasEmail {
  id: string;
  studio_id: string | null;
  tipo: string;
  asunto: string | null;
  intro: string | null;
  activa: boolean | null;
  actualizado_en: string | null;
}

export interface RowPlanesTarifa {
  id: string;
  studio_id: string | null;
  nombre: string;
  descripcion: string | null;
  precio: number;
  tipo: string;
  sesiones: number | null;
  activo: boolean | null;
}

export interface RowSuscripciones {
  id: string;
  studio_id: string | null;
  socio_id: string | null;
  plan_id: string | null;
  estado: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  sesiones_restantes: number | null;
  stripe_subscription_id: string | null;
}

export interface RowSalas {
  id: string;
  studio_id: string | null;
  nombre: string;
  capacidad: number;
  color: string | null;
}

export interface RowSpots {
  id: string;
  sala_id: string | null;
  studio_id: string | null;
  numero: number;
  nombre: string | null;
  fila: number | null;
  columna: number | null;
  tipo: string | null;
  activo: boolean | null;
}

export interface RowTiposClase {
  id: string;
  studio_id: string | null;
  nombre: string;
  color: string | null;
  duracion_minutos: number | null;
  descripcion: string | null;
  nivel: string | null;
  foto_url: string | null;
}

export interface RowInstructores {
  id: string;
  studio_id: string | null;
  nombre: string;
  email: string | null;
  telefono: string | null;
  color: string | null;
  activo: boolean | null;
  avatar: string | null;
  rol: string | null;
  auth_user_id: string | null;
}

export interface RowSesiones {
  id: string;
  studio_id: string | null;
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
}

export interface RowReservas {
  id: string;
  studio_id: string | null;
  sesion_id: string | null;
  socio_id: string | null;
  estado: string;
  spot_id: string | null;
  posicion_espera: number | null;
  check_in_en: string | null;
  creado_en: string | null;
}

export interface RowRecibos {
  id: string;
  studio_id: string | null;
  socio_id: string | null;
  suscripcion_id: string | null;
  concepto: string;
  importe: number;
  estado: string;
  fecha_vencimiento: string;
  fecha_cobro: string | null;
  fecha_devolucion: string | null;
  intentos_reintento: number | null;
}

export interface RowFacturas {
  id: string;
  studio_id: string | null;
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

export interface RowCitas {
  id: string;
  studio_id: string | null;
  socio_id: string | null;
  instructor_id: string | null;
  tipo: string;
  inicio: string;
  fin: string;
  notas: string | null;
  estado: string;
  precio: number | null;
  pagada: boolean | null;
  creado_en: string | null;
}

export interface RowProductosPos {
  id: string;
  studio_id: string | null;
  nombre: string;
  categoria: string;
  precio: number;
  activo: boolean | null;
}

export interface RowVentasPos {
  id: string;
  studio_id: string | null;
  socio_id: string | null;
  items: any;
  subtotal: number;
  descuento: number | null;
  total: number;
  metodo_pago: string;
  notas: string | null;
  realizada_en: string | null;
}

export interface RowCampanas {
  id: string;
  studio_id: string | null;
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
}

export interface RowAutomatizaciones {
  id: string;
  studio_id: string | null;
  nombre: string;
  trigger: string;
  accion: string;
  asunto: string | null;
  mensaje: string | null;
  activa: boolean | null;
  ejecutadas: number | null;
  creada_en: string | null;
}

export interface RowAutomationRules {
  id: string;
  studio_id: string | null;
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

export interface RowAutomationLogs {
  id: string;
  studio_id: string | null;
  rule_id: string | null;
  rule_name: string | null;
  socio_id: string | null;
  socio_nombre: string | null;
  paso_index: number | null;
  accion: string | null;
  resultado: string | null;
  detalle: string | null;
  ejecutado_en: string | null;
  proxima_accion_en: string | null;
  recibo_id: string | null;
}

export interface RowCodigosDescuento {
  id: string;
  studio_id: string | null;
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

export interface RowActividadReciente {
  id: string;
  studio_id: string | null;
  tipo: string;
  texto: string;
  socio_id: string | null;
  enlace: string | null;
  creado_en: string | null;
  actor_nombre: string | null;
}

export interface RowCanalesEquipo {
  id: string;
  studio_id: string | null;
  nombre: string;
  creado_en: string | null;
}

export interface RowMensajesEquipo {
  id: string;
  studio_id: string | null;
  canal_id: string | null;
  autor_instructor_id: string | null;
  autor_nombre: string;
  texto: string;
  creado_en: string | null;
}

export interface RowNotificaciones {
  id: string;
  studio_id: string | null;
  titulo: string;
  texto: string;
  leida: boolean | null;
  tipo: string | null;
  enlace: string | null;
  creada_en: string | null;
}

export interface RowVideosOnDemand {
  id: string;
  studio_id: string | null;
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

export interface RowPostsComunidad {
  id: string;
  studio_id: string | null;
  autor_id: string | null;
  autor_nombre: string;
  autor_inicial: string | null;
  texto: string;
  likes: number | null;
  comentarios_count: number | null;
  fijado: boolean | null;
  creado_en: string | null;
}

export interface RowNotasInternas {
  id: string;
  studio_id: string | null;
  socio_id: string | null;
  texto: string;
  tipo: string | null;
  creado_en: string | null;
}

export interface RowNotasProgreso {
  id: string;
  studio_id: string | null;
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

export interface RowIntegraciones {
  id: string;
  studio_id: string;
  tipo: string;
  activo: boolean;
  config: any;
  actualizado_en: string;
}

export interface RowPreferenciasSocio {
  socio_id: string;
  studio_id: string | null;
  disponibilidad: any;
  instructor_favorito_id: string | null;
  tipo_clase_favorita: string | null;
  duracion_preferida: number | null;
  nivel: string | null;
  notif_email: boolean;
  notif_whatsapp: boolean;
  actualizado_en: string;
}

export interface RowRewardRules {
  id: string;
  studio_id: string | null;
  trigger: string;
  nombre: string;
  descripcion: string | null;
  creditos: number;
  activa: boolean;
  creado_en: string;
  tope_mensual: number | null;
}

export interface RowRewardActions {
  id: string;
  studio_id: string | null;
  socio_id: string | null;
  trigger: string;
  ref_id: string | null;
  creado_en: string;
}

export interface RowRewardHistory {
  id: string;
  studio_id: string | null;
  socio_id: string | null;
  rule_id: string | null;
  action_id: string | null;
  creditos: number;
  descripcion: string;
  creado_en: string;
}

export interface RowCreditTransactions {
  id: string;
  studio_id: string | null;
  socio_id: string | null;
  tipo: string;
  creditos: number;
  descripcion: string;
  ref_id: string | null;
  creado_en: string;
}

export interface RowMemberCredits {
  socio_id: string;
  studio_id: string | null;
  saldo: number;
  total_ganado: number;
  total_canjeado: number;
  actualizado_en: string;
}

export interface RowRewardCatalog {
  id: string;
  studio_id: string | null;
  nombre: string;
  descripcion: string | null;
  coste_creditos: number;
  icono: string;
  activo: boolean;
  stock: number | null;
  creado_en: string;
}

export interface RowRewardRedemptions {
  id: string;
  studio_id: string | null;
  socio_id: string | null;
  catalog_item_id: string | null;
  creditos_gastados: number;
  estado: string;
  creado_en: string;
}

export interface RowAchievementDefinitions {
  id: string;
  studio_id: string | null;
  metric: string;
  nombre: string;
  descripcion: string | null;
  umbral: number;
  icono: string;
  creditos_recompensa: number;
  activo: boolean;
  creado_en: string;
}

export interface RowAchievementProgress {
  id: string;
  studio_id: string | null;
  socio_id: string | null;
  achievement_id: string | null;
  progreso_actual: number;
  completado: boolean;
  completado_en: string | null;
}

export interface RowAchievementHistory {
  id: string;
  studio_id: string | null;
  socio_id: string | null;
  achievement_id: string | null;
  nombre: string;
  icono: string;
  creado_en: string;
}

export interface RowLevelDefinitions {
  id: string;
  studio_id: string | null;
  nombre: string;
  orden: number;
  umbral_creditos: number;
  color: string;
  icono: string;
  beneficios: string | null;
  activo: boolean;
  creado_en: string;
}

export interface RowChallengeDefinitions {
  id: string;
  studio_id: string | null;
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

export interface RowChallengeProgress {
  id: string;
  studio_id: string | null;
  socio_id: string | null;
  challenge_id: string | null;
  progreso_actual: number;
  completado: boolean;
  completado_en: string | null;
}

export interface RowChallengeHistory {
  id: string;
  studio_id: string | null;
  socio_id: string | null;
  challenge_id: string | null;
  nombre: string;
  icono: string;
  creado_en: string;
}

export interface RowDashboardCharts {
  id: string;
  studio_id: string | null;
  nombre: string;
  tipo: string;
  metrica: string;
  agrupacion: string;
  rango: number;
  color: string;
  creado_en: string;
}

export interface RowBackups {
  id: string;
  studio_id: string | null;
  tipo: string;
  datos: any;
  creado_en: string;
}

export interface RowSoporteSolicitudes {
  id: string;
  studio_id: string | null;
  tipo: string;
  mensaje: string;
  contacto: string | null;
  creado_en: string;
}

export interface RowIntegracionCredenciales {
  studio_id: string | null;
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  actualizado_en: string | null;
}

// NOTA: usuarios no está en schema.sql (lo consume supabase-data). Se mantiene a
// mano hasta reconciliar el modelo; el generador no lo produce.
export interface RowUsuarios {
  id: string;
  studio_id: string | null;
  rol: string | null;
  nombre: string | null;
  email: string | null;
  telefono: string | null;
  avatar_url: string | null;
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
  creado_en: string;
  actualizado_en: string;
}

export interface RowRespuestasSesion {
  id: string;
  studio_id: string;
  socio_id: string;
  sesion_id: string | null;
  respuesta: string;
  nota: string | null;
  creado_por: string | null;
  creado_en: string;
}
