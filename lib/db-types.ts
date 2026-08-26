// AUTO-GENERADO desde supabase/migrations/*.sql — filas de BD (snake_case).
// Regenerar con: python3 scripts/gen-db-types.py  (no editar a mano:
// las correcciones van en TIPOS_MANUALES/NOTAS_MANUALES dentro del script).
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
  // migr 0059.
  confirmacion_pedida_en: string | null;
  // migr 0059.
  confirmado_en: string | null;
  // migr 0065.
  recordatorio_confirmacion_en: string | null;
  // migr 20260730204404.
  oferta_expira_en: string | null;
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
  ejecutado_en: string | null;
  proxima_accion_en: string | null;
  recibo_id: string | null;
  // migr 0053.
  automatizacion_id: string | null;
  // migr 0062.
  mensaje_cliente: string | null;
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
  // migr 0034.
  pasos: unknown | null;
}

export interface RowBackups {
  id: string;
  studio_id: string;
  tipo: string;
  datos: any;
  creado_en: string;
  // migr 0002.
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
  // migr 0033.
  objetivo: string | null;
  // migr 0033.
  presupuesto: number | null;
  // migr 0034.
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
  // migr 0024.
  pagada: boolean | null;
  // migr 0046.
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
  // migr 0033.
  min_importe: number | null;
  // migr 0033.
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
  // migr 0085.
  fiskaly_invoice_id: string | null;
  // migr 0085.
  verifactu_qr_url: string | null;
  // migr 0085.
  verifactu_qr_imagen: string | null;
  // migr 0085.
  verifactu_estado: string | null;
  // migr 0085.
  verifactu_csv: string | null;
  // migr 20260812121955.
  serie: string | null;
  // migr 20260812121955.
  tipo: string | null;
  // migr 20260812121955.
  rectifica_a: string | null;
  // migr 20260812121955.
  tipo_rectificativa: string | null;
  // migr 20260812121955.
  importe_rectificacion: number | null;
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
  // migr 0071.
  foto_url: string | null;
  // migr 20260811222916.
  bio: string | null;
  // migr 20260817145031.
  tipo_contrato: string | null;
}

export interface RowIntegracionCredenciales {
  studio_id: string;
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  actualizado_en: string | null;
  // migr 20260813151635.
  metadata: any | null;
}

export interface RowIntegraciones {
  id: string;
  studio_id: string;
  tipo: string;
  activo: boolean;
  config: any;
  actualizado_en: string;
  // migr 20260818142206. Salud real del servicio (ver
  // lib/integraciones/salud.ts).
  ultimo_ok_en: string | null;
  // migr 20260818142206.
  ultimo_error: string | null;
  // migr 20260818142206.
  ultimo_error_en: string | null;
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
  // migr 0026.
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
  activo: boolean | null;
  // migr 0079.
  validez_dias: number | null;
  // migr 0079.
  limite_semanal: number | null;
  // migr 20260819202520.
  oferta_hasta: string | null;
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
  // migr 0036.
  metodo_cobro: string | null;
  // migr 0036.
  sepa_estado: string | null;
  // migr 0051.
  proximo_reintento: string | null;
  // migr 0140.
  disputa_estado: string | null;
  // migr 0140.
  disputa_stripe_id: string | null;
  // migr 20260731001721.
  stripe_payment_intent_id: string | null;
  // migr 20260806160000.
  entrega_tipo: string | null;
  // migr 20260806160000.
  entrega_aplicada: boolean | null;
  // migr 20260806160000.
  entrega_aplicada_en: string | null;
  // migr 20260806160000.
  entrega_sesiones_antes: number | null;
  // migr 20260806160000.
  entrega_sesiones_despues: number | null;
  // migr 20260806160000.
  entrega_fecha_fin_antes: string | null;
  // migr 20260806160000.
  entrega_fecha_fin_despues: string | null;
  // migr 20260806160000.
  entrega_estado_antes: string | null;
  // migr 20260806160000.
  importe_devuelto: number | null;
  // migr 20260811100957.
  reembolso_solicitado_en: string | null;
  // migr 20260811100957.
  reembolso_stripe_id: string | null;
  // migr 20260817214500.
  checkout_session_id: string | null;
  // migr 20260820182934.
  reembolso_fallido_en: string | null;
  // migr 20260820182934.
  reembolso_fallo_motivo: string | null;
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
  // migr 0044.
  valoracion_pedida_en: string | null;
  // migr 20260731140000.
  cancelada_motivo: string | null;
  // migr 20260731160000.
  incidencia_texto: string | null;
  // migr 20260820193428.
  zoom_meeting_id: number | null;
  // migr 20260820193428.
  zoom_join_url: string | null;
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
  // migr 0011.
  borrado_en: string | null;
  // migr 0015.
  campos_extra: Record<string, string | number | boolean | null> | null;
  // migr 0036.
  metodo_pago_preferido: string | null;
  // migr 0036.
  sepa_mandate_id: string | null;
  // migr 0036.
  sepa_payment_method_id: string | null;
  // migr 0109.
  aceptacion_origen: string | null;
  // migr 0109.
  aceptacion_por: string | null;
  // migr 0138.
  consentimiento_salud_fecha: string | null;
  // migr 0138.
  consentimiento_salud_registrado_por: string | null;
  // migr 20260804201830.
  consentimiento_salud_revocado_en: string | null;
  // migr 20260811090114.
  tarjeta_exp_mes: number | null;
  // migr 20260811090114.
  tarjeta_exp_anio: number | null;
  // migr 20260811090114.
  tarjeta_marca: string | null;
  // migr 20260811090114.
  tarjeta_ultimos4: string | null;
  // migr 20260812013920.
  origen_lead: string | null;
  // migr 20260813122718.
  consentimiento_marketing_en: string | null;
  // migr 20260813122718.
  consentimiento_marketing_texto: string | null;
  // migr 20260813122718.
  consentimiento_marketing_por: string | null;
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
  tema_portal: string | null;
  google_calendar_email: string | null;
  cancelacion_ventana_horas: number | null;
  cancelacion_devolver_bono_tardia: boolean | null;
  reserva_exigir_plan: boolean | null;
  reserva_max_simultaneas: number | null;
  stripe_customer_id: string | null;
  subscription_id: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  // migr 0007.
  kiosk_token: string | null;
  // migr 0008.
  stripe_terminal_reader_id: string | null;
  // migr 0008.
  stripe_terminal_location_id: string | null;
  // migr 0014.
  logo_url: string | null;
  // migr 0014.
  iva_por_defecto: number | null;
  // migr 0018.
  dep_umbral_alto: number | null;
  // migr 0018.
  dep_umbral_medio: number | null;
  // migr 0018.
  dep_ventana_dias: number | null;
  // migr 0039.
  modo_autonomia: string | null;
  // migr 0039.
  umbral_score_autonomo: number | null;
  // migr 0039.
  avisar_alumnas: boolean | null;
  // migr 0058.
  onboarding_descartado_en: string | null;
  // migr 0059.
  pedir_confirmacion_riesgo: boolean | null;
  // migr 0060.
  gmail_email: string | null;
  // migr 0061.
  zoom_email: string | null;
  // migr 0064.
  gestoria_email: string | null;
  // migr 0066.
  cadena_id: string | null;
  // migr 0071.
  foto_url: string | null;
  // migr 0085.
  fiskaly_signer_id: string | null;
  // migr 0085.
  fiskaly_client_id: string | null;
  // migr 0086.
  recuperacion_caducidad_tipo: string | null;
  // migr 0086.
  recuperacion_caducidad_dias: number | null;
  // migr 0090.
  sepa_acreedor_id: string | null;
  // migr 0090.
  sepa_iban: string | null;
  // migr 0090.
  sepa_titular: string | null;
  // migr 0107.
  politica_privacidad: string | null;
  // migr 0107.
  terminos_servicio: string | null;
  // migr 0110.
  compra_publica_modo: string | null;
  // migr 0123.
  como_nos_conocio: string | null;
  // migr 0127.
  bienvenida_vista_en: string | null;
  // migr 0127.
  onb_centros: string | null;
  // migr 0127.
  onb_software_anterior: string | null;
  // migr 0127.
  onb_alumnos_activos: string | null;
  // migr 0127.
  onb_importar_datos: string | null;
  // migr 0127.
  onb_prioridad: string[] | null;
  // migr 0127.
  onb_ayuda_alta: string | null;
  // migr 0134.
  descripcion: string | null;
  // migr 0134.
  anio_fundacion: number | null;
  // migr 20260725223957.
  suspendido_en: string | null;
  // migr 20260725223957.
  suspendido_motivo: string | null;
  // migr 20260725223957.
  suspendido_por: string | null;
  // migr 20260730152516.
  reserva_ventana_minima_minutos: number | null;
  // migr 20260730152516.
  reserva_antelacion_maxima_dias: number | null;
  // migr 20260730152516.
  permite_lista_espera: boolean | null;
  // migr 20260730192445.
  requiere_aprobacion: boolean | null;
  // migr 20260730204404.
  lista_espera_plazo_aceptacion_minutos: number | null;
  // migr 20260730225253.
  penalizacion_importe_eur: number | null;
  // migr 20260730225253.
  penalizacion_aplica_no_show: boolean | null;
  // migr 20260730225253.
  penalizacion_aplica_cancelacion_tardia: boolean | null;
  // migr 20260730225253.
  penalizacion_cobro_automatico: boolean | null;
  // migr 20260731123128.
  decision_contrato_visto_en: string | null;
  // migr 20260731140000.
  minimo_asistentes_por_clase: number | null;
  // migr 20260731160000.
  hora_apertura: string | null;
  // migr 20260731160000.
  hora_cierre: string | null;
  // migr 20260804180132.
  instructor_reparto_penalizacion_pct: number | null;
  // migr 20260805120000.
  tour_visto_en: string | null;
  // migr 20260807120000.
  portal_react: boolean | null;
  // migr 20260807134223.
  gestoria_envio_automatico: string | null;
  // migr 20260807134223.
  gestoria_ultimo_envio_periodo: string | null;
  // migr 20260809020328.
  requiere_checkin_qr: boolean | null;
  // migr 20260810140000.
  imagen_bienvenida_url: string | null;
  // migr 20260811091725.
  reembolsos_activos: boolean | null;
  // migr 20260811091725.
  reembolso_plazo_dias: number | null;
  // migr 20260811091725.
  reembolso_solo_sin_usar: boolean | null;
  // migr 20260811094419.
  pagina_publica_oculta: boolean | null;
  // migr 20260811094419.
  pagina_publica_clave_hash: string | null;
  // migr 20260812220000.
  tipo_cuenta: string | null;
  // migr 20260813004723.
  normas_texto: string | null;
  // migr 20260813151752.
  klaviyo_account_name: string | null;
  // migr 20260814140800.
  widget_dominios_autorizados: string[] | null;
  // migr 20260819110611. Fin de la prueba gratuita LOCAL de 7 días (sin
  // tarjeta). La fija el trigger `trg_arrancar_prueba_gratuita` al crear el
  // estudio, NUNCA el cliente. NULL = sin prueba local (los estudios
  // anteriores a la apertura al público), que no es lo mismo que una prueba
  // agotada — ver `estadoTrial()` en lib/billing/trial.ts.
  trial_ends_at: string | null;
  // migr 20260820100454. Última config del Widget Builder por tipo de
  // widget (solo comodidad del panel — la config efectiva viaja congelada
  // en el snippet copiado). NUNCA en studioPublico().
  widget_builder: Record<string, unknown> | null;
  // migr 20260821101500.
  sitio_web: string | null;
  // migr 20260821120000.
  review_boost_elegible_en: string | null;
  // migr 20260821120000.
  review_boost_mostrado_en: string | null;
  // migr 20260821120000.
  review_boost_pospuesto_en: string | null;
  // migr 20260821120000.
  review_boost_veces_mostrado: number | null;
  // migr 20260821143226.
  cancelacion_clase_devuelve_bono: boolean | null;
  // migr 20260824191258.
  lat: number | null;
  // migr 20260824191258.
  lng: number | null;
  // migr 20260824230506.
  visible_en_network: boolean | null;
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
  // migr 0116.
  ventana_cancelacion_horas: number | null;
  // migr 20260730152516.
  reserva_exigir_plan: boolean | null;
  // migr 20260730152516.
  reserva_ventana_minima_minutos: number | null;
  // migr 20260730152516.
  reserva_antelacion_maxima_dias: number | null;
  // migr 20260730152516.
  permite_lista_espera: boolean | null;
  // migr 20260730192445.
  requiere_aprobacion: boolean | null;
  // migr 20260730204404.
  lista_espera_plazo_aceptacion_minutos: number | null;
  // migr 20260730225253.
  penalizacion_importe_eur: number | null;
  // migr 20260731140000.
  minimo_asistentes_por_clase: number | null;
  // migr 20260811134019. `text[] not null default '{}'` — pero se declara
  // nullable aquí porque una fila leída con un `select` que no la pida
  // llega sin ella, y el mapper ya lo tolera.
  objetivos: string[] | null;
  // migr 20260818010302.
  especialidad_network: string | null;
  // migr 20260820193428.
  es_online: boolean | null;
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
  // migr 0036.
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
  // migr 0013.
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
  // migr 20260806213813.
  impacto_real: any | null;
  // migr 20260806213813.
  confianza_medicion: string | null;
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
  // migr 20260811005749.
  cuerpo: string | null;
  // migr 20260811005749.
  boton_texto: string | null;
  // migr 20260811005749.
  color_cabecera: string | null;
  // migr 20260811005749.
  color_boton: string | null;
  // migr 20260811005749.
  logo_url: string | null;
  // migr 20260811005749.
  pie: string | null;
  // migr 20260811005749.
  fuente: string | null;
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
  // migr 20260730012417.
  estado: string | null;
  // migr 20260730012417.
  reclamado_en: string | null;
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
  // migr 0101.
  ausencia_id: string | null;
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
  // migr 0056.
  origen: string | null;
  // migr 20260818010302. Sugerencia sin puntuar, aparte de `ranking`.
  candidatos_network: any;
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

export interface RowInstructorEnlacesVigentes {
  instructor_id: string;
  studio_id: string;
  scope: string;
  token: string;
  actualizado_en: string;
  // migr 0120.
  email_enviado_en: string | null;
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

export interface RowCadenas {
  id: string;
  nombre: string;
  owner_auth_user_id: string;
  plan: string | null;
  stripe_customer_id: string | null;
  subscription_id: string | null;
  subscription_status: string | null;
  current_period_end: string | null;
  creado_en: string;
  // migr 0108.
  layout_config: any | null;
}

export interface RowSesionActiva {
  auth_user_id: string;
  studio_id: string;
  actualizado_en: string;
}

export interface RowAvisosHueco {
  id: string;
  studio_id: string;
  sesion_id: string;
  socio_id: string;
  resultado: string;
  detalle: string | null;
  enviado_en: string;
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

export interface RowMigracionBatches {
  id: string;
  studio_id: string;
  creado_en: string;
  ids_creados: any;
  deshecho_en: string | null;
  resumen: any | null;
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

export interface RowNotification {
  id: string;
  studio_id: string;
  recipient_role: string;
  recipient_user_id: string | null;
  recipient_socio_id: string | null;
  recipient_instructor_id: string | null;
  event_type: string;
  category: string;
  priority: string;
  title: string;
  body: string;
  resource_type: string | null;
  resource_id: string | null;
  deep_link: string | null;
  data: any | null;
  dedup_key: string | null;
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface RowNotificationDelivery {
  id: string;
  notification_id: string;
  studio_id: string;
  channel: string;
  status: string;
  attempts: number;
  error: string | null;
  provider_id: string | null;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
}

export interface RowNotificationPreference {
  id: string;
  studio_id: string;
  user_id: string;
  category: string;
  inapp: boolean;
  push: boolean;
  email: boolean;
  whatsapp: boolean;
  sms: boolean;
  updated_at: string;
}

export interface RowPushSubscription {
  id: string;
  studio_id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  failure_count: number;
  created_at: string;
  last_used_at: string | null;
}

export interface RowNotificationTemplate {
  id: string;
  studio_id: string | null;
  event_type: string;
  locale: string;
  title_tpl: string;
  body_tpl: string;
  updated_at: string;
}

export interface RowInstructoraAusencias {
  id: string;
  studio_id: string;
  instructor_id: string;
  tipo: string;
  desde: string;
  hasta: string;
  motivo: string | null;
  creado_en: string;
}

export interface RowPlanTiposClase {
  plan_id: string;
  tipo_clase_id: string;
  studio_id: string;
}

export interface RowStudioSlugsAntiguos {
  slug: string;
  studio_id: string;
  creado_en: string;
}

export interface RowPlataformaLead {
  id: string;
  email: string;
  nombre: string | null;
  estudio: string | null;
  telefono: string | null;
  ciudad: string | null;
  software_actual: string | null;
  mensaje: string | null;
  origen: string;
  estado: string;
  motivo_perdida: string | null;
  proximo_paso: string | null;
  proxima_fecha: string | null;
  studio_id: string | null;
  notas: string | null;
  responsable: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface RowLecturasFichaSalud {
  id: string;
  studio_id: string;
  socio_id: string;
  leido_por_user_id: string;
  leido_por_nombre: string;
  leido_por_rol: string;
  leido_en: string;
}

export interface RowPlataformaAdmin {
  auth_user_id: string;
  nombre: string;
  cargo: string | null;
  activo: boolean;
  creado_en: string;
}

export interface RowPlataformaPermiso {
  auth_user_id: string;
  permiso: string;
  concedido_en: string;
  concedido_por: string | null;
}

export interface RowPlataformaAuditoria {
  id: number;
  ocurrido_en: string;
  actor_auth_user_id: string | null;
  actor_nombre: string;
  accion: string;
  objetivo_tipo: string | null;
  objetivo_id: string | null;
  resumen: string;
  antes: any | null;
  despues: any | null;
  ip: string | null;
  user_agent: string | null;
}

export interface RowPenalizaciones {
  id: string;
  studio_id: string;
  socio_id: string;
  reserva_id: string;
  tipo: string;
  importe: number;
  estado: string;
  recibo_id: string | null;
  detectada_en: string;
  procesada_en: string | null;
}

export interface RowInstructorTarifas {
  instructor_id: string;
  studio_id: string;
  tarifa_hora: number | null;
  moneda: string;
  actualizado_en: string;
  actualizado_por: string | null;
  // migr 20260804180132.
  base_mensual_eur: number | null;
  // migr 20260804180132.
  recargo_sustitucion_pct: number | null;
}

export interface RowFavoritosClase {
  id: string;
  studio_id: string;
  socio_id: string;
  tipo_clase_id: string;
  created_at: string;
}

export interface RowContenidoPortal {
  studio_id: string;
  mensaje_destacado: string | null;
  updated_at: string;
}

export interface RowContenidoPortalBanners {
  id: string;
  studio_id: string;
  imagen_url: string;
  titulo: string | null;
  texto: string | null;
  link_tipo: string;
  link_valor: string;
  ubicacion: string[];
  activo: boolean;
  orden: number;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RowDecisionMensajesDia {
  id: string;
  studio_id: string;
  fecha: string;
  tipo: string;
  recomendacion_id: string | null;
  dedupe_key: string | null;
  motivo_motor: string | null;
  motivo_silencio: string | null;
  enviado_en: string | null;
  creado_en: string | null;
}

export interface RowComunicacionesSocio {
  id: string;
  studio_id: string;
  socio_id: string;
  tipo: string;
  asunto: string;
  estado: string;
  error: string | null;
  resend_id: string | null;
  creado_por: string | null;
  creado_por_nombre: string | null;
  creado_en: string;
}

export interface RowChangelogVersiones {
  id: string;
  version: string;
  titulo: string;
  fecha_publicacion: string;
  estado: string;
  publicado_en: string | null;
  creado_en: string;
  creado_por: string | null;
}

export interface RowChangelogCambios {
  id: string;
  version_id: string;
  etiqueta: string;
  texto: string;
  orden: number;
}

export interface RowIntentosReservaFallidos {
  id: string;
  studio_id: string;
  socio_id: string;
  sesion_id: string | null;
  tipo_clase_id: string | null;
  motivo: string;
  creado_en: string;
}

export interface RowLiquidacionesInstructoras {
  id: string;
  studio_id: string;
  instructor_id: string;
  periodo_anio: number;
  periodo_mes: number;
  base_eur: string | null;
  n_clases_propias: number;
  variable_propias_eur: number;
  n_clases_sustitucion: number;
  variable_sustitucion_eur: number;
  n_penalizaciones: number;
  reparto_penalizaciones_eur: number;
  n_clases_sin_tarifa: number;
  total_eur: number | null;
  detalle: any;
  estado: string;
  confirmada_en: string | null;
  confirmada_por: string | null;
  pagada_en: string | null;
  pagada_por: string | null;
  referencia_pago: string | null;
  generada_en: string;
}

export interface RowRetoParticipaciones {
  id: string;
  studio_id: string;
  socio_id: string;
  reto_key: string;
  created_at: string;
}

export interface RowStudioHorario {
  studio_id: string;
  dia_semana: number;
  abierto: boolean;
  hora_apertura: string | null;
  hora_cierre: string | null;
  actualizado_en: string;
}

export interface RowInstructorBajasSeguimiento {
  id: string;
  studio_id: string;
  instructor_id: string;
  instructor_nombre: string;
  fecha_baja: string;
  nivel_riesgo_al_salir: string;
  porcentaje_facturacion_al_salir: number;
  alumnas_cautivas_count: number;
  alumnas_cautivas: any;
  evaluado_en: string | null;
  alumnas_retenidas_count: number | null;
}

export interface RowDevoluciones {
  id: string;
  studio_id: string;
  recibo_id: string;
  socio_id: string | null;
  suscripcion_id: string | null;
  origen: string;
  importe_cobrado: number;
  importe_devuelto: number;
  stripe_charge_id: string | null;
  referencia: string;
  estado: string;
  propuesta: any | null;
  aplicado: any | null;
  detectada_en: string;
  resuelta_en: string | null;
  resuelta_por: string | null;
  // migr 20260820182934.
  fallo_en: string | null;
  // migr 20260820182934.
  fallo_motivo: string | null;
}

export interface RowCadenaTiposClase {
  id: string;
  cadena_id: string;
  nombre: string;
  color: string | null;
  duracion_minutos: number | null;
  descripcion: string | null;
  nivel: string | null;
  foto_url: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface RowPagosHistoricos {
  id: string;
  studio_id: string;
  socio_id: string;
  fecha: string;
  concepto: string | null;
  importe: number;
  medio_pago: string | null;
  creado_en: string;
}

export interface RowResumenSemanalEnvios {
  studio_id: string;
  semana_lunes: string;
  enviado_en: string;
}

export interface RowPlantillasCuestionarioSalud {
  id: string;
  studio_id: string;
  pregunta: string;
  tipo_respuesta: string;
  opciones: string[];
  orden: number;
  activo: boolean;
  creado_en: string;
}

export interface RowRespuestasCuestionarioSalud {
  id: string;
  studio_id: string;
  socio_id: string;
  pregunta_id: string;
  respuesta: string | null;
  creado_por: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface RowRedPerfiles {
  id: string;
  auth_user_id: string;
  nombre: string;
  foto_url: string | null;
  ciudad: string | null;
  zona: string | null;
  radio_km: number | null;
  descripcion: string | null;
  especialidades: string[];
  anios_experiencia: number | null;
  tarifa_rango: string | null;
  disponibilidad_estado: string;
  disponibilidad_horarios: string[];
  tipo_trabajo: string[];
  email_contacto: string | null;
  telefono_contacto: string | null;
  estado: string;
  identidad_verificada_en: string | null;
  creado_en: string;
  actualizado_en: string;
  ultimo_acceso_en: string | null;
  // migr 20260813164631.
  slug: string | null;
  // migr 20260813175242.
  destacado: boolean | null;
  // migr 20260813223506.
  idiomas: string[] | null;
  // migr 20260813223506.
  instagram: string | null;
  // migr 20260813223506.
  linkedin: string | null;
  // migr 20260813223506.
  web: string | null;
  // migr 20260824191258.
  lat: number | null;
  // migr 20260824191258.
  lng: number | null;
  // migr 20260824193100.
  mostrar_estudios_actuales: boolean | null;
}

export interface RowRedExperiencias {
  id: string;
  perfil_id: string;
  studio_id: string | null;
  nombre_estudio: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  especialidades: string[];
  descripcion: string | null;
  estado_verificacion: string;
  creado_en: string;
}

export interface RowRedVerificacionesExperiencia {
  id: string;
  experiencia_id: string;
  studio_id: string;
  solicitado_por: string;
  solicitado_en: string;
  resuelto_en: string | null;
  resuelto_por: string | null;
  estado: string;
}

export interface RowRedReferencias {
  id: string;
  perfil_id: string;
  nombre_referente: string;
  email_referente: string;
  relacion: string | null;
  token: string;
  token_expira_en: string;
  solicitado_en: string;
  resuelto_en: string | null;
  estado: string;
}

export interface RowRedSolicitudesContacto {
  id: string;
  perfil_id: string;
  studio_id: string;
  solicitado_por: string;
  mensaje: string | null;
  estado: string;
  creado_en: string;
  resuelto_en: string | null;
}

export interface RowRedReportes {
  id: string;
  perfil_id: string;
  reportado_por: string | null;
  motivo: string;
  detalle: string | null;
  estado: string;
  creado_en: string;
  revisado_en: string | null;
  revisado_por: string | null;
}

export interface RowRedFavoritos {
  id: string;
  studio_id: string;
  perfil_id: string;
  creado_por: string;
  creado_en: string;
}

export interface RowRedResenas {
  id: string;
  // NULL en una reseña de alumna sobre un ESTUDIO (sin instructora
  // concreta) — red_perfiles solo tiene instructoras, no hay fila de
  // "perfil del estudio". Obligatorio si solicitud_id está relleno
  // (constraint red_resenas_perfil_obligatorio_si_solicitud, migr
  // 20260825004019).
  perfil_id: string | null;
  studio_id: string;
  // NULL cuando la reseña viene de una alumna vía reserva_id en vez de una
  // solicitud de contacto aceptada — ver constraint red_resenas_gate_unico
  // (migr 20260824191315): exactamente uno de los dos, nunca ninguno ni
  // ambos.
  solicitud_id: string | null;
  autor: string;
  puntuacion: number;
  comentario: string | null;
  estado: string;
  creado_en: string;
  moderado_en: string | null;
  moderado_por: string | null;
  // migr 20260824191315.
  reserva_id: string | null;
}

export interface RowRedMensajes {
  id: string;
  solicitud_id: string;
  remitente: string;
  cuerpo: string;
  creado_en: string;
  leido_en: string | null;
}

export interface RowRedPerfilesIdentidad {
  perfil_id: string;
  apellido1: string | null;
  apellido2: string | null;
  fecha_nacimiento: string | null;
  pais_residencia: string | null;
  tipo_documento: string | null;
  numero_documento: string | null;
  direccion_cp: string | null;
  direccion_ciudad: string | null;
  direccion_provincia: string | null;
  direccion_pais: string | null;
  telefono_verificado_en: string | null;
  email_verificado_en: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface RowRedVerificacionesIdentidad {
  id: string;
  perfil_id: string;
  estado: string;
  motivo_rechazo: string | null;
  documento_path: string;
  creado_en: string;
  resuelto_en: string | null;
  resuelto_por: string | null;
  // migr 20260819212346.
  documento_path_reverso: string | null;
}

export interface RowRedCertificaciones {
  id: string;
  perfil_id: string;
  nombre: string;
  institucion: string;
  anio: number | null;
  duracion: string | null;
  documento_path: string;
  estado: string;
  motivo_rechazo: string | null;
  creado_en: string;
  resuelto_en: string | null;
  resuelto_por: string | null;
}

export interface RowThemeImports {
  id: string;
  studio_id: string;
  nombre: string;
  manifest: any;
  storage_prefix: string;
  entry_html: string | null;
  estado: string;
  detalle: string | null;
  creado_en: string;
  creado_por: string | null;
  // migr 20260814082837.
  publicado: boolean | null;
  // migr 20260814082837.
  publicado_en: string | null;
  // migr 20260814091805.
  rutas_editadas: string[] | null;
}

export interface RowOauthClientes {
  id: string;
  nombre: string;
  descripcion: string | null;
  client_secret_hash: string;
  redirect_uris: string[];
  es_confidencial: boolean;
  logo_url: string | null;
  activo: boolean;
  creado_en: string;
}

export interface RowOauthConsentimientos {
  id: string;
  studio_id: string;
  cliente_id: string;
  otorgado_por: string;
  scopes: string[];
  otorgado_en: string;
  revocado_en: string | null;
}

export interface RowOauthCodigosAutorizacion {
  codigo: string;
  studio_id: string;
  cliente_id: string;
  auth_user_id: string;
  scopes: string[];
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  cadena_id: string;
  expira_en: string;
  usado_en: string | null;
  creado_en: string;
}

export interface RowOauthTokens {
  id: string;
  studio_id: string;
  cliente_id: string;
  auth_user_id: string;
  scopes: string[];
  access_token_hash: string;
  refresh_token_hash: string;
  access_token_expira_en: string;
  refresh_token_expira_en: string;
  cadena_id: string;
  revocado_en: string | null;
  reemplazado_por: string | null;
  creado_en: string;
}

export interface RowOauthAuditoriaAccesos {
  id: number;
  token_id: string | null;
  studio_id: string;
  cliente_id: string;
  scope_usado: string | null;
  metodo: string;
  ruta: string;
  status_code: number;
  ip: string | null;
  creado_en: string;
}

export interface RowWidgetEventos {
  id: string;
  studio_id: string;
  session_id: string;
  tipo: string;
  sesion_clase_id: string | null;
  origen: string | null;
  creado_en: string;
  // migr 20260817013933.
  socio_id: string | null;
}

export interface RowTareas {
  id: string;
  studio_id: string;
  socio_id: string | null;
  titulo: string;
  descripcion: string | null;
  estado: string;
  origen: string;
  creado_en: string;
  completado_en: string | null;
}

export interface RowRedFormalizaciones {
  id: string;
  solicitud_id: string;
  propuesto_por: string;
  tipo_contrato: string;
  estudio_confirmado_en: string | null;
  instructora_confirmada_en: string | null;
  estado: string;
  instructor_id: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface RowRedVacantes {
  id: string;
  studio_id: string;
  publicado_por: string;
  titulo: string;
  especialidades: string[];
  horarios: string[];
  tipo_trabajo: string;
  tarifa_rango: string;
  requisitos: string | null;
  descripcion: string;
  estado: string;
  creado_en: string;
  actualizado_en: string;
  cerrado_en: string | null;
}

export interface RowRedCandidaturas {
  id: string;
  vacante_id: string;
  perfil_id: string;
  studio_id: string;
  mensaje: string | null;
  notas_estudio: string | null;
  estado: string;
  solicitud_id: string | null;
  creado_en: string;
  actualizado_en: string;
  resuelto_en: string | null;
}

export interface RowRecordatorioEnvios {
  sesion_id: string;
  socio_id: string;
  canal: string;
  enviado_en: string;
}

export interface RowSegmentosClientes {
  id: string;
  studio_id: string;
  nombre: string;
  condiciones: any;
  creado_por: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface RowMensajesEntrantesMedicion {
  id: string;
  canal: string;
  de_numero: string;
  para_numero: string;
  cuerpo: string | null;
  twilio_sid: string;
  creado_en: string;
}

export interface RowCodigosDescuentoConsumos {
  recibo_id: string;
  codigo_id: string;
  consumido_en: string;
}

export interface RowReviewBoostFeedback {
  id: string;
  studio_id: string;
  rating: number;
  comentario: string | null;
  fuente: string;
  estado: string;
  creado_en: string;
}

export interface RowReviewBoostRecompensas {
  id: string;
  studio_id: string;
  feedback_id: string;
  stripe_coupon_id: string;
  concedida_en: string;
  canjeada_en: string | null;
  creado_en: string;
}

export interface RowMenuNovedades {
  href: string;
  creado_por: string | null;
  creado_en: string;
}

export interface RowRedPerfilesAlumna {
  id: string;
  auth_user_id: string;
  nombre: string;
  foto_url: string | null;
  ciudad: string | null;
  zona: string | null;
  lat: number | null;
  lng: number | null;
  intereses: string[];
  disponibilidad_horarios: string[];
  estado: string;
  creado_en: string;
  actualizado_en: string;
}

export interface RowRedPerfilMedia {
  id: string;
  perfil_id: string;
  tipo: string;
  path: string;
  orden: number;
  creado_en: string;
}

export interface RowRedFavoritosAlumna {
  id: string;
  auth_user_id: string;
  tipo: string;
  studio_id: string | null;
  perfil_id: string | null;
  creado_en: string;
}

export interface RowNovedadesEstudio {
  id: string;
  studio_id: string;
  titulo: string;
  texto: string | null;
  emoji: string | null;
  activo: boolean;
  fecha_inicio: string | null;
  fecha_fin: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RowWebhookReembolsos {
  id: string;
  pi_stripe_id: string;
  charge_stripe_id: string;
  recibo_id: string | null;
  amount_refunded_cents: number;
  total_charge_cents: number;
  es_reembolso_total: boolean;
  procesado_en: string;
}

export interface RowWebhookDisputas {
  id: string;
  pi_stripe_id: string;
  dispute_stripe_id: string;
  recibo_id: string | null;
  dispute_status: string;
  procesado_en: string;
}
