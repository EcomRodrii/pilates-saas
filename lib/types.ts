// ─── Core types ──────────────────────────────────────────────────────────────

export type Rol = 'PROPIETARIO' | 'INSTRUCTOR' | 'RECEPCION';
export type EstadoSuscripcion = 'ACTIVA' | 'PAUSADA' | 'CANCELADA' | 'EXPIRADA';
export type TipoPlan = 'MENSUAL' | 'BONO' | 'PUNTUAL';
export type EstadoRecibo = 'PENDIENTE' | 'COBRADO' | 'DEVUELTO' | 'EN_CURSO';
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
  plan: 'BASE' | 'ESTUDIO' | 'CADENA';
  avatarAdmin: string | null;
  ownerAuthUserId: string | null;
  slug: string | null;
  creadoEn: string;
  stripeAccountId: string | null;
}

// ─── Integraciones por negocio ───────────────────────────────────────────────
export type TipoIntegracion = 'STRIPE' | 'RESEND' | 'GOOGLE_CALENDAR' | 'WHATSAPP' | 'EXCEL';

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
}

export interface NotaInterna {
  id: string;
  studioId: string;
  socioId: string;
  texto: string;
  tipo: 'NOTA' | 'SISTEMA';
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
  socioId: string;
  suscripcionId: string | null;
  concepto: string;
  importe: number;
  estado: EstadoRecibo;
  fechaVencimiento: string;
  fechaCobro: string | null;
  fechaDevolucion: string | null;
  intentosReintento: number;
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
  creadoEn: string;
}

export type CategoriaPOS = 'SESION' | 'PACK' | 'PRODUCTO' | 'OTRO';
export type MetodoPago = 'EFECTIVO' | 'TARJETA' | 'BIZUM' | 'TRANSFERENCIA';

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
  | 'CITA_RECORDATORIO';

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
}

// ─── Motor de automatización avanzado ────────────────────────────────────────

export type TriggerRule =
  | 'AUSENCIA_DIAS'
  | 'PAGO_PENDIENTE_DIAS'
  | 'BONO_SESIONES_BAJAS'
  | 'SUSCRIPCION_EXPIRA_DIAS'
  | 'NUEVA_SOCIA'
  | 'CLASE_MANANA'
  | 'RENOVACION_COBRADA';

export type AccionAutomatica =
  | 'ENVIAR_EMAIL'
  | 'ENVIAR_WHATSAPP'
  | 'COBRAR_RECIBO'
  | 'CREAR_NOTA'
  | 'NOTIFICAR_ADMIN'
  | 'OFRECER_CLASE_GRATIS'
  | 'PROPONER_PLAN'
  | 'ENVIAR_EJERCICIOS';

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
  ruleId: string;
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
  | 'MENSAJE_ENVIADO';

export interface ActividadReciente {
  id: string;
  studioId: string;
  tipo: TipoActividad;
  texto: string;
  socioId: string | null;
  enlace: string | null;
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
