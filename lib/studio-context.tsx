'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import {
  fetchAllStudioData,
  dbInsertSocio, dbUpdateSocio, dbDeleteSocio,
  dbInsertPlanTarifa, dbUpdatePlanTarifa, dbDeletePlanTarifa,
  dbInsertSuscripcion, dbUpdateSuscripcion,
  dbInsertSesion, dbUpdateSesion, dbDeleteSesion,
  dbInsertReserva, dbUpdateReserva,
  dbInsertRecibo, dbUpdateRecibo, dbDeleteRecibo,
  dbInsertFactura,
  dbInsertCita, dbUpdateCita,
  dbInsertVentaPOS,
  dbInsertActividadReciente,
  dbInsertMensajeEquipo,
  dbUpsertPreferenciasSocio,
  dbInsertRewardRule, dbUpdateRewardRule,
  dbInsertRewardAction, dbInsertRewardHistory, dbInsertCreditTransaction, dbUpsertMemberCredits,
  dbInsertRewardCatalogItem, dbUpdateRewardCatalogItem, dbDeleteRewardCatalogItem,
  dbInsertRewardRedemption, dbUpdateRewardRedemption,
  dbInsertAchievementDefinition, dbUpdateAchievementDefinition,
  dbUpsertAchievementProgress, dbInsertAchievementHistory,
  dbInsertLevelDefinition, dbUpdateLevelDefinition, dbDeleteLevelDefinition,
  dbInsertChallengeDefinition, dbUpdateChallengeDefinition, dbDeleteChallengeDefinition,
  dbUpsertChallengeProgress, dbInsertChallengeHistory,
  dbInsertDashboardChart, dbDeleteDashboardChart,
  dbInsertNotaInterna, dbDeleteNotaInterna,
  dbInsertCampana, dbDeleteCampana,
  dbInsertAutomatizacion, dbUpdateAutomatizacion,
  dbInsertVideoOnDemand, dbUpdateVideoOnDemand,
  dbInsertPostComunidad, dbUpdatePostComunidad,
  dbUpsertIntegracion,
  dbInsertAutomationLog, dbUpdateAutomationRule,
  dbInsertTipoClase, dbUpdateTipoClase, dbDeleteTipoClase,
  dbInsertInstructor, dbUpdateInstructor, dbDeleteInstructor, dbClaimInstructorAccount,
  dbUpdateStudio, resolveStudioId, setCurrentStudioId, getCurrentStudioId,
  setDbErrorListener,
} from '@/lib/supabase-data';
import type {
  Studio,
  Socio,
  AceptacionContrato,
  Suscripcion,
  Sesion,
  Reserva,
  Recibo,
  Factura,
  PlanTarifa,
  Sala,
  TipoClase,
  Instructor,
  Spot,
  NotaInterna,
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
  MensajeEquipo,
  PreferenciasSocio,
  Disponibilidad,
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
import { useAuth } from '@/lib/auth-context';
import { computeAutomationCandidatos } from '@/lib/automation-engine';
import { reglaActivaPara, yaOtorgado } from '@/lib/reward-engine';
import { calcularMetrica } from '@/lib/achievement-engine';
import { calcularRacha, type RachaInfo } from '@/lib/streak-engine';
import { calcularNivel, type NivelInfo } from '@/lib/level-engine';
import { calcularProgresoReto } from '@/lib/challenge-engine';

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

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

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
  addSocioFromPortal: (fields: { id: string; nombre: string; email: string; aceptacionContrato?: AceptacionContrato; referidoPor?: string | null }) => void;
  updateSocio: (id: string, changes: Partial<Socio>) => void;
  deleteSocio: (id: string) => void;
  addTagSocio: (socioId: string, tag: string) => void;
  removeTagSocio: (socioId: string, tag: string) => void;

  // Suscripciones
  assignPlan: (socioId: string, planId: string | null) => void;
  pausarSuscripcion: (susId: string) => void;
  reanudarSuscripcion: (susId: string) => void;

  // Notas internas
  addNota: (socioId: string, texto: string) => void;
  deleteNota: (notaId: string) => void;

  // Sesiones
  addSesion: (fields: Omit<Sesion, 'id' | 'studioId'>) => void;
  updateSesion: (id: string, changes: Partial<Sesion>) => void;
  deleteSesion: (id: string) => void;

  // Reservas
  addReserva: (sesionId: string, socioId: string) => void;
  cancelarReserva: (reservaId: string) => void;
  checkin: (reservaId: string) => void;
  liberarSpot: (reservaId: string) => void;
  asignarSpot: (sesionId: string, socioId: string, spotId: string) => void;

  // Recibos
  addRecibo: (fields: Omit<Recibo, 'id' | 'studioId' | 'estado' | 'fechaCobro' | 'fechaDevolucion' | 'intentosReintento'>) => void;
  marcarCobrado: (reciboId: string) => void;
  marcarDevuelto: (reciboId: string) => void;
  reintentar: (reciboId: string) => void;
  deleteRecibo: (id: string) => void;
  cobrarTodosPendientes: () => void;

  // Citas
  citas: Cita[];
  addCita: (fields: Omit<Cita, 'id' | 'studioId' | 'creadoEn'>) => void;
  updateCita: (id: string, changes: Partial<Cita>) => void;
  cancelarCita: (citaId: string) => void;
  completarCita: (citaId: string) => void;

  // POS
  productosPOS: ProductoPOS[];
  ventasPOS: VentaPOS[];
  addVentaPOS: (fields: Omit<VentaPOS, 'id' | 'studioId' | 'realizadaEn'>) => void;

  // Campañas
  campanas: Campana[];
  addCampana: (fields: Omit<Campana, 'id' | 'studioId' | 'creadaEn' | 'enviados' | 'abiertos' | 'clics'>) => void;
  deleteCampana: (id: string) => void;
  duplicateCampana: (campana: Campana) => void;

  // Automatizaciones
  automatizaciones: Automatizacion[];
  addAutomatizacion: (fields: Omit<Automatizacion, 'id' | 'studioId' | 'ejecutadas' | 'creadaEn'>) => void;
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
  addPost: (texto: string) => void;
  toggleLikePost: (postId: string) => void;
  integraciones: Integracion[];
  upsertIntegracion: (tipo: TipoIntegracion, activo: boolean, config: Record<string, string>) => void;
  mensajesEquipo: MensajeEquipo[];
  addMensajeEquipo: (texto: string) => void;
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
  addRewardRule: (fields: Omit<RewardRule, 'id' | 'studioId' | 'creadoEn'>) => void;
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
  addAutomationLog: (log: Omit<AutomationLog, 'id' | 'studioId'>) => void;
  runAutomation: () => Promise<AutomationLog[]>;
  addNotaProgreso: (nota: Omit<NotaProgreso, 'id' | 'studioId' | 'creadaEn'>) => void;
  dismissLog: (id: string) => void;
  actualizarLog: (id: string, changes: Partial<Pick<AutomationLog, 'resultado' | 'detalle'>>) => void;

  // Studio management
  resetDatosPilates: () => void;
  dataLoaded: boolean;

  // Studio record (propietario) + avatar del admin
  studio: Studio | null;
  updateAvatarAdmin: (avatarId: string | null) => void;
  updateStudio: (changes: Partial<Studio>) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const StudioContext = createContext<StudioContextValue | null>(null);

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio must be used within StudioProvider');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function StudioProvider({ children, studioIdOverride }: { children: ReactNode; studioIdOverride?: string }) {
  const [dataLoaded, setDataLoaded] = useState(false);
  const [dbError, setDbError] = useState<{ msg: string; key: number } | null>(null);

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
  const [instructores, setInstructores] = useState<Instructor[]>([]);
  const [spots, setSpots] = useState<Spot[]>([]);

  const [socios, setSocios] = useState<Socio[]>([]);
  const [suscripciones, setSuscripciones] = useState<Suscripcion[]>([]);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [notasInternas, setNotasInternas] = useState<NotaInterna[]>([]);

  const [citas, setCitas] = useState<Cita[]>([]);
  const [productosPOS, setProductosPOS] = useState<ProductoPOS[]>([]);
  const [ventasPOS, setVentasPOS] = useState<VentaPOS[]>([]);
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [automatizaciones, setAutomatizaciones] = useState<Automatizacion[]>([]);
  const [codigosDescuento, setCodigosDescuento] = useState<CodigoDescuento[]>([]);
  const [actividadReciente, setActividadReciente] = useState<ActividadReciente[]>([]);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [videosOnDemand, setVideosOnDemand] = useState<VideoOnDemand[]>([]);
  const [postsComunidad, setPostsComunidad] = useState<PostComunidad[]>([]);
  const [integraciones, setIntegraciones] = useState<Integracion[]>([]);
  const [mensajesEquipo, setMensajesEquipo] = useState<MensajeEquipo[]>([]);
  const [preferenciasSocio, setPreferenciasSocio] = useState<PreferenciasSocio[]>([]);
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
  const [dashboardCharts, setDashboardCharts] = useState<DashboardChart[]>([]);
  const [backups, setBackups] = useState<BackupMeta[]>([]);
  const [studioConfig, setStudioConfig] = useState<StudioConfig>(defaultStudioConfig);

  const [automationRules, setAutomationRules] = useState<AutomationRule[]>([]);
  const [automationLogs, setAutomationLogs] = useState<AutomationLog[]>([]);
  const [notasProgreso, setNotasProgreso] = useState<NotaProgreso[]>([]);
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

  useEffect(() => {
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
        if (resolved) setCurrentStudioId(resolved);
      }
      return fetchAllStudioData();
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
      setCitas(data.citas);
      setProductosPOS(data.productosPOS);
      setVentasPOS(data.ventasPOS);
      setCampanas(data.campanas);
      setAutomatizaciones(data.automatizaciones);
      setCodigosDescuento(data.codigosDescuento);
      setActividadReciente(data.actividadReciente);
      setNotificaciones(data.notificaciones);
      setVideosOnDemand(data.videosOnDemand);
      setPostsComunidad(data.postsComunidad);
      setIntegraciones(data.integraciones ?? []);
      setMensajesEquipo(data.mensajesEquipo ?? []);
      setPreferenciasSocio(data.preferenciasSocio ?? []);
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
      setDashboardCharts(data.dashboardCharts ?? []);
      setBackups(data.backups ?? []);
      setAutomationRules(data.automationRules);
      setAutomationLogs(data.automationLogs);
      setNotasProgreso(data.notasProgreso);
      setStudio(data.studio);
      setDataLoaded(true);
    }).catch(err => {
      console.error('Error fetching Supabase data:', err);
      setDataLoaded(true);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId, studioIdOverride]);

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
    const baseImponible = Math.round((recibo.importe / 1.21) * 100) / 100;
    const cuotaIVA = Math.round((recibo.importe - baseImponible) * 100) / 100;
    return {
      id: `fac-auto-${uid()}`,
      studioId: getCurrentStudioId(),
      reciboId: recibo.id,
      numeroCompleto: nextFacturaNumero(currentFacturas),
      fechaEmision: new Date().toISOString(),
      receptorNombre: socio ? `${socio.nombre} ${socio.apellidos}` : 'Desconocido',
      receptorNIF: socio?.nif ?? null,
      baseImponible,
      tipoIVA: 21,
      cuotaIVA,
      total: recibo.importe,
      verifactuHash: null,
    };
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
    dbUpdateStudio(changes);
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
    dbInsertSocio(nuevaSocia);
    addActividadReciente('NUEVA_SOCIA', `${actorNombre ?? 'Alguien'} dio de alta a ${nuevaSocia.nombre} ${nuevaSocia.apellidos}`, nuevaSocia.id, `/socios/${nuevaSocia.id}`);
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
          dbInsertFactura(fac);
          return [...prev, fac];
        });
      }
    }
  }

  function addSocioFromPortal(fields: { id: string; nombre: string; email: string; aceptacionContrato?: AceptacionContrato; referidoPor?: string | null }) {
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
    // El amigo referidor recibe sus créditos al confirmarse la nueva alta —
    // refId es el id de la nueva socia, así nunca se premia dos veces por la
    // misma persona referida.
    if (fields.referidoPor) {
      otorgarCreditos(fields.referidoPor, 'REFERIDO_AMIGO', nuevaSocia.id);
    }
  }

  function updateStudioConfig(changes: Partial<StudioConfig>) {
    setStudioConfig(prev => ({ ...prev, ...changes }));
  }

  function updateSocio(id: string, changes: Partial<Socio>) {
    setSocios(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s));
    dbUpdateSocio(id, changes);
    const socio = socios.find(s => s.id === id);
    if (socio) addActividadReciente('SOCIA_EDITADA', `${actorNombre ?? 'Alguien'} editó los datos de ${socio.nombre} ${socio.apellidos}`, id, `/socios/${id}`);
  }

  function deleteSocio(id: string) {
    const socio = socios.find(s => s.id === id);
    setSocios(prev => prev.filter(s => s.id !== id));
    setSuscripciones(prev => prev.filter(s => s.socioId !== id));
    setRecibos(prev => prev.filter(r => r.socioId !== id));
    setNotasInternas(prev => prev.filter(n => n.socioId !== id));
    dbDeleteSocio(id);
    if (socio) addActividadReciente('SOCIA_ELIMINADA', `${actorNombre ?? 'Alguien'} eliminó a ${socio.nombre} ${socio.apellidos}`);
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
    setSuscripciones(prev => prev.map(s =>
      s.id === susId && s.estado === 'ACTIVA' ? { ...s, estado: 'PAUSADA' as const } : s
    ));
  }

  function reanudarSuscripcion(susId: string) {
    setSuscripciones(prev => prev.map(s =>
      s.id === susId && s.estado === 'PAUSADA' ? { ...s, estado: 'ACTIVA' as const } : s
    ));
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

  // ── Reservas ─────────────────────────────────────────────────────────────────

  function addReserva(sesionId: string, socioId: string) {
    const esPrimeraReserva = !reservas.some(r => r.socioId === socioId);
    const nueva: Reserva = {
      id: `res-${uid()}`,
      studioId: getCurrentStudioId(),
      sesionId,
      socioId,
      estado: 'CONFIRMADA',
      spotId: null,
      posicionEspera: null,
      checkInEn: null,
      creadoEn: new Date().toISOString(),
    };
    const reservasActualizadas = [...reservas, nueva];
    setReservas(reservasActualizadas);
    dbInsertReserva(nueva);
    if (esPrimeraReserva) otorgarCreditos(socioId, 'PRIMERA_RESERVA', socioId);
    evaluarLogrosSocio(socioId, reservasActualizadas);
    evaluarRetosSocio(socioId, reservasActualizadas);
  }

  function cancelarReserva(reservaId: string) {
    let promotedSocioId: string | null = null;
    let promotedSesionId: string | null = null;

    setReservas(prev => {
      const updated = prev.map(r =>
        r.id === reservaId ? { ...r, estado: 'CANCELADA' as const } : r
      );
      dbUpdateReserva(reservaId, { estado: 'CANCELADA' });
      // Auto-promote first LISTA_ESPERA for same sesion
      const cancelada = prev.find(r => r.id === reservaId);
      if (!cancelada) return updated;
      const espera = updated.find(
        r => r.sesionId === cancelada.sesionId && r.estado === 'LISTA_ESPERA'
      );
      if (!espera) return updated;
      promotedSocioId = espera.socioId;
      promotedSesionId = espera.sesionId;
      dbUpdateReserva(espera.id, { estado: 'CONFIRMADA', posicion_espera: null });
      return updated.map(r =>
        r.id === espera.id ? { ...r, estado: 'CONFIRMADA' as const, posicionEspera: null } : r
      );
    });

    // Fire notification for promoted socia
    if (promotedSocioId && promotedSesionId) {
      const socio = socios.find(s => s.id === promotedSocioId);
      const sesion = sesiones.find(s => s.id === promotedSesionId);
      const tipo = sesion ? tiposClase.find(t => t.id === sesion.tipoClaseId) : null;
      const nombre = socio ? `${socio.nombre} ${socio.apellidos}` : 'Socia';
      const clase = tipo?.nombre ?? 'la clase';
      setNotificaciones(prev => [{
        id: `notif-promo-${uid()}`,
        studioId: getCurrentStudioId(),
        tipo: 'EXITO' as const,
        titulo: 'Lista de espera promovida',
        texto: `${nombre} ha pasado de lista de espera a confirmada en ${clase}.`,
        leida: false,
        creadaEn: new Date().toISOString(),
        enlace: promotedSocioId ? `/socios/${promotedSocioId}` : null,
      }, ...prev]);
      addActividadReciente('NUEVA_RESERVA', `${nombre} promovida de lista de espera → ${clase}`, promotedSocioId, `/socios/${promotedSocioId}`);
    }
  }

  function checkin(reservaId: string) {
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
    const sus = suscripciones.find(s => s.socioId === reserva.socioId && s.estado === 'ACTIVA');
    if (!sus) return;
    const plan = planesTarifa.find(p => p.id === sus.planId);
    if (!plan) return;

    if ((plan.tipo === 'BONO' || plan.tipo === 'PUNTUAL') && sus.sesionesRestantes !== null) {
      const nuevasRestantes = Math.max(0, (sus.sesionesRestantes ?? 0) - 1);
      setSuscripciones(prev => prev.map(s =>
        s.id === sus.id ? { ...s, sesionesRestantes: nuevasRestantes } : s
      ));
      dbUpdateSuscripcion(sus.id, { sesionesRestantes: nuevasRestantes });

      // Bono agotado → generar recibo de renovación + notificación
      if (nuevasRestantes === 0) {
        const socio = socios.find(s => s.id === reserva.socioId);
        const nombreSocio = socio ? `${socio.nombre} ${socio.apellidos}` : 'Socia';
        const hoy = new Date().toISOString().slice(0, 10);
        const reciboRenovacion: Recibo = {
          id: `rec-renov-${uid()}`,
          studioId: getCurrentStudioId(),
          socioId: reserva.socioId,
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
          enlace: `/socios/${reserva.socioId}`,
          creadaEn: new Date().toISOString(),
        }, ...prev]);
        addActividadReciente(
          'PAGO_PENDIENTE',
          `Bono agotado — ${nombreSocio} necesita renovar ${plan.nombre}`,
          reserva.socioId,
          `/socios/${reserva.socioId}`,
        );
      }
    }
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

  function marcarCobrado(reciboId: string) {
    const fechaCobro = new Date().toISOString();
    setRecibos(prev => prev.map(r =>
      r.id === reciboId ? { ...r, estado: 'COBRADO' as const, fechaCobro } : r
    ));
    dbUpdateRecibo(reciboId, { estado: 'COBRADO', fecha_cobro: fechaCobro });
    setFacturas(prev => {
      // Avoid duplicate facturas for same recibo
      if (prev.some(f => f.reciboId === reciboId)) return prev;
      const recibo = recibos.find(r => r.id === reciboId) ??
        { id: reciboId, importe: 0, socioId: '', studioId: getCurrentStudioId(), suscripcionId: null, concepto: '', estado: 'PENDIENTE' as const, fechaVencimiento: new Date().toISOString(), fechaCobro: null, fechaDevolucion: null, intentosReintento: 0 };
      const updatedRecibo = { ...recibo, estado: 'COBRADO' as const, fechaCobro: new Date().toISOString() };
      const fac = buildFactura(updatedRecibo, prev);
      dbInsertFactura(fac);
      return [...prev, fac];
    });
    // Refill bono or extend mensual when renewal payment is collected
    const recibo = recibos.find(r => r.id === reciboId);
    if (recibo?.suscripcionId) {
      const sus = suscripciones.find(s => s.id === recibo.suscripcionId);
      if (sus) {
        const plan = planesTarifa.find(p => p.id === sus.planId);
        if (plan) {
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
      }
    }
    if (recibo) {
      const socio = socios.find(s => s.id === recibo.socioId);
      addActividadReciente(
        'COBRO_MANUAL',
        `${actorNombre ?? 'Alguien'} marcó como cobrado "${recibo.concepto}" (${recibo.importe} €) de ${socio?.nombre ?? 'una socia'}`,
        recibo.socioId,
        `/socios/${recibo.socioId}`
      );
      if (recibo.concepto.startsWith('Renovación')) {
        otorgarCreditos(recibo.socioId, 'RENOVACION_PLAN', reciboId);
      }
    }
  }

  function marcarDevuelto(reciboId: string) {
    const fechaDev = new Date().toISOString();
    setRecibos(prev => prev.map(r =>
      r.id === reciboId ? { ...r, estado: 'DEVUELTO' as const, fechaDevolucion: fechaDev } : r
    ));
    dbUpdateRecibo(reciboId, { estado: 'DEVUELTO', fecha_devolucion: fechaDev });
  }

  function reintentar(reciboId: string) {
    setRecibos(prev => prev.map(r => {
      if (r.id !== reciboId) return r;
      const updated = { ...r, estado: 'EN_CURSO' as const, intentosReintento: r.intentosReintento + 1 };
      dbUpdateRecibo(reciboId, { estado: 'EN_CURSO', intentos_reintento: updated.intentosReintento });
      return updated;
    }));
  }

  function deleteRecibo(id: string) {
    setRecibos(prev => prev.filter(r => r.id !== id));
    dbDeleteRecibo(id);
  }

  function cobrarTodosPendientes() {
    const pendientes = recibos.filter(r => r.estado === 'PENDIENTE');
    const fechaCobro = new Date().toISOString();
    setRecibos(prev => prev.map(r =>
      r.estado === 'PENDIENTE' ? { ...r, estado: 'COBRADO' as const, fechaCobro } : r
    ));
    // Persist each recibo update to Supabase
    for (const recibo of pendientes) {
      dbUpdateRecibo(recibo.id, { estado: 'COBRADO', fechaCobro });
    }
    setFacturas(prev => {
      let current = [...prev];
      for (const recibo of pendientes) {
        if (!current.some(f => f.reciboId === recibo.id)) {
          const cobrado = { ...recibo, estado: 'COBRADO' as const, fechaCobro };
          const fac = buildFactura(cobrado, current);
          dbInsertFactura(fac);
          current = [...current, fac];
        }
      }
      return current;
    });
    // Refill bonos / extend mensual for every recibo being paid
    for (const recibo of pendientes) {
      if (!recibo.suscripcionId) continue;
      const sus = suscripciones.find(s => s.id === recibo.suscripcionId);
      if (!sus) continue;
      const plan = planesTarifa.find(p => p.id === sus.planId);
      if (!plan) continue;
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

  function addVentaPOS(fields: Omit<VentaPOS, 'id' | 'studioId' | 'realizadaEn'>) {
    const nueva: VentaPOS = {
      id: `vpos-${uid()}`,
      studioId: getCurrentStudioId(),
      realizadaEn: new Date().toISOString(),
      ...fields,
    };
    setVentasPOS(prev => [...prev, nueva]);
    dbInsertVentaPOS(nueva);

    // When a named client buys, create a COBRADO recibo so it appears in Pagos/Facturas
    if (fields.socioId && fields.total > 0) {
      const concepto = fields.items.length > 0
        ? fields.items.map(i => i.nombre).join(', ')
        : 'Venta POS';
      const hoy = new Date().toISOString().slice(0, 10);
      const nuevoRecibo: Recibo = {
        id: `rec-pos-${uid()}`,
        studioId: getCurrentStudioId(),
        socioId: fields.socioId,
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
        dbInsertFactura(fac);
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

  function toggleAutomatizacion(autoId: string) {
    const actual = automatizaciones.find(a => a.id === autoId);
    setAutomatizaciones(prev => prev.map(a =>
      a.id === autoId ? { ...a, activa: !a.activa } : a
    ));
    if (actual) dbUpdateAutomatizacion(autoId, { activa: !actual.activa });
  }

  // ── Códigos de descuento ──────────────────────────────────────────────────────

  function addCodigoDescuento(fields: Omit<CodigoDescuento, 'id' | 'studioId' | 'usos' | 'creadoEn'>) {
    const nuevo: CodigoDescuento = {
      id: `disc-${uid()}`,
      studioId: getCurrentStudioId(),
      usos: 0,
      creadoEn: new Date().toISOString(),
      ...fields,
    };
    setCodigosDescuento(prev => [nuevo, ...prev]);
  }

  function toggleCodigoDescuento(codigoId: string) {
    setCodigosDescuento(prev => prev.map(c =>
      c.id === codigoId ? { ...c, activo: !c.activo } : c
    ));
  }

  function deleteCodigoDescuento(id: string) {
    setCodigosDescuento(prev => prev.filter(c => c.id !== id));
  }

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

  // ── Chat de equipo (canal único compartido) ───────────────────────────────────

  function addMensajeEquipo(texto: string) {
    const nuevo: MensajeEquipo = {
      id: `msgeq-${uid()}`,
      studioId: getCurrentStudioId(),
      autorInstructorId: yo?.id ?? null,
      autorNombre: actorNombre ?? 'Propietaria',
      texto,
      creadoEn: new Date().toISOString(),
    };
    setMensajesEquipo(prev => [...prev, nuevo]);
    dbInsertMensajeEquipo(nuevo);
  }

  // ── Preferencias del alumno (portal de miembros) ──────────────────────────────

  function upsertPreferenciasSocio(socioId: string, changes: Partial<Omit<PreferenciasSocio, 'socioId' | 'studioId'>>) {
    setPreferenciasSocio(prev => {
      const existente = prev.find(p => p.socioId === socioId);
      const actualizado: PreferenciasSocio = existente
        ? { ...existente, ...changes, actualizadoEn: new Date().toISOString() }
        : {
            socioId,
            studioId: getCurrentStudioId(),
            disponibilidad: {} as Disponibilidad,
            instructorFavoritoId: null,
            tipoClaseFavorita: null,
            duracionPreferida: null,
            nivel: null,
            notifEmail: true,
            notifWhatsapp: true,
            actualizadoEn: new Date().toISOString(),
            ...changes,
          };
      dbUpsertPreferenciasSocio(actualizado);
      return existente ? prev.map(p => p.socioId === socioId ? actualizado : p) : [...prev, actualizado];
    });
  }

  // ── Gamificación: créditos y recompensas ──────────────────────────────────────
  // El valor de cada acción SIEMPRE sale de rewardRules (configurable por el
  // estudio) — otorgarCreditos nunca usa un número fijo.

  function otorgarCreditos(socioId: string, trigger: RewardTrigger, refId: string | null, descripcionOverride?: string) {
    const studioId = getCurrentStudioId();
    const regla = reglaActivaPara(rewardRules, trigger);
    if (!regla || regla.creditos <= 0) return;
    if (yaOtorgado(rewardActions, trigger, refId)) return;

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
      const actualizado: MemberCredits = existente
        ? { ...existente, saldo: existente.saldo + regla.creditos, totalGanado: existente.totalGanado + regla.creditos, actualizadoEn: now }
        : { socioId, studioId, saldo: regla.creditos, totalGanado: regla.creditos, totalCanjeado: 0, actualizadoEn: now };
      dbUpsertMemberCredits(actualizado);
      return existente ? prev.map(m => m.socioId === socioId ? actualizado : m) : [...prev, actualizado];
    });

    (async () => {
      const ok = await dbInsertRewardAction(action);
      // El UNIQUE (studio_id, trigger, ref_id) es el cerrojo real contra
      // duplicados — si la inserción choca con él, no seguimos otorgando.
      if (!ok) return;
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

  function addRewardRule(fields: Omit<RewardRule, 'id' | 'studioId' | 'creadoEn'>) {
    const nueva: RewardRule = { ...fields, id: `rwr-${uid()}`, studioId: getCurrentStudioId(), creadoEn: new Date().toISOString() };
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
    if (!item || !item.activo) return { error: 'Esta recompensa ya no está disponible.' };
    if (item.stock != null && item.stock <= 0) return { error: 'Sin stock disponible.' };
    const saldo = saldoCreditos(socioId);
    if (saldo < item.costeCreditos) return { error: 'No tienes créditos suficientes todavía.' };

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

    setRewardRedemptions(prev => [redemption, ...prev]);
    setCreditTransactions(prev => [transaccion, ...prev]);
    setMemberCredits(prev => prev.map(m => m.socioId === socioId
      ? { ...m, saldo: m.saldo - item.costeCreditos, totalCanjeado: m.totalCanjeado + item.costeCreditos, actualizadoEn: now }
      : m));
    if (item.stock != null) {
      setRewardCatalog(prev => prev.map(c => c.id === catalogItemId ? { ...c, stock: (c.stock ?? 1) - 1 } : c));
      dbUpdateRewardCatalogItem(catalogItemId, { stock: item.stock - 1 });
    }

    dbInsertRewardRedemption(redemption);
    dbInsertCreditTransaction(transaccion);
    const actualizado = memberCredits.find(m => m.socioId === socioId);
    dbUpsertMemberCredits(actualizado
      ? { ...actualizado, saldo: actualizado.saldo - item.costeCreditos, totalCanjeado: actualizado.totalCanjeado + item.costeCreditos }
      : { socioId, studioId, saldo: -item.costeCreditos, totalGanado: 0, totalCanjeado: item.costeCreditos });

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
        setCreditTransactions(prev => [transaccion, ...prev]);
        dbInsertCreditTransaction(transaccion);
        setMemberCredits(prev => {
          const existente = prev.find(m => m.socioId === socioId);
          const actualizado: MemberCredits = existente
            ? { ...existente, saldo: existente.saldo + def.creditosRecompensa, totalGanado: existente.totalGanado + def.creditosRecompensa, actualizadoEn: now.toISOString() }
            : { socioId, studioId, saldo: def.creditosRecompensa, totalGanado: def.creditosRecompensa, totalCanjeado: 0, actualizadoEn: now.toISOString() };
          dbUpsertMemberCredits(actualizado);
          return existente ? prev.map(m => m.socioId === socioId ? actualizado : m) : [...prev, actualizado];
        });
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
  // lo ocurrido dentro de esa ventana (ver lib/challenge-engine.ts).

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
          setCreditTransactions(prev => [transaccion, ...prev]);
          dbInsertCreditTransaction(transaccion);
          setMemberCredits(prev => {
            const existente = prev.find(m => m.socioId === socioId);
            const actualizado: MemberCredits = existente
              ? { ...existente, saldo: existente.saldo + reto.creditosRecompensa, totalGanado: existente.totalGanado + reto.creditosRecompensa, actualizadoEn: now.toISOString() }
              : { socioId, studioId, saldo: reto.creditosRecompensa, totalGanado: reto.creditosRecompensa, totalCanjeado: 0, actualizadoEn: now.toISOString() };
            dbUpsertMemberCredits(actualizado);
            return existente ? prev.map(m => m.socioId === socioId ? actualizado : m) : [...prev, actualizado];
          });
        }
      });
  }

  // ── Dashboard: gráficos personalizados ──────────────────────────────────────────

  function addDashboardChart(fields: Omit<DashboardChart, 'id' | 'studioId' | 'creadoEn'>) {
    const nuevo: DashboardChart = { ...fields, id: `chart-${uid()}`, studioId: getCurrentStudioId(), creadoEn: new Date().toISOString() };
    setDashboardCharts(prev => [...prev, nuevo]);
    dbInsertDashboardChart(nuevo);
  }

  function deleteDashboardChart(id: string) {
    setDashboardCharts(prev => prev.filter(c => c.id !== id));
    dbDeleteDashboardChart(id);
  }

  // ── Notificaciones ────────────────────────────────────────────────────────────

  function marcarNotificacionLeida(notiId: string) {
    setNotificaciones(prev => prev.map(n =>
      n.id === notiId ? { ...n, leida: true } : n
    ));
  }

  function marcarTodasLeidas() {
    setNotificaciones(prev => prev.map(n => ({ ...n, leida: true })));
  }

  // ── Videos on demand ──────────────────────────────────────────────────────────

  function addVideo(fields: Omit<VideoOnDemand, 'id' | 'studioId' | 'vistas' | 'likes' | 'creadoEn'>) {
    const nuevo: VideoOnDemand = {
      id: `vid-${uid()}`,
      studioId: getCurrentStudioId(),
      vistas: 0,
      likes: 0,
      creadoEn: new Date().toISOString(),
      ...fields,
    };
    setVideosOnDemand(prev => [nuevo, ...prev]);
    dbInsertVideoOnDemand(nuevo);
  }

  function toggleVideo(videoId: string) {
    const actual = videosOnDemand.find(v => v.id === videoId);
    setVideosOnDemand(prev => prev.map(v =>
      v.id === videoId ? { ...v, activo: !v.activo } : v
    ));
    if (actual) dbUpdateVideoOnDemand(videoId, { activo: !actual.activo });
  }

  // ── Comunidad ─────────────────────────────────────────────────────────────────

  function addPost(texto: string) {
    const nuevo: PostComunidad = {
      id: `post-${uid()}`,
      studioId: getCurrentStudioId(),
      autorId: null,
      autorNombre: 'Tentare',
      autorInicial: 'TE',
      texto,
      likes: 0,
      comentariosCount: 0,
      fijado: false,
      creadoEn: new Date().toISOString(),
    };
    setPostsComunidad(prev => [nuevo, ...prev]);
    dbInsertPostComunidad(nuevo);
  }

  function toggleLikePost(postId: string) {
    const actual = postsComunidad.find(p => p.id === postId);
    setPostsComunidad(prev => prev.map(p =>
      p.id === postId ? { ...p, likes: p.likes + 1 } : p
    ));
    if (actual) dbUpdatePostComunidad(postId, { likes: actual.likes + 1 });
  }

  // ── Integraciones ─────────────────────────────────────────────────────────────

  function upsertIntegracion(tipo: TipoIntegracion, activo: boolean, config: Record<string, string>) {
    const existente = integraciones.find(i => i.tipo === tipo);
    const actualizadoEn = new Date().toISOString();
    const registro: Integracion = {
      id: existente?.id ?? `intg-${tipo.toLowerCase()}-${uid()}`,
      studioId: getCurrentStudioId(),
      tipo,
      activo,
      config,
      actualizadoEn,
    };
    setIntegraciones(prev => {
      const otras = prev.filter(i => i.tipo !== tipo);
      return [...otras, registro];
    });
    dbUpsertIntegracion(registro);
  }

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
    const now = new Date();

    // Candidatos a notificar: solo canal real disponible hoy es email (Resend).
    // No hay integración de WhatsApp Business, así que ya no fingimos enviarlo.
    // Detección de candidatos compartida con el cron de servidor — ver
    // lib/automation-engine.ts.
    const candidatos = computeAutomationCandidatos(
      { automationRules, automationLogs, socios, reservas, recibos, sesiones, tiposClase },
      now
    );

    if (candidatos.length === 0) return [];

    // ENVIAR_EMAIL se manda solo (vía /api/emails/send). COBRAR_RECIBO nunca
    // se ejecuta aquí — solo queda registrado como PENDIENTE_ADMIN a la espera
    // de que alguien lo apruebe con un toque desde Automatizaciones.
    const nuevosLogs: AutomationLog[] = await Promise.all(candidatos.map(async (c): Promise<AutomationLog> => {
      const base = {
        id: `log-${uid()}`,
        studioId: getCurrentStudioId(),
        ruleId: c.rule.id,
        ruleName: c.rule.nombre,
        socioId: c.socio.id,
        socioNombre: `${c.socio.nombre} ${c.socio.apellidos}`,
        pasoIndex: 0,
        accion: c.accion,
        ejecutadoEn: now.toISOString(),
        proximaAccionEn: c.proximaAccionEn,
        reciboId: c.reciboId ?? null,
      };

      if (c.accion === 'COBRAR_RECIBO') {
        return { ...base, resultado: 'PENDIENTE_ADMIN' as ResultadoLog, detalle: c.mensaje };
      }

      try {
        const res = await fetch('/api/emails/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tipo: 'automatizacion',
            to: c.socio.email,
            toName: c.socio.nombre,
            data: { titulo: c.titulo, mensaje: c.mensaje },
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          return { ...base, resultado: 'FALLIDO' as ResultadoLog, detalle: body.error ?? `No se pudo enviar el email (HTTP ${res.status})` };
        }
        return { ...base, resultado: 'EJECUTADO' as ResultadoLog, detalle: `Email enviado a ${c.socio.email}: "${c.titulo}"` };
      } catch (err) {
        return { ...base, resultado: 'FALLIDO' as ResultadoLog, detalle: err instanceof Error ? err.message : 'Error de red al enviar el email' };
      }
    }));

    setAutomationLogs(prev => [...nuevosLogs, ...prev]);
    nuevosLogs.forEach(l => dbInsertAutomationLog(l));
    setAutomationRules(prev => prev.map(r => {
      const ruleNewLogs = nuevosLogs.filter(l => l.ruleId === r.id);
      if (ruleNewLogs.length === 0) return r;
      const nuevasVeces = r.ejecutadaVeces + ruleNewLogs.length;
      dbUpdateAutomationRule(r.id, { ejecutadaVeces: nuevasVeces, ultimaEjecucion: now.toISOString() });
      return { ...r, ejecutadaVeces: nuevasVeces, ultimaEjecucion: now.toISOString() };
    }));

    return nuevosLogs;
  }

  function addNotaProgreso(nota: Omit<NotaProgreso, 'id' | 'studioId' | 'creadaEn'>) {
    const nueva: NotaProgreso = {
      id: `nota-prog-${uid()}`,
      studioId: getCurrentStudioId(),
      creadaEn: new Date().toISOString(),
      ...nota,
    };
    setNotasProgreso(prev => [nueva, ...prev]);
  }

  const value: StudioContextValue = {
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
    addSesion,
    updateSesion,
    deleteSesion,
    addReserva,
    cancelarReserva,
    checkin,
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
    ventasPOS,
    addVentaPOS,
    campanas,
    addCampana,
    deleteCampana,
    duplicateCampana,
    automatizaciones,
    addAutomatizacion,
    toggleAutomatizacion,
    codigosDescuento,
    addCodigoDescuento,
    toggleCodigoDescuento,
    deleteCodigoDescuento,
    actividadReciente,
    addActividadReciente,
    notificaciones,
    marcarNotificacionLeida,
    marcarTodasLeidas,
    videosOnDemand,
    addVideo,
    toggleVideo,
    postsComunidad,
    addPost,
    toggleLikePost,
    integraciones,
    upsertIntegracion,
    mensajesEquipo,
    addMensajeEquipo,
    preferenciasSocio,
    upsertPreferenciasSocio,
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
    addDashboardChart,
    deleteDashboardChart,
    backups,
    studioConfig,
    updateStudioConfig,
    resetDatosPilates,
    automationRules,
    automationLogs,
    notasProgreso,
    toggleAutomationRule,
    addAutomationLog,
    runAutomation,
    addNotaProgreso,
    dismissLog,
    actualizarLog,
    dataLoaded,
    studio,
    updateAvatarAdmin,
    updateStudio,
  };

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
      setCitas(data.citas);
      setProductosPOS(data.productosPOS);
      setVentasPOS(data.ventasPOS);
      setCampanas(data.campanas);
      setAutomatizaciones(data.automatizaciones);
      setCodigosDescuento(data.codigosDescuento);
      setActividadReciente(data.actividadReciente);
      setNotificaciones(data.notificaciones);
      setVideosOnDemand(data.videosOnDemand);
      setPostsComunidad(data.postsComunidad);
      setIntegraciones(data.integraciones ?? []);
      setMensajesEquipo(data.mensajesEquipo ?? []);
      setPreferenciasSocio(data.preferenciasSocio ?? []);
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
      setDashboardCharts(data.dashboardCharts ?? []);
      setBackups(data.backups ?? []);
      setAutomationRules(data.automationRules);
      setAutomationLogs(data.automationLogs);
      setNotasProgreso(data.notasProgreso);
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
