import 'server-only';
import { renovacionPorPagar, type FilaReciboRenovacion } from '@/lib/billing/renovacion-sin-tarjeta';
import { capturarExcepcion, capturarMensaje } from '@/lib/sentry-cliente';
import { capturar } from '@/lib/analytics';
import { supabase } from '@/lib/db/supabase';
import { configLegalDeFila } from '@/lib/legal-textos';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { tokenCoincideConHash } from '@/lib/token-hash';
import { exigirLectura } from '@/lib/exigir-lectura';
import { conCacheCatalogo, claveCatalogoPublico } from '@/lib/cache/catalogo-estudio';
import { leerCatalogoCompleto } from '@/lib/migracion/catalogo';
import { mapLimit } from '@/lib/concurrency';
import { getLayout } from '@/lib/layout-data';
import { puertaPublica, catalogoPaginaOculta } from '@/lib/publico/acceso-pagina';
import { getThemePublicado } from '@/lib/theme-data';
import { enviarEmailTransaccional, type DatosClaseEmail } from '@/lib/emails/send-server';
import { uid, fechaLargaEstudio, horaEstudio, franjaLocalDe, hoyEnEstudio } from '@/lib/utils';
import { cierreAperturaSuave, MENSAJE_APERTURA_SUAVE } from '@/lib/opening/apertura-suave';
import { escaparLike } from '@/lib/escapar-like';
import { valoracionEstudio } from '@/lib/portal-tema/valoracion';
import { agregadoPublicable, type VotoValoracion } from '@/lib/valoraciones/agregado';
import { primerError } from '@/lib/db/primer-error';
import { MENSAJE_CLASE_YA_EMPEZADA } from '@/lib/calendario-estado';
import { esCodigoReserva, mensajeDeErrorReserva, MENSAJE_RESERVA_RPC } from '@/lib/reservas/errores-rpc';
import {
  descontarSesionDeReserva, devolucionPermitida, efectosTrasConsumo, esColumnaInexistente, ocupaPlaza, interpretarBonoDeReservarPlaza,
  sesionDescontada, type ConsumoBono,
} from '@/lib/reservas/consumo-bono-reserva';
import { LEGAL } from '@/lib/legal-info';
import { selloParaCliente, type SelloCliente } from '@/lib/factura-sello-cliente';
import type { FacturaImprimible } from '@/lib/factura-pdf';
import { destinoDeEntorno } from '@/lib/verifactu/config';
import type { ResultadoEscritura } from '@/lib/errores';
import { decidirCierreDeEspera, suscripcionDeReservaWeb, PREFIJO_RESERVA_WEB } from '@/lib/lista-espera/esperas-sin-plaza';
// `debeDevolverBono` ya no se usa aquí: quien decide si se devuelve la sesión
// del bono al cancelar es la BD (migr 0129). `esCancelacionTardia` sí sigue,
// porque decide el texto del aviso a la socia, no la política.
import {
  contarReservasActivasFuturas, esCancelacionTardia,
  heredaOverride, puedeReservarPorAntelacionMaxima, puedeReservarPorVentanaMinima,
} from '@/lib/booking-logic';
import { bonoConsumible, bonoDevolvible, tieneEntitlementActivo, exigePlanAlReservar, avisaBonoAgotado, planLimitaSemanaDeClase, ERROR_SIN_PLAN, ERROR_BONO_NO_CUBRE } from '@/lib/bono-logic';
import { reservasARetirarDePlaza } from '@/lib/plazas-fijas-retirada';
import { sesionEncajaEnPlaza, normalizarHoraInicio, HORIZONTE_MATERIALIZAR_DIAS, HORIZONTE_AVISOS_PLAZA_FIJA_DIAS } from '@/lib/plazas-fijas-slot';
import { cuotaParaPlazaFija, superaLimiteSemanal, type DatosPlazaFija, type ResultadoGuardarPlazaFija } from '@/lib/plazas-fijas-reglas';
import { etiquetaDuracion } from '@/lib/clases-fijas-reglas';
import { estadoPausa, sesionEnPausa, validarPausa, type Pausa } from '@/lib/plazas-fijas-pausa';
import {
  decidirVueltaDePausa, fechaLimiteDecidirVuelta, textoMotivoVuelta, tocaLiberarSitio,
  type HuecoParaVolver, type MotivoVueltaPendiente, type PoliticaFinPausa,
} from '@/lib/plazas-fijas-solicitudes';
import type { PlazaFija as PlazaFijaServidor } from '@/lib/types';
import type { MotivoPlazaNoMaterializada } from '@/lib/notifications/emit';
import { validarCanje } from '@/lib/engines/reward-engine';
import { sesionesQueSeDanPorAsistidas } from '@/lib/checkin/pasar-lista';
import { calcularMetrica } from '@/lib/engines/achievement-engine';
import { calcularProgresoReto } from '@/lib/engines/challenge-engine';
import { calcularRacha, claveMesActual, objetivoMensualAlcanzado } from '@/lib/engines/streak-engine';
import { decidirPremioReferido } from '@/lib/booking-logic';
import { evaluarFeature, evaluarLimiteSocias } from '@/lib/billing/billing-rules';
import { recordatoriosRevision, textoRecordatorioRevision } from '@/lib/ficha-clinica';
import { planMasElegido } from '@/lib/estudio-publico';
import { esRetoKeyValida } from '@/lib/retos-portal';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  RowCitasServicios,
  RowCitasDisponibilidad,
  RowFavoritosClase,
  RowRetoParticipaciones,
  RowContenidoPortal,
  RowContenidoPortalBanners,
  RowNovedadesEstudio,
  RowFacturas,
  RowInstructores,
  RowMemberCredits,
  RowCondicionesSalud,
  RowReservas,
  RowRewardCatalog,
  RowSocios,
  RowStudios,
} from '@/lib/db-types';
import type {
  AutomationLog,
  AutomationRule,
  Automatizacion,
  Instructor,
  TipoIntegracion,
  Reserva,
  RewardTrigger,
  Sesion,
  Socio,
  Suscripcion,
} from '@/lib/types';
import {
  generarHuecosDia, dentroDeDisponibilidad, horaParedAInstante,
  type IntervaloOcupado, type HuecoCita,
} from '@/lib/citas/slots';

import {
  fetchAllRows,
  getCurrentStudioId,
  reportDbError,
  hidratarTiposDePlanes,
  mapInstructor,
  mapSocio,
  mapPlanTarifa,
  mapSuscripcion,
  mapSesion,
  mapReserva,
  mapAchievementDefinition,
  mapAchievementProgress,
  mapChallengeDefinition,
  mapChallengeProgress,
  mapCita,
  mapCondicionSalud,
  mapCreditTransaction,
  mapDisponibilidadCita,
  mapFactura,
  mapLevelDefinition,
  mapMemberCredits,
  mapPlazaFija,
  mapRecibo,
  mapRecuperacion,
  mapRewardAction,
  mapRewardCatalogItem,
  mapRewardHistory,
  mapRewardRedemption,
  mapRewardRule,
  mapSala,
  mapFavoritoClase,
  mapRetoParticipacion,
  mapContenidoPortal,
  mapBannerPortal,
  mapNovedadEstudio,
  mapServicioCita,
  mapSpot,
  mapTipoClase,
  mapVideoOnDemand,
  fetchCriticalStudioDataCon,
  fetchDeferredStudioDataCon,
  dbUpdateAutomationRuleCon,
  dbUpdateAutomatizacionCon,
} from '@/lib/supabase-data';

function dbEscritura(): SupabaseClient {
  return getSupabaseAdmin() ?? supabase;
}

// ─── Global DB error reporting ───────────────────────────────────────────────
// Write helpers are fire-and-forget; when a write fails we log to console AND
// notify any registered listener (the UI) so the failure is visible to the user
// instead of silently lost.

// Sentinel truthy (no se muestra en ningún sitio, solo hace que `!bienvenidaVistaEn`
// sea false) para filas sin la columna `bienvenida_vista_en` — ver mapStudio.

export async function dbSetTerminalReader(studioId: string, readerId: string | null, locationId: string | null) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('studios')
    .update({ stripe_terminal_reader_id: readerId, stripe_terminal_location_id: locationId })
    .eq('id', studioId);
  if (error) reportDbError('[dbSetTerminalReader]', error);
}

export type ComunicacionSocio = {
  id: string;
  tipo: string;
  asunto: string;
  estado: 'ENVIADO' | 'FALLIDO';
  error: string | null;
  creadoEn: string;
  creadoPorNombre: string | null;
};

// Registra el resultado REAL de un envío (éxito o fallo) a `comunicaciones_socio`
// — antes, la ficha de clienta llevaba un historial "fake" en memoria de React
// que se perdía al recargar y nunca reflejaba si el email había salido de
// verdad. Best-effort: si el INSERT falla, solo se loguea — un problema de
// auditoría no puede tumbar la respuesta al cliente de que el email SÍ salió.
export async function registrarComunicacion(params: {
  studioId: string;
  socioId: string;
  tipo: string;
  asunto: string;
  estado: 'ENVIADO' | 'FALLIDO';
  error?: string | null;
  resendId?: string | null;
  creadoPor?: string | null;
  creadoPorNombre?: string | null;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  // Este INSERT va con service-role (bypasa RLS), así que la comprobación de
  // que socioId es de verdad de este estudio se hace aquí en TS — igual que
  // el resto de escrituras admin-client de este fichero. Sin esto, un
  // socioId de OTRO estudio en el body dejaría un registro de auditoría con
  // studio_id/socio_id inconsistentes entre sí.
  const { data: socio } = await admin.from('socios').select('id').eq('id', params.socioId).eq('studio_id', params.studioId).maybeSingle();
  if (!socio) { reportDbError('[registrarComunicacion]', new Error('socioId no pertenece a studioId')); return; }
  const { error } = await admin.from('comunicaciones_socio').insert({
    id: uid(),
    studio_id: params.studioId,
    socio_id: params.socioId,
    tipo: params.tipo,
    asunto: params.asunto,
    estado: params.estado,
    error: params.error ?? null,
    resend_id: params.resendId ?? null,
    creado_por: params.creadoPor ?? null,
    creado_por_nombre: params.creadoPorNombre ?? null,
  });
  if (error) reportDbError('[registrarComunicacion]', error);
}

// Historial de comunicaciones de una socia concreta, para la ficha de
// clienta. Filtrado explícito por studio_id + socio_id aunque se use
// service-role (bypasa RLS) — el caller (API route) ya comprueba el rol.
export async function dbListComunicacionesSocio(studioId: string, socioId: string): Promise<ComunicacionSocio[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  const { data, error } = await admin
    .from('comunicaciones_socio')
    .select('id, tipo, asunto, estado, error, creado_en, creado_por_nombre')
    .eq('studio_id', studioId)
    .eq('socio_id', socioId)
    .order('creado_en', { ascending: false })
    .limit(50);
  if (error) { reportDbError('[dbListComunicacionesSocio]', error); return []; }
  return (data ?? []).map(r => ({
    id: r.id as string,
    tipo: r.tipo as string,
    asunto: r.asunto as string,
    estado: r.estado as 'ENVIADO' | 'FALLIDO',
    error: r.error as string | null,
    creadoEn: r.creado_en as string,
    creadoPorNombre: r.creado_por_nombre as string | null,
  }));
}

export type PagoHistorico = {
  id: string;
  fecha: string;
  concepto: string | null;
  importe: number;
  medioPago: string | null;
};

// Pagos importados de la plataforma anterior (migración asistida) — solo
// lectura, para la ficha de clienta. Fuera del snapshot global de
// studio-context a propósito, mismo criterio que dbListComunicacionesSocio:
// se carga aparte, solo al entrar en la ficha. Filtrado explícito por
// studio_id + socio_id aunque se use service-role (bypasa RLS) — el caller
// (API route) ya comprueba puedeVerFinanzas.
export async function dbListPagosHistoricosSocio(studioId: string, socioId: string): Promise<PagoHistorico[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  const { data, error } = await admin
    .from('pagos_historicos')
    .select('id, fecha, concepto, importe, medio_pago')
    .eq('studio_id', studioId)
    .eq('socio_id', socioId)
    .order('fecha', { ascending: false })
    .limit(200);
  if (error) { reportDbError('[dbListPagosHistoricosSocio]', error); return []; }
  return (data ?? []).map(r => ({
    id: r.id as string,
    fecha: r.fecha as string,
    concepto: r.concepto as string | null,
    importe: Number(r.importe),
    medioPago: r.medio_pago as string | null,
  }));
}


// ⚠️ LISTA BLANCA, igual que `studioPublico` de aquí abajo (auditoría 22ª
// pasada, S-5). Antes era lista NEGRA —`{...mapInstructor(r), email: null,
// telefono: null, authUserId: null}`— alimentada por un `.select('*')`: lo que
// no se nombraba, viajaba. Que `tipo_contrato` no saliera al público era suerte
// (nadie la mapeaba en `mapInstructor`), no diseño; la siguiente columna que se
// mapee sí habría salido. Aquí lo que no se nombra NO llega a la página pública.
function mapInstructorPublico(r: RowInstructores): Instructor {
  const i = mapInstructor(r);
  return {
    id: i.id,
    studioId: i.studioId,
    nombre: i.nombre,
    color: i.color,
    activo: i.activo,
    rol: i.rol,
    avatar: i.avatar,
    fotoUrl: i.fotoUrl,
    bio: i.bio,
    valoracion: i.valoracion,
    // Nunca al público, y por eso van explícitos y a null:
    email: null,
    telefono: null,
    authUserId: null,
  };
}


function studioPublico(r: RowStudios) {
  return {
    id: r.id,
    nombre: r.nombre,
    ciudad: r.ciudad,
    descripcion: r.descripcion ?? null,
    anioFundacion: r.anio_fundacion ?? null,
    // Van explícitas por lo que avisa el comentario de aquí abajo: sin
    // nombrarlas, el héroe de la alumna no las vería nunca y no fallaría nada.
    lema: r.lema ?? null,
    fraseHeroe: r.frase_heroe ?? null,
    fraseManuscrita: r.frase_manuscrita ?? null,
    subtituloHeroe: r.subtitulo_heroe ?? null,
    direccion: r.direccion,
    // ⚠️ `studioPublico` es LISTA BLANCA: lo que no se nombra aquí no llega al
    // portal, y no falla — llega vacío, en silencio. Es lo que dejó muerto el
    // hero con foto en su día. `codigoPostal` y `normasTexto` entran con «Mi
    // centro» e «Información del centro», que los pintan.
    codigoPostal: r.codigo_postal,
    normasTexto: (r as { normas_texto?: string | null }).normas_texto ?? null,
    // Canal «web» del estudio (migr 20260821101500). Va explícito porque esta
    // lista es blanca: sin esta línea el pie del portal no pintaría nunca el
    // enlace a su web, sin fallar y sin avisar — exactamente lo que ya pasó
    // con `fotoUrl` aquí abajo. Las REDES no viajan por aquí: llegan por
    // `camposTema.redesSociales`, que sale del tema publicado.
    sitioWeb: r.sitio_web ?? null,
    email: r.email,
    telefono: r.telefono,
    colorPrimario: r.color_primario,
    logoUrl: r.logo_url ?? null,
    // ⚠️ La foto del estudio faltaba aquí, y es EXACTAMENTE el fallo que
    // avisa el comentario de abajo. La columna existe, la propietaria la
    // sube desde Configuración y se guarda bien — pero como no estaba en
    // esta lista, nunca salía de la base de datos.
    //
    // Consecuencia visible: la pantalla de acceso enseñaba un color plano
    // con el logo pequeño en medio, y la bienvenida de Bloom —cuya variante
    // `foto` recibe este mismo campo— se quedaba sin imagen. Parecía un
    // hueco de diseño y era un campo que no viajaba: nada fallaba, nada
    // avisaba, la foto simplemente no llegaba.
    fotoUrl: r.foto_url ?? null,
    // Imagen de bienvenida/portada del portal — separada de `fotoUrl` (foto
    // de perfil de la propietaria, panel). Ver migr
    // 20260810140000_studios_imagen_bienvenida.sql: comparten el mismo bug de
    // "lista blanca" que ya avisa el comentario de arriba en `fotoUrl`, así
    // que va explícita desde el principio.
    imagenBienvenidaUrl: (r as { imagen_bienvenida_url?: string | null }).imagen_bienvenida_url ?? null,
    plan: r.plan,
    avatarAdmin: r.avatar_admin ?? null,
    slug: r.slug ?? null,
    // Política/términos EFECTIVOS: los suyos si los ha reescrito, y si no los de
    // por defecto REDACTADOS CON SUS DATOS FISCALES.
    //
    // ⚠️ Antes salían crudos, con la nota «null = el cliente usa el texto por
    // defecto». Ese contrato no se podía cumplir: componer el respaldo exige el
    // NIF y la dirección, y esta misma lista blanca los excluye a propósito. El
    // cliente acababa haciendo `textoLegalCompleto({ '', '' })`.
    //
    // Medido en producción antes de arreglarlo: de 11 estudios, 10 sin política
    // propia y NINGUNO con términos propios. Y en `socios.aceptacion_version`,
    // que guarda lo que firmó cada una: 2170 caracteres de media en las altas
    // de MOSTRADOR (el panel sí compone bien) y **41** en las de PORTAL — que
    // son exactamente los del separador entre dos textos vacíos. Las que se
    // registraron desde su app firmaron una raya horizontal.
    //
    // Se compone aquí, donde los datos fiscales están, con `configLegalDeFila`:
    // la MISMA que envuelve `textoLegalVigenteDeFila`, que es lo que se sella al
    // aceptar y lo que se compara antes de cobrar una penalización.
    //
    // ⚠️ Antes se componía a mano sin `cancelacion_ventana_horas` ni
    // `penalizacion_importe_eur`: la alumna que se daba de alta sola leía 12 h y
    // ningún cargo, y quedaba sellado como aceptado el texto CON la cláusula y
    // con la ventana real. Hay test que compara las dos salidas.
    ...(() => {
      const efectivos = configLegalDeFila(r as unknown as Record<string, unknown>);
      return { politicaPrivacidad: efectivos.politicaPrivacidad, terminosServicio: efectivos.terminosServicio };
    })(),
    // Política pública que la página de reservas necesita para avisar a la socia
    // (ventana de cancelación) y hacer el pre-check de derechos/límite.
    // La racha de la alumna se calcula en su app: sin esto usaría siempre 1 y
    // el ajuste del estudio no tendría efecto donde se ve.
    rachaClasesSemana: (r as { racha_clases_semana?: number | null }).racha_clases_semana ?? null,
    cancelacionVentanaHoras: r.cancelacion_ventana_horas ?? 12,
    // El importe de la penalización ya va dentro de los términos que se
    // enseñan (arriba); viaja también suelto para que quien recomponga el texto
    // en el cliente con `configLegalDe(studio, …)` tenga los mismos datos.
    penalizacionImporteEur: r.penalizacion_importe_eur ?? null,
    cancelacionDevolverBonoTardia: r.cancelacion_devolver_bono_tardia ?? false,
    reservaExigirPlan: r.reserva_exigir_plan ?? true,
    compraPublicaModo: (r.compra_publica_modo as 'EXIGIR_REGISTRO' | 'CREAR_FICHA') ?? 'EXIGIR_REGISTRO',
    reservaMaxSimultaneas: r.reserva_max_simultaneas ?? null,
    reservaVentanaMinimaMinutos: r.reserva_ventana_minima_minutos ?? 0,
    reservaAntelacionMaximaDias: r.reserva_antelacion_maxima_dias ?? null,
    permiteListaEspera: r.permite_lista_espera ?? true,
    // Plaza fija desde la app (migr 20260915231920): la app solo enseña «pedir
    // plaza fija» o «pedir una pausa» si el estudio lo permite. La puerta de
    // verdad es `/api/public/plaza-fija`, que con el ajuste apagado da 403.
    // Encendido de serie desde el 22-sep (antes apagado, 16-sep): ver reglas-reserva.ts.
    plazaFijaSolicitarDesdeApp: r.plaza_fija_solicitar_desde_app ?? true,
    plazaFijaPausaDesdeApp: r.plaza_fija_pausa_desde_app ?? false,
    // Apertura suave: solo la fecha, y solo con el interruptor puesto. Etiqueta
    // sus clases en /reservar; quién puede reservarlas lo decide crearReservaPublica.
    aperturaSuaveHasta: r.apertura_suave ? (r.fecha_apertura ?? null) : null,
    // El portal lo usa para decidir si el botón "Ver mi acceso" abre el pase
    // QR o lleva directo a la reserva (migr 20260809020328). Sin esta línea
    // `studio.requiereCheckinQr` siempre llegaba `undefined` al cliente y el
    // botón seguía abriendo el pase aunque el estudio lo hubiera desactivado
    // — verificado en vivo con una socia de prueba antes de darlo por bueno.
    requiereCheckinQr: (r as { requiere_checkin_qr?: boolean | null }).requiere_checkin_qr ?? true,
    // Fase 3 (Booking Engine): el checkout embebido monta Stripe Elements con
    // `loadStripe(pk, {stripeAccount})` — necesita saber la cuenta Connect en
    // el CLIENTE antes de crear el PaymentIntent. No es un secreto (un
    // `acct_...` no autentica nada por sí solo, Stripe.js lo expone así en
    // cualquier integración de Connect), pero SIN esta línea el checkout
    // embebido se rompería en silencio con `stripeAccountId: undefined`.
    stripeAccountId: r.stripe_account_id ?? null,
  };
}

// I-12 (auditoría 58ª pasada). `mapSocio` (lib/supabase-data.ts) es el mapeo
// del PANEL: incluye clasificación de CRM (`leadStage`, `tags`, `origenLead`,
// `referidoPor`) e ids internos de cobro (Stripe/SEPA) que la propietaria
// necesita ver de sus clientas. `fetchPublicStudioData` reutilizaba el MISMO
// mapeo para el `socia.socio` que viaja al navegador de la PROPIA socia —
// verificado con grep en app/portal, components/student, app/reservar,
// components/reserva, app/widget-bundle y lib/widget: ninguna pantalla lee
// ninguno de estos campos, así que quitarlos no cambia nada visible.
//
// Lista blanca (mismo criterio que `studioPublico`, arriba): lo que no se
// nombra aquí no llega a su propio portal. Se queda todo lo que SÍ es "mi
// perfil" (nombre, contacto, tarjeta guardada -para "Mi método de pago"-,
// fecha de nacimiento, avatar, visibilidad en clase...) y fuera lo que es
// clasificación interna del negocio sobre ella.
function socioPropio(s: Socio): Socio {
  const {
    leadStage: _leadStage, tags: _tags, origenLead: _origenLead, referidoPor: _referidoPor,
    stripeCustomerId: _stripeCustomerId, stripePaymentMethodId: _stripePaymentMethodId,
    sepaMandateId: _sepaMandateId, sepaPaymentMethodId: _sepaPaymentMethodId,
    ...resto
  } = s;
  return resto as Socio;
}

export type PublicStudioData = Awaited<ReturnType<typeof fetchPublicStudioData>>;

/**
 * El estudio al que apunta una dirección pública, mirando también las viejas.
 *
 * Un estudio que se rebautiza cambia su dirección, pero la anterior está en la
 * bio de Instagram, en el QR de la puerta y en cada WhatsApp que ha mandado.
 * Si la dirección es antigua se devuelve `slugActual` para que la ruta redirija
 * en vez de enseñar un 404 a una clienta que hizo lo correcto.
 */

export async function resolverStudioPorSlug(
  admin: SupabaseClient,
  slug: string,
): Promise<{ row: Record<string, unknown>; slugActual: string | null } | null> {
  const { data: directo } = await admin
    .from('studios').select('*').eq('slug', slug).maybeSingle();
  if (directo) return { row: directo, slugActual: null };

  const { data: antiguo } = await admin
    .from('studio_slugs_antiguos').select('studio_id').eq('slug', slug).maybeSingle();
  if (!antiguo) return null;

  const { data: row } = await admin
    .from('studios').select('*').eq('id', antiguo.studio_id).maybeSingle();
  if (!row) return null;
  return { row, slugActual: (row as { slug: string }).slug };
}

/**
 * Ventana del refresco de aforo. El portal permite navegar semanas hacia
 * delante; más allá de esto se sigue viendo el aforo del último
 * `cargarPublico()` completo (montaje o vuelta a primer plano), que es
 * exactamente el comportamiento que había ANTES de que existiera el tic.
 */
export const AFORO_VENTANA_DIAS = 60;

/**
 * Aforo público de las clases de la ventana próxima. Es lo ÚNICO que necesita
 * el tic de 5s del portal, frente a `fetchPublicStudioData`, que devuelve el
 * catálogo entero del estudio más el histórico financiero de la socia.
 *
 * Devuelve exactamente lo que ya es público hoy en `base.aforoReservas`
 * (`id, sesion_id, estado, spot_id`): sin `socio_id`, sin nombres, sin nada
 * personal. Por eso este endpoint NO necesita autenticación y su respuesta es
 * idéntica para cualquier visitante del mismo estudio — que es lo que permite
 * cachearla en CDN y colapsar el sondeo de N socias en una sola lectura.
 *
 * `sesionIds` viaja en la respuesta a propósito: el cliente necesita saber qué
 * sesiones cubre la ventana para poder RETIRAR filas obsoletas. Una clase de la
 * que se cancelan todas las reservas no aparece en `aforoReservas` —sin la
 * lista de sesiones, el cliente no podría distinguir "sin reservas" de "fuera
 * de la ventana" y se quedaría enseñando el aforo viejo.
 */
export async function fetchAforoPublico(slug: string): Promise<
  { sesionIds: string[]; aforoReservas: { id: string; sesion_id: string; estado: string; spot_id: string | null }[] } | null
> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada (SUPABASE_SERVICE_ROLE_KEY)');

  const resuelto = await resolverStudioPorSlug(admin as never, slug);
  if (!resuelto) return null;
  const studioId = (resuelto.row as unknown as RowStudios).id;

  const ahora = new Date();
  const hasta = new Date(ahora.getTime() + AFORO_VENTANA_DIAS * 24 * 60 * 60 * 1000);
  // Por `fin`, no por `inicio`: una clase que ya empezó pero no ha terminado
  // sigue siendo relevante (la socia puede estar mirándola), y filtrar por
  // `inicio >= ahora` la haría desaparecer del refresco a mitad de sesión.
  const { data: sesionesData } = await admin
    .from('sesiones').select('id')
    .eq('studio_id', studioId)
    .gte('fin', ahora.toISOString())
    .lte('inicio', hasta.toISOString());

  const sesionIds = (sesionesData ?? []).map((s) => s.id as string);
  if (sesionIds.length === 0) return { sesionIds: [], aforoReservas: [] };

  // Paginado: PostgREST corta en 1000 filas EN SILENCIO, y un estudio lleno
  // puede pasar de mil reservas en 60 días. Sin esto el aforo de las clases
  // sobrantes volvería a cero y se pintarían como libres — el mismo fallo que
  // ya costó el truncado de los backups (#684), pero mostrando plazas que no
  // existen.
  // El comentario de arriba contemplaba el truncado y no el ERROR, que tiene
  // el mismo resultado y peor: con un 504 del pooler, `aforoReservas` queda
  // vacío y TODAS las clases del portal se pintan libres. Mejor un fallo
  // visible que vender plazas que no existen.
  const { data: aforoReservas, error: errAforo } = await fetchAllRows(studioId, 'reservas', (from, to) =>
    admin.from('reservas').select('id, sesion_id, estado, spot_id')
      .eq('studio_id', studioId).in('sesion_id', sesionIds).range(from, to));
  exigirLectura(errAforo, 'leyendo el aforo de las clases');

  return {
    sesionIds,
    aforoReservas: (aforoReservas ?? []) as { id: string; sesion_id: string; estado: string; spot_id: string | null }[],
  };
}


export async function fetchPublicStudioData(
  slug: string,
  usuario?: { authUserId: string; email: string },
  opts?: {
    liviano?: boolean;
    /** El pase de la página oculta de ESTE estudio (su cookie), si llega. */
    paseAcceso?: (studioId: string) => string | null | undefined;
  },
) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada (SUPABASE_SERVICE_ROLE_KEY)');

  const resuelto = await resolverStudioPorSlug(admin as never, slug);
  if (!resuelto) return null;
  const studioRow = resuelto.row as unknown as RowStudios;
  const studioId: string = studioRow.id;
  const liviano = opts?.liviano ?? false;

  // Página oculta (decisión del fundador, 16-sep): sin el pase de su clave
  // vigente no sale el catálogo —ni clases, ni planes, ni los datos de la
  // socia—, solo lo justo para pintar el aviso. Antes de todo lo demás, también
  // de la caché. El `select('*')` de `resolverStudioPorSlug` ya trae las dos
  // columnas: no hay consulta de más.
  if (puertaPublica({ lectura: { data: studioRow, error: null }, pase: opts?.paseAcceso?.(studioId), studioId }) !== 'abierta') {
    return catalogoPaginaOculta(studioRow.nombre);
  }

  // Auditoría integral 2026-08-21 (rendimiento, hallazgo P0-1): antes el
  // llamador (app/api/public/studio-data/route.ts) resolvía el estudio por
  // slug con una RPC SOLO para poder comprobar si el JWT es de una socia de
  // ESTE estudio, y esta función volvía a resolver el MISMO estudio por slug
  // (el `select('*')` de resolverStudioPorSlug, ~54 columnas) para el
  // catálogo — dos resoluciones por slug en cada visita autenticada al
  // portal/widget, la ruta pública más repetida del sistema. Ahora el
  // llamador manda el JWT ya verificado y la comprobación de socia se hace
  // AQUÍ, reutilizando el `studioId` que ya se acaba de resolver arriba —
  // una sola resolución por slug, no dos.
  let member: { socioId: string; email: string } | undefined;
  if (usuario) {
    const socioId = await socioAutenticado(usuario.authUserId, studioId);
    if (socioId) member = { socioId, email: usuario.email };
  }

  // Catálogo público (nada de PII): clases, horarios, salas, instructoras,
  // planes, spots, vídeos y la configuración de gamificación (niveles, logros,
  // retos, recompensas y sus reglas) — el portal la necesita para pintar.
  //
  // Es el mismo catálogo para CUALQUIER visitante de este estudio (nunca varía
  // por socia), y cambia con frecuencia de días/semanas (un plan, una sala) —
  // no de segundos. Se cachea con TTL corto: el mismo estudio recibe muchas
  // visitas de socias distintas en ventanas de segundos/minutos, y hoy cada una
  // repetía las mismas 13 queries desde cero (audit de rendimiento, hallazgo
  // "CACHE"). sesiones y el aforo de plazas quedan FUERA del caché a propósito
  // — cambian con cada reserva/cancelación y una socia no debe ver una plaza
  // como libre cuando ya se ocupó hace 10 segundos.
  //
  // `liviano` (audit de rendimiento de los widgets embebibles, #~730): los 4
  // iframes de /reservar/[slug]?embed=1 comparten este mismo endpoint con el
  // portal completo (app/portal/[slug]) pero NUNCA leen vídeos, recompensas,
  // niveles/logros/retos, contenido del portal ni el layout de temas — eso es
  // exclusivo de la app instalable. Confirmado por grep en
  // app/reservar/[slug]/page.tsx: cero referencias a esos campos. Se saltan
  // esas 11 queries y sus campos vuelven vacíos/null — misma forma del objeto,
  // así que el portal (que sí pide el modo completo) no cambia en nada.
  const catalogo = await conCacheCatalogo(claveCatalogoPublico(studioId, liviano), async () => {
    const [
      tiposClaseRes, salasRes, instructoresRes, spotsRes, planesRes,
      citasServiciosRes, citasDisponibilidadRes, susPlanesRes, sustitucionesRes,
      valoracionesRes,
    ] = await Promise.all([
      admin.from('tipos_clase').select('*').eq('studio_id', studioId),
      admin.from('salas').select('*').eq('studio_id', studioId),
      admin.from('instructores').select('*').eq('studio_id', studioId),
      admin.from('spots').select('*').eq('studio_id', studioId),
      admin.from('planes_tarifa').select('*').eq('studio_id', studioId),
      // Catálogo de citas 1:1 (0046): solo servicios auto-reservables y activos +
      // el horario fino. Nada de PII (los huecos se calculan aparte en servidor).
      admin.from('citas_servicios').select('*').eq('studio_id', studioId).eq('activo', true).eq('auto_reservable', true),
      admin.from('citas_disponibilidad').select('*').eq('studio_id', studioId),
      // Solo `plan_id`: es un RECUENTO para «EL MÁS ELEGIDO», no datos de nadie.
      // Tiene que salir del estudio ENTERO — calcularlo en el navegador con las
      // suscripciones que allí hay (las de la socia identificada, y ninguna si
      // no lo está) convertía su propia compra repetida en prueba social.
      admin.from('suscripciones').select('plan_id').eq('studio_id', studioId),
      // P1 auditoría Momence: solo `sesion_id`/`instructor_original_id` de
      // sustituciones YA `confirmada` — el único estado no reversible
      // (`confirmar_sustitucion()` sobreescribe `sesiones.instructor_id` en la
      // misma transacción). Nunca `motivo`/`origen`/candidatas descartadas.
      admin.from('sustituciones').select('sesion_id, instructor_original_id')
        .eq('studio_id', studioId).eq('estado', 'confirmada'),
      // Valoraciones para la nota de cada instructora. Nunca el comentario.
      // `socio_id` y `creado_en` solo sirven para el agregado protegido (alumnas
      // distintas, meses cerrados) y NO salen del servidor: esto alimenta una
      // media, no una lista de opiniones.
      admin.from('valoraciones').select('instructor_id, puntuacion, socio_id, creado_en').eq('studio_id', studioId),
    ]);
    // ESENCIALES: sin ellas la app no se queda corta, MIENTE. Una consulta
    // fallida (Supabase saturado, un 504, una RLS cambiada) dejaba su parte
    // vacía y se servía —y se cacheaba un minuto para todo el estudio— un
    // catálogo mutilado: horario sin clases, «Solo con bono» sin planes,
    // instructora sin nota. Se lanza: la ruta responde 5xx y la app enseña
    // error con reintento, que es lo honesto. `conCacheCatalogo` no guarda si
    // se lanza. Lo accesorio se degrada en vez de lanzar (ver más abajo).
    {
      const fallo = primerError(
        [tiposClaseRes, salasRes, instructoresRes, spotsRes, planesRes, citasServiciosRes, citasDisponibilidadRes, susPlanesRes, sustitucionesRes, valoracionesRes],
        ['tipos_clase', 'salas', 'instructores', 'spots', 'planes_tarifa', 'citas_servicios', 'citas_disponibilidad', 'suscripciones', 'sustituciones', 'valoraciones'],
      );
      if (fallo) throw new Error(`catálogo público: ${fallo}`);
    }

    // Exclusivo del portal instalable (app/portal/[slug]) — ver comentario de
    // `liviano` arriba. Sin ellas cuando el widget no las necesita: un array
    // literal con spread condicional rompe la inferencia de tupla de
    // Promise.all (degenera a un array homogéneo), así que este bloque va en
    // su propio Promise.all de tamaño fijo en vez de mezclarse con el de arriba.
    const [
      videosRes, rewardRulesRes, rewardCatalogRes, levelDefsRes, achDefsRes, chalDefsRes,
      contenidoPortalRes, bannersPortalRes, novedadesRes, retoParticipRes, horarioRes,
      productosRes,
    ] = liviano
      ? [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined]
      : await Promise.all([
        admin.from('videos_on_demand').select('*').eq('studio_id', studioId),
        admin.from('reward_rules').select('*').eq('studio_id', studioId),
        admin.from('reward_catalog').select('*').eq('studio_id', studioId),
        admin.from('level_definitions').select('*').eq('studio_id', studioId),
        admin.from('achievement_definitions').select('*').eq('studio_id', studioId),
        admin.from('challenge_definitions').select('*').eq('studio_id', studioId),
        admin.from('contenido_portal').select('*').eq('studio_id', studioId).maybeSingle(),
        // Filtrado en SQL (activo + ubicación 'home'), no en el cliente — es lo
        // que gana la tabla normalizada frente a un jsonb. La ventana de fechas se
        // filtra en el cliente: "hoy" depende del momento de carga, no de cuándo
        // se rellenó este caché de hasta 60s.
        admin.from('contenido_portal_banners').select('*')
          .eq('studio_id', studioId).eq('activo', true).contains('ubicacion', ['home'])
          .order('orden', { ascending: true }),
        // Mismo criterio que los banners de arriba: `activo` se filtra en SQL,
        // la ventana fecha_inicio/fecha_fin en el cliente (mismo motivo — "hoy"
        // depende del momento de carga, no de cuándo se llenó este caché).
        admin.from('novedades_estudio').select('*')
          .eq('studio_id', studioId).eq('activo', true)
          .order('created_at', { ascending: false }),
        // `getLayout` YA NO va aquí — ver el comentario junto a `temaPublicado`
        // más abajo, donde se pide FUERA de este caché de 60s.
        // Conteo REAL de apuntadas por reto, del estudio ENTERO — mismo motivo
        // que planMasElegidoId: calcularlo en el cliente con solo lo que ve una
        // socia daría un número parcial, no el real.
        admin.from('reto_participaciones').select('reto_key').eq('studio_id', studioId),
        // El horario de apertura del estudio (`studio_horario`, migr
        // 20260804213940), para «Información del centro» del portal.
        //
        // Va en el grupo EXCLUSIVO del portal y dentro del caché a propósito:
        // son 7 filas que cambian cada varios meses, y este bloque corre en
        // cada visita — el widget embebido (`liviano`) no lo pide porque no
        // enseña horarios de apertura.
        //
        // ⚠️ Y sale de aquí, NO de una columna de `studios`: la tabla ya
        // existía con su RLS y su pestaña en el panel. Un texto de horario en
        // `studios` habría sido una segunda fuente del mismo dato.
        admin.from('studio_horario').select('*').eq('studio_id', studioId).order('dia_semana', { ascending: true }),
        // Productos FÍSICOS del estudio, para el escaparate de la app.
        //
        // ⚠️ Filtrado a `categoria = 'PRODUCTO'` en SQL, y esto NO es cosmético.
        // `productos_pos` mezcla cuatro categorías, y dos de ellas —SESION y
        // PACK— son lo MISMO que el estudio ya vende por `planes_tarifa`: en
        // producción hay 4 sesiones a 15-60 € y 3 packs a 85-175 €. Publicarlas
        // todas pondría dos precios para la misma clase suelta en la MISMA
        // pantalla, uno de ellos el del mostrador y otro el del catálogo.
        //
        // 'OTRO' tampoco entra: es un cajón de sastre, y esta sección promete
        // algo concreto («te lo damos en recepción»). Un estudio que quiera
        // enseñar algo lo marca como PRODUCTO.
        //
        // Columnas explícitas, no `select('*')`: lo que sale de aquí es público.
        // `stock`, `sku`, `codigo_barras` e `iva_pct` son datos de mostrador y
        // no tienen por qué salir del estudio — el stock, además, prometería
        // una disponibilidad que nadie está reservando.
        admin.from('productos_pos')
          .select('id, nombre, precio, descripcion, imagen_url')
          .eq('studio_id', studioId).eq('activo', true).eq('categoria', 'PRODUCTO')
          .order('orden', { ascending: true, nullsFirst: false }),
      ]);
    // Estas NO tumban el catálogo, a diferencia de las de arriba: son el
    // ADORNO del portal instalable (vídeos, gamificación, banners, novedades,
    // horario de apertura). Sin ellas la app sigue diciendo la verdad —el
    // horario y los precios son correctos—, así que dejar a una alumna sin
    // poder reservar porque falló `novedades_estudio` sería un remedio peor.
    // Se registra para que el fallo no sea invisible.
    {
      const fallo = primerError(
        [videosRes, rewardRulesRes, rewardCatalogRes, levelDefsRes, achDefsRes, chalDefsRes, contenidoPortalRes, bannersPortalRes, novedadesRes, retoParticipRes, horarioRes],
        ['videos_on_demand', 'reward_rules', 'reward_catalog', 'level_definitions', 'achievement_definitions', 'challenge_definitions', 'contenido_portal', 'contenido_portal_banners', 'novedades_estudio', 'reto_participaciones', 'studio_horario'],
      );
      if (fallo) console.error(`[studio-data] contenido secundario degradado (${studioId}): ${fallo}`);
    }

    const retoConteos = (retoParticipRes?.data ?? []).reduce<Record<string, number>>((acc, r) => {
      const key = (r as { reto_key: string }).reto_key;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    // Mismo motivo que en el panel: el portal decide con esto si una clase
    // está incluida en el bono o hay que enseñar precio de suelta.
    const planesConTiposPub = await hidratarTiposDePlanes(admin as never, studioId, (planesRes.data ?? []).map(mapPlanTarifa));

    // La media por instructora, agregada AQUÍ y no en la pantalla: al kit le
    // llega la nota ya hecha con su número de valoraciones, y quien la pinta
    // solo decide si la enseña (ver `valoracionParaPantalla`). Se calcula una
    // vez y se reutiliza para la nota del ESTUDIO (`valoracionEstudio`, "Tu
    // estudio" en Inicio): sumarla en el otro sentido (media × total de cada
    // instructora) da los mismos puntos sin releer `valoraciones` fila a fila.
    // ⚠️ Protegida (decisión del 14-sep-2026): meses cerrados y bloques de al
    // menos 5 alumnas distintas (`agregadoPublicable`). Antes salía la suma
    // exacta en vivo con cualquier total y el mínimo solo se aplicaba en el
    // navegador; la instructora lee este catálogo, y ella sabe quién vino a
    // cada clase.
    const votosPorInstructora = new Map<string, VotoValoracion[]>();
    for (const v of (valoracionesRes.data ?? []) as { instructor_id: string; puntuacion: number; socio_id: string | null; creado_en: string }[]) {
      if (!v.instructor_id || typeof v.puntuacion !== 'number' || !v.socio_id) continue;
      const lista = votosPorInstructora.get(v.instructor_id) ?? [];
      lista.push({ alumna: v.socio_id, puntuacion: v.puntuacion, creadoEn: v.creado_en });
      votosPorInstructora.set(v.instructor_id, lista);
    }
    const ahoraValoraciones = new Date();
    const instructoresPub = (instructoresRes.data ?? []).map((r) => {
      const base = mapInstructorPublico(r as RowInstructores);
      const agregado = agregadoPublicable(votosPorInstructora.get(base.id) ?? [], ahoraValoraciones);
      return agregado
        ? { ...base, valoracion: { media: agregado.media, total: agregado.total } }
        : base;
    });

    // Las reglas de créditos son una PROMESA a la alumna («+10 al asistir»):
    // solo viajan si su plan de verdad los da. Con un plan sin gamificación
    // `otorgarCreditosServidor` y el panel no otorgan nada, y enseñarlas sería
    // prometer créditos que no llegan. Mismo gate que al otorgar.
    const reglasDeCreditosVivas = !liviano && !(await evaluarFeature(admin, studioId, 'gamificacion'));

    return {
      tiposClase: (tiposClaseRes.data ?? []).map(mapTipoClase),
      salas: (salasRes.data ?? []).map(mapSala),
      instructores: instructoresPub,
      valoracionEstudio: valoracionEstudio(instructoresPub),
      spots: (spotsRes.data ?? []).map(mapSpot),
      // El horario de apertura, para «Información del centro». Vacío en el
      // modo `liviano` (el widget no lo pide) — misma forma del objeto, como
      // el resto de campos exclusivos del portal.
      horarioSemana: (horarioRes?.data ?? []).map((r) => {
        const f = r as { dia_semana: number; abierto: boolean; hora_apertura: string | null; hora_cierre: string | null };
        return { diaSemana: f.dia_semana, abierto: f.abierto, horaApertura: f.hora_apertura, horaCierre: f.hora_cierre };
      }),
      planesTarifa: planesConTiposPub,
      videosOnDemand: (videosRes?.data ?? []).map(mapVideoOnDemand),
      rewardRules: reglasDeCreditosVivas ? (rewardRulesRes?.data ?? []).map(mapRewardRule) : [],
      rewardCatalog: (rewardCatalogRes?.data ?? []).map(mapRewardCatalogItem),
      levelDefinitions: (levelDefsRes?.data ?? []).map(mapLevelDefinition),
      achievementDefinitions: (achDefsRes?.data ?? []).map(mapAchievementDefinition),
      challengeDefinitions: (chalDefsRes?.data ?? []).map(mapChallengeDefinition),
      // Ya viene filtrado y acotado de SQL; aquí solo se pasa a camelCase.
      productosFisicos: (productosRes?.data ?? []).map((r) => {
        const f = r as { id: string; nombre: string; precio: number; descripcion: string | null; imagen_url: string | null };
        return {
          id: f.id, nombre: f.nombre, precio: Number(f.precio),
          descripcion: f.descripcion ?? null,
          // La URL viaja TAL CUAL: lleva un `?v=<timestamp>` que rompe el caché
          // cuando se sustituye la foto conservando la ruta. Normalizarla la
          // dejaría pegada a la imagen vieja.
          imagenUrl: f.imagen_url ?? null,
        };
      }),
      citasServicios: (citasServiciosRes.data ?? []).map((r) => mapServicioCita(r as RowCitasServicios)),
      citasDisponibilidad: (citasDisponibilidadRes.data ?? []).map((r) => mapDisponibilidadCita(r as RowCitasDisponibilidad)),
      contenidoPortal: contenidoPortalRes?.data ? mapContenidoPortal(contenidoPortalRes.data as RowContenidoPortal) : null,
      bannersPortal: (bannersPortalRes?.data ?? []).map((r) => mapBannerPortal(r as RowContenidoPortalBanners)),
      novedadesEstudio: (novedadesRes?.data ?? []).map((r) => mapNovedadEstudio(r as RowNovedadesEstudio)),
      // `portalHome`/`reservar`/`homeBloques`/`bloquesClases`/`bloquesBonos`/
      // `bloquesReservar` YA NO viven aquí — ver `camposLayout` más abajo,
      // construido con un `getLayout` pedido FUERA de este caché de 60s.
      planMasElegidoId: planMasElegido(
        planesConTiposPub,
        (susPlanesRes.data ?? []).map(r => ({ planId: r.plan_id as string }) as Suscripcion),
      ),
      // P1 auditoría Momence: "Tentare tiene el motor de sustituciones entero
      // y no lo enseña en público" — permite a la página resolver, por
      // sesión, si hubo un cambio de instructora confirmado.
      sustitucionesConfirmadas: (sustitucionesRes.data ?? []).map(r => ({
        sesionId: r.sesion_id as string,
        instructorOriginalId: r.instructor_original_id as string,
      })),
      retoConteos,
    };
  });

  // Tema publicado: FUERA del caché de catálogo a propósito, con su propio
  // fetch (no otro TTL, directo cada vez). Publicar un tema debe reflejarse
  // en el portal al instante — meterlo en `conCacheCatalogo` (como estaba)
  // lo dejaba preso hasta 60s detrás de datos que sí pueden esperar (una
  // sala, un plan). Reproducido en vivo: tras publicar, el endpoint público
  // seguía sirviendo el tema anterior con la BD ya actualizada. `getThemePublicado`
  // ya está envuelto en `cache()` de React (memoización solo de esta misma
  // petición), así que esto no reintroduce las 13 queries que este caché
  // existe para evitar — es una query, no trece.
  const temaPublicado = liviano ? null : await getThemePublicado(studioId);

  // Mismo motivo, mismo arreglo — pero para los BLOQUES (Inicio/Clases/Bonos/
  // Reservar), no el tema. Antes `getLayout` vivía DENTRO de `conCacheCatalogo`
  // junto al resto (una sala, un plan, sí pueden esperar 60s), así que publicar
  // una reorganización de bloques —o simplemente activar/desactivar una
  // sección— tardaba hasta 60s por instancia caliente en reflejarse en el
  // portal real, mientras que un cambio de COLOR se veía al instante desde que
  // se sacó `temaPublicado` de aquí arriba. Esa asimetría es exactamente lo que
  // el fundador reportó como "lo publicado no siempre coincide con lo que
  // estaba editando" (2026-08-19): dependía de QUÉ se acabara de publicar.
  // `getLayout` ya está en `cache()` de React (mismo criterio que
  // `getThemePublicado`), así que esto tampoco reintroduce queries de más.
  const layout = liviano ? null : await getLayout(studioId);

  // Solo lo que el portal necesita como VALOR JS (no CSS): el resto del tema
  // sigue siendo puramente CSS server-rendered (ThemeStyle), esto es la
  // excepción — cosas que portal-shell.tsx/reservar deciden con JS (iconos,
  // layout de barra, textos de la portada), no algo que una CSS var pueda
  // decidir por sí sola. `null`/`false`/`'auto'` en modo `liviano` o sin tema:
  // misma forma del objeto que en modo completo.
  const camposTema = {
    // Qué tema tiene instalado, no solo sus valores: el portal en React elige
    // con esto cuál de los tres juegos de tokens monta.
    themeIdPublicado: temaPublicado?.themeId ?? null,
    tabBarStyle: temaPublicado?.tabBarStyle ?? null,
    navPortal: temaPublicado?.navPortal ?? null,
    redesSociales: temaPublicado?.redesSociales ?? null,
    widgetFondo: temaPublicado?.widgetFondo ?? null,
    widgetFuente: temaPublicado?.widgetFuente ?? null,
    widgetOcultarPie: temaPublicado?.widgetOcultarPie ?? false,
    widgetSoloPestana: temaPublicado?.widgetSoloPestana ?? false,
    widgetTexto: temaPublicado?.widgetTexto ?? 'auto',
    // Fase 1 rediseño widget (docs/widget-reservas-theme-builder-diseno.md).
    widgetFuenteDisplay: temaPublicado?.widgetFuenteDisplay ?? null,
    widgetRadioBoton: temaPublicado?.widgetRadioBoton ?? null,
    widgetRadioInput: temaPublicado?.widgetRadioInput ?? null,
    widgetSuperficie: temaPublicado?.widgetSuperficie ?? null,
    widgetTinta: temaPublicado?.widgetTinta ?? null,
    widgetTextoSecundario: temaPublicado?.widgetTextoSecundario ?? null,
    widgetLinea: temaPublicado?.widgetLinea ?? null,
    widgetRelleno: temaPublicado?.widgetRelleno ?? null,
    reservarSobreTitulo: temaPublicado?.reservarSobreTitulo ?? null,
    reservarSobreTexto: temaPublicado?.reservarSobreTexto ?? null,
    reservarAvisoQuiz: temaPublicado?.reservarAvisoQuiz ?? null,
    reservarVacioTitulo: temaPublicado?.reservarVacioTitulo ?? null,
    reservarVacioTexto: temaPublicado?.reservarVacioTexto ?? null,
    reservarConfirmacion: temaPublicado?.reservarConfirmacion ?? null,
    reservarListaEspera: temaPublicado?.reservarListaEspera ?? null,
    reservarAyuda: temaPublicado?.reservarAyuda ?? null,
    reservarComoFunciona: temaPublicado?.reservarComoFunciona ?? null,
    reservarTitular: temaPublicado?.reservarTitular ?? null,
    reservarSubtitulo: temaPublicado?.reservarSubtitulo ?? null,
    reservarCta: temaPublicado?.reservarCta ?? null,
    // Barra clásica (Oliva/Noir): decisión de LAYOUT que portal-shell.tsx toma
    // con JS (position flotante o no), no algo que una CSS var pueda decidir.
    barraClasica: temaPublicado?.barraClasica ?? null,
    // Su gemela, que se quedó fuera de este payload: `studio-context` hace
    // `setBarraFlotante(pub.barraFlotante === true)` y `pub.barraFlotante` era
    // SIEMPRE undefined, así que la rama 'floating' de portal-tema-marco.tsx era
    // código muerto en producción. El interruptor «Barra flotante» sí cambiaba
    // el PREVIEW, porque ahí el valor llega por el otro carril
    // (lib/theme-preview-puente.ts) — o sea que el editor enseñaba una cosa y el
    // portal de las socias hacía otra, en los tres temas cuyo tab_bar_style de
    // fábrica es 'classic' (Tentada, Oliva, Noir).
    barraFlotante: temaPublicado?.barraFlotante ?? null,
    // Variantes de forma por bloque (theme-variantes.ts): deciden qué
    // elementos EXISTEN, algo que una CSS var no puede decidir.
    variantes: temaPublicado?.variantes ?? null,
  };

  // Los 6 campos que antes salían de `layout` DENTRO del catálogo cacheado —
  // ver el comentario junto a `const layout = ...` arriba.
  const camposLayout = {
    portalHome: layout?.portalHome ?? null,
    // Orden/visibilidad LEGACY de las secciones de /reservar — ya no la usa
    // app/reservar/[slug]/page.tsx (lee `bloquesReservar`, más abajo, ya
    // resuelto). Se mantiene expuesta por si algún consumidor viejo la
    // sigue leyendo; `resolveLayout` es quien la sintetiza a bloques.
    reservar: layout?.reservar ?? null,
    // Fase 3 (generalizada en la Fase 1 del Theme Builder): nunca el
    // borrador — solo lo publicado llega al portal en vivo.
    homeBloques: layout?.bloques.home.publicado ?? [],
    bloquesClases: layout?.bloques.clases.publicado ?? [],
    bloquesBonos: layout?.bloques.bonos.publicado ?? [],
    // /reservar (Fase 2 de su generalización a bloques): MISMO patrón que
    // las tres de arriba — `resolveLayout` ya sintetiza esto desde el
    // legado (`reservar.orden/ocultos`) cuando nadie ha guardado bloques
    // todavía, así que la página no tiene que volver a resolverlo.
    bloquesReservar: layout?.bloques.reservar.publicado ?? [],
  };

  // Fuera del caché a propósito (ver comentario arriba): disponibilidad real.
  // fetchAllRows (no un .select('*') a secas): sin paginar, PostgREST corta en
  // 1000 filas — un estudio con histórico real perdía en silencio las
  // sesiones futuras (incluida la semana siguiente) en el portal de la
  // clienta, aunque el panel interno (fetchCriticalStudioData) sí paginaba.
  // Columnas, no `select('*')`: esto corre en el SERVIDOR y en CADA visita al
  // portal, así que cada columna de más se paga dos veces en Active CPU de
  // Fluid — al parsear la respuesta de PostgREST y al volver a serializar el
  // JSON hacia el navegador. La espera de red no se factura; el trabajo de
  // CPU sobre los bytes, sí. La lista es la misma que consume `mapSesion`
  // (tipo `FilaSesionPanel`), así que si se queda corta, `tsc` la nombra.
  // Sin zoom_join_url a propósito: el enlace de Zoom nunca sale de un select
  // genérico del portal (ver comentario de mapSesion). zoom_meeting_id sí,
  // porque un id sin la reunión detrás no sirve de nada.
  // Sin `notas` ni `incidencia_texto` por el mismo motivo: son texto que
  // escribe el personal para el personal («la clienta X viene lesionada»,
  // «se rompió el reformer 3») y este payload lo sirve `POST
  // /api/public/studio-data`, que responde también SIN sesión. Ningún
  // componente del portal, del widget ni de /reservar los lee (verificado
  // con grep en components/portal, app/portal, app/reservar,
  // components/reserva, app/widget-bundle y lib/widget); el panel usa su
  // propio select en lib/supabase-data.ts. Se rellenan a null al mapear
  // para no cambiar la forma de `Sesion`.
  //
  // I-11 (auditoría 58ª pasada): sin cota, esto traía TODAS las sesiones y
  // reservas de la historia del estudio a cualquier visitante anónimo — años
  // de estados de reserva de clientas, para siempre. Se acota por ABAJO con
  // el mismo criterio que ya usa `fetchAforoPublico` (misma función, unas
  // líneas más arriba): `fin >= ahora`, no `inicio >= ahora`, para no hacer
  // desaparecer una clase que ya empezó pero sigue en curso. A propósito NO
  // se acota por ARRIBA: `reserva_antelacion_maxima_dias` es nullable (sin
  // límite por defecto), así que un tope fijo aquí escondería clases futuras
  // legítimas de un estudio que programa con meses de antelación — sería
  // cambiar un hueco de privacidad por una regresión de producto. El
  // catálogo público es "qué se puede reservar", nunca "qué reservó
  // alguien" — una vez la clase termina, ya no hace falta.
  //
  // Secuencial y no en el mismo Promise.all de antes: `reservas` se acota a
  // las sesiones que YA quedaron dentro de la ventana, así que necesita sus
  // ids resueltos primero.
  const { data: sesionesData, error: errSesiones } = await fetchAllRows(studioId, 'sesiones', (from, to) =>
    admin.from('sesiones').select('id, studio_id, tipo_clase_id, sala_id, instructor_id, inicio, fin, aforo_maximo, cancelada, precio_puntual, google_event_id, serie_id, zoom_meeting_id')
      .eq('studio_id', studioId).gte('fin', new Date().toISOString()).range(from, to));
  if (errSesiones) throw new Error(`catálogo público: sesiones: ${errSesiones.message}`);
  const sesionIdsVigentes = (sesionesData ?? []).map(s => s.id as string);
  const { data: reservasAforo, error: errReservas } = sesionIdsVigentes.length === 0
    ? { data: [] as { id: string; sesion_id: string; estado: string; spot_id: string | null }[], error: null }
    : await fetchAllRows(studioId, 'reservas', (from, to) =>
      admin.from('reservas').select('id, sesion_id, estado, spot_id')
        .eq('studio_id', studioId).in('sesion_id', sesionIdsVigentes).range(from, to));
  // Mismo criterio que el catálogo: un horario o un aforo truncados por un
  // fallo no se sirven como si fueran completos.
  if (errReservas) throw new Error(`catálogo público: reservas: ${errReservas.message}`);

  const base = {
    studio: studioPublico(studioRow as RowStudios),
    sesiones: (sesionesData ?? []).map(r => mapSesion({ ...r, notas: null, incidencia_texto: null })),
    ...catalogo,
    ...camposTema,
    ...camposLayout,
    aforoReservas: (reservasAforo ?? []) as { id: string; sesion_id: string; estado: string; spot_id: string | null }[],
  };

  if (!member) return { ...base, socia: null };

  // Datos de la socia. La autorización YA está hecha arriba: `member.socioId`
  // sale de `socioAutenticado(usuario.authUserId, studioId)`, o sea de
  // `auth_user_id` sobre el JWT verificado — el mismo criterio que usa el resto
  // del sistema (`validarSociaPublica`, `resolverSociaAutenticada`). Aquí solo
  // se relee su fila, acotada igualmente por id + estudio.
  //
  // I-15 (auditoría 29-ago) aplicado también a la LECTURA: esto exigía ADEMÁS
  // que `socios.email` coincidiera con el email de la sesión y, si no,
  // devolvía `socia: null` con 200 y sin un solo error. Como el panel puede
  // reescribir `socios.email` libremente (dbUpdateSocio), bastaba corregir un
  // typo para que la alumna abriera su app con sesión válida y viera CERO
  // reservas, CERO bonos y CERO pagos — mientras seguía pudiendo reservar,
  // porque las ESCRITURAS van por `validarSociaPublica`, que sí la autoriza
  // por `auth_user_id`. Lectura y escritura autorizaban por criterios
  // distintos, y el que fallaba lo hacía en silencio.
  const { data: socioRow } = await admin
    .from('socios').select('*')
    .eq('id', member.socioId).eq('studio_id', studioId).maybeSingle();

  if (!socioRow) return { ...base, socia: null };

  // Red: la divergencia ya no bloquea, pero deja rastro. Significa que el email
  // de acceso y el de la ficha se han separado, y hay sitios que todavía
  // asumen que van juntos (lib/portal-auth.tsx, `actualizarEmail`).
  // `warning`, no `error`: no hay nada roto que arreglar en caliente.
  if ((socioRow.email ?? '').trim().toLowerCase() !== member.email.trim().toLowerCase()) {
    capturarMensaje(
      'fetchPublicStudioData: el email de la ficha no coincide con el de la sesión',
      'warning',
      // Sin emails ni nombre: es PII. Con los ids se localiza la fila.
      { tags: { area: 'portal-socia' }, extra: { studioId, socioId: member.socioId } },
    );
  }

  const sid = member.socioId;
  const [susRes, resRes, recRes, credRes, histRes, redRes, achProgRes, chalProgRes, txRes, citasRes, plazasRes, favRes, retoRes, recupRes, peticionesRes] =
    await Promise.all([
      admin.from('suscripciones').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('reservas').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('recibos').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('member_credits').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('reward_history').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('reward_redemptions').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('achievement_progress').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('challenge_progress').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('credit_transactions').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('citas').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      // Su plaza fija (F2). Solo se cargaba en el panel, así que la tarjeta
      // «PLAZA FIJA» del portal no se habría pintado nunca — ni con la plaza
      // contratada y pagada.
      admin.from('plazas_fijas').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('favoritos_clase').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      admin.from('reto_participaciones').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      // Feature #1 (ficha Lorari-vs-Tentare): sus créditos de recuperación.
      // `crear_recuperacion` ya los genera al cancelar una ocurrencia de plaza
      // fija (cancelarReservaPublica), pero antes de esto solo se cargaban en
      // el snapshot de staff — la socia nunca los veía en su propio portal.
      admin.from('recuperaciones').select('*').eq('studio_id', studioId).eq('socio_id', sid),
      // Sus peticiones de plaza fija sin contestar: la app enseña «pendiente» y le
      // deja anularlas. Solo las que pidió ella; la vuelta de una pausa la decide el estudio.
      admin.from('solicitudes_plaza_fija')
        .select('id, tipo, plaza_id, dia_semana, hora_inicio, sala_id, desde_propuesta, hasta_propuesta, creada_en')
        .eq('studio_id', studioId).eq('socio_id', sid).eq('origen', 'ALUMNA').eq('estado', 'PENDIENTE')
        // La petición de una clase fija entera (`CREAR_CLASE_FIJA`) viaja por su propio
        // endpoint (`/api/public/clases-fijas`): aquí solo lo que esta app ya sabe pintar.
        .in('tipo', ['CREAR', 'PAUSAR']),
    ]);

  const misRecibos = (recRes.data ?? []).map(mapRecibo);
  const misReciboIds = misRecibos.map(r => r.id);
  // Facturas no tiene socio_id directo, pero SÍ recibo_id: antes se traía la
  // tabla ENTERA del estudio para filtrarla en el cliente por reciboId. Con
  // PostgREST truncando a 1000 filas por defecto, una socia de un estudio con
  // más de 1000 facturas históricas podía dejar de ver algunas de las suyas
  // (auditoría 2026-07-29, hallazgo 2.3) — y de paso se traía miles de filas
  // ajenas para tirar casi todas. Filtrando por sus propios recibo_id, la
  // consulta nunca puede rozar ese límite (acotada al historial de UNA socia).
  // El corto-circuito con longitud 0 no es por corrección (`.in()` con un array
  // vacío ya devuelve cero filas en PostgREST), es a propósito para no gastar
  // un viaje de red entero en una socia recién dada de alta que aún no tiene
  // ningún recibo.
  const { data: facData } = misReciboIds.length > 0
    ? await admin.from('facturas').select('*').eq('studio_id', studioId).in('recibo_id', misReciboIds)
    : { data: [] as RowFacturas[] };

  return {
    ...base,
    socia: {
      socio: socioPropio(mapSocio(socioRow as RowSocios)),
      suscripciones: (susRes.data ?? []).map(mapSuscripcion),
      reservas: (resRes.data ?? []).map(mapReserva),
      recibos: misRecibos,
      // La renovación que no se va a cobrar sola (sin tarjeta guardada): su app le
      // ofrece pagarla. Se calcula aquí porque el mapeo de recibos no lleva ni
      // `es_renovacion` ni `proximo_reintento` (`FilaReciboPanel`), y porque solo el
      // servidor sabe si el estudio cobra online.
      renovacionPorPagar: renovacionPorPagar(
        (recRes.data ?? []) as unknown as FilaReciboRenovacion[], Boolean(studioRow.stripe_account_id),
      ),
      facturas: (facData ?? []).map(mapFactura),
      memberCredits: (credRes.data ?? []).map(mapMemberCredits),
      rewardHistory: (histRes.data ?? []).map(mapRewardHistory),
      rewardRedemptions: (redRes.data ?? []).map(mapRewardRedemption),
      achievementProgress: (achProgRes.data ?? []).map(mapAchievementProgress),
      challengeProgress: (chalProgRes.data ?? []).map(mapChallengeProgress),
      creditTransactions: (txRes.data ?? []).map(mapCreditTransaction),
      citas: (citasRes.data ?? []).map(mapCita),
      plazasFijas: (plazasRes.data ?? []).map(mapPlazaFija),
      favoritos: (favRes.data ?? []).map((r) => mapFavoritoClase(r as RowFavoritosClase)),
      retosApuntados: (retoRes.data ?? []).map((r) => mapRetoParticipacion(r as RowRetoParticipaciones).retoKey),
      recuperaciones: (recupRes.data ?? []).map(mapRecuperacion),
      peticionesPlazaFija: (peticionesRes.data ?? []).map(p => ({
        id: p.id, tipo: p.tipo as 'CREAR' | 'PAUSAR', plazaId: p.plaza_id ?? null,
        diaSemana: p.dia_semana ?? null, horaInicio: p.hora_inicio ?? null, salaId: p.sala_id ?? null,
        desde: p.desde_propuesta ?? null, hasta: p.hasta_propuesta ?? null, creadaEn: p.creada_en,
      })),
    },
  };
}

// ─── Escrituras públicas scopeadas (service-role + validación) ───────────────
// Cada operación valida que la socia (id + email) pertenece al estudio antes de
// tocar nada, y usa la lógica pura ya testeada (booking-logic/bono-logic).

// Prueba mínima de identidad: el id de socia existe en ese estudio y su email
// coincide. Devuelve la fila de la socia o null.

// I-15 (auditoría 29-ago): autoriza por `auth_user_id`, NUNCA por email.
// Antes comparaba `socios.email` contra el email de la sesión — el panel
// puede escribir `socios.email` libremente (dbUpdateSocio, sin ninguna
// protección), así que una simple corrección de un typo desde el panel
// desalineaba ese email del de Auth y bloqueaba EN SILENCIO cualquier
// escritura pública de esa socia (reservar, cancelar, canjear, editar...)
// sin que nadie pudiera arreglarlo desde el propio portal. `auth_user_id`
// es la vinculación estable (se fija una vez en resolverSociaAutenticada,
// vía claim/magic-link) — inmune a que el estudio edite el email después.
//
// `authUserId` acepta `null` por los dos caminos OAuth (Zapier —
// app/api/oauth/v1/reservas{,/cancelar}/route.ts): ahí no hay JWT de socia,
// así que leen `auth_user_id` de la propia fila (scopeada por studio_id, que
// es donde vive su autorización de verdad, vía el token OAuth) y lo pasan de
// vuelta — comparación consigo mismo, igual de tautológica que antes con el
// email, y sin debilitar nada: una socia sin cuenta reclamada (auth_user_id
// NULL) sigue pudiendo reservar por Zapier, como siempre.
async function validarSociaPublica(
  admin: SupabaseClient, studioId: string, socioId: string, authUserId: string | null,
): Promise<RowSocios | null> {
  const { data } = await admin
    .from('socios').select('*').eq('id', socioId).eq('studio_id', studioId).maybeSingle();
  if (!data) return null;
  return data.auth_user_id === authUserId ? (data as RowSocios) : null;
}

// Descuenta una sesión del bono activo de la socia (si aplica) usando bono-logic.
// Si el bono se agota, avisa (sin crear ninguna deuda: ver `avisaBonoAgotado`).
// Devuelve true si realmente descontó una sesión de un bono (false si la socia
// no tenía bono consumible — p. ej. plan mensual). Lo usa el email de promoción
// para no afirmar "se descontó una sesión" cuando no fue así.
// Recibe la SESIÓN, no el tipo de clase: el tipo se resuelve aquí una sola vez
// (antes lo consultaba cada llamante por su cuenta) y así se le puede pasar la
// sesión a la RPC, que vuelve a comprobar la cobertura del lado de la BD.

/** Lo que `bonoConsumible` decide: qué suscripción (y su plan) se cobraría. */
type ConsumibleBono = NonNullable<ReturnType<typeof bonoConsumible>>;

// D-1 (auditoría 22-sep): extraído de `consumirBonoServidor` para elegir el bono
// ANTES de llamar a `reservar_plaza`, que necesita el `suscripcion_id` ya
// decidido para descontarlo dentro de su propia transacción.
async function resolverBonoParaSesion(admin: SupabaseClient, p: {
  studioId: string; socioId: string; sesionId: string;
}): Promise<ConsumibleBono | null> {
  const { studioId, socioId, sesionId } = p;
  const { data: ses } = await admin.from('sesiones').select('tipo_clase_id').eq('id', sesionId).maybeSingle();
  const tipoClaseId = (ses?.tipo_clase_id as string | null) ?? null;
  const [{ data: susRows }, { data: planRows }] = await Promise.all([
    admin.from('suscripciones').select('*').eq('studio_id', studioId).eq('socio_id', socioId),
    admin.from('planes_tarifa').select('*').eq('studio_id', studioId),
  ]);
  const suscripciones = (susRows ?? []).map(mapSuscripcion);
  // Los tipos que cubre cada plan viven aparte (0111): sin hidratarlos se
  // descontaría de un bono que no cubre esta clase.
  const planes = await hidratarTiposDePlanes(admin as never, studioId, (planRows ?? []).map(mapPlanTarifa));
  return bonoConsumible(socioId, suscripciones, planes, undefined, tipoClaseId);
}

// Efectos tras SABER el resultado del cobro (venga de `reservar_plaza` en la
// misma transacción, o de `consumir_sesion_bono_reserva` en una llamada
// aparte): avisar si se quedó sin descontar pudiendo, y el aviso de «bono
// agotado». Compartido por las dos vías para no duplicar esta lógica.
async function efectosPostBono(admin: SupabaseClient, p: {
  studioId: string; socioId: string; reservaId: string;
  consumible: ConsumibleBono | null;
  consumo: ConsumoBono;
}): Promise<ConsumoBono> {
  const { studioId, socioId, consumible, consumo } = p;
  if (consumo.resultado === 'FALLO') { reportDbError('[efectosPostBono]', consumo.error); return consumo; }
  if (!consumible) return consumo;
  const { suscripcion: sus, plan } = consumible;
  if (consumo.resultado === 'SIN_SALDO') {
    // La socia SÍ tenía un bono consumible (`bonoConsumible` lo confirmó arriba)
    // pero no se descontó. La reserva ya está CONFIRMADA, así que esto es una
    // clase servida sin cobrar. No se revierte aquí —cancelar una plaza ya
    // confirmada es peor experiencia y es decisión de producto— pero deja de ser
    // invisible: sin esto no había ni rastro.
    //
    // Desde D-1 (22-sep) el descuento de la reserva directa va dentro de
    // `reservar_plaza`; esta guardia queda como red de seguridad.
    reportDbError(
      '[efectosPostBono] bono consumible sin descontar (posible clase no cobrada)',
      { studioId, socioId, suscripcionId: sus.id, reservaId: p.reservaId },
    );
    return consumo;
  }
  // YA_CONSUMIDA / YA_DECIDIDA / NO_OCUPA_PLAZA / NO_VERIFICABLE: no se ha descontado nada
  // ahora, así que tampoco se vuelve a anunciar «bono agotado».
  if (consumo.resultado !== 'CONSUMIDA') return consumo;
  // ⚠️ Aquí NO se crea ningún recibo. Agotar un bono es el final de una compra
  // única, no el principio de otra (ver historia completa en el comentario
  // original, migr previa a esta). Ver `avisaBonoAgotado` en `lib/bono-logic.ts`.
  // El mensual no pasa por aquí (no consume sesiones): su renovación la sigue
  // llevando el cron `lib/inngest/renovaciones.ts`, intacto.
  if (consumo.saldo === 0 && avisaBonoAgotado(plan)) {
    const { emitirBonoAgotado } = await import('@/lib/notifications/emit');
    await emitirBonoAgotado(admin, { studioId, socioId, plan: plan.nombre, suscripcionId: sus.id });
  }
  return consumo;
}

// Descuenta una sesión del bono activo de la socia (si aplica) usando bono-logic.
// Camino de RETRY / dueños que NO pasan por `reservar_plaza` en esta misma
// llamada (`trasPlazaConfirmada`, `trasPromocionDeEspera`,
// `completarConfirmacionTrasReintento`, y el `reintento` de `trasReservaCreada`):
// elige el bono y lo descuenta con `consumir_sesion_bono_reserva`, en una
// transacción APARTE de la que insertó la reserva. Para la confirmación
// DIRECTA de una reserva nueva, el dueño ya no es esta función — ver D-1 en
// `resolverBonoParaSesion` y el uso de `p_suscripcion_id` en `reservar_plaza`.
async function consumirBonoServidor(admin: SupabaseClient, p: {
  studioId: string; socioId: string; sesionId: string;
  /** La reserva que se cobra: la decisión (cobrada o no) queda marcada en ella. */
  reservaId: string;
  /** Reintento del mismo intento: solo descuenta si puede PROBAR que falta. */
  reintento?: boolean;
}): Promise<ConsumoBono> {
  const { studioId, socioId, sesionId } = p;
  const consumible = await resolverBonoParaSesion(admin, { studioId, socioId, sesionId });
  // «No hay bono que cubra la clase» también es una decisión y se registra en la
  // reserva (`suscripcionId: null`): si la socia compra un bono después, un
  // reintento no le cobra esta clase.
  //
  // Decremento ATÓMICO condicional (arregla el sobre-consumo concurrente): N
  // reservas simultáneas de la misma socia ya NO comparten el mismo descuento.
  // Y POR RESERVA (migr 20260914182637): la marca queda en la propia reserva en
  // la misma transacción, así que volver a llamar descuenta si falta y, si no,
  // no toca nada.
  const consumo = await descontarSesionDeReserva(admin as never, {
    studioId, sesionId, suscripcionId: consumible?.suscripcion.id ?? null,
    reservaId: p.reservaId, reintento: p.reintento ?? false,
  });
  return efectosPostBono(admin, { studioId, socioId, reservaId: p.reservaId, consumible, consumo });
}


/**
 * Resultado de intentar devolver una sesión al bono. Los tres casos son
 * distintos y confundirlos cuesta caro (auditoría 22ª pasada, F-1):
 *  · `DEVUELTA`  — se sumó una sesión.
 *  · `SIN_BONO`  — no había nada que devolver (clase suelta, o bono ya al tope).
 *                  NO es un fallo: avisar de esto como si lo fuera manda a la
 *                  propietaria a "revisarlo a mano" en la mitad de las
 *                  cancelaciones normales.
 *  · `FALLO`     — había que devolverla y la escritura no salió.
 */
export type ResultadoDevolucionBono = 'DEVUELTA' | 'SIN_BONO' | 'FALLO';

// Devuelve `DEVUELTA` solo si de verdad se devolvió una sesión. Antes no
// devolvía nada y el llamador daba la devolución por hecha (I-5): ver el
// comentario en `bonoDevolvible`.
//
// Auditoría 2026-09-16 (RES-3): `reservaId` es opcional y, cuando la reserva
// quedó RASTREADA (`bono_consumo_rastreado` + `bono_suscripcion_id`, migr
// 20260914182637), la devolución va DIRECTA a esa suscripción — el dato que
// dice de qué bono se cobró, no la heurística `bonoDevolvible` (que puede
// elegir un bono DISTINTO del que se descontó: un bono A agotado que caduca
// antes y un bono B con hueco que caduca después, la heurística devuelve a A
// aunque el consumo real fuera de B — el saldo total cuadra, pero el crédito
// acaba en el bono equivocado). Sin `reservaId`, o para una reserva anterior
// a esa migración (sin rastreo), cae a la heurística de siempre.
export async function devolverBonoServidor(
  admin: SupabaseClient, studioId: string, socioId: string, tipoClaseId?: string | null,
  reservaId?: string,
): Promise<ResultadoDevolucionBono> {
  if (reservaId) {
    const { data: reserva, error: errorReserva } = await admin.from('reservas')
      .select('bono_consumo_rastreado, bono_suscripcion_id')
      .eq('id', reservaId).eq('studio_id', studioId).maybeSingle();
    if (errorReserva && !esColumnaInexistente(errorReserva)) reportDbError('[devolverBonoServidor]', errorReserva);
    if (reserva?.bono_consumo_rastreado && reserva.bono_suscripcion_id) {
      // ⚠️ Idempotente POR RESERVA (auditoría 2026-09-19).
      //
      // Antes se llamaba a `devolver_sesion_bono`, que es un `+1` ciego topado
      // por el plan y no sabe qué reserva lo provocó. Ninguno de los filtros de
      // `/api/reservas/devolver-bonos` (CANCELADA, sesión cancelada, rastreada)
      // cambia al devolver, así que repetir el POST con los mismos ids volvía a
      // sumar cada vez hasta el tope: un doble clic inflaba el saldo de la
      // socia, y ese saldo son clases.
      //
      // `devolver_sesion_bono_por_reserva` sella `reservas.bono_devuelto_en` y
      // devuelve en la misma transacción; el propio UPDATE de la marca es lo
      // que serializa dos peticiones simultáneas. `null` = ya estaba devuelta
      // (o el bono está al tope), que es un SIN_BONO, no un fallo.
      const { data: nuevoSaldo, error } = await admin.rpc('devolver_sesion_bono_por_reserva', {
        p_studio_id: studioId, p_reserva_id: reservaId,
      });
      if (error) { reportDbError('[devolverBonoServidor]', error); return 'FALLO'; }
      return nuevoSaldo != null ? 'DEVUELTA' : 'SIN_BONO';
    }
  }
  const [{ data: susRows }, { data: planRows }] = await Promise.all([
    admin.from('suscripciones').select('*').eq('studio_id', studioId).eq('socio_id', socioId),
    admin.from('planes_tarifa').select('*').eq('studio_id', studioId),
  ]);
  const planesConTipos = await hidratarTiposDePlanes(admin as never, studioId, (planRows ?? []).map(mapPlanTarifa));
  // I-5: `bonoDevolvible`, no `bonoConsumible`. Para devolver hace falta HUECO,
  // no saldo — y el bono al que hay que devolverle la sesión es justo el que se
  // quedó a 0 al gastarla, que `bonoConsumible` descarta.
  const devolvible = bonoDevolvible(socioId, (susRows ?? []).map(mapSuscripcion), planesConTipos, undefined, tipoClaseId);
  if (!devolvible) return 'SIN_BONO';

  // R-4 (auditoría 22-sep): con `reservaId`, sella la devolución POR RESERVA
  // igual que la rama rastreada de arriba — mismo motivo exacto: repetir el
  // POST con el mismo id volvía a sumar +1 cada vez, hasta el tope del plan.
  // Sin `reservaId` (llamantes que no lo tienen) sigue el incremento ciego de
  // siempre, sin marca posible.
  if (reservaId) {
    const { data: nuevoSaldo, error } = await admin.rpc('devolver_sesion_bono_legado_por_reserva', {
      p_studio_id: studioId, p_reserva_id: reservaId, p_suscripcion_id: devolvible.suscripcion.id,
    });
    if (error) { reportDbError('[devolverBonoServidor]', error); return 'FALLO'; }
    // `null` = ya estaba sellada (reintento) o el bono ya estaba al tope —
    // mismo criterio tri-estado que la rama rastreada: SIN_BONO, no FALLO.
    return nuevoSaldo != null ? 'DEVUELTA' : 'SIN_BONO';
  }

  // I-10: incremento ATÓMICO con el tope aplicado en el propio WHERE. Antes era
  // read-modify-write sobre el snapshot de arriba, así que dos cancelaciones
  // concurrentes escribían el mismo número y una devolución se perdía en
  // silencio — la misma asimetría que el consumo ya había resuelto.
  const { data: nuevoSaldo, error } = await admin.rpc('devolver_sesion_bono', {
    p_suscripcion_id: devolvible.suscripcion.id, p_studio_id: studioId,
  });
  if (error) { reportDbError('[devolverBonoServidor]', error); return 'FALLO'; }
  // `nuevoSaldo` null = el bono ya estaba al tope (el WHERE de la RPC no casó):
  // no había hueco, así que no hay nada que devolver ni nada que reparar.
  return nuevoSaldo != null ? 'DEVUELTA' : 'SIN_BONO';
}

// P-1 (auditoría 21-ago): política única, compartida por los caminos
// server-side que cancelan una clase COMPLETA (sustituciones/cancelar_clase
// y el cron de mínimo de asistentes) — el estudio decide si sus socias
// recuperan la sesión o se les agota igual (`studios.cancelacion_clase_
// devuelve_bono`, default true). El camino de panel/serie corre en cliente
// y resuelve la misma pregunta con `devolverSesionBono` en studio-context.tsx
// (necesita `admin` para leer suscripciones/planes cross-socia; el panel no
// lo tiene con RLS de staff).
//
// Devuelve por socia si REALMENTE se devolvió (no solo si la política lo
// permite): mismo cuidado que `devolverBonoServidor` ya documentaba (I-5),
// para que el email de cancelación nunca prometa una sesión que no recuperó.
export async function devolverBonosPorCancelacionClase(
  admin: SupabaseClient, studioId: string,
  confirmadas: { socioId: string; tipoClaseId: string | null; reservaId?: string }[],
): Promise<Map<string, boolean>> {
  const devueltoPorSocia = new Map<string, boolean>();
  if (confirmadas.length === 0) return devueltoPorSocia;
  const { data } = await admin.from('studios')
    .select('cancelacion_clase_devuelve_bono').eq('id', studioId).maybeSingle();
  const devuelve = (data?.cancelacion_clase_devuelve_bono ?? true) as boolean;
  if (!devuelve) {
    confirmadas.forEach(c => devueltoPorSocia.set(c.socioId, false));
    return devueltoPorSocia;
  }
  // Una reserva rastreada que nunca se cobró de un bono no recupera nada.
  const sinCobro = await reservasSinCobroRegistrado(admin, studioId, confirmadas.flatMap(c => c.reservaId ? [c.reservaId] : []));
  for (const c of confirmadas) {
    if (c.reservaId && sinCobro.has(c.reservaId)) { devueltoPorSocia.set(c.socioId, false); continue; }
    devueltoPorSocia.set(c.socioId, (await devolverBonoServidor(admin, studioId, c.socioId, c.tipoClaseId, c.reservaId)) === 'DEVUELTA');
  }
  return devueltoPorSocia;
}

// Reúne los datos de una clase para un email transaccional (nombre de clase,
// fecha/hora en hora de España, sala e instructora, nombre del estudio). Formato
// legible para la socia; devuelve null si la sesión no existe.

async function datosClaseParaEmail(
  admin: SupabaseClient, studioId: string, sesionId: string,
): Promise<(DatosClaseEmail & { inicioISO: string }) | null> {
  const { data: ses } = await admin
    .from('sesiones')
    .select('inicio, tipo_clase_id, sala_id, instructor_id, zoom_join_url')
    .eq('id', sesionId).eq('studio_id', studioId).maybeSingle();
  if (!ses) return null;
  const [{ data: tipo }, { data: sala }, { data: inst }, { data: studio }] = await Promise.all([
    admin.from('tipos_clase').select('nombre').eq('id', ses.tipo_clase_id).maybeSingle(),
    ses.sala_id ? admin.from('salas').select('nombre').eq('id', ses.sala_id).maybeSingle() : Promise.resolve({ data: null }),
    ses.instructor_id ? admin.from('instructores').select('nombre').eq('id', ses.instructor_id).maybeSingle() : Promise.resolve({ data: null }),
    admin.from('studios').select('nombre').eq('id', studioId).maybeSingle(),
  ]);
  const inicio = new Date(ses.inicio as string);
  const fecha = fechaLargaEstudio(inicio);
  const hora = horaEstudio(inicio);
  return {
    inicioISO: ses.inicio as string,
    claseNombre: tipo?.nombre ?? 'Clase',
    fecha, hora,
    sala: sala?.nombre ?? '',
    instructor: inst?.nombre ?? '',
    estudioNombre: studio?.nombre ?? 'Tentare',
    zoomJoinUrl: (ses.zoom_join_url as string | null) ?? null,
  };
}

// Envía a una socia el email de promoción de lista de espera (fire-and-forget:
// no bloquea la respuesta de la reserva; si falla o Resend no está, no rompe).

async function notificarPromocionEspera(
  admin: SupabaseClient, studioId: string, socioId: string, sesionId: string, bonoConsumido: boolean,
) {
  const { data: socia } = await admin
    .from('socios').select('nombre, email').eq('id', socioId).eq('studio_id', studioId).maybeSingle();
  if (!socia?.email) return;
  const datos = await datosClaseParaEmail(admin, studioId, sesionId);
  if (!datos) return;
  await enviarEmailTransaccional({
    tipo: 'promocion', to: socia.email, toName: socia.nombre ?? 'Socia',
    data: { ...datos, bonoConsumido },
    studioId,
    // Una socia solo se promociona una vez por sesión: la clave la identifica.
    idempotencyKey: `promocion-${sesionId}-${socioId}`,
  });
}

// ─── Hechos de reserva: un dueño por hecho ──────────────────────────────────
// Lo que pasa DESPUÉS de que la BD decida una plaza (descontar bono, gamificación,
// avisos) estaba copiado en siete sitios y ya había divergido: la misma
// promoción desde lista de espera se contaba con el correo «Se ha liberado tu
// plaza» si la disparaba una cancelación y con un push genérico de «reserva
// confirmada» si la disparaba el mostrador o una oferta caducada.
//
// Son tres hechos distintos, y cada uno tiene aquí UNA función dueña:
//  · `trasReservaCreada`    — alguien pide plaza y `reservar_plaza` la decide
//                             (CONFIRMADA / LISTA_ESPERA / PENDIENTE_APROBACION).
//  · `trasPlazaConfirmada`  — una petición que ya existía pasa a CONFIRMADA
//                             (aprobación manual, oferta aceptada a tiempo).
//  · `trasPromocionDeEspera`— la BD sube sola a la primera de la lista de
//                             espera porque se ha liberado un hueco.
//
// Regla: cualquier camino NUEVO que confirme una plaza llama a su dueño, nunca
// a `consumirBonoServidor` ni a `emitir*` por su cuenta. Si un caso no encaja en
// ninguno de los tres, es un hecho nuevo y merece su propio dueño aquí.

type CanalReserva = 'alumna' | 'pago' | 'mostrador';

async function trasReservaCreada(admin: SupabaseClient, p: {
  studioId: string; socioId: string; sesionId: string; estado: string;
  spotAsignado: string | null; canal: CanalReserva;
  /** Solo el mostrador puede decir que no («Avisar a la alumna» desmarcado). */
  avisarSocia?: boolean;
  reservaId: string;
  /**
   * Reintento del MISMO intento (mismo id de reserva): la primera vez pudo morir
   * entre crear la reserva y descontar el bono. Se completa el descuento (es
   * idempotente por reserva) y el resto de efectos solo se repite si ese
   * descuento ha ocurrido AHORA — ver `efectosTrasConsumo`.
   */
  reintento?: boolean;
  /**
   * D-1: el bono YA se decidió DENTRO de `reservar_plaza` (mismo candado que
   * confirmó la plaza) — lo trae quien llamó a la RPC, vía
   * `interpretarBonoDeReservarPlaza`. Con esto presente (camino directo, no
   * reintento) NO se vuelve a llamar a `consumirBonoServidor`: la RPC
   * `consumir_sesion_bono_reserva` vería `bono_decidido_en` ya escrito y
   * respondería YA_CONSUMIDA/YA_DECIDIDA, lo que haría que
   * `efectosTrasConsumo` se saltase avisos y analítica por error.
   */
  consumoBono?: ConsumoBono;
  /** El mismo bono candidato que se pasó a `reservar_plaza` (`p_suscripcion_id`), para el aviso de «bono agotado». */
  consumibleBono?: ConsumibleBono | null;
}): Promise<boolean> {
  // La clase decide de QUÉ bono se descuenta (0111): con un "Bono Reformer" y
  // un "Bono Mat" a la vez, sin la sesión se quitaría del equivocado.
  if (p.reintento) {
    if (!ocupaPlaza(p.estado)) return false;
    const consumo = await consumirBonoServidor(admin, {
      studioId: p.studioId, socioId: p.socioId, sesionId: p.sesionId, reservaId: p.reservaId, reintento: true,
    });
    if (!efectosTrasConsumo(p.estado, consumo, true)) return false;
  } else if (p.estado === 'CONFIRMADA') {
    const consumo = p.consumoBono
      ? await efectosPostBono(admin, {
          studioId: p.studioId, socioId: p.socioId, reservaId: p.reservaId,
          consumible: p.consumibleBono ?? null, consumo: p.consumoBono,
        })
      : await consumirBonoServidor(admin, {
          studioId: p.studioId, socioId: p.socioId, sesionId: p.sesionId, reservaId: p.reservaId,
        });
    // Una llamada concurrente con la misma reserva (un reintento) ya decidió el
    // cobro: es ella la que avisa, cuenta la analítica y da los créditos.
    if (!efectosTrasConsumo(p.estado, consumo, false)) return false;
  }
  if (p.estado === 'CONFIRMADA') {
    // La analítica de conversión mide a la ALUMNA reservando (widget, app,
    // pago). Una reserva metida por recepción no es una conversión del embudo.
    if (p.canal !== 'mostrador') {
      capturar(p.studioId, { nombre: 'reserva_completada', props: { con_spot_elegido: Boolean(p.spotAsignado) } });
    }
  }
  // S-1: la reserva mueve RESERVAS_TOTALES (y la racha, si la sesión ya pasó),
  // tanto para logros como para retos vigentes.
  await evaluarGamificacionServidor(admin, p.studioId, p.socioId);

  // Notification Engine (server-only): la socia recibe confirmación / lista de
  // espera y la propietaria "nueva reserva". Import dinámico para no arrastrar el
  // motor (node:crypto, Inngest) al bundle de cliente de este módulo.
  if (p.estado === 'CONFIRMADA' || p.estado === 'LISTA_ESPERA') {
    const { emitirReserva, emitirClaseCasiLlena } = await import('@/lib/notifications/emit');
    if (p.avisarSocia !== false) {
      await emitirReserva(admin, { studioId: p.studioId, sesionId: p.sesionId, socioId: p.socioId, estado: p.estado as 'CONFIRMADA' | 'LISTA_ESPERA' });
    }
    // Aviso a la dueña si la clase se acerca al lleno (≥90%). Es para el
    // estudio, no para la socia: no depende de `avisarSocia`.
    if (p.estado === 'CONFIRMADA') await emitirClaseCasiLlena(admin, { studioId: p.studioId, sesionId: p.sesionId });
  } else if (p.estado === 'PENDIENTE_APROBACION') {
    // Fase 2a: no consume bono ni asigna spot todavía (bloque de arriba, gateado
    // a `CONFIRMADA`, ya la deja fuera). Solo avisa al mostrador de que hay algo
    // que revisar antes de que empiece la clase.
    const { emitirReservaPendienteAprobacion } = await import('@/lib/notifications/emit');
    await emitirReservaPendienteAprobacion(admin, { studioId: p.studioId, sesionId: p.sesionId, socioId: p.socioId });
  }
  return true;
}

async function trasPlazaConfirmada(admin: SupabaseClient, p: {
  studioId: string; socioId: string; sesionId: string; reservaId: string;
  /** Reintento sobre una reserva que YA está CONFIRMADA (lo garantiza quien llama). */
  reintento?: boolean;
}): Promise<void> {
  // Mismo criterio que una reserva normal: la clase decide de qué bono se
  // descuenta (0111). El spot elegido al pedir no se conserva: no hay spot
  // guardado mientras se espera, se asigna solo al confirmar.
  const consumo = await consumirBonoServidor(admin, {
    studioId: p.studioId, socioId: p.socioId, sesionId: p.sesionId, reservaId: p.reservaId, reintento: p.reintento,
  });
  if (!efectosTrasConsumo('CONFIRMADA', consumo, p.reintento ?? false)) return;
  const { emitirReserva } = await import('@/lib/notifications/emit');
  await emitirReserva(admin, { studioId: p.studioId, sesionId: p.sesionId, socioId: p.socioId, estado: 'CONFIRMADA' });
}

async function trasPromocionDeEspera(admin: SupabaseClient, p: {
  studioId: string; socioId: string; sesionId: string;
}): Promise<{ bonoConsumido: boolean }> {
  // Entra en la MISMA clase que se acaba de liberar, así que su tipo decide de
  // qué bono se le descuenta.
  //
  // La RPC de promoción devuelve a QUIÉN subió, no el id de su reserva: se
  // busca su reserva activa en esa clase (única por `uq_reserva_activa_socio_
  // sesion`).
  //
  // ⚠️ Sin id NO se cobra «a la antigua». Un descuento sin marca sobre una
  // reserva rastreada deja justo la señal de «cobro pendiente», y un reintento
  // posterior (aceptar una oferta, aprobar) lo cobraría otra vez. Se prefiere
  // no cobrar y dejarlo a la vista: descontar dos veces es peor.
  const { data: activa, error: errActiva } = await admin.from('reservas').select('id')
    .eq('studio_id', p.studioId).eq('sesion_id', p.sesionId).eq('socio_id', p.socioId)
    .in('estado', ['CONFIRMADA', 'ASISTIDA']).maybeSingle();
  const reservaId = (activa?.id as string | undefined) ?? null;
  let bonoConsumido = false;
  if (reservaId) {
    const consumo = await consumirBonoServidor(admin, {
      studioId: p.studioId, socioId: p.socioId, sesionId: p.sesionId, reservaId,
    });
    bonoConsumido = sesionDescontada(consumo);
    // Otra llamada ya decidió el cobro de esta reserva: es ella la que avisa.
    if (!efectosTrasConsumo('CONFIRMADA', consumo, false)) return { bonoConsumido };
  } else {
    reportDbError(
      '[trasPromocionDeEspera] sin reserva promovida que marcar: bono sin decidir (posible clase no cobrada)',
      errActiva ?? { studioId: p.studioId, sesionId: p.sesionId, socioId: p.socioId },
    );
  }
  // Correo «Se ha liberado tu plaza» (dice si se descontó sesión, solo si de
  // verdad ocurrió) + push. Cierra la mentira "te avisaremos si se libera una
  // plaza", da igual quién la liberase: una cancelación, el mostrador con
  // «Ofrecer plaza» o una oferta que caducó sin aceptar.
  await notificarPromocionEspera(admin, p.studioId, p.socioId, p.sesionId, bonoConsumido);
  const { emitirPlazaLiberada } = await import('@/lib/notifications/emit');
  await emitirPlazaLiberada(admin, { studioId: p.studioId, sesionId: p.sesionId, socioId: p.socioId });
  return { bonoConsumido };
}

// Reintento de aprobar una reserva pendiente o de aceptar una oferta: la RPC ya
// no encuentra nada pendiente, y una causa posible es que la primera vez SÍ
// confirmó y el proceso murió antes de descontar el bono. Si la reserva está
// CONFIRMADA, su dueño se llama otra vez en modo reintento: descuenta solo si
// falta (idempotente por reserva) y solo entonces avisa. Con la reserva ya
// cobrada, o legada, no hace nada.
// D-5 (auditoría 22-sep): exportada además de usarse internamente — es el
// mismo camino de reparación que necesita `repararBonosSinDecidir`
// (lib/reservas/reparar-bono-sin-decidir.ts) para cerrar de forma proactiva
// una reserva CONFIRMADA cuyo descuento de bono quedó tragado por el
// BEGIN/EXCEPTION defensivo de `reservar_plaza` (D-1). Mismo comportamiento
// para los llamantes ya existentes (no consumían el valor de retorno).
export async function completarConfirmacionTrasReintento(admin: SupabaseClient, p: {
  studioId: string; reservaId: string;
  /** Si viene, la reserva tiene que ser de esta socia (camino de la propia alumna). */
  socioId?: string;
}): Promise<void> {
  // Las plazas fijas materializadas no se cobran nunca (nacen no rastreadas);
  // esto cubre también las anteriores a la migración.
  if (p.reservaId.startsWith('res-pf-')) return;
  const { data: res } = await admin.from('reservas').select('estado, sesion_id, socio_id')
    .eq('id', p.reservaId).eq('studio_id', p.studioId).maybeSingle();
  if (!res || res.estado !== 'CONFIRMADA' || !res.sesion_id || !res.socio_id) return;
  if (p.socioId && res.socio_id !== p.socioId) return;
  await trasPlazaConfirmada(admin, {
    studioId: p.studioId, socioId: res.socio_id as string, sesionId: res.sesion_id as string,
    reservaId: p.reservaId, reintento: true,
  });
}

// Al cancelar: reservas RASTREADAS cuyo cobro nunca salió de un bono (sin bono,
// o canceladas con el cobro aún en vuelo — ver `devolucionPermitida`). A esas no
// se les devuelve sesión: regalaría saldo. Hay que leerlo DESPUÉS de cancelar:
// un cobro que aún no hubiera terminado ya ve la reserva cancelada y no descuenta.
// Sin la migración aplicada (columnas inexistentes) devuelve vacío y todo sigue
// como siempre; un error de lectura también, pero se reporta.
export async function reservasSinCobroRegistrado(
  admin: SupabaseClient, studioId: string, reservaIds: string[],
): Promise<Set<string>> {
  const sinCobro = new Set<string>();
  if (reservaIds.length === 0) return sinCobro;
  const { data, error } = await admin.from('reservas')
    .select('id, bono_consumo_rastreado, bono_suscripcion_id')
    .eq('studio_id', studioId).in('id', reservaIds);
  if (error) {
    if (!esColumnaInexistente(error)) reportDbError('[reservasSinCobroRegistrado]', error);
    return sinCobro;
  }
  for (const r of data ?? []) {
    if (!devolucionPermitida(r)) sinCobro.add(r.id as string);
  }
  return sinCobro;
}

// Recordatorios de revisión de ficha clínica (FICHA-CLINICA.md §10). Recorre las
// condiciones activas de todos los estudios; para las que necesitan revisión
// (regla pura `recordatoriosRevision`) crea un aviso en `notificaciones`. Dedup:
// no re-avisa la misma condición si ya hay un aviso suyo en los últimos 30 días
// (marca en el enlace `?rev=<condicionId>`). Lo dispara /api/cron/revisiones-salud.

export async function generarRecordatoriosRevision(studioId: string, nowISO: string, umbralDias = 90) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const hoy = new Date(nowISO);

  const { data: condsRaw, error } = await admin
    .from('condiciones_salud').select('*').eq('estado', 'ACTIVA').eq('studio_id', studioId);
  if (error) throw new Error(error.message);
  let condiciones = (condsRaw ?? []).map(r => mapCondicionSalud(r as RowCondicionesSalud));

  // C-3 (auditoría 29-ago): admin usa service-role, se salta la RLS de
  // `condiciones_salud` igual que `semaforo_salud_estudio` — sin este filtro
  // el cron seguiría avisando a la propietaria/instructora del contenido de
  // una condición para la que la socia no ha dado consentimiento de lectura
  // (art. 9 RGPD). Mismo criterio que la RLS, en batches por el límite de `in`.
  if (condiciones.length > 0) {
    const idsParaConsentimiento = [...new Set(condiciones.map(c => c.socioId))];
    const conConsentimiento = new Set<string>();
    for (let i = 0; i < idsParaConsentimiento.length; i += 200) {
      const lote = idsParaConsentimiento.slice(i, i + 200);
      const { data: socias } = await admin.from('socios')
        .select('id, consentimiento_salud_fecha, consentimiento_salud_revocado_en').in('id', lote);
      for (const s of socias ?? []) {
        if (s.consentimiento_salud_fecha && !s.consentimiento_salud_revocado_en) conConsentimiento.add(s.id as string);
      }
    }
    condiciones = condiciones.filter(c => conConsentimiento.has(c.socioId));
  }

  const recordatorios = recordatoriosRevision(condiciones, hoy, umbralDias);
  if (recordatorios.length === 0) {
    return { condicionesActivas: condiciones.length, recordatorios: 0, notificacionesCreadas: 0 };
  }

  // Nombres de las socias implicadas (en lotes para no exceder el filtro `in`).
  const socioIds = [...new Set(recordatorios.map(r => r.condicion.socioId))];
  const nombrePorSocio = new Map<string, string>();
  for (let i = 0; i < socioIds.length; i += 200) {
    const lote = socioIds.slice(i, i + 200);
    const { data: socias } = await admin.from('socios').select('id, nombre, apellidos').in('id', lote);
    for (const s of socias ?? []) nombrePorSocio.set(s.id as string, `${s.nombre} ${s.apellidos}`.trim());
  }

  // Migrado al Notification Engine: se PUBLICA un evento por revisión pendiente
  // (la dueña lo recibe en su centro). La idempotencia la garantiza el dedupKey
  // (por condición y mes) — sustituye al viejo dedup por enlace de 30 días.
  const { publish } = await import('@/lib/notifications/engine');
  const { EVENTOS } = await import('@/lib/notifications/catalog');
  const mes = nowISO.slice(0, 7);
  for (const r of recordatorios) {
    const nombre = nombrePorSocio.get(r.condicion.socioId) ?? 'Una socia';
    await publish({
      type: EVENTOS.SALUD_REVISION, studioId: r.condicion.studioId,
      data: { mensaje: textoRecordatorioRevision(nombre, r), socia: nombre, socioId: r.condicion.socioId, condId: r.condicion.id },
      resource: { type: 'socio', id: r.condicion.socioId },
      dedupKey: `salud-rev:${r.condicion.id}:${mes}`,
    });
  }
  return { condicionesActivas: condiciones.length, recordatorios: recordatorios.length, notificacionesCreadas: recordatorios.length };
}

// Copia el catálogo de tipos de clase de la cadena (cadena_tipos_clase) a los
// tipos_clase REALES de una sede — nunca un vínculo vivo, solo "insertar lo
// que falte por nombre". Se usa en dos sitios: al crear una sede nueva
// (app/api/cadena/sedes/route.ts) y en el botón "Aplicar catálogo" para
// sedes ya existentes (app/api/cadena/tipos-clase/aplicar/route.ts). Nunca
// sobrescribe ni borra un tipo_clase que la sede ya tenga, aunque su nombre
// coincida con uno de la plantilla y lo hayan editado localmente —
// deliberadamente sin detección de diff/conflicto, ver diseño en
// .claude/tentare-os.md.
export async function aplicarCatalogoCadena(params: { cadenaId: string; studioId: string }): Promise<{ aplicados: number }> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  const [{ data: plantilla }, { data: existentes }] = await Promise.all([
    admin.from('cadena_tipos_clase').select('*').eq('cadena_id', params.cadenaId),
    admin.from('tipos_clase').select('nombre').eq('studio_id', params.studioId),
  ]);
  if (!plantilla?.length) return { aplicados: 0 };

  const nombresExistentes = new Set((existentes ?? []).map(t => (t.nombre as string).toLowerCase()));
  const faltantes = plantilla.filter(p => !nombresExistentes.has((p.nombre as string).toLowerCase()));
  if (faltantes.length === 0) return { aplicados: 0 };

  const filas = faltantes.map(p => ({
    id: `tc-${uid()}`,
    studio_id: params.studioId,
    nombre: p.nombre,
    color: p.color,
    duracion_minutos: p.duracion_minutos,
    descripcion: p.descripcion,
    nivel: p.nivel,
    foto_url: p.foto_url,
  }));
  const { error } = await admin.from('tipos_clase').insert(filas);
  if (error) throw new Error(`aplicarCatalogoCadena: ${error.message}`);
  return { aplicados: filas.length };
}

// Barrido de no-shows: marca NO_ASISTIO toda reserva que siga CONFIRMADA en una
// sesión ya terminada (fin < ahora) y no cancelada. Sin esto, las reservas sin
// check-in se quedan CONFIRMADA para siempre y las métricas de ausencias mienten.
// Lo dispara un cron (ver /api/cron/no-shows). No toca bonos: la sesión ya se
// consumió al reservar; un no-show no se reembolsa (esa es la penalización).
// F2 (B2.2): materializa las plazas fijas → reservas CONFIRMADA de las próximas
// semanas. Lo dispara el cron nocturno. Todo el trabajo (emparejamiento por hora
// local, aforo, idempotencia) es set-based en la RPC. Devuelve cuántas creó.

// Mismo límite que el resto de abanicos contra Supabase de este repo.
const CONCURRENCIA_AVISOS = 8;

export async function materializarPlazasFijas(horizonteDias = HORIZONTE_MATERIALIZAR_DIAS): Promise<{ creadas: number; noMaterializadas: number; soltadas: number }> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  // Primero se suelta lo que ya no tiene cuota. Aquí se cubren TODOS los caminos
  // por los que una alumna se queda sin ella (vence, se cancela por impago, se
  // pausa, se cambia por un bono); el panel lo hace además al momento. Best-effort:
  // un fallo aquí no puede dejar sin materializar al resto de estudios.
  let soltadas = 0;
  try {
    soltadas = (await soltarReservasPlazaFijaSinCuota(admin)).canceladas.length;
  } catch (e) {
    capturarExcepcion(e, { tags: { area: 'plazas-fijas' }, extra: { paso: 'soltar-sin-cuota' } });
  }
  // Las pausas que sueltan o recuperan su sitio, antes del motor para que lo que
  // vuelve quede reservado en esta misma pasada. Mismo criterio: best-effort.
  try {
    await repasarPausasConSitioLibre(admin);
  } catch (e) {
    capturarExcepcion(e, { tags: { area: 'plazas-fijas' }, extra: { paso: 'pausas-sitio-libre' } });
  }

  const { data, error } = await admin.rpc('materializar_plazas_fijas', { p_horizonte_dias: horizonteDias });
  if (error) throw new Error(error.message);

  // Tras materializar, detecta qué plazas fijas NO se pudieron confirmar esta
  // semana (sesión cancelada / suscripción pausada / sin aforo) y avisa a la
  // socia — antes fallaba en silencio, sin que nadie se enterara. Best-effort:
  // un fallo aquí no debe tumbar el cron que sí generó reservas reales.
  let noMaterializadas = 0;
  try {
    const { data: gaps, error: gapsError } = await admin.rpc('plazas_fijas_sin_materializar', { p_horizonte_dias: Math.min(horizonteDias, HORIZONTE_AVISOS_PLAZA_FIJA_DIAS) });
    if (gapsError) throw new Error(gapsError.message);
    const filas = (gaps as { studio_id: string; socio_id: string; sesion_id: string; motivo: string }[]) ?? [];
    noMaterializadas = filas.length;
    if (filas.length > 0) {
      const { emitirPlazaFijaNoMaterializada } = await import('@/lib/notifications/emit');
      // En paralelo acotado, no en serie: era un `await` por hueco dentro de una
      // función de Vercel con techo de 300 s. Los huecos crecen con el número de
      // estudios × plazas fijas, así que a escala este bucle era lo que agotaba
      // el techo — y al morir a media pasada, las socias del final de la lista
      // no se enteraban de que su plaza fija no había salido.
      await mapLimit(filas, CONCURRENCIA_AVISOS, async (f) => {
        try {
          await emitirPlazaFijaNoMaterializada(admin, {
            studioId: f.studio_id, sesionId: f.sesion_id, socioId: f.socio_id,
            motivo: f.motivo as MotivoPlazaNoMaterializada,
          });
        } catch (e) {
          // `mapLimit` exige que la tarea no lance. Y un aviso que falla no
          // puede llevarse por delante los de las demás socias.
          capturarExcepcion(e, {
            tags: { area: 'plazas-fijas' },
            extra: { studioId: f.studio_id, sesionId: f.sesion_id, socioId: f.socio_id },
          });
        }
      });
    }
  } catch (e) {
    console.error('[materializarPlazasFijas] aviso de huecos:', e instanceof Error ? e.message : e);
  }

  return { creadas: (data as number) ?? 0, noMaterializadas, soltadas };
}


// Cuánto histórico mira el barrido. El cron corre a diario (vercel.json:
// `0 23 * * *`), así que 30 días absorben una caída larguísima del cron sin
// dejar reservas sin marcar. Acotar es necesario: sin cota, la consulta
// re-escanea el histórico de TODA la plataforma cada noche y su coste crece
// para siempre, aunque el trabajo útil sea siempre el del último día.
const VENTANA_NO_SHOWS_DIAS = 30;

/**
 * Una reserva pendiente de barrer, con lo justo para decidir qué hacer con ella.
 *
 * `sesiones` llega como objeto o como array de uno según la versión de
 * supabase-js; se normaliza en `tipoClaseDe` en vez de confiar en una forma.
 */
interface FilaPendienteNoShow {
  id: string;
  studio_id: string;
  sesion_id: string;
  sesiones?: { tipo_clase_id?: string | null } | { tipo_clase_id?: string | null }[] | null;
}

const idSesionDe = (r: FilaPendienteNoShow): string => r.sesion_id;

function tipoClaseDe(r: FilaPendienteNoShow): string | null {
  const s = Array.isArray(r.sesiones) ? r.sesiones[0] : r.sesiones;
  return s?.tipo_clase_id ?? null;
}

/**
 * De las sesiones que aparecen en `pendientes`, cuáles NO pasan lista.
 *
 * Dos consultas acotadas a los ids que ya tenemos delante, no al universo: el
 * conjunto de pendientes ya es pequeño por construcción (solo reservas que
 * siguen CONFIRMADA en clases terminadas), así que esto no reabre el coste que
 * la consulta de arriba se quitó de encima.
 */
async function sesionesSinPasarLista(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  pendientes: FilaPendienteNoShow[],
): Promise<string[]> {
  if (!pendientes.length) return [];

  const studioIds = [...new Set(pendientes.map(r => r.studio_id))];
  const { data: studios } = await admin
    .from('studios').select('id, requiere_checkin_qr').in('id', studioIds);
  const porStudio = new Map(
    ((studios ?? []) as { id: string; requiere_checkin_qr: boolean | null }[])
      .map(s => [s.id, s.requiere_checkin_qr]),
  );

  const tipoIds = [...new Set(pendientes.map(tipoClaseDe).filter((t): t is string => !!t))];
  const { data: tipos } = tipoIds.length
    ? await admin.from('tipos_clase').select('id, requiere_checkin_qr').in('id', tipoIds)
    : { data: [] };
  const porTipo = new Map(
    ((tipos ?? []) as { id: string; requiere_checkin_qr: boolean | null }[])
      .map(t => [t.id, t.requiere_checkin_qr]),
  );

  // La misma decisión que usa `marcarAsistidasAutomaticamente`, importada y no
  // reescrita: dos copias de esta regla divergirían, y la que se quedara vieja
  // fallaría en silencio marcando faltas que no son.
  return sesionesQueSeDanPorAsistidas(
    pendientes.map(r => ({ id: idSesionDe(r), studioId: r.studio_id, tipoClaseId: tipoClaseDe(r) })),
    porStudio,
    porTipo,
  );
}

export async function barrerNoShows(nowISO: string) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  // ⚠️ Esta consulta no lleva `studio_id` (es global, la dispara el cron), así
  // que antes no la cubría ningún índice y, peor, no paginaba NI ordenaba:
  // PostgREST cortaba en 1000 filas en silencio y SIN `ORDER BY` las 1000 que
  // llegaban eran arbitrarias (orden físico, típicamente las más antiguas).
  // O sea: pasadas las 1000 sesiones pasadas, las RECIENTES — las únicas que
  // hay que barrer — eran justo las que se quedaban fuera. Un fallo de
  // corrección nacido de un patrón de rendimiento.
  //
  // Se pide EL TRABAJO, no el universo donde podría haberlo. Antes se listaban
  // TODAS las sesiones terminadas de la ventana (30 días) y se lanzaba un
  // UPDATE por lotes sobre todas, aunque ya se hubieran barrido las noches
  // anteriores: en régimen estacionario eso re-barre 30 veces lo mismo, porque
  // cada día vuelve a incluir los 29 previos. Medido en producción (2026-08-11):
  // **35 sesiones escaneadas para 1 con trabajo real**.
  //
  // Preguntando directamente por las reservas que siguen CONFIRMADA en una clase
  // ya terminada, el conjunto ES el trabajo: se encoge a ~0 en cuanto el barrido
  // va al día, y el coste deja de crecer con la ventana. El conjunto resultante
  // es EL MISMO — verificado en vivo cruzando ambas formulaciones (1 = 1) —, y
  // `sesiones!inner` mantiene los dos filtros que importaban: la clase tiene que
  // haber TERMINADO y no estar cancelada (a nadie se le marca falta en una clase
  // que se canceló).
  const desdeISO = new Date(Date.parse(nowISO) - VENTANA_NO_SHOWS_DIAS * 86_400_000).toISOString();
  const { filas: pendientes, truncado } = await leerCatalogoCompleto<FilaPendienteNoShow>(
    (desde, hasta) => admin
      .from('reservas')
      // `studio_id` y `tipo_clase_id` viajan para poder resolver si en esa clase
      // se pasa lista — ver el reparto justo debajo del bucle de lectura.
      .select('id, studio_id, sesion_id, sesiones!inner(fin, cancelada, tipo_clase_id)')
      .eq('estado', 'CONFIRMADA')
      .eq('sesiones.cancelada', false)
      .lt('sesiones.fin', nowISO)
      .gte('sesiones.fin', desdeISO)
      // Por `id` (único) y no por la fecha: aquí solo hace falta un orden
      // ESTABLE para que la paginación no repita ni salte filas. El orden
      // semántico daba igual, porque se recogen todas antes de tocar nada.
      .order('id', { ascending: true })
      .range(desde, hasta),
  );
  if (truncado) {
    capturarMensaje('barrerNoShows: se alcanzó el tope de paginación, quedan reservas sin barrer', 'warning', {
      tags: { area: 'cron-no-shows' }, extra: { desdeISO, nowISO },
    });
  }

  // ── Las que NO deben marcarse ausentes ──────────────────────────────────
  //
  // Una clase donde no se pasa lista promete lo contrario: toda reserva
  // confirmada se da por asistida. Si `checkin-automatico` (cada 30 min, 2 h de
  // ventana) se saltó una vuelta, esas reservas siguen CONFIRMADA — y este
  // barrido las marcaba NO_ASISTIO, justo lo contrario de lo configurado.
  //
  // No es solo un estado feo: el no-show dispara el trigger de penalización, así
  // que se le cobraba el plantón a alguien que sí fue a clase.
  //
  // Se reparten en dos: las de clases con lista siguen su camino de siempre, y
  // las de clases sin lista se marcan ASISTIDA por el MISMO camino que usa
  // `marcarAsistidasAutomaticamente` (`checkinPublico`, idempotente). Este
  // barrido pasa a ser también su red: el de check-in solo mira 2 h atrás, así
  // que una caída más larga dejaba esas reservas atascadas para siempre.
  const sinLista = new Set(await sesionesSinPasarLista(admin, pendientes));
  const paraAsistir = pendientes.filter(r => sinLista.has(idSesionDe(r)));
  const ids = pendientes.filter(r => !sinLista.has(idSesionDe(r))).map(r => r.id);

  let asistidasDeRescate = 0;
  for (const r of paraAsistir) {
    const res = await checkinPublico({ studioId: r.studio_id, reservaId: r.id });
    if ('ok' in res) asistidasDeRescate++;
  }

  let marcadas = 0;
  // Actualiza por lotes para no exceder límites de longitud del filtro `in`.
  for (let i = 0; i < ids.length; i += 200) {
    const lote = ids.slice(i, i + 200);
    const { data: upd, error: updErr } = await admin
      .from('reservas')
      .update({ estado: 'NO_ASISTIO' })
      .in('id', lote)
      // Se mantiene el filtro por estado aunque ya se filtró al leer: entre la
      // lectura y este UPDATE alguien puede haber cancelado o marcado asistencia
      // desde el panel, y no queremos pisar ese cambio con una falta.
      .eq('estado', 'CONFIRMADA')
      .select('id');
    if (updErr) throw new Error(updErr.message);
    marcadas += (upd ?? []).length;
  }
  return { reservasPendientes: ids.length, reservasMarcadas: marcadas, asistidasDeRescate, truncado };
}

// ─────────────────────────────────────────────────────────────────────────────
// Cierre de las esperas PAGADAS que ya no pueden resolverse.
//
// Gemelo de `barrerNoShows` (misma ventana, mismo cron diario, misma forma:
// reservas atascadas en un estado transitorio de una clase ya terminada), por
// eso vive aquí y no en un cron nuevo — Inngest está al ~84 % del plan free y
// esto no justifica ni una invocación más.
//
// Solo mira reservas `res-web-…`: las que nacieron de un pago del widget sin
// cuenta (`reservarPlazaTrasPagoPublico`). Una socia con bono que se apunta a
// la cola por gusto no pagó por ESA clase, así que contarle que «su crédito
// sigue vivo» sería inventarse un problema.
//
// Idempotente sin columna nueva: el propio paso a CANCELADA saca la fila del
// conjunto, así que la migración que haría falta para marcarla como «ya
// avisada» no hace falta. Y el aviso solo se manda si el UPDATE tocó la fila
// de verdad (compare-and-set contra LISTA_ESPERA), nunca antes.
//
// No devuelve ningún bono a propósito: una reserva en LISTA_ESPERA nunca
// consumió uno (solo `CONFIRMADA` llama a `consumirBonoServidor`). Devolver
// aquí regalaría una sesión que nadie descontó — el mismo error que el guard de
// plazas fijas de `ejecutarCancelacionReserva` ya evita.
export async function barrerEsperasSinPlaza(nowISO: string) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  const desdeISO = new Date(Date.parse(nowISO) - VENTANA_NO_SHOWS_DIAS * 86_400_000).toISOString();
  const { filas, truncado } = await leerCatalogoCompleto<{ id: string; studio_id: string; socio_id: string; sesion_id: string }>(
    (desde, hasta) => admin
      .from('reservas')
      .select('id, studio_id, socio_id, sesion_id, sesiones!inner(fin, cancelada)')
      .eq('estado', 'LISTA_ESPERA')
      .like('id', `${PREFIJO_RESERVA_WEB}%`)
      .eq('sesiones.cancelada', false)
      .lt('sesiones.fin', nowISO)
      .gte('sesiones.fin', desdeISO)
      // Orden ESTABLE para que la paginación no repita ni salte filas (mismo
      // criterio que barrerNoShows: el orden semántico da igual).
      .order('id', { ascending: true })
      .range(desde, hasta),
  );
  if (truncado) {
    capturarMensaje('barrerEsperasSinPlaza: se alcanzó el tope de paginación, quedan esperas sin cerrar', 'warning', {
      tags: { area: 'cron-no-shows' }, extra: { desdeISO, nowISO },
    });
  }

  let cerradas = 0;
  let avisadas = 0;
  for (const fila of filas) {
    // Compare-and-set: entre la lectura y aquí, mostrador puede haberla
    // promocionado o cancelado a mano. Si no devuelve fila, no se avisa.
    const { data: upd, error: updErr } = await admin
      .from('reservas')
      // `posicion_espera`/`oferta_expira_en` se limpian igual que hacen
      // dbCancelarReservasPorSesiones y expirar_oferta_lista_espera. Es inerte
      // (todo lo que las mira filtra por estado LISTA_ESPERA), pero dejar la
      // fila coherente cuesta dos claves.
      .update({ estado: 'CANCELADA', posicion_espera: null, oferta_expira_en: null })
      .eq('id', fila.id)
      .eq('estado', 'LISTA_ESPERA')
      .select('id');
    if (updErr) { reportDbError('[barrerEsperasSinPlaza]', updErr); continue; }
    if (!upd?.length) continue;
    cerradas++;
    if (await avisarEsperaSinPlaza(admin, fila)) avisadas++;
  }
  return { esperasPendientes: filas.length, esperasCerradas: cerradas, sociasAvisadas: avisadas, truncado };
}

// El aviso en sí. Best-effort a propósito: la reserva YA está cerrada cuando se
// llega aquí, y un fallo de Resend no debe dejar el barrido a medias ni hacer
// que se reintente el cierre. Devuelve si se avisó a la socia.
async function avisarEsperaSinPlaza(
  admin: SupabaseClient, fila: { id: string; studio_id: string; socio_id: string; sesion_id: string },
): Promise<boolean> {
  try {
    const suscripcionId = suscripcionDeReservaWeb(fila.id);
    if (!suscripcionId) return false;

    const { data: sus } = await admin
      .from('suscripciones')
      .select('estado, sesiones_restantes, fecha_fin, planes_tarifa(tipo)')
      // Por estudio Y por socia: el email lleva su saldo y su caducidad. Cruzar
      // de persona exigiría una colisión de la base de 24 caracteres de
      // `idsDe()` (que chocaría antes por la PK de `reservas`), así que no es
      // una fuga real — pero la línea convierte "improbable" en "imposible".
      .eq('id', suscripcionId).eq('studio_id', fila.studio_id).eq('socio_id', fila.socio_id)
      .maybeSingle();
    const plan = sus?.planes_tarifa as { tipo?: string } | { tipo?: string }[] | null | undefined;
    const tipoPlan = (Array.isArray(plan) ? plan[0]?.tipo : plan?.tipo) ?? null;

    const cierre = decidirCierreDeEspera({
      tipoPlan,
      sesionesRestantes: (sus?.sesiones_restantes as number | null) ?? null,
      estadoSuscripcion: (sus?.estado as string | null) ?? null,
    });
    if (!cierre.avisarSocia) return false;

    // Al mostrador PRIMERO: es quien puede actuar hoy, y su aviso no depende de
    // que Resend esté configurado.
    if (cierre.avisarEstudio) {
      const { emitirReservaPagadaSinPlaza } = await import('@/lib/notifications/emit');
      await emitirReservaPagadaSinPlaza(admin, {
        studioId: fila.studio_id, sesionId: fila.sesion_id, socioId: fila.socio_id, situacion: 'cerrada',
      });
    }

    const [{ data: socia }, { data: studio }, datos] = await Promise.all([
      admin.from('socios').select('nombre, email').eq('id', fila.socio_id).eq('studio_id', fila.studio_id).maybeSingle(),
      admin.from('studios').select('slug, email').eq('id', fila.studio_id).maybeSingle(),
      datosClaseParaEmail(admin, fila.studio_id, fila.sesion_id),
    ]);
    if (!socia?.email || !datos) return false;

    const base = process.env.NEXT_PUBLIC_APP_URL || LEGAL.url;
    const slug = (studio?.slug as string | null) ?? '';
    const r = await enviarEmailTransaccional({
      tipo: 'espera-sin-plaza',
      to: socia.email as string,
      toName: (socia.nombre as string | null) ?? 'Socia',
      data: {
        ...datos,
        sesionesRestantes: cierre.sesionesRestantes,
        // `fecha_fin` es un DATE ('2026-09-30'). Se lee al mediodía UTC para que
        // no se corra un día al pasarlo a hora de España — mismo idiom que el
        // cron de bonos por caducar.
        caducaEl: sus?.fecha_fin ? fechaLargaEstudio(new Date(`${sus.fecha_fin as string}T12:00:00Z`)) : null,
        urlHorario: slug ? `${base}/reservar/${slug}` : null,
        emailEstudio: (studio?.email as string | null) ?? null,
      },
      studioId: fila.studio_id,
      // Determinista: una espera se cierra UNA vez, y si el cron se repitiera
      // tras un despliegue a medias Resend no reenvía en 24 h.
      idempotencyKey: `espera-sin-plaza-${fila.id}`,
    });
    return r.ok === true;
  } catch (e) {
    capturarMensaje('barrerEsperasSinPlaza: la espera se cerró pero el aviso falló', 'warning', {
      tags: { area: 'cron-no-shows' },
      extra: { reservaId: fila.id, studioId: fila.studio_id, detalle: e instanceof Error ? e.message : String(e) },
    });
    return false;
  }
}

// Lee la política de reservas/cancelaciones del estudio (con defaults sensatos
// si las columnas aún no existen o vienen nulas).

async function cargarPoliticaEstudio(admin: SupabaseClient, studioId: string) {
  const { data } = await admin
    .from('studios')
    .select('cancelacion_ventana_horas, cancelacion_devolver_bono_tardia, reserva_exigir_plan, reserva_max_simultaneas, reserva_ventana_minima_minutos, reserva_antelacion_maxima_dias, permite_lista_espera, requiere_aprobacion')
    .eq('id', studioId).maybeSingle();
  return {
    ventanaHoras: (data?.cancelacion_ventana_horas ?? 12) as number,
    devolverBonoTardia: (data?.cancelacion_devolver_bono_tardia ?? false) as boolean,
    exigirPlan: (data?.reserva_exigir_plan ?? true) as boolean,
    maxSimultaneas: (data?.reserva_max_simultaneas ?? null) as number | null,
    ventanaMinimaMinutos: (data?.reserva_ventana_minima_minutos ?? 0) as number,
    antelacionMaximaDias: (data?.reserva_antelacion_maxima_dias ?? null) as number | null,
    permiteListaEspera: (data?.permite_lista_espera ?? true) as boolean,
    requiereAprobacion: (data?.requiere_aprobacion ?? false) as boolean,
  };
}

// Fase 1 de reglas por tipo de clase (migr 20260730152516): mismo patrón que
// resolverVentanaCancelacion — NULL en tipos_clase = hereda el default del
// estudio. Una sola query trae las 4 columnas de override a la vez.
async function cargarReglasReservaTipoClase(
  admin: SupabaseClient, studioId: string, tipoClaseId: string | null | undefined,
) {
  const vacio = {
    exigirPlan: null as boolean | null,
    ventanaMinimaMinutos: null as number | null,
    antelacionMaximaDias: null as number | null,
    permiteListaEspera: null as boolean | null,
    requiereAprobacion: null as boolean | null,
  };
  if (!tipoClaseId) return vacio;
  const { data } = await admin
    .from('tipos_clase')
    .select('reserva_exigir_plan, reserva_ventana_minima_minutos, reserva_antelacion_maxima_dias, permite_lista_espera, requiere_aprobacion')
    .eq('id', tipoClaseId).eq('studio_id', studioId).maybeSingle();
  if (!data) return vacio;
  return {
    exigirPlan: data.reserva_exigir_plan as boolean | null,
    ventanaMinimaMinutos: data.reserva_ventana_minima_minutos as number | null,
    antelacionMaximaDias: data.reserva_antelacion_maxima_dias as number | null,
    permiteListaEspera: data.permite_lista_espera as boolean | null,
    requiereAprobacion: data.requiere_aprobacion as boolean | null,
  };
}

// P2-8: la ventana de cancelación puede acotarse por tipo de clase (reformer
// necesita más antelación que mat para recolocar la plaza). NULL en
// tipos_clase.ventana_cancelacion_horas = hereda la del estudio — es el
// comportamiento de siempre para todo tipo de clase sin override.

async function resolverVentanaCancelacion(
  admin: SupabaseClient, studioId: string, tipoClaseId: string | null | undefined, ventanaEstudio: number,
): Promise<number> {
  if (!tipoClaseId) return ventanaEstudio;
  const { data } = await admin
    .from('tipos_clase').select('ventana_cancelacion_horas')
    .eq('id', tipoClaseId).eq('studio_id', studioId).maybeSingle();
  const override = data?.ventana_cancelacion_horas as number | null | undefined;
  return override ?? ventanaEstudio;
}

// Fila 14 del informe estratégico: "es la alumna que quería pagar y no
// pudo" — captura el intento self-service que el servidor rechazó de
// verdad (nunca lista de espera, que sí se persiste como reserva propia).
// Fire-and-forget: un fallo AL REGISTRAR el intento nunca debe tapar ni
// retrasar el mensaje de error real que ya se le va a devolver a la socia.
type MotivoIntentoFallido =
  | 'AFORO_LLENO_SIN_ESPERA' | 'SIN_PLAN' | 'PLAN_NO_INCLUYE_TIPO'
  | 'FUERA_VENTANA_MINIMA' | 'FUERA_VENTANA_MAXIMA'
  | 'LIMITE_SEMANAL' | 'MAX_SIMULTANEAS'
  // El CHECK de la columna lo amplía 20260903150000: sin eso, esta fila se
  // pierde en silencio (el insert va sin `await` a propósito).
  | 'CONFLICTO_HORARIO' | 'NECESITA_AUTORIZACION'
  // Igual: el CHECK lo amplía 20260905151515.
  | 'RESERVA_BLOQUEADA_IMPAGO'
  // Y otra vez: 20260907031432. Se distingue de LIMITE_SEMANAL a propósito —
  // «quiere más Máquina de la que su cuota le da» es una señal de venta.
  | 'LIMITE_SEMANAL_ACTIVIDAD'
  // RES-4: Verificación de entitlement dentro del lock. Si la socia no tiene
  // plan/bono activo, se registra como SIN_ENTITLEMENT aquí, siendo la
  // verificación ahora atómica en la RPC dentro de pg_advisory_xact_lock.
  | 'SIN_ENTITLEMENT';

function registrarIntentoFallido(admin: SupabaseClient, params: {
  studioId: string; socioId: string; sesionId?: string | null; tipoClaseId?: string | null; motivo: MotivoIntentoFallido;
}): void {
  void admin.from('intentos_reserva_fallidos').insert({
    id: `irf-${uid()}`,
    studio_id: params.studioId,
    socio_id: params.socioId,
    sesion_id: params.sesionId ?? null,
    tipo_clase_id: params.tipoClaseId ?? null,
    motivo: params.motivo,
  }).then(({ error }) => {
    if (error) capturarExcepcion(new Error(`registrarIntentoFallido: ${error.message}`), { tags: { area: 'reservas' } });
  });
}

// Fase 2 "Growth Widget": evento anónimo del funnel del widget público
// (ver lib/reservar/eventos.ts para el catálogo de tipos y el helper de
// cliente). Mismo criterio fire-and-forget que registrarIntentoFallido —
// un fallo AQUÍ nunca debe tumbar ni ensuciar la respuesta del endpoint
// público que lo llama.
export function registrarEventoWidget(admin: SupabaseClient, params: {
  studioId: string; sessionId: string; tipo: string; sesionClaseId?: string | null; origen?: string | null;
  // Fase 8 (CRO): solo relevante en los eventos donde la visitante ya está
  // identificada — ver el comentario de la columna en la migración.
  socioId?: string | null;
  // C-4 (auditoría 29-ago): `socioId` sigue sin JWT para no perder atribución
  // de analítica de un socioId ajeno mandado a mano — solo dispara el email de
  // abandono si esto viene relleno, que la ruta solo rellena tras verificar
  // el JWT contra `socioId`. Nunca se deriva de `socioId` aquí.
  socioIdVerificado?: string | null;
}): void {
  void admin.from('widget_eventos').insert({
    id: `evt-${uid()}`,
    studio_id: params.studioId,
    session_id: params.sessionId,
    tipo: params.tipo,
    sesion_clase_id: params.sesionClaseId ?? null,
    origen: params.origen ?? null,
    socio_id: params.socioId ?? null,
  }).then(({ error }) => {
    // FK inválida (studio_id/sesion_id/socio_id inexistentes desde un
    // cliente con datos corruptos) no es un fallo del sistema — no genera
    // ruido en Sentry. Un `fetch failed` (blip de red Node→Supabase, sin
    // código de Postgres) tampoco: es la versión servidor del mismo ruido que
    // `esErrorDeRedCliente` ya filtra en el cliente (JAVASCRIPT-NEXTJS-1Q, un
    // solo evento aislado, nunca recurrió).
    if (error && error.code !== '23503' && !/fetch failed/i.test(error.message)) {
      capturarExcepcion(new Error(`registrarEventoWidget: ${error.message}`), { tags: { area: 'analitica-widget' } });
    }
  });

  // Fase 8 (CRO): recuperación de un abandono conocido — inline, sin cron
  // (docs/cro-analytics-widget-diseno.md §5.2). C-4 (auditoría 29-ago): el
  // email solo se dispara con `socioIdVerificado` (JWT comprobado en la
  // ruta) — antes bastaba un `socioId` ajeno en el body, sin sesión, para
  // hacer sonar el correo de cualquier socia de la que se conociera el id.
  if (params.tipo === 'booking_abandoned' && params.socioIdVerificado) {
    void import('@/lib/notifications/emit').then(({ emitirReservaAbandonada }) =>
      emitirReservaAbandonada(admin, {
        studioId: params.studioId, socioId: params.socioIdVerificado!, sesionId: params.sesionClaseId ?? null,
      }),
    ).catch(() => {});
  }
}

// Crea una reserva respetando aforo/lista de espera (booking-logic) y consume
// bono si queda CONFIRMADA. Valida identidad de la socia y el derecho a reservar
// (C-4: plan/bono activo y tope de reservas simultáneas, si el estudio lo exige).

export async function crearReservaPublica(params: {
  studioId: string; sesionId: string; socioId: string; authUserId: string | null; spotId?: string | null;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const socia = await validarSociaPublica(admin, params.studioId, params.socioId, params.authUserId);
  if (!socia) return { error: 'No autorizado' as const, codigo: 'no-autorizado' as const };

  // No se puede reservar una clase ya empezada/pasada (I-17). La UI lo bloquea,
  // pero la API también debe: evita datos basura y gamificación explotable.
  //
  // ⚠️ Los rechazos de este bloque llevan `codigo`, igual que los del gate de
  // derechos de abajo y los que traduce la RPC. Se quedaron sin él cuando se
  // arregló la cadena rota del 4-sep —que solo tocó `sin-plan`,
  // `bono-no-cubre` y `max-simultaneas`— así que para la alumna seguían siendo
  // el mismo bug: sin `codigo`, el switch de `lib/student/reserva-codigos.ts`
  // cae en el `default`, la pantalla pinta el copy genérico de avería con un
  // botón de reintentar que no puede funcionar (una clase que ya empezó no va
  // a dejar de haber empezado), y `lib/student/reservar.ts` reporta a Sentry
  // una regla de negocio como si fuera producción rota.
  // Visto en producción: JAVASCRIPT-NEXTJS-26, «Esta clase ya ha empezado»,
  // una socia real en Bilbao el 4-sep-2026.
  let tipoClaseId: string | null | undefined;
  let inicioISO: string;
  {
    const { data: ses } = await admin
      .from('sesiones').select('inicio, cancelada, tipo_clase_id')
      .eq('id', params.sesionId).eq('studio_id', params.studioId).maybeSingle();
    if (!ses) return { error: 'Sesión no encontrada' as const, codigo: 'sesion-no-encontrada' as const };
    if (ses.cancelada) return { error: 'Esta clase está cancelada' as const, codigo: 'clase-cancelada' as const };
    if (new Date(ses.inicio as string).getTime() <= Date.now()) {
      return { error: MENSAJE_CLASE_YA_EMPEZADA, codigo: 'clase-ya-empezada' as const };
    }
    tipoClaseId = ses.tipo_clase_id as string | null | undefined;
    inicioISO = ses.inicio as string;
  }

  // Gate de derechos (C-4): autoritativo en servidor. Solo aplica a la reserva
  // self-service; el panel (recepción) puede añadir a cualquiera sin plan.
  const pol = await cargarPoliticaEstudio(admin, params.studioId);
  // Fase 1 de reglas por tipo de clase: cada regla puede sobrescribirse en
  // tipos_clase (NULL = hereda el default del estudio, resuelto con heredaOverride).
  const reglasTipo = await cargarReglasReservaTipoClase(admin, params.studioId, tipoClaseId);
  const exigirPlanResuelto = heredaOverride(reglasTipo.exigirPlan, pol.exigirPlan);
  const permiteListaEsperaResuelto = heredaOverride(reglasTipo.permiteListaEspera, pol.permiteListaEspera);
  // Fase 2a: si se exige aprobación, la RPC salta directo a PENDIENTE_APROBACION
  // sin comprobar aforo — el gate de plan/bono de más abajo sigue aplicando
  // igual (no tiene sentido pedir aprobación a quien ni siquiera tiene derecho
  // a reservar esta clase).
  const requiereAprobacionResuelto = heredaOverride(reglasTipo.requiereAprobacion, pol.requiereAprobacion);

  {
    const ventanaMinima = heredaOverride(reglasTipo.ventanaMinimaMinutos, pol.ventanaMinimaMinutos);
    if (!puedeReservarPorVentanaMinima(inicioISO, new Date(), ventanaMinima)) {
      registrarIntentoFallido(admin, { studioId: params.studioId, socioId: params.socioId, sesionId: params.sesionId, tipoClaseId, motivo: 'FUERA_VENTANA_MINIMA' });
      return { error: 'Ya no se puede reservar esta clase: hace falta reservar con más antelación' as const, codigo: 'fuera-ventana-minima' as const };
    }
    const antelacionMaxima = heredaOverride(reglasTipo.antelacionMaximaDias, pol.antelacionMaximaDias);
    if (!puedeReservarPorAntelacionMaxima(inicioISO, new Date(), antelacionMaxima)) {
      registrarIntentoFallido(admin, { studioId: params.studioId, socioId: params.socioId, sesionId: params.sesionId, tipoClaseId, motivo: 'FUERA_VENTANA_MAXIMA' });
      return { error: 'Todavía no se puede reservar esta clase' as const, codigo: 'fuera-ventana-maxima' as const };
    }
  }

  // Apertura suave (Opening OS): antes del día de apertura, solo fundadoras e
  // invitadas. Regla por fecha: el día oficial deja de aplicar sola. El mostrador
  // (crearReservaMostrador) no pasa por aquí, así que puede apuntar a quien sea.
  // Sin registrarIntentoFallido: no es demanda perdida, es una puerta que el
  // estudio ha cerrado a propósito (y el CHECK de `motivo` no lo contempla).
  {
    const fechaApertura = await cierreAperturaSuave(admin, params.studioId, params.socioId, inicioISO);
    if (fechaApertura) return { error: MENSAJE_APERTURA_SUAVE(fechaApertura), codigo: 'apertura-suave' as const };
  }

  // RES-4: El tipo de la clase se necesita para pasar a la RPC (dentro o fuera del
  // gate de plan). Se define aquí para que esté disponible en ambos casos.
  const tipoDeLaClase = tipoClaseId;

  // Lo que se le pide a la RPC. `false` salvo que se exija plan Y haya algo que
  // comprar (`exigePlanAlReservar`). Si no se exige plan, ni se leen las tarifas.
  let exigirPlanEnRpc = false;
  if (exigirPlanResuelto || pol.maxSimultaneas != null) {
    const [{ data: susRows }, { data: planRows, error: errorPlanes }, { data: resRows }, { data: sesRows }] = await Promise.all([
      admin.from('suscripciones').select('*').eq('studio_id', params.studioId).eq('socio_id', params.socioId),
      admin.from('planes_tarifa').select('*').eq('studio_id', params.studioId),
      admin.from('reservas').select('*').eq('studio_id', params.studioId).eq('socio_id', params.socioId),
      // Solo futuras: contarReservasActivasFuturas() de abajo solo mira sesiones
      // por venir. Sin este filtro, select('*') sin paginar traía TODO el
      // histórico del estudio y PostgREST lo cortaba en 1000 filas — un estudio
      // con meses de uso podía perder sesiones futuras del corte y contar mal
      // el máximo de reservas simultáneas.
      // `cancelada` hace falta: contarReservasActivasFuturas descuenta las
      // clases canceladas, y sin la columna no podría distinguirlas.
      admin.from('sesiones').select('id, inicio, cancelada').eq('studio_id', params.studioId).gte('inicio', new Date().toISOString()),
    ]);
    // RES-4: El gate de entitlement se ha movido DENTRO de la RPC (dentro del
    // lock transaccional). La RPC devuelve SIN_ENTITLEMENT si falla la
    // comprobación DENTRO del lock.
    //
    // El descuento del bono va dentro de `reservar_plaza`, bajo el mismo candado
    // que confirma la plaza — ver D-1 (`resolverBonoParaSesion`, `p_suscripcion_id`).
    //
    // Sin embargo, mantenemos una comprobación de TypeScript para devolver
    // `codigo: 'bono-no-cubre'` vs `codigo: 'sin-plan'`, ya que el test
    // estructural lo espera (cadena-rechazo-reserva.test.ts).
    // Esta comprobación es defensiva; la RPC es la autoridad real.
    const planesGate = await hidratarTiposDePlanes(admin as never, params.studioId, (planRows ?? []).map(mapPlanTarifa));
    const exigirPlan = exigePlanAlReservar(exigirPlanResuelto, planesGate);
    // Si las tarifas no se han podido leer, «no hay nada a la venta» sería una
    // suposición: la RPC recibe el ajuste tal cual y decide ella, como siempre.
    // Cerrado, no abierto.
    exigirPlanEnRpc = errorPlanes ? exigirPlanResuelto : exigirPlan;
    if (exigirPlan && !tieneEntitlementActivo(
      params.socioId, (susRows ?? []).map(mapSuscripcion), planesGate, new Date().toISOString().slice(0, 10), tipoDeLaClase,
    )) {
      const tieneAlgunPlan = tieneEntitlementActivo(
        params.socioId, (susRows ?? []).map(mapSuscripcion), planesGate, new Date().toISOString().slice(0, 10),
      );
      registrarIntentoFallido(admin, { studioId: params.studioId, socioId: params.socioId, sesionId: params.sesionId, tipoClaseId, motivo: tieneAlgunPlan ? 'PLAN_NO_INCLUYE_TIPO' : 'SIN_PLAN' });
      return tieneAlgunPlan
        ? { error: ERROR_BONO_NO_CUBRE, codigo: 'bono-no-cubre' as const }
        : { error: ERROR_SIN_PLAN, codigo: 'sin-plan' as const };
    }
    if (pol.maxSimultaneas != null) {
      const activas = contarReservasActivasFuturas(
        params.socioId,
        (resRows ?? []).map(mapReserva),
        // `cancelada` DEBE propagarse: si se queda fuera del map llega como
        // undefined y el filtro de clases canceladas de
        // contarReservasActivasFuturas es inerte (el campo es opcional, así
        // que TypeScript no avisa). Este es el camino del widget público.
        (sesRows ?? []).map(r => ({
          id: r.id as string, inicio: r.inicio as string,
          cancelada: (r.cancelada as boolean | null) ?? false,
        })),
        new Date(),
      );
      if (activas >= pol.maxSimultaneas) {
        registrarIntentoFallido(admin, { studioId: params.studioId, socioId: params.socioId, sesionId: params.sesionId, tipoClaseId, motivo: 'MAX_SIMULTANEAS' });
        return { error: `Has alcanzado el máximo de ${pol.maxSimultaneas} reservas activas` as const, codigo: 'max-simultaneas' as const };
      }
    }
  }

  // Aforo transaccional: la decisión (CONFIRMADA vs LISTA_ESPERA) y la inserción
  // ocurren atómicamente en la BD (SELECT ... FOR UPDATE en la sesión), no en
  // JS — evita la sobreventa por reservas concurrentes de la última plaza.
  // p_permite_lista_espera: si la clase está llena y el tipo/estudio no admite
  // lista de espera, la RPC rechaza en vez de insertar en LISTA_ESPERA.
  const reservaId = `res-${uid()}`;
  // D-1: el bono candidato se elige AQUÍ, antes de llamar a la RPC, para que
  // `reservar_plaza` lo descuente DENTRO del mismo candado por socio que
  // confirma la plaza — ver `resolverBonoParaSesion`.
  const consumibleBono = await resolverBonoParaSesion(admin, {
    studioId: params.studioId, socioId: params.socioId, sesionId: params.sesionId,
  });
  const { data, error } = await admin.rpc('reservar_plaza', {
    p_studio_id: params.studioId, p_sesion_id: params.sesionId,
    p_socio_id: params.socioId, p_reserva_id: reservaId,
    p_permite_lista_espera: permiteListaEsperaResuelto,
    p_requiere_aprobacion: requiereAprobacionResuelto,
    // ⚠️ El sitio va DENTRO de la transacción, no después.
    //
    // Esta llamada mandaba 6 argumentos y el sitio se asignaba luego con un
    // read-then-update (`asignarSpotReserva`), que no es atómico: dos socias
    // podían quedarse con el mismo reformer. Peor: al mandar 6 argumentos,
    // PostgREST resolvía a una SOBRECAMA de `reservar_plaza` de 6 parámetros
    // que había quedado viva desde 20260827193314 — o sea que este camino, el
    // de la propia alumna, entraba por una función distinta a la del camino de
    // pago. La migración 20260903150000 borra esa sobrecarga y deja una sola
    // puerta; mandar `p_spot_id` es lo que garantiza que se entra por ella.
    //
    // La RPC ya sabía hacerlo: bloquea la fila del spot `for update`, valida
    // sala y `activo`, y comprueba ocupación antes de decidir el estado.
    p_spot_id: params.spotId ?? null,
    // ⚠️ NO añadas `p_tipo_clase_id` aquí (auditoría 2026-09-19).
    //
    // La función VIVA en producción tiene 9 parámetros y termina en
    // `p_exigir_entitlement`: deriva el tipo de clase de la propia sesión
    // (`select ... tipo_clase_id from sesiones ... for update`), que es más
    // seguro que recibirlo del llamante porque no se puede falsear. La
    // migración 20260918000000 del repo declara una variante de 10 parámetros
    // con `p_tipo_clase_id` que NUNCA llegó a aplicarse así; mandar ese
    // argumento hacía que PostgREST no encontrase ninguna función
    // (PGRST202) y tumbaba TODAS las reservas de la alumna.
    //
    // `p_exigir_entitlement` es además lo que desambigua la llamada: queda
    // viva una sobrecarga de 8 parámetros y cualquier llamada que no nombre
    // este argumento resuelve a las dos (SQLSTATE 42725, «is not unique»).
    // Nunca `exigirPlanResuelto` a secas: ver `exigePlanAlReservar`.
    p_exigir_entitlement: exigirPlanEnRpc,
    // D-1: el bono elegido arriba, para que la RPC lo descuente DENTRO del
    // mismo candado que confirma la plaza (ver `resolverBonoParaSesion`).
    p_suscripcion_id: consumibleBono?.suscripcion.id ?? null,
  });
  if (error) {
    // ⚠️ El `codigo` es lo que consume el cliente; el `error` es solo para
    // enseñar. Antes solo viajaba la frase en castellano, así que la app tenía
    // que comparar cadenas traducibles para saber qué había pasado — y
    // cualquier retoque de copy rompía la máquina de estados de la reserva.
    // El código sale del nombre que lanza la RPC y no se traduce nunca.
    if (error.message.includes('YA_RESERVADA')) return { error: 'Ya tienes una reserva en esta clase' as const, codigo: 'ya-reservada' as const };
    if (error.message.includes('SESION_NO_ENCONTRADA')) return { error: 'Sesión no encontrada' as const, codigo: 'sesion-no-encontrada' as const };
    if (error.message.includes('CONFLICTO_HORARIO')) {
      registrarIntentoFallido(admin, { studioId: params.studioId, socioId: params.socioId, sesionId: params.sesionId, tipoClaseId, motivo: 'CONFLICTO_HORARIO' });
      return { error: 'Ya tienes otra clase a esa hora' as const, codigo: 'conflicto-horario' as const };
    }
    if (error.message.includes('SPOT_OCUPADO')) return { error: 'Ese sitio lo acaba de coger otra persona' as const, codigo: 'spot-ocupado' as const };
    if (error.message.includes('SPOT_NO_DISPONIBLE')) return { error: 'Ese sitio no está disponible' as const, codigo: 'spot-no-disponible' as const };
    if (error.message.includes('SPOT_NO_PERTENECE_A_LA_SALA')) return { error: 'Ese sitio no es de esta sala' as const, codigo: 'spot-no-disponible' as const };
    // ⚠️ El de ACTIVIDAD va PRIMERO y con `esCodigoReserva`, no con `includes`:
    // `LIMITE_SEMANAL_ACTIVIDAD` contiene `LIMITE_SEMANAL`, así que un
    // `includes` en el orden de siempre le pondría el mensaje del techo general
    // —«has llegado a tu tope»— a alguien a quien todavía le quedan clases de
    // la otra actividad de su cuota.
    if (esCodigoReserva(error.message, 'LIMITE_SEMANAL_ACTIVIDAD')) {
      registrarIntentoFallido(admin, { studioId: params.studioId, socioId: params.socioId, sesionId: params.sesionId, tipoClaseId, motivo: 'LIMITE_SEMANAL_ACTIVIDAD' });
      return { error: 'Ya has hecho todas las clases de esta actividad que incluye tu cuota esta semana' as const, codigo: 'limite-semanal-actividad' as const };
    }
    if (esCodigoReserva(error.message, 'LIMITE_SEMANAL')) {
      registrarIntentoFallido(admin, { studioId: params.studioId, socioId: params.socioId, sesionId: params.sesionId, tipoClaseId, motivo: 'LIMITE_SEMANAL' });
      return { error: 'Has alcanzado el máximo de clases por semana de tu plan' as const, codigo: 'limite-semanal' as const };
    }
    if (error.message.includes('RESERVA_BLOQUEADA_IMPAGO')) {
      registrarIntentoFallido(admin, { studioId: params.studioId, socioId: params.socioId, sesionId: params.sesionId, tipoClaseId, motivo: 'RESERVA_BLOQUEADA_IMPAGO' });
      // Mismo criterio que el mensaje de autorización de al lado: no se la
      // juzga ni se le detalla la deuda en una pantalla pública. Se le dice a
      // quién preguntar.
      return { error: 'Tienes un pago pendiente con el estudio. Escríbeles y lo resolvéis.' as const, codigo: 'impago' as const };
    }
    // RES-4: Verificación de entitlement ahora DENTRO del lock (migración
    // 20260918000000). Si la socia no tiene plan/bono activo que cubra esta
    // clase, la RPC lo detecta atomicamente y devuelve SIN_ENTITLEMENT.
    if (error.message.includes('SIN_ENTITLEMENT')) {
      registrarIntentoFallido(admin, { studioId: params.studioId, socioId: params.socioId, sesionId: params.sesionId, tipoClaseId, motivo: 'SIN_ENTITLEMENT' });
      return { error: ERROR_SIN_PLAN, codigo: 'sin-plan' as const };
    }
    if (error.message.includes('NECESITA_AUTORIZACION')) {
      registrarIntentoFallido(admin, { studioId: params.studioId, socioId: params.socioId, sesionId: params.sesionId, tipoClaseId, motivo: 'NECESITA_AUTORIZACION' });
      // El mensaje no dice «no tienes nivel»: quien lo lee es la alumna, y el
      // estudio decide cómo se lo cuenta en persona. Aquí solo se le dice que
      // hable con el estudio, no se la juzga.
      return { error: 'Esta clase necesita que el estudio te dé acceso. Escríbeles y te la abren.' as const, codigo: 'necesita-autorizacion' as const };
    }
    if (error.message.includes('AFORO_LLENO_SIN_ESPERA')) {
      registrarIntentoFallido(admin, { studioId: params.studioId, socioId: params.socioId, sesionId: params.sesionId, tipoClaseId, motivo: 'AFORO_LLENO_SIN_ESPERA' });
      return { error: 'Esta clase está completa' as const, codigo: 'aforo-lleno' as const };
    }
    // ⚠️ Los dos últimos cierran la escalera contra los 12 `raise exception` de
    // la RPC. `ESTUDIO_CERRADO` (migr 20260905153105) llegó con el cierre del
    // centro y se quedó fuera: es alcanzable de verdad —`lib/cierres/
    // aplicar-cierre.ts` dice explícitamente que la guardia vive en la RPC
    // «para una sesión creada DESPUÉS de declarar el cierre», y esas sesiones
    // no están `cancelada`, así que ninguna de las comprobaciones de arriba
    // las para— y sin traducir caía en el `codigo: 'error'` de abajo: copy
    // genérico de avería para la alumna y un evento de Sentry por intento.
    if (error.message.includes('ESTUDIO_CERRADO')) {
      return { error: 'El estudio está cerrado ese día' as const, codigo: 'estudio-cerrado' as const };
    }
    if (error.message.includes('NO_AUTORIZADO')) {
      return { error: 'No autorizado' as const, codigo: 'no-autorizado' as const };
    }
    return { error: error.message, codigo: 'error' as const };
  }
  const row = Array.isArray(data) ? data[0] : data;
  const estado: string = row?.estado ?? 'CONFIRMADA';

  // ⚠️ ¿Se ha gastado una recuperación? La RPC la consume EN SILENCIO al topar
  // el límite semanal y no lo dice en su retorno, así que la alumna pasaba de 2
  // a 1 sin que nada se lo contara — ni antes ni después de reservar. Y es
  // asimétrico: GANAR una sí se le cuenta («tienes una clase para recuperar
  // hasta el …»), gastarla no.
  //
  // Se lee del enlace que la propia RPC deja (`usada_en_reserva_id`), en vez de
  // cambiar su tipo de retorno: `RETURNS TABLE` no se puede modificar con
  // `create or replace`, haría falta DROP + CREATE y rehacer los grants de una
  // función que es el corazón de las reservas. No compensa por un booleano.
  let recuperacionUsada: { caducaEl: string | null } | null = null;
  let spotAsignado: string | null = null;
  if (estado === 'CONFIRMADA') {
    const { data: recup } = await admin
      .from('recuperaciones').select('caduca_el')
      .eq('usada_en_reserva_id', reservaId).eq('studio_id', params.studioId)
      .maybeSingle();
    if (recup) recuperacionUsada = { caducaEl: (recup.caduca_el as string | null) ?? null };
    // El sitio ya viene asignado por la RPC, dentro de la misma transacción
    // (ver `p_spot_id` arriba). Ya NO se llama a `asignarSpotReserva`: hacerlo
    // era un read-then-update posterior que podía perder la carrera y devolver
    // `null` tanto por eso como porque el spot estuviera inactivo — dos causas
    // distintas colapsadas en el mismo valor. Ahora, si el sitio no se puede
    // dar, la RPC lanza SPOT_OCUPADO / SPOT_NO_DISPONIBLE y la reserva entera
    // no se crea, que es lo honesto: la socia eligió un sitio y se le dice que
    // no lo tiene, en vez de confirmarle la clase en otro sin avisar.
    spotAsignado = params.spotId ?? null;
  }
  // D-1: el bono ya se decidió DENTRO de `reservar_plaza` cuando la RPC
  // confirmó la plaza (misma transacción). `interpretarBonoDeReservarPlaza`
  // traduce lo que devolvió la fila; `trasReservaCreada` lo usa en vez de
  // volver a llamar a `consumirBonoServidor` (que ya vería la decisión hecha).
  const consumoBono = estado === 'CONFIRMADA' ? interpretarBonoDeReservarPlaza(row) : undefined;
  // Bono, analítica, gamificación y avisos: dueño único (ver `trasReservaCreada`).
  await trasReservaCreada(admin, {
    studioId: params.studioId, socioId: params.socioId, sesionId: params.sesionId,
    estado, spotAsignado, canal: 'alumna', reservaId, consumoBono, consumibleBono,
  });
  return { ok: true as const, estado, reservaId, spotAsignado, recuperacionUsada };
}

// "Pagar y reservar sin login previo" (docs/reserva-sin-login-diseno.md §4.2):
// variante de crearReservaPublica llamada DESDE EL WEBHOOK tras confirmar un
// pago (nunca desde una ruta pública sin verificar) — el pago YA ES la
// prueba de derecho a la clase, así que a diferencia de crearReservaPublica
// esta función:
//  · NO repite el gate de plan/bono (exigirPlanResuelto) — el plan que cubre
//    esta sesión ya se entregó en entregarPlanComprado, en la MISMA llamada
//    del webhook que dispara esto.
//  · Deriva `p_reserva_id` de `paymentIntentId` (idsDe().reservaId), no de un
//    uid() aleatorio — un reintento del webhook con el MISMO PaymentIntent
//    tiene que reservar la MISMA plaza, nunca dos.
// Sigue pasando por reservar_plaza (el candado de aforo real) SIN excepción:
// si la clase se llenó entre que se creó el PaymentIntent y que el pago se
// confirmó, el resultado puede ser LISTA_ESPERA o rechazo — el dinero ya se
// cobró en ambos casos (el plan/bono queda entregado igual), esta función
// solo decide si además hay plaza.
export async function reservarPlazaTrasPagoPublico(params: {
  studioId: string; sesionId: string; socioId: string; paymentIntentId: string;
  /** "Elige tu plaza" — sitio concreto que se pagó, si la sala tiene mapa. */
  spotId?: string | null;
}): Promise<
  | { ok: true; estado: string; reservaId: string; spotAsignado: string | null }
  | { ok: false; motivo: 'sesion-no-encontrada' | 'sesion-invalida' | 'spot-ocupado' | 'error'; detalle?: string }
> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  let tipoClaseId: string | null | undefined;
  let inicioISO: string;
  {
    const { data: ses } = await admin
      .from('sesiones').select('inicio, cancelada, tipo_clase_id')
      .eq('id', params.sesionId).eq('studio_id', params.studioId).maybeSingle();
    if (!ses) return { ok: false, motivo: 'sesion-no-encontrada' };
    if (ses.cancelada || new Date(ses.inicio as string).getTime() <= Date.now()) {
      return { ok: false, motivo: 'sesion-invalida', detalle: ses.cancelada ? 'cancelada' : 'ya empezada' };
    }
    tipoClaseId = ses.tipo_clase_id as string | null | undefined;
    inicioISO = ses.inicio as string;
  }

  const pol = await cargarPoliticaEstudio(admin, params.studioId);
  const reglasTipo = await cargarReglasReservaTipoClase(admin, params.studioId, tipoClaseId);
  const permiteListaEsperaResuelto = heredaOverride(reglasTipo.permiteListaEspera, pol.permiteListaEspera);
  const requiereAprobacionResuelto = heredaOverride(reglasTipo.requiereAprobacion, pol.requiereAprobacion);

  {
    const ventanaMinima = heredaOverride(reglasTipo.ventanaMinimaMinutos, pol.ventanaMinimaMinutos);
    if (!puedeReservarPorVentanaMinima(inicioISO, new Date(), ventanaMinima)) {
      return { ok: false, motivo: 'sesion-invalida', detalle: 'fuera de ventana mínima' };
    }
    const antelacionMaxima = heredaOverride(reglasTipo.antelacionMaximaDias, pol.antelacionMaximaDias);
    if (!puedeReservarPorAntelacionMaxima(inicioISO, new Date(), antelacionMaxima)) {
      return { ok: false, motivo: 'sesion-invalida', detalle: 'fuera de ventana máxima' };
    }
  }

  const { idsDe } = await import('@/lib/billing/entregar-plan-comprado');
  const reservaId = idsDe(params.paymentIntentId).reservaId;
  // D-1: el plan/bono se acaba de entregar (entregarPlanComprado, en la misma
  // llamada del webhook que dispara esto) — se elige AQUÍ para que la RPC lo
  // descuente dentro de su propio candado, igual que el camino de la alumna.
  const consumibleBono = await resolverBonoParaSesion(admin, {
    studioId: params.studioId, socioId: params.socioId, sesionId: params.sesionId,
  });
  const { data, error } = await admin.rpc('reservar_plaza', {
    p_studio_id: params.studioId, p_sesion_id: params.sesionId,
    p_socio_id: params.socioId, p_reserva_id: reservaId,
    p_permite_lista_espera: permiteListaEsperaResuelto,
    p_requiere_aprobacion: requiereAprobacionResuelto,
    p_spot_id: params.spotId ?? null,
    // ⚠️ ÚNICO sitio del repo que salta el gate de impago, y es obligatorio:
    // aquí el dinero YA está cobrado (esto corre desde el webhook de Stripe).
    // Sin esto, una socia con un recibo fallido de otro mes pagaría esta clase
    // y acto seguido se quedaría sin plaza. Quien acaba de pagar no es quien
    // debe.
    p_saltar_gate_impago: true,
    // ⚠️ Explícito por DOS motivos, y los dos son obligatorios:
    //
    // 1. NEGOCIO: el dinero de esta clase ya está cobrado. Volver a exigir un
    //    entitlement activo dentro del lock dejaría sin plaza a quien acaba de
    //    pagarla (mismo razonamiento que `p_saltar_gate_impago` justo arriba).
    // 2. RESOLUCIÓN: en producción conviven dos sobrecargas de `reservar_plaza`
    //    (8 y 9 parámetros, las dos con defaults). Una llamada que NO nombre
    //    `p_exigir_entitlement` encaja en las dos y Postgres responde
    //    42725 «function ... is not unique» — es decir, la reserva tras pago
    //    falla SIEMPRE. Nombrarlo aquí es lo que la hace unívoca.
    p_exigir_entitlement: false,
    // D-1: el bono elegido arriba, para que la RPC lo descuente en la misma
    // transacción que confirma la plaza.
    p_suscripcion_id: consumibleBono?.suscripcion.id ?? null,
  });
  if (error) {
    // YA_RESERVADA: mismo p_reserva_id que un reintento anterior del webhook
    // ya insertó — idempotente, se trata como éxito, no como fallo.
    if (error.message.includes('YA_RESERVADA')) {
      const { data: existente } = await admin.from('reservas').select('estado, spot_id, socio_id, sesion_id').eq('id', reservaId).maybeSingle();
      const estadoExistente = (existente?.estado as string) ?? 'CONFIRMADA';
      const spotExistente = (existente?.spot_id as string | null) ?? null;
      if (existente && existente.socio_id === params.socioId && existente.sesion_id === params.sesionId) {
        // La entrega anterior insertó la reserva y pudo morir antes de descontar
        // el bono: se completa (idempotente por reserva). Los avisos solo salen
        // si ese descuento ocurre ahora.
        await trasReservaCreada(admin, {
          studioId: params.studioId, socioId: params.socioId, sesionId: params.sesionId,
          estado: estadoExistente, spotAsignado: spotExistente, canal: 'pago', reservaId, reintento: true,
        });
      }
      return { ok: true, estado: estadoExistente, reservaId, spotAsignado: spotExistente };
    }
    if (error.message.includes('AFORO_LLENO_SIN_ESPERA')) return { ok: false, motivo: 'sesion-invalida', detalle: 'clase completa' };
    // La visitante pagó por un sitio concreto y otro pago se lo llevó
    // primero (misma clase que dos payment intents casi simultáneos) — no
    // se pierde el dinero (el plan/bono ya se entregó antes de llamar aquí),
    // pero SÍ hay que avisar al mostrador: mismo tratamiento que
    // 'sesion-invalida' desde el webhook (emitirReservaPagadaSinPlaza).
    // SPOT_NO_DISPONIBLE = la plaza existe y es de la sala, pero está dada de
    // baja (migr 20260829120000). Mismo tratamiento: la visitante pagó, no se
    // pierde el dinero, y el mostrador tiene que enterarse de que hay que
    // reubicarla.
    if (error.message.includes('SPOT_OCUPADO') || error.message.includes('SPOT_NO_PERTENECE_A_LA_SALA')
        || error.message.includes('SPOT_NO_DISPONIBLE')) {
      return { ok: false, motivo: 'spot-ocupado', detalle: error.message };
    }
    // ⚠️ Aquí el dinero YA está cobrado (esto corre desde el webhook de Stripe
    // y desde el conciliador). Cualquier rechazo es «cobrado y sin poder
    // entregar», y hay que nombrarlo para que el mostrador pueda llamar hoy a
    // la socia.
    //
    // Corrección de la 26ª pasada: la versión anterior de este comentario
    // afirmaba que `motivo: 'error'` NO dispara `emitirReservaPagadaSinPlaza`.
    // Es FALSO — los dos llamantes hacen `if (!r.ok)` sin mirar el motivo
    // (app/api/stripe/webhook/route.ts y lib/inngest/conciliar-cobros.ts), así
    // que el aviso al mostrador sí salía. Lo que se perdía era el DIAGNÓSTICO:
    // el aviso y el Sentry llevaban el código crudo de la RPC.
    //
    // Los de abajo son REGLAS DE NEGOCIO alcanzables desde el widget público
    // (`CONFLICTO_HORARIO`, con solo tener otra reserva a la misma hora) y
    // estaban cayendo en el comodín: copy interno para quien atiende, y un
    // evento de Sentry de nivel `error` por cada intento — justo el ruido que
    // la escalera existe para evitar.
    //
    // La lista se contrastó código a código con los `raise exception` de la
    // `reservar_plaza` VIVA en producción (`select prosrc from pg_proc`), no de
    // memoria. Los dos que quedan sin brazo son inalcanzables DESDE AQUÍ y está
    // comprobado por qué: `RESERVA_BLOQUEADA_IMPAGO` va tras `if not
    // p_saltar_gate_impago` y este llamante pasa `true` (quien acaba de pagar
    // no es quien debe), y `NO_AUTORIZADO` exige `current_rol() = 'INSTRUCTOR'`,
    // imposible con service-role. Solo `SESION_NO_ENCONTRADA` —una carrera con
    // un borrado— cae al comodín, y ahí «error» es la verdad.
    const RECHAZOS_DE_NEGOCIO: [string, string][] = [
      // `LIMITE_SEMANAL_ACTIVIDAD` antes que `LIMITE_SEMANAL`: el primero
      // contiene al segundo como subcadena y un `includes` los confundiría.
      ['LIMITE_SEMANAL_ACTIVIDAD', 'ha llegado al máximo semanal de esa actividad'],
      ['LIMITE_SEMANAL', 'ha llegado al máximo de clases de la semana'],
      ['ESTUDIO_CERRADO', 'el estudio está cerrado ese día'],
      ['CONFLICTO_HORARIO', 'ya tiene otra clase a esa hora'],
      ['NECESITA_AUTORIZACION', 'esa clase necesita autorización del estudio'],
    ];
    for (const [codigo, legible] of RECHAZOS_DE_NEGOCIO) {
      if (error.message.includes(codigo)) {
        return { ok: false, motivo: 'sesion-invalida', detalle: legible };
      }
    }
    return { ok: false, motivo: 'error', detalle: error.message };
  }
  const row = Array.isArray(data) ? data[0] : data;
  const estado: string = row?.estado ?? 'CONFIRMADA';
  const spotAsignado = estado === 'CONFIRMADA' ? (params.spotId ?? null) : null;

  // D-1: bono ya decidido dentro de `reservar_plaza` — ver el mismo criterio
  // en `crearReservaPublica`.
  const consumoBono = estado === 'CONFIRMADA' ? interpretarBonoDeReservarPlaza(row) : undefined;
  await trasReservaCreada(admin, {
    studioId: params.studioId, socioId: params.socioId, sesionId: params.sesionId,
    estado, spotAsignado, canal: 'pago', reservaId, consumoBono, consumibleBono,
  });

  return { ok: true, estado, reservaId, spotAsignado };
}

// El MOSTRADOR apunta a una clienta desde el panel (calendario: «Añadir clienta
// a la clase», walk-in y «repetir la semana que viene").
//
// Antes el navegador llamaba a `reservar_plaza` directo y luego descontaba el
// bono, daba créditos y evaluaba logros él mismo — y a la alumna no le llegaba
// NADA: la misma reserva avisaba o no según quién pulsara el botón. Ahora pasa
// por el mismo dueño que el resto (`trasReservaCreada`, canal 'mostrador'), con
// una sola excepción que decide recepción: «Avisar a la alumna» (`avisarSocia`).
//
// ⚠️ Corre con service-role, así que dentro de la RPC `es_llamada_servicio()` es
// true y `current_rol()` es NULL. Eso cambia dos cosas que hay que reponer:
//  · La guardia de INSTRUCTOR («solo sus clases») NO se ejecuta: la autorización
//    vive en la ruta (`app/api/reservas/crear`), antes de llegar aquí.
//  · El gate de impago SÍ se ejecutaría (lo salta `current_rol() is not null`,
//    que con service-role es falso). El staff siempre se lo ha saltado —en
//    mostrador el impago se habla, no se bloquea—, así que se pasa
//    `p_saltar_gate_impago` explícito. Solo se llega aquí con el rol ya comprobado.
// Lo que NO se aplica a propósito, a diferencia de `crearReservaPublica`: clase
// ya empezada (es el walk-in), plan/bono exigido y ventanas de antelación. El
// resto de parámetros van por defecto, igual que cuando la llamaba el panel:
// admite lista de espera, sin aprobación manual y sin sitio.
export async function crearReservaMostrador(params: {
  studioId: string; sesionId: string; socioId: string; reservaId: string; avisarSocia: boolean;
}): Promise<
  | { ok: true; estado: string; posicionEspera: number | null; reservaId: string; repetida: boolean }
  | { ok: false; status: 400 | 404 | 500; error: string }
> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  // La RPC no mira si la PROPIA sesión está cancelada (su `cancelada` es el de
  // las sesiones ajenas con las que busca solape). Mismo guard que el camino
  // público y que el que ya tenía `addReserva` en el cliente (I-2, 59ª pasada).
  const { data: ses } = await admin
    .from('sesiones').select('cancelada')
    .eq('id', params.sesionId).eq('studio_id', params.studioId).maybeSingle();
  if (!ses) return { ok: false, status: 404, error: MENSAJE_RESERVA_RPC.SESION_NO_ENCONTRADA };
  if (ses.cancelada) return { ok: false, status: 400, error: 'Esta clase está cancelada: no se puede apuntar a nadie.' };

  // D-1: el bono se elige AQUÍ para que la RPC lo descuente DENTRO del mismo
  // candado que confirma la plaza — mismo criterio que `crearReservaPublica`.
  const consumibleBono = await resolverBonoParaSesion(admin, {
    studioId: params.studioId, socioId: params.socioId, sesionId: params.sesionId,
  });
  const { data, error } = await admin.rpc('reservar_plaza', {
    p_studio_id: params.studioId, p_sesion_id: params.sesionId,
    p_socio_id: params.socioId, p_reserva_id: params.reservaId,
    p_saltar_gate_impago: true,
    // ⚠️ Explícito por DOS motivos (mismo caso que el camino de tras-pago):
    //
    // 1. NEGOCIO: el mostrador apunta walk-ins que pagan en caja o traen un
    //    bono que la recepcionista ya ha comprobado. Exigir entitlement aquí
    //    haría que el mostrador empezase a rechazar clientas presentes.
    // 2. RESOLUCIÓN: sin nombrar `p_exigir_entitlement`, esta llamada encaja a
    //    la vez en la sobrecarga de 8 y en la de 9 parámetros y Postgres
    //    responde 42725 «function ... is not unique» — apuntar desde el
    //    mostrador falla SIEMPRE.
    p_exigir_entitlement: false,
    // D-1: el bono elegido arriba, para que la RPC lo descuente en la misma
    // transacción que confirma la plaza.
    p_suscripcion_id: consumibleBono?.suscripcion.id ?? null,
  });
  if (error) {
    // Reintento del MISMO intento (el id lo genera el panel y viaja en la
    // petición): si la fila con ese id ya existe y es de esta socia en esta
    // clase, la primera vez sí entró — se contesta con lo que hay. Pudo morir
    // entre crear la reserva y descontar el bono: el dueño lo completa en modo
    // reintento (idempotente por reserva, nunca dos veces), y avisos y créditos
    // solo salen si ese descuento ha ocurrido AHORA, que es la prueba de que la
    // primera vez no llegó a ellos. Otro id con la socia ya apuntada es un «ya
    // está apuntada» de verdad.
    if (esCodigoReserva(error.message, 'YA_RESERVADA')) {
      const { data: existente } = await admin
        .from('reservas').select('estado, posicion_espera, socio_id, sesion_id')
        .eq('id', params.reservaId).eq('studio_id', params.studioId).maybeSingle();
      if (existente && existente.socio_id === params.socioId && existente.sesion_id === params.sesionId) {
        const completada = await trasReservaCreada(admin, {
          studioId: params.studioId, socioId: params.socioId, sesionId: params.sesionId,
          estado: existente.estado as string, spotAsignado: null, canal: 'mostrador',
          avisarSocia: params.avisarSocia, reservaId: params.reservaId, reintento: true,
        });
        if (completada) await otorgarPrimeraReservaSiToca(admin, params.studioId, params.socioId);
        return {
          ok: true, estado: existente.estado as string,
          posicionEspera: (existente.posicion_espera as number | null) ?? null,
          reservaId: params.reservaId, repetida: true,
        };
      }
    }
    // Nunca el SQL crudo a pantalla: la tabla completa de códigos de la RPC.
    const traducido = mensajeDeErrorReserva(error.message);
    if (traducido) return { ok: false, status: 400, error: traducido };
    reportDbError('[crearReservaMostrador]', error);
    return { ok: false, status: 500, error: 'No se ha podido apuntar. Inténtalo otra vez.' };
  }
  const row = Array.isArray(data) ? data[0] : data;
  const estado: string = row?.estado ?? 'CONFIRMADA';
  const posicionEspera = (row?.posicion_espera as number | null | undefined) ?? null;

  // D-1: bono ya decidido dentro de `reservar_plaza` — mismo criterio que
  // `crearReservaPublica`.
  const consumoBono = estado === 'CONFIRMADA' ? interpretarBonoDeReservarPlaza(row) : undefined;
  await trasReservaCreada(admin, {
    studioId: params.studioId, socioId: params.socioId, sesionId: params.sesionId,
    estado, spotAsignado: null, canal: 'mostrador', avisarSocia: params.avisarSocia,
    reservaId: params.reservaId, consumoBono, consumibleBono,
  });

  await otorgarPrimeraReservaSiToca(admin, params.studioId, params.socioId);

  return { ok: true, estado, posicionEspera, reservaId: params.reservaId, repetida: false };
}

// Créditos de «Primera reserva». Los daba el panel en cliente mirando su lista
// local de reservas (que puede no estar entera); aquí se cuenta en la BD, con
// la que se acaba de crear dentro. El mismo `ref_id` que usaba el cliente
// (`socioId`, el único que acepta la RPC) y el UNIQUE de `reward_actions`
// garantizan que no se da dos veces aunque se reintente. El cliente ya NO lo
// pide: una sola vía.
async function otorgarPrimeraReservaSiToca(admin: SupabaseClient, studioId: string, socioId: string): Promise<void> {
  const { count } = await admin
    .from('reservas').select('id', { count: 'exact', head: true })
    .eq('studio_id', studioId).eq('socio_id', socioId);
  if (count === 1) {
    await otorgarCreditosServidor(admin, studioId, socioId, 'PRIMERA_RESERVA', socioId);
  }
}

// Aprobar/rechazar una reserva PENDIENTE_APROBACION desde el panel (Fase 2a).
// La autorización real vive en `app/api/reservas/resolver-pendiente/route.ts`
// (verificarSesionStaff + puedeGestionarCalendario): esta función corre con
// service-role, así que el guard `auth.uid()` de la RPC no aplica aquí — el
// mismo motivo por el que crearReservaPublica hace sus propios checks en TS
// en vez de fiarse de la RPC cuando la llama el admin client.
//
// `motivoUI: 'clase_ya_empezada'`: la RPC tiene su propia guardia de inicio
// (nadie aprueba una clase que ya empezó, pase lo que pase con el cron de
// expiración) — si se pidió aprobar y volvió CANCELADA, es el único camino
// posible, así que se detecta aquí sin que la RPC tenga que devolver nada
// extra.
export async function resolverReservaPendiente(params: {
  studioId: string; reservaId: string; aprobar: boolean;
}): Promise<{ ok: true; estado: string; motivoUI?: 'clase_ya_empezada' } | { error: string; yaNoPendiente?: true }> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  const { data, error } = await admin.rpc('resolver_reserva_pendiente', {
    p_studio_id: params.studioId, p_reserva_id: params.reservaId, p_aprobar: params.aprobar,
  });
  if (error) {
    if (error.message.includes('NO_ENCONTRADA_O_YA_RESUELTA')) {
      // Puede ser el reintento de una aprobación que sí entró: se completa lo que
      // faltara (ver `completarConfirmacionTrasReintento`) y se contesta igual,
      // porque para quien pulsa ya no está pendiente.
      await completarConfirmacionTrasReintento(admin, { studioId: params.studioId, reservaId: params.reservaId });
      return { error: 'Esta reserva ya no está pendiente de aprobación', yaNoPendiente: true };
    }
    // R-2: la RPC valida ahora el límite semanal del plan (el mismo bloque que
    // reservar_plaza). La excepción revierte todo, así que la reserva SIGUE
    // pendiente de aprobación — el mensaje se lo dice a quien aprueba para que
    // decida, en vez de dejarle un error críptico.
    if (esCodigoReserva(error.message, 'LIMITE_SEMANAL_ACTIVIDAD')) {
      return { error: 'La socia ya hizo todas las clases de esa actividad que incluye su cuota esta semana, y no tiene recuperaciones. La reserva sigue pendiente: libera una de esa actividad o recházala.' };
    }
    if (esCodigoReserva(error.message, 'LIMITE_SEMANAL')) {
      return { error: 'La socia ya alcanzó el límite semanal de su plan y no tiene recuperaciones disponibles. La reserva sigue pendiente: libera una clase de esa semana o recházala.' };
    }
    // D-2 (auditoría 22-sep): entre que se pidió la reserva y se aprueba puede
    // pasar de todo — bono agotado en otra clase, plan dado de baja. La RPC
    // revalida al confirmar y revierte si ya no cubre la clase: la reserva
    // SIGUE pendiente, mismo criterio que LIMITE_SEMANAL de arriba.
    if (esCodigoReserva(error.message, 'SIN_ENTITLEMENT')) {
      return { error: 'La socia ya no tiene un plan o bono activo que cubra esta clase. La reserva sigue pendiente: recházala o pídele que renueve antes de aprobarla.' };
    }
    // R-1 (auditoría 22-sep): mientras la reserva esperaba aprobación pudo
    // apuntarse a otra clase o pedir una cita en el mismo hueco — la RPC
    // ahora lo comprueba también aquí (ya lo hacía en lista de espera).
    if (esCodigoReserva(error.message, 'CONFLICTO_HORARIO')) {
      return { error: 'La socia ya tiene otra clase o cita a esa misma hora. La reserva sigue pendiente: recházala o resuélvelo con ella.' };
    }
    // RES-2 (auditoría 2026-09-16): la RPC ahora respeta `fecha_en_cierre`
    // (antes no lo hacía, aunque la cabecera de la migración decía que sí).
    // Sin traducir caería en el `error.message` a secas de abajo, el mismo
    // hueco que ya se cerró para `crearReservaPublica`.
    if (error.message.includes('ESTUDIO_CERRADO')) {
      return { error: 'El estudio está cerrado ese día. La reserva sigue pendiente: recházala o espera a que se quite el cierre.' };
    }
    return { error: error.message };
  }
  const row = Array.isArray(data) ? data[0] : data;
  const estado: string = row?.estado ?? 'CANCELADA';

  const { data: res } = await admin.from('reservas').select('sesion_id, socio_id').eq('id', params.reservaId).maybeSingle();
  const sesionId = res?.sesion_id as string | undefined;
  const socioId = res?.socio_id as string | undefined;
  if (!sesionId || !socioId) return { ok: true, estado };

  if (params.aprobar && estado === 'CANCELADA') {
    const { emitirReservaCancelada } = await import('@/lib/notifications/emit');
    await emitirReservaCancelada(admin, { studioId: params.studioId, sesionId, socioId, reservaId: params.reservaId, motivo: 'expirada' });
    return { ok: true, estado, motivoUI: 'clase_ya_empezada' };
  }

  if (estado === 'CONFIRMADA') {
    await trasPlazaConfirmada(admin, { studioId: params.studioId, socioId, sesionId, reservaId: params.reservaId });
  } else if (estado === 'LISTA_ESPERA') {
    // Aprobada pero sin hueco: no ocupa plaza, así que no descuenta nada.
    const { emitirReserva } = await import('@/lib/notifications/emit');
    await emitirReserva(admin, { studioId: params.studioId, sesionId, socioId, estado: 'LISTA_ESPERA' });
  } else if (estado === 'CANCELADA') {
    const { emitirReservaCancelada } = await import('@/lib/notifications/emit');
    await emitirReservaCancelada(admin, { studioId: params.studioId, sesionId, socioId, reservaId: params.reservaId, motivo: 'rechazada' });
  }

  return { ok: true, estado };
}

// Rediseño del Calendario — punto 4, acción "Ofrecer plaza" de la franja de
// decisiones.
//
// ⚠️ Auditoría 2026-09-22 (R-5): este comentario venía diciendo que
// `promocionar_siguiente_espera` solo comprueba el aforo en la rama de
// promoción DIRECTA y no en la de OFERTA con plazo. Ya no es cierto: el cuerpo
// VIVO en producción (migración `20260916180123_promocionar_espera_con_plazo_
// comprueba_aforo`) calcula `aforo_efectivo` y sale antes de bifurcar por
// `p_plazo_minutos`, así que las dos ramas lo miran. La cifra tampoco: hoy hay
// 1 tipo de clase con plazo > 0, no 2.
//
// Lo que SÍ sigue siendo cierto, y es el motivo de que esta función haga su
// propia comprobación contra la BD antes de invocar la RPC: es un disparo
// MANUAL desde el panel, a diferencia de los otros dos llamantes, que solo
// llegan justo después de liberarse un hueco de verdad. Hoy es defensa en
// profundidad, no la única red. Y la regla de siempre: mirar `pg_proc` antes de
// diseñar sobre la garantía, no fiarse de este comentario.
export async function ofrecerPlazaLibre(params: {
  studioId: string; sesionId: string;
}): Promise<{ ok: true; resultado: 'confirmada' | 'oferta' } | { error: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  const { data: ses } = await admin.from('sesiones')
    .select('tipo_clase_id, cancelada').eq('id', params.sesionId).eq('studio_id', params.studioId).maybeSingle();
  if (!ses || ses.cancelada) return { error: 'Esta clase no está disponible' };

  // I-9: esto comparaba contra `aforo_maximo` CRUDO, que ignora las máquinas
  // averiadas. Con una avería registrada se ofrecía una plaza que no existe — y
  // desde que aceptar una oferta comprueba el aforo de verdad (C-4), esa oferta
  // fantasma le cuesta el sitio a la socia: acepta a tiempo, se encuentra la
  // clase llena, pierde la plaza y gasta una recuperación por un hueco que nunca
  // estuvo libre. Se usa la misma fuente que `reservar_plaza`.
  const { data: aforo, error: errAforo } = await admin.rpc('aforo_efectivo', { p_sesion_id: params.sesionId });
  if (errAforo) {
    reportDbError('[ofrecerPlazaLibre] no se pudo calcular el aforo efectivo', errAforo);
    return { error: 'No se ha podido comprobar el aforo de esta clase' };
  }
  const { count: confirmadas } = await admin.from('reservas')
    .select('id', { count: 'exact', head: true })
    .eq('sesion_id', params.sesionId).in('estado', ['CONFIRMADA', 'ASISTIDA']);
  // `null` = sesión sin aforo definido, mismo criterio que reservar_plaza: no
  // hay límite que respetar.
  const limite = aforo as number | null;
  if (limite != null && (confirmadas ?? 0) >= limite) {
    return { error: 'No hay ningún hueco libre en esta clase ahora mismo' };
  }

  // Mismo patrón "hereda" que el resto de reglas de reserva (heredaOverride):
  // el tipo de clase manda si tiene su propio plazo, si no el del estudio.
  const [{ data: studioRow }, { data: tipoRow }] = await Promise.all([
    admin.from('studios').select('lista_espera_plazo_aceptacion_minutos').eq('id', params.studioId).maybeSingle(),
    ses.tipo_clase_id
      ? admin.from('tipos_clase').select('lista_espera_plazo_aceptacion_minutos').eq('id', ses.tipo_clase_id as string).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const plazoMinutos = (tipoRow?.lista_espera_plazo_aceptacion_minutos as number | null)
    ?? (studioRow?.lista_espera_plazo_aceptacion_minutos as number | null) ?? 0;

  const { data, error } = await admin.rpc('promocionar_siguiente_espera', {
    p_studio_id: params.studioId, p_sesion_id: params.sesionId, p_plazo_minutos: plazoMinutos,
  });
  if (error) return { error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.promovida_socio_id && !row?.oferta_socio_id) return { error: 'No hay nadie en lista de espera para esta clase' };

  if (row.promovida_socio_id) {
    // Una promoción de lista de espera, igual que la que dispara una
    // cancelación: mismo dueño, mismo aviso («Se ha liberado tu plaza»). Antes
    // aquí salía solo el push genérico de «reserva confirmada».
    await trasPromocionDeEspera(admin, { studioId: params.studioId, socioId: row.promovida_socio_id as string, sesionId: params.sesionId });
    return { ok: true, resultado: 'confirmada' };
  }
  const { emitirOfertaListaEspera } = await import('@/lib/notifications/emit');
  await emitirOfertaListaEspera(admin, {
    studioId: params.studioId, sesionId: params.sesionId,
    socioId: row.oferta_socio_id as string, expiraEn: row.oferta_expira_en as string,
  });
  return { ok: true, resultado: 'oferta' };
}

// Expira una reserva PENDIENTE_APROBACION cuya sesión ya empezó — llamado por
// el cron `lib/reservas-pendientes/expirar.ts`, no por un usuario. Sin sesión
// de staff detrás: la guardia de inicio de la RPC ya obliga a CANCELADA sin
// importar qué se pida, así que aquí basta con pedir "rechazar" tal cual.
export async function expirarReservaPendiente(params: {
  studioId: string; reservaId: string; sesionId: string; socioId: string;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.rpc('resolver_reserva_pendiente', {
    p_studio_id: params.studioId, p_reserva_id: params.reservaId, p_aprobar: false,
  });
  if (error) {
    console.error('[expirarReservaPendiente]', error.message);
    return;
  }
  const { emitirReservaCancelada } = await import('@/lib/notifications/emit');
  await emitirReservaCancelada(admin, {
    studioId: params.studioId, sesionId: params.sesionId, socioId: params.socioId,
    reservaId: params.reservaId, motivo: 'expirada',
  });
}

// Fase 2b: la socia acepta su oferta de plaza de lista de espera dentro del
// plazo. El bono se consume AQUÍ (no en la RPC) — mismo criterio que
// resolverReservaPendiente: la reserva no ocupa plaza real hasta que se
// confirma de verdad.
export async function aceptarOfertaListaEspera(params: {
  studioId: string; reservaId: string; socioId: string;
}): Promise<{ ok: true; estado: string } | { error: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  // C-4: la RPC ya NO tiene una sola salida buena. Comprueba el aforo y que la
  // clase no haya empezado (antes no hacía ninguna de las dos cosas: era la
  // única vía de confirmación sin candado, y producía overbooking real). Cuando
  // la plaza ya no está devuelve `AFORO_LLENO` / `CLASE_YA_EMPEZADA` en vez de
  // lanzar, porque una excepción revertiría la cancelación que sí queremos que
  // persista. Hay que leer el `data`.
  const { data, error } = await admin.rpc('aceptar_oferta_lista_espera', {
    p_studio_id: params.studioId, p_reserva_id: params.reservaId, p_socio_id: params.socioId
  });
  if (error) {
    if (error.message.includes('OFERTA_CADUCADA')) return { error: 'Esta oferta ya ha caducado' };
    if (error.message.includes('OFERTA_NO_ENCONTRADA') || error.message.includes('SIN_OFERTA_ACTIVA')) {
      // Reintento de una aceptación que sí entró: se completa lo que faltara.
      await completarConfirmacionTrasReintento(admin, {
        studioId: params.studioId, reservaId: params.reservaId, socioId: params.socioId,
      });
    }
    if (error.message.includes('OFERTA_NO_ENCONTRADA')) return { error: 'Esta reserva ya no está en lista de espera' };
    if (error.message.includes('SIN_OFERTA_ACTIVA')) return { error: 'No hay ninguna oferta activa para esta reserva' };
    if (error.message.includes('NO_AUTORIZADO')) return { error: 'No autorizado' };
    return { error: error.message };
  }
  const fila = Array.isArray(data) ? data[0] : data;
  const resultado = (fila?.estado as string | undefined) ?? 'CONFIRMADA';

  const { data: res } = await admin.from('reservas').select('sesion_id').eq('id', params.reservaId).maybeSingle();
  const sesionId = res?.sesion_id as string | undefined;

  // RES-1: dos motivos NUEVOS de cancelación al aceptar, y a propósito SIN
  // compensación con `crear_recuperacion`. Los tres motivos de abajo
  // (AFORO_LLENO/CLASE_CANCELADA/CLASE_YA_EMPEZADA) son un fallo AJENO a
  // ella: el estudio o el reloj le quitan una plaza que sí le correspondía.
  // Exceder su propio límite semanal o chocar con su propia otra reserva no
  // lo es — sigue con el resto de su cuota intacta y puede reservar otra
  // clase que sí le quepa; compensarla sería regalarle una clase de más por
  // una oferta que nunca pudo aceptar de verdad.
  // D-2 (auditoría 22-sep): SIN_ENTITLEMENT entra en el mismo bucket — el
  // bono/plan se agotó o venció mientras la oferta estaba abierta, es SU
  // plan, no un fallo del estudio.
  if (resultado === 'LIMITE_SEMANAL' || resultado === 'LIMITE_SEMANAL_ACTIVIDAD' || resultado === 'CONFLICTO_HORARIO' || resultado === 'SIN_ENTITLEMENT') {
    if (sesionId) {
      const { emitirReservaCancelada } = await import('@/lib/notifications/emit');
      await emitirReservaCancelada(admin, {
        studioId: params.studioId, sesionId, socioId: params.socioId, reservaId: params.reservaId,
        motivo: resultado === 'CONFLICTO_HORARIO' ? 'conflicto_horario_propio'
          : resultado === 'SIN_ENTITLEMENT' ? 'sin_entitlement_propio'
            : 'limite_semanal_propio',
      });
    }
    return {
      error: resultado === 'CONFLICTO_HORARIO'
        ? 'Ya tienes otra clase o cita a esa misma hora: no hemos podido confirmarte esta plaza.'
        : resultado === 'SIN_ENTITLEMENT'
          ? 'Ya no tienes un plan o bono activo que cubra esta clase: no hemos podido confirmarte esta plaza.'
          : 'Ya has alcanzado el máximo de clases de tu plan esta semana: no hemos podido confirmarte esta plaza.',
    };
  }

  if (resultado !== 'CONFIRMADA') {
    // Aceptó dentro de plazo y aun así se queda sin plaza. Decisión de producto:
    // PIERDE EL SITIO (ya la ha cancelado la RPC) y se le compensa con una
    // recuperación — la misma que se da al cancelar una plaza fija, con su tope
    // de 4 aplicado dentro de `crear_recuperacion`. NO se consume bono: no ha
    // llegado a ocupar plaza.
    const recupId = `recup-${uid()}`;
    const { data: creada } = await admin.rpc('crear_recuperacion', {
      p_id: recupId,
      p_studio_id: params.studioId,
      p_socio_id: params.socioId,
      p_origen_reserva_id: params.reservaId,
      p_motivo: resultado === 'AFORO_LLENO'
        ? 'La plaza se ocupó antes de aceptar la oferta'
        : resultado === 'CLASE_CANCELADA'
          ? 'El estudio canceló la clase antes de aceptar la oferta'
          : 'La clase ya había empezado al aceptar la oferta',
    });
    if (sesionId) {
      const { emitirReservaCancelada } = await import('@/lib/notifications/emit');
      await emitirReservaCancelada(admin, {
        studioId: params.studioId, sesionId, socioId: params.socioId, reservaId: params.reservaId,
        motivo: resultado === 'AFORO_LLENO' ? 'plaza_ya_ocupada'
          : resultado === 'CLASE_CANCELADA' ? 'clase_cancelada'
            : 'clase_ya_empezada',
      });
    }
    // El mensaje no puede sonar a que llegó tarde: aceptó a tiempo. Y si la
    // recuperación no se creó (tope alcanzado), no se le promete.
    const compensada = creada === 'CREADA';
    const base = resultado === 'AFORO_LLENO'
      ? 'La plaza se ocupó justo antes de que aceptaras.'
      : resultado === 'CLASE_CANCELADA'
        ? 'El estudio canceló esta clase.'
        : 'La clase ya había empezado cuando aceptaste.';
    return {
      error: compensada
        ? `${base} Te hemos guardado una recuperación para que la uses en otra clase.`
        : `${base} No hemos podido guardarte una recuperación: habla con el estudio.`,
    };
  }

  if (sesionId) {
    await trasPlazaConfirmada(admin, { studioId: params.studioId, socioId: params.socioId, sesionId, reservaId: params.reservaId });
  }
  return { ok: true, estado: 'CONFIRMADA' };
}

// Fase 2b: cancela (pierde el sitio) la reserva cuya oferta caducó sin
// aceptar y reutiliza promocionar_siguiente_espera (dentro de la RPC) para
// ofrecerla a la siguiente en la cola. Llamado solo por el cron
// (lib/lista-espera/expirar-ofertas.ts, disparado por pg_cron), sin sesión de usuario detrás — mismo
// criterio que expirarReservaPendiente.
export async function expirarOfertaListaEspera(params: {
  studioId: string; reservaId: string; sesionId: string; socioId: string;
  // Devuelve si la oferta se expiró DE VERDAD. Antes era `Promise<void>` y el
  // fallo de la RPC se quedaba en un `console.error`: el barrido que la llama
  // (cada 5 minutos) contaba esa oferta como expirada, devolvía 200 y nadie se
  // enteraba nunca de que la plaza seguía bloqueada y la siguiente de la cola
  // no la recibía jamás.
}): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const { data, error } = await admin.rpc('expirar_oferta_lista_espera', {
    p_studio_id: params.studioId, p_reserva_id: params.reservaId
  });
  if (error) {
    capturarExcepcion(error, {
      tags: { contexto: 'expirarOfertaListaEspera' },
      extra: { studioId: params.studioId, reservaId: params.reservaId, sesionId: params.sesionId },
    });
    return false;
  }
  const { emitirReservaCancelada } = await import('@/lib/notifications/emit');
  await emitirReservaCancelada(admin, {
    studioId: params.studioId, sesionId: params.sesionId, socioId: params.socioId,
    reservaId: params.reservaId, motivo: 'oferta_caducada'
  });

  const row = Array.isArray(data) ? data[0] : data;
  if (row?.oferta_socio_id) {
    const { emitirOfertaListaEspera } = await import('@/lib/notifications/emit');
    await emitirOfertaListaEspera(admin, {
      studioId: params.studioId, sesionId: params.sesionId,
      socioId: row.oferta_socio_id as string, expiraEn: row.oferta_expira_en as string
    });
  } else if (row?.promovida_socio_id) {
    // Auditoría 21ª pasada, P-5: con `lista_espera_plazo_aceptacion_minutos`
    // en 0 (los 10 estudios hoy — la lista con oferta está inerte),
    // `promocionar_siguiente_espera` confirma directo en vez de ofrecer. La
    // RPC ya devolvía `promovida_socio_id` a `expirar_oferta_lista_espera`
    // internamente pero su `RETURNS TABLE` no lo exponía — se perdía en
    // silencio: la socia quedaba CONFIRMADA sin consumir bono (el consumo
    // vive aquí, no en la RPC — mismo criterio que
    // `aceptarOfertaListaEspera`/`resolverReservaPendiente`) y sin ninguna
    // notificación. Ahora pasa por el dueño de la promoción: descuenta bono y
    // la avisa igual que cualquier otra subida desde lista de espera.
    await trasPromocionDeEspera(admin, {
      studioId: params.studioId, socioId: row.promovida_socio_id as string, sesionId: params.sesionId,
    });
  }
  return true;
}

// Fase 2c: cancela una sesión completa porque no alcanzó el mínimo de
// asistentes a 2h del inicio — llamado solo por el cron
// (lib/minimo-asistentes/cancelar-por-minimo.ts), sin sesión de staff detrás.
// La devolución de bono a cada CONFIRMADA sigue la misma política de estudio
// que el resto de cancelaciones de clase completa (P-1, ver
// devolverBonosPorCancelacionClase) — antes era incondicional aquí y nunca
// ocurría en los otros dos caminos, la asimetría que cerró esa pieza.
//
// Dos guardas de idempotencia INDEPENDIENTES (no una sola compuesta): si el
// cron reintenta tras un fallo parcial, la sesión ya marcada cancelada=true
// no bloquea que se sigan limpiando reservas sueltas.
// El `motivo` se generalizó al añadir el cierre del centro: los dos casos son
// «cancela el estudio, no la socia», y por eso los dos devuelven bono. Se
// mantiene el default para no tocar al caller original (el cron de mínimo de
// asistentes) y, sobre todo, para no duplicar el invariante de más abajo: el
// aviso va ANTES del UPDATE o se manda a nadie.
export async function cancelarSesionPorMinimoNoAlcanzado(params: {
  studioId: string; sesionId: string;
  motivo?: 'minimo_no_alcanzado' | 'cierre_centro';
}): Promise<{ ok: true } | { error: string }> {
  const motivo = params.motivo ?? 'minimo_no_alcanzado';
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  const { data: ses } = await admin
    .from('sesiones').select('tipo_clase_id, cancelada')
    .eq('id', params.sesionId).eq('studio_id', params.studioId).maybeSingle();
  if (!ses) return { error: 'Sesión no encontrada' };
  const tipoClaseId = ses.tipo_clase_id as string | null;

  if (!ses.cancelada) {
    await admin.from('sesiones')
      .update({ cancelada: true, cancelada_motivo: motivo })
      .eq('id', params.sesionId).eq('cancelada', false);
  }

  // Incluye PENDIENTE_APROBACION (Fase 2a) — cierra un gap que ya existía en
  // dbCancelarReservasPorSesiones (solo CONFIRMADA/LISTA_ESPERA): sin esto,
  // una reserva pendiente de aprobar quedaría huérfana en una sesión cancelada.
  const { data: afectadas } = await admin
    .from('reservas').select('id, socio_id, estado')
    .eq('sesion_id', params.sesionId)
    .in('estado', ['CONFIRMADA', 'LISTA_ESPERA', 'PENDIENTE_APROBACION']);
  // ORDEN CRÍTICO: el aviso va ANTES del UPDATE, nunca después.
  // `clase.cancelada` resuelve destinatarias en servidor filtrando
  // estado IN ('CONFIRMADA','LISTA_ESPERA','PENDIENTE_APROBACION')
  // (lib/notifications/recipients.ts, sociasDeSesion). Cancelarlas primero
  // dejaba ese filtro en 0 filas y el aviso se mandaba a NADIE — verificado en
  // producción sobre la única sesión que este cron llegó a cancelar (20-ago):
  // 0 notificaciones `clase.cancelada` para esa sesión.
  // Mismo invariante que app/api/sustituciones/route.ts y deleteSesion.
  const { emitirClaseCancelada } = await import('@/lib/notifications/emit');
  await emitirClaseCancelada(admin, { studioId: params.studioId, sesionId: params.sesionId });

  // Y por encima del corte por "no hay reservas": la audiencia incluye a la
  // INSTRUCTORA de la sesión, que también se queda sin clase aunque no se
  // hubiera apuntado nadie.
  if (!afectadas?.length) return { ok: true };

  await admin.from('reservas')
    .update({ estado: 'CANCELADA', posicion_espera: null })
    .eq('sesion_id', params.sesionId)
    .in('estado', ['CONFIRMADA', 'LISTA_ESPERA', 'PENDIENTE_APROBACION']);

  const confirmadas = afectadas.filter(r => r.estado === 'CONFIRMADA' && r.socio_id);
  // I-5: se guarda POR SOCIA si la devolución tuvo efecto, para que el email no
  // le prometa a nadie una sesión que no ha recuperado. En esta cancelación cada
  // socia recibe su propio correo, así que el dato es por persona, no global.
  const devueltoPorSocia = await devolverBonosPorCancelacionClase(admin, params.studioId,
    confirmadas.map(r => ({ socioId: r.socio_id as string, tipoClaseId, reservaId: r.id as string })));

  // CLASE_CANCELADA no manda email a propósito (catalog.ts) — aquí SÍ hay
  // dinero de por medio, así que se manda explícito. CancelacionClaseEmail ya
  // soporta `bonoDevuelto`, reutilizado tal cual vía enviarEmailTransaccional
  // (mismo patrón que notificarPromocionEspera, arriba en este archivo).
  const datos = await datosClaseParaEmail(admin, params.studioId, params.sesionId);
  if (datos && confirmadas.length) {
    const { data: socias } = await admin
      .from('socios').select('id, nombre, email')
      .in('id', confirmadas.map(r => r.socio_id as string));
    for (const s of socias ?? []) {
      if (!s.email) continue;
      await enviarEmailTransaccional({
        tipo: 'cancelacion', to: s.email as string, toName: (s.nombre as string) ?? 'Socia',
        data: { ...datos, bonoDevuelto: devueltoPorSocia.get(s.id as string) === true },
        studioId: params.studioId,
        // ⚠️ El prefijo del caso original se conserva LETRA POR LETRA
        // (`minimo-no-alcanzado`, con guiones, no el valor de columna con guion
        // bajo). Cambiarlo haría que una sesión ya cancelada antes de este
        // despliegue no reconociera su clave anterior y reenviara el correo.
        idempotencyKey: `${motivo === 'minimo_no_alcanzado' ? 'minimo-no-alcanzado' : 'cierre-centro'}-${params.sesionId}-${s.id}`
      });
    }
  }
  return { ok: true };
}

// `asignarSpotReserva` vivía aquí y se ha borrado: era el read-then-update que
// asignaba el sitio DESPUÉS de crear la reserva. Ya no hace falta —`reservar_plaza`
// lo hace dentro de su propia transacción, con `for update` sobre la fila del
// spot (ver `p_spot_id` en `crearReservaPublica`)— y dejarlo aquí sin llamantes
// era una invitación a volver al patrón inseguro.
//
// Lo que hacía y por qué no valía: leía sesión y spot, comprobaba sala/activo/
// libre y luego hacía UPDATE. Entre la lectura y la escritura cabía otra
// reserva, así que devolvía `null` tanto por perder la carrera como por spot
// inactivo o de otra sala: tres causas distintas en el mismo valor, y la socia
// se quedaba con la clase confirmada en un sitio que no era el que eligió.

/**
 * Núcleo de "liberar una plaza": cancela la reserva vía RPC (atómico, promociona
 * la lista de espera), aplica la política de devolución de bono, avisa a quien
 * se promociona y re-evalúa la gamificación de la socia afectada.
 *
 * Compartido por la cancelación pública (`cancelarReservaPublica`, la socia
 * decide) y el corte de confirmación por riesgo de plantón
 * (`lib/inngest/confirmacion-riesgo.ts`, el sistema decide porque no respondió
 * a tiempo) — el resultado para la clase y la lista de espera debe ser
 * IDÉNTICO venga de donde venga: misma regla de bono, mismo aviso a quien sube.
 *
 * `socioId: null` = lo dispara el sistema, no la propia socia (bypassa la
 * comprobación NO_AUTORIZADO de la función; quién puede llamar con null se
 * decide en el caller, nunca aquí).
 */

// D-1 (auditoría 24ª pasada): cancelar una plaza fija (`res-pf-…`) da derecho
// a una recuperación (compensa la clase perdida, tope de 4 dentro de la RPC) —
// pero esto vivía SOLO dentro de `cancelarReservaPublica` (la socia cancela
// desde el portal). El mostrador (`app/api/reservas/cancelar`) entraba
// directo a `ejecutarCancelacionReserva` sin pasar por aquí: si recepción
// cancelaba la MISMA plaza fija por teléfono, la socia perdía la clase sin
// compensación — mismo hecho de negocio, resultado distinto según quién
// pulsara el botón. Extraído a su propia función para que cualquier llamador
// nuevo lo tenga por construcción, en vez de copiar el bloque una tercera vez.
//
// Y con LA MISMA regla que el resto de recuperaciones automáticas (15-sep-2026).
// Antes se daba siempre, y eso fallaba de tres maneras:
//  · cancelando TARDE también: la compensación no dependía del plazo;
//  · con un plan SIN límite semanal, donde `reservar_plaza` nunca la gasta: le
//    ocupaba el tope de 4 vivas con algo inservible;
//  · con límite semanal, cancelar ya le libera el hueco de esa semana, así que
//    podía coger otra clase Y quedarse la recuperación — una clase de regalo.
// Ahora: solo si canceló a tiempo y su plan le limita la semana
// (`planLimitaSemanaDeClase`). Si el estudio reparte al cerrar la semana
// (`recuperacion_auto_semanal`), no se crea aquí: la creará el barrido y solo si
// no usa el hueco (ver lib/recuperaciones/otorgar-semanales.ts). Si no, se crea
// al cancelar, como hasta ahora.
async function otorgarRecuperacionPlazaFijaSiAplica(
  admin: SupabaseClient,
  params: { studioId: string; socioId: string; reservaId: string; eraConfirmada: boolean },
): Promise<{ recuperacionCreada: boolean; recuperacionCaducaEl: string | null; recuperacionAlCerrarSemana: boolean }> {
  const nada = { recuperacionCreada: false, recuperacionCaducaEl: null, recuperacionAlCerrarSemana: false };
  if (!params.reservaId.startsWith('res-pf-') || !params.eraConfirmada) return nada;

  // `cancelada_tardia` la escribe el trigger al cancelar, con la ventana del
  // tipo de clase por encima de la del estudio. NULL = no se sabe: no se da.
  const { data: reserva } = await admin
    .from('reservas').select('sesion_id, cancelada_tardia')
    .eq('id', params.reservaId).eq('studio_id', params.studioId).maybeSingle();
  if (!reserva || reserva.cancelada_tardia !== false) return nada;

  const [{ data: ses }, { data: estudio }, { data: susRows }, { data: planRows }] = await Promise.all([
    admin.from('sesiones').select('tipo_clase_id').eq('id', reserva.sesion_id as string).maybeSingle(),
    admin.from('studios').select('recuperacion_auto_semanal').eq('id', params.studioId).maybeSingle(),
    admin.from('suscripciones').select('*').eq('studio_id', params.studioId).eq('socio_id', params.socioId).eq('estado', 'ACTIVA'),
    admin.from('planes_tarifa').select('*').eq('studio_id', params.studioId),
  ]);
  const planes = await hidratarTiposDePlanes(admin as never, params.studioId, (planRows ?? []).map(mapPlanTarifa));
  const planPorId = new Map(planes.map(p => [p.id, p]));
  const tipoClaseId = (ses?.tipo_clase_id as string | null | undefined) ?? null;
  const leSirve = (susRows ?? []).map(mapSuscripcion).some(s => {
    const plan = s.planId ? planPorId.get(s.planId) : undefined;
    return !!plan && planLimitaSemanaDeClase(plan, tipoClaseId);
  });
  if (!leSirve) return nada;
  if (estudio?.recuperacion_auto_semanal === true) return { ...nada, recuperacionAlCerrarSemana: true };

  const recupId = `recup-${uid()}`;
  const { data } = await admin.rpc('crear_recuperacion', {
    p_id: recupId,
    p_studio_id: params.studioId,
    p_socio_id: params.socioId,
    p_origen_reserva_id: params.reservaId,
    p_motivo: 'Plaza fija — no puede esta semana',
  });
  const recuperacionCreada = data === 'CREADA';
  // Para que quien la pidió pueda decir "recupérala antes del [fecha]" sin ir a
  // buscarlo — la RPC solo devuelve 'CREADA'/'TOPE'/etc, no la fila. Una
  // lectura más, solo cuando de verdad se creó una.
  let recuperacionCaducaEl: string | null = null;
  if (recuperacionCreada) {
    const { data: fila } = await admin.from('recuperaciones').select('caduca_el').eq('id', recupId).maybeSingle();
    recuperacionCaducaEl = (fila?.caduca_el as string | undefined) ?? null;
  }
  return { recuperacionCreada, recuperacionCaducaEl, recuperacionAlCerrarSemana: false };
}

export async function ejecutarCancelacionReserva(
  admin: SupabaseClient,
  params: {
    studioId: string; reservaId: string; socioId: string | null;
    // Fase 3: true SOLO para el corte automático por riesgo de plantón
    // (confirmacion-riesgo.ts) — nadie pulsó "cancelar" ahí, así que no debe
    // generar penalización aunque la cancelación sea tardía. Portal y panel
    // dejan esto en false (default): siguen aplicando la regla si toca.
    omitirPenalizacion?: boolean;
    // D-1: por defecto SÍ se ofrece la recuperación de plaza fija — es lo que
    // corresponde tanto si cancela la socia (portal) como si cancela recepción
    // por ella (mostrador). Solo `app/api/socios/eliminar` lo pone a `false`:
    // una cuenta que se está borrando no va a volver a canjear nada, y crear
    // la fila ahí es puro ruido sobre un socio_id a punto de desaparecer.
    otorgarRecuperacionPlazaFija?: boolean;
    // Solo `retirarReservasFuturasPlazaFija`: la cancela el servidor al pausar o
    // quitar la plaza fija, no la socia clase a clase. Se guarda en
    // `reservas.cancelada_motivo` para que el barrido semanal no la compense y
    // la plaza pueda volver a reservarla si se reanuda (migr 20260915001236).
    motivoCancelacion?: 'plaza_fija_retirada';
  },
): Promise<{
  ok: true; tardia: boolean; bonoDevuelto: boolean; eraConfirmada: boolean;
  // P-1 (auditoría 21ª pasada): expuestos para que un llamador de servidor
  // (el endpoint de cancelación del panel) pueda reflejar en el cliente la
  // promoción/oferta REAL sin otra ida y vuelta — la notificación de verdad
  // (Notification Engine) ya la disparó esta misma función más abajo, esto
  // es solo para que la UI no tenga que esperar al próximo refresco.
  promovidaSocioId: string | null; ofertaSocioId: string | null; ofertaExpiraEn: string | null;
  // D-1: expuestos aquí (y no calculados aparte por cada caller) para que
  // mostrador y portal enseñen el mismo "recupérala antes del [fecha]".
  recuperacionCreada: boolean; recuperacionCaducaEl: string | null;
  recuperacionAlCerrarSemana: boolean;
} | { error: string }> {
  // Con motivo, se mira ANTES si la reserva seguía activa: `cancelar_reserva_plaza`
  // no falla sobre una reserva ya CANCELADA (sale sin tocar nada), así que sin
  // esto, si la socia la cancelaba ella misma justo antes, su cancelación
  // quedaría etiquetada como retirada de la plaza.
  let seguiaActiva = false;
  if (params.motivoCancelacion) {
    const { data: previa } = await admin.from('reservas')
      .select('estado').eq('id', params.reservaId).eq('studio_id', params.studioId).maybeSingle();
    seguiaActiva = previa?.estado === 'CONFIRMADA' || previa?.estado === 'LISTA_ESPERA';
  }

  const { data, error } = await admin.rpc('cancelar_reserva_plaza', {
    p_studio_id: params.studioId, p_reserva_id: params.reservaId, p_socio_id: params.socioId,
    p_omitir_penalizacion: params.omitirPenalizacion ?? false
  });
  if (error) {
    if (error.message.includes('NO_AUTORIZADO')) return { error: 'No autorizado' as const };
    if (error.message.includes('RESERVA_NO_ENCONTRADA')) return { error: 'Reserva no encontrada' as const };
    return { error: error.message };
  }
  const row = Array.isArray(data) ? data[0] : data;

  // El motivo va DESPUÉS de la RPC, solo si la reserva seguía activa antes de
  // llamarla y solo sobre una fila ya CANCELADA sin motivo: si la cancelación no
  // llegó a hacerse, o la había hecho otra persona, no hay nada que etiquetar.
  // Un fallo aquí no deshace la cancelación (ya está hecha y bien hecha); se
  // reporta, porque sin la etiqueta el barrido semanal podría compensarla y la
  // plaza no volvería a reservar esa clase al reanudarse.
  if (params.motivoCancelacion && seguiaActiva) {
    // `cancelada_tardia: false`: soltarla no es una cancelación de la alumna. El
    // trigger `marcar_cancelacion_tardia` la marcaría tardía si la clase empieza
    // dentro del plazo (la política LIBERAR también suelta esas), y saldría así en
    // sus datos y en las estadísticas del panel.
    const { error: errMotivo } = await admin.from('reservas')
      .update({ cancelada_motivo: params.motivoCancelacion, cancelada_tardia: false })
      .eq('id', params.reservaId).eq('studio_id', params.studioId).eq('estado', 'CANCELADA')
      .is('cancelada_motivo', null);
    if (errMotivo) {
      capturarExcepcion(new Error(errMotivo.message), {
        tags: { area: 'plazas-fijas' }, extra: { reservaId: params.reservaId, motivo: params.motivoCancelacion },
      });
    }
  }

  // Sesión cancelada + política (C-2): decide si se devuelve el bono. Una
  // cancelación tardía (dentro de la ventana) no lo devuelve, salvo que el
  // estudio lo permita. La plaza igualmente se libera y promociona la espera.
  // `socio_id` sale de la RESERVA (no de params.socioId, que puede ser null si
  // lo dispara el sistema) — es a ELLA a quien hay que devolverle el bono.
  const { data: cancelada } = await admin
    .from('reservas').select('sesion_id, socio_id').eq('id', params.reservaId).maybeSingle();
  let bonoDevuelto = false;
  let tardia = false;
  // Las plazas fijas materializadas (res-pf-) las inserta el cron CONFIRMADAS sin
  // consumir bono (materializar_plazas_fijas no toca el bono). Por tanto cancelarlas
  // NO debe devolver una sesión que nunca se descontó: su compensación es la
  // recuperación (ver cancelarReservaPublica). Sin este guard, cancelar una plaza
  // fija regalaba una sesión de bono + una recuperación (doble compensación).
  const esPlazaFija = params.reservaId.startsWith('res-pf-');
  if (row?.era_confirmada && cancelada?.sesion_id && cancelada?.socio_id && !esPlazaFija) {
    const pol = await cargarPoliticaEstudio(admin, params.studioId);
    const { data: ses } = await admin
      .from('sesiones').select('inicio, tipo_clase_id').eq('id', cancelada.sesion_id).maybeSingle();
    const inicio = ses?.inicio as string | undefined;
    const ventana = await resolverVentanaCancelacion(admin, params.studioId, ses?.tipo_clase_id as string | null, pol.ventanaHoras);
    // `tardia` se sigue calculando aquí porque decide el TEXTO que se le manda a
    // la socia, no si se le devuelve el bono.
    tardia = inicio ? esCancelacionTardia(inicio, new Date(), ventana) : false;
    // La DECISIÓN es de la BD (migr 0129): misma respuesta para el portal, el
    // panel y cualquier superficie que venga. Este camino ya la resolvía bien,
    // pero tenerla escrita dos veces es exactamente cómo se desincronizó del
    // panel. `?? true` mantiene lo de siempre si la RPC aún no trae la columna.
    // Una reserva rastreada que nunca se cobró de un bono (sin bono, o cancelada
    // con el cobro aún en vuelo) no recupera nada: devolverle una sesión
    // regalaría saldo. La decisión de política de la BD (`devolver_bono`) no lo
    // sabe: responde a «¿toca devolver?», no a «¿se cobró?».
    const nuncaCobrada = (await reservasSinCobroRegistrado(admin, params.studioId, [params.reservaId])).has(params.reservaId);
    if (inicio && (row?.devolver_bono ?? true) && !nuncaCobrada) {
      // Se devuelve al bono que cubre esa clase: es del que se descontó.
      // I-5: `bonoDevuelto` sale de lo que REALMENTE pasó, no de haber llamado.
      // Antes se ponía a true a pelo, así que el email de cancelación le decía a
      // la socia que le habíamos devuelto la sesión aunque no se hubiera
      // devuelto nada.
      bonoDevuelto = (await devolverBonoServidor(admin, params.studioId, cancelada.socio_id as string, ses?.tipo_clase_id as string | null, params.reservaId)) === 'DEVUELTA';
    }
  }

  if (row?.promovida_socio_id) {
    // `sesion_id` es required en consumirBonoServidor (0132): sin sesión no hay
    // de qué clase decidir la cobertura, así que sin ella no hay nada que
    // consumir ni que contar. Bono + correo + push: `trasPromocionDeEspera`.
    if (cancelada?.sesion_id) {
      await trasPromocionDeEspera(admin, {
        studioId: params.studioId, socioId: row.promovida_socio_id as string, sesionId: cancelada.sesion_id as string,
      });
    }
  } else if (row?.oferta_socio_id && cancelada?.sesion_id) {
    // Fase 2b: el estudio/tipo de clase exige plazo de aceptación — NO se
    // confirma sola (sin consumir bono ni asignar spot todavía, eso pasa al
    // aceptar, ver aceptarOfertaListaEspera), solo se le avisa que tiene una
    // oferta viva hasta oferta_expira_en.
    const { emitirOfertaListaEspera } = await import('@/lib/notifications/emit');
    await emitirOfertaListaEspera(admin, {
      studioId: params.studioId, sesionId: cancelada.sesion_id as string,
      socioId: row.oferta_socio_id as string, expiraEn: row.oferta_expira_en as string,
    });
  }
  // Notification Engine: confirmación a la socia de que su plaza ya no está.
  // Clave cuando lo dispara el SISTEMA (corte por riesgo de plantón): si no, se
  // queda sin plaza sin enterarse.
  if (cancelada?.socio_id && cancelada?.sesion_id) {
    const { emitirReservaCancelada } = await import('@/lib/notifications/emit');
    await emitirReservaCancelada(admin, {
      studioId: params.studioId,
      sesionId: cancelada.sesion_id as string,
      socioId: cancelada.socio_id as string,
      reservaId: params.reservaId,
    });
  }

  // S-1: cancelar baja RESERVAS_TOTALES, así que se re-evalúa para que el
  // progreso mostrado (logros y retos) siga siendo cierto. Un logro YA conseguido
  // no se revoca (el bucle salta los completados), igual que hacía la evaluación
  // en cliente.
  if (cancelada?.socio_id) {
    await evaluarGamificacionServidor(admin, params.studioId, cancelada.socio_id as string);
  }

  const eraConfirmada = row?.era_confirmada === true;
  const { recuperacionCreada, recuperacionCaducaEl, recuperacionAlCerrarSemana } =
    params.otorgarRecuperacionPlazaFija !== false && cancelada?.socio_id
      ? await otorgarRecuperacionPlazaFijaSiAplica(admin, {
          studioId: params.studioId, socioId: cancelada.socio_id as string,
          reservaId: params.reservaId, eraConfirmada,
        })
      : { recuperacionCreada: false, recuperacionCaducaEl: null, recuperacionAlCerrarSemana: false };

  return {
    ok: true as const, tardia, bonoDevuelto, eraConfirmada,
    promovidaSocioId: (row?.promovida_socio_id as string | null) ?? null,
    ofertaSocioId: (row?.oferta_socio_id as string | null) ?? null,
    ofertaExpiraEn: (row?.oferta_expira_en as string | null) ?? null,
    recuperacionCreada, recuperacionCaducaEl, recuperacionAlCerrarSemana,
  };
}

// Cancela una reserva de la socia, devuelve su bono y promueve la lista de espera.

export async function cancelarReservaPublica(params: {
  studioId: string; reservaId: string; socioId: string; authUserId: string | null;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const socia = await validarSociaPublica(admin, params.studioId, params.socioId, params.authUserId);
  if (!socia) return { error: 'No autorizado' as const };

  // I-7: el camino de CREAR tiene su guardia de "clase ya empezada"
  // (crearReservaPublica), el de cancelar no la tenía en ninguna capa — ni aquí
  // ni en `cancelar_reserva_plaza`, que solo mira `inicio` para decidir si la
  // cancelación es TARDÍA, no para impedirla. Cancelar por API una clase ya
  // terminada encadenaba la promoción de la lista de espera y la devolución de
  // bono sobre una clase que ya se ha dado.
  //
  // La guardia va AQUÍ y no dentro de la RPC a propósito: mostrador sí puede
  // necesitar cancelar una reserva pasada para cuadrar el histórico, y la RPC
  // es el camino común de las dos. Mismo criterio que la guardia de crear, que
  // también vive en la capa pública y no en `reservar_plaza`.
  const { data: reservaRow } = await admin.from('reservas')
    .select('sesion_id').eq('id', params.reservaId).eq('studio_id', params.studioId)
    .eq('socio_id', params.socioId).maybeSingle();
  if (reservaRow?.sesion_id) {
    const { data: sesionRow } = await admin.from('sesiones')
      .select('inicio').eq('id', reservaRow.sesion_id as string).maybeSingle();
    if (sesionRow?.inicio && new Date(sesionRow.inicio as string).getTime() <= Date.now()) {
      return { error: 'Esta clase ya ha empezado: habla con el estudio si necesitas anularla.' as const };
    }
  }

  // tardia/bonoDevuelto → la UI puede confirmar a la socia si recuperó la sesión.
  // recuperacionCreada/recuperacionCaducaEl (plaza fija, D-1): ahora las
  // resuelve `ejecutarCancelacionReserva` internamente, con el mismo tope de 4
  // que aplica la RPC — mismo camino que usa el mostrador.
  const r = await ejecutarCancelacionReserva(admin, { studioId: params.studioId, reservaId: params.reservaId, socioId: params.socioId });
  if ('error' in r) return r;
  return r;
}

// Gap 4 (portal Reservas > Pasadas, migr 20260828120000): la socia valora de
// 1 a 5 su propia experiencia sobre una clase YA ASISTIDA — autoservicio
// desde su sesión normal del portal (sin token, sin caducidad). Mismo patrón
// que el resto de escrituras públicas: service-role + validarSociaPublica,
// nunca RLS directa (ver comentario de la migración). NO confundir con
// `valoraciones` (migr 0044), que puntúa a la INSTRUCTORA vía token firmado
// sin login.
export async function valorarExperienciaReservaPublica(params: {
  studioId: string; reservaId: string; socioId: string; authUserId: string; valoracion: number;
}): Promise<{ ok: true } | { error: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const socia = await validarSociaPublica(admin, params.studioId, params.socioId, params.authUserId);
  if (!socia) return { error: 'No autorizado' as const };

  if (!Number.isInteger(params.valoracion) || params.valoracion < 1 || params.valoracion > 5) {
    return { error: 'La valoración debe ser un número entero de 1 a 5' as const };
  }

  // Filtro en código, no solo en el CHECK de la BD: propia (socio_id), ya
  // asistida (nunca sobre una clase que aún no ha pasado) y todavía sin
  // valorar (idempotente — no se puede pisar una valoración ya dada por este
  // camino). `.select().maybeSingle()` distingue "no hizo nada" (0 filas) de
  // un fallo real de red/permiso.
  const { data, error } = await admin.from('reservas')
    .update({ valoracion_experiencia: params.valoracion })
    .eq('id', params.reservaId)
    .eq('studio_id', params.studioId)
    .eq('socio_id', params.socioId)
    .eq('estado', 'ASISTIDA')
    .is('valoracion_experiencia', null)
    .select('id')
    .maybeSingle();
  if (error) return { error: 'No se pudo guardar la valoración' as const };
  if (!data) return { error: 'Esta clase no se puede valorar (ya valorada, no asistida, o no es tuya)' as const };
  return { ok: true as const };
}

// ─── Feature #2 (ficha Lorari-vs-Tentare) — plaza fija autoservicio ──────────
// Mismo patrón que el resto de escrituras públicas: service-role + validación
// de que la socia (id+email) pertenece al estudio, identidad SIEMPRE del JWT.
// Sin RLS por fila nueva (no existe `current_socio_id()` en este repo — a
// diferencia del autoservicio de instructora, el portal de socias nunca ha
// escrito vía RLS directa) — mismo criterio que reservas/citas públicas.

// Crea la plaza fija a partir de una sesión CONCRETA que la socia está viendo
// (nunca de campos sueltos que ella escriba a mano): día/hora/sala/tipo se
// DERIVAN de esa sesión con franjaLocalDe, la misma función que ya usa el
// motor de decisiones para agrupar franjas recurrentes — así el slot que se
// guarda es siempre uno que la socia ha visto reservable de verdad.
const COLUMNAS_PLAZA_FIJA = 'id, studio_id, socio_id, dia_semana, hora_inicio, sala_id, tipo_clase_id, spot_id, vigencia_desde, vigencia_hasta, estado, pausa_desde, pausa_hasta, pausa_libera_sitio, creada_en';

function plazaFijaDeFila(r: Record<string, unknown>): PlazaFijaServidor {
  return {
    id: r.id as string, studioId: r.studio_id as string, socioId: r.socio_id as string,
    diaSemana: r.dia_semana as number, horaInicio: r.hora_inicio as string, salaId: r.sala_id as string,
    tipoClaseId: (r.tipo_clase_id as string | null) ?? null, spotId: (r.spot_id as string | null) ?? null,
    vigenciaDesde: r.vigencia_desde as string, vigenciaHasta: (r.vigencia_hasta as string | null) ?? null,
    estado: r.estado as PlazaFijaServidor['estado'], creadaEn: r.creada_en as string,
    pausaDesde: (r.pausa_desde as string | null) ?? null, pausaHasta: (r.pausa_hasta as string | null) ?? null,
    pausaLiberaSitio: (r.pausa_libera_sitio as boolean | null) ?? false,
  };
}

export interface TextosPlazaFija { sinAutorizacion: string; sinCuota: string; duplicada: string; sitioOcupado: string }

const TEXTOS_PLAZA_FIJA_PANEL: TextosPlazaFija = {
  sinAutorizacion: 'Esta clase necesita autorización y esta clienta no la tiene. Dásela en su ficha y vuelve a intentarlo.',
  sinCuota: 'Para tener plaza fija necesita una cuota activa que incluya esta clase. Con bono se reserva clase a clase.',
  duplicada: 'Ya tiene una plaza fija en esa clase',
  sitioOcupado: 'Ese sitio ya está asignado a otra clienta en esa clase',
};

export const TEXTOS_PLAZA_FIJA_ALUMNA: TextosPlazaFija = {
  sinAutorizacion: 'Esta clase necesita que el estudio te dé acceso. Escríbeles y te la abren.',
  sinCuota: 'La clase fija es para quien tiene una cuota activa que incluya esta clase. Con bono, resérvala clase a clase.',
  duplicada: 'Ya tienes una clase fija en ese horario',
  sitioOcupado: 'Ese sitio ya no está libre en ese horario — contacta con el estudio',
};

// Crear o mover una plaza fija: UNA sola forma, para el panel y para la app.
//
// La franja (día, hora local, sala, tipo) sale de una CLASE del horario, nunca de
// campos tecleados. Antes el panel insertaba día/hora a mano (si no coincidía al
// minuto con una clase, la plaza no reservaba nunca) y reservaba la primera clase
// con `addReserva`, que descuenta bono, mientras que las de cada noche las crea
// el motor sin descontar. Ahora, tras guardar, el MISMO motor reserva ya las
// próximas semanas y meses (`materializar_plazas_fijas` con `p_plaza_id`, 180 días).
//
// Comprueba, por este orden: clienta y clase del estudio, clase no cancelada,
// autorización del tipo de clase, cuota vigente que la cubra (solo cuota:
// `cuotaParaPlazaFija`), sitio de esa sala, duplicado en la misma franja y límite
// semanal (avisa con `SUPERA_LIMITE` y deja confirmar, decisión del fundador).
// Al MOVER, suelta las reservas futuras del horario viejo con el mismo camino
// que quitar (`retirarReservasFuturasPlazaFija`).
/**
 * Las comprobaciones de «guardar plaza fija», sin escribir nada: las comparten el
 * panel al guardar y la petición de plaza fija desde la app de la alumna (que
 * valida al pedir y guarda al aprobar). El límite semanal NO bloquea aquí: se
 * devuelve `exceso` y decide quien llama (el panel pide confirmar; la petición se
 * guarda marcada y decide el estudio).
 */
export async function validarPlazaFijaDesdeSesion(
  admin: SupabaseClient,
  params: { studioId: string; socioId: string; datos: Omit<DatosPlazaFija, 'socioId'>; plazaId?: string },
  textos: TextosPlazaFija,
  /**
   * `ignorarVencidas`: no cuentan las plazas cuya fecha «hasta» ya pasó (ni para
   * «ya tiene una en ese horario» ni para el límite semanal). Lo pide la clase fija
   * del estudio, donde volver a pedirla al vencer es lo normal; el panel sigue como
   * siempre (sin esta opción, no cambia nada).
   */
  opciones: { ignorarVencidas?: boolean } = {},
) {
  const { studioId, socioId, datos, plazaId } = params;
  if (datos.vigenciaHasta && datos.vigenciaHasta < datos.vigenciaDesde) {
    return { ok: false as const, error: '«Hasta» no puede ser anterior a «Desde»: ese rango nunca estaría activo.' };
  }

  const [{ data: ses }, { data: socio }] = await Promise.all([
    admin.from('sesiones').select('id, sala_id, tipo_clase_id, inicio, cancelada')
      .eq('id', datos.sesionId).eq('studio_id', studioId).maybeSingle(),
    admin.from('socios').select('id').eq('id', socioId).eq('studio_id', studioId).maybeSingle(),
  ]);
  if (!socio) return { ok: false as const, error: 'Clienta no encontrada' };
  if (!ses) return { ok: false as const, error: 'Clase no encontrada' };
  if (ses.cancelada) return { ok: false as const, error: 'Esta clase está cancelada: elige otra del horario.' };
  const tipoClaseId = (ses.tipo_clase_id as string | null) ?? null;
  const salaId = ses.sala_id as string;

  // Niveles: sin esto se podía crear la plaza fija de una clase para la que no
  // está autorizada, y el motor la saltaría cada noche sin que nadie lo viera.
  if (tipoClaseId) {
    const { data: tipo } = await admin
      .from('tipos_clase').select('requiere_autorizacion')
      .eq('id', tipoClaseId).eq('studio_id', studioId).maybeSingle();
    if (tipo?.requiere_autorizacion) {
      const { data: permiso } = await admin
        .from('socio_tipos_clase_autorizados').select('tipo_clase_id')
        .eq('studio_id', studioId).eq('socio_id', socioId).eq('tipo_clase_id', tipoClaseId)
        .maybeSingle();
      if (!permiso) return { ok: false as const, error: textos.sinAutorizacion };
    }
  }

  const [{ data: susRows }, { data: planRows }] = await Promise.all([
    admin.from('suscripciones').select('*').eq('studio_id', studioId).eq('socio_id', socioId).eq('estado', 'ACTIVA'),
    admin.from('planes_tarifa').select('*').eq('studio_id', studioId),
  ]);
  const planes = await hidratarTiposDePlanes(admin as never, studioId, (planRows ?? []).map(mapPlanTarifa));
  const cuota = cuotaParaPlazaFija(socioId, (susRows ?? []).map(mapSuscripcion), planes, hoyEnEstudio(), tipoClaseId);
  if (!cuota) return { ok: false as const, error: textos.sinCuota };

  if (datos.spotId) {
    const { data: spot } = await admin.from('spots').select('id')
      .eq('id', datos.spotId).eq('studio_id', studioId).eq('sala_id', salaId).eq('activo', true).maybeSingle();
    if (!spot) return { ok: false as const, error: 'Ese sitio no es de la sala de esta clase' };
  }

  const { dow, hora, minuto } = franjaLocalDe(ses.inicio as string);
  const horaInicio = `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:00`;

  const { data: suyasRows } = await admin.from('plazas_fijas').select(COLUMNAS_PLAZA_FIJA)
    .eq('studio_id', studioId).eq('socio_id', socioId).in('estado', ['ACTIVA', 'PAUSADA']);
  const suyas = (suyasRows ?? []).map(r => plazaFijaDeFila(r as Record<string, unknown>));
  const anterior = plazaId ? suyas.find(p => p.id === plazaId) ?? null : null;
  if (plazaId && !anterior) return { ok: false as const, error: 'Plaza fija no encontrada' };

  // PAUSADA cuenta también: pausar y volver a la misma clase no puede dejar dos
  // filas para la misma franja.
  const hoyPlaza = hoyEnEstudio();
  const cuentan = opciones.ignorarVencidas ? suyas.filter(p => !p.vigenciaHasta || p.vigenciaHasta >= hoyPlaza) : suyas;
  const duplicada = cuentan.some(p => p.id !== plazaId
    && p.diaSemana === dow && normalizarHoraInicio(p.horaInicio) === horaInicio && p.salaId === salaId);
  if (duplicada) return { ok: false as const, error: textos.duplicada };

  const activas = cuentan.filter(p => p.estado === 'ACTIVA').length;
  const exceso = plazaId ? null : superaLimiteSemanal(cuota, activas);
  return { ok: true as const, tipoClaseId, salaId, dow, horaInicio, suyas, anterior, activas, exceso, cuota };
}

async function guardarPlazaFijaDesdeSesion(
  admin: SupabaseClient,
  params: { studioId: string; socioId: string; datos: Omit<DatosPlazaFija, 'socioId'>; plazaId?: string },
  textos: TextosPlazaFija,
): Promise<ResultadoGuardarPlazaFija> {
  const { studioId, socioId, datos, plazaId } = params;
  // Las comprobaciones viven en `validarPlazaFijaDesdeSesion` (una sola copia, la
  // que usa también la petición desde la app). Aquí solo se decide el límite
  // semanal —el panel pide confirmarlo— y se escribe.
  const v = await validarPlazaFijaDesdeSesion(admin, params, textos);
  if (!v.ok) return { ok: false, error: v.error };
  const { tipoClaseId, salaId, dow, horaInicio, anterior, activas, exceso } = v;

  if (!plazaId && !datos.confirmarLimite && exceso) {
    return {
      ok: false, codigo: 'SUPERA_LIMITE', limite: exceso.limite,
      error: `Su cuota es de ${exceso.limite} ${exceso.limite === 1 ? 'clase' : 'clases'} por semana y ya tiene ${activas} ${activas === 1 ? 'plaza fija' : 'plazas fijas'}.`,
    };
  }

  const fila = {
    dia_semana: dow, hora_inicio: horaInicio, sala_id: salaId, tipo_clase_id: tipoClaseId,
    spot_id: datos.spotId, vigencia_desde: datos.vigenciaDesde, vigencia_hasta: datos.vigenciaHasta,
  };
  const escritura = anterior
    ? await admin.from('plazas_fijas').update(fila)
        .eq('id', anterior.id).eq('studio_id', studioId).eq('socio_id', socioId)
        .select(COLUMNAS_PLAZA_FIJA).maybeSingle()
    : await admin.from('plazas_fijas').insert({ id: `pf-${uid()}`, studio_id: studioId, socio_id: socioId, ...fila, estado: 'ACTIVA' })
        .select(COLUMNAS_PLAZA_FIJA).maybeSingle();
  if (escritura.error) {
    if (escritura.error.message.includes('plazas_fijas_spot_sin_solape')) return { ok: false, error: textos.sitioOcupado };
    capturarExcepcion(new Error(escritura.error.message), { tags: { area: 'plazas-fijas' }, extra: { studioId, plazaId } });
    return { ok: false, error: 'No se pudo guardar la plaza fija' };
  }
  if (!escritura.data) return { ok: false, error: 'Plaza fija no encontrada' };
  const plaza = plazaFijaDeFila(escritura.data as unknown as Record<string, unknown>);

  // Mover de clase suelta lo que ya tenía reservado en la franja vieja, con el
  // mismo criterio que quitar (sin penalización, mantiene lo que está dentro del
  // plazo de cancelación). Cambiar solo el sitio o las fechas no toca nada.
  let canceladas: string[] = [];
  const cambiaDeClase = anterior && (anterior.diaSemana !== plaza.diaSemana
    || normalizarHoraInicio(anterior.horaInicio) !== plaza.horaInicio
    || anterior.salaId !== plaza.salaId || anterior.tipoClaseId !== plaza.tipoClaseId);
  if (anterior && cambiaDeClase) {
    canceladas = (await retirarReservasFuturasPlazaFija(admin, studioId, anterior)).canceladas;
  }

  // Mejor esfuerzo: si el motor fallara, la plaza ya está guardada y el cron de
  // esta noche la recoge.
  let creadas = 0;
  if (plaza.estado === 'ACTIVA') {
    const { data, error } = await admin.rpc('materializar_plazas_fijas', { p_horizonte_dias: HORIZONTE_MATERIALIZAR_DIAS, p_plaza_id: plaza.id });
    if (error) {
      capturarExcepcion(new Error(error.message), { tags: { area: 'plazas-fijas' }, extra: { studioId, plazaId: plaza.id } });
    } else {
      creadas = (data as number | null) ?? 0;
    }
  }

  // Lo que la pantalla tiene que poder decir de verdad: si la próxima clase ya
  // está reservada, o si no hay ninguna programada en ese horario.
  const { data: futuras } = await admin.from('sesiones').select('id, sala_id, tipo_clase_id, inicio, cancelada')
    .eq('studio_id', studioId).eq('sala_id', plaza.salaId).gt('inicio', new Date().toISOString())
    .order('inicio', { ascending: true }).limit(80);
  const proxima = (futuras ?? [])
    .map(s => ({ id: s.id as string, salaId: s.sala_id as string, tipoClaseId: (s.tipo_clase_id as string | null) ?? '', inicio: s.inicio as string, cancelada: Boolean(s.cancelada) }))
    .find(s => !s.cancelada && sesionEncajaEnPlaza(plaza, s) && !sesionEnPausa(plaza, s.inicio));
  let primeraFecha: string | null = null;
  if (proxima) {
    const { data: reservada } = await admin.from('reservas').select('id')
      .eq('sesion_id', proxima.id).eq('socio_id', socioId).in('estado', ['CONFIRMADA', 'ASISTIDA']).maybeSingle();
    if (reservada) primeraFecha = hoyEnEstudio(new Date(proxima.inicio));
  }

  return { ok: true, plaza, creadas, primeraFecha, hayClaseProgramada: Boolean(proxima), canceladas };
}

// Panel: la ruta `app/api/plazas-fijas` ya ha comprobado el rol y saca el estudio
// de la sesión. Al mover, la clienta sale de la propia plaza, nunca del body.
export async function guardarPlazaFijaStaff(
  admin: SupabaseClient,
  params: { studioId: string; datos: DatosPlazaFija; plazaId?: string },
): Promise<ResultadoGuardarPlazaFija> {
  let socioId = params.datos.socioId;
  if (params.plazaId) {
    const { data: plaza } = await admin.from('plazas_fijas').select('socio_id')
      .eq('id', params.plazaId).eq('studio_id', params.studioId).maybeSingle();
    if (!plaza) return { ok: false, error: 'Plaza fija no encontrada' };
    socioId = plaza.socio_id as string;
  }
  return guardarPlazaFijaDesdeSesion(
    admin, { studioId: params.studioId, socioId, datos: params.datos, plazaId: params.plazaId }, TEXTOS_PLAZA_FIJA_PANEL,
  );
}

type EstadoPlazaFija = 'ACTIVA' | 'PAUSADA' | 'BAJA';
type PlazaParaRetirar = Parameters<typeof reservasARetirarDePlaza>[0];
type ReservaParaRetirar = Parameters<typeof reservasARetirarDePlaza>[2][number];
type ResultadoEstadoPlazaFija =
  | { ok: true; canceladas: string[]; mantenidas: string[]; fallidas: number }
  | { error: string };

// Pausar o quitar una plaza fija SUELTA las clases que ya le había reservado
// (antes seguían confirmadas hasta 6 semanas). Qué se suelta lo decide
// `reservasARetirarDePlaza` (lógica pura): sus reservas activas futuras en ese
// horario, salvo las CONFIRMADAS que ya están dentro del plazo de cancelación.
//
// Cada una pasa por `ejecutarCancelacionReserva`, el mismo camino que cualquier
// cancelación: promociona la lista de espera y avisa a quien entra. Sin
// penalización ni recuperación (no lo ha decidido la socia clase a clase), y con
// `cancelada_motivo = 'plaza_fija_retirada'`, que hace que el barrido semanal no
// la compense y que, al reanudar, la materialización vuelva a reservarla.
// Con `rango` (pausa con fechas) solo se sueltan las clases de esas fechas.
async function retirarReservasFuturasPlazaFija(
  admin: SupabaseClient, studioId: string, plaza: PlazaParaRetirar, rango?: Pausa,
): Promise<{ canceladas: string[]; mantenidas: string[]; fallidas: number }> {
  const ahoraMs = Date.now();
  // Se parte de SUS reservas activas (pocas), no de las sesiones futuras de la
  // sala (pueden ser cientos con una serie larga).
  const { data: resRows } = await admin
    .from('reservas').select('id, sesion_id, socio_id, estado')
    .eq('studio_id', studioId).eq('socio_id', plaza.socioId).in('estado', ['CONFIRMADA', 'LISTA_ESPERA']);
  const reservas = (resRows ?? []).map(r => ({
    id: r.id as string, sesionId: r.sesion_id as string, socioId: r.socio_id as string, estado: r.estado,
  })) as ReservaParaRetirar[];
  if (reservas.length === 0) return { canceladas: [], mantenidas: [], fallidas: 0 };

  const { data: sesRows } = await admin
    .from('sesiones').select('id, sala_id, tipo_clase_id, inicio, cancelada')
    .eq('studio_id', studioId).in('id', [...new Set(reservas.map(r => r.sesionId))])
    .gt('inicio', new Date(ahoraMs).toISOString());
  // `tipoClaseId` '' = clase sin tipo: `SesionSlot` lo tipa como string, y tanto
  // el emparejamiento como `resolverVentanaCancelacion` lo tratan como «sin tipo».
  const sesiones = (sesRows ?? []).map(s => ({
    id: s.id as string, salaId: s.sala_id as string, tipoClaseId: (s.tipo_clase_id as string | null) ?? '',
    inicio: s.inicio as string, cancelada: (s.cancelada as boolean | null) ?? false,
  }));

  // La ventana ya resuelta por tipo de clase (manda sobre la del estudio), igual
  // que la que usa la cancelación para decidir si es tardía.
  const pol = await cargarPoliticaEstudio(admin, studioId);
  const ventanaPorTipo = new Map<string, number>();
  for (const tipo of new Set(sesiones.map(s => s.tipoClaseId))) {
    ventanaPorTipo.set(tipo, await resolverVentanaCancelacion(admin, studioId, tipo || null, pol.ventanaHoras));
  }
  const tipoDeSesion = new Map(sesiones.map(s => [s.id, s.tipoClaseId]));
  const { retirar, mantener } = reservasARetirarDePlaza(
    plaza, sesiones, reservas, ahoraMs,
    sesionId => ventanaPorTipo.get(tipoDeSesion.get(sesionId) ?? '') ?? pol.ventanaHoras,
    rango,
  );

  const canceladas: string[] = [];
  let fallidas = 0;
  // En serie a propósito: cada una puede promocionar la lista de espera de su
  // clase y avisar a quien entra, y son pocas (su horario en ~6 semanas).
  for (const reservaId of retirar) {
    const r = await ejecutarCancelacionReserva(admin, {
      studioId, reservaId, socioId: null, omitirPenalizacion: true,
      otorgarRecuperacionPlazaFija: false, motivoCancelacion: 'plaza_fija_retirada',
    });
    if ('error' in r) {
      fallidas++;
      capturarExcepcion(new Error(r.error), { tags: { area: 'plazas-fijas' }, extra: { studioId, reservaId } });
    } else {
      canceladas.push(reservaId);
    }
  }
  return { canceladas, mantenidas: mantener, fallidas };
}

// Quien se queda sin cuota (cancelada, cambiada por un bono, pausada o vencida)
// deja de tener las clases que el motor de plaza fija ya le había reservado:
// antes seguían CONFIRMADAS hasta 6 semanas, ocupando sitio y expuestas al
// barrido de faltas. Qué se suelta lo decide la BD (`reservas_plaza_fija_sin_cuota`,
// con la misma regla de cuota que usa el motor para reservar). Cada una se
// cancela como al quitar la plaza: lista de espera y avisos, sin penalización ni
// recuperación, y con `plaza_fija_retirada`, que deja que el motor se las vuelva
// a reservar si recupera la cuota. La plaza no se toca: conserva su sitio.
// Sin `studioId` barre todos los estudios (cron nocturno).
export async function soltarReservasPlazaFijaSinCuota(
  admin: SupabaseClient, filtro: { studioId?: string; socioId?: string } = {},
): Promise<{ canceladas: string[]; fallidas: number }> {
  const { data, error } = await admin.rpc('reservas_plaza_fija_sin_cuota', {
    p_studio_id: filtro.studioId ?? null, p_socio_id: filtro.socioId ?? null,
  });
  if (error) throw new Error(`reservas_plaza_fija_sin_cuota: ${error.message}`);
  const filas = (data as { studio_id: string; reserva_id: string }[] | null) ?? [];

  const canceladas: string[] = [];
  let fallidas = 0;
  // En serie, como la retirada: cada una puede promocionar la lista de espera de
  // su clase, y son pocas.
  for (const f of filas) {
    const r = await ejecutarCancelacionReserva(admin, {
      studioId: f.studio_id, reservaId: f.reserva_id, socioId: null, omitirPenalizacion: true,
      otorgarRecuperacionPlazaFija: false, motivoCancelacion: 'plaza_fija_retirada',
    });
    if ('error' in r) {
      fallidas++;
      capturarExcepcion(new Error(r.error), { tags: { area: 'plazas-fijas' }, extra: { studioId: f.studio_id, reservaId: f.reserva_id } });
    } else {
      canceladas.push(f.reserva_id);
    }
  }
  return { canceladas, fallidas };
}

async function aplicarEstadoPlazaFija(
  admin: SupabaseClient,
  params: { studioId: string; plazaId: string; estado: EstadoPlazaFija; socioId?: string },
  mensajeSitioOcupado: string,
): Promise<ResultadoEstadoPlazaFija> {
  // Reanudar vuelve a pasar las reglas de dar una plaza. Sin esto, desde la app
  // se podía pausar una plaza, crear otra (el límite semanal solo cuenta las
  // ACTIVAS) y reanudar la primera: una plaza más que su cuota, reservada cada
  // semana sin descontar nada. Y reanudar sin cuota vigente. El mostrador puede
  // pasar del límite a sabiendas (decisión del fundador), la clienta no.
  if (params.estado === 'ACTIVA') {
    let lectura = admin.from('plazas_fijas').select(COLUMNAS_PLAZA_FIJA)
      .eq('id', params.plazaId).eq('studio_id', params.studioId);
    if (params.socioId) lectura = lectura.eq('socio_id', params.socioId);
    const { data: fila } = await lectura.maybeSingle();
    if (!fila) return { error: 'Plaza fija no encontrada' as const };
    const actual = plazaFijaDeFila(fila as unknown as Record<string, unknown>);
    // Una pausa que soltó su sitio no se reanuda cambiando el estado: vuelve por la
    // misma puerta que la vuelta del cron, que comprueba que el sitio siga libre.
    if (actual.estado === 'PAUSADA' && actual.pausaLiberaSitio) {
      if (params.socioId) return { error: 'Tu clase fija está en pausa: habla con tu estudio para volver.' };
      const v = await volverDePausaPlazaFija(admin, actual, { forzar: true });
      if ('error' in v) return { error: v.error };
      if (v.accion !== 'VOLVER') return { error: mensajeSitioOcupado };
      return { ok: true as const, canceladas: [], mantenidas: [], fallidas: 0 };
    }
    if (actual.estado !== 'ACTIVA') {
      const { cuota, activas } = await cuotaParaReanudarPlaza(admin, actual);
      const textos = params.socioId ? TEXTOS_PLAZA_FIJA_ALUMNA : TEXTOS_PLAZA_FIJA_PANEL;
      if (!cuota) return { error: textos.sinCuota };
      const exceso = params.socioId ? superaLimiteSemanal(cuota, activas) : null;
      if (exceso) {
        return { error: `Tu cuota es de ${exceso.limite} ${exceso.limite === 1 ? 'clase' : 'clases'} por semana y ya tienes ${activas} ${activas === 1 ? 'clase fija activa' : 'clases fijas activas'}.` };
      }
    }
  }

  let consulta = admin.from('plazas_fijas')
    .update({ estado: params.estado })
    .eq('id', params.plazaId).eq('studio_id', params.studioId);
  // `.eq('socio_id', ...)` en el UPDATE, no solo en un SELECT previo: así
  // ninguna socia puede pausar/dar de baja la plaza fija de otra aunque
  // adivine su id — el filtro de propiedad vive en la propia escritura.
  if (params.socioId) consulta = consulta.eq('socio_id', params.socioId);
  const { data, error } = await consulta
    .select('id, studio_id, socio_id, dia_semana, hora_inicio, sala_id, tipo_clase_id, spot_id, vigencia_desde, vigencia_hasta, estado, creada_en')
    .maybeSingle();
  if (error) {
    // Reanudar una plaza con spot propio puede chocar si ese sitio se le dio
    // a otra socia mientras estaba en pausa (plazas_fijas_spot_sin_solape).
    if (error.message.includes('plazas_fijas_spot_sin_solape')) return { error: mensajeSitioOcupado };
    return { error: 'No se pudo actualizar la plaza fija' as const };
  }
  if (!data) return { error: 'Plaza fija no encontrada' as const };
  // Quitada la plaza, lo que se pidiera sobre ella (una pausa, su vuelta) ya no
  // tiene respuesta posible: sale de la bandeja.
  if (params.estado === 'BAJA') {
    const { error: errSolicitudes } = await admin.from('solicitudes_plaza_fija')
      .update({ estado: 'CADUCADA', resuelta_en: new Date().toISOString() })
      .eq('studio_id', params.studioId).eq('plaza_id', params.plazaId).eq('estado', 'PENDIENTE');
    if (errSolicitudes) {
      capturarExcepcion(new Error(errSolicitudes.message), { tags: { area: 'plazas-fijas' }, extra: { studioId: params.studioId, plazaId: params.plazaId } });
    }
  }
  // Reanudar no reserva nada al momento: la materialización de esta noche la
  // recoge, incluidas las clases que se soltaron al pausar.
  if (params.estado === 'ACTIVA') return { ok: true as const, canceladas: [], mantenidas: [], fallidas: 0 };

  const plaza = {
    id: data.id, studioId: data.studio_id, socioId: data.socio_id, diaSemana: data.dia_semana,
    horaInicio: data.hora_inicio, salaId: data.sala_id, tipoClaseId: data.tipo_clase_id ?? null,
    spotId: data.spot_id ?? null, vigenciaDesde: data.vigencia_desde, vigenciaHasta: data.vigencia_hasta ?? null,
    estado: data.estado, creadaEn: data.creada_en,
  } as PlazaParaRetirar;
  const retirada = await retirarReservasFuturasPlazaFija(admin, params.studioId, plaza);
  return { ok: true as const, ...retirada };
}

// Panel: la ruta `app/api/plazas-fijas/estado` ya ha comprobado el rol
// (`puedeGestionarClientas`) y saca el estudio de la sesión de staff.
export async function cambiarEstadoPlazaFijaStaff(
  admin: SupabaseClient, params: { studioId: string; plazaId: string; estado: EstadoPlazaFija },
): Promise<ResultadoEstadoPlazaFija> {
  return aplicarEstadoPlazaFija(admin, params, 'Ese sitio ya está asignado a otra clienta en ese día y hora');
}

// Pausa con fechas desde el panel (vacaciones, una lesión…). El motor se salta
// esas fechas (lib/plazas-fijas-pausa.ts) y al ponerla se sueltan SOLO las clases
// de esas fechas, por el mismo camino que quitar.
//
// Qué pasa con su sitio lo decide el estudio al ponerla
// (`studios.plaza_fija_pausa_libera_sitio`) y queda escrito en la plaza, así que
// cambiar el ajuste no toca las pausas ya puestas:
//   · conserva su sitio (lo de siempre): la plaza sigue ACTIVA, y el motor se
//     vuelve a pasar por ella, así que al quitar o acortar la pausa las semanas que
//     vuelven quedan reservadas ya y no a las 2:00 (lo cancelado con
//     `plaza_fija_retirada` se puede volver a reservar; lo que canceló la socia, no);
//   · su sitio queda libre: cuando la pausa empieza y le queda más de una semana, la
//     plaza pasa a PAUSADA (`tocaLiberarSitio`). Desde ahí solo se puede cambiar
//     hasta cuándo dura, y volver es `volverDePausaPlazaFija`.
type ResultadoPausaServidor =
  | { ok: true; plaza: PlazaFijaServidor; canceladas: string[]; mantenidas: string[]; fallidas: number; creadas: number }
  | { error: string };

export async function pausarPlazaFijaStaff(
  admin: SupabaseClient, params: { studioId: string; plazaId: string; pausa: Pausa | null },
): Promise<ResultadoPausaServidor> {
  const { studioId, plazaId, pausa } = params;
  const hoy = hoyEnEstudio();
  if (pausa) {
    const motivo = validarPausa(pausa.desde, pausa.hasta, hoy);
    if (motivo) return { error: motivo };
  }
  const [{ data: fila }, { data: studio }] = await Promise.all([
    admin.from('plazas_fijas').select(COLUMNAS_PLAZA_FIJA).eq('id', plazaId).eq('studio_id', studioId).maybeSingle(),
    admin.from('studios').select('plaza_fija_pausa_libera_sitio').eq('id', studioId).maybeSingle(),
  ]);
  if (!fila) return { error: 'Plaza fija no encontrada' };
  const actual = plazaFijaDeFila(fila as unknown as Record<string, unknown>);
  const conSitioLibre = actual.estado === 'PAUSADA' && actual.pausaLiberaSitio === true;
  // Una plaza de baja, o pausada sin fechas, no se pausa.
  if (actual.estado !== 'ACTIVA' && !conSitioLibre) return { error: 'Plaza fija no encontrada' };

  if (conSitioLibre) {
    if (!pausa) {
      const v = await volverDePausaPlazaFija(admin, actual, { forzar: true });
      if ('error' in v) return { error: v.error };
      if (v.accion !== 'VOLVER') return { error: 'Su sitio lo tiene ahora otra clienta: cámbiale el sitio de la plaza fija o quítasela.' };
      return { ok: true, plaza: v.plaza, canceladas: [], mantenidas: [], fallidas: 0, creadas: v.creadas };
    }
    // Hacer que empiece más tarde le devolvería un sitio que ya puede tener otra.
    if (pausa.desde > hoy) return { error: 'La pausa ya ha empezado y su sitio está libre: solo puedes cambiar hasta cuándo dura, o quitarla.' };
    const { data, error } = await admin.from('plazas_fijas')
      .update({ pausa_desde: pausa.desde, pausa_hasta: pausa.hasta })
      .eq('id', plazaId).eq('studio_id', studioId).eq('estado', 'PAUSADA').eq('pausa_libera_sitio', true)
      .select(COLUMNAS_PLAZA_FIJA).maybeSingle();
    if (error) {
      capturarExcepcion(new Error(error.message), { tags: { area: 'plazas-fijas' }, extra: { studioId, plazaId } });
      return { error: 'No se pudo guardar la pausa' };
    }
    if (!data) return { error: 'Plaza fija no encontrada' };
    const plaza = plazaFijaDeFila(data as unknown as Record<string, unknown>);
    // El motor no le reserva nada mientras está PAUSADA: si la vuelta cae ahora en
    // la última semana, el cron de esta noche la decide.
    const retirada = await retirarReservasFuturasPlazaFija(admin, studioId, plaza, pausa);
    return { ok: true, plaza, ...retirada, creadas: 0 };
  }

  // Cambiar una pausa que sigue en pie conserva cómo se puso; una nueva sigue el
  // ajuste del estudio. Sin poder leerlo, conserva el sitio (lo de siempre).
  const liberaSitio = !pausa
    ? false
    : estadoPausa(actual, hoy) !== 'sin_pausa'
      ? actual.pausaLiberaSitio === true
      : studio?.plaza_fija_pausa_libera_sitio === true;
  const liberarYa = !!pausa && tocaLiberarSitio({ pausaDesde: pausa.desde, pausaHasta: pausa.hasta, liberaSitio }, hoy);

  // El filtro de estado va en la propia escritura.
  const { data, error } = await admin.from('plazas_fijas')
    .update({
      pausa_desde: pausa?.desde ?? null, pausa_hasta: pausa?.hasta ?? null, pausa_libera_sitio: liberaSitio,
      ...(liberarYa ? { estado: 'PAUSADA' } : {}),
    })
    .eq('id', plazaId).eq('studio_id', studioId).eq('estado', 'ACTIVA')
    .select(COLUMNAS_PLAZA_FIJA).maybeSingle();
  if (error) {
    capturarExcepcion(new Error(error.message), { tags: { area: 'plazas-fijas' }, extra: { studioId, plazaId } });
    return { error: 'No se pudo guardar la pausa' };
  }
  if (!data) return { error: 'Plaza fija no encontrada' };
  const plaza = plazaFijaDeFila(data as unknown as Record<string, unknown>);

  const retirada = pausa
    ? await retirarReservasFuturasPlazaFija(admin, studioId, plaza, pausa)
    : { canceladas: [] as string[], mantenidas: [] as string[], fallidas: 0 };
  if (liberarYa) return { ok: true, plaza, ...retirada, creadas: 0 };

  // Mejor esfuerzo, como al guardar: si el motor fallara, el cron de esta noche lo recoge.
  let creadas = 0;
  const { data: n, error: errorMotor } = await admin.rpc('materializar_plazas_fijas', { p_horizonte_dias: HORIZONTE_MATERIALIZAR_DIAS, p_plaza_id: plaza.id });
  if (errorMotor) {
    capturarExcepcion(new Error(errorMotor.message), { tags: { area: 'plazas-fijas' }, extra: { studioId, plazaId } });
  } else {
    creadas = (n as number | null) ?? 0;
  }
  return { ok: true, plaza, ...retirada, creadas };
}

// Las dos reglas de dar una plaza que se vuelven a pasar al reanudarla: la cuota
// que cubre su clase y cuántas plazas fijas ACTIVAS tiene ya, sin contar esta.
async function cuotaParaReanudarPlaza(
  admin: SupabaseClient, plaza: Pick<PlazaFijaServidor, 'id' | 'studioId' | 'socioId' | 'tipoClaseId'>,
) {
  const [{ data: susRows }, { data: planRows }, { data: activasRows }] = await Promise.all([
    admin.from('suscripciones').select('*').eq('studio_id', plaza.studioId).eq('socio_id', plaza.socioId).eq('estado', 'ACTIVA'),
    admin.from('planes_tarifa').select('*').eq('studio_id', plaza.studioId),
    admin.from('plazas_fijas').select('id').eq('studio_id', plaza.studioId).eq('socio_id', plaza.socioId).eq('estado', 'ACTIVA').neq('id', plaza.id),
  ]);
  const planes = await hidratarTiposDePlanes(admin as never, plaza.studioId, (planRows ?? []).map(mapPlanTarifa));
  const cuota = cuotaParaPlazaFija(plaza.socioId, (susRows ?? []).map(mapSuscripcion), planes, hoyEnEstudio(), plaza.tipoClaseId);
  const activas = (activasRows ?? []).length;
  return { cuota, activas, exceso: cuota ? superaLimiteSemanal(cuota, activas) : null };
}

export type ResultadoVueltaDePausa =
  | { accion: 'VOLVER'; plaza: PlazaFijaServidor; creadas: number }
  | { accion: 'PREGUNTAR'; motivo: MotivoVueltaPendiente }
  | { accion: 'IMPOSIBLE'; motivo: 'SITIO_OCUPADO' }
  | { error: string };

// La vuelta de una pausa que dejó su sitio libre. Qué hacer lo decide
// `decidirVueltaDePausa` (lógica pura); aquí se leen los datos y se escribe.
//   · `forzar` = lo pide el estudio (quitar la pausa, reanudar o aprobar la vuelta):
//     no mira cupo ni límite semanal, pero sí que tenga cuota, como reanudar desde
//     el panel, y nunca le quita el sitio a otra clienta.
//   · sin `forzar` = el cron: vuelve sola o deja la pregunta en la bandeja.
// Al volver entra al final de la cola (`creada_en`): quien soltó su sitio no se
// cuela delante de quien lo ha tenido mientras tanto.
export async function volverDePausaPlazaFija(
  admin: SupabaseClient, plaza: PlazaFijaServidor,
  opciones: { forzar: boolean; politica?: PoliticaFinPausa; materializar?: boolean },
): Promise<ResultadoVueltaDePausa> {
  const extra = { studioId: plaza.studioId, plazaId: plaza.id };
  const [{ data: hueco, error: errHueco }, { cuota, exceso }] = await Promise.all([
    admin.rpc('plaza_fija_hueco_para_volver', { p_plaza_id: plaza.id }),
    cuotaParaReanudarPlaza(admin, plaza),
  ]);
  if (errHueco || typeof hueco !== 'string') {
    capturarExcepcion(new Error(errHueco?.message ?? 'hueco sin respuesta'), { tags: { area: 'plazas-fijas' }, extra });
    return { error: 'No se pudo comprobar si su sitio sigue libre' };
  }
  if (opciones.forzar && !cuota) return { error: TEXTOS_PLAZA_FIJA_PANEL.sinCuota };

  const decision = decidirVueltaDePausa({
    politica: opciones.politica ?? 'PENDIENTE_CONFIRMAR', hueco: hueco as HuecoParaVolver,
    tieneCuota: !!cuota, superaLimite: !!exceso, forzar: opciones.forzar,
  });
  if (decision.accion === 'IMPOSIBLE') return decision;
  if (decision.accion === 'PREGUNTAR') {
    const { data: pregunta, error } = await admin.from('solicitudes_plaza_fija').insert({
      studio_id: plaza.studioId, socio_id: plaza.socioId, tipo: 'REANUDAR', origen: 'SISTEMA',
      plaza_id: plaza.id, motivo_sistema: decision.motivo,
    }).select('id').single();
    // 23505: ya hay una pendiente para esta plaza; es la misma pregunta y ya se avisó.
    if (error && error.code !== '23505') {
      capturarExcepcion(new Error(error.message), { tags: { area: 'plazas-fijas' }, extra });
      return { error: 'No se pudo dejar la vuelta pendiente' };
    }
    if (pregunta) {
      const { emitirPeticionPlazaFija } = await import('@/lib/notifications/emit');
      await emitirPeticionPlazaFija(admin, {
        studioId: plaza.studioId, solicitudId: pregunta.id, socioId: plaza.socioId,
        peticion: `acaba su pausa el ${diaMes(plaza.pausaHasta)} y no ha vuelto sola a su plaza fija de ${franjaParaAlumna(plaza.diaSemana, plaza.horaInicio)}: ${textoMotivoVuelta(decision.motivo)}`,
      });
    }
    return decision;
  }

  const { data, error } = await admin.from('plazas_fijas')
    .update({ estado: 'ACTIVA', creada_en: new Date().toISOString() })
    .eq('id', plaza.id).eq('studio_id', plaza.studioId).eq('estado', 'PAUSADA')
    .select(COLUMNAS_PLAZA_FIJA).maybeSingle();
  if (error) {
    // Entre la comprobación y la escritura otra plaza se ha quedado su sitio.
    if (error.message.includes('plazas_fijas_spot_sin_solape')) return { accion: 'IMPOSIBLE', motivo: 'SITIO_OCUPADO' };
    capturarExcepcion(new Error(error.message), { tags: { area: 'plazas-fijas' }, extra });
    return { error: 'No se pudo recuperar la plaza fija' };
  }
  if (!data) return { error: 'Plaza fija no encontrada' };
  const vuelta = plazaFijaDeFila(data as unknown as Record<string, unknown>);

  // Si la pregunta estaba en la bandeja, queda respondida.
  const { error: errSolicitud } = await admin.from('solicitudes_plaza_fija')
    .update({ estado: 'APROBADA', resuelta_en: new Date().toISOString(), resultado_plaza_id: vuelta.id })
    .eq('plaza_id', vuelta.id).eq('tipo', 'REANUDAR').eq('estado', 'PENDIENTE');
  if (errSolicitud) capturarExcepcion(new Error(errSolicitud.message), { tags: { area: 'plazas-fijas' }, extra });

  let creadas = 0;
  if (opciones.materializar !== false) {
    const { data: n, error: errorMotor } = await admin.rpc('materializar_plazas_fijas', { p_horizonte_dias: HORIZONTE_MATERIALIZAR_DIAS, p_plaza_id: vuelta.id });
    if (errorMotor) capturarExcepcion(new Error(errorMotor.message), { tags: { area: 'plazas-fijas' }, extra });
    else creadas = (n as number | null) ?? 0;
  }
  return { accion: 'VOLVER', plaza: vuelta, creadas };
}

// Las pausas que dejan su sitio libre, antes del motor y en dos pasos: las que
// empiezan (y les queda más de una semana) pasan a PAUSADA, y a las que les queda
// una semana se les decide la vuelta. Lo que vuelve lo reserva el motor en esta
// misma pasada. Una pausa que ya está en la bandeja no se vuelve a decidir: la
// decide el estudio.
async function repasarPausasConSitioLibre(admin: SupabaseClient): Promise<void> {
  const hoy = hoyEnEstudio();
  const limite = fechaLimiteDecidirVuelta(hoy);

  const { error: errLiberar } = await admin.from('plazas_fijas')
    .update({ estado: 'PAUSADA' })
    .eq('estado', 'ACTIVA').eq('pausa_libera_sitio', true).lte('pausa_desde', hoy).gt('pausa_hasta', limite);
  if (errLiberar) capturarExcepcion(new Error(errLiberar.message), { tags: { area: 'plazas-fijas' }, extra: { paso: 'liberar-sitio' } });

  const { data: filas, error } = await admin.from('plazas_fijas').select(COLUMNAS_PLAZA_FIJA)
    .eq('estado', 'PAUSADA').eq('pausa_libera_sitio', true).lte('pausa_hasta', limite);
  if (error) throw new Error(`pausas por volver: ${error.message}`);
  const plazas = (filas ?? []).map(f => plazaFijaDeFila(f as unknown as Record<string, unknown>));
  if (plazas.length === 0) return;

  const [{ data: pendientes, error: errPendientes }, { data: studios }] = await Promise.all([
    admin.from('solicitudes_plaza_fija').select('plaza_id')
      .eq('tipo', 'REANUDAR').eq('estado', 'PENDIENTE').in('plaza_id', plazas.map(p => p.id)),
    admin.from('studios').select('id, plaza_fija_fin_pausa').in('id', [...new Set(plazas.map(p => p.studioId))]),
  ]);
  // Sin saber cuáles están ya en la bandeja no se decide nada: mañana se repite.
  if (errPendientes) throw new Error(`vueltas pendientes: ${errPendientes.message}`);
  const yaPreguntadas = new Set((pendientes ?? []).map(p => p.plaza_id));
  const politicaDe = new Map((studios ?? []).map(s => [s.id, s.plaza_fija_fin_pausa as PoliticaFinPausa]));

  await mapLimit(plazas.filter(p => !yaPreguntadas.has(p.id)), CONCURRENCIA_AVISOS, async (p) => {
    try {
      // Sin su ajuste, se pregunta: devolver una plaza sin permiso es peor que preguntar de más.
      await volverDePausaPlazaFija(admin, p, { forzar: false, politica: politicaDe.get(p.studioId), materializar: false });
    } catch (e) {
      capturarExcepcion(e, { tags: { area: 'plazas-fijas' }, extra: { studioId: p.studioId, plazaId: p.id } });
    }
  });
}


// ─── Plaza fija desde la app: peticiones que decide el estudio ────────────────
// (migr 20260915231920). La alumna PIDE —una plaza o una pausa— y nada cambia
// hasta que el estudio aprueba; cada puerta la abre su ajuste del estudio y, con
// el ajuste apagado, 403. Pasar del límite semanal no bloquea la petición: se
// enseña y decide el estudio. La vuelta de una pausa que no pudo volver sola llega
// como REANUDAR (origen SISTEMA), y rechazarla quita la plaza.
// Identidad: `socioId` sale siempre del JWT (la ruta), nunca del body.

const DIAS_PLURAL = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
const DIAS_TITULO = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const franjaParaAlumna = (dow: number, hora: string) => `los ${DIAS_PLURAL[dow] ?? ''} a las ${hora.slice(0, 5)}`;
const diaMes = (ymd: string | null | undefined) => {
  if (!ymd) return '';
  const [, m, d] = ymd.split('-');
  return `${Number(d)}/${Number(m)}`;
};

export type ResultadoPeticionAlumna =
  | { ok: true; solicitudId: string; /** Aprobación automática: ya está dada, no «tu estudio te contestará». */ resuelta?: boolean; mensaje?: string }
  | { error: string; status: number };

export async function solicitarPlazaFijaAlumna(
  admin: SupabaseClient, p: { studioId: string; socioId: string; sesionId: string },
): Promise<ResultadoPeticionAlumna> {
  const { data: studio, error: errStudio } = await admin.from('studios')
    .select('plaza_fija_solicitar_desde_app').eq('id', p.studioId).maybeSingle();
  if (errStudio) throw new Error(errStudio.message);
  if (studio?.plaza_fija_solicitar_desde_app !== true) {
    return { error: 'Tu estudio da las clases fijas en recepción: pídesela a ellos.', status: 403 };
  }
  // Las mismas comprobaciones que dar la plaza: lo que no se le podría dar, no se pide.
  const v = await validarPlazaFijaDesdeSesion(admin, {
    studioId: p.studioId, socioId: p.socioId,
    datos: { sesionId: p.sesionId, spotId: null, vigenciaDesde: hoyEnEstudio(), vigenciaHasta: null },
  }, TEXTOS_PLAZA_FIJA_ALUMNA);
  if (!v.ok) return { error: v.error, status: v.error === 'Clase no encontrada' ? 404 : 400 };

  const { data, error } = await admin.from('solicitudes_plaza_fija').insert({
    studio_id: p.studioId, socio_id: p.socioId, tipo: 'CREAR', sesion_id: p.sesionId,
    dia_semana: v.dow, hora_inicio: v.horaInicio, sala_id: v.salaId, tipo_clase_id: v.tipoClaseId,
    supera_limite: !!v.exceso,
  }).select('id').single();
  if (error) {
    if (error.code === '23505') return { error: 'Ya has pedido esta clase fija: tu estudio te contestará.', status: 409 };
    throw new Error(error.message);
  }
  const { emitirPeticionPlazaFija } = await import('@/lib/notifications/emit');
  await emitirPeticionPlazaFija(admin, {
    studioId: p.studioId, solicitudId: data.id, socioId: p.socioId,
    peticion: `pide plaza fija ${franjaParaAlumna(v.dow, v.horaInicio)}${v.exceso ? `, y pasaría del límite de ${v.exceso.limite} por semana de su cuota` : ''}`,
  });
  return { ok: true, solicitudId: data.id };
}

export async function solicitarPausaPlazaFijaAlumna(
  admin: SupabaseClient, p: { studioId: string; socioId: string; plazaId: string; desde: string; hasta: string },
): Promise<ResultadoPeticionAlumna> {
  const hoy = hoyEnEstudio();
  const [{ data: studio, error: errStudio }, { data: fila }] = await Promise.all([
    admin.from('studios').select('plaza_fija_pausa_desde_app').eq('id', p.studioId).maybeSingle(),
    // La propiedad va en la lectura: nadie pide la pausa de la plaza de otra.
    admin.from('plazas_fijas').select(COLUMNAS_PLAZA_FIJA)
      .eq('id', p.plazaId).eq('studio_id', p.studioId).eq('socio_id', p.socioId).maybeSingle(),
  ]);
  if (errStudio) throw new Error(errStudio.message);
  if (studio?.plaza_fija_pausa_desde_app !== true) {
    return { error: 'Tu estudio gestiona las pausas en recepción: pídesela a ellos.', status: 403 };
  }
  if (!fila) return { error: 'Plaza fija no encontrada', status: 404 };
  const plaza = plazaFijaDeFila(fila as unknown as Record<string, unknown>);
  if (plaza.estado !== 'ACTIVA') return { error: 'Tu clase fija ya está en pausa.', status: 400 };
  if (estadoPausa(plaza, hoy) !== 'sin_pausa') {
    return { error: 'Tu clase fija ya tiene una pausa: si quieres cambiarla, habla con tu estudio.', status: 400 };
  }
  const motivo = validarPausa(p.desde, p.hasta, hoy);
  if (motivo) return { error: motivo, status: 400 };

  const { data, error } = await admin.from('solicitudes_plaza_fija').insert({
    studio_id: p.studioId, socio_id: p.socioId, tipo: 'PAUSAR', plaza_id: plaza.id,
    desde_propuesta: p.desde, hasta_propuesta: p.hasta,
  }).select('id').single();
  if (error) {
    if (error.code === '23505') return { error: 'Ya has pedido una pausa para esta clase fija: tu estudio te contestará.', status: 409 };
    throw new Error(error.message);
  }
  const { emitirPeticionPlazaFija } = await import('@/lib/notifications/emit');
  await emitirPeticionPlazaFija(admin, {
    studioId: p.studioId, solicitudId: data.id, socioId: p.socioId,
    peticion: `pide pausar su plaza fija de ${franjaParaAlumna(plaza.diaSemana, plaza.horaInicio)} del ${diaMes(p.desde)} al ${diaMes(p.hasta)}`,
  });
  return { ok: true, solicitudId: data.id };
}

/** Solo las suyas, solo pendientes y solo las que pidió ella (la vuelta de una pausa la decide el estudio). */
export async function cancelarPeticionPlazaFijaAlumna(
  admin: SupabaseClient, p: { studioId: string; socioId: string; solicitudId: string },
): Promise<{ ok: true } | { error: string; status: number }> {
  const { data, error } = await admin.from('solicitudes_plaza_fija')
    .update({ estado: 'CANCELADA', resuelta_en: new Date().toISOString() })
    .eq('id', p.solicitudId).eq('studio_id', p.studioId).eq('socio_id', p.socioId)
    .eq('origen', 'ALUMNA').eq('estado', 'PENDIENTE')
    .select('id').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { error: 'Esta petición ya no está pendiente: tu estudio ya la ha contestado.', status: 409 };
  return { ok: true };
}

export interface PeticionPlazaFijaPanel {
  id: string;
  tipo: 'CREAR' | 'PAUSAR' | 'REANUDAR' | 'CREAR_CLASE_FIJA' | 'AMPLIAR_CLASE_FIJA';
  socioId: string;
  socia: string;
  /** «Martes 10:00 · Reformer» */
  franja: string;
  superaLimite: boolean;
  /** PAUSAR: las fechas que pide. REANUDAR: `hasta` es el fin de su pausa. */
  desde: string | null;
  hasta: string | null;
  motivoSistema: MotivoVueltaPendiente | null;
  creadaEn: string;
  /** CREAR_CLASE_FIJA / AMPLIAR_CLASE_FIJA: la oferta, lo que eligió y si tiene sitio (solo aplica a crear). */
  claseFija?: { nombre: string; duracion: string; hasta: string; aviso: string | null } | null;
}

type FilaPeticion = {
  id: string; tipo: PeticionPlazaFijaPanel['tipo']; socio_id: string; plaza_id: string | null;
  sesion_id: string | null; dia_semana: number | null; hora_inicio: string | null; tipo_clase_id: string | null;
  supera_limite: boolean; desde_propuesta: string | null; hasta_propuesta: string | null;
  motivo_sistema: string | null; creada_en: string;
  clase_fija_id: string | null; duracion_meses: number | null; vigencia_hasta_propuesta: string | null;
};
const COLUMNAS_PETICION = 'id, tipo, socio_id, plaza_id, sesion_id, dia_semana, hora_inicio, tipo_clase_id, supera_limite, desde_propuesta, hasta_propuesta, motivo_sistema, creada_en, clase_fija_id, duracion_meses, vigencia_hasta_propuesta';

/** Las pendientes del estudio, la más antigua primero. La ruta ya ha comprobado el rol. */
export async function listarPeticionesPlazaFija(admin: SupabaseClient, studioId: string): Promise<PeticionPlazaFijaPanel[]> {
  const { data, error } = await admin.from('solicitudes_plaza_fija').select(COLUMNAS_PETICION)
    .eq('studio_id', studioId).eq('estado', 'PENDIENTE').order('creada_en', { ascending: true }).limit(50);
  if (error) throw new Error(error.message);
  const filas = (data ?? []) as unknown as FilaPeticion[];
  if (filas.length === 0) return [];

  const plazaIds = [...new Set(filas.map(f => f.plaza_id).filter((x): x is string => !!x))];
  const socioIds = [...new Set(filas.map(f => f.socio_id))];
  const [plazasRes, sociosRes] = await Promise.all([
    plazaIds.length
      ? admin.from('plazas_fijas').select(COLUMNAS_PLAZA_FIJA).eq('studio_id', studioId).in('id', plazaIds)
      : Promise.resolve({ data: [], error: null }),
    admin.from('socios').select('id, nombre, apellidos').eq('studio_id', studioId).in('id', socioIds),
  ]);
  if (plazasRes.error) throw new Error(plazasRes.error.message);
  if (sociosRes.error) throw new Error(sociosRes.error.message);
  const plazas = new Map((plazasRes.data ?? []).map(r => {
    const pf = plazaFijaDeFila(r as unknown as Record<string, unknown>);
    return [pf.id, pf] as const;
  }));
  const tipoIds = [...new Set([
    ...filas.map(f => f.tipo_clase_id), ...[...plazas.values()].map(pf => pf.tipoClaseId),
  ].filter((x): x is string => !!x))];
  const { data: tipos, error: errTipos } = tipoIds.length
    ? await admin.from('tipos_clase').select('id, nombre').eq('studio_id', studioId).in('id', tipoIds)
    : { data: [] as { id: string; nombre: string }[], error: null };
  if (errTipos) throw new Error(errTipos.message);
  const nombreTipo = new Map((tipos ?? []).map(t => [t.id as string, t.nombre as string]));
  const nombreSocia = new Map((sociosRes.data ?? []).map(s =>
    [s.id as string, `${s.nombre ?? ''} ${s.apellidos ?? ''}`.trim() || 'Una clienta']));
  // Las clases fijas pedidas (crear o ampliar): su nombre y si todavía tienen sitio.
  const ofertas = filas.some(f => f.tipo === 'CREAR_CLASE_FIJA' || f.tipo === 'AMPLIAR_CLASE_FIJA')
    ? await (await import('@/lib/db/clases-fijas')).resumenOfertasPendientes(admin, studioId, filas.map(f => f.clase_fija_id).filter((x): x is string => !!x))
    : new Map<string, { nombre: string; estado: string; plazasLibres: number | null }>();

  return filas.flatMap((f): PeticionPlazaFijaPanel[] => {
    if (f.tipo === 'CREAR_CLASE_FIJA' || f.tipo === 'AMPLIAR_CLASE_FIJA') {
      const o = f.clase_fija_id ? ofertas.get(f.clase_fija_id) : null;
      // Su oferta se borró: no hay nada que decidir (las peticiones se van con ella).
      if (!o) return [];
      const [, m, d] = (f.vigencia_hasta_propuesta ?? '').split('-');
      // Ampliar no compite por plaza (no crea franjas nuevas): «completa» solo avisa al crear.
      const aviso = f.tipo === 'CREAR_CLASE_FIJA' && o.estado === 'COMPLETA'
        ? 'La clase fija está completa: si la aprueba, pasa del tope de plazas.'
        : o.estado === 'SIN_CLASES' ? 'Alguna de sus clases ya no está programada: no se le podrá dar.' : null;
      return [{
        id: f.id, tipo: f.tipo, socioId: f.socio_id, socia: nombreSocia.get(f.socio_id) ?? 'Una clienta',
        franja: `Clase fija «${o.nombre}»`, superaLimite: f.supera_limite, desde: null, hasta: null, motivoSistema: null,
        creadaEn: f.creada_en,
        claseFija: {
          nombre: o.nombre, hasta: `${Number(d)}/${Number(m)}`, aviso,
          duracion: f.duracion_meses ? etiquetaDuracion(f.duracion_meses) : '',
        },
      }];
    }
    const plaza = f.plaza_id ? plazas.get(f.plaza_id) : null;
    // Una pausa o su vuelta sobre una plaza que ya no existe no tiene nada que decidir.
    if (f.tipo !== 'CREAR' && !plaza) return [];
    const dow = plaza ? plaza.diaSemana : f.dia_semana ?? 0;
    const hora = (plaza ? plaza.horaInicio : f.hora_inicio ?? '').slice(0, 5);
    const tipo = nombreTipo.get((plaza ? plaza.tipoClaseId : f.tipo_clase_id) ?? '');
    return [{
      id: f.id, tipo: f.tipo, socioId: f.socio_id, socia: nombreSocia.get(f.socio_id) ?? 'Una clienta',
      franja: `${DIAS_TITULO[dow] ?? ''} ${hora}${tipo ? ` · ${tipo}` : ''}`,
      superaLimite: f.supera_limite,
      desde: f.tipo === 'PAUSAR' ? f.desde_propuesta : null,
      hasta: f.tipo === 'PAUSAR' ? f.hasta_propuesta : f.tipo === 'REANUDAR' ? plaza?.pausaHasta ?? null : null,
      motivoSistema: (f.motivo_sistema as MotivoVueltaPendiente | null) ?? null,
      creadaEn: f.creada_en,
    }];
  });
}

export type ResultadoResolverPeticion =
  | { ok: true; mensaje: string }
  | { error: string; status: number; codigo?: 'SUPERA_LIMITE' };

// Aprobar o rechazar una petición. Aprobar reutiliza las mismas puertas que el
// mostrador (dar la plaza, pausarla, volver de la pausa), así que vuelve a pasar
// todas sus reglas en el momento de decidir, no en el de pedir. Rechazar la vuelta
// de una pausa quita la plaza (la pantalla lo pide confirmar).
export async function resolverPeticionPlazaFija(
  admin: SupabaseClient,
  p: { studioId: string; userId: string; solicitudId: string; aprobar: boolean; motivo: string | null; confirmarLimite: boolean },
): Promise<ResultadoResolverPeticion> {
  const { data: fila, error } = await admin.from('solicitudes_plaza_fija').select(`${COLUMNAS_PETICION}, estado`)
    .eq('id', p.solicitudId).eq('studio_id', p.studioId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!fila) return { error: 'Petición no encontrada', status: 404 };
  const sol = fila as unknown as FilaPeticion & { estado: string };
  const yaResuelta = { error: 'Esta petición ya está resuelta. Recarga la página.', status: 409 } as const;
  if (sol.estado !== 'PENDIENTE') return yaResuelta;

  const ahora = () => new Date().toISOString();
  // Compare-and-set desde PENDIENTE: dos personas decidiendo a la vez no se pisan.
  const cerrar = async (estado: 'APROBADA' | 'RECHAZADA', extra: Record<string, unknown> = {}) => {
    const { data, error: errCerrar } = await admin.from('solicitudes_plaza_fija')
      .update({ estado, resuelta_en: ahora(), resuelta_por: p.userId, ...extra })
      .eq('id', sol.id).eq('studio_id', p.studioId).eq('estado', 'PENDIENTE')
      .select('id').maybeSingle();
    if (errCerrar) throw new Error(errCerrar.message);
    return !!data;
  };
  // Si la escritura que venía DESPUÉS de reclamarla falla, la petición vuelve a la
  // bandeja: mejor pendiente otra vez que resuelta sin haber hecho nada.
  const reabrir = async (desde: 'APROBADA' | 'RECHAZADA') => {
    await admin.from('solicitudes_plaza_fija')
      .update({ estado: 'PENDIENTE', resuelta_en: null, resuelta_por: null, motivo_rechazo: null })
      .eq('id', sol.id).eq('studio_id', p.studioId).eq('estado', desde);
  };
  /** Lo que solo se sabe DESPUÉS de escribir (qué plaza salió, qué fechas). */
  const anotar = async (extra: Record<string, unknown>) => {
    const { error: errAnotar } = await admin.from('solicitudes_plaza_fija')
      .update(extra).eq('id', sol.id).eq('studio_id', p.studioId);
    if (errAnotar) capturarExcepcion(new Error(errAnotar.message), { tags: { area: 'plazas-fijas' }, extra: { solicitudId: sol.id } });
  };
  const responder = async (respuesta: string) => {
    const { emitirRespuestaPlazaFija } = await import('@/lib/notifications/emit');
    await emitirRespuestaPlazaFija(admin, { studioId: p.studioId, solicitudId: sol.id, socioId: sol.socio_id, respuesta });
  };
  const conMotivo = (frase: string) => (p.motivo ? `${frase}: ${p.motivo}` : `${frase}.`);

  let plaza: PlazaFijaServidor | null = null;
  if (sol.plaza_id) {
    const { data: filaPlaza } = await admin.from('plazas_fijas').select(COLUMNAS_PLAZA_FIJA)
      .eq('id', sol.plaza_id).eq('studio_id', p.studioId).maybeSingle();
    plaza = filaPlaza ? plazaFijaDeFila(filaPlaza as unknown as Record<string, unknown>) : null;
    if (!plaza || plaza.estado === 'BAJA') {
      await admin.from('solicitudes_plaza_fija').update({ estado: 'CADUCADA', resuelta_en: ahora() })
        .eq('id', sol.id).eq('estado', 'PENDIENTE');
      return { error: 'Esa plaza fija ya no existe: la petición se ha quitado de la lista.', status: 409 };
    }
  }
  const franja = plaza
    ? franjaParaAlumna(plaza.diaSemana, plaza.horaInicio)
    : franjaParaAlumna(sol.dia_semana ?? 0, sol.hora_inicio ?? '');

  if (sol.tipo === 'CREAR_CLASE_FIJA') {
    // Una oferta entera: N plazas de golpe. Se vuelve a pasar TODO al decidir, se
    // reclama la petición y solo entonces se escribe (un insert, todas o ninguna).
    const cf = await import('@/lib/db/clases-fijas');
    const nombre = await cf.nombreDeOferta(admin, p.studioId, sol.clase_fija_id) ?? 'la clase fija';
    if (!p.aprobar) {
      if (!await cerrar('RECHAZADA', { motivo_rechazo: p.motivo })) return yaResuelta;
      await responder(conMotivo(`Tu estudio no puede darte la clase fija «${nombre}»`));
      return { ok: true, mensaje: 'Petición rechazada' };
    }
    const prep = await cf.prepararAprobacionClaseFija(admin, {
      studioId: p.studioId, socioId: sol.socio_id, claseFijaId: sol.clase_fija_id,
      vigenciaHasta: sol.vigencia_hasta_propuesta, confirmarLimite: p.confirmarLimite,
    });
    if ('error' in prep) return { error: prep.error, status: prep.status, ...(prep.codigo ? { codigo: prep.codigo } : {}) };
    if (!await cerrar('APROBADA')) return yaResuelta;
    const dadas = await cf.darPlazasDeClaseFija(admin, prep.filas);
    if ('error' in dadas) {
      await reabrir('APROBADA');
      return { error: dadas.error, status: 400 };
    }
    await anotar({ resultado_plaza_id: prep.filas[0].id });
    await responder(cf.respuestaClaseFijaAprobada(prep.nombre, prep.hasta, dadas.creadas > 0));
    return { ok: true, mensaje: 'Clase fija dada' };
  }

  if (sol.tipo === 'AMPLIAR_CLASE_FIJA') {
    // Ampliar no crea franjas nuevas (ya las tiene): no compite por plaza, así que no
    // pasa por el tope duro — solo revalida cuota/autorización y extiende la fecha.
    const cf = await import('@/lib/db/clases-fijas');
    const nombre = await cf.nombreDeOferta(admin, p.studioId, sol.clase_fija_id) ?? 'la clase fija';
    if (!p.aprobar) {
      if (!await cerrar('RECHAZADA', { motivo_rechazo: p.motivo })) return yaResuelta;
      await responder(conMotivo(`Tu estudio no puede ampliarte la clase fija «${nombre}»`));
      return { ok: true, mensaje: 'Petición rechazada' };
    }
    const prep = await cf.prepararAmpliarClaseFija(admin, {
      studioId: p.studioId, socioId: sol.socio_id, claseFijaId: sol.clase_fija_id, duracionMeses: sol.duracion_meses,
    });
    if ('error' in prep) return { error: prep.error, status: prep.status };
    if (!await cerrar('APROBADA')) return yaResuelta;
    const ampliada = await cf.aplicarAmpliarClaseFija(admin, { studioId: p.studioId, socioId: sol.socio_id, filas: prep.filas });
    if ('error' in ampliada) {
      await reabrir('APROBADA');
      return { error: ampliada.error, status: 400 };
    }
    await responder(cf.respuestaClaseFijaAmpliada(prep.nombre, prep.hasta));
    return { ok: true, mensaje: 'Clase fija ampliada' };
  }

  if (sol.tipo === 'CREAR') {
    if (!p.aprobar) {
      if (!await cerrar('RECHAZADA', { motivo_rechazo: p.motivo })) return yaResuelta;
      await responder(conMotivo(`Tu estudio no puede darte la clase fija de ${franja}`));
      return { ok: true, mensaje: 'Petición rechazada' };
    }
    // La plaza es la franja que pidió. Si su clase ya no existe o ha cambiado de
    // hora, darla desde esa clase le daría OTRA franja.
    const { data: ses } = sol.sesion_id
      ? await admin.from('sesiones').select('inicio').eq('id', sol.sesion_id).eq('studio_id', p.studioId).maybeSingle()
      : { data: null };
    const franjaActual = ses?.inicio ? franjaLocalDe(ses.inicio as string) : null;
    const horaActual = franjaActual ? `${String(franjaActual.hora).padStart(2, '0')}:${String(franjaActual.minuto).padStart(2, '0')}:00` : null;
    if (!franjaActual || franjaActual.dow !== sol.dia_semana || horaActual !== normalizarHoraInicio(sol.hora_inicio ?? '')) {
      return { error: 'La clase que pidió ya no está en ese horario: dale la plaza desde su ficha o recházala.', status: 409 };
    }
    // Se reclama ANTES de crear la plaza. Al revés —crear y luego reclamar— dos
    // personas aprobando lo mismo a la vez (recepción en el iPad y la propietaria
    // en el móvil, o un doble toque) crean DOS plazas en la misma franja: la
    // comprobación de duplicada es un lee-y-escribe y la base no tiene índice
    // único que lo impida. Con la socia reservada dos veces cada semana y nada en
    // pantalla que lo diga.
    if (!await cerrar('APROBADA')) return yaResuelta;
    const r = await guardarPlazaFijaStaff(admin, {
      studioId: p.studioId,
      datos: {
        socioId: sol.socio_id, sesionId: sol.sesion_id as string, spotId: null,
        vigenciaDesde: hoyEnEstudio(), vigenciaHasta: null, confirmarLimite: p.confirmarLimite,
      },
    });
    if (!r.ok) {
      await reabrir('APROBADA');
      return 'codigo' in r && r.codigo === 'SUPERA_LIMITE'
        ? { error: r.error, status: 409, codigo: 'SUPERA_LIMITE' }
        : { error: r.error, status: 400 };
    }
    await anotar({ resultado_plaza_id: r.plaza.id });
    await responder(`Tu estudio te ha dado la clase fija de ${franja}.${r.primeraFecha ? ' Ya tienes reservada la próxima clase.' : ''}`);
    return { ok: true, mensaje: 'Plaza fija dada' };
  }

  if (sol.tipo === 'PAUSAR') {
    if (!p.aprobar) {
      if (!await cerrar('RECHAZADA', { motivo_rechazo: p.motivo })) return yaResuelta;
      await responder(conMotivo('Tu estudio no ha aprobado la pausa de tu clase fija'));
      return { ok: true, mensaje: 'Petición rechazada' };
    }
    const pausa = { desde: sol.desde_propuesta as string, hasta: sol.hasta_propuesta as string };
    // Reclamar primero, igual que al dar la plaza: pausar dos veces lo mismo sería
    // inofensivo, pero así las tres aprobaciones se leen igual.
    if (!await cerrar('APROBADA')) return yaResuelta;
    const r = await pausarPlazaFijaStaff(admin, { studioId: p.studioId, plazaId: sol.plaza_id as string, pausa });
    if ('error' in r) {
      await reabrir('APROBADA');
      return { error: r.error, status: 400 };
    }
    await anotar({ desde_aprobada: pausa.desde, hasta_aprobada: pausa.hasta, resultado_plaza_id: r.plaza.id });
    await responder(`Tu estudio ha aprobado la pausa de tu clase fija del ${diaMes(pausa.desde)} al ${diaMes(pausa.hasta)}.`);
    return { ok: true, mensaje: 'Pausa aprobada' };
  }

  // REANUDAR
  if (p.aprobar) {
    if (!await cerrar('APROBADA')) return yaResuelta;
    const v = await volverDePausaPlazaFija(admin, plaza as PlazaFijaServidor, { forzar: true });
    if ('error' in v) {
      await reabrir('APROBADA');
      return { error: v.error, status: 400 };
    }
    if (v.accion !== 'VOLVER') {
      await reabrir('APROBADA');
      return { error: 'Su sitio lo tiene ahora otra clienta: cámbiale el sitio desde su ficha o quítale la plaza.', status: 409 };
    }
    await anotar({ resultado_plaza_id: v.plaza.id });
    await responder(`Tu clase fija de ${franja} vuelve después de tu pausa.`);
    return { ok: true, mensaje: 'Vuelve a su plaza fija' };
  }
  // Rechazar la vuelta quita la plaza. Primero se reclama la petición (nadie la
  // aprueba mientras tanto); si quitar la plaza falla, vuelve a quedar pendiente.
  if (!await cerrar('RECHAZADA', { motivo_rechazo: p.motivo })) return yaResuelta;
  const baja = await cambiarEstadoPlazaFijaStaff(admin, { studioId: p.studioId, plazaId: sol.plaza_id as string, estado: 'BAJA' });
  if ('error' in baja) {
    await admin.from('solicitudes_plaza_fija')
      .update({ estado: 'PENDIENTE', resuelta_en: null, resuelta_por: null, motivo_rechazo: null })
      .eq('id', sol.id).eq('estado', 'RECHAZADA');
    return { error: baja.error, status: 400 };
  }
  await responder(conMotivo(`Tu clase fija de ${franja} no continúa después de tu pausa`));
  return { ok: true, mensaje: 'Plaza fija quitada' };
}

// ─── Citas 1:1 auto-reservables (0046) — escrituras/lecturas públicas ─────────
// Mismo patrón de seguridad que las reservas: service-role + validación de que la
// socia (id+email) pertenece al estudio; la identidad sale del JWT, nunca del body.

// Servicios auto-reservables + instructoras + su horario fino, para pintar el
// selector de la reserva pública. No expone datos de otras socias.

export async function fetchCatalogoCitasPublico(studioId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const [{ data: servicios }, { data: disp }] = await Promise.all([
    admin.from('citas_servicios').select('*')
      .eq('studio_id', studioId).eq('activo', true).eq('auto_reservable', true)
      .order('orden', { ascending: true }),
    admin.from('citas_disponibilidad').select('*').eq('studio_id', studioId),
  ]);
  return {
    servicios: (servicios ?? []).map((r) => mapServicioCita(r as RowCitasServicios)),
    disponibilidad: (disp ?? []).map((r) => mapDisponibilidadCita(r as RowCitasDisponibilidad)),
  };
}

// Intervalos que ya ocupan la agenda de una instructora (citas activas + sesiones
// de grupo no canceladas) en un rango, para restarlos al calcular huecos.

async function cargarOcupadosInstructora(
  admin: SupabaseClient, studioId: string, instructorId: string, desdeISO: string, hastaISO: string,
): Promise<IntervaloOcupado[]> {
  const [{ data: citas }, { data: sesiones }] = await Promise.all([
    admin.from('citas').select('inicio, fin, estado')
      .eq('studio_id', studioId).eq('instructor_id', instructorId)
      .in('estado', ['PENDIENTE', 'CONFIRMADA'])
      .lt('inicio', hastaISO).gte('fin', desdeISO),
    admin.from('sesiones').select('inicio, fin, cancelada')
      .eq('studio_id', studioId).eq('instructor_id', instructorId)
      .lt('inicio', hastaISO).gte('fin', desdeISO),
  ]);
  const out: IntervaloOcupado[] = [];
  for (const c of citas ?? []) out.push({ inicio: c.inicio as string, fin: c.fin as string });
  for (const s of sesiones ?? []) {
    if (s.cancelada) continue;
    out.push({ inicio: s.inicio as string, fin: s.fin as string });
  }
  return out;
}

// Huecos reservables de una instructora para un servicio y un día (Madrid).

export async function fetchHuecosCitaPublico(params: {
  studioId: string; servicioId: string; instructorId: string; fechaLocal: string; ahora?: Date;
}): Promise<{ error: string } | { ok: true; huecos: HuecoCita[] }> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  const { data: srow } = await admin.from('citas_servicios').select('*')
    .eq('id', params.servicioId).eq('studio_id', params.studioId).maybeSingle();
  if (!srow || !srow.activo || !srow.auto_reservable) return { error: 'Servicio no disponible' };
  const servicio = mapServicioCita(srow as RowCitasServicios);

  const { data: disp } = await admin.from('citas_disponibilidad').select('*')
    .eq('studio_id', params.studioId).eq('instructor_id', params.instructorId);
  const franjas = (disp ?? []).map((r) => mapDisponibilidadCita(r as RowCitasDisponibilidad))
    .map((f) => ({ diaSemana: f.diaSemana, horaInicio: f.horaInicio, horaFin: f.horaFin }));

  // Rango del día en Madrid para cargar los ocupados (con holgura de 1 día).
  const desde = horaParedAInstante(params.fechaLocal, '00:00');
  const hasta = new Date(desde.getTime() + 36 * 3600 * 1000);
  const ocupados = await cargarOcupadosInstructora(
    admin, params.studioId, params.instructorId, desde.toISOString(), hasta.toISOString(),
  );

  const huecos = generarHuecosDia({
    fechaLocal: params.fechaLocal, franjas, duracionMin: servicio.duracionMin,
    ocupados, ahora: params.ahora ?? new Date(),
  });
  return { ok: true, huecos };
}

// P1-7 (auditoría de producto): "Cualquier instructora" en el widget público
// disparaba 1 petición HTTP (~4 queries cada una) por instructora contra un
// endpoint con rate-limit de 60/min — con 4-6 instructoras del mismo
// servicio, una socia navegando varios días podía agotar la cuota y ver "sin
// huecos" cuando era en realidad un 429. Misma lógica que
// `fetchHuecosCitaPublico`, pero con `citas_disponibilidad`/`citas`/`sesiones`
// en UNA consulta por tabla (`.in('instructor_id', ids)`) en vez de una por
// instructora, y `citas_servicios` leído una sola vez (es el mismo servicio
// para todas). El caso de UNA instructora concreta sigue usando la función de
// arriba tal cual — no se toca su contrato para no arrastrar cambios al
// e2e que ya la cubre.
export async function fetchHuecosCitaPublicoMulti(params: {
  studioId: string; servicioId: string; instructorIds: string[]; fechaLocal: string; ahora?: Date;
}): Promise<{ error: string } | { ok: true; porInstructor: Record<string, HuecoCita[]> }> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const ids = Array.from(new Set(params.instructorIds)).filter(Boolean);
  if (ids.length === 0) return { ok: true, porInstructor: {} };

  const { data: srow } = await admin.from('citas_servicios').select('*')
    .eq('id', params.servicioId).eq('studio_id', params.studioId).maybeSingle();
  if (!srow || !srow.activo || !srow.auto_reservable) return { error: 'Servicio no disponible' };
  const servicio = mapServicioCita(srow as RowCitasServicios);

  const desde = horaParedAInstante(params.fechaLocal, '00:00');
  const hasta = new Date(desde.getTime() + 36 * 3600 * 1000);

  const [{ data: disp }, { data: citas }, { data: sesiones }] = await Promise.all([
    admin.from('citas_disponibilidad').select('*')
      .eq('studio_id', params.studioId).in('instructor_id', ids),
    admin.from('citas').select('inicio, fin, estado, instructor_id')
      .eq('studio_id', params.studioId).in('instructor_id', ids)
      .in('estado', ['PENDIENTE', 'CONFIRMADA'])
      .lt('inicio', hasta.toISOString()).gte('fin', desde.toISOString()),
    admin.from('sesiones').select('inicio, fin, cancelada, instructor_id')
      .eq('studio_id', params.studioId).in('instructor_id', ids)
      .lt('inicio', hasta.toISOString()).gte('fin', desde.toISOString()),
  ]);

  const franjasPorInstructor = new Map<string, { diaSemana: number; horaInicio: string; horaFin: string }[]>();
  for (const r of disp ?? []) {
    const f = mapDisponibilidadCita(r as RowCitasDisponibilidad);
    const lista = franjasPorInstructor.get(f.instructorId) ?? [];
    lista.push({ diaSemana: f.diaSemana, horaInicio: f.horaInicio, horaFin: f.horaFin });
    franjasPorInstructor.set(f.instructorId, lista);
  }

  const ocupadosPorInstructor = new Map<string, IntervaloOcupado[]>();
  for (const c of citas ?? []) {
    const lista = ocupadosPorInstructor.get(c.instructor_id as string) ?? [];
    lista.push({ inicio: c.inicio as string, fin: c.fin as string });
    ocupadosPorInstructor.set(c.instructor_id as string, lista);
  }
  for (const s of sesiones ?? []) {
    if (s.cancelada) continue;
    const lista = ocupadosPorInstructor.get(s.instructor_id as string) ?? [];
    lista.push({ inicio: s.inicio as string, fin: s.fin as string });
    ocupadosPorInstructor.set(s.instructor_id as string, lista);
  }

  const porInstructor: Record<string, HuecoCita[]> = {};
  for (const instructorId of ids) {
    porInstructor[instructorId] = generarHuecosDia({
      fechaLocal: params.fechaLocal,
      franjas: franjasPorInstructor.get(instructorId) ?? [],
      duracionMin: servicio.duracionMin,
      ocupados: ocupadosPorInstructor.get(instructorId) ?? [],
      ahora: params.ahora ?? new Date(),
    });
  }
  return { ok: true, porInstructor };
}

// Reserva self-service de una cita 1:1. Valida socia + servicio auto-reservable +
// que el hueco cae dentro del horario fino de la instructora, y crea la cita de
// forma ATÓMICA (rpc reservar_cita serializa concurrencia y rechaza solapes).

export async function crearCitaPublica(params: {
  studioId: string; servicioId: string; instructorId: string; inicioISO: string;
  socioId: string; authUserId: string;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const socia = await validarSociaPublica(admin, params.studioId, params.socioId, params.authUserId);
  if (!socia) return { error: 'No autorizado' as const };

  const { data: srow } = await admin.from('citas_servicios').select('*')
    .eq('id', params.servicioId).eq('studio_id', params.studioId).maybeSingle();
  if (!srow || !srow.activo || !srow.auto_reservable) return { error: 'Servicio no disponible' as const };
  const servicio = mapServicioCita(srow as RowCitasServicios);

  const inicio = new Date(params.inicioISO);
  if (Number.isNaN(inicio.getTime()) || inicio.getTime() <= Date.now()) {
    return { error: 'Esa hora no es válida' as const };
  }
  const finISO = new Date(inicio.getTime() + servicio.duracionMin * 60000).toISOString();

  // La instructora debe existir en el estudio y estar activa.
  const { data: instr } = await admin.from('instructores').select('id, activo')
    .eq('id', params.instructorId).eq('studio_id', params.studioId).maybeSingle();
  if (!instr || !instr.activo) return { error: 'Instructora no disponible' as const };

  // Guardia de disponibilidad: el hueco debe caer dentro del horario fino de la
  // instructora (autoritativo en servidor; la UI solo ofrece huecos válidos).
  const { data: disp } = await admin.from('citas_disponibilidad').select('*')
    .eq('studio_id', params.studioId).eq('instructor_id', params.instructorId);
  const franjas = (disp ?? []).map((r) => mapDisponibilidadCita(r as RowCitasDisponibilidad))
    .map((f) => ({ diaSemana: f.diaSemana, horaInicio: f.horaInicio, horaFin: f.horaFin }));
  if (!dentroDeDisponibilidad({ inicioISO: inicio.toISOString(), finISO, franjas })) {
    return { error: 'Ese hueco no está disponible' as const };
  }

  const citaId = `cita-${uid()}`;
  const { data, error } = await admin.rpc('reservar_cita', {
    p_id: citaId, p_studio_id: params.studioId, p_socio_id: params.socioId,
    p_instructor_id: params.instructorId, p_servicio_id: params.servicioId,
    p_tipo: servicio.tipo, p_inicio: inicio.toISOString(), p_fin: finISO,
    p_precio: servicio.precio, p_notas: null,
  });
  if (error) return { error: error.message };
  const estado = (Array.isArray(data) ? data[0] : data) as string;
  if (estado === 'CONFLICTO') return { error: 'Ese hueco ya no está disponible' as const };

  return {
    ok: true as const, citaId, estado: 'CONFIRMADA' as const,
    inicio: inicio.toISOString(), fin: finISO,
  };
}

// Cancela una cita self-service: solo si es de la socia y aún no ha pasado.

export async function cancelarCitaPublica(params: {
  studioId: string; citaId: string; socioId: string; authUserId: string;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const socia = await validarSociaPublica(admin, params.studioId, params.socioId, params.authUserId);
  if (!socia) return { error: 'No autorizado' as const };

  const { data: cita } = await admin.from('citas').select('id, socio_id, inicio, estado')
    .eq('id', params.citaId).eq('studio_id', params.studioId).maybeSingle();
  if (!cita || cita.socio_id !== params.socioId) return { error: 'Cita no encontrada' as const };
  if (cita.estado === 'CANCELADA') return { ok: true as const };
  if (new Date(cita.inicio as string).getTime() <= Date.now()) {
    return { error: 'Esta cita ya ha pasado' as const };
  }
  const { error } = await admin.from('citas').update({ estado: 'CANCELADA' })
    .eq('id', params.citaId).eq('studio_id', params.studioId);
  if (error) return { error: error.message };
  return { ok: true as const };
}

// Login del portal: resuelve email → socia dentro del estudio (service-role).
// Sustituye la lectura anónima directa sobre socios en la página de login.
// I13: `resolverLoginSocia(slug, email)` se ELIMINÓ (junto a POST /api/public/login).
// Devolvía socioId/nombre/email para cualquier email existente, sin prueba de
// control → oráculo de enumeración de membresía/PII sin autenticar. La sustituye
// resolverSociaAutenticada (JWT), única vía de login del portal.

// Resuelve la socia de un usuario autenticado con Supabase Auth (portal con
// magic link / OTP). El usuario YA demostró que controla ese email al validar el
// JWT (a diferencia del antiguo login por email suelto, ya retirado). Vincula la
// fila de la socia a su usuario de auth la primera vez (claim), igual que el
// equipo con instructores.

export async function resolverSociaAutenticada(slug: string, authUserId: string, email: string) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  // También por dirección antigua: si no, quien entra al portal desde un enlace
  // viejo se queda sin sesión aunque su ficha exista.
  const resuelto = await resolverStudioPorSlug(admin as never, slug);
  if (!resuelto) return null;
  const studio = resuelto.row as { id: string };

  // 1) Ya vinculada: la socia de este estudio cuyo auth_user_id es este usuario.
  const { data: linked } = await admin
    // `foto_url`: la cara de la alumna, para la cabecera de su app. Sale de
    // aquí y no del payload gordo a propósito — esta respuesta ya está cacheada
    // por sesión (`cacheSocia`), así que la cabecera la tiene en TODAS las
    // pantallas sin pedir nada; leerla del catálogo habría disparado el payload
    // completo en las que hoy no lo necesitan.
    .from('socios').select('id, nombre, apellidos, email, foto_url')
    .eq('auth_user_id', authUserId).eq('studio_id', studio.id).maybeSingle();
  if (linked) {
    // ⚠️ El email de la ficha se REALINEA con el del JWT cuando difieren.
    //
    // `socios.email` es una COPIA: la identidad es `auth_user_id` (I-15), y por
    // eso una copia vieja no bloquea el acceso. Pero sí rompe cosas reales: los
    // correos que el estudio le manda salen de ahí, y una compra de invitada
    // resuelve la ficha con `.ilike('email', …)` — con el email viejo, una
    // compra hecha con el nuevo NO encontraría su ficha y le entregaría el plan
    // a una ficha nueva.
    //
    // La fuente de verdad es el JWT, que Supabase ya verificó. Y se realinea
    // aquí, en la resolución de sesión, en vez de perseguir el evento de
    // confirmación: así se cura sola cualquier deriva —un cambio de email
    // confirmado, un typo corregido en el panel— sin depender de que llegara
    // ningún webhook. Solo escribe cuando de verdad difieren.
    if (email && linked.email && linked.email.trim().toLowerCase() !== email.trim().toLowerCase()) {
      await admin.from('socios').update({ email: email.trim() }).eq('id', linked.id);
      return { socioId: linked.id, nombre: `${linked.nombre} ${linked.apellidos}`.trim(), email: email.trim(), fotoUrl: linked.foto_url ?? null };
    }
    return { socioId: linked.id, nombre: `${linked.nombre} ${linked.apellidos}`.trim(), email: linked.email, fotoUrl: linked.foto_url ?? null };
  }

  // 2) Claim: una socia de este estudio con este email y aún sin vincular. El
  //    email del JWT es de confianza (Supabase lo verificó), así que enlazamos.
  const { data: claimable } = await admin
    .from('socios').select('id, nombre, apellidos, email, foto_url')
    // Gemelo del `.ilike` de registrarSociaPublica: aquí el email viene del JWT
    // verificado, pero `%` y `_` son caracteres legales en la parte local de un
    // email, así que el patrón se escapa igual — la defensa no puede depender
    // de qué valida el proveedor de identidad.
    .ilike('email', escaparLike(email.trim())).eq('studio_id', studio.id).is('auth_user_id', null).maybeSingle();
  if (!claimable) return null;
  await admin.from('socios').update({ auth_user_id: authUserId }).eq('id', claimable.id);
  return { socioId: claimable.id, nombre: `${claimable.nombre} ${claimable.apellidos}`.trim(), email: claimable.email, fotoUrl: claimable.foto_url ?? null };
}

// Devuelve el id de la socia vinculada a un usuario de Supabase Auth dentro de
// un estudio (por auth_user_id), o null. Se usa en los endpoints que exigen
// sesión real de socia: la identidad sale del JWT verificado, NUNCA del body.

/**
 * La factura de UN recibo, y solo si ese recibo es de esta socia.
 *
 * ── Por qué esto no existía, y por qué ahora sí ──────────────────────────────
 * La pantalla de un pago llevaba una nota explicando que el botón NO estaba a
 * propósito: no había ruta que sirviera una factura a una alumna, las de
 * `app/api/facturas/*` son `verificarSesionStaff`, y la factura es un documento
 * fiscal sellado con Veri*Factu. Aquella cautela era correcta —poner un botón
 * que no entrega nada es peor que no ponerlo—, pero apuntaba al CÓMO.
 *
 * Entregar a la clienta su propia factura YA emitida es precisamente para lo
 * que existe una factura. Lo que no puede hacerse es crearla, alterarla ni
 * re-emitirla, y esto no hace nada de eso: es de solo lectura y, si no hay
 * factura, no devuelve nada (la pantalla mantiene su respaldo de «pídesela al
 * estudio»). En producción hay 25 facturas de socias identificables que hoy no
 * pueden obtener.
 *
 * ── Autorización ─────────────────────────────────────────────────────────────
 * El `socioId` lo pone quien llama DESDE EL TOKEN, nunca el body. Y la factura
 * se busca por el recibo: `recibos.socio_id = socioId` y el mismo estudio. Un
 * id de recibo ajeno no devuelve nada, no un error distinto.
 *
 * El NIF y la dirección del estudio SÍ salen de aquí, y es correcto: van
 * impresos en la propia factura por obligación legal. `studioPublico` los
 * excluye porque allí no hacen falta; aquí son el emisor del documento.
 */
/**
 * La factura de una socia, en la forma que se le puede entregar A ELLA.
 *
 * ⚠️ Devuelve `FacturaImprimible`, NO `Factura`. La diferencia es el motivo de
 * que exista esta función y no un `mapFactura` a secas: `Factura` arrastra la
 * cadena Veri*Factu del estudio (huella, huella anterior, secuencia, estado
 * ante la AEAT y CSV del acuse), y esto se serializa a JSON y viaja al
 * navegador de la clienta. Devolver la fila entera ponía el registro fiscal
 * del obligado tributario al alcance de un F12 en el móvil de una alumna,
 * aunque la pantalla no lo pintara.
 *
 * El único elemento de Veri*Factu que sí es suyo —el sello de cotejo— se
 * calcula aquí, en servidor, y viaja ya resuelto: la clienta recibe una URL,
 * no los datos con los que se construye.
 */
export async function facturaDeSociaPublica(params: {
  studioId: string; socioId: string; reciboId: string;
}): Promise<
  | { error: 'No autorizado' | 'Sin factura' }
  | {
      ok: true;
      factura: FacturaImprimible;
      emisor: { nombre: string; nif: string; direccion: string };
      receptor: { telefono: string | null; email: string | null };
      sello: SelloCliente | null;
    }
> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  // El recibo TIENE que ser suyo. Esta es la única puerta: si no cuadra, se
  // responde igual que si no hubiera factura, sin decir si el recibo existe.
  const { data: recibo } = await admin
    .from('recibos').select('id, socio_id')
    .eq('id', params.reciboId).eq('studio_id', params.studioId).eq('socio_id', params.socioId)
    .maybeSingle();
  if (!recibo) return { error: 'No autorizado' };

  const { data: fila } = await admin
    .from('facturas').select('*')
    .eq('recibo_id', params.reciboId).eq('studio_id', params.studioId)
    .maybeSingle();
  // Sin factura emitida no se inventa ninguna: muchos recibos no la llevan
  // (35 de 73 en producción), y eso es normal.
  if (!fila) return { error: 'Sin factura' };

  const { data: estudio } = await admin
    .from('studios').select('nombre, razon_social, nif, direccion, ciudad, codigo_postal')
    .eq('id', params.studioId).maybeSingle();

  const { data: socia } = await admin
    .from('socios').select('telefono, email')
    .eq('id', params.socioId).eq('studio_id', params.studioId).maybeSingle();

  const e = (estudio ?? {}) as Record<string, string | null>;
  const completa = mapFactura(fila as RowFacturas);
  const nif = e.nif ?? '';

  return {
    ok: true,
    // Lista blanca explícita, no un `delete` de lo que sobra: si mañana se
    // añade una columna a `facturas`, esto no la deja pasar sola. Mismo
    // criterio que `studioPublico()`.
    factura: {
      numeroCompleto: completa.numeroCompleto,
      fechaEmision: completa.fechaEmision,
      receptorNombre: completa.receptorNombre,
      receptorNIF: completa.receptorNIF,
      baseImponible: completa.baseImponible,
      tipoIVA: completa.tipoIVA,
      cuotaIVA: completa.cuotaIVA,
      total: completa.total,
      // Lo que se le cobró, con su nombre. La misma pantalla del portal ya
      // enseñaba el concepto real del recibo arriba y luego descargaba un PDF
      // que decía «Servicios de pilates»: dos verdades en la misma pantalla.
      concepto: completa.concepto ?? null,
    },
    emisor: {
      // La razón social manda sobre el nombre comercial: es quien emite.
      nombre: (e.razon_social || e.nombre) ?? '',
      nif,
      direccion: [e.direccion, e.codigo_postal, e.ciudad].filter(Boolean).join(', '),
    },
    receptor: { telefono: (socia?.telefono as string | null) ?? null, email: (socia?.email as string | null) ?? null },
    sello: selloParaCliente(completa, nif, { produccion: destinoDeEntorno().entorno === 'produccion' }),
  };
}

export async function socioAutenticado(authUserId: string, studioId: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data } = await admin
    .from('socios').select('id')
    .eq('auth_user_id', authUserId).eq('studio_id', studioId).maybeSingle();
  return data?.id ?? null;
}

// Marca/desmarca un tipo de clase como favorito de la socia autenticada.
// `socioId` sale de `socioAutenticado`, nunca del body — mismo criterio que
// crear/cancelar reserva. `unique(socio_id, tipo_clase_id)` en la tabla hace
// el "marcar" idempotente sin necesidad de comprobar antes si ya existía.
export async function toggleFavoritoPublico(params: {
  studioId: string; socioId: string; tipoClaseId: string; accion: 'marcar' | 'desmarcar';
}): Promise<{ ok: true } | { error: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { error: 'Service role no configurada' };
  // El id de tipo de clase llega del body: sin esta comprobación, una socia
  // podía marcar como favorito un tipo_clase de OTRO estudio (el FK solo prueba
  // que la fila existe en algún sitio, no que sea de este estudio) — corrupción
  // de datos cross-tenant. Mismo criterio que socioAutenticado con studioId.
  const { data: tipo } = await admin.from('tipos_clase').select('id')
    .eq('id', params.tipoClaseId).eq('studio_id', params.studioId).maybeSingle();
  if (!tipo) return { error: 'Ese tipo de clase no existe en este estudio.' };
  if (params.accion === 'marcar') {
    const { error } = await admin.from('favoritos_clase').upsert(
      { studio_id: params.studioId, socio_id: params.socioId, tipo_clase_id: params.tipoClaseId },
      { onConflict: 'socio_id,tipo_clase_id', ignoreDuplicates: true },
    );
    if (error) return { error: 'No se ha podido guardar el favorito.' };
    return { ok: true };
  }
  const { error } = await admin.from('favoritos_clase').delete()
    .eq('studio_id', params.studioId).eq('socio_id', params.socioId).eq('tipo_clase_id', params.tipoClaseId);
  if (error) return { error: 'No se ha podido quitar el favorito.' };
  return { ok: true };
}

/** Una clase a la que la socia YA asistió. Lo mínimo para pintar su fila. */
/**
 * El estado de la reserva embebida, normalizado.
 *
 * Con `!inner` sobre una relación uno-a-muchos PostgREST devuelve un ARRAY, y
 * la forma cambia según cómo resuelva la relación: se normaliza en vez de
 * asumirla. Sin estado reconocible se cae a `ASISTIDA`, que es lo que devolvía
 * esta consulta cuando solo traía asistidas.
 */
function estadoDeReserva(
  r: { estado?: string }[] | { estado?: string } | null,
): ClaseAsistida['estado'] {
  const bruto = Array.isArray(r) ? r[0]?.estado : r?.estado;
  return bruto === 'CANCELADA' || bruto === 'NO_SHOW' ? bruto : 'ASISTIDA';
}

export interface ClaseAsistida {
  reservaId: string;
  sesionId: string;
  /** Inicio en ISO. Quien lo pinte decide el formato y la zona. */
  inicio: string;
  nombre: string;
  instructora: string;
  /**
   * Cómo acabó.
   *
   * ⚠️ Esta consulta solo devolvía `ASISTIDA`, y por eso «Historial de clases»
   * no podía ser un historial: enseñaba la mitad de lo que pasó. Una clase que
   * la socia canceló también es su historial —y saber CUÁNDO canceló es justo
   * lo que se va a mirar cuando discuta un cargo—. Se devuelve el estado en
   * vez de tres listas: quien lo pinte decide si separa o mezcla.
   */
  estado: 'ASISTIDA' | 'CANCELADA' | 'NO_SHOW';
}

/**
 * Las clases pasadas a las que la socia asistió, de la más reciente a la más
 * antigua.
 *
 * ⚠️ Existe porque el catálogo público NO puede responder a esto:
 * `fetchPublicStudioData` acota las sesiones a `fin >= ahora` (para que el
 * aforo no arrastre meses de historia en cada carga del portal), así que una
 * clase pasada no llega nunca al cliente. Ensanchar aquella ventana habría
 * penalizado la carga de TODOS los portales, incluidos los que no enseñan
 * historial; esto se pide aparte y solo cuando hace falta.
 *
 * ⚠️ Solo `ASISTIDA`. Una `CONFIRMADA` cuya clase ya pasó no es lo mismo: o el
 * estudio no pasa lista, o no fue. Meterla aquí le contaría a la socia como
 * hecha una clase a la que quizá no fue, y este historial se suma en «clases
 * este mes».
 *
 * ⚠️ `order` + `limit` van SIEMPRE juntos y explícitos: PostgREST corta en 1000
 * filas EN SILENCIO, y sin orden estable el corte devuelve un subconjunto
 * arbitrario que además cambia entre llamadas. Es el patrón que ya costó el
 * truncado de los backups (#684).
 */
export async function historialAsistidasPublico(params: {
  studioId: string; socioId: string; limite?: number;
}): Promise<ClaseAsistida[]> {
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  // Tope duro además del que pida quien llama: esta lista se pinta de una vez,
  // sin paginar, y nadie lee 500 filas de un tirón en un móvil.
  const limite = Math.min(Math.max(params.limite ?? 30, 1), 100);

  // ⚠️ Se consulta desde `sesiones`, no desde `reservas`, y el motivo es el
  // ORDEN: la columna por la que hay que ordenar (`inicio`) vive aquí. Al
  // revés habría que ordenar por una columna de la tabla EMBEBIDA, que
  // depende de cómo PostgREST resuelva ese caso — y si no lo aplicara, el
  // `limit` se llevaría 30 filas arbitrarias en vez de las 30 últimas, en
  // silencio y sin fallar. Ordenar por una columna de la tabla de la que se
  // selecciona no tiene esa duda.
  //
  // El filtro por socia va sobre la reserva embebida con `!inner`, así que una
  // sesión sin reserva suya no entra.
  const { data, error } = await admin
    .from('sesiones')
    .select('id, inicio, tipo_clase_id, instructor_id, reservas!inner(id, socio_id, estado, studio_id)')
    .eq('studio_id', params.studioId)
    .eq('reservas.studio_id', params.studioId)
    .eq('reservas.socio_id', params.socioId)
    // ⚠️ Las tres, no solo las asistidas. «Completadas» de la agenda SÍ filtra
    // a `ASISTIDA` al pintarlas: si no, una clase cancelada aparecería como
    // completada, que es exactamente lo contrario de lo que pasó.
    .in('reservas.estado', ['ASISTIDA', 'CANCELADA', 'NO_SHOW'])
    .lt('inicio', new Date().toISOString())
    .order('inicio', { ascending: false })
    .limit(limite);
  if (error || !data) return [];

  // Los nombres se resuelven aparte y no con otro `!inner`: anidar tres niveles
  // en PostgREST hace la consulta frágil (y silenciosamente vacía si una FK no
  // está declarada como espera). Dos lecturas pequeñas por catálogo, cacheables
  // por el propio Postgres, son más predecibles.
  const filas = (data as unknown as {
    id: string; inicio: string; tipo_clase_id: string; instructor_id: string;
    reservas: { id: string; estado?: string }[] | { id: string; estado?: string } | null;
  }[]).map((s) => ({
    // Con `!inner` sobre una relación uno-a-muchos, PostgREST devuelve un
    // ARRAY. Una socia no puede tener dos reservas ASISTIDA de la misma
    // sesión, así que se coge la primera — pero se normaliza en vez de
    // asumir la forma.
    reservaId: (Array.isArray(s.reservas) ? s.reservas[0]?.id : s.reservas?.id) ?? s.id,
    // El estado sale de la MISMA fila de la que sale `reservaId`, no de otra
    // lectura: normalizar por separado dejaría un estado que no es el de esa
    // reserva en cuanto haya dos.
    estado: estadoDeReserva(s.reservas),
    sesionId: s.id,
    inicio: s.inicio,
    tipoClaseId: s.tipo_clase_id,
    instructorId: s.instructor_id,
  }));
  const tipoIds = [...new Set(filas.map((f) => f.tipoClaseId).filter(Boolean))];
  const instrIds = [...new Set(filas.map((f) => f.instructorId).filter(Boolean))];

  const [tipos, instructores] = await Promise.all([
    tipoIds.length
      ? admin.from('tipos_clase').select('id, nombre').eq('studio_id', params.studioId).in('id', tipoIds)
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
    instrIds.length
      ? admin.from('instructores').select('id, nombre').eq('studio_id', params.studioId).in('id', instrIds)
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
  ]);
  const nombreTipo = new Map((tipos.data ?? []).map((t) => [t.id, t.nombre]));
  const nombreInstr = new Map((instructores.data ?? []).map((i) => [i.id, i.nombre]));

  return filas.map((f) => ({
    reservaId: f.reservaId,
    sesionId: f.sesionId,
    inicio: f.inicio,
    estado: f.estado,
    nombre: nombreTipo.get(f.tipoClaseId) ?? 'Clase',
    instructora: nombreInstr.get(f.instructorId) ?? '',
  }));
}

// Apunta/desapunta a la socia autenticada de un reto del carrusel de Inicio
// (tema Bloom). `retoKey` se valida contra RETOS_PORTAL (contenido fijo de
// código, no una tabla) — el CHECK de la migración es la segunda barrera.
// `socioId` sale de `socioAutenticado`, nunca del body, mismo criterio que
// toggleFavoritoPublico.
export async function toggleRetoParticipacion(params: {
  studioId: string; socioId: string; retoKey: string; accion: 'marcar' | 'desmarcar';
}): Promise<{ ok: true } | { error: string }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { error: 'Service role no configurada' };
  if (!esRetoKeyValida(params.retoKey)) return { error: 'Ese reto no existe.' };
  if (params.accion === 'marcar') {
    const { error } = await admin.from('reto_participaciones').upsert(
      { studio_id: params.studioId, socio_id: params.socioId, reto_key: params.retoKey },
      { onConflict: 'socio_id,reto_key', ignoreDuplicates: true },
    );
    if (error) return { error: 'No se ha podido guardar tu apunte al reto.' };
    return { ok: true };
  }
  const { error } = await admin.from('reto_participaciones').delete()
    .eq('studio_id', params.studioId).eq('socio_id', params.socioId).eq('reto_key', params.retoKey);
  if (error) return { error: 'No se ha podido quitar tu apunte al reto.' };
  return { ok: true };
}

// Registra una socia nueva desde el portal/reserva (alta pública). Valida que
// el estudio existe; el id lo genera el cliente (primera reserva).
// Socias que cuentan para el tope del plan: activas y no borradas. Mismo
// criterio que el alta manual y el importador, para que los tres den el mismo
// número — si divergen, el tope depende de por dónde entres.

async function contarSociasActivas(admin: SupabaseClient, studioId: string): Promise<number> {
  const { count } = await admin
    .from('socios')
    .select('id', { count: 'exact', head: true })
    .eq('studio_id', studioId)
    .eq('activo', true)
    .is('borrado_en', null);
  return count ?? 0;
}


export async function registrarSociaPublica(params: {
  studioId: string; id: string; nombre: string; email: string;
  telefono?: string;
  authUserId?: string;
  // ⚠️ `origen` es obligatorio dentro de la aceptación, y no opcional como el
  // resto: `socios.aceptacion_origen` existe con un CHECK ('PORTAL','MOSTRADOR')
  // desde la migración 0109, que lo justifica con el art. 7.1 del RGPD — hay
  // que poder demostrar QUIÉN consintió y por qué vía. Esta función escribía
  // fecha, firma y versión pero NO el origen, así que toda alta pública dejaba
  // la columna a NULL: exactamente el estado que la migración quería eliminar.
  aceptacion?: { fecha: string; firma: string; versionTexto: string; origen: 'PORTAL' | 'MOSTRADOR' };
  referidoPor?: string | null;
  origenLead?: string | null;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const { data: studio } = await admin.from('studios').select('id').eq('id', params.studioId).maybeSingle();
  if (!studio) return { error: 'Estudio no encontrado' as const };

  // Idempotencia: si este usuario de auth ya tiene socia en el estudio (p. ej.
  // reintento tras registrarse), no creamos una duplicada — devolvemos la suya.
  if (params.authUserId) {
    const yaSocia = await socioAutenticado(params.authUserId, params.studioId);
    if (yaSocia) return { ok: true as const, socioId: yaSocia };
  }

  // El referido solo es válido si existe una socia con ese id en el estudio.
  // Se resuelve ANTES de la adopción de ficha fantasma (justo abajo): esa rama
  // también tiene que poder escribir referido_por, o el premio de quien invitó
  // se pierde en silencio cada vez que la referida ya tenía una ficha fantasma.
  let referido: string | null = null;
  if (params.referidoPor && params.referidoPor !== params.id) {
    const { data } = await admin.from('socios').select('id').eq('id', params.referidoPor).eq('studio_id', params.studioId).maybeSingle();
    referido = data ? params.referidoPor : null;
  }

  // Ficha "fantasma": entregarPlanComprado (compra pública vía Stripe, sin
  // login previo) puede haber creado ya una socia con este email pero SIN
  // auth_user_id -- solo pagó, nunca inició sesión. Si no se adopta aquí, este
  // alta crea una SEGUNDA ficha con id distinto, y el bono ya cobrado queda
  // invisible para siempre en la fantasma (auditoría 2026-07-29, hallazgo 2.2).
  // .limit(1) en vez de .maybeSingle(): si dos compras casi simultáneas de un
  // mismo email sin cuenta llegaran a crear dos fantasmas (carrera infrecuente
  // en entregarPlanComprado), .maybeSingle() habría devuelto un error de
  // "more than one row" que este código ignoraba — cayendo al alta normal y
  // dejando AMBOS bonos huérfanos para siempre. Con .limit(1) siempre se
  // adopta uno de forma determinista en vez de no adoptar ninguno.
  const { data: fantasmas } = await admin
    .from('socios')
    .select('id, origen_lead')
    .eq('studio_id', params.studioId)
    // `escaparLike`: el texto del email ES el patrón de `.ilike`. Sin escapar,
    // un `email: "%"` (llega sin validar desde /api/oauth/v1/clientas, donde lo
    // pone un integrador con scope `clientas:escribir`) adopta una ficha
    // fantasma ARBITRARIA del estudio y le reasigna el bono ya cobrado.
    .ilike('email', escaparLike(params.email))
    .is('auth_user_id', null)
    .limit(1);
  const fantasma = fantasmas?.[0];
  if (fantasma) {
    const { error } = await admin.from('socios').update({
      auth_user_id: params.authUserId ?? null,
      // La ficha fantasma nace de entregarPlanComprado con lo que Stripe haya
      // recogido (a veces nada más que "Clienta") — se sincroniza con el
      // nombre real que acaba de escribir en el alta, igual que el alta normal.
      nombre: params.nombre,
      apellidos: '',
      // Stripe no recoge teléfono; si la fantasma ya tuviera uno de otra vía no
      // lo pisamos con vacío — solo se escribe si esta alta trae uno.
      ...(params.telefono ? { telefono: params.telefono } : {}),
      aceptacion_fecha: params.aceptacion?.fecha ?? null,
      aceptacion_firma: params.aceptacion?.firma ?? null,
      aceptacion_version: params.aceptacion?.versionTexto ?? null,
      aceptacion_origen: params.aceptacion?.origen ?? null,
      // Sin esto, revisión de auditoría: la ficha fantasma no traía
      // referido_por (entregarPlanComprado no acepta código de referido), así
      // que adoptarla sin escribirlo aquí perdía el premio de quien invitó.
      ...(referido ? { referido_por: referido } : {}),
      // Igual criterio: no pisar el origen real de quien ya iba a comprar
      // antes de este alta con el de un enlace de referido posterior.
      ...(params.origenLead && !fantasma.origen_lead ? { origen_lead: params.origenLead } : {}),
    }).eq('id', fantasma.id);
    if (error) return { error: error.message };
    return { ok: true as const, socioId: fantasma.id as string };
  }

  // Tope de socias del plan. Va AQUÍ, después de la idempotencia y pegado al
  // insert, y no en la ruta que llama: allí corría ANTES de la salida temprana
  // de arriba, así que un simple reintento de una socia que YA existe se comía
  // el bloqueo aunque no fuese a crear ninguna fila. Y ese error lo lee la
  // CLIENTA, no la dueña — «Tu plan permite hasta N socias, mejóralo» es un
  // mensaje de facturación que no tiene por qué salir del panel del estudio.
  //
  // Separadas, las dos comprobaciones se vuelven a desincronizar; juntas, el
  // tope solo se aplica cuando de verdad va a entrar una socia nueva.
  const denegacion = await evaluarLimiteSocias(admin, params.studioId, await contarSociasActivas(admin, params.studioId), 1);
  if (denegacion) return { error: denegacion.error, code: denegacion.code };

  const { error } = await admin.from('socios').insert({
    id: params.id, studio_id: params.studioId, nombre: params.nombre, apellidos: '',
    email: params.email, telefono: params.telefono || null, activo: true, fecha_alta: new Date().toISOString(),
    auth_user_id: params.authUserId ?? null,
    aceptacion_fecha: params.aceptacion?.fecha ?? null,
    aceptacion_firma: params.aceptacion?.firma ?? null,
    aceptacion_version: params.aceptacion?.versionTexto ?? null,
    aceptacion_origen: params.aceptacion?.origen ?? null,
    referido_por: referido,
    origen_lead: params.origenLead ?? null,
  });
  // Carrera de doble clic en handleSignContract (17ª auditoría, P-6): el
  // cerrojo de cliente cierra el caso normal, pero dos peticiones que
  // arrancan casi a la vez pasan las dos el check de idempotencia de arriba
  // (SELECT "¿ya existe?" sin candado) antes de que cualquiera haga INSERT.
  // La que pierde la carrera choca aquí contra `socios_auth_studio_unique`
  // (migr 20260827005014) — en vez de propagar el 23505 crudo, se resuelve
  // igual que el camino feliz de arriba: la ficha que SÍ se creó es la buena,
  // se devuelve esa.
  if (error?.code === '23505' && error.message.includes('socios_auth_studio_unique') && params.authUserId) {
    const yaSocia = await socioAutenticado(params.authUserId, params.studioId);
    if (yaSocia) return { ok: true as const, socioId: yaSocia };
  }
  if (error) return { error: error.message };
  return { ok: true as const };
}

// Campos que una socia puede editar de SU propia ficha (whitelist). No puede
// tocar tags, lead_stage, activo, referido_por ni datos de Stripe.
//
// `email` queda FUERA a propósito, aunque el formulario de "Mis datos" lo
// enseña editable — no por el riesgo de auto-bloqueo de antes (I-15,
// auditoría 29-ago: `validarSociaPublica` ya no compara email, autoriza por
// `auth_user_id`), sino porque cambiar el email de verdad necesita
// sincronizarlo también en Supabase Auth (con su propio flujo de
// confirmación), que no existe todavía — se rechaza explícitamente más abajo
// en vez de aceptarlo y tirarlo en silencio.
const CAMPOS_SOCIA_EDITABLES: Record<string, string> = {
  nombre: 'nombre', apellidos: 'apellidos', telefono: 'telefono', nif: 'nif',
  avatar: 'avatar', fotoUrl: 'foto_url', fechaNacimiento: 'fecha_nacimiento',
  direccion: 'direccion', usuario: 'usuario',
  // I-13 (auditoría 29-ago): la migración 20260826202949 ya prometía esta
  // vía de escritura — no existía ninguna, así que "quién más va a esta
  // clase" nunca podía enseñar un solo nombre.
  visibleEnClase: 'visible_en_clase',
  // I-1 (auditoria 49a): meta de clases/mes para el disparador OBJETIVO_MENSUAL
  // de gamificacion. null/0 = sin objetivo. El CHECK de la migracion
  // (20260910224240) acota 1-60; se normaliza abajo antes de escribir.
  objetivoClasesMes: 'objetivo_clases_mes',
};


export async function actualizarSociaPublica(params: {
  studioId: string; socioId: string; authUserId: string; cambios: Record<string, unknown>;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const socia = await validarSociaPublica(admin, params.studioId, params.socioId, params.authUserId);
  if (!socia) return { error: 'No autorizado' as const };

  // Ver comentario de CAMPOS_SOCIA_EDITABLES: el email no se acepta todavía,
  // pero se dice explícitamente en vez de guardar el resto y callar el
  // rechazo (que es justo el bug que se está corrigiendo aquí).
  if ('email' in params.cambios) {
    const nuevoEmail = String(params.cambios.email ?? '').trim().toLowerCase();
    const actual = (socia.email ?? '').trim().toLowerCase();
    if (nuevoEmail && nuevoEmail !== actual) {
      return { error: 'El email no se puede cambiar desde aquí todavía. Escribe a tu estudio para actualizarlo.' as const };
    }
  }

  const db: Record<string, unknown> = {};
  for (const [camel, snake] of Object.entries(CAMPOS_SOCIA_EDITABLES)) {
    if (camel in params.cambios) db[snake] = params.cambios[camel];
  }
  // Normalizado en minúsculas SIEMPRE, no solo cuando el cliente ya lo manda
  // así: el CHECK de la migración (20260828100000) exige minúsculas y
  // rechazaría un valor con mayúscula colado por otra vía, con un error de
  // Postgres crudo en vez del mensaje de abajo.
  if (typeof db.usuario === 'string') db.usuario = db.usuario.trim().toLowerCase();
  if (db.usuario === '') db.usuario = null;
  // objetivo_clases_mes: 0 o cadena vacia significa 'sin objetivo' igual
  // que null -- el CHECK de la migracion (20260910224240) solo admite
  // null o 1-60, y 0 lo rechazaria con un error crudo de Postgres.
  if ('objetivo_clases_mes' in db) {
    const v = db.objetivo_clases_mes;
    if (v === null || v === undefined || v === '' || Number(v) === 0) db.objetivo_clases_mes = null;
    else db.objetivo_clases_mes = Math.trunc(Number(v));
  }
  // ⚠️ `foto_url` acaba pintada como `background-image` en la ficha que abre el
  // MOSTRADOR, y esta lista la acepta tal cual desde el cuerpo de la petición.
  // O sea: una socia podía dejar su avatar apuntando a un servidor cualquiera y
  // convertirlo en un contador de visitas —IP y navegador— de quien mirara su
  // ficha. No es escalada (solo puede tocar su propia fila) y no es XSS (React
  // asigna la propiedad por CSSOM, no concatena el atributo `style`), pero es
  // una petición saliente a un tercero desde el panel del estudio, y el
  // proyecto no tiene CSP que la frene.
  //
  // La subida legítima (`/api/public/foto-perfil`) SOLO devuelve URLs de
  // nuestro propio Storage, así que exigir ese origen no quita ninguna vía
  // real. Vaciarla sigue permitido: es cómo se quita la foto.
  if ('foto_url' in db) {
    const url = db.foto_url;
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    if (url === null || url === '') db.foto_url = null;
    else if (typeof url !== 'string' || !base || !url.startsWith(base)) {
      return { error: 'Esa foto no es válida. Súbela desde tu perfil.' as const };
    }
  }
  // Aceptación del contrato: ya NO se escribe aquí. Guardaba la fecha y el
  // texto que mandaba el navegador, sin origen. La sella la ruta
  // (`/api/public/socio`, `registrarAceptacionContrato`) con valores del
  // servidor y la aparta de `cambios` antes de llegar a esta función.
  if (Object.keys(db).length === 0) return { ok: true as const };
  const { error } = await admin.from('socios').update(db).eq('id', params.socioId);
  if (error) {
    // 23505 = unique_violation (uq_socios_studio_usuario), 23514 =
    // check_violation (socios_usuario_formato). Sin esto, la socia veía el
    // texto crudo de Postgres ("duplicate key value violates unique
    // constraint...") en vez de un aviso que entienda.
    if ('usuario' in db && error.code === '23505') return { error: 'Ese usuario ya está en uso.' };
    if ('usuario' in db && error.code === '23514') return { error: 'El usuario solo puede tener minúsculas, números y guion bajo (3-24 caracteres).' };
    if ('objetivo_clases_mes' in db && error.code === '23514') return { error: 'El objetivo tiene que estar entre 1 y 60 clases al mes.' };
    return { error: error.message };
  }
  return { ok: true as const };
}


// Canjea una recompensa del catálogo con los créditos de la socia. Valida
// identidad, disponibilidad/stock/saldo (reward-engine) y actualiza el saldo.

export async function canjearRecompensaPublica(params: {
  studioId: string; socioId: string; authUserId: string; catalogItemId: string;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  const socia = await validarSociaPublica(admin, params.studioId, params.socioId, params.authUserId);
  if (!socia) return { error: 'No autorizado' as const };

  const [{ data: itemRow }, { data: credRow }, { count: canjesPrevios }] = await Promise.all([
    admin.from('reward_catalog').select('*').eq('id', params.catalogItemId).eq('studio_id', params.studioId).maybeSingle(),
    admin.from('member_credits').select('*').eq('socio_id', params.socioId).maybeSingle(),
    // Los cancelados NO cuentan, igual que en la RPC: cancelar devuelve
    // créditos y stock, así que devuelve el derecho a volver a canjearla.
    admin.from('reward_redemptions').select('id', { count: 'exact', head: true })
      .eq('studio_id', params.studioId).eq('socio_id', params.socioId)
      .eq('catalog_item_id', params.catalogItemId).neq('estado', 'CANCELADO'),
  ]);
  const item = itemRow ? mapRewardCatalogItem(itemRow as RowRewardCatalog) : undefined;
  const saldo = credRow ? mapMemberCredits(credRow as RowMemberCredits).saldo : 0;

  const validacion = validarCanje(item, saldo, {
    hoy: hoyEnEstudio(), canjesPrevios: canjesPrevios ?? 0,
  });
  if ('error' in validacion) return validacion;
  if (!item) return { error: 'Esta recompensa ya no está disponible.' as const };

  const redemptionId = `rwd-${uid()}`;

  // ⚠️ UNA sola llamada, y no por elegancia. Antes eran tres seguidas —reservar
  // stock, descontar créditos, insertar la fila— y la tercera ni siquiera
  // miraba su error: un fallo ahí dejaba a la socia sin créditos y sin canje.
  // `canjear_recompensa` es una función PL/pgSQL, o sea una transacción, y
  // devuelve el CÓDIGO que la socia enseñará en el estudio.
  const { data: codigo, error: canjeErr } = await admin.rpc('canjear_recompensa', {
    p_redemption_id: redemptionId, p_item_id: params.catalogItemId,
    p_studio_id: params.studioId, p_socio_id: params.socioId,
  });
  if (canjeErr) {
    const m = canjeErr.message;
    if (m.includes('SIN_STOCK')) return { error: 'Esta recompensa está agotada.' as const };
    if (m.includes('LIMITE_ALCANZADO')) return { error: 'Ya has canjeado esta recompensa el máximo de veces.' as const };
    if (m.includes('FUERA_DE_VIGENCIA')) return { error: 'Esta recompensa no está disponible ahora mismo.' as const };
    if (m.includes('NO_DISPONIBLE')) return { error: 'Esta recompensa ya no está disponible.' as const };
    if (m.includes('SALDO_INSUFICIENTE')) return { error: 'Saldo insuficiente' as const };
    return { error: m };
  }

  // Una recompensa de CLASE_GRATIS se entrega sola: concede una recuperación,
  // que es el derecho a una clase suelta que ya existe en el producto. No se
  // inventa un vale nuevo — la alumna la gasta reservando por el camino de
  // siempre, cuenta contra su tope y caduca con la política del estudio.
  if (item.efecto === 'CLASE_GRATIS') {
    const recuperacionId = `rec-${uid()}`;
    const { data: resultado, error: recupErr } = await admin.rpc('crear_recuperacion', {
      p_id: recuperacionId,
      p_studio_id: params.studioId,
      p_socio_id: params.socioId,
      p_origen_reserva_id: null,
      p_motivo: `Canje de recompensa: ${item.nombre}`,
      p_caduca_el: null,
    });

    // 'TOPE' = ya tiene 4 recuperaciones vivas y no le cabe otra. NO se le
    // puede cobrar por algo que no va a recibir, así que se deshace el canje
    // entero — créditos y stock — por el camino que ya existe y es atómico.
    // Sin esto, el fallo sería el peor de todos: pagar y no recibir nada.
    if (recupErr || resultado === 'TOPE') {
      await admin.rpc('cancelar_canje', { p_redemption_id: redemptionId, p_studio_id: params.studioId });
      return {
        error: resultado === 'TOPE'
          ? 'Ya tienes el máximo de clases pendientes de recuperar. Usa alguna antes de canjear esta.' as const
          : 'No se ha podido activar tu clase. No se te han descontado créditos.' as const,
      };
    }

    // No hay nada que entregar en mostrador: el canje nace resuelto. Y se
    // GUARDA la recuperación concedida — hasta ahora el único rastro era la
    // frase «Canje de recompensa: X» en `motivo`, así que para saber si una
    // clase se pagó con una recompensa había que leer castellano.
    await admin.from('reward_redemptions')
      .update({ estado: 'ENTREGADO', entregado_en: new Date().toISOString(), recuperacion_id: recuperacionId })
      .eq('id', redemptionId);
  }

  // El portal le promete a la socia «El estudio te avisará». Sin esto, no se
  // avisaba a nadie: el canje quedaba PENDIENTE en una tabla que ninguna
  // pantalla leía, y ella se quedaba sin créditos y sin recompensa.
  //
  // Se avisa igualmente en CLASE_GRATIS: el estudio no tiene que hacer nada,
  // pero sí querer saber que se ha regalado una clase.
  const { emitirCanjeSolicitado } = await import('@/lib/notifications/emit');
  await emitirCanjeSolicitado({
    studioId: params.studioId, socioId: params.socioId,
    socia: (socia.nombre as string | null) ?? 'Una socia',
    recompensa: item.nombre, creditos: item.costeCreditos, redemptionId,
  });

  // El código VUELVE. Devolver `{ ok: true }` a secas es lo que dejaba a la
  // socia con un toast y nada más: sin código no hay nada que enseñar, ni que
  // guardar, ni que volver a mirar mañana.
  return { ok: true as const, redemptionId, codigo: codigo as string, efecto: item.efecto };
}

// Otorga créditos server-side delegando ENTERO en la RPC atómica
// `otorgar_credito_disparador` — antes escribía a pelo con service_role
// (insert en reward_actions + ajustar_creditos) sin comprobar ninguna
// condición real, un motor de gamificación distinto del que usa el panel
// (dbOtorgarCreditoDisparador → misma RPC) con reglas distintas (hallazgo I-3
// de la 49ª pasada de auditoría, 2026-09-10: ASISTENCIA_CLASE/REFERIDO_AMIGO/
// SEMANA_COMPLETA se podían conceder desde el kiosko sin que existiera la
// condición que dice conceder). `auth.uid()` es NULL al llamar sin sesión de
// usuario (kiosko con token propio, no JWT de socia/staff) — la RPC ya trata
// ese caso correctamente (validar_studio_mismatch se salta su chequeo de
// tenant cuando auth.uid() es NULL), mismo camino que ya usan
// evaluarLogrosServidor/evaluarRetosServidor para LOGRO/RETO más abajo.
async function otorgarCreditosServidor(
  admin: SupabaseClient, studioId: string, socioId: string,
  trigger: RewardTrigger, refId: string | null,
) {
  // R7/gate de plan: la gamificación (créditos, logros, retos, niveles, rachas)
  // es una feature de los planes Estudio/Cadena — un estudio en Base no gana
  // créditos nuevos aquí. `evaluarFeature` falla abierto si BILLING_ENFORCED no
  // está activo, igual que el resto de gates del producto (ver billing-rules.ts).
  if (await evaluarFeature(admin, studioId, 'gamificacion')) return;
  if (!refId) return;

  const { error } = await admin.rpc('otorgar_credito_disparador', {
    p_studio_id: studioId, p_socio_id: socioId,
    p_trigger: trigger, p_ref_id: refId, p_config_id: null,
  });
  // SIN_REGLA_ACTIVA/CONDICION_NO_CUMPLIDA/REF_ID_NO_DERIVADO no son errores de
  // sistema: son el "no toca conceder" de la propia RPC (mismo criterio que
  // dbOtorgarCreditoDisparador en lib/supabase-data.ts).
  if (error && !/SIN_REGLA_ACTIVA|CONDICION_NO_CUMPLIDA|REF_ID_NO_DERIVADO/.test(error.message)) {
    reportDbError('[otorgarCreditosServidor]', error);
  }
}

// ─── Gamificación en servidor (S-1) ──────────────────────────────────────────
// Las escrituras de logros vivían SOLO en el cliente (studio-context) con el
// cliente anónimo. Desde el portal la socia se autentica por OTP y su JWT no
// lleva claim de studio_id, así que la policy `studio_id = current_studio_id()`
// rechazaba la cadena ENTERA —progreso, historial, claim de recompensa,
// transacción de crédito y ajuste de saldo—: la gamificación de socias no se
// persistía nunca. No era un fallo de permisos puntual, era una escritura hecha
// desde el sitio equivocado.
//
// Se evalúa aquí, con service-role y todo acotado por studio_id, en los mismos
// puntos donde la métrica cambia de verdad. Ninguna métrica sube hasta el umbral
// por el mero paso del tiempo (el tiempo solo puede ROMPER una racha), así que
// evaluar en la acción cubre todos los desbloqueos sin exponer un endpoint
// público nuevo que conceda créditos canjeables.
//
// Es best-effort: si algo falla se reporta pero NO se tumba la operación que la
// disparó — perder un logro es peor que perder la reserva, pero mucho menos malo
// que perder la reserva por culpa del logro.
// Datos que comparten logros y retos. Se cargan UNA vez por acción: ambos
// sistemas evalúan sobre las mismas reservas/sesiones/socia y corren seguidos,
// así que separarlos duplicaría las consultas en cada reserva y check-in.

interface ContextoGamificacion {
  socio: Socio;
  reservas: Reserva[];
  sesiones: Sesion[];
  referidas: Socio[];
}


async function cargarContextoGamificacion(
  admin: SupabaseClient, studioId: string, socioId: string,
): Promise<ContextoGamificacion | null> {
  const [{ data: socioRow }, { data: resRows }] = await Promise.all([
    admin.from('socios').select('*').eq('id', socioId).eq('studio_id', studioId).maybeSingle(),
    admin.from('reservas').select('*').eq('studio_id', studioId).eq('socio_id', socioId),
  ]);
  if (!socioRow) return null;
  const reservas = (resRows ?? []).map(mapReserva);

  // Solo las sesiones que sus reservas referencian: las métricas las usan para
  // fechar la asistencia, no hace falta traerse la agenda entera del estudio.
  const sesionIds = [...new Set(reservas.map(r => r.sesionId))];
  const [sesRows, refRows] = await Promise.all([
    sesionIds.length
      ? admin.from('sesiones').select('*').eq('studio_id', studioId).in('id', sesionIds).then(r => r.data)
      : Promise.resolve([]),
    // AMIGOS_INVITADOS solo cuenta socias referidas por ella: basta con las
    // suyas, no el censo del estudio. calcularMetrica filtra por referidoPor,
    // así que pasarle únicamente las referidas da el mismo número.
    admin.from('socios').select('*').eq('studio_id', studioId).eq('referido_por', socioId).then(r => r.data),
  ]);

  return {
    socio: mapSocio(socioRow as RowSocios),
    reservas,
    sesiones: (sesRows ?? []).map(mapSesion),
    referidas: (refRows ?? []).map(mapSocio),
  };
}


async function evaluarLogrosServidor(
  admin: SupabaseClient, studioId: string, socioId: string, ctx: ContextoGamificacion,
): Promise<void> {
  const [{ data: defRows }, { data: progRows }] = await Promise.all([
    admin.from('achievement_definitions').select('*').eq('studio_id', studioId).eq('activo', true),
    admin.from('achievement_progress').select('*').eq('studio_id', studioId).eq('socio_id', socioId),
  ]);
  const definiciones = (defRows ?? []).map(mapAchievementDefinition);
  if (definiciones.length === 0) return;

  const progresos = (progRows ?? []).map(mapAchievementProgress);
  const { socio, reservas, sesiones, referidas } = ctx;

  const now = new Date();
  // Cada logro es independiente de los demás (progreso/historial/crédito solo
  // tocan filas propias de ese achievement_id, y reward_actions se protege con
  // su UNIQUE) — se evalúan en paralelo en vez de un `for` con awaits
  // secuenciales, que serializaba hasta N×4 round-trips en el hot path de
  // cada reserva creada.
  await Promise.all(definiciones.map(async def => {
    const existente = progresos.find(p => p.achievementId === def.id);
    if (existente?.completado) return; // ya conseguido, no se re-evalúa

    const valor = calcularMetrica(def.metric, { reservas, sesiones, socio, now, todosLosSocios: referidas });
    const completadoAhora = valor >= def.umbral;

    if (!completadoAhora) {
      const { error: progError } = await admin.from('achievement_progress').upsert({
        id: existente?.id ?? `achp-${uid()}`,
        studio_id: studioId, socio_id: socioId, achievement_id: def.id,
        progreso_actual: valor, completado: false, completado_en: null,
      }, { onConflict: 'socio_id,achievement_id' });
      if (progError) reportDbError('[evaluarLogrosServidor] progreso', progError);
      return;
    }

    // 31ª pasada de auditoría: el crédito se concede ANTES de marcar el logro
    // como conseguido, con la RPC atómica que ya mueve saldo y ledger en la
    // misma transacción (`otorgar_credito_disparador`, migr. 20260907200500 —
    // ya soporta trigger LOGRO/RETO). Antes se hacía a mano en tres pasos sin
    // comprobar el resultado: si `ajustar_creditos` fallaba, el logro se
    // marcaba conseguido igual (y nunca se reintentaba, por el guard de
    // arriba) sin que el saldo real se hubiera movido — el mismo defecto que
    // ya se corrigió hoy para `otorgar_credito_disparador` en el resto de
    // disparadores, sin replicarlo aquí hasta ahora.
    // ⚠️ ORDEN (60ª auditoría, 14-sep-2026). Antes se concedía el crédito ANTES
    // de escribir el progreso, con la idea de «no dar el logro por conseguido
    // sin haber pagado». Era un INTERBLOQUEO: `otorgar_credito_disparador`
    // exige, en su rama {TRIGGER}, que el progreso esté COMPLETADO EN LA BASE
    // (`... and ap.completado`), así que respondía CONDICION_NO_CUMPLIDA, el
    // `return` salía antes del upsert, y la próxima evaluación repetía lo
    // mismo para siempre. Con las 24 definiciones activas de producción
    // llevando `creditosRecompensa > 0`, el camino de servidor —el del
    // PORTAL— no ha completado ni un logro nunca. Y el filtro de Sentry de
    // abajo silenciaba justo el error que lo delataba.
    //
    // Ahora: se escribe el progreso, se pide el crédito, y si el crédito falla
    // por un error REAL se revierte `completado` para que la próxima
    // evaluación lo reintente — que es la intención original de la 31ª pasada,
    // esta vez alcanzable.
    const idProgreso = existente?.id ?? `achp-${uid()}`;
    const { error: progError } = await admin.from('achievement_progress').upsert({
      id: idProgreso,
      studio_id: studioId, socio_id: socioId, achievement_id: def.id,
      progreso_actual: valor, completado: true, completado_en: now.toISOString(),
    }, { onConflict: 'socio_id,achievement_id' });
    if (progError) { reportDbError('[evaluarLogrosServidor] progreso', progError); return; }

    if (def.creditosRecompensa > 0) {
      const { error: credError } = await admin.rpc('otorgar_credito_disparador', {
        p_studio_id: studioId, p_socio_id: socioId,
        p_trigger: 'LOGRO', p_ref_id: `${socioId}:${def.id}`, p_config_id: def.id,
      });
      // SIN_REGLA_ACTIVA / CONDICION_NO_CUMPLIDA / REF_ID_NO_DERIVADO no son
      // errores de sistema: son el «no toca conceder» de la propia RPC, y el
      // logro sí está conseguido. Cualquier otro error sí deshace el completado.
      if (credError && !/SIN_REGLA_ACTIVA|CONDICION_NO_CUMPLIDA|REF_ID_NO_DERIVADO/.test(credError.message)) {
        reportDbError('[evaluarLogrosServidor] crédito', credError);
        await admin.from('achievement_progress')
          .update({ completado: false, completado_en: null }).eq('id', idProgreso);
        return;
      }
    }

    // Idempotente: dos evaluaciones a la vez del mismo logro (dos reservas
    // seguidas, el panel y el portal) dejaban la fila repetida. El índice único
    // (migr 20260914175000) lo impide y aquí la segunda no cuenta como error.
    const { error: histError } = await admin.from('achievement_history').upsert({
      id: `achh-${uid()}`, studio_id: studioId, socio_id: socioId, achievement_id: def.id,
      nombre: def.nombre, icono: def.icono, creado_en: now.toISOString(),
    }, { onConflict: 'socio_id,achievement_id', ignoreDuplicates: true });
    if (histError) reportDbError('[evaluarLogrosServidor] historial', histError);
  }));
}

// Retos: mismo fallo y mismo arreglo que los logros. La diferencia es que un
// reto solo cuenta lo que pasa DENTRO de su ventana de fechas, así que se filtra
// a los activos y vigentes y el progreso lo calcula calcularProgresoReto (que
// recorta las reservas al periodo antes de aplicar la misma métrica).

async function evaluarRetosServidor(
  admin: SupabaseClient, studioId: string, socioId: string, ctx: ContextoGamificacion,
): Promise<void> {
  const now = new Date();
  const [{ data: defRows }, { data: progRows }] = await Promise.all([
    admin.from('challenge_definitions').select('*').eq('studio_id', studioId).eq('activo', true),
    admin.from('challenge_progress').select('*').eq('studio_id', studioId).eq('socio_id', socioId),
  ]);
  const retos = (defRows ?? []).map(mapChallengeDefinition)
    .filter(r => new Date(r.fechaInicio) <= now && now <= new Date(r.fechaFin));
  if (retos.length === 0) return;

  const progresos = (progRows ?? []).map(mapChallengeProgress);
  const { socio, reservas, sesiones, referidas } = ctx;

  // Mismo motivo que evaluarLogrosServidor: cada reto es independiente, se
  // evalúan en paralelo en vez de serializar N×4 round-trips por reserva.
  await Promise.all(retos.map(async reto => {
    const existente = progresos.find(p => p.challengeId === reto.id);
    if (existente?.completado) return; // ya conseguido, no se re-evalúa

    const valor = calcularProgresoReto(reto, reservas, sesiones, socio, referidas, now);
    const completadoAhora = valor >= reto.objetivo;

    if (!completadoAhora) {
      const { error: progError } = await admin.from('challenge_progress').upsert({
        id: existente?.id ?? `chap-${uid()}`,
        studio_id: studioId, socio_id: socioId, challenge_id: reto.id,
        progreso_actual: valor, completado: false, completado_en: null,
      }, { onConflict: 'socio_id,challenge_id' });
      if (progError) reportDbError('[evaluarRetosServidor] progreso', progError);
      return;
    }

    // Mismo interbloqueo que en los logros, y mismo arreglo (60ª auditoría):
    // la RPC exige el progreso completado EN LA BASE, así que pedir el crédito
    // primero no podía funcionar nunca. Se escribe, se pide, y solo un error
    // REAL deshace el completado.
    const idProgresoReto = existente?.id ?? `chap-${uid()}`;
    const { error: progError } = await admin.from('challenge_progress').upsert({
      id: idProgresoReto,
      studio_id: studioId, socio_id: socioId, challenge_id: reto.id,
      progreso_actual: valor, completado: true, completado_en: now.toISOString(),
    }, { onConflict: 'socio_id,challenge_id' });
    if (progError) { reportDbError('[evaluarRetosServidor] progreso', progError); return; }

    if (reto.creditosRecompensa > 0) {
      const { error: credError } = await admin.rpc('otorgar_credito_disparador', {
        p_studio_id: studioId, p_socio_id: socioId,
        p_trigger: 'RETO', p_ref_id: `${socioId}:${reto.id}`, p_config_id: reto.id,
      });
      if (credError && !/SIN_REGLA_ACTIVA|CONDICION_NO_CUMPLIDA|REF_ID_NO_DERIVADO/.test(credError.message)) {
        reportDbError('[evaluarRetosServidor] crédito', credError);
        await admin.from('challenge_progress')
          .update({ completado: false, completado_en: null }).eq('id', idProgresoReto);
        return;
      }
    }

    const { error: histError } = await admin.from('challenge_history').insert({
      id: `chah-${uid()}`, studio_id: studioId, socio_id: socioId, challenge_id: reto.id,
      nombre: reto.nombre, icono: reto.icono, creado_en: now.toISOString(),
    });
    if (histError) reportDbError('[evaluarRetosServidor] historial', histError);
  }));
}

// Punto de entrada único: carga el contexto UNA vez y evalúa ambos sistemas.
// Best-effort de verdad: si la gamificación falla, la reserva o el check-in que
// la disparó siguen adelante — perder un logro es mucho menos malo que perder
// la plaza por culpa del logro.

async function evaluarGamificacionServidor(
  admin: SupabaseClient, studioId: string, socioId: string,
): Promise<void> {
  try {
    // Mismo gate que otorgarCreditosServidor: sin la feature de plan, no se
    // evalúa progreso nuevo de logros/retos. El progreso ya conseguido antes de
    // perder el plan NO se borra (evaluarLogrosServidor/evaluarRetosServidor no
    // tocan lo que ya está `completado`); solo se congela, no retrocede.
    if (await evaluarFeature(admin, studioId, 'gamificacion')) return;
    const ctx = await cargarContextoGamificacion(admin, studioId, socioId);
    if (!ctx) return;
    await evaluarLogrosServidor(admin, studioId, socioId, ctx);
    await evaluarRetosServidor(admin, studioId, socioId, ctx);
    // D-2 (auditoría 24ª pasada): "Semana completa" (30 créditos) solo se
    // otorgaba desde el check-in MANUAL del panel (`lib/studio-context.tsx`,
    // llamaba a `calcularRacha` en cliente) — el check-in de servidor
    // (`checkinPublico`, kiosko/escáner de pase) nunca la daba, aunque es el
    // camino REAL de la mayoría de estudios. Mismo motor puro
    // (`lib/engines/streak-engine.ts`) sobre el mismo contexto ya cargado
    // arriba (reservas+sesiones ya reflejan el check-in que disparó esta
    // evaluación, porque `cargarContextoGamificacion` lee de BD DESPUÉS del
    // UPDATE). Mismo ref_id que el cliente (`socioId:claveSemanaActual`) —
    // el UNIQUE de `reward_actions` es lo que evita otorgarla dos veces la
    // misma semana, tanto si la da el panel como si la da el servidor.
    const racha = calcularRacha(ctx.reservas, ctx.sesiones, new Date());
    if (racha.semanas > 0) {
      await otorgarCreditosServidor(admin, studioId, socioId, 'SEMANA_COMPLETA', `${socioId}:${racha.claveSemanaActual}`);
    }
    // Objetivo mensual (I-1, auditoria 49a): mismo punto que SEMANA_COMPLETA
    // arriba -- mismo motor puro sobre el mismo ctx ya cargado.
    if (objetivoMensualAlcanzado(ctx.reservas, ctx.sesiones, ctx.socio.objetivoClasesMes, new Date())) {
      await otorgarCreditosServidor(admin, studioId, socioId, 'OBJETIVO_MENSUAL', socioId + ':' + claveMesActual(new Date()));
    }
  } catch (err) {
    reportDbError('[evaluarGamificacionServidor]', err);
  }
}

// C-2: valida el token de dispositivo de kiosko de un estudio. Sin token
// configurado el check-in público queda cerrado (devuelve false), que es el lado
// seguro. La BD guarda solo el SHA-256 (`kiosko_tokens`, migr 20260914011331):
// se compara el hash del token recibido, en tiempo constante.

export async function validarKioskToken(studioId: string, token: string | null): Promise<boolean> {
  if (!token) return false;
  const admin = getSupabaseAdmin();
  if (!admin) return false;
  const { data } = await admin.from('kiosko_tokens').select('token_hash').eq('studio_id', studioId).maybeSingle();
  return tokenCoincideConHash(token, (data?.token_hash as string | undefined) ?? null);
}

// Check-in de kiosk: marca la reserva ASISTIDA, otorga créditos de asistencia y,
// si es la primera clase de una socia referida, premia a quien la invitó (con
// tope mensual). La reserva debe pertenecer al estudio.

export async function checkinPublico(params: { studioId: string; reservaId: string }) {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  const { data: resRow } = await admin
    .from('reservas').select('*').eq('id', params.reservaId).eq('studio_id', params.studioId).maybeSingle();
  if (!resRow) return { error: 'Reserva no encontrada' as const };
  const reserva = mapReserva(resRow as RowReservas);
  if (reserva.estado === 'ASISTIDA') return { ok: true as const }; // idempotente
  // Solo se hace check-in de una reserva CONFIRMADA. Antes cualquier otro estado
  // (LISTA_ESPERA, CANCELADA, NO_ASISTIO) se sobrescribía a ASISTIDA: como los IDs
  // de reserva son públicos (fetchPublicStudioData los expone), con el kiosk-token
  // se podía resucitar una reserva CANCELADA o colar una de LISTA_ESPERA —saltándose
  // el aforo (plazasOcupadas cuenta ASISTIDA como ocupada) y otorgando créditos de
  // asistencia indebidos.
  if (reserva.estado !== 'CONFIRMADA') return { error: 'La reserva no está confirmada' as const };

  // Si el UPDATE falla no se sigue: antes se otorgaban créditos y se contestaba
  // `ok` sobre una asistencia que no se había guardado, y la pantalla que marca
  // (pase, kiosko, lista de la instructora) decía «hecho».
  // Y compare-and-set sobre CONFIRMADA: si la socia cancela entre la lectura de
  // arriba y este UPDATE, no se resucita una reserva cuya plaza ya puede ser de
  // la siguiente de la lista de espera.
  const { data: marcadas, error: eCheckin } = await admin.from('reservas')
    .update({ estado: 'ASISTIDA', check_in_en: new Date().toISOString() })
    .eq('id', params.reservaId).eq('estado', 'CONFIRMADA')
    .select('id');
  if (eCheckin) {
    reportDbError('[checkinPublico]', eCheckin);
    return { error: 'No se ha podido registrar la asistencia' as const };
  }
  if (!marcadas?.length) return { error: 'La reserva no está confirmada' as const };

  // Créditos por asistencia (dedup por reservaId).
  await otorgarCreditosServidor(admin, params.studioId, reserva.socioId, 'ASISTENCIA_CLASE', params.reservaId);

  // Premio de referido si es su primera clase asistida.
  const { data: todasRes } = await admin.from('reservas').select('*').eq('studio_id', params.studioId).eq('socio_id', reserva.socioId);
  const reservasTrasCheckin = (todasRes ?? []).map(mapReserva)
    .map(r => r.id === reserva.id ? { ...r, estado: 'ASISTIDA' as const } : r);
  const [{ data: sociaRow }, { data: rulesRows }, { data: actionRows }] = await Promise.all([
    admin.from('socios').select('*').eq('id', reserva.socioId).maybeSingle(),
    admin.from('reward_rules').select('*').eq('studio_id', params.studioId),
    admin.from('reward_actions').select('*').eq('studio_id', params.studioId),
  ]);
  const regla = (rulesRows ?? []).map(mapRewardRule).find(r => r.trigger === 'REFERIDO_AMIGO' && r.activa) ?? null;
  const { premiar, referidorId } = decidirPremioReferido({
    socia: sociaRow ? mapSocio(sociaRow as RowSocios) : undefined,
    reservasTrasCheckin,
    rewardActions: (actionRows ?? []).map(mapRewardAction),
    topeMensual: regla?.topeMensual ?? null,
    ahora: new Date(),
  });
  if (premiar && referidorId) {
    await otorgarCreditosServidor(admin, params.studioId, referidorId, 'REFERIDO_AMIGO', reserva.socioId);
    // La referidora acaba de sumar en AMIGOS_INVITADOS.
    await evaluarGamificacionServidor(admin, params.studioId, referidorId);
  }
  // S-1: el check-in mueve CLASES_ASISTIDAS, la racha y la asistencia mensual
  // — en logros y en los retos cuya ventana incluya esta sesión.
  // Antes esto solo se evaluaba en el cliente y desde el portal RLS lo rechazaba.
  await evaluarGamificacionServidor(admin, params.studioId, reserva.socioId);
  return { ok: true as const };
}

// ─── Mappers: TS (camelCase) → DB (snake_case) ───────────────────────────────


export async function dbUpsertAutomationLog(log: AutomationLog) {
  const row = {
    id: log.id,
    studio_id: log.studioId ?? getCurrentStudioId(),
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
  const { error } = await dbEscritura().from('automation_logs').upsert(row, { onConflict: 'id' });
  if (error) reportDbError('[dbUpsertAutomationLog]', error);
}

// `studioId` obligatorio: dbEscritura() es service-role (bypasa RLS), así que
// sin acotar por estudio, un log de OTRO estudio (id adivinado o filtrado)
// quedaría escribible desde una sesión de staff cualquiera — mismo hueco que
// el de #195, aquí sobre el registro de auditoría, no sobre el cobro en sí.

export async function dbUpdateAutomationLog(id: string, studioId: string, changes: Partial<AutomationLog>) {
  const db: Record<string, unknown> = {};
  if ('resultado' in changes) db.resultado = changes.resultado;
  if ('detalle' in changes) db.detalle = changes.detalle;
  if ('mensajeCliente' in changes) db.mensaje_cliente = changes.mensajeCliente;
  if ('proximaAccionEn' in changes) db.proxima_accion_en = changes.proximaAccionEn;
  const { error } = await dbEscritura().from('automation_logs').update(db).eq('id', id).eq('studio_id', studioId);
  if (error) reportDbError('[dbUpdateAutomationLog]', error);
}


// Auditoría 22ª pasada (3-sep-2026), D-7. Antes esta función no devolvía
// nada: un `uq_studios_stripe_account` (una cuenta de Stripe Connect ya
// vinculada a OTRO estudio — el caso natural de una cadena con varias sedes
// que reconecta sin querer la misma cuenta) se registraba con
// `reportDbError` y el callback seguía adelante como si nada, redirigiendo a
// `?stripe_connected=1`. La propietaria creía que ya cobraba y no era así.
export async function dbSetStripeAccountId(studioId: string, stripeAccountId: string | null): Promise<ResultadoEscritura> {
  // A-1: se ejecuta en el callback OAuth de Stripe Connect (servidor, sin sesión
  // de usuario). Con el cliente anónimo, la política owner_studios (que exige
  // current_studio_id()) no casa ninguna fila → el binding NO se guardaba y el
  // onboarding de Stripe quedaba roto en silencio. Con service-role sí persiste.
  const admin = getSupabaseAdmin();
  if (!admin) {
    reportDbError('[dbSetStripeAccountId]', new Error('service role no configurada'));
    return { ok: false, error: 'Servidor no configurado.' };
  }
  const { error } = await admin.from('studios').update({ stripe_account_id: stripeAccountId }).eq('id', studioId);
  if (error) {
    if (error.code === '23505' && error.message.includes('uq_studios_stripe_account')) {
      return { ok: false, error: 'Esta cuenta de Stripe ya está conectada a otro estudio de Tentare.' };
    }
    reportDbError('[dbSetStripeAccountId]', error);
    return { ok: false, error: 'No se pudo guardar la conexión con Stripe.' };
  }
  return { ok: true };
}

// Igual que el callback de Stripe: sin sesión de usuario, así que hace falta
// la service role (el cliente anon no tiene permiso de escritura sobre
// `studios` fuera de una sesión autenticada).

export async function dbSetGoogleCalendarEmail(studioId: string, email: string | null) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('studios').update({ google_calendar_email: email }).eq('id', studioId);
  if (error) reportDbError('[dbSetGoogleCalendarEmail]', error);
}


export interface GoogleCalendarCredenciales {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}


export async function dbGetGoogleCalendarCredenciales(studioId: string): Promise<GoogleCalendarCredenciales | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin
    .from('integracion_credenciales')
    .select('access_token, refresh_token, expires_at')
    .eq('studio_id', studioId)
    .eq('provider', 'google_calendar')
    .maybeSingle();
  if (error) { reportDbError('[dbGetGoogleCalendarCredenciales]', error); return null; }
  if (!data || !data.refresh_token) return null;
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: data.expires_at };
}


export async function dbSaveGoogleCalendarCredenciales(studioId: string, c: GoogleCalendarCredenciales) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('integracion_credenciales').upsert({
    studio_id: studioId,
    provider: 'google_calendar',
    access_token: c.accessToken,
    refresh_token: c.refreshToken,
    expires_at: c.expiresAt,
    actualizado_en: new Date().toISOString(),
  }, { onConflict: 'studio_id,provider' });
  if (error) reportDbError('[dbSaveGoogleCalendarCredenciales]', error);
}


export async function dbDeleteGoogleCalendarCredenciales(studioId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('integracion_credenciales').delete().eq('studio_id', studioId).eq('provider', 'google_calendar');
  if (error) reportDbError('[dbDeleteGoogleCalendarCredenciales]', error);
}

// Klaviyo (paso 7, docs/marketing-integrations-arquitectura.md §6) — mismo
// patrón exacto que Google Calendar, con `listId` extra (metadata jsonb: la
// lista donde caen las socias sincronizadas, se crea una vez por estudio).
export interface KlaviyoCredenciales {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  listId: string | null;
}

export async function dbGetKlaviyoCredenciales(studioId: string): Promise<KlaviyoCredenciales | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin
    .from('integracion_credenciales')
    .select('access_token, refresh_token, expires_at, metadata')
    .eq('studio_id', studioId)
    .eq('provider', 'klaviyo')
    .maybeSingle();
  if (error) { reportDbError('[dbGetKlaviyoCredenciales]', error); return null; }
  if (!data || !data.refresh_token) return null;
  const metadata = data.metadata as { listId?: string } | null;
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: data.expires_at, listId: metadata?.listId ?? null };
}

export async function dbSaveKlaviyoCredenciales(studioId: string, c: KlaviyoCredenciales) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('integracion_credenciales').upsert({
    studio_id: studioId,
    provider: 'klaviyo',
    access_token: c.accessToken,
    refresh_token: c.refreshToken,
    expires_at: c.expiresAt,
    metadata: c.listId ? { listId: c.listId } : null,
    actualizado_en: new Date().toISOString(),
  }, { onConflict: 'studio_id,provider' });
  if (error) reportDbError('[dbSaveKlaviyoCredenciales]', error);
}

export async function dbDeleteKlaviyoCredenciales(studioId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('integracion_credenciales').delete().eq('studio_id', studioId).eq('provider', 'klaviyo');
  if (error) reportDbError('[dbDeleteKlaviyoCredenciales]', error);
}

export async function dbSetKlaviyoAccountName(studioId: string, nombre: string | null) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('studios').update({ klaviyo_account_name: nombre }).eq('id', studioId);
  if (error) reportDbError('[dbSetKlaviyoAccountName]', error);
}

// Mailchimp: sin OAuth (ver lib/mailchimp.ts) — la clave API/audienceId/
// serverPrefix del estudio viven en la tabla genérica `integraciones`,
// leídas con dbGetIntegracionConfig(studioId, 'MAILCHIMP') igual que Kisi.

// Gmail: mismo patrón exacto que Google Calendar (misma app de Google,
// mismo `integracion_credenciales` genérico por proveedor — solo cambia el
// valor de `provider` a 'gmail' para no mezclar los tokens de las dos
// integraciones, que un estudio puede tener conectadas independientemente).

export async function dbSetGmailEmail(studioId: string, email: string | null) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('studios').update({ gmail_email: email }).eq('id', studioId);
  if (error) reportDbError('[dbSetGmailEmail]', error);
}


export interface GmailCredenciales {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}


export async function dbGetGmailCredenciales(studioId: string): Promise<GmailCredenciales | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin
    .from('integracion_credenciales')
    .select('access_token, refresh_token, expires_at')
    .eq('studio_id', studioId)
    .eq('provider', 'gmail')
    .maybeSingle();
  if (error) { reportDbError('[dbGetGmailCredenciales]', error); return null; }
  if (!data || !data.refresh_token) return null;
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: data.expires_at };
}


export async function dbSaveGmailCredenciales(studioId: string, c: GmailCredenciales) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('integracion_credenciales').upsert({
    studio_id: studioId,
    provider: 'gmail',
    access_token: c.accessToken,
    refresh_token: c.refreshToken,
    expires_at: c.expiresAt,
    actualizado_en: new Date().toISOString(),
  }, { onConflict: 'studio_id,provider' });
  if (error) reportDbError('[dbSaveGmailCredenciales]', error);
}


export async function dbDeleteGmailCredenciales(studioId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('integracion_credenciales').delete().eq('studio_id', studioId).eq('provider', 'gmail');
  if (error) reportDbError('[dbDeleteGmailCredenciales]', error);
}

// Zoom: mismo patrón exacto que Google Calendar/Gmail (una app de Zoom para
// toda la plataforma, `integracion_credenciales` genérico por proveedor con
// provider='zoom'). Sustituye al Server-to-Server OAuth de una sola cuenta:
// cada estudio conecta ahora la suya propia.

export async function dbSetZoomEmail(studioId: string, email: string | null) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('studios').update({ zoom_email: email }).eq('id', studioId);
  if (error) reportDbError('[dbSetZoomEmail]', error);
}


export interface ZoomCredenciales {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
}


export async function dbGetZoomCredenciales(studioId: string): Promise<ZoomCredenciales | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin
    .from('integracion_credenciales')
    .select('access_token, refresh_token, expires_at')
    .eq('studio_id', studioId)
    .eq('provider', 'zoom')
    .maybeSingle();
  if (error) { reportDbError('[dbGetZoomCredenciales]', error); return null; }
  if (!data || !data.refresh_token) return null;
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: data.expires_at };
}


export async function dbSaveZoomCredenciales(studioId: string, c: ZoomCredenciales) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('integracion_credenciales').upsert({
    studio_id: studioId,
    provider: 'zoom',
    access_token: c.accessToken,
    refresh_token: c.refreshToken,
    expires_at: c.expiresAt,
    actualizado_en: new Date().toISOString(),
  }, { onConflict: 'studio_id,provider' });
  if (error) reportDbError('[dbSaveZoomCredenciales]', error);
}


export async function dbDeleteZoomCredenciales(studioId: string) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  const { error } = await admin.from('integracion_credenciales').delete().eq('studio_id', studioId).eq('provider', 'zoom');
  if (error) reportDbError('[dbDeleteZoomCredenciales]', error);
}

// Config guardada por el propio estudio para una integración "campos" (Kisi,
// WhatsApp Business) — cada negocio pega su propia clave/token, no hay
// secreto compartido de plataforma. Lo usan las rutas de "Probar conexión".

export async function dbGetIntegracionConfig(studioId: string, tipo: TipoIntegracion): Promise<{ activo: boolean; config: Record<string, string> } | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  const { data, error } = await admin
    .from('integraciones')
    .select('activo, config')
    .eq('studio_id', studioId)
    .eq('tipo', tipo)
    .maybeSingle();
  if (error) { reportDbError('[dbGetIntegracionConfig]', error); return null; }
  if (!data) return null;
  return { activo: !!data.activo, config: (data.config as Record<string, string>) ?? {} };
}

// WhatsApp Embedded Signup v4 (ver WHATSAPP_AUDIT.md / META_SETUP.md): guarda
// la conexión ya VALIDADA contra la Graph API por la ruta que llama a esto —
// esta función no valida nada, solo persiste. Con service role (la ruta ya
// resolvió `studioId` de la sesión, nunca de un payload de cliente) porque el
// callback de Embedded Signup no tiene sesión de navegador con la que la RLS
// pudiera operar, a diferencia del guardado manual (`dbUpsertIntegracion`,
// que sí corre con el cliente autenticado del usuario).
export async function dbGuardarConexionWhatsappEmbeddedSignup(
  studioId: string,
  datos: {
    token: string;
    phoneNumberId: string;
    wabaId: string;
    businessId: string | null;
    displayPhoneNumber: string | null;
    verifiedName: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string; conflict?: boolean }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: 'Service role no configurada' };

  const { data: existente } = await admin
    .from('integraciones')
    .select('id, config')
    .eq('studio_id', studioId)
    .eq('tipo', 'WHATSAPP')
    .maybeSingle();
  const configAnterior = (existente?.config as Record<string, string>) ?? {};

  const row = {
    id: existente?.id ?? `intg-whatsapp-${uid()}`,
    studio_id: studioId,
    tipo: 'WHATSAPP',
    activo: true,
    phone_number_id: datos.phoneNumberId,
    config: {
      ...configAnterior,
      token: datos.token,
      phoneId: datos.phoneNumberId,
      wabaId: datos.wabaId,
      businessId: datos.businessId ?? '',
      displayPhoneNumber: datos.displayPhoneNumber ?? '',
      verifiedName: datos.verifiedName ?? '',
      // Conservada tal cual si ya existía (una reconexión no cambia si la
      // plantilla está aprobada en Meta); por defecto 'false' para una
      // conexión nueva, igual que hoy hace el formulario manual.
      plantillaAprobada: configAnterior.plantillaAprobada ?? 'false',
    },
    actualizado_en: new Date().toISOString(),
    // Credenciales nuevas: la salud del token anterior ya no vale (ver mismo
    // criterio en dbUpsertIntegracion). Quien llama marca el éxito real con
    // registrarSaludIntegracion justo después de guardar.
    ultimo_ok_en: null,
    ultimo_error: null,
    ultimo_error_en: null,
  };

  const { error } = await admin.from('integraciones').upsert(row, { onConflict: 'studio_id,tipo' });
  if (error) {
    // 23505 = violación del índice único parcial de phone_number_id: el
    // número ya está conectado a OTRA fila (otro estudio, o basura de una
    // reconexión anterior mal cerrada) — nunca un error técnico crudo aquí.
    // `conflict: true` distingue este caso (409, la propietaria puede
    // actuar) de un fallo de infraestructura (500, no es su culpa) para
    // quien llama — antes ambos volvían indistinguibles como `{ok:false}`.
    if (error.code === '23505') {
      return { ok: false, conflict: true, error: 'Ese número de WhatsApp ya está conectado a otro estudio en Tentare.' };
    }
    reportDbError('[dbGuardarConexionWhatsappEmbeddedSignup]', error);
    return { ok: false, error: 'No se pudo guardar la conexión de WhatsApp.' };
  }
  return { ok: true };
}



// ─── Movidas desde lib/supabase-data.ts (P-7, 26ª pasada de auditoría) ──────
//
// Ninguna la llama código de cliente (solo lib/decision/snapshot.ts, servidor) —
// mismo criterio que ya trajo aquí el resto de este fichero (#559). El cluster
// fetchCriticalStudioData/fetchAllStudioData/dbEscritura que SÍ compartían
// cliente y servidor se cerró aparte, con el patrón núcleo-compartido +
// wrapper: ver fetchAllStudioDataServidor/dbUpdateAutomationRuleServidor/
// dbUpdateAutomatizacionServidor al final de este fichero, y sus núcleos
// (…Con) en lib/supabase-data.ts. Con eso, supabase-admin.ts ya lleva
// `server-only`.

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

// Captación C3 (Decision OS): eventos crudos de `widget_eventos` para medir
// abandono de checkout en el widget de reservas — solo los dos tipos que
// hacen falta para el cruce (checkout_started/booking_completed por
// session_id), nunca toda la tabla (widget_loaded/class_list_viewed... son
// mucho más numerosos y no aportan nada aquí). Mismo patrón service-role que
// fetchIntentosFallidosRecientes justo arriba.
export interface WidgetEventoAbandonoRow {
  sessionId: string;
  tipo: 'checkout_started' | 'booking_completed';
  creadoEn: string;
}

export async function fetchAbandonoCheckoutReciente(studioId: string, desdeISO: string): Promise<WidgetEventoAbandonoRow[]> {
  const db = getSupabaseAdmin() ?? supabase;
  // QA (PR #1274): sin `order`, PostgREST corta en `max_rows` (1000, ver
  // supabase/config.toml) sin garantía de qué filas caen dentro — mismo
  // patrón ya documentado en memoria del proyecto (truncado-1000-filas), pero
  // esta query es nueva. El widget público acumula tráfico anónimo sin gate
  // de login en checkout_started, así que un estudio con volumen medio/alto
  // puede superar 1000 eventos en 60 días. `order` por fecha descendente da
  // al menos un corte determinista y prioriza lo más reciente (que es lo que
  // más pesa en la ventana de 14d) sobre lo más antiguo de la ventana base.
  const { data, error } = await db
    .from('widget_eventos')
    .select('session_id, tipo, creado_en')
    .eq('studio_id', studioId)
    .in('tipo', ['checkout_started', 'booking_completed'])
    .gte('creado_en', desdeISO)
    .order('creado_en', { ascending: false })
    .limit(1000) as { data: { session_id: string; tipo: 'checkout_started' | 'booking_completed'; creado_en: string }[] | null; error: { message: string } | null };
  if (error) { reportDbError('[fetchAbandonoCheckoutReciente]', error); return []; }
  return (data ?? []).map(r => ({ sessionId: r.session_id, tipo: r.tipo, creadoEn: r.creado_en }));
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

// ─── Wrappers de servidor (P-7, 26ª pasada) ──────────────────────────────────
//
// Resuelven `getSupabaseAdmin() ?? supabase` y llaman al núcleo compartido
// (definido en lib/supabase-data.ts, que ya NO importa getSupabaseAdmin).
// Úsalos desde cualquier código que corre sin sesión de usuario (crons,
// motor de automatizaciones) — el resto sigue con la versión de cliente.

export async function fetchAllStudioDataServidor(studioId?: string) {
  const db = getSupabaseAdmin() ?? supabase;
  const [critical, deferred] = await Promise.all([
    // `columnas`: el servidor sigue leyendo las 12 columnas privadas de socias
    // de la tabla (service_role). La RPC del panel le devolvería cero filas.
    fetchCriticalStudioDataCon(db, studioId, { privadas: 'columnas' }),
    fetchDeferredStudioDataCon(db, studioId),
  ]);
  return { ...critical, ...deferred };
}

export async function dbUpdateAutomationRuleServidor(id: string, studioId: string, changes: Partial<AutomationRule>) {
  return dbUpdateAutomationRuleCon(getSupabaseAdmin() ?? supabase, id, studioId, changes);
}

export async function dbUpdateAutomatizacionServidor(id: string, studioId: string, changes: Partial<Automatizacion>) {
  return dbUpdateAutomatizacionCon(getSupabaseAdmin() ?? supabase, id, studioId, changes);
}
