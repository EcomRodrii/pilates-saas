import { capturarExcepcion, capturarMensaje } from '@/lib/sentry-cliente';
import { mapLimit } from '@/lib/concurrency';
import { supabase } from '@/lib/db/supabase';
import type { Snapshot, SuscripcionActual } from '@/lib/billing/preview-reversion';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
// (Aquí había dos imports de `send-server` y `whatsapp` cuyos cuatro bindings
// no se usaban en las 4200 líneas del fichero. Turbopack ya los sacudía bien
// —comprobado: `@react-email/render` no aparece en ninguno de los 170 chunks
// de cliente— pero eran una arista latente: bastaba con que alguien usara una
// de esas funciones aquí para enganchar `resend` + `@react-email` al grafo del
// layout raíz, que es cliente.)
import { uid } from '@/lib/utils';
// `debeDevolverBono` ya no se usa aquí: quien decide si se devuelve la sesión
// del bono al cancelar es la BD (migr 0129). `esCancelacionTardia` sí sigue,
// porque decide el texto del aviso a la socia, no la política.
import { idEstudioDe } from '@/lib/id-estudio';
import { RESERVADAS as SLUGS_RESERVADOS } from '@/lib/slug';
import { mensajeDeFalloAlGuardar, type ResultadoEscritura } from '@/lib/errores';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  RowAchievementDefinitions,
  RowAchievementHistory,
  RowAchievementProgress,
  RowActividadReciente,
  RowAutomationLogs,
  RowAutomationRules,
  RowAutomatizaciones,
  RowBackups,
  RowCampanas,
  RowPenalizaciones,
  RowChallengeDefinitions,
  RowChallengeHistory,
  RowChallengeProgress,
  RowCitas,
  RowCitasServicios,
  RowCitasDisponibilidad,
  RowCodigosDescuento,
  RowCreditTransactions,
  RowDashboardCharts,
  RowFacturas,
  RowInstructores,
  RowIntegraciones,
  RowLevelDefinitions,
  RowMemberCredits,
  RowMensajesEquipo,
  RowCanalesEquipo,
  RowCondicionesSalud,
  RowPlantillasCuestionarioSalud,
  RowRespuestasCuestionarioSalud,
  RowRespuestasSesion,
  RowNotasInternas,
  RowNotasProgreso,
  RowNotificaciones,
  RowPlanesTarifa,
  RowPostsComunidad,
  RowProductosPos,
  RowRecibos,
  RowReservas,
  RowRewardActions,
  RowRewardCatalog,
  RowRewardHistory,
  RowRewardRedemptions,
  RowRewardRules,
  RowSalas,
  RowBloqueosMaquina,
  RowPlazasFijas,
  RowRecuperaciones,
  RowSocioExcepciones,
  RowSesiones,
  RowSocios,
  RowCamposPersonalizados,
  RowPlantillasEmail,
  RowInstructorDependencySnapshots,
  RowSpots,
  RowStudios,
  RowStudioHorario,
  RowMandatosSepa,
  RowSuscripciones,
  RowCadenaTiposClase,
  RowTiposClase,
  RowFavoritosClase,
  RowRetoParticipaciones,
  RowContenidoPortal,
  RowContenidoPortalBanners,
  RowUsuarios,
  RowVentasPos,
  RowVideosOnDemand,
} from '@/lib/db-types';
import type {
  AchievementDefinition,
  AchievementHistory,
  AchievementProgress,
  ActividadReciente,
  AutomationLog,
  AutomationRule,
  Automatizacion,
  BackupMeta,
  Campana,
  ChallengeDefinition,
  ChallengeHistory,
  ChallengeProgress,
  Cita,
  ServicioCita,
  DisponibilidadCita,
  TipoCita,
  CodigoDescuento,
  CreditTransaction,
  DashboardChart,
  Factura,
  Instructor,
  Integracion,
  LevelDefinition,
  MemberCredits,
  MensajeEquipo,
  CanalEquipo,
  MetodoCobro,
  CondicionSalud,
  PlantillaCuestionarioSalud,
  RespuestaCuestionarioSalud,
  RespuestaSesionRow,
  NotaInterna,
  NotaProgreso,
  Notificacion,
  NivelSemaforo,
  PlanTarifa,
  PostComunidad,
  ComentarioComunidad,
  ProductoPOS,
  Recibo,
  Reserva,
  RewardAction,
  RewardCatalogItem,
  RewardHistory,
  RewardRedemption,
  RewardRule,
  Sala,
  BloqueoMaquina,
  PlazaFija,
  Recuperacion,
  SocioExcepcion,
  Sesion,
  Socio,
  CampoPersonalizado,
  PlantillaEmail,
  InstructorDependencySnapshot,
  Spot,
  Studio,
  DiaHorario,
  MandatoSEPA,
  Suscripcion,
  CadenaTipoClase,
  TipoClase,
  FavoritoClase,
  RetoParticipacion,
  ContenidoPortal,
  BannerPortal,
  UbicacionBannerPortal,
  Usuario,
  VentaPOS,
  VideoOnDemand,
} from '@/lib/types';


// Multi-tenancy: STUDIO_ID is resolved per logged-in user (see
// resolveStudioId/setCurrentStudioId) and read at call time by every helper
// below, so changing it here propagates everywhere without touching each of
// the ~45 call sites individually.
//
// The default is an EMPTY sentinel on purpose: until resolution runs, queries
// filter by studio_id = '' and match nothing, instead of silently falling back
// to another tenant's data (the old 'studio-1' default leaked studio-1 to any
// new user whose studio hadn't resolved yet).
let STUDIO_ID = '';

export function setCurrentStudioId(id: string) {
  STUDIO_ID = id;
}

// P0-2/9: techo de la ventana reciente para las tablas append-only de tipo
// feed (actividad, notificaciones). Sin esto, la carga inicial del contexto
// global traía TODO el histórico al navegador; con estudios de años eso son
// cientos de miles de filas por pestaña. 500 cubre de sobra cualquier vista
// de feed ("últimas actividades", bandeja) — nadie scrollea 500 items. Las
// tablas que SÍ se agregan sobre histórico (reservas, recibos, ventas...) no
// se acotan aquí: eso rompería los informes; su fix es agregación server-side.

// 2.3: PostgREST devuelve como mucho 1000 filas por consulta y lo trunca EN
// SILENCIO si no se pagina — no es lentitud, es incorrección: un estudio con
// más de 1000 reservas/recibos/etc. recibía datos incompletos sin ningún error,
// y todos los informes/KPIs se calculaban sobre una muestra parcial. A
// diferencia de RECENT_FEED_LIMIT (que SÍ acota a propósito, son feeds), esto
// no acota nada: trae la tabla entera, solo que en páginas de 1000. Uso: tablas
// que se agregan sobre histórico (ver comentario arriba) — reservas, recibos,
// facturas, ventas_pos, sesiones, credit_transactions.
const PAGE_SIZE = 1000;
export async function fetchAllRows<T>(
  studioId: string,
  tabla: string,
  pagina: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const filas: T[] = [];
  let desde = 0;
  for (;;) {
    const { data, error } = await pagina(desde, desde + PAGE_SIZE - 1);
    if (error) {
      // 2.4: antes esto se tragaba en silencio (data ?? []) y la app pintaba
      // "0 filas" en vez de un error. Se reporta para que el fallo sea visible
      // a quien opera, aunque la UI (código existente) siga usando lo que ya
      // se había podido traer.
      capturarMensaje('fetchAllRows: fallo leyendo una página', 'error', {
        tags: { area: 'supabase-data', tabla }, extra: { studioId, desde, error: error.message },
      });
      return { data: filas, error };
    }
    if (!data || data.length === 0) break;
    filas.push(...data);
    if (data.length < PAGE_SIZE) break;
    desde += PAGE_SIZE;
  }
  return { data: filas, error: null };
}

export function getCurrentStudioId() {
  return STUDIO_ID;
}

// Resuelve el estudio del usuario autenticado delegando en la función SQL
// current_studio_id() — la misma que ya usa RLS en cada tabla. Respeta la
// sede activa elegida en `sesion_activa` (revalidada dentro de la propia
// función: un usuario nunca puede "activar" una sede que no le pertenece) y,
// si no hay ninguna elegida, cae al criterio determinista de siempre
// (instructora vinculada, si no propietaria). Delegar en el RPC —en vez de
// reimplementar la misma lógica aquí— evita que cliente y RLS puedan
// resolver sedes distintas para el mismo usuario.
export async function resolveStudioId(): Promise<string | null> {
  const { data, error } = await supabase.rpc('current_studio_id');
  if (error) { reportDbError('[resolveStudioId]', error); return null; }
  return (data as string | null) ?? null;
}

// ─── Cliente de escritura sensible al entorno ────────────────────────────────
// Varias funciones de este módulo se invocan desde DOS entornos:
//   · el navegador (staff o socia con sesión) → cliente anónimo; RLS es la
//     garantía de aislamiento entre tenants y debe seguir aplicándose.
//   · jobs de servidor sin sesión (Inngest, crons) → con el cliente anónimo
//     `current_studio_id()` es NULL, RLS rechaza la escritura y `reportDbError`
//     se traga el error: el job "completa" sin haber escrito nada.
// En servidor usamos el service-role; el `studio_id` explícito de cada fila
// mantiene el aislamiento. El patrón ya estaba aplicado en línea en varias
// escrituras de automatizaciones: aquí se le pone nombre para no repetirlo.
type DbErrorListener = (tag: string, error: unknown) => void;
let dbErrorListener: DbErrorListener | null = null;

export function setDbErrorListener(fn: DbErrorListener | null) {
  dbErrorListener = fn;
}

// Fallos de RED del cliente (fetch abortado al cambiar de app en el móvil, red
// intermitente, offline, DNS): el runtime de fetch lanza un TypeError genérico
// ("Load failed" en Safari, "Failed to fetch" en Chrome) o un AbortError, SIN
// código de Postgres. No son bugs de la app ni errores de BD accionables; si se
// mandan a Sentry ensucian `area: db` con falsos "usuarios afectados" (Sentry
// NEXTJS-K). Se detectan por el mensaje/nombre del runtime, que un error real de
// Postgres (con `code` 23xxx/42xxx/PGRST…) nunca trae.
function esErrorDeRedCliente(error: unknown): boolean {
  const e = error as { message?: unknown; name?: unknown } | null;
  if (e?.name === 'AbortError') return true;
  const msg = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : typeof e?.message === 'string'
        ? e.message
        : '';
  return /load failed|failed to fetch|networkerror|network request failed|the operation was aborted/i.test(msg);
}

// 409 es, por convención en TODAS las API routes de este repo (equipo,
// decisiones, sustituciones, terminal, penalizaciones...), "conflicto de
// negocio ya resuelto con su propio mensaje al usuario" — el propio código de
// app/api/equipo/route.ts lo dice literal: "Se responde 409 con qué hacer, y
// no se registra nada". No es un bug de la app: es la respuesta esperada a un
// intento de dar de alta un email duplicado, aprobar dos veces la misma
// recomendación, etc. — ruido no accionable en Sentry (auditoría M-5).
function esConflictoDeNegocioEsperado(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { status?: unknown }).status === 409;
}

export function reportDbError(tag: string, error: unknown) {
  console.error(tag, error);
  // A-6: los fallos de escritura de DB llegan a Sentry (antes solo console.error
  // + un toast → invisibles en producción). Tag por estudio para agrupar por
  // tenant. No-op si Sentry no está inicializado (DSN sin definir).
  // Los fallos de RED del cliente y los conflictos de negocio ya resueltos con
  // su propio mensaje (409) se registran en consola y alimentan el toast, pero
  // NO se envían a Sentry (ruido no accionable, no un error de BD).
  if (!esErrorDeRedCliente(error) && !esConflictoDeNegocioEsperado(error)) {
    try {
      capturarExcepcion(
        error instanceof Error ? error : new Error(`${tag}: ${typeof error === 'string' ? error : JSON.stringify(error)}`),
        { tags: { area: 'db', studioId: STUDIO_ID || 'desconocido' }, extra: { op: tag } },
      );
    } catch {
      /* nunca dejar que el reporte rompa una escritura */
    }
  }
  try {
    dbErrorListener?.(tag, error);
  } catch {
    /* never let the listener break a write */
  }
}

// ─── Escrituras que la usuaria está esperando ────────────────────────────────
// `reportDbError` es para escrituras fire-and-forget: avisa, pero quien llamó ya
// siguió adelante. Cuando la dueña está mirando la pantalla esperando un "hecho"
// eso no basta — necesita saber si guardó ANTES de que le enseñemos el dato. Las
// escrituras de ese tipo devuelven `ResultadoEscritura` y quien llama decide.
const ESCRITURA_OK: ResultadoEscritura = { ok: true };

function falloEscritura(tag: string, error: unknown): ResultadoEscritura {
  reportDbError(tag, error);
  return { ok: false, error: mensajeDeFalloAlGuardar(error) };
}

// ─── Mappers: DB (snake_case) → TS (camelCase) ───────────────────────────────


export function mapUsuario(r: RowUsuarios): Usuario {
  return {
    id: r.id,
    studioId: r.studio_id,
    rol: r.rol,
    nombre: r.nombre,
    email: r.email,
    telefono: r.telefono ?? null,
    avatarUrl: r.avatar_url ?? null,
  } as Usuario;
}


// ─── Filas del ARRANQUE del panel ────────────────────────────────────────────
// El bootstrap pide columnas concretas, no `select('*')`. Estos tipos son el
// contrato de esa lista: si el select se queda corto, `tsc` falla NOMBRANDO la
// columna que falta, en vez de que llegue `undefined` en tiempo de ejecución.
//
// ⚠️ Para que esa comprobación exista, la cadena del select tiene que ser UN
// literal de UNA línea. Partirla en `'a,b' + 'c,d'` la degrada a `string`,
// supabase-js pierde la inferencia y se pierde toda la verificación EN SILENCIO.
// consentimiento_marketing_texto excluido por el mismo motivo que
// aceptacion_version: es el texto COMPLETO (lib/legal-textos.ts
// textoConsentimientoMarketing), idéntico para todas las socias del estudio,
// y solo lo necesita el envío real (comparación exacta de vigencia) — no el
// panel. El panel solo trae fecha+registradoPor (bool-ish, aproximado).
export type FilaSocioPanel = Omit<RowSocios, 'aceptacion_version' | 'auth_user_id' | 'borrado_en' | 'consentimiento_marketing_texto'>;
export type FilaSesionPanel = Omit<RowSesiones, 'valoracion_pedida_en' | 'cancelada_motivo'>;
// El arranque del panel NO trae ni `proximo_reintento` ni el snapshot de la
// entrega: son columnas que solo lee el dunning (servidor) y la card de
// devoluciones, y meterlas aquí engordaría el payload de arranque de TODAS las
// pantallas para nada (ver la fase B de "columnas, no consultas").
//
// ⚠️ Con UNA excepción, y a sabiendas: `entrega_sesiones_despues` sí viaja. Es
// un entero nullable —no la fila de 2,7 KB que motivó aquella limpieza— y sin
// él el botón de devolver de la ficha no puede evaluar la regla "solo bonos sin
// empezar", que es justo la que el servidor SÍ evalúa. La alternativa era
// ofrecer devolver un bono ya usado y que el endpoint lo rechazara después de
// confirmar. Si algún día hay que quitarlo, hay que quitar también esa regla de
// la pantalla, no dejarla decidiendo con datos que no tiene.
export type FilaReciboPanel = Omit<RowRecibos,
  | 'proximo_reintento'
  | 'entrega_tipo' | 'entrega_aplicada' | 'entrega_aplicada_en'
  | 'entrega_sesiones_antes'
  | 'entrega_fecha_fin_antes' | 'entrega_fecha_fin_despues'
  | 'entrega_estado_antes' | 'importe_devuelto'>;

export function mapSocio(r: FilaSocioPanel): Socio {
  // ⚠️ `versionTexto` llega VACÍO desde el arranque del panel, y es a propósito.
  //
  // `socios.aceptacion_version` no guarda un número de versión: guarda el TEXTO
  // LEGAL COMPLETO que aceptó la socia (`textoLegalCompleto()`), unos 2,7 KB por
  // fila e idéntico para todas. Viajaba al navegador con cada socia y no lo leía
  // NADIE: el panel solo usa `.firma`, `.fecha`, `.origen` y `.introducidaPor`
  // (ver clientas/[id]/page.tsx) y la existencia del objeto, que depende de
  // `aceptacion_fecha`, no de este campo. Sacarlo del select bajó `socios` un 79 %.
  //
  // Su único lector real es el guard de consentimiento del cron de penalizaciones
  // (`lib/inngest/penalizaciones.ts:44`), que hace su PROPIO select en servidor
  // con la columna incluida — así que sigue comparando contra el texto completo.
  //
  // Si algún día hace falta en el panel, hay que volver a pedir la columna en el
  // select de `fetchCriticalStudioData`, no leer este campo esperando contenido.
  const aceptacionContrato =
    r.aceptacion_fecha
      ? {
          fecha: r.aceptacion_fecha,
          firma: r.aceptacion_firma ?? '',
          // Vacío a propósito, y ahora también por tipo: `FilaSocioPanel` excluye
          // `aceptacion_version`, así que esto no puede volver a leerse por
          // descuido — habría que reponer la columna en el select primero.
          versionTexto: '',
          ...(r.aceptacion_origen ? { origen: r.aceptacion_origen as 'PORTAL' | 'MOSTRADOR' } : {}),
          ...(r.aceptacion_por ? { introducidaPor: r.aceptacion_por } : {}),
        }
      : undefined;
  const consentimientoSalud = r.consentimiento_salud_fecha
    ? { fecha: r.consentimiento_salud_fecha, registradoPor: r.consentimiento_salud_registrado_por ?? '' }
    : undefined;
  // `texto` vacío a propósito, mismo motivo que aceptacionContrato.versionTexto
  // arriba: FilaSocioPanel excluye consentimiento_marketing_texto (2,7 KB por
  // fila, idéntico para todas). El panel solo necesita saber SI hay consentimiento
  // (para el recuento aproximado de campañas); la vigencia EXACTA (comparar
  // texto) la comprueba el envío real con su propio select — ver
  // lib/marketing/consentimiento.ts.
  const consentimientoMarketing = r.consentimiento_marketing_en
    ? { fecha: r.consentimiento_marketing_en, texto: '', registradoPor: r.consentimiento_marketing_por ?? '' }
    : undefined;

  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    apellidos: r.apellidos,
    email: r.email,
    telefono: r.telefono ?? null,
    nif: r.nif ?? null,
    fechaAlta: r.fecha_alta,
    activo: r.activo,
    leadStage: r.lead_stage ?? undefined,
    tags: r.tags ?? undefined,
    aceptacionContrato,
    consentimientoSalud,
    consentimientoMarketing,
    avatar: r.avatar ?? null,
    stripeCustomerId: r.stripe_customer_id ?? null,
    stripePaymentMethodId: r.stripe_payment_method_id ?? null,
    tarjetaExpMes: r.tarjeta_exp_mes ?? null,
    tarjetaExpAnio: r.tarjeta_exp_anio ?? null,
    tarjetaMarca: r.tarjeta_marca ?? null,
    tarjetaUltimos4: r.tarjeta_ultimos4 ?? null,
    metodoPagoPreferido: (r.metodo_pago_preferido as Socio['metodoPagoPreferido']) ?? 'TARJETA',
    sepaMandateId: r.sepa_mandate_id ?? null,
    sepaPaymentMethodId: r.sepa_payment_method_id ?? null,
    fechaNacimiento: r.fecha_nacimiento ?? null,
    direccion: r.direccion ?? null,
    fotoUrl: r.foto_url ?? null,
    referidoPor: r.referido_por ?? null,
    origenLead: r.origen_lead ?? null,
    camposExtra: r.campos_extra ?? {},
  } as Socio;
}

function mapCampoPersonalizado(r: RowCamposPersonalizados): CampoPersonalizado {
  return {
    id: r.id,
    studioId: r.studio_id ?? '',
    etiqueta: r.etiqueta,
    tipo: (r.tipo ?? 'texto') as CampoPersonalizado['tipo'],
    opciones: r.opciones ?? [],
    requerido: r.requerido ?? false,
    orden: r.orden ?? 0,
    activo: r.activo ?? true,
  };
}

export function mapRewardRule(r: RowRewardRules): RewardRule {
  return {
    id: r.id,
    studioId: r.studio_id,
    trigger: r.trigger,
    nombre: r.nombre,
    descripcion: r.descripcion ?? null,
    creditos: r.creditos,
    activa: r.activa,
    topeMensual: r.tope_mensual ?? null,
    creadoEn: r.creado_en,
  } as RewardRule;
}

export function mapRewardAction(r: RowRewardActions): RewardAction {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    trigger: r.trigger,
    refId: r.ref_id ?? null,
    creadoEn: r.creado_en,
  } as RewardAction;
}

export function mapRewardHistory(r: RowRewardHistory): RewardHistory {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    ruleId: r.rule_id,
    actionId: r.action_id,
    creditos: r.creditos,
    descripcion: r.descripcion,
    creadoEn: r.creado_en,
  } as RewardHistory;
}

export function mapCreditTransaction(r: RowCreditTransactions): CreditTransaction {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    tipo: r.tipo,
    creditos: r.creditos,
    descripcion: r.descripcion,
    refId: r.ref_id ?? null,
    creadoEn: r.creado_en,
  } as CreditTransaction;
}

export function mapMemberCredits(r: RowMemberCredits): MemberCredits {
  return {
    socioId: r.socio_id,
    studioId: r.studio_id,
    saldo: r.saldo,
    totalGanado: r.total_ganado,
    totalCanjeado: r.total_canjeado,
    actualizadoEn: r.actualizado_en,
  } as MemberCredits;
}

export function mapRewardCatalogItem(r: RowRewardCatalog): RewardCatalogItem {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    descripcion: r.descripcion ?? null,
    costeCreditos: r.coste_creditos,
    icono: r.icono,
    activo: r.activo,
    stock: r.stock ?? null,
    creadoEn: r.creado_en,
  } as RewardCatalogItem;
}

export function mapRewardRedemption(r: RowRewardRedemptions): RewardRedemption {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    catalogItemId: r.catalog_item_id,
    creditosGastados: r.creditos_gastados,
    estado: r.estado,
    creadoEn: r.creado_en,
  } as RewardRedemption;
}

export function mapAchievementDefinition(r: RowAchievementDefinitions): AchievementDefinition {
  return {
    id: r.id,
    studioId: r.studio_id,
    metric: r.metric,
    nombre: r.nombre,
    descripcion: r.descripcion ?? null,
    umbral: r.umbral,
    icono: r.icono,
    creditosRecompensa: r.creditos_recompensa,
    activo: r.activo,
    creadoEn: r.creado_en,
  } as AchievementDefinition;
}

export function mapAchievementProgress(r: RowAchievementProgress): AchievementProgress {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    achievementId: r.achievement_id,
    progresoActual: r.progreso_actual,
    completado: r.completado,
    completadoEn: r.completado_en ?? null,
  } as AchievementProgress;
}

export function mapAchievementHistory(r: RowAchievementHistory): AchievementHistory {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    achievementId: r.achievement_id,
    nombre: r.nombre,
    icono: r.icono,
    creadoEn: r.creado_en,
  } as AchievementHistory;
}

export function mapLevelDefinition(r: RowLevelDefinitions): LevelDefinition {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    orden: r.orden,
    umbralCreditos: r.umbral_creditos,
    color: r.color,
    icono: r.icono,
    beneficios: r.beneficios ?? null,
    activo: r.activo,
    creadoEn: r.creado_en,
  } as LevelDefinition;
}

export function mapChallengeDefinition(r: RowChallengeDefinitions): ChallengeDefinition {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    descripcion: r.descripcion ?? null,
    icono: r.icono,
    metric: r.metric,
    objetivo: r.objetivo,
    fechaInicio: r.fecha_inicio,
    fechaFin: r.fecha_fin,
    creditosRecompensa: r.creditos_recompensa,
    activo: r.activo,
    creadoEn: r.creado_en,
  } as ChallengeDefinition;
}

export function mapChallengeProgress(r: RowChallengeProgress): ChallengeProgress {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    challengeId: r.challenge_id,
    progresoActual: r.progreso_actual,
    completado: r.completado,
    completadoEn: r.completado_en ?? null,
  } as ChallengeProgress;
}

export function mapChallengeHistory(r: RowChallengeHistory): ChallengeHistory {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    challengeId: r.challenge_id,
    nombre: r.nombre,
    icono: r.icono,
    creadoEn: r.creado_en,
  } as ChallengeHistory;
}

export function mapDashboardChart(r: RowDashboardCharts): DashboardChart {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    tipo: r.tipo,
    metrica: r.metrica,
    agrupacion: r.agrupacion,
    rango: r.rango,
    color: r.color,
    creadoEn: r.creado_en,
  } as DashboardChart;
}

export function mapBackupMeta(r: RowBackups): BackupMeta {
  return {
    id: r.id,
    studioId: r.studio_id,
    tipo: r.tipo,
    creadoEn: r.creado_en,
  } as BackupMeta;
}

export function mapPlanTarifa(r: RowPlanesTarifa): PlanTarifa {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    descripcion: r.descripcion ?? null,
    precio: r.precio,
    tipo: r.tipo,
    sesiones: r.sesiones ?? null,
    validezDias: r.validez_dias ?? null,
    limiteSemanal: r.limite_semanal ?? null,
    activo: r.activo,
  } as PlanTarifa;
}

export function mapSuscripcion(r: RowSuscripciones): Suscripcion {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    planId: r.plan_id,
    estado: r.estado,
    fechaInicio: r.fecha_inicio,
    fechaFin: r.fecha_fin ?? null,
    sesionesRestantes: r.sesiones_restantes ?? null,
    stripeSubscriptionId: r.stripe_subscription_id ?? null,
  } as Suscripcion;
}

export function mapSala(r: RowSalas): Sala {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    capacidad: r.capacidad,
    color: r.color,
  } as Sala;
}

export function mapBloqueoMaquina(r: RowBloqueosMaquina): BloqueoMaquina {
  return {
    id: r.id,
    studioId: r.studio_id,
    salaId: r.sala_id,
    spotId: r.spot_id ?? null,
    desde: r.desde,
    hasta: r.hasta ?? null,
    motivo: r.motivo ?? null,
    creadoEn: r.creado_en,
  };
}

function bloqueoMaquinaToDb(b: BloqueoMaquina) {
  return {
    id: b.id,
    studio_id: b.studioId ?? STUDIO_ID,
    sala_id: b.salaId,
    spot_id: b.spotId ?? null,
    desde: b.desde,
    hasta: b.hasta ?? null,
    motivo: b.motivo ?? null,
  };
}

export function mapPlazaFija(r: RowPlazasFijas): PlazaFija {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    diaSemana: r.dia_semana,
    horaInicio: r.hora_inicio,
    salaId: r.sala_id,
    tipoClaseId: r.tipo_clase_id ?? null,
    spotId: r.spot_id ?? null,
    vigenciaDesde: r.vigencia_desde,
    vigenciaHasta: r.vigencia_hasta ?? null,
    estado: (r.estado as PlazaFija['estado']) ?? 'ACTIVA',
    creadaEn: r.creada_en,
  };
}

function plazaFijaToDb(p: PlazaFija) {
  return {
    id: p.id,
    studio_id: p.studioId ?? STUDIO_ID,
    socio_id: p.socioId,
    dia_semana: p.diaSemana,
    hora_inicio: p.horaInicio,
    sala_id: p.salaId,
    tipo_clase_id: p.tipoClaseId ?? null,
    spot_id: p.spotId ?? null,
    vigencia_desde: p.vigenciaDesde,
    vigencia_hasta: p.vigenciaHasta ?? null,
    estado: p.estado,
  };
}

export function mapRecuperacion(r: RowRecuperaciones): Recuperacion {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    origenReservaId: r.origen_reserva_id ?? null,
    motivo: r.motivo ?? null,
    caducaEl: r.caduca_el,
    estado: (r.estado as Recuperacion['estado']) ?? 'DISPONIBLE',
    usadaEnReservaId: r.usada_en_reserva_id ?? null,
    creadaEn: r.creada_en,
  };
}

export function mapSpot(r: RowSpots): Spot {
  return {
    id: r.id,
    salaId: r.sala_id,
    studioId: r.studio_id,
    numero: r.numero,
    nombre: r.nombre,
    fila: r.fila,
    columna: r.columna,
    tipo: r.tipo,
    activo: r.activo,
  } as Spot;
}

export function mapTipoClase(r: RowTiposClase): TipoClase {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    color: r.color,
    duracionMinutos: r.duracion_minutos,
    descripcion: r.descripcion ?? null,
    nivel: r.nivel,
    objetivos: Array.isArray(r.objetivos) ? r.objetivos : [],
    fotoUrl: r.foto_url ?? null,
    ventanaCancelacionHoras: r.ventana_cancelacion_horas ?? null,
    reservaExigirPlan: r.reserva_exigir_plan ?? null,
    reservaVentanaMinimaMinutos: r.reserva_ventana_minima_minutos ?? null,
    reservaAntelacionMaximaDias: r.reserva_antelacion_maxima_dias ?? null,
    permiteListaEspera: r.permite_lista_espera ?? null,
    requiereAprobacion: r.requiere_aprobacion ?? null,
    listaEsperaPlazoAceptacionMinutos: r.lista_espera_plazo_aceptacion_minutos ?? null,
    minimoAsistentesPorClase: r.minimo_asistentes_por_clase ?? null,
    penalizacionImporteEur: r.penalizacion_importe_eur ?? null,
  } as TipoClase;
}

export function mapFavoritoClase(r: RowFavoritosClase): FavoritoClase {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    tipoClaseId: r.tipo_clase_id,
    creadoEn: r.created_at,
  };
}

export function mapRetoParticipacion(r: RowRetoParticipaciones): RetoParticipacion {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    retoKey: r.reto_key,
    creadoEn: r.created_at,
  };
}

export function mapContenidoPortal(r: RowContenidoPortal): ContenidoPortal {
  return {
    studioId: r.studio_id,
    mensajeDestacado: r.mensaje_destacado ?? null,
  };
}

export function mapBannerPortal(r: RowContenidoPortalBanners): BannerPortal {
  return {
    id: r.id,
    studioId: r.studio_id,
    imagenUrl: r.imagen_url,
    titulo: r.titulo ?? null,
    texto: r.texto ?? null,
    linkTipo: r.link_tipo as BannerPortal['linkTipo'],
    linkValor: r.link_valor,
    ubicacion: (r.ubicacion ?? []) as UbicacionBannerPortal[],
    activo: r.activo,
    orden: r.orden,
    fechaInicio: r.fecha_inicio ?? null,
    fechaFin: r.fecha_fin ?? null,
  };
}


export function mapSesion(r: FilaSesionPanel): Sesion {
  return {
    id: r.id,
    studioId: r.studio_id,
    tipoClaseId: r.tipo_clase_id,
    salaId: r.sala_id,
    instructorId: r.instructor_id,
    inicio: r.inicio,
    fin: r.fin,
    aforoMaximo: r.aforo_maximo,
    cancelada: r.cancelada,
    notas: r.notas ?? null,
    precioPuntual: r.precio_puntual ?? null,
    googleEventId: r.google_event_id ?? null,
    serieId: r.serie_id ?? null,
    incidenciaTexto: r.incidencia_texto ?? null,
  } as Sesion;
}

export function mapReserva(r: RowReservas): Reserva {
  return {
    id: r.id,
    studioId: r.studio_id,
    sesionId: r.sesion_id,
    socioId: r.socio_id,
    estado: r.estado,
    spotId: r.spot_id ?? null,
    posicionEspera: r.posicion_espera ?? null,
    ofertaExpiraEn: r.oferta_expira_en ?? null,
    checkInEn: r.check_in_en ?? null,
    creadoEn: r.creado_en,
  } as Reserva;
}

export function mapRecibo(r: FilaReciboPanel): Recibo {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    suscripcionId: r.suscripcion_id ?? null,
    concepto: r.concepto,
    importe: r.importe,
    estado: r.estado,
    fechaVencimiento: r.fecha_vencimiento,
    fechaCobro: r.fecha_cobro ?? null,
    fechaDevolucion: r.fecha_devolucion ?? null,
    intentosReintento: r.intentos_reintento,
    metodoCobro: (r.metodo_cobro as Recibo['metodoCobro']) ?? null,
    sepaEstado: r.sepa_estado ?? null,
    // Cuántas sesiones tenía el bono justo al entregarlo. Lo necesita el botón
    // de devolver de la ficha (`soloSinUsar`) para decidir lo MISMO que decide
    // el servidor: sin este dato la pantalla no puede evaluar esa regla y
    // ofrecería devolver un bono empezado para que el endpoint lo rechace
    // después de confirmar.
    entregaSesionesDespues: r.entrega_sesiones_despues ?? null,
    reembolsoSolicitadoEn: r.reembolso_solicitado_en ?? null,
    reembolsoStripeId: r.reembolso_stripe_id ?? null,
  } as Recibo;
}

export function mapFactura(r: RowFacturas): Factura {
  return {
    id: r.id,
    studioId: r.studio_id,
    reciboId: r.recibo_id,
    numeroCompleto: r.numero_completo,
    fechaEmision: r.fecha_emision,
    receptorNombre: r.receptor_nombre,
    receptorNIF: r.receptor_nif ?? null,
    baseImponible: r.base_imponible,
    tipoIVA: r.tipo_iva,
    cuotaIVA: r.cuota_iva,
    total: r.total,
    verifactuHash: r.verifactu_hash ?? null,
    verifactuPrevHash: r.verifactu_prev_hash ?? null,
    verifactuTs: r.verifactu_ts ?? null,
    verifactuSeq: r.verifactu_seq ?? null,
    serie: r.serie ?? undefined,
    tipo: r.tipo ?? undefined,
    rectificaA: r.rectifica_a ?? null,
    tipoRectificativa: (r.tipo_rectificativa as 'S' | 'I' | null) ?? null,
    importeRectificacion: r.importe_rectificacion ?? null,
  } as Factura;
}

export function mapCita(r: RowCitas): Cita {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    instructorId: r.instructor_id,
    tipo: r.tipo,
    inicio: r.inicio,
    fin: r.fin,
    notas: r.notas ?? null,
    estado: r.estado,
    precio: r.precio ?? null,
    pagada: r.pagada ?? false,
    creadoEn: r.creado_en,
    servicioId: r.servicio_id ?? null,
  } as Cita;
}

export function mapProductoPOS(r: RowProductosPos): ProductoPOS {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    categoria: r.categoria,
    precio: r.precio,
    activo: r.activo,
  } as ProductoPOS;
}

export function mapVentaPOS(r: RowVentasPos): VentaPOS {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id ?? null,
    items: r.items ?? [],
    subtotal: r.subtotal,
    descuento: r.descuento,
    total: r.total,
    metodoPago: r.metodo_pago,
    notas: r.notas ?? null,
    realizadaEn: r.realizada_en,
  } as VentaPOS;
}

export function mapIntegracion(r: RowIntegraciones): Integracion {
  return {
    id: r.id,
    studioId: r.studio_id,
    tipo: r.tipo,
    activo: r.activo,
    config: r.config ?? {},
    actualizadoEn: r.actualizado_en,
  } as Integracion;
}

export function mapCampana(r: RowCampanas): Campana {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    tipo: r.tipo,
    asunto: r.asunto,
    contenido: r.contenido,
    estado: r.estado,
    destinatarios: r.destinatarios,
    enviados: r.enviados,
    abiertos: r.abiertos,
    clics: r.clics,
    creadaEn: r.creada_en,
    enviadaEn: r.enviada_en ?? null,
    programadaEn: r.programada_en ?? null,
    objetivo: r.objetivo ?? null,
    presupuesto: r.presupuesto ?? null,
    publicaciones: (r.publicaciones as Campana['publicaciones']) ?? null,
  } as Campana;
}

export function mapAutomatizacion(r: RowAutomatizaciones): Automatizacion {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    trigger: r.trigger,
    accion: r.accion,
    asunto: r.asunto,
    mensaje: r.mensaje,
    activa: r.activa,
    ejecutadas: r.ejecutadas,
    creadaEn: r.creada_en,
    pasos: (r.pasos as Automatizacion['pasos']) ?? null,
  } as Automatizacion;
}

export function mapAutomationRule(r: RowAutomationRules): AutomationRule {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    descripcion: r.descripcion,
    icono: r.icono,
    trigger: r.trigger,
    condicion: r.condicion ?? {},
    pasos: r.pasos ?? [],
    activa: r.activa,
    ejecutadaVeces: r.ejecutada_veces,
    ultimaEjecucion: r.ultima_ejecucion ?? null,
    creadaEn: r.creada_en,
  } as AutomationRule;
}

export function mapAutomationLog(r: RowAutomationLogs): AutomationLog {
  return {
    id: r.id,
    studioId: r.studio_id,
    ruleId: r.rule_id ?? null,
    automatizacionId: r.automatizacion_id ?? null,
    ruleName: r.rule_name,
    socioId: r.socio_id ?? null,
    socioNombre: r.socio_nombre ?? null,
    pasoIndex: r.paso_index,
    accion: r.accion,
    resultado: r.resultado,
    detalle: r.detalle,
    mensajeCliente: r.mensaje_cliente ?? null,
    ejecutadoEn: r.ejecutado_en,
    proximaAccionEn: r.proxima_accion_en ?? null,
    reciboId: r.recibo_id ?? null,
  } as AutomationLog;
}

export function mapNotaProgreso(r: RowNotasProgreso): NotaProgreso {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    instructorId: r.instructor_id,
    sesionId: r.sesion_id ?? null,
    textoLibre: r.texto_libre,
    progreso: r.progreso ?? null,
    alertas: r.alertas ?? null,
    planProximaSesion: r.plan_proxima_sesion ?? null,
    ejerciciosCasa: r.ejercicios_casa ?? null,
    creadaEn: r.creada_en,
  } as NotaProgreso;
}

export function mapCodigoDescuento(r: RowCodigosDescuento): CodigoDescuento {
  return {
    id: r.id,
    studioId: r.studio_id,
    codigo: r.codigo,
    descripcion: r.descripcion,
    tipo: r.tipo,
    valor: r.valor,
    usos: r.usos,
    usosMax: r.usos_max ?? null,
    expira: r.expira ?? null,
    activo: r.activo,
    creadoEn: r.creado_en,
    minImporte: r.min_importe ?? null,
    soloNuevas: r.solo_nuevas ?? false,
  } as CodigoDescuento;
}

export function mapActividadReciente(r: RowActividadReciente): ActividadReciente {
  return {
    id: r.id,
    studioId: r.studio_id,
    tipo: r.tipo,
    texto: r.texto,
    socioId: r.socio_id ?? null,
    enlace: r.enlace ?? null,
    creadoEn: r.creado_en,
    actorNombre: r.actor_nombre ?? null,
  } as ActividadReciente;
}

export function mapMensajeEquipo(r: RowMensajesEquipo): MensajeEquipo {
  return {
    id: r.id,
    studioId: r.studio_id,
    canalId: r.canal_id ?? '',
    autorInstructorId: r.autor_instructor_id ?? null,
    autorNombre: r.autor_nombre,
    texto: r.texto,
    creadoEn: r.creado_en,
  } as MensajeEquipo;
}

export function mapCanalEquipo(r: RowCanalesEquipo): CanalEquipo {
  return {
    id: r.id,
    studioId: r.studio_id ?? '',
    nombre: r.nombre,
    creadoEn: r.creado_en ?? '',
  };
}

export function mapNotificacion(r: RowNotificaciones): Notificacion {
  return {
    id: r.id,
    studioId: r.studio_id,
    titulo: r.titulo,
    texto: r.texto,
    leida: r.leida,
    tipo: r.tipo,
    enlace: r.enlace ?? null,
    creadaEn: r.creada_en,
  } as Notificacion;
}

// El marcado de "leída" solo vivía en estado local y se perdía al recargar.
// La política RLS admin_notificaciones permite al staff (sesión) escribir las de
// su estudio, así que persiste con el cliente anónimo + sesión.
export async function dbMarcarNotificacionLeida(id: string) {
  const { error } = await supabase.from('notificaciones').update({ leida: true }).eq('id', id);
  if (error) reportDbError('[dbMarcarNotificacionLeida]', error);
}

export async function dbMarcarNotificacionesLeidas(studioId: string) {
  const { error } = await supabase.from('notificaciones').update({ leida: true }).eq('studio_id', studioId).eq('leida', false);
  if (error) reportDbError('[dbMarcarNotificacionesLeidas]', error);
}

export function mapVideoOnDemand(r: RowVideosOnDemand): VideoOnDemand {
  return {
    id: r.id,
    studioId: r.studio_id,
    titulo: r.titulo,
    descripcion: r.descripcion ?? null,
    categoria: r.categoria,
    duracionMinutos: r.duracion_minutos,
    nivel: r.nivel,
    instructorId: r.instructor_id,
    vistas: r.vistas,
    likes: r.likes,
    activo: r.activo,
    creadoEn: r.creado_en,
    streamUid: r.stream_uid ?? null,
  } as VideoOnDemand;
}

export function mapPostComunidad(r: RowPostsComunidad): PostComunidad {
  return {
    id: r.id,
    studioId: r.studio_id,
    autorId: r.autor_id ?? null,
    autorNombre: r.autor_nombre,
    autorInicial: r.autor_inicial,
    texto: r.texto,
    likes: r.likes,
    comentariosCount: r.comentarios_count,
    fijado: r.fijado,
    creadoEn: r.creado_en,
  } as PostComunidad;
}

export function mapNotaInterna(r: RowNotasInternas): NotaInterna {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    texto: r.texto,
    tipo: r.tipo,
    creadoEn: r.creado_en,
  } as NotaInterna;
}

export function mapCondicionSalud(r: RowCondicionesSalud): CondicionSalud {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    categoria: r.categoria,
    etiqueta: r.etiqueta,
    zona: r.zona,
    restricciones: r.restricciones ?? [],
    severidad: r.severidad,
    estado: r.estado,
    inicio: r.inicio,
    fin: r.fin,
    revisarEn: r.revisar_en,
    notas: r.notas,
    creadoPor: r.creado_por,
    creadoEn: r.creado_en,
    actualizadoEn: r.actualizado_en,
  } as CondicionSalud;
}

export function mapRespuestaSesion(r: RowRespuestasSesion): RespuestaSesionRow {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    sesionId: r.sesion_id,
    respuesta: r.respuesta,
    nota: r.nota,
    creadoPor: r.creado_por,
    creadoEn: r.creado_en,
  } as RespuestaSesionRow;
}

// ─── Fetch all studio data in parallel ───────────────────────────────────────

// ── Carga en dos olas (Fase C: lazy-load) ────────────────────────────────────
// El arranque no debe bloquearse esperando tablas de historial/logs que crecen
// sin límite y solo se muestran (ninguna lógica de negocio las lee). Se dividen:
//   · fetchCriticalStudioData(): todo lo necesario para pintar y operar.
//   · fetchDeferredStudioData(): historial/logs, cargado en una 2ª ola.
// fetchAllStudioData() combina ambas (lo usa el cron, que sí necesita todo).

function socioToDb(socio: Socio) {
  const {
    aceptacionContrato, studioId, fechaAlta, leadStage,
    stripeCustomerId, stripePaymentMethodId, fechaNacimiento, fotoUrl, referidoPor, origenLead,
    metodoPagoPreferido, sepaMandateId, sepaPaymentMethodId,
    camposExtra,
    ...rest
  } = socio;
  return {
    ...rest,
    studio_id: studioId ?? STUDIO_ID,
    fecha_alta: fechaAlta,
    lead_stage: leadStage ?? null,
    stripe_customer_id: stripeCustomerId ?? null,
    stripe_payment_method_id: stripePaymentMethodId ?? null,
    metodo_pago_preferido: metodoPagoPreferido ?? 'TARJETA',
    sepa_mandate_id: sepaMandateId ?? null,
    sepa_payment_method_id: sepaPaymentMethodId ?? null,
    fecha_nacimiento: fechaNacimiento ?? null,
    foto_url: fotoUrl ?? null,
    referido_por: referidoPor ?? null,
    origen_lead: origenLead ?? null,
    campos_extra: camposExtra ?? {},
    aceptacion_fecha: aceptacionContrato?.fecha ?? null,
    aceptacion_firma: aceptacionContrato?.firma ?? null,
    aceptacion_version: aceptacionContrato?.versionTexto ?? null,
    aceptacion_origen: aceptacionContrato?.origen ?? null,
    aceptacion_por: aceptacionContrato?.introducidaPor ?? null,
  };
}

// Los tipos de clase que cubre cada plan viven en la tabla puente
// `plan_tipos_clase` (0111), así que no vienen en el SELECT de planes_tarifa.
// Esto los cuelga en `tiposClaseIds`. Sin filas para un plan = cubre todas, que
// es el comportamiento de siempre: por eso el fallo (una consulta que falle deja
// los planes tal cual) es abrir, no cerrar.
function planTarifaToDb(plan: PlanTarifa) {
  return {
    id: plan.id,
    studio_id: plan.studioId ?? STUDIO_ID,
    nombre: plan.nombre,
    descripcion: plan.descripcion ?? null,
    precio: plan.precio,
    tipo: plan.tipo,
    sesiones: plan.sesiones ?? null,
    validez_dias: plan.validezDias ?? null,
    limite_semanal: plan.limiteSemanal ?? null,
    activo: plan.activo,
  };
}

function suscripcionToDb(sus: Suscripcion) {
  return {
    id: sus.id,
    studio_id: sus.studioId ?? STUDIO_ID,
    socio_id: sus.socioId,
    plan_id: sus.planId,
    estado: sus.estado,
    fecha_inicio: sus.fechaInicio,
    fecha_fin: sus.fechaFin ?? null,
    sesiones_restantes: sus.sesionesRestantes ?? null,
    stripe_subscription_id: sus.stripeSubscriptionId ?? null,
  };
}

function sesionToDb(ses: Sesion) {
  return {
    id: ses.id,
    studio_id: ses.studioId ?? STUDIO_ID,
    tipo_clase_id: ses.tipoClaseId,
    sala_id: ses.salaId,
    instructor_id: ses.instructorId,
    inicio: ses.inicio,
    fin: ses.fin,
    aforo_maximo: ses.aforoMaximo,
    cancelada: ses.cancelada,
    notas: ses.notas ?? null,
    precio_puntual: ses.precioPuntual ?? null,
    serie_id: ses.serieId ?? null,
  };
}

function reservaToDb(res: Reserva) {
  return {
    id: res.id,
    studio_id: res.studioId ?? STUDIO_ID,
    sesion_id: res.sesionId,
    socio_id: res.socioId,
    estado: res.estado,
    spot_id: res.spotId ?? null,
    posicion_espera: res.posicionEspera ?? null,
    oferta_expira_en: res.ofertaExpiraEn ?? null,
    check_in_en: res.checkInEn ?? null,
    creado_en: res.creadoEn,
  };
}

function reciboToDb(rec: Recibo) {
  return {
    id: rec.id,
    studio_id: rec.studioId ?? STUDIO_ID,
    socio_id: rec.socioId,
    suscripcion_id: rec.suscripcionId ?? null,
    concepto: rec.concepto,
    importe: rec.importe,
    estado: rec.estado,
    fecha_vencimiento: rec.fechaVencimiento,
    fecha_cobro: rec.fechaCobro ?? null,
    fecha_devolucion: rec.fechaDevolucion ?? null,
    intentos_reintento: rec.intentosReintento,
    metodo_cobro: rec.metodoCobro ?? null,
    sepa_estado: rec.sepaEstado ?? null,
    proximo_reintento: rec.proximoReintento ?? null,
  };
}

function citaToDb(cita: Cita) {
  return {
    id: cita.id,
    studio_id: cita.studioId ?? STUDIO_ID,
    socio_id: cita.socioId,
    instructor_id: cita.instructorId,
    tipo: cita.tipo,
    inicio: cita.inicio,
    fin: cita.fin,
    notas: cita.notas ?? null,
    estado: cita.estado,
    precio: cita.precio ?? null,
    pagada: cita.pagada ?? false,
    creado_en: cita.creadoEn,
    servicio_id: cita.servicioId ?? null,
  };
}

export function mapServicioCita(r: RowCitasServicios): ServicioCita {
  return {
    id: r.id,
    studioId: r.studio_id ?? STUDIO_ID,
    nombre: r.nombre,
    tipo: r.tipo as TipoCita,
    duracionMin: r.duracion_min,
    precio: r.precio ?? null,
    autoReservable: r.auto_reservable ?? false,
    color: r.color ?? null,
    descripcion: r.descripcion ?? null,
    activo: r.activo ?? true,
    orden: r.orden ?? 0,
    creadoEn: r.creado_en ?? '',
  };
}

export function mapDisponibilidadCita(r: RowCitasDisponibilidad): DisponibilidadCita {
  return {
    id: r.id,
    studioId: r.studio_id ?? STUDIO_ID,
    instructorId: r.instructor_id ?? '',
    diaSemana: r.dia_semana,
    horaInicio: (r.hora_inicio ?? '').slice(0, 5), // 'HH:MM:SS' → 'HH:MM'
    horaFin: (r.hora_fin ?? '').slice(0, 5),
    creadoEn: r.creado_en ?? '',
  };
}

function ventaPOSToDb(venta: VentaPOS) {
  return {
    id: venta.id,
    studio_id: venta.studioId ?? STUDIO_ID,
    socio_id: venta.socioId ?? null,
    items: venta.items ?? [],
    subtotal: venta.subtotal,
    descuento: venta.descuento,
    total: venta.total,
    metodo_pago: venta.metodoPago,
    notas: venta.notas ?? null,
    realizada_en: venta.realizadaEn,
  };
}

function actividadRecienteToDb(act: ActividadReciente) {
  return {
    id: act.id,
    studio_id: act.studioId ?? STUDIO_ID,
    tipo: act.tipo,
    texto: act.texto,
    socio_id: act.socioId ?? null,
    enlace: act.enlace ?? null,
    creado_en: act.creadoEn,
    actor_nombre: act.actorNombre ?? null,
  };
}

function mensajeEquipoToDb(m: MensajeEquipo) {
  return {
    id: m.id,
    studio_id: m.studioId ?? STUDIO_ID,
    canal_id: m.canalId,
    autor_instructor_id: m.autorInstructorId ?? null,
    autor_nombre: m.autorNombre,
    texto: m.texto,
    creado_en: m.creadoEn,
  };
}

function notaInternaToDb(nota: NotaInterna) {
  return {
    id: nota.id,
    studio_id: nota.studioId ?? STUDIO_ID,
    socio_id: nota.socioId,
    texto: nota.texto,
    tipo: nota.tipo,
    creado_en: nota.creadoEn,
  };
}

function condicionSaludToDb(c: CondicionSalud) {
  return {
    id: c.id,
    studio_id: c.studioId ?? STUDIO_ID,
    socio_id: c.socioId,
    categoria: c.categoria,
    etiqueta: c.etiqueta,
    zona: c.zona,
    restricciones: c.restricciones ?? [],
    severidad: c.severidad,
    estado: c.estado,
    inicio: c.inicio,
    fin: c.fin,
    revisar_en: c.revisarEn,
    notas: c.notas,
    creado_por: c.creadoPor,
    creado_en: c.creadoEn,
    actualizado_en: c.actualizadoEn,
  };
}

function respuestaSesionToDb(r: RespuestaSesionRow) {
  return {
    id: r.id,
    studio_id: r.studioId ?? STUDIO_ID,
    socio_id: r.socioId,
    sesion_id: r.sesionId,
    respuesta: r.respuesta,
    nota: r.nota,
    creado_por: r.creadoPor,
    creado_en: r.creadoEn,
  };
}

function codigoDescuentoToDb(c: CodigoDescuento) {
  return {
    id: c.id,
    studio_id: c.studioId ?? STUDIO_ID,
    codigo: c.codigo,
    descripcion: c.descripcion,
    tipo: c.tipo,
    valor: c.valor,
    usos: c.usos,
    usos_max: c.usosMax,
    expira: c.expira,
    activo: c.activo,
    creado_en: c.creadoEn,
    min_importe: c.minImporte ?? null,
    solo_nuevas: c.soloNuevas ?? false,
  };
}

function notaProgresoToDb(n: NotaProgreso) {
  return {
    id: n.id,
    studio_id: n.studioId ?? STUDIO_ID,
    socio_id: n.socioId,
    instructor_id: n.instructorId,
    sesion_id: n.sesionId,
    texto_libre: n.textoLibre,
    progreso: n.progreso,
    alertas: n.alertas,
    plan_proxima_sesion: n.planProximaSesion,
    ejercicios_casa: n.ejerciciosCasa,
    creada_en: n.creadaEn,
  };
}

function campanaToDb(c: Campana) {
  return {
    id: c.id,
    studio_id: c.studioId ?? STUDIO_ID,
    nombre: c.nombre,
    tipo: c.tipo,
    asunto: c.asunto,
    contenido: c.contenido,
    estado: c.estado,
    destinatarios: c.destinatarios,
    enviados: c.enviados,
    abiertos: c.abiertos,
    clics: c.clics,
    creada_en: c.creadaEn,
    enviada_en: c.enviadaEn ?? null,
    programada_en: c.programadaEn ?? null,
    objetivo: c.objetivo ?? null,
    presupuesto: c.presupuesto ?? null,
    publicaciones: c.publicaciones ?? null,
  };
}

function automatizacionToDb(a: Automatizacion) {
  return {
    id: a.id,
    studio_id: a.studioId ?? STUDIO_ID,
    nombre: a.nombre,
    trigger: a.trigger,
    accion: a.accion,
    asunto: a.asunto ?? null,
    mensaje: a.mensaje,
    activa: a.activa,
    ejecutadas: a.ejecutadas,
    creada_en: a.creadaEn,
    pasos: a.pasos ?? null,
  };
}

function videoOnDemandToDb(v: VideoOnDemand) {
  return {
    id: v.id,
    studio_id: v.studioId ?? STUDIO_ID,
    titulo: v.titulo,
    descripcion: v.descripcion ?? null,
    categoria: v.categoria,
    duracion_minutos: v.duracionMinutos,
    nivel: v.nivel,
    instructor_id: v.instructorId,
    vistas: v.vistas,
    likes: v.likes,
    activo: v.activo,
    creado_en: v.creadoEn,
    stream_uid: v.streamUid ?? null,
  };
}

function postComunidadToDb(p: PostComunidad) {
  return {
    id: p.id,
    studio_id: p.studioId ?? STUDIO_ID,
    autor_id: p.autorId ?? null,
    autor_nombre: p.autorNombre,
    autor_inicial: p.autorInicial,
    texto: p.texto,
    likes: p.likes,
    comentarios_count: p.comentariosCount,
    fijado: p.fijado,
    creado_en: p.creadoEn,
  };
}

// ─── Write functions (fire-and-forget, errors logged to console) ──────────────

export async function dbInsertSocio(socio: Socio): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('socios').insert(socioToDb(socio));
  if (!error) return ESCRITURA_OK;
  // Email duplicado al dar de alta: el choque más común con diferencia, y ya
  // tiene su propio mensaje accionable en mensajeDeFalloAlGuardar ("reactiva
  // su ficha en vez de crear otra"). No es un fallo de sistema — mandarlo a
  // Sentry (auditoría M-5) es ruido de un caso 100% esperado. No se toca el
  // filtro genérico de reportDbError: otros 23505 en otras tablas sí pueden
  // ser un bug real.
  if (error.code === '23505' && /uq_socios_studio_email/i.test(error.message)) {
    console.error('[dbInsertSocio]', error);
    return { ok: false, error: mensajeDeFalloAlGuardar(error) };
  }
  return falloEscritura('[dbInsertSocio]', error);
}

export async function dbUpdateSocio(id: string, changes: Partial<Socio>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('studioId' in changes) db.studio_id = changes.studioId;
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('apellidos' in changes) db.apellidos = changes.apellidos;
  if ('email' in changes) db.email = changes.email;
  if ('telefono' in changes) db.telefono = changes.telefono;
  if ('nif' in changes) db.nif = changes.nif;
  if ('fechaAlta' in changes) db.fecha_alta = changes.fechaAlta;
  if ('activo' in changes) db.activo = changes.activo;
  if ('leadStage' in changes) db.lead_stage = changes.leadStage;
  if ('tags' in changes) db.tags = changes.tags;
  if ('avatar' in changes) db.avatar = changes.avatar;
  if ('stripeCustomerId' in changes) db.stripe_customer_id = changes.stripeCustomerId;
  if ('stripePaymentMethodId' in changes) db.stripe_payment_method_id = changes.stripePaymentMethodId;
  if ('metodoPagoPreferido' in changes) db.metodo_pago_preferido = changes.metodoPagoPreferido;
  if ('sepaMandateId' in changes) db.sepa_mandate_id = changes.sepaMandateId;
  if ('sepaPaymentMethodId' in changes) db.sepa_payment_method_id = changes.sepaPaymentMethodId;
  if ('fechaNacimiento' in changes) db.fecha_nacimiento = changes.fechaNacimiento;
  if ('direccion' in changes) db.direccion = changes.direccion;
  if ('fotoUrl' in changes) db.foto_url = changes.fotoUrl;
  if ('referidoPor' in changes) db.referido_por = changes.referidoPor;
  if ('origenLead' in changes) db.origen_lead = changes.origenLead;
  if ('camposExtra' in changes) db.campos_extra = changes.camposExtra ?? {};
  if ('aceptacionContrato' in changes) {
    db.aceptacion_fecha = changes.aceptacionContrato?.fecha ?? null;
    db.aceptacion_firma = changes.aceptacionContrato?.firma ?? null;
    db.aceptacion_version = changes.aceptacionContrato?.versionTexto ?? null;
    db.aceptacion_origen = changes.aceptacionContrato?.origen ?? null;
    db.aceptacion_por = changes.aceptacionContrato?.introducidaPor ?? null;
  }
  if ('consentimientoSalud' in changes) {
    db.consentimiento_salud_fecha = changes.consentimientoSalud?.fecha ?? null;
    db.consentimiento_salud_registrado_por = changes.consentimientoSalud?.registradoPor ?? null;
  }
  if ('consentimientoMarketing' in changes) {
    db.consentimiento_marketing_en = changes.consentimientoMarketing?.fecha ?? null;
    db.consentimiento_marketing_texto = changes.consentimientoMarketing?.texto ?? null;
    db.consentimiento_marketing_por = changes.consentimientoMarketing?.registradoPor ?? null;
  }
  const { error } = await supabase.from('socios').update(db).eq('id', id);
  return error ? falloEscritura('[dbUpdateSocio]', error) : ESCRITURA_OK;
}

// A-3/A-4: la baja de una socia NO borra la fila (destruía recibos/facturas con
// obligación fiscal, o fallaba a medias por las FK RESTRICT). Pasa por
// /api/socios/eliminar, que anonimiza el PII, marca el borrado lógico, conserva
// el rastro fiscal y elimina los datos personales sin base de retención.
// Devuelve el error en vez de tragárselo. Antes solo lo reportaba, así que
// quien llamaba no podía distinguir "borrada" de "el servidor dijo que no", y la
// UI pintaba la baja igualmente: la clienta desaparecía de la lista y reaparecía
// al recargar. Una instructora (que no tiene permiso) veía exactamente eso.
export async function dbDeleteSocio(id: string): Promise<{ error: string | null }> {
  try {
    const res = await fetch('/api/socios/eliminar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await staffAuthHeader()) },
      body: JSON.stringify({ socioId: id }),
    });
    if (!res.ok) {
      const cuerpo = await res.json().catch(() => ({ status: res.status }));
      reportDbError('[dbDeleteSocio]', cuerpo);
      return { error: (cuerpo as { error?: string }).error || 'No se ha podido dar de baja a la clienta.' };
    }
    return { error: null };
  } catch (e) {
    reportDbError('[dbDeleteSocio]', e);
    return { error: 'No se ha podido dar de baja a la clienta. Revisa tu conexión.' };
  }
}

// ── Campos personalizados de socia ──────────────────────────────────────────
// Definición por estudio (RLS scoped). Los valores viven en socios.campos_extra.
function campoToDb(c: CampoPersonalizado) {
  return {
    id: c.id,
    studio_id: c.studioId ?? STUDIO_ID,
    etiqueta: c.etiqueta,
    tipo: c.tipo,
    opciones: c.opciones ?? [],
    requerido: c.requerido,
    orden: c.orden,
    activo: c.activo,
  };
}

export async function dbFetchCamposPersonalizados(): Promise<CampoPersonalizado[]> {
  const { data, error } = await supabase
    .from('campos_personalizados')
    .select('*')
    .order('orden', { ascending: true });
  if (error) { reportDbError('[dbFetchCamposPersonalizados]', error); return []; }
  return (data ?? []).map(r => mapCampoPersonalizado(r as RowCamposPersonalizados));
}

export async function dbInsertCampoPersonalizado(campo: CampoPersonalizado): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('campos_personalizados').insert(campoToDb(campo));
  return error ? falloEscritura('[dbInsertCampoPersonalizado]', error) : ESCRITURA_OK;
}

export async function dbUpdateCampoPersonalizado(id: string, changes: Partial<CampoPersonalizado>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('etiqueta' in changes) db.etiqueta = changes.etiqueta;
  if ('tipo' in changes) db.tipo = changes.tipo;
  if ('opciones' in changes) db.opciones = changes.opciones ?? [];
  if ('requerido' in changes) db.requerido = changes.requerido;
  if ('orden' in changes) db.orden = changes.orden;
  if ('activo' in changes) db.activo = changes.activo;
  const { error } = await supabase.from('campos_personalizados').update(db).eq('id', id);
  return error ? falloEscritura('[dbUpdateCampoPersonalizado]', error) : ESCRITURA_OK;
}

export async function dbDeleteCampoPersonalizado(id: string): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('campos_personalizados').delete().eq('id', id);
  return error ? falloEscritura('[dbDeleteCampoPersonalizado]', error) : ESCRITURA_OK;
}

// ── Cuestionario de salud configurable (Fase 1, ficha Lorari-vs-Tentare) ────
// Mismo esqueleto que campos personalizados, pero RLS acotada a
// PROPIETARIO/INSTRUCTOR (dato de salud) — ver migr 20260812200000.
function mapPlantillaCuestionarioSalud(r: RowPlantillasCuestionarioSalud): PlantillaCuestionarioSalud {
  return {
    id: r.id,
    studioId: r.studio_id,
    pregunta: r.pregunta,
    tipoRespuesta: (r.tipo_respuesta ?? 'texto') as PlantillaCuestionarioSalud['tipoRespuesta'],
    opciones: r.opciones ?? [],
    orden: r.orden,
    activo: r.activo,
  };
}

function plantillaCuestionarioSaludToDb(p: PlantillaCuestionarioSalud) {
  return {
    id: p.id,
    studio_id: p.studioId ?? STUDIO_ID,
    pregunta: p.pregunta,
    tipo_respuesta: p.tipoRespuesta,
    opciones: p.opciones ?? [],
    orden: p.orden,
    activo: p.activo,
  };
}

export async function dbFetchPlantillasCuestionarioSalud(): Promise<PlantillaCuestionarioSalud[]> {
  const { data, error } = await supabase
    .from('plantillas_cuestionario_salud')
    .select('*')
    .order('orden', { ascending: true });
  if (error) { reportDbError('[dbFetchPlantillasCuestionarioSalud]', error); return []; }
  return (data ?? []).map(r => mapPlantillaCuestionarioSalud(r as RowPlantillasCuestionarioSalud));
}

export async function dbInsertPlantillaCuestionarioSalud(p: PlantillaCuestionarioSalud): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('plantillas_cuestionario_salud').insert(plantillaCuestionarioSaludToDb(p));
  return error ? falloEscritura('[dbInsertPlantillaCuestionarioSalud]', error) : ESCRITURA_OK;
}

export async function dbUpdatePlantillaCuestionarioSalud(id: string, changes: Partial<PlantillaCuestionarioSalud>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('pregunta' in changes) db.pregunta = changes.pregunta;
  if ('tipoRespuesta' in changes) db.tipo_respuesta = changes.tipoRespuesta;
  if ('opciones' in changes) db.opciones = changes.opciones ?? [];
  if ('orden' in changes) db.orden = changes.orden;
  if ('activo' in changes) db.activo = changes.activo;
  const { error } = await supabase.from('plantillas_cuestionario_salud').update(db).eq('id', id);
  return error ? falloEscritura('[dbUpdatePlantillaCuestionarioSalud]', error) : ESCRITURA_OK;
}

export async function dbDeletePlantillaCuestionarioSalud(id: string): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('plantillas_cuestionario_salud').delete().eq('id', id);
  return error ? falloEscritura('[dbDeletePlantillaCuestionarioSalud]', error) : ESCRITURA_OK;
}

function mapRespuestaCuestionarioSalud(r: RowRespuestasCuestionarioSalud): RespuestaCuestionarioSalud {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    preguntaId: r.pregunta_id,
    respuesta: r.respuesta,
    creadoPor: r.creado_por,
    creadoEn: r.creado_en ?? '',
    actualizadoEn: r.actualizado_en ?? '',
  };
}

export async function dbFetchRespuestasCuestionarioSalud(): Promise<RespuestaCuestionarioSalud[]> {
  const { data, error } = await supabase.from('respuestas_cuestionario_salud').select('*');
  if (error) { reportDbError('[dbFetchRespuestasCuestionarioSalud]', error); return []; }
  return (data ?? []).map(r => mapRespuestaCuestionarioSalud(r as RowRespuestasCuestionarioSalud));
}

// Una fila por (socioId, preguntaId) — upsert por el UNIQUE de la migración,
// así "guardar" sirve igual para la primera respuesta que para corregirla.
export async function dbUpsertRespuestaCuestionarioSalud(r: {
  id: string; studioId: string; socioId: string; preguntaId: string; respuesta: string | null; creadoPor: string | null;
}): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('respuestas_cuestionario_salud').upsert({
    id: r.id, studio_id: r.studioId, socio_id: r.socioId, pregunta_id: r.preguntaId,
    respuesta: r.respuesta, creado_por: r.creadoPor, actualizado_en: new Date().toISOString(),
  }, { onConflict: 'socio_id,pregunta_id' });
  return error ? falloEscritura('[dbUpsertRespuestaCuestionarioSalud]', error) : ESCRITURA_OK;
}

// ── Riesgo de concentración por instructor ──────────────────────────────────
function mapDependencySnapshot(r: RowInstructorDependencySnapshots): InstructorDependencySnapshot {
  return {
    id: r.id,
    studioId: r.studio_id ?? '',
    instructorId: r.instructor_id ?? '',
    periodoInicio: r.periodo_inicio ?? '',
    periodoFin: r.periodo_fin ?? '',
    ventanaDias: r.ventana_dias ?? 90,
    alumnasTotal: r.alumnas_total ?? 0,
    alumnasCautivasCount: r.alumnas_cautivas_count ?? 0,
    ingresosCautivos: Number(r.ingresos_cautivos ?? 0),
    ingresosTotalEstudio: Number(r.ingresos_total_estudio ?? 0),
    porcentajeFacturacion: Number(r.porcentaje_facturacion ?? 0),
    nivelRiesgo: (r.nivel_riesgo ?? 'BAJO') as InstructorDependencySnapshot['nivelRiesgo'],
    detalle: r.detalle ?? [],
    calculadoEn: r.calculado_en ?? '',
  };
}

export async function dbFetchDependencySnapshots(): Promise<InstructorDependencySnapshot[]> {
  const { data, error } = await supabase
    .from('instructor_dependency_snapshots')
    .select('*');
  if (error) { reportDbError('[dbFetchDependencySnapshots]', error); return []; }
  return (data ?? []).map(r => mapDependencySnapshot(r as RowInstructorDependencySnapshots));
}

// ── Plantillas de email (override por estudio) ──────────────────────────────
function mapPlantillaEmail(r: RowPlantillasEmail): PlantillaEmail {
  return {
    id: r.id,
    studioId: r.studio_id ?? '',
    tipo: r.tipo as PlantillaEmail['tipo'],
    asunto: r.asunto ?? null,
    intro: r.intro ?? null,
    activa: r.activa ?? true,
    cuerpo: r.cuerpo ?? null,
    botonTexto: r.boton_texto ?? null,
    colorCabecera: r.color_cabecera ?? null,
    colorBoton: r.color_boton ?? null,
    logoUrl: r.logo_url ?? null,
    pie: r.pie ?? null,
    fuente: (r.fuente as PlantillaEmail['fuente']) ?? null,
  };
}

export async function dbFetchPlantillasEmail(): Promise<PlantillaEmail[]> {
  const { data, error } = await supabase.from('plantillas_email').select('*');
  if (error) { reportDbError('[dbFetchPlantillasEmail]', error); return []; }
  return (data ?? []).map(r => mapPlantillaEmail(r as RowPlantillasEmail));
}

// Upsert por (studio_id, tipo): un override por estudio y tipo de email.
export async function dbUpsertPlantillaEmail(p: PlantillaEmail): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('plantillas_email').upsert({
    id: p.id,
    studio_id: p.studioId ?? STUDIO_ID,
    tipo: p.tipo,
    asunto: p.asunto,
    intro: p.intro,
    activa: p.activa,
    cuerpo: p.cuerpo,
    boton_texto: p.botonTexto,
    color_cabecera: p.colorCabecera,
    color_boton: p.colorBoton,
    logo_url: p.logoUrl,
    pie: p.pie,
    fuente: p.fuente,
    actualizado_en: new Date().toISOString(),
  }, { onConflict: 'studio_id,tipo' });
  return error ? falloEscritura('[dbUpsertPlantillaEmail]', error) : ESCRITURA_OK;
}

// ── Comentarios de Comunidad ────────────────────────────────────────────────
// Persisten vía /api/comunidad/comentarios (server-authoritative). Antes solo
// vivían en un useState y se perdían al refrescar.
export async function dbListComentariosComunidad(): Promise<ComentarioComunidad[]> {
  try {
    const res = await fetch('/api/comunidad/comentarios', {
      headers: { ...(await staffAuthHeader()) },
    });
    if (!res.ok) {
      reportDbError('[dbListComentariosComunidad]', await res.json().catch(() => ({ status: res.status })));
      return [];
    }
    const data = (await res.json()) as { comentarios?: ComentarioComunidad[] };
    return data.comentarios ?? [];
  } catch (e) {
    reportDbError('[dbListComentariosComunidad]', e);
    return [];
  }
}

export async function dbAddComentarioComunidad(postId: string, texto: string): Promise<ComentarioComunidad | null> {
  try {
    const res = await fetch('/api/comunidad/comentarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await staffAuthHeader()) },
      body: JSON.stringify({ postId, texto }),
    });
    if (!res.ok) {
      reportDbError('[dbAddComentarioComunidad]', await res.json().catch(() => ({ status: res.status })));
      return null;
    }
    const data = (await res.json()) as { comentario?: ComentarioComunidad };
    return data.comentario ?? null;
  } catch (e) {
    reportDbError('[dbAddComentarioComunidad]', e);
    return null;
  }
}

/** Deja `plan_tipos_clase` exactamente con los tipos indicados (vacío = borra
 *  todo, que significa "cubre todas"). Se reemplaza en bloque: son 0-N filas. */
async function sincronizarTiposDePlan(planId: string, studioId: string, tipos: string[] | undefined) {
  if (tipos === undefined) return; // no se tocó el campo
  const { error: errDel } = await supabase.from('plan_tipos_clase').delete().eq('plan_id', planId);
  if (errDel) { reportDbError('[sincronizarTiposDePlan:delete]', errDel); return; }
  if (tipos.length === 0) return;
  const { error } = await supabase.from('plan_tipos_clase').insert(
    tipos.map(t => ({ plan_id: planId, tipo_clase_id: t, studio_id: studioId })),
  );
  if (error) reportDbError('[sincronizarTiposDePlan:insert]', error);
}

export async function dbInsertPlanTarifa(plan: PlanTarifa): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('planes_tarifa').insert(planTarifaToDb(plan));
  if (error) return falloEscritura('[dbInsertPlanTarifa]', error);
  await sincronizarTiposDePlan(plan.id, plan.studioId ?? STUDIO_ID, plan.tiposClaseIds);
  return ESCRITURA_OK;
}

export async function dbUpdatePlanTarifa(id: string, changes: Partial<PlanTarifa>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('descripcion' in changes) db.descripcion = changes.descripcion;
  if ('precio' in changes) db.precio = changes.precio;
  if ('tipo' in changes) db.tipo = changes.tipo;
  if ('sesiones' in changes) db.sesiones = changes.sesiones;
  if ('validezDias' in changes) db.validez_dias = changes.validezDias;
  if ('limiteSemanal' in changes) db.limite_semanal = changes.limiteSemanal;
  if ('activo' in changes) db.activo = changes.activo;
  const { error } = await supabase.from('planes_tarifa').update(db).eq('id', id);
  if (error) return falloEscritura('[dbUpdatePlanTarifa]', error);
  if ('tiposClaseIds' in changes) {
    const { data: fila } = await supabase.from('planes_tarifa').select('studio_id').eq('id', id).maybeSingle();
    if (fila?.studio_id) await sincronizarTiposDePlan(id, fila.studio_id as string, changes.tiposClaseIds);
  }
  return ESCRITURA_OK;
}

export async function dbDeletePlanTarifa(id: string): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('planes_tarifa').delete().eq('id', id);
  return error ? falloEscritura('[dbDeletePlanTarifa]', error) : ESCRITURA_OK;
}

// ─── Citas: catálogo de servicios (0046) — escritura del panel (anon + RLS) ───
function servicioCitaToDb(s: ServicioCita) {
  return {
    id: s.id,
    studio_id: s.studioId ?? STUDIO_ID,
    nombre: s.nombre,
    tipo: s.tipo,
    duracion_min: s.duracionMin,
    precio: s.precio ?? null,
    auto_reservable: s.autoReservable ?? false,
    color: s.color ?? null,
    descripcion: s.descripcion ?? null,
    activo: s.activo ?? true,
    orden: s.orden ?? 0,
    creado_en: s.creadoEn || new Date().toISOString(),
  };
}

export async function dbInsertServicioCita(s: ServicioCita): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('citas_servicios').insert(servicioCitaToDb(s));
  return error ? falloEscritura('[dbInsertServicioCita]', error) : ESCRITURA_OK;
}

export async function dbUpdateServicioCita(id: string, changes: Partial<ServicioCita>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('tipo' in changes) db.tipo = changes.tipo;
  if ('duracionMin' in changes) db.duracion_min = changes.duracionMin;
  if ('precio' in changes) db.precio = changes.precio ?? null;
  if ('autoReservable' in changes) db.auto_reservable = changes.autoReservable;
  if ('color' in changes) db.color = changes.color ?? null;
  if ('descripcion' in changes) db.descripcion = changes.descripcion ?? null;
  if ('activo' in changes) db.activo = changes.activo;
  if ('orden' in changes) db.orden = changes.orden;
  const { error } = await supabase.from('citas_servicios').update(db).eq('id', id);
  return error ? falloEscritura('[dbUpdateServicioCita]', error) : ESCRITURA_OK;
}

export async function dbDeleteServicioCita(id: string): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('citas_servicios').delete().eq('id', id);
  return error ? falloEscritura('[dbDeleteServicioCita]', error) : ESCRITURA_OK;
}

// ─── Citas: horario fino por instructora (0046) — reemplazo atómico de franjas ─
// El editor guarda TODAS las franjas de una instructora a la vez: borramos las
// suyas y reinsertamos las nuevas. Scopeado por studio+instructor (RLS refuerza).
export async function dbReplaceDisponibilidadCitas(
  studioId: string, instructorId: string, franjas: DisponibilidadCita[],
): Promise<ResultadoEscritura> {
  const { error: delErr } = await supabase.from('citas_disponibilidad')
    .delete().eq('studio_id', studioId).eq('instructor_id', instructorId);
  if (delErr) return falloEscritura('[dbReplaceDisponibilidadCitas:del]', delErr);
  if (franjas.length === 0) return ESCRITURA_OK;
  const rows = franjas.map((f) => ({
    id: f.id,
    studio_id: f.studioId ?? studioId,
    instructor_id: f.instructorId ?? instructorId,
    dia_semana: f.diaSemana,
    hora_inicio: f.horaInicio,
    hora_fin: f.horaFin,
    creado_en: f.creadoEn || new Date().toISOString(),
  }));
  const { error: insErr } = await supabase.from('citas_disponibilidad').insert(rows);
  return insErr ? falloEscritura('[dbReplaceDisponibilidadCitas:ins]', insErr) : ESCRITURA_OK;
}

// ── Productos POS ──────────────────────────────────────────────────────────────
export async function dbInsertProductoPOS(prod: ProductoPOS): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('productos_pos').insert({
    id: prod.id,
    studio_id: prod.studioId ?? STUDIO_ID,
    nombre: prod.nombre,
    categoria: prod.categoria,
    precio: prod.precio,
    activo: prod.activo,
  });
  return error ? falloEscritura('[dbInsertProductoPOS]', error) : ESCRITURA_OK;
}
export async function dbUpdateProductoPOS(id: string, changes: Partial<ProductoPOS>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('categoria' in changes) db.categoria = changes.categoria;
  if ('precio' in changes) db.precio = changes.precio;
  if ('activo' in changes) db.activo = changes.activo;
  const { error } = await supabase.from('productos_pos').update(db).eq('id', id);
  return error ? falloEscritura('[dbUpdateProductoPOS]', error) : ESCRITURA_OK;
}
export async function dbDeleteProductoPOS(id: string): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('productos_pos').delete().eq('id', id);
  return error ? falloEscritura('[dbDeleteProductoPOS]', error) : ESCRITURA_OK;
}

// B0.2: reintento acotado ante una violación de FK TRANSITORIA (23503). El alta
// de una socia encadena su suscripción y su recibo al ok de `dbInsertSocio`,
// pero aun así se han visto casos raros en los que la fila de `socios` todavía
// no es visible al insertar la referida (commit-race) → 23503 (Sentry NEXTJS-4/-3).
// La fila referida aparece en unos ms; se reintenta con backoff corto en vez de
// dejar pasar el error. Si tras los intentos sigue ausente, se reporta igual: no
// enmascara una FK realmente rota (solo reintenta ese código+constraint concretos).
async function conReintentoFK<T extends { error: { code: string; message: string } | null }>(
  constraint: string | string[],
  insertar: () => PromiseLike<T>,
): Promise<T> {
  const constraints = Array.isArray(constraint) ? constraint : [constraint];
  let res = await insertar();
  for (let i = 0; i < 3 && res.error?.code === '23503' && constraints.some(c => res.error!.message.includes(c)); i++) {
    await new Promise((r) => setTimeout(r, 150 * (i + 1)));
    res = await insertar();
  }
  return res;
}

export async function dbInsertSuscripcion(sus: Suscripcion): Promise<ResultadoEscritura> {
  const { error } = await conReintentoFK('suscripciones_socio_id_fkey', () =>
    supabase.from('suscripciones').insert(suscripcionToDb(sus)),
  );
  return error ? falloEscritura('[dbInsertSuscripcion]', error) : ESCRITURA_OK;
}

export async function dbUpdateSuscripcion(id: string, changes: Partial<Suscripcion>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('socioId' in changes) db.socio_id = changes.socioId;
  if ('planId' in changes) db.plan_id = changes.planId;
  if ('estado' in changes) db.estado = changes.estado;
  if ('fechaInicio' in changes) db.fecha_inicio = changes.fechaInicio;
  if ('fechaFin' in changes) db.fecha_fin = changes.fechaFin;
  if ('sesionesRestantes' in changes) db.sesiones_restantes = changes.sesionesRestantes;
  if ('stripeSubscriptionId' in changes) db.stripe_subscription_id = changes.stripeSubscriptionId;
  const { error } = await supabase.from('suscripciones').update(db).eq('id', id);
  return error ? falloEscritura('[dbUpdateSuscripcion]', error) : ESCRITURA_OK;
}

// F2 (B2.8): congelar = ventana + estado PAUSADA, atómico en el servidor.
export async function dbCongelarSuscripcion(susId: string, studioId: string, motivo: string | null): Promise<ResultadoEscritura> {
  const { error } = await supabase.rpc('congelar_suscripcion', {
    p_id: `cong-${uid()}`,
    p_suscripcion_id: susId,
    p_studio_id: studioId,
    p_motivo: motivo,
  });
  return error ? falloEscritura('[dbCongelarSuscripcion]', error) : ESCRITURA_OK;
}

// F2 (B2.8): descongelar = cierra ventana + empuja fecha_fin + ACTIVA. Devuelve
// la nueva fecha_fin junto con el resultado — antes colapsaba "sin fecha porque
// no aplica" y "falló la RPC" en el mismo `null`, así que quien llamaba nunca
// podía deshacer el estado ACTIVA optimista si la RPC fallaba de verdad.
export async function dbDescongelarSuscripcion(
  susId: string, studioId: string,
): Promise<{ ok: true; fechaFin: string | null } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('descongelar_suscripcion', {
    p_suscripcion_id: susId,
    p_studio_id: studioId,
  });
  if (error) {
    reportDbError('[dbDescongelarSuscripcion]', error);
    return { ok: false, error: mensajeDeFalloAlGuardar(error) };
  }
  return { ok: true, fechaFin: (data as string | null) ?? null };
}

// F2 (B2.7): averías de máquina. Carga las del estudio (recientes/abiertas).
export async function dbListBloqueosMaquina(studioId: string): Promise<BloqueoMaquina[]> {
  const { data, error } = await supabase
    .from('bloqueos_maquina').select('*').eq('studio_id', studioId)
    .order('desde', { ascending: false });
  if (error) { reportDbError('[dbListBloqueosMaquina]', error); return []; }
  return (data ?? []).map(mapBloqueoMaquina);
}

export async function dbInsertBloqueoMaquina(b: BloqueoMaquina): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('bloqueos_maquina').insert(bloqueoMaquinaToDb(b));
  return error ? falloEscritura('[dbInsertBloqueoMaquina]', error) : ESCRITURA_OK;
}

// Cerrar una avería = fijar `hasta` (por defecto ahora → la máquina vuelve al aforo).
export async function dbCerrarBloqueoMaquina(id: string, hastaISO: string): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('bloqueos_maquina').update({ hasta: hastaISO }).eq('id', id);
  return error ? falloEscritura('[dbCerrarBloqueoMaquina]', error) : ESCRITURA_OK;
}

// F2 (B2.2): plazas fijas. Capa de datos (la materialización + UI llegan en 4b/4c).
export async function dbListPlazasFijas(studioId: string): Promise<PlazaFija[]> {
  const { data, error } = await supabase
    .from('plazas_fijas').select('*').eq('studio_id', studioId)
    .order('dia_semana', { ascending: true }).order('hora_inicio', { ascending: true });
  if (error) { reportDbError('[dbListPlazasFijas]', error); return []; }
  return (data ?? []).map(mapPlazaFija);
}

export async function dbInsertPlazaFija(p: PlazaFija): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.from('plazas_fijas').insert(plazaFijaToDb(p));
  if (error) {
    reportDbError('[dbInsertPlazaFija]', error);
    // Violación de la exclusión GiST = ese sitio ya está pillado en ese slot.
    if (error.message.includes('plazas_fijas_spot_sin_solape')) {
      return { error: 'Ese sitio ya está asignado a otra socia en ese día y hora' };
    }
    return { error: error.message };
  }
  return { ok: true };
}

export async function dbUpdatePlazaFija(id: string, changes: Partial<PlazaFija>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('diaSemana' in changes) db.dia_semana = changes.diaSemana;
  if ('horaInicio' in changes) db.hora_inicio = changes.horaInicio;
  if ('salaId' in changes) db.sala_id = changes.salaId;
  if ('tipoClaseId' in changes) db.tipo_clase_id = changes.tipoClaseId;
  if ('spotId' in changes) db.spot_id = changes.spotId;
  if ('vigenciaDesde' in changes) db.vigencia_desde = changes.vigenciaDesde;
  if ('vigenciaHasta' in changes) db.vigencia_hasta = changes.vigenciaHasta;
  if ('estado' in changes) db.estado = changes.estado;
  const { error } = await supabase.from('plazas_fijas').update(db).eq('id', id);
  return error ? falloEscritura('[dbUpdatePlazaFija]', error) : ESCRITURA_OK;
}

// F2 (B2.3): recuperaciones. La caducidad + el tope (4) los resuelve la RPC.
export async function dbCrearRecuperacion(
  studioId: string, socioId: string, origenReservaId: string | null, motivo: string | null,
): Promise<'CREADA' | 'TOPE' | 'ERROR'> {
  const { data, error } = await supabase.rpc('crear_recuperacion', {
    p_id: `recup-${uid()}`,
    p_studio_id: studioId,
    p_socio_id: socioId,
    p_origen_reserva_id: origenReservaId,
    p_motivo: motivo,
  });
  if (error) { reportDbError('[dbCrearRecuperacion]', error); return 'ERROR'; }
  return (data as 'CREADA' | 'TOPE') ?? 'ERROR';
}

export async function dbListRecuperaciones(studioId: string): Promise<Recuperacion[]> {
  const { data, error } = await supabase
    .from('recuperaciones').select('*').eq('studio_id', studioId)
    .order('creada_en', { ascending: false });
  if (error) { reportDbError('[dbListRecuperaciones]', error); return []; }
  return (data ?? []).map(mapRecuperacion);
}

export async function dbAnularRecuperacion(id: string): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('recuperaciones').update({ estado: 'ANULADA' }).eq('id', id);
  return error ? falloEscritura('[dbAnularRecuperacion]', error) : ESCRITURA_OK;
}

// F2 (B2.9): excepciones por socia. El toggle = poner (upsert) / quitar (delete).
export function mapSocioExcepcion(r: RowSocioExcepciones): SocioExcepcion {
  return {
    id: r.id,
    studioId: r.studio_id,
    socioId: r.socio_id,
    tipo: r.tipo,
    motivo: r.motivo ?? null,
    creadaEn: r.creada_en,
  };
}

export async function dbPonerExcepcion(studioId: string, socioId: string, tipo: string, motivo: string | null): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('socio_excepciones').upsert(
    { id: `exc-${uid()}`, studio_id: studioId, socio_id: socioId, tipo, motivo },
    { onConflict: 'studio_id,socio_id,tipo' },
  );
  return error ? falloEscritura('[dbPonerExcepcion]', error) : ESCRITURA_OK;
}

export async function dbQuitarExcepcion(studioId: string, socioId: string, tipo: string): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('socio_excepciones')
    .delete().eq('studio_id', studioId).eq('socio_id', socioId).eq('tipo', tipo);
  return error ? falloEscritura('[dbQuitarExcepcion]', error) : ESCRITURA_OK;
}

// F2 (B2.10): mandatos SEPA (cuaderno 19.14). El toggle es upsert por (studio,socio).
export function mapMandatoSepa(r: RowMandatosSepa): MandatoSEPA {
  return {
    id: r.id, studioId: r.studio_id, socioId: r.socio_id,
    iban: r.iban, refMandato: r.ref_mandato, fechaFirma: r.fecha_firma,
    estado: (r.estado as MandatoSEPA['estado']) ?? 'VIGENTE', creadaEn: r.creada_en,
  };
}

export async function dbUpsertMandatoSepa(m: MandatoSEPA): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('mandatos_sepa').upsert({
    id: m.id, studio_id: m.studioId, socio_id: m.socioId, iban: m.iban,
    ref_mandato: m.refMandato, fecha_firma: m.fechaFirma, estado: m.estado,
  }, { onConflict: 'id' });
  return error ? falloEscritura('[dbUpsertMandatoSepa]', error) : ESCRITURA_OK;
}

export async function dbCancelarMandatoSepa(id: string): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('mandatos_sepa').update({ estado: 'CANCELADO' }).eq('id', id);
  return error ? falloEscritura('[dbCancelarMandatoSepa]', error) : ESCRITURA_OK;
}

export async function dbInsertSesion(ses: Sesion): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('sesiones').insert(sesionToDb(ses));
  return error ? falloEscritura('[dbInsertSesion]', error) : ESCRITURA_OK;
}

// Inserta muchas sesiones en UNA sola llamada (creación de serie recurrente,
// I-3): sustituye a los N inserts secuenciales sin rollback ni aviso. Al ser un
// solo insert, Postgres lo aplica entero o nada: si falla, no queda media serie.
export async function dbInsertSesionesBatch(sesiones: Sesion[]): Promise<ResultadoEscritura> {
  if (sesiones.length === 0) return ESCRITURA_OK;
  const { error } = await supabase.from('sesiones').insert(sesiones.map(sesionToDb));
  return error ? falloEscritura('[dbInsertSesionesBatch]', error) : ESCRITURA_OK;
}

// Aplica los mismos cambios a varias sesiones (editar/cancelar "esta y futuras"
// de una serie) en una sola llamada. Solo para cambios uniformes (no inicio/fin,
// que varían por sesión — esos se hacen por sesión).
export async function dbUpdateSesionesBatch(ids: string[], changes: Partial<Sesion>): Promise<ResultadoEscritura> {
  if (ids.length === 0) return ESCRITURA_OK;
  const db: Record<string, unknown> = {};
  if ('tipoClaseId' in changes) db.tipo_clase_id = changes.tipoClaseId;
  if ('salaId' in changes) db.sala_id = changes.salaId;
  if ('instructorId' in changes) db.instructor_id = changes.instructorId;
  if ('aforoMaximo' in changes) db.aforo_maximo = changes.aforoMaximo;
  if ('cancelada' in changes) db.cancelada = changes.cancelada;
  if ('notas' in changes) db.notas = changes.notas;
  if (Object.keys(db).length === 0) return ESCRITURA_OK;
  const { error } = await supabase.from('sesiones').update(db).in('id', ids);
  return error ? falloEscritura('[dbUpdateSesionesBatch]', error) : ESCRITURA_OK;
}

export async function dbUpdateSesion(id: string, changes: Partial<Sesion>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('tipoClaseId' in changes) db.tipo_clase_id = changes.tipoClaseId;
  if ('salaId' in changes) db.sala_id = changes.salaId;
  if ('instructorId' in changes) db.instructor_id = changes.instructorId;
  if ('inicio' in changes) db.inicio = changes.inicio;
  if ('fin' in changes) db.fin = changes.fin;
  if ('aforoMaximo' in changes) db.aforo_maximo = changes.aforoMaximo;
  if ('cancelada' in changes) db.cancelada = changes.cancelada;
  if ('notas' in changes) db.notas = changes.notas;
  if ('precioPuntual' in changes) db.precio_puntual = changes.precioPuntual;
  if ('googleEventId' in changes) db.google_event_id = changes.googleEventId;
  if ('serieId' in changes) db.serie_id = changes.serieId;
  if ('incidenciaTexto' in changes) db.incidencia_texto = changes.incidenciaTexto;
  const { error } = await supabase.from('sesiones').update(db).eq('id', id);
  return error ? falloEscritura('[dbUpdateSesion]', error) : ESCRITURA_OK;
}

// Edita "esta y las siguientes" de una serie en UNA transacción (RPC 0114). Antes
// eran N escrituras no atómicas (lote de campos uniformes + un UPDATE de hora por
// sesión): si el lote iba bien y una hora fallaba por solape, la BD quedaba a
// medias y el panel se deshacía entero → divergían hasta recargar. La RPC lo hace
// todo-o-nada: reconstruye la hora por sesión (fecha local + hora, en Madrid) y si
// cualquier sesión solapa hace rollback completo y devuelve un único error (23P01,
// que lib/errores traduce a "esa sala/instructora ya tiene clase a esa hora").
// Devuelve además `count`: filas realmente afectadas por el UPDATE (la RPC lo
// calcula con `get diagnostics`). Sin optimistic locking en el esquema (no hay
// `updated_at` en `sesiones`), es la única señal barata de que la serie
// cambió entre que el panel cargó su snapshot y este guardado — el llamante
// la compara contra el número de sesiones que ÉL esperaba tocar.
export async function dbUpdateSerieDesde(
  studioId: string,
  sesionOrigenId: string,
  cambios: {
    tipoClaseId: string; salaId: string; instructorId: string;
    aforoMaximo: number; notas: string | null;
    horaInicio: string; horaFin: string;
  },
): Promise<ResultadoEscritura & { count?: number }> {
  const { data, error } = await supabase.rpc('editar_serie_desde', {
    p_studio_id: studioId,
    p_sesion_origen_id: sesionOrigenId,
    p_tipo_clase_id: cambios.tipoClaseId,
    p_sala_id: cambios.salaId,
    p_instructor_id: cambios.instructorId,
    p_aforo_maximo: cambios.aforoMaximo,
    p_notas: cambios.notas,
    p_hora_inicio: cambios.horaInicio,
    p_hora_fin: cambios.horaFin,
  });
  return error ? falloEscritura('[dbUpdateSerieDesde]', error) : { ...ESCRITURA_OK, count: data as number };
}

export async function dbDeleteSesion(id: string): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('sesiones').delete().eq('id', id);
  return error ? falloEscritura('[dbDeleteSesion]', error) : ESCRITURA_OK;
}

export async function dbInsertReserva(res: Reserva) {
  const { error } = await supabase.from('reservas').insert(reservaToDb(res));
  if (error) reportDbError('[dbInsertReserva]', error);
}

// Reserva ATÓMICA desde el panel (sesión autenticada de staff): la RPC decide
// aforo/lista de espera con bloqueo de fila y aísla por estudio. Sustituye al
// insert directo (read-decide-insert no atómico → sobreventa).
export async function dbReservarPlaza(
  studioId: string, sesionId: string, socioId: string, reservaId: string,
): Promise<{ estado: string; posicionEspera: number | null } | { error: string }> {
  const { data, error } = await supabase.rpc('reservar_plaza', {
    p_studio_id: studioId, p_sesion_id: sesionId, p_socio_id: socioId, p_reserva_id: reservaId,
  });
  if (error) {
    reportDbError('[dbReservarPlaza]', error);
    if (error.message.includes('LIMITE_SEMANAL')) return { error: 'Ha alcanzado el máximo de clases por semana de su plan' };
    return { error: error.message };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { estado: row?.estado ?? 'CONFIRMADA', posicionEspera: row?.posicion_espera ?? null };
}

// Cancelación + promoción de lista de espera ATÓMICAS desde el panel.
export async function dbCancelarReservaPlaza(
  studioId: string, reservaId: string,
): Promise<{
  eraConfirmada: boolean; promovidaSocioId: string | null; devolverBono: boolean;
  // Fase 2b (migr 20260731130500): mutuamente excluyente con promovidaSocioId
  // — solo relleno si el estudio/tipo de clase exige plazo de aceptación
  // (lista_espera_plazo_aceptacion_minutos > 0), en cuyo caso NO se confirmó
  // sola, se le abrió una oferta con ese plazo.
  ofertaSocioId: string | null; ofertaExpiraEn: string | null;
  // Fase 3 (migr 20260730225253): id de la fila en `penalizaciones` si la
  // cancelación fue tardía y el estudio/tipo de clase exige penalización —
  // null si no aplica. El cobro real lo recoge lib/inngest/penalizaciones.ts,
  // no este caller (aquí solo se traza).
  penalizacionId: string | null;
} | { error: string }> {
  const { data, error } = await supabase.rpc('cancelar_reserva_plaza', {
    p_studio_id: studioId, p_reserva_id: reservaId, p_socio_id: null,
  });
  if (error) { reportDbError('[dbCancelarReservaPlaza]', error); return { error: error.message }; }
  const row = Array.isArray(data) ? data[0] : data;
  return {
    eraConfirmada: !!row?.era_confirmada,
    promovidaSocioId: row?.promovida_socio_id ?? null,
    // Quién decide si se devuelve la sesión del bono: la BD (migr 0129), que
    // resuelve la ventana de cancelación del TIPO de clase y cae a la del
    // estudio si no la tiene. El cliente lo recalculaba, y el panel usaba
    // siempre la global: la misma cancelación salía tardía por el portal y a
    // tiempo por recepción. `?? true` conserva el comportamiento de siempre
    // (devolver) si la RPC aún no trae la columna a medio despliegue.
    devolverBono: row?.devolver_bono ?? true,
    ofertaSocioId: row?.oferta_socio_id ?? null,
    ofertaExpiraEn: row?.oferta_expira_en ?? null,
    penalizacionId: row?.penalizacion_id ?? null,
  };
}

// Cancela (marca CANCELADA) todas las reservas activas de un lote de sesiones.
// Cancelar una serie completa marcaba `sesiones.cancelada=true` pero dejaba las
// reservas en CONFIRMADA/LISTA_ESPERA apuntando a una sesión cancelada — la
// socia veía en su portal una plaza "confirmada" para una clase que ya no
// existe. No devuelve bono (ver comentario en cancelarSerieDesde,
// studio-context.tsx): eso es una decisión de producto pendiente, no algo que
// se pueda improvisar aquí sin arriesgar un descuadre de saldo.
export async function dbCancelarReservasPorSesiones(sesionIds: string[]): Promise<{ ok: true; ids: string[] } | { error: string }> {
  if (sesionIds.length === 0) return { ok: true, ids: [] };
  const { data, error } = await supabase
    .from('reservas')
    .update({ estado: 'CANCELADA', posicion_espera: null })
    .in('sesion_id', sesionIds)
    .in('estado', ['CONFIRMADA', 'LISTA_ESPERA'])
    .select('id');
  if (error) { reportDbError('[dbCancelarReservasPorSesiones]', error); return { error: error.message }; }
  return { ok: true, ids: (data ?? []).map(r => r.id as string) };
}

export async function dbUpdateReserva(id: string, changes: Partial<Reserva>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('sesionId' in changes) db.sesion_id = changes.sesionId;
  if ('socioId' in changes) db.socio_id = changes.socioId;
  if ('estado' in changes) db.estado = changes.estado;
  if ('spotId' in changes) db.spot_id = changes.spotId;
  if ('posicionEspera' in changes) db.posicion_espera = changes.posicionEspera;
  if ('checkInEn' in changes) db.check_in_en = changes.checkInEn;
  const { error } = await supabase.from('reservas').update(db).eq('id', id);
  return error ? falloEscritura('[dbUpdateReserva]', error) : ESCRITURA_OK;
}

export async function dbInsertRecibo(rec: Recibo): Promise<ResultadoEscritura> {
  // assignPlan() encadena dbInsertSuscripcion + dbInsertRecibo con la suscripción
  // recién creada: mismo commit-race que socio_id (Sentry NEXTJS-W), pero antes
  // solo se reintentaba para socio_id — la FK de suscripcion_id fallaba a la primera.
  // También lo sufre la renovación por bono agotado (consumirSesionBono), que
  // referencia una suscripción con la misma carrera de visibilidad (Sentry
  // dbInsertRecibo 23503, recibos_suscripcion_id_fkey, visto en producción).
  const { error } = await conReintentoFK(['recibos_socio_id_fkey', 'recibos_suscripcion_id_fkey'], () =>
    supabase.from('recibos').insert(reciboToDb(rec)),
  );
  return error ? falloEscritura('[dbInsertRecibo]', error) : ESCRITURA_OK;
}

// Marca un recibo como COBRADO de forma condicional (auditoría 2026-07-29,
// M-2): dbUpdateRecibo hace un UPDATE incondicional, sin comprobar el estado
// actual. El cerrojo de re-entrada en marcarCobrado (studio-context.tsx) frena
// el doble clic en la MISMA pestaña, pero dos pestañas/dispositivos distintos
// cobrando el mismo recibo a la vez pasarían igual las dos, sellando DOS
// facturas fiscales para un único cobro. `WHERE estado = 'PENDIENTE'` hace que
// solo la primera escritura tenga efecto; `.select('id')` dice si de verdad
// tocó algo.
export async function dbMarcarCobrado(
  id: string,
  changes: { fechaCobro: string; metodoCobro?: MetodoCobro },
): Promise<ResultadoEscritura & { yaEstaba?: boolean }> {
  const db: Record<string, unknown> = { estado: 'COBRADO', fecha_cobro: changes.fechaCobro };
  if (changes.metodoCobro) db.metodo_cobro = changes.metodoCobro;
  const { data, error } = await supabase
    .from('recibos')
    .update(db)
    .eq('id', id)
    .eq('estado', 'PENDIENTE')
    .select('id');
  if (error) return falloEscritura('[dbMarcarCobrado]', error);
  if (!data || data.length === 0) {
    return { ok: false, error: 'Este recibo ya no está pendiente (puede que ya se haya cobrado).', yaEstaba: true };
  }
  return ESCRITURA_OK;
}

/**
 * Guarda en el recibo QUÉ entregó su cobro. Escritor dedicado en vez de ampliar
 * `dbUpdateRecibo` con ocho campos que no usa nadie más: esto lo escribe UNA
 * vez cada camino de entrega y no se vuelve a tocar.
 *
 * El espejo de servidor vive en `lib/billing/renovacion-server.ts` (que lo
 * escribe con service-role); esta es la del panel. Los dos tienen que guardar lo
 * mismo o la reversión leerá dos formas distintas del mismo hecho.
 */
export async function dbGuardarEntrega(reciboId: string, entrega: {
  tipo: 'BONO' | 'MENSUAL' | 'ALTA_WEB' | 'NINGUNA';
  aplicada: boolean;
  sesionesAntes: number | null;
  sesionesDespues: number | null;
  fechaFinAntes: string | null;
  fechaFinDespues: string | null;
  estadoAntes: string | null;
}): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('recibos').update({
    entrega_tipo: entrega.tipo,
    entrega_aplicada: entrega.aplicada,
    entrega_aplicada_en: new Date().toISOString(),
    entrega_sesiones_antes: entrega.sesionesAntes,
    entrega_sesiones_despues: entrega.sesionesDespues,
    entrega_fecha_fin_antes: entrega.fechaFinAntes,
    entrega_fecha_fin_despues: entrega.fechaFinDespues,
    entrega_estado_antes: entrega.estadoAntes,
  }).eq('id', reciboId);
  if (error) return falloEscritura('[dbGuardarEntrega]', error);
  return ESCRITURA_OK;
}

export async function dbUpdateRecibo(id: string, changes: Partial<Recibo>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('socioId' in changes) db.socio_id = changes.socioId;
  if ('suscripcionId' in changes) db.suscripcion_id = changes.suscripcionId;
  if ('concepto' in changes) db.concepto = changes.concepto;
  if ('importe' in changes) db.importe = changes.importe;
  if ('estado' in changes) db.estado = changes.estado;
  if ('fechaVencimiento' in changes) db.fecha_vencimiento = changes.fechaVencimiento;
  if ('fechaCobro' in changes) db.fecha_cobro = changes.fechaCobro;
  if ('fechaDevolucion' in changes) db.fecha_devolucion = changes.fechaDevolucion;
  if ('intentosReintento' in changes) db.intentos_reintento = changes.intentosReintento;
  if ('metodoCobro' in changes) db.metodo_cobro = changes.metodoCobro;
  if ('sepaEstado' in changes) db.sepa_estado = changes.sepaEstado;
  if ('proximoReintento' in changes) db.proximo_reintento = changes.proximoReintento;
  const { error } = await supabase.from('recibos').update(db).eq('id', id);
  return error ? falloEscritura('[dbUpdateRecibo]', error) : ESCRITURA_OK;
}

// Aplica los mismos cambios a varios recibos (cobro masivo desde Pagos/ficha de
// socia, o marcarlos EN_CURSO tras generar una remesa SEPA) en una sola
// llamada, en vez de un UPDATE por recibo.
//
// `soloSiEstadoActual` (F2 B2.10): sin él, un recibo cobrado por OTRO camino
// (tarjeta, cobro manual) entre "preparar la remesa" y este UPDATE se pisaba
// en silencio de vuelta a un estado anterior. Al cobrar (estado === 'COBRADO')
// se aplica el mismo filtro por PENDIENTE aunque el llamante no lo pida
// explícitamente (auditoría 2026-07-29, M-2): sin esto, dos cobros masivos
// solapados (dos pestañas, o esta función y un cobro individual del mismo
// recibo) sellarían factura dos veces para el mismo dinero.
// `idsActualizados` es la lista real de recibos que el UPDATE SÍ tocó: el
// resto ya estaba en otro estado (otra sesión se adelantó) y no debe generar
// una factura duplicada en el llamante.
export async function dbUpdateRecibosBatch(
  ids: string[], changes: Partial<Recibo>, soloSiEstadoActual?: Recibo['estado'],
): Promise<ResultadoEscritura & { idsActualizados?: string[] }> {
  if (ids.length === 0) return { ...ESCRITURA_OK, idsActualizados: [] };
  const db: Record<string, unknown> = {};
  if ('estado' in changes) db.estado = changes.estado;
  if ('fechaCobro' in changes) db.fecha_cobro = changes.fechaCobro;
  if ('fechaDevolucion' in changes) db.fecha_devolucion = changes.fechaDevolucion;
  if ('intentosReintento' in changes) db.intentos_reintento = changes.intentosReintento;
  if (Object.keys(db).length === 0) return { ...ESCRITURA_OK, idsActualizados: [] };
  let q = supabase.from('recibos').update(db).in('id', ids);
  const filtroEstado = soloSiEstadoActual ?? (changes.estado === 'COBRADO' ? 'PENDIENTE' : undefined);
  if (filtroEstado) q = q.eq('estado', filtroEstado);
  const { data, error } = await q.select('id');
  if (error) return falloEscritura('[dbUpdateRecibosBatch]', error);
  return { ...ESCRITURA_OK, idsActualizados: (data ?? []).map(r => r.id as string) };
}

export async function dbDeleteRecibo(id: string): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('recibos').delete().eq('id', id);
  return error ? falloEscritura('[dbDeleteRecibo]', error) : ESCRITURA_OK;
}

// NOTA: las facturas se crean y sellan (huella Veri*Factu) en el servidor vía
// /api/facturas/sellar. No insertar facturas directamente desde el cliente: se
// saltaría la huella encadenada.
//
// Antes esta nota decía además que `facturaToDb` se conservaba "para los
// backups". No era cierto: el motor de backups copia filas crudas por nombre
// de tabla (`BACKUP_TABLES` en lib/engines/backup-engine.ts) y nunca pasó por
// ese mapeador. Llevaba sin usarse desde entonces, así que se ha borrado.

export async function dbInsertCita(cita: Cita): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('citas').insert(citaToDb(cita));
  return error ? falloEscritura('[dbInsertCita]', error) : ESCRITURA_OK;
}

export async function dbUpdateCita(id: string, changes: Partial<Cita>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('socioId' in changes) db.socio_id = changes.socioId;
  if ('instructorId' in changes) db.instructor_id = changes.instructorId;
  if ('tipo' in changes) db.tipo = changes.tipo;
  if ('inicio' in changes) db.inicio = changes.inicio;
  if ('fin' in changes) db.fin = changes.fin;
  if ('notas' in changes) db.notas = changes.notas;
  if ('estado' in changes) db.estado = changes.estado;
  if ('precio' in changes) db.precio = changes.precio;
  if ('pagada' in changes) db.pagada = changes.pagada;
  const { error } = await supabase.from('citas').update(db).eq('id', id);
  return error ? falloEscritura('[dbUpdateCita]', error) : ESCRITURA_OK;
}

export async function dbInsertVentaPOS(venta: VentaPOS): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('ventas_pos').insert(ventaPOSToDb(venta));
  return error ? falloEscritura('[dbInsertVentaPOS]', error) : ESCRITURA_OK;
}

export async function dbInsertActividadReciente(act: ActividadReciente) {
  const { error } = await supabase.from('actividad_reciente').insert(actividadRecienteToDb(act));
  if (error) reportDbError('[dbInsertActividadReciente]', error);
}

// Últimos N mensajes del estudio, en orden cronológico ascendente (más antiguo
// primero) para pintarlos directamente. Acotado: se traen los más recientes y se
// invierte, en vez de todo el histórico.
export async function dbListMensajesEquipo(canalId: string, limite = 200): Promise<MensajeEquipo[]> {
  const { data, error } = await supabase
    .from('mensajes_equipo')
    .select('*')
    .eq('studio_id', getCurrentStudioId())
    .eq('canal_id', canalId)
    .order('creado_en', { ascending: false })
    .limit(limite);
  if (error) {
    reportDbError('[dbListMensajesEquipo]', error);
    return [];
  }
  return (data ?? []).map(mapMensajeEquipo).reverse();
}

// Canales del chat de equipo del estudio actual (el más antiguo primero: "General").
export async function dbListCanalesEquipo(): Promise<CanalEquipo[]> {
  const { data, error } = await supabase
    .from('canales_equipo')
    .select('*')
    .eq('studio_id', getCurrentStudioId())
    .order('creado_en', { ascending: true });
  if (error) {
    reportDbError('[dbListCanalesEquipo]', error);
    return [];
  }
  return (data ?? []).map(mapCanalEquipo);
}

export async function dbCreateCanalEquipo(canal: CanalEquipo): Promise<boolean> {
  const { error } = await supabase.from('canales_equipo').insert({
    id: canal.id,
    studio_id: canal.studioId,
    nombre: canal.nombre,
    creado_en: canal.creadoEn,
  });
  if (error) {
    reportDbError('[dbCreateCanalEquipo]', error);
    return false;
  }
  return true;
}

// Devuelve true si el insert fue OK (para que el chat marque el mensaje como
// enviado o fallido, en vez de fire-and-forget).
export async function dbInsertMensajeEquipo(m: MensajeEquipo): Promise<boolean> {
  const { error } = await supabase.from('mensajes_equipo').insert(mensajeEquipoToDb(m));
  if (error) {
    reportDbError('[dbInsertMensajeEquipo]', error);
    return false;
  }
  return true;
}

// ─── Gamificación: créditos y recompensas ────────────────────────────────────

export async function dbInsertRewardRule(r: RewardRule): Promise<ResultadoEscritura> {
  const row = {
    id: r.id, studio_id: r.studioId ?? STUDIO_ID, trigger: r.trigger, nombre: r.nombre,
    descripcion: r.descripcion ?? null, creditos: r.creditos, activa: r.activa,
    tope_mensual: r.topeMensual ?? null, creado_en: r.creadoEn,
  };
  const { error } = await supabase.from('reward_rules').insert(row);
  return error ? falloEscritura('[dbInsertRewardRule]', error) : ESCRITURA_OK;
}

export async function dbUpdateRewardRule(id: string, changes: Partial<RewardRule>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('descripcion' in changes) db.descripcion = changes.descripcion;
  if ('creditos' in changes) db.creditos = changes.creditos;
  if ('activa' in changes) db.activa = changes.activa;
  if ('topeMensual' in changes) db.tope_mensual = changes.topeMensual;
  const { error } = await supabase.from('reward_rules').update(db).eq('id', id);
  return error ? falloEscritura('[dbUpdateRewardRule]', error) : ESCRITURA_OK;
}

export async function dbInsertRewardHistory(h: RewardHistory) {
  const row = {
    id: h.id, studio_id: h.studioId ?? STUDIO_ID, socio_id: h.socioId, rule_id: h.ruleId,
    action_id: h.actionId, creditos: h.creditos, descripcion: h.descripcion, creado_en: h.creadoEn,
  };
  // Misma carrera de visibilidad de FK que dbInsertRecibo (Sentry
  // JAVASCRIPT-NEXTJS-11): `action_id` referencia la fila de `reward_actions`
  // que acaba de crear `otorgar_credito_disparador` — el cliente la inserta
  // justo después de recibir el `accionId` de esa RPC, pero puede llegar
  // antes de que la fila sea visible a esta conexión.
  const { error } = await conReintentoFK('reward_history_action_id_fkey', () =>
    supabase.from('reward_history').insert(row),
  );
  if (error) reportDbError('[dbInsertRewardHistory]', error);
}

export async function dbInsertCreditTransaction(t: CreditTransaction) {
  const row = {
    id: t.id, studio_id: t.studioId ?? STUDIO_ID, socio_id: t.socioId, tipo: t.tipo,
    creditos: t.creditos, descripcion: t.descripcion, ref_id: t.refId ?? null, creado_en: t.creadoEn,
  };
  const { error } = await supabase.from('credit_transactions').insert(row);
  if (error) reportDbError('[dbInsertCreditTransaction]', error);
}

// Gamificación — GANANCIA de créditos por un disparador (asistencia, referido,
// racha, logro, reto...). A diferencia de dbAjustarCreditos (que sigue siendo
// correcto para el DÉBITO de un canje), aquí el importe de créditos NUNCA lo
// decide el cliente: la RPC lo recalcula desde la regla/logro/reto activo del
// propio estudio, y para ASISTENCIA_CLASE/REFERIDO_AMIGO exige que la
// condición exista de verdad en la BD (una reserva ASISTIDA real) antes de
// conceder nada. Sin esto, cualquier cuenta de personal autenticada podía
// otorgarse créditos arbitrarios llamando directo a ajustar_creditos/insertando
// en reward_actions desde la consola del navegador.
// Devuelve el saldo tras la operación y si se concedió AHORA (otorgado=true) o
// ya se había concedido antes para este mismo refId (otorgado=false,
// no-op idempotente) — el llamante solo debe registrar historial/transacción
// cuando otorgado=true, si no duplicaría esas filas en un reintento.
export async function dbOtorgarCreditoDisparador(
  socioId: string, studioId: string, trigger: string, refId: string, configId?: string,
): Promise<{ ok: true; saldo: number; otorgado: boolean; accionId: string | null } | { error: string }> {
  const { data, error } = await supabase.rpc('otorgar_credito_disparador', {
    p_socio_id: socioId, p_studio_id: studioId, p_trigger: trigger, p_ref_id: refId,
    p_config_id: configId ?? null,
  });
  if (error) {
    // CONDICION_NO_CUMPLIDA / SIN_REGLA_ACTIVA no son errores de sistema: son el
    // resultado esperado cuando el disparador aún no se cumple de verdad.
    if (!error.message.includes('CONDICION_NO_CUMPLIDA') && !error.message.includes('SIN_REGLA_ACTIVA')) {
      reportDbError('[dbOtorgarCreditoDisparador]', error);
    }
    return { error: error.message };
  }
  const row = Array.isArray(data) ? data[0] : data;
  // La RPC siempre devuelve una fila si no hay error, pero un `row` ausente
  // (PostgREST devolviendo 0 filas sin error, o una futura edición del SQL)
  // no debe reventar aquí — mismo guard que dbSemaforoSaludEstudio/
  // dbCancelarReservasPorSesiones ya usan con `data ?? []`.
  if (!row) {
    reportDbError('[dbOtorgarCreditoDisparador]', { message: 'La RPC no devolvió ninguna fila' });
    return { error: 'No se pudo confirmar el crédito' };
  }
  return {
    ok: true, saldo: row.saldo as number, otorgado: row.otorgado as boolean,
    accionId: (row.accion_id as string | null) ?? null,
  };
}

// P0-20: ajuste ATÓMICO del saldo por deltas (incremento en la BD, no
// leer-calcular-sobrescribir). deltaSaldo/Ganado/Canjeado: p. ej. una ganancia de
// 5 → (+5, +5, 0); un canje de 3 → (-3, 0, +3). Devuelve el nuevo saldo o error
// (SALDO_INSUFICIENTE si quedaría negativo).
export async function dbAjustarCreditos(
  socioId: string, studioId: string, deltaSaldo: number, deltaGanado: number, deltaCanjeado: number,
): Promise<{ ok: true; saldo: number } | { error: string }> {
  const { data, error } = await supabase.rpc('ajustar_creditos', {
    p_socio_id: socioId, p_studio_id: studioId,
    p_delta_saldo: deltaSaldo, p_delta_ganado: deltaGanado, p_delta_canjeado: deltaCanjeado,
  });
  if (error) {
    if (error.message.includes('SALDO_INSUFICIENTE')) return { error: 'Saldo insuficiente' };
    reportDbError('[dbAjustarCreditos]', error);
    return { error: error.message };
  }
  return { ok: true, saldo: data as number };
}

// A-13: ajuste ATÓMICO del stock de una recompensa (delta -1 reservar / +1
// devolver) vía la RPC ajustar_stock. Con el cliente autenticado del panel; el
// aislamiento por estudio lo aplica la propia función. Devuelve error 'SIN_STOCK'
// si el decremento dejaría el stock por debajo de 0.
export async function dbAjustarStock(
  itemId: string, studioId: string, delta: number,
): Promise<{ ok: true } | { error: string }> {
  const { error } = await supabase.rpc('ajustar_stock', {
    p_item_id: itemId, p_studio_id: studioId, p_delta: delta,
  });
  if (error) {
    if (error.message.includes('SIN_STOCK')) return { error: 'SIN_STOCK' };
    reportDbError('[dbAjustarStock]', error);
    return { error: error.message };
  }
  return { ok: true };
}

// R2 (ruta panel): decremento ATÓMICO de una sesión de bono vía la misma RPC
// `consumir_sesion_bono` que usa el servidor. UPDATE condicional serializado por
// lock de fila (`sesiones_restantes = sesiones_restantes - 1 WHERE > 0`). Devuelve
// el saldo AUTORITATIVO tras el descuento, o { error } si no había sesión que
// descontar (otra reserva concurrente ya agotó el bono) o falló la RPC. El panel
// debe decidir `agotado` (recibo de renovación) sobre este saldo, NO sobre el
// snapshot local (que puede estar obsoleto). Espejo de consumirBonoServidor.
export async function dbConsumirSesionBono(
  suscripcionId: string, studioId: string, sesionId: string,
): Promise<{ ok: true; saldo: number } | { error: string }> {
  // `p_sesion_id` no es decorativo: con él, la BD comprueba que el plan de esa
  // suscripción cubra el tipo de clase (migr 0129) y rechaza con
  // BONO_NO_CUBRE_CLASE. Es la única capa por la que pasan todas las
  // superficies, así que la regla deja de depender de que cada cliente se
  // acuerde de aplicarla. Obligatorio desde la 0132: un parámetro opcional
  // era una puerta que ya no usaba nadie pero que seguía abierta.
  const { data, error } = await supabase.rpc('consumir_sesion_bono', {
    p_suscripcion_id: suscripcionId, p_studio_id: studioId, p_sesion_id: sesionId,
  });
  if (error) {
    reportDbError('[dbConsumirSesionBono]', error);
    return { error: error.message };
  }
  if (data == null) return { error: 'SIN_SESION' };
  return { ok: true, saldo: data as number };
}

// F1 (B1-B4): agregación de ingresos SERVER-SIDE (migr 0096). Sustituye al sum()
// sobre el array de recibos del cliente (capado a 1000 → mentía a escala). Un sum()
// en SQL agrega todas las filas; la RLS acota por estudio. `desde` = 'YYYY-MM-DD' o
// null (todo el histórico).
export async function dbInformeIngresos(
  desde: string | null,
): Promise<{ total: number; nCobrados: number; nSocias: number }> {
  const { data, error } = await supabase.rpc('informe_ingresos', { p_desde: desde });
  if (error) { reportDbError('[dbInformeIngresos]', error); return { total: 0, nCobrados: 0, nSocias: 0 }; }
  const row = (Array.isArray(data) ? data[0] : data) as { total_ingresos: number; n_cobrados: number; n_socias_unicas: number } | undefined;
  return { total: Number(row?.total_ingresos ?? 0), nCobrados: Number(row?.n_cobrados ?? 0), nSocias: Number(row?.n_socias_unicas ?? 0) };
}

export async function dbIngresosPorDia(desde: string | null): Promise<{ dia: string; total: number }[]> {
  const { data, error } = await supabase.rpc('ingresos_por_dia', { p_desde: desde });
  if (error) { reportDbError('[dbIngresosPorDia]', error); return []; }
  return ((data ?? []) as { dia: string; total: number }[]).map((r) => ({ dia: r.dia, total: Number(r.total) }));
}

// Fase 8 (CRO): embudo del widget público, agregado server-side, mismo
// patrón que dbInformeIngresos/dbIngresosPorDia (0096). `desde` requerido —
// a diferencia de ingresos, este embudo no tiene sentido "de siempre" (el
// primer evento es de hace días, no meses). Ver
// docs/cro-analytics-widget-diseno.md §2.1.
export async function dbEmbudoWidget(desde: string): Promise<{ tipo: string; n: number }[]> {
  const { data, error } = await supabase.rpc('embudo_widget', { p_desde: desde });
  if (error) { reportDbError('[dbEmbudoWidget]', error); return []; }
  return ((data ?? []) as { tipo: string; n: number }[]).map((r) => ({ tipo: r.tipo, n: Number(r.n) }));
}

export async function dbEmbudoWidgetPorDia(desde: string): Promise<{ dia: string; tipo: string; n: number }[]> {
  const { data, error } = await supabase.rpc('embudo_widget_por_dia', { p_desde: desde });
  if (error) { reportDbError('[dbEmbudoWidgetPorDia]', error); return []; }
  return ((data ?? []) as { dia: string; tipo: string; n: number }[]).map((r) => ({ dia: r.dia, tipo: r.tipo, n: Number(r.n) }));
}

// Desglose de ventas por tipo (Planes/Bonos/Clases sueltas/Otros) para
// /informes, agregado SERVER-SIDE (migr 20260810150000, mismo patrón que
// dbInformeIngresos). `tipo` sale de planes_tarifa.tipo; los recibos sin
// suscripcion_id (histórico migrado, POS/otros) caen en 'OTROS'. `hasta` es
// inclusive — se usa para acotar el período anterior sin solapar con el actual.
export async function dbVentasPorTipo(
  desde: string | null,
  hasta: string | null,
): Promise<{ tipo: string; nVentas: number; total: number }[]> {
  const { data, error } = await supabase.rpc('ventas_por_tipo', { p_desde: desde, p_hasta: hasta });
  if (error) { reportDbError('[dbVentasPorTipo]', error); return []; }
  return ((data ?? []) as { tipo: string; n_ventas: number; total: number }[])
    .map((r) => ({ tipo: r.tipo, nVentas: Number(r.n_ventas), total: Number(r.total) }));
}

// F1 (B1): contadores de clientas SERVER-SIDE (migr 0097). Sustituye a los 4 filter/
// length sobre el array de socios del cliente (capado a 1000). count() en SQL no se
// capa; la RLS acota por estudio.
export async function dbStatsClientas(): Promise<{ total: number; activas: number; conBono: number; inactivas30d: number }> {
  const { data, error } = await supabase.rpc('stats_clientas');
  if (error) { reportDbError('[dbStatsClientas]', error); return { total: 0, activas: 0, conBono: 0, inactivas30d: 0 }; }
  const row = (Array.isArray(data) ? data[0] : data) as { total: number; activas: number; con_bono: number; inactivas_30d: number } | undefined;
  return {
    total: Number(row?.total ?? 0), activas: Number(row?.activas ?? 0),
    conBono: Number(row?.con_bono ?? 0), inactivas30d: Number(row?.inactivas_30d ?? 0),
  };
}

// F1 (B4/C2): ocupación por tipo de clase SERVER-SIDE (migr 0098). Sustituye la
// iteración del array reservas+sesiones del cliente (capado a 1000).
export async function dbOcupacionPorTipo(
  desde: string | null,
): Promise<{ tipoClaseId: string | null; nSesiones: number; aforo: number; ocupadas: number }[]> {
  const { data, error } = await supabase.rpc('ocupacion_por_tipo', { p_desde: desde });
  if (error) { reportDbError('[dbOcupacionPorTipo]', error); return []; }
  return ((data ?? []) as { tipo_clase_id: string | null; n_sesiones: number; aforo: number; ocupadas: number }[])
    .map((r) => ({ tipoClaseId: r.tipo_clase_id, nSesiones: Number(r.n_sesiones), aforo: Number(r.aforo), ocupadas: Number(r.ocupadas) }));
}

// F1 (B4): export CSV COMPLETO — trae TODOS los recibos cobrados por keyset (páginas
// de 1000 por id, hasta agotar) en vez del array del cliente capado a 1000. El nombre
// va embebido (join socios) para no depender del array de socios (también capado).
export async function dbRecibosCobradosParaExport(
  desde: string,
): Promise<{ fechaCobro: string; nombre: string; concepto: string; importe: number; estado: string }[]> {
  const out: { fechaCobro: string; nombre: string; concepto: string; importe: number; estado: string }[] = [];
  let lastId = '';
  for (let i = 0; i < 200; i++) { // tope de seguridad: 200×1000 = 200k filas
    let q = supabase
      .from('recibos')
      .select('id, fecha_cobro, concepto, importe, estado, socios(nombre, apellidos)')
      .eq('estado', 'COBRADO').gte('fecha_cobro', desde)
      .order('id', { ascending: true }).limit(1000);
    if (lastId) q = q.gt('id', lastId);
    const { data, error } = await q;
    if (error) { reportDbError('[dbRecibosCobradosParaExport]', error); break; }
    if (!data || data.length === 0) break;
    for (const r of data as unknown as { id: string; fecha_cobro: string; concepto: string; importe: number; estado: string; socios: { nombre: string; apellidos: string } | null }[]) {
      const s = r.socios;
      out.push({ fechaCobro: r.fecha_cobro, nombre: s ? `${s.nombre} ${s.apellidos}` : '—', concepto: r.concepto, importe: Number(r.importe), estado: r.estado });
    }
    lastId = (data[data.length - 1] as unknown as { id: string }).id;
    if (data.length < 1000) break;
  }
  return out;
}

export async function dbInsertRewardCatalogItem(c: RewardCatalogItem): Promise<ResultadoEscritura> {
  const row = {
    id: c.id, studio_id: c.studioId ?? STUDIO_ID, nombre: c.nombre, descripcion: c.descripcion ?? null,
    coste_creditos: c.costeCreditos, icono: c.icono, activo: c.activo, stock: c.stock ?? null, creado_en: c.creadoEn,
  };
  const { error } = await supabase.from('reward_catalog').insert(row);
  return error ? falloEscritura('[dbInsertRewardCatalogItem]', error) : ESCRITURA_OK;
}

export async function dbUpdateRewardCatalogItem(id: string, changes: Partial<RewardCatalogItem>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('descripcion' in changes) db.descripcion = changes.descripcion;
  if ('costeCreditos' in changes) db.coste_creditos = changes.costeCreditos;
  if ('icono' in changes) db.icono = changes.icono;
  if ('activo' in changes) db.activo = changes.activo;
  if ('stock' in changes) db.stock = changes.stock;
  const { error } = await supabase.from('reward_catalog').update(db).eq('id', id);
  return error ? falloEscritura('[dbUpdateRewardCatalogItem]', error) : ESCRITURA_OK;
}

export async function dbDeleteRewardCatalogItem(id: string): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('reward_catalog').delete().eq('id', id);
  return error ? falloEscritura('[dbDeleteRewardCatalogItem]', error) : ESCRITURA_OK;
}

export async function dbInsertRewardRedemption(r: RewardRedemption) {
  const row = {
    id: r.id, studio_id: r.studioId ?? STUDIO_ID, socio_id: r.socioId, catalog_item_id: r.catalogItemId,
    creditos_gastados: r.creditosGastados, estado: r.estado, creado_en: r.creadoEn,
  };
  const { error } = await supabase.from('reward_redemptions').insert(row);
  if (error) reportDbError('[dbInsertRewardRedemption]', error);
}

export async function dbUpdateRewardRedemption(id: string, changes: Partial<RewardRedemption>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('estado' in changes) db.estado = changes.estado;
  const { error } = await supabase.from('reward_redemptions').update(db).eq('id', id);
  return error ? falloEscritura('[dbUpdateRewardRedemption]', error) : ESCRITURA_OK;
}

// ─── Gamificación: logros ─────────────────────────────────────────────────────

export async function dbInsertAchievementDefinition(a: AchievementDefinition): Promise<ResultadoEscritura> {
  const row = {
    id: a.id, studio_id: a.studioId ?? STUDIO_ID, metric: a.metric, nombre: a.nombre,
    descripcion: a.descripcion ?? null, umbral: a.umbral, icono: a.icono,
    creditos_recompensa: a.creditosRecompensa, activo: a.activo, creado_en: a.creadoEn,
  };
  const { error } = await supabase.from('achievement_definitions').insert(row);
  return error ? falloEscritura('[dbInsertAchievementDefinition]', error) : ESCRITURA_OK;
}

export async function dbUpdateAchievementDefinition(id: string, changes: Partial<AchievementDefinition>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('descripcion' in changes) db.descripcion = changes.descripcion;
  if ('umbral' in changes) db.umbral = changes.umbral;
  if ('icono' in changes) db.icono = changes.icono;
  if ('creditosRecompensa' in changes) db.creditos_recompensa = changes.creditosRecompensa;
  if ('activo' in changes) db.activo = changes.activo;
  const { error } = await supabase.from('achievement_definitions').update(db).eq('id', id);
  return error ? falloEscritura('[dbUpdateAchievementDefinition]', error) : ESCRITURA_OK;
}

export async function dbUpsertAchievementProgress(p: AchievementProgress) {
  const row = {
    id: p.id, studio_id: p.studioId ?? STUDIO_ID, socio_id: p.socioId, achievement_id: p.achievementId,
    progreso_actual: p.progresoActual, completado: p.completado, completado_en: p.completadoEn ?? null,
  };
  const { error } = await supabase.from('achievement_progress').upsert(row, { onConflict: 'socio_id,achievement_id' });
  if (error) reportDbError('[dbUpsertAchievementProgress]', error);
}

export async function dbInsertAchievementHistory(h: AchievementHistory) {
  const row = {
    id: h.id, studio_id: h.studioId ?? STUDIO_ID, socio_id: h.socioId, achievement_id: h.achievementId,
    nombre: h.nombre, icono: h.icono, creado_en: h.creadoEn,
  };
  const { error } = await supabase.from('achievement_history').insert(row);
  if (error) reportDbError('[dbInsertAchievementHistory]', error);
}

// ─── Gamificación: niveles ─────────────────────────────────────────────────────

// ─── Soporte ──────────────────────────────────────────────────────────────────

export async function dbInsertSoporteSolicitud(s: { id: string; tipo: string; mensaje: string; contacto: string | null; creadoEn: string }) {
  const row = {
    id: s.id, studio_id: getCurrentStudioId(), tipo: s.tipo, mensaje: s.mensaje,
    contacto: s.contacto, creado_en: s.creadoEn,
  };
  const { error } = await supabase.from('soporte_solicitudes').insert(row);
  if (error) reportDbError('[dbInsertSoporteSolicitud]', error);
}

export async function dbInsertLevelDefinition(l: LevelDefinition): Promise<ResultadoEscritura> {
  const row = {
    id: l.id, studio_id: l.studioId ?? STUDIO_ID, nombre: l.nombre, orden: l.orden,
    umbral_creditos: l.umbralCreditos, color: l.color, icono: l.icono,
    beneficios: l.beneficios ?? null, activo: l.activo, creado_en: l.creadoEn,
  };
  const { error } = await supabase.from('level_definitions').insert(row);
  return error ? falloEscritura('[dbInsertLevelDefinition]', error) : ESCRITURA_OK;
}

export async function dbUpdateLevelDefinition(id: string, changes: Partial<LevelDefinition>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('orden' in changes) db.orden = changes.orden;
  if ('umbralCreditos' in changes) db.umbral_creditos = changes.umbralCreditos;
  if ('color' in changes) db.color = changes.color;
  if ('icono' in changes) db.icono = changes.icono;
  if ('beneficios' in changes) db.beneficios = changes.beneficios;
  if ('activo' in changes) db.activo = changes.activo;
  const { error } = await supabase.from('level_definitions').update(db).eq('id', id);
  return error ? falloEscritura('[dbUpdateLevelDefinition]', error) : ESCRITURA_OK;
}

export async function dbDeleteLevelDefinition(id: string): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('level_definitions').delete().eq('id', id);
  return error ? falloEscritura('[dbDeleteLevelDefinition]', error) : ESCRITURA_OK;
}

// ─── Gamificación: retos ────────────────────────────────────────────────────────

export async function dbInsertChallengeDefinition(c: ChallengeDefinition): Promise<ResultadoEscritura> {
  const row = {
    id: c.id, studio_id: c.studioId ?? STUDIO_ID, nombre: c.nombre, descripcion: c.descripcion ?? null,
    icono: c.icono, metric: c.metric, objetivo: c.objetivo, fecha_inicio: c.fechaInicio, fecha_fin: c.fechaFin,
    creditos_recompensa: c.creditosRecompensa, activo: c.activo, creado_en: c.creadoEn,
  };
  const { error } = await supabase.from('challenge_definitions').insert(row);
  return error ? falloEscritura('[dbInsertChallengeDefinition]', error) : ESCRITURA_OK;
}

export async function dbUpdateChallengeDefinition(id: string, changes: Partial<ChallengeDefinition>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('descripcion' in changes) db.descripcion = changes.descripcion;
  if ('icono' in changes) db.icono = changes.icono;
  if ('metric' in changes) db.metric = changes.metric;
  if ('objetivo' in changes) db.objetivo = changes.objetivo;
  if ('fechaInicio' in changes) db.fecha_inicio = changes.fechaInicio;
  if ('fechaFin' in changes) db.fecha_fin = changes.fechaFin;
  if ('creditosRecompensa' in changes) db.creditos_recompensa = changes.creditosRecompensa;
  if ('activo' in changes) db.activo = changes.activo;
  const { error } = await supabase.from('challenge_definitions').update(db).eq('id', id);
  return error ? falloEscritura('[dbUpdateChallengeDefinition]', error) : ESCRITURA_OK;
}

export async function dbDeleteChallengeDefinition(id: string): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('challenge_definitions').delete().eq('id', id);
  return error ? falloEscritura('[dbDeleteChallengeDefinition]', error) : ESCRITURA_OK;
}

export async function dbUpsertChallengeProgress(p: ChallengeProgress) {
  const row = {
    id: p.id, studio_id: p.studioId ?? STUDIO_ID, socio_id: p.socioId, challenge_id: p.challengeId,
    progreso_actual: p.progresoActual, completado: p.completado, completado_en: p.completadoEn ?? null,
  };
  const { error } = await supabase.from('challenge_progress').upsert(row, { onConflict: 'socio_id,challenge_id' });
  if (error) reportDbError('[dbUpsertChallengeProgress]', error);
}

export async function dbInsertChallengeHistory(h: ChallengeHistory) {
  const row = {
    id: h.id, studio_id: h.studioId ?? STUDIO_ID, socio_id: h.socioId, challenge_id: h.challengeId,
    nombre: h.nombre, icono: h.icono, creado_en: h.creadoEn,
  };
  const { error } = await supabase.from('challenge_history').insert(row);
  if (error) reportDbError('[dbInsertChallengeHistory]', error);
}

// ─── Dashboard: gráficos personalizados ────────────────────────────────────────

export async function dbInsertDashboardChart(c: DashboardChart) {
  const row = {
    id: c.id, studio_id: c.studioId ?? STUDIO_ID, nombre: c.nombre, tipo: c.tipo,
    metrica: c.metrica, agrupacion: c.agrupacion, rango: c.rango, color: c.color, creado_en: c.creadoEn,
  };
  const { error } = await supabase.from('dashboard_charts').insert(row);
  if (error) reportDbError('[dbInsertDashboardChart]', error);
}

export async function dbDeleteDashboardChart(id: string) {
  const { error } = await supabase.from('dashboard_charts').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteDashboardChart]', error);
}

export async function dbInsertAutomationLog(log: AutomationLog) {
  const row = {
    id: log.id,
    studio_id: log.studioId ?? STUDIO_ID,
    // S-2: exactamente uno de los dos va informado (CHECK en BD, migr. 0053).
    rule_id: log.ruleId ?? null,
    automatizacion_id: log.automatizacionId ?? null,
    rule_name: log.ruleName,
    socio_id: log.socioId,
    socio_nombre: log.socioNombre,
    paso_index: log.pasoIndex,
    accion: log.accion,
    resultado: log.resultado,
    detalle: log.detalle,
    mensaje_cliente: log.mensajeCliente ?? null,
    ejecutado_en: log.ejecutadoEn,
    proxima_accion_en: log.proximaAccionEn,
    recibo_id: log.reciboId ?? null,
  };
  const { error } = await supabase.from('automation_logs').insert(row);
  if (error) reportDbError('[dbInsertAutomationLog]', error);
}

// Igual que dbInsertAutomationLog pero idempotente (upsert por id). Lo usa la
// cola durable (Inngest): si un step se reintenta tras un fallo transitorio, el
// log se reescribe en vez de duplicarse. Requiere un id DETERMINISTA por
// candidato (no uid() aleatorio) para que el on-conflict funcione.
export async function dbInsertAutomationRule(r: AutomationRule): Promise<ResultadoEscritura> {
  const row = {
    id: r.id, studio_id: r.studioId ?? STUDIO_ID, nombre: r.nombre, descripcion: r.descripcion,
    icono: r.icono, trigger: r.trigger, condicion: r.condicion ?? {}, pasos: r.pasos ?? [],
    activa: r.activa, ejecutada_veces: r.ejecutadaVeces ?? 0, ultima_ejecucion: r.ultimaEjecucion ?? null,
    creada_en: r.creadaEn,
  };
  const { error } = await supabase.from('automation_rules').insert(row);
  return error ? falloEscritura('[dbInsertAutomationRule]', error) : ESCRITURA_OK;
}

export async function dbInsertNotaProgreso(nota: NotaProgreso): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('notas_progreso').insert(notaProgresoToDb(nota));
  return error ? falloEscritura('[dbInsertNotaProgreso]', error) : ESCRITURA_OK;
}

export async function dbInsertCodigoDescuento(c: CodigoDescuento): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('codigos_descuento').insert(codigoDescuentoToDb(c));
  return error ? falloEscritura('[dbInsertCodigoDescuento]', error) : ESCRITURA_OK;
}

export async function dbUpdateCodigoDescuento(id: string, changes: Partial<CodigoDescuento>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('activo' in changes) db.activo = changes.activo;
  if ('usos' in changes) db.usos = changes.usos;
  if ('minImporte' in changes) db.min_importe = changes.minImporte;
  if ('soloNuevas' in changes) db.solo_nuevas = changes.soloNuevas;
  const { error } = await supabase.from('codigos_descuento').update(db).eq('id', id);
  return error ? falloEscritura('[dbUpdateCodigoDescuento]', error) : ESCRITURA_OK;
}

// Consume un uso del código de forma ATÓMICA (0050). Devuelve los usos ya
// actualizados, o null si no se pudo consumir (inactivo o agotado) — el WHERE de
// la función hace cumplir usos_max en la BD, así que dos terminales del POS no
// pueden canjear a la vez el último uso.
export async function dbConsumirCodigoDescuento(id: string): Promise<number | null> {
  const { data, error } = await supabase.rpc('consumir_codigo_descuento', { p_codigo_id: id });
  if (error) { reportDbError('[dbConsumirCodigoDescuento]', error); return null; }
  return typeof data === 'number' ? data : null;
}

export async function dbDeleteCodigoDescuento(id: string): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('codigos_descuento').delete().eq('id', id);
  return error ? falloEscritura('[dbDeleteCodigoDescuento]', error) : ESCRITURA_OK;
}

export async function dbInsertNotaInterna(nota: NotaInterna): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('notas_internas').insert(notaInternaToDb(nota));
  return error ? falloEscritura('[dbInsertNotaInterna]', error) : ESCRITURA_OK;
}

export async function dbDeleteNotaInterna(id: string): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('notas_internas').delete().eq('id', id);
  return error ? falloEscritura('[dbDeleteNotaInterna]', error) : ESCRITURA_OK;
}

export async function dbInsertCondicion(c: CondicionSalud): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('condiciones_salud').insert(condicionSaludToDb(c));
  return error ? falloEscritura('[dbInsertCondicion]', error) : ESCRITURA_OK;
}

// Auditoría de LECTURA de la ficha de salud (RGPD art. 5.2/24, trazabilidad de
// categoría especial) — no de escritura, de quién simplemente ABRE la pestaña.
// Best-effort a propósito, sin reportDbError: un fallo al registrar la lectura
// no debe disparar el banner global de errores sobre una pantalla que, para
// quien la mira, cargó bien.
export async function dbRegistrarLecturaFichaSalud(p: {
  studioId: string; socioId: string; leidoPorUserId: string; leidoPorNombre: string; leidoPorRol: string;
}) {
  const { error } = await supabase.from('lecturas_ficha_salud').insert({
    studio_id: p.studioId,
    socio_id: p.socioId,
    leido_por_user_id: p.leidoPorUserId,
    leido_por_nombre: p.leidoPorNombre,
    leido_por_rol: p.leidoPorRol,
  });
  if (error) console.error('[dbRegistrarLecturaFichaSalud]', error);
}

export async function dbUpdateCondicion(id: string, changes: Partial<CondicionSalud>): Promise<ResultadoEscritura> {
  const parcial = condicionSaludToDb({ id, ...changes } as CondicionSalud);
  // Solo enviamos las columnas realmente presentes en `changes` (+ actualizado_en).
  const patch: Record<string, unknown> = { actualizado_en: new Date().toISOString() };
  const clave: Record<keyof CondicionSalud, string> = {
    id: 'id', studioId: 'studio_id', socioId: 'socio_id', categoria: 'categoria',
    etiqueta: 'etiqueta', zona: 'zona', restricciones: 'restricciones', severidad: 'severidad',
    estado: 'estado', inicio: 'inicio', fin: 'fin', revisarEn: 'revisar_en', notas: 'notas',
    creadoPor: 'creado_por', creadoEn: 'creado_en', actualizadoEn: 'actualizado_en',
  };
  for (const k of Object.keys(changes) as (keyof CondicionSalud)[]) {
    patch[clave[k]] = (parcial as Record<string, unknown>)[clave[k]];
  }
  const { error } = await supabase.from('condiciones_salud').update(patch).eq('id', id);
  return error ? falloEscritura('[dbUpdateCondicion]', error) : ESCRITURA_OK;
}

export async function dbDeleteCondicion(id: string): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('condiciones_salud').delete().eq('id', id);
  return error ? falloEscritura('[dbDeleteCondicion]', error) : ESCRITURA_OK;
}

// RECEPCIÓN ve el semáforo de salud (solo el color) pero la RLS de
// condiciones_salud no le deja leer las filas — `condicionesSalud` en el
// contexto llega vacío para ese rol, así que ningún cálculo LOCAL puede
// producir un color. Esta RPC (SECURITY DEFINER) expone el nivel ya
// calculado en servidor, sin las condiciones ni el motivo.
export async function dbSemaforoSaludEstudio(studioId: string): Promise<Map<string, NivelSemaforo>> {
  const { data, error } = await supabase.rpc('semaforo_salud_estudio', { p_studio_id: studioId });
  if (error) { reportDbError('[dbSemaforoSaludEstudio]', error); return new Map(); }
  const m = new Map<string, NivelSemaforo>();
  for (const row of (data ?? []) as { socio_id: string; nivel: string }[]) {
    m.set(row.socio_id, row.nivel as NivelSemaforo);
  }
  return m;
}

export async function dbInsertRespuestaSesion(r: RespuestaSesionRow): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('respuestas_sesion').insert(respuestaSesionToDb(r));
  return error ? falloEscritura('[dbInsertRespuestaSesion]', error) : ESCRITURA_OK;
}

export async function dbUpdateRespuestaSesion(id: string, changes: Partial<Pick<RespuestaSesionRow, 'respuesta' | 'nota'>>): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('respuestas_sesion').update(changes).eq('id', id);
  return error ? falloEscritura('[dbUpdateRespuestaSesion]', error) : ESCRITURA_OK;
}

export async function dbInsertCampana(c: Campana): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('campanas').insert(campanaToDb(c));
  return error ? falloEscritura('[dbInsertCampana]', error) : ESCRITURA_OK;
}

// studioId: filtro de fila explícito, no solo RLS — dbEscritura() usa
// service-role cuando corre en servidor (el job de envío de campañas,
// lib/inngest/campanas.ts), donde no hay JWT que la RLS pueda comprobar.
export async function dbUpdateCampana(id: string, studioId: string, changes: Partial<Campana>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('tipo' in changes) db.tipo = changes.tipo;
  if ('asunto' in changes) db.asunto = changes.asunto;
  if ('contenido' in changes) db.contenido = changes.contenido;
  if ('estado' in changes) db.estado = changes.estado;
  if ('destinatarios' in changes) db.destinatarios = changes.destinatarios;
  if ('enviados' in changes) db.enviados = changes.enviados;
  if ('abiertos' in changes) db.abiertos = changes.abiertos;
  if ('clics' in changes) db.clics = changes.clics;
  if ('enviadaEn' in changes) db.enviada_en = changes.enviadaEn;
  if ('programadaEn' in changes) db.programada_en = changes.programadaEn;
  if ('objetivo' in changes) db.objetivo = changes.objetivo;
  if ('presupuesto' in changes) db.presupuesto = changes.presupuesto;
  if ('publicaciones' in changes) db.publicaciones = changes.publicaciones;
  const { error } = await dbEscritura().from('campanas').update(db).eq('id', id).eq('studio_id', studioId);
  return error ? falloEscritura('[dbUpdateCampana]', error) : ESCRITURA_OK;
}

export async function dbDeleteCampana(id: string): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('campanas').delete().eq('id', id);
  return error ? falloEscritura('[dbDeleteCampana]', error) : ESCRITURA_OK;
}

export async function dbInsertAutomatizacion(a: Automatizacion): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('automatizaciones').insert(automatizacionToDb(a));
  return error ? falloEscritura('[dbInsertAutomatizacion]', error) : ESCRITURA_OK;
}

export async function dbDeleteAutomatizacion(id: string): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('automatizaciones').delete().eq('id', id);
  return error ? falloEscritura('[dbDeleteAutomatizacion]', error) : ESCRITURA_OK;
}

export async function dbInsertVideoOnDemand(v: VideoOnDemand) {
  const { error } = await supabase.from('videos_on_demand').insert(videoOnDemandToDb(v));
  if (error) reportDbError('[dbInsertVideoOnDemand]', error);
}

export async function dbUpdateVideoOnDemand(id: string, changes: Partial<VideoOnDemand>) {
  const db: Record<string, unknown> = {};
  if ('titulo' in changes) db.titulo = changes.titulo;
  if ('descripcion' in changes) db.descripcion = changes.descripcion;
  if ('categoria' in changes) db.categoria = changes.categoria;
  if ('duracionMinutos' in changes) db.duracion_minutos = changes.duracionMinutos;
  if ('nivel' in changes) db.nivel = changes.nivel;
  if ('instructorId' in changes) db.instructor_id = changes.instructorId;
  if ('vistas' in changes) db.vistas = changes.vistas;
  if ('likes' in changes) db.likes = changes.likes;
  if ('activo' in changes) db.activo = changes.activo;
  if ('streamUid' in changes) db.stream_uid = changes.streamUid;
  const { error } = await supabase.from('videos_on_demand').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdateVideoOnDemand]', error);
}

export async function dbDeleteVideoOnDemand(id: string) {
  const { error } = await supabase.from('videos_on_demand').delete().eq('id', id);
  if (error) reportDbError('[dbDeleteVideoOnDemand]', error);
}

export async function dbInsertPostComunidad(p: PostComunidad) {
  const { error } = await supabase.from('posts_comunidad').insert(postComunidadToDb(p));
  if (error) reportDbError('[dbInsertPostComunidad]', error);
}

export async function dbUpdatePostComunidad(id: string, changes: Partial<PostComunidad>) {
  const db: Record<string, unknown> = {};
  if ('texto' in changes) db.texto = changes.texto;
  if ('likes' in changes) db.likes = changes.likes;
  if ('comentariosCount' in changes) db.comentarios_count = changes.comentariosCount;
  if ('fijado' in changes) db.fijado = changes.fijado;
  const { error } = await supabase.from('posts_comunidad').update(db).eq('id', id);
  if (error) reportDbError('[dbUpdatePostComunidad]', error);
}

// Like idempotente (un like por usuario y post). RPC atómica que alterna y
// devuelve el estado + el conteo REAL recomputado. Reemplaza el viejo `likes+1`
// no idempotente que inflaba el contador.
export async function dbToggleLikePost(
  postId: string,
  studioId: string,
): Promise<{ liked: boolean; likes: number } | null> {
  const { data, error } = await supabase.rpc('toggle_like_post', { p_post_id: postId, p_studio_id: studioId });
  if (error) {
    reportDbError('[dbToggleLikePost]', error);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return { liked: !!row.liked, likes: Number(row.likes ?? 0) };
}

// Post_ids que el usuario actual ha likeado (para pintar el estado "me gusta").
export async function dbMisLikesComunidad(): Promise<string[]> {
  const { data, error } = await supabase.rpc('mis_likes_comunidad');
  if (error) {
    reportDbError('[dbMisLikesComunidad]', error);
    return [];
  }
  return (data as string[] | null) ?? [];
}

export async function dbDeletePostComunidad(id: string) {
  const { error } = await supabase.from('posts_comunidad').delete().eq('id', id);
  if (error) reportDbError('[dbDeletePostComunidad]', error);
}

export async function dbUpsertIntegracion(intg: Integracion) {
  const row = {
    id: intg.id,
    studio_id: intg.studioId ?? STUDIO_ID,
    tipo: intg.tipo,
    activo: intg.activo,
    config: intg.config ?? {},
    actualizado_en: intg.actualizadoEn,
  };
  const { error } = await supabase.from('integraciones').upsert(row, { onConflict: 'studio_id,tipo' });
  if (error) reportDbError('[dbUpsertIntegracion]', error);
}

// ─── Catálogo de tipos de clase de la cadena (plantilla, ver lib/types.ts) ───

function mapCadenaTipoClase(r: RowCadenaTiposClase): CadenaTipoClase {
  return {
    id: r.id,
    cadenaId: r.cadena_id,
    nombre: r.nombre,
    color: r.color ?? '#4F46E5',
    duracionMinutos: r.duracion_minutos ?? 60,
    descripcion: r.descripcion ?? null,
    nivel: (r.nivel as CadenaTipoClase['nivel']) ?? 'TODOS',
    fotoUrl: r.foto_url ?? null,
    creadoEn: r.creado_en,
    actualizadoEn: r.actualizado_en,
  };
}

export async function dbListCadenaTiposClase(cadenaId: string): Promise<CadenaTipoClase[]> {
  const { data, error } = await supabase.from('cadena_tipos_clase').select('*').eq('cadena_id', cadenaId).order('nombre');
  if (error) { reportDbError('[dbListCadenaTiposClase]', error); return []; }
  return (data ?? []).map(mapCadenaTipoClase);
}

export async function dbInsertCadenaTipoClase(t: CadenaTipoClase): Promise<ResultadoEscritura> {
  const row = {
    id: t.id, cadena_id: t.cadenaId, nombre: t.nombre, color: t.color,
    duracion_minutos: t.duracionMinutos, descripcion: t.descripcion ?? null, nivel: t.nivel,
    foto_url: t.fotoUrl ?? null,
  };
  const { error } = await supabase.from('cadena_tipos_clase').insert(row);
  return error ? falloEscritura('[dbInsertCadenaTipoClase]', error) : ESCRITURA_OK;
}

export async function dbUpdateCadenaTipoClase(id: string, changes: Partial<CadenaTipoClase>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = { actualizado_en: new Date().toISOString() };
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('color' in changes) db.color = changes.color;
  if ('duracionMinutos' in changes) db.duracion_minutos = changes.duracionMinutos;
  if ('descripcion' in changes) db.descripcion = changes.descripcion;
  if ('nivel' in changes) db.nivel = changes.nivel;
  if ('fotoUrl' in changes) db.foto_url = changes.fotoUrl;
  const { error } = await supabase.from('cadena_tipos_clase').update(db).eq('id', id);
  return error ? falloEscritura('[dbUpdateCadenaTipoClase]', error) : ESCRITURA_OK;
}

export async function dbDeleteCadenaTipoClase(id: string): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('cadena_tipos_clase').delete().eq('id', id);
  return error ? falloEscritura('[dbDeleteCadenaTipoClase]', error) : ESCRITURA_OK;
}

export async function dbInsertTipoClase(t: TipoClase): Promise<ResultadoEscritura> {
  const row = {
    id: t.id, studio_id: t.studioId ?? STUDIO_ID, nombre: t.nombre, color: t.color,
    duracion_minutos: t.duracionMinutos, descripcion: t.descripcion ?? null, nivel: t.nivel,
    foto_url: t.fotoUrl ?? null, objetivos: t.objetivos ?? [], ventana_cancelacion_horas: t.ventanaCancelacionHoras ?? null,
    reserva_exigir_plan: t.reservaExigirPlan ?? null,
    reserva_ventana_minima_minutos: t.reservaVentanaMinimaMinutos ?? null,
    reserva_antelacion_maxima_dias: t.reservaAntelacionMaximaDias ?? null,
    permite_lista_espera: t.permiteListaEspera ?? null,
    requiere_aprobacion: t.requiereAprobacion ?? null,
    lista_espera_plazo_aceptacion_minutos: t.listaEsperaPlazoAceptacionMinutos ?? null,
    minimo_asistentes_por_clase: t.minimoAsistentesPorClase ?? null,
    penalizacion_importe_eur: t.penalizacionImporteEur ?? null,
  };
  const { error } = await supabase.from('tipos_clase').insert(row);
  return error ? falloEscritura('[dbInsertTipoClase]', error) : ESCRITURA_OK;
}

export async function dbUpdateTipoClase(id: string, changes: Partial<TipoClase>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('color' in changes) db.color = changes.color;
  if ('duracionMinutos' in changes) db.duracion_minutos = changes.duracionMinutos;
  if ('descripcion' in changes) db.descripcion = changes.descripcion;
  if ('nivel' in changes) db.nivel = changes.nivel;
  if ('fotoUrl' in changes) db.foto_url = changes.fotoUrl;
  if ('objetivos' in changes) db.objetivos = changes.objetivos ?? [];
  if ('ventanaCancelacionHoras' in changes) db.ventana_cancelacion_horas = changes.ventanaCancelacionHoras;
  if ('reservaExigirPlan' in changes) db.reserva_exigir_plan = changes.reservaExigirPlan;
  if ('reservaVentanaMinimaMinutos' in changes) db.reserva_ventana_minima_minutos = changes.reservaVentanaMinimaMinutos;
  if ('reservaAntelacionMaximaDias' in changes) db.reserva_antelacion_maxima_dias = changes.reservaAntelacionMaximaDias;
  if ('permiteListaEspera' in changes) db.permite_lista_espera = changes.permiteListaEspera;
  if ('requiereAprobacion' in changes) db.requiere_aprobacion = changes.requiereAprobacion;
  if ('listaEsperaPlazoAceptacionMinutos' in changes) db.lista_espera_plazo_aceptacion_minutos = changes.listaEsperaPlazoAceptacionMinutos;
  if ('minimoAsistentesPorClase' in changes) db.minimo_asistentes_por_clase = changes.minimoAsistentesPorClase;
  if ('penalizacionImporteEur' in changes) db.penalizacion_importe_eur = changes.penalizacionImporteEur;
  const { error } = await supabase.from('tipos_clase').update(db).eq('id', id);
  return error ? falloEscritura('[dbUpdateTipoClase]', error) : ESCRITURA_OK;
}

export async function dbDeleteTipoClase(id: string): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('tipos_clase').delete().eq('id', id);
  if (!error) return ESCRITURA_OK;
  // Mismo caso que dbDeleteSala: un 23503 en el DELETE no es "falta un dato" (el
  // genérico lo leería como un INSERT y diría "vuelve a crearlo"): el tipo SÍ
  // existe, pero `sesiones.tipo_clase_id` lo referencia con FK NO ACTION y
  // Postgres bloquea el borrado. Es una condición ESPERADA (se intentó borrar un
  // tipo en uso), no un fallo del sistema: no pasa por reportDbError —para no
  // mandarlo a Sentry ni disparar además el banner global genérico— y devuelve
  // su propio mensaje del borrado.
  if ((error as { code?: string }).code === '23503') {
    return {
      ok: false,
      error: 'No puedes borrar un tipo de clase con clases programadas. Reasigna esas clases a otro tipo o elimínalas primero, y vuelve a intentarlo.',
    };
  }
  return falloEscritura('[dbDeleteTipoClase]', error);
}

// ─── Contenido editable del portal (mensaje destacado + banners) ────────────
// Escritura directa bajo la RLS admin_contenido_portal(_banners) — solo
// PROPIETARIO/MANAGER (comprobado en la propia policy, no solo en la UI).
// El banner tiene que existir en BD ANTES de subir su imagen: la RLS de
// storage (avatars_path_autorizado) valida el path `banner-<id>` consultando
// esta tabla, así que el flujo del editor es insertar primero (con imagen_url
// vacía) y actualizar después con la URL real.

export async function dbUpsertContenidoPortal(studioId: string, mensajeDestacado: string | null): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('contenido_portal')
    .upsert({ studio_id: studioId, mensaje_destacado: mensajeDestacado }, { onConflict: 'studio_id' });
  return error ? falloEscritura('[dbUpsertContenidoPortal]', error) : ESCRITURA_OK;
}

function bannerPortalToDb(b: BannerPortal) {
  return {
    id: b.id, studio_id: b.studioId, imagen_url: b.imagenUrl, titulo: b.titulo,
    texto: b.texto, link_tipo: b.linkTipo, link_valor: b.linkValor, ubicacion: b.ubicacion,
    activo: b.activo, orden: b.orden, fecha_inicio: b.fechaInicio, fecha_fin: b.fechaFin,
  };
}

export async function dbInsertBannerPortal(b: BannerPortal): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('contenido_portal_banners').insert(bannerPortalToDb(b));
  return error ? falloEscritura('[dbInsertBannerPortal]', error) : ESCRITURA_OK;
}

export async function dbUpdateBannerPortal(id: string, changes: Partial<BannerPortal>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('imagenUrl' in changes) db.imagen_url = changes.imagenUrl;
  if ('titulo' in changes) db.titulo = changes.titulo;
  if ('texto' in changes) db.texto = changes.texto;
  if ('linkTipo' in changes) db.link_tipo = changes.linkTipo;
  if ('linkValor' in changes) db.link_valor = changes.linkValor;
  if ('ubicacion' in changes) db.ubicacion = changes.ubicacion;
  if ('activo' in changes) db.activo = changes.activo;
  if ('orden' in changes) db.orden = changes.orden;
  if ('fechaInicio' in changes) db.fecha_inicio = changes.fechaInicio;
  if ('fechaFin' in changes) db.fecha_fin = changes.fechaFin;
  const { error } = await supabase.from('contenido_portal_banners').update(db).eq('id', id);
  return error ? falloEscritura('[dbUpdateBannerPortal]', error) : ESCRITURA_OK;
}

export async function dbDeleteBannerPortal(id: string): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('contenido_portal_banners').delete().eq('id', id);
  return error ? falloEscritura('[dbDeleteBannerPortal]', error) : ESCRITURA_OK;
}

// ─── Salas ───────────────────────────────────────────────────────────────────
// Hasta ahora las salas SOLO se leían: `addSala`/`updateSala`/`deleteSala` del
// contexto mutaban el estado local y no existía ninguna escritura en todo el
// repo. La dueña creaba una sala, la UI le decía "1 salas configuradas", y al
// recargar no estaba. Peor: como `sesiones.sala_id` tiene una FK contra
// `salas`, esa sala fantasma se ofrecía en el selector del calendario y hacía
// fallar también la creación de clases con un 23503 — un fallo silencioso
// arrastraba al siguiente. Escritura directa bajo la RLS `admin_salas`
// (studio_id = current_studio_id()); devuelve ResultadoEscritura para que la
// dueña sepa si guardó antes de que la UI le enseñe la sala.

function salaToDb(s: Sala) {
  return {
    id: s.id,
    studio_id: s.studioId ?? STUDIO_ID,
    nombre: s.nombre,
    capacidad: s.capacidad,
    color: s.color,
  };
}

export async function dbInsertSala(s: Sala): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('salas').insert(salaToDb(s));
  return error ? falloEscritura('[dbInsertSala]', error) : ESCRITURA_OK;
}

export async function dbUpdateSala(id: string, changes: Partial<Sala>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('capacidad' in changes) db.capacidad = changes.capacidad;
  if ('color' in changes) db.color = changes.color;
  const { error } = await supabase.from('salas').update(db).eq('id', id);
  return error ? falloEscritura('[dbUpdateSala]', error) : ESCRITURA_OK;
}

export async function dbDeleteSala(id: string): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('salas').delete().eq('id', id);
  if (!error) return ESCRITURA_OK;
  // 23503 en un DELETE no es "falta un dato" (el genérico lo lee como un INSERT
  // y dice "vuelve a crearlo"): la sala SÍ existe, pero `sesiones.sala_id` la
  // referencia con FK NO ACTION y Postgres bloquea el borrado. Es una condición
  // ESPERADA (la dueña intentó borrar una sala en uso), no un fallo del sistema:
  // no pasa por reportDbError —para no mandarlo a Sentry ni disparar además el
  // banner global con el mensaje genérico—; devuelve su propio mensaje del borrado.
  if ((error as { code?: string }).code === '23503') {
    return {
      ok: false,
      error: 'No puedes borrar una sala con clases asignadas. Reasigna esas clases a otra sala o elimínalas primero, y vuelve a intentarlo.',
    };
  }
  return falloEscritura('[dbDeleteSala]', error);
}

// A-2: las mutaciones de equipo (alta/edición/baja) pasan por /api/equipo, que
// exige verificarSesionStaff con rol PROPIETARIO (o autoedición de la propia
// ficha) — antes escribían directamente a `instructores` con el cliente anónimo,
// fiándose solo de la RLS y de una UI que caía a PROPIETARIO por defecto.
async function staffAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export async function dbInsertInstructor(i: Instructor): Promise<ResultadoEscritura> {
  try {
    const res = await fetch('/api/equipo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await staffAuthHeader()) },
      body: JSON.stringify({
        id: i.id,
        nombre: i.nombre,
        email: i.email ?? null,
        telefono: i.telefono ?? null,
        color: i.color,
        activo: i.activo,
        avatar: i.avatar ?? null,
        fotoUrl: i.fotoUrl ?? null,
        rol: i.rol ?? 'INSTRUCTOR',
      }),
    });
    if (!res.ok) {
      // El status importa: un 403 ("solo la propietaria gestiona el equipo") y
      // un 401 (sesión aún sin resolver) piden acciones distintas, y ninguna es
      // "revisa tu conexión". Va junto al cuerpo para que el traductor lo vea.
      const cuerpo = await res.json().catch(() => ({}));
      return falloEscritura('[dbInsertInstructor]', { ...cuerpo, status: res.status });
    }
    return ESCRITURA_OK;
  } catch (e) {
    return falloEscritura('[dbInsertInstructor]', e);
  }
}

export async function dbUpdateInstructor(id: string, changes: Partial<Instructor>): Promise<ResultadoEscritura> {
  try {
    const res = await fetch('/api/equipo', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await staffAuthHeader()) },
      body: JSON.stringify({ id, changes }),
    });
    if (!res.ok) {
      const cuerpo = await res.json().catch(() => ({ status: res.status }));
      return falloEscritura('[dbUpdateInstructor]', cuerpo);
    }
    return ESCRITURA_OK;
  } catch (e) {
    return falloEscritura('[dbUpdateInstructor]', e);
  }
}

// Vincula la cuenta recién creada con su ficha de equipo.
//
// Antes esto era un UPDATE directo desde el navegador apoyado en la policy
// `self_claim_instructores`, y no vinculaba NUNCA: la RLS aplicaba también las
// policies de SELECT y una cuenta sin estudio no ve ninguna fila (el detalle,
// en la migración 0131). Ahora lo resuelve el servidor, que es quien puede mirar
// una ficha de un estudio al que todavía no perteneces.
//
// `token` es el del enlace de invitación y es OBLIGATORIO: vincular por
// coincidencia de correo dejaba enganchar la cuenta de cualquiera desde un
// estudio recién creado, sin que la persona aceptara nada (el porqué largo, en
// lib/equipo/reclamar-reglas.ts). Idempotente: el mismo enlace se puede abrir
// dos veces y la segunda no hace nada.
export async function dbReclamarAccesoEquipo(token: string): Promise<number> {
  try {
    const res = await fetch('/api/equipo/reclamar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await staffAuthHeader()) },
      body: JSON.stringify({ token }),
    });
    const cuerpo = await res.json().catch(() => null) as { vinculadas?: number } | null;
    if (!res.ok) { reportDbError('[dbReclamarAccesoEquipo]', cuerpo ?? { status: res.status }); return 0; }
    return cuerpo?.vinculadas ?? 0;
  } catch (e) {
    reportDbError('[dbReclamarAccesoEquipo]', e);
    return 0;
  }
}

// Política de privacidad y términos del estudio (StudioConfig). Antes NO se
// persistían: la dueña los editaba, veía "guardado", y el portal de reservas y el
// registro de aceptación de la clienta seguían usando el texto por defecto
// (exposición legal). Devuelve ResultadoEscritura porque la UI debe confirmar que
// quedó guardado antes de decir "guardado" (0107 añadió las columnas).
export async function dbUpdateStudioConfig(changes: { politicaPrivacidad?: string; terminosServicio?: string }): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('politicaPrivacidad' in changes) db.politica_privacidad = changes.politicaPrivacidad;
  if ('terminosServicio' in changes) db.terminos_servicio = changes.terminosServicio;
  if (Object.keys(db).length === 0) return ESCRITURA_OK;
  const { error } = await supabase.from('studios').update(db).eq('id', STUDIO_ID);
  return error ? falloEscritura('[dbUpdateStudioConfig]', error) : ESCRITURA_OK;
}

export async function dbUpdateStudio(changes: Partial<Studio>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('nif' in changes) db.nif = changes.nif;
  if ('razonSocial' in changes) db.razon_social = changes.razonSocial;
  if ('direccion' in changes) db.direccion = changes.direccion;
  if ('ciudad' in changes) db.ciudad = changes.ciudad;
  if ('codigoPostal' in changes) db.codigo_postal = changes.codigoPostal;
  if ('normasTexto' in changes) db.normas_texto = changes.normasTexto;
  if ('email' in changes) db.email = changes.email;
  if ('telefono' in changes) db.telefono = changes.telefono;
  if ('colorPrimario' in changes) db.color_primario = changes.colorPrimario;
  if ('temaPortal' in changes) db.tema_portal = changes.temaPortal;
  if ('widgetDominiosAutorizados' in changes) db.widget_dominios_autorizados = changes.widgetDominiosAutorizados;
  if ('logoUrl' in changes) db.logo_url = changes.logoUrl;
  if ('ivaPorDefecto' in changes) db.iva_por_defecto = changes.ivaPorDefecto;
  if ('depUmbralAlto' in changes) db.dep_umbral_alto = changes.depUmbralAlto;
  if ('depUmbralMedio' in changes) db.dep_umbral_medio = changes.depUmbralMedio;
  if ('depVentanaDias' in changes) db.dep_ventana_dias = changes.depVentanaDias;
  if ('avatarAdmin' in changes) db.avatar_admin = changes.avatarAdmin;
  if ('fotoUrl' in changes) db.foto_url = changes.fotoUrl;
  if ('imagenBienvenidaUrl' in changes) db.imagen_bienvenida_url = changes.imagenBienvenidaUrl;
  if ('descripcion' in changes) db.descripcion = changes.descripcion;
  if ('anioFundacion' in changes) db.anio_fundacion = changes.anioFundacion;
  if ('cancelacionVentanaHoras' in changes) db.cancelacion_ventana_horas = changes.cancelacionVentanaHoras;
  if ('cancelacionDevolverBonoTardia' in changes) db.cancelacion_devolver_bono_tardia = changes.cancelacionDevolverBonoTardia;
  if ('reservaExigirPlan' in changes) db.reserva_exigir_plan = changes.reservaExigirPlan;
  if ('compraPublicaModo' in changes) db.compra_publica_modo = changes.compraPublicaModo;
  if ('reservaMaxSimultaneas' in changes) db.reserva_max_simultaneas = changes.reservaMaxSimultaneas;
  if ('reservaVentanaMinimaMinutos' in changes) db.reserva_ventana_minima_minutos = changes.reservaVentanaMinimaMinutos;
  if ('reservaAntelacionMaximaDias' in changes) db.reserva_antelacion_maxima_dias = changes.reservaAntelacionMaximaDias;
  if ('permiteListaEspera' in changes) db.permite_lista_espera = changes.permiteListaEspera;
  if ('horaApertura' in changes) db.hora_apertura = changes.horaApertura;
  if ('horaCierre' in changes) db.hora_cierre = changes.horaCierre;
  if ('requiereAprobacion' in changes) db.requiere_aprobacion = changes.requiereAprobacion;
  if ('listaEsperaPlazoAceptacionMinutos' in changes) db.lista_espera_plazo_aceptacion_minutos = changes.listaEsperaPlazoAceptacionMinutos;
  if ('minimoAsistentesPorClase' in changes) db.minimo_asistentes_por_clase = changes.minimoAsistentesPorClase;
  if ('penalizacionImporteEur' in changes) db.penalizacion_importe_eur = changes.penalizacionImporteEur;
  if ('penalizacionAplicaCancelacionTardia' in changes) db.penalizacion_aplica_cancelacion_tardia = changes.penalizacionAplicaCancelacionTardia;
  if ('penalizacionAplicaNoShow' in changes) db.penalizacion_aplica_no_show = changes.penalizacionAplicaNoShow;
  if ('penalizacionCobroAutomatico' in changes) db.penalizacion_cobro_automatico = changes.penalizacionCobroAutomatico;
  if ('reembolsosActivos' in changes) db.reembolsos_activos = changes.reembolsosActivos;
  if ('reembolsoPlazoDias' in changes) db.reembolso_plazo_dias = changes.reembolsoPlazoDias;
  if ('reembolsoSoloSinUsar' in changes) db.reembolso_solo_sin_usar = changes.reembolsoSoloSinUsar;
  if ('requiereCheckinQr' in changes) db.requiere_checkin_qr = changes.requiereCheckinQr;
  // Desconectar Stripe: antes NO se mapeaba, así que `updateStudio({ stripeAccountId: null })`
  // solo limpiaba el estado local y la cuenta reaparecía al recargar. El dueño
  // actualiza su propio estudio con su sesión (misma RLS que el resto de campos).
  if ('stripeAccountId' in changes) db.stripe_account_id = changes.stripeAccountId;
  if ('onboardingDescartadoEn' in changes) db.onboarding_descartado_en = changes.onboardingDescartadoEn;
  if ('sepaAcreedorId' in changes) db.sepa_acreedor_id = changes.sepaAcreedorId;
  if ('sepaIban' in changes) db.sepa_iban = changes.sepaIban;
  if ('sepaTitular' in changes) db.sepa_titular = changes.sepaTitular;
  if ('bienvenidaVistaEn' in changes) db.bienvenida_vista_en = changes.bienvenidaVistaEn;
  if ('onbCentros' in changes) db.onb_centros = changes.onbCentros;
  if ('onbSoftwareAnterior' in changes) db.onb_software_anterior = changes.onbSoftwareAnterior;
  if ('onbAlumnosActivos' in changes) db.onb_alumnos_activos = changes.onbAlumnosActivos;
  if ('onbImportarDatos' in changes) db.onb_importar_datos = changes.onbImportarDatos;
  if ('onbPrioridad' in changes) db.onb_prioridad = changes.onbPrioridad;
  if ('onbAyudaAlta' in changes) db.onb_ayuda_alta = changes.onbAyudaAlta;
  if ('decisionContratoVistoEn' in changes) db.decision_contrato_visto_en = changes.decisionContratoVistoEn;
  if ('tourVistoEn' in changes) db.tour_visto_en = changes.tourVistoEn;
  if ('gestoriaEnvioAutomatico' in changes) db.gestoria_envio_automatico = changes.gestoriaEnvioAutomatico;
  const { error } = await supabase.from('studios').update(db).eq('id', STUDIO_ID);
  return error ? falloEscritura('[dbUpdateStudio]', error) : ESCRITURA_OK;
}

// Horario semanal del estudio (studio_horario, migr 20260804210500). Un solo
// upsert de las 7 filas — el guardado de la rejilla de Configuración es "todo
// o nada", no autoguardado por fila. La RLS (studio_horario_escritura) exige
// PROPIETARIO; si el rol no cuadra, Supabase devuelve 0 filas afectadas sin
// error explícito, así que se verifica el conteo, no solo la ausencia de error.
export async function dbUpdateHorarioEstudio(dias: DiaHorario[]): Promise<ResultadoEscritura> {
  const filas = dias.map(d => ({
    studio_id: STUDIO_ID,
    dia_semana: d.diaSemana,
    abierto: d.abierto,
    hora_apertura: d.abierto ? d.horaApertura : null,
    hora_cierre: d.abierto ? d.horaCierre : null,
  }));
  const { data, error } = await supabase
    .from('studio_horario')
    .upsert(filas, { onConflict: 'studio_id,dia_semana' })
    .select('dia_semana');
  if (error) return falloEscritura('[dbUpdateHorarioEstudio]', error);
  if ((data?.length ?? 0) !== filas.length) {
    return falloEscritura('[dbUpdateHorarioEstudio]', { message: 'No tienes permiso para editar el horario del estudio' });
  }
  return ESCRITURA_OK;
}

// Toma el id explícito (no el STUDIO_ID de la sesión del navegador) porque la
// llama el callback de OAuth de Stripe Connect, un servidor sin sesión.
export function slugify(nombre: string): string {
  return nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'estudio';
}

// Genera un slug único para /reservar/[slug], /kiosk/[slug], /portal/[slug]
// probando sufijos -2, -3... si el base ya existe.
export async function generateUniqueSlug(nombre: string): Promise<string> {
  const base = slugify(nombre);
  let candidate = base;
  let n = 2;
  while (true) {
    // Un estudio llamado "Admin", "Reservar" o "Login" generaba ese slug tal
    // cual: nadie lo comprobaba contra las rutas propias de la app en el alta
    // (solo el renombrado posterior, en /api/estudio/direccion, llamaba a
    // motivoSlugInvalido). Mismo trato que una colisión de verdad: se salta al
    // siguiente sufijo en vez de dejarlo pasar.
    const reservado = SLUGS_RESERVADOS.has(candidate);
    // P-2: vía RPC SECURITY DEFINER. Leer `studios` directamente exigía una
    // política que dejaba ver TODAS las filas (y con ellas nif, stripe_account_id
    // y kiosk_token de cualquier estudio). Esto devuelve solo un booleano.
    const { data } = reservado ? { data: false } : await supabase.rpc('slug_estudio_disponible', { p_slug: candidate });
    if (data === true) return candidate;
    candidate = `${base}-${n}`;
    n++;
  }
}

// Crea un negocio nuevo (multi-tenancy: alta real desde /crear-estudio) y lo
// vincula a la cuenta de Supabase Auth que lo creó. Devuelve id+slug del nuevo
// negocio (el slug real, que puede llevar sufijo "-2" si hubo colisión de
// nombre — la UI de éxito lo necesita para no inventarse la URL del portal),
// o null si falló.
export async function dbCreateStudio(fields: { nombre: string; ciudad: string; telefono: string; ownerAuthUserId: string; comoNosConocio?: string; tipoCuenta?: 'ESTUDIO' | 'FREELANCE' }): Promise<{ id: string; slug: string } | null> {
  // Carreras que se reintentan (en vez de dejar pasar el error crudo):
  //  · 23505 slug: generateUniqueSlug comprueba disponibilidad y el insert llega
  //    después; DOS PROPIETARIAS DISTINTAS con el mismo nombre de estudio pueden
  //    colarse en ese hueco (Sentry NEXTJS-F). Se regenera el slug al vuelo.
  //  · 23503 owner FK: al confirmar el email, el alta puede adelantar al commit
  //    de auth.users y la FK owner_auth_user_id no encuentra la fila todavía
  //    (Sentry NEXTJS-G, culprit /login). La fila aparece en unos ms → backoff.
  //    D1: NO se resuelve con una RPC "atómica" — el insert (cliente o RPC) golpea
  //    la misma auth.users en el primario; si el commit de auth.users va en vuelo,
  //    la FK falla igual. Es consistencia eventual → la cura es ensanchar la
  //    ventana de reintento hasta que la fila es visible (8 intentos, ~6 s).
  //
  // ⚠️ El id ya NO lleva Date.now()+random. Con un id aleatorio, un segundo alta
  // DE LA MISMA PROPIETARIA no chocaba nunca por clave primaria: chocaba por slug
  // y el reintento de arriba lo rescataba generando "-2", "-3", "-4". O sea que
  // el reintento puesto para NEXTJS-F convertía un duplicado que la base habría
  // rechazado en un duplicado que se guardaba. Cinco propietarias acabaron con
  // estudios partidos en producción; una, con cuatro.
  //
  // Derivando el id de (propietaria + nombre), ese segundo intento choca por
  // PRIMARY KEY y lo tratamos como lo que es: el estudio ya existe, se devuelve.
  // Las sedes de una cadena NO pasan por aquí (van por /api/cadena/sedes), así
  // que esto no limita el multi-centro.
  const id = idEstudioDe(fields.ownerAuthUserId, fields.nombre);
  let ultimoError: { code: string; message: string } | null = null;
  for (let intento = 0; intento < 8; intento++) {
    const slug = await generateUniqueSlug(fields.nombre);
    const { error } = await supabase.from('studios').insert({
      id,
      nombre: fields.nombre,
      ciudad: fields.ciudad,
      telefono: fields.telefono,
      plan: 'BASE',
      owner_auth_user_id: fields.ownerAuthUserId,
      slug,
      como_nos_conocio: fields.comoNosConocio || null,
      // Feature #9: por defecto ESTUDIO (columna DEFAULT), solo se manda si
      // se pide FREELANCE explícitamente — no toca el camino existente.
      ...(fields.tipoCuenta ? { tipo_cuenta: fields.tipoCuenta } : {}),
    });
    if (!error) return { id, slug };
    ultimoError = error;
    if (error.code === '23505' && error.message.includes('studios_pkey')) {
      // Ya lo habíamos creado nosotros (efecto re-disparado, doble clic, dos
      // pestañas). No es un fallo: se devuelve el que hay, con SU slug real.
      const mios = await fetchMisEstudios();
      const existente = mios.find((e) => e.id === id);
      return existente ? { id, slug: existente.slug ?? slug } : null;
    }
    if (error.code === '23505' && error.message.includes('studios_slug_key')) {
      continue; // choque de slug con OTRA propietaria: reintenta con uno nuevo.
    }
    if (error.code === '23503' && error.message.includes('studios_owner_auth_user_id_fkey')) {
      await new Promise((r) => setTimeout(r, Math.min(1000, 250 * 2 ** intento))); // 250→1000ms, ~6 s en total
      continue;
    }
    break; // cualquier otro error: no reintentar.
  }
  reportDbError('[dbCreateStudio]', ultimoError ?? { message: 'No se pudo crear el estudio tras varios intentos' });
  return null;
}

// Feature #9 (ficha Lorari-vs-Tentare): la propia freelance se inserta como
// su ficha de instructora (rol PROPIETARIO), justo después de crear su
// estudio de un solo miembro. A diferencia de dbInsertInstructor (que pasa
// por /api/equipo — pensado para que UNA propietaria YA existente dé de
// alta a otra persona, sin auth_user_id en el payload), esto es un INSERT
// directo a la tabla: la policy `owner_write_instructores` (FOR ALL,
// `current_rol()='PROPIETARIO' AND studio_id=current_studio_id()`, verificada
// en vivo) ya lo permite sola, porque `current_studio_id()` para esta
// persona resuelve por el brazo `studios.owner_auth_user_id` del studio que
// se acaba de crear (todavía no tiene ninguna fila en `instructores`) — sin
// RPC ni service-role nuevos.
export async function dbInsertInstructoraPropia(fields: {
  id: string; studioId: string; authUserId: string; nombre: string; email: string | null;
}): Promise<ResultadoEscritura> {
  const { error } = await supabase.from('instructores').insert({
    id: fields.id, studio_id: fields.studioId, auth_user_id: fields.authUserId,
    nombre: fields.nombre, email: fields.email, rol: 'PROPIETARIO', activo: true,
  });
  if (!error) return ESCRITURA_OK;
  // Mismo caso que `dbCreateStudio` (efecto re-disparado, doble clic, o el
  // login anterior sí escribió pero el cliente no vio la respuesta): el
  // `UNIQUE(auth_user_id, studio_id)` de `instructores_auth_studio_unique`
  // (migr 20260731003736) ya garantiza que solo puede existir ESTA fila para
  // esta persona en este estudio, así que un choque contra ella significa
  // "ya está insertada", no un fallo — sin este tratamiento, un reintento
  // desde `/login` quedaría fallando en silencio para siempre (el estudio y
  // la instructora ya existen, pero `pending_freelance` nunca se limpiaría).
  if (error.code === '23505' && error.message.includes('instructores_auth_studio_unique')) return ESCRITURA_OK;
  return falloEscritura('[dbInsertInstructoraPropia]', error);
}

export interface SedeSeleccionable {
  id: string;
  nombre: string;
  slug: string | null;
  ciudad: string | null;
  // P2-14: rol EFECTIVO en esa sede concreta — puede ser PROPIETARIO en una
  // y MANAGER/INSTRUCTOR en otra, no es un dato global de la persona.
  rol: string | null;
}

// Lista las sedes que el usuario autenticado puede operar (dueño o
// instructora), para pintar el selector de sede del ProfileMenu. Vía RPC
// SECURITY DEFINER con columnas whitelisted (mis_estudios(), migración 0066)
// — nunca una policy de fila sobre `studios`, que expone columnas sensibles
// (nif, stripe_customer_id, kiosk_token...) a cualquiera con acceso de fila.
export async function fetchMisEstudios(): Promise<SedeSeleccionable[]> {
  const { data, error } = await supabase.rpc('mis_estudios');
  if (error) { reportDbError('[fetchMisEstudios]', error); return []; }
  return (data as SedeSeleccionable[]) ?? [];
}

// Cambia la sede activa de la sesión actual (selector "cambiar de sede").
// Upsert directo del lado del cliente: la policy `self_rw_sesion_activa` ya
// restringe la escritura a la propia fila, y `current_studio_id()` revalida
// en cada lectura posterior que el usuario realmente tiene acceso a esa sede
// — un studioId ajeno aquí simplemente queda sin efecto, no hace falta una
// ruta de servidor intermedia.
export async function cambiarSedeActiva(authUserId: string, studioId: string): Promise<boolean> {
  const { error } = await supabase.from('sesion_activa').upsert({ auth_user_id: authUserId, studio_id: studioId });
  if (error) { reportDbError('[cambiarSedeActiva]', error); return false; }
  return true;
}

// Resuelve el studio_id a partir del slug público de la URL (/reservar/[slug]...).
export async function resolveStudioIdBySlug(slug: string): Promise<string | null> {
  // P-2: RPC SECURITY DEFINER que devuelve solo el id. La lectura directa
  // requería que cualquier autenticado pudiera leer la tabla entera.
  const { data } = await supabase.rpc('studio_id_por_slug', { p_slug: slug });
  return (data as string | null) ?? null;
}

export async function dbUpdateStudioAvatar(avatarId: string | null) {
  return dbUpdateStudio({ avatarAdmin: avatarId });
}

export async function dbDeleteInstructor(id: string): Promise<ResultadoEscritura> {
  try {
    const res = await fetch('/api/equipo', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...(await staffAuthHeader()) },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ status: res.status }));
      return falloEscritura('[dbDeleteInstructor]', body);
    }
    return ESCRITURA_OK;
  } catch (e) {
    return falloEscritura('[dbDeleteInstructor]', e);
  }
}

const RECENT_FEED_LIMIT = 500;


function mapDiaHorario(r: RowStudioHorario): DiaHorario {
  return {
    diaSemana: r.dia_semana,
    abierto: r.abierto,
    horaApertura: r.hora_apertura,
    horaCierre: r.hora_cierre,
  };
}

function mapStudio(r: RowStudios, horario?: RowStudioHorario[]): Studio {
  return {
    id: r.id,
    nombre: r.nombre,
    nif: r.nif,
    razonSocial: r.razon_social,
    direccion: r.direccion,
    ciudad: r.ciudad,
    descripcion: r.descripcion ?? null,
    anioFundacion: r.anio_fundacion ?? null,
    codigoPostal: r.codigo_postal,
    normasTexto: r.normas_texto ?? null,
    email: r.email,
    telefono: r.telefono,
    colorPrimario: r.color_primario,
    temaPortal: r.tema_portal ?? 'original',
    portalReact: r.portal_react ?? false,
    widgetDominiosAutorizados: r.widget_dominios_autorizados ?? [],
    logoUrl: r.logo_url ?? null,
    ivaPorDefecto: r.iva_por_defecto ?? 21,
    depUmbralAlto: r.dep_umbral_alto ?? 25,
    depUmbralMedio: r.dep_umbral_medio ?? 15,
    depVentanaDias: r.dep_ventana_dias ?? 90,
    plan: r.plan,
    tipoCuenta: (r.tipo_cuenta as Studio['tipoCuenta']) ?? 'ESTUDIO',
    avatarAdmin: r.avatar_admin ?? null,
    fotoUrl: r.foto_url ?? null,
    imagenBienvenidaUrl: r.imagen_bienvenida_url ?? null,
    ownerAuthUserId: r.owner_auth_user_id ?? null,
    slug: r.slug ?? null,
    creadoEn: r.creado_en,
    stripeAccountId: r.stripe_account_id ?? null,
    googleCalendarEmail: r.google_calendar_email ?? null,
    gmailEmail: r.gmail_email ?? null,
    zoomEmail: r.zoom_email ?? null,
    klaviyoAccountName: r.klaviyo_account_name ?? null,
    gestoriaEmail: r.gestoria_email ?? null,
    gestoriaEnvioAutomatico: (r.gestoria_envio_automatico as 'desactivado' | 'trimestral') ?? 'desactivado',
    cadenaId: r.cadena_id ?? null,
    stripeCustomerId: r.stripe_customer_id ?? null,
    subscriptionId: r.subscription_id ?? null,
    subscriptionStatus: r.subscription_status ?? null,
    currentPeriodEnd: r.current_period_end ?? null,
    cancelacionVentanaHoras: r.cancelacion_ventana_horas ?? 12,
    cancelacionDevolverBonoTardia: r.cancelacion_devolver_bono_tardia ?? false,
    reservaExigirPlan: r.reserva_exigir_plan ?? true,
    compraPublicaModo: (r.compra_publica_modo as 'EXIGIR_REGISTRO' | 'CREAR_FICHA') ?? 'EXIGIR_REGISTRO',
    reservaMaxSimultaneas: r.reserva_max_simultaneas ?? null,
    reservaVentanaMinimaMinutos: r.reserva_ventana_minima_minutos ?? 0,
    reservaAntelacionMaximaDias: r.reserva_antelacion_maxima_dias ?? null,
    permiteListaEspera: r.permite_lista_espera ?? true,
    horaApertura: r.hora_apertura ?? '08:00:00',
    horaCierre: r.hora_cierre ?? '22:00:00',
    requiereAprobacion: r.requiere_aprobacion ?? false,
    listaEsperaPlazoAceptacionMinutos: r.lista_espera_plazo_aceptacion_minutos ?? 0,
    minimoAsistentesPorClase: r.minimo_asistentes_por_clase ?? 0,
    penalizacionImporteEur: r.penalizacion_importe_eur ?? null,
    penalizacionAplicaCancelacionTardia: r.penalizacion_aplica_cancelacion_tardia ?? true,
    penalizacionAplicaNoShow: r.penalizacion_aplica_no_show ?? true,
    penalizacionCobroAutomatico: r.penalizacion_cobro_automatico ?? false,
    reembolsosActivos: r.reembolsos_activos ?? false,
    reembolsoPlazoDias: r.reembolso_plazo_dias ?? 14,
    reembolsoSoloSinUsar: r.reembolso_solo_sin_usar ?? true,
    requiereCheckinQr: r.requiere_checkin_qr ?? true,
    stripeTerminalReaderId: r.stripe_terminal_reader_id ?? null,
    stripeTerminalLocationId: r.stripe_terminal_location_id ?? null,
    onboardingDescartadoEn: r.onboarding_descartado_en ?? null,
    sepaAcreedorId: r.sepa_acreedor_id ?? null,
    sepaIban: r.sepa_iban ?? null,
    sepaTitular: r.sepa_titular ?? null,
    // A diferencia del resto de campos de este mapper, aquí NO se puede usar
    // `?? null`: un valor NULL real (estudio recién creado) y una fila que ni
    // siquiera trae la columna (fixtures/mocks antiguos, p.ej. toda la suite
    // E2E anterior a esta migración) colapsarían al mismo `null` — y ese
    // `null` es precisamente lo que hace aparecer la pantalla de bienvenida a
    // pantalla completa. Con `in` se distingue "columna ausente → tratar como
    // ya vista" (seguro) de "columna presente y NULL → estudio nuevo, mostrarla".
    bienvenidaVistaEn: 'bienvenida_vista_en' in r ? (r.bienvenida_vista_en ?? null) : COLUMNA_AUSENTE_ASUME_YA_VISTA,
    onbCentros: r.onb_centros ?? null,
    onbSoftwareAnterior: r.onb_software_anterior ?? null,
    onbAlumnosActivos: r.onb_alumnos_activos ?? null,
    onbImportarDatos: r.onb_importar_datos ?? null,
    onbPrioridad: r.onb_prioridad ?? null,
    onbAyudaAlta: r.onb_ayuda_alta ?? null,
    decisionContratoVistoEn: r.decision_contrato_visto_en ?? null,
    tourVistoEn: r.tour_visto_en ?? null,
    horarioSemana: horario?.map(mapDiaHorario),
  } as Studio;
}

// Guarda el lector (datáfono) emparejado con el estudio. Lo llama la ruta de
// Terminal (servidor, sin sesión de usuario) → service role.


const COLUMNA_AUSENTE_ASUME_YA_VISTA = '1970-01-01T00:00:00.000Z';

function dbEscritura(): SupabaseClient {
  return getSupabaseAdmin() ?? supabase;
}

export function mapInstructor(r: RowInstructores): Instructor {
  return {
    id: r.id,
    studioId: r.studio_id,
    nombre: r.nombre,
    email: r.email ?? null,
    telefono: r.telefono ?? null,
    color: r.color,
    activo: r.activo,
    avatar: r.avatar ?? null,
    fotoUrl: r.foto_url ?? null,
    rol: r.rol ?? 'INSTRUCTOR',
    authUserId: r.auth_user_id ?? null,
    bio: r.bio ?? null,
  } as Instructor;
}

// Mismo shape que mapInstructor, para /reservar/[slug] y el resto del
// catálogo público: sin email/teléfono personal ni authUserId. El comentario
// de fetchPublicStudioData ya prometía "nada de PII" en este catálogo —
// mapInstructor() se usaba ahí directamente y sí la llevaba (el mismo mapper
// que alimenta el panel interno, nunca pensado para salir del estudio).

// Cuántas de las consultas del arranque se resuelven a la vez.
//
// POR QUÉ NO TODAS DE GOLPE. `Promise.all` sobre las ~53 consultas lanzaba un
// abanico de 55 peticiones simultáneas desde el navegador. Medido en producción
// con la Resource Timing API sobre el dashboard real: una consulta SOLA tarda
// 107-117 ms, y dentro de ese abanico la mediana sube a 1.452 ms — un factor
// ~13. No son consultas lentas: se estorban entre ellas. La ventana completa
// era de 9,4 s.
//
// Es el MISMO hallazgo que ya está documentado en backup-engine.ts
// (`TABLAS_A_LA_VEZ = 8`): «52 consultas simultáneas multiplican por ~19 lo que
// tarda cada una por separado». Aquel lo aprendió para los backups; al arranque
// del panel, que es la pantalla que abre todo el mundo, nunca llegó.
//
// Ni 1 (serían ~53 viajes en serie) ni 53. Se usa el mismo 8 ya medido en este
// proyecto contra esta misma base de datos.
const CONSULTAS_A_LA_VEZ = 8;

/**
 * Resuelve una lista de consultas con un límite de concurrencia, devolviendo
 * una TUPLA con la misma forma que `Promise.all` — el desestructurado
 * posicional de abajo (53 posiciones) depende de eso, y un `T[]` genérico
 * colapsaría los tipos a una unión.
 *
 * Funciona porque los builders de supabase-js son PEREZOSOS: `db.from(...)
 * .select(...)` no dispara ninguna petición hasta que se espera — el `fetch`
 * vive dentro de `then()` (PostgrestBuilder). Verificado en el fuente de
 * @supabase/postgrest-js 2.110.2 antes de escribir esto. Por eso se puede
 * construir la lista entera y resolverla por tandas sin tocar ni una consulta.
 */
async function enTandas<T extends readonly unknown[] | []>(
  consultas: T,
): Promise<{ -readonly [P in keyof T]: Awaited<T[P]> }> {
  const res = await mapLimit(
    consultas as unknown as unknown[],
    CONSULTAS_A_LA_VEZ,
    (q) => Promise.resolve(q),
  );
  return res as { -readonly [P in keyof T]: Awaited<T[P]> };
}

export async function fetchCriticalStudioData(studioId?: string) {
  const sid = studioId ?? getCurrentStudioId();
  // Decision-OS / crons: esta carga la invoca también código de SERVIDOR sin
  // sesión de usuario (Inngest — construirSnapshot, motor de automatizaciones).
  // Con el cliente anónimo, la RLS (current_studio_id() = null) devolvía CERO
  // filas de socios/recibos/sesiones → el snapshot llegaba vacío y todos los
  // especialistas veían "todo en orden" (bug del Centro de Control). Se prefiere
  // el service-role cuando existe (servidor); en el navegador getSupabaseAdmin()
  // es null y se usa el anónimo + la sesión del usuario, que RLS scopea bien.
  const db = getSupabaseAdmin() ?? supabase;
  const [
    studioRes,
    studioHorarioRes,
    usuariosRes,
    sociosRes,
    planesTarifaRes,
    suscripcionesRes,
    salasRes,
    spotsRes,
    tiposClaseRes,
    instructoresRes,
    sesionesRes,
    reservasRes,
    recibosRes,
    facturasRes,
    citasRes,
    productosPOSRes,
    ventasPOSRes,
    campanasRes,
    automatizacionesRes,
    automationRulesRes,
    automationLogsRes,
    codigosDescuentoRes,
    actividadRecienteRes,
    notificacionesRes,
    videosOnDemandRes,
    postsComunidadRes,
    notasInternasRes,
    condicionesSaludRes,
    respuestasSesionRes,
    integracionesRes,
    mensajesEquipoRes,
    rewardRulesRes,
    rewardActionsRes,
    memberCreditsRes,
    rewardCatalogRes,
    rewardRedemptionsRes,
    achievementDefinitionsRes,
    achievementProgressRes,
    levelDefinitionsRes,
    challengeDefinitionsRes,
    challengeProgressRes,
    dashboardChartsRes,
    citasServiciosRes,
    citasDisponibilidadRes,
    bloqueosMaquinaRes,
    plazasFijasRes,
    recuperacionesRes,
    socioExcepcionesRes,
    mandatosSepaRes,
    contenidoPortalRes,
    bannersPortalRes,
    // Añadido AL FINAL de la lista a propósito: el desestructurado es
    // posicional, así que meterlo en medio desplazaría las 52 posiciones
    // siguientes. Antes esta consulta se hacía DESPUÉS del Promise.all
    // (dentro de hidratarTiposDePlanes), o sea un viaje de red entero en
    // serie colgando del arranque del panel, cuando en realidad solo
    // necesita `sid` — lo que necesita los planes ya cargados es el cruce en
    // memoria, no la consulta.
    planTiposClaseRes,
  ] = await enTandas([
    db.from('studios').select('*').eq('id', sid).single(),
    db.from('studio_horario').select('*').eq('studio_id', sid).order('dia_semana', { ascending: true }),
    db.from('usuarios').select('*').eq('studio_id', sid),
    // A-3/A-4: las socias con baja lógica (borrado_en) no entran al panel; su
    // rastro fiscal (recibos/facturas) sí queda y se muestra como "Socia eliminada".
    // fetchAllRows (no un .select('*') a secas): sin paginar, PostgREST corta en
    // 1000 filas — un estudio/cadena grande vería la retención y el ranking de
    // clientas de Informes subestimados en silencio (mismo bug ya cerrado para
    // sesiones/reservas/recibos/facturas/ventas_pos, aquí se había quedado fuera).
    fetchAllRows(sid, 'socios', (from, to) => db.from('socios').select('id, studio_id, nombre, apellidos, email, telefono, nif, fecha_alta, activo, lead_stage, tags, avatar, stripe_customer_id, stripe_payment_method_id, tarjeta_exp_mes, tarjeta_exp_anio, tarjeta_marca, tarjeta_ultimos4, metodo_pago_preferido, sepa_mandate_id, sepa_payment_method_id, fecha_nacimiento, direccion, foto_url, referido_por, origen_lead, campos_extra, aceptacion_fecha, aceptacion_firma, aceptacion_origen, aceptacion_por, consentimiento_salud_fecha, consentimiento_salud_registrado_por, consentimiento_salud_revocado_en, consentimiento_marketing_en, consentimiento_marketing_por').eq('studio_id', sid).is('borrado_en', null).range(from, to)),
    db.from('planes_tarifa').select('*').eq('studio_id', sid),
    db.from('suscripciones').select('id, studio_id, socio_id, plan_id, estado, fecha_inicio, fecha_fin, sesiones_restantes, stripe_subscription_id').eq('studio_id', sid),
    db.from('salas').select('*').eq('studio_id', sid),
    db.from('spots').select('*').eq('studio_id', sid),
    db.from('tipos_clase').select('*').eq('studio_id', sid),
    db.from('instructores').select('*').eq('studio_id', sid),
    fetchAllRows(sid, 'sesiones', (from, to) => db.from('sesiones').select('id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada, notas, precio_puntual, google_event_id, serie_id, incidencia_texto').eq('studio_id', sid).range(from, to)),
    fetchAllRows(sid, 'reservas', (from, to) => db.from('reservas').select('id, studio_id, sesion_id, socio_id, estado, spot_id, posicion_espera, oferta_expira_en, check_in_en, creado_en, confirmacion_pedida_en, confirmado_en, recordatorio_confirmacion_en').eq('studio_id', sid).range(from, to)),
    fetchAllRows(sid, 'recibos', (from, to) => db.from('recibos').select('id, studio_id, socio_id, suscripcion_id, concepto, importe, estado, fecha_vencimiento, fecha_cobro, fecha_devolucion, intentos_reintento, metodo_cobro, sepa_estado, disputa_estado, disputa_stripe_id, stripe_payment_intent_id, entrega_sesiones_despues, reembolso_solicitado_en, reembolso_stripe_id').eq('studio_id', sid).range(from, to)),
    fetchAllRows(sid, 'facturas', (from, to) => db.from('facturas').select('id, studio_id, recibo_id, numero_completo, fecha_emision, receptor_nombre, receptor_nif, base_imponible, tipo_iva, cuota_iva, total, verifactu_hash, verifactu_prev_hash, verifactu_ts, verifactu_seq, fiskaly_invoice_id, verifactu_qr_url, verifactu_qr_imagen, verifactu_estado, verifactu_csv, serie, tipo, rectifica_a, tipo_rectificativa, importe_rectificacion').eq('studio_id', sid).range(from, to)),
    // citas: se quedó fuera por error del arreglo de paginación de sus
    // hermanas (2026-07-24, #438) — mismo riesgo de truncado silencioso a
    // 1000 filas para un estudio con muchas citas 1:1 (auditoría 2026-07-29 §2.3).
    fetchAllRows(sid, 'citas', (from, to) => db.from('citas').select('*').eq('studio_id', sid).range(from, to)),
    db.from('productos_pos').select('*').eq('studio_id', sid),
    fetchAllRows(sid, 'ventas_pos', (from, to) => db.from('ventas_pos').select('*').eq('studio_id', sid).range(from, to)),
    db.from('campanas').select('*').eq('studio_id', sid),
    db.from('automatizaciones').select('*').eq('studio_id', sid),
    db.from('automation_rules').select('*').eq('studio_id', sid),
    // automation_logs: ordenado newest-first, SIN límite. El motor de
    // automatizaciones (automation-engine) lo usa como índice de dedup para no
    // re-accionar a una socia ya accionada; acotarlo reintroduciría cobros/
    // emails duplicados. Su bounding real necesita dedup por query (follow-up).
    db.from('automation_logs').select('*').eq('studio_id', sid).order('ejecutado_en', { ascending: false }),
    db.from('codigos_descuento').select('*').eq('studio_id', sid),
    // Feeds de solo-display: ventana reciente ordenada. Seguro acotar — ningún
    // consumidor agrega sobre el histórico completo (ver P0-2/9).
    db.from('actividad_reciente').select('*').eq('studio_id', sid).order('creado_en', { ascending: false }).limit(RECENT_FEED_LIMIT),
    db.from('notificaciones').select('*').eq('studio_id', sid).order('creada_en', { ascending: false }).limit(RECENT_FEED_LIMIT),
    db.from('videos_on_demand').select('*').eq('studio_id', sid),
    db.from('posts_comunidad').select('*').eq('studio_id', sid),
    db.from('notas_internas').select('*').eq('studio_id', sid),
    db.from('condiciones_salud').select('*').eq('studio_id', sid),
    db.from('respuestas_sesion').select('*').eq('studio_id', sid),
    db.from('integraciones').select('*').eq('studio_id', sid),
    // El chat de equipo ya NO se consume desde aquí (se carga bajo demanda en su
    // propia página vía dbListMensajesEquipo). Se mantiene la posición del array
    // para no romper el desestructurado posicional de abajo, pero acotado para
    // no traer el histórico completo en cada arranque.
    db.from('mensajes_equipo').select('*').eq('studio_id', sid).order('creado_en', { ascending: false }).limit(1),
    db.from('reward_rules').select('*').eq('studio_id', sid),
    db.from('reward_actions').select('*').eq('studio_id', sid),
    db.from('member_credits').select('*').eq('studio_id', sid),
    db.from('reward_catalog').select('*').eq('studio_id', sid),
    db.from('reward_redemptions').select('*').eq('studio_id', sid),
    db.from('achievement_definitions').select('*').eq('studio_id', sid),
    db.from('achievement_progress').select('*').eq('studio_id', sid),
    db.from('level_definitions').select('*').eq('studio_id', sid),
    db.from('challenge_definitions').select('*').eq('studio_id', sid),
    db.from('challenge_progress').select('*').eq('studio_id', sid),
    db.from('dashboard_charts').select('*').eq('studio_id', sid),
    db.from('citas_servicios').select('*').eq('studio_id', sid),
    db.from('citas_disponibilidad').select('*').eq('studio_id', sid),
    db.from('bloqueos_maquina').select('*').eq('studio_id', sid),
    db.from('plazas_fijas').select('*').eq('studio_id', sid),
    db.from('recuperaciones').select('*').eq('studio_id', sid),
    db.from('socio_excepciones').select('*').eq('studio_id', sid),
    db.from('mandatos_sepa').select('*').eq('studio_id', sid),
    db.from('contenido_portal').select('*').eq('studio_id', sid).maybeSingle(),
    // Sin filtrar por activo/ubicación: el editor del dashboard necesita ver
    // TODOS los banners (incluidos inactivos/de otras pantallas) para poder
    // gestionarlos — el filtro para lo que se muestra en el portal vive en
    // fetchPublicStudioData.
    db.from('contenido_portal_banners').select('*').eq('studio_id', sid).order('orden', { ascending: true }),
    db.from('plan_tipos_clase').select('plan_id, tipo_clase_id').eq('studio_id', sid),
  ]);

  // Tipos de clase que cubre cada plan (0111): viven en tabla puente, así que
  // no llegan en el SELECT. Sin esto, el panel creería que todo bono vale para todo.
  // El cruce es en memoria; la consulta ya vino arriba, en paralelo con el resto.
  const planesConTiposPanel = unirTiposAPlanes(
    (planesTarifaRes.data ?? []).map(mapPlanTarifa),
    planTiposClaseRes.data as { plan_id: string; tipo_clase_id: string }[] | null,
  );
  return {
    studio: studioRes.data ? mapStudio(studioRes.data, studioHorarioRes.data ?? undefined) : null,
    // Política/términos persistidos (0107); null = el cliente aplica el texto por
    // defecto. Antes StudioConfig no se hidrataba nunca y perdía lo que la dueña editó.
    studioConfig: {
      politicaPrivacidad: (studioRes.data as { politica_privacidad?: string | null } | null)?.politica_privacidad ?? null,
      terminosServicio: (studioRes.data as { terminos_servicio?: string | null } | null)?.terminos_servicio ?? null,
    },
    usuarios: (usuariosRes.data ?? []).map(mapUsuario),
    socios: (sociosRes.data ?? []).map(mapSocio),
    planesTarifa: planesConTiposPanel,
    suscripciones: (suscripcionesRes.data ?? []).map(mapSuscripcion),
    salas: (salasRes.data ?? []).map(mapSala),
    spots: (spotsRes.data ?? []).map(mapSpot),
    tiposClase: (tiposClaseRes.data ?? []).map(mapTipoClase),
    contenidoPortal: contenidoPortalRes.data ? mapContenidoPortal(contenidoPortalRes.data as RowContenidoPortal) : null,
    bannersPortal: (bannersPortalRes.data ?? []).map((r) => mapBannerPortal(r as RowContenidoPortalBanners)),
    instructores: (instructoresRes.data ?? []).map(mapInstructor),
    sesiones: (sesionesRes.data ?? []).map(mapSesion),
    reservas: (reservasRes.data ?? []).map(mapReserva),
    recibos: (recibosRes.data ?? []).map(mapRecibo),
    facturas: (facturasRes.data ?? []).map(mapFactura),
    citas: (citasRes.data ?? []).map(mapCita),
    productosPOS: (productosPOSRes.data ?? []).map(mapProductoPOS),
    ventasPOS: (ventasPOSRes.data ?? []).map(mapVentaPOS),
    campanas: (campanasRes.data ?? []).map(mapCampana),
    automatizaciones: (automatizacionesRes.data ?? []).map(mapAutomatizacion),
    automationRules: (automationRulesRes.data ?? []).map(mapAutomationRule),
    automationLogs: (automationLogsRes.data ?? []).map(mapAutomationLog),
    codigosDescuento: (codigosDescuentoRes.data ?? []).map(mapCodigoDescuento),
    actividadReciente: (actividadRecienteRes.data ?? []).map(mapActividadReciente),
    notificaciones: (notificacionesRes.data ?? []).map(mapNotificacion),
    videosOnDemand: (videosOnDemandRes.data ?? []).map(mapVideoOnDemand),
    postsComunidad: (postsComunidadRes.data ?? []).map(mapPostComunidad),
    notasInternas: (notasInternasRes.data ?? []).map(mapNotaInterna),
    condicionesSalud: (condicionesSaludRes.data ?? []).map(mapCondicionSalud),
    respuestasSesion: (respuestasSesionRes.data ?? []).map(mapRespuestaSesion),
    integraciones: (integracionesRes.data ?? []).map(mapIntegracion),
    mensajesEquipo: (mensajesEquipoRes.data ?? []).map(mapMensajeEquipo),
    rewardRules: (rewardRulesRes.data ?? []).map(mapRewardRule),
    rewardActions: (rewardActionsRes.data ?? []).map(mapRewardAction),
    memberCredits: (memberCreditsRes.data ?? []).map(mapMemberCredits),
    rewardCatalog: (rewardCatalogRes.data ?? []).map(mapRewardCatalogItem),
    rewardRedemptions: (rewardRedemptionsRes.data ?? []).map(mapRewardRedemption),
    achievementDefinitions: (achievementDefinitionsRes.data ?? []).map(mapAchievementDefinition),
    achievementProgress: (achievementProgressRes.data ?? []).map(mapAchievementProgress),
    levelDefinitions: (levelDefinitionsRes.data ?? []).map(mapLevelDefinition),
    challengeDefinitions: (challengeDefinitionsRes.data ?? []).map(mapChallengeDefinition),
    challengeProgress: (challengeProgressRes.data ?? []).map(mapChallengeProgress),
    dashboardCharts: (dashboardChartsRes.data ?? []).map(mapDashboardChart),
    citasServicios: (citasServiciosRes.data ?? []).map((r) => mapServicioCita(r as RowCitasServicios)),
    citasDisponibilidad: (citasDisponibilidadRes.data ?? []).map((r) => mapDisponibilidadCita(r as RowCitasDisponibilidad)),
    bloqueosMaquina: (bloqueosMaquinaRes.data ?? []).map(mapBloqueoMaquina),
    plazasFijas: (plazasFijasRes.data ?? []).map(mapPlazaFija),
    recuperaciones: (recuperacionesRes.data ?? []).map(mapRecuperacion),
    socioExcepciones: (socioExcepcionesRes.data ?? []).map(mapSocioExcepcion),
    mandatosSepa: (mandatosSepaRes.data ?? []).map(mapMandatoSepa),
  };
}



export async function fetchDeferredStudioData(studioId?: string) {
  const sid = studioId ?? getCurrentStudioId();
  // Mismo motivo que fetchCriticalStudioData: service-role en servidor (crons),
  // anónimo + sesión en navegador.
  const db = getSupabaseAdmin() ?? supabase;
  const [
    rewardHistoryRes,
    creditTransactionsRes,
    achievementHistoryRes,
    challengeHistoryRes,
    notasProgresoRes,
    backupsRes,
  ] = await enTandas([
    // I5: estos tres historiales son append-only y crecen sin fin, pero ninguna
    // vista de STAFF los consume (el portal usa la versión member-scoped de otro
    // fetch). Se cargan acotados a los más recientes en vez de años de filas.
    // credit_transactions NO se acota: alimenta los gráficos del dashboard
    // (computeSerieGrafico), que sí necesitan la serie completa. 2.3: por eso
    // mismo es la que más se beneficia de paginar en vez de recibir el tope de
    // 1000 filas de PostgREST en silencio.
    db.from('reward_history').select('*').eq('studio_id', sid).order('creado_en', { ascending: false }).limit(RECENT_FEED_LIMIT),
    fetchAllRows(sid, 'credit_transactions', (from, to) => db.from('credit_transactions').select('*').eq('studio_id', sid).range(from, to)),
    db.from('achievement_history').select('*').eq('studio_id', sid).order('creado_en', { ascending: false }).limit(RECENT_FEED_LIMIT),
    db.from('challenge_history').select('*').eq('studio_id', sid).order('creado_en', { ascending: false }).limit(RECENT_FEED_LIMIT),
    db.from('notas_progreso').select('*').eq('studio_id', sid),
    db.from('backups').select('id, studio_id, tipo, creado_en').eq('studio_id', sid).order('creado_en', { ascending: false }),
  ]);

  return {
    rewardHistory: (rewardHistoryRes.data ?? []).map(mapRewardHistory),
    creditTransactions: (creditTransactionsRes.data ?? []).map(mapCreditTransaction),
    achievementHistory: (achievementHistoryRes.data ?? []).map(mapAchievementHistory),
    challengeHistory: (challengeHistoryRes.data ?? []).map(mapChallengeHistory),
    notasProgreso: (notasProgresoRes.data ?? []).map(mapNotaProgreso),
    // La query de backups usa un select estrecho (excluye la columna 'datos'
    // pesada); afirmamos la fila para el mapper.
    backups: (backupsRes.data ?? []).map(r => mapBackupMeta(r as RowBackups)),
  };
}

// Fase A1 (Decision OS): sustituciones sin resolver, para que el especialista
// EQUIPO pueda ver "instructora sin contestar". Fuera de fetchAllStudioData
// a propósito — nadie más lo necesita hoy y no vale la pena cargarlo en cada
// pantalla del panel. Mismo patrón service-role-cuando-existe que
// fetchCriticalStudioData (Decision OS/crons corren sin sesión de usuario,
// la RLS anónima devolvería cero filas).
export interface SustitucionSnapshotRow {
  id: string;
  studioId: string;
  sesionId: string;
  instructorOriginalId: string | null;
  estado: string;
  creadoEn: string;
}

/** Ver BloqueoAgendaSnapshot en lib/decision/tipos.ts (mismo shape). */
export interface BloqueoAgendaSnapshotRow {
  instructorId: string;
  fecha: string;
  horaInicio: string | null;
  horaFin: string | null;
}

export async function fetchSustitucionesRecientes(studioId: string, desdeISO: string): Promise<SustitucionSnapshotRow[]> {
  const db = getSupabaseAdmin() ?? supabase;
  const { data, error } = await db
    .from('sustituciones')
    .select('id, studio_id, sesion_id, instructor_original_id, estado, creado_en')
    .eq('studio_id', studioId)
    .gte('creado_en', desdeISO) as { data: { id: string; studio_id: string; sesion_id: string; instructor_original_id: string | null; estado: string; creado_en: string }[] | null; error: { message: string } | null };
  if (error) { reportDbError('[fetchSustitucionesRecientes]', error); return []; }
  return (data ?? []).map(r => ({
    id: r.id, studioId: r.studio_id, sesionId: r.sesion_id,
    instructorOriginalId: r.instructor_original_id, estado: r.estado, creadoEn: r.creado_en,
  }));
}

// Bloqueos de agenda futuros de las instructoras (Decision OS · Agenda A5).
// Server-only con service-role, igual que el resto del snapshot: la RLS de
// gestión solo deja a cada instructora ver lo suyo, y aquí hace falta el
// estudio entero para saber qué clases programadas se quedan sin quien las dé.
//
// Solo tipo='bloqueo': las excepciones 'extra' son lo contrario (disponibilidad
// añadida) y no ponen ninguna clase en riesgo. Devuelve filas crudas, no un Map
// — ver BloqueoAgendaSnapshot en lib/decision/tipos.ts.
export async function fetchBloqueosAgendaFuturos(studioId: string, desdeDia: string, hastaDia: string): Promise<BloqueoAgendaSnapshotRow[]> {
  const db = getSupabaseAdmin() ?? supabase;
  const { data, error } = await db
    .from('instructora_disponibilidad_excepciones')
    .select('instructor_id, fecha, hora_inicio, hora_fin')
    .eq('studio_id', studioId)
    .eq('tipo', 'bloqueo')
    .gte('fecha', desdeDia)
    .lte('fecha', hastaDia) as { data: { instructor_id: string; fecha: string; hora_inicio: string | null; hora_fin: string | null }[] | null; error: { message: string } | null };
  if (error) { reportDbError('[fetchBloqueosAgendaFuturos]', error); return []; }
  return (data ?? []).map(r => ({
    instructorId: r.instructor_id, fecha: r.fecha,
    horaInicio: r.hora_inicio, horaFin: r.hora_fin,
  }));
}

// Margen de contribución por clase (Decision OS/Informes): tarifa/hora por
// instructora. Server-only con service-role (bypasa la RLS de gestión, que
// solo deja leer la propia fila a la instructora) — igual que el resto del
// snapshot, que necesita ver todo el estudio para calcular, no solo lo suyo.
// Devuelve filas crudas, no un Map — SnapshotEstudio.instructorTarifas debe
// ser JSON-serializable (cruza un step.run de Inngest en decision.ts); el
// Map de consulta se construye en construirIndices (senales.ts).
//
// Vía deliberadamente separada de `fetchTarifasEquipo` (api-client.ts, usada
// por Informes): esa pasa por `/api/equipo/tarifas` con sesión de staff y la
// RLS real; esta es server-role para el snapshot del cron. Mismo criterio
// que ya separa `/api/mi-disponibilidad` de `/api/public/disponibilidad` —
// mecanismos de auth distintos, no se mezclan en un mismo camino aunque
// lean la misma tabla.
export interface InstructorTarifaRow {
  instructorId: string;
  tarifaHora: number | null;
}

export async function fetchInstructorTarifas(studioId: string): Promise<InstructorTarifaRow[]> {
  const db = getSupabaseAdmin() ?? supabase;
  const { data, error } = await db
    .from('instructor_tarifas')
    .select('instructor_id, tarifa_hora')
    .eq('studio_id', studioId) as { data: { instructor_id: string; tarifa_hora: number | null }[] | null; error: { message: string } | null };
  if (error) { reportDbError('[fetchInstructorTarifas]', error); return []; }
  return (data ?? []).map(r => ({ instructorId: r.instructor_id, tarifaHora: r.tarifa_hora }));
}

// Informe fila 14 (Decision OS): intentos de reserva self-service que el
// servidor rechazó de verdad — "es la alumna que quería pagar y no pudo".
// Mismo criterio service-role que fetchInstructorTarifas/fetchSustitucionesRecientes.
// Devuelve filas crudas (array, no Map) — mismo motivo de siempre.
export interface IntentoFallidoRow {
  id: string;
  socioId: string;
  sesionId: string | null;
  tipoClaseId: string | null;
  motivo: string;
  creadoEn: string;
}

export async function fetchIntentosFallidosRecientes(studioId: string, desdeISO: string): Promise<IntentoFallidoRow[]> {
  const db = getSupabaseAdmin() ?? supabase;
  const { data, error } = await db
    .from('intentos_reserva_fallidos')
    .select('id, socio_id, sesion_id, tipo_clase_id, motivo, creado_en')
    .eq('studio_id', studioId)
    .gte('creado_en', desdeISO) as { data: { id: string; socio_id: string; sesion_id: string | null; tipo_clase_id: string | null; motivo: string; creado_en: string }[] | null; error: { message: string } | null };
  if (error) { reportDbError('[fetchIntentosFallidosRecientes]', error); return []; }
  return (data ?? []).map(r => ({
    id: r.id, socioId: r.socio_id, sesionId: r.sesion_id,
    tipoClaseId: r.tipo_clase_id, motivo: r.motivo, creadoEn: r.creado_en,
  }));
}

// Fase A1 (Decision OS): nº de sedes de la cadena a la que pertenece el
// estudio, para calibrar umbrales de "tamaño" — una cadena de 5 sedes con
// pocas socias en cada una no es un "estudio pequeño". 1 si no hay cadena.
export async function contarSedesCadena(cadenaId: string): Promise<number> {
  const db = getSupabaseAdmin() ?? supabase;
  const { count, error } = await db.from('studios').select('id', { count: 'exact', head: true }).eq('cadena_id', cadenaId);
  if (error) { reportDbError('[contarSedesCadena]', error); return 1; }
  return count ?? 1;
}

// Combina ambas olas. Lo usa el cron de automatizaciones, que necesita todo.


export async function fetchAllStudioData(studioId?: string) {
  // Aquí sí `Promise.all`: estos dos elementos ya son llamadas INVOCADAS (no
  // builders perezosos), así que arrancan igual. Cada una limita por dentro.
  const [critical, deferred] = await Promise.all([
    fetchCriticalStudioData(studioId),
    fetchDeferredStudioData(studioId),
  ]);
  return { ...critical, ...deferred };
}

// ─── Acceso público scopeado (proxy de servidor, service-role) ───────────────
// Reemplaza el acceso anónimo directo de las páginas públicas (reserva/portal/
// kiosk). Devuelve SOLO el catálogo público del estudio y, si se pasa una socia
// validada por email, los datos de ESA socia — nunca la PII de las demás.
// Se ejecuta en el servidor (usa la Service Role Key); NO importar en cliente.

// Campos del estudio seguros para exponer públicamente (nada de NIF/razón
// social/owner). El resto de la ficha fiscal no sale de aquí.


export async function hidratarTiposDePlanes<C extends { from: (t: string) => never }>(
  client: C, studioId: string, planes: PlanTarifa[],
): Promise<PlanTarifa[]> {
  if (planes.length === 0) return planes;
  const db = client as unknown as {
    from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => Promise<{ data: { plan_id: string; tipo_clase_id: string }[] | null }> } };
  };
  const { data } = await db.from('plan_tipos_clase').select('plan_id, tipo_clase_id').eq('studio_id', studioId);
  return unirTiposAPlanes(planes, data);
}

// El cruce en memoria, separado de la consulta. Lo comparten
// `hidratarTiposDePlanes` (que consulta y cruza, para quien no tiene ya las
// filas) y `fetchCriticalStudioData` (que trae las filas dentro de su
// Promise.all y solo necesita cruzar). Misma lógica en un único sitio.
export function unirTiposAPlanes(
  planes: PlanTarifa[],
  filas: { plan_id: string; tipo_clase_id: string }[] | null,
): PlanTarifa[] {
  if (planes.length === 0 || !filas || filas.length === 0) return planes;
  const porPlan = new Map<string, string[]>();
  for (const f of filas) {
    const arr = porPlan.get(f.plan_id) ?? [];
    arr.push(f.tipo_clase_id);
    porPlan.set(f.plan_id, arr);
  }
  return planes.map(p => (porPlan.has(p.id) ? { ...p, tiposClaseIds: porPlan.get(p.id) } : p));
}



export async function dbUpdateAutomationRule(id: string, studioId: string, changes: Partial<AutomationRule>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('activa' in changes) db.activa = changes.activa;
  if ('ejecutadaVeces' in changes) db.ejecutada_veces = changes.ejecutadaVeces;
  if ('ultimaEjecucion' in changes) db.ultima_ejecucion = changes.ultimaEjecucion;
  const { error } = await dbEscritura().from('automation_rules').update(db).eq('id', id).eq('studio_id', studioId);
  return error ? falloEscritura('[dbUpdateAutomationRule]', error) : ESCRITURA_OK;
}



export async function dbUpdateAutomatizacion(id: string, studioId: string, changes: Partial<Automatizacion>): Promise<ResultadoEscritura> {
  const db: Record<string, unknown> = {};
  if ('nombre' in changes) db.nombre = changes.nombre;
  if ('trigger' in changes) db.trigger = changes.trigger;
  if ('accion' in changes) db.accion = changes.accion;
  if ('asunto' in changes) db.asunto = changes.asunto;
  if ('mensaje' in changes) db.mensaje = changes.mensaje;
  if ('activa' in changes) db.activa = changes.activa;
  if ('ejecutadas' in changes) db.ejecutadas = changes.ejecutadas;
  if ('pasos' in changes) db.pasos = changes.pasos;
  const { error } = await dbEscritura().from('automatizaciones').update(db).eq('id', id).eq('studio_id', studioId);
  return error ? falloEscritura('[dbUpdateAutomatizacion]', error) : ESCRITURA_OK;
}

// Fase 3: penalizaciones pendientes de aprobación manual (studios con
// penalizacionCobroAutomatico=false) — protegido por la RLS de la propia
// tabla (`penalizaciones_lectura`: solo PROPIETARIO/RECEPCION del estudio).
export interface PenalizacionPendiente {
  id: string;
  socioId: string;
  socioNombre: string;
  importe: number;
  tipo: 'CANCELACION_TARDIA' | 'NO_SHOW';
  detectadaEn: string;
}

export async function dbListarPenalizacionesPendientes(): Promise<PenalizacionPendiente[]> {
  const { data, error } = await supabase
    .from('penalizaciones')
    .select('id, socio_id, importe, tipo, detectada_en')
    .eq('estado', 'PENDIENTE_APROBACION')
    .order('detectada_en', { ascending: true }) as { data: RowPenalizaciones[] | null; error: { message: string } | null };
  if (error) { reportDbError('[dbListarPenalizacionesPendientes]', error); return []; }
  if (!data?.length) return [];
  const socioIds = [...new Set(data.map(p => p.socio_id))];
  const { data: socios } = await supabase.from('socios').select('id, nombre, apellidos').in('id', socioIds);
  const nombrePorId = new Map((socios ?? []).map(s => [s.id as string, `${s.nombre} ${s.apellidos}`.trim()]));
  return data.map(p => ({
    id: p.id, socioId: p.socio_id, socioNombre: nombrePorId.get(p.socio_id) ?? 'Socia',
    importe: p.importe, tipo: p.tipo as 'CANCELACION_TARDIA' | 'NO_SHOW', detectadaEn: p.detectada_en,
  }));
}




// ── Devoluciones pendientes de revisar ──────────────────────────────────────
//
// Igual que `dbListarPenalizacionesPendientes`: cliente con RLS y SIN `studioId`
// — el acotado por estudio y por rol lo hace la policy `devoluciones_lectura`
// (`current_studio_id()` + `puede_ver_finanzas()`), no el parámetro.
//
// Trae de una vez todo lo que necesita la vista previa: el snapshot de lo que
// entregó el cobro y el estado ACTUAL de la suscripción. La comparación entre
// los dos es lo que decide si la reversión sigue siendo exacta, así que ninguno
// de los dos puede faltar.

export interface DevolucionPendiente {
  id: string;
  socioNombre: string;
  origen: 'REEMBOLSO_TOTAL' | 'REEMBOLSO_PARCIAL' | 'CHARGEBACK';
  importeCobrado: number;
  importeDevuelto: number;
  detectadaEn: string;
  /** Lo que el cobro entregó, guardado al entregarlo. */
  snapshot: Snapshot;
  /** Cómo está la suscripción AHORA. `null` = ya no existe. */
  actual: SuscripcionActual | null;
  planNombre: string | null;
}

export async function dbListarDevolucionesPendientes(): Promise<DevolucionPendiente[]> {
  const { data, error } = await supabase
    .from('devoluciones')
    .select('id, socio_id, suscripcion_id, recibo_id, origen, importe_cobrado, importe_devuelto, detectada_en')
    .eq('estado', 'PENDIENTE_REVISION')
    .order('detectada_en', { ascending: true }) as {
      data: Array<{
        id: string; socio_id: string | null; suscripcion_id: string | null; recibo_id: string;
        origen: string; importe_cobrado: number; importe_devuelto: number; detectada_en: string;
      }> | null;
      error: { message: string } | null;
    };
  if (error) { reportDbError('[dbListarDevolucionesPendientes]', error); return []; }
  if (!data?.length) return [];

  // Joins a mano, como el resto del fichero: PostgREST no cruza sin FK-embed
  // declarada y aquí son tres tablas.
  const socioIds = [...new Set(data.map(d => d.socio_id).filter(Boolean))] as string[];
  const susIds = [...new Set(data.map(d => d.suscripcion_id).filter(Boolean))] as string[];
  const reciboIds = [...new Set(data.map(d => d.recibo_id))];

  const [{ data: socios }, { data: suscripciones }, { data: recibos }] = await Promise.all([
    socioIds.length
      ? supabase.from('socios').select('id, nombre, apellidos').in('id', socioIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    susIds.length
      ? supabase.from('suscripciones').select('id, plan_id, sesiones_restantes, fecha_fin, estado').in('id', susIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    supabase.from('recibos')
      .select('id, entrega_tipo, entrega_aplicada, entrega_sesiones_antes, entrega_sesiones_despues, entrega_fecha_fin_antes, entrega_fecha_fin_despues, entrega_estado_antes')
      .in('id', reciboIds),
  ]);

  const nombrePorSocio = new Map((socios ?? []).map(s => [s.id as string, `${s.nombre} ${s.apellidos}`.trim()]));
  const susPorId = new Map((suscripciones ?? []).map(s => [s.id as string, s]));
  const recPorId = new Map((recibos ?? []).map(r => [r.id as string, r]));

  const planIds = [...new Set((suscripciones ?? []).map(s => s.plan_id as string).filter(Boolean))];
  const { data: planes } = planIds.length
    ? await supabase.from('planes_tarifa').select('id, nombre').in('id', planIds)
    : { data: [] as Array<Record<string, unknown>> };
  const planPorId = new Map((planes ?? []).map(p => [p.id as string, p.nombre as string]));

  return data.map(d => {
    const rec = recPorId.get(d.recibo_id);
    const sus = d.suscripcion_id ? susPorId.get(d.suscripcion_id) : undefined;
    return {
      id: d.id,
      socioNombre: (d.socio_id && nombrePorSocio.get(d.socio_id)) || 'Una clienta',
      origen: d.origen as DevolucionPendiente['origen'],
      importeCobrado: d.importe_cobrado,
      importeDevuelto: d.importe_devuelto,
      detectadaEn: d.detectada_en,
      snapshot: {
        tipo: (rec?.entrega_tipo ?? null) as Snapshot['tipo'],
        aplicada: (rec?.entrega_aplicada ?? null) as boolean | null,
        sesionesAntes: (rec?.entrega_sesiones_antes ?? null) as number | null,
        sesionesDespues: (rec?.entrega_sesiones_despues ?? null) as number | null,
        fechaFinAntes: (rec?.entrega_fecha_fin_antes ?? null) as string | null,
        fechaFinDespues: (rec?.entrega_fecha_fin_despues ?? null) as string | null,
        estadoAntes: (rec?.entrega_estado_antes ?? null) as string | null,
      },
      actual: sus ? {
        sesionesRestantes: (sus.sesiones_restantes ?? null) as number | null,
        fechaFin: (sus.fecha_fin ?? null) as string | null,
        estado: (sus.estado ?? null) as string | null,
      } : null,
      planNombre: sus ? (planPorId.get(sus.plan_id as string) ?? null) : null,
    };
  });
}
