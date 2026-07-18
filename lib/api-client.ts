'use client';

import { supabase } from '@/lib/db/supabase';
import { supabasePortal } from '@/lib/db/supabase-portal';
import type { Factura } from '@/lib/types';
import type { ThemeConfig, ThemeDraft } from '@/lib/theme-schema';
import type { LayoutConfig, LayoutDraft } from '@/lib/layout-schema';

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
    throw new Error(b.error ?? 'Error al guardar el borrador');
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
    throw new Error(b.error ?? 'Error al guardar el menú');
  }
  return res.json();
}

// ── Integraciones de plataforma (WhatsApp/PayPal/Zoom/Kisi) ──────────────────
// El secreto vive en ENV del servidor; el cliente consulta aquí qué está
// configurado y puede lanzar una prueba de conexión real.
export type IntegracionesEstado = Record<'WHATSAPP' | 'PAYPAL' | 'ZOOM' | 'KISI', boolean>;

export async function fetchIntegracionesEstado(): Promise<IntegracionesEstado | null> {
  try {
    const res = await fetch('/api/integrations/estado', { headers: await authHeader() });
    if (!res.ok) return null;
    return (await res.json()) as IntegracionesEstado;
  } catch {
    return null;
  }
}

export async function probarIntegracion(provider: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch('/api/integrations/estado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ provider }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    return { ok: res.ok && !!data.ok, error: data.error };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
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
): Promise<{ url: string } | { error: string }> {
  try {
    const res = await fetch('/api/sustituciones/disponibilidad-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ instructorId }),
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !data.url) return { error: data.error ?? `Error HTTP ${res.status}` };
    return { url: data.url };
  } catch {
    return { error: 'No se pudo generar el enlace' };
  }
}

export interface SustitucionCandidata {
  instructor_id: string;
  nombre: string;
  score: number;
  motivos: string[];
}
export interface SustitucionPanel {
  id: string;
  estado: string;
  motivo: string | null;
  creado_en: string;
  resuelto_en: string | null;
  instructor_original_id: string | null;
  sustituta_final_id: string | null;
  ranking: SustitucionCandidata[];
  sesion_id: string;
  sesiones: { inicio: string; fin: string; tipo_clase_id: string | null; cancelada: boolean } | null;
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
    if (!res.ok) return { error: data.error ?? `Error HTTP ${res.status}` };
    return { ok: true };
  } catch {
    return { error: 'No se pudo crear la baja' };
  }
}

export async function listarSustituciones(): Promise<SustitucionPanel[]> {
  try {
    const res = await fetch('/api/sustituciones', { headers: await authHeader() });
    if (!res.ok) return [];
    const data = (await res.json()) as { sustituciones?: SustitucionPanel[] };
    return data.sustituciones ?? [];
  } catch {
    return [];
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
    if (!res.ok) return { error: data.error ?? `Error HTTP ${res.status}` };
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
    if (!res.ok) return { error: data.error ?? `Error HTTP ${res.status}` };
    return { ok: true, candidata: data.candidata ?? '', emailEnviado: !!data.emailEnviado, emailSkipped: !!data.emailSkipped };
  } catch {
    return { error: 'No se pudo avisar' };
  }
}

// Descarta la sustitución (resuelto fuera del sistema).
export async function descartarSustitucion(sustitucionId: string): Promise<{ ok: true } | { error: string }> {
  try {
    const res = await fetch('/api/sustituciones', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ sustitucionId, action: 'descartar' }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { error: data.error ?? `Error HTTP ${res.status}` };
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
  if (!res.ok) return { error: data.error ?? `Error HTTP ${res.status}` };
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
    if (!res.ok) return { error: data.error ?? `Error HTTP ${res.status}` };
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
    if (!res.ok) return { error: data.error ?? `Error HTTP ${res.status}` };
    return data as { url: string };
  } catch {
    return { error: 'No se pudo abrir el portal de facturación' };
  }
}

// ── Importación de socias (CSV) ────────────────────────────────────────────────

import type { FilaSocia } from '@/lib/csv';

export interface ResultadoImport {
  total: number;
  importadas: number;
  duplicadas: number;
  errores: { fila: number; email: string; motivo: string }[];
  error?: string;
}

// Envía las filas ya validadas al servidor, que re-valida, deduplica contra la
// BD del estudio e inserta en lote. El studio_id lo pone el servidor (JWT).
export async function importarSocias(rows: FilaSocia[]): Promise<ResultadoImport> {
  try {
    const res = await fetch('/api/socios/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
      body: JSON.stringify({ rows }),
    });
    const data = await res.json();
    if (!res.ok) {
      return {
        total: 0,
        importadas: data.importadas ?? 0,
        duplicadas: data.duplicadas ?? 0,
        errores: data.errores ?? [],
        error: data.error ?? `Error HTTP ${res.status}`,
      };
    }
    return data as ResultadoImport;
  } catch {
    return { total: 0, importadas: 0, duplicadas: 0, errores: [], error: 'No se pudo conectar con el servidor' };
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
      return { ok: false, status: res.status, error: (j as { error?: string }).error ?? `Error ${res.status}` };
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
