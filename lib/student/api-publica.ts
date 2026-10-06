'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Lo que la app de la alumna necesita de la API, sin el resto del cliente del
// panel (lib/api-client.ts, ~3.800 líneas que reexportan esto). Separado para
// que la app no lo descargue entero en cada pantalla por una cabecera.
// ─────────────────────────────────────────────────────────────────────────────

import { supabasePortal } from '@/lib/db/supabase-portal';

// Cabecera Authorization con el JWT de la SOCIA (portal, magic link). La validan
// verificarUsuarioSupabase + socioAutenticado en los endpoints públicos que ya
// exigen sesión real. Devuelve {} si no hay sesión de socia.
export async function portalAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabasePortal.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

// ── Datos públicos (proxy scopeado) ─────────────────────────────────────────
// Carga el catálogo del estudio + (si hay socia en sesión) sus datos, vía el
// endpoint de servidor con service-role. Sustituye el acceso anónimo directo.
//
// `liviano` (audit de rendimiento de los widgets embebibles): /reservar/[slug]
// nunca lee vídeos/recompensas/niveles/logros/retos/contenido de portal — solo
// el portal instalable (app/portal/[slug]) los usa. Sin esta señal el servidor
// no puede distinguir quién llama al mismo endpoint compartido.
//
// `estiloWidget` (Fase E del constructor de widgets): la nativa pide además el
// estilo de los widgets de su web, en la MISMA petición y solo en su primera
// carga (lib/widget/usar-datos-widget.ts). Solo viaja si se pide: el resto de
// llamadores no lo necesita y el servidor no lee el tema por ellos.
export async function cargarDatosPublicos(slug: string, opts?: { liviano?: boolean; baseUrl?: string; estiloWidget?: boolean }) {
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
    body: JSON.stringify({ slug, liviano: opts?.liviano ?? false, ...(opts?.estiloWidget ? { estiloWidget: true } : {}) }),
  });
  // 404 es la única respuesta que significa de verdad «no hay datos»: ese
  // estudio no existe. Las demás (500, 429, 503…) son fallos, y devolver null
  // las convertía en listas vacías: la pantalla decía «no tienes reservas» o
  // «hoy no hay clases» cuando lo cierto era que el servidor no había
  // contestado, y el estado de error con reintento no se alcanzaba nunca.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`studio-data respondió ${res.status}`);
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
export async function prepararRenovacionPlan(studioId: string): Promise<{ reciboId: string } | { error: string; codigo?: string }> {
  try {
    const res = await fetch('/api/public/renovar-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
      body: JSON.stringify({ studioId }),
    });
    const data = await res.json().catch(() => null) as { reciboId?: string; error?: string; codigo?: string } | null;
    // `codigo`: el motivo por CÓDIGO cuando el servidor lo da (p. ej. `cuota-en-pausa`, 409), para traducirlo sin
    // comparar frases.
    if (!res.ok || !data?.reciboId) return { error: data?.error ?? 'No se ha podido preparar la renovación.', ...(data?.codigo ? { codigo: data.codigo } : {}) };
    return { reciboId: data.reciboId };
  } catch {
    return { error: 'No se ha podido preparar la renovación.' };
  }
}

/**
 * Quita la tarjeta guardada de la socia en sesión.
 *
 * Devuelve `null` si el servidor lo confirmó, o el mensaje de error si no.
 * ⚠️ Nada de escritura optimista: quitar un método de pago se anuncia con lo
 * que responde el servidor, no antes — es el mismo criterio que el resto de los
 * flujos de dinero de este repo.
 */
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
