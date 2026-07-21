// ─── Core types ──────────────────────────────────────────────────────────────

export type Rol = 'PROPIETARIO' | 'INSTRUCTOR' | 'RECEPCION';
export type EstadoSuscripcion = 'ACTIVA' | 'PAUSADA' | 'CANCELADA' | 'EXPIRADA';
export type TipoPlan = 'MENSUAL' | 'BONO' | 'PUNTUAL';
// FALLIDO (0041): estado terminal tras agotar los reintentos de dunning (+1/+3/+7).
export type EstadoRecibo = 'PENDIENTE' | 'COBRADO' | 'DEVUELTO' | 'EN_CURSO' | 'FALLIDO';
// Pagos España (0036): método recurrente preferido de la socia y método real de cada cobro.
export type MetodoPagoPreferido = 'TARJETA' | 'SEPA';
export type MetodoCobro = 'TARJETA' | 'SEPA' | 'BIZUM';
export type EstadoReserva = 'CONFIRMADA' | 'LISTA_ESPERA' | 'ASISTIDA' | 'CANCELADA' | 'NO_ASISTIO';
export type NivelClase = 'TODOS' | 'PRINCIPIANTE' | 'MEDIO' | 'AVANZADO';
export type TipoSpot = 'REFORMER' | 'MAT' | 'OTRO';

export interface Studio {
  id: string;
  nombre: string;
  nif: string;
  razonSocial: string;
  direccion: string;
  ciudad: string;
  codigoPostal: string;
  email: string;
  telefono: string;
  colorPrimario: string;
  temaPortal: string;
  logoUrl: string | null;
  // Tipo de IVA general del estudio (%). El precio del recibo es IVA incluido;
  // este tipo solo cambia el desglose base/cuota de la factura, no el total.
  ivaPorDefecto: number;
  // Umbrales de "riesgo de concentración por instructor" (% de facturación) y
  // ventana de análisis en días. Configurables por el estudio.
  depUmbralAlto: number;
  depUmbralMedio: number;
  depVentanaDias: number;
  plan: 'BASE' | 'ESTUDIO' | 'CADENA';
  avatarAdmin: string | null;
  ownerAuthUserId: string | null;
  slug: string | null;
  creadoEn: string;
  stripeAccountId: string | null;
  googleCalendarEmail: string | null;
  gmailEmail: string | null;
  // Suscripción de la plataforma (Stripe Billing — el SaaS cobra al estudio).
  stripeCustomerId: string | null;
  subscriptionId: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  // Política de reservas y cancelaciones (auditoría C-2/C-4).
  cancelacionVentanaHoras: number;
  cancelacionDevolverBonoTardia: boolean;
  reservaExigirPlan: boolean;
  reservaMaxSimultaneas: number | null;
  // Stripe Terminal (datáfono físico) emparejado con el estudio.
  stripeTerminalReaderId: string | null;
  stripeTerminalLocationId: string | null;
  // Checklist de "Primeros pasos": cuándo se descartó (null = sigue siendo
  // relevante). Vive en el estudio, no en localStorage, para que lo vea igual
  // toda persona que trabaje ahí, en cualquier dispositivo.
  onboardingDescartadoEn: string | null;
}

// ─── Integraciones por negocio ───────────────────────────────────────────────
export type TipoIntegracion =
  | 'STRIPE' | 'RESEND' | 'GOOGLE_CALENDAR' | 'GMAIL' | 'WHATSAPP' | 'EXCEL'
  | 'ZOOM' | 'KISI' | 'MAILCHIMP';

export interface Integracion {
  id: string;
  studioId: string;
  tipo: TipoIntegracion;
  activo: boolean;
  config: Record<string, string>;
  actualizadoEn: string;
}

export interface Usuario {
  id: string;
  studioId: string;
  rol: Rol;
  nombre: string;
  email: string;
  telefono: string | null;
  avatarUrl: string | null;
}

export interface AceptacionContrato {
  fecha: string;
  firma: string;
  versionTexto: string;
}

export interface Socio {
  id: string;
  studioId: string;
  nombre: string;
  apellidos: string;
  email: string;
  telefono: string | null;
  nif: string | null;
  fechaAlta: string;
  activo: boolean;
  leadStage?: LeadStage;
  tags?: string[];
  aceptacionContrato?: AceptacionContrato;
  avatar?: string | null;
  stripeCustomerId?: string | null;
  stripePaymentMethodId?: string | null;
  // Pagos España (0036): método recurrente preferido + mandato SEPA domiciliado.
  metodoPagoPreferido?: MetodoPagoPreferido;
  sepaMandateId?: string | null;
  sepaPaymentMethodId?: string | null;
  fechaNacimiento?: string | null;
  direccion?: string | null;
  fotoUrl?: string | null;
  referidoPor?: string | null; // id del socio que la invitó (programa de referidos)
  // Valores de los campos personalizados del estudio: { [campoId]: valor }.
  camposExtra?: Record<string, string | number | boolean | null>;
}

// ─── Riesgo de concentración por instructor ─────────────────────────────────
export type NivelRiesgoDependencia = 'ALTO' | 'MEDIO' | 'BAJO';

export interface AlumnaCautiva {
  socioId: string;
  nombre: string;
  gasto: number;            // ingresos de esta socia en la ventana
  pctConInstructor: number; // % de sus asistencias con este instructor
}

export interface InstructorDependencySnapshot {
  id: string;
  studioId: string;
  instructorId: string;
  periodoInicio: string;
  periodoFin: string;
  ventanaDias: number;
  alumnasTotal: number;
  alumnasCautivasCount: number;
  ingresosCautivos: number;
  ingresosTotalEstudio: number;
  porcentajeFacturacion: number;
  nivelRiesgo: NivelRiesgoDependencia;
  detalle: AlumnaCautiva[];
  calculadoEn: string;
}

// ─── Plantillas de email transaccional (override por estudio) ────────────────
export type TipoPlantillaEmail = 'bienvenida' | 'reserva' | 'recordatorio' | 'cancelacion' | 'promocion';

export interface PlantillaEmail {
  id: string;
  studioId: string;
  tipo: TipoPlantillaEmail;
  asunto: string | null;
  intro: string | null;
  activa: boolean;
}

// ─── Campos personalizados de socia (definidos por el estudio) ───────────────
export type TipoCampoPersonalizado = 'texto' | 'numero' | 'fecha' | 'booleano' | 'seleccion';

export interface CampoPersonalizado {
  id: string;
  studioId: string;
  etiqueta: string;
  tipo: TipoCampoPersonalizado;
  opciones: string[]; // valores posibles cuando tipo === 'seleccion'
  requerido: boolean;
  orden: number;
  activo: boolean;
}

// ─── Preferencias del alumno (portal de miembros) ────────────────────────────

export type DiaSemana = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo';
export type FranjaHoraria = 'manana' | 'tarde' | 'noche';
export type Disponibilidad = Record<DiaSemana, Record<FranjaHoraria, boolean>>;
export type NivelSocio = 'PRINCIPIANTE' | 'INTERMEDIO' | 'AVANZADO';

export interface PreferenciasSocio {
  socioId: string;
  studioId: string;
  disponibilidad: Disponibilidad;
  instructorFavoritoId: string | null;
  tipoClaseFavorita: string | null;
  duracionPreferida: number | null;
  nivel: NivelSocio | null;
  notifEmail: boolean;
  notifWhatsapp: boolean;
  actualizadoEn: string;
}

export interface NotaInterna {
  id: string;
  studioId: string;
  socioId: string;
  texto: string;
  tipo: 'NOTA' | 'SISTEMA';
  creadoEn: string;
}

// ─── Ficha clínica operativa (FICHA-CLINICA.md) ──────────────────────────────

export type CategoriaCondicion = 'LESION' | 'EMBARAZO' | 'POSTPARTO' | 'CRONICA' | 'PROTESIS' | 'OTRO';
export type ZonaCorporal = 'RODILLA' | 'COLUMNA' | 'HOMBRO' | 'CADERA' | 'CUELLO' | 'MUNECA' | 'TOBILLO' | 'GENERAL';
export type SeveridadCondicion = 'LEVE' | 'MEDIA' | 'ALTA';
export type EstadoCondicion = 'ACTIVA' | 'RESUELTA';
export type RespuestaSesion = 'MEJOR' | 'IGUAL' | 'MOLESTIAS' | 'DOLOR';
export type NivelSemaforo = 'VERDE' | 'AMBAR' | 'ROJO';
export type NivelRiesgo = 'BAJO' | 'MEDIO' | 'ALTO';

export interface CondicionSalud {
  id: string;
  studioId: string;
  socioId: string;
  categoria: CategoriaCondicion;
  etiqueta: string;
  zona: ZonaCorporal | null;
  restricciones: string[];        // códigos del catálogo de lib/ficha-clinica.ts
  severidad: SeveridadCondicion;
  estado: EstadoCondicion;
  inicio: string;                 // ISO date (YYYY-MM-DD)
  fin: string | null;             // alta médica / resolución
  revisarEn: string | null;
  notas: string | null;
  creadoPor: string | null;       // instructor_id
  creadoEn: string;
  actualizadoEn: string;
}

export interface RespuestaSesionRow {
  id: string;
  studioId: string;
  socioId: string;
  sesionId: string | null;
  respuesta: RespuestaSesion;
  nota: string | null;
  creadoPor: string | null;
  creadoEn: string;
}

export interface PlanTarifa {
  id: string;
  studioId: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  tipo: TipoPlan;
  sesiones: number | null;
  activo: boolean;
}

export interface Suscripcion {
  id: string;
  studioId: string;
  socioId: string;
  planId: string;
  estado: EstadoSuscripcion;
  fechaInicio: string;
  fechaFin: string | null;
  sesionesRestantes: number | null;
  stripeSubscriptionId: string | null;
}

export interface Sala {
  id: string;
  studioId: string;
  nombre: string;
  capacidad: number;
  color: string;
}

export interface Spot {
  id: string;
  salaId: string;
  studioId: string;
  numero: number;
  nombre: string;
  fila: number;
  columna: number;
  tipo: TipoSpot;
  activo: boolean;
}

export interface TipoClase {
  id: string;
  studioId: string;
  nombre: string;
  color: string;
  duracionMinutos: number;
  descripcion: string | null;
  nivel: NivelClase;
  fotoUrl: string | null;
}

export interface Instructor {
  id: string;
  studioId: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  color: string;
  activo: boolean;
  avatar?: string | null;
  rol: Rol;
  authUserId: string | null;
}

export interface Sesion {
  id: string;
  studioId: string;
  tipoClaseId: string;
  salaId: string;
  instructorId: string;
  inicio: string;
  fin: string;
  aforoMaximo: number;
  cancelada: boolean;
  notas: string | null;
  precioPuntual: number | null;
  googleEventId?: string | null;
  // Serie de clases recurrentes (I-3): sesiones creadas juntas comparten id de
  // serie, para editar/cancelar "esta y las siguientes". null = clase suelta.
  serieId?: string | null;
}

export interface Reserva {
  id: string;
  studioId: string;
  sesionId: string;
  socioId: string;
  estado: EstadoReserva;
  spotId: string | null;
  posicionEspera: number | null;
  checkInEn: string | null;
  creadoEn: string;
}

export interface Recibo {
  id: string;
  studioId: string;
  socioId: string | null; // null = venta de mostrador sin socia (factura simplificada)
  suscripcionId: string | null;
  concepto: string;
  importe: number;
  estado: EstadoRecibo;
  fechaVencimiento: string;
  fechaCobro: string | null;
  fechaDevolucion: string | null;
  intentosReintento: number;
  // Pagos España (0036): método real del cobro + estado asíncrono del adeudo SEPA.
  metodoCobro?: MetodoCobro | null;
  sepaEstado?: string | null;
  // Dunning (0041): cuándo el barrido diario debe reintentar el cobro (null = sin reintento).
  proximoReintento?: string | null;
}

export interface Factura {
  id: string;
  studioId: string;
  reciboId: string;
  numeroCompleto: string;
  fechaEmision: string;
  receptorNombre: string;
  receptorNIF: string | null;
  baseImponible: number;
  tipoIVA: number;
  cuotaIVA: number;
  total: number;
  verifactuHash: string | null;
  verifactuPrevHash: string | null;
  verifactuTs: string | null;
  verifactuSeq: number | null;
}

// ─── Enriched (joined) types ──────────────────────────────────────────────────

export interface SesionEnriquecida extends Sesion {
  tipoClase: TipoClase;
  sala: Sala;
  instructor: Instructor;
  reservas: Reserva[];
  reservasConfirmadas: number;
  plazasLibres: number;
  spots: Spot[];
}

export interface ReservaEnriquecida extends Reserva {
  socio: Socio;
  spot: Spot | null;
}

// ─── New Feature Types ────────────────────────────────────────────────────────

export type LeadStage = 'LEAD' | 'INTERESADA' | 'PRUEBA' | 'ACTIVA' | 'EN_RIESGO' | 'PERDIDA';

export type EstadoCita = 'PENDIENTE' | 'CONFIRMADA' | 'COMPLETADA' | 'CANCELADA' | 'NO_ASISTIO';
export type TipoCita = 'PRIVADA' | 'EVALUACION' | 'FISIOTERAPIA' | 'ONLINE';

export interface Cita {
  id: string;
  studioId: string;
  socioId: string;
  instructorId: string;
  tipo: TipoCita;
  inicio: string;
  fin: string;
  notas: string | null;
  estado: EstadoCita;
  precio: number | null;
  pagada: boolean;
  creadoEn: string;
  servicioId?: string | null; // servicio de cita reservado (0046), si aplica
}

// Catálogo de servicios de cita 1:1 por estudio (0046). Define duración/precio y
// si la socia puede reservarlo ella misma (auto-reservable) desde la reserva pública.
export interface ServicioCita {
  id: string;
  studioId: string;
  nombre: string;
  tipo: TipoCita;
  duracionMin: number;
  precio: number | null;
  autoReservable: boolean;
  color: string | null;
  descripcion: string | null;
  activo: boolean;
  orden: number;
  creadoEn: string;
}

// Franja de horario fino por instructora (0046). Varias por día de la semana.
// diaSemana usa la convención Postgres DOW: 0=domingo..6=sábado.
export interface DisponibilidadCita {
  id: string;
  studioId: string;
  instructorId: string;
  diaSemana: number;
  horaInicio: string; // 'HH:MM'
  horaFin: string;    // 'HH:MM'
  creadoEn: string;
}

export type CategoriaPOS = 'SESION' | 'PACK' | 'PRODUCTO' | 'OTRO';
export type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'BIZUM' | 'TRANSFERENCIA' | 'DATAFONO';

export interface ProductoPOS {
  id: string;
  studioId: string;
  nombre: string;
  categoria: CategoriaPOS;
  precio: number;
  activo: boolean;
}

export interface ItemVentaPOS {
  productoId: string | null;
  nombre: string;
  precio: number;
  cantidad: number;
}

export interface VentaPOS {
  id: string;
  studioId: string;
  socioId: string | null;
  items: ItemVentaPOS[];
  subtotal: number;
  descuento: number;
  total: number;
  metodoPago: MetodoPago;
  notas: string | null;
  realizadaEn: string;
}

export type EstadoCampana = 'BORRADOR' | 'PROGRAMADA' | 'ENVIADA' | 'ACTIVA' | 'PAUSADA';
export type TipoCampana = 'EMAIL' | 'WHATSAPP' | 'SMS';
export type DestinatariosCampana = 'TODAS' | 'ACTIVAS' | 'INACTIVAS' | 'SIN_PLAN' | 'BONO' | 'VIP';

export interface Campana {
  id: string;
  studioId: string;
  nombre: string;
  tipo: TipoCampana;
  asunto: string;
  contenido: string;
  estado: EstadoCampana;
  destinatarios: DestinatariosCampana;
  enviados: number;
  abiertos: number;
  clics: number;
  creadaEn: string;
  enviadaEn: string | null;
  programadaEn: string | null;
  objetivo?: string | null;
  presupuesto?: number | null;
  // Publicaciones del módulo Contenido asociadas a la campaña (snapshot).
  publicaciones?: PublicacionAsociada[] | null;
}

export interface PublicacionAsociada {
  id: string;
  titulo: string;
  plataformas?: string[];
}

export type TriggerAutomatizacion =
  | 'SUSCRIPCION_EXPIRA_7D'
  | 'SUSCRIPCION_EXPIRA_1D'
  | 'SUSCRIPCION_CANCELADA'
  | 'CUMPLEANOS'
  | 'PRIMERA_CLASE'
  | 'INACTIVIDAD_30D'
  | 'BONO_AGOTADO'
  | 'BONO_QUEDA_1'
  | 'NUEVA_ALTA'
  | 'CITA_RECORDATORIO'
  | 'CONTENIDO_PUBLICADO';

export interface Automatizacion {
  id: string;
  studioId: string;
  nombre: string;
  trigger: TriggerAutomatizacion;
  accion: 'EMAIL' | 'WHATSAPP' | 'NOTIFICACION';
  asunto: string;
  mensaje: string;
  activa: boolean;
  ejecutadas: number;
  creadaEn: string;
  // Constructor visual de flujos (Fase 7): cadena de acciones. Si está vacío,
  // la automatización usa el modo simple (campos accion/asunto/mensaje).
  pasos?: PasoFlujo[] | null;
}

// Acciones disponibles en el constructor visual de flujos.
export type AccionFlujo = 'EMAIL' | 'TAREA' | 'PUBLICAR_RED' | 'NOTIFICAR_EQUIPO';

export interface PasoFlujo {
  id: string;
  accion: AccionFlujo;
  // Config específica por acción (claves libres):
  //  EMAIL: { asunto, mensaje }
  //  TAREA: { titulo, asignadoA }
  //  PUBLICAR_RED: { red, texto }
  //  NOTIFICAR_EQUIPO: { mensaje }
  config: Record<string, string>;
}

// ─── Motor de automatización avanzado ────────────────────────────────────────

export type TriggerRule =
  | 'AUSENCIA_DIAS'
  | 'PAGO_PENDIENTE_DIAS'
  | 'BONO_SESIONES_BAJAS'
  | 'SUSCRIPCION_EXPIRA_DIAS'
  | 'NUEVA_SOCIA'
  | 'CLASE_MANANA'
  | 'RENOVACION_COBRADA'
  | 'CLASE_LLENA_RECURRENTE';

export type AccionAutomatica =
  | 'ENVIAR_EMAIL'
  | 'ENVIAR_WHATSAPP'
  | 'COBRAR_RECIBO'
  | 'CREAR_NOTA'
  | 'NOTIFICAR_ADMIN'
  | 'OFRECER_CLASE_GRATIS'
  | 'PROPONER_PLAN'
  | 'ENVIAR_EJERCICIOS'
  | 'OFRECER_DESCUENTO';

export interface AutomationStep {
  accion: AccionAutomatica;
  parametros: Record<string, string | number | boolean>;
  esperarHoras?: number;
  condicion?: 'SIN_RESPUESTA' | 'CON_RESPUESTA' | 'SIEMPRE';
}

export interface AutomationRule {
  id: string;
  studioId: string;
  nombre: string;
  descripcion: string;
  icono: string;
  trigger: TriggerRule;
  condicion: Record<string, number | string | boolean>;
  pasos: AutomationStep[];
  activa: boolean;
  ejecutadaVeces: number;
  ultimaEjecucion: string | null;
  creadaEn: string;
}

export type ResultadoLog = 'EJECUTADO' | 'ESPERANDO' | 'FALLIDO' | 'PENDIENTE_ADMIN';

export interface AutomationLog {
  id: string;
  studioId: string;
  // S-2: el log tiene DOS orígenes posibles y va exactamente uno informado
  // (lo garantiza el CHECK de la BD, migración 0053). Antes ambos se metían en
  // `ruleId`, que además tenía FK a automation_rules: los de marketing violaban
  // esa FK y no se persistían nunca, dejando el dedup sin datos.
  ruleId: string | null;          // origen: automation_rules
  automatizacionId: string | null; // origen: automatizaciones (marketing)
  ruleName: string;
  socioId: string | null;
  socioNombre: string | null;
  pasoIndex: number;
  accion: AccionAutomatica;
  resultado: ResultadoLog;
  detalle: string;
  ejecutadoEn: string;
  proximaAccionEn: string | null;
  reciboId?: string | null;
}

export interface NotaProgreso {
  id: string;
  studioId: string;
  socioId: string;
  instructorId: string;
  sesionId: string | null;
  textoLibre: string;
  progreso: string | null;
  alertas: string | null;
  planProximaSesion: string | null;
  ejerciciosCasa: string | null;
  creadaEn: string;
}

export interface CodigoDescuento {
  id: string;
  studioId: string;
  codigo: string;
  descripcion: string;
  tipo: 'PORCENTAJE' | 'IMPORTE_FIJO';
  valor: number;
  usos: number;
  usosMax: number | null;
  expira: string | null;
  activo: boolean;
  creadoEn: string;
  minImporte?: number | null;
  soloNuevas?: boolean;
}

export type TipoActividad =
  | 'NUEVA_SOCIA'
  | 'NUEVA_RESERVA'
  | 'CANCELACION'
  | 'PAGO_COBRADO'
  | 'PAGO_PENDIENTE'
  | 'NUEVA_SUSCRIPCION'
  | 'SUSCRIPCION_PAUSADA'
  | 'CITA_CREADA'
  | 'CITA_COMPLETADA'
  | 'VENTA_POS'
  | 'MENSAJE_ENVIADO'
  | 'SOCIA_EDITADA'
  | 'SOCIA_ELIMINADA'
  | 'PLAN_CREADO'
  | 'PLAN_EDITADO'
  | 'PLAN_ELIMINADO'
  | 'PLAN_ASIGNADO'
  | 'COBRO_MANUAL'
  | 'EQUIPO_ALTA'
  | 'EQUIPO_EDITADO'
  | 'EQUIPO_BAJA'
  | 'AUTOMATIZACION_CAMBIO'
  | 'DECISION_GESTIONADA'
  | 'SESION_REASIGNADA';

export interface ActividadReciente {
  id: string;
  studioId: string;
  tipo: TipoActividad;
  texto: string;
  socioId: string | null;
  enlace: string | null;
  creadoEn: string;
  // Quién hizo la acción — para el registro de auditoría del propietario.
  actorNombre: string | null;
}

// ─── Chat de equipo (canal único compartido del negocio) ─────────────────────

export interface CanalEquipo {
  id: string;
  studioId: string;
  nombre: string;
  creadoEn: string;
}

export interface MensajeEquipo {
  id: string;
  studioId: string;
  canalId: string;
  autorInstructorId: string | null;
  autorNombre: string;
  texto: string;
  creadoEn: string;
}

export interface Notificacion {
  id: string;
  studioId: string;
  titulo: string;
  texto: string;
  leida: boolean;
  tipo: 'INFO' | 'AVISO' | 'ERROR' | 'EXITO';
  enlace: string | null;
  creadaEn: string;
}

// Buzón de soporte: dudas/mejoras/bugs que un estudio deja desde el widget
// de ayuda del dashboard, dirigidos al equipo de Tentare (no visibles para
// otros estudios).
export type TipoSoporte = 'DUDA' | 'MEJORA' | 'BUG';

export interface SoporteSolicitud {
  id: string;
  studioId: string;
  tipo: TipoSoporte;
  mensaje: string;
  contacto: string | null;
  creadoEn: string;
}

export type CategoriaVideo = 'REFORMER' | 'MAT' | 'BARRE' | 'CARDIO' | 'MEDITACION' | 'ESTIRAMIENTO';

export interface VideoOnDemand {
  id: string;
  studioId: string;
  titulo: string;
  descripcion: string | null;
  categoria: CategoriaVideo;
  duracionMinutos: number;
  nivel: NivelClase;
  instructorId: string;
  vistas: number;
  likes: number;
  activo: boolean;
  creadoEn: string;
  // UID del asset en Cloudflare Stream. null = fila antigua sin vídeo alojado
  // (se muestra el placeholder); presente = se embebe el reproductor de Stream.
  streamUid: string | null;
}

export interface PostComunidad {
  id: string;
  studioId: string;
  autorId: string | null;
  autorNombre: string;
  autorInicial: string;
  texto: string;
  likes: number;
  comentariosCount: number;
  fijado: boolean;
  creadoEn: string;
}

export interface ComentarioComunidad {
  id: string;
  studioId: string;
  postId: string;
  autorId: string | null;
  autorNombre: string;
  autorInicial: string | null;
  texto: string;
  creadoEn: string;
}

// ─── Gamificación: créditos y recompensas ─────────────────────────────────────
// El estudio configura CUÁNTO vale cada acción (RewardRule) — el motor
// (lib/engines/reward-engine.ts) nunca usa números fijos, siempre lee la regla.

export type RewardTrigger =
  | 'ASISTENCIA_CLASE'
  | 'RENOVACION_PLAN'
  | 'REFERIDO_AMIGO'
  | 'SEMANA_COMPLETA'
  | 'PRIMERA_RESERVA'
  | 'OBJETIVO_MENSUAL';

// Catálogo (fijo en código: solo la app puede "detectar" estos disparadores;
// lo configurable es cuánto vale cada uno, vía RewardRule) de qué es cada uno.
export interface RewardTriggerDef {
  trigger: RewardTrigger;
  nombre: string;
  descripcion: string;
}

export interface RewardRule {
  id: string;
  studioId: string;
  trigger: RewardTrigger;
  nombre: string;
  descripcion: string | null;
  creditos: number;
  activa: boolean;
  // Máximo de veces al mes que esta regla puede premiar (por socia que invita).
  // null = sin tope. Usado sobre todo por REFERIDO_AMIGO para acotar el fraude.
  topeMensual: number | null;
  creadoEn: string;
}

// Hecho en bruto: "este disparador ocurrió para esta socia" — existe sobre
// todo para poder comprobar idempotencia (refId) y no premiar dos veces la
// misma reserva/recibo si el evento se reintenta.
export interface RewardAction {
  id: string;
  studioId: string;
  socioId: string;
  trigger: RewardTrigger;
  refId: string | null;
  creadoEn: string;
}

// Línea de historial legible para la socia ("Wallet" → Historial).
export interface RewardHistory {
  id: string;
  studioId: string;
  socioId: string;
  ruleId: string;
  actionId: string;
  creditos: number;
  descripcion: string;
  creadoEn: string;
}

export type TipoTransaccion = 'GANANCIA' | 'CANJE';

// Libro mayor completo (ganancias + canjes) — es la fuente de verdad real
// del saldo; MemberCredits es solo una caché para no recalcular sumando.
export interface CreditTransaction {
  id: string;
  studioId: string;
  socioId: string;
  tipo: TipoTransaccion;
  creditos: number; // positivo en GANANCIA, negativo en CANJE
  descripcion: string;
  refId: string | null;
  creadoEn: string;
}

export interface MemberCredits {
  socioId: string;
  studioId: string;
  saldo: number;
  totalGanado: number;
  totalCanjeado: number;
  actualizadoEn: string;
}

export type EstadoRecompensaCanjeable = 'DISPONIBLE' | 'BLOQUEADA' | 'CANJEADA';

export interface RewardCatalogItem {
  id: string;
  studioId: string;
  nombre: string;
  descripcion: string | null;
  costeCreditos: number;
  icono: string;
  activo: boolean;
  stock: number | null; // null = ilimitado
  creadoEn: string;
}

export type EstadoCanje = 'PENDIENTE' | 'ENTREGADO' | 'CANCELADO';

export interface RewardRedemption {
  id: string;
  studioId: string;
  socioId: string;
  catalogItemId: string;
  creditosGastados: number;
  estado: EstadoCanje;
  creadoEn: string;
}

// ─── Gamificación: logros ─────────────────────────────────────────────────────
// Igual que con los créditos: el ESTUDIO decide el umbral de cada logro
// (5 clases, 10 clases...) — el motor nunca hardcodea el número.

export type AchievementMetric =
  | 'CLASES_ASISTIDAS'
  | 'RESERVAS_TOTALES'
  | 'SEMANAS_CONSECUTIVAS'
  | 'ASISTENCIA_MENSUAL_COMPLETA'
  | 'AMIGOS_INVITADOS'
  | 'ASISTENCIA_CUMPLEANOS';

export interface AchievementMetricDef {
  metric: AchievementMetric;
  nombre: string;
  descripcion: string;
  // Métricas "booleanas" (ocurre o no ocurre, ej. asistir el día de tu
  // cumpleaños) no acumulan progreso — se cumplen o no en cada evaluación.
  acumulable: boolean;
}

export interface AchievementDefinition {
  id: string;
  studioId: string;
  metric: AchievementMetric;
  nombre: string;
  descripcion: string | null;
  umbral: number;
  icono: string;
  creditosRecompensa: number;
  activo: boolean;
  creadoEn: string;
}

export interface AchievementProgress {
  id: string;
  studioId: string;
  socioId: string;
  achievementId: string;
  progresoActual: number;
  completado: boolean;
  completadoEn: string | null;
}

export interface AchievementHistory {
  id: string;
  studioId: string;
  socioId: string;
  achievementId: string;
  nombre: string;
  icono: string;
  creadoEn: string;
}

// ─── Gamificación: niveles ─────────────────────────────────────────────────
// Progresión (Bronce → Diamante, o los nombres que quiera el estudio) según
// el total histórico de créditos ganados (MemberCredits.totalGanado, no el
// saldo — así canjear recompensas nunca hace "bajar de nivel" a una socia).

export interface LevelDefinition {
  id: string;
  studioId: string;
  nombre: string;
  orden: number;
  umbralCreditos: number;
  color: string;
  icono: string;
  beneficios: string | null;
  activo: boolean;
  creadoEn: string;
}

// ─── Gamificación: retos ────────────────────────────────────────────────────
// A diferencia de un logro (permanente, sin fecha), un reto vive entre
// fechaInicio y fechaFin — reutiliza el mismo catálogo de métricas que los
// logros (AchievementMetric) pero el progreso solo cuenta lo ocurrido dentro
// de esa ventana de tiempo.

export interface ChallengeDefinition {
  id: string;
  studioId: string;
  nombre: string;
  descripcion: string | null;
  icono: string;
  metric: AchievementMetric;
  objetivo: number;
  fechaInicio: string;
  fechaFin: string;
  creditosRecompensa: number;
  activo: boolean;
  creadoEn: string;
}

export interface ChallengeProgress {
  id: string;
  studioId: string;
  socioId: string;
  challengeId: string;
  progresoActual: number;
  completado: boolean;
  completadoEn: string | null;
}

export interface ChallengeHistory {
  id: string;
  studioId: string;
  socioId: string;
  challengeId: string;
  nombre: string;
  icono: string;
  creadoEn: string;
}

export type EstadoReto = 'ACTIVO' | 'COMPLETADO' | 'CADUCADO';

// ─── Dashboard: gráficos personalizados ────────────────────────────────────
// El estudio arma su propio panel eligiendo qué métrica graficar y cómo — el
// motor (lib/engines/dashboard-chart-engine.ts) solo sabe calcular las métricas del
// catálogo fijo, todo lo demás (nombre, tipo, rango, color) es su elección.

export type TipoGraficoDashboard = 'LINEA' | 'BARRAS';
export type MetricaGraficoDashboard =
  | 'INGRESOS_COBRADOS' | 'NUEVAS_SOCIAS' | 'RESERVAS' | 'CLASES_ASISTIDAS' | 'CREDITOS_OTORGADOS';
export type AgrupacionGraficoDashboard = 'DIA' | 'SEMANA' | 'MES';

export interface DashboardChart {
  id: string;
  studioId: string;
  nombre: string;
  tipo: TipoGraficoDashboard;
  metrica: MetricaGraficoDashboard;
  agrupacion: AgrupacionGraficoDashboard;
  rango: number;
  color: string;
  creadoEn: string;
}

// ─── Copias de seguridad ────────────────────────────────────────────────────
// El contenido real (jsonb con todas las tablas) nunca llega al cliente —
// solo se lee/escribe desde rutas de servidor con la service role key (ver
// lib/engines/backup-engine.ts). El panel solo ve estos metadatos.

export type TipoBackup = 'DIARIO' | 'SEMANAL' | 'MENSUAL' | 'MANUAL';

export interface BackupMeta {
  id: string;
  studioId: string;
  tipo: TipoBackup;
  creadoEn: string;
}
