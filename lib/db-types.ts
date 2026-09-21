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
  // migr 20260828010312.
  valoracion_experiencia: number | null;
  // migr 20260906005059.
  cancelada_tardia: boolean | null;
  // migr 20260914182637.
  bono_suscripcion_id: string | null;
  // migr 20260914182637.
  bono_decidido_en: string | null;
  // migr 20260914182637.
  bono_consumo_rastreado: boolean | null;
  // migr 20260915001236.
  cancelada_motivo: string | null;
  // migr 20260919075507.
  bono_devuelto_en: string | null;
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
  // migr 20260914234708.
  origen: string | null;
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
  // migr 20260902001721.
  venta_pos_id: string | null;
  // migr 20260910205055.
  concepto: string | null;
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
  // migr 20260827150000.
  phone_number_id: string | null;
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
  // migr 20260908020000.
  caduca_el: string | null;
  // migr 20260917010429.
  creditos_por_compensar: number | null;
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
  // migr 20260907031555.
  periodicidad_meses: number | null;
  // migr 20260907031555.
  matricula: number | null;
  // migr 20260911013944.
  matricula_gratis_hasta: string | null;
  // migr 20260911013944.
  matricula_gratis_cupos: number | null;
  // migr 20260911013944.
  matricula_gratis_usados: number | null;
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
  // migr 20260826015923.
  audiencia: string | null;
  // migr 20260826015923.
  imagen_url: string | null;
  // migr 20260826095321.
  tipo: string | null;
  // migr 20260826095321.
  evento_fecha: string | null;
  // migr 20260826095321.
  evento_aforo: number | null;
  // migr 20260826095321.
  evento_lugar: string | null;
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
  // migr 20260907150011.
  stock: number | null;
  // migr 20260907150011.
  stock_minimo: number | null;
  // migr 20260907150011.
  iva_pct: number | null;
  // migr 20260907150011.
  descripcion: string | null;
  // migr 20260907150011.
  imagen_url: string | null;
  // migr 20260907150011.
  sku: string | null;
  // migr 20260907150011.
  codigo_barras: string | null;
  // migr 20260907150011.
  orden: number | null;
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
  // migr 20260902001650.
  conciliado_en: string | null;
  // migr 20260902001650.
  conciliado_por: string | null;
  // migr 20260902001650.
  factura_pendiente_sellar: boolean | null;
  // migr 20260906003934.
  es_renovacion: boolean | null;
  // migr 20260907174656.
  cobro_mostrador_pi: string | null;
  // migr 20260908160000.
  terminos_hash: string | null;
  // migr 20260908160000.
  terminos_aceptados_en: string | null;
  // migr 20260908162951.
  cobro_mostrador_checkout_session_id: string | null;
  // migr 20260915215311.
  tras_cancelar_cuota: string | null;
  // migr 20260915215311.
  anulado_en: string | null;
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
  // migr 20260907213000.
  efecto: string | null;
  // migr 20260909090000.
  limite_por_socia: number | null;
  // migr 20260909090000.
  disponible_desde: string | null;
  // migr 20260909090000.
  disponible_hasta: string | null;
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
  // migr 20260909154359.
  codigo: string | null;
  // migr 20260909154359.
  entregado_en: string | null;
  // migr 20260909154359.
  entregado_por: string | null;
  // migr 20260909154359.
  recuperacion_id: string | null;
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
  // migr 20260907150546.
  unidad_euros: number | null;
}

export interface RowSalas {
  id: string;
  studio_id: string;
  nombre: string;
  capacidad: number;
  color: string | null;
  // migr 20260904020000.
  foto_url: string | null;
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
  // migr 20260912223256.
  creado_en: string | null;
}

export interface RowSocios {
  id: string;
  studio_id: string;
  nombre: string;
  apellidos: string;
  email: string | null;
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
  // migr 20260826202949.
  visible_en_clase: boolean | null;
  // migr 20260828005124.
  usuario: string | null;
  // migr 20260909003015.
  consentimiento_salud_texto: string | null;
  // migr 20260910224240.
  objetivo_clases_mes: number | null;
  // migr 20260913205557.
  excluir_de_perfilado: boolean | null;
  // migr 20260913214142.
  consentimiento_salud_registrado_por_uid: string | null;
  // migr 20260914025903.
  cumple_mm_dd: string | null;
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
  // migr 20260904015605.
  stripe_account_id_anterior: string | null;
  // migr 20260904015605.
  stripe_account_desconectado_en: string | null;
  // migr 20260905151515.
  bloquear_reserva_impago: boolean | null;
  // migr 20260906005059.
  recuperacion_auto_semanal: boolean | null;
  // migr 20260908010000.
  creditos_nombre: string | null;
  // migr 20260908020000.
  creditos_caducan_meses: number | null;
  // migr 20260908210000.
  racha_clases_semana: number | null;
  // migr 20260909003015.
  valoracion_inicial_activa: boolean | null;
  // migr 20260910201734.
  lema: string | null;
  // migr 20260910201734.
  frase_heroe: string | null;
  // migr 20260910224251.
  frase_manuscrita: string | null;
  // migr 20260911000542.
  subtitulo_heroe: string | null;
  // migr 20260914104856.
  instructoras_crean_clases: boolean | null;
  // migr 20260915215236.
  plaza_fija_sin_cuota: string | null;
  // migr 20260915215311.
  recibos_al_cancelar_cuota: string | null;
  // migr 20260915215311.
  renovar_sola_cuota_cancelada: boolean | null;
  // migr 20260915231920.
  plaza_fija_solicitar_desde_app: boolean | null;
  // migr 20260915231920.
  plaza_fija_pausa_desde_app: boolean | null;
  // migr 20260915231920.
  plaza_fija_pausa_libera_sitio: boolean | null;
  // migr 20260915231920.
  plaza_fija_fin_pausa: string | null;
  // migr 20260921131627.
  fecha_apertura: string | null;
  // migr 20260921145514.
  recordatorio_largo_horas: number | null;
  // migr 20260921145514.
  recordatorio_corto_minutos: number | null;
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
  // migr 20260913215533.
  baja_al_vencer: boolean | null;
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
  // migr 20260903233651. NULL = usa la capacidad de la SALA donde se
  // programe la sesión, que es de donde salía el aforo antes de existir
  // esta columna — ver `aforoPorDefectoDeSesion()` en lib/aforo-logic.ts.
  aforo_por_defecto: number | null;
  // migr 20260905011213.
  requiere_autorizacion: boolean | null;
  // migr 20260905130124.
  logo_url: string | null;
  // migr 20260909210000.
  requiere_checkin_qr: boolean | null;
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
  // migr 20260827093640.
  devuelta_en: string | null;
  // migr 20260827093640.
  importe_devuelto: number | null;
  // migr 20260902001659.
  conciliado_en: string | null;
  // migr 20260902001659.
  conciliado_por: string | null;
  // migr 20260907150106.
  numero: number | null;
  // migr 20260907150106.
  estado: string | null;
  // migr 20260907150106.
  pago_estado: string | null;
  // migr 20260907150106.
  pago_actualizado_en: string | null;
  // migr 20260907150106.
  pago_error: string | null;
  // migr 20260907150106.
  base_imponible: number | null;
  // migr 20260907150106.
  iva_total: number | null;
  // migr 20260907150106.
  efectivo_recibido: number | null;
  // migr 20260907150106.
  cambio: number | null;
  // migr 20260907150106.
  vendido_por: string | null;
  // migr 20260907150106.
  vendido_por_nombre: string | null;
  // migr 20260907150106.
  caja_id: string | null;
  // migr 20260907150106.
  recibo_id: string | null;
  // migr 20260907150106.
  idempotencia_clave: string | null;
  // migr 20260907150106.
  anulada_en: string | null;
  // migr 20260907150106.
  anulada_por: string | null;
  // migr 20260907150106.
  anulada_motivo: string | null;
  // migr 20260908162951.
  checkout_session_id: string | null;
  // migr 20260913020635.
  matricula_cupo_plan_id: string | null;
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
  // migr 20260907121459.
  enviar: boolean | null;
  // migr 20260916105833.
  portada_url: string | null;
  // migr 20260916105833.
  mostrar_portada: boolean | null;
  // migr 20260916105833.
  boton_url: string | null;
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
  // migr 20260914011337.
  token_hash: string | null;
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
  // migr 20260909191157.
  canal: string | null;
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
  // migr 20260915094312.
  pausa_desde: string | null;
  // migr 20260915094312.
  pausa_hasta: string | null;
  // migr 20260915231920.
  pausa_libera_sitio: boolean | null;
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
  // migr 20260921132122.
  push_eventos: any | null;
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
  // migr 20260907030553.
  limite_semanal: number | null;
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
  // migr 20260902162926.
  web: string | null;
  // migr 20260902162926.
  instagram: string | null;
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
  // migr 20260904194535.
  horas_semanales_contrato: number | null;
  // migr 20260921210035.
  relacion_laboral: string | null;
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
  // migr 20260911003214.
  imagen_url: string | null;
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
  // migr 20260909220851.
  requiere_revision: boolean | null;
  // migr 20260909220851.
  revision_motivo: string | null;
  // migr 20260921183019.
  modo: string | null;
  // migr 20260921183019.
  minutos_fichados: number | null;
  // migr 20260921183019.
  jornadas_sin_cerrar: number | null;
  // migr 20260921211857.
  relacion_laboral: string | null;
  // migr 20260921211857.
  clases_sin_confirmar: number | null;
  // migr 20260921211857.
  clases_no_dadas: number | null;
  // migr 20260921211857.
  minutos_retraso: number | null;
  // migr 20260921211857.
  minutos_contrato: number | null;
  // migr 20260921211857.
  minutos_extra: number | null;
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
  // migr 20260902001713.
  venta_pos_id: string | null;
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
  // migr 20260914151252.
  sustitucion_id: string | null;
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
  // migr 20260913222743.
  documento_borrado_en: string | null;
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
  // migr 20260913222743.
  documento_borrado_en: string | null;
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
  // migr 20260907172746.
  socio_id: string | null;
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

export interface RowConversaciones {
  id: string;
  studio_id: string;
  tipo: string;
  titulo: string | null;
  ancla_sesion_id: string | null;
  ancla_reserva_id: string | null;
  creado_en: string;
  ultimo_mensaje_en: string;
  // migr 20260901232656.
  mostrador_leido_hasta: string | null;
}

export interface RowConversacionParticipantes {
  conversacion_id: string;
  auth_user_id: string;
  rol_en_conversacion: string;
  socio_id: string | null;
  leido_hasta: string;
  unido_en: string;
}

export interface RowMensajes {
  id: string;
  conversacion_id: string;
  studio_id: string;
  remitente_auth_user_id: string | null;
  cuerpo: string;
  creado_en: string;
}

export interface RowDocumentosSocio {
  id: string;
  studio_id: string;
  socio_id: string;
  categoria: string;
  titulo: string;
  storage_path: string;
  subido_por: string | null;
  caduca_en: string | null;
  creado_en: string;
  borrado_en: string | null;
}

export interface RowPostEventoAsistentes {
  post_id: string;
  socio_id: string;
  creado_en: string;
}

export interface RowSocioCompaneras {
  id: string;
  studio_id: string;
  solicitante_id: string;
  destinataria_id: string;
  estado: string;
  bloqueada_por: string | null;
  creado_en: string;
  resuelto_en: string | null;
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

export interface RowAyudaFeedback {
  id: string;
  articulo_slug: string;
  categoria_slug: string;
  valoracion: string;
  url: string;
  creado_en: string;
}

export interface RowPlataformaProspeccionEmail {
  id: string;
  lead_id: string;
  asunto: string;
  cuerpo: string;
  estado: string;
  aprobado_por: string | null;
  aprobado_en: string | null;
  enviado_en: string | null;
  error: string | null;
  generado_en: string;
  creado_en: string;
}

export interface RowDecisionSnapshots {
  id: string;
  studio_id: string;
  snapshot_data: any;
  cacheado_en: string;
  valido_hasta: string;
  es_valido: boolean;
  created_at: string;
  updated_at: string;
}

export interface RowSocioTiposClaseAutorizados {
  studio_id: string;
  socio_id: string;
  tipo_clase_id: string;
  autorizada_en: string;
  autorizada_por: string | null;
}

export interface RowCierresEstudio {
  id: string;
  studio_id: string;
  desde: string;
  hasta: string;
  motivo: string | null;
  creado_en: string;
}

export interface RowCajas {
  id: string;
  studio_id: string;
  estado: string;
  fondo_inicial: number;
  abierta_en: string;
  abierta_por: string | null;
  abierta_por_nombre: string | null;
  cerrada_en: string | null;
  cerrada_por: string | null;
  cerrada_por_nombre: string | null;
  efectivo_contado: number | null;
  efectivo_esperado: number | null;
  diferencia: number | null;
  notas_cierre: string | null;
}

export interface RowMovimientosCaja {
  id: string;
  studio_id: string;
  caja_id: string;
  tipo: string;
  importe: number;
  metodo_pago: string;
  concepto: string;
  referencia: string | null;
  metadata: any;
  creado_en: string;
  creado_por: string | null;
  creado_por_nombre: string | null;
}

export interface RowVentasPosLineas {
  id: string;
  venta_id: string;
  studio_id: string;
  tipo: string;
  referencia_id: string | null;
  nombre: string;
  precio_unitario: number;
  cantidad: number;
  iva_pct: number;
  descuento: number;
  base_imponible: number;
  iva_importe: number;
  total: number;
  suscripcion_id: string | null;
  devuelta_cantidad: number;
  orden: number;
}

export interface RowMovimientosStock {
  id: string;
  studio_id: string;
  producto_id: string;
  tipo: string;
  cantidad: number;
  stock_anterior: number | null;
  stock_resultante: number;
  motivo: string | null;
  coste_unitario: number | null;
  creado_por: string | null;
  creado_por_nombre: string | null;
  creado_en: string;
}

export interface RowTerminosVersiones {
  id: string;
  studio_id: string;
  hash: string;
  texto: string;
  creado_en: string;
}

export interface RowValoracionesIniciales {
  id: string;
  studio_id: string;
  socio_id: string;
  estado: string;
  objetivos: string[];
  objetivo_principal: string | null;
  experiencia: string | null;
  nivel: string | null;
  actividad_habitual: string;
  frecuencia: string | null;
  expectativas: string;
  creado_en: string;
  actualizado_en: string;
  completada_en: string | null;
}

export interface RowValoracionesInicialesSalud {
  valoracion_id: string;
  studio_id: string;
  socio_id: string;
  tiene_molestias: boolean | null;
  zonas: string[];
  detalle: string;
  estado_cuerpo: string | null;
  creado_en: string;
}

export interface RowVerifactuTransmisionLock {
  id: string;
  en_curso: boolean;
  iniciado_en: string | null;
  actualizado_en: string;
}

export interface RowEmailRebotes {
  email: string;
  tipo: string;
  motivo: string | null;
  email_id: string | null;
  detectado_en: string;
}

export interface RowMatriculaCupoLiberaciones {
  payment_intent_id: string;
  plan_id: string;
  studio_id: string;
  liberado_en: string;
}

export interface RowSupresiones {
  id: string;
  studio_id: string;
  socio_id: string;
  auth_user_id: string | null;
  solicitada_en: string;
  ejecutada_en: string | null;
  ejecutada_por: string | null;
  origen: string;
  terceros_pendientes: any;
  reaplicada_en: string | null;
}

export interface RowSolicitudesDerechos {
  id: string;
  studio_id: string;
  socio_id: string;
  tipo: string;
  estado: string;
  solicitada_en: string;
  plazo_hasta: string;
  resuelta_en: string | null;
  resuelta_por: string | null;
  nota: string | null;
}

export interface RowConsentimientosSaludEventos {
  id: string;
  studio_id: string;
  socio_id: string;
  tipo: string;
  en: string;
  origen: string;
  texto: string | null;
  firma: string | null;
  actor_uid: string | null;
  actor_rol: string | null;
}

export interface RowCicloEstudiosVencidos {
  id: number;
  studio_id: string;
  trial_ends_at: string;
  fase: string;
  programada_para: string;
  ejecutada_en: string | null;
  cancelada_en: string | null;
  resumen: any;
  creado_en: string;
  actualizado_en: string;
}

export interface RowKioskoTokens {
  studio_id: string;
  token_hash: string;
  actualizado_en: string;
}

export interface RowAceptacionesContratoEventos {
  id: string;
  studio_id: string;
  socio_id: string;
  en: string;
  origen: string;
  texto_hash: string;
  texto_cliente_coincide: boolean | null;
  firma: string;
  introducida_por: string | null;
  actor_uid: string | null;
  actor_rol: string | null;
  ip_hmac: string | null;
  user_agent: string | null;
}

export interface RowBajasInstructora {
  id: string;
  studio_id: string;
  instructor_id: string;
  sustitucion_id: string;
  sesion_id: string;
  categoria: string | null;
  motivo: string | null;
  antelacion_minutos: number;
  revision: string | null;
  nota_estudio: string | null;
  revisada_por: string | null;
  revisada_en: string | null;
  creado_en: string;
}

export interface RowSeries {
  id: string;
  studio_id: string;
  semanas_periodo: number;
  renovacion_automatica: boolean;
  no_renovar: boolean;
  creada_en: string;
  // migr 20260915122409.
  aviso_tramo: string | null;
  // migr 20260915122409.
  aviso_fin: string | null;
}

export interface RowSeriesPeriodos {
  serie_id: string;
  periodo: number;
  studio_id: string;
  desde: string;
  hasta: string;
  origen: string;
  creado_por: string | null;
  sesiones_creadas: number;
  omitidas: any;
  creado_en: string;
}

export interface RowCierresProrrogas {
  cierre_id: string;
  studio_id: string;
  desde: string;
  hasta: string;
  dias: number;
  bonos_ampliados: number;
  recuperaciones_ampliadas: number;
  aplicada_en: string;
}

export interface RowSolicitudesPlazaFija {
  id: string;
  studio_id: string;
  socio_id: string;
  tipo: string;
  origen: string;
  estado: string;
  sesion_id: string | null;
  dia_semana: number | null;
  hora_inicio: string | null;
  sala_id: string | null;
  tipo_clase_id: string | null;
  supera_limite: boolean;
  plaza_id: string | null;
  desde_propuesta: string | null;
  hasta_propuesta: string | null;
  desde_aprobada: string | null;
  hasta_aprobada: string | null;
  motivo_sistema: string | null;
  motivo_rechazo: string | null;
  resultado_plaza_id: string | null;
  creada_en: string;
  resuelta_en: string | null;
  resuelta_por: string | null;
}

export interface RowSalesLeads {
  id: string;
  email: string;
  nombre_contacto: string | null;
  apellido_contacto: string | null;
  estudio_nombre: string | null;
  estudio_nombre_legal: string | null;
  rol: string | null;
  telefono: string | null;
  ciudad: string | null;
  provincia: string | null;
  pais: string | null;
  codigo_postal: string | null;
  direccion: string | null;
  website: string | null;
  website_domain: string | null;
  instagram_url: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;
  software_actual: string | null;
  numero_empleados: number | null;
  clientes_aprox: number | null;
  precio_mensual_aprox: string | null;
  google_place_id: string | null;
  phone_normalized: string | null;
  phone_checked_at: string | null;
  estado: string;
  origen: string;
  source_url: string | null;
  source_created_at: string | null;
  discovered_at: string | null;
  last_verified_at: string | null;
  email_status: string | null;
  email_checked_at: string | null;
  owner_id: string | null;
  studio_id: string | null;
  tags: string[] | null;
  notas: string | null;
  razon_perdida: string | null;
  confidence: number | null;
  creado_en: string;
  actualizado_en: string;
  borrado_en: string | null;
}

export interface RowSalesCampaigns {
  id: string;
  nombre: string;
  descripcion: string | null;
  audience_count: number | null;
  estado: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  scheduled_for: string | null;
  borrado_en: string | null;
}

export interface RowSalesCampaignSteps {
  id: string;
  campaign_id: string;
  orden: number;
  asunto: string | null;
  cuerpo: string | null;
  delay_days: number | null;
  conditions: any | null;
  enabled: boolean | null;
  created_at: string;
}

export interface RowSalesMessages {
  id: string;
  lead_id: string;
  campaign_id: string | null;
  campaign_step_id: string | null;
  asunto: string | null;
  cuerpo: string | null;
  estado: string;
  proveedor: string | null;
  proveedor_id: string | null;
  enviado_en: string | null;
  entregado_en: string | null;
  abierto_en: string | null;
  respuesta_en: string | null;
  error: string | null;
  creado_en: string;
}

export interface RowSalesSuppressions {
  id: string;
  email: string | null;
  dominio: string | null;
  telefono: string | null;
  razon: string;
  source: string;
  creado_en: string;
}

export interface RowSalesTasks {
  id: string;
  lead_id: string;
  tipo: string;
  asignado_a: string | null;
  vencimiento: string | null;
  prioridad: number | null;
  estado: string;
  notas: string | null;
  creado_en: string;
  actualizado_en: string;
  borrado_en: string | null;
}

export interface RowSalesEvents {
  id: string;
  lead_id: string | null;
  tipo: string;
  actor_id: string | null;
  detalles: any | null;
  creado_en: string;
}

export interface RowCobrosIntentos {
  payment_intent_id: string;
  studio_id: string;
  recibo_id: string;
  importe_centimos: number;
  origen: string;
  desenlace: string;
  creado_en: string;
  actualizado_en: string;
}

export interface RowDoblesCobrosDetectados {
  id: string;
  studio_id: string;
  recibo_id: string;
  payment_intent_ids: string[];
  tipo: string;
  estado: string;
  notas: string | null;
  detectado_en: string;
  resuelto_en: string | null;
}

export interface RowOpeningProgreso {
  studio_id: string;
  fase: string;
  objetivos: any;
  checklist: any;
  created_at: string;
  updated_at: string;
}

export interface RowOpeningConfig {
  studio_id: string;
  umbral_amarillo: number;
  umbral_rojo: number;
  conversion_leads: number;
  objetivo_preventa: number;
  ventana_analisis_dias: number;
  sesiones_semana_sin_tope: number;
  semanas_bono_sin_caducidad: number;
  created_at: string;
  updated_at: string;
}

export interface RowLaunchStages {
  id: string;
  studio_id: string;
  etapa: string;
  plan_id: string | null;
  fecha_inicio: string;
  fecha_fin: string;
  limite_plazas: number | null;
  estado: string;
  created_at: string;
  updated_at: string;
  // migr 20260921161026.
  al_completar: string | null;
  // migr 20260921161026.
  cerrada_en: string | null;
  // migr 20260921161026.
  cerrada_motivo: string | null;
}

export interface RowAlertasOpening {
  id: string;
  studio_id: string;
  tipo: string;
  severidad: string;
  titulo: string;
  descripcion: string | null;
  datos: any;
  resuelta_en: string | null;
  created_at: string;
}

export interface RowInstructorWorkSessions {
  id: string;
  studio_id: string;
  instructor_id: string;
  check_in_at: string;
  check_out_at: string | null;
  check_in_method: string;
  check_out_method: string | null;
  status: string;
  created_at: string;
  created_by: string;
  edited_at: string | null;
  edited_by: string | null;
  OR: string;
}

export interface RowWorkSessionAudits {
  id: string;
  studio_id: string;
  work_session_id: string;
  action: string;
  field_name: string | null;
  value_before: string | null;
  value_after: string | null;
  reason: string | null;
  created_at: string;
  created_by: string;
}

export interface RowStudioConfigTiempo {
  studio_id: string;
  check_in_window_minutes: number;
  open_session_limit_hours: number;
  updated_at: string;
  // migr 20260921183019.
  liquidar_por: string | null;
  // migr 20260921211857.
  pagar_duracion_real: boolean | null;
}

export interface RowLaunchStagePlazas {
  id: string;
  stage_id: string;
  studio_id: string;
  clave: string;
  stripe_ref: string | null;
  suscripcion_id: string | null;
  estado: string;
  expira_en: string | null;
  intento: number;
  created_at: string;
  updated_at: string;
}

export interface RowClasesImpartidas {
  sesion_id: string;
  studio_id: string;
  instructor_id: string;
  estado: string;
  inicio_real: string | null;
  fin_real: string | null;
  origen: string;
  revisada_en: string | null;
  revisada_por: string | null;
  created_at: string;
  created_by: string;
  edited_at: string | null;
  edited_by: string | null;
  OR: string | null;
}

export interface RowClasesImpartidasAuditoria {
  id: string;
  studio_id: string;
  sesion_id: string;
  accion: string;
  campo: string | null;
  valor_antes: string | null;
  valor_despues: string | null;
  motivo: string | null;
  created_at: string;
  created_by: string;
}


export type ReservasInsert = {
  id?: string | null;
  studio_id?: string | null;
  sesion_id?: string | null | null;
  socio_id?: string | null | null;
  estado?: string | null;
  spot_id?: string | null | null;
  posicion_espera?: number | null | null;
  check_in_en?: string | null | null;
  creado_en?: string | null | null;
  confirmacion_pedida_en?: string | null | null;
  confirmado_en?: string | null | null;
  recordatorio_confirmacion_en?: string | null | null;
  oferta_expira_en?: string | null | null;
  valoracion_experiencia?: number | null | null;
  cancelada_tardia?: boolean | null | null;
  bono_suscripcion_id?: string | null | null;
  bono_decidido_en?: string | null | null;
  bono_consumo_rastreado?: boolean | null | null;
  cancelada_motivo?: string | null | null;
  bono_devuelto_en?: string | null | null;
}

export type ReservasUpdate = {
  id?: string | null;
  studio_id?: string | null;
  sesion_id?: string | null | null;
  socio_id?: string | null | null;
  estado?: string | null;
  spot_id?: string | null | null;
  posicion_espera?: number | null | null;
  check_in_en?: string | null | null;
  creado_en?: string | null | null;
  confirmacion_pedida_en?: string | null | null;
  confirmado_en?: string | null | null;
  recordatorio_confirmacion_en?: string | null | null;
  oferta_expira_en?: string | null | null;
  valoracion_experiencia?: number | null | null;
  cancelada_tardia?: boolean | null | null;
  bono_suscripcion_id?: string | null | null;
  bono_decidido_en?: string | null | null;
  bono_consumo_rastreado?: boolean | null | null;
  cancelada_motivo?: string | null | null;
  bono_devuelto_en?: string | null | null;
}

export type AchievementDefinitionsInsert = {
  id?: string | null;
  studio_id?: string | null;
  metric?: string | null;
  nombre?: string | null;
  descripcion?: string | null | null;
  umbral?: number | null;
  icono?: string | null;
  creditos_recompensa?: number | null;
  activo?: boolean | null;
  creado_en?: string | null;
}

export type AchievementDefinitionsUpdate = {
  id?: string | null;
  studio_id?: string | null;
  metric?: string | null;
  nombre?: string | null;
  descripcion?: string | null | null;
  umbral?: number | null;
  icono?: string | null;
  creditos_recompensa?: number | null;
  activo?: boolean | null;
  creado_en?: string | null;
}

export type AchievementHistoryInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  achievement_id?: string | null | null;
  nombre?: string | null;
  icono?: string | null;
  creado_en?: string | null;
}

export type AchievementHistoryUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  achievement_id?: string | null | null;
  nombre?: string | null;
  icono?: string | null;
  creado_en?: string | null;
}

export type AchievementProgressInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  achievement_id?: string | null | null;
  progreso_actual?: number | null;
  completado?: boolean | null;
  completado_en?: string | null | null;
}

export type AchievementProgressUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  achievement_id?: string | null | null;
  progreso_actual?: number | null;
  completado?: boolean | null;
  completado_en?: string | null | null;
}

export type ActividadRecienteInsert = {
  id?: string | null;
  studio_id?: string | null;
  tipo?: string | null;
  texto?: string | null;
  socio_id?: string | null | null;
  enlace?: string | null | null;
  creado_en?: string | null | null;
  actor_nombre?: string | null | null;
  origen?: string | null | null;
}

export type ActividadRecienteUpdate = {
  id?: string | null;
  studio_id?: string | null;
  tipo?: string | null;
  texto?: string | null;
  socio_id?: string | null | null;
  enlace?: string | null | null;
  creado_en?: string | null | null;
  actor_nombre?: string | null | null;
  origen?: string | null | null;
}

export type AutomationLogsInsert = {
  id?: string | null;
  studio_id?: string | null;
  rule_id?: string | null | null;
  rule_name?: string | null | null;
  socio_id?: string | null | null;
  socio_nombre?: string | null | null;
  paso_index?: number | null | null;
  accion?: string | null | null;
  resultado?: string | null | null;
  detalle?: string | null | null;
  ejecutado_en?: string | null | null;
  proxima_accion_en?: string | null | null;
  recibo_id?: string | null | null;
  automatizacion_id?: string | null | null;
  mensaje_cliente?: string | null | null;
}

export type AutomationLogsUpdate = {
  id?: string | null;
  studio_id?: string | null;
  rule_id?: string | null | null;
  rule_name?: string | null | null;
  socio_id?: string | null | null;
  socio_nombre?: string | null | null;
  paso_index?: number | null | null;
  accion?: string | null | null;
  resultado?: string | null | null;
  detalle?: string | null | null;
  ejecutado_en?: string | null | null;
  proxima_accion_en?: string | null | null;
  recibo_id?: string | null | null;
  automatizacion_id?: string | null | null;
  mensaje_cliente?: string | null | null;
}

export type AutomationRulesInsert = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  descripcion?: string | null | null;
  icono?: string | null | null;
  trigger?: string | null;
  condicion?: any | null | null;
  pasos?: any | null | null;
  activa?: boolean | null | null;
  ejecutada_veces?: number | null | null;
  ultima_ejecucion?: string | null | null;
  creada_en?: string | null | null;
}

export type AutomationRulesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  descripcion?: string | null | null;
  icono?: string | null | null;
  trigger?: string | null;
  condicion?: any | null | null;
  pasos?: any | null | null;
  activa?: boolean | null | null;
  ejecutada_veces?: number | null | null;
  ultima_ejecucion?: string | null | null;
  creada_en?: string | null | null;
}

export type AutomatizacionesInsert = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  trigger?: string | null;
  accion?: string | null;
  asunto?: string | null | null;
  mensaje?: string | null | null;
  activa?: boolean | null | null;
  ejecutadas?: number | null | null;
  creada_en?: string | null | null;
  pasos?: unknown | null | null;
}

export type AutomatizacionesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  trigger?: string | null;
  accion?: string | null;
  asunto?: string | null | null;
  mensaje?: string | null | null;
  activa?: boolean | null | null;
  ejecutadas?: number | null | null;
  creada_en?: string | null | null;
  pasos?: unknown | null | null;
}

export type BackupsInsert = {
  id?: string | null;
  studio_id?: string | null;
  tipo?: string | null;
  datos?: any | null;
  creado_en?: string | null;
  storage_key?: string | null | null;
}

export type BackupsUpdate = {
  id?: string | null;
  studio_id?: string | null;
  tipo?: string | null;
  datos?: any | null;
  creado_en?: string | null;
  storage_key?: string | null | null;
}

export type CampanasInsert = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  tipo?: string | null;
  asunto?: string | null | null;
  contenido?: string | null | null;
  estado?: string | null | null;
  destinatarios?: string | null | null;
  enviados?: number | null | null;
  abiertos?: number | null | null;
  clics?: number | null | null;
  creada_en?: string | null | null;
  enviada_en?: string | null | null;
  programada_en?: string | null | null;
  objetivo?: string | null | null;
  presupuesto?: number | null | null;
  publicaciones?: unknown | null | null;
}

export type CampanasUpdate = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  tipo?: string | null;
  asunto?: string | null | null;
  contenido?: string | null | null;
  estado?: string | null | null;
  destinatarios?: string | null | null;
  enviados?: number | null | null;
  abiertos?: number | null | null;
  clics?: number | null | null;
  creada_en?: string | null | null;
  enviada_en?: string | null | null;
  programada_en?: string | null | null;
  objetivo?: string | null | null;
  presupuesto?: number | null | null;
  publicaciones?: unknown | null | null;
}

export type ChallengeDefinitionsInsert = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  descripcion?: string | null | null;
  icono?: string | null;
  metric?: string | null;
  objetivo?: number | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  creditos_recompensa?: number | null;
  activo?: boolean | null;
  creado_en?: string | null;
}

export type ChallengeDefinitionsUpdate = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  descripcion?: string | null | null;
  icono?: string | null;
  metric?: string | null;
  objetivo?: number | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  creditos_recompensa?: number | null;
  activo?: boolean | null;
  creado_en?: string | null;
}

export type ChallengeHistoryInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  challenge_id?: string | null | null;
  nombre?: string | null;
  icono?: string | null;
  creado_en?: string | null;
}

export type ChallengeHistoryUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  challenge_id?: string | null | null;
  nombre?: string | null;
  icono?: string | null;
  creado_en?: string | null;
}

export type ChallengeProgressInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  challenge_id?: string | null | null;
  progreso_actual?: number | null;
  completado?: boolean | null;
  completado_en?: string | null | null;
}

export type ChallengeProgressUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  challenge_id?: string | null | null;
  progreso_actual?: number | null;
  completado?: boolean | null;
  completado_en?: string | null | null;
}

export type CitasInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  instructor_id?: string | null | null;
  tipo?: string | null;
  inicio?: string | null;
  fin?: string | null;
  notas?: string | null | null;
  estado?: string | null;
  precio?: number | null | null;
  creado_en?: string | null | null;
  pagada?: boolean | null | null;
  servicio_id?: string | null | null;
}

export type CitasUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  instructor_id?: string | null | null;
  tipo?: string | null;
  inicio?: string | null;
  fin?: string | null;
  notas?: string | null | null;
  estado?: string | null;
  precio?: number | null | null;
  creado_en?: string | null | null;
  pagada?: boolean | null | null;
  servicio_id?: string | null | null;
}

export type CodigosDescuentoInsert = {
  id?: string | null;
  studio_id?: string | null;
  codigo?: string | null;
  descripcion?: string | null | null;
  tipo?: string | null;
  valor?: number | null;
  usos?: number | null | null;
  usos_max?: number | null | null;
  expira?: string | null | null;
  activo?: boolean | null | null;
  creado_en?: string | null | null;
  min_importe?: number | null | null;
  solo_nuevas?: boolean | null | null;
}

export type CodigosDescuentoUpdate = {
  id?: string | null;
  studio_id?: string | null;
  codigo?: string | null;
  descripcion?: string | null | null;
  tipo?: string | null;
  valor?: number | null;
  usos?: number | null | null;
  usos_max?: number | null | null;
  expira?: string | null | null;
  activo?: boolean | null | null;
  creado_en?: string | null | null;
  min_importe?: number | null | null;
  solo_nuevas?: boolean | null | null;
}

export type CreditTransactionsInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  tipo?: string | null;
  creditos?: number | null;
  descripcion?: string | null;
  ref_id?: string | null | null;
  creado_en?: string | null;
}

export type CreditTransactionsUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  tipo?: string | null;
  creditos?: number | null;
  descripcion?: string | null;
  ref_id?: string | null | null;
  creado_en?: string | null;
}

export type DashboardChartsInsert = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  tipo?: string | null;
  metrica?: string | null;
  agrupacion?: string | null;
  rango?: number | null;
  color?: string | null;
  creado_en?: string | null;
}

export type DashboardChartsUpdate = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  tipo?: string | null;
  metrica?: string | null;
  agrupacion?: string | null;
  rango?: number | null;
  color?: string | null;
  creado_en?: string | null;
}

export type FacturasInsert = {
  id?: string | null;
  studio_id?: string | null;
  recibo_id?: string | null | null;
  numero_completo?: string | null;
  fecha_emision?: string | null;
  receptor_nombre?: string | null | null;
  receptor_nif?: string | null | null;
  base_imponible?: number | null | null;
  tipo_iva?: number | null | null;
  cuota_iva?: number | null | null;
  total?: number | null | null;
  verifactu_hash?: string | null | null;
  verifactu_prev_hash?: string | null | null;
  verifactu_ts?: string | null | null;
  verifactu_seq?: number | null | null;
  fiskaly_invoice_id?: string | null | null;
  verifactu_qr_url?: string | null | null;
  verifactu_qr_imagen?: string | null | null;
  verifactu_estado?: string | null | null;
  verifactu_csv?: string | null | null;
  serie?: string | null | null;
  tipo?: string | null | null;
  rectifica_a?: string | null | null;
  tipo_rectificativa?: string | null | null;
  importe_rectificacion?: number | null | null;
  venta_pos_id?: string | null | null;
  concepto?: string | null | null;
}

export type FacturasUpdate = {
  id?: string | null;
  studio_id?: string | null;
  recibo_id?: string | null | null;
  numero_completo?: string | null;
  fecha_emision?: string | null;
  receptor_nombre?: string | null | null;
  receptor_nif?: string | null | null;
  base_imponible?: number | null | null;
  tipo_iva?: number | null | null;
  cuota_iva?: number | null | null;
  total?: number | null | null;
  verifactu_hash?: string | null | null;
  verifactu_prev_hash?: string | null | null;
  verifactu_ts?: string | null | null;
  verifactu_seq?: number | null | null;
  fiskaly_invoice_id?: string | null | null;
  verifactu_qr_url?: string | null | null;
  verifactu_qr_imagen?: string | null | null;
  verifactu_estado?: string | null | null;
  verifactu_csv?: string | null | null;
  serie?: string | null | null;
  tipo?: string | null | null;
  rectifica_a?: string | null | null;
  tipo_rectificativa?: string | null | null;
  importe_rectificacion?: number | null | null;
  venta_pos_id?: string | null | null;
  concepto?: string | null | null;
}

export type InstructoresInsert = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  email?: string | null | null;
  telefono?: string | null | null;
  color?: string | null | null;
  activo?: boolean | null | null;
  rol?: string | null | null;
  auth_user_id?: string | null | null;
  avatar?: string | null | null;
  foto_url?: string | null | null;
  bio?: string | null | null;
  tipo_contrato?: string | null | null;
}

export type InstructoresUpdate = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  email?: string | null | null;
  telefono?: string | null | null;
  color?: string | null | null;
  activo?: boolean | null | null;
  rol?: string | null | null;
  auth_user_id?: string | null | null;
  avatar?: string | null | null;
  foto_url?: string | null | null;
  bio?: string | null | null;
  tipo_contrato?: string | null | null;
}

export type IntegracionCredencialesInsert = {
  studio_id?: string | null;
  provider?: string | null;
  access_token?: string | null | null;
  refresh_token?: string | null | null;
  expires_at?: string | null | null;
  actualizado_en?: string | null | null;
  metadata?: any | null | null;
}

export type IntegracionCredencialesUpdate = {
  studio_id?: string | null;
  provider?: string | null;
  access_token?: string | null | null;
  refresh_token?: string | null | null;
  expires_at?: string | null | null;
  actualizado_en?: string | null | null;
  metadata?: any | null | null;
}

export type IntegracionesInsert = {
  id?: string | null;
  studio_id?: string | null;
  tipo?: string | null;
  activo?: boolean | null;
  config?: any | null;
  actualizado_en?: string | null;
  ultimo_ok_en?: string | null | null;
  ultimo_error?: string | null | null;
  ultimo_error_en?: string | null | null;
  phone_number_id?: string | null | null;
}

export type IntegracionesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  tipo?: string | null;
  activo?: boolean | null;
  config?: any | null;
  actualizado_en?: string | null;
  ultimo_ok_en?: string | null | null;
  ultimo_error?: string | null | null;
  ultimo_error_en?: string | null | null;
  phone_number_id?: string | null | null;
}

export type LevelDefinitionsInsert = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  orden?: number | null;
  umbral_creditos?: number | null;
  color?: string | null;
  icono?: string | null;
  beneficios?: string | null | null;
  activo?: boolean | null;
  creado_en?: string | null;
}

export type LevelDefinitionsUpdate = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  orden?: number | null;
  umbral_creditos?: number | null;
  color?: string | null;
  icono?: string | null;
  beneficios?: string | null | null;
  activo?: boolean | null;
  creado_en?: string | null;
}

export type MemberCreditsInsert = {
  socio_id?: string | null;
  studio_id?: string | null;
  saldo?: number | null;
  total_ganado?: number | null;
  total_canjeado?: number | null;
  actualizado_en?: string | null;
  caduca_el?: string | null | null;
  creditos_por_compensar?: number | null | null;
}

export type MemberCreditsUpdate = {
  socio_id?: string | null;
  studio_id?: string | null;
  saldo?: number | null;
  total_ganado?: number | null;
  total_canjeado?: number | null;
  actualizado_en?: string | null;
  caduca_el?: string | null | null;
  creditos_por_compensar?: number | null | null;
}

export type MensajesEquipoInsert = {
  id?: string | null;
  studio_id?: string | null;
  autor_instructor_id?: string | null | null;
  autor_nombre?: string | null;
  texto?: string | null;
  creado_en?: string | null | null;
  canal_id?: string | null | null;
}

export type MensajesEquipoUpdate = {
  id?: string | null;
  studio_id?: string | null;
  autor_instructor_id?: string | null | null;
  autor_nombre?: string | null;
  texto?: string | null;
  creado_en?: string | null | null;
  canal_id?: string | null | null;
}

export type NotasInternasInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  texto?: string | null;
  tipo?: string | null | null;
  creado_en?: string | null | null;
}

export type NotasInternasUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  texto?: string | null;
  tipo?: string | null | null;
  creado_en?: string | null | null;
}

export type NotasProgresoInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  instructor_id?: string | null | null;
  sesion_id?: string | null | null;
  texto_libre?: string | null | null;
  progreso?: string | null | null;
  alertas?: string | null | null;
  plan_proxima_sesion?: string | null | null;
  ejercicios_casa?: string | null | null;
  creada_en?: string | null | null;
}

export type NotasProgresoUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  instructor_id?: string | null | null;
  sesion_id?: string | null | null;
  texto_libre?: string | null | null;
  progreso?: string | null | null;
  alertas?: string | null | null;
  plan_proxima_sesion?: string | null | null;
  ejercicios_casa?: string | null | null;
  creada_en?: string | null | null;
}

export type NotificacionesInsert = {
  id?: string | null;
  studio_id?: string | null;
  titulo?: string | null;
  texto?: string | null;
  leida?: boolean | null | null;
  tipo?: string | null | null;
  enlace?: string | null | null;
  creada_en?: string | null | null;
}

export type NotificacionesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  titulo?: string | null;
  texto?: string | null;
  leida?: boolean | null | null;
  tipo?: string | null | null;
  enlace?: string | null | null;
  creada_en?: string | null | null;
}

export type PlanesTarifaInsert = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  descripcion?: string | null | null;
  precio?: number | null;
  tipo?: string | null;
  sesiones?: number | null | null;
  activo?: boolean | null | null;
  validez_dias?: number | null | null;
  limite_semanal?: number | null | null;
  oferta_hasta?: string | null | null;
  periodicidad_meses?: number | null | null;
  matricula?: number | null | null;
  matricula_gratis_hasta?: string | null | null;
  matricula_gratis_cupos?: number | null | null;
  matricula_gratis_usados?: number | null | null;
}

export type PlanesTarifaUpdate = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  descripcion?: string | null | null;
  precio?: number | null;
  tipo?: string | null;
  sesiones?: number | null | null;
  activo?: boolean | null | null;
  validez_dias?: number | null | null;
  limite_semanal?: number | null | null;
  oferta_hasta?: string | null | null;
  periodicidad_meses?: number | null | null;
  matricula?: number | null | null;
  matricula_gratis_hasta?: string | null | null;
  matricula_gratis_cupos?: number | null | null;
  matricula_gratis_usados?: number | null | null;
}

export type PostsComunidadInsert = {
  id?: string | null;
  studio_id?: string | null;
  autor_id?: string | null | null;
  autor_nombre?: string | null;
  autor_inicial?: string | null | null;
  texto?: string | null;
  likes?: number | null | null;
  comentarios_count?: number | null | null;
  fijado?: boolean | null | null;
  creado_en?: string | null | null;
  audiencia?: string | null | null;
  imagen_url?: string | null | null;
  tipo?: string | null | null;
  evento_fecha?: string | null | null;
  evento_aforo?: number | null | null;
  evento_lugar?: string | null | null;
}

export type PostsComunidadUpdate = {
  id?: string | null;
  studio_id?: string | null;
  autor_id?: string | null | null;
  autor_nombre?: string | null;
  autor_inicial?: string | null | null;
  texto?: string | null;
  likes?: number | null | null;
  comentarios_count?: number | null | null;
  fijado?: boolean | null | null;
  creado_en?: string | null | null;
  audiencia?: string | null | null;
  imagen_url?: string | null | null;
  tipo?: string | null | null;
  evento_fecha?: string | null | null;
  evento_aforo?: number | null | null;
  evento_lugar?: string | null | null;
}

export type PreferenciasSocioInsert = {
  socio_id?: string | null;
  studio_id?: string | null;
  disponibilidad?: any | null;
  instructor_favorito_id?: string | null | null;
  tipo_clase_favorita?: string | null | null;
  duracion_preferida?: number | null | null;
  nivel?: string | null | null;
  notif_email?: boolean | null;
  notif_whatsapp?: boolean | null;
  actualizado_en?: string | null;
}

export type PreferenciasSocioUpdate = {
  socio_id?: string | null;
  studio_id?: string | null;
  disponibilidad?: any | null;
  instructor_favorito_id?: string | null | null;
  tipo_clase_favorita?: string | null | null;
  duracion_preferida?: number | null | null;
  nivel?: string | null | null;
  notif_email?: boolean | null;
  notif_whatsapp?: boolean | null;
  actualizado_en?: string | null;
}

export type ProductosPosInsert = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  categoria?: string | null;
  precio?: number | null;
  activo?: boolean | null | null;
  stock?: number | null | null;
  stock_minimo?: number | null | null;
  iva_pct?: number | null | null;
  descripcion?: string | null | null;
  imagen_url?: string | null | null;
  sku?: string | null | null;
  codigo_barras?: string | null | null;
  orden?: number | null | null;
}

export type ProductosPosUpdate = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  categoria?: string | null;
  precio?: number | null;
  activo?: boolean | null | null;
  stock?: number | null | null;
  stock_minimo?: number | null | null;
  iva_pct?: number | null | null;
  descripcion?: string | null | null;
  imagen_url?: string | null | null;
  sku?: string | null | null;
  codigo_barras?: string | null | null;
  orden?: number | null | null;
}

export type RecibosInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  suscripcion_id?: string | null | null;
  concepto?: string | null;
  importe?: number | null;
  estado?: string | null;
  fecha_vencimiento?: string | null;
  fecha_cobro?: string | null | null;
  fecha_devolucion?: string | null | null;
  intentos_reintento?: number | null | null;
  metodo_cobro?: string | null | null;
  sepa_estado?: string | null | null;
  proximo_reintento?: string | null | null;
  disputa_estado?: string | null | null;
  disputa_stripe_id?: string | null | null;
  stripe_payment_intent_id?: string | null | null;
  entrega_tipo?: string | null | null;
  entrega_aplicada?: boolean | null | null;
  entrega_aplicada_en?: string | null | null;
  entrega_sesiones_antes?: number | null | null;
  entrega_sesiones_despues?: number | null | null;
  entrega_fecha_fin_antes?: string | null | null;
  entrega_fecha_fin_despues?: string | null | null;
  entrega_estado_antes?: string | null | null;
  importe_devuelto?: number | null | null;
  reembolso_solicitado_en?: string | null | null;
  reembolso_stripe_id?: string | null | null;
  checkout_session_id?: string | null | null;
  reembolso_fallido_en?: string | null | null;
  reembolso_fallo_motivo?: string | null | null;
  conciliado_en?: string | null | null;
  conciliado_por?: string | null | null;
  factura_pendiente_sellar?: boolean | null | null;
  es_renovacion?: boolean | null | null;
  cobro_mostrador_pi?: string | null | null;
  terminos_hash?: string | null | null;
  terminos_aceptados_en?: string | null | null;
  cobro_mostrador_checkout_session_id?: string | null | null;
  tras_cancelar_cuota?: string | null | null;
  anulado_en?: string | null | null;
}

export type RecibosUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  suscripcion_id?: string | null | null;
  concepto?: string | null;
  importe?: number | null;
  estado?: string | null;
  fecha_vencimiento?: string | null;
  fecha_cobro?: string | null | null;
  fecha_devolucion?: string | null | null;
  intentos_reintento?: number | null | null;
  metodo_cobro?: string | null | null;
  sepa_estado?: string | null | null;
  proximo_reintento?: string | null | null;
  disputa_estado?: string | null | null;
  disputa_stripe_id?: string | null | null;
  stripe_payment_intent_id?: string | null | null;
  entrega_tipo?: string | null | null;
  entrega_aplicada?: boolean | null | null;
  entrega_aplicada_en?: string | null | null;
  entrega_sesiones_antes?: number | null | null;
  entrega_sesiones_despues?: number | null | null;
  entrega_fecha_fin_antes?: string | null | null;
  entrega_fecha_fin_despues?: string | null | null;
  entrega_estado_antes?: string | null | null;
  importe_devuelto?: number | null | null;
  reembolso_solicitado_en?: string | null | null;
  reembolso_stripe_id?: string | null | null;
  checkout_session_id?: string | null | null;
  reembolso_fallido_en?: string | null | null;
  reembolso_fallo_motivo?: string | null | null;
  conciliado_en?: string | null | null;
  conciliado_por?: string | null | null;
  factura_pendiente_sellar?: boolean | null | null;
  es_renovacion?: boolean | null | null;
  cobro_mostrador_pi?: string | null | null;
  terminos_hash?: string | null | null;
  terminos_aceptados_en?: string | null | null;
  cobro_mostrador_checkout_session_id?: string | null | null;
  tras_cancelar_cuota?: string | null | null;
  anulado_en?: string | null | null;
}

export type RewardActionsInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  trigger?: string | null;
  ref_id?: string | null | null;
  creado_en?: string | null;
}

export type RewardActionsUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  trigger?: string | null;
  ref_id?: string | null | null;
  creado_en?: string | null;
}

export type RewardCatalogInsert = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  descripcion?: string | null | null;
  coste_creditos?: number | null;
  icono?: string | null;
  activo?: boolean | null;
  stock?: number | null | null;
  creado_en?: string | null;
  efecto?: string | null | null;
  limite_por_socia?: number | null | null;
  disponible_desde?: string | null | null;
  disponible_hasta?: string | null | null;
}

export type RewardCatalogUpdate = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  descripcion?: string | null | null;
  coste_creditos?: number | null;
  icono?: string | null;
  activo?: boolean | null;
  stock?: number | null | null;
  creado_en?: string | null;
  efecto?: string | null | null;
  limite_por_socia?: number | null | null;
  disponible_desde?: string | null | null;
  disponible_hasta?: string | null | null;
}

export type RewardHistoryInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  rule_id?: string | null | null;
  action_id?: string | null | null;
  creditos?: number | null;
  descripcion?: string | null;
  creado_en?: string | null;
}

export type RewardHistoryUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  rule_id?: string | null | null;
  action_id?: string | null | null;
  creditos?: number | null;
  descripcion?: string | null;
  creado_en?: string | null;
}

export type RewardRedemptionsInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  catalog_item_id?: string | null | null;
  creditos_gastados?: number | null;
  estado?: string | null;
  creado_en?: string | null;
  codigo?: string | null | null;
  entregado_en?: string | null | null;
  entregado_por?: string | null | null;
  recuperacion_id?: string | null | null;
}

export type RewardRedemptionsUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  catalog_item_id?: string | null | null;
  creditos_gastados?: number | null;
  estado?: string | null;
  creado_en?: string | null;
  codigo?: string | null | null;
  entregado_en?: string | null | null;
  entregado_por?: string | null | null;
  recuperacion_id?: string | null | null;
}

export type RewardRulesInsert = {
  id?: string | null;
  studio_id?: string | null;
  trigger?: string | null;
  nombre?: string | null;
  descripcion?: string | null | null;
  creditos?: number | null;
  activa?: boolean | null;
  creado_en?: string | null;
  tope_mensual?: number | null | null;
  unidad_euros?: number | null | null;
}

export type RewardRulesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  trigger?: string | null;
  nombre?: string | null;
  descripcion?: string | null | null;
  creditos?: number | null;
  activa?: boolean | null;
  creado_en?: string | null;
  tope_mensual?: number | null | null;
  unidad_euros?: number | null | null;
}

export type SalasInsert = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  capacidad?: number | null;
  color?: string | null | null;
  foto_url?: string | null | null;
}

export type SalasUpdate = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  capacidad?: number | null;
  color?: string | null | null;
  foto_url?: string | null | null;
}

export type SesionesInsert = {
  id?: string | null;
  studio_id?: string | null;
  tipo_clase_id?: string | null | null;
  sala_id?: string | null | null;
  instructor_id?: string | null | null;
  inicio?: string | null;
  fin?: string | null;
  aforo_maximo?: number | null;
  cancelada?: boolean | null | null;
  notas?: string | null | null;
  precio_puntual?: number | null | null;
  google_event_id?: string | null | null;
  serie_id?: string | null | null;
  valoracion_pedida_en?: string | null | null;
  cancelada_motivo?: string | null | null;
  incidencia_texto?: string | null | null;
  zoom_meeting_id?: number | null | null;
  zoom_join_url?: string | null | null;
  creado_en?: string | null | null;
}

export type SesionesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  tipo_clase_id?: string | null | null;
  sala_id?: string | null | null;
  instructor_id?: string | null | null;
  inicio?: string | null;
  fin?: string | null;
  aforo_maximo?: number | null;
  cancelada?: boolean | null | null;
  notas?: string | null | null;
  precio_puntual?: number | null | null;
  google_event_id?: string | null | null;
  serie_id?: string | null | null;
  valoracion_pedida_en?: string | null | null;
  cancelada_motivo?: string | null | null;
  incidencia_texto?: string | null | null;
  zoom_meeting_id?: number | null | null;
  zoom_join_url?: string | null | null;
  creado_en?: string | null | null;
}

export type SociosInsert = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  apellidos?: string | null;
  email?: string | null | null;
  telefono?: string | null | null;
  nif?: string | null | null;
  fecha_alta?: string | null | null;
  activo?: boolean | null | null;
  lead_stage?: string | null | null;
  tags?: string[] | null | null;
  aceptacion_fecha?: string | null | null;
  aceptacion_firma?: string | null | null;
  aceptacion_version?: string | null | null;
  stripe_customer_id?: string | null | null;
  stripe_payment_method_id?: string | null | null;
  avatar?: string | null | null;
  referido_por?: string | null | null;
  fecha_nacimiento?: string | null | null;
  foto_url?: string | null | null;
  auth_user_id?: string | null | null;
  direccion?: string | null | null;
  borrado_en?: string | null | null;
  campos_extra?: Record<string, string | number | boolean | null> | null | null;
  metodo_pago_preferido?: string | null | null;
  sepa_mandate_id?: string | null | null;
  sepa_payment_method_id?: string | null | null;
  aceptacion_origen?: string | null | null;
  aceptacion_por?: string | null | null;
  consentimiento_salud_fecha?: string | null | null;
  consentimiento_salud_registrado_por?: string | null | null;
  consentimiento_salud_revocado_en?: string | null | null;
  tarjeta_exp_mes?: number | null | null;
  tarjeta_exp_anio?: number | null | null;
  tarjeta_marca?: string | null | null;
  tarjeta_ultimos4?: string | null | null;
  origen_lead?: string | null | null;
  consentimiento_marketing_en?: string | null | null;
  consentimiento_marketing_texto?: string | null | null;
  consentimiento_marketing_por?: string | null | null;
  visible_en_clase?: boolean | null | null;
  usuario?: string | null | null;
  consentimiento_salud_texto?: string | null | null;
  objetivo_clases_mes?: number | null | null;
  excluir_de_perfilado?: boolean | null | null;
  consentimiento_salud_registrado_por_uid?: string | null | null;
  cumple_mm_dd?: string | null | null;
}

export type SociosUpdate = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  apellidos?: string | null;
  email?: string | null | null;
  telefono?: string | null | null;
  nif?: string | null | null;
  fecha_alta?: string | null | null;
  activo?: boolean | null | null;
  lead_stage?: string | null | null;
  tags?: string[] | null | null;
  aceptacion_fecha?: string | null | null;
  aceptacion_firma?: string | null | null;
  aceptacion_version?: string | null | null;
  stripe_customer_id?: string | null | null;
  stripe_payment_method_id?: string | null | null;
  avatar?: string | null | null;
  referido_por?: string | null | null;
  fecha_nacimiento?: string | null | null;
  foto_url?: string | null | null;
  auth_user_id?: string | null | null;
  direccion?: string | null | null;
  borrado_en?: string | null | null;
  campos_extra?: Record<string, string | number | boolean | null> | null | null;
  metodo_pago_preferido?: string | null | null;
  sepa_mandate_id?: string | null | null;
  sepa_payment_method_id?: string | null | null;
  aceptacion_origen?: string | null | null;
  aceptacion_por?: string | null | null;
  consentimiento_salud_fecha?: string | null | null;
  consentimiento_salud_registrado_por?: string | null | null;
  consentimiento_salud_revocado_en?: string | null | null;
  tarjeta_exp_mes?: number | null | null;
  tarjeta_exp_anio?: number | null | null;
  tarjeta_marca?: string | null | null;
  tarjeta_ultimos4?: string | null | null;
  origen_lead?: string | null | null;
  consentimiento_marketing_en?: string | null | null;
  consentimiento_marketing_texto?: string | null | null;
  consentimiento_marketing_por?: string | null | null;
  visible_en_clase?: boolean | null | null;
  usuario?: string | null | null;
  consentimiento_salud_texto?: string | null | null;
  objetivo_clases_mes?: number | null | null;
  excluir_de_perfilado?: boolean | null | null;
  consentimiento_salud_registrado_por_uid?: string | null | null;
  cumple_mm_dd?: string | null | null;
}

export type SoporteSolicitudesInsert = {
  id?: string | null;
  studio_id?: string | null;
  tipo?: string | null;
  mensaje?: string | null;
  contacto?: string | null | null;
  creado_en?: string | null;
}

export type SoporteSolicitudesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  tipo?: string | null;
  mensaje?: string | null;
  contacto?: string | null | null;
  creado_en?: string | null;
}

export type SpotsInsert = {
  id?: string | null;
  sala_id?: string | null | null;
  studio_id?: string | null;
  numero?: number | null;
  nombre?: string | null | null;
  fila?: number | null | null;
  columna?: number | null | null;
  tipo?: string | null | null;
  activo?: boolean | null | null;
}

export type SpotsUpdate = {
  id?: string | null;
  sala_id?: string | null | null;
  studio_id?: string | null;
  numero?: number | null;
  nombre?: string | null | null;
  fila?: number | null | null;
  columna?: number | null | null;
  tipo?: string | null | null;
  activo?: boolean | null | null;
}

export type StudiosInsert = {
  id?: string | null;
  nombre?: string | null;
  nif?: string | null | null;
  razon_social?: string | null | null;
  direccion?: string | null | null;
  ciudad?: string | null | null;
  codigo_postal?: string | null | null;
  email?: string | null | null;
  telefono?: string | null | null;
  color_primario?: string | null | null;
  plan?: string | null | null;
  creado_en?: string | null | null;
  owner_auth_user_id?: string | null | null;
  slug?: string | null | null;
  stripe_account_id?: string | null | null;
  avatar_admin?: string | null | null;
  tema_portal?: string | null | null;
  google_calendar_email?: string | null | null;
  cancelacion_ventana_horas?: number | null | null;
  cancelacion_devolver_bono_tardia?: boolean | null | null;
  reserva_exigir_plan?: boolean | null | null;
  reserva_max_simultaneas?: number | null | null;
  stripe_customer_id?: string | null | null;
  subscription_id?: string | null | null;
  subscription_status?: string | null | null;
  current_period_end?: string | null | null;
  kiosk_token?: string | null | null;
  stripe_terminal_reader_id?: string | null | null;
  stripe_terminal_location_id?: string | null | null;
  logo_url?: string | null | null;
  iva_por_defecto?: number | null | null;
  dep_umbral_alto?: number | null | null;
  dep_umbral_medio?: number | null | null;
  dep_ventana_dias?: number | null | null;
  modo_autonomia?: string | null | null;
  umbral_score_autonomo?: number | null | null;
  avisar_alumnas?: boolean | null | null;
  onboarding_descartado_en?: string | null | null;
  pedir_confirmacion_riesgo?: boolean | null | null;
  gmail_email?: string | null | null;
  zoom_email?: string | null | null;
  gestoria_email?: string | null | null;
  cadena_id?: string | null | null;
  foto_url?: string | null | null;
  fiskaly_signer_id?: string | null | null;
  fiskaly_client_id?: string | null | null;
  recuperacion_caducidad_tipo?: string | null | null;
  recuperacion_caducidad_dias?: number | null | null;
  sepa_acreedor_id?: string | null | null;
  sepa_iban?: string | null | null;
  sepa_titular?: string | null | null;
  politica_privacidad?: string | null | null;
  terminos_servicio?: string | null | null;
  compra_publica_modo?: string | null | null;
  como_nos_conocio?: string | null | null;
  bienvenida_vista_en?: string | null | null;
  onb_centros?: string | null | null;
  onb_software_anterior?: string | null | null;
  onb_alumnos_activos?: string | null | null;
  onb_importar_datos?: string | null | null;
  onb_prioridad?: string[] | null | null;
  onb_ayuda_alta?: string | null | null;
  descripcion?: string | null | null;
  anio_fundacion?: number | null | null;
  suspendido_en?: string | null | null;
  suspendido_motivo?: string | null | null;
  suspendido_por?: string | null | null;
  reserva_ventana_minima_minutos?: number | null | null;
  reserva_antelacion_maxima_dias?: number | null | null;
  permite_lista_espera?: boolean | null | null;
  requiere_aprobacion?: boolean | null | null;
  lista_espera_plazo_aceptacion_minutos?: number | null | null;
  penalizacion_importe_eur?: number | null | null;
  penalizacion_aplica_no_show?: boolean | null | null;
  penalizacion_aplica_cancelacion_tardia?: boolean | null | null;
  penalizacion_cobro_automatico?: boolean | null | null;
  decision_contrato_visto_en?: string | null | null;
  minimo_asistentes_por_clase?: number | null | null;
  hora_apertura?: string | null | null;
  hora_cierre?: string | null | null;
  instructor_reparto_penalizacion_pct?: number | null | null;
  tour_visto_en?: string | null | null;
  gestoria_envio_automatico?: string | null | null;
  gestoria_ultimo_envio_periodo?: string | null | null;
  requiere_checkin_qr?: boolean | null | null;
  imagen_bienvenida_url?: string | null | null;
  reembolsos_activos?: boolean | null | null;
  reembolso_plazo_dias?: number | null | null;
  reembolso_solo_sin_usar?: boolean | null | null;
  pagina_publica_oculta?: boolean | null | null;
  pagina_publica_clave_hash?: string | null | null;
  tipo_cuenta?: string | null | null;
  normas_texto?: string | null | null;
  klaviyo_account_name?: string | null | null;
  widget_dominios_autorizados?: string[] | null | null;
  trial_ends_at?: string | null | null;
  widget_builder?: Record<string, unknown> | null | null;
  sitio_web?: string | null | null;
  review_boost_elegible_en?: string | null | null;
  review_boost_mostrado_en?: string | null | null;
  review_boost_pospuesto_en?: string | null | null;
  review_boost_veces_mostrado?: number | null | null;
  cancelacion_clase_devuelve_bono?: boolean | null | null;
  lat?: number | null | null;
  lng?: number | null | null;
  visible_en_network?: boolean | null | null;
  stripe_account_id_anterior?: string | null | null;
  stripe_account_desconectado_en?: string | null | null;
  bloquear_reserva_impago?: boolean | null | null;
  recuperacion_auto_semanal?: boolean | null | null;
  creditos_nombre?: string | null | null;
  creditos_caducan_meses?: number | null | null;
  racha_clases_semana?: number | null | null;
  valoracion_inicial_activa?: boolean | null | null;
  lema?: string | null | null;
  frase_heroe?: string | null | null;
  frase_manuscrita?: string | null | null;
  subtitulo_heroe?: string | null | null;
  instructoras_crean_clases?: boolean | null | null;
  plaza_fija_sin_cuota?: string | null | null;
  recibos_al_cancelar_cuota?: string | null | null;
  renovar_sola_cuota_cancelada?: boolean | null | null;
  plaza_fija_solicitar_desde_app?: boolean | null | null;
  plaza_fija_pausa_desde_app?: boolean | null | null;
  plaza_fija_pausa_libera_sitio?: boolean | null | null;
  plaza_fija_fin_pausa?: string | null | null;
  fecha_apertura?: string | null | null;
  recordatorio_largo_horas?: number | null | null;
  recordatorio_corto_minutos?: number | null | null;
}

export type StudiosUpdate = {
  id?: string | null;
  nombre?: string | null;
  nif?: string | null | null;
  razon_social?: string | null | null;
  direccion?: string | null | null;
  ciudad?: string | null | null;
  codigo_postal?: string | null | null;
  email?: string | null | null;
  telefono?: string | null | null;
  color_primario?: string | null | null;
  plan?: string | null | null;
  creado_en?: string | null | null;
  owner_auth_user_id?: string | null | null;
  slug?: string | null | null;
  stripe_account_id?: string | null | null;
  avatar_admin?: string | null | null;
  tema_portal?: string | null | null;
  google_calendar_email?: string | null | null;
  cancelacion_ventana_horas?: number | null | null;
  cancelacion_devolver_bono_tardia?: boolean | null | null;
  reserva_exigir_plan?: boolean | null | null;
  reserva_max_simultaneas?: number | null | null;
  stripe_customer_id?: string | null | null;
  subscription_id?: string | null | null;
  subscription_status?: string | null | null;
  current_period_end?: string | null | null;
  kiosk_token?: string | null | null;
  stripe_terminal_reader_id?: string | null | null;
  stripe_terminal_location_id?: string | null | null;
  logo_url?: string | null | null;
  iva_por_defecto?: number | null | null;
  dep_umbral_alto?: number | null | null;
  dep_umbral_medio?: number | null | null;
  dep_ventana_dias?: number | null | null;
  modo_autonomia?: string | null | null;
  umbral_score_autonomo?: number | null | null;
  avisar_alumnas?: boolean | null | null;
  onboarding_descartado_en?: string | null | null;
  pedir_confirmacion_riesgo?: boolean | null | null;
  gmail_email?: string | null | null;
  zoom_email?: string | null | null;
  gestoria_email?: string | null | null;
  cadena_id?: string | null | null;
  foto_url?: string | null | null;
  fiskaly_signer_id?: string | null | null;
  fiskaly_client_id?: string | null | null;
  recuperacion_caducidad_tipo?: string | null | null;
  recuperacion_caducidad_dias?: number | null | null;
  sepa_acreedor_id?: string | null | null;
  sepa_iban?: string | null | null;
  sepa_titular?: string | null | null;
  politica_privacidad?: string | null | null;
  terminos_servicio?: string | null | null;
  compra_publica_modo?: string | null | null;
  como_nos_conocio?: string | null | null;
  bienvenida_vista_en?: string | null | null;
  onb_centros?: string | null | null;
  onb_software_anterior?: string | null | null;
  onb_alumnos_activos?: string | null | null;
  onb_importar_datos?: string | null | null;
  onb_prioridad?: string[] | null | null;
  onb_ayuda_alta?: string | null | null;
  descripcion?: string | null | null;
  anio_fundacion?: number | null | null;
  suspendido_en?: string | null | null;
  suspendido_motivo?: string | null | null;
  suspendido_por?: string | null | null;
  reserva_ventana_minima_minutos?: number | null | null;
  reserva_antelacion_maxima_dias?: number | null | null;
  permite_lista_espera?: boolean | null | null;
  requiere_aprobacion?: boolean | null | null;
  lista_espera_plazo_aceptacion_minutos?: number | null | null;
  penalizacion_importe_eur?: number | null | null;
  penalizacion_aplica_no_show?: boolean | null | null;
  penalizacion_aplica_cancelacion_tardia?: boolean | null | null;
  penalizacion_cobro_automatico?: boolean | null | null;
  decision_contrato_visto_en?: string | null | null;
  minimo_asistentes_por_clase?: number | null | null;
  hora_apertura?: string | null | null;
  hora_cierre?: string | null | null;
  instructor_reparto_penalizacion_pct?: number | null | null;
  tour_visto_en?: string | null | null;
  gestoria_envio_automatico?: string | null | null;
  gestoria_ultimo_envio_periodo?: string | null | null;
  requiere_checkin_qr?: boolean | null | null;
  imagen_bienvenida_url?: string | null | null;
  reembolsos_activos?: boolean | null | null;
  reembolso_plazo_dias?: number | null | null;
  reembolso_solo_sin_usar?: boolean | null | null;
  pagina_publica_oculta?: boolean | null | null;
  pagina_publica_clave_hash?: string | null | null;
  tipo_cuenta?: string | null | null;
  normas_texto?: string | null | null;
  klaviyo_account_name?: string | null | null;
  widget_dominios_autorizados?: string[] | null | null;
  trial_ends_at?: string | null | null;
  widget_builder?: Record<string, unknown> | null | null;
  sitio_web?: string | null | null;
  review_boost_elegible_en?: string | null | null;
  review_boost_mostrado_en?: string | null | null;
  review_boost_pospuesto_en?: string | null | null;
  review_boost_veces_mostrado?: number | null | null;
  cancelacion_clase_devuelve_bono?: boolean | null | null;
  lat?: number | null | null;
  lng?: number | null | null;
  visible_en_network?: boolean | null | null;
  stripe_account_id_anterior?: string | null | null;
  stripe_account_desconectado_en?: string | null | null;
  bloquear_reserva_impago?: boolean | null | null;
  recuperacion_auto_semanal?: boolean | null | null;
  creditos_nombre?: string | null | null;
  creditos_caducan_meses?: number | null | null;
  racha_clases_semana?: number | null | null;
  valoracion_inicial_activa?: boolean | null | null;
  lema?: string | null | null;
  frase_heroe?: string | null | null;
  frase_manuscrita?: string | null | null;
  subtitulo_heroe?: string | null | null;
  instructoras_crean_clases?: boolean | null | null;
  plaza_fija_sin_cuota?: string | null | null;
  recibos_al_cancelar_cuota?: string | null | null;
  renovar_sola_cuota_cancelada?: boolean | null | null;
  plaza_fija_solicitar_desde_app?: boolean | null | null;
  plaza_fija_pausa_desde_app?: boolean | null | null;
  plaza_fija_pausa_libera_sitio?: boolean | null | null;
  plaza_fija_fin_pausa?: string | null | null;
  fecha_apertura?: string | null | null;
  recordatorio_largo_horas?: number | null | null;
  recordatorio_corto_minutos?: number | null | null;
}

export type SuscripcionesInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  plan_id?: string | null | null;
  estado?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null | null;
  sesiones_restantes?: number | null | null;
  stripe_subscription_id?: string | null | null;
  baja_al_vencer?: boolean | null | null;
}

export type SuscripcionesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  plan_id?: string | null | null;
  estado?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null | null;
  sesiones_restantes?: number | null | null;
  stripe_subscription_id?: string | null | null;
  baja_al_vencer?: boolean | null | null;
}

export type TiposClaseInsert = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  color?: string | null | null;
  duracion_minutos?: number | null | null;
  descripcion?: string | null | null;
  nivel?: string | null | null;
  foto_url?: string | null | null;
  ventana_cancelacion_horas?: number | null | null;
  reserva_exigir_plan?: boolean | null | null;
  reserva_ventana_minima_minutos?: number | null | null;
  reserva_antelacion_maxima_dias?: number | null | null;
  permite_lista_espera?: boolean | null | null;
  requiere_aprobacion?: boolean | null | null;
  lista_espera_plazo_aceptacion_minutos?: number | null | null;
  penalizacion_importe_eur?: number | null | null;
  minimo_asistentes_por_clase?: number | null | null;
  objetivos?: string[] | null | null;
  especialidad_network?: string | null | null;
  es_online?: boolean | null | null;
  aforo_por_defecto?: number | null | null;
  requiere_autorizacion?: boolean | null | null;
  logo_url?: string | null | null;
  requiere_checkin_qr?: boolean | null | null;
}

export type TiposClaseUpdate = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  color?: string | null | null;
  duracion_minutos?: number | null | null;
  descripcion?: string | null | null;
  nivel?: string | null | null;
  foto_url?: string | null | null;
  ventana_cancelacion_horas?: number | null | null;
  reserva_exigir_plan?: boolean | null | null;
  reserva_ventana_minima_minutos?: number | null | null;
  reserva_antelacion_maxima_dias?: number | null | null;
  permite_lista_espera?: boolean | null | null;
  requiere_aprobacion?: boolean | null | null;
  lista_espera_plazo_aceptacion_minutos?: number | null | null;
  penalizacion_importe_eur?: number | null | null;
  minimo_asistentes_por_clase?: number | null | null;
  objetivos?: string[] | null | null;
  especialidad_network?: string | null | null;
  es_online?: boolean | null | null;
  aforo_por_defecto?: number | null | null;
  requiere_autorizacion?: boolean | null | null;
  logo_url?: string | null | null;
  requiere_checkin_qr?: boolean | null | null;
}

export type UsuariosInsert = {
  id?: string | null;
  studio_id?: string | null | null;
  rol?: string | null | null;
  nombre?: string | null | null;
  email?: string | null | null;
  telefono?: string | null | null;
  avatar_url?: string | null | null;
}

export type UsuariosUpdate = {
  id?: string | null;
  studio_id?: string | null | null;
  rol?: string | null | null;
  nombre?: string | null | null;
  email?: string | null | null;
  telefono?: string | null | null;
  avatar_url?: string | null | null;
}

export type VentasPosInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  items?: any | null;
  subtotal?: number | null;
  descuento?: number | null | null;
  total?: number | null;
  metodo_pago?: string | null;
  notas?: string | null | null;
  realizada_en?: string | null | null;
  stripe_payment_intent_id?: string | null | null;
  devuelta_en?: string | null | null;
  importe_devuelto?: number | null | null;
  conciliado_en?: string | null | null;
  conciliado_por?: string | null | null;
  numero?: number | null | null;
  estado?: string | null | null;
  pago_estado?: string | null | null;
  pago_actualizado_en?: string | null | null;
  pago_error?: string | null | null;
  base_imponible?: number | null | null;
  iva_total?: number | null | null;
  efectivo_recibido?: number | null | null;
  cambio?: number | null | null;
  vendido_por?: string | null | null;
  vendido_por_nombre?: string | null | null;
  caja_id?: string | null | null;
  recibo_id?: string | null | null;
  idempotencia_clave?: string | null | null;
  anulada_en?: string | null | null;
  anulada_por?: string | null | null;
  anulada_motivo?: string | null | null;
  checkout_session_id?: string | null | null;
  matricula_cupo_plan_id?: string | null | null;
}

export type VentasPosUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  items?: any | null;
  subtotal?: number | null;
  descuento?: number | null | null;
  total?: number | null;
  metodo_pago?: string | null;
  notas?: string | null | null;
  realizada_en?: string | null | null;
  stripe_payment_intent_id?: string | null | null;
  devuelta_en?: string | null | null;
  importe_devuelto?: number | null | null;
  conciliado_en?: string | null | null;
  conciliado_por?: string | null | null;
  numero?: number | null | null;
  estado?: string | null | null;
  pago_estado?: string | null | null;
  pago_actualizado_en?: string | null | null;
  pago_error?: string | null | null;
  base_imponible?: number | null | null;
  iva_total?: number | null | null;
  efectivo_recibido?: number | null | null;
  cambio?: number | null | null;
  vendido_por?: string | null | null;
  vendido_por_nombre?: string | null | null;
  caja_id?: string | null | null;
  recibo_id?: string | null | null;
  idempotencia_clave?: string | null | null;
  anulada_en?: string | null | null;
  anulada_por?: string | null | null;
  anulada_motivo?: string | null | null;
  checkout_session_id?: string | null | null;
  matricula_cupo_plan_id?: string | null | null;
}

export type VideosOnDemandInsert = {
  id?: string | null;
  studio_id?: string | null;
  titulo?: string | null;
  descripcion?: string | null | null;
  categoria?: string | null;
  duracion_minutos?: number | null | null;
  nivel?: string | null | null;
  instructor_id?: string | null | null;
  vistas?: number | null | null;
  likes?: number | null | null;
  activo?: boolean | null | null;
  creado_en?: string | null | null;
  stream_uid?: string | null | null;
}

export type VideosOnDemandUpdate = {
  id?: string | null;
  studio_id?: string | null;
  titulo?: string | null;
  descripcion?: string | null | null;
  categoria?: string | null;
  duracion_minutos?: number | null | null;
  nivel?: string | null | null;
  instructor_id?: string | null | null;
  vistas?: number | null | null;
  likes?: number | null | null;
  activo?: boolean | null | null;
  creado_en?: string | null | null;
  stream_uid?: string | null | null;
}

export type DecisionSessionsInsert = {
  id?: string | null;
  studio_id?: string | null;
  disparado_por?: string | null;
  algorithm_version?: string | null;
  iniciado_en?: string | null | null;
  finalizado_en?: string | null | null;
  snapshot_stats?: any | null | null;
  n_candidatas_generadas?: number | null;
  n_candidatas_descartadas?: number | null;
  n_recomendaciones_persistidas?: number | null;
  resumen_diario_id?: string | null | null;
  errores?: any | null | null;
  estado?: string | null;
}

export type DecisionSessionsUpdate = {
  id?: string | null;
  studio_id?: string | null;
  disparado_por?: string | null;
  algorithm_version?: string | null;
  iniciado_en?: string | null | null;
  finalizado_en?: string | null | null;
  snapshot_stats?: any | null | null;
  n_candidatas_generadas?: number | null;
  n_candidatas_descartadas?: number | null;
  n_recomendaciones_persistidas?: number | null;
  resumen_diario_id?: string | null | null;
  errores?: any | null | null;
  estado?: string | null;
}

export type RecomendacionesInsert = {
  id?: string | null;
  studio_id?: string | null;
  decision_session_id?: string | null;
  algorithm_version?: string | null;
  especialista?: string | null;
  tipo?: string | null;
  dedupe_key?: string | null;
  titulo?: string | null;
  motivo?: string | null;
  datos_usados?: any | null;
  riesgo?: string | null;
  impacto?: any | null | null;
  confianza?: any | null;
  score?: number | null;
  prioridad?: string | null;
  nivel_autonomia?: number | null;
  accion?: any | null;
  socio_id?: string | null | null;
  sesion_id?: string | null | null;
  recibo_id?: string | null | null;
  tiempo_estimado_min?: number | null;
  estado?: string | null;
  vista_en?: string | null | null;
  expira_en?: string | null;
  creado_en?: string | null | null;
  resuelto_en?: string | null | null;
  resuelto_por?: string | null | null;
}

export type RecomendacionesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  decision_session_id?: string | null;
  algorithm_version?: string | null;
  especialista?: string | null;
  tipo?: string | null;
  dedupe_key?: string | null;
  titulo?: string | null;
  motivo?: string | null;
  datos_usados?: any | null;
  riesgo?: string | null;
  impacto?: any | null | null;
  confianza?: any | null;
  score?: number | null;
  prioridad?: string | null;
  nivel_autonomia?: number | null;
  accion?: any | null;
  socio_id?: string | null | null;
  sesion_id?: string | null | null;
  recibo_id?: string | null | null;
  tiempo_estimado_min?: number | null;
  estado?: string | null;
  vista_en?: string | null | null;
  expira_en?: string | null;
  creado_en?: string | null | null;
  resuelto_en?: string | null | null;
  resuelto_por?: string | null | null;
}

export type RecomendacionOutcomesInsert = {
  id?: string | null;
  studio_id?: string | null;
  recomendacion_id?: string | null;
  evento?: string | null;
  outcome?: string | null;
  senal_observada?: string | null | null;
  ventana_dias?: number | null;
  medido_en?: string | null | null;
  creado_en?: string | null | null;
  impacto_real?: any | null | null;
  confianza_medicion?: string | null | null;
}

export type RecomendacionOutcomesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  recomendacion_id?: string | null;
  evento?: string | null;
  outcome?: string | null;
  senal_observada?: string | null | null;
  ventana_dias?: number | null;
  medido_en?: string | null | null;
  creado_en?: string | null | null;
  impacto_real?: any | null | null;
  confianza_medicion?: string | null | null;
}

export type MemoriaSocioInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  clave?: string | null;
  valor?: any | null;
  nivel?: string | null;
  confianza?: string | null;
  origen?: string | null;
  creado_por?: string | null | null;
  evidencia?: string | null;
  activa?: boolean | null;
  expira_en?: string | null | null;
  creado_en?: string | null | null;
  actualizado_en?: string | null | null;
}

export type MemoriaSocioUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  clave?: string | null;
  valor?: any | null;
  nivel?: string | null;
  confianza?: string | null;
  origen?: string | null;
  creado_por?: string | null | null;
  evidencia?: string | null;
  activa?: boolean | null;
  expira_en?: string | null | null;
  creado_en?: string | null | null;
  actualizado_en?: string | null | null;
}

export type ResumenDiarioInsert = {
  id?: string | null;
  studio_id?: string | null;
  fecha?: string | null;
  estado_general?: string | null;
  saludo?: string | null;
  mientras_dormias?: any | null;
  n_decisiones?: number | null;
  tiempo_estimado_min?: number | null;
  impacto_total?: any | null | null;
  generado_en?: string | null | null;
}

export type ResumenDiarioUpdate = {
  id?: string | null;
  studio_id?: string | null;
  fecha?: string | null;
  estado_general?: string | null;
  saludo?: string | null;
  mientras_dormias?: any | null;
  n_decisiones?: number | null;
  tiempo_estimado_min?: number | null;
  impacto_total?: any | null | null;
  generado_en?: string | null | null;
}

export type DecisionFeatureFlagsInsert = {
  id?: string | null;
  studio_id?: string | null;
  flag?: string | null;
  activo?: boolean | null;
  activado_en?: string | null | null;
  activado_por?: string | null | null;
  creado_en?: string | null | null;
}

export type DecisionFeatureFlagsUpdate = {
  id?: string | null;
  studio_id?: string | null;
  flag?: string | null;
  activo?: boolean | null;
  activado_en?: string | null | null;
  activado_por?: string | null | null;
  creado_en?: string | null | null;
}

export type CondicionesSaludInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  categoria?: string | null;
  etiqueta?: string | null;
  zona?: string | null | null;
  restricciones?: string[] | null;
  severidad?: string | null;
  estado?: string | null;
  inicio?: string | null;
  fin?: string | null | null;
  revisar_en?: string | null | null;
  notas?: string | null | null;
  creado_por?: string | null | null;
  creado_en?: string | null | null;
  actualizado_en?: string | null | null;
}

export type CondicionesSaludUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  categoria?: string | null;
  etiqueta?: string | null;
  zona?: string | null | null;
  restricciones?: string[] | null;
  severidad?: string | null;
  estado?: string | null;
  inicio?: string | null;
  fin?: string | null | null;
  revisar_en?: string | null | null;
  notas?: string | null | null;
  creado_por?: string | null | null;
  creado_en?: string | null | null;
  actualizado_en?: string | null | null;
}

export type RespuestasSesionInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  sesion_id?: string | null | null;
  respuesta?: string | null;
  nota?: string | null | null;
  creado_por?: string | null | null;
  creado_en?: string | null | null;
}

export type RespuestasSesionUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  sesion_id?: string | null | null;
  respuesta?: string | null;
  nota?: string | null | null;
  creado_por?: string | null | null;
  creado_en?: string | null | null;
}

export type ReconciliacionesPosInsert = {
  payment_intent_id?: string | null;
  studio_id?: string | null;
  importe?: number | null;
  concepto?: string | null | null;
  estado?: string | null;
  venta_id?: string | null | null;
  creado_en?: string | null;
  reconciliado_en?: string | null | null;
}

export type ReconciliacionesPosUpdate = {
  payment_intent_id?: string | null;
  studio_id?: string | null;
  importe?: number | null;
  concepto?: string | null | null;
  estado?: string | null;
  venta_id?: string | null | null;
  creado_en?: string | null;
  reconciliado_en?: string | null | null;
}

export type ComentariosComunidadInsert = {
  id?: string | null;
  studio_id?: string | null;
  post_id?: string | null;
  autor_id?: string | null | null;
  autor_nombre?: string | null;
  autor_inicial?: string | null | null;
  texto?: string | null;
  creado_en?: string | null | null;
}

export type ComentariosComunidadUpdate = {
  id?: string | null;
  studio_id?: string | null;
  post_id?: string | null;
  autor_id?: string | null | null;
  autor_nombre?: string | null;
  autor_inicial?: string | null | null;
  texto?: string | null;
  creado_en?: string | null | null;
}

export type CamposPersonalizadosInsert = {
  id?: string | null;
  studio_id?: string | null;
  etiqueta?: string | null;
  tipo?: string | null;
  opciones?: string[] | null | null;
  requerido?: boolean | null;
  orden?: number | null;
  activo?: boolean | null;
  creado_en?: string | null | null;
}

export type CamposPersonalizadosUpdate = {
  id?: string | null;
  studio_id?: string | null;
  etiqueta?: string | null;
  tipo?: string | null;
  opciones?: string[] | null | null;
  requerido?: boolean | null;
  orden?: number | null;
  activo?: boolean | null;
  creado_en?: string | null | null;
}

export type PlantillasEmailInsert = {
  id?: string | null;
  studio_id?: string | null;
  tipo?: string | null;
  asunto?: string | null | null;
  intro?: string | null | null;
  activa?: boolean | null;
  actualizado_en?: string | null | null;
  cuerpo?: string | null | null;
  boton_texto?: string | null | null;
  color_cabecera?: string | null | null;
  color_boton?: string | null | null;
  logo_url?: string | null | null;
  pie?: string | null | null;
  fuente?: string | null | null;
  enviar?: boolean | null | null;
  portada_url?: string | null | null;
  mostrar_portada?: boolean | null | null;
  boton_url?: string | null | null;
}

export type PlantillasEmailUpdate = {
  id?: string | null;
  studio_id?: string | null;
  tipo?: string | null;
  asunto?: string | null | null;
  intro?: string | null | null;
  activa?: boolean | null;
  actualizado_en?: string | null | null;
  cuerpo?: string | null | null;
  boton_texto?: string | null | null;
  color_cabecera?: string | null | null;
  color_boton?: string | null | null;
  logo_url?: string | null | null;
  pie?: string | null | null;
  fuente?: string | null | null;
  enviar?: boolean | null | null;
  portada_url?: string | null | null;
  mostrar_portada?: boolean | null | null;
  boton_url?: string | null | null;
}

export type InstructorDependencySnapshotsInsert = {
  id?: string | null;
  studio_id?: string | null;
  instructor_id?: string | null;
  periodo_inicio?: string | null;
  periodo_fin?: string | null;
  ventana_dias?: number | null;
  alumnas_total?: number | null;
  alumnas_cautivas_count?: number | null;
  ingresos_cautivos?: number | null;
  ingresos_total_estudio?: number | null;
  porcentaje_facturacion?: number | null;
  nivel_riesgo?: string | null;
  detalle?: Array<{ socioId: string; nombre: string; gasto: number; pctConInstructor: number }> | null | null;
  calculado_en?: string | null | null;
}

export type InstructorDependencySnapshotsUpdate = {
  id?: string | null;
  studio_id?: string | null;
  instructor_id?: string | null;
  periodo_inicio?: string | null;
  periodo_fin?: string | null;
  ventana_dias?: number | null;
  alumnas_total?: number | null;
  alumnas_cautivas_count?: number | null;
  ingresos_cautivos?: number | null;
  ingresos_total_estudio?: number | null;
  porcentaje_facturacion?: number | null;
  nivel_riesgo?: string | null;
  detalle?: Array<{ socioId: string; nombre: string; gasto: number; pctConInstructor: number }> | null | null;
  calculado_en?: string | null | null;
}

export type StudioThemeInsert = {
  studio_id?: string | null;
  config_draft?: any | null | null;
  config_published?: any | null | null;
  actualizado_en?: string | null | null;
  publicado_en?: string | null | null;
}

export type StudioThemeUpdate = {
  studio_id?: string | null;
  config_draft?: any | null | null;
  config_published?: any | null | null;
  actualizado_en?: string | null | null;
  publicado_en?: string | null | null;
}

export type StudioLayoutInsert = {
  studio_id?: string | null;
  config?: any | null | null;
  actualizado_en?: string | null | null;
}

export type StudioLayoutUpdate = {
  studio_id?: string | null;
  config?: any | null | null;
  actualizado_en?: string | null | null;
}

export type PostLikesInsert = {
  post_id?: string | null;
  user_id?: string | null;
  studio_id?: string | null;
  creado_en?: string | null;
}

export type PostLikesUpdate = {
  post_id?: string | null;
  user_id?: string | null;
  studio_id?: string | null;
  creado_en?: string | null;
}

export type CanalesEquipoInsert = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  creado_en?: string | null;
}

export type CanalesEquipoUpdate = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  creado_en?: string | null;
}

export type RateLimitsInsert = {
  bucket_key?: string | null;
  count?: number | null;
  reset_at?: string | null;
}

export type RateLimitsUpdate = {
  bucket_key?: string | null;
  count?: number | null;
  reset_at?: string | null;
}

export type WebhookEventsInsert = {
  id?: string | null;
  tipo?: string | null | null;
  recibido_en?: string | null;
  estado?: string | null | null;
  reclamado_en?: string | null | null;
}

export type WebhookEventsUpdate = {
  id?: string | null;
  tipo?: string | null | null;
  recibido_en?: string | null;
  estado?: string | null | null;
  reclamado_en?: string | null | null;
}

export type InstructoraDisponibilidadInsert = {
  id?: string | null;
  studio_id?: string | null;
  instructor_id?: string | null;
  dia_semana?: number | null;
  hora_inicio?: string | null;
  hora_fin?: string | null;
  creado_en?: string | null | null;
}

export type InstructoraDisponibilidadUpdate = {
  id?: string | null;
  studio_id?: string | null;
  instructor_id?: string | null;
  dia_semana?: number | null;
  hora_inicio?: string | null;
  hora_fin?: string | null;
  creado_en?: string | null | null;
}

export type InstructoraDisponibilidadExcepcionesInsert = {
  id?: string | null;
  studio_id?: string | null;
  instructor_id?: string | null;
  fecha?: string | null;
  hora_inicio?: string | null | null;
  hora_fin?: string | null | null;
  tipo?: string | null;
  creado_en?: string | null | null;
  ausencia_id?: string | null | null;
}

export type InstructoraDisponibilidadExcepcionesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  instructor_id?: string | null;
  fecha?: string | null;
  hora_inicio?: string | null | null;
  hora_fin?: string | null | null;
  tipo?: string | null;
  creado_en?: string | null | null;
  ausencia_id?: string | null | null;
}

export type SustitucionesInsert = {
  id?: string | null;
  studio_id?: string | null;
  sesion_id?: string | null;
  instructor_original_id?: string | null | null;
  motivo?: string | null | null;
  estado?: string | null;
  ranking?: any | null;
  candidata_actual?: number | null;
  sustituta_final_id?: string | null | null;
  aprobada_por?: string | null | null;
  aprobada_at?: string | null | null;
  creado_en?: string | null | null;
  resuelto_en?: string | null | null;
  origen?: string | null | null;
  candidatos_network?: any | null;
}

export type SustitucionesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  sesion_id?: string | null;
  instructor_original_id?: string | null | null;
  motivo?: string | null | null;
  estado?: string | null;
  ranking?: any | null;
  candidata_actual?: number | null;
  sustituta_final_id?: string | null | null;
  aprobada_por?: string | null | null;
  aprobada_at?: string | null | null;
  creado_en?: string | null | null;
  resuelto_en?: string | null | null;
  origen?: string | null | null;
  candidatos_network?: any | null;
}

export type SustitucionContactosInsert = {
  id?: string | null;
  studio_id?: string | null;
  sustitucion_id?: string | null;
  instructor_id?: string | null;
  canal?: string | null;
  estado?: string | null;
  token?: string | null | null;
  enviado_en?: string | null | null;
  respondido_en?: string | null | null;
  token_hash?: string | null | null;
}

export type SustitucionContactosUpdate = {
  id?: string | null;
  studio_id?: string | null;
  sustitucion_id?: string | null;
  instructor_id?: string | null;
  canal?: string | null;
  estado?: string | null;
  token?: string | null | null;
  enviado_en?: string | null | null;
  respondido_en?: string | null | null;
  token_hash?: string | null | null;
}

export type ValoracionesInsert = {
  id?: string | null;
  studio_id?: string | null;
  instructor_id?: string | null;
  sesion_id?: string | null;
  socio_id?: string | null;
  puntuacion?: number | null;
  comentario?: string | null | null;
  creado_en?: string | null | null;
}

export type ValoracionesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  instructor_id?: string | null;
  sesion_id?: string | null;
  socio_id?: string | null;
  puntuacion?: number | null;
  comentario?: string | null | null;
  creado_en?: string | null | null;
}

export type CitasServiciosInsert = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  tipo?: string | null;
  duracion_min?: number | null;
  precio?: number | null | null;
  auto_reservable?: boolean | null;
  color?: string | null | null;
  descripcion?: string | null | null;
  activo?: boolean | null;
  orden?: number | null;
  creado_en?: string | null | null;
}

export type CitasServiciosUpdate = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  tipo?: string | null;
  duracion_min?: number | null;
  precio?: number | null | null;
  auto_reservable?: boolean | null;
  color?: string | null | null;
  descripcion?: string | null | null;
  activo?: boolean | null;
  orden?: number | null;
  creado_en?: string | null | null;
}

export type CitasDisponibilidadInsert = {
  id?: string | null;
  studio_id?: string | null;
  instructor_id?: string | null;
  dia_semana?: number | null;
  hora_inicio?: string | null;
  hora_fin?: string | null;
  creado_en?: string | null | null;
}

export type CitasDisponibilidadUpdate = {
  id?: string | null;
  studio_id?: string | null;
  instructor_id?: string | null;
  dia_semana?: number | null;
  hora_inicio?: string | null;
  hora_fin?: string | null;
  creado_en?: string | null | null;
}

export type DecisionAutonomiaConfigInsert = {
  studio_id?: string | null;
  activa?: boolean | null;
  tipos_permitidos?: string[] | null;
  max_diario?: number | null;
  actualizado_en?: string | null | null;
  actualizado_por?: string | null | null;
}

export type DecisionAutonomiaConfigUpdate = {
  studio_id?: string | null;
  activa?: boolean | null;
  tipos_permitidos?: string[] | null;
  max_diario?: number | null;
  actualizado_en?: string | null | null;
  actualizado_por?: string | null | null;
}

export type InstructorEnlacesVigentesInsert = {
  instructor_id?: string | null;
  studio_id?: string | null;
  scope?: string | null;
  token?: string | null;
  actualizado_en?: string | null;
  email_enviado_en?: string | null | null;
}

export type InstructorEnlacesVigentesUpdate = {
  instructor_id?: string | null;
  studio_id?: string | null;
  scope?: string | null;
  token?: string | null;
  actualizado_en?: string | null;
  email_enviado_en?: string | null | null;
}

export type IngresosManualesInsert = {
  id?: string | null;
  studio_id?: string | null;
  fecha?: string | null;
  concepto?: string | null;
  cliente?: string | null | null;
  nif?: string | null | null;
  base_imponible?: number | null;
  tipo_iva?: number | null;
  cuota_iva?: number | null;
  total?: number | null;
  nota?: string | null | null;
  creado_en?: string | null;
}

export type IngresosManualesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  fecha?: string | null;
  concepto?: string | null;
  cliente?: string | null | null;
  nif?: string | null | null;
  base_imponible?: number | null;
  tipo_iva?: number | null;
  cuota_iva?: number | null;
  total?: number | null;
  nota?: string | null | null;
  creado_en?: string | null;
}

export type CadenasInsert = {
  id?: string | null;
  nombre?: string | null;
  owner_auth_user_id?: string | null;
  plan?: string | null | null;
  stripe_customer_id?: string | null | null;
  subscription_id?: string | null | null;
  subscription_status?: string | null | null;
  current_period_end?: string | null | null;
  creado_en?: string | null;
  layout_config?: any | null | null;
}

export type CadenasUpdate = {
  id?: string | null;
  nombre?: string | null;
  owner_auth_user_id?: string | null;
  plan?: string | null | null;
  stripe_customer_id?: string | null | null;
  subscription_id?: string | null | null;
  subscription_status?: string | null | null;
  current_period_end?: string | null | null;
  creado_en?: string | null;
  layout_config?: any | null | null;
}

export type SesionActivaInsert = {
  auth_user_id?: string | null;
  studio_id?: string | null;
  actualizado_en?: string | null;
}

export type SesionActivaUpdate = {
  auth_user_id?: string | null;
  studio_id?: string | null;
  actualizado_en?: string | null;
}

export type AvisosHuecoInsert = {
  id?: string | null;
  studio_id?: string | null;
  sesion_id?: string | null;
  socio_id?: string | null;
  resultado?: string | null;
  detalle?: string | null | null;
  enviado_en?: string | null;
  canal?: string | null | null;
}

export type AvisosHuecoUpdate = {
  id?: string | null;
  studio_id?: string | null;
  sesion_id?: string | null;
  socio_id?: string | null;
  resultado?: string | null;
  detalle?: string | null | null;
  enviado_en?: string | null;
  canal?: string | null | null;
}

export type CongelacionesInsert = {
  id?: string | null;
  studio_id?: string | null;
  suscripcion_id?: string | null;
  desde?: string | null;
  hasta?: string | null | null;
  dias_aplicados?: number | null | null;
  motivo?: string | null | null;
  creada_en?: string | null;
}

export type CongelacionesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  suscripcion_id?: string | null;
  desde?: string | null;
  hasta?: string | null | null;
  dias_aplicados?: number | null | null;
  motivo?: string | null | null;
  creada_en?: string | null;
}

export type MigracionBatchesInsert = {
  id?: string | null;
  studio_id?: string | null;
  creado_en?: string | null;
  ids_creados?: any | null;
  deshecho_en?: string | null | null;
  resumen?: any | null | null;
}

export type MigracionBatchesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  creado_en?: string | null;
  ids_creados?: any | null;
  deshecho_en?: string | null | null;
  resumen?: any | null | null;
}

export type BloqueosMaquinaInsert = {
  id?: string | null;
  studio_id?: string | null;
  sala_id?: string | null;
  spot_id?: string | null | null;
  desde?: string | null;
  hasta?: string | null | null;
  motivo?: string | null | null;
  creado_en?: string | null;
}

export type BloqueosMaquinaUpdate = {
  id?: string | null;
  studio_id?: string | null;
  sala_id?: string | null;
  spot_id?: string | null | null;
  desde?: string | null;
  hasta?: string | null | null;
  motivo?: string | null | null;
  creado_en?: string | null;
}

export type PlazasFijasInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  dia_semana?: number | null;
  hora_inicio?: string | null;
  sala_id?: string | null;
  tipo_clase_id?: string | null | null;
  spot_id?: string | null | null;
  vigencia_desde?: string | null;
  vigencia_hasta?: string | null | null;
  estado?: string | null;
  creada_en?: string | null;
  pausa_desde?: string | null | null;
  pausa_hasta?: string | null | null;
  pausa_libera_sitio?: boolean | null | null;
}

export type PlazasFijasUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  dia_semana?: number | null;
  hora_inicio?: string | null;
  sala_id?: string | null;
  tipo_clase_id?: string | null | null;
  spot_id?: string | null | null;
  vigencia_desde?: string | null;
  vigencia_hasta?: string | null | null;
  estado?: string | null;
  creada_en?: string | null;
  pausa_desde?: string | null | null;
  pausa_hasta?: string | null | null;
  pausa_libera_sitio?: boolean | null | null;
}

export type RecuperacionesInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  origen_reserva_id?: string | null | null;
  motivo?: string | null | null;
  caduca_el?: string | null;
  estado?: string | null;
  usada_en_reserva_id?: string | null | null;
  creada_en?: string | null;
}

export type RecuperacionesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  origen_reserva_id?: string | null | null;
  motivo?: string | null | null;
  caduca_el?: string | null;
  estado?: string | null;
  usada_en_reserva_id?: string | null | null;
  creada_en?: string | null;
}

export type SocioExcepcionesInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  tipo?: string | null;
  motivo?: string | null | null;
  creada_en?: string | null;
}

export type SocioExcepcionesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  tipo?: string | null;
  motivo?: string | null | null;
  creada_en?: string | null;
}

export type MandatosSepaInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  iban?: string | null;
  ref_mandato?: string | null;
  fecha_firma?: string | null;
  estado?: string | null;
  creada_en?: string | null;
}

export type MandatosSepaUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  iban?: string | null;
  ref_mandato?: string | null;
  fecha_firma?: string | null;
  estado?: string | null;
  creada_en?: string | null;
}

export type NotificationInsert = {
  id?: string | null;
  studio_id?: string | null;
  recipient_role?: string | null;
  recipient_user_id?: string | null | null;
  recipient_socio_id?: string | null | null;
  recipient_instructor_id?: string | null | null;
  event_type?: string | null;
  category?: string | null;
  priority?: string | null;
  title?: string | null;
  body?: string | null;
  resource_type?: string | null | null;
  resource_id?: string | null | null;
  deep_link?: string | null | null;
  data?: any | null | null;
  dedup_key?: string | null | null;
  read_at?: string | null | null;
  archived_at?: string | null | null;
  created_at?: string | null;
}

export type NotificationUpdate = {
  id?: string | null;
  studio_id?: string | null;
  recipient_role?: string | null;
  recipient_user_id?: string | null | null;
  recipient_socio_id?: string | null | null;
  recipient_instructor_id?: string | null | null;
  event_type?: string | null;
  category?: string | null;
  priority?: string | null;
  title?: string | null;
  body?: string | null;
  resource_type?: string | null | null;
  resource_id?: string | null | null;
  deep_link?: string | null | null;
  data?: any | null | null;
  dedup_key?: string | null | null;
  read_at?: string | null | null;
  archived_at?: string | null | null;
  created_at?: string | null;
}

export type NotificationDeliveryInsert = {
  id?: string | null;
  notification_id?: string | null;
  studio_id?: string | null;
  channel?: string | null;
  status?: string | null;
  attempts?: number | null;
  error?: string | null | null;
  provider_id?: string | null | null;
  created_at?: string | null;
  sent_at?: string | null | null;
  delivered_at?: string | null | null;
}

export type NotificationDeliveryUpdate = {
  id?: string | null;
  notification_id?: string | null;
  studio_id?: string | null;
  channel?: string | null;
  status?: string | null;
  attempts?: number | null;
  error?: string | null | null;
  provider_id?: string | null | null;
  created_at?: string | null;
  sent_at?: string | null | null;
  delivered_at?: string | null | null;
}

export type NotificationPreferenceInsert = {
  id?: string | null;
  studio_id?: string | null;
  user_id?: string | null;
  category?: string | null;
  inapp?: boolean | null;
  push?: boolean | null;
  email?: boolean | null;
  whatsapp?: boolean | null;
  sms?: boolean | null;
  updated_at?: string | null;
  push_eventos?: any | null | null;
}

export type NotificationPreferenceUpdate = {
  id?: string | null;
  studio_id?: string | null;
  user_id?: string | null;
  category?: string | null;
  inapp?: boolean | null;
  push?: boolean | null;
  email?: boolean | null;
  whatsapp?: boolean | null;
  sms?: boolean | null;
  updated_at?: string | null;
  push_eventos?: any | null | null;
}

export type PushSubscriptionInsert = {
  id?: string | null;
  studio_id?: string | null;
  user_id?: string | null;
  endpoint?: string | null;
  p256dh?: string | null;
  auth?: string | null;
  user_agent?: string | null | null;
  failure_count?: number | null;
  created_at?: string | null;
  last_used_at?: string | null | null;
}

export type PushSubscriptionUpdate = {
  id?: string | null;
  studio_id?: string | null;
  user_id?: string | null;
  endpoint?: string | null;
  p256dh?: string | null;
  auth?: string | null;
  user_agent?: string | null | null;
  failure_count?: number | null;
  created_at?: string | null;
  last_used_at?: string | null | null;
}

export type NotificationTemplateInsert = {
  id?: string | null;
  studio_id?: string | null | null;
  event_type?: string | null;
  locale?: string | null;
  title_tpl?: string | null;
  body_tpl?: string | null;
  updated_at?: string | null;
}

export type NotificationTemplateUpdate = {
  id?: string | null;
  studio_id?: string | null | null;
  event_type?: string | null;
  locale?: string | null;
  title_tpl?: string | null;
  body_tpl?: string | null;
  updated_at?: string | null;
}

export type InstructoraAusenciasInsert = {
  id?: string | null;
  studio_id?: string | null;
  instructor_id?: string | null;
  tipo?: string | null;
  desde?: string | null;
  hasta?: string | null;
  motivo?: string | null | null;
  creado_en?: string | null;
}

export type InstructoraAusenciasUpdate = {
  id?: string | null;
  studio_id?: string | null;
  instructor_id?: string | null;
  tipo?: string | null;
  desde?: string | null;
  hasta?: string | null;
  motivo?: string | null | null;
  creado_en?: string | null;
}

export type PlanTiposClaseInsert = {
  plan_id?: string | null;
  tipo_clase_id?: string | null;
  studio_id?: string | null;
  limite_semanal?: number | null | null;
}

export type PlanTiposClaseUpdate = {
  plan_id?: string | null;
  tipo_clase_id?: string | null;
  studio_id?: string | null;
  limite_semanal?: number | null | null;
}

export type StudioSlugsAntiguosInsert = {
  slug?: string | null;
  studio_id?: string | null;
  creado_en?: string | null;
}

export type StudioSlugsAntiguosUpdate = {
  slug?: string | null;
  studio_id?: string | null;
  creado_en?: string | null;
}

export type PlataformaLeadInsert = {
  id?: string | null;
  email?: string | null;
  nombre?: string | null | null;
  estudio?: string | null | null;
  telefono?: string | null | null;
  ciudad?: string | null | null;
  software_actual?: string | null | null;
  mensaje?: string | null | null;
  origen?: string | null;
  estado?: string | null;
  motivo_perdida?: string | null | null;
  proximo_paso?: string | null | null;
  proxima_fecha?: string | null | null;
  studio_id?: string | null | null;
  notas?: string | null | null;
  responsable?: string | null | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
  web?: string | null | null;
  instagram?: string | null | null;
}

export type PlataformaLeadUpdate = {
  id?: string | null;
  email?: string | null;
  nombre?: string | null | null;
  estudio?: string | null | null;
  telefono?: string | null | null;
  ciudad?: string | null | null;
  software_actual?: string | null | null;
  mensaje?: string | null | null;
  origen?: string | null;
  estado?: string | null;
  motivo_perdida?: string | null | null;
  proximo_paso?: string | null | null;
  proxima_fecha?: string | null | null;
  studio_id?: string | null | null;
  notas?: string | null | null;
  responsable?: string | null | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
  web?: string | null | null;
  instagram?: string | null | null;
}

export type LecturasFichaSaludInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  leido_por_user_id?: string | null;
  leido_por_nombre?: string | null;
  leido_por_rol?: string | null;
  leido_en?: string | null;
}

export type LecturasFichaSaludUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  leido_por_user_id?: string | null;
  leido_por_nombre?: string | null;
  leido_por_rol?: string | null;
  leido_en?: string | null;
}

export type PlataformaAdminInsert = {
  auth_user_id?: string | null;
  nombre?: string | null;
  cargo?: string | null | null;
  activo?: boolean | null;
  creado_en?: string | null;
}

export type PlataformaAdminUpdate = {
  auth_user_id?: string | null;
  nombre?: string | null;
  cargo?: string | null | null;
  activo?: boolean | null;
  creado_en?: string | null;
}

export type PlataformaPermisoInsert = {
  auth_user_id?: string | null;
  permiso?: string | null;
  concedido_en?: string | null;
  concedido_por?: string | null | null;
}

export type PlataformaPermisoUpdate = {
  auth_user_id?: string | null;
  permiso?: string | null;
  concedido_en?: string | null;
  concedido_por?: string | null | null;
}

export type PlataformaAuditoriaInsert = {
  id?: number | null;
  ocurrido_en?: string | null;
  actor_auth_user_id?: string | null | null;
  actor_nombre?: string | null;
  accion?: string | null;
  objetivo_tipo?: string | null | null;
  objetivo_id?: string | null | null;
  resumen?: string | null;
  antes?: any | null | null;
  despues?: any | null | null;
  ip?: string | null | null;
  user_agent?: string | null | null;
}

export type PlataformaAuditoriaUpdate = {
  id?: number | null;
  ocurrido_en?: string | null;
  actor_auth_user_id?: string | null | null;
  actor_nombre?: string | null;
  accion?: string | null;
  objetivo_tipo?: string | null | null;
  objetivo_id?: string | null | null;
  resumen?: string | null;
  antes?: any | null | null;
  despues?: any | null | null;
  ip?: string | null | null;
  user_agent?: string | null | null;
}

export type PenalizacionesInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  reserva_id?: string | null;
  tipo?: string | null;
  importe?: number | null;
  estado?: string | null;
  recibo_id?: string | null | null;
  detectada_en?: string | null;
  procesada_en?: string | null | null;
}

export type PenalizacionesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  reserva_id?: string | null;
  tipo?: string | null;
  importe?: number | null;
  estado?: string | null;
  recibo_id?: string | null | null;
  detectada_en?: string | null;
  procesada_en?: string | null | null;
}

export type InstructorTarifasInsert = {
  instructor_id?: string | null;
  studio_id?: string | null;
  tarifa_hora?: number | null | null;
  moneda?: string | null;
  actualizado_en?: string | null;
  actualizado_por?: string | null | null;
  base_mensual_eur?: number | null | null;
  recargo_sustitucion_pct?: number | null | null;
  horas_semanales_contrato?: number | null | null;
  relacion_laboral?: string | null | null;
}

export type InstructorTarifasUpdate = {
  instructor_id?: string | null;
  studio_id?: string | null;
  tarifa_hora?: number | null | null;
  moneda?: string | null;
  actualizado_en?: string | null;
  actualizado_por?: string | null | null;
  base_mensual_eur?: number | null | null;
  recargo_sustitucion_pct?: number | null | null;
  horas_semanales_contrato?: number | null | null;
  relacion_laboral?: string | null | null;
}

export type FavoritosClaseInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  tipo_clase_id?: string | null;
  created_at?: string | null;
}

export type FavoritosClaseUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  tipo_clase_id?: string | null;
  created_at?: string | null;
}

export type ContenidoPortalInsert = {
  studio_id?: string | null;
  mensaje_destacado?: string | null | null;
  updated_at?: string | null;
}

export type ContenidoPortalUpdate = {
  studio_id?: string | null;
  mensaje_destacado?: string | null | null;
  updated_at?: string | null;
}

export type ContenidoPortalBannersInsert = {
  id?: string | null;
  studio_id?: string | null;
  imagen_url?: string | null;
  titulo?: string | null | null;
  texto?: string | null | null;
  link_tipo?: string | null;
  link_valor?: string | null;
  ubicacion?: string[] | null;
  activo?: boolean | null;
  orden?: number | null;
  fecha_inicio?: string | null | null;
  fecha_fin?: string | null | null;
  created_by?: string | null | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type ContenidoPortalBannersUpdate = {
  id?: string | null;
  studio_id?: string | null;
  imagen_url?: string | null;
  titulo?: string | null | null;
  texto?: string | null | null;
  link_tipo?: string | null;
  link_valor?: string | null;
  ubicacion?: string[] | null;
  activo?: boolean | null;
  orden?: number | null;
  fecha_inicio?: string | null | null;
  fecha_fin?: string | null | null;
  created_by?: string | null | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type DecisionMensajesDiaInsert = {
  id?: string | null;
  studio_id?: string | null;
  fecha?: string | null;
  tipo?: string | null;
  recomendacion_id?: string | null | null;
  dedupe_key?: string | null | null;
  motivo_motor?: string | null | null;
  motivo_silencio?: string | null | null;
  enviado_en?: string | null | null;
  creado_en?: string | null | null;
}

export type DecisionMensajesDiaUpdate = {
  id?: string | null;
  studio_id?: string | null;
  fecha?: string | null;
  tipo?: string | null;
  recomendacion_id?: string | null | null;
  dedupe_key?: string | null | null;
  motivo_motor?: string | null | null;
  motivo_silencio?: string | null | null;
  enviado_en?: string | null | null;
  creado_en?: string | null | null;
}

export type ComunicacionesSocioInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  tipo?: string | null;
  asunto?: string | null;
  estado?: string | null;
  error?: string | null | null;
  resend_id?: string | null | null;
  creado_por?: string | null | null;
  creado_por_nombre?: string | null | null;
  creado_en?: string | null;
}

export type ComunicacionesSocioUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  tipo?: string | null;
  asunto?: string | null;
  estado?: string | null;
  error?: string | null | null;
  resend_id?: string | null | null;
  creado_por?: string | null | null;
  creado_por_nombre?: string | null | null;
  creado_en?: string | null;
}

export type ChangelogVersionesInsert = {
  id?: string | null;
  version?: string | null;
  titulo?: string | null;
  fecha_publicacion?: string | null;
  estado?: string | null;
  publicado_en?: string | null | null;
  creado_en?: string | null;
  creado_por?: string | null | null;
}

export type ChangelogVersionesUpdate = {
  id?: string | null;
  version?: string | null;
  titulo?: string | null;
  fecha_publicacion?: string | null;
  estado?: string | null;
  publicado_en?: string | null | null;
  creado_en?: string | null;
  creado_por?: string | null | null;
}

export type ChangelogCambiosInsert = {
  id?: string | null;
  version_id?: string | null;
  etiqueta?: string | null;
  texto?: string | null;
  orden?: number | null;
  imagen_url?: string | null | null;
}

export type ChangelogCambiosUpdate = {
  id?: string | null;
  version_id?: string | null;
  etiqueta?: string | null;
  texto?: string | null;
  orden?: number | null;
  imagen_url?: string | null | null;
}

export type IntentosReservaFallidosInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  sesion_id?: string | null | null;
  tipo_clase_id?: string | null | null;
  motivo?: string | null;
  creado_en?: string | null;
}

export type IntentosReservaFallidosUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  sesion_id?: string | null | null;
  tipo_clase_id?: string | null | null;
  motivo?: string | null;
  creado_en?: string | null;
}

export type LiquidacionesInstructorasInsert = {
  id?: string | null;
  studio_id?: string | null;
  instructor_id?: string | null;
  periodo_anio?: number | null;
  periodo_mes?: number | null;
  base_eur?: string | null | null;
  n_clases_propias?: number | null;
  variable_propias_eur?: number | null;
  n_clases_sustitucion?: number | null;
  variable_sustitucion_eur?: number | null;
  n_penalizaciones?: number | null;
  reparto_penalizaciones_eur?: number | null;
  n_clases_sin_tarifa?: number | null;
  total_eur?: number | null | null;
  detalle?: any | null;
  estado?: string | null;
  confirmada_en?: string | null | null;
  confirmada_por?: string | null | null;
  pagada_en?: string | null | null;
  pagada_por?: string | null | null;
  referencia_pago?: string | null | null;
  generada_en?: string | null;
  requiere_revision?: boolean | null | null;
  revision_motivo?: string | null | null;
  modo?: string | null | null;
  minutos_fichados?: number | null | null;
  jornadas_sin_cerrar?: number | null | null;
  relacion_laboral?: string | null | null;
  clases_sin_confirmar?: number | null | null;
  clases_no_dadas?: number | null | null;
  minutos_retraso?: number | null | null;
  minutos_contrato?: number | null | null;
  minutos_extra?: number | null | null;
}

export type LiquidacionesInstructorasUpdate = {
  id?: string | null;
  studio_id?: string | null;
  instructor_id?: string | null;
  periodo_anio?: number | null;
  periodo_mes?: number | null;
  base_eur?: string | null | null;
  n_clases_propias?: number | null;
  variable_propias_eur?: number | null;
  n_clases_sustitucion?: number | null;
  variable_sustitucion_eur?: number | null;
  n_penalizaciones?: number | null;
  reparto_penalizaciones_eur?: number | null;
  n_clases_sin_tarifa?: number | null;
  total_eur?: number | null | null;
  detalle?: any | null;
  estado?: string | null;
  confirmada_en?: string | null | null;
  confirmada_por?: string | null | null;
  pagada_en?: string | null | null;
  pagada_por?: string | null | null;
  referencia_pago?: string | null | null;
  generada_en?: string | null;
  requiere_revision?: boolean | null | null;
  revision_motivo?: string | null | null;
  modo?: string | null | null;
  minutos_fichados?: number | null | null;
  jornadas_sin_cerrar?: number | null | null;
  relacion_laboral?: string | null | null;
  clases_sin_confirmar?: number | null | null;
  clases_no_dadas?: number | null | null;
  minutos_retraso?: number | null | null;
  minutos_contrato?: number | null | null;
  minutos_extra?: number | null | null;
}

export type RetoParticipacionesInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  reto_key?: string | null;
  created_at?: string | null;
}

export type RetoParticipacionesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  reto_key?: string | null;
  created_at?: string | null;
}

export type StudioHorarioInsert = {
  studio_id?: string | null;
  dia_semana?: number | null;
  abierto?: boolean | null;
  hora_apertura?: string | null | null;
  hora_cierre?: string | null | null;
  actualizado_en?: string | null;
}

export type StudioHorarioUpdate = {
  studio_id?: string | null;
  dia_semana?: number | null;
  abierto?: boolean | null;
  hora_apertura?: string | null | null;
  hora_cierre?: string | null | null;
  actualizado_en?: string | null;
}

export type InstructorBajasSeguimientoInsert = {
  id?: string | null;
  studio_id?: string | null;
  instructor_id?: string | null;
  instructor_nombre?: string | null;
  fecha_baja?: string | null;
  nivel_riesgo_al_salir?: string | null;
  porcentaje_facturacion_al_salir?: number | null;
  alumnas_cautivas_count?: number | null;
  alumnas_cautivas?: any | null;
  evaluado_en?: string | null | null;
  alumnas_retenidas_count?: number | null | null;
}

export type InstructorBajasSeguimientoUpdate = {
  id?: string | null;
  studio_id?: string | null;
  instructor_id?: string | null;
  instructor_nombre?: string | null;
  fecha_baja?: string | null;
  nivel_riesgo_al_salir?: string | null;
  porcentaje_facturacion_al_salir?: number | null;
  alumnas_cautivas_count?: number | null;
  alumnas_cautivas?: any | null;
  evaluado_en?: string | null | null;
  alumnas_retenidas_count?: number | null | null;
}

export type DevolucionesInsert = {
  id?: string | null;
  studio_id?: string | null;
  recibo_id?: string | null;
  socio_id?: string | null | null;
  suscripcion_id?: string | null | null;
  origen?: string | null;
  importe_cobrado?: number | null;
  importe_devuelto?: number | null;
  stripe_charge_id?: string | null | null;
  referencia?: string | null;
  estado?: string | null;
  propuesta?: any | null | null;
  aplicado?: any | null | null;
  detectada_en?: string | null;
  resuelta_en?: string | null | null;
  resuelta_por?: string | null | null;
  fallo_en?: string | null | null;
  fallo_motivo?: string | null | null;
  venta_pos_id?: string | null | null;
}

export type DevolucionesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  recibo_id?: string | null;
  socio_id?: string | null | null;
  suscripcion_id?: string | null | null;
  origen?: string | null;
  importe_cobrado?: number | null;
  importe_devuelto?: number | null;
  stripe_charge_id?: string | null | null;
  referencia?: string | null;
  estado?: string | null;
  propuesta?: any | null | null;
  aplicado?: any | null | null;
  detectada_en?: string | null;
  resuelta_en?: string | null | null;
  resuelta_por?: string | null | null;
  fallo_en?: string | null | null;
  fallo_motivo?: string | null | null;
  venta_pos_id?: string | null | null;
}

export type CadenaTiposClaseInsert = {
  id?: string | null;
  cadena_id?: string | null;
  nombre?: string | null;
  color?: string | null | null;
  duracion_minutos?: number | null | null;
  descripcion?: string | null | null;
  nivel?: string | null | null;
  foto_url?: string | null | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
}

export type CadenaTiposClaseUpdate = {
  id?: string | null;
  cadena_id?: string | null;
  nombre?: string | null;
  color?: string | null | null;
  duracion_minutos?: number | null | null;
  descripcion?: string | null | null;
  nivel?: string | null | null;
  foto_url?: string | null | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
}

export type PagosHistoricosInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  fecha?: string | null;
  concepto?: string | null | null;
  importe?: number | null;
  medio_pago?: string | null | null;
  creado_en?: string | null;
}

export type PagosHistoricosUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  fecha?: string | null;
  concepto?: string | null | null;
  importe?: number | null;
  medio_pago?: string | null | null;
  creado_en?: string | null;
}

export type ResumenSemanalEnviosInsert = {
  studio_id?: string | null;
  semana_lunes?: string | null;
  enviado_en?: string | null;
}

export type ResumenSemanalEnviosUpdate = {
  studio_id?: string | null;
  semana_lunes?: string | null;
  enviado_en?: string | null;
}

export type PlantillasCuestionarioSaludInsert = {
  id?: string | null;
  studio_id?: string | null;
  pregunta?: string | null;
  tipo_respuesta?: string | null;
  opciones?: string[] | null;
  orden?: number | null;
  activo?: boolean | null;
  creado_en?: string | null;
}

export type PlantillasCuestionarioSaludUpdate = {
  id?: string | null;
  studio_id?: string | null;
  pregunta?: string | null;
  tipo_respuesta?: string | null;
  opciones?: string[] | null;
  orden?: number | null;
  activo?: boolean | null;
  creado_en?: string | null;
}

export type RespuestasCuestionarioSaludInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  pregunta_id?: string | null;
  respuesta?: string | null | null;
  creado_por?: string | null | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
}

export type RespuestasCuestionarioSaludUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  pregunta_id?: string | null;
  respuesta?: string | null | null;
  creado_por?: string | null | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
}

export type RedPerfilesInsert = {
  id?: string | null;
  auth_user_id?: string | null;
  nombre?: string | null;
  foto_url?: string | null | null;
  ciudad?: string | null | null;
  zona?: string | null | null;
  radio_km?: number | null | null;
  descripcion?: string | null | null;
  especialidades?: string[] | null;
  anios_experiencia?: number | null | null;
  tarifa_rango?: string | null | null;
  disponibilidad_estado?: string | null;
  disponibilidad_horarios?: string[] | null;
  tipo_trabajo?: string[] | null;
  email_contacto?: string | null | null;
  telefono_contacto?: string | null | null;
  estado?: string | null;
  identidad_verificada_en?: string | null | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
  ultimo_acceso_en?: string | null | null;
  slug?: string | null | null;
  destacado?: boolean | null | null;
  idiomas?: string[] | null | null;
  instagram?: string | null | null;
  linkedin?: string | null | null;
  web?: string | null | null;
  lat?: number | null | null;
  lng?: number | null | null;
  mostrar_estudios_actuales?: boolean | null | null;
}

export type RedPerfilesUpdate = {
  id?: string | null;
  auth_user_id?: string | null;
  nombre?: string | null;
  foto_url?: string | null | null;
  ciudad?: string | null | null;
  zona?: string | null | null;
  radio_km?: number | null | null;
  descripcion?: string | null | null;
  especialidades?: string[] | null;
  anios_experiencia?: number | null | null;
  tarifa_rango?: string | null | null;
  disponibilidad_estado?: string | null;
  disponibilidad_horarios?: string[] | null;
  tipo_trabajo?: string[] | null;
  email_contacto?: string | null | null;
  telefono_contacto?: string | null | null;
  estado?: string | null;
  identidad_verificada_en?: string | null | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
  ultimo_acceso_en?: string | null | null;
  slug?: string | null | null;
  destacado?: boolean | null | null;
  idiomas?: string[] | null | null;
  instagram?: string | null | null;
  linkedin?: string | null | null;
  web?: string | null | null;
  lat?: number | null | null;
  lng?: number | null | null;
  mostrar_estudios_actuales?: boolean | null | null;
}

export type RedExperienciasInsert = {
  id?: string | null;
  perfil_id?: string | null;
  studio_id?: string | null | null;
  nombre_estudio?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null | null;
  especialidades?: string[] | null;
  descripcion?: string | null | null;
  estado_verificacion?: string | null;
  creado_en?: string | null;
}

export type RedExperienciasUpdate = {
  id?: string | null;
  perfil_id?: string | null;
  studio_id?: string | null | null;
  nombre_estudio?: string | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null | null;
  especialidades?: string[] | null;
  descripcion?: string | null | null;
  estado_verificacion?: string | null;
  creado_en?: string | null;
}

export type RedVerificacionesExperienciaInsert = {
  id?: string | null;
  experiencia_id?: string | null;
  studio_id?: string | null;
  solicitado_por?: string | null;
  solicitado_en?: string | null;
  resuelto_en?: string | null | null;
  resuelto_por?: string | null | null;
  estado?: string | null;
}

export type RedVerificacionesExperienciaUpdate = {
  id?: string | null;
  experiencia_id?: string | null;
  studio_id?: string | null;
  solicitado_por?: string | null;
  solicitado_en?: string | null;
  resuelto_en?: string | null | null;
  resuelto_por?: string | null | null;
  estado?: string | null;
}

export type RedReferenciasInsert = {
  id?: string | null;
  perfil_id?: string | null;
  nombre_referente?: string | null;
  email_referente?: string | null;
  relacion?: string | null | null;
  token?: string | null;
  token_expira_en?: string | null;
  solicitado_en?: string | null;
  resuelto_en?: string | null | null;
  estado?: string | null;
}

export type RedReferenciasUpdate = {
  id?: string | null;
  perfil_id?: string | null;
  nombre_referente?: string | null;
  email_referente?: string | null;
  relacion?: string | null | null;
  token?: string | null;
  token_expira_en?: string | null;
  solicitado_en?: string | null;
  resuelto_en?: string | null | null;
  estado?: string | null;
}

export type RedSolicitudesContactoInsert = {
  id?: string | null;
  perfil_id?: string | null;
  studio_id?: string | null;
  solicitado_por?: string | null;
  mensaje?: string | null | null;
  estado?: string | null;
  creado_en?: string | null;
  resuelto_en?: string | null | null;
  sustitucion_id?: string | null | null;
}

export type RedSolicitudesContactoUpdate = {
  id?: string | null;
  perfil_id?: string | null;
  studio_id?: string | null;
  solicitado_por?: string | null;
  mensaje?: string | null | null;
  estado?: string | null;
  creado_en?: string | null;
  resuelto_en?: string | null | null;
  sustitucion_id?: string | null | null;
}

export type RedReportesInsert = {
  id?: string | null;
  perfil_id?: string | null;
  reportado_por?: string | null | null;
  motivo?: string | null;
  detalle?: string | null | null;
  estado?: string | null;
  creado_en?: string | null;
  revisado_en?: string | null | null;
  revisado_por?: string | null | null;
}

export type RedReportesUpdate = {
  id?: string | null;
  perfil_id?: string | null;
  reportado_por?: string | null | null;
  motivo?: string | null;
  detalle?: string | null | null;
  estado?: string | null;
  creado_en?: string | null;
  revisado_en?: string | null | null;
  revisado_por?: string | null | null;
}

export type RedFavoritosInsert = {
  id?: string | null;
  studio_id?: string | null;
  perfil_id?: string | null;
  creado_por?: string | null;
  creado_en?: string | null;
}

export type RedFavoritosUpdate = {
  id?: string | null;
  studio_id?: string | null;
  perfil_id?: string | null;
  creado_por?: string | null;
  creado_en?: string | null;
}

export type RedResenasInsert = {
  id?: string | null;
  perfil_id?: string | null | null;
  studio_id?: string | null;
  solicitud_id?: string | null | null;
  autor?: string | null;
  puntuacion?: number | null;
  comentario?: string | null | null;
  estado?: string | null;
  creado_en?: string | null;
  moderado_en?: string | null | null;
  moderado_por?: string | null | null;
  reserva_id?: string | null | null;
}

export type RedResenasUpdate = {
  id?: string | null;
  perfil_id?: string | null | null;
  studio_id?: string | null;
  solicitud_id?: string | null | null;
  autor?: string | null;
  puntuacion?: number | null;
  comentario?: string | null | null;
  estado?: string | null;
  creado_en?: string | null;
  moderado_en?: string | null | null;
  moderado_por?: string | null | null;
  reserva_id?: string | null | null;
}

export type RedMensajesInsert = {
  id?: string | null;
  solicitud_id?: string | null;
  remitente?: string | null;
  cuerpo?: string | null;
  creado_en?: string | null;
  leido_en?: string | null | null;
}

export type RedMensajesUpdate = {
  id?: string | null;
  solicitud_id?: string | null;
  remitente?: string | null;
  cuerpo?: string | null;
  creado_en?: string | null;
  leido_en?: string | null | null;
}

export type RedPerfilesIdentidadInsert = {
  perfil_id?: string | null;
  apellido1?: string | null | null;
  apellido2?: string | null | null;
  fecha_nacimiento?: string | null | null;
  pais_residencia?: string | null | null;
  tipo_documento?: string | null | null;
  numero_documento?: string | null | null;
  direccion_cp?: string | null | null;
  direccion_ciudad?: string | null | null;
  direccion_provincia?: string | null | null;
  direccion_pais?: string | null | null;
  telefono_verificado_en?: string | null | null;
  email_verificado_en?: string | null | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
}

export type RedPerfilesIdentidadUpdate = {
  perfil_id?: string | null;
  apellido1?: string | null | null;
  apellido2?: string | null | null;
  fecha_nacimiento?: string | null | null;
  pais_residencia?: string | null | null;
  tipo_documento?: string | null | null;
  numero_documento?: string | null | null;
  direccion_cp?: string | null | null;
  direccion_ciudad?: string | null | null;
  direccion_provincia?: string | null | null;
  direccion_pais?: string | null | null;
  telefono_verificado_en?: string | null | null;
  email_verificado_en?: string | null | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
}

export type RedVerificacionesIdentidadInsert = {
  id?: string | null;
  perfil_id?: string | null;
  estado?: string | null;
  motivo_rechazo?: string | null | null;
  documento_path?: string | null;
  creado_en?: string | null;
  resuelto_en?: string | null | null;
  resuelto_por?: string | null | null;
  documento_path_reverso?: string | null | null;
  documento_borrado_en?: string | null | null;
}

export type RedVerificacionesIdentidadUpdate = {
  id?: string | null;
  perfil_id?: string | null;
  estado?: string | null;
  motivo_rechazo?: string | null | null;
  documento_path?: string | null;
  creado_en?: string | null;
  resuelto_en?: string | null | null;
  resuelto_por?: string | null | null;
  documento_path_reverso?: string | null | null;
  documento_borrado_en?: string | null | null;
}

export type RedCertificacionesInsert = {
  id?: string | null;
  perfil_id?: string | null;
  nombre?: string | null;
  institucion?: string | null;
  anio?: number | null | null;
  duracion?: string | null | null;
  documento_path?: string | null;
  estado?: string | null;
  motivo_rechazo?: string | null | null;
  creado_en?: string | null;
  resuelto_en?: string | null | null;
  resuelto_por?: string | null | null;
  documento_borrado_en?: string | null | null;
}

export type RedCertificacionesUpdate = {
  id?: string | null;
  perfil_id?: string | null;
  nombre?: string | null;
  institucion?: string | null;
  anio?: number | null | null;
  duracion?: string | null | null;
  documento_path?: string | null;
  estado?: string | null;
  motivo_rechazo?: string | null | null;
  creado_en?: string | null;
  resuelto_en?: string | null | null;
  resuelto_por?: string | null | null;
  documento_borrado_en?: string | null | null;
}

export type ThemeImportsInsert = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  manifest?: any | null;
  storage_prefix?: string | null;
  entry_html?: string | null | null;
  estado?: string | null;
  detalle?: string | null | null;
  creado_en?: string | null;
  creado_por?: string | null | null;
  publicado?: boolean | null | null;
  publicado_en?: string | null | null;
  rutas_editadas?: string[] | null | null;
}

export type ThemeImportsUpdate = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  manifest?: any | null;
  storage_prefix?: string | null;
  entry_html?: string | null | null;
  estado?: string | null;
  detalle?: string | null | null;
  creado_en?: string | null;
  creado_por?: string | null | null;
  publicado?: boolean | null | null;
  publicado_en?: string | null | null;
  rutas_editadas?: string[] | null | null;
}

export type OauthClientesInsert = {
  id?: string | null;
  nombre?: string | null;
  descripcion?: string | null | null;
  client_secret_hash?: string | null;
  redirect_uris?: string[] | null;
  es_confidencial?: boolean | null;
  logo_url?: string | null | null;
  activo?: boolean | null;
  creado_en?: string | null;
}

export type OauthClientesUpdate = {
  id?: string | null;
  nombre?: string | null;
  descripcion?: string | null | null;
  client_secret_hash?: string | null;
  redirect_uris?: string[] | null;
  es_confidencial?: boolean | null;
  logo_url?: string | null | null;
  activo?: boolean | null;
  creado_en?: string | null;
}

export type OauthConsentimientosInsert = {
  id?: string | null;
  studio_id?: string | null;
  cliente_id?: string | null;
  otorgado_por?: string | null;
  scopes?: string[] | null;
  otorgado_en?: string | null;
  revocado_en?: string | null | null;
}

export type OauthConsentimientosUpdate = {
  id?: string | null;
  studio_id?: string | null;
  cliente_id?: string | null;
  otorgado_por?: string | null;
  scopes?: string[] | null;
  otorgado_en?: string | null;
  revocado_en?: string | null | null;
}

export type OauthCodigosAutorizacionInsert = {
  codigo?: string | null;
  studio_id?: string | null;
  cliente_id?: string | null;
  auth_user_id?: string | null;
  scopes?: string[] | null;
  redirect_uri?: string | null;
  code_challenge?: string | null;
  code_challenge_method?: string | null;
  cadena_id?: string | null;
  expira_en?: string | null;
  usado_en?: string | null | null;
  creado_en?: string | null;
}

export type OauthCodigosAutorizacionUpdate = {
  codigo?: string | null;
  studio_id?: string | null;
  cliente_id?: string | null;
  auth_user_id?: string | null;
  scopes?: string[] | null;
  redirect_uri?: string | null;
  code_challenge?: string | null;
  code_challenge_method?: string | null;
  cadena_id?: string | null;
  expira_en?: string | null;
  usado_en?: string | null | null;
  creado_en?: string | null;
}

export type OauthTokensInsert = {
  id?: string | null;
  studio_id?: string | null;
  cliente_id?: string | null;
  auth_user_id?: string | null;
  scopes?: string[] | null;
  access_token_hash?: string | null;
  refresh_token_hash?: string | null;
  access_token_expira_en?: string | null;
  refresh_token_expira_en?: string | null;
  cadena_id?: string | null;
  revocado_en?: string | null | null;
  reemplazado_por?: string | null | null;
  creado_en?: string | null;
}

export type OauthTokensUpdate = {
  id?: string | null;
  studio_id?: string | null;
  cliente_id?: string | null;
  auth_user_id?: string | null;
  scopes?: string[] | null;
  access_token_hash?: string | null;
  refresh_token_hash?: string | null;
  access_token_expira_en?: string | null;
  refresh_token_expira_en?: string | null;
  cadena_id?: string | null;
  revocado_en?: string | null | null;
  reemplazado_por?: string | null | null;
  creado_en?: string | null;
}

export type OauthAuditoriaAccesosInsert = {
  id?: number | null;
  token_id?: string | null | null;
  studio_id?: string | null;
  cliente_id?: string | null;
  scope_usado?: string | null | null;
  metodo?: string | null;
  ruta?: string | null;
  status_code?: number | null;
  ip?: string | null | null;
  creado_en?: string | null;
}

export type OauthAuditoriaAccesosUpdate = {
  id?: number | null;
  token_id?: string | null | null;
  studio_id?: string | null;
  cliente_id?: string | null;
  scope_usado?: string | null | null;
  metodo?: string | null;
  ruta?: string | null;
  status_code?: number | null;
  ip?: string | null | null;
  creado_en?: string | null;
}

export type WidgetEventosInsert = {
  id?: string | null;
  studio_id?: string | null;
  session_id?: string | null;
  tipo?: string | null;
  sesion_clase_id?: string | null | null;
  origen?: string | null | null;
  creado_en?: string | null;
  socio_id?: string | null | null;
}

export type WidgetEventosUpdate = {
  id?: string | null;
  studio_id?: string | null;
  session_id?: string | null;
  tipo?: string | null;
  sesion_clase_id?: string | null | null;
  origen?: string | null | null;
  creado_en?: string | null;
  socio_id?: string | null | null;
}

export type TareasInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  titulo?: string | null;
  descripcion?: string | null | null;
  estado?: string | null;
  origen?: string | null;
  creado_en?: string | null;
  completado_en?: string | null | null;
}

export type TareasUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null | null;
  titulo?: string | null;
  descripcion?: string | null | null;
  estado?: string | null;
  origen?: string | null;
  creado_en?: string | null;
  completado_en?: string | null | null;
}

export type RedFormalizacionesInsert = {
  id?: string | null;
  solicitud_id?: string | null;
  propuesto_por?: string | null;
  tipo_contrato?: string | null;
  estudio_confirmado_en?: string | null | null;
  instructora_confirmada_en?: string | null | null;
  estado?: string | null;
  instructor_id?: string | null | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
}

export type RedFormalizacionesUpdate = {
  id?: string | null;
  solicitud_id?: string | null;
  propuesto_por?: string | null;
  tipo_contrato?: string | null;
  estudio_confirmado_en?: string | null | null;
  instructora_confirmada_en?: string | null | null;
  estado?: string | null;
  instructor_id?: string | null | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
}

export type RedVacantesInsert = {
  id?: string | null;
  studio_id?: string | null;
  publicado_por?: string | null;
  titulo?: string | null;
  especialidades?: string[] | null;
  horarios?: string[] | null;
  tipo_trabajo?: string | null;
  tarifa_rango?: string | null;
  requisitos?: string | null | null;
  descripcion?: string | null;
  estado?: string | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
  cerrado_en?: string | null | null;
}

export type RedVacantesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  publicado_por?: string | null;
  titulo?: string | null;
  especialidades?: string[] | null;
  horarios?: string[] | null;
  tipo_trabajo?: string | null;
  tarifa_rango?: string | null;
  requisitos?: string | null | null;
  descripcion?: string | null;
  estado?: string | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
  cerrado_en?: string | null | null;
}

export type RedCandidaturasInsert = {
  id?: string | null;
  vacante_id?: string | null;
  perfil_id?: string | null;
  studio_id?: string | null;
  mensaje?: string | null | null;
  notas_estudio?: string | null | null;
  estado?: string | null;
  solicitud_id?: string | null | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
  resuelto_en?: string | null | null;
}

export type RedCandidaturasUpdate = {
  id?: string | null;
  vacante_id?: string | null;
  perfil_id?: string | null;
  studio_id?: string | null;
  mensaje?: string | null | null;
  notas_estudio?: string | null | null;
  estado?: string | null;
  solicitud_id?: string | null | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
  resuelto_en?: string | null | null;
}

export type RecordatorioEnviosInsert = {
  sesion_id?: string | null;
  socio_id?: string | null;
  canal?: string | null;
  enviado_en?: string | null;
}

export type RecordatorioEnviosUpdate = {
  sesion_id?: string | null;
  socio_id?: string | null;
  canal?: string | null;
  enviado_en?: string | null;
}

export type SegmentosClientesInsert = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  condiciones?: any | null;
  creado_por?: string | null | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
}

export type SegmentosClientesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  nombre?: string | null;
  condiciones?: any | null;
  creado_por?: string | null | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
}

export type MensajesEntrantesMedicionInsert = {
  id?: string | null;
  canal?: string | null;
  de_numero?: string | null;
  para_numero?: string | null;
  cuerpo?: string | null | null;
  twilio_sid?: string | null;
  creado_en?: string | null;
}

export type MensajesEntrantesMedicionUpdate = {
  id?: string | null;
  canal?: string | null;
  de_numero?: string | null;
  para_numero?: string | null;
  cuerpo?: string | null | null;
  twilio_sid?: string | null;
  creado_en?: string | null;
}

export type CodigosDescuentoConsumosInsert = {
  recibo_id?: string | null;
  codigo_id?: string | null;
  consumido_en?: string | null;
  socio_id?: string | null | null;
}

export type CodigosDescuentoConsumosUpdate = {
  recibo_id?: string | null;
  codigo_id?: string | null;
  consumido_en?: string | null;
  socio_id?: string | null | null;
}

export type ReviewBoostFeedbackInsert = {
  id?: string | null;
  studio_id?: string | null;
  rating?: number | null;
  comentario?: string | null | null;
  fuente?: string | null;
  estado?: string | null;
  creado_en?: string | null;
}

export type ReviewBoostFeedbackUpdate = {
  id?: string | null;
  studio_id?: string | null;
  rating?: number | null;
  comentario?: string | null | null;
  fuente?: string | null;
  estado?: string | null;
  creado_en?: string | null;
}

export type ReviewBoostRecompensasInsert = {
  id?: string | null;
  studio_id?: string | null;
  feedback_id?: string | null;
  stripe_coupon_id?: string | null;
  concedida_en?: string | null;
  canjeada_en?: string | null | null;
  creado_en?: string | null;
}

export type ReviewBoostRecompensasUpdate = {
  id?: string | null;
  studio_id?: string | null;
  feedback_id?: string | null;
  stripe_coupon_id?: string | null;
  concedida_en?: string | null;
  canjeada_en?: string | null | null;
  creado_en?: string | null;
}

export type MenuNovedadesInsert = {
  href?: string | null;
  creado_por?: string | null | null;
  creado_en?: string | null;
}

export type MenuNovedadesUpdate = {
  href?: string | null;
  creado_por?: string | null | null;
  creado_en?: string | null;
}

export type RedPerfilesAlumnaInsert = {
  id?: string | null;
  auth_user_id?: string | null;
  nombre?: string | null;
  foto_url?: string | null | null;
  ciudad?: string | null | null;
  zona?: string | null | null;
  lat?: number | null | null;
  lng?: number | null | null;
  intereses?: string[] | null;
  disponibilidad_horarios?: string[] | null;
  estado?: string | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
}

export type RedPerfilesAlumnaUpdate = {
  id?: string | null;
  auth_user_id?: string | null;
  nombre?: string | null;
  foto_url?: string | null | null;
  ciudad?: string | null | null;
  zona?: string | null | null;
  lat?: number | null | null;
  lng?: number | null | null;
  intereses?: string[] | null;
  disponibilidad_horarios?: string[] | null;
  estado?: string | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
}

export type RedPerfilMediaInsert = {
  id?: string | null;
  perfil_id?: string | null;
  tipo?: string | null;
  path?: string | null;
  orden?: number | null;
  creado_en?: string | null;
}

export type RedPerfilMediaUpdate = {
  id?: string | null;
  perfil_id?: string | null;
  tipo?: string | null;
  path?: string | null;
  orden?: number | null;
  creado_en?: string | null;
}

export type RedFavoritosAlumnaInsert = {
  id?: string | null;
  auth_user_id?: string | null;
  tipo?: string | null;
  studio_id?: string | null | null;
  perfil_id?: string | null | null;
  creado_en?: string | null;
}

export type RedFavoritosAlumnaUpdate = {
  id?: string | null;
  auth_user_id?: string | null;
  tipo?: string | null;
  studio_id?: string | null | null;
  perfil_id?: string | null | null;
  creado_en?: string | null;
}

export type ConversacionesInsert = {
  id?: string | null;
  studio_id?: string | null;
  tipo?: string | null;
  titulo?: string | null | null;
  ancla_sesion_id?: string | null | null;
  ancla_reserva_id?: string | null | null;
  creado_en?: string | null;
  ultimo_mensaje_en?: string | null;
  mostrador_leido_hasta?: string | null | null;
}

export type ConversacionesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  tipo?: string | null;
  titulo?: string | null | null;
  ancla_sesion_id?: string | null | null;
  ancla_reserva_id?: string | null | null;
  creado_en?: string | null;
  ultimo_mensaje_en?: string | null;
  mostrador_leido_hasta?: string | null | null;
}

export type ConversacionParticipantesInsert = {
  conversacion_id?: string | null;
  auth_user_id?: string | null;
  rol_en_conversacion?: string | null;
  socio_id?: string | null | null;
  leido_hasta?: string | null;
  unido_en?: string | null;
}

export type ConversacionParticipantesUpdate = {
  conversacion_id?: string | null;
  auth_user_id?: string | null;
  rol_en_conversacion?: string | null;
  socio_id?: string | null | null;
  leido_hasta?: string | null;
  unido_en?: string | null;
}

export type MensajesInsert = {
  id?: string | null;
  conversacion_id?: string | null;
  studio_id?: string | null;
  remitente_auth_user_id?: string | null | null;
  cuerpo?: string | null;
  creado_en?: string | null;
}

export type MensajesUpdate = {
  id?: string | null;
  conversacion_id?: string | null;
  studio_id?: string | null;
  remitente_auth_user_id?: string | null | null;
  cuerpo?: string | null;
  creado_en?: string | null;
}

export type DocumentosSocioInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  categoria?: string | null;
  titulo?: string | null;
  storage_path?: string | null;
  subido_por?: string | null | null;
  caduca_en?: string | null | null;
  creado_en?: string | null;
  borrado_en?: string | null | null;
}

export type DocumentosSocioUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  categoria?: string | null;
  titulo?: string | null;
  storage_path?: string | null;
  subido_por?: string | null | null;
  caduca_en?: string | null | null;
  creado_en?: string | null;
  borrado_en?: string | null | null;
}

export type PostEventoAsistentesInsert = {
  post_id?: string | null;
  socio_id?: string | null;
  creado_en?: string | null;
}

export type PostEventoAsistentesUpdate = {
  post_id?: string | null;
  socio_id?: string | null;
  creado_en?: string | null;
}

export type SocioCompanerasInsert = {
  id?: string | null;
  studio_id?: string | null;
  solicitante_id?: string | null;
  destinataria_id?: string | null;
  estado?: string | null;
  bloqueada_por?: string | null | null;
  creado_en?: string | null;
  resuelto_en?: string | null | null;
}

export type SocioCompanerasUpdate = {
  id?: string | null;
  studio_id?: string | null;
  solicitante_id?: string | null;
  destinataria_id?: string | null;
  estado?: string | null;
  bloqueada_por?: string | null | null;
  creado_en?: string | null;
  resuelto_en?: string | null | null;
}

export type NovedadesEstudioInsert = {
  id?: string | null;
  studio_id?: string | null;
  titulo?: string | null;
  texto?: string | null | null;
  emoji?: string | null | null;
  activo?: boolean | null;
  fecha_inicio?: string | null | null;
  fecha_fin?: string | null | null;
  created_by?: string | null | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type NovedadesEstudioUpdate = {
  id?: string | null;
  studio_id?: string | null;
  titulo?: string | null;
  texto?: string | null | null;
  emoji?: string | null | null;
  activo?: boolean | null;
  fecha_inicio?: string | null | null;
  fecha_fin?: string | null | null;
  created_by?: string | null | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type WebhookReembolsosInsert = {
  id?: string | null;
  pi_stripe_id?: string | null;
  charge_stripe_id?: string | null;
  recibo_id?: string | null | null;
  amount_refunded_cents?: number | null;
  total_charge_cents?: number | null;
  es_reembolso_total?: boolean | null;
  procesado_en?: string | null;
}

export type WebhookReembolsosUpdate = {
  id?: string | null;
  pi_stripe_id?: string | null;
  charge_stripe_id?: string | null;
  recibo_id?: string | null | null;
  amount_refunded_cents?: number | null;
  total_charge_cents?: number | null;
  es_reembolso_total?: boolean | null;
  procesado_en?: string | null;
}

export type WebhookDisputasInsert = {
  id?: string | null;
  pi_stripe_id?: string | null;
  dispute_stripe_id?: string | null;
  recibo_id?: string | null | null;
  dispute_status?: string | null;
  procesado_en?: string | null;
}

export type WebhookDisputasUpdate = {
  id?: string | null;
  pi_stripe_id?: string | null;
  dispute_stripe_id?: string | null;
  recibo_id?: string | null | null;
  dispute_status?: string | null;
  procesado_en?: string | null;
}

export type AyudaFeedbackInsert = {
  id?: string | null;
  articulo_slug?: string | null;
  categoria_slug?: string | null;
  valoracion?: string | null;
  url?: string | null;
  creado_en?: string | null;
}

export type AyudaFeedbackUpdate = {
  id?: string | null;
  articulo_slug?: string | null;
  categoria_slug?: string | null;
  valoracion?: string | null;
  url?: string | null;
  creado_en?: string | null;
}

export type PlataformaProspeccionEmailInsert = {
  id?: string | null;
  lead_id?: string | null;
  asunto?: string | null;
  cuerpo?: string | null;
  estado?: string | null;
  aprobado_por?: string | null | null;
  aprobado_en?: string | null | null;
  enviado_en?: string | null | null;
  error?: string | null | null;
  generado_en?: string | null;
  creado_en?: string | null;
}

export type PlataformaProspeccionEmailUpdate = {
  id?: string | null;
  lead_id?: string | null;
  asunto?: string | null;
  cuerpo?: string | null;
  estado?: string | null;
  aprobado_por?: string | null | null;
  aprobado_en?: string | null | null;
  enviado_en?: string | null | null;
  error?: string | null | null;
  generado_en?: string | null;
  creado_en?: string | null;
}

export type DecisionSnapshotsInsert = {
  id?: string | null;
  studio_id?: string | null;
  snapshot_data?: any | null;
  cacheado_en?: string | null;
  valido_hasta?: string | null;
  es_valido?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type DecisionSnapshotsUpdate = {
  id?: string | null;
  studio_id?: string | null;
  snapshot_data?: any | null;
  cacheado_en?: string | null;
  valido_hasta?: string | null;
  es_valido?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type SocioTiposClaseAutorizadosInsert = {
  studio_id?: string | null;
  socio_id?: string | null;
  tipo_clase_id?: string | null;
  autorizada_en?: string | null;
  autorizada_por?: string | null | null;
}

export type SocioTiposClaseAutorizadosUpdate = {
  studio_id?: string | null;
  socio_id?: string | null;
  tipo_clase_id?: string | null;
  autorizada_en?: string | null;
  autorizada_por?: string | null | null;
}

export type CierresEstudioInsert = {
  id?: string | null;
  studio_id?: string | null;
  desde?: string | null;
  hasta?: string | null;
  motivo?: string | null | null;
  creado_en?: string | null;
}

export type CierresEstudioUpdate = {
  id?: string | null;
  studio_id?: string | null;
  desde?: string | null;
  hasta?: string | null;
  motivo?: string | null | null;
  creado_en?: string | null;
}

export type CajasInsert = {
  id?: string | null;
  studio_id?: string | null;
  estado?: string | null;
  fondo_inicial?: number | null;
  abierta_en?: string | null;
  abierta_por?: string | null | null;
  abierta_por_nombre?: string | null | null;
  cerrada_en?: string | null | null;
  cerrada_por?: string | null | null;
  cerrada_por_nombre?: string | null | null;
  efectivo_contado?: number | null | null;
  efectivo_esperado?: number | null | null;
  diferencia?: number | null | null;
  notas_cierre?: string | null | null;
}

export type CajasUpdate = {
  id?: string | null;
  studio_id?: string | null;
  estado?: string | null;
  fondo_inicial?: number | null;
  abierta_en?: string | null;
  abierta_por?: string | null | null;
  abierta_por_nombre?: string | null | null;
  cerrada_en?: string | null | null;
  cerrada_por?: string | null | null;
  cerrada_por_nombre?: string | null | null;
  efectivo_contado?: number | null | null;
  efectivo_esperado?: number | null | null;
  diferencia?: number | null | null;
  notas_cierre?: string | null | null;
}

export type MovimientosCajaInsert = {
  id?: string | null;
  studio_id?: string | null;
  caja_id?: string | null;
  tipo?: string | null;
  importe?: number | null;
  metodo_pago?: string | null;
  concepto?: string | null;
  referencia?: string | null | null;
  metadata?: any | null;
  creado_en?: string | null;
  creado_por?: string | null | null;
  creado_por_nombre?: string | null | null;
}

export type MovimientosCajaUpdate = {
  id?: string | null;
  studio_id?: string | null;
  caja_id?: string | null;
  tipo?: string | null;
  importe?: number | null;
  metodo_pago?: string | null;
  concepto?: string | null;
  referencia?: string | null | null;
  metadata?: any | null;
  creado_en?: string | null;
  creado_por?: string | null | null;
  creado_por_nombre?: string | null | null;
}

export type VentasPosLineasInsert = {
  id?: string | null;
  venta_id?: string | null;
  studio_id?: string | null;
  tipo?: string | null;
  referencia_id?: string | null | null;
  nombre?: string | null;
  precio_unitario?: number | null;
  cantidad?: number | null;
  iva_pct?: number | null;
  descuento?: number | null;
  base_imponible?: number | null;
  iva_importe?: number | null;
  total?: number | null;
  suscripcion_id?: string | null | null;
  devuelta_cantidad?: number | null;
  orden?: number | null;
}

export type VentasPosLineasUpdate = {
  id?: string | null;
  venta_id?: string | null;
  studio_id?: string | null;
  tipo?: string | null;
  referencia_id?: string | null | null;
  nombre?: string | null;
  precio_unitario?: number | null;
  cantidad?: number | null;
  iva_pct?: number | null;
  descuento?: number | null;
  base_imponible?: number | null;
  iva_importe?: number | null;
  total?: number | null;
  suscripcion_id?: string | null | null;
  devuelta_cantidad?: number | null;
  orden?: number | null;
}

export type MovimientosStockInsert = {
  id?: string | null;
  studio_id?: string | null;
  producto_id?: string | null;
  tipo?: string | null;
  cantidad?: number | null;
  stock_anterior?: number | null | null;
  stock_resultante?: number | null;
  motivo?: string | null | null;
  coste_unitario?: number | null | null;
  creado_por?: string | null | null;
  creado_por_nombre?: string | null | null;
  creado_en?: string | null;
}

export type MovimientosStockUpdate = {
  id?: string | null;
  studio_id?: string | null;
  producto_id?: string | null;
  tipo?: string | null;
  cantidad?: number | null;
  stock_anterior?: number | null | null;
  stock_resultante?: number | null;
  motivo?: string | null | null;
  coste_unitario?: number | null | null;
  creado_por?: string | null | null;
  creado_por_nombre?: string | null | null;
  creado_en?: string | null;
}

export type TerminosVersionesInsert = {
  id?: string | null;
  studio_id?: string | null;
  hash?: string | null;
  texto?: string | null;
  creado_en?: string | null;
}

export type TerminosVersionesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  hash?: string | null;
  texto?: string | null;
  creado_en?: string | null;
}

export type ValoracionesInicialesInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  estado?: string | null;
  objetivos?: string[] | null;
  objetivo_principal?: string | null | null;
  experiencia?: string | null | null;
  nivel?: string | null | null;
  actividad_habitual?: string | null;
  frecuencia?: string | null | null;
  expectativas?: string | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
  completada_en?: string | null | null;
}

export type ValoracionesInicialesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  estado?: string | null;
  objetivos?: string[] | null;
  objetivo_principal?: string | null | null;
  experiencia?: string | null | null;
  nivel?: string | null | null;
  actividad_habitual?: string | null;
  frecuencia?: string | null | null;
  expectativas?: string | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
  completada_en?: string | null | null;
}

export type ValoracionesInicialesSaludInsert = {
  valoracion_id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  tiene_molestias?: boolean | null | null;
  zonas?: string[] | null;
  detalle?: string | null;
  estado_cuerpo?: string | null | null;
  creado_en?: string | null;
}

export type ValoracionesInicialesSaludUpdate = {
  valoracion_id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  tiene_molestias?: boolean | null | null;
  zonas?: string[] | null;
  detalle?: string | null;
  estado_cuerpo?: string | null | null;
  creado_en?: string | null;
}

export type VerifactuTransmisionLockInsert = {
  id?: string | null;
  en_curso?: boolean | null;
  iniciado_en?: string | null | null;
  actualizado_en?: string | null;
}

export type VerifactuTransmisionLockUpdate = {
  id?: string | null;
  en_curso?: boolean | null;
  iniciado_en?: string | null | null;
  actualizado_en?: string | null;
}

export type EmailRebotesInsert = {
  email?: string | null;
  tipo?: string | null;
  motivo?: string | null | null;
  email_id?: string | null | null;
  detectado_en?: string | null;
}

export type EmailRebotesUpdate = {
  email?: string | null;
  tipo?: string | null;
  motivo?: string | null | null;
  email_id?: string | null | null;
  detectado_en?: string | null;
}

export type MatriculaCupoLiberacionesInsert = {
  payment_intent_id?: string | null;
  plan_id?: string | null;
  studio_id?: string | null;
  liberado_en?: string | null;
}

export type MatriculaCupoLiberacionesUpdate = {
  payment_intent_id?: string | null;
  plan_id?: string | null;
  studio_id?: string | null;
  liberado_en?: string | null;
}

export type SupresionesInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  auth_user_id?: string | null | null;
  solicitada_en?: string | null;
  ejecutada_en?: string | null | null;
  ejecutada_por?: string | null | null;
  origen?: string | null;
  terceros_pendientes?: any | null;
  reaplicada_en?: string | null | null;
}

export type SupresionesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  auth_user_id?: string | null | null;
  solicitada_en?: string | null;
  ejecutada_en?: string | null | null;
  ejecutada_por?: string | null | null;
  origen?: string | null;
  terceros_pendientes?: any | null;
  reaplicada_en?: string | null | null;
}

export type SolicitudesDerechosInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  tipo?: string | null;
  estado?: string | null;
  solicitada_en?: string | null;
  plazo_hasta?: string | null;
  resuelta_en?: string | null | null;
  resuelta_por?: string | null | null;
  nota?: string | null | null;
}

export type SolicitudesDerechosUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  tipo?: string | null;
  estado?: string | null;
  solicitada_en?: string | null;
  plazo_hasta?: string | null;
  resuelta_en?: string | null | null;
  resuelta_por?: string | null | null;
  nota?: string | null | null;
}

export type ConsentimientosSaludEventosInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  tipo?: string | null;
  en?: string | null;
  origen?: string | null;
  texto?: string | null | null;
  firma?: string | null | null;
  actor_uid?: string | null | null;
  actor_rol?: string | null | null;
}

export type ConsentimientosSaludEventosUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  tipo?: string | null;
  en?: string | null;
  origen?: string | null;
  texto?: string | null | null;
  firma?: string | null | null;
  actor_uid?: string | null | null;
  actor_rol?: string | null | null;
}

export type CicloEstudiosVencidosInsert = {
  id?: number | null;
  studio_id?: string | null;
  trial_ends_at?: string | null;
  fase?: string | null;
  programada_para?: string | null;
  ejecutada_en?: string | null | null;
  cancelada_en?: string | null | null;
  resumen?: any | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
}

export type CicloEstudiosVencidosUpdate = {
  id?: number | null;
  studio_id?: string | null;
  trial_ends_at?: string | null;
  fase?: string | null;
  programada_para?: string | null;
  ejecutada_en?: string | null | null;
  cancelada_en?: string | null | null;
  resumen?: any | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
}

export type KioskoTokensInsert = {
  studio_id?: string | null;
  token_hash?: string | null;
  actualizado_en?: string | null;
}

export type KioskoTokensUpdate = {
  studio_id?: string | null;
  token_hash?: string | null;
  actualizado_en?: string | null;
}

export type AceptacionesContratoEventosInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  en?: string | null;
  origen?: string | null;
  texto_hash?: string | null;
  texto_cliente_coincide?: boolean | null | null;
  firma?: string | null;
  introducida_por?: string | null | null;
  actor_uid?: string | null | null;
  actor_rol?: string | null | null;
  ip_hmac?: string | null | null;
  user_agent?: string | null | null;
}

export type AceptacionesContratoEventosUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  en?: string | null;
  origen?: string | null;
  texto_hash?: string | null;
  texto_cliente_coincide?: boolean | null | null;
  firma?: string | null;
  introducida_por?: string | null | null;
  actor_uid?: string | null | null;
  actor_rol?: string | null | null;
  ip_hmac?: string | null | null;
  user_agent?: string | null | null;
}

export type BajasInstructoraInsert = {
  id?: string | null;
  studio_id?: string | null;
  instructor_id?: string | null;
  sustitucion_id?: string | null;
  sesion_id?: string | null;
  categoria?: string | null | null;
  motivo?: string | null | null;
  antelacion_minutos?: number | null;
  revision?: string | null | null;
  nota_estudio?: string | null | null;
  revisada_por?: string | null | null;
  revisada_en?: string | null | null;
  creado_en?: string | null;
}

export type BajasInstructoraUpdate = {
  id?: string | null;
  studio_id?: string | null;
  instructor_id?: string | null;
  sustitucion_id?: string | null;
  sesion_id?: string | null;
  categoria?: string | null | null;
  motivo?: string | null | null;
  antelacion_minutos?: number | null;
  revision?: string | null | null;
  nota_estudio?: string | null | null;
  revisada_por?: string | null | null;
  revisada_en?: string | null | null;
  creado_en?: string | null;
}

export type SeriesInsert = {
  id?: string | null;
  studio_id?: string | null;
  semanas_periodo?: number | null;
  renovacion_automatica?: boolean | null;
  no_renovar?: boolean | null;
  creada_en?: string | null;
  aviso_tramo?: string | null | null;
  aviso_fin?: string | null | null;
}

export type SeriesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  semanas_periodo?: number | null;
  renovacion_automatica?: boolean | null;
  no_renovar?: boolean | null;
  creada_en?: string | null;
  aviso_tramo?: string | null | null;
  aviso_fin?: string | null | null;
}

export type SeriesPeriodosInsert = {
  serie_id?: string | null;
  periodo?: number | null;
  studio_id?: string | null;
  desde?: string | null;
  hasta?: string | null;
  origen?: string | null;
  creado_por?: string | null | null;
  sesiones_creadas?: number | null;
  omitidas?: any | null;
  creado_en?: string | null;
}

export type SeriesPeriodosUpdate = {
  serie_id?: string | null;
  periodo?: number | null;
  studio_id?: string | null;
  desde?: string | null;
  hasta?: string | null;
  origen?: string | null;
  creado_por?: string | null | null;
  sesiones_creadas?: number | null;
  omitidas?: any | null;
  creado_en?: string | null;
}

export type CierresProrrogasInsert = {
  cierre_id?: string | null;
  studio_id?: string | null;
  desde?: string | null;
  hasta?: string | null;
  dias?: number | null;
  bonos_ampliados?: number | null;
  recuperaciones_ampliadas?: number | null;
  aplicada_en?: string | null;
}

export type CierresProrrogasUpdate = {
  cierre_id?: string | null;
  studio_id?: string | null;
  desde?: string | null;
  hasta?: string | null;
  dias?: number | null;
  bonos_ampliados?: number | null;
  recuperaciones_ampliadas?: number | null;
  aplicada_en?: string | null;
}

export type SolicitudesPlazaFijaInsert = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  tipo?: string | null;
  origen?: string | null;
  estado?: string | null;
  sesion_id?: string | null | null;
  dia_semana?: number | null | null;
  hora_inicio?: string | null | null;
  sala_id?: string | null | null;
  tipo_clase_id?: string | null | null;
  supera_limite?: boolean | null;
  plaza_id?: string | null | null;
  desde_propuesta?: string | null | null;
  hasta_propuesta?: string | null | null;
  desde_aprobada?: string | null | null;
  hasta_aprobada?: string | null | null;
  motivo_sistema?: string | null | null;
  motivo_rechazo?: string | null | null;
  resultado_plaza_id?: string | null | null;
  creada_en?: string | null;
  resuelta_en?: string | null | null;
  resuelta_por?: string | null | null;
}

export type SolicitudesPlazaFijaUpdate = {
  id?: string | null;
  studio_id?: string | null;
  socio_id?: string | null;
  tipo?: string | null;
  origen?: string | null;
  estado?: string | null;
  sesion_id?: string | null | null;
  dia_semana?: number | null | null;
  hora_inicio?: string | null | null;
  sala_id?: string | null | null;
  tipo_clase_id?: string | null | null;
  supera_limite?: boolean | null;
  plaza_id?: string | null | null;
  desde_propuesta?: string | null | null;
  hasta_propuesta?: string | null | null;
  desde_aprobada?: string | null | null;
  hasta_aprobada?: string | null | null;
  motivo_sistema?: string | null | null;
  motivo_rechazo?: string | null | null;
  resultado_plaza_id?: string | null | null;
  creada_en?: string | null;
  resuelta_en?: string | null | null;
  resuelta_por?: string | null | null;
}

export type SalesLeadsInsert = {
  id?: string | null;
  email?: string | null;
  nombre_contacto?: string | null | null;
  apellido_contacto?: string | null | null;
  estudio_nombre?: string | null | null;
  estudio_nombre_legal?: string | null | null;
  rol?: string | null | null;
  telefono?: string | null | null;
  ciudad?: string | null | null;
  provincia?: string | null | null;
  pais?: string | null | null;
  codigo_postal?: string | null | null;
  direccion?: string | null | null;
  website?: string | null | null;
  website_domain?: string | null | null;
  instagram_url?: string | null | null;
  facebook_url?: string | null | null;
  linkedin_url?: string | null | null;
  software_actual?: string | null | null;
  numero_empleados?: number | null | null;
  clientes_aprox?: number | null | null;
  precio_mensual_aprox?: string | null | null;
  google_place_id?: string | null | null;
  phone_normalized?: string | null | null;
  phone_checked_at?: string | null | null;
  estado?: string | null;
  origen?: string | null;
  source_url?: string | null | null;
  source_created_at?: string | null | null;
  discovered_at?: string | null | null;
  last_verified_at?: string | null | null;
  email_status?: string | null | null;
  email_checked_at?: string | null | null;
  owner_id?: string | null | null;
  studio_id?: string | null | null;
  tags?: string[] | null | null;
  notas?: string | null | null;
  razon_perdida?: string | null | null;
  confidence?: number | null | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
  borrado_en?: string | null | null;
}

export type SalesLeadsUpdate = {
  id?: string | null;
  email?: string | null;
  nombre_contacto?: string | null | null;
  apellido_contacto?: string | null | null;
  estudio_nombre?: string | null | null;
  estudio_nombre_legal?: string | null | null;
  rol?: string | null | null;
  telefono?: string | null | null;
  ciudad?: string | null | null;
  provincia?: string | null | null;
  pais?: string | null | null;
  codigo_postal?: string | null | null;
  direccion?: string | null | null;
  website?: string | null | null;
  website_domain?: string | null | null;
  instagram_url?: string | null | null;
  facebook_url?: string | null | null;
  linkedin_url?: string | null | null;
  software_actual?: string | null | null;
  numero_empleados?: number | null | null;
  clientes_aprox?: number | null | null;
  precio_mensual_aprox?: string | null | null;
  google_place_id?: string | null | null;
  phone_normalized?: string | null | null;
  phone_checked_at?: string | null | null;
  estado?: string | null;
  origen?: string | null;
  source_url?: string | null | null;
  source_created_at?: string | null | null;
  discovered_at?: string | null | null;
  last_verified_at?: string | null | null;
  email_status?: string | null | null;
  email_checked_at?: string | null | null;
  owner_id?: string | null | null;
  studio_id?: string | null | null;
  tags?: string[] | null | null;
  notas?: string | null | null;
  razon_perdida?: string | null | null;
  confidence?: number | null | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
  borrado_en?: string | null | null;
}

export type SalesCampaignsInsert = {
  id?: string | null;
  nombre?: string | null;
  descripcion?: string | null | null;
  audience_count?: number | null | null;
  estado?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  scheduled_for?: string | null | null;
  borrado_en?: string | null | null;
}

export type SalesCampaignsUpdate = {
  id?: string | null;
  nombre?: string | null;
  descripcion?: string | null | null;
  audience_count?: number | null | null;
  estado?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  scheduled_for?: string | null | null;
  borrado_en?: string | null | null;
}

export type SalesCampaignStepsInsert = {
  id?: string | null;
  campaign_id?: string | null;
  orden?: number | null;
  asunto?: string | null | null;
  cuerpo?: string | null | null;
  delay_days?: number | null | null;
  conditions?: any | null | null;
  enabled?: boolean | null | null;
  created_at?: string | null;
}

export type SalesCampaignStepsUpdate = {
  id?: string | null;
  campaign_id?: string | null;
  orden?: number | null;
  asunto?: string | null | null;
  cuerpo?: string | null | null;
  delay_days?: number | null | null;
  conditions?: any | null | null;
  enabled?: boolean | null | null;
  created_at?: string | null;
}

export type SalesMessagesInsert = {
  id?: string | null;
  lead_id?: string | null;
  campaign_id?: string | null | null;
  campaign_step_id?: string | null | null;
  asunto?: string | null | null;
  cuerpo?: string | null | null;
  estado?: string | null;
  proveedor?: string | null | null;
  proveedor_id?: string | null | null;
  enviado_en?: string | null | null;
  entregado_en?: string | null | null;
  abierto_en?: string | null | null;
  respuesta_en?: string | null | null;
  error?: string | null | null;
  creado_en?: string | null;
}

export type SalesMessagesUpdate = {
  id?: string | null;
  lead_id?: string | null;
  campaign_id?: string | null | null;
  campaign_step_id?: string | null | null;
  asunto?: string | null | null;
  cuerpo?: string | null | null;
  estado?: string | null;
  proveedor?: string | null | null;
  proveedor_id?: string | null | null;
  enviado_en?: string | null | null;
  entregado_en?: string | null | null;
  abierto_en?: string | null | null;
  respuesta_en?: string | null | null;
  error?: string | null | null;
  creado_en?: string | null;
}

export type SalesSuppressionsInsert = {
  id?: string | null;
  email?: string | null | null;
  dominio?: string | null | null;
  telefono?: string | null | null;
  razon?: string | null;
  source?: string | null;
  creado_en?: string | null;
}

export type SalesSuppressionsUpdate = {
  id?: string | null;
  email?: string | null | null;
  dominio?: string | null | null;
  telefono?: string | null | null;
  razon?: string | null;
  source?: string | null;
  creado_en?: string | null;
}

export type SalesTasksInsert = {
  id?: string | null;
  lead_id?: string | null;
  tipo?: string | null;
  asignado_a?: string | null | null;
  vencimiento?: string | null | null;
  prioridad?: number | null | null;
  estado?: string | null;
  notas?: string | null | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
  borrado_en?: string | null | null;
}

export type SalesTasksUpdate = {
  id?: string | null;
  lead_id?: string | null;
  tipo?: string | null;
  asignado_a?: string | null | null;
  vencimiento?: string | null | null;
  prioridad?: number | null | null;
  estado?: string | null;
  notas?: string | null | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
  borrado_en?: string | null | null;
}

export type SalesEventsInsert = {
  id?: string | null;
  lead_id?: string | null | null;
  tipo?: string | null;
  actor_id?: string | null | null;
  detalles?: any | null | null;
  creado_en?: string | null;
}

export type SalesEventsUpdate = {
  id?: string | null;
  lead_id?: string | null | null;
  tipo?: string | null;
  actor_id?: string | null | null;
  detalles?: any | null | null;
  creado_en?: string | null;
}

export type CobrosIntentosInsert = {
  payment_intent_id?: string | null;
  studio_id?: string | null;
  recibo_id?: string | null;
  importe_centimos?: number | null;
  origen?: string | null;
  desenlace?: string | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
}

export type CobrosIntentosUpdate = {
  payment_intent_id?: string | null;
  studio_id?: string | null;
  recibo_id?: string | null;
  importe_centimos?: number | null;
  origen?: string | null;
  desenlace?: string | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
}

export type DoblesCobrosDetectadosInsert = {
  id?: string | null;
  studio_id?: string | null;
  recibo_id?: string | null;
  payment_intent_ids?: string[] | null;
  tipo?: string | null;
  estado?: string | null;
  notas?: string | null | null;
  detectado_en?: string | null;
  resuelto_en?: string | null | null;
}

export type DoblesCobrosDetectadosUpdate = {
  id?: string | null;
  studio_id?: string | null;
  recibo_id?: string | null;
  payment_intent_ids?: string[] | null;
  tipo?: string | null;
  estado?: string | null;
  notas?: string | null | null;
  detectado_en?: string | null;
  resuelto_en?: string | null | null;
}

export type OpeningProgresoInsert = {
  studio_id?: string | null;
  fase?: string | null;
  objetivos?: any | null;
  checklist?: any | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type OpeningProgresoUpdate = {
  studio_id?: string | null;
  fase?: string | null;
  objetivos?: any | null;
  checklist?: any | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type OpeningConfigInsert = {
  studio_id?: string | null;
  umbral_amarillo?: number | null;
  umbral_rojo?: number | null;
  conversion_leads?: number | null;
  objetivo_preventa?: number | null;
  ventana_analisis_dias?: number | null;
  sesiones_semana_sin_tope?: number | null;
  semanas_bono_sin_caducidad?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type OpeningConfigUpdate = {
  studio_id?: string | null;
  umbral_amarillo?: number | null;
  umbral_rojo?: number | null;
  conversion_leads?: number | null;
  objetivo_preventa?: number | null;
  ventana_analisis_dias?: number | null;
  sesiones_semana_sin_tope?: number | null;
  semanas_bono_sin_caducidad?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type LaunchStagesInsert = {
  id?: string | null;
  studio_id?: string | null;
  etapa?: string | null;
  plan_id?: string | null | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  limite_plazas?: number | null | null;
  estado?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  al_completar?: string | null | null;
  cerrada_en?: string | null | null;
  cerrada_motivo?: string | null | null;
}

export type LaunchStagesUpdate = {
  id?: string | null;
  studio_id?: string | null;
  etapa?: string | null;
  plan_id?: string | null | null;
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  limite_plazas?: number | null | null;
  estado?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  al_completar?: string | null | null;
  cerrada_en?: string | null | null;
  cerrada_motivo?: string | null | null;
}

export type AlertasOpeningInsert = {
  id?: string | null;
  studio_id?: string | null;
  tipo?: string | null;
  severidad?: string | null;
  titulo?: string | null;
  descripcion?: string | null | null;
  datos?: any | null;
  resuelta_en?: string | null | null;
  created_at?: string | null;
}

export type AlertasOpeningUpdate = {
  id?: string | null;
  studio_id?: string | null;
  tipo?: string | null;
  severidad?: string | null;
  titulo?: string | null;
  descripcion?: string | null | null;
  datos?: any | null;
  resuelta_en?: string | null | null;
  created_at?: string | null;
}

export type InstructorWorkSessionsInsert = {
  id?: string | null;
  studio_id?: string | null;
  instructor_id?: string | null;
  check_in_at?: string | null;
  check_out_at?: string | null | null;
  check_in_method?: string | null;
  check_out_method?: string | null | null;
  status?: string | null;
  created_at?: string | null;
  created_by?: string | null;
  edited_at?: string | null | null;
  edited_by?: string | null | null;
  OR?: string | null;
}

export type InstructorWorkSessionsUpdate = {
  id?: string | null;
  studio_id?: string | null;
  instructor_id?: string | null;
  check_in_at?: string | null;
  check_out_at?: string | null | null;
  check_in_method?: string | null;
  check_out_method?: string | null | null;
  status?: string | null;
  created_at?: string | null;
  created_by?: string | null;
  edited_at?: string | null | null;
  edited_by?: string | null | null;
  OR?: string | null;
}

export type WorkSessionAuditsInsert = {
  id?: string | null;
  studio_id?: string | null;
  work_session_id?: string | null;
  action?: string | null;
  field_name?: string | null | null;
  value_before?: string | null | null;
  value_after?: string | null | null;
  reason?: string | null | null;
  created_at?: string | null;
  created_by?: string | null;
}

export type WorkSessionAuditsUpdate = {
  id?: string | null;
  studio_id?: string | null;
  work_session_id?: string | null;
  action?: string | null;
  field_name?: string | null | null;
  value_before?: string | null | null;
  value_after?: string | null | null;
  reason?: string | null | null;
  created_at?: string | null;
  created_by?: string | null;
}

export type StudioConfigTiempoInsert = {
  studio_id?: string | null;
  check_in_window_minutes?: number | null;
  open_session_limit_hours?: number | null;
  updated_at?: string | null;
  liquidar_por?: string | null | null;
  pagar_duracion_real?: boolean | null | null;
}

export type StudioConfigTiempoUpdate = {
  studio_id?: string | null;
  check_in_window_minutes?: number | null;
  open_session_limit_hours?: number | null;
  updated_at?: string | null;
  liquidar_por?: string | null | null;
  pagar_duracion_real?: boolean | null | null;
}

export type LaunchStagePlazasInsert = {
  id?: string | null;
  stage_id?: string | null;
  studio_id?: string | null;
  clave?: string | null;
  stripe_ref?: string | null | null;
  suscripcion_id?: string | null | null;
  estado?: string | null;
  expira_en?: string | null | null;
  intento?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type LaunchStagePlazasUpdate = {
  id?: string | null;
  stage_id?: string | null;
  studio_id?: string | null;
  clave?: string | null;
  stripe_ref?: string | null | null;
  suscripcion_id?: string | null | null;
  estado?: string | null;
  expira_en?: string | null | null;
  intento?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export type ClasesImpartidasInsert = {
  sesion_id?: string | null;
  studio_id?: string | null;
  instructor_id?: string | null;
  estado?: string | null;
  inicio_real?: string | null | null;
  fin_real?: string | null | null;
  origen?: string | null;
  revisada_en?: string | null | null;
  revisada_por?: string | null | null;
  created_at?: string | null;
  created_by?: string | null;
  edited_at?: string | null | null;
  edited_by?: string | null | null;
  OR?: string | null | null;
}

export type ClasesImpartidasUpdate = {
  sesion_id?: string | null;
  studio_id?: string | null;
  instructor_id?: string | null;
  estado?: string | null;
  inicio_real?: string | null | null;
  fin_real?: string | null | null;
  origen?: string | null;
  revisada_en?: string | null | null;
  revisada_por?: string | null | null;
  created_at?: string | null;
  created_by?: string | null;
  edited_at?: string | null | null;
  edited_by?: string | null | null;
  OR?: string | null | null;
}

export type ClasesImpartidasAuditoriaInsert = {
  id?: string | null;
  studio_id?: string | null;
  sesion_id?: string | null;
  accion?: string | null;
  campo?: string | null | null;
  valor_antes?: string | null | null;
  valor_despues?: string | null | null;
  motivo?: string | null | null;
  created_at?: string | null;
  created_by?: string | null;
}

export type ClasesImpartidasAuditoriaUpdate = {
  id?: string | null;
  studio_id?: string | null;
  sesion_id?: string | null;
  accion?: string | null;
  campo?: string | null | null;
  valor_antes?: string | null | null;
  valor_despues?: string | null | null;
  motivo?: string | null | null;
  created_at?: string | null;
  created_by?: string | null;
}

export type Database = {
  public: {
    Tables: {
      reservas: {
        Row: RowReservas;
        Insert: ReservasInsert;
        Update: ReservasUpdate;
      };
      achievement_definitions: {
        Row: RowAchievementDefinitions;
        Insert: AchievementDefinitionsInsert;
        Update: AchievementDefinitionsUpdate;
      };
      achievement_history: {
        Row: RowAchievementHistory;
        Insert: AchievementHistoryInsert;
        Update: AchievementHistoryUpdate;
      };
      achievement_progress: {
        Row: RowAchievementProgress;
        Insert: AchievementProgressInsert;
        Update: AchievementProgressUpdate;
      };
      actividad_reciente: {
        Row: RowActividadReciente;
        Insert: ActividadRecienteInsert;
        Update: ActividadRecienteUpdate;
      };
      automation_logs: {
        Row: RowAutomationLogs;
        Insert: AutomationLogsInsert;
        Update: AutomationLogsUpdate;
      };
      automation_rules: {
        Row: RowAutomationRules;
        Insert: AutomationRulesInsert;
        Update: AutomationRulesUpdate;
      };
      automatizaciones: {
        Row: RowAutomatizaciones;
        Insert: AutomatizacionesInsert;
        Update: AutomatizacionesUpdate;
      };
      backups: {
        Row: RowBackups;
        Insert: BackupsInsert;
        Update: BackupsUpdate;
      };
      campanas: {
        Row: RowCampanas;
        Insert: CampanasInsert;
        Update: CampanasUpdate;
      };
      challenge_definitions: {
        Row: RowChallengeDefinitions;
        Insert: ChallengeDefinitionsInsert;
        Update: ChallengeDefinitionsUpdate;
      };
      challenge_history: {
        Row: RowChallengeHistory;
        Insert: ChallengeHistoryInsert;
        Update: ChallengeHistoryUpdate;
      };
      challenge_progress: {
        Row: RowChallengeProgress;
        Insert: ChallengeProgressInsert;
        Update: ChallengeProgressUpdate;
      };
      citas: {
        Row: RowCitas;
        Insert: CitasInsert;
        Update: CitasUpdate;
      };
      codigos_descuento: {
        Row: RowCodigosDescuento;
        Insert: CodigosDescuentoInsert;
        Update: CodigosDescuentoUpdate;
      };
      credit_transactions: {
        Row: RowCreditTransactions;
        Insert: CreditTransactionsInsert;
        Update: CreditTransactionsUpdate;
      };
      dashboard_charts: {
        Row: RowDashboardCharts;
        Insert: DashboardChartsInsert;
        Update: DashboardChartsUpdate;
      };
      facturas: {
        Row: RowFacturas;
        Insert: FacturasInsert;
        Update: FacturasUpdate;
      };
      instructores: {
        Row: RowInstructores;
        Insert: InstructoresInsert;
        Update: InstructoresUpdate;
      };
      integracion_credenciales: {
        Row: RowIntegracionCredenciales;
        Insert: IntegracionCredencialesInsert;
        Update: IntegracionCredencialesUpdate;
      };
      integraciones: {
        Row: RowIntegraciones;
        Insert: IntegracionesInsert;
        Update: IntegracionesUpdate;
      };
      level_definitions: {
        Row: RowLevelDefinitions;
        Insert: LevelDefinitionsInsert;
        Update: LevelDefinitionsUpdate;
      };
      member_credits: {
        Row: RowMemberCredits;
        Insert: MemberCreditsInsert;
        Update: MemberCreditsUpdate;
      };
      mensajes_equipo: {
        Row: RowMensajesEquipo;
        Insert: MensajesEquipoInsert;
        Update: MensajesEquipoUpdate;
      };
      notas_internas: {
        Row: RowNotasInternas;
        Insert: NotasInternasInsert;
        Update: NotasInternasUpdate;
      };
      notas_progreso: {
        Row: RowNotasProgreso;
        Insert: NotasProgresoInsert;
        Update: NotasProgresoUpdate;
      };
      notificaciones: {
        Row: RowNotificaciones;
        Insert: NotificacionesInsert;
        Update: NotificacionesUpdate;
      };
      planes_tarifa: {
        Row: RowPlanesTarifa;
        Insert: PlanesTarifaInsert;
        Update: PlanesTarifaUpdate;
      };
      posts_comunidad: {
        Row: RowPostsComunidad;
        Insert: PostsComunidadInsert;
        Update: PostsComunidadUpdate;
      };
      preferencias_socio: {
        Row: RowPreferenciasSocio;
        Insert: PreferenciasSocioInsert;
        Update: PreferenciasSocioUpdate;
      };
      productos_pos: {
        Row: RowProductosPos;
        Insert: ProductosPosInsert;
        Update: ProductosPosUpdate;
      };
      recibos: {
        Row: RowRecibos;
        Insert: RecibosInsert;
        Update: RecibosUpdate;
      };
      reward_actions: {
        Row: RowRewardActions;
        Insert: RewardActionsInsert;
        Update: RewardActionsUpdate;
      };
      reward_catalog: {
        Row: RowRewardCatalog;
        Insert: RewardCatalogInsert;
        Update: RewardCatalogUpdate;
      };
      reward_history: {
        Row: RowRewardHistory;
        Insert: RewardHistoryInsert;
        Update: RewardHistoryUpdate;
      };
      reward_redemptions: {
        Row: RowRewardRedemptions;
        Insert: RewardRedemptionsInsert;
        Update: RewardRedemptionsUpdate;
      };
      reward_rules: {
        Row: RowRewardRules;
        Insert: RewardRulesInsert;
        Update: RewardRulesUpdate;
      };
      salas: {
        Row: RowSalas;
        Insert: SalasInsert;
        Update: SalasUpdate;
      };
      sesiones: {
        Row: RowSesiones;
        Insert: SesionesInsert;
        Update: SesionesUpdate;
      };
      socios: {
        Row: RowSocios;
        Insert: SociosInsert;
        Update: SociosUpdate;
      };
      soporte_solicitudes: {
        Row: RowSoporteSolicitudes;
        Insert: SoporteSolicitudesInsert;
        Update: SoporteSolicitudesUpdate;
      };
      spots: {
        Row: RowSpots;
        Insert: SpotsInsert;
        Update: SpotsUpdate;
      };
      studios: {
        Row: RowStudios;
        Insert: StudiosInsert;
        Update: StudiosUpdate;
      };
      suscripciones: {
        Row: RowSuscripciones;
        Insert: SuscripcionesInsert;
        Update: SuscripcionesUpdate;
      };
      tipos_clase: {
        Row: RowTiposClase;
        Insert: TiposClaseInsert;
        Update: TiposClaseUpdate;
      };
      usuarios: {
        Row: RowUsuarios;
        Insert: UsuariosInsert;
        Update: UsuariosUpdate;
      };
      ventas_pos: {
        Row: RowVentasPos;
        Insert: VentasPosInsert;
        Update: VentasPosUpdate;
      };
      videos_on_demand: {
        Row: RowVideosOnDemand;
        Insert: VideosOnDemandInsert;
        Update: VideosOnDemandUpdate;
      };
      decision_sessions: {
        Row: RowDecisionSessions;
        Insert: DecisionSessionsInsert;
        Update: DecisionSessionsUpdate;
      };
      recomendaciones: {
        Row: RowRecomendaciones;
        Insert: RecomendacionesInsert;
        Update: RecomendacionesUpdate;
      };
      recomendacion_outcomes: {
        Row: RowRecomendacionOutcomes;
        Insert: RecomendacionOutcomesInsert;
        Update: RecomendacionOutcomesUpdate;
      };
      memoria_socio: {
        Row: RowMemoriaSocio;
        Insert: MemoriaSocioInsert;
        Update: MemoriaSocioUpdate;
      };
      resumen_diario: {
        Row: RowResumenDiario;
        Insert: ResumenDiarioInsert;
        Update: ResumenDiarioUpdate;
      };
      decision_feature_flags: {
        Row: RowDecisionFeatureFlags;
        Insert: DecisionFeatureFlagsInsert;
        Update: DecisionFeatureFlagsUpdate;
      };
      condiciones_salud: {
        Row: RowCondicionesSalud;
        Insert: CondicionesSaludInsert;
        Update: CondicionesSaludUpdate;
      };
      respuestas_sesion: {
        Row: RowRespuestasSesion;
        Insert: RespuestasSesionInsert;
        Update: RespuestasSesionUpdate;
      };
      reconciliaciones_pos: {
        Row: RowReconciliacionesPos;
        Insert: ReconciliacionesPosInsert;
        Update: ReconciliacionesPosUpdate;
      };
      comentarios_comunidad: {
        Row: RowComentariosComunidad;
        Insert: ComentariosComunidadInsert;
        Update: ComentariosComunidadUpdate;
      };
      campos_personalizados: {
        Row: RowCamposPersonalizados;
        Insert: CamposPersonalizadosInsert;
        Update: CamposPersonalizadosUpdate;
      };
      plantillas_email: {
        Row: RowPlantillasEmail;
        Insert: PlantillasEmailInsert;
        Update: PlantillasEmailUpdate;
      };
      instructor_dependency_snapshots: {
        Row: RowInstructorDependencySnapshots;
        Insert: InstructorDependencySnapshotsInsert;
        Update: InstructorDependencySnapshotsUpdate;
      };
      studio_theme: {
        Row: RowStudioTheme;
        Insert: StudioThemeInsert;
        Update: StudioThemeUpdate;
      };
      studio_layout: {
        Row: RowStudioLayout;
        Insert: StudioLayoutInsert;
        Update: StudioLayoutUpdate;
      };
      post_likes: {
        Row: RowPostLikes;
        Insert: PostLikesInsert;
        Update: PostLikesUpdate;
      };
      canales_equipo: {
        Row: RowCanalesEquipo;
        Insert: CanalesEquipoInsert;
        Update: CanalesEquipoUpdate;
      };
      rate_limits: {
        Row: RowRateLimits;
        Insert: RateLimitsInsert;
        Update: RateLimitsUpdate;
      };
      webhook_events: {
        Row: RowWebhookEvents;
        Insert: WebhookEventsInsert;
        Update: WebhookEventsUpdate;
      };
      instructora_disponibilidad: {
        Row: RowInstructoraDisponibilidad;
        Insert: InstructoraDisponibilidadInsert;
        Update: InstructoraDisponibilidadUpdate;
      };
      instructora_disponibilidad_excepciones: {
        Row: RowInstructoraDisponibilidadExcepciones;
        Insert: InstructoraDisponibilidadExcepcionesInsert;
        Update: InstructoraDisponibilidadExcepcionesUpdate;
      };
      sustituciones: {
        Row: RowSustituciones;
        Insert: SustitucionesInsert;
        Update: SustitucionesUpdate;
      };
      sustitucion_contactos: {
        Row: RowSustitucionContactos;
        Insert: SustitucionContactosInsert;
        Update: SustitucionContactosUpdate;
      };
      valoraciones: {
        Row: RowValoraciones;
        Insert: ValoracionesInsert;
        Update: ValoracionesUpdate;
      };
      citas_servicios: {
        Row: RowCitasServicios;
        Insert: CitasServiciosInsert;
        Update: CitasServiciosUpdate;
      };
      citas_disponibilidad: {
        Row: RowCitasDisponibilidad;
        Insert: CitasDisponibilidadInsert;
        Update: CitasDisponibilidadUpdate;
      };
      decision_autonomia_config: {
        Row: RowDecisionAutonomiaConfig;
        Insert: DecisionAutonomiaConfigInsert;
        Update: DecisionAutonomiaConfigUpdate;
      };
      instructor_enlaces_vigentes: {
        Row: RowInstructorEnlacesVigentes;
        Insert: InstructorEnlacesVigentesInsert;
        Update: InstructorEnlacesVigentesUpdate;
      };
      ingresos_manuales: {
        Row: RowIngresosManuales;
        Insert: IngresosManualesInsert;
        Update: IngresosManualesUpdate;
      };
      cadenas: {
        Row: RowCadenas;
        Insert: CadenasInsert;
        Update: CadenasUpdate;
      };
      sesion_activa: {
        Row: RowSesionActiva;
        Insert: SesionActivaInsert;
        Update: SesionActivaUpdate;
      };
      avisos_hueco: {
        Row: RowAvisosHueco;
        Insert: AvisosHuecoInsert;
        Update: AvisosHuecoUpdate;
      };
      congelaciones: {
        Row: RowCongelaciones;
        Insert: CongelacionesInsert;
        Update: CongelacionesUpdate;
      };
      migracion_batches: {
        Row: RowMigracionBatches;
        Insert: MigracionBatchesInsert;
        Update: MigracionBatchesUpdate;
      };
      bloqueos_maquina: {
        Row: RowBloqueosMaquina;
        Insert: BloqueosMaquinaInsert;
        Update: BloqueosMaquinaUpdate;
      };
      plazas_fijas: {
        Row: RowPlazasFijas;
        Insert: PlazasFijasInsert;
        Update: PlazasFijasUpdate;
      };
      recuperaciones: {
        Row: RowRecuperaciones;
        Insert: RecuperacionesInsert;
        Update: RecuperacionesUpdate;
      };
      socio_excepciones: {
        Row: RowSocioExcepciones;
        Insert: SocioExcepcionesInsert;
        Update: SocioExcepcionesUpdate;
      };
      mandatos_sepa: {
        Row: RowMandatosSepa;
        Insert: MandatosSepaInsert;
        Update: MandatosSepaUpdate;
      };
      notification: {
        Row: RowNotification;
        Insert: NotificationInsert;
        Update: NotificationUpdate;
      };
      notification_delivery: {
        Row: RowNotificationDelivery;
        Insert: NotificationDeliveryInsert;
        Update: NotificationDeliveryUpdate;
      };
      notification_preference: {
        Row: RowNotificationPreference;
        Insert: NotificationPreferenceInsert;
        Update: NotificationPreferenceUpdate;
      };
      push_subscription: {
        Row: RowPushSubscription;
        Insert: PushSubscriptionInsert;
        Update: PushSubscriptionUpdate;
      };
      notification_template: {
        Row: RowNotificationTemplate;
        Insert: NotificationTemplateInsert;
        Update: NotificationTemplateUpdate;
      };
      instructora_ausencias: {
        Row: RowInstructoraAusencias;
        Insert: InstructoraAusenciasInsert;
        Update: InstructoraAusenciasUpdate;
      };
      plan_tipos_clase: {
        Row: RowPlanTiposClase;
        Insert: PlanTiposClaseInsert;
        Update: PlanTiposClaseUpdate;
      };
      studio_slugs_antiguos: {
        Row: RowStudioSlugsAntiguos;
        Insert: StudioSlugsAntiguosInsert;
        Update: StudioSlugsAntiguosUpdate;
      };
      plataforma_lead: {
        Row: RowPlataformaLead;
        Insert: PlataformaLeadInsert;
        Update: PlataformaLeadUpdate;
      };
      lecturas_ficha_salud: {
        Row: RowLecturasFichaSalud;
        Insert: LecturasFichaSaludInsert;
        Update: LecturasFichaSaludUpdate;
      };
      plataforma_admin: {
        Row: RowPlataformaAdmin;
        Insert: PlataformaAdminInsert;
        Update: PlataformaAdminUpdate;
      };
      plataforma_permiso: {
        Row: RowPlataformaPermiso;
        Insert: PlataformaPermisoInsert;
        Update: PlataformaPermisoUpdate;
      };
      plataforma_auditoria: {
        Row: RowPlataformaAuditoria;
        Insert: PlataformaAuditoriaInsert;
        Update: PlataformaAuditoriaUpdate;
      };
      penalizaciones: {
        Row: RowPenalizaciones;
        Insert: PenalizacionesInsert;
        Update: PenalizacionesUpdate;
      };
      instructor_tarifas: {
        Row: RowInstructorTarifas;
        Insert: InstructorTarifasInsert;
        Update: InstructorTarifasUpdate;
      };
      favoritos_clase: {
        Row: RowFavoritosClase;
        Insert: FavoritosClaseInsert;
        Update: FavoritosClaseUpdate;
      };
      contenido_portal: {
        Row: RowContenidoPortal;
        Insert: ContenidoPortalInsert;
        Update: ContenidoPortalUpdate;
      };
      contenido_portal_banners: {
        Row: RowContenidoPortalBanners;
        Insert: ContenidoPortalBannersInsert;
        Update: ContenidoPortalBannersUpdate;
      };
      decision_mensajes_dia: {
        Row: RowDecisionMensajesDia;
        Insert: DecisionMensajesDiaInsert;
        Update: DecisionMensajesDiaUpdate;
      };
      comunicaciones_socio: {
        Row: RowComunicacionesSocio;
        Insert: ComunicacionesSocioInsert;
        Update: ComunicacionesSocioUpdate;
      };
      changelog_versiones: {
        Row: RowChangelogVersiones;
        Insert: ChangelogVersionesInsert;
        Update: ChangelogVersionesUpdate;
      };
      changelog_cambios: {
        Row: RowChangelogCambios;
        Insert: ChangelogCambiosInsert;
        Update: ChangelogCambiosUpdate;
      };
      intentos_reserva_fallidos: {
        Row: RowIntentosReservaFallidos;
        Insert: IntentosReservaFallidosInsert;
        Update: IntentosReservaFallidosUpdate;
      };
      liquidaciones_instructoras: {
        Row: RowLiquidacionesInstructoras;
        Insert: LiquidacionesInstructorasInsert;
        Update: LiquidacionesInstructorasUpdate;
      };
      reto_participaciones: {
        Row: RowRetoParticipaciones;
        Insert: RetoParticipacionesInsert;
        Update: RetoParticipacionesUpdate;
      };
      studio_horario: {
        Row: RowStudioHorario;
        Insert: StudioHorarioInsert;
        Update: StudioHorarioUpdate;
      };
      instructor_bajas_seguimiento: {
        Row: RowInstructorBajasSeguimiento;
        Insert: InstructorBajasSeguimientoInsert;
        Update: InstructorBajasSeguimientoUpdate;
      };
      devoluciones: {
        Row: RowDevoluciones;
        Insert: DevolucionesInsert;
        Update: DevolucionesUpdate;
      };
      cadena_tipos_clase: {
        Row: RowCadenaTiposClase;
        Insert: CadenaTiposClaseInsert;
        Update: CadenaTiposClaseUpdate;
      };
      pagos_historicos: {
        Row: RowPagosHistoricos;
        Insert: PagosHistoricosInsert;
        Update: PagosHistoricosUpdate;
      };
      resumen_semanal_envios: {
        Row: RowResumenSemanalEnvios;
        Insert: ResumenSemanalEnviosInsert;
        Update: ResumenSemanalEnviosUpdate;
      };
      plantillas_cuestionario_salud: {
        Row: RowPlantillasCuestionarioSalud;
        Insert: PlantillasCuestionarioSaludInsert;
        Update: PlantillasCuestionarioSaludUpdate;
      };
      respuestas_cuestionario_salud: {
        Row: RowRespuestasCuestionarioSalud;
        Insert: RespuestasCuestionarioSaludInsert;
        Update: RespuestasCuestionarioSaludUpdate;
      };
      red_perfiles: {
        Row: RowRedPerfiles;
        Insert: RedPerfilesInsert;
        Update: RedPerfilesUpdate;
      };
      red_experiencias: {
        Row: RowRedExperiencias;
        Insert: RedExperienciasInsert;
        Update: RedExperienciasUpdate;
      };
      red_verificaciones_experiencia: {
        Row: RowRedVerificacionesExperiencia;
        Insert: RedVerificacionesExperienciaInsert;
        Update: RedVerificacionesExperienciaUpdate;
      };
      red_referencias: {
        Row: RowRedReferencias;
        Insert: RedReferenciasInsert;
        Update: RedReferenciasUpdate;
      };
      red_solicitudes_contacto: {
        Row: RowRedSolicitudesContacto;
        Insert: RedSolicitudesContactoInsert;
        Update: RedSolicitudesContactoUpdate;
      };
      red_reportes: {
        Row: RowRedReportes;
        Insert: RedReportesInsert;
        Update: RedReportesUpdate;
      };
      red_favoritos: {
        Row: RowRedFavoritos;
        Insert: RedFavoritosInsert;
        Update: RedFavoritosUpdate;
      };
      red_resenas: {
        Row: RowRedResenas;
        Insert: RedResenasInsert;
        Update: RedResenasUpdate;
      };
      red_mensajes: {
        Row: RowRedMensajes;
        Insert: RedMensajesInsert;
        Update: RedMensajesUpdate;
      };
      red_perfiles_identidad: {
        Row: RowRedPerfilesIdentidad;
        Insert: RedPerfilesIdentidadInsert;
        Update: RedPerfilesIdentidadUpdate;
      };
      red_verificaciones_identidad: {
        Row: RowRedVerificacionesIdentidad;
        Insert: RedVerificacionesIdentidadInsert;
        Update: RedVerificacionesIdentidadUpdate;
      };
      red_certificaciones: {
        Row: RowRedCertificaciones;
        Insert: RedCertificacionesInsert;
        Update: RedCertificacionesUpdate;
      };
      theme_imports: {
        Row: RowThemeImports;
        Insert: ThemeImportsInsert;
        Update: ThemeImportsUpdate;
      };
      oauth_clientes: {
        Row: RowOauthClientes;
        Insert: OauthClientesInsert;
        Update: OauthClientesUpdate;
      };
      oauth_consentimientos: {
        Row: RowOauthConsentimientos;
        Insert: OauthConsentimientosInsert;
        Update: OauthConsentimientosUpdate;
      };
      oauth_codigos_autorizacion: {
        Row: RowOauthCodigosAutorizacion;
        Insert: OauthCodigosAutorizacionInsert;
        Update: OauthCodigosAutorizacionUpdate;
      };
      oauth_tokens: {
        Row: RowOauthTokens;
        Insert: OauthTokensInsert;
        Update: OauthTokensUpdate;
      };
      oauth_auditoria_accesos: {
        Row: RowOauthAuditoriaAccesos;
        Insert: OauthAuditoriaAccesosInsert;
        Update: OauthAuditoriaAccesosUpdate;
      };
      widget_eventos: {
        Row: RowWidgetEventos;
        Insert: WidgetEventosInsert;
        Update: WidgetEventosUpdate;
      };
      tareas: {
        Row: RowTareas;
        Insert: TareasInsert;
        Update: TareasUpdate;
      };
      red_formalizaciones: {
        Row: RowRedFormalizaciones;
        Insert: RedFormalizacionesInsert;
        Update: RedFormalizacionesUpdate;
      };
      red_vacantes: {
        Row: RowRedVacantes;
        Insert: RedVacantesInsert;
        Update: RedVacantesUpdate;
      };
      red_candidaturas: {
        Row: RowRedCandidaturas;
        Insert: RedCandidaturasInsert;
        Update: RedCandidaturasUpdate;
      };
      recordatorio_envios: {
        Row: RowRecordatorioEnvios;
        Insert: RecordatorioEnviosInsert;
        Update: RecordatorioEnviosUpdate;
      };
      segmentos_clientes: {
        Row: RowSegmentosClientes;
        Insert: SegmentosClientesInsert;
        Update: SegmentosClientesUpdate;
      };
      mensajes_entrantes_medicion: {
        Row: RowMensajesEntrantesMedicion;
        Insert: MensajesEntrantesMedicionInsert;
        Update: MensajesEntrantesMedicionUpdate;
      };
      codigos_descuento_consumos: {
        Row: RowCodigosDescuentoConsumos;
        Insert: CodigosDescuentoConsumosInsert;
        Update: CodigosDescuentoConsumosUpdate;
      };
      review_boost_feedback: {
        Row: RowReviewBoostFeedback;
        Insert: ReviewBoostFeedbackInsert;
        Update: ReviewBoostFeedbackUpdate;
      };
      review_boost_recompensas: {
        Row: RowReviewBoostRecompensas;
        Insert: ReviewBoostRecompensasInsert;
        Update: ReviewBoostRecompensasUpdate;
      };
      menu_novedades: {
        Row: RowMenuNovedades;
        Insert: MenuNovedadesInsert;
        Update: MenuNovedadesUpdate;
      };
      red_perfiles_alumna: {
        Row: RowRedPerfilesAlumna;
        Insert: RedPerfilesAlumnaInsert;
        Update: RedPerfilesAlumnaUpdate;
      };
      red_perfil_media: {
        Row: RowRedPerfilMedia;
        Insert: RedPerfilMediaInsert;
        Update: RedPerfilMediaUpdate;
      };
      red_favoritos_alumna: {
        Row: RowRedFavoritosAlumna;
        Insert: RedFavoritosAlumnaInsert;
        Update: RedFavoritosAlumnaUpdate;
      };
      conversaciones: {
        Row: RowConversaciones;
        Insert: ConversacionesInsert;
        Update: ConversacionesUpdate;
      };
      conversacion_participantes: {
        Row: RowConversacionParticipantes;
        Insert: ConversacionParticipantesInsert;
        Update: ConversacionParticipantesUpdate;
      };
      mensajes: {
        Row: RowMensajes;
        Insert: MensajesInsert;
        Update: MensajesUpdate;
      };
      documentos_socio: {
        Row: RowDocumentosSocio;
        Insert: DocumentosSocioInsert;
        Update: DocumentosSocioUpdate;
      };
      post_evento_asistentes: {
        Row: RowPostEventoAsistentes;
        Insert: PostEventoAsistentesInsert;
        Update: PostEventoAsistentesUpdate;
      };
      socio_companeras: {
        Row: RowSocioCompaneras;
        Insert: SocioCompanerasInsert;
        Update: SocioCompanerasUpdate;
      };
      novedades_estudio: {
        Row: RowNovedadesEstudio;
        Insert: NovedadesEstudioInsert;
        Update: NovedadesEstudioUpdate;
      };
      webhook_reembolsos: {
        Row: RowWebhookReembolsos;
        Insert: WebhookReembolsosInsert;
        Update: WebhookReembolsosUpdate;
      };
      webhook_disputas: {
        Row: RowWebhookDisputas;
        Insert: WebhookDisputasInsert;
        Update: WebhookDisputasUpdate;
      };
      ayuda_feedback: {
        Row: RowAyudaFeedback;
        Insert: AyudaFeedbackInsert;
        Update: AyudaFeedbackUpdate;
      };
      plataforma_prospeccion_email: {
        Row: RowPlataformaProspeccionEmail;
        Insert: PlataformaProspeccionEmailInsert;
        Update: PlataformaProspeccionEmailUpdate;
      };
      decision_snapshots: {
        Row: RowDecisionSnapshots;
        Insert: DecisionSnapshotsInsert;
        Update: DecisionSnapshotsUpdate;
      };
      socio_tipos_clase_autorizados: {
        Row: RowSocioTiposClaseAutorizados;
        Insert: SocioTiposClaseAutorizadosInsert;
        Update: SocioTiposClaseAutorizadosUpdate;
      };
      cierres_estudio: {
        Row: RowCierresEstudio;
        Insert: CierresEstudioInsert;
        Update: CierresEstudioUpdate;
      };
      cajas: {
        Row: RowCajas;
        Insert: CajasInsert;
        Update: CajasUpdate;
      };
      movimientos_caja: {
        Row: RowMovimientosCaja;
        Insert: MovimientosCajaInsert;
        Update: MovimientosCajaUpdate;
      };
      ventas_pos_lineas: {
        Row: RowVentasPosLineas;
        Insert: VentasPosLineasInsert;
        Update: VentasPosLineasUpdate;
      };
      movimientos_stock: {
        Row: RowMovimientosStock;
        Insert: MovimientosStockInsert;
        Update: MovimientosStockUpdate;
      };
      terminos_versiones: {
        Row: RowTerminosVersiones;
        Insert: TerminosVersionesInsert;
        Update: TerminosVersionesUpdate;
      };
      valoraciones_iniciales: {
        Row: RowValoracionesIniciales;
        Insert: ValoracionesInicialesInsert;
        Update: ValoracionesInicialesUpdate;
      };
      valoraciones_iniciales_salud: {
        Row: RowValoracionesInicialesSalud;
        Insert: ValoracionesInicialesSaludInsert;
        Update: ValoracionesInicialesSaludUpdate;
      };
      verifactu_transmision_lock: {
        Row: RowVerifactuTransmisionLock;
        Insert: VerifactuTransmisionLockInsert;
        Update: VerifactuTransmisionLockUpdate;
      };
      email_rebotes: {
        Row: RowEmailRebotes;
        Insert: EmailRebotesInsert;
        Update: EmailRebotesUpdate;
      };
      matricula_cupo_liberaciones: {
        Row: RowMatriculaCupoLiberaciones;
        Insert: MatriculaCupoLiberacionesInsert;
        Update: MatriculaCupoLiberacionesUpdate;
      };
      supresiones: {
        Row: RowSupresiones;
        Insert: SupresionesInsert;
        Update: SupresionesUpdate;
      };
      solicitudes_derechos: {
        Row: RowSolicitudesDerechos;
        Insert: SolicitudesDerechosInsert;
        Update: SolicitudesDerechosUpdate;
      };
      consentimientos_salud_eventos: {
        Row: RowConsentimientosSaludEventos;
        Insert: ConsentimientosSaludEventosInsert;
        Update: ConsentimientosSaludEventosUpdate;
      };
      ciclo_estudios_vencidos: {
        Row: RowCicloEstudiosVencidos;
        Insert: CicloEstudiosVencidosInsert;
        Update: CicloEstudiosVencidosUpdate;
      };
      kiosko_tokens: {
        Row: RowKioskoTokens;
        Insert: KioskoTokensInsert;
        Update: KioskoTokensUpdate;
      };
      aceptaciones_contrato_eventos: {
        Row: RowAceptacionesContratoEventos;
        Insert: AceptacionesContratoEventosInsert;
        Update: AceptacionesContratoEventosUpdate;
      };
      bajas_instructora: {
        Row: RowBajasInstructora;
        Insert: BajasInstructoraInsert;
        Update: BajasInstructoraUpdate;
      };
      series: {
        Row: RowSeries;
        Insert: SeriesInsert;
        Update: SeriesUpdate;
      };
      series_periodos: {
        Row: RowSeriesPeriodos;
        Insert: SeriesPeriodosInsert;
        Update: SeriesPeriodosUpdate;
      };
      cierres_prorrogas: {
        Row: RowCierresProrrogas;
        Insert: CierresProrrogasInsert;
        Update: CierresProrrogasUpdate;
      };
      solicitudes_plaza_fija: {
        Row: RowSolicitudesPlazaFija;
        Insert: SolicitudesPlazaFijaInsert;
        Update: SolicitudesPlazaFijaUpdate;
      };
      sales_leads: {
        Row: RowSalesLeads;
        Insert: SalesLeadsInsert;
        Update: SalesLeadsUpdate;
      };
      sales_campaigns: {
        Row: RowSalesCampaigns;
        Insert: SalesCampaignsInsert;
        Update: SalesCampaignsUpdate;
      };
      sales_campaign_steps: {
        Row: RowSalesCampaignSteps;
        Insert: SalesCampaignStepsInsert;
        Update: SalesCampaignStepsUpdate;
      };
      sales_messages: {
        Row: RowSalesMessages;
        Insert: SalesMessagesInsert;
        Update: SalesMessagesUpdate;
      };
      sales_suppressions: {
        Row: RowSalesSuppressions;
        Insert: SalesSuppressionsInsert;
        Update: SalesSuppressionsUpdate;
      };
      sales_tasks: {
        Row: RowSalesTasks;
        Insert: SalesTasksInsert;
        Update: SalesTasksUpdate;
      };
      sales_events: {
        Row: RowSalesEvents;
        Insert: SalesEventsInsert;
        Update: SalesEventsUpdate;
      };
      cobros_intentos: {
        Row: RowCobrosIntentos;
        Insert: CobrosIntentosInsert;
        Update: CobrosIntentosUpdate;
      };
      dobles_cobros_detectados: {
        Row: RowDoblesCobrosDetectados;
        Insert: DoblesCobrosDetectadosInsert;
        Update: DoblesCobrosDetectadosUpdate;
      };
      opening_progreso: {
        Row: RowOpeningProgreso;
        Insert: OpeningProgresoInsert;
        Update: OpeningProgresoUpdate;
      };
      opening_config: {
        Row: RowOpeningConfig;
        Insert: OpeningConfigInsert;
        Update: OpeningConfigUpdate;
      };
      launch_stages: {
        Row: RowLaunchStages;
        Insert: LaunchStagesInsert;
        Update: LaunchStagesUpdate;
      };
      alertas_opening: {
        Row: RowAlertasOpening;
        Insert: AlertasOpeningInsert;
        Update: AlertasOpeningUpdate;
      };
      instructor_work_sessions: {
        Row: RowInstructorWorkSessions;
        Insert: InstructorWorkSessionsInsert;
        Update: InstructorWorkSessionsUpdate;
      };
      work_session_audits: {
        Row: RowWorkSessionAudits;
        Insert: WorkSessionAuditsInsert;
        Update: WorkSessionAuditsUpdate;
      };
      studio_config_tiempo: {
        Row: RowStudioConfigTiempo;
        Insert: StudioConfigTiempoInsert;
        Update: StudioConfigTiempoUpdate;
      };
      launch_stage_plazas: {
        Row: RowLaunchStagePlazas;
        Insert: LaunchStagePlazasInsert;
        Update: LaunchStagePlazasUpdate;
      };
      clases_impartidas: {
        Row: RowClasesImpartidas;
        Insert: ClasesImpartidasInsert;
        Update: ClasesImpartidasUpdate;
      };
      clases_impartidas_auditoria: {
        Row: RowClasesImpartidasAuditoria;
        Insert: ClasesImpartidasAuditoriaInsert;
        Update: ClasesImpartidasAuditoriaUpdate;
      };
    };
  };
};