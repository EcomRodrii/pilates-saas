'use client';

import { supabase } from '@/lib/db/supabase';
import { supabasePortal } from '@/lib/db/supabase-portal';
import type { Factura } from '@/lib/types';
import type { ThemeConfig, ThemeDraft } from '@/lib/theme-schema';
import type { LayoutConfig, LayoutDraft } from '@/lib/layout-schema';
import { mensajeSeguro, mensajeHttp } from '@/lib/errores';
import type { ContactoFila } from '@/lib/sustituciones/traza';
import type { DiagnosticoEquipo } from '@/lib/sustituciones/preparacion';

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
export async function fetchThemeBorrador(): Promise<ThemeConfig> {
  const res = await fetch('/api/theme?draft=1', { headers: await authHeader() });
  if (!res.ok) throw new Error('No se pudo cargar el tema');
  return res.json();
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
  const res = await fetch('/api/layout', { headers: await authHeader() });
  if (!res.ok) throw new Error('No se pudo cargar el menú');
  return res.json();
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

// ── Datos públicos (proxy scopeado) ─────────────────────────────────────────
// Carga el catálogo del estudio + (si hay socia en sesión) sus datos, vía el
// endpoint de servidor con service-role. Sustituye el acceso anónimo directo.
export async function cargarDatosPublicos(slug: string) {
  // La identidad de la socia va en el JWT (Bearer), no en el body: el servidor
  // deriva sus datos del token. Sin sesión → solo catálogo público.
  const res = await fetch('/api/public/studio-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
    body: JSON.stringify({ slug }),
  });
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

export interface SustitucionCandidata {
  instructor_id: string;
  nombre: string;
  score: number;
  compatibilidad: number; // 0-100, para la barra de la card
  veces: number;          // clases impartidas de este tipo
  motivos: string[];
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

export async function crearCheckoutStripe(params: {
  reciboId: string;
  socioId: string;
  studioId: string;
  concepto: string;
  importe: number;
  socioEmail: string | null;
  socioNombre: string;
}): Promise<{ url: string } | { error: string }> {
  const res = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json() as Promise<{ url: string } | { error: string }>;
}

// Fase 1 · PR-2 — inicia el alta del mandato SEPA (domiciliación). Devuelve la
// URL del Checkout hosted en modo 'setup' donde la socia introduce su IBAN y
// acepta el mandato. Semipúblico como crearCheckoutStripe.
export async function iniciarDomiciliacionSepa(params: {
  studioId: string;
  socioId: string;
  slug: string;
}): Promise<{ url: string } | { error: string }> {
  const res = await fetch('/api/stripe/setup-sepa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json() as Promise<{ url: string } | { error: string }>;
}

// Aprobación de un toque: cobra un recibo pendiente con la tarjeta ya
// guardada de la socia, sin redirigirla a ningún sitio.
export async function aprobarCobroAutonomo(params: {
  logId: string;
  reciboId: string;
  socioId: string;
  studioId: string;
}): Promise<{ ok: true } | { error: string }> {
  const res = await fetch('/api/stripe/charge-off-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) return { error: mensajeSeguro(data.error, mensajeHttp(res.status)) };
  return { ok: true };
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
}

// Estado de la suscripción del estudio. Fail-open: si la llamada falla, devuelve
// no-bloqueado para no dejar a nadie fuera por un error de red.
export async function estadoBilling(): Promise<EstadoBilling | null> {
  try {
    const res = await fetch('/api/billing/status', { headers: { ...(await authHeader()) } });
    if (!res.ok) return null;
    return (await res.json()) as EstadoBilling;
  } catch {
    return null;
  }
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

import type { FilaSocia, FilaMembresia, FilaClase, FilaReserva, FilaCita, FilaPlazaFija } from '@/lib/csv';

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

export async function sellarFactura(fac: Factura): Promise<{ ok: boolean; sellada?: boolean; aviso?: string | null; factura?: FacturaSellada }> {
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
    if (!res.ok) return { ok: false };
    return await res.json();
  } catch {
    return { ok: false };
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
}) {
  await fetch('/api/emails/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({
      tipo: 'bienvenida',
      to: params.to,
      toName: params.toName,
      data: { planNombre: params.planNombre },
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
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Envía un mensaje de campaña por WhatsApp/SMS (Twilio) a una destinataria.
// Mismo shape que enviarEmailCampana pero con `canal` y a /api/mensajes/send.
export async function enviarMensajeCampana(params: {
  canal: 'WHATSAPP' | 'SMS';
  to: string;
  asunto: string;
  contenido: string;
}): Promise<boolean> {
  try {
    const res = await fetch('/api/mensajes/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ canal: params.canal, to: params.to, asunto: params.asunto, contenido: params.contenido }),
    });
    return res.ok;
  } catch {
    return false;
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
export async function avisarClaseCancelada(sesionId: string): Promise<void> {
  try {
    await fetch('/api/clases/avisar-cancelada', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ sesionId }),
    });
  } catch { /* best-effort: no bloquea la cancelación */ }
}

// Avisa (in-app/push) a las apuntadas de que su clase cambió de horario/sala.
// Se le pasan los datos NUEVOS ya formateados desde el cliente.
export async function avisarClaseModificada(
  sesionId: string, datos: { clase: string; cuando: string; sala: string },
): Promise<void> {
  try {
    await fetch('/api/clases/avisar-modificada', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ sesionId, ...datos }),
    });
  } catch { /* best-effort: no bloquea la edición */ }
}

export async function enviarEmailCancelacionClase(params: DatosClaseEmailCliente & {
  to: string; toName: string;
}) {
  await fetch('/api/emails/send', {
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

// ── Equipo: stats combinadas (valoración + asistencia) por instructora ──────
export type EquipoStats = {
  valoracion: Record<string, { media: number; total: number }>;
  asistencia: Record<string, { pct: number; base: number }>;
};

export async function equipoStats(): Promise<EquipoStats> {
  try {
    const res = await fetch('/api/equipo/stats', { headers: await authHeader() });
    if (!res.ok) return { valoracion: {}, asistencia: {} };
    const data = (await res.json()) as Partial<EquipoStats>;
    return { valoracion: data.valoracion ?? {}, asistencia: data.asistencia ?? {} };
  } catch {
    return { valoracion: {}, asistencia: {} };
  }
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
