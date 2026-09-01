'use client';

import { createContext, useContext, useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { fijarEtiqueta, capturarExcepcion, capturarMensaje } from '@/lib/sentry-cliente';
import { CoreProvider } from '@/lib/core-context';
import { Toast, useToast } from '@/components/ui/toast';
import { supabase } from '@/lib/db/supabase';
import type { RowInstructores } from '@/lib/db-types';
import {
  fetchAllStudioData, fetchCriticalStudioData, fetchDeferredStudioData, mapInstructor,
  dbInsertSocio, dbUpdateSocio, dbDeleteSocio,
  dbFetchCamposPersonalizados, dbInsertCampoPersonalizado, dbUpdateCampoPersonalizado, dbDeleteCampoPersonalizado,
  dbFetchSegmentosClientes, dbInsertSegmentoCliente, dbUpdateSegmentoCliente, dbDeleteSegmentoCliente,
  dbFetchPlantillasEmail, dbUpsertPlantillaEmail,
  dbFetchDependencySnapshots,
  dbInsertPlanTarifa, dbUpdatePlanTarifa, dbDeletePlanTarifa,
  dbInsertSuscripcion, dbUpdateSuscripcion, dbCongelarSuscripcion, dbDescongelarSuscripcion,
  dbGuardarEntrega,
  dbInsertBloqueoMaquina, dbCerrarBloqueoMaquina,
  dbInsertPlazaFija, dbUpdatePlazaFija,
  dbCrearRecuperacion, dbListRecuperaciones, dbAnularRecuperacion,
  dbPonerExcepcion, dbQuitarExcepcion,
  dbUpsertMandatoSepa, dbCancelarMandatoSepa,
  dbInsertSesion, dbUpdateSesion, dbDeleteSesion, dbInsertSesionesBatch, dbUpdateSesionesBatch, dbUpdateSerieDesde,
  dbCancelarReservasPorSesiones,
  dbUpdateReserva, dbReservarPlaza, dbCancelarReservaPlaza,
  dbInsertRecibo, dbUpdateRecibo, dbMarcarCobrado, dbUpdateRecibosBatch, dbDeleteRecibo,
  dbInsertCita, dbUpdateCita,
  dbInsertServicioCita, dbUpdateServicioCita, dbDeleteServicioCita, dbReplaceDisponibilidadCitas,
  dbInsertVentaPOS,
  dbInsertProductoPOS, dbUpdateProductoPOS, dbDeleteProductoPOS,
  dbInsertActividadReciente,
  dbInsertRewardRule, dbUpdateRewardRule,
  dbInsertRewardHistory, dbInsertCreditTransaction, dbAjustarCreditos,
  dbOtorgarCreditoDisparador,
  dbInsertRewardCatalogItem, dbUpdateRewardCatalogItem, dbDeleteRewardCatalogItem, dbAjustarStock,
  dbConsumirSesionBono,
  dbDevolverSesionBono,
  dbInsertRewardRedemption, dbUpdateRewardRedemption,
  dbInsertAchievementDefinition, dbUpdateAchievementDefinition,
  dbUpsertAchievementProgress, dbInsertAchievementHistory,
  dbInsertLevelDefinition, dbUpdateLevelDefinition, dbDeleteLevelDefinition,
  dbInsertChallengeDefinition, dbUpdateChallengeDefinition, dbDeleteChallengeDefinition,
  dbUpsertChallengeProgress, dbInsertChallengeHistory,
  dbInsertNotaInterna, dbDeleteNotaInterna,
  dbInsertCondicion, dbUpdateCondicion, dbDeleteCondicion,
  dbFetchPlantillasCuestionarioSalud, dbInsertPlantillaCuestionarioSalud, dbUpdatePlantillaCuestionarioSalud, dbDeletePlantillaCuestionarioSalud,
  dbFetchRespuestasCuestionarioSalud, dbUpsertRespuestaCuestionarioSalud,
  dbInsertRespuestaSesion, dbUpdateRespuestaSesion,
  dbInsertCampana, dbDeleteCampana, dbUpdateCampana,
  dbInsertAutomatizacion, dbUpdateAutomatizacion, dbDeleteAutomatizacion,
  dbInsertAutomationLog, dbUpdateAutomationRule, dbInsertAutomationRule,
  dbInsertTipoClase, dbUpdateTipoClase, dbDeleteTipoClase,
  dbUpsertContenidoPortal, dbInsertBannerPortal, dbUpdateBannerPortal, dbDeleteBannerPortal,
  dbInsertNovedadEstudio, dbUpdateNovedadEstudio, dbDeleteNovedadEstudio,
  dbInsertSala, dbUpdateSala, dbDeleteSala,
  dbInsertInstructor, dbUpdateInstructor, dbDeleteInstructor,
  dbUpdateStudio, dbUpdateHorarioEstudio, dbUpdateStudioConfig, resolveStudioId, setCurrentStudioId, getCurrentStudioId,
  setDbErrorListener, dbMisLikesComunidad,
} from '@/lib/supabase-data';
import { mensajeDeFalloAlGuardar, type ResultadoEscritura } from '@/lib/errores';

/**
 * Lo que de verdad ha pasado al intentar reservar.
 *
 * Antes `addReserva` devolvía un `EstadoReserva` a secas, y en la vía pública
 * ese estado era una ESTIMACIÓN del navegador: el POST salía sin `await` y sin
 * mirar la respuesta. Si el servidor decía «necesitas un bono», la pantalla
 * anunciaba «Reservada» igual — y la reserva no existía en ningún sitio.
 * Un resultado que puede ser `{ ok: false }` obliga a quien llama a mirar.
 */
export type ResultadoReserva =
  | {
      ok: true;
      estado: EstadoReserva;
      /**
       * El sitio que el servidor pudo darle, o `null`.
       *
       * ⚠️ `null` habiendo elegido uno NO es un detalle: significa que la
       * reserva salió bien y la plaza NO. `asignarSpotReserva` devuelve `null`
       * en tres casos legítimos —el sitio se ocupó en la carrera, está
       * desactivado, o no es de esa sala— y hasta ahora ese dato llegaba al
       * navegador y se tiraba: la socia leía «Reservada. Te esperamos», se
       * presentaba esperando el reformer 3 y era de otra. Es el bug #500 otra
       * vez, en pequeño.
       */
      spotAsignado?: string | null;
    }
  | { ok: false; error: string };
import { horarioConNuevaHora } from '@/lib/serie-horario';
import { politicaPrivacidadPorDefecto, terminosServicioPorDefecto, type DatosEstudioLegal } from '@/lib/legal-textos';
import type { SegmentoCliente, DefinicionSegmento } from '@/lib/segmentos/tipos';
import type {
  Studio,
  DiaHorario,
  Socio,
  CampoPersonalizado,
  PlantillaEmail,
  CambiosPlantillaEmail,
  InstructorDependencySnapshot,
  AceptacionContrato,
  Suscripcion,
  Sesion,
  Reserva,
  EstadoReserva,
  Recibo,
  MetodoCobro,
  Factura,
  PlanTarifa,
  Sala,
  BloqueoMaquina,
  PlazaFija,
  Recuperacion,
  SocioExcepcion,
  MandatoSEPA,
  TipoClase,
  ContenidoPortal,
  BannerPortal,
  NovedadEstudio,
  FavoritoClase,
  Instructor,
  Spot,
  NotaInterna,
  CondicionSalud,
  PlantillaCuestionarioSalud,
  RespuestaCuestionarioSalud,
  RespuestaSesionRow,
  RespuestaSesion,
  Cita,
  ServicioCita,
  DisponibilidadCita,
  ProductoPOS,
  VentaPOS,
  Campana,
  Automatizacion,
  CodigoDescuento,
  ActividadReciente,
  TipoActividad,
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
  RewardTrigger,
  LevelDefinition,
  ChallengeDefinition,
  ChallengeProgress,
  ChallengeHistory,
  DashboardChart,
  BackupMeta,
  VideoOnDemand,
  PostComunidad,
  AutomationRule,
  AutomationLog,
  NotaProgreso,
  Integracion,
  TipoIntegracion,
  SustitucionConfirmadaPublica,
} from '@/lib/types';
import { encolarEnvioCampana, enviarEmailPromocion, enviarEmailCancelacionClase, enviarEmailBienvenida, avisarClaseCancelada, avisarClaseCreadaPorInstructor, authHeader, portalAuthHeader, cargarDatosPublicos, cargarAforoPublico, leerSociaLocal, sellarFactura, verificarLimiteSocias } from '@/lib/api-client';
import { fusionarAforo } from '@/lib/portal-aforo';
import { resolverDestinatariasCampana as resolverDestinatariasCampanaCompartido } from '@/lib/marketing/segmentos';
import { tieneConsentimientoMarketingAlgunaVez } from '@/lib/marketing/consentimiento';
import { useAuth } from '@/lib/auth-context';
import { reglaActivaPara, decidirOtorgarCreditos, validarCanje, aplicarCanjeCreditos } from '@/lib/engines/reward-engine';
import { tieneFeature } from '@/lib/billing/entitlements';
import { calcularMetrica } from '@/lib/engines/achievement-engine';
import { calcularRacha, type RachaInfo } from '@/lib/engines/streak-engine';
import { calcularNivel, type NivelInfo } from '@/lib/engines/level-engine';
import { calcularProgresoReto } from '@/lib/engines/challenge-engine';
import { uid, uuidV4, fechaLargaEstudio, horaEstudio, hoyEnEstudio } from '@/lib/utils';
import { DEFAULT_LAYOUT, type OrdenVisibilidad } from '@/lib/layout-runtime';
import type { BloqueHome } from '@/lib/portal-home-bloques';
import type { TabBarStyleId } from '@/lib/theme-schema';
import { redesSocialesCompletas, type RedSocialId } from '@/lib/canales-estudio';
import { DEFAULT_NAV_CONFIG, resolveNavConfig, type NavConfigShape } from '@/lib/portal-nav';
import { DEFAULT_VARIANTES, resolveVariantes, type VariantesResueltas } from '@/lib/theme-variantes';
import { MENSAJE_TEMA_PREVIEW, resolveTemaJs, type TemaJs } from '@/lib/theme-preview-puente';
// `debeDevolverBono` ya no se importa aquí: la decisión de devolver la sesión
// del bono al cancelar la toma la BD (migr 0129) y este contexto la obedece.
// La función sigue viva en booking-logic para el portal público y sus tests.
import {
  decidirReservaNueva,
  decidirPremioReferido,
} from '@/lib/booking-logic';
import { bonoConsumible, bonoDevolvible, calcularFechaFinBono, calcularReactivacion, generaRenovacionAlAgotarse } from '@/lib/bono-logic';
import { useContentStore, type OpcionesAddPost } from '@/lib/stores/use-content-store';
import { useDiscountCodesStore } from '@/lib/stores/use-discount-codes-store';
import { useIntegrationsStore } from '@/lib/stores/use-integrations-store';
import { useDashboardChartsStore } from '@/lib/stores/use-dashboard-charts-store';
import { useProgressNotesStore } from '@/lib/stores/use-progress-notes-store';
import type { AparienciaWidget } from '@/lib/reservar/apariencia-widget';

// ─── Studio config (policy / terms) ─────────────────────────────────────────

export interface StudioConfig {
  politicaPrivacidad: string;
  terminosServicio: string;
}

/**
 * Textos legales efectivos de un estudio: los suyos si los ha reescrito a mano,
 * y si no, los de por defecto REDACTADOS CON SUS DATOS fiscales.
 *
 * Antes el fallback era un texto fijo que decía "el responsable es el estudio de
 * pilates" — sin nombre ni NIF, aunque el estudio los tuviera rellenos. Lo que
 * firmaba la clienta no identificaba a nadie.
 */
export function configLegalDe(
  studio: DatosEstudioLegal | null | undefined,
  guardados: { politicaPrivacidad?: string | null; terminosServicio?: string | null } | null | undefined,
): StudioConfig {
  const e = studio ?? {};
  return {
    politicaPrivacidad: guardados?.politicaPrivacidad ?? politicaPrivacidadPorDefecto(e),
    terminosServicio: guardados?.terminosServicio ?? terminosServicioPorDefecto(e),
  };
}

/**
 * Solo como estado inicial, antes de saber de qué estudio hablamos. En cuanto
 * carga, `configLegalDe` lo sustituye por el texto con los datos reales; si
 * alguien llegara a firmar esto, el propio documento avisa de que faltan.
 */
export const defaultStudioConfig: StudioConfig = {
  politicaPrivacidad: politicaPrivacidadPorDefecto(),
  terminosServicio: terminosServicioPorDefecto(),
};


// ─── Helpers ─────────────────────────────────────────────────────────────────


// ─── Context shape ────────────────────────────────────────────────────────────

interface StudioContextValue {
  // Static reference data
  planesTarifa: PlanTarifa[];
  salas: Sala[];
  tiposClase: TipoClase[];
  // Contenido editable del portal cliente (mensaje destacado + banners) y
  // favoritos de clase de la socia en sesión. Se cargan en bloque con el resto
  // del catálogo público (cargarPublico), no con un fetch aparte.
  contenidoPortal: ContenidoPortal | null;
  bannersPortal: BannerPortal[];
  novedadesEstudio: NovedadEstudio[];
  favoritos: FavoritoClase[];
  toggleFavorito: (tipoClaseId: string, accion: 'marcar' | 'desmarcar') => Promise<ResultadoEscritura>;
  // Retos del carrusel de Inicio (tema Bloom) — retosApuntados es SOLO los de
  // la socia en sesión; retoConteos es el conteo real del estudio ENTERO
  // (llega ya agregado del servidor, no se calcula en el cliente).
  retosApuntados: string[];
  retoConteos: Record<string, number>;
  toggleReto: (retoKey: string, accion: 'marcar' | 'desmarcar') => Promise<ResultadoEscritura>;
  // Nota agregada del ESTUDIO entero (todas sus instructoras), para "Tu
  // estudio" en Inicio — `null` bajo el mínimo de valoraciones para enseñar
  // algo, mismo criterio que `Instructor.valoracion` (lib/portal-tema/valoracion.ts).
  valoracionEstudio: { media: number; total: number } | null;
  updateMensajeDestacado: (mensaje: string | null) => Promise<ResultadoEscritura>;
  addBannerPortal: (fields: Omit<BannerPortal, 'id' | 'studioId'>) => Promise<ResultadoEscritura>;
  updateBannerPortal: (id: string, changes: Partial<Omit<BannerPortal, 'id' | 'studioId'>>) => Promise<ResultadoEscritura>;
  deleteBannerPortal: (id: string) => Promise<ResultadoEscritura>;
  addNovedadEstudio: (fields: Omit<NovedadEstudio, 'id' | 'studioId'>) => Promise<ResultadoEscritura>;
  updateNovedadEstudio: (id: string, changes: Partial<Omit<NovedadEstudio, 'id' | 'studioId'>>) => Promise<ResultadoEscritura>;
  deleteNovedadEstudio: (id: string) => Promise<ResultadoEscritura>;
  // Orden/visibilidad de los módulos de Inicio del portal (Fase 2 del editor
  // de temas). Solo lectura aquí — se edita desde el dashboard
  // (components/theme/portal-bloques-editor.tsx), que llama a fetchLayout()/
  // guardarLayoutApi() directamente, no a través de este contexto.
  portalHome: OrdenVisibilidad;
  // Constructor de bloques del portal (Fase 3, generalizado a Clases/Bonos en
  // la Fase 1 del Theme Builder) — ya PUBLICADO (nunca el borrador, ver
  // lib/db/supabase-data-admin.ts). Se edita desde
  // components/theme/portal-bloques-editor.tsx igual que portalHome.
  homeBloques: BloqueHome[];
  bloquesClases: BloqueHome[];
  bloquesBonos: BloqueHome[];
  // /reservar (Fase 2 de su generalización a bloques): igual que las tres de
  // arriba, ya PUBLICADO. Consumida por app/reservar/[slug]/page.tsx en vez
  // de que esa página resuelva el layout por su cuenta — una sola lectura,
  // como el resto de pantallas del portal.
  bloquesReservar: BloqueHome[];
  // Comportamiento de la barra inferior del portal (galería de temas,
  // "Editorial") — expuesto como valor JS, no solo CSS: portal-shell.tsx
  // decide con esto si pinta iconos/pestaña expandible.
  tabBarStyle: TabBarStyleId;
  // Barra clásica, no flotante (Oliva/Noir) — mismo motivo JS que tabBarStyle:
  // decide el `position` de <PortalNav>, algo que una CSS var no puede hacer.
  barraClasica: boolean;
  // Barra flotante (Bloom) — eje INDEPENDIENTE de barraClasica (ver
  // barraFlotanteSchema en theme-schema.ts). El portal "de siempre" solo la usa
  // por CSS var; SOLO los temas del kit la leen aquí como valor JS, para
  // decidir `features.tab_bar_style` (portal-tema-marco.tsx/vista-previa-kit.tsx)
  // — mismo motivo que barraClasica está en este Context y no solo en CSS.
  barraFlotante: boolean;
  // Variantes de FORMA por bloque (accesos rápidos en rejilla/círculos,
  // etiquetas de la barra, retos de color...) — ver lib/theme-variantes.ts.
  // Siempre completo: los componentes nunca tienen que poner su propio
  // `?? 'filas'`.
  variantes: VariantesResueltas;
  // Pestañas ocultas/renombradas de esa misma barra (Fase 2 del Theme
  // Builder) — ver lib/portal-nav.ts.
  navPortal: NavConfigShape;
  /** Tema instalado (`oliva`/`bloom`/`noir`/`classic`…). El portal en React
   *  elige con esto cuál de los tres juegos de tokens monta. */
  themeIdPublicado: string | null;
  // Redes sociales del pie de página público (Fase 3) — ver lib/theme-schema.ts.
  redesSociales: Record<RedSocialId, string>;
  /** Textos de la portada de /reservar escritos por el estudio. Vacío = el
   *  texto por defecto de la página (ver su hero). */
  // Los siete últimos son los textos de VOZ (ver `theme-schema.ts`): vacío
  // significa «usa el de fábrica», nunca «no muestres nada».
  textosReservar: { titular: string; subtitulo: string; cta: string; sobreTitulo: string; sobreTexto: string; avisoQuiz: string; vacioTitulo: string; vacioTexto: string; confirmacion: string; listaEspera: string; ayuda: string; comoFunciona: string };
  /** Apariencia GUARDADA del widget incrustado. Los `?params=` la pisan. */
  aparienciaWidget: { fondo: string | null; fuente: string | null; ocultarPie: boolean; soloPestana: boolean; texto: 'auto' | 'claro' | 'oscuro' };
  /** Orden/visibilidad CRUDOS de las secciones de /reservar. Se guardan tal
   *  cual y las reglas las aplica `ordenarSecciones` en quien pinta — así la
   *  página y el editor no pueden divergir. */
  ordenReservar: { orden: string[]; ocultos: string[] };
  instructores: Instructor[];
  spots: Spot[];
  bloqueosMaquina: BloqueoMaquina[];
  plazasFijas: PlazaFija[];
  // F2 (B2.2): asignar devuelve el resultado para que la UI muestre el choque de
  // sitio (violación de la exclusión GiST). quitar = baja lógica (estado BAJA).
  asignarPlazaFija: (fields: Omit<PlazaFija, 'id' | 'studioId' | 'creadaEn'>) => Promise<{ ok: true } | { error: string }>;
  quitarPlazaFija: (id: string) => Promise<ResultadoEscritura>;
  // Feature #2 (ficha Lorari-vs-Tentare): autoservicio desde el portal — solo
  // tiene efecto con sesión de socia (ctxPublico presente); nunca desde staff,
  // que sigue usando asignarPlazaFija/quitarPlazaFija de arriba.
  // reservaEstaSemana: si al crearla ya materializó la ocurrencia de esta
  // semana (la sesión desde la que se creó), null si ya la tenía reservada.
  crearPlazaFijaPropia: (sesionId: string) => Promise<{ ok: true; reservaEstaSemana: { estado: string; reservaId: string } | null } | { ok: false; error: string }>;
  pausarPlazaFijaPropia: (id: string) => Promise<ResultadoEscritura>;
  reanudarPlazaFijaPropia: (id: string) => Promise<ResultadoEscritura>;
  darDeBajaPlazaFijaPropia: (id: string) => Promise<ResultadoEscritura>;
  recuperaciones: Recuperacion[];
  // F2 (B2.9): excepciones "porque lo digo yo". Toggle: poner (upsert) / quitar (delete).
  socioExcepciones: SocioExcepcion[];
  // F2 (B2.10) cuaderno 19.14: mandatos SEPA. ponerMandato reutiliza el vigente de
  // la socia (uno por socia); quitarMandato = cancelar.
  mandatosSepa: MandatoSEPA[];
  ponerMandato: (socioId: string, iban: string, refMandato: string, fechaFirma: string) => Promise<ResultadoEscritura>;
  quitarMandato: (id: string) => Promise<ResultadoEscritura>;
  ponerExcepcion: (socioId: string, tipo: string, motivo: string | null) => Promise<ResultadoEscritura>;
  quitarExcepcion: (socioId: string, tipo: string) => Promise<ResultadoEscritura>;
  // F2 (B2.3): dueña concede una recuperación. Devuelve TOPE si ya tiene 4 vivas.
  darRecuperacion: (socioId: string, motivo: string | null) => Promise<'CREADA' | 'TOPE' | 'ERROR'>;
  anularRecuperacion: (id: string) => Promise<ResultadoEscritura>;

  // Mutable state
  socios: Socio[];
  suscripciones: Suscripcion[];
  sesiones: Sesion[];
  reservas: Reserva[];
  recibos: Recibo[];
  facturas: Factura[];
  notasInternas: NotaInterna[];

  // Socios
  addSocio: (fields: Omit<Socio, 'id' | 'studioId' | 'fechaAlta'> & { planId?: string; aceptacionContrato?: AceptacionContrato }) => Promise<ResultadoEscritura & { id?: string }>;
  addSocioFromPortal: (fields: { id: string; nombre: string; email: string; telefono?: string; aceptacionContrato?: AceptacionContrato; referidoPor?: string | null; origenLead?: string | null }) => Promise<ResultadoEscritura>;
  updateSocio: (id: string, changes: Partial<Socio>) => Promise<ResultadoEscritura>;
  deleteSocio: (id: string) => Promise<void>;
  addTagSocio: (socioId: string, tag: string) => Promise<ResultadoEscritura>;
  removeTagSocio: (socioId: string, tag: string) => Promise<ResultadoEscritura>;

  // Suscripciones
  assignPlan: (socioId: string, planId: string | null) => Promise<void>;
  pausarSuscripcion: (susId: string, motivo?: string) => Promise<ResultadoEscritura>;
  reanudarSuscripcion: (susId: string) => Promise<ResultadoEscritura>;
  reactivarSuscripcion: (susId: string) => Promise<ResultadoEscritura>;

  // Notas internas
  addNota: (socioId: string, texto: string) => Promise<ResultadoEscritura>;
  deleteNota: (notaId: string) => Promise<ResultadoEscritura>;

  // Ficha clínica — condiciones de salud (FICHA-CLINICA.md)
  condicionesSalud: CondicionSalud[];
  addCondicion: (fields: Omit<CondicionSalud, 'id' | 'studioId' | 'creadoEn' | 'actualizadoEn'>) => Promise<ResultadoEscritura>;
  updateCondicion: (id: string, changes: Partial<CondicionSalud>) => Promise<ResultadoEscritura>;
  deleteCondicion: (id: string) => Promise<ResultadoEscritura>;

  // Ficha clínica — evolución post-clase (Fase 2)
  respuestasSesion: RespuestaSesionRow[];
  registrarRespuestaSesion: (params: { socioId: string; sesionId: string | null; respuesta: RespuestaSesion; nota?: string | null }) => Promise<ResultadoEscritura>;

  // Cuestionario de salud configurable (Fase 1, ficha Lorari-vs-Tentare) — la
  // plantilla la gestiona solo PROPIETARIO (RLS); la rellenan PROPIETARIO/
  // INSTRUCTOR en la ficha de la clienta. Sin canal público/portal.
  plantillasCuestionarioSalud: PlantillaCuestionarioSalud[];
  addPlantillaCuestionarioSalud: (fields: Omit<PlantillaCuestionarioSalud, 'id' | 'studioId'>) => Promise<ResultadoEscritura>;
  updatePlantillaCuestionarioSalud: (id: string, changes: Partial<Omit<PlantillaCuestionarioSalud, 'id' | 'studioId'>>) => Promise<ResultadoEscritura>;
  deletePlantillaCuestionarioSalud: (id: string) => Promise<ResultadoEscritura>;
  respuestasCuestionarioSalud: RespuestaCuestionarioSalud[];
  guardarRespuestaCuestionarioSalud: (socioId: string, preguntaId: string, respuesta: string | null) => Promise<ResultadoEscritura>;

  // Sesiones
  addSesion: (fields: Omit<Sesion, 'id' | 'studioId'>) => Promise<ResultadoEscritura>;
  updateSesion: (id: string, changes: Partial<Sesion>) => Promise<ResultadoEscritura>;
  deleteSesion: (id: string) => Promise<ResultadoEscritura>;
  // Series de clases recurrentes (I-3)
  addSesionesSerie: (fields: Omit<Sesion, 'id' | 'studioId' | 'serieId'>[]) => Promise<ResultadoEscritura>;
  editarSerieDesde: (sesionId: string, changes: { tipoClaseId: string; salaId: string; instructorId: string; aforoMaximo: number; notas: string | null; horaInicio: string; horaFin: string }) => Promise<ResultadoEscritura & { count?: number }>;
  cancelarSerieDesde: (sesionId: string) => Promise<ResultadoEscritura>;
  /** Marca CANCELADA las reservas activas de estas sesiones. Llamar SIEMPRE
   *  después de haber avisado a las socias (ver updateSesion). */
  cancelarReservasDeSesiones: (ids: string[], op: string) => Promise<ResultadoEscritura>;

  // Reservas
  // opciones.checkInInmediato: walk-in (I-alta pilar 6) — se añade y se marca
  // asistencia en la misma llamada, sin exigir un segundo clic en "Check-in"
  // sobre la fila ya creada. Solo tiene efecto si la reserva queda CONFIRMADA
  // (una LISTA_ESPERA no puede tener asistencia) y fuera de la vía pública.
  addReserva: (sesionId: string, socioId: string, spotId?: string | null, opciones?: { checkInInmediato?: boolean }) => Promise<ResultadoReserva>;
  // recuperacionCreada/recuperacionCaducaEl: solo la vía pública los rellena
  // (al cancelar una ocurrencia de plaza fija, ver cancelarReservaPublica) —
  // el panel de staff los deja undefined, no aplica ahí.
  cancelarReserva: (reservaId: string) => Promise<ResultadoEscritura & { recuperacionCreada?: boolean; recuperacionCaducaEl?: string | null; avisoBono?: string }>;
  // Fase 2b: acepta una oferta de plaza de lista de espera dentro de su plazo.
  // Solo tiene sentido desde el portal (socia con sesión iniciada) — ver
  // app/api/reservas/aceptar-oferta-espera/route.ts.
  aceptarOfertaEspera: (reservaId: string) => Promise<ResultadoEscritura>;
  // Gap 4 (portal Reservas > Pasadas): valora de 1 a 5 una clase YA ASISTIDA,
  // autoservicio desde la sesión normal de la socia. Solo tiene sentido desde
  // el portal — ver valorarExperienciaReservaPublica (supabase-data-admin.ts).
  valorarExperienciaReserva: (reservaId: string, valoracion: number) => Promise<ResultadoEscritura>;
  // F2 (B2.4) dueña-first: da de baja una reserva y concede una recuperación en su
  // lugar (no devuelve bono). Devuelve TOPE sin cancelar si ya tiene 4 vivas.
  bajaConRecuperacion: (reservaId: string, motivo: string | null) => Promise<{ recuperacion: 'CREADA' | 'TOPE' | 'ERROR'; caduca: string | null }>;
  checkin: (reservaId: string, snapshotOverride?: Reserva[]) => Promise<ResultadoEscritura>;
  deshacerCheckin: (reservaId: string) => Promise<ResultadoEscritura>;
  marcarNoShow: (reservaId: string) => Promise<ResultadoEscritura>;
  revertirNoShow: (reservaId: string) => Promise<ResultadoEscritura>;
  liberarSpot: (reservaId: string) => Promise<ResultadoEscritura>;
  asignarSpot: (sesionId: string, socioId: string, spotId: string) => Promise<ResultadoEscritura>;

  // Recibos
  addRecibo: (fields: Omit<Recibo, 'id' | 'studioId' | 'estado' | 'fechaCobro' | 'fechaDevolucion' | 'intentosReintento'>) => Promise<ResultadoEscritura>;
  crearFacturaDirecta: (fields: { socioId: string; concepto: string; importe: number }) => Promise<ResultadoEscritura | { ok: false; error: string; cobroRegistrado: true }>;
  marcarCobrado: (reciboId: string, metodo?: MetodoCobro) => Promise<ResultadoEscritura | { ok: false; error: string; cobroRegistrado: true }>;
  marcarDevuelto: (reciboId: string) => Promise<ResultadoEscritura>;
  reintentar: (reciboId: string) => Promise<ResultadoEscritura>;
  reintentarSelladoFactura: (reciboId: string) => Promise<ResultadoEscritura>;
  deleteRecibo: (id: string) => Promise<ResultadoEscritura>;
  cobrarTodosPendientes: (socioId?: string) => Promise<ResultadoEscritura>;
  marcarRecibosEnviadosAlBanco: (ids: string[]) => Promise<ResultadoEscritura>;

  // Citas
  citas: Cita[];
  addCita: (fields: Omit<Cita, 'id' | 'studioId' | 'creadoEn'>) => Promise<ResultadoEscritura>;
  updateCita: (id: string, changes: Partial<Cita>) => Promise<ResultadoEscritura>;
  cancelarCita: (citaId: string) => Promise<ResultadoEscritura>;
  completarCita: (citaId: string) => Promise<ResultadoEscritura>;

  // Citas — catálogo de servicios + horario fino por instructora (0046)
  citasServicios: ServicioCita[];
  addServicioCita: (fields: Omit<ServicioCita, 'id' | 'studioId' | 'creadoEn'>) => Promise<ResultadoEscritura>;
  updateServicioCita: (id: string, changes: Partial<Omit<ServicioCita, 'id' | 'studioId'>>) => Promise<ResultadoEscritura>;
  deleteServicioCita: (id: string) => Promise<ResultadoEscritura>;
  citasDisponibilidad: DisponibilidadCita[];
  setDisponibilidadCitas: (instructorId: string, franjas: Array<{ diaSemana: number; horaInicio: string; horaFin: string }>) => Promise<ResultadoEscritura>;
  reservarCitaPublica: (args: { servicioId: string; instructorId: string; inicioISO: string }) => Promise<{ ok: true; inicio: string; fin: string } | { error: string }>;

  // POS
  productosPOS: ProductoPOS[];
  ventasPOS: VentaPOS[];
  addProductoPOS: (fields: Omit<ProductoPOS, 'id' | 'studioId'>) => Promise<ResultadoEscritura>;
  updateProductoPOS: (id: string, changes: Partial<ProductoPOS>) => Promise<ResultadoEscritura>;
  deleteProductoPOS: (id: string) => Promise<ResultadoEscritura>;
  addVentaPOS: (fields: Omit<VentaPOS, 'id' | 'studioId' | 'realizadaEn'>) => Promise<ResultadoEscritura>;

  // Campañas
  campanas: Campana[];
  addCampana: (fields: Omit<Campana, 'id' | 'studioId' | 'creadaEn' | 'enviados' | 'abiertos' | 'clics'>) => Promise<ResultadoEscritura>;
  deleteCampana: (id: string) => Promise<ResultadoEscritura>;
  duplicateCampana: (campana: Campana) => Promise<ResultadoEscritura>;
  updateCampana: (id: string, patch: Partial<Campana>) => Promise<ResultadoEscritura>;
  enviarCampana: (campana: Campana) => Promise<ResultadoEscritura>;
  contarDestinatariasCampana: (campana: Campana) => number;

  // Automatizaciones
  automatizaciones: Automatizacion[];
  addAutomatizacion: (fields: Omit<Automatizacion, 'id' | 'studioId' | 'ejecutadas' | 'creadaEn'>) => Promise<ResultadoEscritura>;
  updateAutomatizacion: (id: string, patch: Partial<Automatizacion>) => Promise<ResultadoEscritura>;
  deleteAutomatizacion: (id: string) => Promise<ResultadoEscritura>;
  toggleAutomatizacion: (autoId: string) => Promise<ResultadoEscritura>;

  // Códigos de descuento
  codigosDescuento: CodigoDescuento[];
  addCodigoDescuento: (fields: Omit<CodigoDescuento, 'id' | 'studioId' | 'usos' | 'creadoEn'>) => Promise<ResultadoEscritura>;
  toggleCodigoDescuento: (codigoId: string) => Promise<ResultadoEscritura>;
  deleteCodigoDescuento: (id: string) => Promise<ResultadoEscritura>;
  registrarUsoCodigo: (codigoId: string) => void;

  // Actividad reciente
  actividadReciente: ActividadReciente[];
  addActividadReciente: (tipo: TipoActividad, texto: string, socioId?: string, enlace?: string) => void;

  // Videos on demand
  videosOnDemand: VideoOnDemand[];
  addVideo: (fields: Omit<VideoOnDemand, 'id' | 'studioId' | 'vistas' | 'likes' | 'creadoEn'>) => void;
  toggleVideo: (videoId: string) => void;

  // Comunidad
  postsComunidad: PostComunidad[];
  likedPostIds: Set<string>;
  addPost: (texto: string, opts?: OpcionesAddPost) => void;
  toggleLikePost: (postId: string) => void;
  updatePost: (postId: string, texto: string) => void;
  deletePost: (postId: string) => void;
  integraciones: Integracion[];
  upsertIntegracion: (tipo: TipoIntegracion, activo: boolean, config: Record<string, string>, configAnterior: Record<string, string>) => void;
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
  addRewardRule: (fields: Omit<RewardRule, 'id' | 'studioId' | 'creadoEn' | 'topeMensual'> & { topeMensual?: number | null }) => Promise<ResultadoEscritura>;
  updateRewardRule: (id: string, changes: Partial<Omit<RewardRule, 'id' | 'studioId'>>) => Promise<ResultadoEscritura>;
  addRewardCatalogItem: (fields: Omit<RewardCatalogItem, 'id' | 'studioId' | 'creadoEn'>) => Promise<ResultadoEscritura>;
  updateRewardCatalogItem: (id: string, changes: Partial<Omit<RewardCatalogItem, 'id' | 'studioId'>>) => Promise<ResultadoEscritura>;
  deleteRewardCatalogItem: (id: string) => Promise<ResultadoEscritura>;
  canjearRecompensa: (socioId: string, catalogItemId: string) => Promise<{ ok: true } | { error: string }>;
  updateRewardRedemptionEstado: (id: string, estado: RewardRedemption['estado']) => Promise<ResultadoEscritura>;
  achievementDefinitions: AchievementDefinition[];
  achievementProgress: AchievementProgress[];
  achievementHistory: AchievementHistory[];
  addAchievementDefinition: (fields: Omit<AchievementDefinition, 'id' | 'studioId' | 'creadoEn'>) => Promise<ResultadoEscritura>;
  updateAchievementDefinition: (id: string, changes: Partial<Omit<AchievementDefinition, 'id' | 'studioId'>>) => Promise<ResultadoEscritura>;
  evaluarLogrosSocio: (socioId: string) => void;
  levelDefinitions: LevelDefinition[];
  nivelSocio: (socioId: string) => NivelInfo;
  addLevelDefinition: (fields: Omit<LevelDefinition, 'id' | 'studioId' | 'creadoEn'>) => Promise<ResultadoEscritura>;
  updateLevelDefinition: (id: string, changes: Partial<Omit<LevelDefinition, 'id' | 'studioId'>>) => Promise<ResultadoEscritura>;
  deleteLevelDefinition: (id: string) => Promise<ResultadoEscritura>;
  challengeDefinitions: ChallengeDefinition[];
  challengeProgress: ChallengeProgress[];
  challengeHistory: ChallengeHistory[];
  addChallengeDefinition: (fields: Omit<ChallengeDefinition, 'id' | 'studioId' | 'creadoEn'>) => Promise<ResultadoEscritura>;
  updateChallengeDefinition: (id: string, changes: Partial<Omit<ChallengeDefinition, 'id' | 'studioId'>>) => Promise<ResultadoEscritura>;
  deleteChallengeDefinition: (id: string) => Promise<ResultadoEscritura>;
  evaluarRetosSocio: (socioId: string) => void;
  dashboardCharts: DashboardChart[];
  addDashboardChart: (fields: Omit<DashboardChart, 'id' | 'studioId' | 'creadoEn'>) => void;
  deleteDashboardChart: (id: string) => void;
  backups: BackupMeta[];
  // Planes (mutable)
  addPlan: (fields: Omit<PlanTarifa, 'id' | 'studioId'>) => Promise<ResultadoEscritura>;
  updatePlan: (id: string, changes: Partial<Omit<PlanTarifa, 'id' | 'studioId'>>) => Promise<ResultadoEscritura>;
  deletePlan: (id: string) => Promise<ResultadoEscritura & { archivado?: boolean }>;

  // Salas (mutable)
  addSala: (fields: Omit<Sala, 'id' | 'studioId'>) => Promise<ResultadoEscritura>;
  updateSala: (id: string, changes: Partial<Omit<Sala, 'id' | 'studioId'>>) => Promise<ResultadoEscritura>;
  deleteSala: (id: string) => Promise<ResultadoEscritura>;
  // F2 (B2.7): averías de máquina. hasta=null → avería abierta.
  marcarAveria: (salaId: string, spotId: string | null, motivo: string | null, hasta: string | null) => Promise<ResultadoEscritura>;
  quitarAveria: (id: string) => Promise<ResultadoEscritura>;

  // Tipos de clase (mutable)
  addTipoClase: (fields: Omit<TipoClase, 'id' | 'studioId'>) => Promise<ResultadoEscritura>;
  updateTipoClase: (id: string, changes: Partial<Omit<TipoClase, 'id' | 'studioId'>>) => Promise<ResultadoEscritura>;
  deleteTipoClase: (id: string) => Promise<ResultadoEscritura>;

  // Campos personalizados de socia
  camposPersonalizados: CampoPersonalizado[];
  addCampoPersonalizado: (fields: Omit<CampoPersonalizado, 'id' | 'studioId'>) => Promise<ResultadoEscritura>;
  updateCampoPersonalizado: (id: string, changes: Partial<Omit<CampoPersonalizado, 'id' | 'studioId'>>) => Promise<ResultadoEscritura>;
  deleteCampoPersonalizado: (id: string) => Promise<ResultadoEscritura>;

  // Segmentos de clientes guardables (auditoría vs Momence)
  segmentosClientes: SegmentoCliente[];
  addSegmentoCliente: (nombre: string, condiciones: DefinicionSegmento) => Promise<ResultadoEscritura>;
  updateSegmentoCliente: (id: string, changes: Partial<Pick<SegmentoCliente, 'nombre' | 'condiciones'>>) => Promise<ResultadoEscritura>;
  deleteSegmentoCliente: (id: string) => Promise<ResultadoEscritura>;

  // Plantillas de email transaccional
  plantillasEmail: PlantillaEmail[];
  upsertPlantillaEmail: (tipo: PlantillaEmail['tipo'], changes: CambiosPlantillaEmail) => Promise<ResultadoEscritura>;

  // Riesgo de concentración por instructor
  dependencySnapshots: InstructorDependencySnapshot[];
  recalcularDependencia: () => Promise<boolean>;

  // Instructores (mutable)
  addInstructor: (fields: Omit<Instructor, 'id' | 'studioId'>, id?: string) => Promise<ResultadoEscritura>;
  updateInstructor: (id: string, changes: Partial<Omit<Instructor, 'id' | 'studioId'>>) => Promise<ResultadoEscritura>;
  deleteInstructor: (id: string) => Promise<ResultadoEscritura>;

  // Studio config (policy, terms)
  studioConfig: StudioConfig;
  updateStudioConfig: (changes: Partial<StudioConfig>) => Promise<ResultadoEscritura>;

  // Motor de automatización avanzado
  automationRules: AutomationRule[];
  automationLogs: AutomationLog[];
  notasProgreso: NotaProgreso[];
  toggleAutomationRule: (id: string) => Promise<ResultadoEscritura>;
  addAutomationRule: (fields: Omit<AutomationRule, 'id' | 'studioId' | 'ejecutadaVeces' | 'ultimaEjecucion' | 'creadaEn'>) => Promise<ResultadoEscritura>;
  addAutomationLog: (log: Omit<AutomationLog, 'id' | 'studioId'>) => void;
  runAutomation: () => Promise<AutomationLog[]>;
  addNotaProgreso: (nota: Omit<NotaProgreso, 'id' | 'studioId' | 'creadaEn'>) => Promise<ResultadoEscritura>;
  dismissLog: (id: string) => void;
  actualizarLog: (id: string, changes: Partial<Pick<AutomationLog, 'resultado' | 'detalle'>>) => void;

  // Studio management
  resetDatosPilates: () => void;
  dataLoaded: boolean;
  /**
   * La carga pública falló de verdad (red/servidor) — distinto de `dataLoaded`
   * con catálogo vacío, que hoy es indistinguible de "0 clases" para quien
   * pinta la pantalla. Fase 4 del rediseño del widget
   * (docs/widget-reservas-fase4-brief-diseno.md): antes cualquier fallo se
   * tragaba en `console.error` y el visitante veía un vacío mentiroso.
   */
  errorPublico: boolean;
  // Recarga los datos en ruta pública (tras el login de la socia).
  recargarPublico: () => void;
  /**
   * Refresca SOLO el aforo de las clases próximas. Es lo que usa el tic de
   * REFRESCO_ACTIVO_MS; `recargarPublico` se reserva para el montaje y la
   * vuelta a primer plano.
   */
  refrescarAforo: () => void;

  // Studio record (propietario) + avatar del admin
  studio: Studio | null;
  /** Id del plan más contratado del estudio, calculado en servidor. null = no destacar. */
  planMasElegidoId: string | null;
  /** Sustituciones ya confirmadas (P1 auditoría Momence) — para avisar "sustituye a X" en el widget público. */
  sustitucionesConfirmadas: SustitucionConfirmadaPublica[];
  updateAvatarAdmin: (avatarId: string | null) => Promise<ResultadoEscritura>;
  updateStudio: (changes: Partial<Studio>) => Promise<ResultadoEscritura>;
  updateHorarioEstudio: (dias: DiaHorario[]) => Promise<ResultadoEscritura>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

// Fase 3 del rediseño del portal (feedback de 49 propietarias: "no funciona
// en tiempo real"). Evaluado con tentare-arquitecto: un Realtime de verdad
// (canal Postgres directo desde el navegador de la socia) exigiría dar a
// `anon`/`authenticated` lectura ampliada sobre `reservas`/`sesiones` — la
// migración 0091 CERRÓ justo ese acceso tras el pentest (fuga cross-tenant),
// y `socios` ni siquiera tiene `auth_user_id` para acotar RLS por fila. Abrir
// esa vía de nuevo es un cambio de seguridad genuino, no una mejora de UX, y
// queda fuera de esta fase a propósito. En su lugar: acortar el intervalo de
// refresco activo (ya introducido en Fase 1 a 20s) a algo que cierre el caso
// real —dos socias reservando la misma clase casi a la vez— sin tocar RLS.
export const REFRESCO_ACTIVO_MS = 5_000;

const StudioContext = createContext<StudioContextValue | null>(null);

export function useStudio(): StudioContextValue {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error('useStudio must be used within StudioProvider');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function StudioProvider({ children, studioIdOverride, publicSlug }: { children: ReactNode; studioIdOverride?: string; publicSlug?: string }) {
  const [dataLoaded, setDataLoaded] = useState(false);
  const [errorPublico, setErrorPublico] = useState(false);
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
  const shadowedByPublicRoute = !publicSlug && /^\/(portal|reservar|kiosk|disponibilidad|aceptar-sustitucion|valorar|no-puedo|confirmar-reserva)\//.test(pathname ?? '');

  // Surface fire-and-forget DB write failures to the user instead of losing them.
  useEffect(() => {
    // El listener recibe (tag, error) y antes los IGNORABA los dos: un fallo de
    // permisos, una clave ajena rota o una sesión caducada se anunciaban todos
    // como "revisa tu conexión". Ahora se traduce la causa real.
    setDbErrorListener((_tag, error) => {
      setDbError({ msg: mensajeDeFalloAlGuardar(error), key: Date.now() });
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
  const [contenidoPortal, setContenidoPortal] = useState<ContenidoPortal | null>(null);
  const [bannersPortal, setBannersPortal] = useState<BannerPortal[]>([]);
  const [novedadesEstudio, setNovedadesEstudio] = useState<NovedadEstudio[]>([]);
  const [portalHome, setPortalHome] = useState<OrdenVisibilidad>(DEFAULT_LAYOUT.portalHome);
  const [homeBloques, setHomeBloques] = useState<BloqueHome[]>(DEFAULT_LAYOUT.bloques.home.publicado);
  const [bloquesClases, setBloquesClases] = useState<BloqueHome[]>(DEFAULT_LAYOUT.bloques.clases.publicado);
  const [bloquesBonos, setBloquesBonos] = useState<BloqueHome[]>(DEFAULT_LAYOUT.bloques.bonos.publicado);
  const [bloquesReservar, setBloquesReservar] = useState<BloqueHome[]>(DEFAULT_LAYOUT.bloques.reservar.publicado);
  const [tabBarStyle, setTabBarStyle] = useState<TabBarStyleId>('clasica');
  const [barraClasica, setBarraClasica] = useState(false);
  const [barraFlotante, setBarraFlotante] = useState(false);
  const [variantes, setVariantes] = useState<VariantesResueltas>(DEFAULT_VARIANTES);
  // Tema en BORRADOR dentro del iframe del editor (/portal-preview, /reservar).
  // Estado APARTE del publicado, no un `setVariantes` desde el mensaje: la
  // carga de datos públicos llega asíncrona y pisaría el borrador según quién
  // ganase la carrera. Así el borrador manda siempre mientras el editor lo
  // esté mandando, y `null` (fuera del editor) deja intacto lo publicado.
  const [temaJsPreview, setTemaJsPreview] = useState<TemaJs | null>(null);
  const [navPortal, setNavPortal] = useState<NavConfigShape>(DEFAULT_NAV_CONFIG);
  const [themeIdPublicado, setThemeIdPublicado] = useState<string | null>(null);
  const [redesSociales, setRedesSociales] = useState<Record<RedSocialId, string>>(() => redesSocialesCompletas(null));
  const [textosReservar, setTextosReservar] = useState({
    titular: '', subtitulo: '', cta: '', sobreTitulo: '', sobreTexto: '',
    avisoQuiz: '', vacioTitulo: '', vacioTexto: '', confirmacion: '', listaEspera: '', ayuda: '', comoFunciona: '',
  });
  // `radio`/`radioInput`(el legacy de radio de tarjeta) no viajan aquí a
  // propósito: hoy solo existen como parámetro de URL (`?radio=`), sin campo
  // persistido — mismo estado que tenía antes de esta fase. `forma`/
  // `densidad` (Fase 3) siguen el mismo criterio: solo `?forma=`/`?densidad=`
  // por ahora, sin editor propio en el Theme Builder todavía.
  const [aparienciaWidget, setAparienciaWidget] = useState<Omit<AparienciaWidget, 'radio' | 'forma' | 'densidad'>>({
    fondo: null, fuente: null, ocultarPie: false, soloPestana: false, texto: 'auto',
    fuenteDisplay: null, radioBoton: null, radioInput: null,
    superficie: null, tinta: null, textoSecundario: null, linea: null, relleno: null,
  });
  const [ordenReservar, setOrdenReservar] = useState<{ orden: string[]; ocultos: string[] }>({ orden: [], ocultos: [] });
  const [favoritos, setFavoritos] = useState<FavoritoClase[]>([]);
  const [retosApuntados, setRetosApuntados] = useState<string[]>([]);
  const [retoConteos, setRetoConteos] = useState<Record<string, number>>({});
  const [valoracionEstudio, setValoracionEstudio] = useState<{ media: number; total: number } | null>(null);
  const [camposPersonalizados, setCamposPersonalizados] = useState<CampoPersonalizado[]>([]);
  const [segmentosClientes, setSegmentosClientes] = useState<SegmentoCliente[]>([]);
  const [plantillasEmail, setPlantillasEmail] = useState<PlantillaEmail[]>([]);
  const [dependencySnapshots, setDependencySnapshots] = useState<InstructorDependencySnapshot[]>([]);
  const [instructores, setInstructores] = useState<Instructor[]>([]);
  const [spots, setSpots] = useState<Spot[]>([]);
  const [bloqueosMaquina, setBloqueosMaquina] = useState<BloqueoMaquina[]>([]);
  const [plazasFijas, setPlazasFijas] = useState<PlazaFija[]>([]);
  const [recuperaciones, setRecuperaciones] = useState<Recuperacion[]>([]);
  const [socioExcepciones, setSocioExcepciones] = useState<SocioExcepcion[]>([]);
  const [mandatosSepa, setMandatosSepa] = useState<MandatoSEPA[]>([]);

  const [socios, setSocios] = useState<Socio[]>([]);
  const [suscripciones, setSuscripciones] = useState<Suscripcion[]>([]);
  const [sesiones, setSesiones] = useState<Sesion[]>([]);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [recibos, setRecibos] = useState<Recibo[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  // Cerrojo de re-entrada por recibo: dos clics rapidísimos en "Cobrar" (mismo
  // recibo) capturan el mismo estado obsoleto y sellan DOS facturas fiscales
  // para un único cobro. El Set bloquea el segundo disparo del MISMO recibo;
  // ids distintos (cobro masivo) siguen corriendo en paralelo sin trabas.
  const cobrosEnCursoRef = useRef<Set<string>>(new Set());
  const [notasInternas, setNotasInternas] = useState<NotaInterna[]>([]);
  const [condicionesSalud, setCondicionesSalud] = useState<CondicionSalud[]>([]);
  const [respuestasSesion, setRespuestasSesion] = useState<RespuestaSesionRow[]>([]);
  const [plantillasCuestionarioSalud, setPlantillasCuestionarioSalud] = useState<PlantillaCuestionarioSalud[]>([]);
  const [respuestasCuestionarioSalud, setRespuestasCuestionarioSalud] = useState<RespuestaCuestionarioSalud[]>([]);

  const [citas, setCitas] = useState<Cita[]>([]);
  const [citasServicios, setCitasServicios] = useState<ServicioCita[]>([]);
  const [citasDisponibilidad, setCitasDisponibilidad] = useState<DisponibilidadCita[]>([]);
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
  // Avisos puntuales de fondo (bono agotado, plan caducado, cobro sin
  // renovar…) que antes se acumulaban en un array sin ningún consumidor real
  // (la tabla legacy `notificaciones`, sin escritor server-side). Un toast
  // basta: son casos raros, no una bandeja que revisar.
  const toastAviso = useToast();
  // Dominio Contenido y Comunidad extraído a su propio store (Fase B).
  const content = useContentStore();
  const { videosOnDemand, postsComunidad, likedPostIds } = content;
  // Dominios extraídos a sus stores (Fase B).
  const dashboardChartsStore = useDashboardChartsStore();
  const { dashboardCharts } = dashboardChartsStore;
  const progressNotesStore = useProgressNotesStore();
  const { notasProgreso } = progressNotesStore;
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
  // «EL MÁS ELEGIDO» de /reservar: lo calcula el SERVIDOR sobre las
  // suscripciones del estudio entero. Aquí solo llega el id ganador (o null).
  const [planMasElegidoId, setPlanMasElegidoId] = useState<string | null>(null);
  // P1 auditoría Momence: sustituciones ya confirmadas del catálogo público.
  const [sustitucionesConfirmadas, setSustitucionesConfirmadas] = useState<SustitucionConfirmadaPublica[]>([]);

  // B0.6: etiqueta cada error de Sentry con el estudio activo (además del usuario,
  // que se fija en auth-context). Así se puede filtrar "qué estudios sufren X".
  useEffect(() => {
    fijarEtiqueta('studio_id', studio?.id ?? undefined);
  }, [studio?.id]);

  // Tema en borrador dentro del iframe del editor. Hermano JS de
  // ThemePreviewListener: aquel aplica las CSS vars del mismo mensaje sobre
  // :root, este resuelve los ejes que NO son CSS (ver
  // lib/theme-preview-puente.ts) — hacen falta los dos porque el tema tiene
  // las dos mitades desde `variantes`.
  //
  // Se monta aquí, y no en un provider propio de /portal-preview, porque
  // `variantes`/`barraClasica`/`tabBarStyle` los sirve ESTE contexto: sus
  // consumidores (PortalHomeView, PortalShell) los leen con useStudio() y así
  // no se enteran de que existe un modo preview. Fuera de un iframe no hace
  // absolutamente nada, que es el caso del panel y del portal real.
  useEffect(() => {
    if (window.self === window.top) return;
    function onMsg(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      const d = e.data as { type?: string; temaJs?: unknown } | null;
      if (!d || d.type !== MENSAJE_TEMA_PREVIEW) return;
      const tema = resolveTemaJs(d.temaJs);
      if (tema) setTemaJsPreview(tema);
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // El self-claim de una instructora (confirmar el correo de invitación) pasa
  // por su propia sesión/pestaña — un UPDATE de `auth_user_id` en servidor con
  // service-role, ajeno por completo a la pestaña de la propietaria. Sin esto,
  // `instructores` solo se cargaba una vez al montar (más abajo) y no había
  // forma de que ese cambio llegara sin recargar: ni polling, ni revalidate al
  // recuperar el foco (eso solo existe para el portal público, `publicSlug`,
  // más abajo). Mismo patrón que ya usa el chat de equipo
  // (`lib/stores/use-team-chat-store.ts`) para `mensajes_equipo`. Solo para el
  // dashboard autenticado — el portal público no necesita ver altas de equipo.
  useEffect(() => {
    if (publicSlug || shadowedByPublicRoute || !studio?.id) return;
    const studioId = studio.id;
    let vivo = true;
    let canal: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!vivo) return;
      await supabase.realtime.setAuth(data.session?.access_token ?? null);
      if (!vivo) return;
      canal = supabase
        .channel(`instructores:${studioId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'instructores', filter: `studio_id=eq.${studioId}` },
          payload => {
            if (payload.eventType === 'DELETE') {
              const old = payload.old as { id?: string };
              if (old.id) setInstructores(prev => prev.filter(i => i.id !== old.id));
              return;
            }
            const fila = mapInstructor(payload.new as RowInstructores);
            setInstructores(prev =>
              prev.some(i => i.id === fila.id)
                ? prev.map(i => (i.id === fila.id ? fila : i))
                : [...prev, fila],
            );
          },
        )
        .subscribe();
    })();
    // El token de autorización del canal se fijaba solo una vez, al montar.
    // Supabase rota el JWT de sesión cada ~1h (TOKEN_REFRESHED); sin
    // reenviarlo al canal, la RLS de `postgres_changes` deja de autorizar la
    // suscripción EN SILENCIO — la propietaria seguía viendo la pantalla con
    // normalidad, solo dejaba de recibir altas/cambios de instructoras hasta
    // que recargaba la página (justo el síntoma reportado: "tarda un rato en
    // aparecer activa"). Con la pestaña abierta un buen rato es el caso
    // normal, no el raro.
    const { data: authSub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && vivo) {
        void supabase.realtime.setAuth(session?.access_token ?? null);
      }
    });
    return () => {
      vivo = false;
      authSub.subscription.unsubscribe();
      if (canal) supabase.removeChannel(canal);
    };
  }, [publicSlug, shadowedByPublicRoute, studio?.id]);

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
    setErrorPublico(false);
    setCurrentStudioId(studioIdOverride ?? '');
    // La socia se deriva del JWT en el servidor (cargarDatosPublicos manda el
    // Bearer); ya no se pasa {socioId,email} desde el cliente.
    //
    // `liviano`: solo /reservar/[slug] (y sus widgets embebidos, mismo path)
    // — nunca vídeos/recompensas/niveles/logros/retos/contenido de portal.
    // app/portal/[slug] sigue pidiendo el catálogo completo (mismo criterio
    // que `shadowedByPublicRoute` arriba, basado en el pathname real).
    const liviano = (pathname ?? '').startsWith('/reservar/');
    cargarDatosPublicos(publicSlug, { liviano }).then(pub => {
      if (!pub || pub.error) { setErrorPublico(true); setDataLoaded(true); return; }
      // El horario de apertura viaja aparte (sale de `studio_horario`, no de
      // una columna de `studios`) y se pega aquí para que el portal lo lea
      // donde ya lo espera: `studio.horarioSemana`, la misma forma que usa el
      // panel. Dos sitios distintos para el mismo dato es como se acaba con el
      // panel diciendo una cosa y el portal otra.
      setStudio(pub.studio ? { ...pub.studio, horarioSemana: pub.horarioSemana ?? [] } : null);
      setPlanMasElegidoId((pub as { planMasElegidoId?: string | null }).planMasElegidoId ?? null);
      setSustitucionesConfirmadas((pub as { sustitucionesConfirmadas?: SustitucionConfirmadaPublica[] }).sustitucionesConfirmadas ?? []);
      // El portal muestra a la clienta la política/términos del estudio y quedan con
      // su aceptación: hay que hidratarlos aquí (antes usaba siempre el texto por defecto).
      setStudioConfig(configLegalDe(
        pub.studio as DatosEstudioLegal | null,
        pub.studio as { politicaPrivacidad?: string | null; terminosServicio?: string | null } | null,
      ));
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
      setCitasServicios(pub.citasServicios ?? []);
      setCitasDisponibilidad(pub.citasDisponibilidad ?? []);
      setContenidoPortal(pub.contenidoPortal ?? null);
      setBannersPortal(pub.bannersPortal ?? []);
      setNovedadesEstudio((pub as { novedadesEstudio?: NovedadEstudio[] }).novedadesEstudio ?? []);
      setPortalHome(pub.portalHome ?? DEFAULT_LAYOUT.portalHome);
      setHomeBloques(pub.homeBloques ?? DEFAULT_LAYOUT.bloques.home.publicado);
      setBloquesClases(pub.bloquesClases ?? DEFAULT_LAYOUT.bloques.clases.publicado);
      setBloquesBonos(pub.bloquesBonos ?? DEFAULT_LAYOUT.bloques.bonos.publicado);
      setBloquesReservar(pub.bloquesReservar ?? DEFAULT_LAYOUT.bloques.reservar.publicado);
      setTabBarStyle(pub.tabBarStyle === 'pestanaActiva' ? 'pestanaActiva' : 'clasica');
      setBarraClasica(pub.barraClasica === true);
      setBarraFlotante(pub.barraFlotante === true);
      // resolveVariantes valida clave a clave y siempre devuelve el objeto
      // completo — un valor corrupto en un eje no arrastra a los demás.
      setVariantes(resolveVariantes(pub.variantes));
      setNavPortal(resolveNavConfig(pub.navPortal));
      setThemeIdPublicado((pub as { themeIdPublicado?: string | null }).themeIdPublicado ?? null);
      // Las cuatro claves siempre presentes, cada una saneada a string: un
      // tema publicado antes de que existiera TikTok trae solo tres.
      setRedesSociales(redesSocialesCompletas(pub.redesSociales));
      // `.trim()` al ENTRAR, una sola vez: un campo con solo espacios es lo que
      // queda al borrar lo escrito, y no puede publicar un titular en blanco.
      // Haciéndolo aquí, ningún consumidor tiene que acordarse.
      const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
      const p2 = pub as {
        widgetFondo?: unknown; widgetFuente?: unknown; widgetOcultarPie?: unknown; widgetSoloPestana?: unknown; widgetTexto?: unknown;
        widgetFuenteDisplay?: unknown; widgetRadioBoton?: unknown; widgetRadioInput?: unknown;
        widgetSuperficie?: unknown; widgetTinta?: unknown; widgetTextoSecundario?: unknown; widgetLinea?: unknown; widgetRelleno?: unknown;
      };
      const colorOn = (v: unknown) => typeof v === 'string' ? v : null;
      const radioOn = (v: unknown) => typeof v === 'number' ? v : null;
      setAparienciaWidget({
        fondo: typeof p2.widgetFondo === 'string' ? p2.widgetFondo : null,
        fuente: typeof p2.widgetFuente === 'string' ? p2.widgetFuente : null,
        ocultarPie: p2.widgetOcultarPie === true,
        soloPestana: p2.widgetSoloPestana === true,
        texto: p2.widgetTexto === 'claro' || p2.widgetTexto === 'oscuro' ? p2.widgetTexto : 'auto',
        fuenteDisplay: typeof p2.widgetFuenteDisplay === 'string' ? p2.widgetFuenteDisplay : null,
        radioBoton: radioOn(p2.widgetRadioBoton),
        radioInput: radioOn(p2.widgetRadioInput),
        superficie: colorOn(p2.widgetSuperficie),
        tinta: colorOn(p2.widgetTinta),
        textoSecundario: colorOn(p2.widgetTextoSecundario),
        linea: colorOn(p2.widgetLinea),
        relleno: colorOn(p2.widgetRelleno),
      });
      setTextosReservar({
        sobreTitulo: texto((pub as { reservarSobreTitulo?: unknown }).reservarSobreTitulo),
        sobreTexto: texto((pub as { reservarSobreTexto?: unknown }).reservarSobreTexto),
        titular: texto((pub as { reservarTitular?: unknown }).reservarTitular),
        subtitulo: texto((pub as { reservarSubtitulo?: unknown }).reservarSubtitulo),
        cta: texto((pub as { reservarCta?: unknown }).reservarCta),
        avisoQuiz: texto((pub as { reservarAvisoQuiz?: unknown }).reservarAvisoQuiz),
        vacioTitulo: texto((pub as { reservarVacioTitulo?: unknown }).reservarVacioTitulo),
        vacioTexto: texto((pub as { reservarVacioTexto?: unknown }).reservarVacioTexto),
        confirmacion: texto((pub as { reservarConfirmacion?: unknown }).reservarConfirmacion),
        listaEspera: texto((pub as { reservarListaEspera?: unknown }).reservarListaEspera),
        ayuda: texto((pub as { reservarAyuda?: unknown }).reservarAyuda),
        comoFunciona: texto((pub as { reservarComoFunciona?: unknown }).reservarComoFunciona),
      });
      const listaStr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
      const ordRes = (pub as { reservar?: { orden?: unknown; ocultos?: unknown } | null }).reservar;
      setOrdenReservar({ orden: listaStr(ordRes?.orden), ocultos: listaStr(ordRes?.ocultos) });
      setRetoConteos(pub.retoConteos ?? {});
      setValoracionEstudio((pub as { valoracionEstudio?: { media: number; total: number } | null }).valoracionEstudio ?? null);
      const aforo = (pub.aforoReservas ?? []).map((r: { id: string; sesion_id: string; estado: string; spot_id: string | null }) => ({
        id: r.id, studioId: studioIdOverride ?? '', sesionId: r.sesion_id, socioId: '',
        estado: r.estado as Reserva['estado'], spotId: r.spot_id ?? null, posicionEspera: null, checkInEn: null, creadoEn: '',
      }));
      const socia = pub.socia;
      const miasById = new Map<string, Reserva>((socia?.reservas ?? []).map((r: Reserva) => [r.id, r]));
      setReservas(aforo.map((r: Reserva) => miasById.get(r.id) ?? r));
      setSocios(socia ? [socia.socio] : []);
      setSuscripciones(socia?.suscripciones ?? []);
      // Su plaza fija: la pantalla de Bonos la enseña, y en la vía pública solo
      // llegan las suyas (el servidor las acota por socio_id).
      setPlazasFijas(socia?.plazasFijas ?? []);
      // Feature #1: sus créditos de recuperación (generados al cancelar una
      // ocurrencia de plaza fija). Antes solo se cargaban en el snapshot de
      // staff — la socia nunca sabía que los tenía.
      setRecuperaciones(socia?.recuperaciones ?? []);
      setRecibos(socia?.recibos ?? []);
      setFacturas(socia?.facturas ?? []);
      setMemberCredits(socia?.memberCredits ?? []);
      setRewardHistory(socia?.rewardHistory ?? []);
      setRewardRedemptions(socia?.rewardRedemptions ?? []);
      setAchievementProgress(socia?.achievementProgress ?? []);
      setChallengeProgress(socia?.challengeProgress ?? []);
      setCreditTransactions(socia?.creditTransactions ?? []);
      setCitas(socia?.citas ?? []);
      setFavoritos(socia?.favoritos ?? []);
      setRetosApuntados(socia?.retosApuntados ?? []);
      setDataLoaded(true);
    }).catch(err => { console.error('Error cargando datos públicos:', err); setErrorPublico(true); setDataLoaded(true); });
  }

  /**
   * Refresco barato del aforo, para el tic de REFRESCO_ACTIVO_MS.
   *
   * POR QUÉ EXISTE: el tic llamaba a `cargarPublico()`, que trae el catálogo
   * completo del estudio y el histórico financiero de la socia —varios MB— doce
   * veces por minuto. Lo único que cambia en cinco segundos es quién ha cogido
   * plaza.
   *
   * ⚠️ FUSIONA, NO REEMPLAZA. `reservas` se construye entera desde
   * `aforoReservas` (ver cargarPublico), así que hacer `setReservas(nuevas)` con
   * una ventana de 60 días BORRARÍA todas las reservas pasadas de la socia —y
   * con ellas su pestaña «Pasadas», Progreso y Retos— sin dar ningún error.
   * Por eso se retiran solo las filas de las sesiones que la ventana cubre
   * (`sesionIds`) y se dejan intactas todas las demás.
   *
   * La identidad de sus reservas se conserva reaplicando el `socioId` que ya
   * había en memoria: el endpoint devuelve filas anónimas a propósito (así su
   * respuesta es cacheable en CDN y compartida entre socias). Una reserva que
   * ella haga en OTRO dispositivo llegará aquí sin dueño hasta el siguiente
   * `cargarPublico()` completo — no afecta al aforo, que es lo que este tic
   * mantiene fresco.
   */
  function refrescarAforo() {
    if (!publicSlug) return;
    cargarAforoPublico(publicSlug).then(res => {
      // Se exigen las DOS listas antes de tocar nada. Una respuesta a medias
      // (un proxy que devuelve `{}`, un mock incompleto) haría que la ventana
      // se considerase vacía y se borrasen reservas que sí existen.
      if (!res || !Array.isArray(res.sesionIds) || !Array.isArray(res.aforoReservas)) return;
      setReservas(prev => fusionarAforo(prev, res.sesionIds, res.aforoReservas, studioIdOverride ?? ''));
    }).catch(err => { console.error('Error refrescando aforo:', err); });
  }

  // El portal es una PWA/SPA que la clienta deja abierta. cargarPublico() solo
  // corría al montar y tras el login: si el estudio cancela o mueve una clase en
  // el panel, la app de la clienta se quedaba con el snapshot del montaje y
  // seguía mostrando la clase como disponible o a la hora vieja. Al volver a
  // primer plano, re-sincroniza desde el servidor. Throttle de 15s para no
  // re-pedir en cada cambio de pestaña.
  useEffect(() => {
    if (!publicSlug) return;
    let ultima = Date.now();
    function alPrimerPlano() {
      if (document.visibilityState !== 'visible') return;
      const ahora = Date.now();
      if (ahora - ultima < 15_000) return;
      ultima = ahora;
      cargarPublico();
    }
    document.addEventListener('visibilitychange', alPrimerPlano);
    window.addEventListener('focus', alPrimerPlano);
    return () => {
      document.removeEventListener('visibilitychange', alPrimerPlano);
      window.removeEventListener('focus', alPrimerPlano);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicSlug]);

  useEffect(() => {
    // Ruta pública (reserva/portal/kiosk): los datos vienen del proxy de
    // servidor scopeado (service-role), NO del acceso anónimo directo. Solo el
    // catálogo del estudio + los datos de la socia en sesión.
    if (publicSlug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- Carga de datos públicos: el estado viene de la red (o de un reintento explícito vía recargarPublico). No hay nada que sincronizar sin llamarla.
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
        return fetchCriticalStudioData();
      }
      if (authUserId) {
        const resolved = await resolveStudioId();
        // Resetea a vacío si no resuelve, para no heredar el estudio de una
        // sesión anterior en el mismo cliente.
        setCurrentStudioId(resolved ?? '');
        // Sesión de Supabase Auth real pero SIN estudio detrás — p.ej. una
        // profesional de Network (`red_perfiles.auth_user_id`, independiente
        // de `studio_id` por diseño, migr 20260813111206) logueada en
        // `/network`, que no monta ningún StudioSlugGate propio y hereda este
        // StudioProvider de la raíz. Sin este corte, `authUserId` truthy
        // bastaba para disparar la carga completa del panel — incluidos los
        // fetchers de solo-admin (campos personalizados, plantillas de
        // email, segmentos, dependencias...) — que RLS rechaza con 42501
        // para una cuenta sin membership de estudio (visto en Sentry:
        // JAVASCRIPT-NEXTJS-20/21/22/23/24/C, `studioId: "desconocido"`).
        if (!resolved) return null;
        return fetchCriticalStudioData();
      }
      setCurrentStudioId('');
      return null;
    })().then(data => {
      if (!data) { setDataLoaded(true); return; }
      setPlanesTarifa(data.planesTarifa);
      setSalas(data.salas);
      setTiposClase(data.tiposClase);
      setContenidoPortal(data.contenidoPortal);
      setBannersPortal(data.bannersPortal);
      setNovedadesEstudio(data.novedadesEstudio);
      setInstructores(data.instructores);
      setSpots(data.spots);
      setBloqueosMaquina(data.bloqueosMaquina);
      setPlazasFijas(data.plazasFijas);
      setRecuperaciones(data.recuperaciones);
      setSocioExcepciones(data.socioExcepciones);
      setMandatosSepa(data.mandatosSepa);
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
      setCitasServicios(data.citasServicios ?? []);
      setCitasDisponibilidad(data.citasDisponibilidad ?? []);
      setProductosPOS(data.productosPOS);
      setVentasPOS(data.ventasPOS);
      setCampanas(data.campanas);
      setAutomatizaciones(data.automatizaciones);
      discountCodes.setCodigosDescuento(data.codigosDescuento);
      setActividadReciente(data.actividadReciente);
      content.setVideosOnDemand(data.videosOnDemand);
      content.setPostsComunidad(data.postsComunidad);
      dbMisLikesComunidad().then(ids => content.setLikedPostIds(new Set(ids)));
      integrationsStore.setIntegraciones(data.integraciones ?? []);
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
      setStudioConfig(configLegalDe(data.studio, data.studioConfig));
      setDataLoaded(true);

      // Campos personalizados y plantillas de email: no son ruta crítica (solo
      // config + fichas), se cargan aparte sin bloquear el primer pintado.
      dbFetchCamposPersonalizados().then(setCamposPersonalizados).catch(() => {});
      dbFetchSegmentosClientes().then(setSegmentosClientes).catch(() => {});
      dbFetchPlantillasEmail().then(setPlantillasEmail).catch(() => {});
      dbFetchDependencySnapshots().then(setDependencySnapshots).catch(() => {});
      // RECEPCION/MANAGER simplemente reciben [] aquí (la RLS los excluye) —
      // no hace falta comprobar el rol en cliente antes de pedirlo.
      dbFetchPlantillasCuestionarioSalud().then(setPlantillasCuestionarioSalud).catch(() => {});
      dbFetchRespuestasCuestionarioSalud().then(setRespuestasCuestionarioSalud).catch(() => {});

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
        // Esta sí la lee lógica de negocio real (ficha clínica, semáforo,
        // "Preparar clase con IA") — a diferencia de las de arriba, que el
        // comentario original de fetchDeferredStudioData ya documentaba como
        // sin ningún consumidor.
        setCondicionesSalud(def.condicionesSalud);
        // Mismo bug, mismo arreglo: sin esto, Comunidad (panel y la pestaña
        // dentro de Mensajería) nunca mostraba el historial de posts en una
        // sesión nueva.
        content.setPostsComunidad(def.postsComunidad);
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
  // 2.2: NUNCA llamar a esto desde dentro de un updater de setState (React lo
  // invoca dos veces en StrictMode/reintentos concurrentes, y el servidor
  // dedupea por reciboId pero solo hasta que la primera inserción commitea —
  // hay ventana de carrera. Llamar siempre desde el cuerpo de la función, una
  // sola vez, con el resultado ya calculado).
  async function sellarFacturaYActualizar(fac: Factura): Promise<ResultadoEscritura> {
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
    } else {
      // El sellado en servidor falló (NIF inválido, red, RLS...): la factura
      // optimista nunca se llegó a persistir en `facturas`, así que hay que
      // quitarla del estado local o el usuario la ve en pantalla hasta el
      // próximo refresco desde el servidor, sin saber que nunca se guardó.
      setFacturas(prev => prev.filter(f => f.id !== fac.id));
      setDbError({ msg: r.error ?? 'No se ha podido generar la factura', key: Date.now() });
      return { ok: false, error: r.error ?? 'No se ha podido generar la factura' };
    }
    return { ok: true };
  }

  // ── Socios ───────────────────────────────────────────────────────────────────

  // ── Planes ────────────────────────────────────────────────────────────────────

  async function addPlan(fields: Omit<PlanTarifa, 'id' | 'studioId'>): Promise<ResultadoEscritura> {
    const nuevo: PlanTarifa = { ...fields, id: `plan-${uid()}`, studioId: getCurrentStudioId() };
    const res = await dbInsertPlanTarifa(nuevo);
    if (!res.ok) return res;
    setPlanesTarifa(prev => [...prev, nuevo]);
    addActividadReciente('PLAN_CREADO', `${actorNombre ?? 'Alguien'} creó el plan "${fields.nombre}" — ${fields.precio} €`);
    return res;
  }
  async function updatePlan(id: string, changes: Partial<Omit<PlanTarifa, 'id' | 'studioId'>>): Promise<ResultadoEscritura> {
    const anterior = planesTarifa.find(p => p.id === id);
    const res = await dbUpdatePlanTarifa(id, changes);
    if (!res.ok) return res;
    setPlanesTarifa(prev => prev.map(p => p.id === id ? { ...p, ...changes } : p));
    if (anterior) {
      const detalle = 'precio' in changes && changes.precio !== anterior.precio
        ? `precio ${anterior.precio}€ → ${changes.precio}€`
        : 'datos actualizados';
      addActividadReciente('PLAN_EDITADO', `${actorNombre ?? 'Alguien'} editó el plan "${anterior.nombre}" (${detalle})`);
    }
    return res;
  }
  async function deletePlan(id: string): Promise<ResultadoEscritura & { archivado?: boolean }> {
    const plan = planesTarifa.find(p => p.id === id);
    // Un DELETE duro sobre un plan CONTRATADO lo rechaza la BD (23503,
    // suscripciones_plan_id_fkey) — y las dos pantallas que llaman a esto
    // prometen "seguirán con su plan, solo desaparece del catálogo", promesa
    // que un DELETE no puede cumplir. El mecanismo correcto ya existe
    // (`activo`): degradar a desactivación cuando esté contratada, en vez de
    // intentar un borrado que la propia BD va a rechazar.
    //
    // ⚠️ El guardia mira CUALQUIER suscripción, de cualquier estado, no solo
    // las ACTIVAS. `suscripciones_plan_id_fkey` es RESTRICT y las bajas NO se
    // borran: se quedan como CANCELADA/EXPIRADA/PAUSADA apuntando al plan (ver
    // dbCancelarSuscripcion). Con el filtro `estado === 'ACTIVA'`, un plan que
    // solo tuvo socias ya dadas de baja se saltaba el archivado, caía al DELETE
    // duro y la BD lo rechazaba con 23503: la propietaria veía "no se ha podido
    // eliminar" sin ninguna explicación y el plan seguía en el catálogo. La
    // suite no lo ve porque `page.route` nunca devuelve el 4xx real de la RPC.
    const contratada = suscripciones.some(s => s.planId === id);
    if (contratada) {
      const res = await dbUpdatePlanTarifa(id, { activo: false });
      if (!res.ok) return res;
      setPlanesTarifa(prev => prev.map(p => p.id === id ? { ...p, activo: false } : p));
      if (plan) addActividadReciente('PLAN_EDITADO', `${actorNombre ?? 'Alguien'} archivó el plan "${plan.nombre}" (seguía contratado)`);
      return { ...res, archivado: true };
    }
    const res = await dbDeletePlanTarifa(id);
    if (!res.ok) return res;
    setPlanesTarifa(prev => prev.filter(p => p.id !== id));
    if (plan) addActividadReciente('PLAN_ELIMINADO', `${actorNombre ?? 'Alguien'} eliminó el plan "${plan.nombre}"`);
    return res;
  }

  // ── Salas ─────────────────────────────────────────────────────────────────────

  // Las salas no se guardaban: estas tres funciones solo tocaban el estado
  // local y en todo el repo no había un solo insert/update/delete sobre
  // `salas`. La sala se veía en pantalla, desaparecía al recargar, y de paso
  // rompía la creación de clases (FK `sesiones.sala_id`). Ahora se escribe
  // primero y solo se pinta si la base de datos lo acepta.
  async function addSala(fields: Omit<Sala, 'id' | 'studioId'>): Promise<ResultadoEscritura> {
    const nueva: Sala = { ...fields, id: `sala-${uid()}`, studioId: getCurrentStudioId() };
    const res = await dbInsertSala(nueva);
    if (!res.ok) return res;
    setSalas(prev => [...prev, nueva]);
    return res;
  }
  async function updateSala(id: string, changes: Partial<Omit<Sala, 'id' | 'studioId'>>): Promise<ResultadoEscritura> {
    const res = await dbUpdateSala(id, changes);
    if (!res.ok) return res;
    setSalas(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s));
    return res;
  }
  async function deleteSala(id: string): Promise<ResultadoEscritura> {
    const res = await dbDeleteSala(id);
    if (!res.ok) return res;
    setSalas(prev => prev.filter(s => s.id !== id));
    return res;
  }

  // F2 (B2.7): marcar/quitar avería de máquina. El aforo real lo calcula
  // reservar_plaza server-side sobre estas filas, así que tienen que estar
  // guardadas para que el bloqueo sea efectivo.
  async function marcarAveria(salaId: string, spotId: string | null, motivo: string | null, hasta: string | null): Promise<ResultadoEscritura> {
    const ahora = new Date().toISOString();
    const b: BloqueoMaquina = {
      id: `avr-${uid()}`, studioId: getCurrentStudioId(), salaId, spotId,
      desde: ahora, hasta, motivo, creadoEn: ahora,
    };
    const res = await dbInsertBloqueoMaquina(b);
    if (!res.ok) return res;
    setBloqueosMaquina(prev => [b, ...prev]);
    return res;
  }
  async function quitarAveria(id: string): Promise<ResultadoEscritura> {
    const ahora = new Date().toISOString();
    const res = await dbCerrarBloqueoMaquina(id, ahora);
    if (!res.ok) return res;
    setBloqueosMaquina(prev => prev.map(b => b.id === id ? { ...b, hasta: ahora } : b));
    return res;
  }

  // F2 (B2.2): asignar plaza fija. NO optimista: puede fallar por la exclusión
  // GiST (sitio ya pillado en ese slot); sólo se añade al estado si la BD acepta.
  async function asignarPlazaFija(
    fields: Omit<PlazaFija, 'id' | 'studioId' | 'creadaEn'>,
  ): Promise<{ ok: true } | { error: string }> {
    const nueva: PlazaFija = {
      ...fields, id: `pf-${uid()}`, studioId: getCurrentStudioId(), creadaEn: new Date().toISOString(),
    };
    const res = await dbInsertPlazaFija(nueva);
    if ('ok' in res) setPlazasFijas(prev => [...prev, nueva]);
    return res;
  }

  // Baja lógica (estado BAJA): deja de materializar; conserva el histórico.
  async function quitarPlazaFija(id: string): Promise<ResultadoEscritura> {
    const res = await dbUpdatePlazaFija(id, { estado: 'BAJA' });
    if (!res.ok) return res;
    setPlazasFijas(prev => prev.map(p => p.id === id ? { ...p, estado: 'BAJA' as const } : p));
    return res;
  }

  // Feature #2 (ficha Lorari-vs-Tentare): autoservicio de plaza fija desde el
  // portal. Solo tiene efecto con sesión de socia — sin `cpub` no hay a quién
  // atribuírsela, así que se rechaza en vez de intentar algo con studioId
  // vacío (mismo guard que el resto de escrituras públicas de este contexto).
  async function crearPlazaFijaPropia(
    sesionId: string,
  ): Promise<{ ok: true; reservaEstaSemana: { estado: string; reservaId: string } | null } | { ok: false; error: string }> {
    const cpub = ctxPublico();
    if (!cpub) return { ok: false, error: 'No disponible' };
    const r = await postPublico('/api/public/plaza-fija', { accion: 'crear', studioId: cpub.studioId, sesionId });
    if (!r.ok) return r;
    const datos = r.datos as { id?: string; reservaEstaSemana?: { estado: string; reservaId: string } | null } | null;
    return { ok: true, reservaEstaSemana: datos?.reservaEstaSemana ?? null };
  }

  async function cambiarEstadoPlazaFijaPropia(id: string, accion: 'pausar' | 'reanudar' | 'dar_de_baja'): Promise<ResultadoEscritura> {
    const cpub = ctxPublico();
    if (!cpub) return { ok: false, error: 'No disponible' };
    // Optimista: la propia socia ya sabe qué acaba de pulsar. `postPublico`
    // re-sincroniza en su `finally`, así que un rechazo (p.ej. choque de sitio
    // al reanudar) se corrige solo.
    const estadoNuevo = accion === 'pausar' ? 'PAUSADA' : accion === 'reanudar' ? 'ACTIVA' : 'BAJA';
    setPlazasFijas(prev => prev.map(p => p.id === id ? { ...p, estado: estadoNuevo as PlazaFija['estado'] } : p));
    const r = await postPublico('/api/public/plaza-fija', { accion, studioId: cpub.studioId, plazaId: id });
    return r.ok ? { ok: true } : r;
  }
  const pausarPlazaFijaPropia = (id: string) => cambiarEstadoPlazaFijaPropia(id, 'pausar');
  const reanudarPlazaFijaPropia = (id: string) => cambiarEstadoPlazaFijaPropia(id, 'reanudar');
  const darDeBajaPlazaFijaPropia = (id: string) => cambiarEstadoPlazaFijaPropia(id, 'dar_de_baja');

  // F2 (B2.3): concede una recuperación (dueña-first). La caducidad y el tope (4)
  // los resuelve la RPC; al crearla, recargamos la lista para reflejar caduca_el.
  async function darRecuperacion(socioId: string, motivo: string | null): Promise<'CREADA' | 'TOPE' | 'ERROR'> {
    const r = await dbCrearRecuperacion(getCurrentStudioId(), socioId, null, motivo);
    if (r === 'CREADA') setRecuperaciones(await dbListRecuperaciones(getCurrentStudioId()));
    return r;
  }

  async function anularRecuperacion(id: string): Promise<ResultadoEscritura> {
    const res = await dbAnularRecuperacion(id);
    if (!res.ok) return res;
    setRecuperaciones(prev => prev.map(r => r.id === id ? { ...r, estado: 'ANULADA' as const } : r));
    return res;
  }

  // F2 (B2.9): poner/quitar una excepción de una socia (toggle "porque lo digo yo").
  async function ponerExcepcion(socioId: string, tipo: string, motivo: string | null): Promise<ResultadoEscritura> {
    const nueva: SocioExcepcion = {
      id: `exc-${uid()}`, studioId: getCurrentStudioId(), socioId, tipo, motivo, creadaEn: new Date().toISOString(),
    };
    const res = await dbPonerExcepcion(getCurrentStudioId(), socioId, tipo, motivo);
    if (!res.ok) return res;
    setSocioExcepciones(prev => prev.some(e => e.socioId === socioId && e.tipo === tipo) ? prev : [...prev, nueva]);
    return res;
  }
  async function quitarExcepcion(socioId: string, tipo: string): Promise<ResultadoEscritura> {
    const res = await dbQuitarExcepcion(getCurrentStudioId(), socioId, tipo);
    if (!res.ok) return res;
    setSocioExcepciones(prev => prev.filter(e => !(e.socioId === socioId && e.tipo === tipo)));
    return res;
  }

  // F2 (B2.10): mandato SEPA de una socia (uno vigente por socia). Reutiliza el id
  // del vigente si ya lo tiene (así el índice único no salta al editar el IBAN).
  async function ponerMandato(socioId: string, iban: string, refMandato: string, fechaFirma: string): Promise<ResultadoEscritura> {
    const existente = mandatosSepa.find(m => m.socioId === socioId && m.estado === 'VIGENTE');
    const m: MandatoSEPA = {
      id: existente?.id ?? `mnd-${uid()}`, studioId: getCurrentStudioId(), socioId,
      iban: iban.replace(/\s+/g, '').toUpperCase(), refMandato, fechaFirma, estado: 'VIGENTE',
      creadaEn: existente?.creadaEn ?? new Date().toISOString(),
    };
    const res = await dbUpsertMandatoSepa(m);
    if (!res.ok) return res;
    setMandatosSepa(prev => [...prev.filter(x => x.id !== m.id), m]);
    return res;
  }
  async function quitarMandato(id: string): Promise<ResultadoEscritura> {
    const res = await dbCancelarMandatoSepa(id);
    if (!res.ok) return res;
    setMandatosSepa(prev => prev.map(m => m.id === id ? { ...m, estado: 'CANCELADO' as const } : m));
    return res;
  }

  // F2 (B2.4) dueña-first: "no puede venir". Da de baja una reserva y le concede una
  // recuperación en su lugar (la recuperación ES la compensación → NO se devuelve
  // bono). Se crea la recuperación PRIMERO (gateada por el tope): si ya tiene 4
  // vivas, no se cancela nada. Devuelve el resultado + la caducidad para el wa.me.
  async function bajaConRecuperacion(
    reservaId: string, motivo: string | null,
  ): Promise<{ recuperacion: 'CREADA' | 'TOPE' | 'ERROR'; caduca: string | null }> {
    const cancelada = reservas.find(r => r.id === reservaId);
    if (!cancelada) return { recuperacion: 'ERROR', caduca: null };
    const socioId = cancelada.socioId;
    const sesionId = cancelada.sesionId;

    const rc = await dbCrearRecuperacion(getCurrentStudioId(), socioId, reservaId, motivo);
    if (rc !== 'CREADA') return { recuperacion: rc, caduca: null };

    const lista = await dbListRecuperaciones(getCurrentStudioId());
    setRecuperaciones(lista);
    const caduca = lista
      .filter(x => x.socioId === socioId && x.estado === 'DISPONIBLE')
      .sort((a, b) => b.creadaEn.localeCompare(a.creadaEn))[0]?.caducaEl ?? null;

    // Cancela (atómico: promociona espera). NO devuelve bono; sí consume el de la
    // promovida (igual que cancelarReserva).
    setReservas(prev => prev.map(r => r.id === reservaId ? { ...r, estado: 'CANCELADA' as const } : r));
    const res = await dbCancelarReservaPlaza(getCurrentStudioId(), reservaId);
    // Si la BD rechaza la cancelación hay que deshacer las DOS cosas que ya se
    // hicieron: el optimista y —sobre todo— la recuperación, que se concedió
    // arriba. Antes no había esta rama: se devolvía 'CREADA' pasara lo que
    // pasara, así que un fallo de la RPC dejaba a la socia con una recuperación
    // regalada, la reserva viva en BD (la plaza no se libera ni promociona la
    // lista de espera) y la pantalla pintándola cancelada. La propietaria
    // además le mandaba el WhatsApp de «Recuperación guardada» por algo que no
    // había ocurrido.
    if (!res || 'error' in res) {
      setReservas(prev => prev.map(r => r.id === reservaId ? { ...r, estado: cancelada.estado } : r));
      // La recuperación se identifica por `origenReservaId`, que es justo el
      // `reservaId` con el que se creó arriba. `lista` ya está cargada.
      const recienCreada = lista.find(x => x.origenReservaId === reservaId && x.estado === 'DISPONIBLE');
      if (recienCreada) {
        await dbAnularRecuperacion(recienCreada.id);
        setRecuperaciones(await dbListRecuperaciones(getCurrentStudioId()));
      }
      return { recuperacion: 'ERROR', caduca: null };
    }
    if (res.promovidaSocioId && sesionId) {
      const promovidaSocioId = res.promovidaSocioId;
      setReservas(prev => prev.map(r =>
        (r.sesionId === sesionId && r.socioId === promovidaSocioId && r.estado === 'LISTA_ESPERA')
          ? { ...r, estado: 'CONFIRMADA' as const, posicionEspera: null } : r));
      await consumirSesionBono(promovidaSocioId, sesionId);
    }
    return { recuperacion: 'CREADA', caduca };
  }

  // ── Citas: servicios y horario fino (0046) ─────────────────────────────────────

  // No optimista, mismo patrón que addSala/updateSala/deleteSala: se escribe
  // primero y solo se pinta si la base de datos lo acepta — antes esto era
  // fire-and-forget (sin await, sin comprobar el resultado) y la propietaria
  // veía "servicio creado" aunque la escritura hubiera fallado en el servidor.
  async function addServicioCita(fields: Omit<ServicioCita, 'id' | 'studioId' | 'creadoEn'>): Promise<ResultadoEscritura> {
    const nuevo: ServicioCita = {
      ...fields, id: `csrv-${uid()}`, studioId: getCurrentStudioId(),
      creadoEn: new Date().toISOString(),
    };
    const res = await dbInsertServicioCita(nuevo);
    if (!res.ok) return res;
    setCitasServicios(prev => [...prev, nuevo]);
    return res;
  }
  async function updateServicioCita(id: string, changes: Partial<Omit<ServicioCita, 'id' | 'studioId'>>): Promise<ResultadoEscritura> {
    const res = await dbUpdateServicioCita(id, changes);
    if (!res.ok) return res;
    setCitasServicios(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s));
    return res;
  }
  async function deleteServicioCita(id: string): Promise<ResultadoEscritura> {
    const res = await dbDeleteServicioCita(id);
    if (!res.ok) return res;
    setCitasServicios(prev => prev.filter(s => s.id !== id));
    return res;
  }

  // Reemplaza TODAS las franjas de una instructora (el editor guarda de golpe).
  async function setDisponibilidadCitas(
    instructorId: string,
    franjas: Array<{ diaSemana: number; horaInicio: string; horaFin: string }>,
  ): Promise<ResultadoEscritura> {
    const studioId = getCurrentStudioId();
    const nuevas: DisponibilidadCita[] = franjas.map(f => ({
      id: `cdisp-${uid()}`, studioId, instructorId,
      diaSemana: f.diaSemana, horaInicio: f.horaInicio, horaFin: f.horaFin,
      creadoEn: new Date().toISOString(),
    }));
    const res = await dbReplaceDisponibilidadCitas(studioId, instructorId, nuevas);
    if (!res.ok) return res;
    setCitasDisponibilidad(prev => [...prev.filter(d => d.instructorId !== instructorId), ...nuevas]);
    return res;
  }

  // ── Tipos de clase ────────────────────────────────────────────────────────────

  async function addTipoClase(fields: Omit<TipoClase, 'id' | 'studioId'>): Promise<ResultadoEscritura> {
    const nuevo: TipoClase = { ...fields, id: `tc-${uid()}`, studioId: getCurrentStudioId() };
    const res = await dbInsertTipoClase(nuevo);
    if (!res.ok) return res;
    setTiposClase(prev => [...prev, nuevo]);
    return res;
  }
  async function updateTipoClase(id: string, changes: Partial<Omit<TipoClase, 'id' | 'studioId'>>): Promise<ResultadoEscritura> {
    const res = await dbUpdateTipoClase(id, changes);
    if (!res.ok) return res;
    setTiposClase(prev => prev.map(t => t.id === id ? { ...t, ...changes } : t));
    return res;
  }
  // Escribe primero y solo quita de pantalla si la BD lo acepta (igual que
  // deleteSala): borrar un tipo con clases programadas lo rechaza la FK
  // `sesiones.tipo_clase_id` y antes se borraba en optimista + fire-and-forget.
  async function deleteTipoClase(id: string): Promise<ResultadoEscritura> {
    const res = await dbDeleteTipoClase(id);
    if (!res.ok) return res;
    setTiposClase(prev => prev.filter(t => t.id !== id));
    return res;
  }

  // ── Contenido editable del portal (mensaje destacado + banners) ────────────

  async function updateMensajeDestacado(mensaje: string | null): Promise<ResultadoEscritura> {
    const studioId = getCurrentStudioId();
    const res = await dbUpsertContenidoPortal(studioId, mensaje);
    if (!res.ok) return res;
    setContenidoPortal({ studioId, mensajeDestacado: mensaje });
    return res;
  }
  async function addBannerPortal(fields: Omit<BannerPortal, 'id' | 'studioId'>): Promise<ResultadoEscritura> {
    // `contenido_portal_banners.id` es `uuid` de verdad (no `text` como el resto
    // de entidades de esta app) — el id de cliente tiene que ser un UUID válido,
    // no el `bp-${uid()}` habitual, o Postgres lo rechaza con 22P02. Además el
    // storage de la imagen del banner necesita este id YA creado en BD antes de
    // subir (la RLS del bucket lo valida contra la fila), así que no vale con
    // dejar que Postgres lo genere y leerlo después: se genera aquí. uuidV4() en
    // vez de crypto.randomUUID() a secas: exige contexto seguro y Safari
    // >=15.4, y sin fallback esto lanzaba antes de llegar siquiera a la RPC.
    const nuevo: BannerPortal = { ...fields, id: uuidV4(), studioId: getCurrentStudioId() };
    const res = await dbInsertBannerPortal(nuevo);
    if (!res.ok) return res;
    setBannersPortal(prev => [...prev, nuevo]);
    return res;
  }
  async function updateBannerPortal(id: string, changes: Partial<Omit<BannerPortal, 'id' | 'studioId'>>): Promise<ResultadoEscritura> {
    const res = await dbUpdateBannerPortal(id, changes);
    if (!res.ok) return res;
    setBannersPortal(prev => prev.map(b => b.id === id ? { ...b, ...changes } : b));
    return res;
  }
  async function deleteBannerPortal(id: string): Promise<ResultadoEscritura> {
    const res = await dbDeleteBannerPortal(id);
    if (!res.ok) return res;
    setBannersPortal(prev => prev.filter(b => b.id !== id));
    return res;
  }

  // ── Tablón (novedades_estudio) ──────────────────────────────────────────────
  async function addNovedadEstudio(fields: Omit<NovedadEstudio, 'id' | 'studioId'>): Promise<ResultadoEscritura> {
    const nuevo: NovedadEstudio = { ...fields, id: uuidV4(), studioId: getCurrentStudioId() };
    const res = await dbInsertNovedadEstudio(nuevo);
    if (!res.ok) return res;
    setNovedadesEstudio(prev => [nuevo, ...prev]);
    return res;
  }
  async function updateNovedadEstudio(id: string, changes: Partial<Omit<NovedadEstudio, 'id' | 'studioId'>>): Promise<ResultadoEscritura> {
    const res = await dbUpdateNovedadEstudio(id, changes);
    if (!res.ok) return res;
    setNovedadesEstudio(prev => prev.map(n => n.id === id ? { ...n, ...changes } : n));
    return res;
  }
  async function deleteNovedadEstudio(id: string): Promise<ResultadoEscritura> {
    const res = await dbDeleteNovedadEstudio(id);
    if (!res.ok) return res;
    setNovedadesEstudio(prev => prev.filter(n => n.id !== id));
    return res;
  }

  // ── Campos personalizados de socia ──────────────────────────────────────────

  async function addCampoPersonalizado(fields: Omit<CampoPersonalizado, 'id' | 'studioId'>): Promise<ResultadoEscritura> {
    const nuevo: CampoPersonalizado = { ...fields, id: `campo-${uid()}`, studioId: getCurrentStudioId() };
    const res = await dbInsertCampoPersonalizado(nuevo);
    if (!res.ok) return res;
    setCamposPersonalizados(prev => [...prev, nuevo]);
    return res;
  }
  async function updateCampoPersonalizado(id: string, changes: Partial<Omit<CampoPersonalizado, 'id' | 'studioId'>>): Promise<ResultadoEscritura> {
    const res = await dbUpdateCampoPersonalizado(id, changes);
    if (!res.ok) return res;
    setCamposPersonalizados(prev => prev.map(c => c.id === id ? { ...c, ...changes } : c));
    return res;
  }
  async function deleteCampoPersonalizado(id: string): Promise<ResultadoEscritura> {
    const res = await dbDeleteCampoPersonalizado(id);
    if (!res.ok) return res;
    setCamposPersonalizados(prev => prev.filter(c => c.id !== id));
    return res;
  }

  async function addSegmentoCliente(nombre: string, condiciones: DefinicionSegmento): Promise<ResultadoEscritura> {
    const nuevo: SegmentoCliente = {
      id: `segmento-${uid()}`, studioId: getCurrentStudioId(), nombre, condiciones,
      creadoPor: authUserId, creadoEn: new Date().toISOString(), actualizadoEn: new Date().toISOString(),
    };
    const res = await dbInsertSegmentoCliente(nuevo);
    if (!res.ok) return res;
    setSegmentosClientes(prev => [nuevo, ...prev]);
    return res;
  }
  async function updateSegmentoCliente(id: string, changes: Partial<Pick<SegmentoCliente, 'nombre' | 'condiciones'>>): Promise<ResultadoEscritura> {
    const res = await dbUpdateSegmentoCliente(id, changes);
    if (!res.ok) return res;
    setSegmentosClientes(prev => prev.map(s => s.id === id ? { ...s, ...changes, actualizadoEn: new Date().toISOString() } : s));
    return res;
  }
  async function deleteSegmentoCliente(id: string): Promise<ResultadoEscritura> {
    const res = await dbDeleteSegmentoCliente(id);
    if (!res.ok) return res;
    setSegmentosClientes(prev => prev.filter(s => s.id !== id));
    return res;
  }

  // ── Cuestionario de salud configurable (Fase 1) ─────────────────────────────
  // Mismo patrón no-optimista que campos personalizados/condiciones de salud:
  // se confía en la RLS del servidor (plantilla: solo PROPIETARIO escribe;
  // respuesta: PROPIETARIO/INSTRUCTOR + consentimiento) para rechazar, no en
  // un gate de rol duplicado aquí.

  async function addPlantillaCuestionarioSalud(fields: Omit<PlantillaCuestionarioSalud, 'id' | 'studioId'>): Promise<ResultadoEscritura> {
    const nueva: PlantillaCuestionarioSalud = { ...fields, id: `pcs-${uid()}`, studioId: getCurrentStudioId() };
    const res = await dbInsertPlantillaCuestionarioSalud(nueva);
    if (!res.ok) return res;
    setPlantillasCuestionarioSalud(prev => [...prev, nueva]);
    return res;
  }
  async function updatePlantillaCuestionarioSalud(id: string, changes: Partial<Omit<PlantillaCuestionarioSalud, 'id' | 'studioId'>>): Promise<ResultadoEscritura> {
    const res = await dbUpdatePlantillaCuestionarioSalud(id, changes);
    if (!res.ok) return res;
    setPlantillasCuestionarioSalud(prev => prev.map(p => p.id === id ? { ...p, ...changes } : p));
    return res;
  }
  async function deletePlantillaCuestionarioSalud(id: string): Promise<ResultadoEscritura> {
    const res = await dbDeletePlantillaCuestionarioSalud(id);
    if (!res.ok) return res;
    setPlantillasCuestionarioSalud(prev => prev.filter(p => p.id !== id));
    return res;
  }
  async function guardarRespuestaCuestionarioSalud(socioId: string, preguntaId: string, respuesta: string | null): Promise<ResultadoEscritura> {
    const existente = respuestasCuestionarioSalud.find(r => r.socioId === socioId && r.preguntaId === preguntaId);
    const id = existente?.id ?? `rcs-${uid()}`;
    const res = await dbUpsertRespuestaCuestionarioSalud({
      id, studioId: getCurrentStudioId(), socioId, preguntaId, respuesta, creadoPor: existente?.creadoPor ?? null,
    });
    if (!res.ok) return res;
    const ahora = new Date().toISOString();
    setRespuestasCuestionarioSalud(prev => existente
      ? prev.map(r => r.id === id ? { ...r, respuesta, actualizadoEn: ahora } : r)
      : [...prev, { id, studioId: getCurrentStudioId(), socioId, preguntaId, respuesta, creadoPor: null, creadoEn: ahora, actualizadoEn: ahora }]);
    return res;
  }

  // ── Plantillas de email ─────────────────────────────────────────────────────

  async function upsertPlantillaEmail(tipo: PlantillaEmail['tipo'], changes: CambiosPlantillaEmail): Promise<ResultadoEscritura> {
    const existente = plantillasEmail.find(p => p.tipo === tipo);
    const merged: PlantillaEmail = existente
      ? { ...existente, ...changes }
      : {
          id: `pl-${uid()}`, studioId: getCurrentStudioId(), tipo,
          asunto: null, intro: null, activa: true,
          cuerpo: null, botonTexto: null, colorCabecera: null, colorBoton: null,
          logoUrl: null, pie: null, fuente: null,
          ...changes,
        };
    const res = await dbUpsertPlantillaEmail(merged);
    if (!res.ok) return res;
    setPlantillasEmail(prev => {
      const rest = prev.filter(p => p.tipo !== tipo);
      return [...rest, merged];
    });
    return res;
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

  // `id` opcional: el modal de alta lo pre-genera cuando necesita subir una
  // foto ANTES de guardar (el storage necesita una clave estable ya en el
  // primer upload). Si no se pasa, se genera aquí como siempre.
  async function addInstructor(fields: Omit<Instructor, 'id' | 'studioId'>, id?: string): Promise<ResultadoEscritura> {
    const nuevo: Instructor = { ...fields, id: id ?? `ins-${uid()}`, studioId: getCurrentStudioId() };
    const res = await dbInsertInstructor(nuevo);
    // Si el alta falla no la pintamos ni la registramos en actividad: antes se
    // anotaba "Fulanita añadió a Marta al equipo" aunque Marta no se guardara.
    if (!res.ok) return res;
    setInstructores(prev => [...prev, nuevo]);
    addActividadReciente('EQUIPO_ALTA', `${actorNombre ?? 'Alguien'} añadió a ${nuevo.nombre} al equipo (${nuevo.rol})`);
    return res;
  }
  async function updateInstructor(id: string, changes: Partial<Omit<Instructor, 'id' | 'studioId'>>): Promise<ResultadoEscritura> {
    const anterior = instructores.find(i => i.id === id);
    const res = await dbUpdateInstructor(id, changes);
    if (!res.ok) return res;
    setInstructores(prev => prev.map(i => i.id === id ? { ...i, ...changes } : i));
    if (anterior) {
      const detalle = 'rol' in changes && changes.rol !== anterior.rol
        ? `rol ${anterior.rol} → ${changes.rol}`
        : 'datos actualizados';
      addActividadReciente('EQUIPO_EDITADO', `${actorNombre ?? 'Alguien'} editó a ${anterior.nombre} del equipo (${detalle})`);
    }
    return res;
  }
  // No optimista (antes sí lo era): la tarjeta de Equipo se pinta desde un
  // `tarjetasEquipo()` que se recarga cuando cambia `instructores`. Si el
  // array local se vaciaba ANTES de que el DELETE llegara a comprometerse en
  // BD, ese recarga podía ganar la carrera y devolver a la instructora
  // borrada — la propietaria la veía desaparecer y reaparecer sola.
  async function deleteInstructor(id: string): Promise<ResultadoEscritura> {
    const instructor = instructores.find(i => i.id === id);
    const res = await dbDeleteInstructor(id);
    if (!res.ok) return res;
    setInstructores(prev => prev.filter(i => i.id !== id));
    if (instructor) addActividadReciente('EQUIPO_BAJA', `${actorNombre ?? 'Alguien'} eliminó a ${instructor.nombre} del equipo`);
    return res;
  }

  // ── Datos del estudio ──────────────────────────────────────────────────────────

  async function updateAvatarAdmin(avatarId: string | null): Promise<ResultadoEscritura> {
    const res = await dbUpdateStudio({ avatarAdmin: avatarId });
    if (!res.ok) return res;
    setStudio(prev => prev ? { ...prev, avatarAdmin: avatarId } : prev);
    return res;
  }

  async function updateStudio(changes: Partial<Studio>): Promise<ResultadoEscritura> {
    const res = await dbUpdateStudio(changes);
    if (!res.ok) return res;
    setStudio(prev => prev ? { ...prev, ...changes } : prev);
    return res;
  }

  async function updateHorarioEstudio(dias: DiaHorario[]): Promise<ResultadoEscritura> {
    const res = await dbUpdateHorarioEstudio(dias);
    if (!res.ok) return res;
    setStudio(prev => prev ? { ...prev, horarioSemana: dias } : prev);
    return res;
  }

  // ── Socios ────────────────────────────────────────────────────────────────────

  async function addSocio(fields: Omit<Socio, 'id' | 'studioId' | 'fechaAlta'> & { planId?: string; aceptacionContrato?: AceptacionContrato }): Promise<ResultadoEscritura & { id?: string }> {
    // El insert de más abajo va directo a Supabase desde el navegador (RLS, sin
    // ruta de servidor de por medio) — el tope de socias del plan se comprueba
    // aquí, antes, porque si no el alta manual lo saltaba entero (el importador
    // masivo sí lo comprobaba, este camino no).
    const motivoBloqueo = await verificarLimiteSocias();
    if (motivoBloqueo) return { ok: false, error: motivoBloqueo };

    const { planId, aceptacionContrato, ...socioFields } = fields;
    const ahora = new Date().toISOString();
    // Si la firma se recogió en el mostrador, se deja constancia de QUIÉN la
    // introdujo: es lo que distingue una firma de la socia de una tecleada por
    // el estudio en su nombre (RGPD art. 7.1, prueba del consentimiento).
    const aceptacion = aceptacionContrato?.origen === 'MOSTRADOR'
      ? { ...aceptacionContrato, introducidaPor: aceptacionContrato.introducidaPor ?? actorNombre ?? 'el estudio' }
      : aceptacionContrato;
    const nuevaSocia: Socio = {
      id: `soc-${uid()}`,
      studioId: getCurrentStudioId(),
      fechaAlta: ahora,
      ...(aceptacion ? { aceptacionContrato: aceptacion } : {}),
      ...socioFields,
    };

    // La socia va PRIMERO y se espera: todo lo demás cuelga de ella por FK
    // ("Key is not present in table socios" — Sentry JAVASCRIPT-NEXTJS-3/4).
    // Y hasta que la BD no la acepta no se pinta nada: antes se añadía al estado
    // de forma optimista y, si el insert fallaba, quedaba en pantalla una socia
    // que no existía —con su suscripción, su recibo cobrado y una factura ya
    // SELLADA— sin que nadie avisara.
    const resSocia = await dbInsertSocio(nuevaSocia);
    if (!resSocia.ok) return resSocia;
    setSocios(prev => [...prev, nuevaSocia]);
    addActividadReciente('NUEVA_SOCIA', `${actorNombre ?? 'Alguien'} dio de alta a ${nuevaSocia.nombre} ${nuevaSocia.apellidos}`, nuevaSocia.id, `/socios/${nuevaSocia.id}`);

    let planNombreAlta: string | undefined;

    if (planId) {
      const plan = planesTarifa.find(p => p.id === planId);
      if (plan) {
        planNombreAlta = plan.nombre;
        const susId = `sus-${uid()}`;
        const sus: Suscripcion = {
          id: susId,
          studioId: getCurrentStudioId(),
          socioId: nuevaSocia.id,
          planId,
          estado: 'ACTIVA',
          fechaInicio: ahora,
          fechaFin: calcularFechaFinBono(ahora, plan.validezDias ?? null),
          sesionesRestantes: plan.sesiones,
          stripeSubscriptionId: null,
        };
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

        // Suscripción y recibo, en orden y esperados. La socia ya existe, así
        // que la FK está garantizada.
        const resSus = await dbInsertSuscripcion(sus);
        if (!resSus.ok) return resSus;
        setSuscripciones(prev => [...prev, sus]);

        const resRec = await dbInsertRecibo(reciboCobrado);
        if (!resRec.ok) return resRec;
        setRecibos(prev => [...prev, reciboCobrado]);

        // La factura se SELLA (Veri*Factu, cadena de hashes) y no se puede
        // borrar: solo se emite cuando el cobro que la respalda está guardado.
        // Antes se sellaba antes incluso de insertar a la socia.
        // 2.2: el sellado (llamada de red) se saca del updater de setFacturas —
        // ahí dentro debe ser puro, o React lo duplica en StrictMode/reintentos
        // concurrentes y se sella la misma factura fiscal dos veces.
        const fac = buildFactura(reciboCobrado, facturas);
        setFacturas(prev => [...prev, fac]);
        void sellarFacturaYActualizar(fac);
      }
    }

    // Sin esto, el alta quedaba completa en la BD pero la socia nunca se
    // enteraba de que existía un portal: `enviarEmailBienvenida` ya existía
    // (con enlace de acceso directo, sin contraseña que teclear) pero nadie la
    // llamaba desde ningún sitio del código — la propietaria tenía que enviarla
    // a mano desde otra pantalla, y casi nunca lo hacía. Best-effort: un email
    // que no sale no debe deshacer un alta que ya se guardó en la BD.
    if (nuevaSocia.email) {
      void enviarEmailBienvenida({
        to: nuevaSocia.email,
        toName: nuevaSocia.nombre,
        planNombre: planNombreAlta,
        socioId: nuevaSocia.id,
      }).catch(() => { /* fallo suave: el alta ya está hecha */ });
    }

    return { ...resSocia, id: nuevaSocia.id };
  }

  // En ruta pública, las escrituras van por los endpoints de servidor (service-
  // role + validación por email), no por la anon key. Devuelve el contexto de la
  // socia en sesión, o null si no estamos en modo público.
  function ctxPublico(): { studioId: string; socioId: string; email: string } | null {
    if (!publicSlug) return null;
    const m = leerSociaLocal();
    return { studioId: studioIdOverride ?? '', socioId: m?.socioId ?? '', email: m?.email ?? '' };
  }
  async function postPublico(url: string, body: Record<string, unknown>): Promise<ResultadoEscritura & { datos?: unknown }> {
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
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...auth,
          ...(kioskToken ? { 'x-kiosk-token': kioskToken } : {}),
        },
        body: JSON.stringify(body),
      });
      // Antes ni se miraba el 500: se daba por hecho que había ido bien. Quien
      // quiera enterarse ya puede; quien no, se comporta como siempre.
      if (!res.ok) {
        const cuerpo = await res.json().catch(() => ({}));
        return { ok: false, error: mensajeDeFalloAlGuardar({ ...cuerpo, status: res.status }) };
      }
      // El cuerpo se devuelve porque hay respuestas que dicen algo: la reserva
      // contesta si quedó CONFIRMADA o en LISTA_ESPERA, y esa decisión la toma
      // la BD (bloqueando la fila de la sesión), no la estimación del navegador.
      return { ok: true, datos: await res.json().catch(() => null) };
    } catch (e) {
      return { ok: false, error: mensajeDeFalloAlGuardar(e) };
    } finally {
      cargarPublico(); // re-sincroniza el estado desde el servidor
    }
  }

  async function addSocioFromPortal(fields: { id: string; nombre: string; email: string; telefono?: string; aceptacionContrato?: AceptacionContrato; referidoPor?: string | null; origenLead?: string | null }): Promise<ResultadoEscritura> {
    const cpub = ctxPublico();
    if (cpub) {
      // Alta pública vía endpoint (service-role). Se AWAITea para que la reserva
      // posterior encuentre a la socia ya creada. El resultado se PROPAGA: antes
      // se descartaba y un rechazo del servidor (tope de plan, red, timeout) se
      // trataba como éxito silencioso — handleConfirm seguía adelante con una
      // socia que no existía y se quedaba colgado sin ningún aviso.
      return postPublico('/api/public/socio', {
        accion: 'registrar', studioId: cpub.studioId, id: fields.id, nombre: fields.nombre, email: fields.email,
        telefono: fields.telefono || undefined,
        aceptacion: fields.aceptacionContrato, referidoPor: fields.referidoPor ?? null,
        origenLead: fields.origenLead ?? null,
      });
    }
    const nuevaSocia: Socio = {
      id: fields.id,
      studioId: getCurrentStudioId(),
      nombre: fields.nombre,
      apellidos: '',
      email: fields.email,
      telefono: fields.telefono || null,
      nif: null,
      fechaAlta: new Date().toISOString(),
      activo: true,
      ...(fields.aceptacionContrato ? { aceptacionContrato: fields.aceptacionContrato } : {}),
      ...(fields.referidoPor ? { referidoPor: fields.referidoPor } : {}),
      ...(fields.origenLead ? { origenLead: fields.origenLead } : {}),
    };
    // Se ESPERA y se comprueba, igual que en `addSocio`. Antes se pintaba la
    // socia y se lanzaba el insert sin mirar la respuesta, devolviendo `ok`
    // pasara lo que pasara: con el email repetido —el choque más común— la
    // pantalla decía que se había creado y en la base de datos no había nadie.
    // Es el mismo patrón que costó el bug #500, en otra pantalla.
    const resSocia = await dbInsertSocio(nuevaSocia);
    if (!resSocia.ok) return resSocia;
    setSocios(prev => [...prev, nuevaSocia]);
    // El referido queda registrado en la socia (referidoPor), pero el premio
    // al que invita NO se otorga aquí: se otorga cuando la referida asiste a
    // su primera clase (ver premiarReferidoSiProcede en checkin). Así una alta
    // falsa o que nunca aparece no genera recompensa.
    return { ok: true };
  }

  async function updateStudioConfig(changes: Partial<StudioConfig>): Promise<ResultadoEscritura> {
    // Escribir PRIMERO y solo aplicar si la BD lo acepta (patrón salas): antes solo
    // mutaba el estado y NUNCA persistía, así que el portal de reservas y el registro
    // de aceptación de la clienta seguían con el texto por defecto (exposición legal).
    const res = await dbUpdateStudioConfig(changes);
    if (!res.ok) return res;
    setStudioConfig(prev => ({ ...prev, ...changes }));
    return res;
  }

  async function updateSocio(id: string, changes: Partial<Socio>): Promise<ResultadoEscritura> {
    const cpub = ctxPublico();
    if (cpub) {
      // La socia edita su propio perfil vía endpoint (whitelist de campos).
      //
      // Se espera la respuesta y solo se pinta si el servidor la acepta. Antes
      // era fire-and-forget con `return { ok: true }` fijo: /api/public/socio
      // rechaza con 400/401/429 (actualizarSociaPublica), y ese rechazo no
      // llegaba a nadie. Como PortalStore.guardarDatos decide el aviso con lo
      // que devuelve esto, la socia cambiaba su email o su teléfono, leía
      // «Datos guardados» y volvía atrás sin que se hubiera guardado nada.
      // Mismo patrón que ya se corrigió en addReserva y cancelarReserva.
      const anterior = socios.find(s => s.id === id);
      setSocios(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s)); // optimista
      const r = await postPublico('/api/public/socio', { accion: 'actualizar', studioId: cpub.studioId, socioId: cpub.socioId, email: cpub.email, cambios: changes });
      if (!r.ok) {
        // Revierte: la fila vuelve a lo que había antes del optimista.
        if (anterior) setSocios(prev => prev.map(s => s.id === id ? anterior : s));
        return r;
      }
      // El portal re-sincroniza contra el servidor al terminar (cargarPublico).
      return { ok: true };
    }
    const res = await dbUpdateSocio(id, changes);
    if (!res.ok) return res;
    setSocios(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s));
    const socio = socios.find(s => s.id === id);
    if (socio) addActividadReciente('SOCIA_EDITADA', `${actorNombre ?? 'Alguien'} editó los datos de ${socio.nombre} ${socio.apellidos}`, id, `/socios/${id}`);
    return res;
  }

  async function deleteSocio(id: string) {
    const socio = socios.find(s => s.id === id);

    // PRIMERO el servidor, DESPUÉS la pantalla. Antes era al revés: se limpiaba
    // el estado local y se lanzaba la petición sin mirar el resultado, así que
    // un rechazo (una instructora, que no tiene permiso) se veía como una baja
    // consumada — la clienta desaparecía y reaparecía al recargar.
    // Se hace pesimista en vez de con rollback a propósito: dar de baja es una
    // acción rara y deliberada, y restaurar cinco trozos de estado a mano es
    // justo donde se cuelan los bugs.
    const { error } = await dbDeleteSocio(id);
    if (error) throw new Error(error);

    // A-3/A-4: baja lógica con anonimización. La socia sale del roster, sus
    // suscripciones quedan CANCELADAS y se limpian sus datos personales sin base
    // de retención. Los RECIBOS se CONSERVAN (obligación fiscal); el pago
    // histórico se mostrará como "Socia eliminada" al no resolver ya el nombre.
    setSocios(prev => prev.filter(s => s.id !== id));
    setSuscripciones(prev => prev.map(s => s.socioId === id ? { ...s, estado: 'CANCELADA' as const } : s));
    setNotasInternas(prev => prev.filter(n => n.socioId !== id));
    setCondicionesSalud(prev => prev.filter(c => c.socioId !== id));
    setRespuestasSesion(prev => prev.filter(r => r.socioId !== id));
    if (socio) addActividadReciente('SOCIA_ELIMINADA', `${actorNombre ?? 'Alguien'} dio de baja a ${socio.nombre} ${socio.apellidos}`);
  }

  async function addTagSocio(socioId: string, tag: string): Promise<ResultadoEscritura> {
    // Antes solo mutaba el estado: la etiqueta aparecía y se perdía al recargar, y
    // el targeting de campañas por segmento (p. ej. VIP) nunca la veía. dbUpdateSocio
    // ya serializa `tags`; solo faltaba llamarlo.
    const nuevos = [...new Set([...(socios.find(s => s.id === socioId)?.tags ?? []), tag])];
    const res = await dbUpdateSocio(socioId, { tags: nuevos });
    if (!res.ok) return res;
    setSocios(prev => prev.map(s => s.id === socioId ? { ...s, tags: nuevos } : s));
    return res;
  }

  async function removeTagSocio(socioId: string, tag: string): Promise<ResultadoEscritura> {
    const nuevos = (socios.find(s => s.id === socioId)?.tags ?? []).filter(t => t !== tag);
    const res = await dbUpdateSocio(socioId, { tags: nuevos });
    if (!res.ok) return res;
    setSocios(prev => prev.map(s => s.id === socioId ? { ...s, tags: nuevos } : s));
    return res;
  }

  // ── Notas internas ───────────────────────────────────────────────────────────

  async function addNota(socioId: string, texto: string): Promise<ResultadoEscritura> {
    const nueva: NotaInterna = {
      id: `nota-${uid()}`,
      studioId: getCurrentStudioId(),
      socioId,
      texto: texto.trim(),
      tipo: 'NOTA',
      creadoEn: new Date().toISOString(),
    };
    const res = await dbInsertNotaInterna(nueva);
    if (!res.ok) return res;
    setNotasInternas(prev => [nueva, ...prev]);
    return res;
  }

  async function deleteNota(notaId: string): Promise<ResultadoEscritura> {
    const res = await dbDeleteNotaInterna(notaId);
    if (!res.ok) return res;
    setNotasInternas(prev => prev.filter(n => n.id !== notaId));
    return res;
  }

  // ── Ficha clínica: condiciones de salud ──────────────────────────────────────
  async function addCondicion(fields: Omit<CondicionSalud, 'id' | 'studioId' | 'creadoEn' | 'actualizadoEn'>): Promise<ResultadoEscritura> {
    const ahora = new Date().toISOString();
    const nueva: CondicionSalud = {
      ...fields,
      id: `cond-${uid()}`,
      studioId: getCurrentStudioId(),
      creadoEn: ahora,
      actualizadoEn: ahora,
    };
    const res = await dbInsertCondicion(nueva);
    if (!res.ok) return res;
    setCondicionesSalud(prev => [nueva, ...prev]);
    // Sin log al feed de actividad reciente: es visible para RECEPCIÓN y la
    // etiqueta clínica es dato sensible (FICHA-CLINICA.md §11). Un registro de
    // auditoría restringido queda como follow-up.
    return res;
  }

  async function updateCondicion(id: string, changes: Partial<CondicionSalud>): Promise<ResultadoEscritura> {
    const conActualizado = { ...changes, actualizadoEn: new Date().toISOString() };
    const res = await dbUpdateCondicion(id, changes);
    if (!res.ok) return res;
    setCondicionesSalud(prev => prev.map(c => c.id === id ? { ...c, ...conActualizado } : c));
    return res;
  }

  async function deleteCondicion(id: string): Promise<ResultadoEscritura> {
    const res = await dbDeleteCondicion(id);
    if (!res.ok) return res;
    setCondicionesSalud(prev => prev.filter(c => c.id !== id));
    return res;
  }

  // Evolución post-clase (Fase 2): una respuesta por (socia, sesión). Si ya
  // existe para esa combinación, se actualiza; si no, se inserta.
  async function registrarRespuestaSesion({ socioId, sesionId, respuesta, nota = null }: { socioId: string; sesionId: string | null; respuesta: RespuestaSesion; nota?: string | null }): Promise<ResultadoEscritura> {
    const existente = respuestasSesion.find(r => r.socioId === socioId && r.sesionId === sesionId);
    if (existente) {
      const res = await dbUpdateRespuestaSesion(existente.id, { respuesta, nota });
      if (!res.ok) return res;
      setRespuestasSesion(prev => prev.map(r => r.id === existente.id ? { ...r, respuesta, nota } : r));
      return res;
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
    const res = await dbInsertRespuestaSesion(nueva);
    if (!res.ok) return res;
    setRespuestasSesion(prev => [nueva, ...prev]);
    return res;
  }

  // ── Suscripciones ────────────────────────────────────────────────────────────

  async function assignPlan(socioId: string, planId: string | null) {
    // Un bono con sesiones sin gastar es DINERO QUE LA CLIENTA YA PAGÓ. Antes,
    // asignarle cualquier otro plan cancelaba TODAS sus suscripciones activas sin
    // mirar si les quedaba algo dentro y sin avisar: venderle un bono de mat de
    // 90 € le borraba el de reformer de 150 € con sus 10 sesiones intactas.
    //
    // Lo que sí se sustituye es la cuota recurrente — nadie tiene dos
    // mensualidades a la vez. Los bonos con saldo conviven, y TIENEN que
    // convivir: si una socia solo puede tener un bono, acotar un bono a ciertos
    // tipos de clase (migr 0111) no sirve para nada, porque darle el de reformer
    // le impediría reservar mat en absoluto.
    //
    // Nota: el camino público ya se comportaba así (lib/billing/entregar-plan-
    // comprado.ts no cancela nada), así que esto además alinea los dos caminos,
    // que hasta ahora dejaban la base en estados distintos según quién comprara.
    const conservaSaldo = (s: Suscripcion) =>
      planesTarifa.find(p => p.id === s.planId)?.tipo === 'BONO' && (s.sesionesRestantes ?? 0) > 0;
    const aDesactivar = suscripciones.filter(
      s => s.socioId === socioId && s.estado === 'ACTIVA' && !conservaSaldo(s),
    );
    const plan = planId ? planesTarifa.find(p => p.id === planId) : null;
    const nueva: Suscripcion | null = plan ? {
      id: `sus-${uid()}`,
      studioId: getCurrentStudioId(),
      socioId,
      planId: plan.id,
      estado: 'ACTIVA',
      fechaInicio: new Date().toISOString(),
      fechaFin: calcularFechaFinBono(new Date().toISOString(), plan.validezDias ?? null),
      sesionesRestantes: plan.sesiones,
      stripeSubscriptionId: null,
    } : null;

    // Asignar un plan mueve dinero, así que aquí NO se escribe en pantalla y se
    // reza: se espera a cada respuesta del servidor y solo se refleja lo que ha
    // quedado guardado de verdad. Antes esta función no era ni `async` — pintaba
    // el plan nuevo, lanzaba tres escrituras sin mirarlas y el detalle de la
    // clienta llegaba a decir «Plan "X" asignado» sin que se hubiera guardado
    // nada. Una instructora, que no tiene permiso, veía exactamente lo mismo que
    // la dueña: éxito.
    //
    // El ORDEN es deliberado: primero se le DA lo que ha pagado, después se le
    // quita lo viejo. Sin transacción desde el navegador, un fallo a medias es
    // posible; que la clienta se quede de más y no de menos es la mitad buena.
    const fallos: string[] = [];

    // 1) El plan nuevo. Si esto falla no se ha tocado nada: se corta aquí.
    if (nueva) {
      const res = await dbInsertSuscripcion(nueva);
      if (!res.ok) throw new Error(res.error);
    }

    // Asignar un plan es una VENTA, y hasta ahora no dejaba rastro de dinero:
    // sólo el alta de socia (addSocio) generaba recibo, y el bono que se vende
    // en recepción semanas después se asigna desde aquí. Resultado: suscripción
    // creada, 0 recibos, 0 facturas — el importe no aparecía ni como cobrado ni
    // como pendiente, y a fin de mes faltaba de la caja sin que nada avisara.
    //
    // Se crea PENDIENTE, no COBRADO como en el alta: aquí no sabemos si ya ha
    // pagado, y dar por cobrado lo que no lo está es el mismo error contable al
    // revés. Pendiente aparece en "Quién me debe", donde marcarCobrado ya emite
    // la factura. Un plan de 0 € (invitación, prueba) no genera recibo.
    //
    // 2) Si el recibo falla, el plan YA está asignado: fingir que no ha pasado
    //    nada sería otra mentira. Se sigue adelante y se avisa de qué falta.
    let reciboPlan: Recibo | null = null;
    if (nueva && plan && plan.precio > 0) {
      const rec: Recibo = {
        id: `rec-${uid()}`,
        studioId: getCurrentStudioId(),
        socioId,
        suscripcionId: nueva.id,
        concepto: plan.nombre,
        importe: plan.precio,
        estado: 'PENDIENTE',
        fechaVencimiento: nueva.fechaInicio,
        fechaCobro: null,
        fechaDevolucion: null,
        intentosReintento: 0,
      };
      const res = await dbInsertRecibo(rec);
      if (res.ok) reciboPlan = rec;
      else fallos.push(`El plan se ha asignado, pero el cobro de ${plan.precio} € no ha quedado anotado en "Quién me debe": añádelo a mano.`);
    }

    // 3) Y por último, retirar lo viejo. Lo que no se consiga dar de baja sigue
    //    activo en el servidor, así que tampoco se tacha en pantalla.
    const desactivadas = new Set<string>();
    for (const s of aDesactivar) {
      const res = await dbUpdateSuscripcion(s.id, { estado: 'CANCELADA' });
      if (res.ok) desactivadas.add(s.id);
    }
    const sinDarDeBaja = aDesactivar.length - desactivadas.size;
    if (sinDarDeBaja > 0) {
      fallos.push(sinDarDeBaja === 1
        ? 'El plan anterior no se ha podido dar de baja y sigue activo: revísalo antes de que se vuelva a cobrar.'
        : `${sinDarDeBaja} planes anteriores no se han podido dar de baja y siguen activos: revísalos antes de que se vuelvan a cobrar.`);
    }

    // La pantalla, ahora sí, con lo que hay guardado y nada más.
    setSuscripciones(prev => {
      const bajas = prev.map(s =>
        desactivadas.has(s.id) ? { ...s, estado: 'CANCELADA' as const } : s
      );
      return nueva ? [...bajas, nueva] : bajas;
    });
    const rec = reciboPlan;
    if (rec) setRecibos(prev => [...prev, rec]);

    const socio = socios.find(s => s.id === socioId);
    addActividadReciente(
      'PLAN_ASIGNADO',
      `${actorNombre ?? 'Alguien'} ${plan ? `asignó el plan "${plan.nombre}"` : 'quitó el plan'} a ${socio?.nombre ?? 'una socia'}`,
      socioId,
      `/socios/${socioId}`
    );

    // Lo que sí ha quedado guardado ya está en pantalla; lo que no, se cuenta.
    if (fallos.length > 0) throw new Error(fallos.join(' '));
  }

  // I7 + F2 (B2.8): pausar = congelar. La RPC registra la ventana de congelación
  // y pone PAUSADA de forma atómica. No optimista: si la RPC falla, el estado
  // local no debe adelantarse — antes se pintaba PAUSADA sin esperar respuesta.
  async function pausarSuscripcion(susId: string, motivo?: string): Promise<ResultadoEscritura> {
    const sus = suscripciones.find(s => s.id === susId);
    if (!sus || sus.estado !== 'ACTIVA') return { ok: false, error: 'Esta suscripción no está activa.' };
    const res = await dbCongelarSuscripcion(susId, getCurrentStudioId(), motivo ?? null);
    if (!res.ok) return res;
    setSuscripciones(prev => prev.map(s => s.id === susId ? { ...s, estado: 'PAUSADA' as const } : s));
    return res;
  }

  // I7 + F2 (B2.8): reanudar = descongelar. Cierra la ventana, empuja fecha_fin y
  // vuelve a ACTIVA en el servidor. No optimista, mismo motivo que arriba.
  async function reanudarSuscripcion(susId: string): Promise<ResultadoEscritura> {
    const sus = suscripciones.find(s => s.id === susId);
    if (!sus || sus.estado !== 'PAUSADA') return { ok: false, error: 'Esta suscripción no está pausada.' };
    const res = await dbDescongelarSuscripcion(susId, getCurrentStudioId());
    if (!res.ok) return res;
    setSuscripciones(prev => prev.map(s => s.id === susId ? { ...s, estado: 'ACTIVA' as const, fechaFin: res.fechaFin } : s));
    return { ok: true };
  }

  // Hallazgo B (auditoría dunning 2026-08-10): REACTIVAR una suscripción
  // CANCELADA (por el botón "Cancelar suscripción" de esta misma pantalla, o
  // por la auto-cancelación del dunning tras 3 fallos de cobro) — distinto de
  // "Reanudar"/descongelar, que solo cierra una ventana de PAUSADA. No hay RPC
  // atómica aquí (no hace falta ventana que cerrar), pero SÍ hay que recalcular
  // fecha_fin: la de una suscripción cancelada hace tiempo suele estar en el
  // pasado, y reactivarla dejándola tal cual la caducaría al instante. Mismo
  // criterio que un alta nueva (`calcularReactivacion`, espejo de `assignPlan`).
  //
  // Alcance deliberadamente acotado: si la suscripción tenía `stripeSubscriptionId`
  // (cobro automático), este botón NO reintenta cobrar en Stripe — solo la
  // reactiva en Tentare, a la espera del próximo ciclo normal de
  // renovación/dunning. Reactivar un PaymentIntent/Subscription real en Stripe
  // desde aquí es una pieza de riesgo/alcance distinta, no construida.
  async function reactivarSuscripcion(susId: string): Promise<ResultadoEscritura> {
    const sus = suscripciones.find(s => s.id === susId);
    if (!sus || sus.estado !== 'CANCELADA') return { ok: false, error: 'Esta suscripción no está cancelada.' };
    const plan = planesTarifa.find(p => p.id === sus.planId);
    if (!plan) return { ok: false, error: 'No se encuentra el plan de esta suscripción.' };

    const ahoraISO = new Date().toISOString();
    const { fechaFin, sesionesRestantes } = calcularReactivacion(plan, ahoraISO);
    const changes: Partial<Suscripcion> = { estado: 'ACTIVA', fechaFin };
    if (plan.tipo === 'BONO' || plan.tipo === 'PUNTUAL') changes.sesionesRestantes = sesionesRestantes;

    const res = await dbUpdateSuscripcion(susId, changes);
    if (!res.ok) return res;
    setSuscripciones(prev => prev.map(s => s.id === susId ? { ...s, ...changes } : s));
    return { ok: true };
  }

  // ── Sesiones ─────────────────────────────────────────────────────────────────

  // Escribe PRIMERO y solo entonces la pinta. Antes era al revés: la clase
  // aparecía en el calendario al instante y el insert iba sin await, así que un
  // fallo (p. ej. FK contra una sala que no existía) dejaba en pantalla una
  // clase que no existía en ninguna parte hasta la siguiente recarga.
  async function addSesion(fields: Omit<Sesion, 'id' | 'studioId'>): Promise<ResultadoEscritura> {
    const nueva: Sesion = { id: `ses-${uid()}`, studioId: getCurrentStudioId(), ...fields };
    const res = await dbInsertSesion(nueva);
    if (!res.ok) return res;
    setSesiones(prev => [...prev, nueva]);
    // Autoservicio de instructora (20260731100000): si quien crea es ella
    // misma, la propietaria no lo sabe todavía — avisarla (best-effort, no
    // bloquea el alta). No se detecta por rol (evitar el ciclo useRol→
    // useStudio) sino comprobando si la clase es de SU propia ficha.
    const yo = instructores.find(i => i.authUserId === user?.id);
    if (yo && yo.rol === 'INSTRUCTOR' && yo.id === nueva.instructorId) void avisarClaseCreadaPorInstructor(nueva.id);
    return res;
  }

  // Fuente única para "esta sesión ya no va a ocurrir → sus reservas activas
  // dejan de estarlo". La usan `cancelarSerieDesde` y `cancelarSesion` (en
  // calendario/page.tsx); antes solo existía dentro de cancelarSerieDesde y el
  // camino de clase SUELTA —el habitual— no la tenía, así que las reservas se
  // quedaban CONFIRMADA apuntando a una clase cancelada.
  //
  // ⚠️ Llamarla SIEMPRE después de avisar a las socias: los destinatarios se
  // resuelven en servidor filtrando estado='CONFIRMADA'.
  //
  // P-1 (auditoría 21-ago): si `cancelacionClaseDevuelveBono` está activo
  // (política por estudio, default true), a cada socia que tenía plaza
  // CONFIRMADA se le devuelve la sesión — mismo criterio que ya aplicaba
  // `cancelarSesionPorMinimoNoAlcanzado` sin poder desactivarse. Las
  // "confirmadas antes" se capturan del estado local ANTES de cancelar (la
  // respuesta del servidor solo trae qué reservas se cancelaron, no su
  // estado previo ni la socia).
  //
  // ⚠️ Auditoría 21/22-ago: era `void ...then()`, es decir fire-and-forget. Quien
  // llamaba enseñaba «Clase cancelada · clientas avisadas» pasara lo que pasara,
  // así que un fallo del UPDATE reintroducía EXACTAMENTE las reservas fantasma
  // que este mismo código fue a arreglar, y en silencio. Ahora devuelve el
  // resultado para que el toast pueda decir la verdad — en los DOS llamantes
  // (clase suelta y serie); el reporte a Sentry se conserva tal cual.
  async function cancelarReservasDeSesiones(ids: string[], op: string): Promise<ResultadoEscritura> {
    if (ids.length === 0) return { ok: true };
    const sesionIdsSet = new Set(ids);
    const confirmadasAntes = reservas.filter(r => sesionIdsSet.has(r.sesionId) && r.estado === 'CONFIRMADA');
    try {
      const res = await dbCancelarReservasPorSesiones(ids);
      // `dbCancelarReservasPorSesiones` devuelve `{ error }` a secas (sin `ok`),
      // no un ResultadoEscritura: se normaliza aquí en vez de propagarlo tal
      // cual, que era lo que dejaba el error sin forma para quien llama.
      if (!('ok' in res)) {
        console.error(`[${op}:dbCancelarReservasPorSesiones]`, res.error);
        return { ok: false, error: 'La clase se ha cancelado, pero no hemos podido cancelar sus reservas. Recarga la página.' };
      }
      const idsSet = new Set(res.ids);
      if (idsSet.size > 0) {
        setReservas(prev => prev.map(r => idsSet.has(r.id) ? { ...r, estado: 'CANCELADA' as const, posicionEspera: null } : r));
        if (studio?.cancelacionClaseDevuelveBono ?? true) {
          confirmadasAntes
            .filter(r => idsSet.has(r.id))
            .forEach(r => void devolverSesionBono(r.socioId, r.sesionId));
        }
      }
      return { ok: true };
    } catch (e) {
      console.error(`[${op}:dbCancelarReservasPorSesiones]`, e);
      capturarExcepcion(e instanceof Error ? e : new Error(String(e)), { tags: { area: 'calendario', op } });
      return { ok: false, error: 'La clase se ha cancelado, pero no hemos podido cancelar sus reservas. Recarga la página.' };
    }
  }

  async function updateSesion(id: string, changes: Partial<Sesion>): Promise<ResultadoEscritura> {
    const anterior = sesiones.find(s => s.id === id);
    setSesiones(prev => prev.map(s => s.id === id ? { ...s, ...changes } : s));
    const res = await dbUpdateSesion(id, changes);
    // Escribe-primero: si la BD rechaza (p.ej. solape de sala/instructora al mover
    // la clase), deshace el cambio optimista para no mostrar en el panel un
    // movimiento que no ocurrió. Quien llama enseña el motivo (res.error).
    if (!res.ok && anterior) setSesiones(prev => prev.map(s => s.id === id ? anterior : s));
    // OJO: aquí NO se cancelan las reservas de una sesión que pasa a
    // `cancelada: true`, aunque sea tentador por ser el punto único de paso.
    // `avisarClaseCancelada` resuelve sus destinatarios en el servidor con
    // estado = 'CONFIRMADA'; si las reservas se cancelan antes de que ese
    // aviso resuelva, el push/in-app se manda a NADIE. Quien cancela debe
    // llamar a `cancelarReservasDeSesiones` DESPUÉS de avisar — igual que
    // `deleteSesion` espera al aviso antes de borrar, y por el mismo motivo.
    return res;
  }

  async function deleteSesion(id: string): Promise<ResultadoEscritura> {
    // Borrar la sesión CASCADE-borra sus reservas en BD (FK on delete cascade) —
    // antes eso pasaba en silencio: ni email ni aviso in-app a las socias con
    // plaza, a diferencia de "Cancelar" (que sí avisa). Se manda el email Y el
    // aviso in-app/push (Notification Engine, igual que cancelarSerieDesde), y
    // se ESPERA el aviso antes de borrar: avisarClaseCancelada consulta la
    // sesión en servidor por id, y si el DELETE le gana la carrera ya no
    // encontraría nada que notificar.
    const sesion = sesiones.find(s => s.id === id);
    if (sesion) notificarCancelacionSesiones([sesion]);
    await avisarClaseCancelada(id);
    // Auditoría de producto (P0-1): "Eliminar" no devolvía el bono consumido
    // aunque "Cancelar" sí — dos botones casi idénticos con consecuencia de
    // dinero opuesta. Para la alumna, perder su plaza es lo mismo con
    // cualquiera de los dos botones; captura ANTES del DELETE (el cascade se
    // lleva las reservas, no queda nada que consultar después).
    const confirmadas = reservas.filter(r => r.sesionId === id && r.estado === 'CONFIRMADA');
    // El DELETE en sí también se espera ahora — antes era fire-and-forget: el
    // calendario ya la quitaba de pantalla aunque el borrado real en BD
    // hubiera fallado, así que recargar la traía de vuelta.
    const res = await dbDeleteSesion(id);
    if (!res.ok) return res;
    setSesiones(prev => prev.filter(s => s.id !== id));
    setReservas(prev => prev.filter(r => r.sesionId !== id));
    if ((studio?.cancelacionClaseDevuelveBono ?? true) && confirmadas.length > 0) {
      confirmadas.forEach(r => void devolverSesionBono(r.socioId, r.sesionId));
    }
    return res;
  }

  // ── Series de clases recurrentes (I-3) ───────────────────────────────────────

  // Crea una serie: todas las sesiones comparten un serie_id y se insertan en UNA
  // sola llamada (batch), en vez de N inserts secuenciales sin rollback.
  async function addSesionesSerie(fields: Omit<Sesion, 'id' | 'studioId' | 'serieId'>[]): Promise<ResultadoEscritura> {
    if (fields.length === 0) return { ok: true };
    const serieId = `serie-${uid()}`;
    const studioId = getCurrentStudioId();
    const nuevas: Sesion[] = fields.map(f => ({ id: `ses-${uid()}`, studioId, serieId, ...f }));
    const res = await dbInsertSesionesBatch(nuevas);
    if (!res.ok) return res;
    setSesiones(prev => [...prev, ...nuevas]);
    return res;
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
  async function editarSerieDesde(
    sesionId: string,
    changes: { tipoClaseId: string; salaId: string; instructorId: string; aforoMaximo: number; notas: string | null; horaInicio: string; horaFin: string },
  ): Promise<ResultadoEscritura & { count?: number }> {
    const objetivo = sesionesDeSerieDesde(sesionId);
    if (objetivo.length === 0) return { ok: true };
    const uniformes = {
      tipoClaseId: changes.tipoClaseId, salaId: changes.salaId,
      instructorId: changes.instructorId, aforoMaximo: changes.aforoMaximo, notas: changes.notas,
    };
    // Pintado optimista: reconstruye inicio/fin de cada sesión con su misma FECHA
    // local (Madrid) y la hora nueva. Mismo cálculo que la RPC (0114), por eso lo
    // que se ve coincide con lo que se guarda.
    const conHora = objetivo.map(s => ({ id: s.id, ...horarioConNuevaHora(s.inicio, changes.horaInicio, changes.horaFin) }));
    const ids = new Set(objetivo.map(s => s.id));
    setSesiones(prev => prev.map(s => {
      if (!ids.has(s.id)) return s;
      const h = conHora.find(c => c.id === s.id)!;
      return { ...s, ...uniformes, inicio: h.inicio, fin: h.fin };
    }));
    // UNA sola escritura, transaccional (RPC): reconstruye la hora por sesión y
    // aplica campos + hora TODO-O-NADA. Si CUALQUIER sesión solapa (p. ej. el hueco
    // ocupado solo los lunes), la BD hace rollback completo y devuelve un único
    // motivo — nunca queda media serie movida. Aquí se deshace además el bloque
    // optimista en pantalla. (Antes: lote + N updates NO atómicos; el fallo parcial
    // dejaba BD y panel divergentes hasta recargar. Follow-up de #415.)
    const res = await dbUpdateSerieDesde(getCurrentStudioId(), sesionId, changes);
    if (!res.ok) {
      const antes = new Map(objetivo.map(s => [s.id, s]));
      setSesiones(prev => prev.map(s => antes.get(s.id) ?? s));
      return res;
    }
    return { ok: true, count: res.count };
  }

  // Cancela "esta y las siguientes" de una serie (p. ej. "cancelar la serie del
  // verano") y avisa por email a las socias con plaza en cada sesión afectada.
  async function cancelarSerieDesde(sesionId: string): Promise<ResultadoEscritura> {
    const objetivo = sesionesDeSerieDesde(sesionId).filter(s => !s.cancelada);
    if (objetivo.length === 0) return { ok: true };
    const ids = objetivo.map(s => s.id);
    const idSet = new Set(ids);
    setSesiones(prev => prev.map(s => idSet.has(s.id) ? { ...s, cancelada: true } : s));
    // Escribe-primero: la cancelación es UN batch atómico. Si la BD lo rechaza, se
    // deshace y NO se avisa de una cancelación que no ha ocurrido.
    const res = await dbUpdateSesionesBatch(ids, { cancelada: true });
    if (!res.ok) {
      setSesiones(prev => prev.map(s => idSet.has(s.id) ? { ...s, cancelada: false } : s));
      return res;
    }
    // Aviso a las socias con plaza en cualquiera de las sesiones canceladas.
    notificarCancelacionSesiones(objetivo);
    // Notification Engine: además del email, in-app/push por cada sesión cancelada
    // (igual que cancelar una clase suelta, que sí lo hacía). Sin esto, cancelar
    // "esta y las siguientes" de una serie solo mandaba email y las socias no
    // recibían ningún aviso in-app/push.
    // Se ESPERA a que los avisos resuelvan sus destinatarios antes de cancelar
    // las reservas: `avisarClaseCancelada` los busca en servidor por
    // estado = 'CONFIRMADA', así que cancelarlas antes deja el aviso sin
    // nadie a quien mandarlo (mismo motivo por el que `deleteSesion` espera).
    await Promise.all(ids.map(id => avisarClaseCancelada(id)));
    // Las reservas de esas sesiones quedaban en CONFIRMADA/LISTA_ESPERA
    // apuntando a una sesión ya cancelada — la socia veía en su portal una
    // plaza "confirmada" para una clase que nunca va a pasar. Se marcan
    // CANCELADA, y `cancelarReservasDeSesiones` devuelve el bono a cada
    // socia confirmada si `studio.cancelacionClaseDevuelveBono` lo permite
    // (P-1, política por estudio — cancelar una serie entera es siempre
    // decisión del estudio, no de la socia).
    // Auditoría 22-ago: se ESPERA y se propaga. Antes era una llamada suelta y
    // `cancelarSerieDesde` devolvía `{ok:true}` aunque las reservas se quedaran
    // CONFIRMADA — el mismo `{ok:true}` mentiroso que ya se cerró en el camino
    // de la clase suelta (calendario/page.tsx:1265).
    return await cancelarReservasDeSesiones(ids, 'cancelarSerieDesde');
  }

  // Email de cancelación a cada socia con plaza (confirmada/asistida) en las
  // sesiones dadas. Mismo criterio que la cancelación de una clase suelta.
  function notificarCancelacionSesiones(sesionesCanceladas: Sesion[]) {
    sesionesCanceladas.forEach(ses => {
      const tipo = tiposClase.find(t => t.id === ses.tipoClaseId);
      const sala = salas.find(x => x.id === ses.salaId);
      const instructor = instructores.find(i => i.id === ses.instructorId);
      const inicio = new Date(ses.inicio);
      const fecha = fechaLargaEstudio(inicio);
      const hora = horaEstudio(inicio);
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
  // `sesionId` no es opcional por comodidad: sin él, con un "Bono Reformer" y un
  // "Bono Mat" vivos a la vez, bonoConsumible ordena por caducidad y descuenta
  // del que caduque antes — aunque sea el que NO cubre esta clase. La puerta de
  // entrada (calendario) sí comprobaba la cobertura; el descuento no, así que la
  // clase cara se servía contra el bono barato y la restricción de la migr 0111
  // se evaporaba justo en el momento de gastar.
  async function consumirSesionBono(socioId: string, sesionId: string) {
    const tipoClaseId = sesiones.find(s => s.id === sesionId)?.tipoClaseId ?? null;
    // bono-logic resuelve el bono consumible (qué suscripción descontar).
    const consumible = bonoConsumible(socioId, suscripciones, planesTarifa, undefined, tipoClaseId);
    if (!consumible) return;
    const { suscripcion: sus, plan } = consumible;

    // C5/R2: el descuento y la decisión de "agotado" salen de la RPC atómica
    // (serializada por lock de fila), NO de calcularConsumoBono() sobre el
    // snapshot local —que puede estar obsoleto y provocar un recibo de renovación
    // perdido o duplicado si dos reservas compiten. Espejo de consumirBonoServidor.
    // La sesión viaja hasta la RPC: allí se vuelve a comprobar que el plan cubra
    // el tipo de clase (migr 0129). `bonoConsumible` ya lo respeta arriba, así
    // que esto no debería rechazar nunca — y por eso mismo es la red: el día que
    // alguien vuelva a olvidarse del tipo, salta en vez de descontar del bono
    // equivocado sin que se entere nadie.
    const res = await dbConsumirSesionBono(sus.id, getCurrentStudioId(), sesionId);
    if (!('ok' in res)) return; // sin sesión que descontar / error → no tocar recibo
    const nuevasRestantes = res.saldo;
    setSuscripciones(prev => prev.map(s =>
      s.id === sus.id ? { ...s, sesionesRestantes: nuevasRestantes } : s
    ));

    // Bono agotado (transición autoritativa a 0) → recibo de renovación + notificación
    //
    // ⚠️ `PUNTUAL` queda fuera: una clase suelta es una compra única y agotar su
    // única sesión es usarla, no terminar un ciclo. Sin este filtro se generaba
    // «Renovación Clase suelta» PENDIENTE y la clienta acababa debiendo algo que
    // nunca pidió. Mismo arreglo, y por el mismo motivo, que en
    // `consumirBonoServidor` (supabase-data-admin.ts) — son dos caminos gemelos
    // para lo mismo y hay que tocar los dos o vuelve por el otro lado.
    if (nuevasRestantes === 0 && generaRenovacionAlAgotarse(plan)) {
      const socio = socios.find(s => s.id === socioId);
      const nombreSocio = socio ? `${socio.nombre} ${socio.apellidos}` : 'Socia';
      const hoy = hoyEnEstudio();
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
      // Se ESPERA y se comprueba: antes se disparaba sin await y su fallo (Sentry
      // dbInsertRecibo 23503, recibos_suscripcion_id_fkey — visto en producción)
      // pasaba inadvertido. La pantalla seguía mostrando un recibo de renovación
      // que nunca llegó a existir en la base de datos, así que el cobro
      // correspondiente jamás se registraba.
      const resRecibo = await dbInsertRecibo(reciboRenovacion);
      const reciboGuardado = resRecibo.ok;
      if (!reciboGuardado) {
        setRecibos(prev => prev.filter(r => r.id !== reciboRenovacion.id));
        capturarMensaje('[consumirSesionBono] no se pudo crear el recibo de renovación', 'error', {
          extra: { socioId, sesionId, suscripcionId: sus.id, error: resRecibo.error },
        });
      }
      // El bono agotado es un hecho real (la RPC ya lo confirmó arriba) sea o
      // no se haya podido guardar el recibo automático: avisar a la dueña
      // SIEMPRE, para que no pierda de vista una renovación pendiente solo
      // porque el recibo automático falló — antes, ese fallo también se comía
      // el aviso entero y nadie se enteraba de que había que renovar.
      toastAviso.show(
        reciboGuardado
          ? `Bono agotado: ${nombreSocio} ha consumido su último bono de ${plan.nombre}. Se ha generado un recibo de renovación.`
          : `Bono agotado: ${nombreSocio} ha consumido su último bono de ${plan.nombre}. No se ha podido generar el recibo de renovación automático — créalo a mano.`,
      );
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
  // Mismo motivo que en consumirSesionBono: hay que devolver la sesión AL BONO
  // QUE LA PAGÓ. Sin el tipo de clase se le devolvía al que caducara antes, que
  // con dos bonos vivos regala saldo en uno y lo deja perdido en el otro.
  // P2 (auditoría de producto): devuelve `false` si de verdad hacía falta
  // devolver una sesión y no se pudo — antes era `void` en las tres llamadas
  // y un fallo aquí solo llegaba a Sentry, nadie del estudio se enteraba de
  // que una socia se quedó sin su sesión de bono. `true` cubre también "no
  // había nada que devolver" (sin bono devolvible, o ya al tope): no es un
  // fallo, así que no debe avisar como si lo fuera.
  async function devolverSesionBono(socioId: string, sesionId?: string | null): Promise<boolean> {
    const tipoClaseId = sesionId ? sesiones.find(s => s.id === sesionId)?.tipoClaseId ?? null : null;
    // I-5: `bonoDevolvible`, no `bonoConsumible`. Para devolver hace falta HUECO,
    // no saldo: usando el de consumir, cancelar la clase que gastó la ÚLTIMA
    // sesión no devolvía nada, porque un bono a 0 ya no es "consumible".
    const devolvible = bonoDevolvible(socioId, suscripciones, planesTarifa, undefined, tipoClaseId);
    if (!devolvible) return true;
    const { suscripcion: sus } = devolvible;

    // I-10: incremento ATÓMICO en la BD con el tope dentro del WHERE, en vez de
    // calcular `min(tope, restantes+1)` aquí sobre un estado que puede estar
    // desfasado y escribirlo. Dos cancelaciones a la vez perdían una devolución.
    // Se sigue esperando y comprobando (antes era fire-and-forget): la
    // cancelación de la reserva ya se confirmó en servidor, así que un fallo
    // aquí no debe deshacer nada — pero sí hay que enterarse, o la socia pierde
    // una sesión de bono sin que quede rastro.
    const res = await dbDevolverSesionBono(sus.id, getCurrentStudioId());
    if ('error' in res) {
      capturarMensaje('[devolverSesionBono] no se pudo devolver la sesión al bono', 'error', {
        extra: { socioId, sesionId, suscripcionId: sus.id, error: res.error },
      });
      return false;
    }
    // `saldo` null = no había hueco (bono ya al tope): no es un fallo, pero
    // tampoco hay nada que reflejar en pantalla.
    if (res.saldo == null) return true;
    const saldo = res.saldo;
    setSuscripciones(prev => prev.map(s =>
      s.id === sus.id ? { ...s, sesionesRestantes: saldo } : s
    ));
    return true;
  }

  async function addReserva(sesionId: string, socioId: string, spotId?: string | null, opciones?: { checkInInmediato?: boolean }): Promise<ResultadoReserva> {
    const esPrimeraReserva = !reservas.some(r => r.socioId === socioId);
    const sesion = sesiones.find(s => s.id === sesionId);
    // Decisión de aforo/lista de espera: lógica pura y testeada (booking-logic).
    const { estado, posicionEspera } = decidirReservaNueva(sesion?.aforoMaximo, sesionId, reservas);

    const cpub = ctxPublico();
    if (cpub) {
      // La creación real (con bono/gate de derechos/aforo) la hace el servidor.
      // Aquí se ESPERA su respuesta: este endpoint rechaza legítimamente en seis
      // sitios (sin bono, bono que no cubre el tipo, clase empezada, cancelada,
      // tope de simultáneas, límite semanal) y antes ninguno de esos rechazos
      // llegaba a la pantalla — la socia veía «Reservada» y en el panel no había
      // nada. spotId: el sitio elegido (solo se asigna si queda CONFIRMADA).
      const r = await postPublico('/api/public/reserva', { accion: 'crear', studioId: cpub.studioId, sesionId, socioId, email: cpub.email, spotId: spotId ?? null });
      if (!r.ok) return r;
      // El estado lo decide la BD bloqueando la fila de la sesión, no la
      // estimación de arriba: con dos socias peleando por la última plaza, la
      // estimación puede decir CONFIRMADA y la BD LISTA_ESPERA.
      const datos = r.datos as { estado?: EstadoReserva; spotAsignado?: string | null } | null;
      return { ok: true, estado: datos?.estado ?? estado, spotAsignado: datos?.spotAsignado ?? null };
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
      ofertaExpiraEn: null,
      checkInEn: null,
      creadoEn: new Date().toISOString(),
    };
    const reservasActualizadas = [...reservas, nueva];
    setReservas(reservasActualizadas);
    // La inserción real pasa por la función Postgres atómica reservar_plaza
    // (bloquea la fila de la sesión mientras decide) — la estimación de arriba
    // es solo para pintar algo al instante. Se ESPERA la respuesta (antes esto
    // era un `.then()` sin await: la función devolvía `{ ok: true, estado }`
    // con la estimación ANTES de que la RPC respondiera, así que un rechazo
    // real —clase ya empezada, tope semanal, sin bono— nunca llegaba a quien
    // llamaba, y el calendario anunciaba éxito con la reserva inexistente en
    // servidor). Si dos altas concurrentes compiten por la última plaza, o si
    // la RPC rechaza, la decisión de la base de datos manda: se corrige o se
    // retira el estado local y los efectos (bono/créditos/logros) se disparan
    // sobre ese resultado autoritativo, no sobre la estimación.
    const r = await dbReservarPlaza(getCurrentStudioId(), sesionId, socioId, reservaId);
    if (!r || 'error' in r) {
      setReservas(prev => prev.filter(x => x.id !== reservaId));
      return { ok: false, error: r && 'error' in r ? r.error : 'No se pudo guardar la reserva' };
    }
    if (r.estado !== estado) {
      setReservas(prev => prev.map(x => x.id === reservaId
        ? { ...x, estado: r.estado as EstadoReserva, posicionEspera: r.posicionEspera } : x));
    }
    if (r.estado === 'CONFIRMADA') await consumirSesionBono(socioId, sesionId);
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

    // Walk-in (I-alta pilar 6): se le pasa `reservasFinales` como snapshot
    // explícito en vez de dejar que checkin() lea el `reservas` del cierre de
    // este render — esa closure todavía no incluye la reserva recién creada
    // (el `await dbReservarPlaza` de arriba cede el hilo y React puede
    // renderizar de nuevo, pero esta ejecución sigue con las variables que
    // tenía al empezar). Sin el override, el check-in se marcaría en BD pero
    // el paso de créditos/logros no encontraría la reserva y se saltaría en
    // silencio.
    if (opciones?.checkInInmediato && r.estado === 'CONFIRMADA') {
      await checkin(reservaId, reservasFinales);
    }

    return { ok: true, estado: r.estado as EstadoReserva };
  }

  // Favorito por TIPO de clase (catálogo), no por sesión puntual — así una
  // socia lo marca una vez y le sirve para cualquier horario de esa clase.
  // Solo tiene sentido en ruta pública (la socia se identifica por su JWT);
  // fuera de ahí (dashboard) no hace nada.
  async function toggleFavorito(tipoClaseId: string, accion: 'marcar' | 'desmarcar'): Promise<ResultadoEscritura> {
    const cpub = ctxPublico();
    if (!cpub) return { ok: false, error: 'No disponible' };
    // Optimista: se ve al instante, pero `postPublico` re-sincroniza desde el
    // servidor en su `finally` (cargarPublico), así que un rechazo se corrige solo.
    setFavoritos(prev => accion === 'marcar'
      ? (prev.some(f => f.tipoClaseId === tipoClaseId)
          ? prev
          : [...prev, { id: `fav-${uid()}`, studioId: cpub.studioId, socioId: cpub.socioId, tipoClaseId, creadoEn: new Date().toISOString() }])
      : prev.filter(f => f.tipoClaseId !== tipoClaseId));
    return postPublico('/api/public/favoritos', { studioId: cpub.studioId, tipoClaseId, accion });
  }

  // Apuntarse/desapuntarse de un reto del carrusel de Inicio (tema Bloom).
  // Mismo patrón optimista que toggleFavorito, pero actualiza DOS estados:
  // la participación de la socia y el conteo agregado del estudio (+1/-1 al
  // instante; `postPublico` reconcilia ambos desde el servidor en su `finally`).
  async function toggleReto(retoKey: string, accion: 'marcar' | 'desmarcar'): Promise<ResultadoEscritura> {
    const cpub = ctxPublico();
    if (!cpub) return { ok: false, error: 'No disponible' };
    const yaApuntada = retosApuntados.includes(retoKey);
    if (accion === 'marcar' && !yaApuntada) {
      setRetosApuntados(prev => [...prev, retoKey]);
      setRetoConteos(prev => ({ ...prev, [retoKey]: (prev[retoKey] ?? 0) + 1 }));
    } else if (accion === 'desmarcar' && yaApuntada) {
      setRetosApuntados(prev => prev.filter(k => k !== retoKey));
      setRetoConteos(prev => ({ ...prev, [retoKey]: Math.max(0, (prev[retoKey] ?? 0) - 1) }));
    }
    return postPublico('/api/public/retos', { studioId: cpub.studioId, retoKey, accion });
  }

  async function cancelarReserva(reservaId: string): Promise<ResultadoEscritura & { recuperacionCreada?: boolean; recuperacionCaducaEl?: string | null; avisoBono?: string }> {
    const cpub = ctxPublico();
    if (cpub) {
      setReservas(prev => prev.map(r => r.id === reservaId ? { ...r, estado: 'CANCELADA' as const } : r)); // optimista
      const r = await postPublico('/api/public/reserva', { accion: 'cancelar', studioId: cpub.studioId, reservaId, socioId: cpub.socioId, email: cpub.email });
      // Si el servidor la rechaza, `cargarPublico()` (en el finally de
      // postPublico) devuelve la reserva a su sitio: el optimismo dura lo que
      // tarda la respuesta, no para siempre.
      if (!r.ok) return r;
      // `r.datos` es el JSON crudo de cancelarReservaPublica — antes se tiraba
      // aquí mismo (`{ok:true}` a secas), así que a la socia se le concedía un
      // crédito de recuperación de verdad y la pantalla solo decía "cancelada",
      // sin decirle que lo tenía ni cuándo caduca.
      const datos = r.datos as { recuperacionCreada?: boolean; recuperacionCaducaEl?: string | null } | null;
      return { ok: true, recuperacionCreada: datos?.recuperacionCreada, recuperacionCaducaEl: datos?.recuperacionCaducaEl };
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
    // bloqueo de fila). AWAIT, no fire-and-forget: antes esto era
    // `.then(...)` sin `await` ni `.catch`, y la función devolvía `{ok:true}`
    // síncrono sin esperar la respuesta — un fallo de la RPC (red, permiso,
    // constraint) dejaba la reserva CANCELADA en pantalla mientras la BD la
    // mantenía CONFIRMADA, sin revertir el optimista y afirmando éxito al
    // llamante. Mismo patrón que ya se corrigió en addReserva.
    const res = await dbCancelarReservaPlaza(getCurrentStudioId(), reservaId);
    if (!res || 'error' in res) {
      // Revierte el optimista: la BD rechazó la cancelación, así que la
      // reserva sigue en el estado que tenía antes. Igual que addReserva: se
      // devuelve el error al llamante (todas las superficies que llaman a
      // cancelarReserva ya lo muestran con su propio aviso), sin duplicar con
      // el banner global de setDbError.
      if (cancelada) {
        setReservas(prev => prev.map(r => r.id === reservaId ? { ...r, estado: cancelada.estado } : r));
      }
      return { ok: false, error: res && 'error' in res ? res.error : 'No se pudo cancelar la reserva' };
    }
    const { eraConfirmada, promovidaSocioId, devolverBono, ofertaSocioId, ofertaExpiraEn } = res;

    // Devolver bono a quien canceló solo si su reserva ocupaba plaza Y la
    // política de cancelación lo permite. Las DOS cosas las decide ahora la
    // BD (migr 0129): `devolverBono` ya resuelve la ventana del TIPO de clase
    // y cae a la del estudio si no la tiene.
    //
    // Antes esto se recalculaba aquí, y era el sitio donde se colaba el error:
    // el panel usaba siempre la ventana global mientras el portal sí miraba la
    // del tipo, así que la misma cancelación salía tardía o a tiempo según por
    // dónde entrara la socia. Recalcular una regla en cada superficie es cómo
    // se llega a eso; ahora hay una sola respuesta y esto la obedece.
    //
    // Y las plazas fijas quedan fuera: `materializar_plazas_fijas` las inserta
    // CONFIRMADAS sin consumir bono, así que devolver una sesión al cancelarlas
    // crea saldo de la nada (su compensación es la recuperación, no el bono).
    // El camino servidor ya tenía este guard —supabase-data-admin.ts:1860,
    // `const esPlazaFija = params.reservaId.startsWith('res-pf-')`— y a este le
    // faltaba: cancelar la MISMA reserva desde el panel regalaba una sesión que
    // por el portal no se regalaba. Es la misma asimetría panel↔portal que ya
    // causó el bug de la ventana de cancelación; se cierra copiando el guard.
    const esPlazaFija = reservaId.startsWith('res-pf-');
    // P2 (auditoría de producto): antes era `void` — un fallo solo llegaba a
    // Sentry y nadie del estudio se enteraba de que la socia se quedó sin su
    // sesión de bono. Se espera y se convierte en un aviso que el llamante
    // pueda enseñar (la cancelación en sí YA se confirmó en servidor, así que
    // sigue siendo `ok: true` — esto es un aviso, no un fallo de la acción).
    let avisoBono: string | undefined;
    if (eraConfirmada && cancelada && devolverBono && !esPlazaFija) {
      const bonoOk = await devolverSesionBono(cancelada.socioId, sesionId);
      if (!bonoOk) avisoBono = 'Reserva cancelada, pero no hemos podido devolver la sesión al bono. Revísalo a mano.';
    }

    // Fase 2b: el estudio/tipo de clase exige plazo de aceptación — NO se
    // confirma sola. Refleja en el estado local la oferta que la BD acaba de
    // abrir (sigue en LISTA_ESPERA, sin consumir bono todavía; eso pasa al
    // aceptar, desde el portal). El aviso a la socia lo manda el server
    // (emitirOfertaListaEspera, disparado por el camino admin/público) — este
    // camino cliente-directo no pasa por ahí, así que solo se informa al
    // panel de que hay una oferta viva.
    if (ofertaSocioId && sesionId) {
      setReservas(prev => prev.map(r =>
        (r.sesionId === sesionId && r.socioId === ofertaSocioId && r.estado === 'LISTA_ESPERA')
          ? { ...r, ofertaExpiraEn: ofertaExpiraEn ?? null } : r));
      return { ok: true, avisoBono };
    }

    if (!promovidaSocioId || !sesionId) return { ok: true, avisoBono };

    // Refleja en el estado local la promoción REAL decidida por la BD.
    setReservas(prev => prev.map(r =>
      (r.sesionId === sesionId && r.socioId === promovidaSocioId && r.estado === 'LISTA_ESPERA')
        ? { ...r, estado: 'CONFIRMADA' as const, posicionEspera: null } : r));
    // La socia promovida ahora ocupa plaza: se le descuenta la sesión del bono.
    await consumirSesionBono(promovidaSocioId, sesionId);

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
        fecha: fechaLargaEstudio(inicioSesion),
        hora: horaEstudio(inicioSesion),
        sala: sala?.nombre ?? '',
        instructor: instructor?.nombre ?? '',
        bonoConsumido: true,
      });
    }
    toastAviso.show(`Lista de espera promovida: ${nombre} ha pasado de lista de espera a confirmada en ${clase}.`);
    addActividadReciente('NUEVA_RESERVA', `${nombre} promovida de lista de espera → ${clase}`, promovidaSocioId, `/socios/${promovidaSocioId}`);
    return { ok: true, avisoBono };
  }

  // Fase 2b: acepta una oferta de plaza de lista de espera. Solo tiene sentido
  // desde el portal (socia con sesión iniciada, ctxPublico() presente) — el
  // panel de staff nunca acepta en nombre de la socia (decisión de producto).
  async function aceptarOfertaEspera(reservaId: string): Promise<ResultadoEscritura> {
    const cpub = ctxPublico();
    if (!cpub) return { ok: false, error: 'No autorizado' };
    const r = await postPublico('/api/reservas/aceptar-oferta-espera', { studioId: cpub.studioId, reservaId });
    return r.ok ? { ok: true } : r;
  }

  // Gap 4: sin escritura optimista a propósito — `postPublico` ya resincroniza
  // `reservas` desde el servidor en su `finally` (cargarPublico()), así que la
  // estrella pintada en pantalla siempre sale de la respuesta real, nunca de
  // una suposición local.
  async function valorarExperienciaReserva(reservaId: string, valoracion: number): Promise<ResultadoEscritura> {
    const cpub = ctxPublico();
    if (!cpub) return { ok: false, error: 'No autorizado' };
    const r = await postPublico('/api/public/reserva', { accion: 'valorar', studioId: cpub.studioId, reservaId, valoracion });
    return r.ok ? { ok: true } : r;
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

  async function checkin(reservaId: string, snapshotOverride?: Reserva[]): Promise<ResultadoEscritura> {
    // Doble check-in (I-alta pilar 6): la UI ya oculta el botón en cuanto una
    // reserva pasa a ASISTIDA (ListaClientas solo lo pinta sobre CONFIRMADA),
    // pero "marcar todas" (barrido de confirmadasSinCheckin) puede llamar a
    // checkin() dos veces sobre la misma reserva en la misma tanda. El
    // otorgamiento de crédito ya estaba deduplicado (UNIQUE studio+trigger+ref),
    // así que esto era inofensivo en dinero — pero seguía marcando
    // logros/retos/racha una segunda vez sin necesidad. Cortar aquí, no allí.
    const base = snapshotOverride ?? reservas;
    if (base.find(r => r.id === reservaId)?.estado === 'ASISTIDA') return { ok: true };
    if (publicSlug) {
      // Kiosk público: el check-in (ASISTIDA + créditos + premio de referido) lo
      // hace el servidor; se re-sincroniza al terminar.
      const previas = base;
      setReservas(prev => prev.map(r => r.id === reservaId ? { ...r, estado: 'ASISTIDA' as const, checkInEn: new Date().toISOString() } : r)); // optimista
      // Antes esto era fire-and-forget Y devolvía { ok: true } pasara lo que
      // pasara: con el token de kiosko caducado, un 429 o un 500, la pantalla
      // decía "check-in hecho" y en la BD no había nada. Es el mismo patrón que
      // ya se corrigió en addReserva y cancelarReserva; aquí quedó vivo.
      const res = await postPublico('/api/public/checkin', { studioId: studioIdOverride ?? '', reservaId });
      if (!res.ok) {
        setReservas(previas); // revertir: el servidor no lo registró
        return res;
      }
      return { ok: true };
    }
    const checkInEn = new Date().toISOString();
    const reservasActualizadas = base.map(r =>
      r.id === reservaId ? { ...r, estado: 'ASISTIDA' as const, checkInEn } : r
    );
    setReservas(reservasActualizadas);
    // otorgar_credito_disparador (RPC) exige que la reserva YA esté ASISTIDA
    // en la BD antes de conceder el crédito de asistencia — sin este await,
    // la RPC podía llegar antes de que el UPDATE de arriba hubiera hecho
    // commit y rechazaba la concesión con CONDICION_NO_CUMPLIDA, perdiendo en
    // silencio el crédito de una asistencia real.
    const res = await dbUpdateReserva(reservaId, { estado: 'ASISTIDA', checkInEn });
    // Antes esto no comprobaba el resultado: un fallo del UPDATE dejaba la
    // reserva marcada ASISTIDA en pantalla (con créditos/logros ya concedidos
    // sobre una asistencia que el servidor nunca llegó a registrar) sin
    // ninguna forma de detectarlo. Se revierte el optimista y se corta aquí.
    if (!res.ok) {
      setReservas(prev => prev.map(r => r.id === reservaId ? { ...r, estado: 'CONFIRMADA' as const, checkInEn: null } : r));
      return res;
    }
    // Control de acceso: con Kisi conectado, el check-in abre la puerta del
    // estudio. Fire-and-forget — un fallo de la cerradura no debe bloquear el
    // check-in (la recepcionista está delante y puede abrir a mano).
    if (integrationsStore.integraciones.some(i => i.tipo === 'KISI' && i.activo)) {
      authHeader()
        .then(h => fetch('/api/integrations/kisi/abrir', { method: 'POST', headers: h }))
        .catch(() => {});
    }
    const reserva = base.find(r => r.id === reservaId);
    if (!reserva) return res;
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
    return res;
  }

  // Marca manualmente una reserva como NO_ASISTIO (recepción, cuando la socia no
  // se presenta). No devuelve bono: la sesión ya se consumió al reservar. El
  // barrido automático (cron no-shows) hace lo mismo para las que se olvidan.
  // No optimista: el trigger de penalización por no-show (Fase 3) reacciona al
  // `estado` real de la fila en BD, no al de la pantalla — si esto se pintaba
  // antes de que la escritura se confirmara, un fallo silencioso dejaba a la
  // socia SIN marcar en el sitio que de verdad decide si se le cobra.
  async function marcarNoShow(reservaId: string): Promise<ResultadoEscritura> {
    const res = await dbUpdateReserva(reservaId, { estado: 'NO_ASISTIO', checkInEn: null });
    if (!res.ok) return res;
    setReservas(prev => prev.map(r => r.id === reservaId ? { ...r, estado: 'NO_ASISTIO' as const, checkInEn: null } : r));
    return res;
  }

  // Deshacer un NO_ASISTIO (marcado por error) → vuelve a CONFIRMADA. Mismo
  // motivo que marcarNoShow: si esto falla en servidor pero la pantalla ya
  // muestra CONFIRMADA, la propietaria cree haber revertido algo que el
  // trigger de penalización todavía ve como no-show.
  async function revertirNoShow(reservaId: string): Promise<ResultadoEscritura> {
    const res = await dbUpdateReserva(reservaId, { estado: 'CONFIRMADA', checkInEn: null });
    if (!res.ok) return res;
    setReservas(prev => prev.map(r => r.id === reservaId ? { ...r, estado: 'CONFIRMADA' as const, checkInEn: null } : r));
    return res;
  }

  // Deshacer un check-in hecho por error (I-4): revierte la asistencia
  // (ASISTIDA → CONFIRMADA, borra checkInEn) para que recepción corrija un clic
  // en la socia equivocada. NO retira los créditos ya otorgados en el check-in:
  // el dedup UNIQUE(studio_id, trigger, ref_id) evita el doble crédito si se
  // vuelve a hacer check-in de la misma reserva. La reversión del ledger de
  // gamificación (logros/retos/premio de referido) queda fuera de alcance.
  async function deshacerCheckin(reservaId: string): Promise<ResultadoEscritura> {
    const res = await dbUpdateReserva(reservaId, { estado: 'CONFIRMADA', checkInEn: null });
    if (!res.ok) return res;
    setReservas(prev => prev.map(r => r.id === reservaId && r.estado === 'ASISTIDA'
      ? { ...r, estado: 'CONFIRMADA' as const, checkInEn: null } : r));
    return res;
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
      // La escritura vivía DENTRO del updater de setRecibos (los updaters de
      // React deben ser puros, sin efectos) y sin comprobar el resultado — se
      // saca fuera, se espera, y solo si la BD lo acepta se pinta el recibo y
      // se avisa. Si falla, se registra pero no se ancla a nada visible: es
      // background del efecto de carga, no una acción que la propietaria esté
      // esperando ver confirmada en pantalla.
      void (async () => {
        const res = await dbInsertRecibo(reciboVencido);
        if (!res.ok) {
          capturarMensaje('[planes caducados] no se pudo crear el recibo de renovación', 'error', {
            extra: { socioId: sus.socioId, suscripcionId: sus.id, error: res.error },
          });
          return;
        }
        setRecibos(prev => prev.some(r => r.id === reciboVencido.id) ? prev : [reciboVencido, ...prev]);
        toastAviso.show(`Plan mensual caducado: ${nombreSocio} — ${plan.nombre} venció el ${sus.fechaFin}. Se ha generado recibo de renovación.`);
      })();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ⚠️ Auditoría 21-ago: las dos escribían de forma optimista y NO esperaban ni
  // revertían — el mismo patrón que ya se corrigió en addReserva/cancelarReserva
  // y que aquí seguía vivo. Importa porque hay un índice único real que puede
  // rechazar la escritura (`uq_reserva_spot_activo` sobre (sesion_id, spot_id)):
  // dos personas del staff asignando el mismo reformer desde el panel dejaban la
  // pantalla enseñando una asignación que la BD había rechazado, y el descuadre
  // solo se veía al recargar.
  //
  // Además `find` no filtraba por estado y podía enganchar una reserva CANCELADA
  // de la misma socia en la misma clase (el índice único de reserva activa no
  // cubre CANCELADA, así que puede haber varias), escribiendo el spot en la fila
  // equivocada.
  async function liberarSpot(reservaId: string): Promise<ResultadoEscritura> {
    const anterior = reservas.find(r => r.id === reservaId);
    setReservas(prev => prev.map(r =>
      r.id === reservaId ? { ...r, spotId: null } : r
    ));
    const res = await dbUpdateReserva(reservaId, { spotId: null });
    if (!res.ok && anterior) setReservas(prev => prev.map(r => r.id === reservaId ? anterior : r));
    return res;
  }

  async function asignarSpot(sesionId: string, socioId: string, spotId: string): Promise<ResultadoEscritura> {
    // 19ª auditoría · F-7: el filtro era `estado !== 'CANCELADA'`, que deja
    // pasar LISTA_ESPERA y PENDIENTE_APROBACION. El índice único que impide dos
    // socias en el mismo reformer es PARCIAL —`uq_reserva_spot_activo ... where
    // spot_id is not null and estado in ('CONFIRMADA','ASISTIDA')`— así que
    // escribir el spot en una fila en espera pasaba sin conflicto y la UI ni lo
    // pintaba (el mapa solo indexa confirmadas): el sitio seguía "Libre".
    // Al promocionarla después, la fila entra en el predicado del índice, choca
    // con la confirmada que ya ocupa el spot y el 23505 aborta la transacción
    // ENTERA de `cancelar_reserva_plaza`: la socia que cancelaba no podía
    // cancelar y la cola de esa clase quedaba bloqueada. Se asigna sitio solo a
    // quien el índice protege.
    const reserva = reservas.find(r =>
      r.sesionId === sesionId && r.socioId === socioId
      && (r.estado === 'CONFIRMADA' || r.estado === 'ASISTIDA')
    );
    if (!reserva) {
      const enEspera = reservas.some(r =>
        r.sesionId === sesionId && r.socioId === socioId
        && (r.estado === 'LISTA_ESPERA' || r.estado === 'PENDIENTE_APROBACION')
      );
      return {
        ok: false,
        error: enEspera
          ? 'Esa clienta todavía no tiene la plaza confirmada. Confírmala primero y luego asígnale el sitio.'
          : 'No hemos encontrado la reserva de esa clienta en esta clase.',
      };
    }
    const anterior = reserva;
    setReservas(prev => prev.map(r => r.id === reserva.id ? { ...r, spotId } : r));
    const res = await dbUpdateReserva(reserva.id, { spotId });
    if (!res.ok) setReservas(prev => prev.map(r => r.id === reserva.id ? anterior : r));
    return res;
  }

  // ── Recibos ──────────────────────────────────────────────────────────────────

  async function addRecibo(fields: Omit<Recibo, 'id' | 'studioId' | 'estado' | 'fechaCobro' | 'fechaDevolucion' | 'intentosReintento'>): Promise<ResultadoEscritura> {
    const nuevo: Recibo = {
      id: `rec-${uid()}`,
      studioId: getCurrentStudioId(),
      estado: 'PENDIENTE',
      fechaCobro: null,
      fechaDevolucion: null,
      intentosReintento: 0,
      ...fields,
    };
    const res = await dbInsertRecibo(nuevo);
    if (!res.ok) return res;
    setRecibos(prev => [...prev, nuevo]);
    return res;
  }

  // Factura al contado desde el modal "Nueva factura" (cobros/panel-pendientes):
  // a diferencia de addRecibo (PENDIENTE, se cobra más tarde), aquí el cobro es
  // inmediato — no hay fecha de vencimiento en el formulario porque no hay nada
  // que esperar. Se ESCRIBE PRIMERO y se espera confirmación (mismo criterio que
  // marcarCobrado/addSala): antes este botón era un placeholder sin cablear que
  // cerraba el modal sin llamar a ninguna API — "se genera" pero nunca existió
  // ni en BD ni en el estado local.
  async function crearFacturaDirecta(
    fields: { socioId: string; concepto: string; importe: number },
  ): Promise<ResultadoEscritura | { ok: false; error: string; cobroRegistrado: true }> {
    const fechaCobro = new Date().toISOString();
    const rec: Recibo = {
      id: `rec-${uid()}`,
      studioId: getCurrentStudioId(),
      socioId: fields.socioId,
      suscripcionId: null,
      concepto: fields.concepto,
      importe: fields.importe,
      estado: 'COBRADO',
      fechaVencimiento: fechaCobro,
      fechaCobro,
      fechaDevolucion: null,
      intentosReintento: 0,
    };
    const res = await dbInsertRecibo(rec);
    if (!res.ok) return res;
    setRecibos(prev => [...prev, rec]);
    // Mismo patrón que marcarCobrado: construir con el snapshot ya conocido
    // (`rec`, no el `recibos` del closure, que todavía no lo tiene) y sellar
    // fuera del updater. A diferencia de marcarCobrado (que puede correr en un
    // cobro masivo y no debe bloquearse por cada sellado), esta es una acción
    // manual de un solo recibo: SÍ se espera el sellado antes de decir
    // "factura generada" — antes el toast de éxito llegaba en cuanto se
    // guardaba el recibo, y si el sellado fallaba después (NIF inválido, red),
    // la factura desaparecía de la lista sin que el mensaje de éxito ya
    // mostrado se corrigiera.
    const fac = construirFacturaCobro(rec, facturas);
    let resSellado: ResultadoEscritura = { ok: true };
    if (fac) {
      setFacturas(prev => [...prev, fac]);
      resSellado = await sellarFacturaYActualizar(fac);
    }
    const socio = socios.find(s => s.id === fields.socioId);
    addActividadReciente(
      'COBRO_MANUAL',
      `${actorNombre ?? 'Alguien'} generó una factura de "${fields.concepto}" (${fields.importe} €) para ${socio?.nombre ?? 'una socia'}`,
      fields.socioId,
      `/socios/${fields.socioId}`
    );
    // El recibo (dinero) ya está confirmado en este punto — un fallo de aquí
    // en adelante es del sellado fiscal, no del cobro. Se marca con
    // `cobroRegistrado` para que el llamador nunca lo trate como "nada pasó,
    // reintenta": reenviar el mismo formulario duplicaría el cobro.
    return resSellado.ok ? resSellado : { ...resSellado, cobroRegistrado: true };
  }

  // I15: lógica de cobro extraída para que marcarCobrado y cobrarTodosPendientes
  // NO dupliquen el refill de bono / extensión mensual ni el build+sellado de
  // factura (antes copiados en ambas, con riesgo de divergencia — p. ej. el guard
  // `sesionesRestantes === 0`). Ambos helpers operan sobre UN recibo ya cobrado y
  // leen `suscripciones`/`planesTarifa`/`facturas` del snapshot actual, igual que
  // antes, así que el comportamiento es idéntico.

  // Refill del bono agotado o extensión del mensual al cobrar su renovación.
  // Se llama DESPUÉS de que el recibo ya está confirmado como COBRADO — si el
  // refill del bono / extensión del mensual falla aquí, el cobro en sí ya pasó
  // de verdad y no hay nada que deshacer. Fingir que no ha pasado nada sería
  // otra mentira (mismo criterio que asignarPlan, más arriba): se avisa
  // siempre, para que la propietaria no descubra semanas después que cobró
  // una renovación que nunca llegó a recargar el bono.
  async function aplicarRenovacionSuscripcion(recibo: Recibo) {
    if (!recibo.suscripcionId) return;
    const sus = suscripciones.find(s => s.id === recibo.suscripcionId);
    if (!sus) return;
    const plan = planesTarifa.find(p => p.id === sus.planId);
    if (!plan) return;
    const socio = socios.find(s => s.id === sus.socioId);
    const nombreSocio = socio ? `${socio.nombre} ${socio.apellidos}` : 'la socia';
    const avisarFallo = (error: string) => {
      capturarMensaje('[aplicarRenovacionSuscripcion] cobro confirmado pero la suscripción no se pudo renovar', 'error', {
        extra: { socioId: sus.socioId, suscripcionId: sus.id, reciboId: recibo.id, error },
      });
      toastAviso.show(`Cobrado, pero sin renovar: se cobró la renovación de ${nombreSocio} (${plan.nombre}), pero no se ha podido actualizar su bono/plan. Revísalo a mano.`);
    };
    // Se guarda QUÉ entregó este cobro (ver `dbGuardarEntrega` y la migración
    // 20260806160000). Sin esto, si el dinero se devuelve no hay forma de saber
    // qué habría que deshacer. Es best-effort: un fallo aquí no puede tumbar una
    // renovación ya aplicada, solo deja el recibo sin snapshot ("no lo sé").
    const anotarEntrega = (e: Parameters<typeof dbGuardarEntrega>[1]) =>
      void dbGuardarEntrega(recibo.id, e);

    if (plan.tipo === 'BONO' || plan.tipo === 'PUNTUAL') {
      if (sus.sesionesRestantes !== 0) {
        anotarEntrega({
          tipo: 'BONO', aplicada: false,
          sesionesAntes: sus.sesionesRestantes ?? null, sesionesDespues: sus.sesionesRestantes ?? null,
          fechaFinAntes: sus.fechaFin ?? null, fechaFinDespues: sus.fechaFin ?? null,
          estadoAntes: sus.estado ?? null,
        });
        return;
      }
      const res = await dbUpdateSuscripcion(sus.id, { sesionesRestantes: plan.sesiones, estado: 'ACTIVA' });
      if (!res.ok) { avisarFallo(res.error); return; }
      anotarEntrega({
        tipo: 'BONO', aplicada: true,
        sesionesAntes: 0, sesionesDespues: plan.sesiones ?? null,
        // Esta rama no toca fechaFin: antes y después iguales, o la
        // comprobación de interferencia daría un falso positivo.
        fechaFinAntes: sus.fechaFin ?? null, fechaFinDespues: sus.fechaFin ?? null,
        estadoAntes: sus.estado ?? null,
      });
      setSuscripciones(prev => prev.map(s =>
        s.id === sus.id ? { ...s, sesionesRestantes: plan.sesiones, estado: 'ACTIVA' as const } : s
      ));
    } else if (plan.tipo === 'MENSUAL') {
      const nuevaFin = new Date();
      nuevaFin.setMonth(nuevaFin.getMonth() + 1);
      const fechaFin = nuevaFin.toISOString().slice(0, 10);
      // ⚠️ Este guard FALTABA aquí, y sí está en el espejo de servidor
      // (`renovacion-server.ts`). Sin él, cobrar una renovación de una
      // suscripción cuya fecha_fin estaba MÁS LEJOS se la ACORTABA: la socia
      // pagaba y perdía días. Y de paso, sin el guard el snapshot habría
      // registrado como entrega algo que en realidad quitó tiempo.
      if (sus.fechaFin && sus.fechaFin >= fechaFin) {
        anotarEntrega({
          tipo: 'MENSUAL', aplicada: false,
          sesionesAntes: sus.sesionesRestantes ?? null, sesionesDespues: sus.sesionesRestantes ?? null,
          fechaFinAntes: sus.fechaFin, fechaFinDespues: sus.fechaFin,
          estadoAntes: sus.estado ?? null,
        });
        return;
      }
      const res = await dbUpdateSuscripcion(sus.id, { fechaFin, estado: 'ACTIVA' });
      if (!res.ok) { avisarFallo(res.error); return; }
      anotarEntrega({
        tipo: 'MENSUAL', aplicada: true,
        sesionesAntes: sus.sesionesRestantes ?? null, sesionesDespues: sus.sesionesRestantes ?? null,
        fechaFinAntes: sus.fechaFin ?? null, fechaFinDespues: fechaFin,
        estadoAntes: sus.estado ?? null,
      });
      setSuscripciones(prev => prev.map(s =>
        s.id === sus.id ? { ...s, fechaFin, estado: 'ACTIVA' as const } : s
      ));
    }
  }

  // Construye la factura de un recibo cobrado si aún no existe (dedup por
  // reciboId sobre las facturas actuales). Devuelve la factura nueva, o null si
  // ya había una. PURA a propósito — 2.2: antes sellaba (llamada de red) desde
  // dentro del updater de setFacturas; el sellado corre ahora fuera, una sola
  // vez, para que el updater sea puro (ver comentario de sellarFacturaYActualizar).
  function construirFacturaCobro(reciboCobrado: Recibo, facturasActuales: Factura[]): Factura | null {
    if (facturasActuales.some(f => f.reciboId === reciboCobrado.id)) return null;
    return buildFactura(reciboCobrado, facturasActuales);
  }

  async function marcarCobrado(reciboId: string, metodo?: MetodoCobro): Promise<ResultadoEscritura | { ok: false; error: string; cobroRegistrado: true }> {
    // Re-entrada: si este recibo ya se está cobrando (doble clic), no se repite
    // el sellado de factura ni la renovación del bono. Se responde ok para no
    // marcar como fallido el segundo intento del mismo recibo en el cobro masivo.
    if (cobrosEnCursoRef.current.has(reciboId)) return { ok: true };
    cobrosEnCursoRef.current.add(reciboId);
    try {
    const fechaCobro = new Date().toISOString();
    // F2 (B2.6): cobro sin pasarela de primera clase. La dueña marca cómo cobró de
    // verdad (Bizum/efectivo/transferencia…), no solo "cobrado". La suscripción vive
    // por fechas: el cobro manual es tan válido como el de Stripe.
    //
    // Se ESCRIBE PRIMERO y solo después se toca la pantalla (mismo criterio que
    // addSala/updateSala). Antes era al revés y sin await: si la BD rechazaba, el
    // recibo salía como COBRADO, se emitía una factura con número fiscal y se
    // renovaba el bono... con la base de datos intacta. En el cobro masivo eso
    // pasaba con N recibos y la pantalla decía "listo" igualmente.
    //
    // dbMarcarCobrado (no dbUpdateRecibo): auditoría 2026-07-29, M-2. Sin
    // cerrojo alguno, dos pestañas o dispositivos cobrando el MISMO recibo a
    // la vez pasarían las dos con un UPDATE incondicional -- dos facturas
    // fiscales selladas para un único cobro. dbMarcarCobrado exige
    // `estado = 'PENDIENTE'` en el propio UPDATE: solo la primera tiene efecto.
    const res = await dbMarcarCobrado(reciboId, { fechaCobro, ...(metodo ? { metodoCobro: metodo } : {}) });
    if (!res.ok) return res;

    setRecibos(prev => prev.map(r =>
      r.id === reciboId ? { ...r, estado: 'COBRADO' as const, fechaCobro, metodoCobro: metodo ?? r.metodoCobro ?? null } : r
    ));
    // 2.2: construirFacturaCobro es pura; el sellado va fuera del updater.
    //
    // ⚠️ SE ESPERA el sellado (antes `void`, fire-and-forget): el llamador de
    // "Cobrar" (un solo recibo) devolvía éxito en cuanto se marcaba COBRADO, y
    // si el sellado fallaba después (NIF del estudio inválido/vacío, red...) el
    // aviso llegaba por el toast global `dbError`, que se autodescarta a los 6s
    // y no tiene ninguna relación visible con el clic que se acaba de hacer —
    // el recibo pasaba a la pestaña "Cobrado" (correcto, el dinero SÍ se
    // registró) mientras el toast de éxito seguía en pantalla, y a quien no
    // llegó a ver el toast de error le parecía que el pago había desaparecido
    // sin más. Mismo patrón ya usado por `crearFacturaDirecta`: se espera
    // aquí porque es una acción manual de un solo recibo, no el cobro masivo
    // (que sigue en fire-and-forget para no bloquearse recibo a recibo).
    let resSellado: ResultadoEscritura = { ok: true };
    {
      const recibo = recibos.find(r => r.id === reciboId) ??
        { id: reciboId, importe: 0, socioId: '', studioId: getCurrentStudioId(), suscripcionId: null, concepto: '', estado: 'PENDIENTE' as const, fechaVencimiento: new Date().toISOString(), fechaCobro: null, fechaDevolucion: null, intentosReintento: 0 };
      const updatedRecibo = { ...recibo, estado: 'COBRADO' as const, fechaCobro: new Date().toISOString() };
      const fac = construirFacturaCobro(updatedRecibo, facturas);
      if (fac) {
        setFacturas(prev => [...prev, fac]);
        resSellado = await sellarFacturaYActualizar(fac);
      }
    }
    // Refill bono or extend mensual when renewal payment is collected
    const recibo = recibos.find(r => r.id === reciboId);
    if (recibo) await aplicarRenovacionSuscripcion(recibo);
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
    // `cobroRegistrado` distingue el fallo del SELLADO fiscal (el dinero ya se
    // registró como cobrado, solo falta la factura) de un fallo real al
    // escribir el cobro (nada pasó todavía) — mismo criterio que
    // `crearFacturaDirecta`. El llamador nunca debe tratar esto como "vuelve a
    // intentarlo": el cobro ya está hecho, reintentarlo duplicaría la
    // atestación; lo que hay que reintentar es solo el sellado
    // (`reintentarSelladoFactura`, ya expuesto en la pestaña "Cobrado").
    return resSellado.ok ? res : { ...resSellado, cobroRegistrado: true };
    } finally {
      cobrosEnCursoRef.current.delete(reciboId);
    }
  }

  // Si el sellado de `marcarCobrado` falló (NIF inválido, red...), el recibo
  // queda COBRADO sin factura y sin ningún botón para arreglarlo — el único
  // aviso era un toast (`dbError`) que se autodescarta. `construirFacturaCobro`
  // ya dedupea por reciboId, así que reintentar aquí es seguro: si ya existe
  // factura no hace nada.
  async function reintentarSelladoFactura(reciboId: string): Promise<ResultadoEscritura> {
    const recibo = recibos.find(r => r.id === reciboId);
    if (!recibo || recibo.estado !== 'COBRADO') return { ok: false, error: 'Ese recibo no está cobrado.' };
    const fac = construirFacturaCobro(recibo, facturas);
    if (!fac) return { ok: true }; // ya tenía factura
    setFacturas(prev => [...prev, fac]);
    return sellarFacturaYActualizar(fac);
  }

  async function marcarDevuelto(reciboId: string): Promise<ResultadoEscritura> {
    const fechaDev = new Date().toISOString();
    // Mismo criterio que marcarCobrado: un recibo devuelto es dinero que sale de
    // la caja del mes. Si la BD lo rechaza y la pantalla lo da por devuelto, el
    // cierre de caja cuadra contra algo que no está guardado.
    const res = await dbUpdateRecibo(reciboId, { estado: 'DEVUELTO', fechaDevolucion: fechaDev });
    if (!res.ok) return res;
    setRecibos(prev => prev.map(r =>
      r.id === reciboId ? { ...r, estado: 'DEVUELTO' as const, fechaDevolucion: fechaDev } : r
    ));
    return res;
  }

  // La escritura vivía DENTRO del updater de setRecibos (un antipatrón aparte
  // del await que faltaba: los updaters de React deben ser puros, sin efectos).
  // Se saca fuera, se espera y se comprueba antes de tocar pantalla.
  async function reintentar(reciboId: string): Promise<ResultadoEscritura> {
    const recibo = recibos.find(r => r.id === reciboId);
    if (!recibo) return { ok: false, error: 'No se encuentra ese recibo.' };
    const intentosReintento = recibo.intentosReintento + 1;
    const res = await dbUpdateRecibo(reciboId, { estado: 'EN_CURSO', intentosReintento });
    if (!res.ok) return res;
    setRecibos(prev => prev.map(r =>
      r.id === reciboId ? { ...r, estado: 'EN_CURSO' as const, intentosReintento } : r
    ));
    return res;
  }

  async function deleteRecibo(id: string): Promise<ResultadoEscritura> {
    const res = await dbDeleteRecibo(id);
    if (!res.ok) return res;
    setRecibos(prev => prev.filter(r => r.id !== id));
    return res;
  }

  // F2 (B2.10): tras generar el fichero SEPA, los recibos incluidos pasan a
  // EN_CURSO ("Enviado al banco"). Antes no se marcaban: pulsar el botón dos
  // veces metía los mismos recibos PENDIENTE en dos remesas distintas, con
  // riesgo real de doble cargo en la cuenta de la socia si ambas llegaban al
  // banco.
  async function marcarRecibosEnviadosAlBanco(ids: string[]): Promise<ResultadoEscritura> {
    if (ids.length === 0) return { ok: true };
    const idsSet = new Set(ids);
    // Solo si SIGUE pendiente: si otro canal (tarjeta, cobro manual) ya lo
    // cobró entre preparar la remesa y este UPDATE, no se pisa su estado real.
    const res = await dbUpdateRecibosBatch(ids, { estado: 'EN_CURSO' }, 'PENDIENTE');
    if (!res.ok) return res;
    setRecibos(prev => prev.map(r => idsSet.has(r.id) && r.estado === 'PENDIENTE' ? { ...r, estado: 'EN_CURSO' as const } : r));
    return res;
  }

  async function cobrarTodosPendientes(socioId?: string): Promise<ResultadoEscritura> {
    // Con socioId, cobra SOLO los pendientes de esa socia (botón de la ficha de
    // socia). Sin él, cobra todos los del estudio (dashboard / página de Pagos).
    // Antes ignoraba cualquier filtro y desde la ficha cobraba —y sellaba una
    // factura irreversible de— TODO el estudio (hallazgo C-3).
    const pendientes = recibos.filter(r => r.estado === 'PENDIENTE' && (!socioId || r.socioId === socioId));
    const fechaCobro = new Date().toISOString();
    // Un solo UPDATE en lote (antes: un dbUpdateRecibo por recibo — hasta ~120
    // round-trips secuenciales para cobrar 40 recibos pendientes).
    // Se espera el resultado ANTES de dar nada por cobrado: si la BD rechaza, no
    // se emiten facturas ni se renuevan bonos contra un cobro que no existe.
    const res = await dbUpdateRecibosBatch(pendientes.map(r => r.id), { estado: 'COBRADO', fechaCobro });
    if (!res.ok) return res;

    // M-2 (auditoría 2026-07-29): dbUpdateRecibosBatch ahora exige
    // `estado = 'PENDIENTE'` en el propio UPDATE, así que `idsActualizados`
    // solo trae los que ESTA llamada cobró de verdad -- los que otra sesión ya
    // hubiera cobrado en paralelo no vuelven a facturarse aquí.
    const idsCobrados = new Set(res.idsActualizados ?? pendientes.map(r => r.id));
    const cobradosAhora = pendientes.filter(r => idsCobrados.has(r.id));

    setRecibos(prev => prev.map(r =>
      idsCobrados.has(r.id) ? { ...r, estado: 'COBRADO' as const, fechaCobro } : r
    ));
    // 2.2: se construye el lote de facturas puro (el acumulador `current` numera
    // en orden dentro del propio lote), y el sellado —red, uno por factura— va
    // fuera del updater de setFacturas.
    const nuevasFacturas: Factura[] = [];
    {
      let current = facturas;
      for (const recibo of cobradosAhora) {
        const cobrado = { ...recibo, estado: 'COBRADO' as const, fechaCobro };
        const fac = construirFacturaCobro(cobrado, current);
        if (fac) { nuevasFacturas.push(fac); current = [...current, fac]; }
      }
    }
    if (nuevasFacturas.length > 0) {
      setFacturas(prev => [...prev, ...nuevasFacturas]);
      for (const fac of nuevasFacturas) void sellarFacturaYActualizar(fac);
    }
    // Refill de bonos / extensión del mensual de cada recibo cobrado.
    //
    // ⚠️ EN SERIE y con `await`. Sin él, dos recibos MENSUALES de la MISMA
    // suscripción cobrados a la vez leían los dos la misma `fechaFin` y ambos
    // escribían hoy+1mes: la socia pagaba dos meses y recibía uno. Además ahora
    // cada pasada escribe el snapshot de la entrega, y concurrentes se pisarían
    // entre sí dejando un registro que no describe lo que pasó.
    for (const recibo of cobradosAhora) {
      await aplicarRenovacionSuscripcion(recibo);
    }
    return res;
  }

  // ── Citas ────────────────────────────────────────────────────────────────────

  // Una cita es una hora reservada de una instructora y, con `precio`/`pagada`,
  // también dinero. Se guarda ANTES de pintarla: si la escritura falla y aun
  // así aparece en la agenda, el estudio bloquea a la instructora para algo que
  // no existe, o da por cobrado lo que nadie cobró.
  async function addCita(fields: Omit<Cita, 'id' | 'studioId' | 'creadoEn'>): Promise<ResultadoEscritura> {
    const nueva: Cita = {
      id: `cita-${uid()}`,
      studioId: getCurrentStudioId(),
      creadoEn: new Date().toISOString(),
      ...fields,
    };
    const res = await dbInsertCita(nueva);
    if (!res.ok) return res;
    setCitas(prev => [...prev, nueva]);
    return res;
  }

  async function updateCita(id: string, changes: Partial<Cita>): Promise<ResultadoEscritura> {
    const res = await dbUpdateCita(id, changes);
    if (!res.ok) return res;
    setCitas(prev => prev.map(c => c.id === id ? { ...c, ...changes } : c));
    return res;
  }

  async function cancelarCita(citaId: string): Promise<ResultadoEscritura> {
    const cpub = ctxPublico();
    const res = cpub
      ? await postPublico('/api/public/citas', { accion: 'cancelar', studioId: cpub.studioId, citaId })
      : await dbUpdateCita(citaId, { estado: 'CANCELADA' });
    if (!res.ok) return res;
    setCitas(prev => prev.map(c =>
      c.id === citaId ? { ...c, estado: 'CANCELADA' as const } : c
    ));
    return res;
  }

  // Reserva pública de una cita 1:1 (widget /reservar). Devuelve el resultado del
  // servidor para que la UI confirme o muestre el error (hueco ocupado, etc.).
  // La identidad sale del JWT (Bearer) en el endpoint; nunca del body.
  async function reservarCitaPublica(
    args: { servicioId: string; instructorId: string; inicioISO: string },
  ): Promise<{ ok: true; inicio: string; fin: string } | { error: string }> {
    const cpub = ctxPublico();
    if (!cpub) return { error: 'La reserva de citas solo está disponible desde el portal público' };
    try {
      const auth = await portalAuthHeader();
      const res = await fetch('/api/public/citas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          accion: 'crear', studioId: cpub.studioId,
          servicioId: args.servicioId, instructorId: args.instructorId, inicioISO: args.inicioISO,
        }),
      });
      const data = await res.json().catch(() => ({ error: 'Error al reservar la cita' }));
      if (!res.ok) return { error: data.error ?? 'Error al reservar la cita' };
      return data as { ok: true; inicio: string; fin: string };
    } catch {
      return { error: 'Error de conexión. Inténtalo de nuevo.' };
    } finally {
      cargarPublico(); // re-sincroniza (aparece en "mis citas")
    }
  }

  async function completarCita(citaId: string): Promise<ResultadoEscritura> {
    const res = await dbUpdateCita(citaId, { estado: 'COMPLETADA' });
    if (!res.ok) return res;
    setCitas(prev => prev.map(c =>
      c.id === citaId ? { ...c, estado: 'COMPLETADA' as const } : c
    ));
    return res;
  }

  // ── POS ──────────────────────────────────────────────────────────────────────

  async function addProductoPOS(fields: Omit<ProductoPOS, 'id' | 'studioId'>): Promise<ResultadoEscritura> {
    const nuevo: ProductoPOS = { id: `pos-${uid()}`, studioId: getCurrentStudioId(), ...fields };
    const res = await dbInsertProductoPOS(nuevo);
    if (!res.ok) return res;
    setProductosPOS(prev => [...prev, nuevo]);
    return res;
  }

  async function updateProductoPOS(id: string, changes: Partial<ProductoPOS>): Promise<ResultadoEscritura> {
    const res = await dbUpdateProductoPOS(id, changes);
    if (!res.ok) return res;
    setProductosPOS(prev => prev.map(p => p.id === id ? { ...p, ...changes } : p));
    return res;
  }

  async function deleteProductoPOS(id: string): Promise<ResultadoEscritura> {
    const res = await dbDeleteProductoPOS(id);
    if (!res.ok) return res;
    setProductosPOS(prev => prev.filter(p => p.id !== id));
    return res;
  }

  // No optimista, y el orden importa: antes se sellaba la factura fiscal
  // (Veri*Factu/AEAT, irreversible) sin comprobar que la venta y el recibo
  // hubieran llegado a existir de verdad en BD — si cualquiera de los dos
  // inserts fallaba, quedaba un documento fiscal firmado y enviado a la AEAT
  // sin ninguna venta ni recibo real detrás. Ahora se escribe y se comprueba
  // TODO antes de sellar nada.
  async function addVentaPOS(fields: Omit<VentaPOS, 'id' | 'studioId' | 'realizadaEn'>): Promise<ResultadoEscritura> {
    const nueva: VentaPOS = {
      id: `vpos-${uid()}`,
      studioId: getCurrentStudioId(),
      realizadaEn: new Date().toISOString(),
      ...fields,
    };
    const resVenta = await dbInsertVentaPOS(nueva);
    if (!resVenta.ok) return resVenta;
    setVentasPOS(prev => [...prev, nueva]);

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
      const resRecibo = await dbInsertRecibo(nuevoRecibo);
      if (!resRecibo.ok) {
        // La venta ya se guardó (resVenta.ok arriba) — no se deshace, pero
        // tampoco se sella nada fiscal sin recibo real detrás.
        capturarMensaje('[addVentaPOS] venta guardada pero el recibo no se pudo crear', 'error', {
          extra: { ventaId: nueva.id, error: resRecibo.error },
        });
        return resRecibo;
      }
      setRecibos(prev => [nuevoRecibo, ...prev]);
      // 2.2: sellado fuera del updater (ver comentario en sellarFacturaYActualizar).
      // Solo llega aquí si la venta Y el recibo ya existen de verdad en BD.
      const fac = buildFactura(nuevoRecibo, facturas);
      setFacturas(prev => [...prev, fac]);
      void sellarFacturaYActualizar(fac);
    }
    return resVenta;
  }

  // ── Campañas ─────────────────────────────────────────────────────────────────

  async function addCampana(fields: Omit<Campana, 'id' | 'studioId' | 'creadaEn' | 'enviados' | 'abiertos' | 'clics'>): Promise<ResultadoEscritura> {
    const nueva: Campana = {
      id: `camp-${uid()}`,
      studioId: getCurrentStudioId(),
      creadaEn: new Date().toISOString(),
      enviados: 0,
      abiertos: 0,
      clics: 0,
      ...fields,
    };
    const res = await dbInsertCampana(nueva);
    if (!res.ok) return res;
    setCampanas(prev => [nueva, ...prev]);
    return res;
  }

  async function deleteCampana(id: string): Promise<ResultadoEscritura> {
    const res = await dbDeleteCampana(id);
    if (!res.ok) return res;
    setCampanas(prev => prev.filter(c => c.id !== id));
    return res;
  }

  async function duplicateCampana(campana: Campana): Promise<ResultadoEscritura> {
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
    const res = await dbInsertCampana(copy);
    if (!res.ok) return res;
    setCampanas(prev => [copy, ...prev]);
    return res;
  }

  // Actualiza campos de una campaña (usado para el ciclo de vida:
  // pausar/reanudar/finalizar → cambios de `estado`). Persiste en BD con el
  // mismo helper que ya usa el envío.
  async function updateCampana(id: string, patch: Partial<Campana>): Promise<ResultadoEscritura> {
    const res = await dbUpdateCampana(id, getCurrentStudioId(), patch);
    if (!res.ok) return res;
    setCampanas(prev => prev.map(c => (c.id === id ? { ...c, ...patch } : c)));
    return res;
  }

  // Cuántas destinatarias tiene HOY el segmento de una campaña, con el mismo
  // filtro de contacto (email válido / teléfono) que aplica el envío real —
  // usado por la UI para el mensaje inmediato al encolar (lib/marketing/segmentos.ts,
  // compartido con el job de servidor que hace el envío de verdad).
  //
  // Consentimiento: APROXIMADO a propósito (solo presencia, ver
  // tieneConsentimientoMarketingAlgunaVez) — el panel no trae
  // consentimiento_marketing_texto (2,7 KB idénticos por fila, mismo ahorro
  // que aceptacionContrato.versionTexto), así que no puede comparar vigencia
  // exacta. El envío real (lib/inngest/campanas.ts) hace su propio select con
  // el texto y decide de verdad; este número puede ser ligeramente optimista
  // si el texto de consentimiento cambió desde que alguna socia lo dio.
  function contarDestinatariasCampana(campana: Campana): number {
    const base = resolverDestinatariasCampanaCompartido(campana.destinatarios, { socios, suscripciones, recibos })
      .filter(tieneConsentimientoMarketingAlgunaVez);
    return campana.tipo === 'EMAIL'
      ? base.filter(s => s.email && s.email.includes('@')).length
      : base.filter(s => s.telefono && s.telefono.trim()).length;
  }

  // Encola el envío real en servidor (Inngest, lib/inngest/campanas.ts) y
  // marca la campaña ENVIANDO de inmediato — P0-24: el envío ya no se
  // orquesta en el navegador (mapLimit secuencial-acotado), que a escala de
  // cientos de destinatarias tardaba minutos con la pestaña abierta y podía
  // perderse si se cerraba a mitad. El recuento final (`enviados`) lo escribe
  // el job al terminar; esta pestaña no lo espera. Ver
  // docs/marketing-integrations-arquitectura.md §5.
  async function enviarCampana(campana: Campana): Promise<ResultadoEscritura> {
    const res = await encolarEnvioCampana(campana.id);
    if (!res.ok) return res;
    setCampanas(prev => prev.map(c => (c.id === campana.id ? { ...c, estado: 'ENVIANDO' as const } : c)));
    addActividadReciente(
      'MENSAJE_ENVIADO',
      `Campaña "${campana.nombre}" (${campana.tipo}) puesta en cola de envío`,
      undefined,
      '/marketing',
    );
    return res;
  }

  // ── Automatizaciones ─────────────────────────────────────────────────────────

  async function addAutomatizacion(fields: Omit<Automatizacion, 'id' | 'studioId' | 'ejecutadas' | 'creadaEn'>): Promise<ResultadoEscritura> {
    const nueva: Automatizacion = {
      id: `auto-${uid()}`,
      studioId: getCurrentStudioId(),
      ejecutadas: 0,
      creadaEn: new Date().toISOString(),
      ...fields,
    };
    const res = await dbInsertAutomatizacion(nueva);
    if (!res.ok) return res;
    setAutomatizaciones(prev => [nueva, ...prev]);
    return res;
  }

  async function updateAutomatizacion(id: string, patch: Partial<Automatizacion>): Promise<ResultadoEscritura> {
    const res = await dbUpdateAutomatizacion(id, getCurrentStudioId(), patch);
    if (!res.ok) return res;
    setAutomatizaciones(prev => prev.map(a => (a.id === id ? { ...a, ...patch } : a)));
    return res;
  }

  async function deleteAutomatizacion(id: string): Promise<ResultadoEscritura> {
    const res = await dbDeleteAutomatizacion(id);
    if (!res.ok) return res;
    setAutomatizaciones(prev => prev.filter(a => a.id !== id));
    return res;
  }

  async function toggleAutomatizacion(autoId: string): Promise<ResultadoEscritura> {
    const actual = automatizaciones.find(a => a.id === autoId);
    if (!actual) return { ok: true };
    const res = await dbUpdateAutomatizacion(autoId, getCurrentStudioId(), { activa: !actual.activa });
    if (!res.ok) return res;
    setAutomatizaciones(prev => prev.map(a =>
      a.id === autoId ? { ...a, activa: !a.activa } : a
    ));
    return res;
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
    // Gate de plan (espejo del servidor en lib/supabase-data.ts): sin la
    // feature 'gamificacion' del plan, el panel no otorga créditos nuevos desde
    // acciones de staff. El servidor sigue siendo la fuente de verdad — este
    // check es defensa en profundidad para no generar estado local que luego
    // el servidor rechazaría de todos modos.
    if (studio && !tieneFeature(studio, 'gamificacion')) return;
    if (!refId) return;
    const studioId = getCurrentStudioId();
    // Filtro local rápido (regla activa + no otorgado ya según lo que tenemos
    // cargado) — solo para no disparar una llamada de más. La fuente de verdad
    // real es el servidor: dbOtorgarCreditoDisparador recalcula el importe desde
    // la regla del estudio (nunca confía en `regla.creditos` del cliente) y,
    // para ASISTENCIA_CLASE/REFERIDO_AMIGO, exige que la condición exista de
    // verdad en la BD (una reserva ASISTIDA real) antes de conceder nada. Sin
    // esto, cualquier staff autenticado podía otorgarse créditos arbitrarios
    // llamando directo a la BD desde la consola del navegador.
    const { otorgar, regla } = decidirOtorgarCreditos(rewardRules, rewardActions, trigger, refId);
    if (!otorgar || !regla) return;

    (async () => {
      const res = await dbOtorgarCreditoDisparador(socioId, studioId, trigger, refId);
      if ('error' in res) return; // condición no cumplida o sin regla activa
      if (!res.otorgado) return; // ya se había concedido antes para este refId
      if (!res.accionId) {
        // Defensivo: la RPC siempre devuelve accion_id cuando otorgado=true; si
        // alguna vez no lo hiciera, no fabricar un id local — insertarlo violaría
        // reward_history_action_id_fkey (bug JAVASCRIPT-NEXTJS-11 de Sentry). El
        // saldo ya se actualizó server-side; solo se pierde el registro de
        // historial de este otorgamiento puntual, no el crédito en sí.
        capturarMensaje('[otorgarCreditos] RPC otorgado=true sin accionId', 'error', { tags: { area: 'gamificacion' } });
        return;
      }

      const now = new Date().toISOString();
      const action: RewardAction = { id: res.accionId, studioId, socioId, trigger, refId, creadoEn: now };
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
          ? { ...existente, saldo: res.saldo, totalGanado: existente.totalGanado + regla.creditos, actualizadoEn: now }
          : { socioId, studioId, saldo: res.saldo, totalGanado: regla.creditos, totalCanjeado: 0, actualizadoEn: now };
        return existente ? prev.map(m => m.socioId === socioId ? actualizado : m) : [...prev, actualizado];
      });
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

  async function addRewardRule(fields: Omit<RewardRule, 'id' | 'studioId' | 'creadoEn' | 'topeMensual'> & { topeMensual?: number | null }): Promise<ResultadoEscritura> {
    const nueva: RewardRule = { topeMensual: null, ...fields, id: `rwr-${uid()}`, studioId: getCurrentStudioId(), creadoEn: new Date().toISOString() };
    const res = await dbInsertRewardRule(nueva);
    if (!res.ok) return res;
    setRewardRules(prev => [...prev, nueva]);
    return res;
  }

  async function updateRewardRule(id: string, changes: Partial<Omit<RewardRule, 'id' | 'studioId'>>): Promise<ResultadoEscritura> {
    const res = await dbUpdateRewardRule(id, changes);
    if (!res.ok) return res;
    setRewardRules(prev => prev.map(r => r.id === id ? { ...r, ...changes } : r));
    return res;
  }

  async function addRewardCatalogItem(fields: Omit<RewardCatalogItem, 'id' | 'studioId' | 'creadoEn'>): Promise<ResultadoEscritura> {
    const nuevo: RewardCatalogItem = { ...fields, id: `rwc-${uid()}`, studioId: getCurrentStudioId(), creadoEn: new Date().toISOString() };
    const res = await dbInsertRewardCatalogItem(nuevo);
    if (!res.ok) return res;
    setRewardCatalog(prev => [...prev, nuevo]);
    return res;
  }

  async function updateRewardCatalogItem(id: string, changes: Partial<Omit<RewardCatalogItem, 'id' | 'studioId'>>): Promise<ResultadoEscritura> {
    const res = await dbUpdateRewardCatalogItem(id, changes);
    if (!res.ok) return res;
    setRewardCatalog(prev => prev.map(c => c.id === id ? { ...c, ...changes } : c));
    return res;
  }

  async function deleteRewardCatalogItem(id: string): Promise<ResultadoEscritura> {
    const res = await dbDeleteRewardCatalogItem(id);
    if (!res.ok) return res;
    setRewardCatalog(prev => prev.filter(c => c.id !== id));
    return res;
  }

  async function canjearRecompensa(socioId: string, catalogItemId: string): Promise<{ ok: true } | { error: string }> {
    const item = rewardCatalog.find(c => c.id === catalogItemId);
    // Validación pura y testeada (reward-engine): disponibilidad, stock y saldo.
    const validacion = validarCanje(item, saldoCreditos(socioId));
    if ('error' in validacion) return validacion;
    if (!item) return { error: 'Esta recompensa ya no está disponible.' };

    const cpub = ctxPublico();
    if (cpub) {
      // El canje real (descuento + registro) lo hace el servidor. Antes esta
      // llamada era fire-and-forget: devolvía `{ok:true}` sin esperar la
      // respuesta, así que un rechazo real del servidor (recompensa agotada
      // entre tanto, saldo insuficiente por otro canje concurrente) se veía en
      // el portal como "¡Has canjeado tu recompensa!" — la socia creía haberla
      // conseguido y no era cierto. Se espera y se propaga el resultado real.
      const res = await postPublico('/api/public/canje', { studioId: cpub.studioId, socioId: cpub.socioId, email: cpub.email, catalogItemId });
      return res.ok ? { ok: true } : { error: res.error };
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

  async function updateRewardRedemptionEstado(id: string, estado: RewardRedemption['estado']): Promise<ResultadoEscritura> {
    const res = await dbUpdateRewardRedemption(id, { estado });
    if (!res.ok) return res;
    setRewardRedemptions(prev => prev.map(r => r.id === id ? { ...r, estado } : r));
    return res;
  }

  // ── Gamificación: logros ──────────────────────────────────────────────────────
  // El umbral de cada logro SIEMPRE sale de achievementDefinitions — nunca un
  // número fijo aquí. Se reevalúa el progreso de una socia tras cualquier
  // acción que pueda mover una métrica (check-in, nueva reserva...).

  async function addAchievementDefinition(fields: Omit<AchievementDefinition, 'id' | 'studioId' | 'creadoEn'>): Promise<ResultadoEscritura> {
    const nueva: AchievementDefinition = { ...fields, id: `ach-${uid()}`, studioId: getCurrentStudioId(), creadoEn: new Date().toISOString() };
    const res = await dbInsertAchievementDefinition(nueva);
    if (!res.ok) return res;
    setAchievementDefinitions(prev => [...prev, nueva]);
    return res;
  }

  async function updateAchievementDefinition(id: string, changes: Partial<Omit<AchievementDefinition, 'id' | 'studioId'>>): Promise<ResultadoEscritura> {
    const res = await dbUpdateAchievementDefinition(id, changes);
    if (!res.ok) return res;
    setAchievementDefinitions(prev => prev.map(a => a.id === id ? { ...a, ...changes } : a));
    return res;
  }

  function evaluarLogrosSocio(socioId: string, reservasOverride?: Reserva[]) {
    // Gate de plan — ver comentario de otorgarCreditos.
    if (studio && !tieneFeature(studio, 'gamificacion')) return;
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
      // S-1: en rutas públicas (portal) la socia se autentica por OTP y su JWT no
      // lleva claim de studio_id, así que la policy `studio_id = current_studio_id()`
      // rechazaba SIEMPRE estas escrituras — no había dato que las hiciera pasar.
      // La persistencia la hace ahora el servidor (evaluarLogrosServidor, en
      // checkinPublico/crearReservaPublica/cancelarReservaPublica). Aquí se sigue
      // calculando para que la pantalla del portal muestre el progreso al día.
      if (!publicSlug) dbUpsertAchievementProgress(progresoActualizado);

      if (!completadoAhora) return;

      const entry: AchievementHistory = {
        id: `achh-${uid()}`, studioId, socioId, achievementId: def.id, nombre: def.nombre, icono: def.icono, creadoEn: now.toISOString(),
      };
      setAchievementHistory(prev => [entry, ...prev]);
      if (!publicSlug) dbInsertAchievementHistory(entry);

      if (def.creditosRecompensa > 0 && !publicSlug) {
        // El importe se recalcula en servidor desde achievement_definitions (nunca
        // se confía en def.creditosRecompensa del cliente) — ver
        // dbOtorgarCreditoDisparador. En portal la concede el servidor
        // (evaluarLogrosServidor); aquí solo se llama desde el panel.
        void (async () => {
          const res = await dbOtorgarCreditoDisparador(socioId, studioId, 'LOGRO', `${socioId}:${def.id}`, def.id);
          if ('error' in res) return; // sin regla activa
          if (!res.otorgado) return; // ya se había otorgado antes
          const transaccion: CreditTransaction = {
            id: `ctx-${uid()}`, studioId, socioId, tipo: 'GANANCIA', creditos: def.creditosRecompensa,
            descripcion: `Logro desbloqueado: ${def.nombre}`, refId: def.id, creadoEn: now.toISOString(),
          };
          setCreditTransactions(prev => [transaccion, ...prev]);
          setMemberCredits(prev => {
            const existente = prev.find(m => m.socioId === socioId);
            const actualizado: MemberCredits = existente
              ? { ...existente, saldo: res.saldo, totalGanado: existente.totalGanado + def.creditosRecompensa, actualizadoEn: now.toISOString() }
              : { socioId, studioId, saldo: res.saldo, totalGanado: def.creditosRecompensa, totalCanjeado: 0, actualizadoEn: now.toISOString() };
            return existente ? prev.map(m => m.socioId === socioId ? actualizado : m) : [...prev, actualizado];
          });
          dbInsertCreditTransaction(transaccion);
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

  async function addLevelDefinition(fields: Omit<LevelDefinition, 'id' | 'studioId' | 'creadoEn'>): Promise<ResultadoEscritura> {
    const nuevo: LevelDefinition = { ...fields, id: `lvl-${uid()}`, studioId: getCurrentStudioId(), creadoEn: new Date().toISOString() };
    const res = await dbInsertLevelDefinition(nuevo);
    if (!res.ok) return res;
    setLevelDefinitions(prev => [...prev, nuevo]);
    return res;
  }

  async function updateLevelDefinition(id: string, changes: Partial<Omit<LevelDefinition, 'id' | 'studioId'>>): Promise<ResultadoEscritura> {
    const res = await dbUpdateLevelDefinition(id, changes);
    if (!res.ok) return res;
    setLevelDefinitions(prev => prev.map(l => l.id === id ? { ...l, ...changes } : l));
    return res;
  }

  async function deleteLevelDefinition(id: string): Promise<ResultadoEscritura> {
    const res = await dbDeleteLevelDefinition(id);
    if (!res.ok) return res;
    setLevelDefinitions(prev => prev.filter(l => l.id !== id));
    return res;
  }

  // ── Gamificación: retos ────────────────────────────────────────────────────────
  // A diferencia de un logro, un reto tiene fechaInicio/fechaFin — solo cuenta
  // lo ocurrido dentro de esa ventana (ver lib/engines/challenge-engine.ts).

  async function addChallengeDefinition(fields: Omit<ChallengeDefinition, 'id' | 'studioId' | 'creadoEn'>): Promise<ResultadoEscritura> {
    const nuevo: ChallengeDefinition = { ...fields, id: `cha-${uid()}`, studioId: getCurrentStudioId(), creadoEn: new Date().toISOString() };
    const res = await dbInsertChallengeDefinition(nuevo);
    if (!res.ok) return res;
    setChallengeDefinitions(prev => [...prev, nuevo]);
    return res;
  }

  async function updateChallengeDefinition(id: string, changes: Partial<Omit<ChallengeDefinition, 'id' | 'studioId'>>): Promise<ResultadoEscritura> {
    const res = await dbUpdateChallengeDefinition(id, changes);
    if (!res.ok) return res;
    setChallengeDefinitions(prev => prev.map(c => c.id === id ? { ...c, ...changes } : c));
    return res;
  }

  async function deleteChallengeDefinition(id: string): Promise<ResultadoEscritura> {
    const res = await dbDeleteChallengeDefinition(id);
    if (!res.ok) return res;
    setChallengeDefinitions(prev => prev.filter(c => c.id !== id));
    return res;
  }

  function evaluarRetosSocio(socioId: string, reservasOverride?: Reserva[]) {
    // Gate de plan — ver comentario de otorgarCreditos.
    if (studio && !tieneFeature(studio, 'gamificacion')) return;
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
        // Mismo caso que los logros: en portal RLS rechazaba esta escritura sin
        // remedio. La persistencia la hace evaluarRetosServidor; aquí se sigue
        // calculando para que la pantalla muestre el progreso al día.
        if (!publicSlug) dbUpsertChallengeProgress(progresoActualizado);

        if (!completadoAhora) return;

        const entry: ChallengeHistory = {
          id: `chah-${uid()}`, studioId, socioId, challengeId: reto.id, nombre: reto.nombre, icono: reto.icono, creadoEn: now.toISOString(),
        };
        setChallengeHistory(prev => [entry, ...prev]);
        if (!publicSlug) dbInsertChallengeHistory(entry);

        if (reto.creditosRecompensa > 0 && !publicSlug) {
          // El importe se recalcula en servidor desde challenge_definitions (nunca
          // se confía en reto.creditosRecompensa del cliente) — ver
          // dbOtorgarCreditoDisparador. En portal la concede el servidor.
          void (async () => {
            const res = await dbOtorgarCreditoDisparador(socioId, studioId, 'RETO', `${socioId}:${reto.id}`, reto.id);
            if ('error' in res) return; // sin regla activa
          if (!res.otorgado) return; // ya se había otorgado antes
            const transaccion: CreditTransaction = {
              id: `ctx-${uid()}`, studioId, socioId, tipo: 'GANANCIA', creditos: reto.creditosRecompensa,
              descripcion: `Reto completado: ${reto.nombre}`, refId: reto.id, creadoEn: now.toISOString(),
            };
            setCreditTransactions(prev => [transaccion, ...prev]);
            setMemberCredits(prev => {
              const existente = prev.find(m => m.socioId === socioId);
              const actualizado: MemberCredits = existente
                ? { ...existente, saldo: res.saldo, totalGanado: existente.totalGanado + reto.creditosRecompensa, actualizadoEn: now.toISOString() }
                : { socioId, studioId, saldo: res.saldo, totalGanado: reto.creditosRecompensa, totalCanjeado: 0, actualizadoEn: now.toISOString() };
              return existente ? prev.map(m => m.socioId === socioId ? actualizado : m) : [...prev, actualizado];
            });
            dbInsertCreditTransaction(transaccion);
          })();
        }
      });
  }

  // ── Dashboard: gráficos personalizados ──────────────────────────────────────────

  // Gráficos del dashboard: extraídos a useDashboardChartsStore (Fase B).

  // ── Videos on demand ──────────────────────────────────────────────────────────

  // Vídeos on-demand y Comunidad: extraídos a useContentStore (Fase B).
  // Se exponen en el value vía `content` (ver más abajo).

  // ── Integraciones ─────────────────────────────────────────────────────────────

  // Integraciones: extraídas a useIntegrationsStore (Fase B).

  // ── Motor de automatización avanzado ─────────────────────────────────────────

  async function toggleAutomationRule(id: string): Promise<ResultadoEscritura> {
    const rule = automationRules.find(r => r.id === id);
    if (!rule) return { ok: false, error: 'No se encuentra esa regla.' };
    const res = await dbUpdateAutomationRule(id, getCurrentStudioId(), { activa: !rule.activa });
    if (!res.ok) return res;
    setAutomationRules(prev => prev.map(r =>
      r.id === id ? { ...r, activa: !r.activa } : r
    ));
    addActividadReciente('AUTOMATIZACION_CAMBIO', `${actorNombre ?? 'Alguien'} ${rule.activa ? 'desactivó' : 'activó'} la automatización "${rule.nombre}"`);
    return res;
  }

  async function addAutomationRule(fields: Omit<AutomationRule, 'id' | 'studioId' | 'ejecutadaVeces' | 'ultimaEjecucion' | 'creadaEn'>): Promise<ResultadoEscritura> {
    const nueva: AutomationRule = {
      ...fields,
      id: `rule-${uid()}`,
      studioId: getCurrentStudioId(),
      ejecutadaVeces: 0,
      ultimaEjecucion: null,
      creadaEn: new Date().toISOString(),
    };
    const res = await dbInsertAutomationRule(nueva);
    if (!res.ok) return res;
    setAutomationRules(prev => [...prev, nueva]);
    return res;
  }

  function addAutomationLog(log: Omit<AutomationLog, 'id' | 'studioId'>) {
    const nuevo: AutomationLog = {
      id: `log-${uid()}`,
      studioId: getCurrentStudioId(),
      ...log,
    };
    setAutomationLogs(prev => [nuevo, ...prev]);
    dbInsertAutomationLog(nuevo);
    // S-2: el contador de ejecuciones solo aplica a los logs que vienen de una
    // automation_rule. Un log de marketing lleva `ruleId` nulo (su id va en
    // `automatizacionId`); antes ese id se colaba aquí y se intentaba actualizar
    // una regla inexistente.
    const ruleId = log.ruleId;
    if (ruleId) {
      setAutomationRules(prev => prev.map(r =>
        r.id === ruleId
          ? { ...r, ejecutadaVeces: r.ejecutadaVeces + 1, ultimaEjecucion: log.ejecutadoEn }
          : r
      ));
      dbUpdateAutomationRule(ruleId, getCurrentStudioId(), { ejecutadaVeces: (automationRules.find(r => r.id === ruleId)?.ejecutadaVeces ?? 0) + 1, ultimaEjecucion: log.ejecutadoEn });
    }
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

  // El borrador del editor pisa a lo publicado, y entero: `temaJs` es un objeto
  // completo, así que no puede quedar la cabecera del borrador con los retos de
  // lo publicado. Fuera del preview es `null` y esto es exactamente lo de antes.
  const tabBarStyleEfectivo = temaJsPreview?.tabBarStyle ?? tabBarStyle;
  const barraClasicaEfectiva = temaJsPreview?.barraClasica ?? barraClasica;
  const barraFlotanteEfectiva = temaJsPreview?.barraFlotante ?? barraFlotante;
  const variantesEfectivas = temaJsPreview?.variantes ?? variantes;
  // ⚠️ RETIRADO (decisión del fundador, 2026-08-27): `TemaJs.temaKit` decidía
  // qué portal se pintaba ENTERO (de siempre, o el kit) — se borró junto con
  // el kit de temas en el PR 2 de "borrar temas del kit"
  // (`lib/theme-preview-puente.ts`). `themeIdPublicado` ya no cambia según
  // haya o no preview activo: nada lo consume salvo lo publicado de verdad.

  const value: StudioContextValue = useMemo(() => ({
    planesTarifa,
    salas,
    tiposClase,
    contenidoPortal,
    bannersPortal,
    portalHome,
    homeBloques,
    bloquesClases,
    bloquesBonos,
    bloquesReservar,
    tabBarStyle: tabBarStyleEfectivo,
    barraClasica: barraClasicaEfectiva,
    barraFlotante: barraFlotanteEfectiva,
    variantes: variantesEfectivas,
    navPortal,
    themeIdPublicado,
    redesSociales,
    textosReservar,
    aparienciaWidget,
    ordenReservar,
    favoritos,
    toggleFavorito,
    retosApuntados,
    retoConteos,
    valoracionEstudio,
    toggleReto,
    updateMensajeDestacado,
    addBannerPortal,
    updateBannerPortal,
    deleteBannerPortal,
    novedadesEstudio,
    addNovedadEstudio,
    updateNovedadEstudio,
    deleteNovedadEstudio,
    instructores,
    spots,
    bloqueosMaquina,
    plazasFijas,
    recuperaciones,
    socioExcepciones,
    ponerExcepcion,
    quitarExcepcion,
    mandatosSepa,
    ponerMandato,
    quitarMandato,
    addPlan,
    updatePlan,
    deletePlan,
    addSala,
    updateSala,
    deleteSala,
    marcarAveria,
    quitarAveria,
    asignarPlazaFija,
    quitarPlazaFija,
    crearPlazaFijaPropia,
    pausarPlazaFijaPropia,
    reanudarPlazaFijaPropia,
    darDeBajaPlazaFijaPropia,
    darRecuperacion,
    anularRecuperacion,
    addTipoClase,
    updateTipoClase,
    deleteTipoClase,
    camposPersonalizados,
    addCampoPersonalizado,
    updateCampoPersonalizado,
    deleteCampoPersonalizado,
    segmentosClientes,
    addSegmentoCliente,
    updateSegmentoCliente,
    deleteSegmentoCliente,
    plantillasEmail,
    upsertPlantillaEmail,
    dependencySnapshots,
    recalcularDependencia,
    addInstructor,
    updateInstructor,
    deleteInstructor,
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
    reactivarSuscripcion,
    addNota,
    deleteNota,
    condicionesSalud,
    addCondicion,
    updateCondicion,
    deleteCondicion,
    respuestasSesion,
    registrarRespuestaSesion,
    plantillasCuestionarioSalud,
    addPlantillaCuestionarioSalud,
    updatePlantillaCuestionarioSalud,
    deletePlantillaCuestionarioSalud,
    respuestasCuestionarioSalud,
    guardarRespuestaCuestionarioSalud,
    addSesion,
    updateSesion,
    deleteSesion,
    addSesionesSerie,
    editarSerieDesde,
    cancelarSerieDesde,
    cancelarReservasDeSesiones,
    addReserva,
    cancelarReserva,
    aceptarOfertaEspera,
    valorarExperienciaReserva,
    bajaConRecuperacion,
    checkin,
    deshacerCheckin,
    marcarNoShow,
    revertirNoShow,
    liberarSpot,
    asignarSpot,
    addRecibo,
    crearFacturaDirecta,
    marcarCobrado,
    marcarDevuelto,
    reintentar,
    reintentarSelladoFactura,
    deleteRecibo,
    cobrarTodosPendientes,
    marcarRecibosEnviadosAlBanco,
    citas,
    addCita,
    updateCita,
    cancelarCita,
    completarCita,
    citasServicios,
    addServicioCita,
    updateServicioCita,
    deleteServicioCita,
    citasDisponibilidad,
    setDisponibilidadCitas,
    reservarCitaPublica,
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
    contarDestinatariasCampana,
    automatizaciones,
    addAutomatizacion,
    updateAutomatizacion,
    deleteAutomatizacion,
    toggleAutomatizacion,
    codigosDescuento,
    addCodigoDescuento: discountCodes.addCodigoDescuento,
    toggleCodigoDescuento: discountCodes.toggleCodigoDescuento,
    deleteCodigoDescuento: discountCodes.deleteCodigoDescuento,
    registrarUsoCodigo: discountCodes.registrarUsoCodigo,
    actividadReciente,
    addActividadReciente,
    videosOnDemand,
    addVideo: content.addVideo,
    toggleVideo: content.toggleVideo,
    postsComunidad,
    likedPostIds,
    addPost: content.addPost,
    toggleLikePost: content.toggleLikePost,
    updatePost: content.updatePost,
    deletePost: content.deletePost,
    integraciones,
    upsertIntegracion: integrationsStore.upsertIntegracion,
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
    errorPublico,
    planMasElegidoId,
    sustitucionesConfirmadas,
    recargarPublico: cargarPublico,
    refrescarAforo,
    studio,
    updateAvatarAdmin,
    updateStudio,
    updateHorarioEstudio,
  // deps deliberately cover only state read by `value`'s ~80 inline functions
  // (verified: every closed-over identifier is listed below); the functions
  // themselves are intentionally excluded since they're recreated every render
  // anyway.
  //
  // El disable va en la línea de justo antes del array, no encima del comentario:
  // la regla señala esta línea, y las dos versiones anteriores (una arriba del
  // todo y otra pegada al `]`) no tapaban nada y llevaban avisando sin que se
  // notara.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [
    planesTarifa, salas, tiposClase, contenidoPortal, bannersPortal, novedadesEstudio, portalHome, homeBloques, bloquesClases, bloquesBonos, bloquesReservar, tabBarStyleEfectivo, barraClasicaEfectiva, barraFlotanteEfectiva, variantesEfectivas, navPortal, themeIdPublicado, redesSociales, favoritos, retosApuntados, retoConteos, valoracionEstudio, instructores, spots,
    bloqueosMaquina, plazasFijas, recuperaciones, socioExcepciones, mandatosSepa,
    camposPersonalizados, segmentosClientes, plantillasEmail, dependencySnapshots,
    socios, suscripciones, sesiones, reservas, recibos, facturas, notasInternas,
    condicionesSalud, respuestasSesion,
    plantillasCuestionarioSalud, respuestasCuestionarioSalud,
    citas, citasServicios, citasDisponibilidad, productosPOS, ventasPOS, campanas, automatizaciones,
    discountCodes.codigosDescuento,
    actividadReciente,
    content.videosOnDemand, content.postsComunidad, content.likedPostIds,
    integrationsStore.integraciones,
    rewardRules, rewardActions, rewardHistory, creditTransactions, memberCredits,
    rewardCatalog, rewardRedemptions,
    achievementDefinitions, achievementProgress, achievementHistory,
    levelDefinitions,
    challengeDefinitions, challengeProgress, challengeHistory,
    dashboardChartsStore.dashboardCharts,
    backups,
    studioConfig,
    automationRules, automationLogs, progressNotesStore.notasProgreso,
    dataLoaded, errorPublico, planMasElegidoId, sustitucionesConfirmadas,
    studio,
    authUserId, publicSlug, studioIdOverride,
  ]);

  function resetDatosPilates() {
    fetchAllStudioData().then(data => {
      setPlanesTarifa(data.planesTarifa);
      setSalas(data.salas);
      setTiposClase(data.tiposClase);
      setInstructores(data.instructores);
      setSpots(data.spots);
      setBloqueosMaquina(data.bloqueosMaquina);
      setPlazasFijas(data.plazasFijas);
      setRecuperaciones(data.recuperaciones);
      setSocioExcepciones(data.socioExcepciones);
      setMandatosSepa(data.mandatosSepa);
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
      setCitasServicios(data.citasServicios ?? []);
      setCitasDisponibilidad(data.citasDisponibilidad ?? []);
      setProductosPOS(data.productosPOS);
      setVentasPOS(data.ventasPOS);
      setCampanas(data.campanas);
      setAutomatizaciones(data.automatizaciones);
      discountCodes.setCodigosDescuento(data.codigosDescuento);
      setActividadReciente(data.actividadReciente);
      content.setVideosOnDemand(data.videosOnDemand);
      content.setPostsComunidad(data.postsComunidad);
      dbMisLikesComunidad().then(ids => content.setLikedPostIds(new Set(ids)));
      integrationsStore.setIntegraciones(data.integraciones ?? []);
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
      setStudioConfig(configLegalDe(data.studio, data.studioConfig));
    }).catch(console.error);
  }

  return (
    <CoreProvider
      studio={studio}
      instructores={instructores}
      dataLoaded={dataLoaded}
      updateStudio={updateStudio}
      updateAvatarAdmin={updateAvatarAdmin}
      addInstructor={addInstructor}
      updateInstructor={updateInstructor}
      deleteInstructor={deleteInstructor}
      navPortal={navPortal}
      barraClasica={barraClasicaEfectiva}
      barraFlotante={barraFlotanteEfectiva}
      tabBarStyle={tabBarStyleEfectivo}
      variantes={variantesEfectivas}
      themeIdPublicado={themeIdPublicado}
    >
    <StudioContext.Provider value={value}>
      {children}
      {toastAviso.message && <Toast message={toastAviso.message} onDismiss={toastAviso.dismiss} action={toastAviso.action} />}
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
    </CoreProvider>
  );
}
