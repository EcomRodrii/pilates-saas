// Fase 2 de la propuesta "Growth Widget" (auditoría del widget de reservas):
// eventos anónimos del funnel del widget público. Sin esto no existía ninguna
// forma de saber si un cambio del widget convierte mejor o peor — confirmado
// por auditoría que no había NADA (ni GA/PostHog/Sentry-para-eventos/tabla
// propia) antes de este módulo.
export const TIPOS_EVENTO_WIDGET = [
  'widget_loaded', 'widget_viewed', 'class_list_viewed', 'class_selected',
  'class_detail_viewed', 'recommendation_started', 'recommendation_completed',
  'booking_started', 'checkout_started', 'booking_completed',
  'lead_started', 'lead_completed', 'booking_abandoned',
] as const;

export type TipoEventoWidget = typeof TIPOS_EVENTO_WIDGET[number];

export function esTipoEventoValido(tipo: string): tipo is TipoEventoWidget {
  return (TIPOS_EVENTO_WIDGET as readonly string[]).includes(tipo);
}

// Import perezoso: solo los eventos con `socioId` (identificados) necesitan
// el cliente de auth del portal — el resto (el 90% del funnel, anónimo) no
// paga ese coste. Mismo patrón que el import perezoso de
// lib/db/supabase-data-admin.ts para el email de abandono.
async function tokenDePortal(): Promise<string | null> {
  try {
    const { supabasePortal } = await import('@/lib/db/supabase-portal');
    const { data: { session } } = await supabasePortal.auth.getSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
}

const CLAVE_SESSION_ID = 'tentare_widget_session';

/**
 * Un id por pestaña/visita — sessionStorage, se pierde al cerrarla. Nunca se
 * cruza con `socios`: es anónimo por diseño, no un identificador de persona.
 */
export function sessionIdWidget(): string {
  if (typeof window === 'undefined') return '';
  try {
    let id = window.sessionStorage.getItem(CLAVE_SESSION_ID);
    if (!id) {
      id = crypto.randomUUID();
      window.sessionStorage.setItem(CLAVE_SESSION_ID, id);
    }
    return id;
  } catch {
    // Safari en modo privado (o cookies/storage bloqueados) puede lanzar al
    // tocar sessionStorage — un id nuevo cada vez no rompe nada, solo hace
    // que esa visitante cuente como varias "sesiones" en el funnel.
    return crypto.randomUUID();
  }
}

/**
 * Dispara un evento del funnel. Fire-and-forget a propósito: la analítica
 * NUNCA debe bloquear ni poder tumbar el flujo real de reserva/pago.
 * `keepalive` deja que la petición termine aunque la visitante navegue justo
 * después de disparar el evento (p. ej. al ir a Stripe Checkout).
 */
export function trackEventoWidget(
  studioId: string | null | undefined,
  tipo: TipoEventoWidget,
  // `socioId` (Fase 8, CRO): solo tiene sentido en los eventos donde la
  // visitante YA está identificada (booking_started/checkout_started/
  // booking_completed/booking_abandoned) — nunca en los anónimos. Habilita
  // la recuperación de un abandono conocido sin ampliar el diseño anónimo
  // de esta tabla más de lo justo. Ver docs/cro-analytics-widget-diseno.md §5.2.
  extra?: { sesionClaseId?: string | null; origen?: string | null; baseUrl?: string; socioId?: string | null },
): void {
  if (typeof window === 'undefined' || !studioId) return;
  try {
    // `baseUrl` (por defecto '', ruta relativa de siempre): el bundle
    // embebible (Modo B) llama desde el DOM de la web del estudio, donde una
    // ruta relativa resolvería contra SU origen — necesita el de Tentare.
    // Con `baseUrl` (cross-origin) el studioId va TAMBIÉN en la URL: el
    // preflight CORS no puede leer el body JSON.
    const url = extra?.baseUrl
      ? `${extra.baseUrl}/api/public/evento?studioId=${encodeURIComponent(studioId)}`
      : '/api/public/evento';
    const socioId = extra?.socioId ?? null;
    const enviar = async () => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      // C-4 (auditoría 29-ago): solo se busca token cuando el evento va
      // identificado — así el servidor puede comprobar que `socioId` es de
      // verdad quien llama antes de disparar el email de abandono. El resto
      // de eventos (anónimos) nunca pasan por aquí.
      if (socioId) {
        const token = await tokenDePortal();
        if (token) headers.Authorization = `Bearer ${token}`;
      }
      await fetch(url, {
        method: 'POST',
        headers,
        keepalive: true,
        body: JSON.stringify({
          studioId,
          tipo,
          sessionId: sessionIdWidget(),
          sesionClaseId: extra?.sesionClaseId ?? null,
          origen: extra?.origen ?? null,
          socioId,
        }),
      });
    };
    void enviar().catch(() => {});
  } catch {
    // Nunca debe romper el render de la página que lo dispara.
  }
}
