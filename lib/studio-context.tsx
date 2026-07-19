'use client';

import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  fetchAllStudioData, fetchCriticalStudioData, fetchDeferredStudioData,
  dbInsertSocio, dbUpdateSocio, dbDeleteSocio,
  dbFetchCamposPersonalizados, dbInsertCampoPersonalizado, dbUpdateCampoPersonalizado, dbDeleteCampoPersonalizado,
  dbFetchPlantillasEmail, dbUpsertPlantillaEmail,
  dbFetchDependencySnapshots,
  dbInsertPlanTarifa, dbUpdatePlanTarifa, dbDeletePlanTarifa,
  dbInsertSuscripcion, dbUpdateSuscripcion,
  dbInsertSesion, dbUpdateSesion, dbDeleteSesion, dbInsertSesionesBatch, dbUpdateSesionesBatch,
  dbInsertReserva, dbUpdateReserva, dbReservarPlaza, dbCancelarReservaPlaza,
  dbInsertRecibo, dbUpdateRecibo, dbUpdateRecibosBatch, dbDeleteRecibo,
  dbInsertCita, dbUpdateCita,
  dbInsertVentaPOS,
  dbInsertProductoPOS, dbUpdateProductoPOS, dbDeleteProductoPOS,
  dbInsertActividadReciente,
  dbMarcarNotificacionLeida, dbMarcarNotificacionesLeidas,
  dbInsertRewardRule, dbUpdateRewardRule,
  dbInsertRewardAction, dbInsertRewardHistory, dbInsertCreditTransaction, dbAjustarCreditos, dbClaimRecompensaUnica,
  dbInsertRewardCatalogItem, dbUpdateRewardCatalogItem, dbDeleteRewardCatalogItem, dbAjustarStock,
  dbConsumirSesionBono,
  dbInsertRewardRedemption, dbUpdateRewardRedemption,
  dbInsertAchievementDefinition, dbUpdateAchievementDefinition,
  dbUpsertAchievementProgress, dbInsertAchievementHistory,
  dbInsertLevelDefinition, dbUpdateLevelDefinition, dbDeleteLevelDefinition,
  dbInsertChallengeDefinition, dbUpdateChallengeDefinition, dbDeleteChallengeDefinition,
  dbUpsertChallengeProgress, dbInsertChallengeHistory,
  dbInsertNotaInterna, dbDeleteNotaInterna,
  dbInsertCondicion, dbUpdateCondicion, dbDeleteCondicion,
  dbInsertRespuestaSesion, dbUpdateRespuestaSesion,
  dbInsertCampana, dbDeleteCampana, dbUpdateCampana,
  dbInsertAutomatizacion, dbUpdateAutomatizacion, dbDeleteAutomatizacion,
  dbInsertAutomationLog, dbUpdateAutomationRule, dbInsertAutomationRule,
  dbInsertTipoClase, dbUpdateTipoClase, dbDeleteTipoClase,
  dbInsertInstructor, dbUpdateInstructor, dbDeleteInstructor, dbClaimInstructorAccount,
  dbUpdateStudio, resolveStudioId, setCurrentStudioId, getCurrentStudioId,
  setDbErrorListener, dbMisLikesComunidad,
} from '@/lib/supabase-data';
import type {
  Studio,
  Socio,
  CampoPersonalizado,
  PlantillaEmail,
  InstructorDependencySnapshot,
  AceptacionContrato,
  Suscripcion,
  Sesion,
  Reserva,
  EstadoReserva,
  Recibo,
  Factura,
  PlanTarifa,
  Sala,
  TipoClase,
  Instructor,
  Spot,
  NotaInterna,
  CondicionSalud,
  RespuestaSesionRow,
  RespuestaSesion,
  Cita,
  EstadoCita,
  ProductoPOS,
  VentaPOS,
  ItemVentaPOS,
  MetodoPago,
  Campana,
  EstadoCampana,
  TipoCampana,
  DestinatariosCampana,
  Automatizacion,
  CodigoDescuento,
  ActividadReciente,
  TipoActividad,
  PreferenciasSocio,
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
  AchievementMetric,
  RewardTrigger,
  LevelDefinition,
  ChallengeDefinition,
  ChallengeProgress,
  ChallengeHistory,
  DashboardChart,
  BackupMeta,
  Notificacion,
  VideoOnDemand,
  PostComunidad,
  AutomationRule,
  AutomationLog,
  NotaProgreso,
  ResultadoLog,
  Integracion,
  TipoIntegracion,
} from '@/lib/types';
import { enviarEmailCampana, enviarMensajeCampana, enviarEmailPromocion, enviarEmailCancelacionClase, authHeader, portalAuthHeader, cargarDatosPublicos, leerSociaLocal, sellarFactura } from '@/lib/api-client';
import { mapLimit } from '@/lib/concurrency';
import { useAuth } from '@/lib/auth-context';
import { reglaActivaPara, decidirOtorgarCreditos, aplicarGananciaCreditos, validarCanje, aplicarCanjeCreditos } from '@/lib/engines/reward-engine';
import { calcularMetrica } from '@/lib/engines/achievement-engine';
import { calcularRacha, type RachaInfo } from '@/lib/engines/streak-engine';
import { calcularNivel, type NivelInfo } from '@/lib/engines/level-engine';
import { calcularProgresoReto } from '@/lib/engines/challenge-engine';
import { uid } from '@/lib/utils';
import {
  decidirReservaNueva,
  decidirPremioReferido,
  debeDevolverBono,
} from '@/lib/booking-logic';
import { bonoConsumible, calcularDevolucionBono } from '@/lib/bono-logic';
import { useContentStore } from '@/lib/stores/use-content-store';
import { useDiscountCodesStore } from '@/lib/stores/use-discount-codes-store';
import { useIntegrationsStore } from '@/lib/stores/use-integrations-store';
import { useDashboardChartsStore } from '@/lib/stores/use-dashboard-charts-store';
import { useProgressNotesStore } from '@/lib/stores/use-progress-notes-store';
import { useMemberPrefsStore } from '@/lib/stores/use-member-prefs-store';

// ─── Studio config (policy / terms) ─────────────────────────────────────────

export interface StudioConfig {
  politicaPrivacidad: string;
  terminosServicio: string;
}

export const defaultStudioConfig: StudioConfig = {
  politicaPrivacidad: `POLÍTICA DE PRIVACIDAD

En cumplimiento del Reglamento (UE) 2016/679 del Parlamento Europeo (RGPD), le informamos que sus datos personales serán incorporados a nuestros ficheros con la finalidad de gestionar su inscripción y la prestación de los servicios contratados.

RESPONSABLE DEL TRATAMIENTO
El responsable del tratamiento de sus datos es el estudio de pilates (en adelante, "el Estudio").

FINALIDAD Y LEGITIMACIÓN
Sus datos serán tratados para la gestión de membresías, facturación y comunicaciones relacionadas con los servicios contratados. La base legal es la ejecución del contrato y el cumplimiento de obligaciones legales.

CONSERVACIÓN
Sus datos se conservarán durante la vigencia de la relación contractual y, una vez finalizada, durante los plazos legalmente establecidos.

DERECHOS
Puede ejercer sus derechos de acceso, rectificación, supresión, limitación, portabilidad y oposición enviando un escrito a la dirección del estudio.`,

  terminosServicio: `TÉRMINOS Y CONDICIONES DE SERVICIO

1. OBJETO
El presente contrato regula las condiciones de acceso y uso de los servicios de pilates ofrecidos por el Estudio.

2. PLANES Y TARIFAS
El socio abona la tarifa correspondiente al plan seleccionado. Los precios incluyen IVA. El Estudio se reserva el derecho de modificar tarifas con un preaviso mínimo de 30 días.

3. RESERVAS Y CANCELACIONES
Las reservas deben realizarse con antelación a través de los canales habilitados. Las cancelaciones efectuadas con menos de 12 horas de antelación serán descontadas del bono.

4. RESPONSABILIDAD
El socio declara estar en condiciones físicas adecuadas para la práctica de pilates. El Estudio no se responsabiliza de lesiones derivadas del incumplimiento de las indicaciones del instructor.

5. VIGENCIA
El contrato estará vigente mientras se mantenga la suscripción activa. Cualquiera de las partes podrá resolver el contrato con un preaviso de 15 días.

6. ACEPTACIÓN
La firma de este documento supone la aceptación íntegra de las presentes condiciones.`,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────


// ─── Context shape ────────────────────────────────────────────────────────────

interface StudioContextValue {
  // Static reference data
  planesTarifa: PlanTarifa[];
  salas: Sala[];
  tiposClase: TipoClase[];
  instructores: Instructor[];
  spots: Spot[];

  // Mutable state
  socios: Socio[];
  suscripciones: Suscripcion[];
  sesiones: Sesion[];
  reservas: Reserva[];
  recibos: Recibo[];
  facturas: Factura[];
  notasInternas: NotaInterna[];

  // Socios
  addSocio: (fields: Omit<Socio, 'id' | 'studioId' | 'fechaAlta'> & { planId?: string }) => void;
  addSocioFromPortal: (fields: { id: string; nombre: string; email: string; aceptacionContrato?: AceptacionContrato; referidoPor?: string | null }) => Promise<void>;
  updateSocio: (id: string, changes: Partial<Socio>) => void;
  deleteSocio: (id: string) => Promise<void>;
  addTagSocio: (socioId: string, tag: string) => void;
  removeTagSocio: (socioId: string, tag: string) => void;

  // Suscripciones
  assignPlan: (socioId: string, planId: string | null) => void;
  pausarSuscripcion: (susId: string) => void;
  reanudarSuscripcion: (susId: string) => void;

  // Notas internas
  addNota: (socioId: string, texto: string) => void;
  deleteNota: (notaId: string) => void;

  // Ficha clínica — condiciones de salud (FICHA-CLINICA.md)
  condicionesSalud: CondicionSalud[];
  addCondicion: (fields: Omit<CondicionSalud, 'id' | 'studioId' | 'creadoEn' | 'actualizadoEn'>) => void;
  updateCondicion: (id: string, changes: Partial<CondicionSalud>) => void;
  deleteCondicion: (id: string) => void;

  // Ficha clínica — evolución post-clase (Fase 2)
  respuestasSesion: RespuestaSesionRow[];
  registrarRespuestaSesion: (params: { socioId: string; sesionId: string | null; respuesta: RespuestaSesion; nota?: string | null }) => void;

  // Sesiones
  addSesion: (fields: Omit<Sesion, 'id' | 'studioId'>) => void;
  updateSesion: (id: string, changes: Partial<Sesion>) => void;
  deleteSesion: (id: string) => void;
  // Series de clases recurrentes (I-3)
  addSesionesSerie: (fields: Omit<Sesion, 'id' | 'studioId' | 'serieId'>[]) => void;
  editarSerieDesde: (sesionId: string, changes: { tipoClaseId: string; salaId: string; instructorId: string; aforoMaximo: number; notas: string | null; horaInicio: string; horaFin: string }) => void;
  cancelarSerieDesde: (sesionId: string) => void;

  // Reservas
  addReserva: (sesionId: string, socioId: string, spotId?: string | null) => EstadoReserva;
  cancelarReserva: (reservaId: string) => void;
  checkin: (reservaId: string) => void;
  deshacerCheckin: (reservaId: string) => void;
  marcarNoShow: (reservaId: string) => void;
  revertirNoShow: (reservaId: string) => void;
  liberarSpot: (reservaId: string) => void;
  asignarSpot: (sesionId: string, socioId: string, spotId: string) => void;

  // Recibos
  addRecibo: (fields: Omit<Recibo, 'id' | 'studioId' | 'estado' | 'fechaCobro' | 'fechaDevolucion' | 'intentosReintento'>) => void;
  marcarCobrado: (reciboId: string) => void;
  marcarDevuelto: (reciboId: string) => void;
  reintentar: (reciboId: string) => void;
  deleteRecibo: (id: string) => void;
  cobrarTodosPendientes: (socioId?: string) => void;

  // Citas
  citas: Cita[];
  addCita: (fields: Omit<Cita, 'id' | 'studioId' | 'creadoEn'>) => void;
  updateCita: (id: string, changes: Partial<Cita>) => void;
  cancelarCita: (citaId: string) => void;
  completarCita: (citaId: string) => void;

  // POS
  productosPOS: ProductoPOS[];
  ventasPOS: VentaPOS[];
  addProductoPOS: (fields: Omit<ProductoPOS, 'id' | 'studioId'>) => void;
  updateProductoPOS: (id: string, changes: Partial<ProductoPOS>) => void;
  deleteProductoPOS: (id: string) => void;
  addVentaPOS: (fields: Omit<VentaPOS, 'id' | 'studioId' | 'realizadaEn'>) => void;

  // Campañas
  campanas: Campana[];
  addCampana: (fields: Omit<Campana, 'id' | 'studioId' | 'creadaEn' | 'enviados' | 'abiertos' | 'clics'>) => void;
  deleteCampana: (id: string) => void;
  duplicateCampana: (campana: Campana) => void;
  updateCampana: (id: string, patch: Partial<Campana>) => void;
  enviarCampana: (campana: Campana) => Promise<{ enviados: number; total: number }>;

  // Automatizaciones
  automatizaciones: Automatizacion[];
  addAutomatizacion: (fields: Omit<Automatizacion, 'id' | 'studioId' | 'ejecutadas' | 'creadaEn'>) => void;
  updateAutomatizacion: (id: string, patch: Partial<Automatizacion>) => void;
  deleteAutomatizacion: (id: string) => void;
  toggleAutomatizacion: (autoId: string) => void;

  // Códigos de descuento
  codigosDescuento: CodigoDescuento[];
  addCodigoDescuento: (fields: Omit<CodigoDescuento, 'id' | 'studioId' | 'usos' | 'creadoEn'>) => void;
  toggleCodigoDescuento: (codigoId: string) => void;
  deleteCodigoDescuento: (id: string) => void;

  // Actividad reciente
  actividadReciente: ActividadReciente[];
  addActividadReciente: (tipo: TipoActividad, texto: string, socioId?: string, enlace?: string) => void;

  // Notificaciones
  notificaciones: Notificacion[];
  marcarNotificacionLeida: (notiId: string) => void;

  // Videos on demand
  videosOnDemand: VideoOnDemand[];
  addVideo: (fields: Omit<VideoOnDemand, 'id' | 'studioId' | 'vistas' | 'likes' | 'creadoEn'>) => void;
  toggleVideo: (videoId: string) => void;

  // Comunidad
  postsComunidad: PostComunidad[];
  likedPostIds: Set<string>;
  addPost: (texto: string) => void;
  toggleLikePost: (postId: string) => void;
  integraciones: Integracion[];
  upsertIntegracion: (tipo: TipoIntegracion, activo: boolean, config: Record<string, string>) => void;
  preferenciasSocio: PreferenciasSocio[];
  upsertPreferenciasSocio: (socioId: string, changes: Partial<Omit<PreferenciasSocio, 'socioId' | 'studioId'>>) => void;
  rewardRules: RewardRule[];
  rewardActions: RewardAction[];
  rewardHistory: RewardHistory[];
  creditTransactions: CreditTransaction[];
  memberCredits: MemberCredits[];
  rewardCatalog: RewardCatalogItem[];
  rewardRedemptions: RewardRedemption[];
  otorgarCreditos: (socioId: string, trigger: RewardTrigger, refId: string | null, descripcionOverride?: string) => void;
  saldoCreditos: (socioId: string) => number;
  rachaSocio: (socioId: string) => RachaInfo;
  addRewardRule: (fields: Omit<RewardRule, 'id' | 'studioId' | 'creadoEn' | 'topeMensual'> & { topeMensual?: number | null }) => void;
  updateRewardRule: (id: string, changes: Partial<Omit<RewardRule, 'id' | 'studioId'>>) => void;
  addRewardCatalogItem: (fields: Omit<RewardCatalogItem, 'id' | 'studioId' | 'creadoEn'>) => void;
  updateRewardCatalogItem: (id: string, changes: Partial<Omit<RewardCatalogItem, 'id' | 'studioId'>>) => void;
  deleteRewardCatalogItem: (id: string) => void;
  canjearRecompensa: (socioId: string, catalogItemId: string) => { ok: true } | { error: string };
  updateRewardRedemptionEstado: (id: string, estado: RewardRedemption['estado']) => void;
  achievementDefinitions: AchievementDefinition[];
  achievementProgress: AchievementProgress[];
  achievementHistory: AchievementHistory[];
  addAchievementDefinition: (fields: Omit<AchievementDefinition, 'id' | 'studioId' | 'creadoEn'>) => void;
  updateAchievementDefinition: (id: string, changes: Partial<Omit<AchievementDefinition, 'id' | 'studioId'>>) => void;
  evaluarLogrosSocio: (socioId: string) => void;
  levelDefinitions: LevelDefinition[];
  nivelSocio: (socioId: string) => NivelInfo;
  addLevelDefinition: (fields: Omit<LevelDefinition, 'id' | 'studioId' | 'creadoEn'>) => void;
  updateLevelDefinition: (id: string, changes: Partial<Omit<LevelDefinition, 'id' | 'studioId'>>) => void;
  deleteLevelDefinition: (id: string) => void;
  challengeDefinitions: ChallengeDefinition[];
  challengeProgress: ChallengeProgress[];
  challengeHistory: ChallengeHistory[];
  addChallengeDefinition: (fields: Omit<ChallengeDefinition, 'id' | 'studioId' | 'creadoEn'>) => void;
  updateChallengeDefinition: (id: string, changes: Partial<Omit<ChallengeDefinition, 'id' | 'studioId'>>) => void;
  deleteChallengeDefinition: (id: string) => void;
  evaluarRetosSocio: (socioId: string) => void;
  dashboardCharts: DashboardChart[];
  addDashboardChart: (fields: Omit<DashboardChart, 'id' | 'studioId' | 'creadoEn'>) => void;
  deleteDashboardChart: (id: string) => void;
  backups: BackupMeta[];
  marcarTodasLeidas: () => void;
  // Planes (mutable)
  addPlan: (fields: Omit<PlanTarifa, 'id' | 'studioId'>) => void;
  updatePlan: (id: string, changes: Partial<Omit<PlanTarifa, 'id' | 'studioId'>>) => void;
  deletePlan: (id: string) => void;

  // Salas (mutable)
  addSala: (fields: Omit<Sala, 'id' | 'studioId'>) => void;
  updateSala: (id: string, changes: Partial<Omit<Sala, 'id' | 'studioId'>>) => void;
  deleteSala: (id: string) => void;

  // Tipos de clase (mutable)
  addTipoClase: (fields: Omit<TipoClase, 'id' | 'studioId'>) => void;
  updateTipoClase: (id: string, changes: Partial<Omit<TipoClase, 'id' | 'studioId'>>) => void;
  deleteTipoClase: (id: string) => void;

  // Campos personalizados de socia
  camposPersonalizados: CampoPersonalizado[];
  addCampoPersonalizado: (fields: Omit<CampoPersonalizado, 'id' | 'studioId'>) => void;
  updateCampoPersonalizado: (id: string, changes: Partial<Omit<CampoPersonalizado, 'id' | 'studioId'>>) => void;
  deleteCampoPersonalizado: (id: string) => void;

  // Plantillas de email transaccional
  plantillasEmail: PlantillaEmail[];
  upsertPlantillaEmail: (tipo: PlantillaEmail['tipo'], changes: { asunto?: string | null; intro?: string | null; activa?: boolean }) => void;

  // Riesgo de concentración por instructor
  dependencySnapshots: InstructorDependencySnapshot[];
  recalcularDependencia: () => Promise<boolean>;

  // Instructores (mutable)
  addInstructor: (fields: Omit<Instructor, 'id' | 'studioId'>) => void;
  updateInstructor: (id: string, changes: Partial<Omit<Instructor, 'id' | 'studioId'>>) => void;
  deleteInstructor: (id: string) => void;
  claimInstructorAccount: (email: string, authUserId: string) => Promise<Instructor | null>;

  // Studio config (policy, terms)
  studioConfig: StudioConfig;
  updateStudioConfig: (changes: Partial<StudioConfig>) => void;

  // Motor de automatización avanzado
  automationRules: AutomationRule[];
  automationLogs: AutomationLog[];
  notasProgreso: NotaProgreso[];
  toggleAutomationRule: (id: string) => void;
  addAutomationRule: (fields: Omit<AutomationRule, 'id' | 'studioId' | 'ejecutadaVeces' | 'ultimaEjecucion' | 'creadaEn'>) => void;
  addAutomationLog: (log: Omit<AutomationLog, 'id' | 'studioId'>) => void;
  runAutomation: () => Promise<AutomationLog[]>;
  addNotaProgreso: (nota: Omit<NotaProgreso, 'id' | 'studioId' | 'creadaEn'>) => void;
  dismissLog: (id: string) => void;
  actualizarLog: (id: string, changes: Partial<Pick<AutomationLog, 'resultado' | 'detalle'>>) => void;

  // Studio management
  resetDatosPilates: () => void;
  dataLoaded: boolean;
  // Recarga los datos en ruta pública (tras el login de la socia).
  recargarPublico: () => void;

  // Studio record (propietario) + avatar del admin
  studio: Studio | null;
  updateAvatarAdmin: (avatarId: string | null) => void;
  updateStudio: (changes: Partial<Studio>) => Promise<void>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

// Fecha local ('YYYY-MM-DD') de un instante ISO — para reconstruir la hora de
// cada sesión de una serie manteniendo su día (I-3).
function localDateFromISO(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio must be used within StudioProvider');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function StudioProvider({ children, studioIdOverride, publicSlug }: { children: ReactNode; studioIdOverride?: string; publicSlug?: string }) {
  const [dataLoaded, setDataLoaded] = useState(false);
  const [dbError, setDbError] = useState<{ msg: string; key: number } | null>(null);

  // /portal, /reservar y /kiosk montan SU PROPIO StudioProvider (con
  // publicSlug) vía StudioSlugGate, anidado dentro de este — el de la raíz
  // (app/layout.tsx, sin publicSlug) queda sombreado y nadie lee su contexto.
  // Aun así su efecto se ejecutaba igual: intentaba el fetch admin completo
  // sin sesión de staff, fallando en RLS y disparando el toast/Sentry de
  // "no se pudo guardar" en cada visita del portal. Si esta instancia no
  // tiene publicSlug pero SÍ estamos en una de esas rutas, es la sombreada:
  // no hace falta que traiga nada.
  const pathname = usePathname();
  const shadowedByPublicRoute = !publicSlug && /^\/(portal|reservar|kiosk|disponibilidad|aceptar-sustitucion|valorar)\//.test(pathname ?? '');

  // Surface fire-and-forget DB write failures to the user instead of losing them.
  useEffect(() => {
    setDbErrorListener(() => {
      setDbError({ msg: 'No se pudo guardar el último cambio. Revisa tu conexión e inténtalo de nuevo.', key: Date.now() });
    });
    return () => setDbErrorListener(null);
  }, []);

  // Auto-dismiss the error toast.
  useEffect(() => {
    if (!dbError) return;
    const t = setTimeout(() => setDbError(null), 6000);
    return () => clearTimeout(t);
  }, [dbError]);

  const [planesTarifa, setPlanesTarifa] = useState<PlanTarifa[]>([]);
  const [salas, setSalas] = useState<Sala[]>([]);
  const [tiposClase, setTiposClase] = useState<TipoClase[]>([]);
  const [camposPersonalizados, setCamposPersonalizados] = useState<CampoPersonalizado[]>([]);
  const [plantillasEmail, setPlantillasEmail] = useState<PlantillaEmail[]>([]);
  const [dependencySnapshots, setDependencySnapshots] = useState<InstructorDependencySnapshot[]>([]);
  const [instructores, setInstructores] = useState<Instructor[]>([]);
  const [spots, setSpots] = useState<Spot[]>([]);

  const [socios, setSocios] = useState<Socio[]>([]);
  const [suscripciones, setSuscripciones] = useState<Suscripcion[]>([]);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [notasInternas, setNotasInternas] = useState<NotaInterna[]>([]);
  const [condicionesSalud, setCondicionesSalud] = useState<CondicionSalud[]>([]);
  const [respuestasSesion, setRespuestasSesion] = useState<RespuestaSesionRow[]>([]);

  const [citas, setCitas] = useState<Cita[]>([]);
  const [productosPOS, setProductosPOS] = useState<ProductoPOS[]>([]);
  const [ventasPOS, setVentasPOS] = useState<VentaPOS[]>([]);
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [automatizaciones, setAutomatizaciones] = useState<Automatizacion[]>([]);
  // Dominios extraídos a sus stores (Fase B).
  const discountCodes = useDiscountCodesStore();
  const { codigosDescuento } = discountCodes;
  const integrationsStore = useIntegrationsStore();
  const { integraciones } = integrationsStore;
  const [actividadReciente, setActividadReciente] = useState<ActividadReciente[]>([]);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  // Dominio Contenido y Comunidad extraído a su propio store (Fase B).
  const content = useContentStore();
  const { videosOnDemand, postsComunidad, likedPostIds } = content;
  // Dominios extraídos a sus stores (Fase B).
  const dashboardChartsStore = useDashboardChartsStore();
  const { dashboardCharts } = dashboardChartsStore;
  const progressNotesStore = useProgressNotesStore();
  const { notasProgreso } = progressNotesStore;
  const memberPrefsStore = useMemberPrefsStore();
  const { preferenciasSocio } = memberPrefsStore;
  const [rewardRules, setRewardRules] = useState<RewardRule[]>([]);
  const [rewardActions, setRewardActions] = useState<RewardAction[]>([]);
  const [rewardHistory, setRewardHistory] = useState<RewardHistory[]>([]);
  const [creditTransactions, setCreditTransactions] = useState<CreditTransaction[]>([]);
  const [memberCredits, setMemberCredits] = useState<MemberCredits[]>([]);
  const [rewardCatalog, setRewardCatalog] = useState<RewardCatalogItem[]>([]);
  const [rewardRedemptions, setRewardRedemptions] = useState<RewardRedemption[]>([]);
  const [achievementDefinitions, setAchievementDefinitions] = useState<AchievementDefinition[]>([]);
  const [achievementProgress, setAchievementProgress] = useState<AchievementProgress[]>([]);
  const [achievementHistory, setAchievementHistory] = useState<AchievementHistory[]>([]);
  const [levelDefinitions, setLevelDefinitions] = useState<LevelDefinition[]>([]);
  const [challengeDefinitions, setChallengeDefinitions] = useState<ChallengeDefinition[]>([]);
  const [challengeProgress, setChallengeProgress] = useState<ChallengeProgress[]>([]);
  const [challengeHistory, setChallengeHistory] = useState<ChallengeHistory[]>([]);
  const [backups, setBackups] = useState<BackupMeta[]>([]);
  const [studioConfig, setStudioConfig] = useState<StudioConfig>(defaultStudioConfig);

  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([]);
  const [automationLogs, setAutomationLogs] = useState<AutomationLog[]>([]);
  const [studio, setStudio] = useState<Studio | null>(null);

  // ── Fetch all data from Supabase whenever the auth session changes ──────────
  // (mount, login, logout) — RLS now returns different rows to anon vs.
  // authenticated requests, so a stale pre-login fetch would leave every
  // authenticated-only table (instructores, integraciones, notas...) empty
  // after signing in without a full page reload.
  const { user } = useAuth();
  const authUserId = user?.id ?? null;
  // Quién está haciendo la acción ahora mismo — para el registro de
  // auditoría (addActividadReciente) y el chat de equipo. Sin instructores
  // vinculada, el auth_user_id es el de la propietaria original del negocio.
  const yo = instructores.find(i => i.authUserId === authUserId);
  const actorNombre = yo?.nombre ?? (user ? 'Propietaria' : null);

  // Chat de equipo: ya NO vive aquí. Se desacopló a su propio hook (useTeamChat),
  // consumido directamente por app/(dashboard)/chat/page.tsx, para que enviar un
  // mensaje no re-renderice todo el dashboard y se cargue bajo demanda.

  // Carga (o recarga) los datos en ruta pública desde el proxy scopeado. Se
  // llama al montar y de nuevo tras el login de la socia (recargarPublico), para
  // traer sus datos una vez identificada.
  function cargarPublico() {
    if (!publicSlug) return;
    setCurrentStudioId(studioIdOverride ?? '');
    // La socia se deriva del JWT en el servidor (cargarDatosPublicos manda el
    // Bearer); ya no se pasa {socioId,email} desde el cliente.
    cargarDatosPublicos(publicSlug).then(pub => {
      if (!pub || pub.error) { setDataLoaded(true); return; }
      setStudio(pub.studio ?? null);
      setSesiones(pub.sesiones ?? []);
      setTiposClase(pub.tiposClase ?? []);
      setSalas(pub.salas ?? []);
      setInstructores(pub.instructores ?? []);
      setSpots(pub.spots ?? []);
      setPlanesTarifa(pub.planesTarifa ?? []);
      content.setVideosOnDemand(pub.videosOnDemand ?? []);
      setRewardRules(pub.rewardRules ?? []);
      setRewardCatalog(pub.rewardCatalog ?? []);
      setLevelDefinitions(pub.levelDefinitions ?? []);
      setAchievementDefinitions(pub.achievementDefinitions ?? []);
      setChallengeDefinitions(pub.challengeDefinitions ?? []);
      const aforo = (pub.aforoReservas ?? []).map((r: { id: string; sesion_id: string; estado: string; spot_id: string | null }) => ({
        id: r.id, studioId: studioIdOverride ?? '', sesionId: r.sesion_id, socioId: '',
        estado: r.estado as Reserva['estado'], spotId: r.spot_id ?? null, posicionEspera: null, checkInEn: null, creadoEn: '',
      }));
      const socia = pub.socia;
      const miasById = new Map<string, Reserva>((socia?.reservas ?? []).map((r: Reserva) => [r.id, r]));
      setReservas(aforo.map((r: Reserva) => miasById.get(r.id) ?? r));
      setSocios(socia ? [socia.socio] : []);
      setSuscripciones(socia?.suscripciones ?? []);
      setRecibos(socia?.recibos ?? []);
      setFacturas(socia?.facturas ?? []);
      memberPrefsStore.setPreferenciasSocio(socia?.preferenciasSocio ?? []);
      setMemberCredits(socia?.memberCredits ?? []);
      setRewardHistory(socia?.rewardHistory ?? []);
      setRewardRedemptions(socia?.rewardRedemptions ?? []);
      setAchievementProgress(socia?.achievementProgress ?? []);
      setChallengeProgress(socia?.challengeProgress ?? []);
      setCreditTransactions(socia?.creditTransactions ?? []);
      setDataLoaded(true);
    }).catch(err => { console.error('Error cargando datos públicos:', err); setDataLoaded(true); });
  }

  useEffect(() => {
    // Ruta pública (reserva/portal/kiosk): los datos vienen del proxy de
    // servidor scopeado (service-role), NO del acceso anónimo directo. Solo el
    // catálogo del estudio + los datos de la socia en sesión.
    if (publicSlug) {
      cargarPublico();
      return;
    }
    // Nadie lee el contexto de esta instancia sombreada (ver comentario arriba),
    // así que no hace falta tocar dataLoaded ni ningún otro estado.
    if (shadowedByPublicRoute) return;

    // Nadie autenticado y no es una ruta pública scopeada (home de marketing,
    // /login, /crear-estudio, /suscripción antes de iniciar sesión): no hay
    // ningún estudio que cargar. Sin este guard se disparaban igualmente los
    // fetches de solo-admin (campos personalizados, plantillas de email,
    // dependencias), que RLS rechaza para anónimos — el fallo se mostraba
    // como un toast de error real a cualquier visitante de la home pública.
    if (!studioIdOverride && !authUserId) {
      setCurrentStudioId('');
      setDataLoaded(true);
      return;
    }

    (async () => {
      // Multi-tenancy: figure out which studio this session belongs to
      // *before* fetching, so every query below is scoped correctly both
      // by our own .eq('studio_id', ...) filters and by RLS.
      // A public route (e.g. /reservar/[slug]) already knows its studio from
      // the URL and passes it as studioIdOverride — that takes priority over
      // resolving from the (possibly absent, possibly unrelated) auth session.
      if (studioIdOverride) {
        setCurrentStudioId(studioIdOverride);
      } else if (authUserId) {
        const resolved = await resolveStudioId(authUserId);
        // Resetea a vacío si no resuelve, para no heredar el estudio de una
        // sesión anterior en el mismo cliente.
        setCurrentStudioId(resolved ?? '');
      } else {
        setCurrentStudioId('');
      }
      return fetchCriticalStudioData();
    })().then(data => {
      setPlanesTarifa(data.planesTarifa);
      setSalas(data.salas);
      setTiposClase(data.tiposClase);
      setInstructores(data.instructores);
      setSpots(data.spots);
      setSocios(data.socios);
      setSuscripciones(data.suscripciones);
      setSesiones(data.sesiones);
      setReservas(data.reservas);
      setRecibos(data.recibos);
      setFacturas(data.facturas);
      setNotasInternas(data.notasInternas);
      setCondicionesSalud(data.condicionesSalud);
      setRespuestasSesion(data.respuestasSesion);
      setCitas(data.citas);
      setProductosPOS(data.productosPOS);
      setVentasPOS(data.ventasPOS);
      setCampanas(data.campanas);
      setAutomatizaciones(data.automatizaciones);
      discountCodes.setCodigosDescuento(data.codigosDescuento);
      setActividadReciente(data.actividadReciente);
      setNotificaciones(data.notificaciones);
      content.setVideosOnDemand(data.videosOnDemand);
      content.setPostsComunidad(data.postsComunidad);
      dbMisLikesComunidad().then(ids => content.setLikedPostIds(new Set(ids)));
      integrationsStore.setIntegraciones(data.integraciones ?? []);
      memberPrefsStore.setPreferenciasSocio(data.preferenciasSocio ?? []);
      setRewardRules(data.rewardRules ?? []);
      setRewardActions(data.rewardActions ?? []);
      setMemberCredits(data.memberCredits ?? []);
      setRewardCatalog(data.rewardCatalog ?? []);
      setRewardRedemptions(data.rewardRedemptions ?? []);
      setAchievementDefinitions(data.achievementDefinitions ?? []);
      setAchievementProgress(data.achievementProgress ?? []);
      setLevelDefinitions(data.levelDefinitions ?? []);
      setChallengeDefinitions(data.challengeDefinitions ?? []);
      setChallengeProgress(data.challengeProgress ?? []);
      dashboardChartsStore.setDashboardCharts(data.dashboardCharts ?? []);
      setAutomationRules(data.automationRules);
      setAutomationLogs(data.automationLogs);
      setStudio(data.studio);
      setDataLoaded(true);

      // Campos personalizados y plantillas de email: no son ruta crítica (solo
      // config + fichas), se cargan aparte sin bloquear el primer pintado.
      dbFetchCamposPersonalizados().then(setCamposPersonalizados).catch(() => {});
      dbFetchPlantillasEmail().then(setPlantillasEmail).catch(() => {});
      dbFetchDependencySnapshots().then(setDependencySnapshots).catch(() => {});

      // 2ª ola (Fase C): historial/logs. No bloquea el primer pintado; estas
      // vistas se rellenan un instante después. Ninguna lógica de negocio las
      // lee, así que el hueco no cambia comportamiento.
      fetchDeferredStudioData().then(def => {
        setRewardHistory(def.rewardHistory);
        setCreditTransactions(def.creditTransactions);
        setAchievementHistory(def.achievementHistory);
        setChallengeHistory(def.challengeHistory);
        progressNotesStore.setNotasProgreso(def.notasProgreso);
        setBackups(def.backups);
      }).catch(err => console.error('Error cargando datos diferidos:', err));
    }).catch(err => {
      console.error('Error fetching Supabase data:', err);
      setDataLoaded(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId, studioIdOverride, publicSlug, shadowedByPublicRoute]);

  // ── Auto-increment factura counter ──────────────────────────────────────────
  function nextFacturaNumero(existingFacturas: Factura[]): string {
    const year = new Date().getFullYear();
    const nums = existingFacturas
      .map(f => {
        const m = f.numeroCompleto.match(/A-\d{4}-(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
      });
    const max = nums.length > 0 ? Math.max(...nums) : 0;
    return `A-${year}-${String(max + 1).padStart(4, '0')}`;
  }

  function buildFactura(recibo: Recibo, currentFacturas: Factura[]): Factura {
    const socio = socios.find(s => s.id === recibo.socioId);
    // Desglose optimista con el tipo de IVA del estudio. El servidor (sellar) lo
    // recalcula igual y es el autoritativo; esto solo evita un parpadeo de cifras
    // en la UI antes del sellado. Precio IVA incluido → el total no cambia.
    const tipoIVA = studio?.ivaPorDefecto ?? 21;
    const divisor = 1 + tipoIVA / 100;
    const baseImponible = Math.round((recibo.importe / divisor) * 100) / 100;
    const cuotaIVA = Math.round((recibo.importe - baseImponible) * 100) / 100;
    return {
      id: `fac-auto-${uid()}`,
      studioId: getCurrentStudioId(),
      reciboId: recibo.id,
      numeroCompleto: nextFacturaNumero(currentFacturas),
      fechaEmision: new Date().toISOString(),
      receptorNombre: socio ? `${socio.nombre} ${socio.apellidos}` : 'Cliente de mostrador',
      receptorNIF: socio?.nif ?? null,
      baseImponible,
      tipoIVA,
      cuotaIVA,
      total: recibo.importe,
      verifactuHash: null,
      verifactuPrevHash: null,
      verifactuTs: null,
      verifactuSeq: null,
    };
  }

  // Persiste + sella la factura en el servidor (huella Veri*Factu encadenada por
  // estudio) y refresca el estado local con la huella devuelta. Sustituye al
  // insert directo en cliente: el sellado usa node:crypto y debe ir en servidor.
  async function sellarFacturaYActualizar(fac: Factura) {
    const r = await sellarFactura(fac);
    if (r.ok && r.factura) {
      const s = r.factura;
      setFacturas(prev => prev.map(f => f.id === fac.id ? {
        ...f,
        verifactuHash: s.verifactuHash,
        verifactuPrevHash: s.verifactuPrevHash,
        verifactuTs: s.verifactuTs,
        verifactuSeq: s.verifactuSeq,
        // C-5: reconciliar con los valores AUTORITATIVOS del servidor (número,
        // importes, receptor y fecha se recalculan allí desde el recibo).
        numeroCompleto: s.numeroCompleto ?? f.numeroCompleto,
        fechaEmision: s.fechaEmision ?? f.fechaEmision,
        receptorNombre: s.receptorNombre ?? f.receptorNombre,
        receptorNIF: s.receptorNIF !== undefined ? s.receptorNIF : f.receptorNIF,
        baseImponible: s.baseImponible ?? f.baseImponible,
        cuotaIVA: s.cuotaIVA ?? f.cuotaIVA,
        total: s.total ?? f.total,
      } : f));
    }
  }

  // ── Socios ───────────────────────────────────────────────────────────────────

  // ── Planes ────────────────────────────────────────────────────────────────────

  function addPlan(fields: Omit<PlanTarifa, 'id' | 'studioId'>) {
    const nuevo: PlanTarifa = { ...fields, id: `plan-${uid()}`, studioId: getCurrentStudioId() };
    setPlanesTarifa(prev => [...prev, nuevo]);
    dbInsertPlanTarifa(nuevo);
    addActividadReciente('PLAN_CREADO', `${actorNombre ?? 'Alguien'} creó el plan "${fields.nombre}" — ${fields.precio} €`);
  }
  function updatePlan(id: string, changes: Partial<Omit<PlanTarifa, 'id' | 'studioId'>>) {
    const anterior = planesTarifa.find(p => p.id === id);
    setPlanesTarifa(prev => prev.map(p => p.id === id ? { ...p, ...changes } : p));
    dbUpdatePlanTarifa(id, changes);
    if (anterior) {
      const detalle = 'precio' in changes && changes.precio !== anterior.precio
        ? `precio ${anterior.precio}€ → ${changes.precio}€`
        : 'datos actualizados';
      addActividadReciente('PLAN_EDITADO', `${actorNombre ?? 'Alguien'} editó el plan "${anterior.nombre}" (${detalle})`);
    }
  }
  function deletePlan(id: string) {
    const plan = planesTarifa.find(p => p.id === id);
    setPlanesTarifa(prev => prev.filter(p => p.id !== id));
    dbDeletePlanTarifa(id);
    if (plan) addActividadReciente('PLAN_ELIMINADO', `${actorNombre ?? 'Alguien'} eliminó el plan "${plan.nombre}"`);
  }

  // ── Salas ─────────────────────────────────────────────────────────────────────

  function addSala(fields: Omit<Sala, 'id' | 'studioId'>) {
    setSalas(prev => [...prev, { ...fields, id: `sala-${uid()}`, studioId: getCurrentStudioId() }]);
  }
  function updateSala(id: string, changes: Partial<Omit<Sala, 'id' | 'studioId'>>) {
    setSalas(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s));
  }
  function deleteSala(id: string) {
    setSalas(prev => prev.filter(s => s.id !== id));
  }

  // ── Tipos de clase ────────────────────────────────────────────────────────────

  function addTipoClase(fields: Omit<TipoClase, 'id' | 'studioId'>) {
    const nuevo: TipoClase = { ...fields, id: `tc-${uid()}`, studioId: getCurrentStudioId() };
    setTiposClase(prev => [...prev, nuevo]);
    dbInsertTipoClase(nuevo);
  }
  function updateTipoClase(id: string, changes: Partial<Omit<TipoClase, 'id' | 'studioId'>>) {
    setTiposClase(prev => prev.map(t => t.id === id ? { ...t, ...changes } : t));
    dbUpdateTipoClase(id, changes);
  }
  function deleteTipoClase(id: string) {
    setTiposClase(prev => prev.filter(t => t.id !== id));
    dbDeleteTipoClase(id);
  }

  // ── Campos personalizados de socia ──────────────────────────────────────────

  function addCampoPersonalizado(fields: Omit<CampoPersonalizado, 'id' | 'studioId'>) {
    const nuevo: CampoPersonalizado = { ...fields, id: `campo-${uid()}`, studioId: getCurrentStudioId() };
    setCamposPersonalizados(prev => [...prev, nuevo]);
    dbInsertCampoPersonalizado(nuevo);
  }
  function updateCampoPersonalizado(id: string, changes: Partial<Omit<CampoPersonalizado, 'id' | 'studioId'>>) {
    setCamposPersonalizados(prev => prev.map(c => c.id === id ? { ...c, ...changes } : c));
    dbUpdateCampoPersonalizado(id, changes);
  }
  function deleteCampoPersonalizado(id: string) {
    setCamposPersonalizados(prev => prev.filter(c => c.id !== id));
    dbDeleteCampoPersonalizado(id);
  }

  // ── Plantillas de email ─────────────────────────────────────────────────────

  function upsertPlantillaEmail(tipo: PlantillaEmail['tipo'], changes: { asunto?: string | null; intro?: string | null; activa?: boolean }) {
    const existente = plantillasEmail.find(p => p.tipo === tipo);
    const merged: PlantillaEmail = existente
      ? { ...existente, ...changes }
      : { id: `pl-${uid()}`, studioId: getCurrentStudioId(), tipo, asunto: null, intro: null, activa: true, ...changes };
    setPlantillasEmail(prev => {
      const rest = prev.filter(p => p.tipo !== tipo);
      return [...rest, merged];
    });
    dbUpsertPlantillaEmail(merged);
  }

  // ── Riesgo de concentración por instructor ──────────────────────────────────

  async function recalcularDependencia(): Promise<boolean> {
    try {
      const res = await fetch('/api/instructors/dependency_risk/recalcular', {
        method: 'POST',
        headers: { ...(await authHeader()) },
      });
      if (!res.ok) return false;
      const fresh = await dbFetchDependencySnapshots();
      setDependencySnapshots(fresh);
      return true;
    } catch {
      return false;
    }
  }

  // ── Instructores ──────────────────────────────────────────────────────────────

  function addInstructor(fields: Omit<Instructor, 'id' | 'studioId'>) {
    const nuevo: Instructor = { ...fields, id: `ins-${uid()}`, studioId: getCurrentStudioId() };
    setInstructores(prev => [...prev, nuevo]);
    dbInsertInstructor(nuevo);
    addActividadReciente('EQUIPO_ALTA', `${actorNombre ?? 'Alguien'} añadió a ${nuevo.nombre} al equipo (${nuevo.rol})`);
  }
  function updateInstructor(id: string, changes: Partial<Omit<Instructor, 'id' | 'studioId'>>) {
    const anterior = instructores.find(i => i.id === id);
    setInstructores(prev => prev.map(i => i.id === id ? { ...i, ...changes } : i));
    dbUpdateInstructor(id, changes);
    if (anterior) {
      const detalle = 'rol' in changes && changes.rol !== anterior.rol
        ? `rol ${anterior.rol} → ${changes.rol}`
        : 'datos actualizados';
      addActividadReciente('EQUIPO_EDITADO', `${actorNombre ?? 'Alguien'} editó a ${anterior.nombre} del equipo (${detalle})`);
    }
  }
  function deleteInstructor(id: string) {
    const instructor = instructores.find(i => i.id === id);
    setInstructores(prev => prev.filter(i => i.id !== id));
    dbDeleteInstructor(id);
    if (instructor) addActividadReciente('EQUIPO_BAJA', `${actorNombre ?? 'Alguien'} eliminó a ${instructor.nombre} del equipo`);
  }

  async function claimInstructorAccount(email: string, authUserId: string) {
    const claimed = await dbClaimInstructorAccount(email, authUserId);
    if (claimed) setInstructores(prev => prev.map(i => i.id === claimed.id ? claimed : i));
    return claimed;
  }

  // ── Datos del estudio ──────────────────────────────────────────────────────────

  function updateAvatarAdmin(avatarId: string | null) {
    setStudio(prev => prev ? { ...prev, avatarAdmin: avatarId } : prev);
    dbUpdateStudio({ avatarAdmin: avatarId });
  }

  function updateStudio(changes: Partial<Studio>) {
    setStudio(prev => prev ? { ...prev, ...changes } : prev);
    return dbUpdateStudio(changes);
  }

  // ── Socios ────────────────────────────────────────────────────────────────────

  function addSocio(fields: Omit<Socio, 'id' | 'studioId' | 'fechaAlta'> & { planId?: string; aceptacionContrato?: AceptacionContrato }) {
    const { planId, aceptacionContrato, ...socioFields } = fields;
    const ahora = new Date().toISOString();
    const nuevaSocia: Socio = {
      id: `soc-${uid()}`,
      studioId: getCurrentStudioId(),
      fechaAlta: ahora,
      ...(aceptacionContrato ? { aceptacionContrato } : {}),
      ...socioFields,
    };
    setSocios(prev => [...prev, nuevaSocia]);
    dbInsertSocio(nuevaSocia).then(ok => {
      if (ok) addActividadReciente('NUEVA_SOCIA', `${actorNombre ?? 'Alguien'} dio de alta a ${nuevaSocia.nombre} ${nuevaSocia.apellidos}`, nuevaSocia.id, `/socios/${nuevaSocia.id}`);
    });
    if (planId) {
      const plan = planesTarifa.find(p => p.id === planId);
      if (plan) {
        const susId = `sus-${uid()}`;
        const sus: Suscripcion = {
          id: susId,
          studioId: getCurrentStudioId(),
          socioId: nuevaSocia.id,
          planId,
          estado: 'ACTIVA',
          fechaInicio: ahora,
          fechaFin: null,
          sesionesRestantes: plan.sesiones,
          stripeSubscriptionId: null,
        };
        setSuscripciones(prev => [...prev, sus]);
        dbInsertSuscripcion(sus);

        // Auto-generate a paid recibo + factura at enrolment
        const reciboId = `rec-${uid()}`;
        const reciboCobrado: Recibo = {
          id: reciboId,
          studioId: getCurrentStudioId(),
          socioId: nuevaSocia.id,
          suscripcionId: susId,
          concepto: `Alta — ${plan.nombre}`,
          importe: plan.precio,
          estado: 'COBRADO',
          fechaVencimiento: ahora,
          fechaCobro: ahora,
          fechaDevolucion: null,
          intentosReintento: 0,
        };
        setRecibos(prev => [...prev, reciboCobrado]);
        dbInsertRecibo(reciboCobrado);
        setFacturas(prev => {
          const fac = buildFactura(reciboCobrado, prev);
          void sellarFacturaYActualizar(fac);
          return [...prev, fac];
        });
      }
    }
  }

  // En ruta pública, las escrituras van por los endpoints de servidor (service-
  // role + validación por email), no por la anon key. Devuelve el contexto de la
  // socia en sesión, o null si no estamos en modo público.
  function ctxPublico(): { studioId: string; socioId: string; email: string } | null {
    if (!publicSlug) return null;
    const m = leerSociaLocal();
    return { studioId: studioIdOverride ?? '', socioId: m?.socioId ?? '', email: m?.email ?? '' };
  }
  async function postPublico(url: string, body: Record<string, unknown>) {
    try {
      // Si hay sesión de socia (portal, magic link) se manda su Bearer: los
      // endpoints que ya exigen sesión real (canje, preferencias) derivan la
      // identidad del JWT en vez de fiarse del body. En /reservar (sin sesión
      // Supabase) no se manda, y esos endpoints siguen con el modelo antiguo.
      const auth = await portalAuthHeader();
      // C-2: si el dispositivo es un kiosko con token guardado, se envía en
      // x-kiosk-token. /api/public/checkin lo exige; el resto de endpoints
      // públicos ignoran la cabecera, así que enviarla siempre es inocuo.
      const kioskToken = typeof window !== 'undefined' ? window.localStorage.getItem('kioskToken') : null;
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...auth,
          ...(kioskToken ? { 'x-kiosk-token': kioskToken } : {}),
        },
        body: JSON.stringify(body),
      });
    } finally {
      cargarPublico(); // re-sincroniza el estado desde el servidor
    }
  }

  // Preferencias de la socia: en público van por endpoint; si no, al store.
  function upsertPreferenciasSocioPub(socioId: string, changes: Partial<Omit<PreferenciasSocio, 'socioId' | 'studioId'>>) {
    const cpub = ctxPublico();
    if (cpub) {
      memberPrefsStore.upsertPreferenciasSocio(socioId, changes); // optimista (estado local)
      postPublico('/api/public/socio', { accion: 'preferencias', studioId: cpub.studioId, socioId: cpub.socioId, email: cpub.email, cambios: changes });
      return;
    }
    memberPrefsStore.upsertPreferenciasSocio(socioId, changes);
  }

  async function addSocioFromPortal(fields: { id: string; nombre: string; email: string; aceptacionContrato?: AceptacionContrato; referidoPor?: string | null }): Promise<void> {
    const cpub = ctxPublico();
    if (cpub) {
      // Alta pública vía endpoint (service-role). Se AWAITea para que la reserva
      // posterior encuentre a la socia ya creada.
      await postPublico('/api/public/socio', {
        accion: 'registrar', studioId: cpub.studioId, id: fields.id, nombre: fields.nombre, email: fields.email,
        aceptacion: fields.aceptacionContrato, referidoPor: fields.referidoPor ?? null,
      });
      return;
    }
    const nuevaSocia: Socio = {
      id: fields.id,
      studioId: getCurrentStudioId(),
      nombre: fields.nombre,
      apellidos: '',
      email: fields.email,
      telefono: null,
      nif: null,
      fechaAlta: new Date().toISOString(),
      activo: true,
      ...(fields.aceptacionContrato ? { aceptacionContrato: fields.aceptacionContrato } : {}),
      ...(fields.referidoPor ? { referidoPor: fields.referidoPor } : {}),
    };
    setSocios(prev => [...prev, nuevaSocia]);
    dbInsertSocio(nuevaSocia);
    // El referido queda registrado en la socia (referidoPor), pero el premio
    // al que invita NO se otorga aquí: se otorga cuando la referida asiste a
    // su primera clase (ver premiarReferidoSiProcede en checkin). Así una alta
    // falsa o que nunca aparece no genera recompensa.
  }

  function updateStudioConfig(changes: Partial<StudioConfig>) {
    setStudioConfig(prev => ({ ...prev, ...changes }));
  }

  function updateSocio(id: string, changes: Partial<Socio>) {
    const cpub = ctxPublico();
    if (cpub) {
      // La socia edita su propio perfil vía endpoint (whitelist de campos).
      setSocios(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s)); // optimista
      postPublico('/api/public/socio', { accion: 'actualizar', studioId: cpub.studioId, socioId: cpub.socioId, email: cpub.email, cambios: changes });
      return;
    }
    setSocios(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s));
    dbUpdateSocio(id, changes);
    const socio = socios.find(s => s.id === id);
    if (socio) addActividadReciente('SOCIA_EDITADA', `${actorNombre ?? 'Alguien'} editó los datos de ${socio.nombre} ${socio.apellidos}`, id, `/socios/${id}`);
  }

  function deleteSocio(id: string) {
    const socio = socios.find(s => s.id === id);
    // A-3/A-4: baja lógica con anonimización (dbDeleteSocio → /api/socios/eliminar).
    // Localmente: la socia sale del roster, sus suscripciones quedan CANCELADAS y
    // se limpian sus datos personales sin base de retención. Los RECIBOS se
    // CONSERVAN (obligación fiscal); el pago histórico se mostrará como "Socia
    // eliminada" al no resolver ya el nombre.
    setSocios(prev => prev.filter(s => s.id !== id));
    setSuscripciones(prev => prev.map(s => s.socioId === id ? { ...s, estado: 'CANCELADA' as const } : s));
    setNotasInternas(prev => prev.filter(n => n.socioId !== id));
    setCondicionesSalud(prev => prev.filter(c => c.socioId !== id));
    setRespuestasSesion(prev => prev.filter(r => r.socioId !== id));
    if (socio) addActividadReciente('SOCIA_ELIMINADA', `${actorNombre ?? 'Alguien'} dio de baja a ${socio.nombre} ${socio.apellidos}`);
    // Devuelve la promesa: la baja pasa por un endpoint (async) y quien redirige
    // justo después (ficha → window.location) debe ESPERARLA, o la navegación
    // dura cancela la petición y la socia no llega a anonimizarse.
    return dbDeleteSocio(id);
  }

  function addTagSocio(socioId: string, tag: string) {
    setSocios(prev => prev.map(s =>
      s.id === socioId
        ? { ...s, tags: [...new Set([...(s.tags ?? []), tag])] }
        : s
    ));
  }

  function removeTagSocio(socioId: string, tag: string) {
    setSocios(prev => prev.map(s =>
      s.id === socioId
        ? { ...s, tags: (s.tags ?? []).filter(t => t !== tag) }
        : s
    ));
  }

  // ── Notas internas ───────────────────────────────────────────────────────────

  function addNota(socioId: string, texto: string) {
    const nueva: NotaInterna = {
      id: `nota-${uid()}`,
      studioId: getCurrentStudioId(),
      socioId,
      texto: texto.trim(),
      tipo: 'NOTA',
      creadoEn: new Date().toISOString(),
    };
    setNotasInternas(prev => [nueva, ...prev]);
    dbInsertNotaInterna(nueva);
  }

  function deleteNota(notaId: string) {
    setNotasInternas(prev => prev.filter(n => n.id !== notaId));
    dbDeleteNotaInterna(notaId);
  }

  // ── Ficha clínica: condiciones de salud ──────────────────────────────────────
  function addCondicion(fields: Omit<CondicionSalud, 'id' | 'studioId' | 'creadoEn' | 'actualizadoEn'>) {
    const ahora = new Date().toISOString();
    const nueva: CondicionSalud = {
      ...fields,
      id: `cond-${uid()}`,
      studioId: getCurrentStudioId(),
      creadoEn: ahora,
      actualizadoEn: ahora,
    };
    setCondicionesSalud(prev => [nueva, ...prev]);
    dbInsertCondicion(nueva);
    // Sin log al feed de actividad reciente: es visible para RECEPCIÓN y la
    // etiqueta clínica es dato sensible (FICHA-CLINICA.md §11). Un registro de
    // auditoría restringido queda como follow-up.
  }

  function updateCondicion(id: string, changes: Partial<CondicionSalud>) {
    const conActualizado = { ...changes, actualizadoEn: new Date().toISOString() };
    setCondicionesSalud(prev => prev.map(c => c.id === id ? { ...c, ...conActualizado } : c));
    dbUpdateCondicion(id, changes);
  }

  function deleteCondicion(id: string) {
    setCondicionesSalud(prev => prev.filter(c => c.id !== id));
    dbDeleteCondicion(id);
  }

  // Evolución post-clase (Fase 2): una respuesta por (socia, sesión). Si ya
  // existe para esa combinación, se actualiza; si no, se inserta.
  function registrarRespuestaSesion({ socioId, sesionId, respuesta, nota = null }: { socioId: string; sesionId: string | null; respuesta: RespuestaSesion; nota?: string | null }) {
    const existente = respuestasSesion.find(r => r.socioId === socioId && r.sesionId === sesionId);
    if (existente) {
      setRespuestasSesion(prev => prev.map(r => r.id === existente.id ? { ...r, respuesta, nota } : r));
      dbUpdateRespuestaSesion(existente.id, { respuesta, nota });
      return;
    }
    const nueva: RespuestaSesionRow = {
      id: `resp-${uid()}`,
      studioId: getCurrentStudioId(),
      socioId,
      sesionId,
      respuesta,
      nota,
      creadoPor: null,
      creadoEn: new Date().toISOString(),
    };
    setRespuestasSesion(prev => [nueva, ...prev]);
    dbInsertRespuestaSesion(nueva);
  }

  // ── Suscripciones ────────────────────────────────────────────────────────────

  function assignPlan(socioId: string, planId: string | null) {
    const aDesactivar = suscripciones.filter(s => s.socioId === socioId && s.estado === 'ACTIVA');
    const plan = planId ? planesTarifa.find(p => p.id === planId) : null;
    const nueva: Suscripcion | null = plan ? {
      id: `sus-${uid()}`,
      studioId: getCurrentStudioId(),
      socioId,
      planId: plan.id,
      estado: 'ACTIVA',
      fechaInicio: new Date().toISOString(),
      fechaFin: null,
      sesionesRestantes: plan.sesiones,
      stripeSubscriptionId: null,
    } : null;
    setSuscripciones(prev => {
      const deactivated = prev.map(s =>
        s.socioId === socioId && s.estado === 'ACTIVA'
          ? { ...s, estado: 'CANCELADA' as const }
          : s
      );
      return nueva ? [...deactivated, nueva] : deactivated;
    });
    aDesactivar.forEach(s => dbUpdateSuscripcion(s.id, { estado: 'CANCELADA' }));
    if (nueva) dbInsertSuscripcion(nueva);
    const socio = socios.find(s => s.id === socioId);
    addActividadReciente(
      'PLAN_ASIGNADO',
      `${actorNombre ?? 'Alguien'} ${plan ? `asignó el plan "${plan.nombre}"` : 'quitó el plan'} a ${socio?.nombre ?? 'una socia'}`,
      socioId,
      `/socios/${socioId}`
    );
  }

  function pausarSuscripcion(susId: string) {
    // I7: persistir en BD (antes solo tocaba el estado local → pausar se perdía al
    // recargar). Se guarda solo si la transición aplica, como hace assignPlan.
    const sus = suscripciones.find(s => s.id === susId);
    if (!sus || sus.estado !== 'ACTIVA') return;
    setSuscripciones(prev => prev.map(s => s.id === susId ? { ...s, estado: 'PAUSADA' as const } : s));
    dbUpdateSuscripcion(susId, { estado: 'PAUSADA' });
  }

  function reanudarSuscripcion(susId: string) {
    // I7: idem — persistir la reanudación.
    const sus = suscripciones.find(s => s.id === susId);
    if (!sus || sus.estado !== 'PAUSADA') return;
    setSuscripciones(prev => prev.map(s => s.id === susId ? { ...s, estado: 'ACTIVA' as const } : s));
    dbUpdateSuscripcion(susId, { estado: 'ACTIVA' });
  }

  // ── Sesiones ─────────────────────────────────────────────────────────────────

  function addSesion(fields: Omit<Sesion, 'id' | 'studioId'>) {
    const nueva: Sesion = { id: `ses-${uid()}`, studioId: getCurrentStudioId(), ...fields };
    setSesiones(prev => [...prev, nueva]);
    dbInsertSesion(nueva);
  }

  function updateSesion(id: string, changes: Partial<Sesion>) {
    setSesiones(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s));
    dbUpdateSesion(id, changes);
  }

  function deleteSesion(id: string) {
    setSesiones(prev => prev.filter(s => s.id !== id));
    setReservas(prev => prev.filter(r => r.sesionId !== id));
    dbDeleteSesion(id);
  }

  // ── Series de clases recurrentes (I-3) ───────────────────────────────────────

  // Crea una serie: todas las sesiones comparten un serie_id y se insertan en UNA
  // sola llamada (batch), en vez de N inserts secuenciales sin rollback.
  function addSesionesSerie(fields: Omit<Sesion, 'id' | 'studioId' | 'serieId'>[]) {
    if (fields.length === 0) return;
    const serieId = `serie-${uid()}`;
    const studioId = getCurrentStudioId();
    const nuevas: Sesion[] = fields.map(f => ({ id: `ses-${uid()}`, studioId, serieId, ...f }));
    setSesiones(prev => [...prev, ...nuevas]);
    dbInsertSesionesBatch(nuevas);
  }

  // Sesiones de la misma serie que una dada, desde su inicio en adelante ("esta y
  // las siguientes"). Vacío si la sesión no pertenece a una serie.
  function sesionesDeSerieDesde(sesionId: string): Sesion[] {
    const base = sesiones.find(s => s.id === sesionId);
    if (!base?.serieId) return base ? [base] : [];
    return sesiones.filter(s => s.serieId === base.serieId && s.inicio >= base.inicio);
  }

  // Edita "esta y las siguientes" de una serie. Los campos uniformes (tipo, sala,
  // instructora, aforo, notas) se aplican a todas; la hora se re-aplica a la
  // fecha de cada sesión (mantiene su día, cambia H:M). changes trae horaInicio/
  // horaFin en 'HH:MM' (hora local) para poder reconstruir inicio/fin por sesión.
  function editarSerieDesde(
    sesionId: string,
    changes: { tipoClaseId: string; salaId: string; instructorId: string; aforoMaximo: number; notas: string | null; horaInicio: string; horaFin: string },
  ) {
    const objetivo = sesionesDeSerieDesde(sesionId);
    if (objetivo.length === 0) return;
    const uniformes = {
      tipoClaseId: changes.tipoClaseId, salaId: changes.salaId,
      instructorId: changes.instructorId, aforoMaximo: changes.aforoMaximo, notas: changes.notas,
    };
    // Reconstruye inicio/fin de cada sesión con su propia fecha + la nueva hora.
    const conHora = objetivo.map(s => {
      const dia = localDateFromISO(s.inicio); // 'YYYY-MM-DD' local de la sesión
      const inicio = new Date(`${dia}T${changes.horaInicio}:00`).toISOString();
      const fin = new Date(`${dia}T${changes.horaFin}:00`).toISOString();
      return { id: s.id, inicio, fin };
    });
    const ids = new Set(objetivo.map(s => s.id));
    setSesiones(prev => prev.map(s => {
      if (!ids.has(s.id)) return s;
      const h = conHora.find(c => c.id === s.id)!;
      return { ...s, ...uniformes, inicio: h.inicio, fin: h.fin };
    }));
    // Uniformes en batch (1 llamada) + hora por sesión (varía por fecha).
    dbUpdateSesionesBatch([...ids], uniformes);
    conHora.forEach(h => dbUpdateSesion(h.id, { inicio: h.inicio, fin: h.fin }));
  }

  // Cancela "esta y las siguientes" de una serie (p. ej. "cancelar la serie del
  // verano") y avisa por email a las socias con plaza en cada sesión afectada.
  function cancelarSerieDesde(sesionId: string) {
    const objetivo = sesionesDeSerieDesde(sesionId).filter(s => !s.cancelada);
    if (objetivo.length === 0) return;
    const ids = objetivo.map(s => s.id);
    const idSet = new Set(ids);
    setSesiones(prev => prev.map(s => idSet.has(s.id) ? { ...s, cancelada: true } : s));
    dbUpdateSesionesBatch(ids, { cancelada: true });
    // Aviso a las socias con plaza en cualquiera de las sesiones canceladas.
    notificarCancelacionSesiones(objetivo);
  }

  // Email de cancelación a cada socia con plaza (confirmada/asistida) en las
  // sesiones dadas. Mismo criterio que la cancelación de una clase suelta.
  function notificarCancelacionSesiones(sesionesCanceladas: Sesion[]) {
    sesionesCanceladas.forEach(ses => {
      const tipo = tiposClase.find(t => t.id === ses.tipoClaseId);
      const sala = salas.find(x => x.id === ses.salaId);
      const instructor = instructores.find(i => i.id === ses.instructorId);
      const inicio = new Date(ses.inicio);
      const fecha = inicio.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
      const hora = inicio.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
      reservas
        .filter(r => r.sesionId === ses.id && (r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA'))
        .forEach(r => {
          const socia = socios.find(s => s.id === r.socioId);
          if (!socia?.email) return;
          enviarEmailCancelacionClase({
            to: socia.email, toName: socia.nombre,
            claseNombre: tipo?.nombre ?? 'Clase', fecha, hora,
            sala: sala?.nombre ?? '', instructor: instructor?.nombre ?? '',
          });
        });
    });
  }

  // ── Reservas ─────────────────────────────────────────────────────────────────

  // Descuenta una sesión del bono activo del socio al confirmar una reserva.
  // Si el bono se agota, genera el recibo de renovación + notificación.
  async function consumirSesionBono(socioId: string) {
    // bono-logic resuelve el bono consumible (qué suscripción descontar).
    const consumible = bonoConsumible(socioId, suscripciones, planesTarifa);
    if (!consumible) return;
    const { suscripcion: sus, plan } = consumible;

    // C5/R2: el descuento y la decisión de "agotado" salen de la RPC atómica
    // (serializada por lock de fila), NO de calcularConsumoBono() sobre el
    // snapshot local —que puede estar obsoleto y provocar un recibo de renovación
    // perdido o duplicado si dos reservas compiten. Espejo de consumirBonoServidor.
    const res = await dbConsumirSesionBono(sus.id, getCurrentStudioId());
    if (!('ok' in res)) return; // sin sesión que descontar / error → no tocar recibo
    const nuevasRestantes = res.saldo;
    setSuscripciones(prev => prev.map(s =>
      s.id === sus.id ? { ...s, sesionesRestantes: nuevasRestantes } : s
    ));

    // Bono agotado (transición autoritativa a 0) → recibo de renovación + notificación
    if (nuevasRestantes === 0) {
      const socio = socios.find(s => s.id === socioId);
      const nombreSocio = socio ? `${socio.nombre} ${socio.apellidos}` : 'Socia';
      const hoy = new Date().toISOString().slice(0, 10);
      const reciboRenovacion: Recibo = {
        id: `rec-renov-${uid()}`,
        studioId: getCurrentStudioId(),
        socioId,
        suscripcionId: sus.id,
        concepto: `Renovación ${plan.nombre}`,
        importe: plan.precio,
        estado: 'PENDIENTE',
        fechaVencimiento: hoy,
        fechaCobro: null,
        fechaDevolucion: null,
        intentosReintento: 0,
      };
      setRecibos(prev => [reciboRenovacion, ...prev]);
      dbInsertRecibo(reciboRenovacion);
      setNotificaciones(prev => [{
        id: `notif-bono-${uid()}`,
        studioId: getCurrentStudioId(),
        titulo: 'Bono agotado',
        texto: `${nombreSocio} ha consumido su último bono de ${plan.nombre}. Se ha generado un recibo de renovación.`,
        leida: false,
        tipo: 'AVISO' as const,
        enlace: `/socios/${socioId}`,
        creadaEn: new Date().toISOString(),
      }, ...prev]);
      addActividadReciente(
        'PAGO_PENDIENTE',
        `Bono agotado — ${nombreSocio} necesita renovar ${plan.nombre}`,
        socioId,
        `/socios/${socioId}`,
      );
    }
  }

  // Devuelve una sesión al bono cuando se cancela una reserva confirmada,
  // sin superar el total del plan.
  function devolverSesionBono(socioId: string) {
    const consumible = bonoConsumible(socioId, suscripciones, planesTarifa);
    if (!consumible) return;
    const { suscripcion: sus, plan, sesionesRestantes } = consumible;

    const nuevasRestantes = calcularDevolucionBono(sesionesRestantes, plan.sesiones);
    setSuscripciones(prev => prev.map(s =>
      s.id === sus.id ? { ...s, sesionesRestantes: nuevasRestantes } : s
    ));
    dbUpdateSuscripcion(sus.id, { sesionesRestantes: nuevasRestantes });
  }

  function addReserva(sesionId: string, socioId: string, spotId?: string | null): EstadoReserva {
    const esPrimeraReserva = !reservas.some(r => r.socioId === socioId);
    const sesion = sesiones.find(s => s.id === sesionId);
    // Decisión de aforo/lista de espera: lógica pura y testeada (booking-logic).
    const { estado, posicionEspera } = decidirReservaNueva(sesion?.aforoMaximo, sesionId, reservas);

    const cpub = ctxPublico();
    if (cpub) {
      // La creación real (con bono/renovación) la hace el servidor; el estado que
      // devolvemos es la estimación cliente (misma lógica pura); recargarPublico
      // sincroniza el estado autoritativo. spotId: el sitio que eligió la socia
      // (solo se asigna si la reserva queda CONFIRMADA; el servidor lo valida).
      postPublico('/api/public/reserva', { accion: 'crear', studioId: cpub.studioId, sesionId, socioId, email: cpub.email, spotId: spotId ?? null });
      return estado;
    }

    const reservaId = `res-${uid()}`;
    const nueva: Reserva = {
      id: reservaId,
      studioId: getCurrentStudioId(),
      sesionId,
      socioId,
      estado,
      spotId: null,
      posicionEspera,
      checkInEn: null,
      creadoEn: new Date().toISOString(),
    };
    const reservasActualizadas = [...reservas, nueva];
    setReservas(reservasActualizadas);
    // La inserción real pasa por la función Postgres atómica reservar_plaza
    // (bloquea la fila de la sesión mientras decide) — la estimación de arriba
    // es solo para pintar algo al instante. Si dos altas concurrentes compiten
    // por la última plaza, la decisión de la base de datos manda: se corrige el
    // estado local y los efectos (bono/créditos/logros) se disparan sobre ese
    // resultado autoritativo, no sobre la estimación.
    dbReservarPlaza(getCurrentStudioId(), sesionId, socioId, reservaId).then(r => {
      if (!r || 'error' in r) return;
      if (r.estado !== estado) {
        setReservas(prev => prev.map(x => x.id === reservaId
          ? { ...x, estado: r.estado as EstadoReserva, posicionEspera: r.posicionEspera } : x));
      }
      if (r.estado === 'CONFIRMADA') consumirSesionBono(socioId);
      if (esPrimeraReserva) otorgarCreditos(socioId, 'PRIMERA_RESERVA', socioId);
      // I12: evaluar logros/retos sobre el set con el estado AUTORITATIVO de la
      // RPC, no sobre la estimación optimista. Si la estimación fue CONFIRMADA
      // pero la BD devolvió LISTA_ESPERA, evaluar sobre reservasActualizadas
      // otorgaría logros como si la clase contara.
      const reservasFinales = reservasActualizadas.map(x => x.id === reservaId
        ? { ...x, estado: r.estado as EstadoReserva, posicionEspera: r.posicionEspera }
        : x);
      evaluarLogrosSocio(socioId, reservasFinales);
      evaluarRetosSocio(socioId, reservasFinales);
    });

    return estado;
  }

  function cancelarReserva(reservaId: string) {
    const cpub = ctxPublico();
    if (cpub) {
      setReservas(prev => prev.map(r => r.id === reservaId ? { ...r, estado: 'CANCELADA' as const } : r)); // optimista
      postPublico('/api/public/reserva', { accion: 'cancelar', studioId: cpub.studioId, reservaId, socioId: cpub.socioId, email: cpub.email });
      return;
    }

    const cancelada = reservas.find(r => r.id === reservaId);
    const sesionId = cancelada?.sesionId ?? null;

    // Optimista (UI inmediata): solo marca la reserva como cancelada. La
    // devolución de bono y la promoción de lista de espera NO se estiman sobre
    // el snapshot local: se aplican sobre el RESULTADO AUTORITATIVO de la BD
    // (abajo) — misma política que la vía pública (cancelarReservaPublica en
    // supabase-data.ts). Antes esto adivinaba la promovida con
    // siguienteEnEspera() sobre el estado local (podía no coincidir si había una
    // escritura concurrente) y devolvía el bono siempre, sin mirar la ventana de
    // cancelación del estudio — dejando escapar ingresos que el portal ya
    // protegía.
    setReservas(prev => prev.map(r => r.id === reservaId ? { ...r, estado: 'CANCELADA' as const } : r));

    // Cancelación + promoción de espera ATÓMICAS en la BD (una transacción con
    // bloqueo de fila).
    dbCancelarReservaPlaza(getCurrentStudioId(), reservaId).then(res => {
      if (!res || 'error' in res) return;
      const { eraConfirmada, promovidaSocioId } = res;

      // Devolver bono a quien canceló solo si su reserva ocupaba plaza (según la
      // BD, no el snapshot) Y la política de cancelación del estudio lo permite.
      if (eraConfirmada && cancelada) {
        const inicio = sesionId ? sesiones.find(s => s.id === sesionId)?.inicio : undefined;
        const devolver = !inicio || !studio
          ? true
          : debeDevolverBono(inicio, new Date(), studio.cancelacionVentanaHoras, studio.cancelacionDevolverBonoTardia);
        if (devolver) devolverSesionBono(cancelada.socioId);
      }

      if (!promovidaSocioId || !sesionId) return;

      // Refleja en el estado local la promoción REAL decidida por la BD.
      setReservas(prev => prev.map(r =>
        (r.sesionId === sesionId && r.socioId === promovidaSocioId && r.estado === 'LISTA_ESPERA')
          ? { ...r, estado: 'CONFIRMADA' as const, posicionEspera: null } : r));
      // La socia promovida ahora ocupa plaza: se le descuenta la sesión del bono.
      consumirSesionBono(promovidaSocioId);

      const socio = socios.find(s => s.id === promovidaSocioId);
      const sesion = sesiones.find(s => s.id === sesionId);
      const tipo = sesion ? tiposClase.find(t => t.id === sesion.tipoClaseId) : null;
      const nombre = socio ? `${socio.nombre} ${socio.apellidos}` : 'Socia';
      const clase = tipo?.nombre ?? 'la clase';
      // Email a la socia ascendida: ahora "te avisaremos si se libera una plaza"
      // es cierto también por la vía admin. Best-effort (Resend puede no estar).
      if (socio?.email && sesion) {
        const sala = salas.find(x => x.id === sesion.salaId);
        const instructor = instructores.find(i => i.id === sesion.instructorId);
        const inicioSesion = new Date(sesion.inicio);
        enviarEmailPromocion({
          to: socio.email,
          toName: socio.nombre,
          claseNombre: clase,
          fecha: inicioSesion.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }),
          hora: inicioSesion.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
          sala: sala?.nombre ?? '',
          instructor: instructor?.nombre ?? '',
          bonoConsumido: true,
        });
      }
      setNotificaciones(prev => [{
        id: `notif-promo-${uid()}`,
        studioId: getCurrentStudioId(),
        tipo: 'EXITO' as const,
        titulo: 'Lista de espera promovida',
        texto: `${nombre} ha pasado de lista de espera a confirmada en ${clase}.`,
        leida: false,
        creadaEn: new Date().toISOString(),
        enlace: `/socios/${promovidaSocioId}`,
      }, ...prev]);
      addActividadReciente('NUEVA_RESERVA', `${nombre} promovida de lista de espera → ${clase}`, promovidaSocioId, `/socios/${promovidaSocioId}`);
    });
  }

  // Premia a quien invitó SOLO cuando la referida asiste a su primera clase,
  // con tope mensual configurable (regla REFERIDO_AMIGO). El dedup real es el
  // UNIQUE(studio_id, trigger, ref_id): refId = id de la referida, así una
  // persona traída premia una única vez aunque asista muchas veces.
  function premiarReferidoSiProcede(socioId: string, reservasActuales: Reserva[]) {
    // Decisión pura y testeada (booking-logic): primera asistencia + referidoPor
    // + tope mensual de la regla no superado.
    const regla = reglaActivaPara(rewardRules, 'REFERIDO_AMIGO');
    const { premiar, referidorId } = decidirPremioReferido({
      socia: socios.find(s => s.id === socioId),
      reservasTrasCheckin: reservasActuales,
      rewardActions,
      topeMensual: regla?.topeMensual ?? null,
      ahora: new Date(),
    });
    if (premiar && referidorId) otorgarCreditos(referidorId, 'REFERIDO_AMIGO', socioId);
  }

  function checkin(reservaId: string) {
    if (publicSlug) {
      // Kiosk público: el check-in (ASISTIDA + créditos + premio de referido) lo
      // hace el servidor; se re-sincroniza al terminar.
      setReservas(prev => prev.map(r => r.id === reservaId ? { ...r, estado: 'ASISTIDA' as const, checkInEn: new Date().toISOString() } : r)); // optimista
      postPublico('/api/public/checkin', { studioId: studioIdOverride ?? '', reservaId });
      return;
    }
    const checkInEn = new Date().toISOString();
    const reservasActualizadas = reservas.map(r =>
      r.id === reservaId ? { ...r, estado: 'ASISTIDA' as const, checkInEn } : r
    );
    setReservas(reservasActualizadas);
    dbUpdateReserva(reservaId, { estado: 'ASISTIDA', checkInEn });
    const reserva = reservas.find(r => r.id === reservaId);
    if (!reserva) return;
    otorgarCreditos(reserva.socioId, 'ASISTENCIA_CLASE', reservaId);
    evaluarLogrosSocio(reserva.socioId, reservasActualizadas);
    evaluarRetosSocio(reserva.socioId, reservasActualizadas);
    // Racha: si esta es la primera clase de la semana, se premia "semana
    // completa" — refId por semana evita otorgarlo dos veces la misma semana.
    const racha = calcularRacha(reservasActualizadas.filter(r => r.socioId === reserva.socioId), sesiones, new Date());
    if (racha.semanas > 0) {
      otorgarCreditos(reserva.socioId, 'SEMANA_COMPLETA', `${reserva.socioId}:${racha.claveSemanaActual}`);
    }
    // Premio a quien la trajo, si esta es su primera clase y hay tope disponible.
    premiarReferidoSiProcede(reserva.socioId, reservasActualizadas);
    // Nota: la sesión del bono ya se descuenta al confirmar la reserva
    // (ver consumirSesionBono en addReserva), no en el check-in, para evitar
    // el doble cobro y para que el saldo refleje las plazas ya comprometidas.
  }

  // Marca manualmente una reserva como NO_ASISTIO (recepción, cuando la socia no
  // se presenta). No devuelve bono: la sesión ya se consumió al reservar. El
  // barrido automático (cron no-shows) hace lo mismo para las que se olvidan.
  function marcarNoShow(reservaId: string) {
    setReservas(prev => prev.map(r => r.id === reservaId ? { ...r, estado: 'NO_ASISTIO' as const, checkInEn: null } : r));
    dbUpdateReserva(reservaId, { estado: 'NO_ASISTIO', checkInEn: null });
  }

  // Deshacer un NO_ASISTIO (marcado por error) → vuelve a CONFIRMADA.
  function revertirNoShow(reservaId: string) {
    setReservas(prev => prev.map(r => r.id === reservaId ? { ...r, estado: 'CONFIRMADA' as const, checkInEn: null } : r));
    dbUpdateReserva(reservaId, { estado: 'CONFIRMADA', checkInEn: null });
  }

  // Deshacer un check-in hecho por error (I-4): revierte la asistencia
  // (ASISTIDA → CONFIRMADA, borra checkInEn) para que recepción corrija un clic
  // en la socia equivocada. NO retira los créditos ya otorgados en el check-in:
  // el dedup UNIQUE(studio_id, trigger, ref_id) evita el doble crédito si se
  // vuelve a hacer check-in de la misma reserva. La reversión del ledger de
  // gamificación (logros/retos/premio de referido) queda fuera de alcance.
  function deshacerCheckin(reservaId: string) {
    setReservas(prev => prev.map(r => r.id === reservaId && r.estado === 'ASISTIDA'
      ? { ...r, estado: 'CONFIRMADA' as const, checkInEn: null } : r));
    dbUpdateReserva(reservaId, { estado: 'CONFIRMADA', checkInEn: null });
  }

  // Detectar planes MENSUAL caducados al cargar (una vez por sesión)
  useEffect(() => {
    const hoy = new Date().toISOString().slice(0, 10);
    suscripciones.forEach(sus => {
      if (sus.estado !== 'ACTIVA' || !sus.fechaFin) return;
      if (sus.fechaFin >= hoy) return;
      const plan = planesTarifa.find(p => p.id === sus.planId);
      if (!plan || plan.tipo !== 'MENSUAL') return;
      const yaHayReciboPendiente = recibos.some(
        r => r.socioId === sus.socioId && r.suscripcionId === sus.id && r.estado === 'PENDIENTE'
      );
      if (yaHayReciboPendiente) return;
      const socio = socios.find(s => s.id === sus.socioId);
      const nombreSocio = socio ? `${socio.nombre} ${socio.apellidos}` : 'Socia';
      const reciboVencido: Recibo = {
        id: `rec-venc-${uid()}`,
        studioId: getCurrentStudioId(),
        socioId: sus.socioId,
        suscripcionId: sus.id,
        concepto: `Renovación ${plan.nombre}`,
        importe: plan.precio,
        estado: 'PENDIENTE',
        fechaVencimiento: sus.fechaFin,
        fechaCobro: null,
        fechaDevolucion: null,
        intentosReintento: 0,
      };
      setRecibos(prev => {
        if (prev.some(r => r.id === reciboVencido.id)) return prev;
        dbInsertRecibo(reciboVencido);
        return [reciboVencido, ...prev];
      });
      setNotificaciones(prev => [{
        id: `notif-venc-${uid()}`,
        studioId: getCurrentStudioId(),
        titulo: 'Plan mensual caducado',
        texto: `${nombreSocio} — ${plan.nombre} venció el ${sus.fechaFin}. Se ha generado recibo de renovación.`,
        leida: false,
        tipo: 'AVISO' as const,
        enlace: `/socios/${sus.socioId}`,
        creadaEn: new Date().toISOString(),
      }, ...prev]);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function liberarSpot(reservaId: string) {
    setReservas(prev => prev.map(r =>
      r.id === reservaId ? { ...r, spotId: null } : r
    ));
    dbUpdateReserva(reservaId, { spotId: null });
  }

  function asignarSpot(sesionId: string, socioId: string, spotId: string) {
    const reserva = reservas.find(r => r.sesionId === sesionId && r.socioId === socioId);
    setReservas(prev => prev.map(r =>
      r.sesionId === sesionId && r.socioId === socioId ? { ...r, spotId } : r
    ));
    if (reserva) dbUpdateReserva(reserva.id, { spotId });
  }

  // ── Recibos ──────────────────────────────────────────────────────────────────

  function addRecibo(fields: Omit<Recibo, 'id' | 'studioId' | 'estado' | 'fechaCobro' | 'fechaDevolucion' | 'intentosReintento'>) {
    const nuevo: Recibo = {
      id: `rec-${uid()}`,
      studioId: getCurrentStudioId(),
      estado: 'PENDIENTE',
      fechaCobro: null,
      fechaDevolucion: null,
      intentosReintento: 0,
      ...fields,
    };
    setRecibos(prev => [...prev, nuevo]);
    dbInsertRecibo(nuevo);
  }

  // I15: lógica de cobro extraída para que marcarCobrado y cobrarTodosPendientes
  // NO dupliquen el refill de bono / extensión mensual ni el build+sellado de
  // factura (antes copiados en ambas, con riesgo de divergencia — p. ej. el guard
  // `sesionesRestantes === 0`). Ambos helpers operan sobre UN recibo ya cobrado y
  // leen `suscripciones`/`planesTarifa`/`facturas` del snapshot actual, igual que
  // antes, así que el comportamiento es idéntico.

  // Refill del bono agotado o extensión del mensual al cobrar su renovación.
  function aplicarRenovacionSuscripcion(recibo: Recibo) {
    if (!recibo.suscripcionId) return;
    const sus = suscripciones.find(s => s.id === recibo.suscripcionId);
    if (!sus) return;
    const plan = planesTarifa.find(p => p.id === sus.planId);
    if (!plan) return;
    if ((plan.tipo === 'BONO' || plan.tipo === 'PUNTUAL') && sus.sesionesRestantes === 0) {
      setSuscripciones(prev => prev.map(s =>
        s.id === sus.id ? { ...s, sesionesRestantes: plan.sesiones, estado: 'ACTIVA' as const } : s
      ));
      dbUpdateSuscripcion(sus.id, { sesionesRestantes: plan.sesiones, estado: 'ACTIVA' });
    } else if (plan.tipo === 'MENSUAL') {
      const nuevaFin = new Date();
      nuevaFin.setMonth(nuevaFin.getMonth() + 1);
      const fechaFin = nuevaFin.toISOString().slice(0, 10);
      setSuscripciones(prev => prev.map(s =>
        s.id === sus.id ? { ...s, fechaFin, estado: 'ACTIVA' as const } : s
      ));
      dbUpdateSuscripcion(sus.id, { fechaFin, estado: 'ACTIVA' });
    }
  }

  // Construye y sella la factura de un recibo cobrado si aún no existe (dedup por
  // reciboId sobre las facturas actuales). Devuelve la factura nueva, o null si ya
  // había una. La sella (side effect) igual que antes.
  function construirFacturaCobro(reciboCobrado: Recibo, facturasActuales: Factura[]): Factura | null {
    if (facturasActuales.some(f => f.reciboId === reciboCobrado.id)) return null;
    const fac = buildFactura(reciboCobrado, facturasActuales);
    void sellarFacturaYActualizar(fac);
    return fac;
  }

  function marcarCobrado(reciboId: string) {
    const fechaCobro = new Date().toISOString();
    setRecibos(prev => prev.map(r =>
      r.id === reciboId ? { ...r, estado: 'COBRADO' as const, fechaCobro } : r
    ));
    dbUpdateRecibo(reciboId, { estado: 'COBRADO', fechaCobro });
    setFacturas(prev => {
      const recibo = recibos.find(r => r.id === reciboId) ??
        { id: reciboId, importe: 0, socioId: '', studioId: getCurrentStudioId(), suscripcionId: null, concepto: '', estado: 'PENDIENTE' as const, fechaVencimiento: new Date().toISOString(), fechaCobro: null, fechaDevolucion: null, intentosReintento: 0 };
      const updatedRecibo = { ...recibo, estado: 'COBRADO' as const, fechaCobro: new Date().toISOString() };
      const fac = construirFacturaCobro(updatedRecibo, prev);
      return fac ? [...prev, fac] : prev;
    });
    // Refill bono or extend mensual when renewal payment is collected
    const recibo = recibos.find(r => r.id === reciboId);
    if (recibo) aplicarRenovacionSuscripcion(recibo);
    if (recibo) {
      const socio = socios.find(s => s.id === recibo.socioId);
      addActividadReciente(
        'COBRO_MANUAL',
        `${actorNombre ?? 'Alguien'} marcó como cobrado "${recibo.concepto}" (${recibo.importe} €) de ${socio?.nombre ?? 'una socia'}`,
        recibo.socioId ?? undefined,
        recibo.socioId ? `/socios/${recibo.socioId}` : undefined
      );
      if (recibo.concepto.startsWith('Renovación') && recibo.socioId) {
        otorgarCreditos(recibo.socioId, 'RENOVACION_PLAN', reciboId);
      }
    }
  }

  function marcarDevuelto(reciboId: string) {
    const fechaDev = new Date().toISOString();
    setRecibos(prev => prev.map(r =>
      r.id === reciboId ? { ...r, estado: 'DEVUELTO' as const, fechaDevolucion: fechaDev } : r
    ));
    dbUpdateRecibo(reciboId, { estado: 'DEVUELTO', fechaDevolucion: fechaDev });
  }

  function reintentar(reciboId: string) {
    setRecibos(prev => prev.map(r => {
      if (r.id !== reciboId) return r;
      const updated = { ...r, estado: 'EN_CURSO' as const, intentosReintento: r.intentosReintento + 1 };
      dbUpdateRecibo(reciboId, { estado: 'EN_CURSO', intentosReintento: updated.intentosReintento });
      return updated;
    }));
  }

  function deleteRecibo(id: string) {
    setRecibos(prev => prev.filter(r => r.id !== id));
    dbDeleteRecibo(id);
  }

  function cobrarTodosPendientes(socioId?: string) {
    // Con socioId, cobra SOLO los pendientes de esa socia (botón de la ficha de
    // socia). Sin él, cobra todos los del estudio (dashboard / página de Pagos).
    // Antes ignoraba cualquier filtro y desde la ficha cobraba —y sellaba una
    // factura irreversible de— TODO el estudio (hallazgo C-3).
    const pendientes = recibos.filter(r => r.estado === 'PENDIENTE' && (!socioId || r.socioId === socioId));
    const idsPendientes = new Set(pendientes.map(r => r.id));
    const fechaCobro = new Date().toISOString();
    setRecibos(prev => prev.map(r =>
      idsPendientes.has(r.id) ? { ...r, estado: 'COBRADO' as const, fechaCobro } : r
    ));
    // Un solo UPDATE en lote (antes: un dbUpdateRecibo por recibo — hasta ~120
    // round-trips secuenciales para cobrar 40 recibos pendientes).
    dbUpdateRecibosBatch(pendientes.map(r => r.id), { estado: 'COBRADO', fechaCobro });
    setFacturas(prev => {
      let current = [...prev];
      for (const recibo of pendientes) {
        const cobrado = { ...recibo, estado: 'COBRADO' as const, fechaCobro };
        const fac = construirFacturaCobro(cobrado, current);
        if (fac) current = [...current, fac];
      }
      return current;
    });
    // Refill bonos / extend mensual for every recibo being paid
    for (const recibo of pendientes) {
      aplicarRenovacionSuscripcion(recibo);
    }
  }

  // ── Citas ────────────────────────────────────────────────────────────────────

  function addCita(fields: Omit<Cita, 'id' | 'studioId' | 'creadoEn'>) {
    const nueva: Cita = {
      id: `cita-${uid()}`,
      studioId: getCurrentStudioId(),
      creadoEn: new Date().toISOString(),
      ...fields,
    };
    setCitas(prev => [...prev, nueva]);
    dbInsertCita(nueva);
  }

  function updateCita(id: string, changes: Partial<Cita>) {
    setCitas(prev => prev.map(c => c.id === id ? { ...c, ...changes } : c));
    dbUpdateCita(id, changes);
  }

  function cancelarCita(citaId: string) {
    setCitas(prev => prev.map(c =>
      c.id === citaId ? { ...c, estado: 'CANCELADA' as const } : c
    ));
    dbUpdateCita(citaId, { estado: 'CANCELADA' });
  }

  function completarCita(citaId: string) {
    setCitas(prev => prev.map(c =>
      c.id === citaId ? { ...c, estado: 'COMPLETADA' as const } : c
    ));
    dbUpdateCita(citaId, { estado: 'COMPLETADA' });
  }

  // ── POS ──────────────────────────────────────────────────────────────────────

  function addProductoPOS(fields: Omit<ProductoPOS, 'id' | 'studioId'>) {
    const nuevo: ProductoPOS = { id: `pos-${uid()}`, studioId: getCurrentStudioId(), ...fields };
    setProductosPOS(prev => [...prev, nuevo]);
    dbInsertProductoPOS(nuevo);
  }

  function updateProductoPOS(id: string, changes: Partial<ProductoPOS>) {
    setProductosPOS(prev => prev.map(p => p.id === id ? { ...p, ...changes } : p));
    dbUpdateProductoPOS(id, changes);
  }

  function deleteProductoPOS(id: string) {
    setProductosPOS(prev => prev.filter(p => p.id !== id));
    dbDeleteProductoPOS(id);
  }

  function addVentaPOS(fields: Omit<VentaPOS, 'id' | 'studioId' | 'realizadaEn'>) {
    const nueva: VentaPOS = {
      id: `vpos-${uid()}`,
      studioId: getCurrentStudioId(),
      realizadaEn: new Date().toISOString(),
      ...fields,
    };
    setVentasPOS(prev => [...prev, nueva]);
    dbInsertVentaPOS(nueva);

    // Toda venta con importe genera un recibo COBRADO + su factura (aparece en
    // Pagos/Facturas). Sin socia es una venta de mostrador → factura
    // simplificada (F2, sin NIF); con socia y NIF, factura completa (F1).
    if (fields.total > 0) {
      const concepto = fields.items.length > 0
        ? fields.items.map(i => i.nombre).join(', ')
        : 'Venta POS';
      const hoy = new Date().toISOString().slice(0, 10);
      const nuevoRecibo: Recibo = {
        id: `rec-pos-${uid()}`,
        studioId: getCurrentStudioId(),
        socioId: fields.socioId ?? null,
        suscripcionId: null,
        concepto,
        importe: fields.total,
        estado: 'COBRADO',
        fechaVencimiento: hoy,
        fechaCobro: new Date().toISOString(),
        fechaDevolucion: null,
        intentosReintento: 0,
      };
      setRecibos(prev => [nuevoRecibo, ...prev]);
      dbInsertRecibo(nuevoRecibo);
      setFacturas(prev => {
        const fac = buildFactura(nuevoRecibo, prev);
        void sellarFacturaYActualizar(fac);
        return [...prev, fac];
      });
    }
  }

  // ── Campañas ─────────────────────────────────────────────────────────────────

  function addCampana(fields: Omit<Campana, 'id' | 'studioId' | 'creadaEn' | 'enviados' | 'abiertos' | 'clics'>) {
    const nueva: Campana = {
      id: `camp-${uid()}`,
      studioId: getCurrentStudioId(),
      creadaEn: new Date().toISOString(),
      enviados: 0,
      abiertos: 0,
      clics: 0,
      ...fields,
    };
    setCampanas(prev => [nueva, ...prev]);
    dbInsertCampana(nueva);
  }

  function deleteCampana(id: string) {
    setCampanas(prev => prev.filter(c => c.id !== id));
    dbDeleteCampana(id);
  }

  function duplicateCampana(campana: Campana) {
    const copy: Campana = {
      ...campana,
      id: `camp-${uid()}`,
      nombre: `Copia de ${campana.nombre}`,
      estado: 'BORRADOR',
      enviados: 0,
      abiertos: 0,
      clics: 0,
      enviadaEn: null,
      programadaEn: null,
      creadaEn: new Date().toISOString(),
    };
    setCampanas(prev => [copy, ...prev]);
    dbInsertCampana(copy);
  }

  // Actualiza campos de una campaña (usado para el ciclo de vida:
  // pausar/reanudar/finalizar → cambios de `estado`). Persiste en BD con el
  // mismo helper que ya usa el envío.
  function updateCampana(id: string, patch: Partial<Campana>) {
    setCampanas(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
    dbUpdateCampana(id, patch);
  }

  // Resuelve las destinatarias de una campaña a partir de su segmento.
  function resolverDestinatariasCampana(destinatarios: DestinatariosCampana): Socio[] {
    const conSusActiva = new Set(
      suscripciones.filter(s => s.estado === 'ACTIVA').map(s => s.socioId)
    );
    switch (destinatarios) {
      case 'ACTIVAS': return socios.filter(s => s.activo !== false);
      case 'INACTIVAS': return socios.filter(s => s.activo === false);
      case 'SIN_PLAN': return socios.filter(s => !conSusActiva.has(s.id));
      case 'BONO': return socios.filter(s => conSusActiva.has(s.id));
      case 'VIP': return socios.filter(s => s.tags?.includes('VIP'));
      case 'TODAS':
      default: return socios;
    }
  }

  // Envía una campaña de verdad y la marca como ENVIADA con el recuento real.
  // Enruta por canal: EMAIL → Resend (necesita email); WHATSAPP/SMS → Twilio
  // (necesita teléfono). Sin el canal configurado en servidor, cada envío falla
  // con gracia (503) y el recuento refleja lo que sí salió.
  async function enviarCampana(campana: Campana): Promise<{ enviados: number; total: number }> {
    const canal = campana.tipo;
    const base = resolverDestinatariasCampana(campana.destinatarios);
    const destinatarias = canal === 'EMAIL'
      ? base.filter(s => s.email && s.email.includes('@'))
      : base.filter(s => s.telefono && s.telefono.trim());

    // P0-24: antes era un for...await secuencial (un round-trip a la vez → horas
    // con muchas destinatarias). Concurrencia acotada: más rápido y sin saturar.
    // (El fix definitivo a escala masiva es una cola en servidor.)
    const resultados = await mapLimit(destinatarias, 8, socio =>
      canal === 'EMAIL'
        ? enviarEmailCampana({
            to: socio.email!,
            toName: `${socio.nombre} ${socio.apellidos}`.trim(),
            asunto: campana.asunto,
            contenido: campana.contenido,
          })
        : enviarMensajeCampana({
            canal,
            to: socio.telefono!,
            asunto: campana.asunto,
            contenido: campana.contenido,
          }),
    );
    const enviados = resultados.filter(Boolean).length;

    const enviadaEn = new Date().toISOString();
    setCampanas(prev => prev.map(c =>
      c.id === campana.id
        ? { ...c, estado: 'ENVIADA' as const, enviados, enviadaEn }
        : c
    ));
    dbUpdateCampana(campana.id, { estado: 'ENVIADA', enviados, enviadaEn });
    addActividadReciente(
      'MENSAJE_ENVIADO',
      `Campaña "${campana.nombre}" (${canal}) enviada a ${enviados} de ${destinatarias.length} destinatarias`,
      undefined,
      '/marketing',
    );
    return { enviados, total: destinatarias.length };
  }

  // ── Automatizaciones ─────────────────────────────────────────────────────────

  function addAutomatizacion(fields: Omit<Automatizacion, 'id' | 'studioId' | 'ejecutadas' | 'creadaEn'>) {
    const nueva: Automatizacion = {
      id: `auto-${uid()}`,
      studioId: getCurrentStudioId(),
      ejecutadas: 0,
      creadaEn: new Date().toISOString(),
      ...fields,
    };
    setAutomatizaciones(prev => [nueva, ...prev]);
    dbInsertAutomatizacion(nueva);
  }

  function updateAutomatizacion(id: string, patch: Partial<Automatizacion>) {
    setAutomatizaciones(prev => prev.map(a => (a.id === id ? { ...a, ...patch } : a)));
    dbUpdateAutomatizacion(id, patch);
  }

  function deleteAutomatizacion(id: string) {
    setAutomatizaciones(prev => prev.filter(a => a.id !== id));
    dbDeleteAutomatizacion(id);
  }

  function toggleAutomatizacion(autoId: string) {
    const actual = automatizaciones.find(a => a.id === autoId);
    setAutomatizaciones(prev => prev.map(a =>
      a.id === autoId ? { ...a, activa: !a.activa } : a
    ));
    if (actual) dbUpdateAutomatizacion(autoId, { activa: !actual.activa });
  }

  // ── Códigos de descuento ──────────────────────────────────────────────────────

  // Códigos de descuento: extraídos a useDiscountCodesStore (Fase B).

  // ── Actividad reciente ────────────────────────────────────────────────────────

  function addActividadReciente(tipo: TipoActividad, texto: string, socioId?: string, enlace?: string) {
    // Sin sesión de Supabase Auth no hay a quién atribuir la acción — pasa
    // en el portal de miembros (login propio por email, no Supabase Auth) y
    // al navegar el dashboard sin iniciar sesión. Además esta tabla exige
    // "authenticated" en RLS, así que escribir aquí sin sesión solo daría
    // un 401 silencioso.
    if (!user) return;
    const nueva: ActividadReciente = {
      id: `act-${uid()}`,
      studioId: getCurrentStudioId(),
      tipo,
      texto,
      socioId: socioId ?? null,
      enlace: enlace ?? null,
      creadoEn: new Date().toISOString(),
      actorNombre,
    };
    setActividadReciente(prev => [nueva, ...prev]);
    dbInsertActividadReciente(nueva);
  }

  // ── Chat de equipo ────────────────────────────────────────────────────────────
  // Desacoplado del provider: vive en useTeamChat (lib/stores/use-team-chat-store)
  // y lo consume directamente la página del chat.

  // ── Preferencias del alumno (portal de miembros) ──────────────────────────────

  // Preferencias de la socia: extraídas a useMemberPrefsStore (Fase B).

  // ── Gamificación: créditos y recompensas ──────────────────────────────────────
  // El valor de cada acción SIEMPRE sale de rewardRules (configurable por el
  // estudio) — otorgarCreditos nunca usa un número fijo.

  function otorgarCreditos(socioId: string, trigger: RewardTrigger, refId: string | null, descripcionOverride?: string) {
    const studioId = getCurrentStudioId();
    // Decisión pura y testeada (reward-engine): regla activa con créditos > 0 y
    // no otorgado ya para este refId (idempotencia).
    const { otorgar, regla } = decidirOtorgarCreditos(rewardRules, rewardActions, trigger, refId);
    if (!otorgar || !regla) return;

    const now = new Date().toISOString();
    const action: RewardAction = { id: `rwa-${uid()}`, studioId, socioId, trigger, refId, creadoEn: now };
    const historyEntry: RewardHistory = {
      id: `rwh-${uid()}`, studioId, socioId, ruleId: regla.id, actionId: action.id,
      creditos: regla.creditos, descripcion: descripcionOverride ?? regla.nombre, creadoEn: now,
    };
    const transaccion: CreditTransaction = {
      id: `ctx-${uid()}`, studioId, socioId, tipo: 'GANANCIA', creditos: regla.creditos,
      descripcion: historyEntry.descripcion, refId, creadoEn: now,
    };

    setRewardActions(prev => [...prev, action]);
    setRewardHistory(prev => [historyEntry, ...prev]);
    setCreditTransactions(prev => [transaccion, ...prev]);
    setMemberCredits(prev => {
      const existente = prev.find(m => m.socioId === socioId);
      const actualizado = aplicarGananciaCreditos(existente, socioId, studioId, regla.creditos, now);
      return existente ? prev.map(m => m.socioId === socioId ? actualizado : m) : [...prev, actualizado];
    });
    (async () => {
      const ok = await dbInsertRewardAction(action);
      // C3: el UNIQUE (studio_id, trigger, ref_id) es el cerrojo real contra
      // duplicados. El ajuste de saldo va DESPUÉS de ganarlo —si la inserción
      // choca con el cerrojo (doble pestaña/kiosko, snapshot obsoleto), NO se
      // otorga nada. Antes el saldo se incrementaba incondicionalmente y solo se
      // frenaban history/tx → créditos de fidelidad duplicados. Espejo del servidor.
      if (!ok) return;
      // P0-20: incremento atómico en la BD (fuera del updater para no doblarlo).
      await dbAjustarCreditos(socioId, studioId, regla.creditos, regla.creditos, 0);
      dbInsertRewardHistory(historyEntry);
      dbInsertCreditTransaction(transaccion);
    })();
  }

  function saldoCreditos(socioId: string): number {
    return memberCredits.find(m => m.socioId === socioId)?.saldo ?? 0;
  }

  function rachaSocio(socioId: string) {
    return calcularRacha(reservas.filter(r => r.socioId === socioId), sesiones, new Date());
  }

  function addRewardRule(fields: Omit<RewardRule, 'id' | 'studioId' | 'creadoEn' | 'topeMensual'> & { topeMensual?: number | null }) {
    const nueva: RewardRule = { topeMensual: null, ...fields, id: `rwr-${uid()}`, studioId: getCurrentStudioId(), creadoEn: new Date().toISOString() };
    setRewardRules(prev => [...prev, nueva]);
    dbInsertRewardRule(nueva);
  }

  function updateRewardRule(id: string, changes: Partial<Omit<RewardRule, 'id' | 'studioId'>>) {
    setRewardRules(prev => prev.map(r => r.id === id ? { ...r, ...changes } : r));
    dbUpdateRewardRule(id, changes);
  }

  function addRewardCatalogItem(fields: Omit<RewardCatalogItem, 'id' | 'studioId' | 'creadoEn'>) {
    const nuevo: RewardCatalogItem = { ...fields, id: `rwc-${uid()}`, studioId: getCurrentStudioId(), creadoEn: new Date().toISOString() };
    setRewardCatalog(prev => [...prev, nuevo]);
    dbInsertRewardCatalogItem(nuevo);
  }

  function updateRewardCatalogItem(id: string, changes: Partial<Omit<RewardCatalogItem, 'id' | 'studioId'>>) {
    setRewardCatalog(prev => prev.map(c => c.id === id ? { ...c, ...changes } : c));
    dbUpdateRewardCatalogItem(id, changes);
  }

  function deleteRewardCatalogItem(id: string) {
    setRewardCatalog(prev => prev.filter(c => c.id !== id));
    dbDeleteRewardCatalogItem(id);
  }

  function canjearRecompensa(socioId: string, catalogItemId: string): { ok: true } | { error: string } {
    const item = rewardCatalog.find(c => c.id === catalogItemId);
    // Validación pura y testeada (reward-engine): disponibilidad, stock y saldo.
    const validacion = validarCanje(item, saldoCreditos(socioId));
    if ('error' in validacion) return validacion;
    if (!item) return { error: 'Esta recompensa ya no está disponible.' };

    const cpub = ctxPublico();
    if (cpub) {
      // El canje real (descuento + registro) lo hace el servidor; validamos en
      // cliente para el feedback inmediato y recargamos.
      postPublico('/api/public/canje', { studioId: cpub.studioId, socioId: cpub.socioId, email: cpub.email, catalogItemId });
      return { ok: true };
    }

    const studioId = getCurrentStudioId();
    const now = new Date().toISOString();
    const redemption: RewardRedemption = {
      id: `rwd-${uid()}`, studioId, socioId, catalogItemId, creditosGastados: item.costeCreditos,
      estado: 'PENDIENTE', creadoEn: now,
    };
    const transaccion: CreditTransaction = {
      id: `ctx-${uid()}`, studioId, socioId, tipo: 'CANJE', creditos: -item.costeCreditos,
      descripcion: `Canje: ${item.nombre}`, refId: redemption.id, creadoEn: now,
    };

    // C4: secuencia ATÓMICA con rollback (espejo de canjeRecompensaServidor).
    // Antes las cuatro escrituras eran fire-and-forget: si el débito de saldo
    // fallaba por gasto concurrente (SALDO_INSUFICIENTE), la fila de canje y el
    // stock YA se habían escrito → la socia se quedaba la recompensa sin pagar.
    // Ahora: (1) reservar stock, (2) debitar saldo con guard —si falla, DEVOLVER
    // el stock—, (3) solo entonces persistir canje/tx. La UI se aplica sobre lo ya
    // confirmado en BD, así que no diverge en el error.
    (async () => {
      const stockLimitado = item.stock != null;
      if (stockLimitado) {
        const s = await dbAjustarStock(catalogItemId, studioId, -1);
        if ('error' in s) {
          setDbError({ msg: 'Esta recompensa está agotada.', key: Date.now() });
          return;
        }
      }
      const c = await dbAjustarCreditos(socioId, studioId, -item.costeCreditos, 0, item.costeCreditos);
      if ('error' in c) {
        if (stockLimitado) await dbAjustarStock(catalogItemId, studioId, 1); // devolver stock reservado
        setDbError({ msg: c.error === 'Saldo insuficiente' ? 'Saldo insuficiente para este canje.' : 'No se pudo completar el canje.', key: Date.now() });
        return;
      }
      // Confirmado en BD → registrar canje/tx y reflejar en la UI.
      dbInsertRewardRedemption(redemption);
      dbInsertCreditTransaction(transaccion);
      setRewardRedemptions(prev => [redemption, ...prev]);
      setCreditTransactions(prev => [transaccion, ...prev]);
      setMemberCredits(prev => prev.map(m => m.socioId === socioId
        ? aplicarCanjeCreditos(m, socioId, studioId, item.costeCreditos, now)
        : m));
      if (stockLimitado) {
        setRewardCatalog(prev => prev.map(c => c.id === catalogItemId ? { ...c, stock: (c.stock ?? 1) - 1 } : c));
      }
    })();

    return { ok: true };
  }

  function updateRewardRedemptionEstado(id: string, estado: RewardRedemption['estado']) {
    setRewardRedemptions(prev => prev.map(r => r.id === id ? { ...r, estado } : r));
    dbUpdateRewardRedemption(id, { estado });
  }

  // ── Gamificación: logros ──────────────────────────────────────────────────────
  // El umbral de cada logro SIEMPRE sale de achievementDefinitions — nunca un
  // número fijo aquí. Se reevalúa el progreso de una socia tras cualquier
  // acción que pueda mover una métrica (check-in, nueva reserva...).

  function addAchievementDefinition(fields: Omit<AchievementDefinition, 'id' | 'studioId' | 'creadoEn'>) {
    const nueva: AchievementDefinition = { ...fields, id: `ach-${uid()}`, studioId: getCurrentStudioId(), creadoEn: new Date().toISOString() };
    setAchievementDefinitions(prev => [...prev, nueva]);
    dbInsertAchievementDefinition(nueva);
  }

  function updateAchievementDefinition(id: string, changes: Partial<Omit<AchievementDefinition, 'id' | 'studioId'>>) {
    setAchievementDefinitions(prev => prev.map(a => a.id === id ? { ...a, ...changes } : a));
    dbUpdateAchievementDefinition(id, changes);
  }

  function evaluarLogrosSocio(socioId: string, reservasOverride?: Reserva[]) {
    const now = new Date();
    const studioId = getCurrentStudioId();
    const socio = socios.find(s => s.id === socioId);
    // reservasOverride: quien llama justo acaba de hacer setReservas(...) en
    // este mismo tick — el `reservas` del closure todavía no lo refleja (los
    // set de React no aplican de forma síncrona), así que se puede pasar la
    // lista ya actualizada para no evaluar logros con datos de un paso atrás.
    const misReservas = (reservasOverride ?? reservas).filter(r => r.socioId === socioId);

    achievementDefinitions.filter(def => def.activo).forEach(def => {
      const progresoExistente = achievementProgress.find(p => p.socioId === socioId && p.achievementId === def.id);
      if (progresoExistente?.completado) return; // ya conseguido, no se re-evalúa

      const valor = calcularMetrica(def.metric, { reservas: misReservas, sesiones, socio, now, todosLosSocios: socios });
      const completadoAhora = valor >= def.umbral;
      const progresoActualizado: AchievementProgress = progresoExistente
        ? { ...progresoExistente, progresoActual: valor, completado: completadoAhora, completadoEn: completadoAhora ? now.toISOString() : null }
        : { id: `achp-${uid()}`, studioId, socioId, achievementId: def.id, progresoActual: valor, completado: completadoAhora, completadoEn: completadoAhora ? now.toISOString() : null };

      setAchievementProgress(prev => progresoExistente
        ? prev.map(p => p.id === progresoExistente.id ? progresoActualizado : p)
        : [...prev, progresoActualizado]);
      dbUpsertAchievementProgress(progresoActualizado);

      if (!completadoAhora) return;

      const entry: AchievementHistory = {
        id: `achh-${uid()}`, studioId, socioId, achievementId: def.id, nombre: def.nombre, icono: def.icono, creadoEn: now.toISOString(),
      };
      setAchievementHistory(prev => [entry, ...prev]);
      dbInsertAchievementHistory(entry);

      if (def.creditosRecompensa > 0) {
        const transaccion: CreditTransaction = {
          id: `ctx-${uid()}`, studioId, socioId, tipo: 'GANANCIA', creditos: def.creditosRecompensa,
          descripcion: `Logro desbloqueado: ${def.nombre}`, refId: def.id, creadoEn: now.toISOString(),
        };
        setCreditTransactions(prev => [transaccion, ...prev]); // optimista (se reconcilia al sincronizar)
        setMemberCredits(prev => {
          const existente = prev.find(m => m.socioId === socioId);
          const actualizado: MemberCredits = existente
            ? { ...existente, saldo: existente.saldo + def.creditosRecompensa, totalGanado: existente.totalGanado + def.creditosRecompensa, actualizadoEn: now.toISOString() }
            : { socioId, studioId, saldo: def.creditosRecompensa, totalGanado: def.creditosRecompensa, totalCanjeado: 0, actualizadoEn: now.toISOString() };
          return existente ? prev.map(m => m.socioId === socioId ? actualizado : m) : [...prev, actualizado];
        });
        // C-11: idempotencia REAL en BD vía el UNIQUE de reward_actions. Sin
        // esto, dos evaluaciones (doble check-in, o eval antes de sincronizar el
        // progreso) doblaban el saldo PERSISTIDO — la fila de progreso se
        // deduplicaba, pero la concesión de crédito no.
        void (async () => {
          const primeraVez = await dbClaimRecompensaUnica(studioId, socioId, 'LOGRO', `${socioId}:${def.id}`);
          if (!primeraVez) return; // otra evaluación ya otorgó este logro
          dbInsertCreditTransaction(transaccion);
          dbAjustarCreditos(socioId, studioId, def.creditosRecompensa, def.creditosRecompensa, 0); // P0-20 atómico
        })();
      }
    });
  }

  // ── Gamificación: niveles ──────────────────────────────────────────────────────
  // El nivel se calcula sobre el total histórico ganado (memberCredits.totalGanado),
  // nunca sobre el saldo — así canjear recompensas no hace bajar de nivel.

  function nivelSocio(socioId: string): NivelInfo {
    const totalGanado = memberCredits.find(m => m.socioId === socioId)?.totalGanado ?? 0;
    return calcularNivel(levelDefinitions, totalGanado);
  }

  function addLevelDefinition(fields: Omit<LevelDefinition, 'id' | 'studioId' | 'creadoEn'>) {
    const nuevo: LevelDefinition = { ...fields, id: `lvl-${uid()}`, studioId: getCurrentStudioId(), creadoEn: new Date().toISOString() };
    setLevelDefinitions(prev => [...prev, nuevo]);
    dbInsertLevelDefinition(nuevo);
  }

  function updateLevelDefinition(id: string, changes: Partial<Omit<LevelDefinition, 'id' | 'studioId'>>) {
    setLevelDefinitions(prev => prev.map(l => l.id === id ? { ...l, ...changes } : l));
    dbUpdateLevelDefinition(id, changes);
  }

  function deleteLevelDefinition(id: string) {
    setLevelDefinitions(prev => prev.filter(l => l.id !== id));
    dbDeleteLevelDefinition(id);
  }

  // ── Gamificación: retos ────────────────────────────────────────────────────────
  // A diferencia de un logro, un reto tiene fechaInicio/fechaFin — solo cuenta
  // lo ocurrido dentro de esa ventana (ver lib/engines/challenge-engine.ts).

  function addChallengeDefinition(fields: Omit<ChallengeDefinition, 'id' | 'studioId' | 'creadoEn'>) {
    const nuevo: ChallengeDefinition = { ...fields, id: `cha-${uid()}`, studioId: getCurrentStudioId(), creadoEn: new Date().toISOString() };
    setChallengeDefinitions(prev => [...prev, nuevo]);
    dbInsertChallengeDefinition(nuevo);
  }

  function updateChallengeDefinition(id: string, changes: Partial<Omit<ChallengeDefinition, 'id' | 'studioId'>>) {
    setChallengeDefinitions(prev => prev.map(c => c.id === id ? { ...c, ...changes } : c));
    dbUpdateChallengeDefinition(id, changes);
  }

  function deleteChallengeDefinition(id: string) {
    setChallengeDefinitions(prev => prev.filter(c => c.id !== id));
    dbDeleteChallengeDefinition(id);
  }

  function evaluarRetosSocio(socioId: string, reservasOverride?: Reserva[]) {
    const now = new Date();
    const studioId = getCurrentStudioId();
    const socio = socios.find(s => s.id === socioId);
    const misReservas = (reservasOverride ?? reservas).filter(r => r.socioId === socioId);

    challengeDefinitions
      .filter(reto => reto.activo && new Date(reto.fechaInicio) <= now && now <= new Date(reto.fechaFin))
      .forEach(reto => {
        const progresoExistente = challengeProgress.find(p => p.socioId === socioId && p.challengeId === reto.id);
        if (progresoExistente?.completado) return;

        const valor = calcularProgresoReto(reto, misReservas, sesiones, socio, socios, now);
        const completadoAhora = valor >= reto.objetivo;
        const progresoActualizado: ChallengeProgress = progresoExistente
          ? { ...progresoExistente, progresoActual: valor, completado: completadoAhora, completadoEn: completadoAhora ? now.toISOString() : null }
          : { id: `chap-${uid()}`, studioId, socioId, challengeId: reto.id, progresoActual: valor, completado: completadoAhora, completadoEn: completadoAhora ? now.toISOString() : null };

        setChallengeProgress(prev => progresoExistente
          ? prev.map(p => p.id === progresoExistente.id ? progresoActualizado : p)
          : [...prev, progresoActualizado]);
        dbUpsertChallengeProgress(progresoActualizado);

        if (!completadoAhora) return;

        const entry: ChallengeHistory = {
          id: `chah-${uid()}`, studioId, socioId, challengeId: reto.id, nombre: reto.nombre, icono: reto.icono, creadoEn: now.toISOString(),
        };
        setChallengeHistory(prev => [entry, ...prev]);
        dbInsertChallengeHistory(entry);

        if (reto.creditosRecompensa > 0) {
          const transaccion: CreditTransaction = {
            id: `ctx-${uid()}`, studioId, socioId, tipo: 'GANANCIA', creditos: reto.creditosRecompensa,
            descripcion: `Reto completado: ${reto.nombre}`, refId: reto.id, creadoEn: now.toISOString(),
          };
          setCreditTransactions(prev => [transaccion, ...prev]); // optimista (se reconcilia al sincronizar)
          setMemberCredits(prev => {
            const existente = prev.find(m => m.socioId === socioId);
            const actualizado: MemberCredits = existente
              ? { ...existente, saldo: existente.saldo + reto.creditosRecompensa, totalGanado: existente.totalGanado + reto.creditosRecompensa, actualizadoEn: now.toISOString() }
              : { socioId, studioId, saldo: reto.creditosRecompensa, totalGanado: reto.creditosRecompensa, totalCanjeado: 0, actualizadoEn: now.toISOString() };
            return existente ? prev.map(m => m.socioId === socioId ? actualizado : m) : [...prev, actualizado];
          });
          // C-11: idempotencia REAL en BD vía el UNIQUE de reward_actions (ver
          // el bloque de logros). Evita doblar el saldo persistido ante doble
          // evaluación del reto.
          void (async () => {
            const primeraVez = await dbClaimRecompensaUnica(studioId, socioId, 'RETO', `${socioId}:${reto.id}`);
            if (!primeraVez) return; // otra evaluación ya otorgó este reto
            dbInsertCreditTransaction(transaccion);
            dbAjustarCreditos(socioId, studioId, reto.creditosRecompensa, reto.creditosRecompensa, 0); // P0-20 atómico
          })();
        }
      });
  }

  // ── Dashboard: gráficos personalizados ──────────────────────────────────────────

  // Gráficos del dashboard: extraídos a useDashboardChartsStore (Fase B).

  // ── Notificaciones ────────────────────────────────────────────────────────────

  function marcarNotificacionLeida(notiId: string) {
    setNotificaciones(prev => prev.map(n =>
      n.id === notiId ? { ...n, leida: true } : n
    ));
    dbMarcarNotificacionLeida(notiId); // persistir (antes solo era estado local)
  }

  function marcarTodasLeidas() {
    setNotificaciones(prev => prev.map(n => ({ ...n, leida: true })));
    dbMarcarNotificacionesLeidas(getCurrentStudioId());
  }

  // ── Videos on demand ──────────────────────────────────────────────────────────

  // Vídeos on-demand y Comunidad: extraídos a useContentStore (Fase B).
  // Se exponen en el value vía `content` (ver más abajo).

  // ── Integraciones ─────────────────────────────────────────────────────────────

  // Integraciones: extraídas a useIntegrationsStore (Fase B).

  // ── Motor de automatización avanzado ─────────────────────────────────────────

  function toggleAutomationRule(id: string) {
    const rule = automationRules.find(r => r.id === id);
    if (!rule) return;
    setAutomationRules(prev => prev.map(r =>
      r.id === id ? { ...r, activa: !r.activa } : r
    ));
    dbUpdateAutomationRule(id, { activa: !rule.activa });
    addActividadReciente('AUTOMATIZACION_CAMBIO', `${actorNombre ?? 'Alguien'} ${rule.activa ? 'desactivó' : 'activó'} la automatización "${rule.nombre}"`);
  }

  function addAutomationRule(fields: Omit<AutomationRule, 'id' | 'studioId' | 'ejecutadaVeces' | 'ultimaEjecucion' | 'creadaEn'>) {
    const nueva: AutomationRule = {
      ...fields,
      id: `rule-${uid()}`,
      studioId: getCurrentStudioId(),
      ejecutadaVeces: 0,
      ultimaEjecucion: null,
      creadaEn: new Date().toISOString(),
    };
    setAutomationRules(prev => [...prev, nueva]);
    dbInsertAutomationRule(nueva);
  }

  function addAutomationLog(log: Omit<AutomationLog, 'id' | 'studioId'>) {
    const nuevo: AutomationLog = {
      id: `log-${uid()}`,
      studioId: getCurrentStudioId(),
      ...log,
    };
    setAutomationLogs(prev => [nuevo, ...prev]);
    dbInsertAutomationLog(nuevo);
    setAutomationRules(prev => prev.map(r =>
      r.id === log.ruleId
        ? { ...r, ejecutadaVeces: r.ejecutadaVeces + 1, ultimaEjecucion: log.ejecutadoEn }
        : r
    ));
    dbUpdateAutomationRule(log.ruleId, { ejecutadaVeces: (automationRules.find(r => r.id === log.ruleId)?.ejecutadaVeces ?? 0) + 1, ultimaEjecucion: log.ejecutadoEn });
  }

  function dismissLog(id: string) {
    setAutomationLogs(prev => prev.filter(l => l.id !== id));
  }

  // Refleja en la UI el resultado de aprobar un cobro autónomo (ver
  // /api/stripe/charge-off-session, que ya persiste el cambio en servidor).
  function actualizarLog(id: string, changes: Partial<Pick<AutomationLog, 'resultado' | 'detalle'>>) {
    setAutomationLogs(prev => prev.map(l => l.id === id ? { ...l, ...changes } : l));
  }

  async function runAutomation(): Promise<AutomationLog[]> {
    // R5: la ejecución vive ahora en el SERVIDOR (/api/automatizaciones/run), que
    // reutiliza el núcleo del cron de Inngest sobre datos COMPLETOS (no los arrays
    // en memoria, posiblemente capados) y deduplica por id determinista. Antes
    // esto computaba candidatos en el navegador y enviaba los emails desde la
    // pestaña, pudiendo divergir del cron diario.
    let logs: AutomationLog[] = [];
    try {
      const res = await fetch('/api/automatizaciones/run', {
        method: 'POST',
        headers: { ...(await authHeader()) },
      });
      if (!res.ok) return [];
      logs = ((await res.json()) as { logs?: AutomationLog[] }).logs ?? [];
    } catch {
      return [];
    }
    if (logs.length === 0) return [];

    // El servidor ya persistió logs y contadores; solo reflejamos en la UI.
    setAutomationLogs(prev => [...logs, ...prev]);
    const nowISO = new Date().toISOString();
    setAutomationRules(prev => prev.map(r => {
      const ruleNewLogs = logs.filter(l => l.ruleId === r.id);
      if (ruleNewLogs.length === 0) return r;
      return { ...r, ejecutadaVeces: r.ejecutadaVeces + ruleNewLogs.length, ultimaEjecucion: nowISO };
    }));

    return logs;
  }

  // Notas de progreso: extraídas a useProgressNotesStore (Fase B).

  const value: StudioContextValue = useMemo(() => ({
    planesTarifa,
    salas,
    tiposClase,
    instructores,
    spots,
    addPlan,
    updatePlan,
    deletePlan,
    addSala,
    updateSala,
    deleteSala,
    addTipoClase,
    updateTipoClase,
    deleteTipoClase,
    camposPersonalizados,
    addCampoPersonalizado,
    updateCampoPersonalizado,
    deleteCampoPersonalizado,
    plantillasEmail,
    upsertPlantillaEmail,
    dependencySnapshots,
    recalcularDependencia,
    addInstructor,
    updateInstructor,
    deleteInstructor,
    claimInstructorAccount,
    socios,
    suscripciones,
    sesiones,
    reservas,
    recibos,
    facturas,
    notasInternas,
    addSocio,
    addSocioFromPortal,
    updateSocio,
    deleteSocio,
    addTagSocio,
    removeTagSocio,
    assignPlan,
    pausarSuscripcion,
    reanudarSuscripcion,
    addNota,
    deleteNota,
    condicionesSalud,
    addCondicion,
    updateCondicion,
    deleteCondicion,
    respuestasSesion,
    registrarRespuestaSesion,
    addSesion,
    updateSesion,
    deleteSesion,
    addSesionesSerie,
    editarSerieDesde,
    cancelarSerieDesde,
    addReserva,
    cancelarReserva,
    checkin,
    deshacerCheckin,
    marcarNoShow,
    revertirNoShow,
    liberarSpot,
    asignarSpot,
    addRecibo,
    marcarCobrado,
    marcarDevuelto,
    reintentar,
    deleteRecibo,
    cobrarTodosPendientes,
    citas,
    addCita,
    updateCita,
    cancelarCita,
    completarCita,
    productosPOS,
    addProductoPOS,
    updateProductoPOS,
    deleteProductoPOS,
    ventasPOS,
    addVentaPOS,
    campanas,
    addCampana,
    deleteCampana,
    duplicateCampana,
    updateCampana,
    enviarCampana,
    automatizaciones,
    addAutomatizacion,
    updateAutomatizacion,
    deleteAutomatizacion,
    toggleAutomatizacion,
    codigosDescuento,
    addCodigoDescuento: discountCodes.addCodigoDescuento,
    toggleCodigoDescuento: discountCodes.toggleCodigoDescuento,
    deleteCodigoDescuento: discountCodes.deleteCodigoDescuento,
    actividadReciente,
    addActividadReciente,
    notificaciones,
    marcarNotificacionLeida,
    marcarTodasLeidas,
    videosOnDemand,
    addVideo: content.addVideo,
    toggleVideo: content.toggleVideo,
    postsComunidad,
    likedPostIds,
    addPost: content.addPost,
    toggleLikePost: content.toggleLikePost,
    integraciones,
    upsertIntegracion: integrationsStore.upsertIntegracion,
    preferenciasSocio,
    upsertPreferenciasSocio: upsertPreferenciasSocioPub,
    rewardRules,
    rewardActions,
    rewardHistory,
    creditTransactions,
    memberCredits,
    rewardCatalog,
    rewardRedemptions,
    otorgarCreditos,
    saldoCreditos,
    rachaSocio,
    addRewardRule,
    updateRewardRule,
    addRewardCatalogItem,
    updateRewardCatalogItem,
    deleteRewardCatalogItem,
    canjearRecompensa,
    updateRewardRedemptionEstado,
    achievementDefinitions,
    achievementProgress,
    achievementHistory,
    addAchievementDefinition,
    updateAchievementDefinition,
    evaluarLogrosSocio,
    levelDefinitions,
    nivelSocio,
    addLevelDefinition,
    updateLevelDefinition,
    deleteLevelDefinition,
    challengeDefinitions,
    challengeProgress,
    challengeHistory,
    addChallengeDefinition,
    updateChallengeDefinition,
    deleteChallengeDefinition,
    evaluarRetosSocio,
    dashboardCharts,
    addDashboardChart: dashboardChartsStore.addDashboardChart,
    deleteDashboardChart: dashboardChartsStore.deleteDashboardChart,
    backups,
    studioConfig,
    updateStudioConfig,
    resetDatosPilates,
    automationRules,
    automationLogs,
    notasProgreso,
    toggleAutomationRule,
    addAutomationRule,
    addAutomationLog,
    runAutomation,
    addNotaProgreso: progressNotesStore.addNotaProgreso,
    dismissLog,
    actualizarLog,
    dataLoaded,
    recargarPublico: cargarPublico,
    studio,
    updateAvatarAdmin,
    updateStudio,
  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps deliberately cover only state read by
  // `value`'s ~80 inline functions (verified: every closed-over identifier is listed below); the
  // functions themselves are intentionally excluded since they're recreated every render anyway.
  }), [
    planesTarifa, salas, tiposClase, instructores, spots,
    camposPersonalizados, plantillasEmail, dependencySnapshots,
    socios, suscripciones, sesiones, reservas, recibos, facturas, notasInternas,
    condicionesSalud, respuestasSesion,
    citas, productosPOS, ventasPOS, campanas, automatizaciones,
    discountCodes.codigosDescuento,
    actividadReciente, notificaciones,
    content.videosOnDemand, content.postsComunidad, content.likedPostIds,
    integrationsStore.integraciones,
    memberPrefsStore.preferenciasSocio,
    rewardRules, rewardActions, rewardHistory, creditTransactions, memberCredits,
    rewardCatalog, rewardRedemptions,
    achievementDefinitions, achievementProgress, achievementHistory,
    levelDefinitions,
    challengeDefinitions, challengeProgress, challengeHistory,
    dashboardChartsStore.dashboardCharts,
    backups,
    studioConfig,
    automationRules, automationLogs, progressNotesStore.notasProgreso,
    dataLoaded,
    studio,
    authUserId, publicSlug, studioIdOverride,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ]);

  function resetDatosPilates() {
    fetchAllStudioData().then(data => {
      setPlanesTarifa(data.planesTarifa);
      setSalas(data.salas);
      setTiposClase(data.tiposClase);
      setInstructores(data.instructores);
      setSpots(data.spots);
      setSocios(data.socios);
      setSuscripciones(data.suscripciones);
      setSesiones(data.sesiones);
      setReservas(data.reservas);
      setRecibos(data.recibos);
      setFacturas(data.facturas);
      setNotasInternas(data.notasInternas);
      setCondicionesSalud(data.condicionesSalud);
      setRespuestasSesion(data.respuestasSesion);
      setCitas(data.citas);
      setProductosPOS(data.productosPOS);
      setVentasPOS(data.ventasPOS);
      setCampanas(data.campanas);
      setAutomatizaciones(data.automatizaciones);
      discountCodes.setCodigosDescuento(data.codigosDescuento);
      setActividadReciente(data.actividadReciente);
      setNotificaciones(data.notificaciones);
      content.setVideosOnDemand(data.videosOnDemand);
      content.setPostsComunidad(data.postsComunidad);
      dbMisLikesComunidad().then(ids => content.setLikedPostIds(new Set(ids)));
      integrationsStore.setIntegraciones(data.integraciones ?? []);
      memberPrefsStore.setPreferenciasSocio(data.preferenciasSocio ?? []);
      setRewardRules(data.rewardRules ?? []);
      setRewardActions(data.rewardActions ?? []);
      setRewardHistory(data.rewardHistory ?? []);
      setCreditTransactions(data.creditTransactions ?? []);
      setMemberCredits(data.memberCredits ?? []);
      setRewardCatalog(data.rewardCatalog ?? []);
      setRewardRedemptions(data.rewardRedemptions ?? []);
      setAchievementDefinitions(data.achievementDefinitions ?? []);
      setAchievementProgress(data.achievementProgress ?? []);
      setAchievementHistory(data.achievementHistory ?? []);
      setLevelDefinitions(data.levelDefinitions ?? []);
      setChallengeDefinitions(data.challengeDefinitions ?? []);
      setChallengeProgress(data.challengeProgress ?? []);
      setChallengeHistory(data.challengeHistory ?? []);
      dashboardChartsStore.setDashboardCharts(data.dashboardCharts ?? []);
      setBackups(data.backups ?? []);
      setAutomationRules(data.automationRules);
      setAutomationLogs(data.automationLogs);
      progressNotesStore.setNotasProgreso(data.notasProgreso);
      setStudio(data.studio);
    }).catch(console.error);
  }

  return (
    <StudioContext.Provider value={value}>
      {children}
      {dbError && (
        <div
          role="alert"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          className="fixed bottom-4 inset-x-0 z-[9999] flex justify-center px-4 pointer-events-none"
        >
          <div className="pointer-events-auto flex items-start gap-3 max-w-md w-full bg-[#1C1C1E] text-white rounded-2xl px-4 py-3 shadow-2xl">
            <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center shrink-0 mt-0.5 text-[12px] font-bold">!</div>
            <p className="text-[13px] leading-snug flex-1">{dbError.msg}</p>
            <button
              onClick={() => setDbError(null)}
              className="text-white/50 hover:text-white text-[13px] font-bold shrink-0"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </StudioContext.Provider>
  );
}
