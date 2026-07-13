// Contratos de dominio del Decision OS (DECISION-OS-ARQUITECTURA.md §3,
// enmendado por DECISION-OS-MODELO-DATOS.md §2). Núcleo puro: cero imports de
// valor, solo `import type` — se borran al ejecutar (--experimental-strip-types)
// y no rompen la resolución de módulos de Node, que no entiende el alias "@/".
import type {
  Socio, Reserva, Sesion, Sala, Recibo, Suscripcion, PlanTarifa, TipoClase,
  Instructor, Campana, AutomationLog,
} from '@/lib/types';

export type EspecialistaId = 'RETENCION' | 'INGRESOS' | 'AGENDA' | 'CAPTACION' | 'MARKETING' | 'FINANZAS' | 'EQUIPO';

// Catálogo único de tipos de recomendación — todo tipo nuevo de cualquier fase
// se añade aquí (DECISION-OS-ARQUITECTURA.md §3).
export type TipoRecomendacion =
  // Retención (MVP)
  | 'RECUPERAR_SOCIA'
  | 'ENVIAR_REACTIVACION'
  | 'CONGELAR_MEMBRESIA'
  // Ingresos (MVP)
  | 'ABRIR_SESION'
  | 'RECUPERAR_PAGOS'
  // Fase 2+
  | 'PROPONER_RENOVACION_BONO'
  | 'REVISAR_PRECIO'
  | 'COBRAR_PENDIENTE'
  | 'MOVER_HORARIO'
  | 'FUSIONAR_SESIONES'
  | 'PREPARAR_CAMPANA'
  // Captación / Conversión (embudo de leads)
  | 'CONTACTAR_LEAD'
  | 'CONVERTIR_PRUEBA';

export type NivelAutonomia = 0 | 1 | 2 | 3;
export type NivelConfianza = 'ALTA' | 'MEDIA' | 'BAJA';
export type Prioridad = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA';
export type EstadoEspecialista = 'EXCELENTE' | 'BUENO' | 'ATENCION' | 'CRITICO';
export type Riesgo = 'PERDIDA' | 'OPORTUNIDAD';

export interface Impacto {
  valor: number;
  unidad: 'EUR_MES' | 'EUR' | 'PCT_OCUPACION';
  formula: string;
}

export interface Confianza {
  nivel: NivelConfianza;
  evidencia: string[];
  autonomiaMaxima: NivelAutonomia;
}

export type AccionDecision =
  | { tipo: 'CONTACTO_MANUAL'; canal: 'LLAMADA' | 'WHATSAPP'; textoSugerido: string }
  | { tipo: 'ENVIAR_EMAIL'; plantilla: 'REACTIVACION' | 'RECORDATORIO_PAGO' | 'RENOVACION_BONO'; descuentoPct?: number }
  | { tipo: 'COBRAR_RECIBOS'; reciboIds: string[] }
  | { tipo: 'MARCAR_GESTIONADO' };

// Lo que produce un especialista, aún sin priorizar ni redactar.
export interface Candidata {
  especialista: EspecialistaId;
  tipo: TipoRecomendacion;
  dedupeKey: string;
  tituloMotor: string;
  motivoMotor: string;
  datosUsados: Record<string, string | number | boolean>;
  riesgo: Riesgo;
  impacto?: Impacto;
  confianza: Confianza;
  accion: AccionDecision;
  socioId?: string;
  sesionId?: string;
  reciboId?: string;
  tiempoEstimadoMin: number;
  expiraEnDias: number;
  urgencia: number; // 0..1
  esfuerzo: number; // 0..1
}

export type EstadoRecomendacion = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'EXPIRADA' | 'EJECUTADA' | 'FALLIDA';

// Recomendación persistida (fila de `recomendaciones`) — DECISION-OS-MODELO-DATOS.md §2.1.
export interface Recomendacion {
  id: string;
  studioId: string;
  decisionSessionId: string;
  algorithmVersion: string;
  especialista: EspecialistaId;
  tipo: TipoRecomendacion;
  dedupeKey: string;
  titulo: string;
  motivo: string;
  datosUsados: Record<string, string | number | boolean>;
  riesgo: Riesgo;
  impacto: Impacto | null;
  confianza: Confianza;
  score: number;
  prioridad: Prioridad;
  nivelAutonomia: NivelAutonomia;
  accion: AccionDecision;
  socioId: string | null;
  sesionId: string | null;
  reciboId: string | null;
  tiempoEstimadoMin: number;
  estado: EstadoRecomendacion;
  vistaEn: string | null;
  expiraEn: string;
  creadoEn: string;
  resueltoEn: string | null;
  resueltoPor: string | null;
}

// ── Memoria ──────────────────────────────────────────────────────────────────
export type ClaveMemoria =
  | 'NO_CONTACTAR_HASTA' | 'PREFIERE_WHATSAPP' | 'PREFIERE_EMAIL' | 'PREFIERE_LLAMADA'
  | 'NUNCA_RESPONDE_EMAIL' | 'NO_OFRECER_DESCUENTOS';
export type NivelMemoria = 'CORTO' | 'MEDIO' | 'LARGO';

export interface HechoMemoria {
  id: string;
  studioId: string;
  socioId: string;
  clave: ClaveMemoria;
  valor: Record<string, string | number | boolean>;
  nivel: NivelMemoria;
  confianza: NivelConfianza;
  origen: 'REGLA' | 'FEEDBACK' | 'MANUAL';
  creadoPor: string | null;
  evidencia: string;
  activa: boolean;
  expiraEn: string | null;
}

export type MemoriaEstudio = Map<string /* socioId */, HechoMemoria[]>;

// ── Especialista ──────────────────────────────────────────────────────────────
// `m: MemoriaEstudio` permite a una regla consultar memoria para sus criterios
// de confianza (p.ej. R2 · "sin NO_OFRECER_DESCUENTOS"). El Memory Engine
// (memoria.ts) igualmente aplica veto/ajuste como pasada centralizada
// independiente después — defensa en profundidad, no redundancia inútil: cubre
// también las reglas que no consultan memoria por su cuenta.
export interface Especialista {
  id: EspecialistaId;
  pregunta: string;
  detectar(s: SnapshotEstudio, m: MemoriaEstudio, now: Date): Candidata[];
}

// ── Resumen del Director (fila de `resumen_diario`) ─────────────────────────
export interface ItemMientrasDormias {
  icono: string;
  texto: string;
  verificadoPor: string;
}

export interface ResumenDiario {
  studioId: string;
  fecha: string;
  estadoGeneral: 'EXCELENTE' | 'ATENCION' | 'ACCION_INMEDIATA';
  saludo: string;
  mientrasDormias: ItemMientrasDormias[];
  nDecisiones: number;
  tiempoEstimadoMin: number;
  impactoTotal: Impacto | null;
  generadoEn: string;
}

// ── Outcome (fila de `recomendacion_outcomes`) ──────────────────────────────
export type EventoOutcome = 'APROBADA' | 'RECHAZADA' | 'IGNORADA' | 'EJECUTADA';
export type ResultadoOutcome = 'POSITIVO' | 'NEGATIVO' | 'NEUTRO' | 'PENDIENTE';
export type SenalObservada = 'RESERVO' | 'PAGO' | 'RENOVO' | 'CANCELO' | 'SIN_RESPUESTA';

export interface Outcome {
  id: string;
  studioId: string;
  recomendacionId: string;
  evento: EventoOutcome;
  outcome: ResultadoOutcome;
  senalObservada: SenalObservada | null;
  ventanaDias: number;
  medidoEn: string | null;
}

// ── Decision Session (DECISION-OS-MODELO-DATOS.md §2.13) ───────────────────
export interface DecisionSession {
  id: string;
  studioId: string;
  disparadoPor: 'CRON' | 'MANUAL' | 'REACTIVO';
  algorithmVersion: string;
  iniciadoEn: string;
  finalizadoEn: string | null;
  snapshotStats: Record<string, number> | null;
  nCandidatasGeneradas: number;
  nCandidatasDescartadas: number;
  nRecomendacionesPersistidas: number;
  resumenDiarioId: string | null;
  errores: string[] | null;
  estado: 'EN_CURSO' | 'COMPLETADA' | 'FALLIDA';
}

// ── Feature flags (DECISION-OS-MODELO-DATOS.md §2.11) ───────────────────────
export type DecisionFlag = 'DECISIONES' | 'RETENCION' | 'INGRESOS' | 'FINANZAS' | 'AGENDA' | 'MARKETING' | 'EQUIPO';
export interface DecisionFeatureFlag {
  id: string;
  studioId: string;
  flag: DecisionFlag;
  activo: boolean;
  activadoEn: string | null;
  activadoPor: string | null;
}

// ── Snapshot del estudio (adaptador de lectura, ventanas acotadas) ─────────
export interface SnapshotEstudio {
  studioId: string;
  socios: Socio[];
  reservas: Reserva[];          // ventana 180d
  sesiones: Sesion[];           // ±90d
  salas: Sala[];
  recibos: Recibo[];            // 180d
  suscripciones: Suscripcion[];
  planesTarifa: PlanTarifa[];
  tiposClase: TipoClase[];
  instructores: Instructor[];
  automationLogs: AutomationLog[]; // 90d
  campanas: Campana[];
}
