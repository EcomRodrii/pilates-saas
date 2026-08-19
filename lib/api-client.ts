'use client';

import { supabase } from '@/lib/db/supabase';
import { supabasePortal } from '@/lib/db/supabase-portal';
import type { Factura } from '@/lib/types';
import type { ThemeConfig, ThemeDraft } from '@/lib/theme-schema';
import type { LayoutConfig, LayoutDraft } from '@/lib/layout-schema';
import { resolverBloques, type BloqueHome, type PantallaId, conFijos, PANTALLA_IDS } from '@/lib/portal-home-bloques';
import { mensajeSeguro, mensajeHttp, type ResultadoEscritura } from '@/lib/errores';
import { leerAvisoCobro, type CobroAprobado } from '@/lib/billing/resultado-cobro';
import type { OrigenPago } from '@/lib/billing/origen-pago';
import type { FaseTrial } from '@/lib/billing/trial';
import type { ContactoFila } from '@/lib/sustituciones/traza';
import type { DiagnosticoEquipo } from '@/lib/sustituciones/preparacion';
import type {
  PerfilNetwork, PerfilNetworkPublico, CambiosPerfilNetwork, FiltroBusquedaNetwork,
  ExperienciaNetwork, ExperienciaNetworkPublica, NuevaExperienciaNetwork, BadgesNetwork,
  MensajeNetwork, FormalizacionNetwork,
  PerfilIdentidadNetwork, CambiosPerfilIdentidadNetwork, VerificacionIdentidadNetwork,
  CertificacionNetwork, NuevaCertificacionNetwork,
  VacanteNetwork, NuevaVacanteNetwork, CambiosVacanteNetwork, CandidaturaNetwork,
} from '@/lib/network/tipos';
import type { EncajeCandidatura } from '@/lib/network/encaje-candidatura';
import type { CandidatoNetworkSustitucion } from '@/lib/network/tipos.ts';

// Cabecera Authorization con el JWT de la sesión de staff (Supabase Auth). Las
// rutas de servidor de staff la validan con verificarSesionStaff. Devuelve {}
// si no hay sesión (la ruta responderá 401).
export async function authHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

// Cabecera Authorization con el JWT de la SOCIA (portal, magic link). La validan
// verificarUsuarioSupabase + socioAutenticado en los endpoints públicos que ya
// exigen sesión real. Devuelve {} si no hay sesión de socia.
export async function portalAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabasePortal.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

// ── Tema white-label (editor de marca, solo propietario) ─────────────────────
// ─── Deduplicación de peticiones EN VUELO ────────────────────────────────────
//
// Varias piezas del panel piden lo mismo al montar: `fetchLayout` lo llaman el
// sidebar, el dashboard, el editor de temas y studio-context — cuatro sitios,
// sin saber unos de otros. Medido en producción, eso son dos peticiones
// idénticas por carga a /api/layout, /api/theme y /api/billing/status. Cada una
// arrastra además `verificarSesionStaff` entero en el servidor.
//
// Esto NO es una caché: la entrada se borra en cuanto la petición termina, así
// que solo pueden compartirla las llamadas literalmente simultáneas. No puede
// servir un dato viejo ni retrasar una invalidación — el peor caso es que no
// coincidan y se hagan las dos, exactamente como ahora.
//
// Por eso no lleva TTL: un TTL sí introduciría staleness, y estos tres datos
// (menú, tema, estado de suscripción) los reescribe el propio panel y tienen
// que verse al instante.
const enVuelo = new Map<string, Promise<unknown>>();

function unaVez<T>(clave: string, hacer: () => Promise<T>): Promise<T> {
  const yaVa = enVuelo.get(clave);
  if (yaVa) return yaVa as Promise<T>;
  // `finally` y no `then`: la entrada también tiene que soltarse si la petición
  // falla, o un fallo puntual dejaría a todo el mundo pegado a una promesa
  // rechazada para siempre.
  const p = hacer().finally(() => { enVuelo.delete(clave); });
  enVuelo.set(clave, p);
  return p;
}

export async function fetchThemeBorrador(): Promise<ThemeConfig> {
  return unaVez('theme-borrador', async () => {
    const res = await fetch('/api/theme?draft=1', { headers: await authHeader() });
    if (!res.ok) throw new Error('No se pudo cargar el tema');
    return res.json() as Promise<ThemeConfig>;
  });
}

// El tema PUBLICADO — el que ven las socias ahora mismo. La biblioteca de temas
// lo necesita para poder decir "N cambios sin publicar" comparándolo con el
// borrador; el resto del editor solo trabaja contra el borrador.
//
// ⚠️ Se INTENTÓ juntarlo con el borrador en una sola petición (`?ambos=1`) para
// ahorrar un viaje al abrir el editor, y se revirtió: `/api/theme` lo pide el
// panel ENTERO, así que cambiarle la forma obliga a que todos sus lectores
// —y los 55 specs que lo mockean— conozcan el sobre nuevo. Un viaje de ~140 ms
// en una pantalla no paga eso. Lo caro de verdad es el arranque en frío, y eso
// no se arregla desde aquí.
export async function fetchThemePublicado(): Promise<ThemeConfig> {
  return unaVez('theme-publicado', async () => {
    const res = await fetch('/api/theme', { headers: await authHeader() });
    if (!res.ok) throw new Error('No se pudo cargar el tema publicado');
    return res.json() as Promise<ThemeConfig>;
  });
}

export async function guardarThemeBorrador(parche: ThemeDraft): Promise<ThemeConfig> {
  const res = await fetch('/api/theme', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(parche),
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(mensajeSeguro(b.error, 'No se han podido guardar los cambios de marca. Vuelve a intentarlo.'));
  }
  return res.json();
}

export type ResultadoPublicar =
  | { ok: true; theme: ThemeConfig }
  | { ok: false; errores: string[] };

export async function publicarThemeApi(): Promise<ResultadoPublicar> {
  const res = await fetch('/api/theme/publish', { method: 'POST', headers: await authHeader() });
  if (res.status === 422) {
    const b = (await res.json()) as { errores?: string[] };
    return { ok: false, errores: b.errores ?? ['Contraste insuficiente'] };
  }
  if (!res.ok) throw new Error('Error al publicar');
  return { ok: true, theme: await res.json() };
}

// ── Configuración de menú por estudio (Fase 4) ───────────────────────────────
export async function fetchLayout(): Promise<LayoutConfig> {
  return unaVez('layout', async () => {
    const res = await fetch('/api/layout', { headers: await authHeader() });
    if (!res.ok) throw new Error('No se pudo cargar el menú');
    return res.json() as Promise<LayoutConfig>;
  });
}

export async function guardarLayoutApi(parche: LayoutDraft): Promise<LayoutConfig> {
  const res = await fetch('/api/layout', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(parche),
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(mensajeSeguro(b.error, 'No se ha podido guardar el menú. Vuelve a intentarlo.'));
  }
  return res.json();
}

// ── Constructor de bloques del portal (Fase 3, generalizado a todas las
// pantallas en la Fase 1 del Theme Builder) ─────────────────────────────────
// Flujo borrador/publicado propio POR PANTALLA, distinto de
// fetchLayout/guardarLayoutApi (que se aplican en vivo) — ver comentario en
// layout-schema.ts.
export async function fetchBloquesBorrador(pantalla: PantallaId): Promise<BloqueHome[]> {
  const res = await fetch(`/api/portal-bloques?pantalla=${pantalla}`, { headers: await authHeader() });
  if (!res.ok) throw new Error('No se pudieron cargar los bloques del portal');
  // ⚠️ `resolverBloques`, no `res.json()` a secas. El EDITOR tiene que ver
  // exactamente lo mismo que el render, y el render sí resuelve
  // (`resolveBloquesPantalla`, server-side). Con el JSON crudo, un campo que
  // el estudio no ha tocado llega `undefined` y su casilla sale VACÍA —
  // enseñando un texto que no es el que ve la socia, y guardando `''` encima
  // en cuanto el autoguardado dispara: borrando el texto de verdad.
  //
  // No se notaba con los bloques del catálogo porque su config siempre venía
  // entera del servidor; salió al abrir campos en los bloques de sistema,
  // cuyo jsonb no tiene `config` en ningún estudio existente.
  // `conFijos` por el mismo motivo que `resolverBloques`: el editor tiene que
  // ver EXACTAMENTE lo mismo que el render. El GET devuelve el borrador crudo
  // tal cual está guardado; el camino del servidor le añade los fijos que
  // falten, y sin esta llamada el panel se los comía.
  return conFijos(resolverBloques(await res.json()), pantalla);
}
/**
 * Los bloques BORRADOR de las tres pantallas, en una sola petición.
 *
 * El editor las necesita las tres al abrir y antes las pedía por separado. Las
 * tres salen de la misma lectura del layout en el servidor, así que eran tres
 * viajes para un dato. Mismo tratamiento por pantalla que
 * `fetchBloquesBorrador` —`resolverBloques` + `conFijos`— para que el editor
 * vea EXACTAMENTE lo que ve el render.
 */
export async function fetchBloquesBorradorTodas(): Promise<Record<PantallaId, BloqueHome[]>> {
  return unaVez('bloques-borrador-todas', async () => {
    const res = await fetch('/api/portal-bloques?pantalla=todas', { headers: await authHeader() });
    if (!res.ok) throw new Error('No se pudieron cargar los bloques del portal');
    const crudo = (await res.json()) as Record<string, unknown>;
    const salida = {} as Record<PantallaId, BloqueHome[]>;
    for (const p of PANTALLA_IDS) salida[p] = conFijos(resolverBloques(crudo[p]), p);
    return salida;
  });
}

/**
 * Los bloques que están viendo las socias ahora mismo en esa pantalla.
 *
 * Mismo tratamiento que el borrador —`resolverBloques` + `conFijos`— por el
 * mismo motivo: quien lo lea tiene que ver EXACTAMENTE lo que ve el render.
 */
export async function fetchBloquesPublicado(pantalla: PantallaId): Promise<BloqueHome[]> {
  const res = await fetch(`/api/portal-bloques?pantalla=${pantalla}&estado=publicado`, { headers: await authHeader() });
  if (!res.ok) throw new Error('No se pudieron cargar los bloques publicados del portal');
  return conFijos(resolverBloques(await res.json()), pantalla);
}


/**
 * La sesión de staff ya no vale. Se distingue del resto de fallos porque
 * pide una acción DISTINTA: reintentar no arregla nada, hay que volver a
 * entrar.
 *
 * ⚠️ Salió de mirar el editor en producción: con la sesión caducada, todas
 * las llamadas daban 401 y el autoguardado se quedaba reintentando cada
 * minuto con un «no se ha podido guardar» genérico. La propietaria podía
 * seguir editando media hora sin enterarse de que nada se estaba guardando.
 */
export class ErrorSesionCaducada extends Error {
  constructor() { super('Tu sesión ha caducado.'); this.name = 'ErrorSesionCaducada'; }
}

export function esSesionCaducada(e: unknown): boolean {
  return e instanceof ErrorSesionCaducada;
}

export async function guardarBloquesBorradorApi(pantalla: PantallaId, bloques: BloqueHome[]): Promise<BloqueHome[]> {
  const res = await fetch(`/api/portal-bloques?pantalla=${pantalla}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(bloques),
  });
  if (!res.ok) {
    if (res.status === 401) throw new ErrorSesionCaducada();
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(mensajeSeguro(b.error, 'No se han podido guardar los bloques del portal. Vuelve a intentarlo.'));
  }
  return res.json();
}

export async function publicarBloquesApi(pantalla: PantallaId): Promise<BloqueHome[]> {
  const res = await fetch(`/api/portal-bloques/publish?pantalla=${pantalla}`, { method: 'POST', headers: await authHeader() });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(mensajeSeguro(b.error, 'No se han podido publicar los cambios del portal. Vuelve a intentarlo.'));
  }
  return res.json();
}

// Token firmado de corta duración para /portal-preview/[slug] (Fase 4 del
// editor de temas — preview en vivo del constructor de bloques). Ver
// lib/theme/home-preview-token.ts.
/**
 * Token + slug del estudio de la sesión, en una sola petición.
 *
 * El slug viene de aquí y no de `useStudio()` a propósito: así la vista previa
 * puede arrancar sin esperar a que cargue el contexto entero del panel. Ver el
 * comentario del endpoint.
 */
export async function fetchHomePreviewToken(): Promise<{ token: string; slug: string | null }> {
  return unaVez('home-preview-token', async () => {
    const res = await fetch('/api/theme/home-preview-token', { method: 'POST', headers: await authHeader() });
    if (!res.ok) throw new Error('No se pudo preparar la vista previa');
    const b = (await res.json()) as { token: string; slug?: string | null };
    return { token: b.token, slug: b.slug ?? null };
  });
}

// ── Datos públicos (proxy scopeado) ─────────────────────────────────────────
// Carga el catálogo del estudio + (si hay socia en sesión) sus datos, vía el
// endpoint de servidor con service-role. Sustituye el acceso anónimo directo.
//
// `liviano` (audit de rendimiento de los widgets embebibles): /reservar/[slug]
// nunca lee vídeos/recompensas/niveles/logros/retos/contenido de portal — solo
// el portal instalable (app/portal/[slug]) los usa. Sin esta señal el servidor
// no puede distinguir quién llama al mismo endpoint compartido.
export async function cargarDatosPublicos(slug: string, opts?: { liviano?: boolean; baseUrl?: string }) {
  // La identidad de la socia va en el JWT (Bearer), no en el body: el servidor
  // deriva sus datos del token. Sin sesión → solo catálogo público.
  //
  // `baseUrl` (opcional, `''` de forma que la ruta sigue siendo relativa por
  // defecto — el comportamiento de siempre para /reservar y el portal): el
  // bundle embebible (Modo B) corre en el DOM de la web del estudio, así que
  // una ruta relativa resolvería contra SU origen, no el de Tentare. Ver
  // lib/widget/usar-datos-widget.ts, que es el único caller que lo pasa.
  //
  // Con `baseUrl` (llamada cross-origin) el slug va TAMBIÉN en la URL
  // (?slug=): el preflight CORS (lib/cors-widget.ts) no puede leer el body
  // JSON, así que resuelve la lista blanca del estudio desde la query string.
  const url = opts?.baseUrl
    ? `${opts.baseUrl}/api/public/studio-data?slug=${encodeURIComponent(slug)}`
    : '/api/public/studio-data';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
    body: JSON.stringify({ slug, liviano: opts?.liviano ?? false }),
  });
  if (!res.ok) return null;
  return res.json();
}

// Solo el aforo de las clases próximas — lo ÚNICO que necesita el tic de 5s del
// portal. `cargarDatosPublicos` de arriba trae el catálogo entero del estudio y
// el histórico financiero de la socia, que no cambian en cinco segundos.
//
// Sin cabecera de sesión a propósito: la respuesta no lleva ningún dato
// personal, así que mandar el Bearer solo serviría para que la caché de la CDN
// dejara de ser compartida entre socias del mismo estudio.
export async function cargarAforoPublico(
  slug: string,
): Promise<{ sesionIds: string[]; aforoReservas: { id: string; sesion_id: string; estado: string; spot_id: string | null }[] } | null> {
  const res = await fetch(`/api/public/aforo?slug=${encodeURIComponent(slug)}`);
  if (!res.ok) return null;
  return res.json();
}

// "Renovar en un toque" (portal): garantiza en servidor que exista el recibo de
// renovación del plan de la socia y devuelve su id, listo para pagarlo con el
// checkout de recibos. La identidad va en el JWT; la suscripción se resuelve
// en servidor.
export async function prepararRenovacionPlan(studioId: string): Promise<{ reciboId: string } | { error: string }> {
  try {
    const res = await fetch('/api/public/renovar-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
      body: JSON.stringify({ studioId }),
    });
    const data = await res.json().catch(() => null) as { reciboId?: string; error?: string } | null;
    if (!res.ok || !data?.reciboId) return { error: data?.error ?? 'No se ha podido preparar la renovación.' };
    return { reciboId: data.reciboId };
  } catch {
    return { error: 'No se ha podido preparar la renovación.' };
  }
}

// Lee la identidad de la socia guardada en el navegador (portal o reserva).
export function leerSociaLocal(): { socioId: string; email: string } | null {
  if (typeof window === 'undefined') return null;
  for (const key of ['ps_portal_session', 'ps_portal_socia']) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const s = JSON.parse(raw) as { socioId?: string; email?: string };
      if (s?.socioId && s?.email) return { socioId: s.socioId, email: s.email };
    } catch { /* ignore */ }
  }
  return null;
}

// ── Sustituciones: enlace de disponibilidad de una instructora ──────────────
// Pide al servidor un deep link firmado (sin login) para que la instructora
// rellene su disponibilidad. El servidor lo firma con su secreto y exige rol
// PROPIETARIO; el studio_id sale del JWT. Devuelve la URL lista para compartir.
export async function generarEnlaceDisponibilidad(
  instructorId: string,
  scope: 'disponibilidad' | 'reportar_baja' = 'disponibilidad',
): Promise<{ url: string } | { error: string }> {
  try {
    const res = await fetch('/api/sustituciones/enlace-instructora', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ instructorId, scope }),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !data.url) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return { url: data.url };
  } catch {
    return { error: 'No se pudo generar el enlace' };
  }
}

// P2-10: pide la disponibilidad a VARIAS instructoras a la vez por email, en
// vez de copiar y reenviar un enlace una a una. Resultado por instructora
// (nunca todo-o-nada): ver app/api/sustituciones/pedir-disponibilidad.
export type ResultadoPeticionDisponibilidad = { id: string; ok: true } | { id: string; ok: false; error: string };

export async function pedirDisponibilidadMasiva(
  instructorIds: string[],
): Promise<ResultadoPeticionDisponibilidad[] | { error: string }> {
  try {
    const res = await fetch('/api/sustituciones/pedir-disponibilidad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ instructorIds }),
    });
    const data = (await res.json().catch(() => ({}))) as { resultados?: ResultadoPeticionDisponibilidad[]; error?: string };
    if (!res.ok || !data.resultados) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return data.resultados;
  } catch {
    return { error: 'No se pudo conectar con el servidor' };
  }
}

export interface SustitucionCandidata {
  instructor_id: string;
  nombre: string;
  score: number;
  compatibilidad: number; // 0-100, para la barra de encaje de la card
  veces: number;          // clases impartidas de este tipo
  motivos: string[];
  // Probabilidad de que ACEPTE, estimada con su historial real de respuestas
  // (rankear_candidatas, migr 20260810231458). `null` = no hay historial
  // suficiente para afirmar nada — NO es probabilidad cero, y no debe pintarse
  // ningún porcentaje en ese caso. Las filas de rankings guardados antes de esa
  // migración tampoco lo traen, de ahí el opcional.
  prob_aceptacion?: number | null; // 0..1
  prob_aceptadas?: number;         // veces que dijo que sí
  prob_ofertas?: number;           // veces que se le pidió (observaciones)
}
export interface SustitucionPanel {
  id: string;
  estado: string;
  motivo: string | null;
  // 'instructora' = la avisó ella desde su móvil (0056). Las filas anteriores a
  // esa migración no lo traen → tratar la ausencia como 'panel'.
  origen?: 'panel' | 'instructora';
  creado_en: string;
  resuelto_en: string | null;
  instructor_original_id: string | null;
  sustituta_final_id: string | null;
  ranking: SustitucionCandidata[];
  // Ausente en filas anteriores a la migración 20260818010000 → tratar como [].
  candidatos_network?: CandidatoNetworkSustitucion[] | null;
  sesion_id: string;
  sesiones: { inicio: string; fin: string; tipo_clase_id: string | null; cancelada: boolean } | null;
  // Traza de contactos (embed). Ausente en respuestas antiguas → tratar como [].
  sustitucion_contactos?: ContactoFila[];
}

// Marca una baja: "no puedo dar esta clase" → crea la sustitución + ranking.
export async function crearBaja(sesionId: string, motivo?: string): Promise<{ ok: true } | { error: string }> {
  try {
    const res = await fetch('/api/sustituciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ sesionId, motivo }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return { ok: true };
  } catch {
    return { error: 'No se pudo crear la baja' };
  }
}

export async function listarSustituciones(): Promise<{
  items: SustitucionPanel[]; avisarAlumnas: boolean; modoAutonomia: string; autonomiaDisponible: boolean; equipo: DiagnosticoEquipo;
}> {
  // Equipo vacío como valor por defecto: ante un fallo NO inventamos un aviso de
  // "te falta configurar el equipo" que podría ser mentira.
  const vacio: DiagnosticoEquipo = { total: 0, sinDisponibilidad: [] };
  try {
    const res = await fetch('/api/sustituciones', { headers: await authHeader() });
    if (!res.ok) return { items: [], avisarAlumnas: false, modoAutonomia: 'asistido', autonomiaDisponible: false, equipo: vacio };
    const data = (await res.json()) as {
      sustituciones?: SustitucionPanel[]; avisarAlumnas?: boolean; modoAutonomia?: string; autonomiaDisponible?: boolean; equipo?: DiagnosticoEquipo;
    };
    return {
      items: data.sustituciones ?? [],
      avisarAlumnas: !!data.avisarAlumnas,
      modoAutonomia: data.modoAutonomia ?? 'asistido',
      autonomiaDisponible: !!data.autonomiaDisponible,
      equipo: data.equipo ?? vacio,
    };
  } catch {
    return { items: [], avisarAlumnas: false, modoAutonomia: 'asistido', autonomiaDisponible: false, equipo: vacio };
  }
}

// Cancela la clase (no hay sustituta) y avisa a las alumnas apuntadas.
// Mueve la clase sin sustituta a un horario nuevo (misma duración) y avisa a
// las alumnas del cambio. `inicio` en ISO; el solape lo re-valida el servidor.
export async function reprogramarClase(sustitucionId: string, inicio: string): Promise<{ ok: true; alumnas?: { avisadas: number; total: number; skipped: boolean; desactivado: boolean } } | { error: string }> {
  try {
    const res = await fetch('/api/sustituciones', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ sustitucionId, action: 'reprogramar', inicio }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; alumnas?: { avisadas: number; total: number; skipped: boolean; desactivado: boolean } };
    if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return { ok: true, alumnas: data.alumnas };
  } catch {
    return { error: 'No se pudo reprogramar' };
  }
}

export async function cancelarClase(sustitucionId: string): Promise<{ ok: true; alumnas?: { avisadas: number; total: number; skipped: boolean; desactivado: boolean } } | { error: string }> {
  try {
    const res = await fetch('/api/sustituciones', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ sustitucionId, action: 'cancelar_clase' }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; alumnas?: { avisadas: number; total: number; skipped: boolean; desactivado: boolean } };
    if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return { ok: true, alumnas: data.alumnas };
  } catch {
    return { error: 'No se pudo cancelar' };
  }
}

// Activa/desactiva el aviso automático a las alumnas (solo propietaria).
// Cambia el modo de autonomía del motor (manual/asistido/autonomo/vacaciones).
// El servidor aplica el gate de plan (autónomo/vacaciones = Estudio+).
export async function setModoAutonomia(modo: string): Promise<{ ok: true } | { error: string }> {
  try {
    const res = await fetch('/api/sustituciones', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ action: 'config_modo', modo }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return { ok: true };
  } catch {
    return { error: 'No se pudo cambiar el modo' };
  }
}

export async function setAvisarAlumnas(avisar: boolean): Promise<{ ok: true } | { error: string }> {
  try {
    const res = await fetch('/api/sustituciones', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ action: 'config_avisar', avisar }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return { ok: true };
  } catch {
    return { error: 'No se pudo cambiar el ajuste' };
  }
}

// Toggle de "pedir confirmación a socias de riesgo de plantón" (migración 0059).
export async function obtenerConfirmacionRiesgo(): Promise<{ activo: boolean } | { error: string }> {
  try {
    const res = await fetch('/api/decisiones/confirmacion-riesgo', { headers: await authHeader() });
    const data = (await res.json().catch(() => ({}))) as { activo?: boolean; error?: string };
    if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return { activo: !!data.activo };
  } catch {
    return { error: 'No se pudo cargar el ajuste' };
  }
}

export async function actualizarConfirmacionRiesgo(activo: boolean): Promise<{ ok: true } | { error: string }> {
  try {
    const res = await fetch('/api/decisiones/confirmacion-riesgo', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ activo }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return { ok: true };
  } catch {
    return { error: 'No se pudo cambiar el ajuste' };
  }
}

// Confirma a una candidata (aceptación atómica + reasigna la clase).
export async function confirmarSustituta(sustitucionId: string, instructorId: string): Promise<{ ok: true } | { error: string }> {
  try {
    const res = await fetch('/api/sustituciones', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ sustitucionId, action: 'confirmar', instructorId }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return { ok: true };
  } catch {
    return { error: 'No se pudo confirmar' };
  }
}

// Avisa a una candidata por email (deep link ACEPTO/No puedo). El sistema
// contacta; ella confirma desde su móvil.
export async function avisarSustituta(
  sustitucionId: string, instructorId: string,
): Promise<{ ok: true; candidata: string; emailEnviado: boolean; emailSkipped: boolean } | { error: string }> {
  try {
    const res = await fetch('/api/sustituciones', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ sustitucionId, action: 'contactar', instructorId }),
    });
    const data = (await res.json().catch(() => ({}))) as { candidata?: string; emailEnviado?: boolean; emailSkipped?: boolean; error?: string };
    if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return { ok: true, candidata: data.candidata ?? '', emailEnviado: !!data.emailEnviado, emailSkipped: !!data.emailSkipped };
  } catch {
    return { error: 'No se pudo avisar' };
  }
}

// Descarta la sustitución (resuelto fuera del sistema).
// Vuelve a calcular el ranking de una baja ya creada (p. ej. después de que el
// equipo haya rellenado su disponibilidad). El ranking se congela al crearla.
export async function recalcularCandidatas(
  sustitucionId: string,
): Promise<{ ok: true; candidatas: number; resumen: string; omitidasPorRechazo: number } | { error: string }> {
  try {
    const res = await fetch('/api/sustituciones', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ sustitucionId, action: 'recalcular' }),
    });
    const data = (await res.json().catch(() => ({}))) as
      { error?: string; candidatas?: number; resumen?: string; omitidasPorRechazo?: number };
    if (!res.ok) return { error: data.error ?? `Error HTTP ${res.status}` };
    return {
      ok: true,
      candidatas: data.candidatas ?? 0,
      resumen: data.resumen ?? '',
      omitidasPorRechazo: data.omitidasPorRechazo ?? 0,
    };
  } catch {
    return { error: 'No se pudo volver a buscar' };
  }
}

export async function descartarSustitucion(sustitucionId: string): Promise<{ ok: true } | { error: string }> {
  try {
    const res = await fetch('/api/sustituciones', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ sustitucionId, action: 'descartar' }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return { ok: true };
  } catch {
    return { error: 'No se pudo descartar' };
  }
}

// ── Stripe ────────────────────────────────────────────────────────────────────

// ⚠️ Estas dos NUNCA deben lanzar. Devolvían `res.json()` a pelo, y sus
// llamadores del portal (`pagarRecibo`, `renovar`, `domiciliar`) no envuelven en
// try/catch: con la red caída —o con un 500, que responde HTML y hace reventar
// al `res.json()`— la promesa rechazaba, el `setComprando(null)` no llegaba a
// ejecutarse y la socia se quedaba con el overlay a pantalla completa y el
// spinner girando para siempre, sin mensaje y sin salida salvo recargar.
async function postCheckout(ruta: string, params: unknown): Promise<{ url: string } | { error: string }> {
  let res: Response;
  try {
    res = await fetch(ruta, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  } catch {
    return { error: 'No hemos podido conectar. Comprueba tu conexión e inténtalo de nuevo.' };
  }
  // El cuerpo se lee con catch aparte: un 500 de Next devuelve HTML, y sin esto
  // el fallo del servidor se le contaba a la socia como un problema de SU red.
  const data = await res.json().catch(() => null) as { url?: string; error?: string } | null;
  if (!res.ok) return { error: mensajeSeguro(data?.error, mensajeHttp(res.status)) };
  if (!data?.url) return { error: mensajeSeguro(data?.error, 'No se ha podido iniciar el pago.') };
  return { url: data.url };
}

/**
 * Contratar un PLAN (bono o suscripción) desde el portal: abre el Checkout
 * alojado de Stripe. El importe lo deriva SIEMPRE el servidor del plan real —
 * lo que se manda desde aquí no es superficie de fraude.
 *
 * Existe como función compartida porque el portal tiene ahora dos pantallas de
 * compra (la de siempre, `/compras`, y la de Bonos del kit de temas) y la
 * segunda no podía volver a escribir a mano el manejo de errores de la
 * primera: el "leer `res.ok` ANTES del cuerpo" de ahí abajo se arregló tras un
 * fallo real en el que un 500 del servidor se le contaba a la socia como un
 * problema de SU conexión.
 */
export async function crearCheckoutPlan(params: {
  studioId: string;
  planId: string;
  socioId: string | null;
  socioEmail: string | null;
  socioNombre: string;
  origen?: OrigenPago;
}): Promise<{ url: string } | { error: string }> {
  return postCheckout('/api/stripe/checkout', params);
}

export async function crearCheckoutStripe(params: {
  reciboId: string;
  socioId: string;
  studioId: string;
  concepto: string;
  importe: number;
  socioEmail: string | null;
  socioNombre: string;
  /** Desde dónde se paga: decide a qué pantalla devuelve Stripe. */
  origen?: OrigenPago;
}): Promise<{ url: string } | { error: string }> {
  return postCheckout('/api/stripe/checkout', params);
}

// Fase 1 · PR-2 — inicia el alta del mandato SEPA (domiciliación). Devuelve la
// URL del Checkout hosted en modo 'setup' donde la socia introduce su IBAN y
// acepta el mandato. Semipúblico como crearCheckoutStripe.
export async function iniciarDomiciliacionSepa(params: {
  studioId: string;
  socioId: string;
  slug: string;
}): Promise<{ url: string } | { error: string }> {
  return postCheckout('/api/stripe/setup-sepa', params);
}

// Comprobación proactiva antes de OFRECER el botón "Domiciliar": sin esto, la
// socia solo se enteraba de que SEPA no estaba activado en el estudio al
// volver del Checkout con un error. Fail-open ante cualquier problema de red
// (devuelve true) — ver app/api/stripe/sepa-disponible/route.ts.
export async function sepaDisponibleParaEstudio(studioId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/stripe/sepa-disponible?studioId=${encodeURIComponent(studioId)}`);
    const data = await res.json() as { disponible?: boolean };
    return data.disponible !== false;
  } catch {
    return true;
  }
}

// Aprobación de un toque: cobra un recibo pendiente con la tarjeta ya
// guardada de la socia, sin redirigirla a ningún sitio.
// ⚠️ `ok: true` NO significa "todo cerrado": el servidor responde 202 con
// `aviso: 'COBRADO_SIN_PERSISTIR'` cuando el dinero entró en Stripe pero no se
// pudo dejar escrito. Ese caso llegaba antes como un `{ok:true}` pelado porque
// **202 entra en `res.ok`**, así que el diseño del 202 moría aquí. La lectura
// vive en `lib/billing/resultado-cobro.ts`, con tests.
export async function aprobarCobroAutonomo(params: {
  logId: string;
  reciboId: string;
  socioId: string;
  studioId: string;
}): Promise<CobroAprobado | { error: string }> {
  const res = await fetch('/api/stripe/charge-off-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
  const aviso = leerAvisoCobro(data);
  return aviso ? { ok: true, ...aviso } : { ok: true };
}

// "Cobrar online" desde Cobros → Clienta: reintento off-session real con la
// tarjeta/SEPA ya guardado de la socia, sin generar ningún enlace ni pedirle
// nada — sustituye a crearCheckoutStripe para este botón (esa función crea un
// Checkout Session público, pensado para /reservar y el portal, no para un
// reintento desde el panel). Mismo 202/CobroAprobado que aprobarCobroAutonomo.
export async function cobrarOnlineDirecto(params: { reciboId: string; socioId: string }): Promise<CobroAprobado | { error: string; errorCode?: string }> {
  const res = await fetch('/api/cobros/cobrar-online', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  // `errorCode` se propaga: sin él, "la socia no tiene método de pago guardado"
  // llegaba a la pantalla como un texto rojo indistinguible de un fallo de red,
  // y no había forma de ofrecer la única salida real (pedirle la tarjeta).
  if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)), errorCode: data.errorCode };
  const aviso = leerAvisoCobro(data);
  return aviso ? { ok: true, ...aviso } : { ok: true };
}

/**
 * Enlace para que una socia AUTORICE una tarjeta sin pagar nada (Stripe
 * Checkout en `mode: 'setup'`). Es la salida cuando un cobro off-session
 * responde `SIN_TARJETA`: la propietaria le manda este enlace y, en cuanto la
 * socia lo completa, el webhook deja el método guardado y "Cobrar online"
 * funciona. Nunca pasa por aquí ningún dato de la tarjeta: la recoge Stripe.
 */
export async function crearEnlaceTarjeta(params: {
  studioId: string;
  socioId: string;
  slug?: string;
}): Promise<{ url: string } | { error: string }> {
  try {
    const res = await fetch('/api/stripe/setup-tarjeta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(params),
    });
    const data = await res.json() as { url?: string; error?: string };
    // `res.ok` ANTES del cuerpo, mismo criterio que postCheckout: un 500 no se
    // le cuenta a nadie como un problema de su conexión.
    if (!res.ok || !data.url) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return { url: data.url };
  } catch {
    return { error: 'No se ha podido preparar el enlace. Comprueba tu conexión.' };
  }
}

// Fase 3: aprueba un cobro de penalización pendiente (cancelación
// tardía/no-show) con la tarjeta ya guardada de la socia.
// Mismo 202 que `aprobarCobroAutonomo`: el cargo entró en Stripe y la
// penalización quedó FALLIDA por no poder persistirlo. Antes se perdía aquí y
// la fila desaparecía de la lista con un "Cobro aprobado" alegre.
export async function aprobarPenalizacion(penalizacionId: string): Promise<CobroAprobado | { error: string }> {
  const res = await fetch('/api/penalizaciones/aprobar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ penalizacionId }),
  });
  const data = await res.json();
  if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
  const aviso = leerAvisoCobro(data);
  return aviso ? { ok: true, ...aviso } : { ok: true };
}

// Devuelve el dinero de un recibo a la tarjeta de la socia.
//
// Solo PIDE el reembolso: marcar el recibo DEVUELTO, la fila en `devoluciones` y
// la oferta de quitar el bono las hace el webhook de `charge.refunded`, igual
// que si se hubiera devuelto desde Stripe. Así que después de esto la pantalla
// NO tiene el recibo ya devuelto — llega por el camino de siempre, en segundos.
export interface RectificarFacturaParams {
  facturaOriginalId: string;
  tipoFactura: 'R1' | 'R2' | 'R3' | 'R4' | 'R5';
  tipoRectificativa: 'S' | 'I';
  baseImponible: number;
  cuotaIVA: number;
  total: number;
  importeRectificacion: number;
}

// Fase A del issue #769 (rectificativas): la transmisión a Fiskaly/AEAT no
// está activada todavía — `aviso` en la respuesta lo explica, mostrarlo tal
// cual en vez de solo un "ok".
export async function rectificarFactura(params: RectificarFacturaParams): Promise<{ ok: true; aviso?: string | null } | { error: string }> {
  const res = await fetch('/api/facturas/rectificar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
  return { ok: true, aviso: data.aviso ?? null };
}

export async function reembolsarRecibo(reciboId: string): Promise<{ ok: true } | { error: string }> {
  const res = await fetch('/api/reembolsos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ reciboId }),
  });
  const data = await res.json().catch(() => ({}));
  // El 409 de política (fuera de plazo, bono empezado…) trae un mensaje escrito
  // para leerse tal cual, así que se respeta en vez de taparlo con el genérico.
  if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
  return { ok: true };
}

// Resuelve una devolución: deshace lo que entregó el cobro, o lo descarta.
//
// `huella` es lo que se le enseñó a la propietaria. El servidor recalcula y, si
// no coincide, responde 409 con los números nuevos en vez de escribir algo que
// ella no llegó a ver.
export async function resolverDevolucion(
  devolucionId: string, accion: 'REVERTIR' | 'DESCARTAR', huella?: string,
): Promise<{ ok: true; accion: string } | { error: string }> {
  const res = await fetch('/api/devoluciones/revertir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ devolucionId, accion, huella }),
  });
  const data = await res.json().catch(() => null) as { accion?: string; error?: string } | null;
  if (!res.ok) return { error: mensajeSeguro(data?.error, mensajeHttp(res.status)) };
  return { ok: true, accion: data?.accion ?? accion };
}

// Manda (o vuelve a mandar) el email de invitación a alguien que ya está en el
// equipo. Es una acción explícita a propósito: el alta ya NO envía nada sola.
export async function invitarAlEquipo(instructorId: string): Promise<{ ok: true; email: string } | { error: string }> {
  const res = await fetch('/api/equipo/invitar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ instructorId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
  return { ok: true, email: String(data.email ?? '') };
}

// ── Billing del SaaS (suscripción del estudio a Tentare) ───────────────────────

export interface EstadoBilling {
  plan: string;
  subscriptionStatus: string | null;
  activo: boolean;
  configurado: boolean;
  esPropietaria: boolean;
  bloqueado: boolean;
  // Trial: enPrueba = suscripción en periodo de prueba; pruebaTermina = ISO fin.
  enPrueba?: boolean;
  pruebaTermina?: string | null;
  // Fin del periodo facturado = fecha del próximo cobro (ISO). Fuera de la
  // prueba es lo que la dueña quiere ver: cuándo se le pasa el recibo.
  periodoTermina?: string | null;
  /** Estado de la prueba ya derivado EN SERVIDOR. La píldora del panel lo pinta
   *  tal cual: si contara los días con el reloj del navegador, un portátil con
   *  la hora desfasada enseñaría una cuenta atrás distinta a la real. */
  trial?: { fase: FaseTrial; diasRestantes: number; finaliza: string | null };
}

// Estado de la suscripción del estudio. Fail-open: si la llamada falla, devuelve
// no-bloqueado para no dejar a nadie fuera por un error de red.
export async function estadoBilling(): Promise<EstadoBilling | null> {
  return unaVez('billing-status', async () => {
    try {
      const res = await fetch('/api/billing/status', { headers: { ...(await authHeader()) } });
      if (!res.ok) return null;
      return (await res.json()) as EstadoBilling;
    } catch {
      return null;
    }
  });
}

// Abre el Checkout de Stripe para suscribir el estudio al plan elegido.
export async function iniciarSuscripcion(plan: 'BASE' | 'ESTUDIO' | 'CADENA'): Promise<{ url: string } | { error: string }> {
  try {
    const res = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return data as { url: string };
  } catch {
    return { error: 'No se pudo iniciar la suscripción' };
  }
}

// Abre el portal de facturación de Stripe (cambiar plan, cancelar, ver facturas).
export async function gestionarSuscripcion(): Promise<{ url: string } | { error: string }> {
  try {
    const res = await fetch('/api/billing/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    });
    const data = await res.json();
    if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return data as { url: string };
  } catch {
    return { error: 'No se pudo abrir el portal de facturación' };
  }
}

// ── Importación de socias (CSV) ────────────────────────────────────────────────

import type { FilaSocia, FilaMembresia, FilaClase, FilaReserva, FilaCita, FilaPlazaFija, FilaPago } from '@/lib/csv';



export interface ResultadoImport {
  // Migración Mágica: aviso si el lote no quedó registrado para deshacer.
  batchAviso?: string | null;
  total: number;
  importadas: number;
  duplicadas: number;
  errores: { fila: number; email: string; motivo: string }[];
  error?: string;
}

// Envía las filas ya validadas al servidor, que re-valida, deduplica contra la
// BD del estudio e inserta en lote. El studio_id lo pone el servidor (JWT).
export async function importarSocias(rows: FilaSocia[], batchId?: string): Promise<ResultadoImport> {
  try {
    const res = await fetch('/api/socios/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ rows, batchId }),
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        total: 0,
        importadas: data.importadas ?? 0,
        duplicadas: data.duplicadas ?? 0,
        errores: data.errores ?? [],
        error: mensajeSeguro(data.error, mensajeHttp(res.status)),
      };
    }
    return data as ResultadoImport;
  } catch {
    return { total: 0, importadas: 0, duplicadas: 0, errores: [], error: 'No se pudo conectar con el servidor' };
  }
}

// El alta manual de una socia inserta directo contra Supabase desde el
// navegador (sin ruta de servidor de por medio): esto comprueba el tope de
// socias del plan ANTES de ese insert, mismo criterio que ya aplicaba el
// importador masivo. `null` = se puede seguir; string = motivo del bloqueo.
export async function verificarLimiteSocias(): Promise<string | null> {
  try {
    const res = await fetch('/api/socios/verificar-limite', {
      method: 'POST',
      headers: await authHeader(),
    });
    if (res.ok) return null;
    const data = await res.json().catch(() => null);
    return mensajeSeguro(data?.error, mensajeHttp(res.status));
  } catch {
    // Fail-open: un fallo de red no debe impedir dar de alta a una clienta.
    return null;
  }
}

// Importa membresías/bonos (suscripciones). Empareja por email de socia y nombre
// de plan en el servidor; el studio_id sale del JWT. Misma forma de resultado.
// F2 (B2.11) rescate: importa las plazas fijas del estudio desde CSV.
export async function importarPlazasFijas(rows: FilaPlazaFija[], batchId?: string): Promise<ResultadoImport> {
  try {
    const res = await fetch('/api/plazas-fijas/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ rows, batchId }),
    });
    const data = await res.json();
    if (!res.ok) {
      return { total: 0, importadas: data.importadas ?? 0, duplicadas: data.duplicadas ?? 0, errores: data.errores ?? [], error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    }
    return data as ResultadoImport;
  } catch {
    return { total: 0, importadas: 0, duplicadas: 0, errores: [], error: 'No se pudo conectar con el servidor' };
  }
}

export async function importarMembresias(rows: FilaMembresia[], batchId?: string): Promise<ResultadoImport> {
  try {
    const res = await fetch('/api/suscripciones/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ rows, batchId }),
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        total: 0,
        importadas: data.importadas ?? 0,
        duplicadas: data.duplicadas ?? 0,
        errores: data.errores ?? [],
        error: mensajeSeguro(data.error, mensajeHttp(res.status)),
      };
    }
    return data as ResultadoImport;
  } catch {
    return { total: 0, importadas: 0, duplicadas: 0, errores: [], error: 'No se pudo conectar con el servidor' };
  }
}

// ── Migración Mágica ─────────────────────────────────────────────────────────
// Analiza archivos arbitrarios del software anterior y devuelve el plan
// revisable (sin tocar la BD). Tipos del servidor importados solo como tipos.
export async function analizarMigracion(
  archivos: { nombre: string; contenido: string }[],
): Promise<import('@/lib/migracion/analizador').PlanMigracion | { error: string }> {
  try {
    const res = await fetch('/api/migracion/analizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ archivos }),
    });
    const data = await res.json();
    if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return data;
  } catch {
    return { error: 'No se pudo conectar con el servidor' };
  }
}

// Deshace un lote de migración: borra exactamente lo que creó ese lote.
export async function deshacerMigracion(
  batchId: string,
): Promise<{ ok: true; borrados: Record<string, number> } | { error: string; borrados?: Record<string, number> }> {
  try {
    const res = await fetch('/api/migracion/deshacer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ batchId }),
    });
    const data = await res.json();
    if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)), borrados: data.borrados };
    return data;
  } catch {
    return { error: 'No se pudo conectar con el servidor' };
  }
}

// Lista los lotes de migración que aún se pueden deshacer. Es lo que permite
// que el botón de deshacer siga estando tras recargar la página: el id del lote
// se recupera del servidor en vez de vivir solo en memoria.
export async function migracionesRecientes(): Promise<
  { batches: import('@/lib/migracion/batches').BatchReciente[] } | { error: string }
> {
  try {
    const res = await fetch('/api/migracion/recientes', {
      headers: { ...(await authHeader()) },
    });
    const data = await res.json();
    if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return data;
  } catch {
    return { error: 'No se pudo conectar con el servidor' };
  }
}

// ── Facturas (Veri*Factu) ──────────────────────────────────────────────────────
// Sella y persiste una factura en el servidor: calcula la huella encadenada por
// estudio (SHA-256, node:crypto) y la guarda. Devuelve los campos sellados para
// refrescar el estado local. Si falla, la factura queda en memoria sin huella.
export interface FacturaSellada {
  verifactuHash: string | null;
  verifactuPrevHash: string | null;
  verifactuTs: string | null;
  verifactuSeq: number | null;
  qrUrl?: string;
  entorno?: 'produccion' | 'pruebas';
  // C-5: valores fiscales AUTORITATIVOS recalculados en el servidor (el cliente
  // debe reconciliar con estos, no con los que calculó de forma optimista).
  numeroCompleto?: string;
  fechaEmision?: string;
  receptorNombre?: string;
  receptorNIF?: string | null;
  baseImponible?: number;
  cuotaIVA?: number;
  total?: number;
}

export async function sellarFactura(fac: Factura): Promise<{ ok: boolean; sellada?: boolean; aviso?: string | null; factura?: FacturaSellada; error?: string }> {
  try {
    const res = await fetch('/api/facturas/sellar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        id: fac.id,
        studioId: fac.studioId,
        reciboId: fac.reciboId,
        numeroCompleto: fac.numeroCompleto,
        fechaEmision: fac.fechaEmision,
        receptorNombre: fac.receptorNombre,
        receptorNIF: fac.receptorNIF,
        baseImponible: fac.baseImponible,
        tipoIVA: fac.tipoIVA,
        cuotaIVA: fac.cuotaIVA,
        total: fac.total,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data?.error ?? 'No se ha podido sellar la factura' };
    return data;
  } catch {
    return { ok: false, error: 'No se pudo conectar con el servidor para sellar la factura' };
  }
}

// ── Stripe Terminal (datáfono físico) ──────────────────────────────────────────
export async function terminalEstadoLector(): Promise<{ ok?: boolean; emparejado?: boolean; estado?: string; test?: boolean; error?: string }> {
  try {
    const res = await fetch('/api/terminal/lector', { headers: { ...(await authHeader()) } });
    return await res.json();
  } catch { return { error: 'No se pudo consultar el datáfono' }; }
}

export async function terminalRegistrarLector(registrationCode?: string): Promise<{ ok?: boolean; readerId?: string; test?: boolean; error?: string }> {
  try {
    const res = await fetch('/api/terminal/lector', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ registrationCode }),
    });
    return await res.json();
  } catch { return { error: 'No se pudo registrar el datáfono' }; }
}

export async function terminalCobrar(params: { studioId: string; amount: number; concepto: string }): Promise<{ ok?: boolean; paymentIntentId?: string; error?: string }> {
  try {
    const res = await fetch('/api/terminal/cobrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(params),
    });
    return await res.json();
  } catch { return { error: 'No se pudo iniciar el cobro' }; }
}

// Fase 1 · PR-5 — Bizum presencial: pide una URL de Checkout Bizum para el
// importe de la venta. El POS la muestra como enlace/QR para el móvil del cliente.
export async function posBizumCheckout(params: { amount: number; concepto: string }): Promise<{ url?: string; error?: string }> {
  try {
    const res = await fetch('/api/stripe/pos-bizum', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(params),
    });
    return await res.json();
  } catch { return { error: 'No se pudo iniciar el cobro Bizum' }; }
}

export async function terminalEstadoCobro(params: { studioId: string; paymentIntentId: string }): Promise<{ ok?: boolean; status?: string; error?: string }> {
  try {
    const res = await fetch('/api/terminal/estado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(params),
    });
    return await res.json();
  } catch { return { error: 'No se pudo consultar el estado' }; }
}

// A-14 (backstop): cobros por datáfono confirmados en Stripe pero sin venta
// registrada (el POS se cerró tras el tap). El servidor los deja vía webhook.
export interface ReconciliacionPendiente {
  paymentIntentId: string;
  importe: number;
  concepto: string | null;
  creadoEn: string;
}

export async function terminalReconciliacionesPendientes(): Promise<ReconciliacionPendiente[]> {
  try {
    const res = await fetch('/api/terminal/reconciliaciones', { headers: { ...(await authHeader()) } });
    if (!res.ok) return [];
    const data = (await res.json()) as { pendientes?: ReconciliacionPendiente[] };
    return data.pendientes ?? [];
  } catch { return []; }
}

// Marca un cobro por datáfono como reconciliado (su venta ya está registrada).
export async function terminalMarcarReconciliado(params: {
  paymentIntentId: string; ventaId?: string | null; importe?: number; concepto?: string | null;
}): Promise<boolean> {
  try {
    const res = await fetch('/api/terminal/reconciliar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(params),
    });
    return res.ok;
  } catch { return false; }
}

// ── Emails ────────────────────────────────────────────────────────────────────

export async function enviarEmailRecibo(params: {
  to: string;
  toName: string;
  concepto: string;
  importe: number;
  fechaCobro: string;
  numeroFactura?: string;
}) {
  await fetch('/api/emails/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({
      tipo: 'recibo',
      to: params.to,
      toName: params.toName,
      data: {
        concepto: params.concepto,
        importe: params.importe,
        fechaCobro: params.fechaCobro,
        numeroFactura: params.numeroFactura,
      },
    }),
  });
}

export async function enviarEmailBienvenida(params: {
  to: string;
  toName: string;
  planNombre?: string;
  socioId?: string;
}) {
  await fetch('/api/emails/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({
      tipo: 'bienvenida',
      to: params.to,
      toName: params.toName,
      data: { planNombre: params.planNombre },
      socioId: params.socioId,
    }),
  });
}

// Envía un email de campaña de marketing a una destinataria. Reutiliza la
// plantilla 'automatizacion' (asunto → titulo, contenido → mensaje).
export async function enviarEmailCampana(params: {
  to: string;
  toName: string;
  asunto: string;
  contenido: string;
  socioId?: string;
}): Promise<boolean> {
  try {
    const res = await fetch('/api/emails/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        tipo: 'automatizacion',
        to: params.to,
        toName: params.toName,
        data: { titulo: params.asunto, mensaje: params.contenido },
        socioId: params.socioId,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Historial de comunicaciones (emails) enviados a una socia concreta.
// `null` en fallo (red/permiso), NO `[]` — un array vacío significa "esta
// socia no tiene comunicaciones", que es una respuesta distinta de "no se
// pudo comprobar". El caller decide qué hacer con null (normalmente: no
// pisar la lista que ya tenía en pantalla).
export async function obtenerComunicacionesSocio(socioId: string): Promise<Array<{
  id: string; tipo: string; asunto: string; estado: 'ENVIADO' | 'FALLIDO';
  error: string | null; creadoEn: string; creadoPorNombre: string | null;
}> | null> {
  try {
    const res = await fetch(`/api/socios/${socioId}/comunicaciones`, { headers: await authHeader() });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Pagos históricos importados de la plataforma anterior para una socia
// concreta (solo lectura). `null` en fallo (red/permiso), NO `[]` — mismo
// criterio que obtenerComunicacionesSocio: un array vacío significa "esta
// socia no tiene pagos históricos", que es una respuesta distinta.
export async function obtenerPagosHistoricosSocio(socioId: string): Promise<Array<{
  id: string; fecha: string; concepto: string | null; importe: number; medioPago: string | null;
}> | null> {
  try {
    const res = await fetch(`/api/socios/${socioId}/pagos-historicos`, { headers: await authHeader() });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Encola el envío real de una campaña en servidor (Inngest,
// lib/inngest/campanas.ts) — el envío ya no se orquesta destinataria a
// destinataria desde el navegador. Ver docs/marketing-integrations-arquitectura.md
// §5. NOTA: esto deja sin caller a enviarMensajeCampana/`/api/mensajes/send`
// (que sí seguían usándose para el WhatsApp de campañas) — se retiró la
// función de aquí; el endpoint queda, por si un envío individual de WhatsApp
// (paridad con el enviarEmailCampana de clientas/[id]) lo necesita.
export async function encolarEnvioCampana(campanaId: string): Promise<ResultadoEscritura> {
  try {
    const res = await fetch(`/api/marketing/campanas/${campanaId}/enviar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: body.error ?? 'No se pudo encolar el envío' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'No se pudo encolar el envío' };
  }
}

// Pide al servidor una URL de subida directa de Cloudflare Stream. Devuelve el
// uid del futuro vídeo + la URL, o un error tipado (status 503 = Stream no
// configurado, para que la UI degrade a "solo metadatos" con un aviso claro).
export async function pedirSubidaVideo(nombre: string): Promise<
  | { ok: true; uid: string; uploadURL: string }
  | { ok: false; status: number; error: string }
> {
  try {
    const res = await fetch('/api/ondemand/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ nombre }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return { ok: false, status: res.status, error: mensajeSeguro((j as { error?: string }).error, mensajeHttp(res.status)) };
    }
    const j = (await res.json()) as { uid: string; uploadURL: string };
    return { ok: true, uid: j.uid, uploadURL: j.uploadURL };
  } catch {
    return { ok: false, status: 0, error: 'Error de red al preparar la subida' };
  }
}

// Sube el fichero de vídeo directo a Cloudflare Stream (la uploadURL de un solo
// uso). El navegador no toca el token de Stream. Devuelve true si Cloudflare aceptó.
export async function subirVideoAStream(uploadURL: string, file: File): Promise<boolean> {
  try {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(uploadURL, { method: 'POST', body: form });
    return res.ok;
  } catch {
    return false;
  }
}

export async function enviarEmailReserva(params: {
  to: string;
  toName: string;
  claseNombre: string;
  fecha: string;
  hora: string;
  sala: string;
  instructor: string;
}) {
  await fetch('/api/emails/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({
      tipo: 'reserva',
      to: params.to,
      toName: params.toName,
      data: {
        claseNombre: params.claseNombre,
        fecha: params.fecha,
        hora: params.hora,
        sala: params.sala,
        instructor: params.instructor,
      },
    }),
  });
}

// Datos de clase compartidos por los emails transaccionales de calendario.
export interface DatosClaseEmailCliente {
  claseNombre: string;
  fecha: string;
  hora: string;
  sala: string;
  instructor: string;
}

// Aviso a una socia ascendida de la lista de espera (disparo desde el panel al
// cancelar el admin una reserva y promocionarse la siguiente).
export async function enviarEmailPromocion(params: DatosClaseEmailCliente & {
  to: string; toName: string; bonoConsumido?: boolean;
}) {
  await fetch('/api/emails/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({
      tipo: 'promocion',
      to: params.to,
      toName: params.toName,
      data: {
        claseNombre: params.claseNombre, fecha: params.fecha, hora: params.hora,
        sala: params.sala, instructor: params.instructor, bonoConsumido: params.bonoConsumido ?? false,
      },
    }),
  });
}

// Aviso a una socia de que su clase reservada ha sido cancelada por el estudio.
// ── Ausencias de instructoras (vacaciones / baja médica) ─────────────────────
export interface AusenciaInstructora {
  id: string; instructorId: string;
  tipo: 'VACACIONES' | 'BAJA_MEDICA' | 'OTRO';
  desde: string; hasta: string; motivo: string | null;
}

export async function listarAusencias(instructorId?: string): Promise<AusenciaInstructora[]> {
  const q = instructorId ? `?instructorId=${encodeURIComponent(instructorId)}` : '';
  const res = await fetch(`/api/equipo/ausencias${q}`, { headers: await authHeader(), cache: 'no-store' });
  if (!res.ok) return [];
  const { items } = await res.json();
  return items ?? [];
}

export async function crearAusencia(a: {
  instructorId: string; tipo: string; desde: string; hasta: string; motivo?: string;
}): Promise<{ ok: true; clasesAfectadas: number } | { error: string }> {
  const res = await fetch('/api/equipo/ausencias', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(a),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data.error ?? 'No se ha podido guardar' };
  return { ok: true, clasesAfectadas: data.clasesAfectadas ?? 0 };
}

export async function borrarAusencia(id: string): Promise<boolean> {
  const res = await fetch('/api/equipo/ausencias', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ id }),
  });
  return res.ok;
}

// Avisa (in-app/push) a las socias apuntadas de que su clase se ha cancelado.
// El email lo manda aparte el panel; esto dispara el Notification Engine.
// deleteSesion (studio-context.tsx) ESPERA esta llamada antes de borrar la
// sesión — sin timeout, una conexión colgada dejaba la clase visible
// indefinidamente mientras el resto de la UI seguía como si ya estuviera
// borrada. Mismo AbortSignal.timeout que entregarExternos() en
// lib/notifications/engine.ts.
export async function avisarClaseCancelada(sesionId: string): Promise<void> {
  try {
    await fetch('/api/clases/avisar-cancelada', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ sesionId }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch { /* best-effort: no bloquea la cancelación */ }
}

// Avisa (in-app) a la propietaria de que una instructora ha creado una clase
// nueva desde su panel (autoservicio, migración 20260731100000). Best-effort:
// no bloquea el alta si falla — es solo informativo.
export async function avisarClaseCreadaPorInstructor(sesionId: string): Promise<void> {
  try {
    await fetch('/api/clases/avisar-creada-por-instructor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ sesionId }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch { /* best-effort */ }
}

// Avisa (in-app/push) a las apuntadas de que su clase cambió de horario/sala.
// Se le pasan los datos NUEVOS ya formateados desde el cliente.
//
// Devuelve a cuántas alumnas se ha avisado, o `null` si el aviso no llegó a
// salir. El panel lo necesita para decir la verdad cuando la dueña pulsa "Sí,
// avisar": antes daba por hecho que se había avisado a las que él creía ver
// apuntadas, y podían ser cero (p. ej. si la única reserva ya estaba marcada
// como asistida, que el servidor no notifica).
export async function avisarClaseModificada(
  sesionId: string, datos: { clase: string; cuando: string; sala: string; instructora?: string },
): Promise<number | null> {
  try {
    const res = await fetch('/api/clases/avisar-modificada', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ sesionId, ...datos }),
    });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as { avisadas?: number } | null;
    return typeof j?.avisadas === 'number' ? j.avisadas : null;
  } catch { /* best-effort: no bloquea la edición */ return null; }
}

// Devuelve si el envío se confirmó de verdad (mismo patrón que
// enviarEmailCampana): el llamador (cancelarSesion) lo usa para saber
// CUÁNTAS clientas quedaron avisadas de verdad, no asumirlo siempre.
export async function enviarEmailCancelacionClase(params: DatosClaseEmailCliente & {
  to: string; toName: string;
}): Promise<boolean> {
  try {
    const res = await fetch('/api/emails/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        tipo: 'cancelacion',
        to: params.to,
        toName: params.toName,
        data: {
          claseNombre: params.claseNombre, fecha: params.fecha, hora: params.hora,
          sala: params.sala, instructor: params.instructor,
        },
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Aviso de "cambio de clase" (instructora y/o hora/sala), email + in-app, a
// las socias apuntadas. A diferencia del resto de `enviarEmail*`, las
// destinatarias NO se le pasan desde el cliente: las resuelve el servidor
// contra la BD en el momento del envío, para no depender del snapshot de
// `reservas`/`socios` que tiene el panel (ni al preguntar "¿aviso a N
// alumnas?" ni al mandar el email de un aplazamiento de hora/sala).
export async function avisarCambioClaseServidor(
  sesionId: string,
  datos: {
    clase: string; cuando: string; sala: string;
    // `instructora`: solo si CAMBIÓ (condiciona el texto in-app "· con X",
    // igual que antes). `instructorActual`: SIEMPRE el nombre de quien la da
    // ahora — el email lo enseña en "Ahora la da" aunque solo se haya movido
    // la hora o la sala, no la instructora.
    instructora: string; instructorActual: string;
    fecha: string; hora: string; instructorAnterior: string;
    cambioHora?: boolean; cambioSala?: boolean;
  },
): Promise<{ enviados: number; sinEmail: number; enApp: number } | null> {
  try {
    const res = await fetch('/api/clases/avisar-cambio-clase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({
        sesionId,
        clase: datos.clase, cuando: datos.cuando, sala: datos.sala,
        instructora: datos.instructora, instructorActual: datos.instructorActual,
        fecha: datos.fecha, hora: datos.hora, instructorAnterior: datos.instructorAnterior,
        cambioHora: datos.cambioHora, cambioSala: datos.cambioSala,
      }),
    });
    if (!res.ok) return null;
    const j = (await res.json().catch(() => null)) as
      { enviados?: number; sinEmail?: number; enApp?: number } | null;
    if (!j) return null;
    return { enviados: j.enviados ?? 0, sinEmail: j.sinEmail ?? 0, enApp: j.enApp ?? 0 };
  } catch {
    return null;
  }
}

// ── Valoraciones: resumen (media + total) por instructora ───────────────────
export type ResumenValoraciones = Record<string, { media: number; total: number }>;

export async function resumenValoraciones(): Promise<ResumenValoraciones> {
  try {
    const res = await fetch('/api/valoraciones', { headers: await authHeader() });
    if (!res.ok) return {};
    const data = (await res.json()) as { resumen?: ResumenValoraciones };
    return data.resumen ?? {};
  } catch {
    return {};
  }
}

// ── Equipo: rejilla de tarjetas del rediseño ────────────────────────────────
// El servidor ya recorta cada `MiembroCompleto` al rol de quien pregunta
// (ver app/api/equipo/tarjetas/route.ts) — este cliente no filtra nada, solo
// transporta lo que llegó.
export async function tarjetasEquipo(): Promise<import('./equipo-tarjetas.ts').MiembroCompleto[]> {
  const res = await fetch('/api/equipo/tarjetas', { headers: await authHeader() });
  if (!res.ok) return [];
  const data = (await res.json().catch(() => null)) as { items?: import('./equipo-tarjetas.ts').MiembroCompleto[] } | null;
  return data?.items ?? [];
}

// ── Valoraciones: detalle (cada valoración individual de una instructora) ────
export interface ValoracionDetalle {
  id: string;
  puntuacion: number;
  comentario: string | null;
  creado_en: string;
  inicio: string | null;
  tipo_clase_id: string | null;
  alumna: string | null;
}

export async function listarValoraciones(instructorId: string): Promise<ValoracionDetalle[]> {
  try {
    const res = await fetch(`/api/valoraciones?instructorId=${encodeURIComponent(instructorId)}`, { headers: await authHeader() });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: ValoracionDetalle[] };
    return data.items ?? [];
  } catch {
    return [];
  }
}

// Resultado de importar el horario (clases y sesiones).
export interface ResultadoImportClases {
  batchAviso?: string | null;
  creadas: number;
  omitidas: number;       // ya existían: reimportar no duplica
  tiposCreados: number;
  sinInstructor: number;  // filas cuya instructora no se encontró por nombre
  sinSala: number;
  errores: { fila: number; motivo: string }[];
  error?: string;
}

// Importa el horario. Las filas recurrentes (por día de la semana) se expanden a
// `semanas` semanas desde `desde`; el studio_id sale del JWT, nunca del body.
export async function importarClases(
  rows: FilaClase[], opciones: { semanas: number; desde: string }, batchId?: string,
): Promise<ResultadoImportClases> {
  const vacio = { creadas: 0, omitidas: 0, tiposCreados: 0, sinInstructor: 0, sinSala: 0, errores: [] };
  try {
    const res = await fetch('/api/clases/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ rows, semanas: opciones.semanas, desde: opciones.desde, batchId }),
    });
    const data = await res.json();
    if (!res.ok) return { ...vacio, ...data, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return data as ResultadoImportClases;
  } catch {
    return { ...vacio, error: 'No se pudo conectar con el servidor' };
  }
}

// Resultado de importar reservas.
export interface ResultadoImportReservas {
  batchAviso?: string | null;
  importadas: number;
  duplicadas: number;   // ya estaban: reimportar no duplica
  sinSocia: number;     // email que no existe en el estudio
  sinSesion: number;    // no se encontró la clase a esa fecha/hora
  sobreAforo: number;   // clases que quedan por encima de su aforo
  errores: { fila: number; motivo: string }[];
  error?: string;
}

// Importa reservas. Empareja socia por email y sesión por clase+fecha+hora en el
// servidor; el studio_id sale del JWT. No consume bonos (los saldos ya vienen
// importados del programa anterior).
export async function importarReservas(rows: FilaReserva[], batchId?: string): Promise<ResultadoImportReservas> {
  const vacio = { importadas: 0, duplicadas: 0, sinSocia: 0, sinSesion: 0, sobreAforo: 0, errores: [] };
  try {
    const res = await fetch('/api/reservas/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ rows, batchId }),
    });
    const data = await res.json();
    if (!res.ok) return { ...vacio, ...data, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return data as ResultadoImportReservas;
  } catch {
    return { ...vacio, error: 'No se pudo conectar con el servidor' };
  }
}

// Resultado de importar citas 1:1.
export interface ResultadoImportCitas {
  batchAviso?: string | null;
  importadas: number;
  duplicadas: number;
  sinSocia: number;
  sinInstructor: number;
  sinServicioCatalogo: number;  // el servicio no estaba en el catálogo: se dedujo el tipo
  errores: { fila: number; motivo: string }[];
  error?: string;
}

// Importa citas 1:1. Empareja socia por email y servicio por nombre; el
// studio_id sale del JWT.
export async function importarCitas(rows: FilaCita[], batchId?: string): Promise<ResultadoImportCitas> {
  const vacio = { importadas: 0, duplicadas: 0, sinSocia: 0, sinInstructor: 0, sinServicioCatalogo: 0, errores: [] };
  try {
    const res = await fetch('/api/citas/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ rows, batchId }),
    });
    const data = await res.json();
    if (!res.ok) return { ...vacio, ...data, error: data.error ?? `Error HTTP ${res.status}` };
    return data as ResultadoImportCitas;
  } catch {
    return { ...vacio, error: 'No se pudo conectar con el servidor' };
  }
}

// Resultado de importar pagos históricos.
export interface ResultadoImportPagos {
  batchAviso?: string | null;
  importadas: number;
  sinSocia: number;
  errores: { fila: number; motivo: string }[];
  error?: string;
}

// Importa pagos históricos. Empareja socia por email; el studio_id sale del
// JWT. No crea ningún recibo real (ver comentario en el route): es solo
// lectura, para que la ficha de la socia no empiece en blanco tras migrar.
export async function importarPagosHistoricos(rows: FilaPago[], batchId?: string): Promise<ResultadoImportPagos> {
  const vacio = { importadas: 0, sinSocia: 0, errores: [] };
  try {
    const res = await fetch('/api/pagos-historicos/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ rows, batchId }),
    });
    const data = await res.json();
    if (!res.ok) return { ...vacio, ...data, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return data as ResultadoImportPagos;
  } catch {
    return { ...vacio, error: 'No se pudo conectar con el servidor' };
  }
}

// ─── Plantillas de email: vista previa + envío de prueba (P2-11) ─────────────

// El borrador del formulario, sin guardar: la vista previa y el envío de
// prueba renderizan exactamente lo que hay en pantalla. `null` = vacío, se usa
// el texto por defecto.
type BorradorPlantilla = {
  tipo: string;
  asunto?: string | null;
  intro?: string | null;
  cuerpo?: string | null;
  botonTexto?: string | null;
  colorCabecera?: string | null;
  colorBoton?: string | null;
  logoUrl?: string | null;
  pie?: string | null;
  fuente?: string | null;
};

export async function previsualizarPlantilla(datos: BorradorPlantilla): Promise<{ html: string; subject: string } | { error: string }> {
  try {
    const res = await fetch('/api/plantillas-email/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(datos),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return data as { html: string; subject: string };
  } catch {
    return { error: 'No se pudo generar la vista previa' };
  }
}

export async function enviarPruebaPlantilla(datos: BorradorPlantilla): Promise<{ ok: true; enviadoA: string } | { error: string }> {
  try {
    const res = await fetch('/api/plantillas-email/prueba', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(datos),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return data as { ok: true; enviadoA: string };
  } catch {
    return { error: 'No se pudo enviar la prueba' };
  }
}

// Tarifa por hora de una instructora — tabla aparte de `instructores`
// (ver migración 20260731110000_instructor_tarifas.sql). El servidor decide
// qué filas devuelve según el rol de la sesión: PROPIETARIO/MANAGER ven todo
// el equipo, una INSTRUCTOR solo la suya.
export interface TarifaInstructor {
  instructorId: string;
  tarifaHora: number | null;
  baseMensualEur: number | null;
  recargoSustitucionPct: number | null;
}

export async function fetchTarifasEquipo(): Promise<TarifaInstructor[]> {
  try {
    const res = await fetch('/api/equipo/tarifas', { headers: await authHeader() });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: TarifaInstructor[] };
    return data.items ?? [];
  } catch {
    return [];
  }
}

export async function actualizarTarifaInstructor(
  instructorId: string, tarifaHora: number | null,
  extra?: { baseMensualEur?: number | null; recargoSustitucionPct?: number | null },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/equipo/tarifas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ instructorId, tarifaHora, ...extra }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return res.ok ? { ok: true } : { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
  } catch {
    return { ok: false, error: 'No se pudo guardar la tarifa' };
  }
}

// Liquidación de instructoras (fila 11 del informe estratégico): desglose
// transparente de base + variable por clase + sustituciones + reparto de
// penalizaciones, persistido con estado BORRADOR→CONFIRMADA→PAGADA. Sin
// pago real — ver migración 20260804150000_liquidaciones_instructoras.sql.
export interface Liquidacion {
  id: string;
  instructorId: string;
  periodoAnio: number;
  periodoMes: number;
  baseEur: number;
  nClasesPropias: number;
  variablePropiasEur: number;
  nClasesSustitucion: number;
  variableSustitucionEur: number;
  nPenalizaciones: number;
  repartoPenalizacionesEur: number;
  nClasesSinTarifa: number;
  totalEur: number;
  estado: 'BORRADOR' | 'CONFIRMADA' | 'PAGADA';
  confirmadaEn: string | null;
  pagadaEn: string | null;
  referenciaPago: string | null;
  generadaEn: string;
}

// Rendimiento de instructoras (fila 17 del informe estratégico): retención,
// conversión y red social por instructora, ventana móvil de 90 días.
// Informe de solo lectura — no mide/paga nada, solo mide.
export interface RendimientoInstructoraApi {
  instructorId: string;
  nombre: string;
  nAlumnasAtribuidas: number;
  datosInsuficientes: boolean;
  retencionPct: number | null;
  nParaRetencion: number;
  conversionPct: number | null;
  nParaConversion: number;
  redSocialPct: number | null;
}

export async function fetchRendimientoInstructoras(): Promise<RendimientoInstructoraApi[]> {
  try {
    const res = await fetch('/api/equipo/rendimiento', { headers: await authHeader() });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: RendimientoInstructoraApi[] };
    return data.items ?? [];
  } catch {
    return [];
  }
}

export async function fetchLiquidaciones(
  anio: number, mes: number, instructorId?: string,
): Promise<Liquidacion[]> {
  try {
    const qs = new URLSearchParams({ anio: String(anio), mes: String(mes) });
    if (instructorId) qs.set('instructorId', instructorId);
    const res = await fetch(`/api/equipo/liquidaciones?${qs.toString()}`, { headers: await authHeader() });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: Liquidacion[] };
    return data.items ?? [];
  } catch {
    return [];
  }
}

export async function generarLiquidacion(
  instructorId: string, anio: number, mes: number,
): Promise<{ ok: boolean; item?: Liquidacion; error?: string }> {
  try {
    const res = await fetch('/api/equipo/liquidaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ instructorId, anio, mes }),
    });
    const data = (await res.json().catch(() => ({}))) as { item?: Liquidacion; error?: string };
    return res.ok ? { ok: true, item: data.item } : { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
  } catch {
    return { ok: false, error: 'No se pudo generar la liquidación' };
  }
}

export async function transicionarLiquidacion(
  id: string, accion: 'confirmar' | 'marcar_pagada', referenciaPago?: string,
): Promise<{ ok: boolean; item?: Liquidacion; error?: string }> {
  try {
    const res = await fetch('/api/equipo/liquidaciones', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ id, accion, referenciaPago }),
    });
    const data = (await res.json().catch(() => ({}))) as { item?: Liquidacion; error?: string };
    return res.ok ? { ok: true, item: data.item } : { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
  } catch {
    return { ok: false, error: 'No se pudo actualizar la liquidación' };
  }
}

// El pase de acceso de la clienta (QR + código corto). Devuelve null si algo
// falla: la hoja del pase enseña su propio aviso y no rompe el inicio.
export async function pedirPaseDeAcceso(slug: string) {
  try {
    const res = await fetch('/api/public/pase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
      body: JSON.stringify({ slug }),
    });
    if (!res.ok) return null;
    return await res.json() as { hayPase: boolean; vigente?: boolean; yaAsistida?: boolean; minutosParaActivarse?: number; seActivaA?: string | null; inicio?: string; token?: string | null; codigo?: string | null };
  } catch {
    return null;
  }
}

// ── Tentare Network: perfil profesional (Fase 2) ─────────────────────────────
// Identidad por auth_user_id, no por studio_id — mismo JWT de staff
// (authHeader) que el resto del panel, validado en el servidor por
// verificarUsuarioSupabase en vez de verificarSesionStaff (no exige
// pertenecer a ningún estudio).
export async function fetchMiPerfilNetwork(): Promise<PerfilNetwork | null> {
  try {
    const res = await fetch('/api/network/perfil', { headers: await authHeader() });
    if (!res.ok) return null;
    const data = (await res.json()) as { perfil: PerfilNetwork | null };
    return data.perfil ?? null;
  } catch {
    return null;
  }
}

// Mismo endpoint que fetchMiPerfilNetwork, pero sin descartar el dato
// derivado que solo necesita /network/inicio — se mantiene aparte para no
// tocar la forma que ya esperan el resto de callers de fetchMiPerfilNetwork.
export async function fetchResumenInicioNetwork(): Promise<{ perfil: PerfilNetwork | null; estudiosQueTeGuardaron: number }> {
  try {
    const res = await fetch('/api/network/perfil', { headers: await authHeader() });
    if (!res.ok) return { perfil: null, estudiosQueTeGuardaron: 0 };
    const data = (await res.json()) as { perfil: PerfilNetwork | null; estudiosQueTeGuardaron?: number };
    return { perfil: data.perfil ?? null, estudiosQueTeGuardaron: data.estudiosQueTeGuardaron ?? 0 };
  } catch {
    return { perfil: null, estudiosQueTeGuardaron: 0 };
  }
}

export async function guardarPerfilNetwork(
  cambios: CambiosPerfilNetwork,
): Promise<{ ok: true; perfil: PerfilNetwork } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/network/perfil', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(cambios),
    });
    const data = (await res.json().catch(() => ({}))) as { perfil?: PerfilNetwork; error?: string };
    if (!res.ok || !data.perfil) return { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return { ok: true, perfil: data.perfil };
  } catch {
    return { ok: false, error: 'No se pudo guardar tu perfil' };
  }
}

// Fase 3: enviar a revisión/ocultar. Endpoint aparte de guardarPerfilNetwork
// porque lleva su propia validación mínima (nombre + ciudad + especialidad)
// — ver app/api/network/perfil/estado/route.ts. Nunca acepta 'published' ni
// 'suspended': el primero pasó a ser exclusivo de moderación (feedback del
// fundador — evitar spam, revisión manual antes de aparecer en la network),
// el segundo ya lo era.
export async function cambiarEstadoPerfilNetwork(
  estado: 'draft' | 'en_revision' | 'hidden',
): Promise<{ ok: true; perfil: PerfilNetwork } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/network/perfil/estado', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ estado }),
    });
    const data = (await res.json().catch(() => ({}))) as { perfil?: PerfilNetwork; error?: string };
    if (!res.ok || !data.perfil) return { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return { ok: true, perfil: data.perfil };
  } catch {
    return { ok: false, error: 'No se pudo cambiar el estado de tu perfil' };
  }
}

// Fase 4: buscador. `especialidades`/`disponibilidad`/`horarios`/`tipoTrabajo`
// viajan como lista separada por comas — la API los valida contra el
// catálogo y descarta cualquier valor que no reconozca.
export async function buscarPerfilesNetwork(filtro: FiltroBusquedaNetwork): Promise<PerfilNetworkPublico[]> {
  try {
    const qs = new URLSearchParams();
    if (filtro.ciudad) qs.set('ciudad', filtro.ciudad);
    if (filtro.especialidades.length) qs.set('especialidades', filtro.especialidades.join(','));
    if (filtro.disponibilidad.length) qs.set('disponibilidad', filtro.disponibilidad.join(','));
    if (filtro.horarios.length) qs.set('horarios', filtro.horarios.join(','));
    if (filtro.tipoTrabajo.length) qs.set('tipoTrabajo', filtro.tipoTrabajo.join(','));
    if (filtro.experienciaMinima != null) qs.set('experienciaMinima', String(filtro.experienciaMinima));

    const res = await fetch(`/api/network/buscar?${qs.toString()}`, { headers: await authHeader() });
    if (!res.ok) return [];
    const data = (await res.json()) as { perfiles?: PerfilNetworkPublico[] };
    return data.perfiles ?? [];
  } catch {
    return [];
  }
}

export async function fetchPerfilNetworkPublico(
  id: string,
): Promise<{ perfil: PerfilNetworkPublico; experiencias: ExperienciaNetworkPublica[]; badges: BadgesNetwork } | null> {
  try {
    const res = await fetch(`/api/network/perfil/${encodeURIComponent(id)}`, { headers: await authHeader() });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      perfil?: PerfilNetworkPublico; experiencias?: ExperienciaNetworkPublica[]; badges?: BadgesNetwork;
    };
    if (!data.perfil || !data.badges) return null;
    return { perfil: data.perfil, experiencias: data.experiencias ?? [], badges: data.badges };
  } catch {
    return null;
  }
}

// Fase 6: experiencia laboral propia (gestión desde /network/mi-perfil).
export async function fetchMisExperienciasNetwork(): Promise<ExperienciaNetwork[]> {
  try {
    const res = await fetch('/api/network/experiencia', { headers: await authHeader() });
    if (!res.ok) return [];
    const data = (await res.json()) as { experiencias?: ExperienciaNetwork[] };
    return data.experiencias ?? [];
  } catch {
    return [];
  }
}

export async function crearExperienciaNetwork(
  nueva: NuevaExperienciaNetwork,
): Promise<{ ok: true; experiencia: ExperienciaNetwork } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/network/experiencia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(nueva),
    });
    const data = (await res.json().catch(() => ({}))) as { experiencia?: ExperienciaNetwork; error?: string };
    if (!res.ok || !data.experiencia) return { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return { ok: true, experiencia: data.experiencia };
  } catch {
    return { ok: false, error: 'No se pudo guardar la experiencia' };
  }
}

export async function eliminarExperienciaNetwork(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/network/experiencia', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ id }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return res.ok ? { ok: true } : { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
  } catch {
    return { ok: false, error: 'No se pudo eliminar la experiencia' };
  }
}

// Fase 2 (wizard): datos privados de identidad (paso 02).
export async function fetchPerfilIdentidadNetwork(): Promise<PerfilIdentidadNetwork | null> {
  try {
    const res = await fetch('/api/network/perfil/identidad', { headers: await authHeader() });
    if (!res.ok) return null;
    const data = (await res.json()) as { identidad: PerfilIdentidadNetwork | null };
    return data.identidad ?? null;
  } catch {
    return null;
  }
}

export async function guardarPerfilIdentidadNetwork(
  cambios: CambiosPerfilIdentidadNetwork,
): Promise<{ ok: true; identidad: PerfilIdentidadNetwork } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/network/perfil/identidad', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(cambios),
    });
    const data = (await res.json().catch(() => ({}))) as { identidad?: PerfilIdentidadNetwork; error?: string };
    if (!res.ok || !data.identidad) return { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return { ok: true, identidad: data.identidad };
  } catch {
    return { ok: false, error: 'No se pudieron guardar tus datos' };
  }
}

export async function fetchVerificacionIdentidadNetwork(): Promise<VerificacionIdentidadNetwork | null> {
  try {
    const res = await fetch('/api/network/perfil/verificacion-identidad', { headers: await authHeader() });
    if (!res.ok) return null;
    const data = (await res.json()) as { verificacion: VerificacionIdentidadNetwork | null };
    return data.verificacion ?? null;
  } catch {
    return null;
  }
}

export async function enviarVerificacionIdentidadNetwork(
  documentoPath: string,
  documentoPathReverso: string | null = null,
): Promise<{ ok: true; verificacion: VerificacionIdentidadNetwork } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/network/perfil/verificacion-identidad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ documentoPath, documentoPathReverso }),
    });
    const data = (await res.json().catch(() => ({}))) as { verificacion?: VerificacionIdentidadNetwork; error?: string };
    if (!res.ok || !data.verificacion) return { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return { ok: true, verificacion: data.verificacion };
  } catch {
    return { ok: false, error: 'No se pudo enviar tu documento' };
  }
}

// Fase 2 (wizard): certificaciones/formación (paso 06).
export async function fetchCertificacionesNetwork(): Promise<CertificacionNetwork[]> {
  try {
    const res = await fetch('/api/network/certificaciones', { headers: await authHeader() });
    if (!res.ok) return [];
    const data = (await res.json()) as { certificaciones?: CertificacionNetwork[] };
    return data.certificaciones ?? [];
  } catch {
    return [];
  }
}

export async function crearCertificacionNetwork(
  nueva: NuevaCertificacionNetwork,
): Promise<{ ok: true; certificacion: CertificacionNetwork } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/network/certificaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(nueva),
    });
    const data = (await res.json().catch(() => ({}))) as { certificacion?: CertificacionNetwork; error?: string };
    if (!res.ok || !data.certificacion) return { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return { ok: true, certificacion: data.certificacion };
  } catch {
    return { ok: false, error: 'No se pudo guardar la certificación' };
  }
}

export async function eliminarCertificacionNetwork(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/network/certificaciones', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ id }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return res.ok ? { ok: true } : { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
  } catch {
    return { ok: false, error: 'No se pudo eliminar la certificación' };
  }
}

// Fase 7: verificación por estudios.
export interface EstudioBusqueda { id: string; nombre: string; ciudad: string | null }

export async function buscarEstudiosNetwork(q: string): Promise<EstudioBusqueda[]> {
  try {
    const res = await fetch(`/api/network/estudios/buscar?q=${encodeURIComponent(q)}`, { headers: await authHeader() });
    if (!res.ok) return [];
    const data = (await res.json()) as { estudios?: EstudioBusqueda[] };
    return data.estudios ?? [];
  } catch {
    return [];
  }
}

export async function solicitarVerificacionExperiencia(
  experienciaId: string, studioId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/network/experiencia/verificar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ experienciaId, studioId }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return res.ok ? { ok: true } : { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
  } catch {
    return { ok: false, error: 'No se pudo enviar la solicitud de verificación' };
  }
}

export interface VerificacionPendienteNetwork {
  id: string;
  solicitadoEn: string;
  experienciaId: string;
  nombreEstudio: string;
  fechaInicio: string;
  fechaFin: string | null;
  especialidades: string[];
  descripcion: string | null;
  profesionalNombre: string;
  profesionalFotoUrl: string | null;
}

export async function fetchVerificacionesPendientesNetwork(): Promise<VerificacionPendienteNetwork[]> {
  try {
    const res = await fetch('/api/network/verificaciones', { headers: await authHeader() });
    if (!res.ok) return [];
    const data = (await res.json()) as { verificaciones?: VerificacionPendienteNetwork[] };
    return data.verificaciones ?? [];
  } catch {
    return [];
  }
}

export async function resolverVerificacionNetwork(
  id: string, aprobar: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/network/verificaciones/resolver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ id, aprobar }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return res.ok ? { ok: true } : { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
  } catch {
    return { ok: false, error: 'No se pudo resolver la solicitud' };
  }
}

// Fase 9: contacto.
export async function contactarPerfilNetwork(
  perfilId: string, mensaje: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/network/contacto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ perfilId, mensaje: mensaje || null }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return res.ok ? { ok: true } : { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
  } catch {
    return { ok: false, error: 'No se pudo enviar la solicitud de contacto' };
  }
}

export interface SolicitudContactoRecibida {
  id: string;
  studioId: string;
  estudioNombre: string;
  estudioCiudad: string | null;
  mensaje: string | null;
  estado: 'pendiente' | 'aceptada' | 'rechazada';
  creadoEn: string;
  resueltoEn: string | null;
}

export async function fetchSolicitudesContactoNetwork(): Promise<SolicitudContactoRecibida[]> {
  try {
    const res = await fetch('/api/network/contacto', { headers: await authHeader() });
    if (!res.ok) return [];
    const data = (await res.json()) as { solicitudes?: SolicitudContactoRecibida[] };
    return data.solicitudes ?? [];
  } catch {
    return [];
  }
}

// Favoritos (brief §19: "Network → Buscar instructoras / Mis favoritas /
// Solicitudes"). POST es un toggle — el servidor decide añadir o quitar
// según si ya existe, la respuesta dice cuál de las dos pasó.
export async function fetchFavoritosNetwork(): Promise<PerfilNetworkPublico[]> {
  try {
    const res = await fetch('/api/network/favoritos', { headers: await authHeader() });
    if (!res.ok) return [];
    const data = (await res.json()) as { perfiles?: PerfilNetworkPublico[] };
    return data.perfiles ?? [];
  } catch {
    return [];
  }
}

export async function toggleFavoritoNetwork(
  perfilId: string,
): Promise<{ ok: true; favorito: boolean } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/network/favoritos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ perfilId }),
    });
    const data = (await res.json().catch(() => ({}))) as { favorito?: boolean; error?: string };
    if (!res.ok || data.favorito === undefined) return { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return { ok: true, favorito: data.favorito };
  } catch {
    return { ok: false, error: 'No se pudo actualizar favoritas' };
  }
}

// Fase 10: reportar un perfil.
export async function reportarPerfilNetwork(
  perfilId: string, motivo: string, detalle: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/network/reportes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ perfilId, motivo, detalle }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return res.ok ? { ok: true } : { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
  } catch {
    return { ok: false, error: 'No se pudo enviar el reporte' };
  }
}

export async function resolverSolicitudContactoNetwork(
  id: string, aceptar: boolean,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/network/contacto/resolver', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ id, aceptar }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return res.ok ? { ok: true } : { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
  } catch {
    return { ok: false, error: 'No se pudo resolver la solicitud' };
  }
}

// Reseñas — brief §25. Solo desde el panel del estudio (staff), tras una
// solicitud de contacto aceptada.
export async function elegibilidadResenaNetwork(
  perfilId: string,
): Promise<{ elegible: boolean; yaResenado: boolean; faltaClaseCompletada: boolean }> {
  try {
    const res = await fetch(`/api/network/resenas?perfilId=${encodeURIComponent(perfilId)}`, { headers: await authHeader() });
    if (!res.ok) return { elegible: false, yaResenado: false, faltaClaseCompletada: false };
    return (await res.json()) as { elegible: boolean; yaResenado: boolean; faltaClaseCompletada: boolean };
  } catch {
    return { elegible: false, yaResenado: false, faltaClaseCompletada: false };
  }
}

export async function enviarResenaNetwork(
  perfilId: string, puntuacion: number, comentario: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/network/resenas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ perfilId, puntuacion, comentario }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return res.ok ? { ok: true } : { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
  } catch {
    return { ok: false, error: 'No se pudo enviar la reseña' };
  }
}

// Mensajería interna — brief §9. Un hilo por solicitud de contacto ya
// aceptada; funciona igual para staff de estudio y para la instructora
// (dos vías de auth distintas, la ruta resuelve cuál aplica).
export async function fetchMensajesNetwork(solicitudId: string): Promise<MensajeNetwork[]> {
  try {
    const res = await fetch(`/api/network/mensajes?solicitudId=${encodeURIComponent(solicitudId)}`, { headers: await authHeader() });
    if (!res.ok) return [];
    const data = (await res.json()) as { mensajes?: MensajeNetwork[] };
    return data.mensajes ?? [];
  } catch {
    return [];
  }
}

export async function enviarMensajeNetwork(
  solicitudId: string, cuerpo: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/network/mensajes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ solicitudId, cuerpo }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return res.ok ? { ok: true } : { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
  } catch {
    return { ok: false, error: 'No se pudo enviar el mensaje' };
  }
}

export interface HiloNetwork {
  solicitudId: string;
  perfilId: string | null;
  nombre: string;
  fotoUrl: string | null;
  ultimoMensaje: string | null;
  ultimoMensajeEn: string | null;
  noLeidos: number;
}

export async function fetchHilosMensajesNetwork(): Promise<HiloNetwork[]> {
  try {
    const res = await fetch('/api/network/mensajes/hilos', { headers: await authHeader() });
    if (!res.ok) return [];
    const data = (await res.json()) as { hilos?: HiloNetwork[] };
    return data.hilos ?? [];
  } catch {
    return [];
  }
}

// Formalizar contratación (siguiente fase) — doble confirmación sobre un
// hilo ya aceptado. `miLado` viene del servidor (nunca se decide en el
// cliente) para que la UI sepa qué marca es "la mía" sin duplicar la
// resolución de participante que ya hace la API.
export async function fetchFormalizacionNetwork(
  solicitudId: string,
): Promise<{ formalizacion: FormalizacionNetwork | null; miLado: 'estudio' | 'instructora' } | null> {
  try {
    const res = await fetch(`/api/network/formalizacion?solicitudId=${encodeURIComponent(solicitudId)}`, { headers: await authHeader() });
    if (!res.ok) return null;
    return (await res.json()) as { formalizacion: FormalizacionNetwork | null; miLado: 'estudio' | 'instructora' };
  } catch {
    return null;
  }
}

export async function proponerOConfirmarFormalizacionNetwork(
  solicitudId: string, tipoContrato?: 'temporal' | 'indefinido',
): Promise<{ ok: true; formalizacion: FormalizacionNetwork; miLado: 'estudio' | 'instructora' } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/network/formalizacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ solicitudId, tipoContrato }),
    });
    const data = (await res.json().catch(() => ({}))) as { formalizacion?: FormalizacionNetwork; miLado?: 'estudio' | 'instructora'; error?: string };
    if (!res.ok || !data.formalizacion || !data.miLado) return { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return { ok: true, formalizacion: data.formalizacion, miLado: data.miLado };
  } catch {
    return { ok: false, error: 'No se pudo enviar la propuesta' };
  }
}

// ── Vacantes + candidaturas (Fase 2, marketplace bidireccional) ─────────────

export async function fetchMisVacantesNetwork(): Promise<VacanteNetwork[]> {
  try {
    const res = await fetch('/api/network/vacantes', { headers: await authHeader() });
    if (!res.ok) return [];
    const data = (await res.json()) as { vacantes?: VacanteNetwork[] };
    return data.vacantes ?? [];
  } catch {
    return [];
  }
}

export async function crearVacanteNetwork(
  nueva: NuevaVacanteNetwork,
): Promise<{ ok: true; vacante: VacanteNetwork } | { ok: false; error: string }> {
  try {
    const res = await fetch('/api/network/vacantes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(nueva),
    });
    const data = (await res.json().catch(() => ({}))) as { vacante?: VacanteNetwork; error?: string };
    if (!res.ok || !data.vacante) return { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return { ok: true, vacante: data.vacante };
  } catch {
    return { ok: false, error: 'No se pudo crear la vacante' };
  }
}

export async function editarVacanteNetwork(
  id: string, cambios: CambiosVacanteNetwork,
): Promise<{ ok: true; vacante: VacanteNetwork } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/network/vacantes/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify(cambios),
    });
    const data = (await res.json().catch(() => ({}))) as { vacante?: VacanteNetwork; error?: string };
    if (!res.ok || !data.vacante) return { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return { ok: true, vacante: data.vacante };
  } catch {
    return { ok: false, error: 'No se pudo guardar la vacante' };
  }
}

export async function cambiarEstadoVacanteNetwork(
  id: string, estado: 'published' | 'closed',
): Promise<{ ok: true; vacante: VacanteNetwork } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/network/vacantes/${encodeURIComponent(id)}/estado`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ estado }),
    });
    const data = (await res.json().catch(() => ({}))) as { vacante?: VacanteNetwork; error?: string };
    if (!res.ok || !data.vacante) return { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return { ok: true, vacante: data.vacante };
  } catch {
    return { ok: false, error: 'No se pudo cambiar el estado de la vacante' };
  }
}

export async function fetchVacantesPublicadasNetwork(
  filtro: { especialidad?: string; tipoTrabajo?: string; ciudad?: string } = {},
): Promise<VacanteNetwork[]> {
  try {
    const params = new URLSearchParams();
    if (filtro.especialidad) params.set('especialidad', filtro.especialidad);
    if (filtro.tipoTrabajo) params.set('tipoTrabajo', filtro.tipoTrabajo);
    if (filtro.ciudad) params.set('ciudad', filtro.ciudad);
    const res = await fetch(`/api/network/vacantes/publicadas?${params.toString()}`, { headers: await authHeader() });
    if (!res.ok) return [];
    const data = (await res.json()) as { vacantes?: VacanteNetwork[] };
    return data.vacantes ?? [];
  } catch {
    return [];
  }
}

export async function fetchVacanteNetwork(id: string): Promise<VacanteNetwork | null> {
  try {
    const res = await fetch(`/api/network/vacantes/${encodeURIComponent(id)}`, { headers: await authHeader() });
    if (!res.ok) return null;
    const data = (await res.json()) as { vacante?: VacanteNetwork | null };
    return data.vacante ?? null;
  } catch {
    return null;
  }
}

// Solo esta lista (candidaturas de UNA vacante, lado estudio) trae `encaje`
// — el resto de usos de CandidaturaNetwork (mis-candidaturas, lado
// instructora) no tiene una vacante fija contra la que calcularlo.
export type CandidaturaConEncaje = CandidaturaNetwork & { encaje: EncajeCandidatura | null };

export async function fetchCandidaturasVacanteNetwork(vacanteId: string): Promise<CandidaturaConEncaje[]> {
  try {
    const res = await fetch(`/api/network/vacantes/${encodeURIComponent(vacanteId)}/candidaturas`, { headers: await authHeader() });
    if (!res.ok) return [];
    const data = (await res.json()) as { candidaturas?: CandidaturaConEncaje[] };
    return data.candidaturas ?? [];
  } catch {
    return [];
  }
}

export async function aplicarVacanteNetwork(
  vacanteId: string, mensaje: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/network/candidaturas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ vacanteId, mensaje }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return res.ok ? { ok: true } : { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
  } catch {
    return { ok: false, error: 'No se pudo enviar tu candidatura' };
  }
}

export async function cambiarEstadoCandidaturaNetwork(
  id: string, estado: 'contactada' | 'entrevista' | 'propuesta' | 'aceptada' | 'rechazada', notasEstudio?: string,
): Promise<{ ok: true; solicitudId: string | null } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/network/candidaturas/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ estado, notasEstudio }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; solicitudId?: string | null; error?: string };
    if (!res.ok || !data.ok) return { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
    return { ok: true, solicitudId: data.solicitudId ?? null };
  } catch {
    return { ok: false, error: 'No se pudo cambiar el estado de la candidatura' };
  }
}

export async function retirarCandidaturaNetwork(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/network/candidaturas/${encodeURIComponent(id)}/retirar`, {
      method: 'POST',
      headers: await authHeader(),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return res.ok ? { ok: true } : { ok: false, error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
  } catch {
    return { ok: false, error: 'No se pudo retirar la candidatura' };
  }
}

export async function fetchMisCandidaturasNetwork(): Promise<CandidaturaNetwork[]> {
  try {
    const res = await fetch('/api/network/mis-candidaturas', { headers: await authHeader() });
    if (!res.ok) return [];
    const data = (await res.json()) as { candidaturas?: CandidaturaNetwork[] };
    return data.candidaturas ?? [];
  } catch {
    return [];
  }
}

/** Una clase pasada de la socia. Espejo de `ClaseAsistida`. */
export interface ClaseAsistidaCliente {
  reservaId: string;
  sesionId: string;
  inicio: string;
  nombre: string;
  instructora: string;
  /** Cómo acabó. Ver `ClaseAsistida.estado`. */
  estado: 'ASISTIDA' | 'CANCELADA' | 'NO_SHOW';
}

/**
 * El historial de clases asistidas de la socia en sesión.
 *
 * Va aparte del catálogo público a propósito y se pide EN DIFERIDO, solo
 * cuando se abre la lista de la agenda: el catálogo acota las sesiones a
 * `fin >= ahora` para no arrastrar meses de historia en cada carga, y
 * ensancharlo habría penalizado a todos los portales.
 *
 * `portalAuthHeader()` manda el JWT de la socia; el servidor deriva de ahí su
 * identidad y no se fía de ningún id del body. Sin sesión devuelve 401, y aquí
 * eso es una lista vacía, no un error en pantalla: la sección simplemente no
 * se pinta.
 */
/**
 * Quita la tarjeta guardada de la socia en sesión.
 *
 * Devuelve `null` si el servidor lo confirmó, o el mensaje de error si no.
 * ⚠️ Nada de escritura optimista: quitar un método de pago se anuncia con lo
 * que responde el servidor, no antes — es el mismo criterio que el resto de los
 * flujos de dinero de este repo.
 */
/**
 * Al entrar (por Google o por el enlace del correo): enlaza la ficha de la
 * socia, o la crea si no la tiene.
 *
 * ⚠️ Va contra un endpoint PROPIO y no contra `/api/public/session`: esa se
 * llama en cada carga del portal, así que meter el alta ahí daría de alta a
 * cualquiera con una sesión de Supabase por el mero hecho de VISITAR el portal
 * de un estudio.
 */
export async function altaAlEntrar(slug: string, via: 'google' | 'enlace'): Promise<{ error?: string; creada?: boolean }> {
  try {
    const res = await fetch('/api/public/alta-al-entrar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
      body: JSON.stringify({ slug, via }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; creada?: boolean };
    if (res.ok) return { creada: data.creada };
    return { error: data.error ?? 'No se ha podido completar el acceso.' };
  } catch {
    return { error: 'No hemos podido conectar. Inténtalo de nuevo.' };
  }
}

export async function borrarTarjetaPublica(studioId: string): Promise<string | null> {
  try {
    const res = await fetch('/api/public/tarjeta', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
      body: JSON.stringify({ studioId }),
    });
    if (res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return data.error ?? 'No se ha podido quitar la tarjeta.';
  } catch {
    return 'No hemos podido conectar. Inténtalo de nuevo.';
  }
}

/**
 * Abre la página de Stripe para guardar una tarjeta. Devuelve la URL, o el
 * mensaje de error.
 *
 * ⚠️ La UI de tarjeta la aloja STRIPE: aquí no se pide nunca un número ni un
 * CVC en nuestro propio DOM. Ver el comentario de `/api/stripe/setup-tarjeta`.
 */
export async function urlParaGuardarTarjeta(
  studioId: string, socioId: string, slug: string,
): Promise<{ url: string } | { error: string }> {
  try {
    const res = await fetch('/api/stripe/setup-tarjeta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
      body: JSON.stringify({ studioId, socioId, slug }),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (res.ok && data.url) return { url: data.url };
    return { error: data.error ?? 'No se ha podido abrir la página para guardar la tarjeta.' };
  } catch {
    return { error: 'No hemos podido conectar. Inténtalo de nuevo.' };
  }
}

export async function fetchHistorialAsistidas(
  studioId: string, limite?: number,
): Promise<ClaseAsistidaCliente[]> {
  try {
    const res = await fetch('/api/public/historial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
      body: JSON.stringify({ studioId, limite }),
    });
    if (!res.ok) return [];
    const data = (await res.json().catch(() => ({}))) as { clases?: ClaseAsistidaCliente[] };
    return data.clases ?? [];
  } catch {
    return [];
  }
}
